'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const app = require('../app');
const {createDailyStorage} = require('../storage/daily-storage');
const {prepareDesktopData} = require('../electron/data-path');

function sampleRecord(date, overrides = {}) {
    return {
        date,
        timezone: 'Asia/Shanghai',
        panTime: `${date}T09:30:00`,
        plan: '测试计划',
        important: '测试事项',
        result: '',
        review: '',
        createdAt: '2026-09-12T00:00:00.000Z',
        updatedAt: '2026-09-12T00:00:00.000Z',
        ...overrides
    };
}

async function createTempRoot(t) {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qimen-v12-'));
    t.after(() => fs.rm(tempRoot, {recursive: true, force: true}));
    return tempRoot;
}

async function writeRecords(dataDir, records) {
    await fs.mkdir(dataDir, {recursive: true});
    const recordsFile = path.join(dataDir, 'daily-records.json');
    await fs.writeFile(recordsFile, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
    return recordsFile;
}

async function readRecords(dataDir) {
    const content = await fs.readFile(path.join(dataDir, 'daily-records.json'), 'utf8');
    return JSON.parse(content);
}

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

async function startServer(t) {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return server;
}

test('A. Web 模式默认使用项目 data 目录', () => {
    const config = app.getDailyStorageConfig();
    assert.equal(config.storageMode, 'project-data');
    assert.equal(config.dataDir, path.resolve(__dirname, '..', 'data'));
    assert.equal(config.recordsFile, path.resolve(__dirname, '..', 'data', 'daily-records.json'));
});

test('B. Desktop 模式可注入 Electron userData/data 目录', async (t) => {
    const tempRoot = await createTempRoot(t);
    const userDataDir = path.join(tempRoot, 'userData');
    const projectDataDir = path.join(tempRoot, 'project-data');
    const prepared = await prepareDesktopData({userDataDir, projectDataDir});

    assert.equal(prepared.dataDir, path.join(userDataDir, 'data'));
    const storage = app.configureDailyStorage(prepared.dataDir, 'desktop-userData');
    assert.equal(storage.dataDir, path.resolve(userDataDir, 'data'));
    assert.equal(app.getStorageMode(), 'desktop-userData');
});

test('C. userData 不存在时自动创建目录和空 JSON', async (t) => {
    const tempRoot = await createTempRoot(t);
    const prepared = await prepareDesktopData({
        userDataDir: path.join(tempRoot, 'missing-userData'),
        projectDataDir: path.join(tempRoot, 'missing-project-data')
    });

    assert.equal(prepared.initialized, true);
    assert.deepEqual(await readRecords(prepared.dataDir), {});
});

test('D/F. 首次迁移复制历史记录且保留项目原文件', async (t) => {
    const tempRoot = await createTempRoot(t);
    const projectDataDir = path.join(tempRoot, 'project-data');
    const userDataDir = path.join(tempRoot, 'userData');
    const sourceRecords = {'2026-09-10': sampleRecord('2026-09-10')};
    const sourceFile = await writeRecords(projectDataDir, sourceRecords);
    const sourceBefore = await fs.readFile(sourceFile, 'utf8');

    const prepared = await prepareDesktopData({userDataDir, projectDataDir});

    assert.equal(prepared.migrated, true);
    assert.deepEqual(await readRecords(prepared.dataDir), sourceRecords);
    assert.equal(await fs.readFile(sourceFile, 'utf8'), sourceBefore);
});

test('E. userData 已有数据时绝不覆盖', async (t) => {
    const tempRoot = await createTempRoot(t);
    const projectDataDir = path.join(tempRoot, 'project-data');
    const userDataDir = path.join(tempRoot, 'userData');
    const desktopDataDir = path.join(userDataDir, 'data');
    const sourceRecords = {'2026-09-10': sampleRecord('2026-09-10')};
    const destinationRecords = {'2026-09-11': sampleRecord('2026-09-11')};
    await writeRecords(projectDataDir, sourceRecords);
    await writeRecords(desktopDataDir, destinationRecords);

    const prepared = await prepareDesktopData({userDataDir, projectDataDir});

    assert.equal(prepared.reason, 'destination-exists');
    assert.deepEqual(await readRecords(desktopDataDir), destinationRecords);
});

test('G. /today 保存接口将记录写入注入的 Desktop 目录', async (t) => {
    const tempRoot = await createTempRoot(t);
    const desktopDataDir = path.join(tempRoot, 'userData', 'data');
    app.configureDailyStorage(desktopDataDir, 'desktop-userData');
    const server = await startServer(t);
    const date = '2026-09-12';

    const response = await request(server, `/api/daily-records/${date}`, {
        method: 'POST',
        body: {
            panTime: `${date}T09:30:00`,
            plan: '桌面计划',
            important: '桌面事项',
            result: '桌面结果',
            review: '桌面复盘'
        }
    });

    assert.equal(response.statusCode, 200);
    const records = await readRecords(desktopDataDir);
    assert.equal(records[date].plan, '桌面计划');
    assert.equal(records[date].review, '桌面复盘');

    const health = await request(server, '/api/health');
    assert.equal(health.json().storageMode, 'desktop-userData');
});

test('H. /history 能读取迁移到 Desktop 目录的历史记录', async (t) => {
    const tempRoot = await createTempRoot(t);
    const projectDataDir = path.join(tempRoot, 'project-data');
    const userDataDir = path.join(tempRoot, 'userData');
    const date = '2026-09-09';
    await writeRecords(projectDataDir, {
        [date]: sampleRecord(date, {plan: '已迁移计划', result: '已迁移结果'})
    });
    const prepared = await prepareDesktopData({userDataDir, projectDataDir});
    app.configureDailyStorage(prepared.dataDir, 'desktop-userData');
    const server = await startServer(t);

    const response = await request(server, '/history');

    assert.equal(response.statusCode, 200);
    assert.match(response.body, new RegExp(date));
    assert.match(response.body, /已填写/);
});

test('存储工厂拒绝空路径并保持实例写队列独立', async (t) => {
    assert.throws(() => createDailyStorage(''), /存储目录不能为空/);

    const tempRoot = await createTempRoot(t);
    const left = createDailyStorage(path.join(tempRoot, 'left'));
    const right = createDailyStorage(path.join(tempRoot, 'right'));
    await Promise.all([
        left.saveRecord('left', {date: 'left'}),
        right.saveRecord('right', {date: 'right'})
    ]);
    assert.deepEqual(await left.readAll(), {left: {date: 'left'}});
    assert.deepEqual(await right.readAll(), {right: {date: 'right'}});
});
