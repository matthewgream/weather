// -----------------------------------------------------------------------------------------------------------------------------------------
// Astronomy Atmospheric Module - Twilight, sky optics, and viewing conditions
// -----------------------------------------------------------------------------------------------------------------------------------------
//
//   - Twilight phases (civil, nautical, astronomical)
//   - Twilight phenomena (Belt of Venus, Earth's shadow, alpenglow)
//   - Sunrise/sunset conditions
//   - Green flash
//   - Crepuscular/anticrepuscular rays
//   - Zodiacal light and gegenschein
//   - Airglow
//   - Noctilucent clouds
//   - Atmospheric optics (halos, sundogs, light pillars, arcs)
//   - Viewing/seeing conditions
//   - White nights
//
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');
// const toolsFormat = require('./server-function-weather-tools-format.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const ENDPOINTS = {
    sevenTimer: 'http://www.7timer.info/bin/api.pl',
};

const STALENESS_SEEING = {
    forecast: 3 * 60 * 60 * 1000, // 3 hours - forecasts update every 6h
};

const INTERVALS_SEEING = {
    normal: 3 * 60 * 60 * 1000, // 3 hours
    evening: 1 * 60 * 60 * 1000, // 1 hour when approaching evening
};

// 7Timer scale descriptions (1 = best, 8 = worst)
const SEEING_SCALE = {
    1: { arcsec: '< 0.5"', desc: 'excellent' },
    2: { arcsec: '0.5-0.75"', desc: 'excellent' },
    3: { arcsec: '0.75-1"', desc: 'good' },
    4: { arcsec: '1-1.25"', desc: 'good' },
    5: { arcsec: '1.25-1.5"', desc: 'average' },
    6: { arcsec: '1.5-2"', desc: 'poor' },
    7: { arcsec: '2-2.5"', desc: 'poor' },
    8: { arcsec: '> 2.5"', desc: 'terrible' },
};

const TRANSPARENCY_SCALE = {
    1: { mag: '< 0.3', desc: 'excellent' },
    2: { mag: '0.3-0.4', desc: 'excellent' },
    3: { mag: '0.4-0.5', desc: 'good' },
    4: { mag: '0.5-0.6', desc: 'good' },
    5: { mag: '0.6-0.7', desc: 'average' },
    6: { mag: '0.7-0.85', desc: 'poor' },
    7: { mag: '0.85-1', desc: 'poor' },
    8: { mag: '> 1', desc: 'terrible' },
};

const CLOUD_COVER_SCALE = {
    1: { pct: '0-6%', desc: 'clear' },
    2: { pct: '6-19%', desc: 'mostly clear' },
    3: { pct: '19-31%', desc: 'partly cloudy' },
    4: { pct: '31-44%', desc: 'partly cloudy' },
    5: { pct: '44-56%', desc: 'partly cloudy' },
    6: { pct: '56-69%', desc: 'mostly cloudy' },
    7: { pct: '69-81%', desc: 'mostly cloudy' },
    8: { pct: '81-94%', desc: 'cloudy' },
    9: { pct: '94-100%', desc: 'overcast' },
};

// // Lifted index (atmospheric stability) - negative = unstable (bad seeing)
// const LIFTED_INDEX_SCALE = {
//     '-10': 'very unstable',
//     '-6': 'unstable',
//     '-4': 'slightly unstable',
//     '-1': 'neutral',
//     '2': 'slightly stable',
//     '6': 'stable',
//     '10': 'very stable',
//     '15': 'very stable',
// };

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// const TWILIGHT = {
//     CIVIL_END: -6,              // Civil twilight sun altitude
//     NAUTICAL_END: -12,          // Nautical twilight sun altitude
//     ASTRONOMICAL_END: -18,      // Astronomical twilight sun altitude
// };

const BELT_OF_VENUS = {
    MIN_DEPRESSION: 2, // Sun must be at least this far below horizon
    MAX_DEPRESSION: 6, // Belt disappears when sun is this far below
};

const PURPLE_LIGHT = {
    MIN_DEPRESSION: 4,
    MAX_DEPRESSION: 8,
};

const ZODIACAL = {
    MAX_CLOUD_COVER: 20,
    SPRING_MONTHS: [2, 3], // Best evening viewing (northern hemisphere)
    AUTUMN_MONTHS: [8, 9, 10], // Best morning viewing (northern hemisphere)
    STEEP_ECLIPTIC_ANGLE: 60,
};

