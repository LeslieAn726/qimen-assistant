'use strict';

const {TASK_KEYWORDS} = require('../constants/task-keywords');

const MAX_TASKS = 20;

function cleanText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function splitTaskText(value) {
    if (typeof value !== 'string' || !value.trim()) return [];
    const prepared = value
        .replace(/\r\n?/g, '\n')
        .replace(/(^|\s)\d{1,2}[.、)]\s*/g, '$1\n')
        .replace(/(?:然后|之后)/g, '\n')
        .replace(/\s+(?=(?:下午|晚上|上午|早上|中午|傍晚))/g, '\n');
    return prepared
        .split(/[\n，,；;。]+/)
        .map((part) => cleanText(part).replace(/^(?:上午|下午|晚上|早上|中午|傍晚)\s*/, ''))
        .filter((part) => part.length >= 2);
}

function matchKeywords(text) {
    const lower = cleanText(text).toLowerCase();
    const categories = [];
    const keywords = [];
    for (const [category, values] of Object.entries(TASK_KEYWORDS)) {
        const matches = values.filter((keyword) => lower.includes(keyword.toLowerCase()));
        if (matches.length) {
            categories.push(category);
            keywords.push(...matches);
        }
    }
    return {categories, keywords: [...new Set(keywords)]};
}

function createDisplayName(text) {
    let display = cleanText(text)
        .replace(/^(?:完成|进行|处理)\s*/, '')
        .replace(/并(?:进行|完成)?/g, '与')
        .replace(/([\p{Script=Han}0-9])(?=XRD\b)/giu, '$1 ')
        .replace(/XRD(?=[\p{Script=Han}])/giu, 'XRD ')
        .replace(/([\p{Script=Han}])(?=[A-Za-z])/gu, '$1 ')
        .replace(/([A-Za-z][A-Za-z0-9]*)(?=论文)/g, '$1 ')
        .replace(/\s+/g, ' ')
        .trim();
    if (display.length > 48) display = `${display.slice(0, 47)}…`;
    return display || cleanText(text);
}

function taskKey(task) {
    return cleanText(task && (task.text || task.displayName))
        .toLowerCase()
        .replace(/[\s，,；;。、“”'"()（）【】\[\]]+/g, '');
}

function extractSource(value, important) {
    return splitTaskText(value).map((text) => {
        const matched = matchKeywords(text);
        return {
            text,
            displayName: createDisplayName(text),
            category: matched.categories,
            keywords: matched.keywords,
            important
        };
    });
}

function extractTasks(record = {}) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new TypeError('任务提取输入必须是每日记录对象。');
    }
    const combined = [
        ...extractSource(record.plan, false),
        ...extractSource(record.important, true)
    ];
    const unique = new Map();
    for (const task of combined) {
        const key = taskKey(task);
        if (!key) continue;
        const previous = unique.get(key);
        if (!previous || task.important) unique.set(key, task);
    }
    return [...unique.values()].slice(0, MAX_TASKS);
}

function createTaskExtractionService() {
    return {extractTasks};
}

module.exports = {
    MAX_TASKS,
    createDisplayName,
    createTaskExtractionService,
    extractTasks,
    matchKeywords,
    splitTaskText,
    taskKey
};
