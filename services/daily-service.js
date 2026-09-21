'use strict';

const qimen = require('../lib/qimen');
const {COOKIE_NAME, readCookie, resolveUserDate} = require('../lib/localtime');

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
const TIMEZONE_RE = /^[A-Za-z0-9_+/-]{1,64}$/;
const MAX_TEXT_LENGTH = 100000;

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatDateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatLocalDateTime(date) {
    return `${formatDateKey(date)}T${formatTime(date)}`;
}

function dateFromParts(parts) {
    const values = parts.map(Number);
    const [year, month, day, hour = 0, minute = 0, second = 0] = values;
    const date = new Date(year, month - 1, day, hour, minute, second);

    if (
        date.getFullYear() !== year
        || date.getMonth() !== month - 1
        || date.getDate() !== day
        || date.getHours() !== hour
        || date.getMinutes() !== minute
        || date.getSeconds() !== second
    ) {
        return null;
    }

    return date;
}

function assertDateKey(dateKey) {
    const match = DATE_RE.exec(dateKey || '');
    if (!match || !dateFromParts(match.slice(1))) {
        const error = new Error('日期格式必须为有效的 YYYY-MM-DD');
        error.statusCode = 400;
        throw error;
    }
    return dateKey;
}

function parseLocalDateTime(value) {
    const match = LOCAL_DATE_TIME_RE.exec(value || '');
    return match ? dateFromParts(match.slice(1)) : null;
}

function resolveTimezone(cookieHeader) {
    const raw = readCookie(cookieHeader, COOKIE_NAME);
    if (!raw) return '服务器本地时区';

    const [timezone = '', offsetRaw = ''] = raw.split('|');
    if (TIMEZONE_RE.test(timezone)) return timezone;

    if (/^-?\d{1,4}$/.test(offsetRaw)) {
        const offset = Number(offsetRaw);
        if (offset >= -720 && offset <= 840) {
            const sign = offset >= 0 ? '+' : '-';
            const absolute = Math.abs(offset);
            return `UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
        }
    }

    return '服务器本地时区';
}

function selectPanDate(dateKey, wallNow, record) {
    if (record && record.panTime) {
        const storedPanDate = parseLocalDateTime(record.panTime);
        if (storedPanDate) return storedPanDate;
    }

    if (!dateKey) return wallNow;

    const match = DATE_RE.exec(assertDateKey(dateKey));
    return dateFromParts([
        ...match.slice(1),
        wallNow.getHours(),
        wallNow.getMinutes(),
        wallNow.getSeconds()
    ]);
}

function normalizePanForView(pan) {
    if (pan.error) {
        const error = new Error(pan.message || '奇门排盘失败');
        error.statusCode = 500;
        throw error;
    }

    if (!pan.jiuGongAnalysis) pan.jiuGongAnalysis = {};
    for (let gong = 1; gong <= 9; gong++) {
        if (!pan.jiuGongAnalysis[gong]) {
            pan.jiuGongAnalysis[gong] = {
                direction: '',
                gongName: '',
                jiXiong: 'ping'
            };
        }
    }

    return pan;
}

async function getTodayPageData(dailyStorage, {cookieHeader, dateKey} = {}) {
    const wallNow = resolveUserDate(cookieHeader);
    const selectedDateKey = dateKey ? assertDateKey(dateKey) : formatDateKey(wallNow);
    const record = await dailyStorage.getRecord(selectedDateKey);
    const panDate = selectPanDate(dateKey, wallNow, record);
    const timezone = record && record.timezone
        ? record.timezone
        : resolveTimezone(cookieHeader);

    const pan = normalizePanForView(qimen.calculate(panDate, {
        type: '四柱',
        method: '时家',
        purpose: '综合',
        location: '默认位置'
    }));

    return {
        date: selectedDateKey,
        time: formatTime(panDate),
        timezone,
        panTime: formatLocalDateTime(panDate),
        currentShichen: pan.siZhu && pan.siZhu.time || '',
        record: record || {
            date: selectedDateKey,
            timezone,
            panTime: formatLocalDateTime(panDate),
            plan: '',
            important: '',
            result: '',
            review: ''
        },
        pan
    };
}

function normalizeText(value, fieldName) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') {
        const error = new Error(`${fieldName} 必须是文本`);
        error.statusCode = 400;
        throw error;
    }
    if (value.length > MAX_TEXT_LENGTH) {
        const error = new Error(`${fieldName} 不能超过 ${MAX_TEXT_LENGTH} 个字符`);
        error.statusCode = 400;
        throw error;
    }
    return value;
}

async function saveDailyRecord(dailyStorage, dateKey, fields, {cookieHeader} = {}) {
    assertDateKey(dateKey);
    fields = fields || {};
    const existing = await dailyStorage.getRecord(dateKey);
    const now = new Date();
    const wallNow = resolveUserDate(cookieHeader, now);

    let panTime = existing && parseLocalDateTime(existing.panTime)
        ? existing.panTime
        : fields.panTime;
    if (!parseLocalDateTime(panTime) || !panTime.startsWith(`${dateKey}T`)) {
        const dateMatch = DATE_RE.exec(dateKey);
        panTime = formatLocalDateTime(dateFromParts([
            ...dateMatch.slice(1),
            wallNow.getHours(),
            wallNow.getMinutes(),
            wallNow.getSeconds()
        ]));
    }

    const record = {
        date: dateKey,
        timezone: existing && existing.timezone || resolveTimezone(cookieHeader),
        panTime,
        plan: normalizeText(fields.plan, '今日计划'),
        important: normalizeText(fields.important, '今日重要事项'),
        result: normalizeText(fields.result, '实际完成情况'),
        review: normalizeText(fields.review, '今日复盘'),
        createdAt: existing && existing.createdAt || now.toISOString(),
        updatedAt: now.toISOString()
    };

    return dailyStorage.saveRecord(dateKey, record);
}

async function getDailyRecord(dailyStorage, dateKey) {
    assertDateKey(dateKey);
    return dailyStorage.getRecord(dateKey);
}

async function getHistory(dailyStorage) {
    const records = await dailyStorage.readAll();
    return Object.values(records)
        .filter((record) => record && typeof record.date === 'string')
        .map((record) => ({
            date: record.date,
            hasPlan: Boolean(record.plan && record.plan.trim()),
            hasResult: Boolean(record.result && record.result.trim()),
            updatedAt: record.updatedAt || ''
        }))
        .sort((left, right) => right.date.localeCompare(left.date));
}

function createDailyService(dailyStorage) {
    if (!dailyStorage || typeof dailyStorage.readAll !== 'function') {
        throw new TypeError('dailyStorage 必须是有效的每日记录存储实例');
    }

    return {
        getTodayPageData: (options) => getTodayPageData(dailyStorage, options),
        saveDailyRecord: (dateKey, fields, options) => saveDailyRecord(
            dailyStorage,
            dateKey,
            fields,
            options
        ),
        getDailyRecord: (dateKey) => getDailyRecord(dailyStorage, dateKey),
        getHistory: () => getHistory(dailyStorage)
    };
}

module.exports = {
    createDailyService,
    assertDateKey,
    formatDateKey,
    formatTime,
    formatLocalDateTime,
    resolveTimezone
};
