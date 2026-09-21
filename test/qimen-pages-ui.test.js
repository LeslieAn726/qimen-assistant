'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const app = require('../app');
const {
    SHICHEN,
    getShanghaiWallClock,
    getShichen,
    parseCustomDateTime
} = require('../services/qimen-page-service');

const ROOT = path.join(__dirname, '..');

function request(server, requestPath) {
    return new Promise((resolve, reject) => {
        http.get({port: server.address().port, path: requestPath}, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => (body += chunk));
            response.on('end', () => resolve({statusCode: response.statusCode, body}));
        }).on('error', reject);
    });
}

function pageMeta(body) {
    const match = /window\.QIMEN_PAGE_META = (\{.*?\});/s.exec(body);
    assert.ok(match, '页面应注入排盘时刻元数据');
    return JSON.parse(match[1]);
}

test('北京时间墙钟与十二时辰映射正确', () => {
    const wall = getShanghaiWallClock(new Date('2026-09-21T07:30:00.000Z'));
    assert.deepEqual(
        [wall.getFullYear(), wall.getMonth() + 1, wall.getDate(), wall.getHours(), wall.getMinutes()],
        [2026, 9, 21, 15, 30]
    );
    assert.equal(getShichen(wall).name, '申');
    assert.equal(getShichen(23).name, '子');
    assert.equal(getShichen(0).name, '子');
    assert.equal(SHICHEN.length, 12);
});

test('自定义日期时间严格解析且 15:30 属于申时', () => {
    const date = parseCustomDateTime('2026-09-21', '15:30');
    assert.ok(date);
    assert.equal(getShichen(date).name, '申');
    assert.equal(parseCustomDateTime('2026-02-30', '15:30'), null);
    assert.equal(parseCustomDateTime('2026-09-21', '24:00'), null);
});

test('实时排盘使用当前北京时间并与自定义结果相互独立', async (t) => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => server.close());

    const custom = await request(server, '/custom?date=2026-09-21&time=15%3A30');
    const realtime = await request(server, '/');
    assert.equal(custom.statusCode, 200);
    assert.equal(realtime.statusCode, 200);

    const customMeta = pageMeta(custom.body);
    const realtimeMeta = pageMeta(realtime.body);
    const shanghaiNow = getShanghaiWallClock();
    assert.equal(customMeta.mode, 'custom');
    assert.equal(customMeta.date, '2026-09-21');
    assert.equal(customMeta.formTime, '15:30');
    assert.equal(customMeta.shichen, '申');
    assert.equal(customMeta.timezone, 'Asia/Shanghai');
    assert.equal(realtimeMeta.mode, 'realtime');
    assert.equal(realtimeMeta.timezone, 'Asia/Shanghai');
    assert.equal(realtimeMeta.date, [
        shanghaiNow.getFullYear(),
        String(shanghaiNow.getMonth() + 1).padStart(2, '0'),
        String(shanghaiNow.getDate()).padStart(2, '0')
    ].join('-'));
    assert.notEqual(realtimeMeta, customMeta);
    assert.match(custom.body, /2026-09-21 15:30/);
    assert.match(custom.body, /庚申/);
    assert.match(custom.body, /阴遁9局/);
    assert.match(custom.body, /天辅/);
    assert.match(custom.body, /杜门/);
});

test('实时与自定义页面均接入星空主题且交互结构明确不同', async (t) => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => server.close());

    const [realtime, custom] = await Promise.all([
        request(server, '/'),
        request(server, '/custom?date=2026-09-21&time=15%3A30')
    ]);
    for (const response of [realtime, custom]) {
        assert.match(response.body, /href="css\/theme-dark-star\.css"/);
        assert.match(response.body, /theme-dark-star/);
        assert.match(response.body, /qimen-summary-card/);
    }
    assert.match(realtime.body, /class="theme-dark-star realtime-page"/);
    assert.match(realtime.body, /刷新当前盘/);
    assert.doesNotMatch(realtime.body, /id="customPanForm"/);
    assert.match(custom.body, /class="theme-dark-star custom-qimen-page"/);
    assert.match(custom.body, /id="customPanForm"/);
    assert.match(custom.body, /class="shichen-grid"/);
    assert.equal((custom.body.match(/class="shichen-button/g) || []).length, 12);
});

test('自定义复制文本明确使用查询时间、时辰与时区', async () => {
    const source = await fs.readFile(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
    assert.match(source, /【自定义奇门排盘】/);
    assert.match(source, /排盘时间：.*pageMeta\.date.*pageMeta\.formTime/s);
    assert.match(source, /时辰：.*pageMeta\.shichen/s);
    assert.match(source, /时区：.*pageMeta\.timezone/s);
    assert.match(source, /buildCopyText\(pan, window\.QIMEN_PAGE_META/);
});

test('星空主题覆盖排盘卡片与九宫白底并提供 760px 响应式布局', async () => {
    const theme = await fs.readFile(path.join(ROOT, 'public', 'css', 'theme-dark-star.css'), 'utf8');
    assert.match(theme, /\.theme-dark-star \.qimen-summary-card/);
    assert.match(theme, /\.theme-dark-star \.gong,[\s\S]*background: linear-gradient/);
    assert.match(theme, /\.theme-dark-star \.shichen-grid/);
    assert.match(theme, /@media \(max-width: 768px\)[\s\S]*\.theme-dark-star \.shichen-grid/);
});

test('受保护的奇门核心算法文件哈希保持不变', async () => {
    const expected = {
        'qimen.js': '2E532A7617296CC5A4B25DDAEFF617995DA2BAED99924E9A5E2CCB75699BB252',
        'dipan.js': '6C37AA6242F4739E506D9183980DB580A7F72C44A9F30A65C0F0000C1B9F8635',
        'jiuxing.js': 'F1F52BB712104AAD4E5F25ADCC8F3BA78A38FE412FF89580CACC85B673934A38',
        'bamen.js': '3B121172BE3E487458B278134F7DE6379797D128F4C80116CC2CD35B3AD59231',
        'bashen.js': '7F054DF4E8A380DEE69C5490D4A93BF780B7043511FD7D684F9C4D2CC63E9F64'
    };
    for (const [filename, hash] of Object.entries(expected)) {
        const source = await fs.readFile(path.join(ROOT, 'lib', filename), 'utf8');
        // Git may check out text as CRLF on Windows runners. Protect the
        // algorithm content while keeping the checksum independent of EOL style.
        const normalizedSource = source.replace(/\r\n?/g, '\n');
        assert.equal(crypto.createHash('sha256').update(normalizedSource).digest('hex').toUpperCase(), hash, filename);
    }
});
