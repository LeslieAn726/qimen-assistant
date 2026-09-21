'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {createDailyStorage} = require('../storage/daily-storage');
const {DEFAULT_SETTINGS, createSettingsStorage} = require('../storage/settings-storage');
const {createBackupService} = require('../services/backup-service');

async function createFixture(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'qimen-v14-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const dailyStorage = createDailyStorage(path.join(root, 'data'));
    const settingsStorage = createSettingsStorage(root);
    const fixedNow = new Date(2026, 8, 12, 18, 30, 0);
    const backupService = createBackupService({
        dailyStorage,
        settingsStorage,
        backupsDir: path.join(root, 'backups'),
        now: () => fixedNow
    });
    return {root, dailyStorage, settingsStorage, backupService};
}

test('C. settings.json 首次自动创建并使用安全默认值', async (t) => {
    const {root, settingsStorage} = await createFixture(t);

    await settingsStorage.ensureStorage();

    assert.deepEqual(await settingsStorage.read(), DEFAULT_SETTINGS);
    assert.deepEqual(
        JSON.parse(await fs.readFile(path.join(root, 'settings.json'), 'utf8')),
        DEFAULT_SETTINGS
    );
});

test('D. 设置保存后由新存储实例读取仍然保留', async (t) => {
    const {root, settingsStorage} = await createFixture(t);
    await settingsStorage.save({
        startupPage: 'history',
        dailyReferenceTime: '08:45',
        showRuleAnalysis: false,
        showGongDetails: false
    });

    const reopened = createSettingsStorage(root);
    assert.deepEqual(await reopened.read(), {
        startupPage: 'history',
        dailyReferenceTime: '08:45',
        showRuleAnalysis: false,
        showGongDetails: false
    });
});

test('设置存储拒绝非法时间、启动页和损坏 JSON', async (t) => {
    const {root, settingsStorage} = await createFixture(t);
    await assert.rejects(
        settingsStorage.save({dailyReferenceTime: '25:99'}),
        /HH:mm/
    );
    await assert.rejects(
        settingsStorage.save({startupPage: 'external'}),
        /启动页面设置无效/
    );

    await fs.writeFile(path.join(root, 'settings.json'), '{broken', 'utf8');
    await assert.rejects(settingsStorage.read(), /settings.json 已损坏/);
});

test('E. 立即备份复制两份数据且同名时间不覆盖旧备份', async (t) => {
    const {dailyStorage, settingsStorage, backupService} = await createFixture(t);
    await dailyStorage.saveRecord('2026-09-12', {date: '2026-09-12', plan: '原计划'});
    await settingsStorage.save({dailyReferenceTime: '08:30'});

    const first = await backupService.createBackup();
    const second = await backupService.createBackup();

    assert.equal(first.name, 'backup-2026-09-12-183000');
    assert.equal(second.name, 'backup-2026-09-12-183000-001');
    assert.equal(
        JSON.parse(await fs.readFile(path.join(first.backupDir, 'daily-records.json'), 'utf8'))['2026-09-12'].plan,
        '原计划'
    );
    assert.equal(
        JSON.parse(await fs.readFile(path.join(first.backupDir, 'settings.json'), 'utf8')).dailyReferenceTime,
        '08:30'
    );
    assert.equal((await backupService.listBackups()).length, 2);
});

test('F/G/H. 恢复成功、恢复前自动备份，且每日记录 JSON 保持有效', async (t) => {
    const {dailyStorage, settingsStorage, backupService} = await createFixture(t);
    await dailyStorage.saveRecord('2026-09-12', {date: '2026-09-12', plan: '待恢复版本'});
    await settingsStorage.save({startupPage: 'today', showRuleAnalysis: true});
    const target = await backupService.createBackup();

    await dailyStorage.saveRecord('2026-09-12', {date: '2026-09-12', plan: '当前版本'});
    await settingsStorage.save({startupPage: 'history', showRuleAnalysis: false});

    const result = await backupService.restoreBackup(target.name);

    assert.equal(result.restoredFrom, target.name);
    assert.notEqual(result.safetyBackup, target.name);
    assert.equal((await dailyStorage.readAll())['2026-09-12'].plan, '待恢复版本');
    assert.equal((await settingsStorage.read()).startupPage, 'today');
    assert.equal((await settingsStorage.read()).showRuleAnalysis, true);
    assert.equal((await backupService.listBackups()).length, 2);
    assert.doesNotThrow(() => JSON.parse(require('node:fs').readFileSync(dailyStorage.recordsFile, 'utf8')));

    const safetyRecords = JSON.parse(
        await fs.readFile(path.join(backupService.backupsDir, result.safetyBackup, 'daily-records.json'), 'utf8')
    );
    assert.equal(safetyRecords['2026-09-12'].plan, '当前版本');
});

test('损坏的恢复源给出明确错误，且不会覆盖当前数据', async (t) => {
    const {dailyStorage, settingsStorage, backupService} = await createFixture(t);
    await dailyStorage.saveRecord('2026-09-12', {date: '2026-09-12', plan: '安全数据'});
    await settingsStorage.ensureStorage();
    const backup = await backupService.createBackup();
    await fs.writeFile(path.join(backup.backupDir, 'daily-records.json'), '{broken', 'utf8');

    await assert.rejects(backupService.restoreBackup(backup.name), /已损坏/);
    assert.equal((await dailyStorage.readAll())['2026-09-12'].plan, '安全数据');
    assert.equal((await backupService.listBackups()).length, 1);
});

test('损坏的当前 JSON 不能手动备份，但可从有效备份恢复并保留灾难副本', async (t) => {
    const {root, dailyStorage, settingsStorage, backupService} = await createFixture(t);
    await dailyStorage.saveRecord('2026-09-12', {date: '2026-09-12', plan: '有效备份数据'});
    await settingsStorage.save({startupPage: 'history', dailyReferenceTime: '07:40'});
    const validBackup = await backupService.createBackup();

    const brokenDaily = '{broken-current-daily';
    const brokenSettings = '{broken-current-settings';
    await fs.writeFile(dailyStorage.recordsFile, brokenDaily, 'utf8');
    await fs.writeFile(settingsStorage.settingsFile, brokenSettings, 'utf8');

    await assert.rejects(backupService.createBackup(), /创建备份失败.*有效 JSON/);
    assert.equal((await backupService.listBackups()).length, 1);

    const restored = await backupService.restoreBackup(validBackup.name);

    assert.equal((await dailyStorage.readAll())['2026-09-12'].plan, '有效备份数据');
    assert.equal((await settingsStorage.read()).startupPage, 'history');
    assert.notEqual(restored.safetyBackup, validBackup.name);
    assert.equal(
        await fs.readFile(path.join(root, 'backups', restored.safetyBackup, 'daily-records.json'), 'utf8'),
        brokenDaily
    );
    assert.equal(
        await fs.readFile(path.join(root, 'backups', restored.safetyBackup, 'settings.json'), 'utf8'),
        brokenSettings
    );
    assert.equal((await backupService.listBackups()).length, 2);
});
