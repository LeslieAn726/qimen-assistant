/**
 * 奇门遁甲核心计算库
 * 实现完整的奇门遁甲排盘系统
 */

const {Lunar, Solar, JieQi} = require('lunar-javascript');
const jiuXingModule = require('./jiuxing');
const baMenModule = require('./bamen');
const baShenModule = require('./bashen');
const diPanModule = require('./dipan');
const jieduanModule = require('./jieduan');

/**
 * 天干地支对应
 */
const TIAN_GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const DI_ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

/**
 * 三奇六仪(天盘)
 */
const SAN_QI = ["戊", "己", "庚"];
const LIU_YI = ["辛", "壬", "癸", "丁", "丙", "乙"];

/**
 * 九宫位置信息
 */
const JIU_GONG = {
    '1': { name: '坎', direction: '正北', element: 'shui', color: '#03A9F4', yinyang: '阴' },
    '2': { name: '坤', direction: '西南', element: 'tu', color: '#795548', yinyang: '阴' },
    '3': { name: '震', direction: '正东', element: 'mu', color: '#4CAF50', yinyang: '阳' },
    '4': { name: '巽', direction: '东南', element: 'mu', color: '#4CAF50', yinyang: '阳' },
    '5': { name: '中', direction: '中宫', element: 'tu', color: '#795548', yinyang: '阴阳' },
    '6': { name: '乾', direction: '西北', element: 'jin', color: '#FF9800', yinyang: '阳' },
    '7': { name: '兑', direction: '正西', element: 'jin', color: '#FF9800', yinyang: '阴' },
    '8': { name: '艮', direction: '东北', element: 'tu', color: '#795548', yinyang: '阳' },
    '9': { name: '离', direction: '正南', element: 'huo', color: '#F44336', yinyang: '阳' }
};

/**
 * 九星信息
 */
const JIU_XING = {
    '天蓬': { alias: '贪狼', element: 'shui', color: '#03A9F4', feature: '主智慧、口才、机变' },
    '天芮': { alias: '武曲', element: 'tu', color: '#795548', feature: '主稳重、忠厚、坚韧' },
    '天冲': { alias: '禄存', element: 'mu', color: '#4CAF50', feature: '主冲击、变化、快速' },
    '天辅': { alias: '文曲', element: 'mu', color: '#4CAF50', feature: '主扶助、支持、辅佐' },
    '天禽': { alias: '天禽', element: 'tu', color: '#795548', feature: '为中宫之神，主枢纽、核心' },
    '天心': { alias: '廉贞', element: 'jin', color: '#FF9800', feature: '主决断、判断、果决' },
    '天柱': { alias: '破军', element: 'jin', color: '#FF9800', feature: '主坚固、支撑、顶天立地' },
    '天任': { alias: '巨门', element: 'tu', color: '#795548', feature: '主责任、重担、实际' },
    '天英': { alias: '左辅', element: 'huo', color: '#F44336', feature: '主才华、聪明、显贵' }
};

/**
 * 八门信息
 */
const BA_MEN = {
    '休门': { feature: '为吉门，主休养、安宁、平和。适合休息与调养。', type: 'ji', element: 'shui', color: '#03A9F4' },
    '生门': { feature: '为吉门，主生发、成长、喜庆。适合开始新事物。', type: 'ji', element: 'tu', color: '#795548' },
    '伤门': { feature: '为凶门，主伤害、损失、疾病。需避免冲突与伤害。', type: 'xiong', element: 'mu', color: '#4CAF50' },
    '杜门': { feature: '为凶门，主阻塞、停滞、困难。事情易受阻碍。', type: 'xiong', element: 'mu', color: '#4CAF50' },
    '景门': { feature: '为吉门，主光明、展示、明亮。适合公开场合与展示。', type: 'ji', element: 'huo', color: '#F44336' },
    '死门': { feature: '为凶门，主衰败、结束、死亡。不宜开始重要事情。', type: 'xiong', element: 'tu', color: '#795548' },
    '惊门': { feature: '为凶门，主惊吓、变故、突发状况。需注意意外变化。', type: 'xiong', element: 'jin', color: '#FF9800' },
    '开门': { feature: '为吉门，主通达、顺畅、开始。万事顺利，有好的开端。', type: 'ji', element: 'jin', color: '#FF9800' }
};

/**
 * 八神信息
 */
