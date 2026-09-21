'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const SETTINGS_FILENAME = 'settings.json';
const DEFAULT_SETTINGS = Object.freeze({
    startupPage: 'today',
    dailyReferenceTime: '09:00',
    showRuleAnalysis: true,
    showGongDetails: true
});
const STARTUP_PAGES = new Set(['today', 'history']);
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function settingsError(message, code, cause) {
    const error = new Error(message, cause ? {cause} : undefined);
    error.code = code;
    error.statusCode = 500;
    return error;
}

function normalizeSettings(value, {strict = false} = {}) {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        throw settingsError('设置文件的根节点必须是对象。', 'SETTINGS_CORRUPT');
    }

    const result = {...DEFAULT_SETTINGS};

    if (value.startupPage !== undefined) {
        if (!STARTUP_PAGES.has(value.startupPage)) {
            throw settingsError('启动页面设置无效，只能选择今日助手或历史记录。', 'SETTINGS_INVALID');
        }
        result.startupPage = value.startupPage;
    } else if (strict) {
        result.startupPage = DEFAULT_SETTINGS.startupPage;
    }

    if (value.dailyReferenceTime !== undefined) {
        if (typeof value.dailyReferenceTime !== 'string' || !TIME_RE.test(value.dailyReferenceTime)) {
            throw settingsError('每日默认参考时间必须是 HH:mm 格式。', 'SETTINGS_INVALID');
        }
        result.dailyReferenceTime = value.dailyReferenceTime;
    }

    for (const key of ['showRuleAnalysis', 'showGongDetails']) {
        if (value[key] !== undefined) {
            if (typeof value[key] !== 'boolean') {
                throw settingsError(`${key} 必须是布尔值。`, 'SETTINGS_INVALID');
            }
            result[key] = value[key];
        }
    }

    return result;
}

function createSettingsStorage(baseDir) {
    if (typeof baseDir !== 'string' || !baseDir.trim()) {
        throw new TypeError('设置存储目录不能为空');
    }

    const settingsDir = path.resolve(baseDir);
    const settingsFile = path.join(settingsDir, SETTINGS_FILENAME);
    let writeQueue = Promise.resolve();

    async function writeFile(settings, flag) {
        const content = `${JSON.stringify(settings, null, 2)}\n`;
        if (flag) {
            await fs.writeFile(settingsFile, content, {encoding: 'utf8', flag});
            return;
        }

        const temporaryFile = `${settingsFile}.${process.pid}.${Date.now()}.tmp`;
        try {
            await fs.writeFile(temporaryFile, content, 'utf8');
            await fs.rename(temporaryFile, settingsFile);
        } catch (error) {
            await fs.rm(temporaryFile, {force: true}).catch(() => undefined);
            throw error;
        }
    }

    async function ensureStorage() {
        try {
            await fs.mkdir(settingsDir, {recursive: true});
            await fs.access(settingsFile);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw settingsError('无法访问应用设置目录，请检查当前用户的目录写入权限。', 'SETTINGS_UNWRITABLE', error);
            }

            try {
                await writeFile(DEFAULT_SETTINGS, 'wx');
            } catch (writeError) {
                if (writeError.code !== 'EEXIST') {
                    throw settingsError('无法创建 settings.json，请检查当前用户的目录写入权限。', 'SETTINGS_UNWRITABLE', writeError);
                }
            }
        }
    }

    async function read() {
        await ensureStorage();

        let content;
        try {
            content = await fs.readFile(settingsFile, 'utf8');
        } catch (error) {
            throw settingsError('读取 settings.json 失败，请检查文件权限。', 'SETTINGS_READ_FAILED', error);
        }

        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch (error) {
            throw settingsError('settings.json 已损坏，无法读取应用设置。请从备份恢复或修复该文件。', 'SETTINGS_CORRUPT', error);
        }

        return normalizeSettings(parsed);
    }

    async function replace(settings) {
        const normalized = normalizeSettings(settings, {strict: true});
        const operation = async () => {
            await ensureStorage();
            try {
                await writeFile(normalized);
            } catch (error) {
                throw settingsError('保存 settings.json 失败，请检查磁盘空间和目录权限。', 'SETTINGS_WRITE_FAILED', error);
            }
            return normalized;
        };

        writeQueue = writeQueue.catch(() => undefined).then(operation);
        return writeQueue;
    }

    async function save(changes) {
        if (!changes || Array.isArray(changes) || typeof changes !== 'object') {
            throw settingsError('设置内容必须是对象。', 'SETTINGS_INVALID');
        }

        const operation = async () => {
            const current = await read();
            const normalized = normalizeSettings({...current, ...changes}, {strict: true});
            try {
                await writeFile(normalized);
            } catch (error) {
                throw settingsError('保存 settings.json 失败，请检查磁盘空间和目录权限。', 'SETTINGS_WRITE_FAILED', error);
            }
            return normalized;
        };

        writeQueue = writeQueue.catch(() => undefined).then(operation);
        return writeQueue;
    }

    return {
        settingsDir,
        settingsFile,
        ensureStorage,
        read,
        save,
        replace,
        normalize: normalizeSettings
    };
}

module.exports = {
    DEFAULT_SETTINGS,
    SETTINGS_FILENAME,
    createSettingsStorage,
    normalizeSettings
};
