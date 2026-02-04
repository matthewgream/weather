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
const { FormatHelper } = require('./server-function-weather-tools-format.js');
const { DataSlot, DataScheduler, fetchJson, createTimestampTracker } = require('./server-function-weather-tools-live.js');

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

const LIFTED_INDEX_SCALE = {
    '-10': 'very unstable',
    '-6': 'unstable',
    '-4': 'slightly unstable',
    '-1': 'neutral',
    '2': 'slightly stable',
    '6': 'stable',
    '10': 'very stable',
    '15': 'very stable',
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

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
    if (avgScore <= 2.5) return { rating: 'excellent', text: 'excellent conditions tonight' };
    else if (avgScore <= 3.5) return { rating: 'good', text: 'good conditions tonight' };
    else if (avgScore <= 4.5) return { rating: 'fair', text: 'fair conditions tonight' };
    else if (avgScore <= 5.5) return { rating: 'poor', text: 'poor conditions tonight' };
    else return { rating: 'bad', text: 'bad conditions tonight' };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const liveSlotSeeing = new DataSlot('seeing', STALENESS_SEEING.forecast);
const liveScheduler = new DataScheduler('atmospheric');

async function liveSeeingFetchAndProcess(state, situation) {
    const { location } = situation;

    return liveSlotSeeing.fetch(
        state,
        'atmospheric',
        async () => {
            const params = new URLSearchParams({ lon: location.longitude.toFixed(2), lat: location.latitude.toFixed(2), product: 'astro', output: 'json' });
            const data = await fetchJson(`${ENDPOINTS.sevenTimer}?${params}`);
            if (!data.dataseries || !Array.isArray(data.dataseries)) throw new Error('Invalid response format');

            const _fetched = Date.now();
            const initTime = data.init ? parseSevenTimerInit(data.init) : _fetched;

            const forecasts = data.dataseries
                .map((point) => {
                    const forecastTime = initTime + point.timepoint * 3600000;
                    if (point.seeing === -9999 || point.transparency === -9999 || point.cloudcover === -9999 || point.lifted_index === -9999) return undefined; // ignore if errors
                    return {
                        timepoint: point.timepoint,
                        forecastTime,
                        hoursFromNow: Math.round((forecastTime - _fetched) / 3600000),
                        seeing: point.seeing,
                        seeingDesc: SEEING_SCALE[point.seeing]?.desc || 'unknown',
                        seeingArcsec: SEEING_SCALE[point.seeing]?.arcsec || 'unknown',
                        transparency: point.transparency,
                        transparencyDesc: TRANSPARENCY_SCALE[point.transparency]?.desc || 'unknown',
                        cloudCover: point.cloudcover,
                        cloudCoverDesc: CLOUD_COVER_SCALE[point.cloudcover]?.desc || 'unknown',
                        liftedIndex: point.lifted_index,
                        liftedIndexDesc: LIFTED_INDEX_SCALE[point.lifted_index] || 'unknown',
                        humidity: point.rh2m, // Relative humidity at 2m
                        wind: point.wind10m?.speed, // Wind at 10m
                        // Derived observing score (lower = better)
                        observingScore: calculateObservingScore(point),
                    };
                })
                .filter(Boolean);

            const next24h = forecasts.filter((f) => f.hoursFromNow >= 0 && f.hoursFromNow <= 24);
            const tonight = forecasts.filter((f) => {
                const hour = new Date(f.forecastTime).getHours();
                return f.hoursFromNow >= 0 && f.hoursFromNow <= 18 && (hour >= 20 || hour <= 5);
            });
            const bestTonight = tonight?.reduce((best, f) => (!best || f.observingScore < best.observingScore ? f : best), undefined);
            const best24h = next24h?.reduce((best, f) => (!best || f.observingScore < best.observingScore ? f : best), undefined);
            const avgTonight =
                tonight.length > 0
                    ? {
                          seeing: Math.round((tonight.reduce((sum, f) => sum + f.seeing, 0) / tonight.length) * 10) / 10,
                          transparency: Math.round((tonight.reduce((sum, f) => sum + f.transparency, 0) / tonight.length) * 10) / 10,
                          cloudCover: Math.round((tonight.reduce((sum, f) => sum + f.cloudCover, 0) / tonight.length) * 10) / 10,
                      }
                    : undefined;

            return {
                initTime,
                forecasts,
                next24h,
                tonight,
                bestTonight,
                best24h,
                avgTonight,
                summary: generateSeeingSummary(tonight, bestTonight),
            };
        },
        `tonight: ${liveSlotSeeing.get(state)?.tonight?.length || 0} points, best: ${liveSlotSeeing.get(state)?.bestTonight?.seeingDesc || 'n/a'}`
    );
}

function liveSeeingCalculateUpdateInterval(_state, _situation) {
    const hour = new Date().getHours();
    // More frequent updates in late afternoon (planning for evening)
    return [hour >= 14 && hour <= 19 ? INTERVALS_SEEING.evening : INTERVALS_SEEING.normal, hour >= 14 && hour <= 19 ? 'pre-evening' : 'normal'];
}

function liveSchedulerStart(state, situation) {
    liveScheduler.run(
        () => liveSeeingFetchAndProcess(state, situation),
        () => liveSeeingCalculateUpdateInterval(state, situation)
    );
}

function getSeeingForecast(state) {
    return liveSlotSeeing.get(state);
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

    // Belt of Venus and Earth's shadow
    if (cloudCover !== undefined && cloudCover < 40) {
        const sunDepression = Math.abs(solar?.position?.altitude || 0);
        if (sunDepression > BELT_OF_VENUS.MIN_DEPRESSION && sunDepression < BELT_OF_VENUS.MAX_DEPRESSION) results.phenomena.push(`twilight: Belt of Venus ${FormatHelper.degreesToString(sunDepression * 2)} high in ${twilight} sky`);
        results.phenomena.push(`twilight: Earth's shadow visible (dark band on ${twilight} horizon)`);
        // Alpenglow
        if (location?.nearMountains || location.elevation > 1000) results.phenomena.push('twilight: alpenglow on mountain peaks');
    }

    // Dark segment / twilight wedge
    if (cloudCover !== undefined && cloudCover < 10) results.phenomena.push('twilight: dark segment visible (twilight wedge)' + (location.elevation > 1000 ? ' - shadow bands may be visible on mountains' : ''));

    // Purkinje effect (color perception shift)
    results.phenomena.push('twilight: Purkinje effect active (red appears darker, blue-green enhanced)');

    // Purple light (volcanic/stratospheric aerosols)
    if (solar?.position?.altitude < -PURPLE_LIGHT.MIN_DEPRESSION && solar?.position?.altitude > -PURPLE_LIGHT.MAX_DEPRESSION && cloudCover !== undefined && cloudCover < 30)
        results.phenomena.push('twilight: purple light visible (stratospheric scattering)');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretExtendedTwilight({ results, situation }) {
    const { location, daylight } = situation;

    if (location.latitude <= 55) return;

    // Extended blue hour
    const blueHourDuration = getBlueHourDuration(daylight);
    if (blueHourDuration && blueHourDuration > 45) results.phenomena.push(`twilight: extended blue hour (${FormatHelper.secondsToString(blueHourDuration * 60)})`);

    // Extended twilight duration
    const twilightDuration = getTwilightDuration(daylight);
    if (twilightDuration) {
        const maxDuration = Math.max(twilightDuration.morning, twilightDuration.evening);
        if (maxDuration > 60) results.phenomena.push(`twilight: extended duration (${FormatHelper.secondsToString(maxDuration * 60)})`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSunriseSunset({ results, situation, dataCurrent }) {
    const { daylight, hourDecimal, month } = situation;
    const { temp, cloudCover } = dataCurrent;

    if (!daylight?.sunriseDecimal || !daylight?.sunsetDecimal) return;

    if (Math.abs(hourDecimal - daylight.sunriseDecimal) < SUNRISE_SUNSET_WINDOW) {
        results.phenomena.push('sunrise: in progress');
        // Coldest time of day in winter
        if ((month >= 9 || month <= 3) && temp < 0) results.phenomena.push('sunrise: coldest time of day');
    } else if (Math.abs(hourDecimal - daylight.sunsetDecimal) < SUNRISE_SUNSET_WINDOW) {
        results.phenomena.push('sunset: in progress');
        if (cloudCover !== undefined && cloudCover < 50) results.phenomena.push('sunset: potential for colorful display');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretGreenFlash({ results, situation, dataCurrent }) {
    const { location, daylight, hourDecimal } = situation;
    const { windSpeed, pressure } = dataCurrent;

    // Green flash requires: clear horizon, stable air, high pressure
    if (!location?.horizonClear) return;
    if (windSpeed === undefined || pressure === undefined) return;

    const sunRiseOrSet = isNearSunriseOrSet(daylight, hourDecimal, GREEN_FLASH_WINDOW);
    if (!sunRiseOrSet) return;

    if (pressure > 1015 && windSpeed < 5) results.phenomena.push(`green flash: possible at ${sunRiseOrSet} - watch upper limb` + (pressure > 1020 ? ', green rim may be visible with binoculars' : ''));
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCrepuscularRays({ results, situation, dataCurrent }) {
    const { daylight, hourDecimal, solar } = situation;
    const { cloudCover } = dataCurrent;

    if (cloudCover === undefined) return;

    const sunRiseOrSet = isNearSunriseOrSet(daylight, hourDecimal, CREPUSCULAR_WINDOW);
    if (!sunRiseOrSet) return;

    // Crepuscular rays need partial clouds
    if (cloudCover > 30 && cloudCover < 80) {
        results.phenomena.push('crepuscular rays: likely (sunbeams through clouds)');
        // Anticrepuscular rays
        if (cloudCover > 40 && cloudCover < 60) {
            results.phenomena.push('crepuscular rays: anticrepuscular rays possible opposite sun');
            // Antisolar point
            if (solar?.position?.altitude < 0) results.phenomena.push(`crepuscular rays: converging at antisolar point (${FormatHelper.degreesToString(-solar.position.altitude)} altitude)`);
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretShadowBands({ results, situation, dataCurrent }) {
    const { solar } = situation;
    const { windSpeed, temp, pressure } = dataCurrent;

    if (!solar?.position || solar.position.altitude <= 0 || solar.position.altitude >= 20) return;
    if (windSpeed === undefined || pressure === undefined) return;

    // Shadow bands from atmospheric turbulence (non-eclipse)
    if (Math.abs(pressure - 1013) / 10 + windSpeed / 10 > 3 && Math.abs(temp - 20) > 10) results.phenomena.push('optics: shadow bands possible (atmospheric turbulence)');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretZodiacalLight({ results, situation, dataCurrent }) {
    const { location, month, hour, lunar } = situation;
    const { cloudCover } = dataCurrent;

    if (cloudCover === undefined || cloudCover >= ZODIACAL.MAX_CLOUD_COVER) return;
    if (location.lightPollution !== 'low') return;

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
        if (seasonalBest) results.phenomena.push(`zodiacal light: ${seasonalBest} viewing optimal (steep ecliptic)`);
    }

    // Spring evening (northern hemisphere), Gegenschein possible in very dark conditions
    if (ZODIACAL.SPRING_MONTHS.includes(month) && ((hour >= 20 && hour <= 23) || hour <= 1))
        results.phenomena.push('zodiacal light: visible in west (faint pyramid)' + (lunar?.phase < 0.25 && (hour >= 23 || hour <= 1) ? ', gegenschein possible at antisolar point' : ''));
    // Autumn morning
    else if (ZODIACAL.AUTUMN_MONTHS.includes(month) && hour >= 4 && hour <= 6) results.phenomena.push('zodiacal light: visible in east before dawn');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAirglow({ results, situation, dataCurrent }) {
    const { location, hour } = situation;
    const { cloudCover } = dataCurrent;

    if (location.lightPollution !== 'low') return;
    if (cloudCover === undefined || cloudCover >= 10) return;

    // Airglow enhanced by geomagnetic activity - use simple seasonal estimate (actual Kp would come from heliophysics module)
    if (hour >= 23 || hour <= 3) results.phenomena.push('airglow: visible (faint bands, green 557nm oxygen emission)' + (location.latitude > 30 && location.latitude < 60 ? ', wave structure possible (630nm red emissions)' : ''));
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretNoctilucentClouds({ results, situation, dataCurrent }) {
    const { location, date, month, hour } = situation;
    const { cloudCover } = dataCurrent;

    if (location.latitude < NOCTILUCENT.MIN_LATITUDE) return;
    if (month < NOCTILUCENT.SEASON_START_MONTH || month > NOCTILUCENT.SEASON_END_MONTH) return;
    if (!(hour >= 22 || hour <= 2)) return;
    if (cloudCover !== undefined && cloudCover >= 50) return;

    const daysFromSolstice = Math.abs(helpers.daysIntoYear(date) - NOCTILUCENT.SUMMER_SOLSTICE_DOY);
    if (daysFromSolstice < NOCTILUCENT.PRIME_WINDOW_DAYS) results.phenomena.push('noctilucent clouds: prime season - look north for silvery-blue wisps');
    else results.phenomena.push('noctilucent clouds: possible in northern sky');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAtmosphericOptics({ results, situation, dataCurrent }) {
    const { location, month, daylight, solar } = situation;
    const { temp, humidity, cloudCover, windSpeed } = dataCurrent;

    if (!solar?.position) return;
    const { altitude } = solar.position;

    // 22° halo and sundogs
    if (cloudCover !== undefined && cloudCover > 20 && cloudCover < 80)
        if (altitude > 0 && altitude < 60) results.phenomena.push(`optics: ${FormatHelper.degreesToString(HALO.STANDARD_RADIUS)} halo possible (ice crystals)` + (altitude > 0 && altitude < 22 ? ', sundogs likely' : ''));

    // 46° halo (larger, rarer)
    if (cloudCover !== undefined && cloudCover > 10 && cloudCover < 60 && temp < -5) if (altitude > 10 && altitude < 50) results.phenomena.push(`optics: ${FormatHelper.degreesToString(HALO.LARGE_RADIUS)} halo possible (large ring, rare)`);

    // Circumzenithal arc
    if (cloudCover !== undefined && cloudCover > 10 && cloudCover < 50 && temp < -5) if (altitude > 5 && altitude < HALO.CIRCUMZENITHAL_MAX_ALT) results.phenomena.push('optics: circumzenithal arc possible (rainbow colors near zenith)');

    // Upper tangent arc
    if (cloudCover !== undefined && cloudCover > 20 && cloudCover < 60 && temp < -10) if (altitude > 15 && altitude < 30) results.phenomena.push('optics: upper tangent arc likely (V-shape touching top of halo)');

    // Parhelic circle
    if (cloudCover !== undefined && cloudCover > 10 && cloudCover < 40 && temp < -15) if (altitude > 20 && altitude < 40) results.phenomena.push("optics: parhelic circle possible (white band at sun's altitude)");

    // Light pillars (night, urban areas)
    if (temp < 0 && humidity > 85 && windSpeed !== undefined && windSpeed < 3) if (!daylight?.isDaytime && location.lightPollution !== 'low') results.phenomena.push('optics: light pillars possible (ice crystals reflecting ground lights)');

    // Polar stratospheric clouds (nacreous)
    if (location.latitude > 55 && temp < -20 && (month >= 11 || month <= 2)) if (altitude < -1 && altitude > -6) results.phenomena.push('optics: polar stratospheric clouds possible (iridescent nacreous colors)');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretWhiteNights({ results, situation }) {
    const { location, date, year } = situation;

    if (location.latitude <= 48) return;

    // White nights: sun doesn't go below -6° (civil twilight persists)
    const daysFromSolstice = Math.floor((location.latitude - 48) * 12.5);
    if (daysFromSolstice > 0) {
        const summerSolstice = new Date(year, 5, 21);
        const startDate = new Date(summerSolstice.getTime() - daysFromSolstice * helpers.constants.MILLISECONDS_PER_DAY);
        const endDate = new Date(summerSolstice.getTime() + daysFromSolstice * helpers.constants.MILLISECONDS_PER_DAY);
        if (date >= startDate && date <= endDate) {
            if (Math.abs(date - summerSolstice) <= 7 * helpers.constants.MILLISECONDS_PER_DAY) results.phenomena.push('white nights: peak brightness (no true darkness)');
            else results.phenomena.push('white nights: twilight persists all night');
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
        if (windSpeed > 20) results.phenomena.push(`observing: severe scintillation expected (${FormatHelper.windspeedToString(windSpeed)}) - jet stream influence`);
        else if (Math.abs((pressure || 1013) - 1013) > 10) results.phenomena.push(`observing: strong scintillation (${FormatHelper.windspeedToString(windSpeed)}) - colorful star twinkling`);
    }

    // *** Temperature change over last hour (thermal turbulence) ***
    const period1h = weatherData?.getPeriod('1h');
    if (temp !== undefined && period1h?.entries.length > 0) {
        const [oldestEntry] = period1h.entries;
        if (oldestEntry.temp !== undefined) {
            const tempChange = Math.abs(temp - oldestEntry.temp);
            if (tempChange > 3) results.phenomena.push(`observing: rapid temperature change (${FormatHelper.temperatureToString(tempChange)}/hr) - thermal turbulence likely`);
        }
    }

    // *** Thermal gradients at elevation ***
    if (location.elevation > 500 && period1h?.entries.length > 0) {
        const [oldestEntry] = period1h.entries;
        if (oldestEntry.temp !== undefined && temp !== undefined && oldestEntry._timestamp) {
            const timeDiffHours = (Date.now() - oldestEntry._timestamp) / 3600000;
            if (timeDiffHours > 0.1) {
                const tempGradient = (temp - oldestEntry.temp) / timeDiffHours;
                if (Math.abs(tempGradient) > 2)
                    results.phenomena.push(
                        `observing: thermal gradient ${tempGradient > 0 ? 'rising' : 'falling'} (${FormatHelper.temperatureToString(Math.abs(tempGradient))}/hr) - ${tempGradient > 0 ? 'ground warming, rising air' : 'ground cooling, sinking air'}`
                    );
            }
        }
    }

    // *** Daytime thermal effects warning (afternoon) ***
    if (hour >= 12 && hour <= 17) results.phenomena.push('observing: afternoon thermals - wait 2-3 hours after sunset for best seeing');

    // *** Pressure trend over 3 hours ***
    const period3h = weatherData?.getPeriod('3h');
    if (pressure !== undefined && period3h?.entries.length > 0) {
        const [oldestEntry] = period3h.entries;
        if (oldestEntry.pressure !== undefined) {
            const pressureTrend = pressure - oldestEntry.pressure;
            if (pressureTrend > 5) results.phenomena.push('observing: rising pressure - improving stability');
            else if (pressureTrend < -5) results.phenomena.push('observing: falling pressure - degrading stability');
        }
    }

    // *** Humidity effects on optics ***
    if (humidity !== undefined) {
        if (humidity > 90) results.phenomena.push(`observing: very high humidity (${FormatHelper.humidityToString(humidity)}) - optics will dew rapidly, dew heaters recommended`);
        else if (humidity > 80) results.phenomena.push(`observing: high humidity (${FormatHelper.humidityToString(humidity)}) - monitor for dewing`);
    }

    // *** Ground fog risk ***
    if (temp !== undefined && humidity !== undefined && windSpeed !== undefined) {
        const dewPointApprox = temp - (100 - humidity) / 5;
        if (temp - dewPointApprox < 3 && windSpeed < 3 && (hour >= 22 || hour <= 5)) results.phenomena.push('observing: ground fog risk - temp near dew point, calm winds');
    }

    // *** Exceptional local conditions ***
    const isPerfect = cloudCover !== undefined && cloudCover < 10 && humidity !== undefined && humidity < 70 && windSpeed !== undefined && windSpeed < 3 && temp !== undefined && temp > -5 && temp < 20 && (hour >= 22 || hour <= 4);
    if (isPerfect) results.phenomena.push('observing: exceptional local conditions (calm, dry, clear)');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSeeingForecast({ results, situation, store }) {
    const { hour, daylight, location, now } = situation;

    if (!((hour >= 14 && hour <= 19) || hour >= 20 || hour <= 5 || !daylight?.isDaytime)) return;

    const forecast = getSeeingForecast(store.astronomy_atmospheric);
    if (!forecast) return;

    const ts = createTimestampTracker(now, location.timezone);

    // *** Current conditions (at night) ***
    if (hour >= 20 || hour <= 5 || !daylight?.isDaytime) {
        // Find current/next forecast point
        const current = forecast?.next24h?.find((f) => f.hoursFromNow >= 0 && f.hoursFromNow <= 3);
        if (current) {
            // Only report if conditions are notably good or bad
            if (current.observingScore <= 2.5) results.phenomena.push(`observing: ${ts.get('seeing', forecast._fetched)}excellent conditions now (seeing ${current.seeingArcsec}, ${current.transparencyDesc} transparency)`);
            else if (current.observingScore <= 3.5) results.phenomena.push(`observing: ${ts.get('seeing', forecast._fetched)}good conditions (seeing ${current.seeingDesc}, ${current.cloudCoverDesc})`);
            else if (current.observingScore >= 6) results.phenomena.push(`observing: ${ts.get('seeing', forecast._fetched)}poor conditions (seeing ${current.seeingDesc}, ${current.cloudCoverDesc})`);
            // Jet stream warning (unstable atmosphere = bad seeing)
            if (current.liftedIndex <= -6) results.phenomena.push(`observing: ${ts.get('seeing', forecast._fetched)}unstable atmosphere - expect poor seeing`);
        }
        // Improving/deteriorating conditions
        if (forecast?.tonight?.length >= 2) {
            if (forecast.tonight[0].observingScore - forecast.tonight[forecast.tonight.length - 1].observingScore > 1.5) results.phenomena.push(`observing: ${ts.get('seeing', forecast._fetched)}conditions improving through the night`);
            else if (forecast.tonight[forecast.tonight.length - 1].observingScore - forecast.tonight[0].observingScore > 1.5)
                results.phenomena.push(`observing: ${ts.get('seeing', forecast._fetched)}conditions deteriorating - observe early`);
        }
    }

    // *** Evening planning (afternoon) ***
    else if (hour >= 14 && hour <= 19 && forecast.summary) {
        const { summary, bestTonight } = forecast;
        results.phenomena.push(
            // eslint-disable-next-line unicorn/consistent-destructuring
            `observing: ${ts.get('seeing', forecast._fetched)}${summary.text}` +
                (bestTonight && summary.rating !== 'bad' ? ` - best window around ${FormatHelper.timeToString(bestTonight.forecastTime, { hoursOnly: true })} (seeing ${bestTonight.seeingDesc}, ${bestTonight.cloudCoverDesc})` : '')
        );
    }
}

function interpretSeeingAlert({ results, situation, store }) {
    const { hour, now, location } = situation;

    if (!(hour >= 15 && hour <= 18)) return;

    const forecast = getSeeingForecast(store.astronomy_atmospheric);
    if (!forecast?.bestTonight) return;

    const ts = createTimestampTracker(now, location.timezone);

    // Alert for exceptional conditions in late afternoon
    if (hour >= 15 && hour <= 18) {
        const { summary, bestTonight } = forecast;
        if (summary?.rating === 'excellent')
            // eslint-disable-next-line unicorn/consistent-destructuring
            results.alerts.push(`observing: ${ts.get('seeing', forecast._fetched)}EXCEPTIONAL night predicted (seeing ${bestTonight.seeingArcsec}, ${bestTonight.transparencyDesc} transparency, ${bestTonight.cloudCoverDesc})`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ location, store }) {
    if (!store.astronomy_atmospheric) store.astronomy_atmospheric = {};

    liveSchedulerStart(store.astronomy_atmospheric, { location });

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
