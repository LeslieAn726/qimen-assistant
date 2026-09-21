'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const jd = require('../lib/jieduan');
const qimen = require('../lib/qimen');

/* ---------- 五行生克工具 ---------- */

test('sheng / ke 基础关系', () => {
    assert.ok(jd.sheng('mu', 'huo'));   // 木生火
    assert.ok(jd.sheng('shui', 'mu'));  // 水生木
    assert.ok(!jd.sheng('huo', 'mu'));
    assert.ok(jd.ke('mu', 'tu'));       // 木克土
    assert.ok(jd.ke('shui', 'huo'));    // 水克火
    assert.ok(!jd.ke('tu', 'mu'));
});

test('relation 以主体视角判方向', () => {
    assert.equal(jd.relation('mu', 'mu'), '比和');
    assert.equal(jd.relation('mu', 'huo'), '生出'); // 木生火，木为主泄气
    assert.equal(jd.relation('huo', 'mu'), '生入'); // 木生火，火为主得生
    assert.equal(jd.relation('mu', 'tu'), '克出');  // 木克土
    assert.equal(jd.relation('tu', 'mu'), '克入');  // 木克土，土受克
    assert.equal(jd.relation('mu', ''), '');
});

/* ---------- 十干克应表 ---------- */

test('十干克应关键组合', () => {
    assert.equal(jd.lookupKeYing('戊', '丙').name, '青龙返首');
    assert.equal(jd.lookupKeYing('戊', '丙').jiXiong, 'ji');
    assert.equal(jd.lookupKeYing('丙', '戊').name, '飞鸟跌穴');
    assert.equal(jd.lookupKeYing('丙', '庚').name, '荧入太白');
    assert.equal(jd.lookupKeYing('丙', '庚').jiXiong, 'xiong');
    assert.equal(jd.lookupKeYing('庚', '丙').name, '太白入荧');
    assert.equal(jd.lookupKeYing('乙', '乙').name, '日奇伏吟');
    assert.equal(jd.lookupKeYing('癸', '戊').jiXiong, 'ji'); // 天乙合会
    // 甲按戊论（甲遁于六仪戊）
    assert.equal(jd.lookupKeYing('甲', '丙').name, '青龙返首');
});

