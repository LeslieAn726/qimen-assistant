'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const AI_RESULTS_FILENAME = 'daily-ai.json';

function resultStorageError(message, code, cause) {
    const error = new Error(message, cause ? {cause} : undefined);
    error.code = code;
    error.statusCode = 500;
    return error;
}

function createAiResultStorage(baseDir) {
    if (typeof baseDir !== 'string' || !baseDir.trim()) {
        throw new TypeError('AI 结果存储目录不能为空');
    }

    const dataDir = path.resolve(baseDir);
    const resultsFile = path.join(dataDir, AI_RESULTS_FILENAME);
    let writeQueue = Promise.resolve();

    async function ensureStorage() {
        try {
            await fs.mkdir(dataDir, {recursive: true});
            await fs.access(resultsFile);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw resultStorageError('无法访问 AI 结果目录，请检查当前用户权限。', 'AI_RESULTS_UNWRITABLE', error);
            }
            try {
                await fs.writeFile(resultsFile, '{}\n', {encoding: 'utf8', flag: 'wx'});
            } catch (writeError) {
                if (writeError.code !== 'EEXIST') {
                    throw resultStorageError('无法创建 daily-ai.json，请检查磁盘空间和目录权限。', 'AI_RESULTS_UNWRITABLE', writeError);
                }
            }
        }
    }

    async function readAll() {
        await ensureStorage();
        let content;
        try {
            content = await fs.readFile(resultsFile, 'utf8');
        } catch (error) {
            throw resultStorageError('读取 AI 建议记录失败。', 'AI_RESULTS_READ_FAILED', error);
        }
        try {
            const records = JSON.parse(content);
            if (!records || Array.isArray(records) || typeof records !== 'object') throw new Error('root');
            return records;
        } catch (error) {
            throw resultStorageError('daily-ai.json 已损坏，无法读取 AI 建议。', 'AI_RESULTS_CORRUPT', error);
        }
    }

    async function writeAll(records) {
        await ensureStorage();
        const temporaryFile = `${resultsFile}.${process.pid}.${Date.now()}.tmp`;
        try {
            await fs.writeFile(temporaryFile, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
            await fs.rename(temporaryFile, resultsFile);
        } catch (error) {
            await fs.rm(temporaryFile, {force: true}).catch(() => undefined);
            throw resultStorageError('保存 AI 建议失败，请检查磁盘空间和目录权限。', 'AI_RESULTS_WRITE_FAILED', error);
        }
    }

    async function get(date) {
        return (await readAll())[date] || null;
    }

    async function save(date, result) {
        const operation = async () => {
            const records = await readAll();
            records[date] = result;
            await writeAll(records);
            return result;
        };
        writeQueue = writeQueue.catch(() => undefined).then(operation);
        return writeQueue;
    }

    return {dataDir, resultsFile, ensureStorage, readAll, writeAll, get, save};
}

module.exports = {AI_RESULTS_FILENAME, createAiResultStorage};
