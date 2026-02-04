// -----------------------------------------------------------------------------------------------------------------------------------------
// Astronomy Solar Module - Sun position and direct solar phenomena
// -----------------------------------------------------------------------------------------------------------------------------------------
//
//   - Sun position (altitude, azimuth, direction)
//   - Solar noon and equation of time
//   - Golden hour / blue hour
//   - Shadow length
//   - UV index
//   - Seasonal sun angle variations
//   - Zenith passage (tropics)
//
// -----------------------------------------------------------------------------------------------------------------------------------------

// const toolsAstronomy = require('./server-function-weather-tools-astronomical.js');
const { FormatHelper } = require('./server-function-weather-tools-format.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const SOLAR_ALTITUDE = {
    HIGH_OVERHEAD: 60, // Sun high overhead
    MODERATE: 45, // Moderate shadow length
    LOW_ANGLE: 20, // Long shadows
    GOLDEN_HOUR_END: 10, // End of golden hour
    GOLDEN_HOUR_START: 0, // Start of golden hour (horizon)
    BLUE_HOUR_START: -4, // Blue hour begins
    BLUE_HOUR_END: -6, // Blue hour ends
    DISPERSION_VISIBLE: 5, // Atmospheric dispersion visible
};

const UV_INDEX = {
    LOW: 2,
    MODERATE: 5,
    HIGH: 7,
    VERY_HIGH: 10,
    EXTREME: 11,
};

const SHADOW_MULTIPLIER = {
    SHORT: 1, // Shadow shorter than object
    EQUAL: 1, // Shadow equals object height
    LONG: 2, // Shadow twice object height
    VERY_LONG: 5, // Shadow 5x object height
};

