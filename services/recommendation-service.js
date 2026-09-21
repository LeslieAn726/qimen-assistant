'use strict';

const {TASK_KEYWORDS} = require('../constants/task-keywords');
const {getShichenContext} = require('../constants/shichen-context');
const {extractTasks, taskKey} = require('./task-extraction-service');

const POSITIVE_MARKERS = ['适合', '宜', '有利', '利于', '可推进', '可稳步', '可多', '吉'];
const NEGATIVE_MARKERS = ['不宜', '忌', '避免', '谨慎', '宜静', '阻碍', '停滞', '风险', '不利'];
const DETERMINISTIC_PHRASES = /一定|绝对|必然|注定|肯定会|一定失败/g;

function cleanText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function shorten(value, maxLength = 120) {
    const text = cleanText(value);
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function collectText(value, output = []) {
    if (typeof value === 'string') {
        if (cleanText(value)) output.push(cleanText(value));
        return output;
    }
    if (Array.isArray(value)) {
        value.forEach((item) => collectText(item, output));
        return output;
    }
    if (value && typeof value === 'object') {
        Object.values(value).forEach((item) => collectText(item, output));
    }
    return output;
}

function classifyText(value) {
    const text = cleanText(value).toLowerCase();
    if (!text) return [];
    return Object.entries(TASK_KEYWORDS)
        .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword.toLowerCase())))
        .map(([category]) => category);
}

function splitTasks(value) {
    if (typeof value !== 'string') return [];
    return value
        .split(/[\n\r，,；;。]+/)
        .map((item) => cleanText(item).replace(/^[-*•\d.、\s]+/, '').trim())
        .filter(Boolean);
}

function identifyTasks(dailyRecord = {}) {
    return extractTasks(dailyRecord).map((task) => ({text: task.text, categories: task.category}));
}

function intersection(left, right) {
    return left.some((item) => right.has(item));
}

function qimenSignals(qimen) {
    if (!qimen || typeof qimen !== 'object') return {texts: [], positive: new Set(), negative: new Set()};
    const texts = [
        ...collectText(qimen.analysis),
        ...collectText(qimen.geju),
        ...collectText(qimen.jiuGongAnalysis),
        ...collectText(qimen.basicInfo)
    ];
    const positive = new Set();
    const negative = new Set();
    for (const text of texts) {
        const categories = classifyText(text);
        const hasNegative = NEGATIVE_MARKERS.some((marker) => text.includes(marker));
        const hasPositive = POSITIVE_MARKERS.some((marker) => text.includes(marker));
        if (hasNegative) categories.forEach((category) => negative.add(category));
        if (hasPositive && !hasNegative) categories.forEach((category) => positive.add(category));
    }
    return {texts, positive, negative};
}

function almanacSignals(almanac) {
    const yi = almanac && Array.isArray(almanac.yi) ? almanac.yi.map(cleanText).filter(Boolean) : [];
    const ji = almanac && Array.isArray(almanac.ji) ? almanac.ji.map(cleanText).filter(Boolean) : [];
    const goodGods = almanac && Array.isArray(almanac.goodGods)
        ? almanac.goodGods.map(cleanText).filter(Boolean)
        : [];
    const badGods = almanac && Array.isArray(almanac.badGods)
        ? almanac.badGods.map(cleanText).filter(Boolean)
        : [];
    return {
        yi,
        ji,
        goodGods,
        badGods,
        twelveDayOfficer: cleanText(almanac && almanac.twelveDayOfficer),
        dayType: almanac && almanac.dayType && typeof almanac.dayType === 'object' ? almanac.dayType : {},
        hasData: Boolean(almanac && typeof almanac === 'object' && (
            yi.length || ji.length || goodGods.length || badGods.length
            || cleanText(almanac.twelveDayOfficer) || collectText(almanac.dayType).length
        )),
        positive: new Set(yi.flatMap(classifyText)),
        negative: new Set(ji.flatMap(classifyText))
    };
}

function firstRelevant(items, categories) {
    return items.find((item) => intersection(classifyText(item), categories)) || items[0] || '';
}