const NOCTILUCENT = {
    SEASON_START_MONTH: 4, // May
    SEASON_END_MONTH: 7, // August
    MIN_LATITUDE: 50,
    SUMMER_SOLSTICE_DOY: 172, // Day of year
    PRIME_WINDOW_DAYS: 40, // Days around solstice
};

const HALO = {
    STANDARD_RADIUS: 22, // 22° halo
    LARGE_RADIUS: 46, // 46° halo (rarer)
    CIRCUMZENITHAL_MAX_ALT: 32.2,
};

const SUNRISE_SUNSET_WINDOW = 0.5; // Hours before/after
const GREEN_FLASH_WINDOW = 0.25; // Hours around sunrise/sunset
const CREPUSCULAR_WINDOW = 1; // Hours around sunrise/sunset

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

async function fetchSeeingForecast(state, location) {
    if (!location?.latitude || !location?.longitude) return undefined;
    if (!state.seeing) state.seeing = {};
    try {
        const params = new URLSearchParams({ lon: location.longitude.toFixed(2), lat: location.latitude.toFixed(2), product: 'astro', output: 'json' });
        const response = await fetch(`${ENDPOINTS.sevenTimer}?${params}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.dataseries || !Array.isArray(data.dataseries)) throw new Error('Invalid response format');
        const initTime = data.init ? parseSevenTimerInit(data.init) : Date.now();
        const forecasts = data.dataseries.map((point) => {
            const forecastTime = initTime + point.timepoint * 3600000;
            return {
                timepoint: point.timepoint,
                forecastTime,
                hoursFromNow: Math.round((forecastTime - Date.now()) / 3600000),
                seeing: point.seeing,
                seeingDesc: SEEING_SCALE[point.seeing]?.desc || 'unknown',
                seeingArcsec: SEEING_SCALE[point.seeing]?.arcsec || 'unknown',
                transparency: point.transparency,
                transparencyDesc: TRANSPARENCY_SCALE[point.transparency]?.desc || 'unknown',
                cloudCover: point.cloudcover,
                cloudCoverDesc: CLOUD_COVER_SCALE[point.cloudcover]?.desc || 'unknown',
                liftedIndex: point.lifted_index,
                humidity: point.rh2m, // Relative humidity at 2m
                wind: point.wind10m?.speed, // Wind at 10m
                // Derived observing score (lower = better)
                observingScore: calculateObservingScore(point),
            };
        });
        const next24h = forecasts.filter((f) => f.hoursFromNow >= 0 && f.hoursFromNow <= 24);
        const tonight = forecasts.filter((f) => {
            const hour = new Date(f.forecastTime).getHours();
            return f.hoursFromNow >= 0 && f.hoursFromNow <= 18 && (hour >= 20 || hour <= 5);
        });
        const bestTonight = tonight.length > 0 ? tonight.reduce((best, f) => (!best || f.observingScore < best.observingScore ? f : best), undefined) : undefined;
        const best24h = next24h.length > 0 ? next24h.reduce((best, f) => (!best || f.observingScore < best.observingScore ? f : best), undefined) : undefined;
        // Calculate average conditions tonight
        const avgTonight =
            tonight.length > 0
                ? {
                      seeing: Math.round((tonight.reduce((sum, f) => sum + f.seeing, 0) / tonight.length) * 10) / 10,
                      transparency: Math.round((tonight.reduce((sum, f) => sum + f.transparency, 0) / tonight.length) * 10) / 10,
                      cloudCover: Math.round((tonight.reduce((sum, f) => sum + f.cloudCover, 0) / tonight.length) * 10) / 10,
                  }
                : undefined;
        state.seeing.data = {
            initTime,
            forecasts,
            next24h,
            tonight,
            bestTonight,
            best24h,
            avgTonight,
            summary: generateSeeingSummary(tonight, bestTonight),
        };
        state.seeing.lastUpdate = Date.now();
        state.seeing.lastError = undefined;
        console.error(`atmospheric: update 7Timer success (tonight: ${tonight.length} points, best seeing: ${bestTonight?.seeingDesc || 'n/a'})`);
        return state.seeing.data;
    } catch (e) {
        state.seeing.lastError = e.message;
        console.error('atmospheric: update 7Timer failure:', e.message);
        return undefined;
    }
}

function parseSevenTimerInit(initStr) {
    // Format: "2024010112" = 2024-01-01 12:00 UTC
    return Date.UTC(Number.parseInt(initStr.slice(0, 4)), Number.parseInt(initStr.slice(4, 6)) - 1, Number.parseInt(initStr.slice(6, 8)), Number.parseInt(initStr.slice(8, 10)));
}

function calculateObservingScore(point) {
    // Combined score: lower = better observing conditions
    // Weights: seeing (40%), transparency (30%), cloud cover (30%)
    const seeingScore = point.seeing || 5;
    const transScore = point.transparency || 5;
    const cloudScore = point.cloudcover || 5;
    return Math.round((seeingScore * 0.4 + transScore * 0.3 + cloudScore * 0.3) * 10) / 10;
}

function generateSeeingSummary(tonight, _bestTonight) {
    if (!tonight?.length) return { rating: 'unknown', text: 'No forecast data available' };
    const avgScore = tonight.reduce((sum, f) => sum + f.observingScore, 0) / tonight.length;
    if (avgScore <= 2.5) return { rating: 'excellent', text: 'Excellent observing conditions tonight' };
    else if (avgScore <= 3.5) return { rating: 'good', text: 'Good observing conditions tonight' };
    else if (avgScore <= 4.5) return { rating: 'fair', text: 'Fair observing conditions tonight' };
    else if (avgScore <= 5.5) return { rating: 'poor', text: 'Poor observing conditions tonight' };
    else return { rating: 'bad', text: 'Bad observing conditions tonight' };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getSeeingForecast(state) {
    if (!state.seeing?.data) return undefined;
    if (Date.now() - state.seeing.lastUpdate > STALENESS_SEEING.forecast) return undefined;
    return state.seeing.data;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function updateSeeingIntervalCalculator(_state) {
    const hour = new Date().getHours();
    // More frequent updates in late afternoon (planning for evening)
    return [hour >= 14 && hour <= 19 ? INTERVALS_SEEING.evening : INTERVALS_SEEING.normal, hour >= 14 && hour <= 19 ? 'pre-evening' : 'normal'];
}
const _seeingSchedule = { intervalId: undefined, currentInterval: undefined };
function updateSeeingSchedule(state, location) {
    fetchSeeingForecast(state, location).then(() => {
        const [interval, reason] = updateSeeingIntervalCalculator(state);
        if (_seeingSchedule.currentInterval !== interval) {
            if (_seeingSchedule.intervalId) clearInterval(_seeingSchedule.intervalId);
            _seeingSchedule.currentInterval = interval;
            _seeingSchedule.intervalId = setInterval(() => updateSeeingSchedule(state, location), interval);
            console.error(`atmospheric: update 7Timer interval set to ${interval / 1000 / 60 / 60}h ('${reason}')`);
        }
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function isNearSunriseOrSet(daylight, hourDecimal, threshold) {
    if (!daylight.sunriseDecimal || !daylight.sunsetDecimal) return undefined;
    const nearSunrise = Math.abs(hourDecimal - daylight.sunriseDecimal) < threshold;
    const nearSunset = Math.abs(hourDecimal - daylight.sunsetDecimal) < threshold;
    if (nearSunrise || nearSunset) return nearSunrise ? 'sunrise' : 'sunset';
    return undefined;
}

function isTwilight(daylight, hourDecimal) {
    if (!daylight.civilDawnDecimal || !daylight.sunsetDecimal) return undefined;
    const morningTwilight = hourDecimal > daylight.civilDawnDecimal && hourDecimal < daylight.sunriseDecimal;
    const eveningTwilight = hourDecimal > daylight.sunsetDecimal && hourDecimal < daylight.civilDuskDecimal;
    if (morningTwilight || eveningTwilight) return morningTwilight ? 'western' : 'eastern';
    return undefined;
}

function getTwilightDuration(daylight) {
    if (!daylight.civilDawnDecimal || !daylight.sunriseDecimal) return undefined;
    return {
        morning: (daylight.sunriseDecimal - daylight.civilDawnDecimal) * 60,
        evening: (daylight.civilDuskDecimal - daylight.sunsetDecimal) * 60,
    };
}

function getBlueHourDuration(daylight) {
    if (!daylight.civilDuskDecimal || !daylight.nauticalDuskDecimal) return undefined;
    return Math.abs(daylight.nauticalDuskDecimal - daylight.civilDuskDecimal) * 60;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretTwilightPhase({ results, situation, dataCurrent }) {
    const { daylight } = situation;
    const { cloudCover } = dataCurrent;

    if (!daylight?.phase) return;

    switch (daylight.phase) {
        case 'civil_dawn':
            results.phenomena.push('twilight: civil dawn (morning twilight)');
            break;
        case 'civil_dusk':
            results.phenomena.push('twilight: civil dusk');
            if (cloudCover !== undefined && cloudCover < 30) results.phenomena.push('twilight: clear sky');
            break;
        case 'nautical_dawn':
            results.phenomena.push('twilight: nautical dawn (horizon visible, stars fading)');
            break;
        case 'nautical_dusk':
            results.phenomena.push('twilight: nautical dusk (stars becoming visible)');
            break;
        case 'astronomical_dawn':
            results.phenomena.push('twilight: astronomical dawn (sky brightening)');
            break;
        case 'astronomical_dusk':
            results.phenomena.push('twilight: astronomical dusk (deep dusk)');
            break;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretTwilightPhenomena({ results, situation, dataCurrent }) {
    const { location, daylight, hourDecimal, solar } = situation;
    const { cloudCover } = dataCurrent;

    const twilight = isTwilight(daylight, hourDecimal);
    if (!twilight) return;

    const sunDepression = Math.abs(solar?.position?.altitude || 0);

    // Belt of Venus and Earth's shadow
    if (cloudCover !== undefined && cloudCover < 40) {
        if (sunDepression > BELT_OF_VENUS.MIN_DEPRESSION && sunDepression < BELT_OF_VENUS.MAX_DEPRESSION) {
            results.phenomena.push(`twilight: Belt of Venus ${Math.round(sunDepression * 2)}° high in ${twilight} sky`);
        }
        results.phenomena.push(`twilight: Earth's shadow visible (dark band on ${twilight} horizon)`);

        // Alpenglow
        if (location?.nearMountains || location?.elevation > 1000) {
            results.phenomena.push('twilight: alpenglow on mountain peaks');
        }
    }

    // Dark segment / twilight wedge
    if (cloudCover !== undefined && cloudCover < 10) {
        let note = 'twilight: dark segment visible (twilight wedge)';
        if (location?.elevation > 1000) note += ' (shadow bands may be visible on mountains)';
        results.phenomena.push(note);
    }

    // Purkinje effect (color perception shift)
    results.phenomena.push('twilight: Purkinje effect active (red appears darker, blue-green enhanced)');

    // Purple light (volcanic/stratospheric aerosols)
    if (solar?.position?.altitude < -PURPLE_LIGHT.MIN_DEPRESSION && solar?.position?.altitude > -PURPLE_LIGHT.MAX_DEPRESSION && cloudCover !== undefined && cloudCover < 30) {
        results.phenomena.push('twilight: purple light visible (stratospheric scattering)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretExtendedTwilight({ results, situation }) {
    const { location, daylight } = situation;

    if (!location?.latitude || location.latitude <= 55) return;

    // Extended blue hour
    const blueHourDuration = getBlueHourDuration(daylight);
    if (blueHourDuration && blueHourDuration > 45) {
        results.phenomena.push(`twilight: extended blue hour (${Math.round(blueHourDuration)} minutes)`);
    }

    // Extended twilight duration
    const twilightDuration = getTwilightDuration(daylight);
    if (twilightDuration) {
        const maxDuration = Math.max(twilightDuration.morning, twilightDuration.evening);
        if (maxDuration > 60) {
            results.phenomena.push(`twilight: extended duration (${Math.round(maxDuration)} minutes)`);
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSunriseSunset({ results, situation, dataCurrent }) {
    const { daylight, hourDecimal, month } = situation;
    const { temp, cloudCover } = dataCurrent;

    if (!daylight?.sunriseDecimal || !daylight?.sunsetDecimal) return;

    const nearSunrise = Math.abs(hourDecimal - daylight.sunriseDecimal) < SUNRISE_SUNSET_WINDOW;
    const nearSunset = Math.abs(hourDecimal - daylight.sunsetDecimal) < SUNRISE_SUNSET_WINDOW;

    if (nearSunrise) {
        results.phenomena.push('sunrise: in progress');
        // Coldest time of day in winter
        if ((month >= 9 || month <= 3) && temp < 0) {
            results.phenomena.push('sunrise: coldest time of day');
        }
    } else if (nearSunset) {
        results.phenomena.push('sunset: in progress');
        if (cloudCover !== undefined && cloudCover < 50) {
            results.phenomena.push('sunset: potential for colorful display');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretGreenFlash({ results, situation, dataCurrent }) {
    const { location, daylight, hourDecimal } = situation;
    const { windSpeed, pressure } = dataCurrent;

    const sunRiseOrSet = isNearSunriseOrSet(daylight, hourDecimal, GREEN_FLASH_WINDOW);
    if (!sunRiseOrSet) return;

    // Green flash requires: clear horizon, stable air, high pressure
    if (!location?.horizonClear) return;
    if (windSpeed === undefined || pressure === undefined) return;

    if (pressure > 1015 && windSpeed < 5) {
        let note = `green flash: possible at ${sunRiseOrSet} (watch upper limb)`;
        if (pressure > 1020) note += ' (green rim may be visible with binoculars)';
        results.phenomena.push(note);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCrepuscularRays({ results, situation, dataCurrent }) {
    const { daylight, hourDecimal, solar } = situation;
    const { cloudCover } = dataCurrent;

    const sunRiseOrSet = isNearSunriseOrSet(daylight, hourDecimal, CREPUSCULAR_WINDOW);
    if (!sunRiseOrSet) return;
    if (cloudCover === undefined) return;

    // Crepuscular rays need partial clouds
    if (cloudCover > 30 && cloudCover < 80) {
        let note = 'crepuscular rays: likely (sunbeams through clouds)';
        // Anticrepuscular rays
        if (cloudCover > 40 && cloudCover < 60) {
            note += ', anticrepuscular rays possible opposite sun';
            // Antisolar point
            if (solar?.position?.altitude < 0) {
                results.phenomena.push(`anticrepuscular rays: converging at antisolar point (${Math.round(-solar.position.altitude)}° altitude)`);
            }
        }
        results.phenomena.push(note);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretShadowBands({ results, situation, dataCurrent }) {
    const { solar } = situation;
    const { windSpeed, temp, pressure } = dataCurrent;

    if (!solar?.position || solar.position.altitude <= 0 || solar.position.altitude >= 20) return;
    if (windSpeed === undefined || pressure === undefined) return;

    // Shadow bands from atmospheric turbulence (non-eclipse)
    if (Math.abs(pressure - 1013) / 10 + windSpeed / 10 > 3 && Math.abs(temp - 20) > 10) {
        results.phenomena.push('optics: shadow bands possible (atmospheric turbulence)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretZodiacalLight({ results, situation, dataCurrent }) {
    const { location, month, hour, lunar } = situation;
    const { cloudCover } = dataCurrent;

    if (cloudCover === undefined || cloudCover >= ZODIACAL.MAX_CLOUD_COVER) return;
    if (!location?.lightPollution || location.lightPollution !== 'low') return;

    // Need dark moon
    if (lunar?.phase >= 0.25 && lunar?.phase <= 0.75) return;

    // Calculate ecliptic angle
    const eclipticAngle = Math.abs(90 - Math.abs(location.latitude + 23.4 * Math.sin(((month - 3) * Math.PI) / 6)));

    // Steep ecliptic notification
    /* eslint-disable sonarjs/no-nested-conditional, unicorn/no-nested-ternary */
    if (eclipticAngle > ZODIACAL.STEEP_ECLIPTIC_ANGLE) {
        const seasonalBest =
            location.hemisphere === 'northern'
                ? ZODIACAL.SPRING_MONTHS.includes(month)
                    ? 'evening'
                    : ZODIACAL.AUTUMN_MONTHS.includes(month)
                      ? 'morning'
                      : undefined
                : ZODIACAL.AUTUMN_MONTHS.includes(month)
                  ? 'evening'
                  : ZODIACAL.SPRING_MONTHS.includes(month)
                    ? 'morning'
                    : undefined;
        if (seasonalBest) {
            results.phenomena.push(`zodiacal light: ${seasonalBest} viewing optimal (steep ecliptic)`);
        }
    }

    // Spring evening (northern hemisphere)
    if (ZODIACAL.SPRING_MONTHS.includes(month) && ((hour >= 20 && hour <= 23) || hour <= 1)) {
        let note = 'zodiacal light: visible in west (faint pyramid)';
        // Gegenschein possible in very dark conditions
        if (lunar?.phase < 0.25 && (hour >= 23 || hour <= 1)) note += ', gegenschein possible at antisolar point';
        results.phenomena.push(note);
    }
    // Autumn morning
    else if (ZODIACAL.AUTUMN_MONTHS.includes(month) && hour >= 4 && hour <= 6) {
        results.phenomena.push('zodiacal light: visible in east before dawn');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAirglow({ results, situation, dataCurrent }) {
    const { location, hour } = situation;
    const { cloudCover } = dataCurrent;

    if (!location?.lightPollution || location.lightPollution !== 'low') return;
    if (cloudCover === undefined || cloudCover >= 10) return;
    if (!(hour >= 23 || hour <= 3)) return;

    // Airglow enhanced by geomagnetic activity - use simple seasonal estimate
    // (actual Kp would come from heliophysics module)
    let note = 'airglow: visible (faint bands, green 557nm oxygen emission)';
    if (location.latitude > 30 && location.latitude < 60) note += ', wave structure possible (630nm red emissions)';

    results.phenomena.push(note);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretNoctilucentClouds({ results, situation, dataCurrent }) {
    const { location, date, month, hour } = situation;
    const { cloudCover } = dataCurrent;

    if (!location?.latitude || location.latitude < NOCTILUCENT.MIN_LATITUDE) return;
    if (month < NOCTILUCENT.SEASON_START_MONTH || month > NOCTILUCENT.SEASON_END_MONTH) return;
    if (!(hour >= 22 || hour <= 2)) return;
    if (cloudCover !== undefined && cloudCover >= 50) return;

    const daysFromSolstice = Math.abs(helpers.daysIntoYear(date) - NOCTILUCENT.SUMMER_SOLSTICE_DOY);
    if (daysFromSolstice < NOCTILUCENT.PRIME_WINDOW_DAYS) {
        results.phenomena.push('noctilucent clouds: prime season (look north, silvery-blue wisps)');
    } else {
        results.phenomena.push('noctilucent clouds: possible in northern sky');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAtmosphericOptics({ results, situation, dataCurrent }) {
    const { location, month, daylight, solar } = situation;
    const { temp, humidity, cloudCover, windSpeed } = dataCurrent;

    if (!solar?.position) return;

    const { altitude } = solar.position;

    // 22° halo and sundogs
    if (cloudCover !== undefined && cloudCover > 20 && cloudCover < 80) {
        if (altitude > 0 && altitude < 60) {
            let note = `optics: ${HALO.STANDARD_RADIUS}° halo possible (ice crystals)`;
            if (altitude > 0 && altitude < 22) note += ', sundogs likely';
            results.phenomena.push(note);
        }
    }

    // 46° halo (larger, rarer)
    if (cloudCover !== undefined && cloudCover > 10 && cloudCover < 60 && temp < -5) {
        if (altitude > 10 && altitude < 50) {
            results.phenomena.push(`optics: ${HALO.LARGE_RADIUS}° halo possible (large ring, rare)`);
        }
    }

    // Circumzenithal arc
    if (cloudCover !== undefined && cloudCover > 10 && cloudCover < 50 && temp < -5) {
        if (altitude > 5 && altitude < HALO.CIRCUMZENITHAL_MAX_ALT) {
            results.phenomena.push('optics: circumzenithal arc possible (rainbow colors near zenith)');
        }
    }

    // Upper tangent arc
    if (cloudCover !== undefined && cloudCover > 20 && cloudCover < 60 && temp < -10) {
        if (altitude > 15 && altitude < 30) {
            results.phenomena.push('optics: upper tangent arc likely (V-shape touching top of halo)');
        }
    }

    // Parhelic circle
    if (cloudCover !== undefined && cloudCover > 10 && cloudCover < 40 && temp < -15) {
        if (altitude > 20 && altitude < 40) {
            results.phenomena.push("optics: parhelic circle possible (white band at sun's altitude)");
        }
    }

    // Light pillars (night, urban areas)
    if (temp < 0 && humidity > 85 && windSpeed !== undefined && windSpeed < 3) {
        if (!daylight?.isDaytime && location?.lightPollution !== 'low') {
            results.phenomena.push('optics: light pillars possible (ice crystals reflecting ground lights)');
        }
    }

    // Polar stratospheric clouds (nacreous)
    if (location?.latitude > 55 && temp < -20 && (month >= 11 || month <= 2)) {
        if (altitude < -1 && altitude > -6) {
            results.phenomena.push('optics: polar stratospheric clouds possible (iridescent nacreous colors)');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretWhiteNights({ results, situation }) {
    const { location, date, year } = situation;

    if (!location?.latitude || location.latitude <= 48) return;

    // White nights: sun doesn't go below -6° (civil twilight persists)
    const summerSolstice = new Date(year, 5, 21);
    const daysFromSolstice = Math.floor((location.latitude - 48) * 12.5);

    if (daysFromSolstice > 0) {
        const startDate = new Date(summerSolstice.getTime() - daysFromSolstice * helpers.constants.MILLISECONDS_PER_DAY);
        const endDate = new Date(summerSolstice.getTime() + daysFromSolstice * helpers.constants.MILLISECONDS_PER_DAY);
        if (date >= startDate && date <= endDate) {
            const nearPeak = Math.abs(date - summerSolstice) <= 7 * helpers.constants.MILLISECONDS_PER_DAY;
            if (nearPeak) {
                results.phenomena.push('white nights: peak brightness (no true darkness)');
            } else {
                results.phenomena.push('white nights: twilight persists all night');
            }
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// eslint-disable-next-line sonarjs/cognitive-complexity
function interpretViewingConditions({ results, situation, dataCurrent, weatherData }) {
    const { location, hour, daylight } = situation;
    const { temp, windSpeed, pressure, humidity, cloudCover } = dataCurrent;

    // Only relevant at night or twilight
    if (daylight?.isDaytime && hour > 6 && hour < 18) return;

    // *** Scintillation (twinkling) ***
    if (windSpeed !== undefined && windSpeed > 10) {
        if (windSpeed > 20) {
            results.phenomena.push('observing: severe scintillation expected (jet stream influence)');
        } else if (Math.abs((pressure || 1013) - 1013) > 10) {
            results.phenomena.push('observing: strong scintillation (colorful star twinkling)');
        }
    }

    // *** Temperature change over last hour (thermal turbulence) ***
    const period1h = weatherData?.getPeriod('1h');
    if (temp !== undefined && period1h?.entries.length > 0) {
        const [oldestEntry] = period1h.entries;
        if (oldestEntry.temp !== undefined) {
            const tempChange = Math.abs(temp - oldestEntry.temp);
            if (tempChange > 3) {
                results.phenomena.push(`observing: rapid temperature change ${tempChange.toFixed(1)}°C/hr (thermal turbulence likely)`);
            }
        }
    }

    // *** Thermal gradients at elevation ***
    if (location?.elevation > 500 && period1h?.entries.length > 0) {
        const [oldestEntry] = period1h.entries;
        if (oldestEntry.temp !== undefined && temp !== undefined && oldestEntry._timestamp) {
            const timeDiffHours = (Date.now() - oldestEntry._timestamp) / 3600000;
            if (timeDiffHours > 0.1) {
                const tempGradient = (temp - oldestEntry.temp) / timeDiffHours;
                if (Math.abs(tempGradient) > 2) {
                    results.phenomena.push(`observing: thermal gradient ${tempGradient > 0 ? '↑' : '↓'}${Math.abs(tempGradient).toFixed(1)}°C/hr (${tempGradient > 0 ? 'ground warming - rising air' : 'ground cooling - sinking air'})`);
                }
            }
        }
    }

    // *** Daytime thermal effects warning (afternoon) ***
    if (hour >= 12 && hour <= 17) {
        results.phenomena.push('observing: afternoon thermals (wait 2-3 hours after sunset for best seeing)');
    }

    // *** Pressure trend over 3 hours ***
    const period3h = weatherData?.getPeriod('3h');
    if (pressure !== undefined && period3h?.entries.length > 0) {
        const [oldestEntry] = period3h.entries;
        if (oldestEntry.pressure !== undefined) {
            const pressureTrend = pressure - oldestEntry.pressure;
            if (pressureTrend > 5) {
                results.phenomena.push('observing: rising pressure (improving stability)');
            } else if (pressureTrend < -5) {
                results.phenomena.push('observing: falling pressure (degrading stability)');
            }
        }
    }

    // *** Humidity effects on optics ***
    if (humidity !== undefined) {
        if (humidity > 90) {
            results.phenomena.push('observing: very high humidity (optics will dew rapidly, dew heaters recommended)');
        } else if (humidity > 80) {
            results.phenomena.push('observing: high humidity (monitor for dewing)');
        }
    }

    // *** Ground fog risk ***
    if (temp !== undefined && humidity !== undefined && windSpeed !== undefined) {
        const dewPointApprox = temp - (100 - humidity) / 5;
        if (temp - dewPointApprox < 3 && windSpeed < 3 && (hour >= 22 || hour <= 5)) {
            results.phenomena.push('observing: ground fog risk (temp near dew point, calm winds)');
        }
    }

    // *** Exceptional local conditions ***
    const isPerfect = cloudCover !== undefined && cloudCover < 10 && humidity !== undefined && humidity < 70 && windSpeed !== undefined && windSpeed < 3 && temp !== undefined && temp > -5 && temp < 20 && (hour >= 22 || hour <= 4);
    if (isPerfect) {
        results.phenomena.push('observing: exceptional local conditions (calm, dry, clear)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSeeingForecast({ results, situation, store }) {
    const { hour, daylight } = situation;

    if (!((hour >= 14 && hour <= 19) || hour >= 20 || hour <= 5 || !daylight?.isDaytime)) return;

    const forecast = getSeeingForecast(store.astronomy_atmospheric);
    if (!forecast) return;

    // *** Current conditions (at night) ***
    if (hour >= 20 || hour <= 5 || !daylight?.isDaytime) {
        // Find current/next forecast point
        const current = forecast.next24h?.find((f) => f.hoursFromNow >= 0 && f.hoursFromNow <= 3);
        if (current) {
            // Only report if conditions are notably good or bad
            if (current.observingScore <= 2.5) {
                results.phenomena.push(`observing: excellent conditions now - seeing ${current.seeingArcsec}, ${current.transparencyDesc} transparency`);
            } else if (current.observingScore <= 3.5) {
                results.phenomena.push(`observing: good conditions - seeing ${current.seeingDesc}, ${current.cloudCoverDesc}`);
            } else if (current.observingScore >= 6) {
                results.phenomena.push(`observing: poor conditions - seeing ${current.seeingDesc}, ${current.cloudCoverDesc}`);
            }
            // Jet stream warning (unstable atmosphere = bad seeing)
            if (current.liftedIndex <= -6) {
                results.phenomena.push('observing: unstable atmosphere - expect poor seeing');
            }
        }

        // Improving/deteriorating conditions
        if (forecast.tonight && forecast.tonight.length >= 2) {
            if (forecast.tonight[0].observingScore - forecast.tonight[forecast.tonight.length - 1].observingScore > 1.5) {
                results.phenomena.push('observing: conditions improving through the night');
            } else if (forecast.tonight[forecast.tonight.length - 1].observingScore - forecast.tonight[0].observingScore > 1.5) {
                results.phenomena.push('observing: conditions deteriorating - observe early');
            }
        }
    }

    // *** Evening planning (afternoon) ***
    else if (hour >= 14 && hour <= 19 && forecast.summary) {
        const { summary, bestTonight } = forecast;
        let note = `observing: ${summary.text.toLowerCase()}`;
        if (bestTonight && summary.rating !== 'bad') note += ` - best window around ${new Date(bestTonight.forecastTime).getHours()}:00 (seeing ${bestTonight.seeingDesc}, ${bestTonight.cloudCoverDesc})`;
        results.phenomena.push(note);
    }
}

function interpretSeeingAlert({ results, situation, store }) {
    const { hour } = situation;

    if (!(hour >= 15 && hour <= 18)) return;

    const forecast = getSeeingForecast(store.astronomy_atmospheric);
    if (!forecast?.bestTonight) return;

    // Alert for exceptional conditions in late afternoon
    if (hour >= 15 && hour <= 18) {
        if (forecast.summary?.rating === 'excellent') {
            results.alerts.push(`observing: EXCEPTIONAL night predicted - seeing ${forecast.bestTonight.seeingArcsec}, ${forecast.bestTonight.transparencyDesc} transparency, ${forecast.bestTonight.cloudCoverDesc}`);
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ location, store }) {
    if (!store.astronomy_atmospheric) store.astronomy_atmospheric = {};

    updateSeeingSchedule(store.astronomy_atmospheric, location);

    return {
        interpretTwilightPhase,
        interpretTwilightPhenomena,
        interpretExtendedTwilight,
        interpretSunriseSunset,
        interpretGreenFlash,
        interpretCrepuscularRays,
        interpretShadowBands,
        interpretZodiacalLight,
        interpretAirglow,
        interpretNoctilucentClouds,
        interpretAtmosphericOptics,
        interpretWhiteNights,
        //
        interpretViewingConditions,
        interpretSeeingForecast,
        interpretSeeingAlert,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
