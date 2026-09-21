/**
 * 奇门遁甲地盘干设置模块
 * 地盘干根据局数排布，是固定不动的底盘
 */

// 三奇六仪顺序（9个）
const SAN_QI_LIU_YI = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙'];

/**
 * 根据阴阳遁和局数计算地盘干分布
 * @param {String} type 'yang' 阳遁 或 'yin' 阴遁
 * @param {Number} num 局数 (1-9)
 * @returns {Object} 地盘干分布
 */
function getDiPan(type, num) {
    const result = {};

    if (type === 'yang') {
        // 阳遁：戊从局数宫起，按九宫数字递增顺排（含中宫5）
        // 例：阳遁6局 6戊→7己→8庚→9辛→1壬→2癸→3丁→4丙→5乙
        let currentGong = num;
        for (let i = 0; i < 9; i++) {
            result[currentGong.toString()] = SAN_QI_LIU_YI[i];
            currentGong++;
            if (currentGong === 10) currentGong = 1;
        }
    } else {
        // 阴遁：戊从局数宫开始，按九宫数字递减顺序排布（包含中宫5）
        // 阴遁2局顺序：2→1→9→8→7→6→5→4→3
        // 对应：戊→己→庚→辛→壬→癸→丁→丙→乙
        let currentGong = num;

        for (let i = 0; i < 9; i++) {
            result[currentGong.toString()] = SAN_QI_LIU_YI[i];

            // 递减，遇到1后跳到9
            currentGong--;
            if (currentGong === 0) currentGong = 9;
        }
    }

    return result;
}

/**
 * 获取基本地盘干分布（阳遁1局的默认分布，保留兼容性）
 * @returns {Object} 基本地盘干分布
 */
function getBasicDiPan() {
    return getDiPan('yang', 1);
}

/**
 * 获取飞宫地盘干（保留兼容性，实际调用 getDiPan）
 * @param {String} type 阴遁或阳遁
 * @param {Number} num 局数 (1-9)
 * @returns {Object} 调整后的地盘干分布
 */
function getFeiGongDiPan(type, num) {
    return getDiPan(type, num);
}

module.exports = {
    getBasicDiPan,
    getFeiGongDiPan,
    getDiPan
};
