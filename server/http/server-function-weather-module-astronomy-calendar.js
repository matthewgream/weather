// -----------------------------------------------------------------------------------------------------------------------------------------
// Astronomy Calendar Module - Seasonal astronomical events
// -----------------------------------------------------------------------------------------------------------------------------------------
//
//   - Equinoxes (spring/autumn)
//   - Solstices (summer/winter)
//   - Cross-quarter days (Imbolc, Beltane, Lughnasadh, Samhain)
//   - Daylight change rates
//   - Polar phenomena (midnight sun, polar night)
//   - Cultural/seasonal context
//
// -----------------------------------------------------------------------------------------------------------------------------------------

// const helpers = require('./server-function-weather-helpers.js');
const { calculateDaylightChangeRate, calculateTwilightDuration } = require('./server-function-weather-tools-calculators.js');
const toolsAstronomy = require('./server-function-weather-tools-astronomical.js');
const formatter = require('./server-function-weather-tools-format.js');

// -----------------------------------------------------------------------------------------------------------------------------------------

const LOOKAHEAD_DAYS = {
    EQUINOX: 7,
    SOLSTICE: 7,
    CROSS_QUARTER: 7,
};

const LATITUDE = {
    HIGH: 50, // Notable daylight change rates
    VERY_HIGH: 55, // Cultural phenomena (midsummer)
    SUB_ARCTIC: 59.5, // White nights begin
    NEAR_ARCTIC: 60, // Extended darkness/brightness
    ARCTIC_APPROACH: 63, // Near midnight sun / polar twilight
    ARCTIC_CIRCLE: 66.5, // True midnight sun / polar night
};

const DAYLIGHT = {
    EXTENDED: 16, // Hours - notably long day
    MINIMAL: 8, // Hours - notably short day
    VERY_MINIMAL: 5, // Hours - extreme short day
    MIDNIGHT_SUN: 23, // Hours - near 24h daylight
    POLAR_NIGHT: 0.1, // Hours - near 0h daylight
};

const EQUINOCTIAL_GALE_WIND = 15; // m/s threshold

