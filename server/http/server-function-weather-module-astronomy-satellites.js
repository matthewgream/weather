// -----------------------------------------------------------------------------------------------------------------------------------------
// Astronomy Satellites Module - Artificial satellites, planets, and bright stars
// -----------------------------------------------------------------------------------------------------------------------------------------
//
// Covers:
//   - ISS visibility windows
//   - Satellite passes (general, Starlink)
//   - Geostationary satellite flares
//   - Planet visibility (Venus, Mars, Jupiter, Saturn, Mercury)
//   - Planet events (oppositions, elongations, moon events)
//   - Bright star visibility and lunar occultations
//
// Dependencies:
//   - server-function-weather-tools-astronomical.js
//   - server-function-weather-tools-format.js
//   - server-function-weather-helpers.js
//
// Note: This module uses statistical/ephemeris-based predictions.
//       For real-time satellite tracking, consider external APIs (Celestrak, N2YO).
//
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');
const toolsAstronomy = require('./server-function-weather-tools-astronomical.js');
const toolsFormat = require('./server-function-weather-tools-format.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------------------------------------------------------------------

const SATELLITE = {
    MAX_CLOUD_COVER: 50,
    BEST_CLOUD_COVER: 30,
};

// const ISS = {
//     MIN_LATITUDE: 55, // Statistical windows best for high latitudes
//     SUMMER_MONTHS: [4, 5, 6, 7, 8],
//     WINTER_MONTHS: [9, 10, 11, 0, 1, 2, 3],
// };

// const STARLINK = {
//     FAVORABLE_LAT_MIN: 40,
//     FAVORABLE_LAT_MAX: 60,
// };

const GEOSTATIONARY = {
    MAX_LATITUDE: 70,
    SPRING_MONTHS: [2, 3, 4],
    AUTUMN_MONTHS: [8, 9, 10],
};

const VENUS = {
    MIN_ELONGATION_VISIBLE: 15,
    CRESCENT_PHASE_MAX: 30,
    GREATEST_ELONGATION_MIN: 44,
    GREATEST_ELONGATION_MAX: 48,
    SHADOW_CASTING_MIN: 30,
    SHADOW_CASTING_MAX: 47,
    SHADOW_MIN_ALTITUDE: 20,
};

const PLANET_EVENT = {
    OPPOSITION_WINDOW_DAYS: 30,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// Data Tables
// -----------------------------------------------------------------------------------------------------------------------------------------

const MARS_OPPOSITIONS = [new Date('2025-01-16'), new Date('2027-02-19'), new Date('2029-03-25'), new Date('2031-05-04'), new Date('2033-06-27')];

// Bright stars near ecliptic (can be occulted by Moon)
const ECLIPTIC_STARS = [
    { name: 'Aldebaran', ra: 68.98, dec: 16.51, mag: 0.85 },
    { name: 'Regulus', ra: 152.09, dec: 11.97, mag: 1.35 },
    { name: 'Spica', ra: 201.3, dec: -11.16, mag: 1.04 },
    { name: 'Antares', ra: 247.35, dec: -26.43, mag: 1.09 },
];

// Mercury visibility windows by latitude
const MERCURY_WINDOWS = [
    { months: [2, 3], type: 'evening', desc: 'mercury spring evening apparition favorable' },
    { months: [9, 10], type: 'morning', desc: 'mercury autumn morning apparition favorable' },
];

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// function isISSWindowActive(month, hour, isSummer) {
//     const hour24 = hour < 12 ? hour + 24 : hour;
//     // Summer: late evening passes
//     // Winter: early evening and pre-dawn passes
//     return isSummer ? (hour24 >= 22 && hour24 <= 26) || (hour24 >= 26 && hour24 <= 30) : (hour >= 17 && hour <= 19) || (hour >= 5 && hour <= 7);
// }

// function isSatelliteViewingTime(hour, month) {
//     const summerTwilight = month >= 4 && month <= 8;
//     const eveningWindow = hour >= (summerTwilight ? 20 : 19) && hour <= (summerTwilight ? 23 : 22);
//     const morningWindow = hour >= 4 && hour <= 6;
//     return eveningWindow || morningWindow;
// }

function isGeostatinaryFlareTime(month, hour) {
    const isSpring = GEOSTATIONARY.SPRING_MONTHS.includes(month);
    const isAutumn = GEOSTATIONARY.AUTUMN_MONTHS.includes(month);
    if (isSpring && hour >= 22) return 'pre-dawn';
    if (isSpring && hour <= 2) return 'pre-dawn';
    if (isAutumn && hour >= 22) return 'post-sunset';
    if (isAutumn && hour <= 2) return 'post-sunset';
    return undefined;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// function interpretISS({ results, situation, dataCurrent }) {
//     const { location, hour, month, daylight } = situation;
//     const { cloudCover } = dataCurrent;

//     if (!location?.latitude) return;
//     if (daylight?.isDaytime) return;
//     if (cloudCover !== undefined && cloudCover >= SATELLITE.MAX_CLOUD_COVER) return;

//     // ISS visibility windows for high latitudes
//     if (location.latitude > ISS.MIN_LATITUDE) {
//         const isSummer = ISS.SUMMER_MONTHS.includes(month);
//         const isWinter = ISS.WINTER_MONTHS.includes(month);
//         if ((isSummer || isWinter) && isISSWindowActive(month, hour, true)) {
//             results.phenomena.push('satellites: ISS passes likely this hour (check heavens-above.com for exact times)');
//         }
//     }
// }

// -----------------------------------------------------------------------------------------------------------------------------------------

// function interpretSatellites({ results, situation, dataCurrent }) {
//     const { location, hour, month, daylight } = situation;
//     const { cloudCover } = dataCurrent;

//     if (!location?.latitude) return;
//     if (daylight?.isDaytime) return;
//     if (cloudCover !== undefined && cloudCover >= SATELLITE.BEST_CLOUD_COVER) return;

//     // General satellite visibility during twilight
//     if (isSatelliteViewingTime(hour, month)) {
//         let text = 'satellites: passes likely visible during twilight';
//         // Starlink train note
//         if (location.latitude > STARLINK.FAVORABLE_LAT_MIN && location.latitude < STARLINK.FAVORABLE_LAT_MAX) {
//             text += ' (Starlink trains may be visible after recent launches)';
//         }
//         results.phenomena.push(text);
//     }
// }

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretGeostationaryFlares({ results, situation }) {
    const { location, hour, month } = situation;

    if (!location?.latitude) return;
    if (Math.abs(location.latitude) >= GEOSTATIONARY.MAX_LATITUDE) return;

    const flareTime = isGeostatinaryFlareTime(month, hour);
    if (flareTime) {
        results.phenomena.push(`satellites: geostationary flares possible ${flareTime} near celestial equator`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretVenus({ results, situation, dataCurrent }) {
    const { location, date, lunar } = situation;
    const { cloudCover } = dataCurrent;

    if (!location?.latitude || !location?.longitude) return;
    if (cloudCover !== undefined && cloudCover >= SATELLITE.MAX_CLOUD_COVER) return;

    const venusData = toolsAstronomy.getVenusElongation(date);
    if (venusData.elongation <= VENUS.MIN_ELONGATION_VISIBLE) return;

    // Basic visibility
    const timeDesc = venusData.visibility === 'evening' ? `after sunset (${venusData.direction} sky)` : `before sunrise (${venusData.direction} sky)`;
    results.phenomena.push(`planets: venus ${Math.round(venusData.elongation)}° from Sun, visible ${timeDesc}`);

    // Crescent phase
    if (venusData.elongation < VENUS.CRESCENT_PHASE_MAX) {
        let text = 'planets: venus showing crescent phase (use binoculars)';
        if (venusData.visibility === 'evening') text += ' (ashen light possible on dark side with telescope)';
        results.phenomena.push(text);
    }
    // Greatest elongation
    else if (venusData.elongation > VENUS.GREATEST_ELONGATION_MIN && venusData.elongation < VENUS.GREATEST_ELONGATION_MAX) {
        results.phenomena.push('planets: venus near greatest elongation (best visibility)');
    }

    // Venus casting shadows
    if (venusData.elongation > VENUS.SHADOW_CASTING_MIN && venusData.elongation < VENUS.SHADOW_CASTING_MAX) {
        const venusPos = toolsAstronomy.getVenusPosition(date, location.latitude, location.longitude);
        if (venusPos.altitude > VENUS.SHADOW_MIN_ALTITUDE && lunar?.phase < 0.2) {
            results.phenomena.push('planets: venus bright enough to cast shadows');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretMars({ results, situation }) {
    const { date } = situation;

    const nextOpposition = MARS_OPPOSITIONS.find((d) => d > date);
    if (!nextOpposition) return;

    const daysToOpposition = Math.floor((nextOpposition - date) / helpers.constants.MILLISECONDS_PER_DAY);
    if (Math.abs(daysToOpposition) < PLANET_EVENT.OPPOSITION_WINDOW_DAYS) {
        results.phenomena.push(toolsFormat.proximity('planets: mars opposition', daysToOpposition) + ' (visible all night, closest approach)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretJupiter({ results, situation, dataCurrent }) {
    const { month, hour, daylight } = situation;
    const { cloudCover } = dataCurrent;

    if (cloudCover !== undefined && cloudCover >= SATELLITE.MAX_CLOUD_COVER) return;

    // Jupiter well-placed in winter months
    if (month >= 0 && month <= 3 && !daylight?.isDaytime && hour >= 20) {
        results.phenomena.push('planets: jupiter well-placed for viewing');

        // Galilean moon events (simplified periodic check)
        if ((hour >= 22 || hour <= 2) && cloudCover !== undefined && cloudCover < SATELLITE.BEST_CLOUD_COVER) {
            // Moon events happen roughly every few days
            if (helpers.daysIntoYear(new Date()) % 7 < 2) {
                results.phenomena.push('planets: jupiter moon event likely tonight (transit or shadow)');
            }
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSaturn({ results, situation, dataCurrent }) {
    const { month, hour } = situation;
    const { cloudCover } = dataCurrent;

    if (cloudCover !== undefined && cloudCover >= SATELLITE.MAX_CLOUD_COVER) return;

    // Saturn well-placed in late summer/autumn
    if (month >= 7 && month <= 10 && (hour >= 22 || hour <= 2)) {
        results.phenomena.push('planets: saturn well-placed for viewing (rings visible in small telescope)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretMercury({ results, situation, dataCurrent }) {
    const { location, month, hour } = situation;
    const { cloudCover } = dataCurrent;

    if (!location?.latitude) return;
    if (cloudCover !== undefined && cloudCover >= SATELLITE.MAX_CLOUD_COVER) return;

    if (location.latitude > 55) {
        // High latitude: specific favorable apparitions
        MERCURY_WINDOWS.filter((period) => period.months.includes(month)).forEach((period) => {
            if ((period.type === 'evening' && hour >= 18 && hour <= 20) || (period.type === 'morning' && hour >= 5 && hour <= 7)) {
                results.phenomena.push('planets: ' + period.desc);
            }
        });
    } else {
        // Lower latitudes: autumn morning best
        if (month >= 9 && month <= 11 && hour >= 5 && hour <= 7) {
            results.phenomena.push('planets: mercury may be visible low in east before sunrise');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarOccultations({ results, situation }) {
    const { lunar } = situation;

    if (!lunar?.position) return;

    ECLIPTIC_STARS.forEach((star) => {
        const separation = toolsAstronomy.calculateAngularSeparation(lunar.position.ra, lunar.position.dec, star.ra, star.dec);
        if (separation < 0.25) {
            if (separation > 0.2) {
                results.phenomena.push(`stars: grazing occultation of ${star.name} - extremely rare! (multiple disappearances)`);
            } else {
                results.phenomena.push(`stars: moon occults ${star.name} tonight - rare event`);
            }
        }
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSeasonalStars({ results, situation, dataCurrent }) {
    const { month, hour } = situation;
    const { cloudCover, humidity } = dataCurrent;

    if (cloudCover !== undefined && cloudCover >= SATELLITE.BEST_CLOUD_COVER) return;
    if (!(hour >= 22 || hour <= 2)) return;

    const recommendations = [];

    // Winter sky
    if (month >= 11 || month <= 1) {
        const foo = month === 0 ? 0 : -2;
        const orionMeridian = 22 + (month === 11 ? 2 : foo);
        recommendations.push(`orion at its best (highest around ${orionMeridian}:00)`);
        recommendations.push('winter hexagon asterism visible');
        recommendations.push('compare orange betelgeuse with blue rigel');
    }
    // Summer sky
    else if (month >= 5 && month <= 7) {
        recommendations.push('wilky way core visible to south');
        recommendations.push('scorpius and sagittarius rich star fields');
    }

    // Transparency note
    if (humidity !== undefined && humidity < 50) {
        recommendations.push('excellent transparency for faint objects');
    }

    if (recommendations.length > 0) {
        results.phenomena.push(`stars: tonight - ${recommendations.join('; ')}`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ store }) {
    if (!store.astronomy_satellites) store.astronomy_satellites = {};

    return {
        // interpretISS,
        // interpretSatellites,
        interpretGeostationaryFlares,
        interpretVenus,
        interpretMars,
        interpretJupiter,
        interpretSaturn,
        interpretMercury,
        interpretLunarOccultations,
        interpretSeasonalStars,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
