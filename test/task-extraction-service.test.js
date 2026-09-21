'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');

const {
    createDisplayName,
    extractTasks,
    splitTaskText
} = require('../services/task-extraction-service');

test('A/C. 保留 316 样品 XRD 测试与精修原文并识别双类别', () => {
    const [task] = extractTasks({plan: '完成316样品XRD测试并进行精修'});
    assert.equal(task.text, '完成316样品XRD测试并进行精修');
    assert.equal(task.displayName, '316样品 XRD 测试与精修');
    assert.deepEqual(task.category, ['experiment', 'analysis']);
    assert.ok(task.keywords.includes('XRD'));
    assert.ok(task.keywords.includes('精修'));
});

test('B. CsPbBr3 论文任务识别为 study 并生成易读展示名', () => {
    const [task] = extractTasks({plan: '晚上阅读CsPbBr3论文'});
    assert.equal(task.text, '阅读CsPbBr3论文');
    assert.equal(task.displayName, '阅读 CsPbBr3 论文');
    assert.deepEqual(task.category, ['study']);
});

test('常见分隔符可以切分，但“XRD测试并精修”不会被过度拆碎', () => {
    assert.deepEqual(
        splitTaskText('1. XRD测试并精修；然后阅读论文\n3、准备汇报'),
        ['XRD测试并精修', '阅读论文', '准备汇报']
    );
    assert.equal(createDisplayName('XRD测试并精修'), 'XRD 测试与精修');
});

test('important 来源保留标记，并在重复任务时覆盖普通 plan', () => {
    const tasks = extractTasks({plan: '准备组会汇报', important: '准备组会汇报；检查数据'});
    assert.equal(tasks.length, 2);
    assert.equal(tasks.find((task) => task.displayName === '准备组会汇报').important, true);
    assert.equal(tasks.find((task) => task.displayName === '检查数据').important, true);
});

