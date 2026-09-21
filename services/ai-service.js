'use strict';

const {DISCLAIMER, buildDailyAdvicePrompt} = require('../ai/prompt-builder');
const {createOpenAICompatibleProvider} = require('../ai/providers/openai-compatible');

const OUTPUT_FIELDS = ['summary', 'priority', 'timingAdvice', 'riskNotes', 'planSuggestion', 'disclaimer'];

function aiError(message, code, statusCode = 400, cause) {
    const error = new Error(message, cause ? {cause} : undefined);
    error.code = code;
    error.statusCode = statusCode;
    return error;
}

function parseAdviceOutput(content) {
    let output;
    try {
        output = JSON.parse(content);
    } catch (error) {
        throw aiError('AI 返回内容不是有效 JSON，请重新生成。', 'AI_RESPONSE_INVALID_JSON', 502, error);
    }

    if (!output || Array.isArray(output) || typeof output !== 'object') {
        throw aiError('AI 返回的 JSON 结构无效，请重新生成。', 'AI_RESPONSE_FIELDS_MISSING', 502);
    }
    const missing = OUTPUT_FIELDS.filter((field) => !(field in output));
    const scalarValid = ['summary', 'timingAdvice', 'planSuggestion', 'disclaimer']
        .every((field) => typeof output[field] === 'string' && output[field].trim());
    const priorityValid = Array.isArray(output.priority)
        && output.priority.length === 3
        && output.priority.every((item) => typeof item === 'string' && item.trim());
    const risksValid = Array.isArray(output.riskNotes)
        && output.riskNotes.length > 0
        && output.riskNotes.every((item) => typeof item === 'string' && item.trim());

    if (missing.length || !scalarValid || !priorityValid || !risksValid || output.disclaimer !== DISCLAIMER) {
        throw aiError('AI 返回的 JSON 字段缺失或格式不符合要求，请重新生成。', 'AI_RESPONSE_FIELDS_MISSING', 502);
    }

    return {
        summary: output.summary.trim(),
        priority: output.priority.map((item) => item.trim()),
        timingAdvice: output.timingAdvice.trim(),
        riskNotes: output.riskNotes.map((item) => item.trim()),
        planSuggestion: output.planSuggestion.trim(),
        disclaimer: DISCLAIMER
    };
}

function assertReady(settings) {
    if (!settings.enabled) throw aiError('AI 今日助手尚未启用，请先前往设置页启用。', 'AI_DISABLED');
    if (!settings.apiKey) throw aiError('尚未配置 AI API Key，请先前往设置页配置。', 'AI_API_KEY_MISSING');
    if (!settings.baseUrl) throw aiError('尚未配置 AI Base URL，请先前往设置页配置。', 'AI_BASE_URL_MISSING');
    if (!settings.model) throw aiError('尚未配置 AI Model，请先前往设置页配置。', 'AI_MODEL_MISSING');
}

function createAiService({
    dailyService,
    aiSettingsStorage,
    aiResultStorage,
    provider = createOpenAICompatibleProvider(),
    now = () => new Date()
}) {
    if (!dailyService || typeof dailyService.getTodayPageData !== 'function') throw new TypeError('dailyService 无效');
    if (!aiSettingsStorage || typeof aiSettingsStorage.readSecret !== 'function') throw new TypeError('aiSettingsStorage 无效');
    if (!aiResultStorage || typeof aiResultStorage.save !== 'function') throw new TypeError('aiResultStorage 无效');

    async function generateDailyAdvice({cookieHeader, dateKey} = {}) {
        const settings = await aiSettingsStorage.readSecret();
        assertReady(settings);
        const page = await dailyService.getTodayPageData({cookieHeader, dateKey});
        const prompt = buildDailyAdvicePrompt(page);
        const content = await provider.generate({
            baseUrl: settings.baseUrl,
            model: settings.model,
            apiKey: settings.apiKey,
            messages: prompt.messages
        });
        const output = parseAdviceOutput(content);
        const result = {
            date: page.date,
            generatedAt: now().toISOString(),
            provider: provider.name || 'openai-compatible',
            model: settings.model,
            promptVersion: prompt.promptVersion,
            inputHash: prompt.inputHash,
            output
        };
        await aiResultStorage.save(page.date, result);
        return {...result, stale: false};
    }

    async function getAdviceForPage(page) {
        const existing = await aiResultStorage.get(page.date);
        if (!existing) return null;
        const current = buildDailyAdvicePrompt(page);
        return {...existing, stale: existing.inputHash !== current.inputHash};
    }

    return {generateDailyAdvice, getAdviceForPage, parseAdviceOutput};
}

module.exports = {OUTPUT_FIELDS, createAiService, parseAdviceOutput};
