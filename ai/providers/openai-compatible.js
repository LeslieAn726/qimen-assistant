'use strict';

function providerError(message, code, statusCode = 502, cause) {
    const error = new Error(message, cause ? {cause} : undefined);
    error.code = code;
    error.statusCode = statusCode;
    return error;
}

function endpointFor(baseUrl) {
    const normalized = baseUrl.replace(/\/+$/, '');
    return normalized.endsWith('/chat/completions')
        ? normalized
        : `${normalized}/chat/completions`;
}

function looksLikeMissingModel(body) {
    const error = body && body.error;
    const values = error && [error.code, error.type, error.message]
        .filter((value) => typeof value === 'string')
        .join(' ')
        .toLowerCase();
    return Boolean(values && /(model.*not.*found|unknown.*model|invalid.*model|model_not_found)/.test(values));
}

function createOpenAICompatibleProvider({fetchImpl = globalThis.fetch, timeoutMs = 30000} = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('当前运行环境不支持 fetch');

    async function generate({baseUrl, model, apiKey, messages}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetchImpl(endpointFor(baseUrl), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({model, messages, temperature: 0.3}),
                signal: controller.signal
            });
        } catch (error) {
            if (error && (error.name === 'AbortError' || controller.signal.aborted)) {
                throw providerError('AI 请求超时，请稍后重试或检查 Base URL。', 'AI_TIMEOUT', 504);
            }
            throw providerError('无法连接 AI 服务，请检查网络和 Base URL。', 'AI_NETWORK_UNREACHABLE', 502);
        } finally {
            clearTimeout(timer);
        }

        let body = null;
        try {
            body = await response.json();
        } catch (error) {
            if (response.ok) {
                throw providerError('AI 服务返回了无法识别的数据。', 'AI_PROVIDER_INVALID_RESPONSE');
            }
        }

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw providerError('AI 服务认证失败，请检查 API Key 和访问权限。', 'AI_AUTH_FAILED', response.status);
            }
            if (response.status === 429) {
                throw providerError('AI 服务请求过于频繁或额度不足，请稍后重试。', 'AI_RATE_LIMITED', 429);
            }
            if (response.status === 404 || looksLikeMissingModel(body)) {
                throw providerError('AI 模型不存在或接口地址不正确，请检查 Model 和 Base URL。', 'AI_MODEL_NOT_FOUND', 400);
            }
            throw providerError(`AI 服务请求失败（HTTP ${response.status}）。`, 'AI_PROVIDER_HTTP_ERROR', 502);
        }

        const content = body && body.choices && body.choices[0]
            && body.choices[0].message && body.choices[0].message.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw providerError('AI 服务返回了空内容，请重新生成。', 'AI_RESPONSE_EMPTY');
        }
        return content.trim();
    }

    return {name: 'openai-compatible', generate};
}

module.exports = {createOpenAICompatibleProvider, endpointFor};
