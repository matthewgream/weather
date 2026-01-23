// -----------------------------------------------------------------------------------------------------------------------------------------
//
//   - Planet visibility (Venus, Mars, Jupiter, Saturn, Mercury)
//   - Planet events (oppositions, elongations, moon events)
//   - Bright star visibility and lunar occultations
//
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');
const toolsAstronomy = require('./server-function-weather-tools-astronomical.js');
const toolsFormat = require('./server-function-weather-tools-format.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const SATELLITE = {
    MAX_CLOUD_COVER: 50,
    BEST_CLOUD_COVER: 30,
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
    if (!store.astronomy_planetsstars) store.astronomy_planetsstars = {};

    return {
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