function cautious(text) {
    return cleanText(text).replace(DETERMINISTIC_PHRASES, '可以留意');
}

function normalizeInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('recommendation-service 输入必须是对象。');
    }
    const shichen = input.shichen || {};
    return {
        date: cleanText(input.date),
        shichen: {
            key: cleanText(shichen.key || shichen.id),
            name: cleanText(shichen.name) || '当前时辰',
            start: cleanText(shichen.start || shichen.startTime),
            end: cleanText(shichen.end || shichen.endTime)
        },
        qimen: input.qimen && typeof input.qimen === 'object' ? input.qimen : null,
        almanac: input.almanac && typeof input.almanac === 'object' ? input.almanac : null,
        dailyRecord: input.dailyRecord && typeof input.dailyRecord === 'object' ? input.dailyRecord : {}
    };
}

const SHICHEN_TASK_PREFERENCE = Object.freeze({
    chen: ['experiment', 'analysis', 'study', 'communication'],
    si: ['experiment', 'analysis', 'study', 'communication'],
    wu: ['rest'],
    wei: ['analysis', 'experiment', 'study'],
    shen: ['analysis', 'experiment', 'study'],
    you: ['communication', 'analysis', 'study'],
    xu: ['communication', 'analysis', 'rest'],
    hai: ['rest'],
    zi: ['rest'],
    chou: ['rest'],
    yin: ['rest']
});

function normalizedRichTask(task) {
    const category = Array.isArray(task.category)
        ? task.category
        : Array.isArray(task.categories) ? task.categories : classifyText(task.text);
    return {
        text: cleanText(task.text),
        displayName: cleanText(task.displayName) || cleanText(task.text),
        category,
        keywords: Array.isArray(task.keywords) ? task.keywords : [],
        important: Boolean(task.important),
        key: taskKey(task)
    };
}

function legacyTasks(dailyRecord) {
    const plan = splitTasks(dailyRecord.plan).map((text) => ({text, important: false}));
    const important = splitTasks(dailyRecord.important).map((text) => ({text, important: true}));
    return [...plan, ...important].map((task) => normalizedRichTask({
        ...task,
        displayName: task.text,
        category: classifyText(task.text)
    }));
}

function isClearlyCompleted(task, result) {
    const resultText = cleanText(result).toLowerCase().replace(/\s+/g, '');
    if (!resultText) return false;
    const taskText = cleanText(task.text).toLowerCase().replace(/\s+/g, '');
    return taskText.length >= 4 && resultText.includes(taskText);
}

function selectFocusTask(tasks, {input, qimen, almanac, taskState}) {
    if (!tasks.length) return null;
    const state = taskState && taskState.date === input.date ? taskState : {};
    const lastTaskKey = cleanText(state.lastTaskKey);
    const counts = state.taskReminderCounts && typeof state.taskReminderCounts === 'object'
        ? state.taskReminderCounts
        : {};
    const available = tasks.filter((task) => task.important || !lastTaskKey || task.key !== lastTaskKey);
    if (!available.length) return null;
    const preferred = new Set(SHICHEN_TASK_PREFERENCE[input.shichen.key] || []);
    const ranked = available.map((task, index) => {
        const qimenMatch = intersection(task.category, qimen.positive);
        const almanacMatch = intersection(task.category, almanac.positive);
        const completed = isClearlyCompleted(task, input.dailyRecord.result);
        let score = task.important ? 100 : 0;
        if (qimenMatch) score += 30;
        if (almanacMatch) score += 30;
        if (!completed) score += 20;
        if (intersection(task.category, preferred)) score += 15;
        score -= Math.min(Number(counts[task.key]) || 0, 10) * 5;
        return {task, score, index, qimenMatch, almanacMatch, completed};
    }).sort((left, right) => right.score - left.score || left.index - right.index);
    const selected = ranked[0];
    const reasons = [];
    if (selected.task.important) reasons.push('今日重要事项优先');
    else reasons.push('今日计划中明确安排');
    if (selected.qimenMatch || selected.almanacMatch) reasons.push('与已有建议方向相符');
    if (!selected.completed) reasons.push('尚未在完成情况中明确记录完成');
    if (intersection(selected.task.category, preferred)) reasons.push('符合当前生活节奏');
    return Object.freeze({
        key: selected.task.key,
        text: selected.task.text,
        displayName: selected.task.displayName,
        category: Object.freeze([...selected.task.category]),
        important: selected.task.important,
        reason: reasons.join('，')
    });
}

