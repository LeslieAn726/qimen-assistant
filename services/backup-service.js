'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const BACKUP_NAME_RE = /^backup-\d{4}-\d{2}-\d{2}-\d{6}(?:-\d{3})?$/;

function pad(value, length = 2) {
    return String(value).padStart(length, '0');
}

function backupBaseName(date) {
    return [
        'backup',
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('-') + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function parseObjectJson(content, label) {
    let value;
    try {
        value = JSON.parse(content);
    } catch (error) {
        const wrapped = new Error(`${label} 已损坏，不是有效 JSON。`);
        wrapped.code = 'BACKUP_CORRUPT';
        wrapped.statusCode = 400;
        wrapped.cause = error;
        throw wrapped;
    }

    if (!value || Array.isArray(value) || typeof value !== 'object') {
        const error = new Error(`${label} 的根节点必须是对象。`);
        error.code = 'BACKUP_CORRUPT';
        error.statusCode = 400;
        throw error;
    }
    return value;
}

function wrapOperationError(prefix, code, error) {
    if (error && error.code === 'BACKUP_CORRUPT') return error;
    const wrapped = new Error(`${prefix}：${error && error.message ? error.message : String(error)}`);
    wrapped.code = code;
    wrapped.statusCode = 500;
    wrapped.cause = error;
    return wrapped;
}

function createBackupService({dailyStorage, settingsStorage, backupsDir, now = () => new Date()}) {
    if (!dailyStorage || typeof dailyStorage.readAll !== 'function' || typeof dailyStorage.writeAll !== 'function') {
        throw new TypeError('dailyStorage 必须是有效的每日记录存储实例');
    }
    if (!settingsStorage || typeof settingsStorage.read !== 'function' || typeof settingsStorage.replace !== 'function') {
        throw new TypeError('settingsStorage 必须是有效的设置存储实例');
    }
    if (typeof backupsDir !== 'string' || !backupsDir.trim()) {
        throw new TypeError('备份目录不能为空');
    }

    const resolvedBackupsDir = path.resolve(backupsDir);
    let operationQueue = Promise.resolve();

    async function allocateBackupDirectory() {
        await fs.mkdir(resolvedBackupsDir, {recursive: true});
        const baseName = backupBaseName(now());

        for (let index = 0; index < 1000; index++) {
            const name = index === 0 ? baseName : `${baseName}-${pad(index, 3)}`;
            const backupDir = path.join(resolvedBackupsDir, name);
            try {
                await fs.mkdir(backupDir);
                return {name, backupDir};
            } catch (error) {
                if (error.code !== 'EEXIST') throw error;
            }
        }

        throw new Error('同一秒内创建的备份数量过多。');
    }

    async function createBackupInternal({validateSources = true} = {}) {
        let allocated;
        try {
            await dailyStorage.ensureStorage();
            await settingsStorage.ensureStorage();
            // 手动备份只接受有效数据；恢复前安全备份则原样保留当前文件，
            // 即使当前文件已损坏，也不能阻止用户从一个有效备份恢复。
            if (validateSources) {
                await dailyStorage.readAll();
                await settingsStorage.read();
            }
            allocated = await allocateBackupDirectory();
            await Promise.all([
                fs.copyFile(dailyStorage.recordsFile, path.join(allocated.backupDir, 'daily-records.json')),
                fs.copyFile(settingsStorage.settingsFile, path.join(allocated.backupDir, 'settings.json'))
            ]);
            return allocated;
        } catch (error) {
            if (allocated) {
                await fs.rm(allocated.backupDir, {recursive: true, force: true}).catch(() => undefined);
            }
            throw wrapOperationError('创建备份失败', 'BACKUP_CREATE_FAILED', error);
        }
    }

    async function createBackup() {
        const operation = () => createBackupInternal();
        operationQueue = operationQueue.catch(() => undefined).then(operation);
        return operationQueue;
    }

    async function listBackups() {
        try {
            await fs.mkdir(resolvedBackupsDir, {recursive: true});
            const entries = await fs.readdir(resolvedBackupsDir, {withFileTypes: true});
            const results = [];
            for (const entry of entries) {
                if (!entry.isDirectory() || !BACKUP_NAME_RE.test(entry.name)) continue;
                const backupDir = path.join(resolvedBackupsDir, entry.name);
                const [recordsExists, settingsExists, stats] = await Promise.all([
                    fs.access(path.join(backupDir, 'daily-records.json')).then(() => true, () => false),
                    fs.access(path.join(backupDir, 'settings.json')).then(() => true, () => false),
                    fs.stat(backupDir)
                ]);
                results.push({
                    name: entry.name,
                    createdAt: stats.birthtime.toISOString(),
                    complete: recordsExists && settingsExists
                });
            }
            return results.sort((left, right) => right.name.localeCompare(left.name));
        } catch (error) {
            throw wrapOperationError('读取备份列表失败', 'BACKUP_LIST_FAILED', error);
        }
    }

    async function readBackup(name) {
        if (typeof name !== 'string' || !BACKUP_NAME_RE.test(name) || path.basename(name) !== name) {
            const error = new Error('备份名称无效。');
            error.code = 'BACKUP_NAME_INVALID';
            error.statusCode = 400;
            throw error;
        }

        const backupDir = path.join(resolvedBackupsDir, name);
        try {
            const [recordsContent, settingsContent] = await Promise.all([
                fs.readFile(path.join(backupDir, 'daily-records.json'), 'utf8'),
                fs.readFile(path.join(backupDir, 'settings.json'), 'utf8')
            ]);
            const records = parseObjectJson(recordsContent, '备份中的 daily-records.json');
            const settings = settingsStorage.normalize(
                parseObjectJson(settingsContent, '备份中的 settings.json'),
                {strict: true}
            );
            return {records, settings};
        } catch (error) {
            if (error.code === 'ENOENT') {
                const missing = new Error('所选备份不存在或文件不完整。');
                missing.code = 'BACKUP_NOT_FOUND';
                missing.statusCode = 404;
                throw missing;
            }
            throw error;
        }
    }

    async function restoreBackupInternal(name) {
        let target;
        try {
            target = await readBackup(name);
        } catch (error) {
            throw wrapOperationError('恢复失败', 'BACKUP_RESTORE_FAILED', error);
        }

        // 目标完整校验通过后，先保存当前状态，再开始覆盖。
        let safetyBackup;
        try {
            safetyBackup = await createBackupInternal({validateSources: false});
            await dailyStorage.writeAll(target.records);
            await settingsStorage.replace(target.settings);
            return {restoredFrom: name, safetyBackup: safetyBackup.name};
        } catch (error) {
            if (safetyBackup) {
                try {
                    const rollback = await readBackup(safetyBackup.name);
                    await dailyStorage.writeAll(rollback.records);
                    await settingsStorage.replace(rollback.settings);
                } catch (rollbackError) {
                    const fatal = new Error(`恢复失败，且自动回滚也失败。当前数据仍保存在 ${safetyBackup.name} 中。`);
                    fatal.code = 'BACKUP_ROLLBACK_FAILED';
                    fatal.statusCode = 500;
                    fatal.cause = rollbackError;
                    throw fatal;
                }
            }
            throw wrapOperationError('恢复失败，当前数据已自动回滚', 'BACKUP_RESTORE_FAILED', error);
        }
    }

    async function restoreBackup(name) {
        const operation = () => restoreBackupInternal(name);
        operationQueue = operationQueue.catch(() => undefined).then(operation);
        return operationQueue;
    }

    return {
        backupsDir: resolvedBackupsDir,
        createBackup,
        listBackups,
        restoreBackup
    };
}

module.exports = {
    BACKUP_NAME_RE,
    backupBaseName,
    createBackupService
};
