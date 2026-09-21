'use strict';

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

const SHICHEN = Object.freeze([
    {name: '子', range: '23:00–00:59', midpoint: '23:30', hours: [23, 0]},
    {name: '丑', range: '01:00–02:59', midpoint: '01:30', hours: [1, 2]},
    {name: '寅', range: '03:00–04:59', midpoint: '03:30', hours: [3, 4]},
    {name: '卯', range: '05:00–06:59', midpoint: '05:30', hours: [5, 6]},
    {name: '辰', range: '07:00–08:59', midpoint: '07:30', hours: [7, 8]},
    {name: '巳', range: '09:00–10:59', midpoint: '09:30', hours: [9, 10]},
    {name: '午', range: '11:00–12:59', midpoint: '11:30', hours: [11, 12]},
    {name: '未', range: '13:00–14:59', midpoint: '13:30', hours: [13, 14]},
    {name: '申', range: '15:00–16:59', midpoint: '15:30', hours: [15, 16]},
    {name: '酉', range: '17:00–18:59', midpoint: '17:30', hours: [17, 18]},
    {name: '戌', range: '19:00–20:59', midpoint: '19:30', hours: [19, 20]},
    {name: '亥', range: '21:00–22:59', midpoint: '21:30', hours: [21, 22]}
]);

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatDateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(date, includeSeconds = false) {
    const result = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return includeSeconds ? `${result}:${pad(date.getSeconds())}` : result;
}

function getShanghaiWallClock(instant = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: SHANGHAI_TIME_ZONE,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).formatToParts(instant);
    const values = {};
    for (const part of parts) {
        if (part.type !== 'literal') values[part.type] = Number(part.value);
    }
    return new Date(
        values.year,
        values.month - 1,
        values.day,
        values.hour,
        values.minute,
        values.second
    );
}

function parseCustomDateTime(dateKey, timeValue) {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeValue || ''));
    if (!dateMatch || !timeMatch) return null;

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (hour > 23 || minute > 59) return null;

    const date = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (
        date.getFullYear() !== year
        || date.getMonth() !== month - 1
        || date.getDate() !== day
        || date.getHours() !== hour
        || date.getMinutes() !== minute
    ) return null;
    return date;
}

function getShichen(dateOrHour) {
    const hour = dateOrHour instanceof Date ? dateOrHour.getHours() : Number(dateOrHour);
    return SHICHEN.find((item) => item.hours.includes(hour)) || SHICHEN[0];
}

function createPageMeta(mode, date, options = {}) {
    const shichen = getShichen(date);
    const isCustom = mode === 'custom';
    return {
        mode: isCustom ? 'custom' : 'realtime',
        title: isCustom ? '自定义奇门排盘' : '实时奇门盘',
        subtitle: isCustom ? '查询指定日期与时辰的奇门盘' : '根据当前北京时间实时排盘',
        badge: isCustom ? '自定义时间' : '实时',
        date: formatDateKey(date),
        time: formatTime(date, !isCustom),
        formTime: formatTime(date),
        shichen: shichen.name,
        shichenRange: shichen.range,
        timezone: SHANGHAI_TIME_ZONE,
        jieQi: options.jieQi || '',
        type: options.type || '四柱',
        method: options.method || '时家',
        purpose: options.purpose || '综合',
        location: options.location || '默认位置',
        shichenOptions: SHICHEN
    };
}

module.exports = {
    SHANGHAI_TIME_ZONE,
    SHICHEN,
    formatDateKey,
    formatTime,
    getShanghaiWallClock,
    parseCustomDateTime,
    getShichen,
    createPageMeta
};