const BA_SHEN = {
    '值符': { feature: '为贵神，主吉庆、贵人、福星。', type: 'ji' },
    '腾蛇': { feature: '为凶神，主口舌是非、波动起伏。', type: 'xiong' },
    '太阴': { feature: '为吉神，主柔和、隐藏、内敛。', type: 'ji' },
    '六合': { feature: '为吉神，主和谐、团结、合作。', type: 'ji' },
    '白虎': { feature: '为凶神，主凶猛、伤害、灾祸。', type: 'xiong' },
    '玄武': { feature: '为凶神，主隐秘、盗窃、欺诈。', type: 'xiong' },
    '九地': { feature: '为吉神，主地利、丰收、稳固。', type: 'ji' },
    '九天': { feature: '为吉神，主高升、贵人、成功。', type: 'ji' }
};

/**
 * 节气与局数的映射关系
 */
const JIE_QI_JU_SUAN = [
    { jieqi: '冬至', type: 'yang', numbers: '174' },
    { jieqi: '惊蛰', type: 'yang', numbers: '174' },
    { jieqi: '小寒', type: 'yang', numbers: '285' },
    { jieqi: '大寒', type: 'yang', numbers: '396' },
    { jieqi: '春分', type: 'yang', numbers: '396' },
    { jieqi: '雨水', type: 'yang', numbers: '963' },
    { jieqi: '清明', type: 'yang', numbers: '417' },
    { jieqi: '立夏', type: 'yang', numbers: '417' },
    { jieqi: '立春', type: 'yang', numbers: '852' },
    { jieqi: '谷雨', type: 'yang', numbers: '528' },
    { jieqi: '小满', type: 'yang', numbers: '528' },
    { jieqi: '芒种', type: 'yang', numbers: '639' },
    { jieqi: '夏至', type: 'yin', numbers: '936' },
    { jieqi: '白露', type: 'yin', numbers: '936' },
    { jieqi: '小暑', type: 'yin', numbers: '825' },
    { jieqi: '大暑', type: 'yin', numbers: '714' },
    { jieqi: '秋分', type: 'yin', numbers: '714' },
    { jieqi: '立秋', type: 'yin', numbers: '258' },
    { jieqi: '寒露', type: 'yin', numbers: '693' },
    { jieqi: '立冬', type: 'yin', numbers: '693' },
    { jieqi: '处暑', type: 'yin', numbers: '147' },
    { jieqi: '霜降', type: 'yin', numbers: '582' },
    { jieqi: '小雪', type: 'yin', numbers: '582' },
    { jieqi: '大雪', type: 'yin', numbers: '471' }
];

/**
 * 求符头地支：日柱往前取到最近的甲/己日（五日一元），返回该符头的地支
 * 时家/日家奇门以符头定上中下元，而非当日地支。
 * @param {String} dayGanZhi 日柱干支，如 '庚戌'
 * @returns {String} 符头地支
 */
function getFuTouZhi(dayGanZhi) {
    const TG = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const DZ = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const gi = TG.indexOf(dayGanZhi.charAt(0));
    const zi = DZ.indexOf(dayGanZhi.charAt(1));
    if (gi < 0 || zi < 0) return dayGanZhi.substring(1);
    // 六十甲子序号：天干%10、地支%12 同时吻合
    let n = 0;
    for (; n < 60; n++) {
        if (n % 10 === gi && n % 12 === zi) break;
    }
    // 往前取到最近的甲(n%10==0)或己(n%10==5)日 = 符头
    const fuTou = n - (n % 5);
    return DZ[fuTou % 12];
}

/**
 * 计算阴阳遁局数
 * @param {Date} date 日期时间
 * @param {String} method 排盘方法：'时家', '日家', '月家', '年家'
 * @returns {Object} 局数信息
 */
