'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {buildDailyAdvicePrompt, DISCLAIMER} = require('../ai/prompt-builder');
const {createAiService} = require('../services/ai-service');
const {createDailyService} = require('../services/daily-service');
const {createAiResultStorage} = require('../storage/ai-result-storage');
const {createAiSettingsStorage} = require('../storage/ai-settings-storage');
const {createDailyStorage} = require('../storage/daily-storage');

const DATE = '2026-09-12';

function validOutput(overrides = {}) {
    return JSON.stringify({
        summary: '稳步推进，先完成最重要的工作。',
        priority: ['完成核心任务', '处理重要沟通', '预留复盘时间'],
        timingAdvice: '上午集中处理核心任务，下午安排沟通。',
        riskNotes: ['避免同时展开过多任务', '重要决定保留复核时间'],
        planSuggestion: '把今日计划拆成三个可检查的结果。',
        disclaimer: DISCLAIMER,
        ...overrides
    });
}

async function fixture(t, provider) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'qimen-ai-service-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const dailyStorage = createDailyStorage(path.join(root, 'data'));
    const dailyService = createDailyService(dailyStorage);
    const aiSettingsStorage = createAiSettingsStorage(root);
    const aiResultStorage = createAiResultStorage(path.join(root, 'ai'));
    const aiService = createAiService({
        dailyService,
        aiSettingsStorage,
        aiResultStorage,
        provider: provider || {name: 'test-compatible', generate: async () => validOutput()},
        now: () => new Date('2026-09-12T10:00:00.000Z')
    });
    return {root, dailyStorage, dailyService, aiSettingsStorage, aiResultStorage, aiService};
}

async function configureReady(storage) {
    await storage.save({
        enabled: true,
        baseUrl: 'https://example.invalid/v1',
        model: 'test-model',
        apiKey: 'secret-test-key'
    });
}

async function savePlan(dailyStorage, plan, important = '重要事项') {
    await dailyStorage.saveRecord(DATE, {
        date: DATE,
        timezone: 'Asia/Shanghai',
        panTime: `${DATE}T09:00:00`,
        plan,
        important,
        result: '',
        review: '',
        createdAt: '2026-09-12T00:00:00.000Z',
        updatedAt: '2026-09-12T00:00:00.000Z'
    });
}

test('A. AI 未启用时拒绝生成', async (t) => {
    const {aiService} = await fixture(t);
    await assert.rejects(
        aiService.generateDailyAdvice({dateKey: DATE}),
        (error) => error.code === 'AI_DISABLED' && /尚未启用/.test(error.message)
    );
});

test('B. AI 启用但未配置 API Key 时给出明确提示', async (t) => {
    const {aiSettingsStorage, aiService} = await fixture(t);
    await aiSettingsStorage.save({enabled: true, baseUrl: 'https://example.invalid/v1', model: 'test-model'});
    await assert.rejects(
        aiService.generateDailyAdvice({dateKey: DATE}),
        (error) => error.code === 'AI_API_KEY_MISSING' && /API Key/.test(error.message)
    );
});

test('C/I. 成功生成合法建议并保存完整元数据', async (t) => {
    let request;
    const provider = {
        name: 'openai-compatible',
        generate: async (value) => {
            request = value;
            return validOutput();
        }
    };
    const {dailyStorage, aiSettingsStorage, aiResultStorage, aiService} = await fixture(t, provider);
    await configureReady(aiSettingsStorage);
    await savePlan(dailyStorage, '完成 V2 核心功能');

    const result = await aiService.generateDailyAdvice({dateKey: DATE});
    const stored = await aiResultStorage.get(DATE);

    assert.equal(result.output.priority.length, 3);
    assert.equal(result.promptVersion, 'daily-advice-v1');
    assert.match(result.inputHash, /^[a-f0-9]{64}$/);
    assert.equal(stored.generatedAt, '2026-09-12T10:00:00.000Z');
    assert.equal(stored.provider, 'openai-compatible');
    assert.equal(stored.model, 'test-model');
    assert.equal(request.apiKey, 'secret-test-key');
    assert.match(request.messages[0].content, /不是在重新排奇门盘/);
    assert.match(request.messages[1].content, /完成 V2 核心功能/);
});

