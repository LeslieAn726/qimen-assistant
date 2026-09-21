'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const app = require('../app');

function request(server, pathname, options = {}) {
    return new Promise((resolve, reject) => {
        const body = options.body === undefined ? null : JSON.stringify(options.body);
        const req = http.request({
            host: '127.0.0.1',
            port: server.address().port,
            path: pathname,
            method: options.method || 'GET',
            headers: body ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            } : undefined
        }, (res) => {
            let responseBody = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => (responseBody += chunk));
            res.on('end', () => resolve({
                statusCode: res.statusCode,
                body: responseBody,
                json: () => JSON.parse(responseBody)
            }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function fixture(t, storageOptions = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'qimen-v14-routes-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    app.configureDailyStorage(path.join(root, 'data'), 'desktop-userData', {
        settingsDir: root,
        backupsDir: path.join(root, 'backups'),
        ...storageOptions
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return {root, server};
}

test('I. /today /history /settings /about 与设置 API 正常', async (t) => {
    const {root, server} = await fixture(t);

    for (const pathname of ['/today', '/history', '/settings', '/about']) {
        const response = await request(server, pathname);
        assert.equal(response.statusCode, 200, pathname);
        assert.match(response.body, /每日奇门助手/);
    }

    const settingsPage = await request(server, '/settings');
    assert.match(settingsPage.body, /2\.6\.0-beta/);
    assert.match(settingsPage.body, /桌面版用户数据目录/);
    assert.doesNotMatch(settingsPage.body, /桌面宠物|桌宠|小狐仙/);
    assert.equal((await request(server, '/api/pet/settings')).statusCode, 404);
    assert.match((await request(server, '/about')).body, /qfdk\/qimen/);
    assert.match((await request(server, '/about')).body, /MIT License/);
    assert.doesNotReject(fs.access(path.join(root, 'settings.json')));

    const saved = await request(server, '/api/settings', {
        method: 'POST',
        body: {
            startupPage: 'history',
            dailyReferenceTime: '07:30',
            showRuleAnalysis: false,
            showGongDetails: false
        }
    });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().startupPage, 'history');

    const today = await request(server, '/today');
    assert.equal(today.statusCode, 200);
    assert.doesNotMatch(today.body, /id="ruleAnalysisPanel"/);
    assert.doesNotMatch(today.body, /id="gongDetailsPanel"/);
});

test('E/F/G/H. 备份与恢复 API 保存两类数据并生成恢复前备份', async (t) => {
    const {root, server} = await fixture(t);
    const date = '2026-09-12';
    const originalRecord = {
        panTime: `${date}T09:00:00`,
        plan: '备份版本',
        important: '',
        result: '',
        review: ''
    };
    assert.equal((await request(server, `/api/daily-records/${date}`, {method: 'POST', body: originalRecord})).statusCode, 200);
    assert.equal((await request(server, '/api/settings', {
        method: 'POST',
        body: {startupPage: 'today', dailyReferenceTime: '09:15'}
    })).statusCode, 200);

    const created = (await request(server, '/api/backups', {method: 'POST'})).json();
    assert.match(created.name, /^backup-/);

    await request(server, `/api/daily-records/${date}`, {
        method: 'POST',
        body: {...originalRecord, plan: '恢复前当前版本'}
    });
    await request(server, '/api/settings', {
        method: 'POST',
        body: {startupPage: 'history', dailyReferenceTime: '18:00'}
    });

    const restored = await request(server, `/api/backups/${encodeURIComponent(created.name)}/restore`, {method: 'POST'});
    assert.equal(restored.statusCode, 200);
    assert.notEqual(restored.json().safetyBackup, created.name);
    assert.equal((await request(server, `/api/daily-records/${date}`)).json().plan, '备份版本');
    assert.equal((await request(server, '/api/settings')).json().dailyReferenceTime, '09:15');
    assert.equal((await request(server, '/api/backups')).json().length, 2);

    const records = JSON.parse(await fs.readFile(path.join(root, 'data', 'daily-records.json'), 'utf8'));
    assert.equal(records[date].plan, '备份版本');
});

test('损坏的每日记录文件在页面中显示可理解提示', async (t) => {
    const {root, server} = await fixture(t);
    await fs.mkdir(path.join(root, 'data'), {recursive: true});
    await fs.writeFile(path.join(root, 'data', 'daily-records.json'), '{broken', 'utf8');

    const response = await request(server, '/history');

    assert.equal(response.statusCode, 500);
    assert.match(response.body, /每日记录文件不是有效 JSON/);
    assert.match(response.body, /前往设置与备份/);
});

test('settings.json 损坏时设置页仍可打开并执行有效备份恢复', async (t) => {
    const {root, server} = await fixture(t);
    await request(server, '/api/settings', {
        method: 'POST',
        body: {startupPage: 'history', dailyReferenceTime: '06:50'}
    });
    const validBackup = (await request(server, '/api/backups', {method: 'POST'})).json();
    await fs.writeFile(path.join(root, 'settings.json'), '{broken-settings', 'utf8');

    const settingsPage = await request(server, '/settings');
    assert.equal(settingsPage.statusCode, 200);
    assert.match(settingsPage.body, /设置文件需要恢复/);
    assert.match(settingsPage.body, new RegExp(validBackup.name));

    const restored = await request(
        server,
        `/api/backups/${encodeURIComponent(validBackup.name)}/restore`,
        {method: 'POST'}
    );
    assert.equal(restored.statusCode, 200);
    assert.equal((await request(server, '/api/settings')).json().dailyReferenceTime, '06:50');
    assert.equal(
        await fs.readFile(path.join(root, 'backups', restored.json().safetyBackup, 'settings.json'), 'utf8'),
        '{broken-settings'
    );
});
