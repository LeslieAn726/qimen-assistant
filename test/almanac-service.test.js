'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');

const {getAlmanac} = require('../services/almanac-service');

function localDate(year, month, day) {
    return new Date(year, month - 1, day, 12, 0, 0);
}

test('A/B/C. 指定日期生成公历、农历和干支结构', () => {
    const result = getAlmanac(localDate(2026, 9, 13));
    assert.equal(result.solar.date, '2026-09-13');
    assert.equal(result.lunar.text, '二〇二六年八月初三');
    assert.equal(result.ganzhi.year, '丙午');
    assert.equal(result.ganzhi.month, '丁酉');
    assert.equal(result.ganzhi.day, '庚寅');
    assert.equal(result.zodiac, '马');
    assert.equal(result.jieqi.current.name, '白露');
    assert.equal(result.jieqi.next.name, '秋分');
});

test('D. 宜忌、吉神和凶煞均来自本地库数组', () => {
    const result = getAlmanac(localDate(2026, 9, 13));
    assert.ok(Array.isArray(result.yi));
    assert.ok(Array.isArray(result.ji));
    assert.ok(Array.isArray(result.goodGods));
    assert.ok(Array.isArray(result.badGods));
    assert.ok(result.yi.length > 0);
    assert.ok(result.ji.length > 0);
});

test('E. 冲、煞、胎神和彭祖百忌可以正常读取', () => {
    const result = getAlmanac(localDate(2026, 9, 13));
    assert.deepEqual(result.chong, {branch: '申', zodiac: '猴', description: '(甲申)猴'});
    assert.equal(result.sha, '北');
    assert.ok(result.taiShen);
    assert.equal(result.pengZu.length, 2);
    assert.ok(result.pengZu.every(Boolean));
});

test('F. 五类方位和黄黑道字段结构完整', () => {
    const result = getAlmanac(localDate(2026, 9, 13));
    for (const key of ['xiShen', 'fuShen', 'caiShen', 'yangGui', 'yinGui']) {
        assert.ok(result.directions[key].trigram);
        assert.ok(result.directions[key].direction);
    }
    assert.equal(result.twelveDayOfficer, '执');
    assert.deepEqual(result.dayType, {deity: '青龙', type: '黄道', luck: '吉'});
});

test('二十八宿、纳音、六曜和本地扩展字段存在', () => {
    const result = getAlmanac(localDate(2026, 9, 13));
    assert.deepEqual(
        {...result.xingXiu, verse: Boolean(result.xingXiu.verse)},
        {name: '星', luck: '凶', element: '日', animal: '马', palace: '南', verse: true}
    );
    assert.equal(result.naYin, '松柏木');
    assert.equal(result.liuYao, '佛灭');
    assert.ok(result.additional.season);
    assert.ok(result.additional.moonPhase);
    assert.ok(result.additional.dayNineStar);
});

test('L. fetch 不可用时黄历仍完全离线生成', (t) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
        throw new Error('不允许联网');
    };
    t.after(() => (globalThis.fetch = originalFetch));
    assert.doesNotThrow(() => getAlmanac(localDate(2024, 2, 10)));
    assert.equal(getAlmanac(localDate(2024, 2, 10)).lunar.text, '二〇二四年正月初一');
});

test('无效日期会返回明确错误', () => {
    assert.throws(
        () => getAlmanac(new Date('invalid')),
        (error) => error.code === 'ALMANAC_DATE_INVALID'
    );
});