function calculateJuShu(date, method = '时家') {
    // 使用lunar-javascript获取当前节气信息
    const lunar = Lunar.fromDate(date);
    
    // 根据排盘方法选择不同的时间单位
    let jieQiName;
    if (method === '时家' || method === '日家') {
        // 获取最近的节气
        jieQiName = lunar.getPrevJieQi(true).getName();
    } else if (method === '月家') {
        // 获取当月的节气
        jieQiName = lunar.getJieQiList()[lunar.getMonth() * 2].getName();
    } else if (method === '年家') {
        // 获取当年的立春
        const year = lunar.getYear();
        const liChun = Lunar.fromYmd(year, 2, 4).getPrevJieQi(true); // 立春一般在2月4日前后
        jieQiName = liChun.getName();
    }
    
    // 确定上中下元 - 时家奇门用日干支判断元
    // 日干支的地支决定上中下元
    let ganZhi = '';
    if (method === '时家') {
        ganZhi = lunar.getDayInGanZhi(); // 时家奇门用日干支判断元
    } else if (method === '日家') {
        ganZhi = lunar.getDayInGanZhi();
    } else if (method === '月家') {
        ganZhi = lunar.getMonthInGanZhi();
    } else if (method === '年家') {
        ganZhi = lunar.getYearInGanZhi();
    }
    
    // 提取地支用于定元
    // 时家/日家：以「符头」定元（日柱往前取到最近甲/己日，五日一元）
    // 月家/年家：用所取月/年柱地支
    let diZhi;
    if (method === '时家' || method === '日家') {
        diZhi = getFuTouZhi(ganZhi);
    } else {
        diZhi = ganZhi.substring(1);
    }

    // 根据符头/地支确定上中下元
    let yuan;
    if (['子', '午', '卯', '酉'].includes(diZhi)) {
        yuan = 0; // 上元：符头甲子/甲午/己卯/己酉
    } else if (['寅', '申', '巳', '亥'].includes(diZhi)) {
        yuan = 1; // 中元：符头甲寅/甲申/己巳/己亥
    } else {
        yuan = 2; // 下元：符头甲辰/甲戌/己丑/己未
    }
    
    // 阴阳遁与局数均由节气决定（冬至后阳遁、夏至后阴遁），直接取节气映射表
    let yinYangType = 'yang';
    let juNumber = '1';
    for (const item of JIE_QI_JU_SUAN) {
        if (item.jieqi === jieQiName) {
            yinYangType = item.type === 'yin' ? 'yin' : 'yang';
            juNumber = item.numbers.charAt(yuan);
            break;
        }
    }
    
    return {
        jieQiName: jieQiName,
        type: yinYangType,
        number: juNumber,
        yuan: ['上元', '中元', '下元'][yuan],
        fullName: `${yinYangType === 'yin' ? '阴遁' : '阳遁'}${juNumber}局 (${['上元', '中元', '下元'][yuan]})`,
        formatCode: `${yinYangType}-${juNumber}`
    };
}

/**
 * 洛书九宫顺序（不含中宫5）
 */
const LUO_SHU_ORDER = ['1', '8', '3', '4', '9', '2', '7', '6'];

/**
 * 旬首与六仪的对应关系
 * 甲子旬→戊，甲戌旬→己，甲申旬→庚，甲午旬→辛，甲辰旬→壬，甲寅旬→癸
 */
const XUN_SHOU_TO_LIU_YI = {
    '甲子': '戊', '甲戌': '己', '甲申': '庚',
    '甲午': '辛', '甲辰': '壬', '甲寅': '癸'
};

/**
 * 计算天盘干分布（转盘排法）
 * @param {Object} diPan 地盘干分布
 * @param {String} xunShou 旬首对应的六仪（戊己庚辛壬癸之一）
 * @param {String} shiGan 时干
 * @param {String} type 阴阳遁类型 'yang' 或 'yin'
 * @returns {Object} 天盘干分布
 */
function distributeTianPan(diPan, xunShou, shiGan, type) {
    const result = {};

    // 1. 找旬首六仪在地盘上的位置 = 值符宫
    let zhiFuGong = null;
    for (const gong in diPan) {
        if (diPan[gong] === xunShou && gong !== '5') {
            zhiFuGong = gong;
            break;
        }
    }

    // 如果旬首在中宫，寄坤2宫
    if (!zhiFuGong) {
        zhiFuGong = '2';
    }

    // 2. 找时干在地盘上的位置 = 时干落宫
    let shiGanGong = null;
    for (const gong in diPan) {
        if (diPan[gong] === shiGan && gong !== '5') {
            shiGanGong = gong;
            break;
        }
    }

    // 如果时干是甲，甲隐于六仪之下，用旬首六仪代替
    if (!shiGanGong && shiGan === '甲') {
        shiGanGong = zhiFuGong;
    }

    // 如果时干在中宫，寄坤2宫
    if (!shiGanGong) {
        shiGanGong = '2';
    }

    // 3. 计算转动步数
    const zhiFuIndex = LUO_SHU_ORDER.indexOf(zhiFuGong);
    const shiGanIndex = LUO_SHU_ORDER.indexOf(shiGanGong);

    let steps;
    if (type === 'yang') {
        // 阳遁顺转
        steps = (shiGanIndex - zhiFuIndex + 8) % 8;
    } else {
        // 阴遁逆转
        steps = (zhiFuIndex - shiGanIndex + 8) % 8;
    }

    // 4. 天盘整体转动
    for (let i = 0; i < 8; i++) {
        const diPanGong = LUO_SHU_ORDER[i];
        const diPanGan = diPan[diPanGong];

        let tianPanIndex;
        if (type === 'yang') {
            // 阳遁顺转
            tianPanIndex = (i + steps) % 8;
        } else {
            // 阴遁逆转
            tianPanIndex = (i - steps + 8) % 8;
        }

        const tianPanGong = LUO_SHU_ORDER[tianPanIndex];
        result[tianPanGong] = diPanGan;
    }

    // 中宫天盘干取地盘中宫干（中宫不参与转盘飞布）
    result['5'] = diPan['5'];

    return result;
}

