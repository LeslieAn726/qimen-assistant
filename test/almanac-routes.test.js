'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const app = require('../app');

function request(server, pathname) {
    return new Promise((resolve, reject) => {
        const req = http.get({
            host: '127.0.0.1',
            port: server.address().port,
            path: pathname
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => resolve({statusCode: res.statusCode, body}));
        });
        req.on('error', reject);
    });
}

async function fixture(t, almanacService) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'qimen-v21-almanac-routes-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    app.configureDailyStorage(path.join(root, 'data'), 'desktop-userData', {
        settingsDir: root,
        backupsDir: path.join(root, 'backups'),
        aiSettingsDir: root,
        aiResultsDir: path.join(root, 'ai'),
        almanacService
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return server;
}

test('H/I. /today 将选定的历史日期传给黄历服务，不使用系统今天', async (t) => {
    let receivedDate;
    const server = await fixture(t, {
        getAlmanac(date) {
            receivedDate = date;
            return null;
        }
    });
    const response = await request(server, '/today?date=2024-02-10');
    assert.equal(response.statusCode, 200);
    assert.equal(receivedDate.getFullYear(), 2024);
    assert.equal(receivedDate.getMonth(), 1);
    assert.equal(receivedDate.getDate(), 10);
});

test('J. 黄历服务失败时 /today 和原奇门盘仍正常渲染', async (t) => {
    const server = await fixture(t, {
        getAlmanac() {
            throw new Error('本地黄历测试故障');
        }
    });
    const response = await request(server, '/today?date=2026-09-13');
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /当前奇门盘/);
    assert.match(response.body, /2026-09-13/);
    assert.match(response.body, /黄历暂时无法加载：本地黄历测试故障/);
});

test('G/H/I/K. 今日与历史日期显示对应黄历，AI 关闭不影响黄历', async (t) => {
    const server = await fixture(t);

    const today = await request(server, '/today?date=2026-09-13');
    assert.equal(today.statusCode, 200);
    assert.match(today.body, /id="almanacPanel"/);
    assert.match(today.body, /本地离线计算/);
    assert.match(today.body, /二〇二六年八月初三/);
    assert.match(today.body, /庚寅日/);
    assert.match(today.body, /AI 今日助手尚未启用|AI 今日助手/);

    const historyDate = await request(server, '/today?date=2024-02-10');
    assert.equal(historyDate.statusCode, 200);
    assert.match(historyDate.body, /二〇二四年正月初一/);
    assert.match(historyDate.body, /春节/);
    assert.doesNotMatch(historyDate.body, /二〇二六年八月初三/);
});
