'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const AI_SETTINGS_FILENAME = 'ai-settings.json';
const DEFAULT_AI_SETTINGS = Object.freeze({
    enabled: false,
    baseUrl: '',
    model: '',
    apiKey: ''
});

function aiSettingsError(message, code, cause, statusCode = 500) {
    const error = new Error(message, cause ? {cause} : undefined);
    error.code = code;
    error.statusCode = statusCode;
    return error;
}

function validateBaseUrl(value) {
    if (value === '') return value;
    if (typeof value !== 'string' || value.length > 2048) {
        throw aiSettingsError('AI Base URL 格式无效。', 'AI_BASE_URL_INVALID', null, 400);
    }
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('protocol');
        return value.replace(/\/+$/, '');
    } catch (error) {
        throw aiSettingsError('AI Base URL 必须是有效的 HTTP 或 HTTPS 地址。', 'AI_BASE_URL_INVALID', null, 400);
    }
}

function normalizeStoredSettings(value) {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        throw aiSettingsError('ai-settings.json 的根节点必须是对象。', 'AI_SETTINGS_CORRUPT');
    }

    const enabled = value.enabled === undefined ? false : value.enabled;
    if (typeof enabled !== 'boolean') {
        throw aiSettingsError('AI 启用设置必须是布尔值。', 'AI_SETTINGS_CORRUPT');
    }

    const baseUrl = value.baseUrl === undefined ? '' : value.baseUrl;
    const model = value.model === undefined ? '' : value.model;
    const apiKey = value.apiKey === undefined ? '' : value.apiKey;
    if (typeof model !== 'string' || model.length > 200) {
        throw aiSettingsError('AI 模型名称格式无效。', 'AI_SETTINGS_CORRUPT');
    }
    if (typeof apiKey !== 'string' || apiKey.length > 4096 || /[\r\n]/.test(apiKey)) {
        throw aiSettingsError('AI API Key 格式无效。', 'AI_SETTINGS_CORRUPT');
    }

    return {
        enabled,
        baseUrl: validateBaseUrl(baseUrl),
        model: model.trim(),
        apiKey: apiKey.trim()
    };
}

function toPublicSettings(settings) {
    return {
        enabled: settings.enabled,
        baseUrl: settings.baseUrl,
        model: settings.model,
        apiKeyConfigured: Boolean(settings.apiKey)
    };
}

function createAiSettingsStorage(baseDir) {
    if (typeof baseDir !== 'string' || !baseDir.trim()) {
        throw new TypeError('AI 设置存储目录不能为空');
    }

    const settingsDir = path.resolve(baseDir);
    const settingsFile = path.join(settingsDir, AI_SETTINGS_FILENAME);
    let writeQueue = Promise.resolve();

    async function writeFile(settings, flag) {
        const options = flag
            ? {encoding: 'utf8', flag, mode: 0o600}
            : {encoding: 'utf8', mode: 0o600};
        const content = `${JSON.stringify(settings, null, 2)}\n`;
        if (flag) {
            await fs.writeFile(settingsFile, content, options);
            return;
        }

        const temporaryFile = `${settingsFile}.${process.pid}.${Date.now()}.tmp`;
        try {
            await fs.writeFile(temporaryFile, content, options);
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
                throw aiSettingsError('无法访问 AI 设置目录，请检查当前用户权限。', 'AI_SETTINGS_UNWRITABLE', error);
            }
            try {
                await writeFile(DEFAULT_AI_SETTINGS, 'wx');
            } catch (writeError) {
                if (writeError.code !== 'EEXIST') {
                    throw aiSettingsError('无法创建 ai-settings.json，请检查磁盘空间和目录权限。', 'AI_SETTINGS_UNWRITABLE', writeError);
                }
            }
        }
    }

    async function readSecret() {
        await ensureStorage();
        let content;
        try {
            content = await fs.readFile(settingsFile, 'utf8');
        } catch (error) {
            throw aiSettingsError('读取 AI 设置失败，请检查文件权限。', 'AI_SETTINGS_READ_FAILED', error);
        }
        try {
            return normalizeStoredSettings(JSON.parse(content));
        } catch (error) {
            if (error.code) throw error;
            throw aiSettingsError('ai-settings.json 已损坏，请修复或重新配置 AI。', 'AI_SETTINGS_CORRUPT', error);
        }
    }

    async function readPublic() {
        return toPublicSettings(await readSecret());
    }

    async function save(changes) {
        if (!changes || Array.isArray(changes) || typeof changes !== 'object') {
            throw aiSettingsError('AI 设置内容必须是对象。', 'AI_SETTINGS_INVALID', null, 400);
        }

        const operation = async () => {
            const current = await readSecret();
            const next = {...current};
            if (changes.enabled !== undefined) next.enabled = changes.enabled;
            if (changes.baseUrl !== undefined) next.baseUrl = changes.baseUrl;
            if (changes.model !== undefined) next.model = changes.model;
            if (changes.clearApiKey === true) next.apiKey = '';
            if (typeof changes.apiKey === 'string' && changes.apiKey.trim()) next.apiKey = changes.apiKey;

            let normalized;
            try {
                normalized = normalizeStoredSettings(next);
            } catch (error) {
                if (error.code === 'AI_SETTINGS_CORRUPT') {
                    error.code = 'AI_SETTINGS_INVALID';
                    error.statusCode = 400;
                }
                throw error;
            }

            try {
                await writeFile(normalized);
            } catch (error) {
                throw aiSettingsError('保存 AI 设置失败，请检查磁盘空间和目录权限。', 'AI_SETTINGS_WRITE_FAILED', error);
            }
            return toPublicSettings(normalized);
        };

        writeQueue = writeQueue.catch(() => undefined).then(operation);
        return writeQueue;
    }

    return {
        settingsDir,
        settingsFile,
        ensureStorage,
        readSecret,
        readPublic,
        save
    };
}

module.exports = {
    AI_SETTINGS_FILENAME,
    DEFAULT_AI_SETTINGS,
    createAiSettingsStorage,
    normalizeStoredSettings,
    toPublicSettings
};
