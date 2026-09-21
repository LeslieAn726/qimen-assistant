'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const app = require('../app');
const {DISCLAIMER} = require('../ai/prompt-builder');

const validAdvice = JSON.stringify({
    summary: '稳中求进，先完成最重要的工作。',
    priority: ['完成核心任务', '处理关键沟通', '留出复盘时间'],
    timingAdvice: '先处理高专注任务，再安排沟通。',
    riskNotes: ['避免频繁切换任务', '重要决定保留复核'],
    planSuggestion: '把今日计划拆成一个主任务和两个辅助任务。',
    disclaimer: DISCLAIMER
});

function request(server, pathname, options = {}) {
    return new Promise((resolve, reject) => {
        const body = options.body === undefined ? null : JSON.stringify(options.body);
        const req = http.request({
            host: '127.0.0.1',
            port: server.address().port,
            path: pathname,
            method: options.method || 'GET',
            headers: body ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            } : undefined
        }, (res) => {
            let responseBody = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => (responseBody += chunk));
            res.on('end', () => resolve({
                statusCode: res.statusCode,
                body: responseBody,
                json: () => JSON.parse(responseBody)
            }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function fixture(t, provider = {name: 'test-compatible', generate: async () => validAdvice}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'qimen-v20-ai-routes-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    app.configureDailyStorage(path.join(root, 'data'), 'desktop-userData', {
        settingsDir: root,
        backupsDir: path.join(root, 'backups'),
        aiSettingsDir: root,
        aiResultsDir: path.join(root, 'ai'),
        aiProvider: provider
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return {root, server};
}

test('A/B. AI API 对未启用和缺少 API Key 返回明确中文错误', async (t) => {
    const {server} = await fixture(t);
    let response = await request(server, '/api/ai/daily-advice', {method: 'POST', body: {date: '2026-09-12'}});
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, 'AI_DISABLED');

    await request(server, '/api/ai/settings', {
        method: 'POST',
        body: {enabled: true, baseUrl: 'https://example.test/v1', model: 'test-model'}
    });
    response = await request(server, '/api/ai/daily-advice', {method: 'POST', body: {date: '2026-09-12'}});
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, 'AI_API_KEY_MISSING');
});

test('C/I. AI API 仅接收日期，由服务端组装输入并持久化结果', async (t) => {
    let providerRequest;
    const provider = {
        name: 'test-compatible',
        generate: async (requestOptions) => {
            providerRequest = requestOptions;
            return validAdvice;
        }
    };
    const {root, server} = await fixture(t, provider);
    await request(server, '/api/daily-records/2026-09-12', {
        method: 'POST',
        body: {plan: '完成发布', important: '确认测试', result: '', review: ''}
    });
    await request(server, '/api/ai/settings', {
        method: 'POST',
        body: {
            enabled: true,
            baseUrl: 'https://example.test/v1',
            model: 'test-model',
            apiKey: 'secret-for-route-test'
        }
    });

    const response = await request(server, '/api/ai/daily-advice', {
        method: 'POST',
        body: {date: '2026-09-12', prompt: '浏览器伪造的 prompt 应被忽略'}
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().output.summary, '稳中求进，先完成最重要的工作。');
    assert.match(providerRequest.messages[1].content, /完成发布/);
    assert.doesNotMatch(providerRequest.messages[1].content, /浏览器伪造/);

    const saved = JSON.parse(await fs.readFile(path.join(root, 'ai', 'daily-ai.json'), 'utf8'));
    assert.equal(saved['2026-09-12'].model, 'test-model');
});

test('L. AI 设置 GET/POST 响应与今日页面均不泄露 API Key', async (t) => {
    const {server} = await fixture(t);
    const secret = 'never-return-this-secret';
    const saved = await request(server, '/api/ai/settings', {
        method: 'POST',
        body: {
            enabled: true,
            baseUrl: 'https://example.test/v1',
            model: 'test-model',
            apiKey: secret
        }
    });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().apiKeyConfigured, true);
    assert.doesNotMatch(saved.body, new RegExp(secret));

    const read = await request(server, '/api/ai/settings');
    assert.equal(read.statusCode, 200);
    assert.equal(read.json().apiKeyConfigured, true);
    assert.doesNotMatch(read.body, new RegExp(secret));

    const today = await request(server, '/today?date=2026-09-12');
    assert.equal(today.statusCode, 200);
    assert.doesNotMatch(today.body, new RegExp(secret));
});

test('K/M. /today 显示已保存 AI 建议并在输入变化后标记过期', async (t) => {
    const {server} = await fixture(t);
    const date = '2026-09-12';
    await request(server, `/api/daily-records/${date}`, {
        method: 'POST',
        body: {plan: '旧计划', important: '旧事项', result: '', review: ''}
    });
    await request(server, '/api/ai/settings', {
        method: 'POST',
        body: {
            enabled: true,
            baseUrl: 'https://example.test/v1',
            model: 'test-model',
            apiKey: 'test-key'
        }
    });
    await request(server, '/api/ai/daily-advice', {method: 'POST', body: {date}});

    let today = await request(server, `/today?date=${date}`);
    assert.equal(today.statusCode, 200);
    assert.match(today.body, /AI 今日助手/);
    assert.match(today.body, /稳中求进，先完成最重要的工作/);
    assert.match(today.body, /传统术数内容仅作文化和娱乐参考/);
    assert.match(today.body, /class="[^"]*hidden[^"]*" id="aiStaleWarning"/);

    await request(server, `/api/daily-records/${date}`, {
        method: 'POST',
        body: {plan: '新计划', important: '旧事项', result: '', review: ''}
    });
    today = await request(server, `/today?date=${date}`);
    assert.equal(today.statusCode, 200);
    assert.match(today.body, /当前建议基于旧的计划内容，建议重新生成/);
    assert.doesNotMatch(today.body, /class="[^"]*hidden[^"]*" id="aiStaleWarning"/);

    const settings = await request(server, '/settings');
    assert.equal(settings.statusCode, 200);
    assert.match(settings.body, /OpenAI-compatible Base URL/);
    assert.match(settings.body, /API Key 已配置/);
});
