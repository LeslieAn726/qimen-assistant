'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function dailyStorageError(message, code, cause) {
    const error = new Error(message, cause ? {cause} : undefined);
    error.code = code;
    error.statusCode = 500;
    return error;
}

function createDailyStorage(baseDir) {
    if (typeof baseDir !== 'string' || !baseDir.trim()) {
        throw new TypeError('每日记录存储目录不能为空');
    }

    const dataDir = path.resolve(baseDir);
    const recordsFile = path.join(dataDir, 'daily-records.json');
    let writeQueue = Promise.resolve();

    async function ensureStorage() {
        try {
            await fs.mkdir(dataDir, {recursive: true});
        } catch (error) {
            throw dailyStorageError('无法创建每日记录目录，请检查当前用户的目录写入权限。', 'DAILY_STORAGE_UNWRITABLE', error);
        }

        try {
            await fs.access(recordsFile);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw dailyStorageError('无法访问 daily-records.json，请检查文件权限。', 'DAILY_STORAGE_UNWRITABLE', error);
            }

            try {
                await fs.writeFile(recordsFile, '{}\n', {
                    encoding: 'utf8',
                    flag: 'wx'
                });
            } catch (writeError) {
                if (writeError.code !== 'EEXIST') {
                    throw dailyStorageError('无法创建 daily-records.json，请检查磁盘空间和目录权限。', 'DAILY_STORAGE_UNWRITABLE', writeError);
                }
            }
        }
    }

    async function readAll() {
        await ensureStorage();
        let content;
        try {
            content = await fs.readFile(recordsFile, 'utf8');
        } catch (error) {
            throw dailyStorageError('读取 daily-records.json 失败，请检查文件权限。', 'DAILY_STORAGE_READ_FAILED', error);
        }

        let records;
        try {
            records = JSON.parse(content);
        } catch (error) {
            throw dailyStorageError(
                `每日记录文件不是有效 JSON：${error.message}。请从设置页的备份中恢复。`,
                'DAILY_STORAGE_CORRUPT',
                error
            );
        }

        if (!records || Array.isArray(records) || typeof records !== 'object') {
            throw dailyStorageError(
                '每日记录文件的根节点必须是对象。请从设置页的备份中恢复。',
                'DAILY_STORAGE_CORRUPT'
            );
        }

        return records;
    }

    async function writeAll(records) {
        await ensureStorage();
        const temporaryFile = `${recordsFile}.${process.pid}.tmp`;
        const content = `${JSON.stringify(records, null, 2)}\n`;

        try {
            await fs.writeFile(temporaryFile, content, 'utf8');
            await fs.rename(temporaryFile, recordsFile);
        } catch (error) {
            await fs.rm(temporaryFile, {force: true}).catch(() => undefined);
            throw dailyStorageError(
                '保存 daily-records.json 失败，请检查磁盘空间和目录权限。原记录文件未被主动删除。',
                'DAILY_STORAGE_WRITE_FAILED',
                error
            );
        }
    }

    async function getRecord(date) {
        const records = await readAll();
        return records[date] || null;
    }

    async function saveRecord(date, record) {
        const operation = async () => {
            const records = await readAll();
            records[date] = record;
            await writeAll(records);
            return record;
        };

        writeQueue = writeQueue.catch(() => undefined).then(operation);
        return writeQueue;
    }

    return {
        dataDir,
        recordsFile,
        ensureStorage,
        readAll,
        writeAll,
        getRecord,
        saveRecord
    };
}

module.exports = {
    createDailyStorage
};
