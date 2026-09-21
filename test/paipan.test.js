'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const qimen = require('../lib/qimen');

/**
 * 权威盘基准（来自标准时家奇门排盘 App）
 * 2026-06-05 16:52 申时，芒种，阳遁六局（上元）
 *   值符：甲申庚，天任落艮八宫；值使：生门落艮八宫
 *   九星、八门伏吟（皆归本位）；天盘=地盘
 */
test('2026-06-05 申时 = 阳遁六局上元', () => {
    const pan = qimen.calculate(new Date('2026-06-05T16:52:00'), { method: '时家' });
    assert.equal(pan.juShu.type, 'yang', '应为阳遁');
    assert.equal(pan.juShu.number, '6', '应为六局');
    assert.equal(pan.juShu.yuan, '上元', '应为上元');
});

test('值符落艮八宫、值符星天任', () => {
    const pan = qimen.calculate(new Date('2026-06-05T16:52:00'), { method: '时家' });
    assert.equal(pan.zhiFuYuanGong, '8', '值符原宫应在艮八');
    assert.equal(pan.zhiFuXing, '天任');
});

test('阳遁六局地盘三奇六仪排布', () => {
    const pan = qimen.calculate(new Date('2026-06-05T16:52:00'), { method: '时家' });
    // 戊从六宫起按宫数递增：6戊 7己 8庚 9辛 1壬 2癸 3丁 4丙 5乙
    const expected = { '1': '壬', '2': '癸', '3': '丁', '4': '丙', '5': '乙', '6': '戊', '7': '己', '8': '庚', '9': '辛' };
    assert.deepEqual(pan.diPan, expected);
});

test('八神阳遁顺时针，从值符艮八起', () => {
    const pan = qimen.calculate(new Date('2026-06-05T16:52:00'), { method: '时家' });
    // 艮8值符→震3腾蛇→巽4太阴→离9六合→坤2白虎→兑7玄武→乾6九地→坎1九天
    assert.equal(pan.baShen['8'], '值符');
    assert.equal(pan.baShen['3'], '腾蛇');
    assert.equal(pan.baShen['4'], '太阴');
    assert.equal(pan.baShen['9'], '六合');
    assert.equal(pan.baShen['2'], '白虎');
    assert.equal(pan.baShen['7'], '玄武');
    assert.equal(pan.baShen['6'], '九地');
    assert.equal(pan.baShen['1'], '九天');
});

test('九星伏吟（皆归本位）', () => {
    const pan = qimen.calculate(new Date('2026-06-05T16:52:00'), { method: '时家' });
    assert.equal(pan.jiuXing['1'], '天蓬');
    assert.equal(pan.jiuXing['9'], '天英');
    assert.equal(pan.jiuXing['8'], '天任');
    assert.equal(pan.jiuXing['3'], '天冲');
    assert.equal(pan.jiuXing['4'], '天辅');
    assert.equal(pan.jiuXing['6'], '天心');
    assert.equal(pan.jiuXing['7'], '天柱');
});

test('八门伏吟（皆归本位）', () => {
    const pan = qimen.calculate(new Date('2026-06-05T16:52:00'), { method: '时家' });
    assert.equal(pan.baMen['1'], '休门');
    assert.equal(pan.baMen['8'], '生门');
    assert.equal(pan.baMen['3'], '伤门');
    assert.equal(pan.baMen['4'], '杜门');
    assert.equal(pan.baMen['9'], '景门');
    assert.equal(pan.baMen['2'], '死门');
    assert.equal(pan.baMen['7'], '惊门');
    assert.equal(pan.baMen['6'], '开门');
});

test('伏吟盘天盘=地盘', () => {
    const pan = qimen.calculate(new Date('2026-06-05T16:52:00'), { method: '时家' });
    for (let i = 1; i <= 9; i++) {
        assert.equal(pan.tianPan[i], pan.diPan[i], `第${i}宫天盘应等于地盘`);
    }
});

test('暗干（甲申时，时干甲寄中5起局，旬首六仪庚入中）', () => {
    const pan = qimen.calculate(new Date('2026-06-05T16:52:00'), { method: '时家' });
    const ref = { 1: '丙', 2: '乙', 3: '戊', 4: '己', 5: '庚', 6: '辛', 7: '壬', 8: '癸', 9: '丁' };
    for (let g = 1; g <= 9; g++) {
        assert.equal(pan.anGan[g], ref[g], `${g}宫暗干`);
    }
});

/* 五张权威 App 基准盘（2026 各节气，午时 12:00，置闰法）
 * 校验：局数/阴阳遁 + 值符星 + 值符落宫 + 值使门 + 值使落宫(中5寄坤2) + 暗干九宫
 * 暗干：把时干加到值使门落宫，按戊己庚辛壬癸丁丙乙顺序阳顺阴逆排满九宫；时干为甲寄中5起局 */
const BENCH = [
    { date: '2026-03-21T12:00:00', type: 'yang', num: '3', xing: '天冲', zhiFu: '2', shiMen: '伤门', zhiShi: '9',
      anGan: { 1: '辛', 2: '壬', 3: '癸', 4: '丁', 5: '丙', 6: '乙', 7: '戊', 8: '己', 9: '庚' } },
    { date: '2026-06-09T12:00:00', type: 'yang', num: '3', xing: '天冲', zhiFu: '2', shiMen: '伤门', zhiShi: '9',
      anGan: { 1: '辛', 2: '壬', 3: '癸', 4: '丁', 5: '丙', 6: '乙', 7: '戊', 8: '己', 9: '庚' } },
    { date: '2026-07-15T12:00:00', type: 'yin', num: '5', xing: '天辅', zhiFu: '1', shiMen: '杜门', zhiShi: '2',
      anGan: { 1: '乙', 2: '丙', 3: '丁', 4: '癸', 5: '壬', 6: '辛', 7: '庚', 8: '己', 9: '戊' } },
    { date: '2026-09-23T12:00:00', type: 'yin', num: '1', xing: '天英', zhiFu: '6', shiMen: '景门', zhiShi: '1',
      anGan: { 1: '壬', 2: '辛', 3: '庚', 4: '己', 5: '戊', 6: '乙', 7: '丙', 8: '丁', 9: '癸' } },
    { date: '2026-12-08T12:00:00', type: 'yin', num: '7', xing: '天辅', zhiFu: '4', shiMen: '杜门', zhiShi: '4',
      anGan: { 1: '丙', 2: '丁', 3: '癸', 4: '壬', 5: '辛', 6: '庚', 7: '己', 8: '戊', 9: '乙' } }
];
for (const b of BENCH) {
    test(`权威盘 ${b.date.slice(0, 10)} = ${b.type === 'yang' ? '阳' : '阴'}遁${b.num}局`, () => {
        const p = qimen.calculate(new Date(b.date), { method: '时家' });
        assert.equal(p.juShu.type, b.type, '阴阳遁');
        assert.equal(p.juShu.number, b.num, '局数');
        assert.equal(p.zhiFuXing, b.xing, '值符星');
        assert.equal(p.zhiFuGong, b.zhiFu, '值符落宫');
        assert.equal(p.zhiShiMen, b.shiMen, '值使门');
        assert.equal(p.zhiShiGong, b.zhiShi, '值使落宫');
        for (let g = 1; g <= 9; g++) {
            assert.equal(p.anGan[g], b.anGan[g], `${g}宫暗干`);
        }
    });
}
