'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createRecommendationService, recommend} = require('../services/recommendation-service');

function input({key = 'shen', name = '申时', plan = '', important = '', result = ''} = {}) {
    return {
        date: '2026-09-13',
        shichen: {key, name, start: '15:00', end: '17:00'},
        qimen: {analysis: {suggestions: ['可以稳一点推进，重要事情多检查一遍。']}},
        almanac: {yi: ['学习'], ji: []},
        dailyRecord: {plan, important, result, review: ''}
    };
}

test('D. important 任务优先于普通 plan', () => {
    const result = recommend(input({plan: '阅读CsPbBr3论文', important: '明天下午组会汇报'}));
    assert.equal(result.focusTask.displayName, '明天下午组会汇报');
    assert.equal(result.focusTask.important, true);
});

test('E. 普通任务不会连续两个时辰重复，存在其他任务时自动轮换', () => {
    const first = recommend(input({plan: '阅读论文；整理XRD数据'}));
    const taskState = {
        date: '2026-09-13',
        lastTaskKey: first.focusTask.key,
        taskReminderCounts: {[first.focusTask.key]: 1}
    };
    const second = recommend(input({key: 'you', name: '酉时', plan: '阅读论文；整理XRD数据'}), {
        taskState
    });
    assert.notEqual(second.focusTask.key, first.focusTask.key);
    assert.equal(taskState.taskReminderCounts[first.focusTask.key], 1);
});

test('K. 任务解析器失败时回退基础切分，推荐流程继续工作', () => {
    const service = createRecommendationService({taskExtractor() { throw new Error('模拟解析失败'); }});
    const result = service.recommend(input({plan: '阅读论文'}));
    assert.equal(result.focusTask.displayName, '阅读论文');
    assert.equal(result.focusTask.category.includes('study'), true);
});