function focusSummary(input, focusTask, conflict) {
    const key = input.shichen.key;
    const task = `“${focusTask.displayName}”`;
    if (['zi', 'chou', 'yin'].includes(key)) {
        return `${task}先留到休息以后再继续吧，现在更适合保存进度、早点休息。`;
    }
    if (['xu', 'hai'].includes(key)) {
        if (focusTask.category.includes('experiment')) {
            return `${task}如果还没收尾，可以先保存结果和记录，新实验今晚先别开。`;
        }
        return `${task}如果还没收尾，可以先保存好进度，今晚别再给自己开新任务。`;
    }
    if (key === 'wu') return `先把${task}的当前进度收好，记得吃饭和休息，下午再继续。`;
    if (conflict) return `如果${task}不是必须立即处理，可以考虑调整时间；若必须推进，提前做好准备。`;
    if (['chen', 'si'].includes(key)) return `现在可以先推进${task}，做完这一项再开下一项。`;
    if (['wei', 'shen'].includes(key)) return `可以重新进入${task}，先处理最关键的一小步，不用一下全做完。`;
    if (key === 'you') return `可以整理${task}的结果和待办，为下一步留好记录。`;
    return `现在可以先处理${task}，慢慢推进就好。`;
}

function genericSummary(input) {
    const key = input.shichen.key;
    if (['zi', 'chou', 'yin'].includes(key)) return '已经很晚啦，先保存进度、关掉新任务，早点休息吧。';
    if (['xu', 'hai'].includes(key)) return '今天先收好结果和待办，别再给自己开新坑，准备休息吧。';
    if (key === 'wu') return '先把手上的一小步收好，记得吃饭、喝水，休息后再继续。';
    if (key === 'you') return '可以整理一下今天的结果和明天的待办，别把任务都留在脑子里。';
    if (['wei', 'shen'].includes(key)) return '挑一件需要耐心的事继续做，先完成关键的一小步。';
    return '先挑今天最重要的一件事开始，做完这一项再开下一项。';
}

