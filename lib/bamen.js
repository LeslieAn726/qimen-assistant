/**
 * 八门分布计算模块（转盘排法）
 *
 * 值使门「加时」定位：从值使原宫（值符宫/旬首六仪地盘宫）起，按九宫数字顺序
 * （1→2→…→9→1）阳遁顺行、阴遁逆行，走「时柱旬内序数」步，落中5则寄坤2宫。
 * 八门整体随之按洛书飞宫顺序转动。
 */

// 洛书九宫飞宫顺序（不含中宫5）
const LUO_SHU_ORDER = ['1', '8', '3', '4', '9', '2', '7', '6'];

// 八门原位分布（按洛书顺序）
const BASIC_MEN = {
    '1': '休门', '8': '生门', '3': '伤门', '4': '杜门',
    '9': '景门', '2': '死门', '7': '惊门', '6': '开门', '5': ''
};

const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 干支 → 六十甲子序号；旬内序数 = 序号 % 10
function ganZhiIndex(ganZhi) {
    const gi = TIAN_GAN.indexOf(ganZhi.charAt(0));
    const zi = DI_ZHI.indexOf(ganZhi.charAt(1));
    if (gi < 0 || zi < 0) return 0;
    for (let n = 0; n < 60; n++) {
        if (n % 10 === gi && n % 12 === zi) return n;
    }
    return 0;
}

/**
 * 排布八门（转盘排法）
 * @param {String} zhiFuGong 值符宫（旬首六仪地盘宫）= 值使原宫
 * @param {String} shiGanZhi 时柱干支（如 '甲申'），用于取旬内序数
 * @param {String} type 阴阳遁类型 'yang' | 'yin'
 * @returns {Object} { zhiShiGong, zhiShiMen, baMen }
 */
function distributeBaMen(zhiFuGong, shiGanZhi, type = 'yang') {
    const zhiShiMen = BASIC_MEN[zhiFuGong] || '';

    // 时柱旬内序数（甲子时=0）
    const step = ganZhiIndex(shiGanZhi) % 10;

    // 值使门「加时」：九宫数字顺序，阳顺阴逆，走 step 步
    let g = parseInt(zhiFuGong, 10);
    for (let i = 0; i < step; i++) {
        g += (type === 'yang' ? 1 : -1);
        if (g > 9) g = 1;
        if (g < 1) g = 9;
    }
    // 落中宫则寄坤2（显示用）；zhiShiGongRaw 保留真实落宫（含中5，供暗干起局）
    const zhiShiGongRaw = g.toString();
    const zhiShiGong = (g === 5) ? '2' : g.toString();

    // 八门整体按洛书飞宫转动：使值使门从原宫到达落宫
    const fromIdx = LUO_SHU_ORDER.indexOf(zhiFuGong);
    const toIdx = LUO_SHU_ORDER.indexOf(zhiShiGong);
    const idxStep = (fromIdx === -1 || toIdx === -1) ? 0 : (toIdx - fromIdx + 8) % 8;

    const baMen = { '5': '' };
    for (let i = 0; i < 8; i++) {
        const og = LUO_SHU_ORDER[i];
        const ng = LUO_SHU_ORDER[(i + idxStep) % 8];
        baMen[ng] = BASIC_MEN[og];
    }

    return { zhiShiGong, zhiShiGongRaw, zhiShiMen, baMen };
}

module.exports = {
    distributeBaMen
};
