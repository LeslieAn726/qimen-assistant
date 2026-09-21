'use strict';

const TASK_KEYWORDS = Object.freeze({
    study: Object.freeze(['论文', '阅读', '学习', '文献', '课程', '读书', '求学', '入学', '习艺']),
    experiment: Object.freeze(['实验', 'XRD', '测试', '合成', '表征', '烧结']),
    analysis: Object.freeze(['数据', '分析', '精修', '作图', '处理']),
    communication: Object.freeze(['汇报', '导师', '组会', '会议', '沟通']),
    travel: Object.freeze(['出行', '外出', '出差', '旅行']),
    rest: Object.freeze(['休息', '午睡', '散步', '放松'])
});

const TASK_CATEGORY_LABELS = Object.freeze({
    study: '学习阅读',
    experiment: '实验测试',
    analysis: '数据分析',
    communication: '沟通汇报',
    travel: '外出出行',
    rest: '休息调整'
});

module.exports = {TASK_CATEGORY_LABELS, TASK_KEYWORDS};