function recommend(rawInput, options = {}) {
    const input = normalizeInput(rawInput);
    let tasks;
    try {
        const extractor = typeof options.taskExtractor === 'function' ? options.taskExtractor : extractTasks;
        tasks = extractor(input.dailyRecord).map(normalizedRichTask).filter((task) => task.text);
    } catch (error) {
        tasks = legacyTasks(input.dailyRecord);
    }
    const recognizedTasks = tasks.filter((task) => task.category.length);
    const qimen = qimenSignals(input.qimen);
    const almanac = almanacSignals(input.almanac);
    const context = getShichenContext(input.shichen);
    const matchedPlans = recognizedTasks.map((task) => task.displayName);
    const alignedWithQimen = recognizedTasks.filter((task) => intersection(task.category, qimen.positive));
    const alignedWithYi = recognizedTasks.filter((task) => intersection(task.category, almanac.positive));
    const fullyAligned = recognizedTasks.filter((task) => (
        intersection(task.category, qimen.positive) && intersection(task.category, almanac.positive)
    ));
    const conflicts = recognizedTasks.filter((task) => (
        intersection(task.category, almanac.negative) || intersection(task.category, qimen.negative)
    ));
    const focusTask = selectFocusTask(tasks, {input, qimen, almanac, taskState: options.taskState});
    const focusConflict = focusTask && conflicts.some((task) => task.key === focusTask.key);

    const recommended = [];
    const avoid = [];
    const sources = [];
    if (tasks.length) {
        const planReason = matchedPlans.length
            ? `今日记录识别到：${matchedPlans.slice(0, 3).join('、')}`
            : '今日记录已有计划或重要事项，但未匹配到预设任务分类。';
        sources.push({type: 'plan', reason: planReason});
        if (focusTask) recommended.push(`现在可以先：${focusTask.displayName}`);
    }
    if (qimen.texts.length) {
        const relevant = firstRelevant(qimen.texts, new Set(recognizedTasks.flatMap((task) => task.category)));
        sources.push({type: 'qimen', reason: `现有规则分析：${shorten(relevant)}`});
    }
    if (almanac.hasData) {
        const parts = [];
        if (almanac.yi.length) parts.push(`宜：${almanac.yi.slice(0, 3).join('、')}`);
        if (almanac.ji.length) parts.push(`忌：${almanac.ji.slice(0, 3).join('、')}`);
        if (almanac.goodGods.length) parts.push(`吉神：${almanac.goodGods.slice(0, 2).join('、')}`);
        if (almanac.badGods.length) parts.push(`凶煞：${almanac.badGods.slice(0, 2).join('、')}`);
        if (almanac.twelveDayOfficer) parts.push(`建除：${almanac.twelveDayOfficer}`);
        if (cleanText(almanac.dayType.deity)) parts.push(`值日：${cleanText(almanac.dayType.deity)}`);
        sources.push({type: 'almanac', reason: shorten(parts.join('；'))});
    }
    sources.push({type: 'shichen', reason: `${input.shichen.name}作为${context}，仅提供生活节奏参考。`});

    const relevantYi = firstRelevant(almanac.yi, new Set(recognizedTasks.flatMap((task) => task.category)));
    if (relevantYi) recommended.push(`可以参考今日宜：${relevantYi}`);
    for (const task of conflicts.slice(0, 2)) {
        avoid.push(`若需推进“${task.text}”，可以提前做好准备或考虑调整时间`);
    }
    const relevantJi = firstRelevant(almanac.ji, new Set(recognizedTasks.flatMap((task) => task.category)));
    if (relevantJi) avoid.push(`可以留意今日忌：${relevantJi}`);
    if (!recommended.length) recommended.push(`${context}，可以按自己的节奏安排手边事项`);

    let summary;
    let confidence;
    if (focusTask) {
        summary = focusSummary(input, focusTask, focusConflict);
        if (focusConflict) confidence = 'medium';
        else if (fullyAligned.some((task) => task.key === focusTask.key)) confidence = 'high';
        else confidence = alignedWithQimen.some((task) => task.key === focusTask.key)
            || alignedWithYi.some((task) => task.key === focusTask.key) ? 'medium' : 'low';
    } else if (conflicts.length) {
        summary = genericSummary(input);
        confidence = 'medium';
    } else if (qimen.texts.length || almanac.hasData) {
        summary = genericSummary(input);
        confidence = qimen.texts.length && almanac.hasData ? 'medium' : 'low';
    } else {
        summary = genericSummary(input);
        confidence = 'low';
    }

    return Object.freeze({
        title: `${input.shichen.name}建议`,
        summary: cautious(summary),
        recommended: Object.freeze([...new Set(recommended.map(cautious))].slice(0, 3)),
        avoid: Object.freeze([...new Set(avoid.map(cautious))].slice(0, 3)),
        matchedPlans: Object.freeze(matchedPlans),
        focusTask,
        sources: Object.freeze(sources.map((source) => Object.freeze({
            type: source.type,
            reason: cautious(source.reason)
        }))),
        confidence
    });
}

function hasBusinessSources(recommendation) {
    return Boolean(recommendation && Array.isArray(recommendation.sources)
        && recommendation.sources.some((source) => ['qimen', 'almanac', 'plan'].includes(source.type)));
}

function createRecommendationService({taskExtractor = extractTasks} = {}) {
    return {recommend: (input, options = {}) => recommend(input, {...options, taskExtractor})};
}

module.exports = {
    classifyText,
    createRecommendationService,
    hasBusinessSources,
    identifyTasks,
    selectFocusTask,
    recommend
};