/**
 * 根据阴阳遁和局数排布三奇六仪（保留兼容性，实际返回地盘干）
 * @param {Object} juShuInfo 局数信息对象
 * @returns {Object} 三奇六仪分布（地盘干）
 */
function distributeSanQiLiuYi(juShuInfo) {
    const type = juShuInfo.type;
    const num = parseInt(juShuInfo.number);
    return diPanModule.getDiPan(type, num);
}

/**
 * 排布九星
 * @param {Object} sanQiLiuYi 三奇六仪分布
 * @param {String} xunShou 旬首
 * @returns {Object} 九星分布和值符信息
 */
function distributeJiuXing(sanQiLiuYi, xunShou) {
    // 查找旬首所在宫
    let zhiFuGong = '';
    for (const gong in sanQiLiuYi) {
        if (sanQiLiuYi[gong] === xunShou) {
            zhiFuGong = gong;
            break;
        }
    }
    
    // 如果找不到旬首，默认在中宫
    if (!zhiFuGong) {
        zhiFuGong = '5';
    }
    
    // 宫位对应的九星
    const gongToXing = {
        '1': '天蓬',
        '2': '天芮',
        '3': '天冲',
        '4': '天辅',
        '5': '天禽',
        '6': '天心',
        '7': '天柱',
        '8': '天任',
        '9': '天英'
    };
    
    // 确定值符星
    const zhiFuXing = gongToXing[zhiFuGong];
    
    // 九星顺序
    const xingOrder = ['天蓬', '天任', '天冲', '天辅', '天英', '天芮', '天柱', '天心'];
    
    // 宫位顺序（顺时针，不含中宫）
    const gongOrder = ['1', '8', '3', '4', '9', '2', '7', '6'];
    
    // 九星分布结果
    const jiuXing = {};
    
    // 中宫永远是天禽
    jiuXing['5'] = '天禽';
    
    // 值符星在值符宫
    if (zhiFuGong !== '5') {
        jiuXing[zhiFuGong] = zhiFuXing;
        
        // 找到值符星在星序中的位置
        const zhiFuXingIndex = xingOrder.indexOf(zhiFuXing);
        
        // 值符宫在宫序中的位置
        const zhiFuGongIndex = gongOrder.indexOf(zhiFuGong);
        
        if (zhiFuXingIndex !== -1 && zhiFuGongIndex !== -1) {
            // 从值符宫开始按顺序排列其他星
            for (let i = 1; i < gongOrder.length; i++) {
                const currentGong = gongOrder[(zhiFuGongIndex + i) % gongOrder.length];
                const currentXing = xingOrder[(zhiFuXingIndex + i) % xingOrder.length];
                jiuXing[currentGong] = currentXing;
            }
        }
    } else {
        // 如果值符在中宫，使用默认排布
        for (let i = 0; i < gongOrder.length; i++) {
            jiuXing[gongOrder[i]] = xingOrder[i];
        }
    }
    
    return {
        zhiFuGong,
        zhiFuXing,
        jiuXing
    };
}

/**
 * 排布八门
 * @param {String} zhiFuGong 值符宫
 * @param {String} shiGan 时干
 * @param {Object} sanQiLiuYi 三奇六仪分布
 * @returns {Object} 八门分布和值使信息
 */