const LATITUDE = {
    HIGH_LATITUDE: 59, // Notable winter sun effects
    ARCTIC_CIRCLE: 66.5, // Polar day/night possible
    TROPIC_OF_CANCER: 23.44, // Sun can be directly overhead
    TROPIC_OF_CAPRICORN: -23.44,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getUvCategory(uvi) {
    if (uvi >= UV_INDEX.EXTREME) return 'extreme';
    if (uvi >= UV_INDEX.VERY_HIGH) return 'very high';
    if (uvi >= UV_INDEX.HIGH) return 'high';
    if (uvi >= UV_INDEX.MODERATE) return 'moderate';
    return 'low';
}

function getShadowDescription(multiplier) {
    if (multiplier < SHADOW_MULTIPLIER.EQUAL) return 'shorter than object';
    if (multiplier < SHADOW_MULTIPLIER.LONG) return 'similar to object height';
    if (multiplier < SHADOW_MULTIPLIER.VERY_LONG) return 'long';
    return 'very long';
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolarPosition({ results, situation }) {
    const { solar } = situation;

    if (!solar?.position) return;

    const { altitude, azimuth, direction } = solar.position;

    // Sun below horizon - nothing to report for position
    if (altitude <= 0) return;

    // Current position
    results.phenomena.push(`sun: ${FormatHelper.positionToString(altitude, azimuth, direction)}`);

    // Altitude-based conditions
    if (altitude > SOLAR_ALTITUDE.HIGH_OVERHEAD) results.phenomena.push('sun: high overhead');
    else if (solar.isGoldenHour) results.phenomena.push(`sun: golden hour${altitude < 2 ? ' (transitioning to blue hour)' : ''}`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolarNoon({ results, situation }) {
    const { hourDecimal, solar } = situation;

    if (!solar?.position) return;

    const { noon, equationOfTime, altitude } = solar.position;

    const nearNoon = Math.abs(hourDecimal - noon) < 0.25;
    if (!nearNoon) return;

    const eotMinutes = Math.round(equationOfTime);
    results.phenomena.push(
        `sun: solar noon at ${FormatHelper.secondsToString(Math.floor(noon * 60), { hoursOnly: true })} (sundial ${Math.abs(eotMinutes)} min ${eotMinutes >= 0 ? 'ahead' : 'behind'} of clock, altitude ${FormatHelper.altitudeToString(altitude)})`
    );
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretShadowLength({ results, situation }) {
    const { solar } = situation;

    if (!solar?.position || solar.position.altitude <= 0) return;

    const { altitude } = solar.position;
    const { shadowMultiplier } = solar;

    // Only report shadows at useful angles
    if (altitude <= 0.1 || altitude >= 45) return;
    if (shadowMultiplier === Infinity || shadowMultiplier > 100) return;
    results.phenomena.push(`sun: shadows ${(Math.round(shadowMultiplier * 10) / 10).toFixed(1)}× object height (${getShadowDescription(shadowMultiplier)})`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretUvIndex({ results, situation, dataCurrent }) {
    const { solar } = situation;
    const { solarUvi } = dataCurrent;

    if (solarUvi === undefined || !solar?.position || solar.position.altitude <= 30) return;

    if (solarUvi > UV_INDEX.MODERATE) {
        results.phenomena.push(`sun: UV index ${FormatHelper.uviToString(solarUvi)} (${getUvCategory(solarUvi)}) - protection advised`);
        if (solarUvi >= UV_INDEX.VERY_HIGH) results.alerts.push(`sun: warning, UV index ${FormatHelper.uviToString(solarUvi)} (${getUvCategory(solarUvi)}) - limit sun exposure`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAtmosphericDispersion({ results, situation }) {
    const { solar } = situation;

    if (!solar?.position) return;

    const { altitude } = solar.position;

    // Atmospheric dispersion visible at very low sun angles
    if (altitude > 0 && altitude < SOLAR_ALTITUDE.DISPERSION_VISIBLE) results.phenomena.push('sun: atmospheric dispersion visible (red lower limb, blue-green upper limb)');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSkyPolarization({ results, situation }) {
    const { solar } = situation;

    if (!solar?.position) return;

    const { altitude, azimuth } = solar.position;

    // Sky polarization is strongest 90° from sun, useful for photography
    if (altitude > 0 && altitude < 30) results.phenomena.push(`sun: maximum sky polarization at 90° (azimuth ~${FormatHelper.degreesToString((azimuth + 90) % 360)})`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretWinterSun({ results, situation }) {
    const { month, location, solar } = situation;

    if (!solar?.position || !location?.latitude) return;

    const { altitude } = solar.position;

    // High latitude winter sun effects
    if (location.latitude > LATITUDE.HIGH_LATITUDE) {
        // November-January low winter sun
        if (month >= 10 || month <= 1) {
            if (altitude > 0 && altitude < 10) results.phenomena.push('sun: low winter angle (long shadows, warm light)');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretZenithPassage({ results, situation }) {
    const { location, solar } = situation;

    if (!solar?.position || !location?.latitude) return;

    const { declination } = solar.position;

    // Check if sun can pass through zenith at this latitude (tropics only)
    if (Math.abs(location.latitude) > Math.abs(LATITUDE.TROPIC_OF_CANCER)) return;

    // Sun is directly overhead when declination equals latitude
    const declinationDiff = Math.abs(declination - location.latitude);
    if (declinationDiff < 0.5) {
        results.phenomena.push('sun: directly overhead at solar noon (zenith passage)');
        results.phenomena.push('sun: no shadow at noon (Lahaina Noon)');
    } else if (declinationDiff < 2) results.phenomena.push(`sun: near-zenith passage (${FormatHelper.degreesToString(declinationDiff, { digits: 1 })} from directly overhead)`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretBlueHour({ results, situation }) {
    const { solar } = situation;

    if (!solar) return;

    if (solar.isBlueHour) results.phenomena.push('sun: blue hour (indirect sunlight, blue sky tones)');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolarObserving({ results, situation, dataCurrent }) {
    const { hour, solar } = situation;
    const { cloudCover } = dataCurrent;

    if (!solar?.position || solar.position.altitude <= 0) return;

    // Solar observation reminder (with filter warning)
    if (cloudCover !== undefined && cloudCover < 50)
        // Limb darkening most visible around solar noon
        results.phenomena.push('sun: observe safely with proper solar filter only' + (hour >= 10 && hour <= 14 ? ' (limb darkening visible with filter)' : ''));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ store }) {
    if (!store.astronomy_solar) store.astronomy_solar = {};

    return {
        interpretSolarPosition,
        interpretSolarNoon,
        interpretShadowLength,
        interpretUvIndex,
        interpretAtmosphericDispersion,
        interpretSkyPolarization,
        interpretWinterSun,
        interpretZenithPassage,
        interpretBlueHour,
        interpretSolarObserving,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
