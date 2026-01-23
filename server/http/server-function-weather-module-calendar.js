// -----------------------------------------------------------------------------------------------------------------------------------------
// Calendar Module - Swedish calendar, holidays, traditions, and seasonal timing
// -----------------------------------------------------------------------------------------------------------------------------------------
//
// This module is CALENDAR-FIRST: dates, events, observances, and timing are primary.
// Weather conditions are secondary context for the calendar events.
//
//   - Swedish holidays and red days (röda dagar)
//   - Traditional folk calendar and name days
//   - Seasonal activities and their timing
//   - Cultural events and celebrations
//   - Time-of-day context and diurnal patterns
//   - Activity windows and outdoor timing
//
// -----------------------------------------------------------------------------------------------------------------------------------------

// const helpers = require('./server-function-weather-helpers.js');
// const toolsData = require('./server-function-weather-tools-data.js');

/* eslint-disable sonarjs/cognitive-complexity */

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// Swedish public holidays (röda dagar) - month is 0-indexed, -1 means moveable, calculated at runtime
const HOLIDAYS = [
    { month: 0, day: 1, name: 'Nyårsdagen', message: 'Gott Nytt År! (Happy New Year)' },
    { month: 0, day: 6, name: 'Trettondedag jul', message: 'Trettondedag jul (Epiphany) - end of Christmas holidays' },
    { month: 4, day: 1, name: 'Första maj', message: 'Första maj (May Day) - labor day, spring celebrations' },
    { month: 5, day: 6, name: 'Sveriges nationaldag', message: 'Sveriges nationaldag - Swedish National Day' },
    { month: 11, day: 24, name: 'Julafton', message: 'JULAFTON - God Jul! Main Swedish Christmas celebration', extra: 'Kalle Anka (Donald Duck) at 3pm, julbord, and tomten' },
    { month: 11, day: 25, name: 'Juldagen', message: 'Juldagen - visiting family, leftover julbord' },
    { month: 11, day: 26, name: 'Annandag jul', message: 'Annandag jul (Boxing Day)' },
    { month: 11, day: 31, name: 'Nyårsafton', message: 'Nyårsafton - fireworks at midnight, Gott Nytt År!' },
];

// Traditional days (not public holidays but culturally significant)
const TRADITIONAL_DAYS = [
    // January
    { month: 0, day: 13, name: 'Tjugondag Knut', message: 'Tjugondag Knut - time to "plunder" and take down the Christmas tree' },
    // February
    { month: 1, day: 14, name: 'Alla hjärtans dag', message: "Alla hjärtans dag (Valentine's Day)" },
    // Fettisdagen is moveable - handled separately
    // March
    { month: 2, day: 25, name: 'Våffeldagen', message: 'Våffeldagen (Waffle Day) - bake waffles!' },
    { month: 2, day: 25, name: 'Vårfrudagen', message: 'Vårfrudagen (Lady Day) - traditional start of spring work' },
    // April
    { month: 3, day: 1, name: 'Första april', message: 'Första april - watch out for april fools!' },
    { month: 3, day: 30, name: 'Valborgsmässoafton', message: 'Valborgsmässoafton - welcome spring with bonfires and song!' },
    // August
    { month: 7, day: 8, name: 'Kräftpremiär', message: 'Kräftpremiär tradition - crayfish season begins!' },
    // October
    { month: 9, day: 4, name: 'Kanelbullens dag', message: 'Kanelbullens dag - eat cinnamon buns!' },
    { month: 9, day: 31, name: 'Halloween', message: 'Halloween - spöken och godis!' },
    // November
    { month: 10, day: 11, name: 'Mårten Gås', message: "Mårten Gås (St. Martin's Day) - eat goose, especially in Skåne" },
    // December
    { month: 11, day: 10, name: 'Nobeldagen', message: 'Nobeldagen - Nobel Prize ceremony in Stockholm' },
    { month: 11, day: 13, name: 'Luciadagen', message: 'LUCIADAGEN - Lucia processions, lussekatter, and glögg', extra: '"ljus i mörka natten" - light in the dark night' },
    { month: 11, day: 23, name: 'Dan före dan före', message: 'Dan före dan före dopparedan - two days until Christmas!' },
];

// Seasonal periods with weather-dependent messages
const SEASONAL_PERIODS = [
    // School breaks
    { startMonth: 1, startDay: 15, endMonth: 1, endDay: 28, name: 'sportlov', message: 'Sportlov period (winter school break)' },
    { startMonth: 9, startDay: 25, endMonth: 9, endDay: 31, name: 'höstlov', message: 'Höstlov period (autumn school break)' },
    // Cultural seasons
    { startMonth: 5, startDay: 5, endMonth: 5, endDay: 15, name: 'student', message: 'Student season - watch for white caps and celebrating graduates' },
    { startMonth: 6, startDay: 1, endMonth: 6, endDay: 31, name: 'industrisemester', message: 'Industrisemester - Sweden on summer holiday' },
    { startMonth: 7, startDay: 8, endMonth: 7, endDay: 31, name: 'kräftskiva', message: 'Kräftskiva season - time for crayfish parties!' },
    { startMonth: 7, startDay: 15, endMonth: 7, endDay: 25, name: 'skolstart', message: 'Skolstart - schools beginning new term' },
    { startMonth: 8, startDay: 15, endMonth: 9, endDay: 15, name: 'ruska', message: 'Ruska - autumn foliage season' },
    // Light periods
    { startMonth: 5, startDay: 15, endMonth: 6, endDay: 15, name: 'white_nights', message: 'White nights period - twilight all night' },
    { startMonth: 0, startDay: 1, endMonth: 0, endDay: 15, name: 'kaamos', message: 'Kaamos period continues - embrace the winter darkness' },
    { startMonth: 11, startDay: 10, endMonth: 11, endDay: 24, name: 'darkest', message: 'Darkest period of year - light returns soon' },
];