function distributeBaMen(zhiFuGong, shiGan, sanQiLiuYi) {
    // 查找时干落宫
    let luoGong = '';
    for (const gong in sanQiLiuYi) {
        if (sanQiLiuYi[gong] === shiGan) {
            luoGong = gong;
            break;
        }
    }
    
    // 如果找不到时干，查找时干寄宫
    if (!luoGong) {
        // 甲己寄生在戊，乙庚寄生在己，丙辛寄生在庚...
        const jiShengMap = {
            '甲': '戊', '己': '戊',
            '乙': '己', '庚': '己',
            '丙': '庚', '辛': '庚',
            '丁': '辛', '壬': '辛',
            '戊': '壬', '癸': '壬'
        };
        
        const jiGan = jiShengMap[shiGan];
        for (const gong in sanQiLiuYi) {
            if (sanQiLiuYi[gong] === jiGan) {
                luoGong = gong;
                break;
            }
        }
    }
    
    // 基本八门分布 - 修正八门的宫位对应关系
    const basicGongToMen = {
        '1': '休门',
        '8': '生门',
        '3': '伤门',
        '4': '杜门',
        '9': '景门',
        '2': '死门',
        '7': '惊门',
        '6': '开门',
        '5': '' // 中宫无门
    };
    
    // 确定值使门 - 这里需要修改，值使门应该由时干所在的落宫决定
    const zhiShiMen = basicGongToMen[luoGong] || '';
    
    // 宫位顺序（顺时针，不含中宫）
    const clockwiseGongOrder = ['1', '8', '3', '4', '9', '2', '7', '6'];
    
    // 八门顺序
    const menOrder = ['休门', '生门', '伤门', '杜门', '景门', '死门', '惊门', '开门'];
    
    // 八门分布结果
    const baMen = {};
    
    // 中宫没有门
    baMen['5'] = '';
    
    // 如果时干落宫找到
    if (luoGong && luoGong !== '5') {
        // 值使门落在时干所在宫
        baMen[luoGong] = zhiShiMen;
        
        // 找到值使门在门序中的位置
        const zhiShiMenIndex = menOrder.indexOf(zhiShiMen);
        
        // 时干落宫在宫序中的位置
        const luoGongIndex = clockwiseGongOrder.indexOf(luoGong);
        
        if (zhiShiMenIndex !== -1 && luoGongIndex !== -1) {
            // 从值使门开始顺时针排列其他门
            for (let i = 1; i < clockwiseGongOrder.length; i++) {
                const currentGong = clockwiseGongOrder[(luoGongIndex + i) % clockwiseGongOrder.length];
                const currentMen = menOrder[(zhiShiMenIndex + i) % menOrder.length];
                baMen[currentGong] = currentMen;
            }
        }
    } else {
        // 如果找不到落宫或落宫在中宫，使用默认排布
        for (const gong in basicGongToMen) {
            baMen[gong] = basicGongToMen[gong];
        }
    }
    
    return {
        zhiShiGong: luoGong,
        zhiShiMen,
        baMen
    };
}

/**
 * 排布八神
 * @param {String} zhiFuGong 值符宫
 * @returns {Object} 八神分布
 */
function distributeBaShen(zhiFuGong) {
    // 八神顺序
    const shenOrder = ['值符', '腾蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天'];
    
    // 宫位顺序（不含中宫）
    const gongOrder = ['1', '8', '3', '4', '9', '2', '7', '6'];
    
    // 八神分布结果
    const baShen = {
        '1': '',
        '2': '',
        '3': '',
        '4': '',
        '5': '', // 中宫没有神
        '6': '',
        '7': '',
        '8': '',
        '9': ''
    };
    
    // 值符在值符宫
    if (zhiFuGong !== '5') {
        baShen[zhiFuGong] = '值符';
        
        // 值符宫在宫序中的位置
        const zhiFuGongIndex = gongOrder.indexOf(zhiFuGong);
        
        if (zhiFuGongIndex !== -1) {
            // 从值符宫开始按顺序排列其他神
            for (let i = 1; i < gongOrder.length; i++) {
                const currentGong = gongOrder[(zhiFuGongIndex + i) % gongOrder.length];
                const currentShen = shenOrder[i];
                baShen[currentGong] = currentShen;
            }
        }
    } else {
        // 如果值符在中宫，使用默认排布
        for (let i = 0; i < gongOrder.length; i++) {
            baShen[gongOrder[i]] = shenOrder[i];
        }
    }
    
    return baShen;
}

/**
 * 获取旬首
 * @param {Lunar} lunar 农历对象
 * @param {String} method 排盘方法
 * @returns {String} 旬首
 */
/**
 * 获取驿马星位置
 * @param {Lunar} lunar 农历对象
 * @param {String} method 排盘方法
 * @returns {Object} 驿马信息 {zhi: 驿马地支, gong: 驿马宫位}
 */