test('克应表完整 9x9 = 81 组', () => {
    const gans = ['乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    let count = 0;
    for (const t of gans) for (const d of gans) {
        assert.ok(jd.lookupKeYing(t, d), `缺 ${t}+${d}`);
        count++;
    }
    assert.equal(count, 81);
});

/* ---------- 格局识别 ---------- */

function basePan(overrides) {
    return Object.assign({
        jiuXing: {}, baMen: {}, baShen: {}, tianPan: {}, diPan: {}, anGan: {},
        kongWangGong: [], maStar: { zhi: '', gong: '' },
        siZhu: { year: '甲子', month: '甲子', day: '乙丑', time: '丙子' },
        zhiFuGong: '1', zhiShiGong: '1', basicInfo: { purpose: '综合' }
    }, overrides || {});
}

test('六仪击刑：地盘戊落震三宫', () => {
    const geju = jd.detectGeju(basePan({ diPan: { '3': '戊' } }));
    assert.ok(geju.some(g => g.name === '六仪击刑' && g.gong === '3'));
    // 反例：戊不在击刑宫则不命中
    const geju2 = jd.detectGeju(basePan({ diPan: { '1': '戊' } }));
    assert.ok(!geju2.some(g => g.name === '六仪击刑'));
});

test('五不遇时：时干克日干且同阴阳', () => {
    // 甲日庚午时：庚(阳金)克甲(阳木)
    const geju = jd.detectGeju(basePan({ siZhu: { day: '甲子', time: '庚午' } }));
    assert.ok(geju.some(g => g.name === '五不遇时'));
    // 反例：甲日辛X时，辛(阴金)克甲(阳木)，阴阳不同 → 非五不遇时
    const geju2 = jd.detectGeju(basePan({ siZhu: { day: '甲子', time: '辛未' } }));
    assert.ok(!geju2.some(g => g.name === '五不遇时'));
});

test('三奇得使 + 飞鸟跌穴：天盘丙加地盘戊', () => {
    const geju = jd.detectGeju(basePan({ tianPan: { '1': '丙' }, diPan: { '1': '戊' } }));
    assert.ok(geju.some(g => g.name === '三奇得使'));
    assert.ok(geju.some(g => g.name === '飞鸟跌穴'));
});

test('奇仪入墓：天盘乙落坤二宫', () => {
    const geju = jd.detectGeju(basePan({ tianPan: { '2': '乙' } }));
    assert.ok(geju.some(g => g.name === '奇仪入墓' && g.gong === '2'));
});

test('九星伏吟：九星各归本位', () => {
    const benwei = { '1': '天蓬', '2': '天芮', '3': '天冲', '4': '天辅', '6': '天心', '7': '天柱', '8': '天任', '9': '天英' };
    const geju = jd.detectGeju(basePan({ jiuXing: benwei }));
    assert.ok(geju.some(g => g.name === '九星伏吟'));
});

/* ---------- 宫位级断局 ---------- */

test('门迫：门克宫记为门迫', () => {
    // 坎一宫(水)，死门(土) → 土克水 = 门迫
    const a = jd.analyzeGongDeep('1', basePan({ baMen: { '1': '死门' } }));
    assert.equal(a.menPo, true);
    assert.match(a.explain, /门迫/);
});

test('空亡令吉凶力量减半', () => {
    // 开门(金)入坎水(金生水,门生宫)+ 值符(吉神)：本应有正分
    const normal = jd.analyzeGongDeep('1', basePan({ baMen: { '1': '开门' }, baShen: { '1': '值符' } }));
    const empty = jd.analyzeGongDeep('1', basePan({ baMen: { '1': '开门' }, baShen: { '1': '值符' }, kongWangGong: ['1'] }));
    assert.ok(normal.score > 0);
    assert.equal(empty.score, normal.score * 0.5);
    assert.equal(empty.kongWang, true);
    assert.match(empty.explain, /空亡/);
});

test('驿马临宫标注', () => {
    const a = jd.analyzeGongDeep('3', basePan({ maStar: { zhi: '寅', gong: '3' } }));
    assert.equal(a.yiMa, true);
    assert.match(a.explain, /驿马/);
});

/* ---------- 整盘快照（端到端经 calculate） ---------- */

test('calculate 固定时间产出完整解断结构', () => {
    const date = new Date('2024-06-05T10:00:00');
    const pan = qimen.calculate(date, { method: '时家', purpose: '财运' });
    assert.ok(!pan.error, pan.message);

    // 九宫分析齐全
    for (let i = 1; i <= 9; i++) {
        const a = pan.jiuGongAnalysis[i];
        assert.ok(a, `缺第${i}宫`);
        assert.ok(['da_ji', 'xiao_ji', 'ping', 'xiao_xiong', 'da_xiong'].includes(a.jiXiong));
        assert.equal(typeof a.explain, 'string');
        assert.ok(a.explain.length > 0);
    }

    // 格局为数组，每项结构完整
    assert.ok(Array.isArray(pan.geju));
    for (const g of pan.geju) {
        assert.equal(typeof g.name, 'string');
        assert.ok(['ji', 'xiong', 'ping'].includes(g.jiXiong));
        assert.equal(typeof g.explain, 'string');
    }

    // 综合分析
    assert.ok(['da_ji', 'xiao_ji', 'ping', 'xiao_xiong', 'da_xiong'].includes(pan.analysis.overallJiXiong));
    assert.ok(Array.isArray(pan.analysis.suggestions) && pan.analysis.suggestions.length > 0);
    // 财运取用神
    assert.ok(pan.analysis.yongShen);
});