// Equinoxes and solstices (approximate dates)
const ASTRONOMICAL_EVENTS = [
    { month: 2, startDay: 19, endDay: 22, message: 'Vårdagjämning (spring equinox) - day and night equal' },
    { month: 5, startDay: 20, endDay: 23, message: 'Sommarsolstånd (summer solstice) - longest day' },
    { month: 8, startDay: 21, endDay: 24, message: 'Höstdagjämning (autumn equinox) - light and dark equal' },
    { month: 11, startDay: 20, endDay: 23, message: 'Vintersolstånd (winter solstice) - shortest day, light returns' },
];

// Activity seasons with conditions
const ACTIVITY_SEASONS = [
    // Winter activities
    { startMonth: 11, endMonth: 3, name: 'skiing', message: 'Cross-country skiing season', requires: { minSnow: 15 } },
    { startMonth: 0, endMonth: 2, name: 'ice_fishing', message: 'Ice fishing season', requires: { minIce: 15 } },
    { startMonth: 11, endMonth: 2, name: 'ice_skating', message: 'Natural ice skating season', requires: { minIce: 10, maxSnow: 5 } },
    // Summer activities
    { startMonth: 5, endMonth: 7, name: 'swimming', message: 'Swimming season', requires: { minTemp: 20 } },
    { startMonth: 4, endMonth: 9, name: 'hiking', message: 'Hiking season' },
    { startMonth: 5, endMonth: 7, name: 'camping', message: 'Camping season' },
    { startMonth: 3, endMonth: 9, name: 'cycling', message: 'Cycling season' },
    // Fishing
    { startMonth: 3, endMonth: 4, name: 'pike_spring', message: "Spring pike fishing - they're in the shallows" },
    { startMonth: 8, endMonth: 10, name: 'pike_fall', message: 'Autumn pike fishing - excellent season' },
    { startMonth: 7, endMonth: 8, name: 'crayfish', message: 'Crayfish season' },
];