function getMaStar(lunar, method) {
    let zhi = '';
    if (method === '时家') {
        zhi = lunar.getTimeZhi();
    } else if (method === '日家') {
        zhi = lunar.getDayZhi();
    } else if (method === '月家') {
        zhi = lunar.getMonthZhi();
    } else if (method === '年家') {
        zhi = lunar.getYearZhi();
    }

    // 驿马计算规则
    // 寅午戌 → 马在申
    // 申子辰 → 马在寅
    // 巳酉丑 → 马在亥
    // 亥卯未 → 马在巳
    let maZhi = '';
    if (['寅', '午', '戌'].includes(zhi)) {
        maZhi = '申';
    } else if (['申', '子', '辰'].includes(zhi)) {
        maZhi = '寅';
    } else if (['巳', '酉', '丑'].includes(zhi)) {
        maZhi = '亥';
    } else if (['亥', '卯', '未'].includes(zhi)) {
        maZhi = '巳';
    }

    // 地支与宫位对应
    const zhiToGong = {
        '子': '1', '丑': '8', '寅': '8', '卯': '3',
        '辰': '4', '巳': '4', '午': '9', '未': '2',
        '申': '2', '酉': '7', '戌': '6', '亥': '6'
    };

    return {
        zhi: maZhi,
        gong: zhiToGong[maZhi] || ''
    };
}

/**
 * 获取空亡地支
 * @param {Lunar} lunar 农历对象
 * @param {String} method 排盘方法
 * @returns {Array} 空亡地支数组
 */
function getKongWang(lunar, method) {
    try {
        let xun = '';
        if (method === '时家') {
            xun = lunar.getTimeXun();
        } else if (method === '日家') {
            xun = lunar.getDayXun();
        } else if (method === '月家') {
            xun = lunar.getMonthXun();
        } else if (method === '年家') {
            xun = lunar.getYearXun();
        }

        // 旬空对应关系
        const xunToKongWang = {
            '甲子': ['戌', '亥'],
            '甲戌': ['申', '酉'],
            '甲申': ['午', '未'],
            '甲午': ['辰', '巳'],
            '甲辰': ['寅', '卯'],
            '甲寅': ['子', '丑']
        };

        return xunToKongWang[xun] || [];
    } catch (e) {
        console.error('获取空亡地支出错:', e);
        return [];
    }
}

/**
 * 获取空亡宫位
 * @param {Array} kongWangZhi 空亡地支数组
 * @returns {Array} 空亡宫位数组
 */
function getKongWangGong(kongWangZhi) {
    // 地支对应的宫位（奇门遁甲地支与九宫对应）
    const zhiToGong = {
        '子': '1', // 坎宫
        '丑': '8', // 艮宫
        '寅': '8', // 艮宫
        '卯': '3', // 震宫
        '辰': '4', // 巽宫
        '巳': '4', // 巽宫
        '午': '9', // 离宫
        '未': '2', // 坤宫
        '申': '2', // 坤宫
        '酉': '7', // 兑宫
        '戌': '6', // 乾宫
        '亥': '6'  // 乾宫
    };

    return kongWangZhi.map(zhi => zhiToGong[zhi]).filter(gong => gong);
}

/**
 * 获取旬首
 * @param {Lunar} lunar 农历对象
 * @param {String} method 排盘方法
 * @returns {String} 旬首
 */
function getXunShou(lunar, method) {
    let xun = '';
    let ganZhi = '';
    
    try {
        if (method === '时家') {
            // 时家奇门用时干支的旬首来确定值符
            ganZhi = lunar.getTimeInGanZhi();
            xun = lunar.getTimeXun();
        } else if (method === '日家') {
            ganZhi = lunar.getDayInGanZhi();
            xun = lunar.getDayXun();
        } else if (method === '月家') {
            ganZhi = lunar.getMonthInGanZhi();
            xun = lunar.getMonthXun();
        } else if (method === '年家') {
            ganZhi = lunar.getYearInGanZhi();
            xun = lunar.getYearXun();
        }
        
        // 旬名与六仪的对应关系
        const xunToLiuYi = {
            '甲子': '戊', '甲戌': '己', '甲申': '庚',
            '甲午': '辛', '甲辰': '壬', '甲寅': '癸'
        };

        // 如果 xun 不为空，直接通过旬名获取六仪
        if (xun && xunToLiuYi[xun]) {
            return xunToLiuYi[xun];
        }

        // 否则通过干支映射表获取
        const xunShouMap = {
            '甲子': '戊', '乙丑': '戊', '丙寅': '戊', '丁卯': '戊', '戊辰': '戊', '己巳': '戊', '庚午': '戊', '辛未': '戊', '壬申': '戊', '癸酉': '戊',
            '甲戌': '己', '乙亥': '己', '丙子': '己', '丁丑': '己', '戊寅': '己', '己卯': '己', '庚辰': '己', '辛巳': '己', '壬午': '己', '癸未': '己',
            '甲申': '庚', '乙酉': '庚', '丙戌': '庚', '丁亥': '庚', '戊子': '庚', '己丑': '庚', '庚寅': '庚', '辛卯': '庚', '壬辰': '庚', '癸巳': '庚',
            '甲午': '辛', '乙未': '辛', '丙申': '辛', '丁酉': '辛', '戊戌': '辛', '己亥': '辛', '庚子': '辛', '辛丑': '辛', '壬寅': '辛', '癸卯': '辛',
            '甲辰': '壬', '乙巳': '壬', '丙午': '壬', '丁未': '壬', '戊申': '壬', '己酉': '壬', '庚戌': '壬', '辛亥': '壬', '壬子': '壬', '癸丑': '壬',
            '甲寅': '癸', '乙卯': '癸', '丙辰': '癸', '丁巳': '癸', '戊午': '癸', '己未': '癸', '庚申': '癸', '辛酉': '癸', '壬戌': '癸', '癸亥': '癸'
        };

        return xunShouMap[ganZhi] || '戊';
    } catch (e) {
        console.error('获取旬首出错:', e);
    }
    
    // 默认返回戊
    return '戊';
}

