'use strict';

const SHICHEN_CONTEXT = Object.freeze({
    zi: '深夜休息阶段',
    chou: '深夜休息阶段',
    yin: '清晨准备阶段',
    mao: '清晨启动阶段',
    chen: '上午启动阶段',
    si: '上午专注阶段',
    wu: '中午收束与休息阶段',
    wei: '下午重新启动阶段',
    shen: '下午深度工作阶段',
    you: '傍晚整理阶段',
    xu: '晚上收尾阶段',
    hai: '夜间放松阶段'
});

function getShichenContext(shichen) {
    return shichen && SHICHEN_CONTEXT[shichen.key || shichen.id] || '日常安排阶段';
}

module.exports = {SHICHEN_CONTEXT, getShichenContext};

