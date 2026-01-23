// -----------------------------------------------------------------------------------------------------------------------------------------
// Astronomy Celestial Module - Meteors, comets, and deep sky objects
// -----------------------------------------------------------------------------------------------------------------------------------------
//
//   - Meteor showers (major and minor)
//   - Sporadic meteors
//   - Fireball season
//   - Comets (periodic returns)
//   - Deep sky objects (galaxies, nebulae, clusters)
//   - Limiting magnitude and visibility
//
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');
const toolsAstronomy = require('./server-function-weather-tools-astronomical.js');
const toolsFormat = require('./server-function-weather-tools-format.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const MAGNITUDE = {
    NAKED_EYE: 6,
    BINOCULAR: 10,
    EXCELLENT_SKY: 5.5,
    GOOD_SKY: 4,
};

const ALTITUDE = {
    MIN_OBSERVABLE: 25, // Minimum altitude for good DSO viewing
    WELL_PLACED: 40,
    NEAR_ZENITH: 60,
};

const METEOR = {
    SPORADIC_RATE: 10, // Typical sporadic rate per hour
    PEAK_WINDOW_DAYS: 2, // Days around peak to report
    FIREBALL_MONTHS: [8, 9, 10], // Autumn fireball season
};

const COMET = {
    VISIBILITY_DAYS: 30, // Days before perihelion to report
    NAKED_EYE_MAG: 6,
    BINOCULAR_MAG: 10,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const METEOR_SHOWERS = [
    // Major showers
    { month: 0, start: 1, end: 5, peak: 3, name: 'Quadrantids', rate: 120, moon: 'any', radiant: 'Quadrantids' },
    { month: 3, start: 16, end: 25, peak: 22, name: 'Lyrids', rate: 18, moon: 'favor_dark', radiant: 'Lyrids' },
    { month: 4, start: 19, end: 28, peak: 6, peakMonth: 5, name: 'Eta Aquarids', rate: 50, moon: 'any', radiant: 'Eta Aquarids' },
    { month: 6, start: 12, endMonth: 7, end: 23, peak: 30, peakMonth: 6, name: 'Southern Delta Aquarids', rate: 25, moon: 'any', radiant: 'Southern Delta Aquarids' },
    { month: 7, start: 17, end: 24, peak: 12, name: 'Perseids', rate: 100, moon: 'favor_dark', radiant: 'Perseids' },
    { month: 9, start: 6, end: 10, peak: 8, name: 'Draconids', rate: 'variable', moon: 'any', radiant: 'Draconids' },
    { month: 9, start: 2, endMonth: 10, end: 7, peak: 21, name: 'Orionids', rate: 20, moon: 'favor_dark', radiant: 'Orionids' },
    { month: 10, start: 7, end: 10, peak: 9, name: 'Southern Taurids', rate: 10, moon: 'any', radiant: 'Southern Taurids' },
    { month: 10, start: 6, end: 30, peak: 12, name: 'Northern Taurids', rate: 15, moon: 'any', radiant: 'Northern Taurids' },
    { month: 10, start: 14, end: 21, peak: 17, name: 'Leonids', rate: 15, moon: 'favor_dark', radiant: 'Leonids' },
    { month: 11, start: 4, end: 17, peak: 14, name: 'Geminids', rate: 120, moon: 'favor_dark', radiant: 'Geminids' },
    { month: 11, start: 17, end: 26, peak: 22, name: 'Ursids', rate: 10, moon: 'any', radiant: 'Ursids' },

    // Minor showers
    { month: 0, start: 15, end: 25, peak: 20, name: 'Gamma Velids', rate: 5, moon: 'any', radiant: 'Gamma Velids' },
    { month: 3, start: 14, end: 30, peak: 24, name: 'Mu Virginids', rate: 7, moon: 'any', radiant: 'Mu Virginids' },
    { month: 4, start: 8, end: 12, peak: 10, name: 'Eta Lyrids', rate: 3, moon: 'any', radiant: 'Eta Lyrids' },
    { month: 5, start: 5, endMonth: 6, end: 2, peak: 27, peakMonth: 5, name: 'June Bootids', rate: 'variable', moon: 'any', radiant: 'June Bootids' },
    { month: 6, start: 3, endMonth: 7, end: 15, peak: 28, peakMonth: 6, name: 'Alpha Capricornids', rate: 5, moon: 'bright_ok', radiant: 'Alpha Capricornids' },
    { month: 8, start: 25, endMonth: 9, end: 20, peak: 9, peakMonth: 9, name: 'September Epsilon Perseids', rate: 5, moon: 'any', radiant: 'September Epsilon Perseids' },
    { month: 11, start: 6, end: 30, peak: 12, name: 'Sigma Hydrids', rate: 5, moon: 'any', radiant: 'Sigma Hydrids' },

    // Additional notable showers
    { month: 0, start: 10, end: 22, peak: 17, name: 'Alpha Centaurids', rate: 6, moon: 'any', radiant: 'Alpha Centaurids' },
    { month: 3, start: 15, endMonth: 4, end: 28, peak: 23, name: 'Pi Puppids', rate: 'variable', moon: 'any', radiant: 'Pi Puppids' },
    { month: 6, start: 25, endMonth: 7, end: 17, peak: 9, peakMonth: 7, name: 'Piscis Austrinids', rate: 5, moon: 'any', radiant: 'Piscis Austrinids' },
    { month: 7, start: 13, end: 26, peak: 18, name: 'Kappa Cygnids', rate: 3, moon: 'bright_ok', radiant: 'Kappa Cygnids' },
    { month: 8, start: 4, end: 15, peak: 9, name: 'Alpha Aurigids', rate: 6, moon: 'any', radiant: 'Alpha Aurigids' },
    { month: 9, start: 7, end: 27, peak: 11, name: 'October Camelopardalids', rate: 5, moon: 'any', radiant: 'October Camelopardalids' },
    { month: 10, start: 5, end: 30, peak: 20, name: 'Alpha Monocerotids', rate: 'variable', moon: 'any', radiant: 'Alpha Monocerotids' },
    { month: 11, start: 3, end: 15, peak: 9, name: 'December Phoenicids', rate: 'variable', moon: 'any', radiant: 'December Phoenicids' },
    { month: 11, start: 10, end: 20, peak: 16, name: 'Comae Berenicids', rate: 3, moon: 'any', radiant: 'Comae Berenicids' },
];

const RADIANT_COORDINATES = {
    // Major showers
    'Quadrantids': { ra: 15.3, dec: 49.5 },
    'Lyrids': { ra: 18.1, dec: 33.6 },
    'Eta Aquarids': { ra: 22.3, dec: -1 },
    'Southern Delta Aquarids': { ra: 22.7, dec: -16.4 },
    'Perseids': { ra: 3.1, dec: 57.8 },
    'Draconids': { ra: 17.5, dec: 54 },
    'Orionids': { ra: 6.3, dec: 15.8 },
    'Southern Taurids': { ra: 3.5, dec: 13.5 },
    'Northern Taurids': { ra: 3.9, dec: 22.3 },
    'Leonids': { ra: 10.1, dec: 21.6 },
    'Geminids': { ra: 7.5, dec: 32.5 },
    'Ursids': { ra: 14.5, dec: 75.8 },
    // Minor showers
    'Gamma Velids': { ra: 8.5, dec: -47 },
    'Mu Virginids': { ra: 12.5, dec: -1 },
    'Eta Lyrids': { ra: 19.1, dec: 43 },
    'June Bootids': { ra: 14.9, dec: 48 },
    'Alpha Capricornids': { ra: 20.1, dec: -10.2 },
    'September Epsilon Perseids': { ra: 3.2, dec: 39.8 },
    'Sigma Hydrids': { ra: 8.5, dec: 2 },
    // Additional showers
    'Alpha Centaurids': { ra: 14, dec: -59 },
    'Pi Puppids': { ra: 7.3, dec: -45 },
    'Piscis Austrinids': { ra: 22.7, dec: -30 },
    'Kappa Cygnids': { ra: 19.2, dec: 59 },
    'Alpha Aurigids': { ra: 5.6, dec: 42 },
    'October Camelopardalids': { ra: 11, dec: 79 },
    'Alpha Monocerotids': { ra: 7.8, dec: -5 },
    'December Phoenicids': { ra: 1.2, dec: -53 },
    'Comae Berenicids': { ra: 12.9, dec: 25 },
};

// Declinations only (for isRadiantFavorable)
const RADIANT_DECLINATIONS = Object.fromEntries(Object.entries(RADIANT_COORDINATES).map(([name, coords]) => [name, coords.dec]));

const COMETS = [
    { name: "Halley's Comet", period: 75.3, lastPerihelion: new Date('1986-02-09'), magnitude: 4 },
    { name: 'Comet Encke', period: 3.3, lastPerihelion: new Date('2023-10-22'), magnitude: 6 },
    { name: 'Comet 67P/Churyumov-Gerasimenko', period: 6.45, lastPerihelion: new Date('2021-11-02'), magnitude: 9 },
];

const DEEP_SKY_OBJECTS = [
    // Galaxies
    { name: 'M31 (Andromeda Galaxy)', ra: 0.71, dec: 41.27, mag: 3.4, bestMonths: [8, 9, 10, 11], type: 'galaxy' },
    { name: 'M51 (Whirlpool Galaxy)', ra: 13.46, dec: 47.2, mag: 8.4, bestMonths: [3, 4, 5, 6], type: 'galaxy' },
    { name: "M81 (Bode's Galaxy)", ra: 9.93, dec: 69.07, mag: 6.9, bestMonths: [1, 2, 3, 4], type: 'galaxy' },
    { name: 'M101 (Pinwheel Galaxy)', ra: 14.05, dec: 54.35, mag: 7.9, bestMonths: [3, 4, 5, 6], type: 'galaxy' },
    { name: 'M104 (Sombrero Galaxy)', ra: 12.67, dec: -11.62, mag: 8, bestMonths: [3, 4, 5], type: 'galaxy' },
    // Nebulae
    { name: 'M42 (Orion Nebula)', ra: 5.59, dec: -5.39, mag: 4, bestMonths: [11, 0, 1, 2], type: 'nebula', showpiece: true },
    { name: 'M57 (Ring Nebula)', ra: 18.89, dec: 33.03, mag: 8.8, bestMonths: [6, 7, 8, 9], type: 'planetary' },
    { name: 'M27 (Dumbbell Nebula)', ra: 19.99, dec: 22.72, mag: 7.4, bestMonths: [7, 8, 9, 10], type: 'planetary' },
    { name: 'M8 (Lagoon Nebula)', ra: 18.06, dec: -24.38, mag: 5, bestMonths: [6, 7, 8], type: 'nebula' },
    { name: 'M20 (Trifid Nebula)', ra: 18.03, dec: -23.03, mag: 6.3, bestMonths: [6, 7, 8], type: 'nebula' },
    { name: 'M16 (Eagle Nebula)', ra: 18.31, dec: -13.78, mag: 6, bestMonths: [6, 7, 8], type: 'nebula' },
    // Globular Clusters
    { name: 'M13 (Hercules Cluster)', ra: 16.69, dec: 36.46, mag: 5.8, bestMonths: [5, 6, 7, 8], type: 'globular', showpiece: true },
    { name: 'M22', ra: 18.61, dec: -23.9, mag: 5.1, bestMonths: [6, 7, 8], type: 'globular' },
    { name: 'M5', ra: 15.31, dec: 2.08, mag: 5.7, bestMonths: [5, 6, 7], type: 'globular' },
    { name: 'M3', ra: 13.7, dec: 28.38, mag: 6.2, bestMonths: [4, 5, 6], type: 'globular' },
    // Open Clusters
    { name: 'M45 (Pleiades)', ra: 3.79, dec: 24.12, mag: 1.6, bestMonths: [10, 11, 0, 1], type: 'cluster', showpiece: true },
    { name: 'M44 (Beehive Cluster)', ra: 8.67, dec: 19.98, mag: 3.7, bestMonths: [1, 2, 3, 4], type: 'cluster' },
    { name: 'Double Cluster', ra: 2.35, dec: 57.14, mag: 4.3, bestMonths: [9, 10, 11, 0], type: 'cluster' },
];

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function isShowerActive(shower, month, day) {
    const monthStart = shower.month;
    const monthEnd = shower.endMonth === undefined ? shower.month : shower.endMonth;
    if (monthStart === monthEnd) {
        return month === monthStart && day >= shower.start && day <= shower.end;
    }
    if (monthStart <= monthEnd) {
        if (month === monthStart) return day >= shower.start;
        if (month === monthEnd) return day <= shower.end;
        return month > monthStart && month < monthEnd;
    }
    // Spans year boundary
    if (month >= monthStart) return day >= shower.start;
    if (month <= monthEnd) return day <= shower.end;
    return false;
}

function getDaysFromPeak(shower, date, year, month, day) {
    if (shower.peakMonth !== undefined) {
        const peakDate = new Date(year, shower.peakMonth, shower.peak);
        if (shower.peakMonth < shower.month && month >= shower.month) peakDate.setFullYear(year + 1);
        return Math.round((peakDate - date) / helpers.constants.MILLISECONDS_PER_DAY);
    }
    if (month === shower.month) return shower.peak - day;
    return undefined;
}

function calculateAdjustedRate(baseRate, radiantAltitude) {
    if (typeof baseRate !== 'number') return baseRate;
    if (radiantAltitude === undefined) return baseRate;
    // Rate adjusted by sin(altitude) - zenithal hourly rate correction
    return Math.round(baseRate * Math.sin(Math.max((radiantAltitude * Math.PI) / 180, 0)));
}

function getMoonInterference(lunarPhase, showerMoonType) {
    const isDarkMoon = lunarPhase <= 0.25 || lunarPhase >= 0.75;
    const isBrightMoon = lunarPhase >= 0.4 && lunarPhase <= 0.6;
    if (isDarkMoon) return 'excellent';
    if (showerMoonType === 'bright_ok') return 'acceptable';
    if (isBrightMoon) return 'interfering';
    return 'moderate';
}

function getSeasonalRecommendation(month) {
    if (month >= 2 && month <= 4) return 'galaxy season - Virgo cluster well placed';
    if (month >= 5 && month <= 7) return 'Milky Way core visible - globular clusters at their best';
    if (month >= 11 || month <= 1) return 'Orion Nebula perfectly placed for viewing';
    return undefined;
}

function calculateDSOAltitude(dso, lst, latitude) {
    let ha = (lst - dso.ra + 24) % 24;
    if (ha > 12) ha -= 24;
    const haRad = (ha * 15 * Math.PI) / 180;
    const latRad = (latitude * Math.PI) / 180;
    const decRad = (dso.dec * Math.PI) / 180;
    return (Math.asin(Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad)) * 180) / Math.PI;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretMeteorShowers({ results, situation, dataCurrent }) {
    const { location, date, year, month, day, hour, daylight, lunar } = situation;
    const { cloudCover } = dataCurrent;

    if (!location?.latitude || !location?.longitude) return;

    // Find active showers
    const activeShowers = METEOR_SHOWERS.filter((shower) => isShowerActive(shower, month, day));

    activeShowers.forEach((shower) => {
        // Check if radiant is visible
        const radiant = toolsAstronomy.isRadiantVisible(RADIANT_COORDINATES, shower.radiant, date, location.latitude, location.longitude);
        if (!radiant.visible) return;

        const daysFromPeak = getDaysFromPeak(shower, date, year, month, day);
        const isPeakDay = month === (shower.peakMonth ?? shower.month) && day === shower.peak;

        // Only report if near peak
        if (!isPeakDay && (daysFromPeak === undefined || Math.abs(daysFromPeak) > METEOR.PEAK_WINDOW_DAYS)) return;

        let text = `meteors: ${shower.name}`;

        if (isPeakDay) {
            text += ' peak tonight';

            // Adjusted rate for radiant altitude
            const adjustedRate = calculateAdjustedRate(shower.rate, radiant.altitude);
            text += typeof adjustedRate === 'number' ? ` (ZHR ~${adjustedRate}/hr from this latitude)` : ' (variable rate)';

            // Moon conditions
            if (cloudCover !== undefined && cloudCover < 30 && lunar?.phase !== undefined)
                switch (getMoonInterference(lunar.phase, shower.moon)) {
                    case 'excellent':
                        text += ' - excellent dark sky conditions';
                        break;
                    case 'acceptable':
                        text += ' - bright meteors visible despite moon';
                        break;
                    case 'interfering':
                        text += ' - moon will interfere';
                        break;
                }
            if (shower.name === 'Geminids' || shower.name === 'Perseids') text += ' (increased fireball activity)';
            if (shower.name === 'Leonids' && daysFromPeak !== undefined && Math.abs(daysFromPeak) < 1) text += ' (outbursts possible)';
        } else {
            text += ' ' + toolsFormat.proximity('peak', daysFromPeak);
        }

        // Radiant position
        if (toolsAstronomy.isRadiantFavorable(RADIANT_DECLINATIONS, shower.radiant, location.latitude)) text += ' [favorable latitude]';
        if (radiant.altitude !== undefined) {
            if (radiant.altitude > 60) text += ' [radiant near zenith]';
            else if (radiant.altitude > 40) text += ' [radiant well-placed]';
            else if (radiant.altitude > 20) text += ' [radiant rising]';
        }

        results.phenomena.push(text);
    });

    // Sporadic meteors when no showers active
    if (activeShowers.length === 0 && hour >= 2 && hour <= 5) {
        results.phenomena.push(`meteors: sporadic rate ~${METEOR.SPORADIC_RATE}/hour (highest before dawn)`);
    }

    // High latitude viewing conditions
    if (location.latitude > 59 && activeShowers.length > 0 && (hour >= 22 || hour <= 4)) {
        if (month >= 8 || month <= 2) {
            results.phenomena.push('meteors: viewing ideal with long dark nights');
        } else if (month >= 5 && month <= 7 && daylight?.astronomicalDuskDecimal && daylight?.astronomicalDawnDecimal) {
            results.phenomena.push(`meteors: viewing window ${toolsFormat.timeFromHM(Math.floor(daylight.astronomicalDuskDecimal))} to ${toolsFormat.timeFromHM(Math.floor(daylight.astronomicalDawnDecimal))}`);
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretFireballSeason({ results, situation }) {
    const { location, month, hour } = situation;

    // Autumn fireball season
    if (!METEOR.FIREBALL_MONTHS.includes(month)) return;
    if (!(hour >= 21 || hour <= 3)) return;

    let text = 'meteors: autumn fireball season (increased bright meteor rate)';
    if (location?.latitude > 55) text += ' - favorable geometry at high latitude';
    results.phenomena.push(text);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretComets({ results, situation }) {
    const { date } = situation;

    COMETS.forEach((comet) => {
        const periodMs = comet.period * helpers.constants.DAYS_PER_YEAR * helpers.constants.MILLISECONDS_PER_DAY;
        // Find next perihelion
        let nextPerihelion = new Date(comet.lastPerihelion);
        while (nextPerihelion < date) nextPerihelion = new Date(nextPerihelion.getTime() + periodMs);
        const daysUntil = Math.round((nextPerihelion - date) / helpers.constants.MILLISECONDS_PER_DAY);
        // Report if within visibility window and bright enough
        if (daysUntil > 0 && daysUntil < COMET.VISIBILITY_DAYS && comet.magnitude < COMET.BINOCULAR_MAG) {
            results.phenomena.push(toolsFormat.proximity(`comets: ${comet.name} perihelion`, daysUntil) + (comet.magnitude < COMET.NAKED_EYE_MAG ? ' (naked eye)' : ' (binoculars)'));
        }
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretDeepSkyConditions({ results, situation, dataCurrent }) {
    const { location, month, lunar, daylight } = situation;
    const { cloudCover, humidity } = dataCurrent;

    // Skip during daytime or heavy clouds
    if (daylight?.isDaytime) return;
    if (cloudCover !== undefined && cloudCover > 20) return;

    if (!location?.latitude || !location?.longitude) return;

    // Calculate limiting magnitude at typical observing altitude (45)
    const limitingMagnitude = toolsAstronomy.calculateLimitingMagnitude(lunar?.brightness || 0, location.lightPollution, humidity, 45);

    // Report circumpolar objects for high latitudes
    if (location.latitude > 55) {
        const circumpolarLimit = 90 - location.latitude;
        const circumpolarCount = DEEP_SKY_OBJECTS.filter((obj) => obj.dec > circumpolarLimit).length;
        if (circumpolarCount > 0 && limitingMagnitude > 4) {
            results.phenomena.push(`space: deep sky ${circumpolarCount} circumpolar objects never set`);
        }
    }

    // Report visibility conditions
    if (limitingMagnitude > MAGNITUDE.EXCELLENT_SKY) {
        const recommendation = getSeasonalRecommendation(month);
        results.phenomena.push(`space: deep sky viewing excellent (limiting magnitude ~${limitingMagnitude.toFixed(1)})` + (recommendation ? ` - ${recommendation}` : ''));
    } else if (limitingMagnitude > MAGNITUDE.GOOD_SKY) {
        results.phenomena.push('space: deep sky viewing good for brighter objects');
    } else {
        results.phenomena.push('space: deep sky viewing poor (only brightest objects visible)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretDeepSkyObjects({ results, situation, dataCurrent }) {
    const { location, date, month, lunar, daylight } = situation;
    const { cloudCover, humidity } = dataCurrent;

    // Skip during daytime or heavy clouds
    if (daylight?.isDaytime) return;
    if (cloudCover !== undefined && cloudCover > 20) return;

    if (!location?.latitude || !location?.longitude) return;

    // Calculate limiting magnitude at typical observing altitude (45)
    const limitingMagnitude = toolsAstronomy.calculateLimitingMagnitude(lunar?.brightness || 0, location.lightPollution, humidity, 45);

    // Calculate local sidereal time
    const lst = toolsAstronomy.localSiderealTime(helpers.dateToJulianDateUTC(date), location.longitude) / 15;

    // Find visible DSOs
    const visibleDSOs = DEEP_SKY_OBJECTS.filter((dso) => {
        // Check magnitude
        if (dso.mag > limitingMagnitude) return false;
        // Check season
        if (!dso.bestMonths.includes(month)) return false;
        // Check hour angle (well-placed if HA between -4 and +4 hours)
        let ha = (lst - dso.ra + 24) % 24;
        if (ha > 12) ha -= 24;
        return Math.abs(ha) < 4;
    })
        .map((dso) => ({
            ...dso,
            altitude: calculateDSOAltitude(dso, lst, location.latitude),
        }))
        .filter((dso) => dso.altitude > ALTITUDE.MIN_OBSERVABLE)
        .sort((a, b) => b.altitude - a.altitude);

    if (visibleDSOs.length === 0) return;

    // Group by type and report best of each
    [...new Set(visibleDSOs.map((d) => d.type))].forEach((type) => {
        const best = visibleDSOs.find((d) => d.type === type);
        if (!best) return;
        let text = `space: object ${best.name}`;
        if (best.altitude > ALTITUDE.NEAR_ZENITH) text += ` near zenith (${Math.round(best.altitude)}°)`;
        else if (best.altitude > ALTITUDE.WELL_PLACED) text += ` well-placed (${Math.round(best.altitude)}°)`;
        else text += ` visible (${Math.round(best.altitude)}°)`;
        results.phenomena.push(text);
    });

    // Showpiece callout
    const showpiece = visibleDSOs.find((d) => d.showpiece && d.altitude > 50);
    if (showpiece) {
        results.phenomena.push(`space: object ${showpiece.name.split(' ')[0]} - showpiece object perfectly positioned!`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ store }) {
    if (!store.astronomy_celestial) store.astronomy_celestial = {};

    return {
        interpretMeteorShowers,
        interpretFireballSeason,
        interpretComets,
        interpretDeepSkyConditions,
        interpretDeepSkyObjects,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
