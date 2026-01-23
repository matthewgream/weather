// -----------------------------------------------------------------------------------------------------------------------------------------
// Astronomy Lunar Module - Moon phase, position, visibility, and events
// -----------------------------------------------------------------------------------------------------------------------------------------
//
// Covers:
//   - Lunar phase (new, crescent, quarter, gibbous, full)
//   - Lunar position (altitude, azimuth, declination)
//   - Lunar visibility (illumination, rise/set times, libration)
//   - Lunar events (supermoon, blue moon, standstills)
//   - Lunar surface features (terminator, crater rays)
//   - Zodiac position
//
// Dependencies:
//   - server-function-weather-tools-astronomical.js
//   - server-function-weather-tools-format.js
//   - server-function-weather-helpers.js
//
// -----------------------------------------------------------------------------------------------------------------------------------------

/* eslint-disable sonarjs/cognitive-complexity */

const helpers = require('./server-function-weather-helpers.js');
const toolsAstronomy = require('./server-function-weather-tools-astronomical.js');
const toolsFormat = require('./server-function-weather-tools-format.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------------------------------------------------------------------

const PHASE = {
    NEW_LOWER: 0.02,
    NEW_UPPER: 0.02,
    CRESCENT_END: 0.25,
    FIRST_QUARTER_LOWER: 0.23,
    FIRST_QUARTER_UPPER: 0.27,
    GIBBOUS_START: 0.25,
    FULL_LOWER: 0.48,
    FULL_UPPER: 0.52,
    GIBBOUS_END: 0.75,
    LAST_QUARTER_LOWER: 0.73,
    LAST_QUARTER_UPPER: 0.77,
    CRESCENT_START: 0.75,
};

const ALTITUDE = {
    NEAR_ZENITH: 60,
    LOW_HORIZON: 10,
    MOON_ILLUSION: 10,
    DISPERSION_VISIBLE: 5,
    MOON_DOG_MIN: 20,
    MOON_DOG_MAX: 40,
    MOONBOW_MAX: 42,
};

const LIBRATION = {
    SIGNIFICANT: 5, // Degrees - noticeable limb features
};

const DECLINATION = {
    EXTREME: 27, // Near monthly standstill
    MAJOR_STANDSTILL: 28.5, // Maximum declination range
    MINOR_STANDSTILL: 18.5, // Minimum declination range
};

const LUNAR_X_HOURS_BEFORE_FIRST_QUARTER = { min: 6, max: 10 };

const LUNAR_CYCLE_DAYS = 29.53059;
const NODAL_CYCLE_YEARS = 18.613;
const LAST_MAJOR_STANDSTILL = new Date('2006-03-22');

// Water signs for emotional full moon
// eslint-disable-next-line unicorn/prefer-set-has
const WATER_SIGNS = ['Cancer', 'Pisces', 'Scorpio'];

// -----------------------------------------------------------------------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------------------------------------------------------------------

function getPhaseName(phase) {
    if (phase >= PHASE.FULL_LOWER && phase <= PHASE.FULL_UPPER) return 'full';
    if (phase >= 0.98 || phase <= PHASE.NEW_UPPER) return 'new';
    if (phase >= PHASE.FIRST_QUARTER_LOWER && phase <= PHASE.FIRST_QUARTER_UPPER) return 'first quarter';
    if (phase >= PHASE.LAST_QUARTER_LOWER && phase <= PHASE.LAST_QUARTER_UPPER) return 'last quarter';
    if (phase < PHASE.CRESCENT_END) return 'waxing crescent';
    if (phase < PHASE.FULL_LOWER) return 'waxing gibbous';
    if (phase < PHASE.CRESCENT_START) return 'waning gibbous';
    return 'waning crescent';
}

function isFullMoon(phase) {
    return phase >= PHASE.FULL_LOWER && phase <= PHASE.FULL_UPPER;
}

function isNewMoon(phase) {
    return phase >= 0.98 || phase <= PHASE.NEW_UPPER;
}

function isQuarterMoon(phase) {
    return (phase >= PHASE.FIRST_QUARTER_LOWER && phase <= PHASE.FIRST_QUARTER_UPPER) || (phase >= PHASE.LAST_QUARTER_LOWER && phase <= PHASE.LAST_QUARTER_UPPER);
}

function getQuarterType(phase) {
    if (phase >= PHASE.FIRST_QUARTER_LOWER && phase <= PHASE.FIRST_QUARTER_UPPER) return 'first';
    if (phase >= PHASE.LAST_QUARTER_LOWER && phase <= PHASE.LAST_QUARTER_UPPER) return 'last';
    return undefined;
}

function getNextPhase(phase) {
    return ['new moon', 'first quarter', 'full moon', 'last quarter'][Math.ceil(phase * 4) % 4];
}

function getDaysToNextPhase(phase) {
    return Math.round((0.25 - (phase % 0.25)) * LUNAR_CYCLE_DAYS);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const PHASE_HISTORY = {
    MIN_INTERVAL_MS: 6 * 3600000, // Store at most every 6 hours
    MAX_AGE_MS: 48 * 3600000, // Keep 48 hours of history
    YESTERDAY_TARGET_MS: 24 * 3600000, // Looking for ~24h ago
    YESTERDAY_TOLERANCE_MS: 6 * 3600000, // Accept within ±6h of target
};

function updatePhaseHistory(state, now, phase) {
    if (!state.phaseHistory) state.phaseHistory = [];
    const lastEntry = state.phaseHistory[state.phaseHistory.length - 1];
    if (!lastEntry || now - lastEntry.timestamp >= PHASE_HISTORY.MIN_INTERVAL_MS) state.phaseHistory.push({ timestamp: now, phase });
    while (state.phaseHistory.length > 0 && state.phaseHistory[0].timestamp < now - PHASE_HISTORY.MAX_AGE_MS) state.phaseHistory.shift();
}

function getYesterdayPhase(state, now) {
    if (!state.phaseHistory?.length) return undefined;
    let best;
    let bestDiff = Infinity;
    for (const entry of state.phaseHistory) {
        const diff = Math.abs(entry.timestamp - (now - PHASE_HISTORY.YESTERDAY_TARGET_MS));
        if (diff < bestDiff) {
            best = entry;
            bestDiff = diff;
        }
    }
    return bestDiff <= PHASE_HISTORY.YESTERDAY_TOLERANCE_MS ? best : undefined;
}

function interpretLunarPhase({ results, situation, dataCurrent, store }) {
    const { location, date, month, hour, lunar } = situation;
    const { cloudCover, snowDepth, temp, humidity } = dataCurrent;

    if (!lunar) return;

    const { phase, name, zodiac } = lunar;
    const now = date.getTime();

    updatePhaseHistory(store.astronomy_lunar, now, phase);

    // *** Full Moon ***
    if (isFullMoon(phase)) {
        results.phenomena.push('moon: full tonight');

        // Viewing conditions
        if (cloudCover !== undefined) {
            if (cloudCover < 30) {
                const crisp = temp < -5 && humidity < 50 ? ' (crisp light)' : '';
                results.phenomena.push(`moon: viewing conditions clear${crisp}`);
            } else if (cloudCover < 70) {
                results.phenomena.push('moon: partially visible through clouds');
            } else {
                results.phenomena.push('moon: obscured by clouds');
            }

            // Snow illumination
            if (cloudCover < 40 && snowDepth !== undefined && snowDepth > 50) {
                const sparkle = temp < -10 ? ' (sparkling crystals)' : '';
                results.phenomena.push(`moon: illuminating snow landscape${sparkle}`);
            }
        }

        // Harvest moon check
        if (month >= 8 && month <= 10 && location?.hemisphere) {
            const equinoxInfo = toolsAstronomy.isNearEquinox(date, location.hemisphere, 15);
            if (equinoxInfo.near && equinoxInfo.type === 'autumn equinox') {
                const rising = hour >= 17 && hour <= 20 ? ' (moon rising near sunset for several nights)' : '';
                results.phenomena.push(`moon: harvest moon - closest full moon to autumn equinox${rising}`);
            } else if (name) {
                results.phenomena.push(`moon: ${name}`);
            }
        } else if (name) {
            results.phenomena.push(`moon: ${name}`);
        }

        // Zodiac with emotional water sign note
        if (zodiac) {
            if (zodiac.position === 'late') {
                results.phenomena.push(`moon: in late ${zodiac.sign}, entering ${zodiac.next} soon`);
            } else {
                const waterNote = WATER_SIGNS.includes(zodiac.sign) ? ' (emotional full moon in water sign)' : '';
                // results.phenomena.push(`moon: in ${zodiac.sign} ${zodiac.symbol}${waterNote}`);
                results.phenomena.push(`moon: in ${zodiac.sign} ${waterNote}`);
            }
        }

        return;
    }

    // *** New Moon ***
    if (isNewMoon(phase)) {
        results.phenomena.push('moon: new tonight');

        // Dark sky opportunity
        if (cloudCover !== undefined && cloudCover < 30 && location?.lightPollution) {
            if (location.lightPollution === 'low') {
                let starText = 'stars: viewing excellent';
                if (month >= 4 && month <= 9) {
                    const milkyWayBestHour = (17.75 - (month - 3) * 2 + 24) % 24;
                    const hourDiff = Math.abs(hour - milkyWayBestHour);
                    if (hourDiff < 3 || hourDiff > 21) {
                        starText += ` (Milky Way core visible, best around ${Math.round(milkyWayBestHour)}:00)`;
                    }
                }
                results.phenomena.push(starText);
            } else if (location.lightPollution === 'medium') {
                results.phenomena.push('stars: viewing good for bright stars');
            }
        }

        // Zodiac
        if (zodiac) {
            // results.phenomena.push(`moon: in ${zodiac.sign} ${zodiac.symbol} (${zodiac.meaning})`);
            results.phenomena.push(`moon: in ${zodiac.sign} (${zodiac.meaning})`);
        }

        return;
    }

    // *** Quarter Moon ***
    if (isQuarterMoon(phase)) {
        const quarterType = getQuarterType(phase);
        results.phenomena.push(`moon: ${quarterType} quarter tonight`);

        // Visibility timing
        if (quarterType === 'first' && hour >= 18 && hour <= 23) {
            results.phenomena.push('moon: visible in evening sky');
        } else if (quarterType === 'last' && hour >= 0 && hour <= 6) {
            results.phenomena.push('moon: visible in morning sky');
        }

        // Zodiac
        if (zodiac) {
            if (zodiac.position === 'late') {
                results.phenomena.push(`moon: in late ${zodiac.sign}, entering ${zodiac.next} soon`);
            } else {
                // results.phenomena.push(`moon: in ${zodiac.sign} ${zodiac.symbol}`);
                results.phenomena.push(`moon: in ${zodiac.sign}`);
            }
        }

        return;
    }

    // *** Transitional Phase ***
    const yesterday = getYesterdayPhase(store.astronomy_lunar, now);
    if (yesterday) {
        if (yesterday.phase < PHASE.NEW_UPPER && phase > PHASE.NEW_UPPER) {
            results.phenomena.push('moon: waxing crescent emerging');
        } else if (yesterday.phase < PHASE.FULL_UPPER && phase > PHASE.FULL_UPPER) {
            results.phenomena.push('moon: waning past full');
        } else {
            results.phenomena.push(`moon: ${getPhaseName(phase)}`);
        }
    } else {
        results.phenomena.push(`moon: ${getPhaseName(phase)}`);
    }

    // Zodiac for transitional phases
    if (zodiac) {
        if (zodiac.position === 'late') {
            results.phenomena.push(`moon: in late ${zodiac.sign}, entering ${zodiac.next} soon`);
        } else {
            // results.phenomena.push(`moon: in ${zodiac.sign} ${zodiac.symbol}`);
            results.phenomena.push(`moon: in ${zodiac.sign}`);
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarPosition({ results, situation }) {
    const { location, hour, lunar } = situation;

    if (!lunar?.position) return;

    const { altitude, azimuth, direction, dec } = lunar.position;
    const { phase, distance, constants } = lunar;

    // Current position
    if (altitude > 0) {
        results.phenomena.push(`moon: ${toolsFormat.position(altitude, azimuth, direction)}`);

        // Near zenith
        if (location?.latitude) {
            const maxAltitude = 90 - Math.abs(location.latitude - dec);
            if (altitude > ALTITUDE.NEAR_ZENITH && altitude > maxAltitude - 10) {
                results.phenomena.push('moon: near zenith - excellent viewing');
            } else if (altitude < ALTITUDE.LOW_HORIZON) {
                results.phenomena.push('moon: low on horizon');
            }
        }
    } else if (hour >= 6 && hour <= 18) {
        results.phenomena.push('moon: below horizon');
    }

    // Distance-based phenomena
    if (distance?.isSupermoon) {
        if (isFullMoon(phase)) {
            const percentLarger = distance.percentCloser || Math.round((1 - distance.distance / constants.LUNAR_MEAN_DISTANCE_KM) * 100);
            results.phenomena.push(`moon: supermoon - appears ${percentLarger}% larger than average`);
        } else if (isNewMoon(phase)) {
            results.phenomena.push('moon: super new moon - extra high tides expected');
        } else {
            results.phenomena.push('moon: at perigee (closest approach)');
        }
    } else if (distance?.isMicromoon && isFullMoon(phase)) {
        const percentSmaller = distance.percentFarther || Math.round((distance.distance / constants.LUNAR_MEAN_DISTANCE_KM - 1) * 100);
        results.phenomena.push(`moon: micromoon - appears ${percentSmaller}% smaller and dimmer`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarVisibility({ results, situation, dataCurrent }) {
    const { hour, lunar } = situation;
    const { cloudCover, rainRate, temp } = dataCurrent;

    if (!lunar) return;

    const { phase, position, times, brightness, constants } = lunar;

    // Illumination
    results.phenomena.push(`moon: ${toolsFormat.percentage(brightness)} illuminated`);

    // Full moon rise time
    if (isFullMoon(phase)) {
        if (position?.altitude > 0) {
            results.phenomena.push('moon: full moon visible now');
        } else if (times?.rise && times.rise.getHours() < 23) {
            results.phenomena.push(`moon: full moon rises at ${times.rise.toTimeString().slice(0, 5)}`);
        }
    }

    // Moon illusion at horizon
    if (position?.altitude > 0 && position.altitude < ALTITUDE.MOON_ILLUSION) {
        if (phase >= 0.45 && phase <= 0.55) {
            results.phenomena.push('moon: appears larger near horizon (moon illusion effect)');
            if (times?.rise && Math.abs(hour - times.rise.getHours()) < 1) {
                results.phenomena.push('moon: rising - watch for atmospheric color effects');
            } else if (times?.set && Math.abs(hour - times.set.getHours()) < 1) {
                results.phenomena.push('moon: setting - may appear orange/red');
            }
        }
    }

    // Libration
    if (position?.libration && Math.abs(position.libration.longitude) > LIBRATION.SIGNIFICANT) {
        const limb = position.libration.longitude > 0 ? 'eastern' : 'western';
        results.phenomena.push(`moon: ${limb} limb features visible (libration)`);
    }

    // Earthshine
    if ((phase > 0.05 && phase < 0.25) || (phase > 0.75 && phase < 0.95)) {
        if (cloudCover !== undefined && cloudCover < 30) {
            results.phenomena.push('moon: earthshine visible on dark side');
        }
    }

    // Penumbral shading hint
    if (phase >= 0.45 && phase <= 0.55 && position?.latitude !== undefined && Math.abs(position.latitude) < 5) {
        results.phenomena.push('moon: watch for subtle penumbral shading (possible eclipse season)');
    }

    // Lunar X and V features
    const hoursToFirstQuarter = (0.25 - phase) * constants.LUNAR_CYCLE_DAYS * 24;
    if (hoursToFirstQuarter > LUNAR_X_HOURS_BEFORE_FIRST_QUARTER.min && hoursToFirstQuarter < LUNAR_X_HOURS_BEFORE_FIRST_QUARTER.max) {
        results.phenomena.push('moon: Lunar X and V features visible along terminator (use binoculars)');
    }

    // Moonbow
    if (phase >= 0.45 && phase <= 0.55 && position?.altitude > 0 && position.altitude < ALTITUDE.MOONBOW_MAX) {
        if (rainRate !== undefined && rainRate > 0) {
            const doubleBow = brightness > 95 ? ' (double moonbow possible with bright full moon)' : '';
            results.phenomena.push(`moon: moonbow possible if rain with clear breaks${doubleBow}`);
        }
    }

    // Moon dogs (paraselenae)
    if (phase > 0.4 && position?.altitude > ALTITUDE.MOON_DOG_MIN && position.altitude < ALTITUDE.MOON_DOG_MAX && temp < -10) {
        if (cloudCover !== undefined && cloudCover > 20 && cloudCover < 60) {
            results.phenomena.push('moon: moon dogs possible (bright spots 22° beside moon)');
        }
    }

    // Atmospheric dispersion at low altitude
    if (position?.altitude > 0 && position.altitude < ALTITUDE.DISPERSION_VISIBLE && phase > 0.4) {
        results.phenomena.push('moon: atmospheric dispersion may separate colors at limb');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarSurface({ results, situation }) {
    const { lunar } = situation;

    if (!lunar) return;

    const { phase } = lunar;

    // Terminator features
    if (phase >= 0.15 && phase <= 0.35) {
        results.phenomena.push('moon: eastern maria and crater shadows prominent along terminator');
    } else if (phase >= 0.65 && phase <= 0.85) {
        results.phenomena.push('moon: western maria and crater shadows prominent along terminator');
    }

    // Crater rays at full
    if (phase >= 0.45 && phase <= 0.55) {
        results.phenomena.push('moon: crater rays prominent (Tycho, Copernicus, Kepler)');
    } else if (phase >= 0.2 && phase <= 0.3) {
        results.phenomena.push('moon: crater depths visible along terminator (high magnification recommended)');
    }

    // Terminator movement
    if (isQuarterMoon(phase)) {
        results.phenomena.push('moon: terminator moving ~15 km/hour at lunar equator');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarTimes({ results, situation }) {
    const { location, lunar } = situation;

    if (!lunar?.times) return;
    if (!lunar.times.rise && !lunar.times.set) return;

    const { times } = lunar;

    const parts = [];
    if (times.rise) {
        parts.push(`rises ${toolsFormat.timeFromDate(times.rise, location?.timezone)} at ${Math.round(toolsAstronomy.calculateMoonriseAzimuth(times, location))}°`);
    }
    if (times.set) {
        parts.push(`sets ${toolsFormat.timeFromDate(times.set, location?.timezone)} at ${Math.round(toolsAstronomy.calculateMoonsetAzimuth(times, location))}°`);
    }
    if (parts.length > 0) {
        results.phenomena.push(`moon: ${parts.join(' and ')}`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarEvents({ results, situation }) {
    const { date, lunar } = situation;

    if (!lunar) return;

    const { phase, position, distance, constants: lunarConstants } = lunar;

    // Extreme declination (monthly standstill)
    if (position?.dec && Math.abs(position.dec) > DECLINATION.EXTREME) {
        results.phenomena.push('moon: extreme declination (monthly standstill)');
    }

    // Near ecliptic plane
    if (isFullMoon(phase) && position?.latitude !== undefined && Math.abs(position.latitude) < 1.5) {
        results.phenomena.push('moon: near ecliptic plane (eclipse season possible)');
    }

    // Nodal cycle standstills
    const yearsSinceStandstill = (date - LAST_MAJOR_STANDSTILL) / (helpers.constants.DAYS_PER_YEAR * helpers.constants.MILLISECONDS_PER_DAY);
    const nodalPhase = (yearsSinceStandstill % NODAL_CYCLE_YEARS) / NODAL_CYCLE_YEARS;
    if (nodalPhase < 0.1 || nodalPhase > 0.9) {
        results.phenomena.push(`moon: near major standstill (declination range ±${DECLINATION.MAJOR_STANDSTILL}°)`);
    } else if (Math.abs(nodalPhase - 0.5) < 0.1) {
        results.phenomena.push(`moon: near minor standstill (declination range ±${DECLINATION.MINOR_STANDSTILL}°)`);
    }

    // Horizontal parallax for close approaches
    if (distance?.isSupermoon || distance?.isPerigee) {
        const parallax = (((3600 * 180) / Math.PI) * (lunarConstants.LUNAR_MEAN_DISTANCE_KM / distance.distance)) / 3600;
        results.phenomena.push(`moon: horizontal parallax ${Math.round(parallax * 10) / 10}° (position shifts at horizon)`);
    }

    // Next phase prediction
    const daysToNext = getDaysToNextPhase(phase);
    if (daysToNext <= 2) {
        results.phenomena.push(`moon: ${getNextPhase(phase)} in ${daysToNext} day${daysToNext > 1 ? 's' : ''}`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ store }) {
    if (!store.astronomy_lunar) store.astronomy_lunar = {};

    return {
        interpretLunarPhase,
        interpretLunarPosition,
        interpretLunarVisibility,
        interpretLunarSurface,
        interpretLunarTimes,
        interpretLunarEvents,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
