'use strict';

const {Solar} = require('lunar-javascript');

function assertDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        const error = new TypeError('黄历日期必须是有效的 Date 对象');
        error.code = 'ALMANAC_DATE_INVALID';
        error.statusCode = 400;
        throw error;
    }
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatJieQi(jieQi) {
    if (!jieQi) return null;
    const solar = jieQi.getSolar();
    return {
        name: jieQi.getName(),
        at: solar.toYmdHms()
    };
}

function direction(lunar, positionMethod, descriptionMethod) {
    return {
        trigram: lunar[positionMethod](),
        direction: lunar[descriptionMethod]()
    };
}

function getAlmanac(date) {
    assertDate(date);
    const solar = Solar.fromYmdHms(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds()
    );
    const lunar = solar.getLunar();
    const exactJieQi = formatJieQi(lunar.getCurrentJieQi());
    const currentJieQi = exactJieQi || formatJieQi(lunar.getPrevJieQi(true));

    return {
        solar: {
            date: formatDate(date),
            year: solar.getYear(),
            month: solar.getMonth(),
            day: solar.getDay(),
            week: `星期${solar.getWeekInChinese()}`
        },
        lunar: {
            text: lunar.toString(),
            year: lunar.getYear(),
            month: lunar.getMonth(),
            day: lunar.getDay(),
            yearText: lunar.getYearInChinese(),
            monthText: `${lunar.getMonth() < 0 ? '闰' : ''}${lunar.getMonthInChinese()}月`,
            dayText: lunar.getDayInChinese()
        },
        ganzhi: {
            year: lunar.getYearInGanZhi(),
            month: lunar.getMonthInGanZhi(),
            day: lunar.getDayInGanZhi()
        },
        zodiac: lunar.getYearShengXiao(),
        jieqi: {
            today: exactJieQi,
            current: currentJieQi,
            next: formatJieQi(lunar.getNextJieQi(true))
        },
        yi: [...lunar.getDayYi()],
        ji: [...lunar.getDayJi()],
        goodGods: [...lunar.getDayJiShen()],
        badGods: [...lunar.getDayXiongSha()],
        twelveDayOfficer: lunar.getZhiXing(),
        dayType: {
            deity: lunar.getDayTianShen(),
            type: lunar.getDayTianShenType(),
            luck: lunar.getDayTianShenLuck()
        },
        directions: {
            xiShen: direction(lunar, 'getDayPositionXi', 'getDayPositionXiDesc'),
            fuShen: direction(lunar, 'getDayPositionFu', 'getDayPositionFuDesc'),
            caiShen: direction(lunar, 'getDayPositionCai', 'getDayPositionCaiDesc'),
            yangGui: direction(lunar, 'getDayPositionYangGui', 'getDayPositionYangGuiDesc'),
            yinGui: direction(lunar, 'getDayPositionYinGui', 'getDayPositionYinGuiDesc')
        },
        chong: {
            branch: lunar.getDayChong(),
            zodiac: lunar.getDayChongShengXiao(),
            description: lunar.getDayChongDesc()
        },
        sha: lunar.getDaySha(),
        taiShen: lunar.getDayPositionTai(),
        pengZu: [lunar.getPengZuGan(), lunar.getPengZuZhi()],
        naYin: lunar.getDayNaYin(),
        xingXiu: {
            name: lunar.getXiu(),
            luck: lunar.getXiuLuck(),
            element: lunar.getZheng(),
            animal: lunar.getAnimal(),
            palace: lunar.getGong(),
            verse: lunar.getXiuSong()
        },
        liuYao: lunar.getLiuYao(),
        additional: {
            season: lunar.getSeason(),
            moonPhase: lunar.getYueXiang(),
            festivals: [...lunar.getFestivals()],
            otherFestivals: [...lunar.getOtherFestivals()],
            dayLu: lunar.getDayLu(),
            dayNineStar: lunar.getDayNineStar().toString()
        }
    };
}

function createAlmanacService() {
    return {getAlmanac};
}

module.exports = {createAlmanacService, getAlmanac};