const CROSS_QUARTER_CONTEXT = {
    Imbolc: 'traditional start of spring',
    Beltane: 'traditional start of summer',
    Lughnasadh: 'traditional harvest festival',
    Samhain: 'traditional start of winter',
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretEquinox({ results, situation, dataCurrent }) {
    const { location, date } = situation;
    const { windSpeed } = dataCurrent;

    const equinoxInfo = toolsAstronomy.isNearEquinox(date, location.hemisphere, LOOKAHEAD_DAYS.EQUINOX);
    if (!equinoxInfo.near) return;

    // Primary announcement
    results.phenomena.push(formatter.proximityToString(equinoxInfo.type, equinoxInfo.days));

    // Daylight change information
    results.phenomena.push(
        `daylight: rapidly ${equinoxInfo.type.includes('spring') ? 'increasing' : 'decreasing'}` +
            (location.latitude > LATITUDE.HIGH ? ` (${formatter.secondsToString(calculateDaylightChangeRate(location.latitude), '')}/day)` : '') +
            `, twilight ~${formatter.secondsToString(calculateTwilightDuration(location.latitude), '')}`
    );

    // Equinoctial gales
    if (Math.abs(equinoxInfo.days) <= 14 && windSpeed !== undefined && windSpeed > EQUINOCTIAL_GALE_WIND) results.phenomena.push('weather: equinoctial gales');

    // Equal day/night note
    if (Math.abs(equinoxInfo.days) <= 1) results.phenomena.push('daylight: day and night approximately equal length');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolstice({ results, situation, dataCurrent, store }) {
    const { location, date, hour, daylight, lunar } = situation;
    const { cloudCover, temp } = dataCurrent;

    const solsticeInfo = toolsAstronomy.isNearSolstice(date, location.hemisphere, LOOKAHEAD_DAYS.SOLSTICE);
    if (!solsticeInfo.near) return;

    // Primary announcement
    results.phenomena.push(formatter.proximityToString(solsticeInfo.type, solsticeInfo.days));

    if (!store.astronomy_calendar) store.astronomy_calendar = {};
    if (!store.astronomy_calendar.daylightTracking) store.astronomy_calendar.daylightTracking = { consecutiveBrightNights: 0, consecutiveDarkDays: 0 };

    if (solsticeInfo.type === 'longest day') interpretSummerSolstice(results, store, daylight, location, lunar, cloudCover, solsticeInfo);
    else interpretWinterSolstice(results, store, daylight, location, lunar, cloudCover, temp, hour, solsticeInfo);

    // Track consecutive extreme days
    trackExtremeDaylight(store, daylight, location);
}

function interpretSummerSolstice(results, store, daylight, location, lunar, cloudCover, solsticeInfo) {
    // Extended daylight
    if (daylight?.daylightHours > DAYLIGHT.EXTENDED) results.phenomena.push(`daylight: extended (${formatter.secondsToString(Math.floor(daylight.daylightHours * 60) * 60, '')})`);

    // Latitude-specific phenomena
    if (location.latitude > LATITUDE.ARCTIC_CIRCLE && daylight?.daylightHours >= 24) results.phenomena.push(`polar: true midnight sun (sun never sets)${cloudCover !== undefined && cloudCover < 50 ? ' (visible sun)' : ''}`);
    else if (location.latitude > LATITUDE.ARCTIC_APPROACH) {
        if (daylight?.civilDuskDecimal > 23 || daylight?.civilDawnDecimal < 1) results.phenomena.push('polar: near-midnight sun (civil twilight all night)');
        else results.phenomena.push('polar: extended twilight throughout night');
    } else if (location.latitude > LATITUDE.NEAR_ARCTIC) results.phenomena.push('polar: white nights period (twilight throughout night)');

    // Solstice full moon (rare)
    if (lunar?.phase >= 0.48 && lunar?.phase <= 0.52) results.phenomena.push(`lunar: solstice full moon (rare alignment)${cloudCover !== undefined && cloudCover < 40 ? ' (strawberry moon visible)' : ''}`);

    // Cultural note
    if (location.latitude > LATITUDE.VERY_HIGH && Math.abs(solsticeInfo?.days || 0) <= 3) results.phenomena.push('culture: midsummer celebration period');

    // Consecutive bright nights tracking
    if (location.latitude > LATITUDE.ARCTIC_APPROACH && daylight?.daylightHours > DAYLIGHT.MIDNIGHT_SUN) {
        if (++store.astronomy_calendar.daylightTracking.consecutiveBrightNights > 7)
            results.phenomena.push(`polar: ${formatter.countToString(store.astronomy_calendar.daylightTracking.consecutiveBrightNights)} consecutive midnight sun days`);
    } else if (location.latitude > LATITUDE.ARCTIC_APPROACH) store.astronomy_calendar.daylightTracking.consecutiveBrightNights = 0;
}

function interpretWinterSolstice(results, store, daylight, location, lunar, cloudCover, temp, hour, solsticeInfo) {
    // Minimal daylight
    if (daylight?.daylightHours < DAYLIGHT.MINIMAL) results.phenomena.push(`daylight: minimal (${formatter.secondsToString(Math.floor(daylight.daylightHours * 60) * 60, '')})`);

    // Latitude-specific phenomena
    if (location.latitude > LATITUDE.ARCTIC_CIRCLE && daylight?.daylightHours < DAYLIGHT.POLAR_NIGHT) results.phenomena.push('polar: polar night (sun never rises)');
    else if (location.latitude > LATITUDE.ARCTIC_APPROACH) {
        if (daylight?.daylightHours < 3) results.phenomena.push('polar: near-polar twilight (sun barely above horizon)');
        else results.phenomena.push('polar: extended polar twilight');
    } else if (location.latitude > LATITUDE.NEAR_ARCTIC) results.phenomena.push(`polar: dark period (very short days${hour >= 14 && !daylight?.isDaytime ? ', afternoon darkness' : ''})`);
    else if (location.latitude > LATITUDE.SUB_ARCTIC) results.phenomena.push('polar: extended darkness period');

    // Winter solstice full moon
    if (lunar?.phase >= 0.48 && lunar?.phase <= 0.52) results.phenomena.push(`lunar: winter solstice full moon${cloudCover !== undefined && cloudCover < 40 ? ' (cold moon illuminating snow)' : ''}`);

    // Deep cold
    if (temp !== undefined && temp < -10 && Math.abs(solsticeInfo?.days || 0) <= 7) results.phenomena.push('weather: deep winter cold near solstice');

    // Consecutive dark days tracking
    if (location.latitude > LATITUDE.NEAR_ARCTIC && daylight?.daylightHours < DAYLIGHT.VERY_MINIMAL) {
        if (++store.astronomy_calendar.daylightTracking.consecutiveDarkDays > 7) results.phenomena.push(`polar: ${formatter.countToString(store.astronomy_calendar.daylightTracking.consecutiveDarkDays)} consecutive minimal daylight days`);
    } else if (location.latitude > LATITUDE.NEAR_ARCTIC) store.astronomy_calendar.daylightTracking.consecutiveDarkDays = 0;
}

function trackExtremeDaylight(store, daylight, location) {
    // Reset counters when conditions change
    if (location.latitude > LATITUDE.ARCTIC_APPROACH && daylight?.daylightHours <= DAYLIGHT.MIDNIGHT_SUN) store.astronomy_calendar.daylightTracking.consecutiveBrightNights = 0;
    if (location.latitude > LATITUDE.NEAR_ARCTIC && daylight?.daylightHours >= DAYLIGHT.VERY_MINIMAL) store.astronomy_calendar.daylightTracking.consecutiveDarkDays = 0;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCrossQuarter({ results, situation }) {
    const { location, date, hour, daylight } = situation;

    const crossQuarterInfo = toolsAstronomy.isNearCrossQuarter(date, location.hemisphere, LOOKAHEAD_DAYS.CROSS_QUARTER);
    if (!crossQuarterInfo.near) return;

    let text = formatter.proximityToString(crossQuarterInfo.type, crossQuarterInfo.days);
    const crossQuarterName = Object.keys(CROSS_QUARTER_CONTEXT).find((name) => crossQuarterInfo.type.includes(name));
    if (crossQuarterName) {
        let context = CROSS_QUARTER_CONTEXT[crossQuarterName];
        if (crossQuarterName === 'Beltane' && location.latitude > 58 && hour >= 21 && daylight?.isDaytime) context += ': white nights beginning';
        else if (crossQuarterName === 'Samhain' && hour >= 16 && !daylight?.isDaytime) context += ': early darkness';
        text += ` (${context})`;
    }
    results.phenomena.push(text);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretDaylightProgress({ results, situation }) {
    const { location, date, daylight } = situation;

    if (!daylight?.daylightHours) return;

    // Only report significant changes, not near solstice/equinox
    const equinoxInfo = toolsAstronomy.isNearEquinox(date, location.hemisphere, 14);
    const solsticeInfo = toolsAstronomy.isNearSolstice(date, location.hemisphere, 14);
    if (equinoxInfo.near || solsticeInfo.near) return;

    // High latitude notable daylight hours
    if (location.latitude > LATITUDE.VERY_HIGH) {
        if (daylight.daylightHours > 18 && daylight.daylightHours < 22) results.phenomena.push(`daylight: ${formatter.secondsToString(Math.floor(daylight.daylightHours * 60, '')) * 60} (approaching white nights)`);
        else if (daylight.daylightHours > 5 && daylight.daylightHours < 7) results.phenomena.push(`daylight: ${formatter.secondsToString(Math.floor(daylight.daylightHours * 60, '')) * 60} (deep winter darkness)`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ store }) {
    if (!store.astronomy_calendar) store.astronomy_calendar = {};

    return {
        interpretEquinox,
        interpretSolstice,
        interpretCrossQuarter,
        interpretDaylightProgress,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