/**
 * 计算暗干分布
 * 暗干是单独排局的天干：把「时干」加到「值使门落宫」，按三奇六仪顺序
 * （戊己庚辛壬癸丁丙乙）以宫数顺序阳顺/阴逆排满九宫。
 * 时干为甲时，甲寄中宫，故以旬首六仪入中5起局。
 * @param {String} shiGan 时干（如 '甲'、'庚'）
 * @param {String} xunShouYi 旬首六仪（时干为甲时用之，如 '庚'）
 * @param {String} zhiShiGongRaw 值使门真实落宫（含中5，未寄坤2）
 * @param {String} type 阴阳遁类型 'yang' 或 'yin'
 * @returns {Object} 暗干分布
 */
function calculateAnGan(shiGan, xunShouYi, zhiShiGongRaw, type) {
    // 三奇六仪顺序
    const SAN_QI_LIU_YI = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙'];
    const anGan = {};

    // 时干之仪：甲不现于盘，取旬首六仪；甲寄中宫五起局，其余以值使落宫起局
    const isJia = shiGan === '甲';
    const shiYi = isJia ? xunShouYi : shiGan;
    const anchor = isJia ? 5 : parseInt(zhiShiGongRaw, 10);
    const startIdx = SAN_QI_LIU_YI.indexOf(shiYi);

    let currentGong = anchor;
    for (let i = 0; i < 9; i++) {
        anGan[currentGong.toString()] = SAN_QI_LIU_YI[(startIdx + i) % 9];

        if (type === 'yin') {
            // 阴遁逆行：宫数递减
            currentGong--;
            if (currentGong === 0) currentGong = 9;
        } else {
            // 阳遁顺行：宫数递增
            currentGong++;
            if (currentGong === 10) currentGong = 1;
        }
    }

    return anGan;
}

/**
 * 获取落宫干支
 * @param {Lunar} lunar 农历对象
 * @param {String} method 排盘方法
 * @returns {String} 干支
 */
function getLuoGongGanZhi(lunar, method) {
    try {
        if (method === '时家') {
            return lunar.getTimeInGanZhi().substring(0, 1); // 只取时干
        } else if (method === '日家') {
            return lunar.getDayInGanZhi().substring(0, 1); // 只取日干
        } else if (method === '月家') {
            return lunar.getMonthInGanZhi().substring(0, 1); // 只取月干
        } else if (method === '年家') {
            return lunar.getYearInGanZhi().substring(0, 1); // 只取年干
        }
    } catch (e) {
        console.error('获取干支出错:', e);
    }
    
    // 默认返回甲
    return '甲';
}

/**
 * 计算奇门遁甲盘
 * @param {Date} date 日期时间
 * @param {Object} options 选项
 * @returns {Object} 排盘结果
 */