const HOURS = {
    DEEP_NIGHT: { start: 1, end: 4 },
    PRE_DAWN: { start: 4, end: 6 },
    EARLY_MORNING: { start: 6, end: 8 },
    MORNING: { start: 8, end: 12 },
    MIDDAY: { start: 11, end: 13 },
    AFTERNOON: { start: 13, end: 17 },
    EVENING: { start: 17, end: 21 },
    LATE_EVENING: { start: 21, end: 24 },
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const TEMP = {
    BITTER_COLD: -25,
    VERY_COLD: -15,
    COLD: -5,
    FREEZING: 0,
    COOL: 10,
    MILD: 15,
    WARM: 20,
    HOT: 25,
    VERY_HOT: 30,
};

const WIND = {
    CALM: 2,
    LIGHT: 5,
    MODERATE: 10,
    STRONG: 15,
    GALE: 20,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getEaster(year) {
    // Anonymous Gregorian algorithm
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return { month, day };
}

function getMidsummer(year) {
    // Midsummer Eve is Friday between June 19-25
    const june19 = new Date(year, 5, 19);
    const dayOfWeek = june19.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    return { month: 5, day: 19 + daysUntilFriday };
}

function getAllaHelgonsDag(year) {
    // Saturday between Oct 31 and Nov 6
    const oct31 = new Date(year, 9, 31);
    const dayOfWeek = oct31.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
    const date = new Date(year, 9, 31 + daysUntilSaturday);
    return { month: date.getMonth(), day: date.getDate() };
}

function getFirstAdvent(year) {
    // Fourth Sunday before Christmas (Nov 27 - Dec 3)
    const dec25 = new Date(year, 11, 25);
    const dayOfWeek = dec25.getDay();
    const daysBack = dayOfWeek + 21 + (dayOfWeek === 0 ? 7 : 0);
    const advent = new Date(dec25.getTime() - daysBack * 24 * 60 * 60 * 1000);
    return { month: advent.getMonth(), day: advent.getDate() };
}

function getShrovetuesday(year) {
    // 47 days before Easter
    const easter = getEaster(year);
    const easterDate = new Date(year, easter.month, easter.day);
    const shroveTuesday = new Date(easterDate.getTime() - 47 * 24 * 60 * 60 * 1000);
    return { month: shroveTuesday.getMonth(), day: shroveTuesday.getDate() };
}

function getAdventSunday(year, which) {
    // which = 1, 2, 3, or 4
    const firstAdvent = getFirstAdvent(year);
    const firstDate = new Date(year, firstAdvent.month, firstAdvent.day);
    const targetDate = new Date(firstDate.getTime() + (which - 1) * 7 * 24 * 60 * 60 * 1000);
    return { month: targetDate.getMonth(), day: targetDate.getDate() };
}

function isInPeriod(month, day, startMonth, startDay, endMonth, endDay) {
    const current = month * 100 + day;
    const start = startMonth * 100 + startDay;
    const end = endMonth * 100 + endDay;
    return start <= end ? current >= start && current <= end : current >= start || current <= end;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getSkiConditionScore(temp, snowDepth, windSpeed) {
    let score = 0;

    // Snow depth
    if (snowDepth >= 30) score += 3;
    else if (snowDepth >= 20) score += 2;
    else if (snowDepth >= 10) score += 1;

    // Temperature
    if (temp >= -12 && temp <= -3)
        score += 3; // Perfect
    else if (temp >= -15 && temp <= 0)
        score += 2; // Good
    else if (temp >= -20 && temp <= 2) score += 1; // Acceptable
    // Below -20 or above 2 is poor

    // Wind
    if (windSpeed < 3) score += 2;
    else if (windSpeed < 7) score += 1;

    return score;
}

function getHikingConditionScore(temp, windSpeed, rainRate, cloudCover) {
    let score = 0;

    // Temperature
    if (temp >= 10 && temp <= 20) score += 3;
    else if (temp >= 5 && temp <= 25) score += 2;
    else if (temp >= 0 && temp <= 28) score += 1;

    // Wind
    if (windSpeed !== undefined && windSpeed < 8) score += 2;
    else if (windSpeed !== undefined && windSpeed < 12) score += 1;

    // Rain
    if (rainRate === undefined || rainRate === 0) score += 2;
    else if (rainRate < 1) score += 1;

    // Clouds
    if (cloudCover !== undefined && cloudCover < 50) score += 1;

    return score;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretHolidays({ results, situation, dataCurrent }) {
    const { month, day, hour } = situation;
    const { temp, cloudCover, rainRate, snowDepth } = dataCurrent;

    const year = new Date().getFullYear();

    for (const holiday of HOLIDAYS)
        if (month === holiday.month && day === holiday.day) {
            results.phenomena.push(`calendar: ${holiday.message}`);
            if (holiday.extra) {
                results.phenomena.push(`calendar: ${holiday.extra}`);
            }
            // Weather context for specific holidays
            if (holiday.name === 'Julafton') {
                if (snowDepth > 0) {
                    results.phenomena.push('calendar: vit jul! (white Christmas)');
                } else if (temp > TEMP.COOL) {
                    results.phenomena.push('calendar: green Christmas this year');
                }
            }
            if (holiday.name === 'Nyårsdagen' && temp < TEMP.COLD) {
                results.phenomena.push("calendar: crisp New Year's Day - perfect for a winter walk");
            }
        }

    for (const tradition of TRADITIONAL_DAYS)
        if (month === tradition.month && day === tradition.day) {
            results.phenomena.push(`calendar: ${tradition.message}`);
            if (tradition.extra) {
                results.phenomena.push(`calendar: ${tradition.extra}`);
            }
            // Weather context for specific traditions
            if (tradition.name === 'Valborgsmässoafton') {
                if (temp > TEMP.COOL) {
                    results.phenomena.push('calendar: good weather for outdoor Valborg celebrations');
                } else if (temp < TEMP.FREEZING) {
                    results.phenomena.push('calendar: cold Valborg - bundle up for the bonfire');
                }
            }
        }

    for (const period of SEASONAL_PERIODS)
        if (isInPeriod(month, day, period.startMonth, period.startDay, period.endMonth, period.endDay)) {
            results.phenomena.push(`calendar: ${period.message}`);
            // Weather context for specific periods
            if (period.name === 'sportlov' && snowDepth > 20 && temp < TEMP.FREEZING) {
                results.phenomena.push('calendar: excellent conditions for winter sports week');
            }
            if (period.name === 'kräftskiva') {
                if (temp > TEMP.MILD && cloudCover !== undefined && cloudCover < 70 && (rainRate === undefined || rainRate === 0) && hour >= 17) {
                    results.phenomena.push('calendar: perfect evening for outdoor kräftskiva');
                }
            }
        }

    for (const event of ASTRONOMICAL_EVENTS)
        if (month === event.month && day >= event.startDay && day <= event.endDay) {
            results.phenomena.push(`calendar: ${event.message}`);
        }

    // Fettisdagen / Semmeldagen (47 days before Easter)
    const shroveTuesday = getShrovetuesday(year);
    if (month === shroveTuesday.month && day === shroveTuesday.day) {
        results.phenomena.push('calendar: Fettisdagen - eat semlor! (cream buns)');
    }

    // Vasaloppet (first Sunday in March)
    if (month === 2) {
        const vasaSunday = 1 + ((7 - new Date(year, 2, 1).getDay()) % 7);
        if (day === vasaSunday || day === vasaSunday - 1) {
            results.phenomena.push('calendar: Vasaloppet weekend - 90 km ski race from Sälen to Mora');
        }
    }

    // Easter (moveable)
    const easter = getEaster(year);
    if (month === easter.month) {
        if (day === easter.day - 2) {
            results.phenomena.push('calendar: Långfredagen (Good Friday)');
        }
        if (day === easter.day - 1) {
            results.phenomena.push('calendar: Påskafton (Easter Eve) - witches fly to Blåkulla');
        }
        if (day === easter.day) {
            results.phenomena.push('calendar: Påskdagen (Easter Sunday) - Glad Påsk!');
        }
        if (day === easter.day + 1) {
            results.phenomena.push('calendar: Annandag påsk (Easter Monday)');
        }
    }

    // Ascension Day (39 days after Easter)
    const easterDate = new Date(year, easter.month, easter.day);
    const ascension = new Date(easterDate.getTime() + 39 * 24 * 60 * 60 * 1000);
    if (month === ascension.getMonth() && day === ascension.getDate()) {
        results.phenomena.push('calendar: Kristi himmelsfärdsdag (Ascension Day) - long weekend!');
    }
    // Pentecost (49 days after Easter)
    const pentecost = new Date(easterDate.getTime() + 49 * 24 * 60 * 60 * 1000);
    if (month === pentecost.getMonth() && day === pentecost.getDate()) {
        results.phenomena.push('calendar: Pingstdagen (Pentecost)');
    }

    // Mother's Day (last Sunday in May)
    if (month === 4) {
        const lastSunday = 31 - ((new Date(year, 4, 31).getDay() + 7) % 7);
        if (day === lastSunday) {
            results.phenomena.push("calendar: Mors dag (Mother's Day)");
        }
    }

    // Midsummer (Friday June 19-25)
    const midsummer = getMidsummer(year);
    if (month === 5) {
        if (day === midsummer.day) {
            results.phenomena.push('calendar: MIDSOMMARAFTON - dance around the maypole, eat herring and strawberries!');
            if (cloudCover !== undefined && cloudCover < 50) {
                results.phenomena.push('calendar: clear skies for midsummer - perfect!');
            } else if (rainRate > 0) {
                results.phenomena.push('calendar: rainy midsummer - hope it clears for dancing');
            }
        }
        if (day === midsummer.day + 1) {
            results.phenomena.push("calendar: Midsommardagen - recovering from yesterday's celebration");
        }
    }

    // Surströmming premiere (third Thursday of August)
    if (month === 7) {
        const firstDay = new Date(year, 7, 1).getDay();
        const firstThursday = firstDay <= 4 ? 5 - firstDay : 12 - firstDay;
        const thirdThursday = firstThursday + 14;
        if (day === thirdThursday) {
            results.phenomena.push('calendar: Surströmmingspremiär - fermented herring season opens');
        }
    }

    // Alla helgons dag (Saturday Oct 31 - Nov 6)
    const allaHelgon = getAllaHelgonsDag(year);
    if (month === allaHelgon.month && day === allaHelgon.day) {
        results.phenomena.push('calendar: Alla helgons dag - visit graves and light candles');
    }

    // Father's Day (second Sunday in November)
    if (month === 10) {
        const firstDay = new Date(year, 10, 1).getDay();
        const secondSunday = (firstDay === 0 ? 1 : 8 - firstDay) + 7;
        if (day === secondSunday) {
            results.phenomena.push("calendar: Fars dag (Father's Day)");
        }
    }

    // Advent Sundays
    if (month === 10 || month === 11) {
        for (let i = 1; i <= 4; i++) {
            const advent = getAdventSunday(year, i);
            if (month === advent.month && day === advent.day) {
                results.phenomena.push(`calendar: ${['första', 'andra', 'tredje', 'fjärde'][i - 1]} advent - light ${i} candle${i > 1 ? 's' : ''}`);
            }
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// SEASONAL TIMING: Light, Darkness, and Seasonal Context
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSeasonalTiming({ results, situation, dataCurrent }) {
    const { month, day, hour, daylight, season } = situation;
    const { temp, cloudCover } = dataCurrent;

    // =====================================================================
    // LIGHT AND DARKNESS PERIODS
    // =====================================================================

    // White nights period
    if (month === 5 && day >= 1 && day <= 30) {
        if (daylight?.daylightHours > 18) {
            results.phenomena.push('light: white nights - never truly dark');
        }
        if (!daylight?.astronomicalDuskDecimal) {
            results.phenomena.push('light: no astronomical darkness - faint stars not visible');
        }
    }

    // Darkest period
    if ((month === 11 && day >= 10) || (month === 0 && day <= 10)) {
        if (daylight?.daylightHours < 6) {
            results.phenomena.push(`light: darkest time of year - only ${daylight.daylightHours.toFixed(1)} hours daylight`);
        }
        if (month === 11 && day >= 18 && day <= 24) {
            results.phenomena.push('light: solstice darkness - light returns soon');
        }
    }

    // Daylight progress markers
    if (month === 0 && day >= 15 && day <= 20) {
        results.phenomena.push('light: days noticeably lengthening - hope returning');
    }
    if (month === 5 && day >= 18 && day <= 22) {
        results.phenomena.push('light: longest days of year - midsummer light');
    }

    // =====================================================================
    // SUMMER PHENOMENA
    // =====================================================================

    if (season === 'summer' || (month >= 5 && month <= 7)) {
        if (hour >= 20 && daylight?.isDaytime) {
            results.phenomena.push('summer: long summer evening');
            if (hour >= 21 && temp > TEMP.MILD) {
                results.phenomena.push('summer: warm summer evening - perfect for outdoor dining');
            }
        }

        if (hour >= 22 && (daylight?.phase === 'civil_dusk' || daylight?.isDaytime)) {
            results.phenomena.push('summer: lingering Nordic twilight');
        }

        if (hour >= 2 && hour <= 4 && daylight?.isDaytime) {
            results.phenomena.push('summer: early summer dawn - the night was brief');
        }
    }

    // =====================================================================
    // WINTER PHENOMENA
    // =====================================================================

    if (season === 'winter' || month >= 10 || month <= 2) {
        if (!daylight?.isDaytime && hour >= 15 && hour <= 17) {
            results.phenomena.push('winter: early winter darkness settling in');
        }

        if (daylight?.isDaytime && hour >= 10 && hour <= 14) {
            if (cloudCover !== undefined && cloudCover < 30) {
                results.phenomena.push('winter: precious winter sunshine - enjoy!');
            } else if (cloudCover !== undefined && cloudCover > 80) {
                results.phenomena.push('winter: grey winter daylight');
            }
        }
    }

    // =====================================================================
    // TRANSITIONAL SEASONS
    // =====================================================================

    // Spring awakening
    if (month === 2 && day >= 15) {
        if (daylight?.daylightHours > 11) {
            results.phenomena.push('spring: light returning rapidly now');
        }
    }

    if (month === 3 && temp > TEMP.COOL) {
        results.phenomena.push('spring: vårkänslor (spring feelings) weather');
    }

    // Autumn darkening
    if (month === 9 && day >= 15) {
        results.phenomena.push('autumn: nights drawing in quickly');
    }

    if (month === 10 && daylight?.daylightHours < 9) {
        results.phenomena.push('autumn: approaching winter darkness');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// TIME OF DAY: Diurnal Patterns and Daily Rhythms
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretTimeOfDay({ results, situation, dataCurrent }) {
    const { hour, daylight, month } = situation;
    const { temp, humidity, windSpeed } = dataCurrent;

    // =====================================================================
    // TIME PERIODS
    // =====================================================================

    if (hour >= HOURS.DEEP_NIGHT.start && hour < HOURS.DEEP_NIGHT.end) {
        results.phenomena.push('time: deep night hours');
    }

    if (hour >= HOURS.PRE_DAWN.start && hour < HOURS.PRE_DAWN.end) {
        if (daylight?.phase === 'astronomical_dawn' || daylight?.phase === 'nautical_dawn') {
            results.phenomena.push('time: pre-dawn twilight beginning');
        } else if (!daylight?.isDaytime) {
            results.phenomena.push('time: pre-dawn darkness');
        }
    }

    if (hour >= HOURS.MIDDAY.start && hour < HOURS.MIDDAY.end) {
        if (daylight?.isDaytime) {
            results.phenomena.push('time: solar noon period');
        }
    }

    if (hour >= HOURS.EVENING.start && hour < HOURS.LATE_EVENING.start) {
        if (month >= 5 && month <= 7 && daylight?.isDaytime) {
            results.phenomena.push('time: summer evening - still bright');
        } else if (!daylight?.isDaytime) {
            results.phenomena.push('time: evening hours');
        }
    }

    // =====================================================================
    // DAILY TEMPERATURE PATTERNS
    // =====================================================================

    // Near daily minimum
    if (hour >= 4 && hour <= 6 && !daylight?.isDaytime) {
        results.phenomena.push('time: coldest hours of the day');
    }

    // Approaching daily maximum
    if (hour >= 13 && hour <= 15 && daylight?.isDaytime) {
        results.phenomena.push('time: warmest hours of the day');
    }

    // =====================================================================
    // MORNING CONDITIONS
    // =====================================================================

    if (hour >= 6 && hour <= 9) {
        // Frost
        if (temp <= TEMP.FREEZING && temp > -5 && humidity > 80) {
            results.phenomena.push('morning: hoar frost forming');
        }

        // Fog
        if (humidity > 90 && windSpeed !== undefined && windSpeed < WIND.CALM && temp > -5 && temp < TEMP.COOL) {
            results.phenomena.push('morning: fog conditions');
        }

        // Ice on roads
        if (temp > -2 && temp < 2 && humidity > 85) {
            results.phenomena.push('morning: black ice risk on roads - drive carefully');
        }
    }

    // =====================================================================
    // SWEDISH FIKA TIME
    // =====================================================================

    // Traditional fika times
    if (hour === 10 || hour === 15) {
        results.phenomena.push('time: fika time!');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// ACTIVITIES: Seasonal Activities and Outdoor Timing
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretActivities({ results, situation, dataCurrent }) {
    const { month, day, hour, daylight } = situation;
    const { temp, windSpeed, snowDepth, rainRate, cloudCover, iceDepth } = dataCurrent;

    // =====================================================================
    // ACTIVITY SEASONS (driven by ACTIVITY_SEASONS array)
    // =====================================================================

    for (const activity of ACTIVITY_SEASONS) {
        // Check if we're in the right time of year
        if (!isInPeriod(month, day, activity.startMonth, 1, activity.endMonth, 28)) continue;

        // Check requirements if any
        const req = activity.requires || {};
        let conditionsMet = true;
        // let conditionsFailed = [];

        if (req.minSnow !== undefined && (snowDepth === undefined || snowDepth < req.minSnow)) {
            conditionsMet = false;
            // conditionsFailed.push('insufficient snow');
        }
        if (req.maxSnow !== undefined && snowDepth !== undefined && snowDepth > req.maxSnow) {
            conditionsMet = false;
            // conditionsFailed.push('too much snow');
        }
        if (req.minIce !== undefined && (iceDepth === undefined || iceDepth < req.minIce)) {
            conditionsMet = false;
            // conditionsFailed.push('insufficient ice');
        }
        if (req.minTemp !== undefined && temp < req.minTemp) {
            conditionsMet = false;
            // conditionsFailed.push('too cold');
        }

        if (conditionsMet) {
            results.phenomena.push(`activity: ${activity.message}`);
        }
    }

    // =====================================================================
    // DETAILED SKIING CONDITIONS (beyond basic season check)
    // =====================================================================

    if (snowDepth !== undefined && snowDepth >= 15) {
        const skiScore = getSkiConditionScore(temp, snowDepth, windSpeed || 0);
        if (skiScore >= 7) {
            results.phenomena.push('activity: excellent skiing conditions!');
        } else if (skiScore >= 5) {
            results.phenomena.push('activity: good skiing conditions');
        }

        // Specific snow conditions
        if (temp >= -12 && temp <= -5) {
            results.phenomena.push('activity: perfect temperature for skiing - fast snow');
        } else if (temp > -2 && temp < 2) {
            results.phenomena.push('activity: sticky snow - waxing challenging');
        } else if (temp < -15) {
            results.phenomena.push('activity: very cold for skiing - dress in layers');
        }

        // Spring skiing
        if ((month === 2 || month === 3) && temp > TEMP.FREEZING && hour >= 10) {
            results.phenomena.push('activity: spring skiing - slushy afternoon snow');
        }
        if ((month === 2 || month === 3) && temp < -3 && hour >= 7 && hour <= 10) {
            results.phenomena.push('activity: morning crust - excellent for ski touring');
        }
    }

    // =====================================================================
    // DETAILED ICE CONDITIONS (beyond basic season check)
    // =====================================================================

    if (iceDepth !== undefined) {
        if (iceDepth < 5) {
            results.phenomena.push('activity: ice too thin - EXTREMELY DANGEROUS');
        } else if (iceDepth < 10) {
            results.phenomena.push('activity: ice forming - stay off!');
        } else if (iceDepth >= 10 && iceDepth < 15) {
            results.phenomena.push('activity: ice may support walking - verify locally first');
        } else if (iceDepth >= 15) {
            results.phenomena.push('activity: ice conditions good - follow local guidelines');

            // Ice skating specifics
            if (snowDepth !== undefined && snowDepth < 3 && temp < -3) {
                results.phenomena.push('activity: natural ice skating possible - clear ice!');
            }

            // Ice fishing timing
            if (hour >= 6 && hour <= 10) {
                results.phenomena.push('activity: morning is best for ice fishing');
            }
        }
    }

    // =====================================================================
    // DETAILED HIKING/OUTDOOR CONDITIONS
    // =====================================================================

    if (month >= 4 && month <= 9) {
        const hikingScore = getHikingConditionScore(temp, windSpeed, rainRate, cloudCover);
        if (hikingScore >= 7) {
            results.phenomena.push('activity: excellent hiking conditions');
        } else if (hikingScore >= 5) {
            results.phenomena.push('activity: good hiking conditions');
        } else if (rainRate !== undefined && rainRate > 2) {
            results.phenomena.push('activity: wet hiking - waterproofs needed');
        }
    }

    // =====================================================================
    // SPECIFIC ACTIVITY TIMING
    // =====================================================================

    // Sauna and ice swimming
    if (temp < -5 && hour >= 16 && hour <= 21) {
        results.phenomena.push('activity: perfect conditions for bastubad och vinterbad (sauna and ice swimming)');
    }

    // Swimming specifics
    if (month >= 5 && month <= 7 && temp > TEMP.WARM) {
        if (windSpeed !== undefined && windSpeed < WIND.MODERATE && temp > TEMP.HOT) {
            results.phenomena.push('activity: perfect beach day');
        }
    }

    // Camping specifics
    if (month >= 5 && month <= 7 && temp >= TEMP.COOL && temp <= TEMP.HOT) {
        if (windSpeed !== undefined && windSpeed < WIND.MODERATE) {
            if (hour >= 18 && hour <= 22) {
                results.phenomena.push('activity: lovely evening for camping');
            }
            if (!daylight?.astronomicalDuskDecimal) {
                results.phenomena.push('activity: white night camping - no darkness');
            }
        }
    }

    // Cycling
    if (temp > TEMP.COOL && temp < TEMP.VERY_HOT && (rainRate === undefined || rainRate === 0)) {
        if (windSpeed !== undefined && windSpeed < WIND.STRONG) {
            results.phenomena.push('activity: good cycling weather');
        }
    }

    // Grilling/outdoor dining
    if (temp > TEMP.MILD && (rainRate === undefined || rainRate === 0) && hour >= 17 && hour <= 21) {
        results.phenomena.push('activity: perfect evening for grilling');
    }

    // Fishing timing (applies to multiple fishing seasons)
    if ((hour >= 4 && hour <= 9) || (hour >= 17 && hour <= 21)) {
        if ((rainRate === undefined || rainRate < 2) && (windSpeed === undefined || windSpeed < WIND.STRONG)) {
            if ((month >= 3 && month <= 4) || (month >= 8 && month <= 10)) {
                results.phenomena.push('activity: good fishing time - dawn/dusk feeding');
            }
        }
    }

    // =====================================================================
    // AURORA VIEWING
    // =====================================================================

    if (!daylight?.isDaytime && (month >= 8 || month <= 3)) {
        if (cloudCover !== undefined && cloudCover < 30 && (hour >= 21 || hour <= 3)) {
            results.phenomena.push('activity: conditions suitable for aurora watching');
        }
    }

    // =====================================================================
    // GARDENING
    // =====================================================================

    if (month >= 4 && month <= 9) {
        if (temp >= TEMP.COOL && temp <= TEMP.HOT && (rainRate === undefined || rainRate === 0)) {
            if (hour >= 8 && hour <= 11) {
                results.phenomena.push('activity: good morning for garden work');
            }
            if (hour >= 16 && hour <= 19) {
                results.phenomena.push('activity: pleasant evening for gardening');
            }
        }

        // Watering time
        if (hour >= 19 && hour <= 21 && temp > TEMP.MILD && (rainRate === undefined || rainRate === 0)) {
            results.phenomena.push('activity: good time to water the garden');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// CONDITIONS: Weather Conditions for Calendar Context
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretConditions({ results, situation, dataCurrent, weatherData, store }) {
    const { month, hour, season, windChill, heatIndex, dewPoint, daylight } = situation;
    const { temp, humidity, windSpeed, pressure, rainRate, snowDepth, cloudCover } = dataCurrent;
    const state = store.calendar;

    // =====================================================================
    // TEMPERATURE EXTREMES
    // =====================================================================

    // Severe cold
    if (temp < TEMP.BITTER_COLD) {
        results.phenomena.push('conditions: bitter arctic cold - limit outdoor exposure');
        if (windChill !== undefined && windChill < -30) {
            results.phenomena.push(`conditions: dangerous wind chill ${Math.round(windChill)}°C - frostbite risk`);
        }
    } else if (temp < TEMP.VERY_COLD) {
        results.phenomena.push('conditions: very cold Nordic winter day');
    }

    // Unusual warmth
    if (season === 'winter' && temp > 5) {
        results.phenomena.push('conditions: unusually mild for winter');
        if (temp > TEMP.COOL) {
            results.phenomena.push('conditions: winter thaw in progress');
        }
    }

    // Summer heat (unusual for Sweden)
    if (temp > TEMP.VERY_HOT) {
        results.phenomena.push('conditions: exceptional heat for Sweden');
        if (heatIndex !== undefined && heatIndex > 32) {
            results.phenomena.push('conditions: heat stress - seek shade, hydrate');
        }
    }

    // =====================================================================
    // SNOW CONDITIONS
    // =====================================================================

    if (snowDepth !== undefined) {
        // Fresh snow detection
        const snowChange = snowDepth - state.snowDepthLast;
        if (snowChange > 10) {
            results.phenomena.push(`conditions: fresh snow - ${snowChange}cm of new snow!`);
        } else if (snowChange < -10 && month >= 2 && month <= 4) {
            results.phenomena.push(`conditions: rapid snowmelt - ${Math.abs(snowChange)}cm melted`);
        }
        state.snowDepthLast = snowDepth;
        // First snow of season
        if (snowDepth > 0 && !state.snowDepthFirstRecorded && month >= 9) {
            results.phenomena.push('conditions: first snow of the season!');
            state.snowDepthFirstRecorded = true;
        }
        // Deep snow
        if (snowDepth > 100) {
            results.phenomena.push(`conditions: deep snow cover - ${snowDepth}cm`);
        }
    }

    // Reset first snow flag in spring
    if (month === 4 && snowDepth === 0) {
        state.snowDepthFirstRecorded = false;
    }

    // =====================================================================
    // VISIBILITY CONDITIONS
    // =====================================================================

    // Fog
    if (humidity > 95 && temp > -5 && temp < TEMP.MILD && windSpeed !== undefined && windSpeed < WIND.CALM) {
        results.phenomena.push('conditions: fog - poor visibility');
    }

    // Radiation fog
    if (!daylight?.isDaytime && humidity > 90 && windSpeed !== undefined && windSpeed < 2 && cloudCover !== undefined && cloudCover < 30) {
        if (temp < dewPoint + 3) {
            results.phenomena.push('conditions: radiation fog forming');
        }
    }

    // Blowing snow
    if (snowDepth !== undefined && snowDepth > 0 && windSpeed !== undefined && windSpeed > WIND.STRONG) {
        results.phenomena.push('conditions: blowing snow - reduced visibility');
    }

    // =====================================================================
    // ICE AND FROST
    // =====================================================================

    // Black ice
    if (temp > -2 && temp < 2 && humidity > 80) {
        if ((hour >= 5 && hour <= 9) || (hour >= 17 && hour <= 22)) {
            results.phenomena.push('conditions: black ice risk - drive with care');
        }
    }

    // Freezing rain
    if (temp > TEMP.FREEZING && temp < 3 && rainRate !== undefined && rainRate > 0) {
        const period2h = weatherData?.getPeriod?.('2h');
        if (period2h?.entries?.some((e) => e.temp < TEMP.FREEZING)) {
            results.phenomena.push('conditions: freezing rain risk - extreme ice danger');
        }
    }

    // Rime ice
    if (temp < -5 && humidity > 95 && windSpeed !== undefined && windSpeed > WIND.LIGHT) {
        results.phenomena.push('conditions: rime ice forming on surfaces');
    }

    // Diamond dust
    if (temp < TEMP.VERY_COLD && humidity > 80 && windSpeed !== undefined && windSpeed < 2 && daylight?.isDaytime) {
        results.phenomena.push('conditions: diamond dust - ice crystals sparkling in the air');
    }

    // =====================================================================
    // PRESSURE AND FRONTS
    // =====================================================================

    // Weather fronts
    const period2h = weatherData?.getPeriod?.('2h');
    if (pressure !== undefined && period2h?.entries?.length > 0) {
        const oldPressure = period2h.entries[0]?.pressure;
        if (oldPressure !== undefined) {
            const pressureChange = pressure - oldPressure;
            if (pressureChange < -5) {
                results.phenomena.push('conditions: weather front approaching');
            } else if (pressureChange > 5) {
                results.phenomena.push('conditions: high pressure building - weather improving');
            }
        }
    }

    // Stable high pressure
    if (pressure > 1030) {
        if (season === 'winter') {
            results.phenomena.push('conditions: blocking high - persistent cold');
        } else if (season === 'summer') {
            results.phenomena.push('conditions: stable summer high - settled weather');
        }
    }

    // =====================================================================
    // SEASONAL ANOMALIES
    // =====================================================================

    // Temperature anomalies - simplified seasonal norms
    const seasonalExpected = {
        winter: { min: -15, max: -2 },
        spring: { min: 0, max: 12 },
        summer: { min: 12, max: 22 },
        autumn: { min: 2, max: 10 },
    };
    const expected = seasonalExpected[season];
    if (expected) {
        if (temp > expected.max + 10) {
            results.phenomena.push(`conditions: exceptionally warm for ${season}`);
        } else if (temp < expected.min - 10) {
            results.phenomena.push(`conditions: exceptionally cold for ${season}`);
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// COMFORT: Human Comfort and Exposure
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretComfort({ results, situation, dataCurrent }) {
    const { hour, daylight, windChill, heatIndex, comfort } = situation;
    const { temp, windSpeed } = dataCurrent;

    // Only during waking hours
    if (hour < 6 || hour > 22) return;

    // =====================================================================
    // COMFORT LEVELS
    // =====================================================================

    if (comfort === 'very uncomfortable') {
        if (temp < TEMP.FREEZING) {
            results.phenomena.push('comfort: harsh conditions - limit exposure time');
        } else if (temp > TEMP.HOT) {
            results.phenomena.push('comfort: oppressive heat - stay hydrated');
        }
    }

    // Wind chill
    if (windChill !== undefined && windChill < -15 && temp > windChill + 5) {
        results.phenomena.push(`comfort: feels like ${Math.round(windChill)}°C with wind chill`);
    }

    // Heat index
    if (heatIndex !== undefined && heatIndex > 28 && temp < heatIndex - 3) {
        results.phenomena.push(`comfort: feels like ${Math.round(heatIndex)}°C with humidity`);
    }

    // =====================================================================
    // OUTDOOR WORK CONDITIONS
    // =====================================================================

    if (daylight?.isDaytime) {
        if (temp >= TEMP.COOL && temp <= TEMP.WARM && windSpeed !== undefined && windSpeed < WIND.MODERATE) {
            results.phenomena.push('comfort: pleasant conditions for outdoor work');
        }
    }

    // =====================================================================
    // LAYERING ADVICE
    // =====================================================================

    if (temp < TEMP.FREEZING && temp > TEMP.COLD) {
        results.phenomena.push('comfort: dress in layers for the cold');
    }

    if (temp < TEMP.COLD) {
        results.phenomena.push('comfort: full winter gear recommended');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ store }) {
    if (!store.calendar)
        store.calendar = {
            // Snow tracking
            snowDepthMax: 0,
            snowDepthLast: 0,
            snowDepthFirstRecorded: false,
            // Ice tracking
            iceDepthLast: 0,
        };

    return {
        interpretHolidays,
        interpretSeasonalTiming,
        interpretTimeOfDay,
        interpretActivities,
        interpretConditions,
        interpretComfort,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
