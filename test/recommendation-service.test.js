'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');

const {
    classifyText,
    hasBusinessSources,
    identifyTasks,
    recommend
} = require('../services/recommendation-service');

function input(overrides = {}) {
    return {
        date: '2026-09-13',
        shichen: {key: 'si', name: '巳时', start: '09:00', end: '11:00'},
        qimen: {analysis: {suggestions: ['当前适合学习，可以稳步推进。']}, geju: [], jiuGongAnalysis: {}},
        almanac: {yi: ['学习'], ji: [], goodGods: [], badGods: [], twelveDayOfficer: '成', dayType: {}},
        dailyRecord: {plan: '阅读论文', important: '', result: '', review: ''},
        ...overrides
    };
}

test('A. 今日计划、奇门既有分析和黄历宜一致时为 high confidence', () => {
    const result = recommend(input());
    assert.equal(result.confidence, 'high');
    assert.deepEqual(result.matchedPlans, ['阅读论文']);
    assert.match(result.summary, /先推进/);
    assert.deepEqual(Object.keys(result), [
        'title', 'summary', 'recommended', 'avoid', 'matchedPlans', 'focusTask', 'sources', 'confidence'
    ]);
    assert.deepEqual(result.sources.map((source) => source.type), ['plan', 'qimen', 'almanac', 'shichen']);
});

test('B. 计划与黄历忌冲突时生成温和而非绝对禁止的提醒', () => {
    const result = recommend(input({
        qimen: null,
        almanac: {yi: [], ji: ['出行']},
        dailyRecord: {plan: '外出办事', important: ''}
    }));
    assert.equal(result.confidence, 'medium');
    assert.match(result.summary, /如果.*不是必须.*可以考虑/);
    assert.match(result.summary, /若必须推进，提前做好准备/);
    assert.doesNotMatch(result.summary, /绝对不能/);
});

test('C. 没有计划时仍可根据已有规则信息生成建议', () => {
    const result = recommend(input({dailyRecord: {plan: '', important: ''}}));
    assert.equal(result.matchedPlans.length, 0);
    assert.ok(result.recommended.length > 0);
    assert.equal(hasBusinessSources(result), true);
});

test('D. 奇门缺失时可由计划、黄历和时辰正常降级', () => {
    const result = recommend(input({qimen: null}));
    assert.ok(result.summary);
    assert.equal(result.sources.some((source) => source.type === 'qimen'), false);
    assert.equal(result.sources.some((source) => source.type === 'almanac'), true);
});

test('E. 黄历缺失时可由计划、奇门和时辰正常降级', () => {
    const result = recommend(input({almanac: null}));
    assert.ok(result.summary);
    assert.equal(result.sources.some((source) => source.type === 'almanac'), false);
    assert.equal(result.sources.some((source) => source.type === 'qimen'), true);
});

test('F. 全部业务数据缺失时标记为仅有时辰语境，可回退普通对话', () => {
    const result = recommend(input({qimen: null, almanac: null, dailyRecord: {}}));
    assert.equal(result.confidence, 'low');
    assert.equal(hasBusinessSources(result), false);
    assert.deepEqual(result.sources.map((source) => source.type), ['shichen']);
});

test('G. 论文、XRD、数据和汇报均能识别为对应任务分类', () => {
    assert.deepEqual(classifyText('阅读论文'), ['study']);
    assert.deepEqual(classifyText('开展 XRD 测试'), ['experiment']);
    assert.deepEqual(classifyText('整理数据'), ['analysis']);
    assert.deepEqual(classifyText('准备组会汇报'), ['communication']);
    assert.deepEqual(
        identifyTasks({plan: '阅读论文\nXRD 测试\n整理数据', important: '组会汇报'}).map((task) => task.text),
        ['阅读论文', 'XRD 测试', '整理数据', '组会汇报']
    );
});

test('H. 推荐结果不包含确定性预测措辞', () => {
    const result = recommend(input({
        qimen: {analysis: {suggestions: ['这样做一定成功，适合学习。']}},
        dailyRecord: {plan: '论文阅读', important: ''}
    }));
    assert.doesNotMatch(JSON.stringify(result), /一定|绝对|必然|注定|肯定会|一定失败/);
});
