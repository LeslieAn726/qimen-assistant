'use strict';

const crypto = require('node:crypto');

const PROMPT_VERSION = 'daily-advice-v1';
const DISCLAIMER = '传统术数内容仅作文化和娱乐参考';

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((result, key) => {
            result[key] = stableValue(value[key]);
            return result;
        }, {});
    }
    return value;
}

function stableStringify(value) {
    return JSON.stringify(stableValue(value));
}

function buildDailyAdviceInput(page) {
    const pan = page.pan || {};
    return {
        date: page.date,
        panTime: page.panTime,
        pan: {
            basicInfo: pan.basicInfo || {},
            siZhu: pan.siZhu || {},
            jieQi: pan.juShu && pan.juShu.jieQiName || '',
            dunType: pan.juShu && pan.juShu.type || '',
            juShu: pan.juShu || {},
            xunShou: pan.xunShou || '',
            diPan: pan.diPan || {},
            tianPan: pan.tianPan || pan.sanQiLiuYi || {},
            jiuXing: pan.jiuXing || {},
            baMen: pan.baMen || {},
            baShen: pan.baShen || {},
            zhiFu: {xing: pan.zhiFuXing || '', gong: pan.zhiFuGong || ''},
            zhiShi: {men: pan.zhiShiMen || '', gong: pan.zhiShiGong || ''},
            kongWang: {zhi: pan.kongWangZhi || [], gong: pan.kongWangGong || []},
            maStar: pan.maStar || {},
            anGan: pan.anGan || {}
        },
        traditionalRuleAnalysis: {
            overall: pan.analysis || {},
            patterns: pan.geju || [],
            palaces: pan.jiuGongAnalysis || {}
        },
        plan: page.record && page.record.plan || '',
        important: page.record && page.record.important || ''
    };
}

function buildDailyAdvicePrompt(page) {
    const input = buildDailyAdviceInput(page);
    const inputJson = stableStringify({
        pan: input.pan,
        traditionalRuleAnalysis: input.traditionalRuleAnalysis,
        plan: input.plan,
        important: input.important
    });
    const inputHash = crypto.createHash('sha256').update(inputJson, 'utf8').digest('hex');
    const system = [
        '你是“每日奇门助手”的建议整理模块。',
        '你不是在重新排奇门盘。以下盘面均为系统已经计算完成的确定性输入。',
        '你只能基于给定数据进行整理、解释和今日行动建议。',
        '不要自行修改、补算、猜测或纠正阴阳遁、局数、九宫、九星、八门、八神、值符、值使、空亡、马星或暗干。',
        '不要声称能够预测确定结果，不要替用户自动修改计划。',
        '只输出一个 JSON 对象，不要输出 Markdown、代码块、前后说明或额外字段。'
    ].join('\n');
    const user = [
        '请根据下面四部分确定性输入生成今日建议。',
        '',
        `【今日盘面】\n${JSON.stringify(input.pan, null, 2)}`,
        '',
        `【传统规则分析】\n${JSON.stringify(input.traditionalRuleAnalysis, null, 2)}`,
        '',
        `【今日计划】\n${input.plan || '未填写'}`,
        '',
        `【今日重要事项】\n${input.important || '未填写'}`,
        '',
        '严格按以下结构输出 JSON：',
        JSON.stringify({
            summary: '今日总体建议',
            priority: ['优先事项1', '优先事项2', '优先事项3'],
            timingAdvice: '今天任务安排建议',
            riskNotes: ['注意事项1', '注意事项2'],
            planSuggestion: '结合今日计划的具体建议',
            disclaimer: DISCLAIMER
        }, null, 2)
    ].join('\n');

    return {
        promptVersion: PROMPT_VERSION,
        input,
        inputHash,
        messages: [
            {role: 'system', content: system},
            {role: 'user', content: user}
        ]
    };
}

module.exports = {
    DISCLAIMER,
    PROMPT_VERSION,
    buildDailyAdviceInput,
    buildDailyAdvicePrompt,
    stableStringify
};
