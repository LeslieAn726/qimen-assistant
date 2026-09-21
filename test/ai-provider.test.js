'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');

const {createOpenAICompatibleProvider, endpointFor} = require('../ai/providers/openai-compatible');

function response(status, body, ok = status >= 200 && status < 300) {
    return {status, ok, json: async () => body};
}

const request = {
    baseUrl: 'https://provider.example/v1/',
    model: 'model-a',
    apiKey: 'private-key',
    messages: [{role: 'user', content: 'hello'}]
};

test('Provider 使用兼容的 chat/completions 路径且不在结果中返回 Key', async () => {
    let captured;
    const provider = createOpenAICompatibleProvider({
        fetchImpl: async (url, options) => {
            captured = {url, options};
            return response(200, {choices: [{message: {content: '{"ok":true}'}}]});
        }
    });
    assert.equal(await provider.generate(request), '{"ok":true}');
    assert.equal(captured.url, 'https://provider.example/v1/chat/completions');
    assert.equal(captured.options.headers.Authorization, 'Bearer private-key');
    assert.equal(endpointFor('http://localhost:11434/v1/chat/completions'), 'http://localhost:11434/v1/chat/completions');
});

test('D. 401/403 映射为认证失败且错误不包含 Key', async () => {
    for (const status of [401, 403]) {
        const provider = createOpenAICompatibleProvider({fetchImpl: async () => response(status, {error: {message: 'denied'}})});
        await assert.rejects(provider.generate(request), (error) => {
            assert.equal(error.code, 'AI_AUTH_FAILED');
            assert.doesNotMatch(error.message, /private-key/);
            return true;
        });
    }
});

test('E. 429 映射为频率或额度提示', async () => {
    const provider = createOpenAICompatibleProvider({fetchImpl: async () => response(429, {})});
    await assert.rejects(provider.generate(request), (error) => error.code === 'AI_RATE_LIMITED');
});

test('F. 超时会中止请求并返回中文提示', async () => {
    const fetchImpl = (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
        });
    });
    const provider = createOpenAICompatibleProvider({fetchImpl, timeoutMs: 10});
    await assert.rejects(provider.generate(request), (error) => error.code === 'AI_TIMEOUT' && /超时/.test(error.message));
});

test('网络不可达、模型不存在和空内容分别给出明确错误', async () => {
    const offline = createOpenAICompatibleProvider({fetchImpl: async () => { throw new TypeError('offline'); }});
    await assert.rejects(offline.generate(request), (error) => error.code === 'AI_NETWORK_UNREACHABLE');

    const missing = createOpenAICompatibleProvider({fetchImpl: async () => response(404, {error: {message: 'model not found'}})});
    await assert.rejects(missing.generate(request), (error) => error.code === 'AI_MODEL_NOT_FOUND');

    const empty = createOpenAICompatibleProvider({fetchImpl: async () => response(200, {choices: [{message: {content: ''}}]})});
    await assert.rejects(empty.generate(request), (error) => error.code === 'AI_RESPONSE_EMPTY');
});