test('G. 非 JSON 模型内容被拒绝且不保存', async (t) => {
    const provider = {name: 'test', generate: async () => '这不是 JSON'};
    const {aiSettingsStorage, aiResultStorage, aiService} = await fixture(t, provider);
    await configureReady(aiSettingsStorage);
    await assert.rejects(
        aiService.generateDailyAdvice({dateKey: DATE}),
        (error) => error.code === 'AI_RESPONSE_INVALID_JSON'
    );
    assert.equal(await aiResultStorage.get(DATE), null);
});

test('H. 缺字段或免责声明错误的 JSON 被拒绝', async (t) => {
    const provider = {name: 'test', generate: async () => JSON.stringify({summary: '不完整'})};
    const {aiSettingsStorage, aiService} = await fixture(t, provider);
    await configureReady(aiSettingsStorage);
    await assert.rejects(
        aiService.generateDailyAdvice({dateKey: DATE}),
        (error) => error.code === 'AI_RESPONSE_FIELDS_MISSING'
    );
});

test('J. 同一天再次生成覆盖旧结果', async (t) => {
    let call = 0;
    const provider = {
        name: 'test',
        generate: async () => validOutput({summary: ++call === 1 ? '第一次' : '第二次'})
    };
    const {aiSettingsStorage, aiResultStorage, aiService} = await fixture(t, provider);
    await configureReady(aiSettingsStorage);
    await aiService.generateDailyAdvice({dateKey: DATE});
    await aiService.generateDailyAdvice({dateKey: DATE});

    const all = await aiResultStorage.readAll();
    assert.deepEqual(Object.keys(all), [DATE]);
    assert.equal(all[DATE].output.summary, '第二次');
});

test('K. 计划或重要事项变化后旧建议被标记过期', async (t) => {
    const {dailyStorage, dailyService, aiSettingsStorage, aiService} = await fixture(t);
    await configureReady(aiSettingsStorage);
    await savePlan(dailyStorage, '旧计划');
    await aiService.generateDailyAdvice({dateKey: DATE});
    const originalPage = await dailyService.getTodayPageData({dateKey: DATE});
    assert.equal((await aiService.getAdviceForPage(originalPage)).stale, false);

    await savePlan(dailyStorage, '修改后的计划');
    const changedPage = await dailyService.getTodayPageData({dateKey: DATE});
    assert.equal((await aiService.getAdviceForPage(changedPage)).stale, true);
});

test('L. AI 设置公开结果和保存响应都不包含 API Key', async (t) => {
    const {aiSettingsStorage} = await fixture(t);
    const saved = await aiSettingsStorage.save({apiKey: 'never-return-this'});
    const publicSettings = await aiSettingsStorage.readPublic();

    assert.equal(saved.apiKeyConfigured, true);
    assert.equal(publicSettings.apiKeyConfigured, true);
    assert.equal('apiKey' in saved, false);
    assert.equal('apiKey' in publicSettings, false);
    assert.doesNotMatch(JSON.stringify(saved), /never-return-this/);
});

test('Prompt hash 只随盘面、规则分析、计划和重要事项稳定变化', async (t) => {
    const {dailyStorage, dailyService} = await fixture(t);
    await savePlan(dailyStorage, '同一计划');
    const page = await dailyService.getTodayPageData({dateKey: DATE});
    const first = buildDailyAdvicePrompt(page);
    const second = buildDailyAdvicePrompt(JSON.parse(JSON.stringify(page)));
    assert.equal(first.inputHash, second.inputHash);
    page.record.result = '结果字段不参与 AI 输入';
    assert.equal(buildDailyAdvicePrompt(page).inputHash, first.inputHash);
    page.panTime = '2026-09-12T23:59:59';
    assert.equal(buildDailyAdvicePrompt(page).inputHash, first.inputHash);
    page.record.important = '重要事项变化';
    assert.notEqual(buildDailyAdvicePrompt(page).inputHash, first.inputHash);
});
