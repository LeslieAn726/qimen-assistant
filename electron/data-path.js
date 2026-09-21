'use strict';

const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');

const RECORDS_FILENAME = 'daily-records.json';

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

function parseRecords(content, sourceName) {
    let records;
    try {
        records = JSON.parse(content);
    } catch (error) {
        throw new Error(`${sourceName} 不是有效 JSON，已停止迁移：${error.message}`);
    }

    if (!records || Array.isArray(records) || typeof records !== 'object') {
        throw new Error(`${sourceName} 的根节点必须是对象，已停止迁移`);
    }

    return records;
}

async function createEmptyRecordsFile(recordsFile) {
    try {
        await fs.writeFile(recordsFile, '{}\n', {
            encoding: 'utf8',
            flag: 'wx'
        });
        return true;
    } catch (error) {
        if (error.code === 'EEXIST') return false;
        throw error;
    }
}

async function prepareDesktopData({userDataDir, projectDataDir}) {
    if (typeof userDataDir !== 'string' || !userDataDir.trim()) {
        throw new TypeError('Electron userData 目录不能为空');
    }
    if (typeof projectDataDir !== 'string' || !projectDataDir.trim()) {
        throw new TypeError('项目 data 目录不能为空');
    }

    const dataDir = path.join(path.resolve(userDataDir), 'data');
    const recordsFile = path.join(dataDir, RECORDS_FILENAME);
    const sourceFile = path.join(path.resolve(projectDataDir), RECORDS_FILENAME);

    await fs.mkdir(dataDir, {recursive: true});

    if (await pathExists(recordsFile)) {
        return {
            dataDir,
            recordsFile,
            sourceFile,
            migrated: false,
            initialized: false,
            reason: 'destination-exists'
        };
    }

    if (await pathExists(sourceFile)) {
        const sourceContent = await fs.readFile(sourceFile, 'utf8');
        const sourceRecords = parseRecords(sourceContent, '项目每日记录文件');

        if (Object.keys(sourceRecords).length > 0) {
            try {
                await fs.copyFile(sourceFile, recordsFile, constants.COPYFILE_EXCL);
                return {
                    dataDir,
                    recordsFile,
                    sourceFile,
                    migrated: true,
                    initialized: false,
                    reason: 'history-migrated'
                };
            } catch (error) {
                if (error.code !== 'EEXIST') throw error;
                return {
                    dataDir,
                    recordsFile,
                    sourceFile,
                    migrated: false,
                    initialized: false,
                    reason: 'destination-created-concurrently'
                };
            }
        }
    }

    const initialized = await createEmptyRecordsFile(recordsFile);
    return {
        dataDir,
        recordsFile,
        sourceFile,
        migrated: false,
        initialized,
        reason: initialized ? 'empty-initialized' : 'destination-created-concurrently'
    };
}

module.exports = {
    RECORDS_FILENAME,
    prepareDesktopData
};