function calculate(date, options = {}) {
    const defaultOptions = {
        type: '四柱', // 三元或四柱
        method: '时家', // 时家, 日家, 月家, 年家
        purpose: '综合', // 事业, 财运, 婚姻, 健康, 学业, 综合
        location: '默认位置'
    };
    
    const opts = { ...defaultOptions, ...options };
    
    try {
        // 获取农历信息
        const lunar = Lunar.fromDate(date);
        const solar = Solar.fromDate(date);
        
        // 获取四柱
        const siZhu = {
            year: lunar.getYearInGanZhi(),
            month: lunar.getMonthInGanZhi(),
            day: lunar.getDayInGanZhi(),
            time: lunar.getTimeInGanZhi()
        };
        
        // 计算局数
        const juShu = calculateJuShu(date, opts.method);
        
        // 获取旬首（时辰）
        const xunShou = getXunShou(lunar, opts.method);

        // 获取日柱旬首六仪（用于标记天盘）
        const dayXunShou = getXunShou(lunar, '日家');

        // 获取落宫干
        const luoGongGan = getLuoGongGanZhi(lunar, opts.method);
        
        // 获取空亡信息
        const kongWangZhi = getKongWang(lunar, opts.method);
        const kongWangGong = getKongWangGong(kongWangZhi);

        // 获取驿马星信息
        const maStar = getMaStar(lunar, opts.method);

        // 1. 计算地盘干（根据局数固定排布）
        const diPan = diPanModule.getDiPan(juShu.type, parseInt(juShu.number));

        // 2. 计算天盘干（转盘排法）
        const tianPan = distributeTianPan(diPan, xunShou, luoGongGan, juShu.type);

        // 保留 sanQiLiuYi 为天盘干（兼容旧代码）
        const sanQiLiuYi = tianPan;

        // 排布九星（使用地盘干找值符宫，传入时干计算转动）
        const jiuXingResult = jiuXingModule.distributeJiuXing(diPan, xunShou, luoGongGan);

        // 排布八门（使用地盘干找时干落宫，传入阴阳遁类型）
        const baMenResult = baMenModule.distributeBaMen(jiuXingResult.zhiFuGong, siZhu.time, juShu.type);

        // 排布八神（从值符落宫开始，阳遁顺时针，阴遁逆时针）
        const baShen = baShenModule.distributeBaShen(jiuXingResult.zhiFuLuoGong || jiuXingResult.zhiFuGong, juShu.type);

        // 计算暗干（把时干加到值使门落宫，按三奇六仪顺序阳顺阴逆排满九宫）
        const anGan = calculateAnGan(siZhu.time.charAt(0), xunShou, baMenResult.zhiShiGongRaw, juShu.type);

        // 整合排盘结果
        const pan = {
            basicInfo: {
                date: solar.toFullString(),
                lunarDate: lunar.toString(),
                type: opts.type,
                method: opts.method,
                purpose: opts.purpose,
                location: opts.location
            },
            siZhu,
            juShu,
            xunShou,
            dayXunShou, // 日柱旬首六仪（用于标记天盘）
            luoGongGan,
            sanQiLiuYi,  // 天盘干
            tianPan,     // 天盘干（新增）
            jiuXing: jiuXingResult.jiuXing,
            baMen: baMenResult.baMen,
            baShen,
            diPan,       // 地盘干
            anGan,       // 暗干（门的原始宫位的地盘天干）
            zhiFuGong: jiuXingResult.zhiFuLuoGong || jiuXingResult.zhiFuGong,  // 值符落宫（转动后位置）
            zhiFuYuanGong: jiuXingResult.zhiFuGong,  // 值符原位宫（转动前位置）
            zhiFuXing: jiuXingResult.zhiFuXing,
            zhiShiGong: baMenResult.zhiShiGong,
            zhiShiMen: baMenResult.zhiShiMen,
            kongWangZhi, // 空亡地支
            kongWangGong, // 空亡宫位
            maStar // 驿马星信息
        };

        // 自动解断：宫位断局 + 格局识别 + 综合断语
        const { jiuGongAnalysis, geju, analysis } = jieduanModule.jieduan(pan);
        pan.jiuGongAnalysis = jiuGongAnalysis;
        pan.geju = geju;
        pan.analysis = analysis;

        return pan;
    } catch (e) {
        console.error('奇门遁甲计算出错:', e);
        
        // 返回一个基本的错误对象
        return {
            error: true,
            message: e.message,
            basicInfo: {
                date: date.toLocaleString(),
                type: opts.type,
                method: opts.method,
                purpose: opts.purpose,
                location: opts.location
            }
        };
    }
}

// 导出模块
module.exports = {
    calculate,
    getKongWang,
    getKongWangGong,
    JIU_GONG,
    JIU_XING,
    BA_MEN,
    BA_SHEN,
    distributeSanQiLiuYi,
    jiuXingModule,
    baMenModule,
    baShenModule,
    diPanModule
};
