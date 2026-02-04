// -----------------------------------------------------------------------------------------------------------------------------------------
// Eclipses Module - Solar and Lunar Eclipse Data and Interpretation
// -----------------------------------------------------------------------------------------------------------------------------------------
//
// This module uses pre-computed eclipse data from NASA's Goddard Space Flight Center.
// Eclipse Predictions by Fred Espenak, NASA GSFC Emeritus
// Source: https://eclipse.gsfc.nasa.gov/
//
// Data covers 2025-2035 with easy extension for future decades.
// No complex astronomical calculations - just date matching and simple geometry.
//
// -----------------------------------------------------------------------------------------------------------------------------------------

const { calculateDistanceToPath } = require('./server-function-weather-tools-calculators.js');
const toolsAstronomy = require('./server-function-weather-tools-astronomical.js');
const { FormatHelper } = require('./server-function-weather-tools-format.js');

/* eslint-disable sonarjs/cognitive-complexity */

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// Lookahead days for upcoming eclipse notifications
const SOLAR_LOOKAHEAD_DAYS = 30;
const LUNAR_LOOKAHEAD_DAYS = 14;

// -----------------------------------------------------------------------------------------------------------------------------------------
// NASA Solar Eclipse Data: 2025-2035
// Source: https://eclipse.gsfc.nasa.gov/SEdecade/SEdecade2021.html
// -----------------------------------------------------------------------------------------------------------------------------------------

const SOLAR_ECLIPSES = [
    // 2025
    {
        date: '2025-03-29T10:48:36Z',
        type: 'partial',
        magnitude: 0.938,
        regions: 'nw Africa, Europe, n Russia',
    },
    {
        date: '2025-09-21T19:43:04Z',
        type: 'partial',
        magnitude: 0.855,
        regions: 's Pacific, N.Z., Antarctica',
    },
    // 2026
    {
        date: '2026-02-17T12:13:05Z',
        type: 'annular',
        magnitude: 0.963,
        duration: '2m20s',
        regions: 's Argentina & Chile, s Africa, Antarctica',
        path: 'Antarctica',
        pathCoords: [{ lat: -72, lon: -10 }],
    },
    {
        date: '2026-08-12T17:47:05Z',
        type: 'total',
        magnitude: 1.039,
        duration: '2m18s',
        pathWidth: 294,
        regions: 'n N. America, w Africa, Europe',
        path: 'Arctic, Greenland, Iceland, Spain',
        pathCoords: [
            { lat: 65, lon: -40 }, // Greenland
            { lat: 65.5, lon: -18 }, // Iceland
            { lat: 42.5, lon: -8.5 }, // Spain
            { lat: 40.5, lon: -3.5 }, // Central Spain
        ],
    },
    // 2027
    {
        date: '2027-02-06T16:00:47Z',
        type: 'annular',
        magnitude: 0.928,
        duration: '7m51s',
        regions: 'S. America, Antarctica, w & s Africa',
        path: 'Chile, Argentina, Atlantic',
        pathCoords: [
            { lat: -35, lon: -72 },
            { lat: -40, lon: -60 },
        ],
    },
    {
        date: '2027-08-02T10:07:49Z',
        type: 'total',
        magnitude: 1.079,
        duration: '6m23s',
        pathWidth: 258,
        regions: 'Africa, Europe, Mid East, w & s Asia',
        path: 'Morocco, Spain, Algeria, Libya, Egypt, Saudi Arabia, Yemen, Somalia',
        pathCoords: [
            { lat: 36, lon: -6 }, // Morocco/Spain
            { lat: 34.5, lon: 3 }, // Algeria
            { lat: 31, lon: 15 }, // Libya
            { lat: 26, lon: 31 }, // Egypt (Luxor!)
            { lat: 21, lon: 40 }, // Saudi Arabia
            { lat: 14, lon: 47 }, // Yemen
        ],
    },
    // 2028
    {
        date: '2028-01-26T15:08:58Z',
        type: 'annular',
        magnitude: 0.921,
        duration: '10m27s',
        regions: 'e N. America, C. & S. America, w Europe, nw Africa',
        path: 'Ecuador, Peru, Brazil, Suriname, Spain, Portugal',
        pathCoords: [
            { lat: -2, lon: -80 }, // Ecuador
            { lat: -8, lon: -75 }, // Peru
            { lat: 0, lon: -52 }, // Brazil
            { lat: 39, lon: -9 }, // Portugal
            { lat: 40, lon: -4 }, // Spain
        ],
    },
    {
        date: '2028-07-22T02:56:39Z',
        type: 'total',
        magnitude: 1.056,
        duration: '5m10s',
        pathWidth: 230,
        regions: 'SE Asia, E. Indies, Australia, N.Z.',
        path: 'Australia, N.Z.',
        pathCoords: [
            { lat: -22, lon: 135 }, // Australia
            { lat: -30, lon: 145 }, // SE Australia
            { lat: -42, lon: 172 }, // New Zealand
        ],
    },
    // 2029
    {
        date: '2029-01-14T17:13:47Z',
        type: 'partial',
        magnitude: 0.871,
        regions: 'N. America, C. America',
    },
    {
        date: '2029-06-12T04:06:13Z',
        type: 'partial',
        magnitude: 0.458,
        regions: 'Arctic, Scandinavia, Alaska, n Asia, n Canada',
    },
    {
        date: '2029-07-11T15:37:18Z',
        type: 'partial',
        magnitude: 0.23,
        regions: 's Chile, s Argentina',
    },
    {
        date: '2029-12-05T15:03:57Z',
        type: 'partial',
        magnitude: 0.891,
        regions: 's Argentina, s Chile, Antarctica',
    },
    // 2030
    {
        date: '2030-06-01T06:29:13Z',
        type: 'annular',
        magnitude: 0.944,
        duration: '5m21s',
        regions: 'Europe, n Africa, Mid East, Asia, Arctic, Alaska',
        path: 'Algeria, Tunisia, Greece, Turkey, Russia, n China, Japan',
        pathCoords: [
            { lat: 33, lon: 3 }, // Algeria
            { lat: 36, lon: 10 }, // Tunisia
            { lat: 38, lon: 23 }, // Greece
            { lat: 40, lon: 32 }, // Turkey
            { lat: 50, lon: 90 }, // Russia
            { lat: 45, lon: 125 }, // N China
            { lat: 35, lon: 137 }, // Japan
        ],
    },
    {
        date: '2030-11-25T06:51:37Z',
        type: 'total',
        magnitude: 1.047,
        duration: '3m44s',
        pathWidth: 169,
        regions: 's Africa, s Indian Oc., E. Indies, Australia, Antarctica',
        path: 'Botswana, S. Africa, Australia',
        pathCoords: [
            { lat: -22, lon: 24 }, // Botswana
            { lat: -30, lon: 28 }, // South Africa
            { lat: -35, lon: 120 }, // SW Australia
            { lat: -32, lon: 140 }, // S Australia
        ],
    },
    // 2031-2035
    {
        date: '2031-05-21T07:16:04Z',
        type: 'annular',
        magnitude: 0.959,
        duration: '5m26s',
        regions: 's Africa, Indian Ocean, India, SE Asia',
        path: 'Angola, Zambia, India, Sri Lanka, Malaysia',
        pathCoords: [
            { lat: -15, lon: 20 },
            { lat: 10, lon: 77 },
            { lat: 5, lon: 100 },
        ],
    },
    {
        date: '2031-11-14T21:07:31Z',
        type: 'hybrid',
        magnitude: 1.011,
        duration: '1m08s',
        regions: 'Pacific Ocean',
        path: 'Pacific Ocean (mostly over water)',
        pathCoords: [{ lat: -5, lon: -170 }],
    },
    {
        date: '2033-03-30T18:02:36Z',
        type: 'total',
        magnitude: 1.046,
        duration: '2m37s',
        regions: 'Alaska, Arctic, Russia, Asia',
        path: 'Alaska, Russia',
        pathCoords: [
            { lat: 64, lon: -160 },
            { lat: 70, lon: 170 },
        ],
    },
    {
        date: '2034-03-20T10:18:45Z',
        type: 'total',
        magnitude: 1.046,
        duration: '4m09s',
        regions: 'c Africa, Mid East, Asia',
        path: 'Nigeria, Cameroon, Chad, Egypt, Saudi Arabia, Iran, Afghanistan, China',
        pathCoords: [
            { lat: 10, lon: 8 },
            { lat: 25, lon: 30 },
            { lat: 30, lon: 50 },
            { lat: 35, lon: 70 },
        ],
    },
    {
        date: '2035-09-02T01:56:46Z',
        type: 'total',
        magnitude: 1.032,
        duration: '2m54s',
        regions: 'e Asia, Pacific, Japan, Alaska',
        path: 'China, N Korea, S Korea, Japan',
        pathCoords: [
            { lat: 38, lon: 115 },
            { lat: 38, lon: 125 },
            { lat: 36, lon: 135 },
            { lat: 35, lon: 140 },
        ],
    },
];

// -----------------------------------------------------------------------------------------------------------------------------------------
// NASA Lunar Eclipse Data: 2025-2035
// Source: https://eclipse.gsfc.nasa.gov/LEdecade/LEdecade2021.html
// -----------------------------------------------------------------------------------------------------------------------------------------

const LUNAR_ECLIPSES = [
    // 2025
    {
        date: '2025-03-14T06:59:56Z',
        type: 'total',
        magnitude: 1.178,
        duration: '3h38m',
        totalDuration: '1h05m',
        regions: 'Pacific, Americas, w Europe, w Africa',
    },
    {
        date: '2025-09-07T18:12:58Z',
        type: 'total',
        magnitude: 1.362,
        duration: '3h29m',
        totalDuration: '1h22m',
        regions: 'Europe, Africa, Asia, Australia',
    },
    // 2026
    {
        date: '2026-03-03T11:34:52Z',
        type: 'total',
        magnitude: 1.151,
        duration: '3h27m',
        totalDuration: '0h58m',
        regions: 'e Asia, Australia, Pacific, Americas',
    },
    {
        date: '2026-08-28T04:14:04Z',
        type: 'partial',
        magnitude: 0.93,
        duration: '3h18m',
        totalDuration: undefined,
        regions: 'e Pacific, Americas, Europe, Africa',
    },
    // 2027
    {
        date: '2027-02-20T23:14:06Z',
        type: 'penumbral',
        magnitude: -0.057,
        duration: undefined,
        totalDuration: undefined,
        regions: 'Americas, Europe, Africa, Asia',
    },
    {
        date: '2027-07-18T16:04:09Z',
        type: 'penumbral',
        magnitude: -1.068,
        duration: undefined,
        totalDuration: undefined,
        regions: 'e Africa, Asia, Australia, Pacific',
    },
    {
        date: '2027-08-17T07:14:59Z',
        type: 'penumbral',
        magnitude: -0.525,
        duration: undefined,
        totalDuration: undefined,
        regions: 'Pacific, Americas',
    },
    // 2028
    {
        date: '2028-01-12T04:14:13Z',
        type: 'partial',
        magnitude: 0.066,
        duration: '0h56m',
        totalDuration: undefined,
        regions: 'Americas, Europe, Africa',
    },
    {
        date: '2028-07-06T18:20:57Z',
        type: 'partial',
        magnitude: 0.389,
        duration: '2h21m',
        totalDuration: undefined,
        regions: 'Europe, Africa, Asia, Australia',
    },
    {
        date: '2028-12-31T16:53:15Z',
        type: 'total',
        magnitude: 1.246,
        duration: '3h29m',
        totalDuration: '1h11m',
        regions: 'Europe, Africa, Asia, Australia, Pacific',
    },
    // 2029
    {
        date: '2029-06-26T03:23:22Z',
        type: 'total',
        magnitude: 1.844,
        duration: '3h40m',
        totalDuration: '1h42m',
        regions: 'Americas, Europe, Africa, Mid East',
        note: 'Exceptionally deep total lunar eclipse - one of the deepest this century',
    },
    {
        date: '2029-12-20T22:43:12Z',
        type: 'total',
        magnitude: 1.117,
        duration: '3h33m',
        totalDuration: '0h54m',
        regions: 'Americas, Europe, Africa, Asia',
    },
    // 2030
    {
        date: '2030-06-15T18:34:34Z',
        type: 'partial',
        magnitude: 0.502,
        duration: '2h24m',
        totalDuration: undefined,
        regions: 'Europe, Africa, Asia, Australia',
    },
    {
        date: '2030-12-09T22:28:51Z',
        type: 'penumbral',
        magnitude: -0.163,
        duration: undefined,
        totalDuration: undefined,
        regions: 'Americas, Europe, Africa, Asia',
    },
    // 2031-2035
    {
        date: '2032-04-25T15:13:00Z',
        type: 'total',
        magnitude: 1.19,
        duration: '3h32m',
        totalDuration: '1h05m',
        regions: 'Europe, Africa, Asia, Australia',
    },
    {
        date: '2032-10-18T19:02:00Z',
        type: 'total',
        magnitude: 1.107,
        duration: '3h24m',
        totalDuration: '0h49m',
        regions: 'Americas, Europe, Africa, Asia',
    },
    {
        date: '2033-04-14T19:13:00Z',
        type: 'total',
        magnitude: 1.381,
        duration: '3h34m',
        totalDuration: '1h20m',
        regions: 'Americas, Europe, Africa',
    },
    {
        date: '2033-10-08T10:55:00Z',
        type: 'total',
        magnitude: 1.24,
        duration: '3h27m',
        totalDuration: '1h10m',
        regions: 'Asia, Australia, Pacific, Americas',
    },
];

const DANJON_SCALE = [
    { L: 0, description: 'very dark eclipse - Moon almost invisible', minMag: 1.7 },
    { L: 1, description: 'dark eclipse - gray or brownish coloration', minMag: 1.5 },
    { L: 2, description: 'deep red or rust-colored eclipse', minMag: 1.3 },
    { L: 3, description: 'brick-red eclipse with brighter edge', minMag: 1.1 },
    { L: 4, description: 'bright copper-red or orange eclipse', minMag: 1 },
];

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getDaysDifference(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    d1.setUTCHours(0, 0, 0, 0);
    d2.setUTCHours(0, 0, 0, 0);
    return Math.round((d2 - d1) / (24 * 60 * 60 * 1000));
}

function isSameDay(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getUTCFullYear() === d2.getUTCFullYear() && d1.getUTCMonth() === d2.getUTCMonth() && d1.getUTCDate() === d2.getUTCDate();
}

function isWithinDays(eclipseDate, currentDate, days) {
    const diff = getDaysDifference(currentDate, eclipseDate);
    return diff >= 0 && diff <= days;
}

function isLunarEclipseVisible(eclipse, latitude, longitude) {
    const eclipseDate = new Date(eclipse.date);
    // Check Moon altitude at peak eclipse and 1 hour before/after
    const moonPos = toolsAstronomy.getLunarPosition(eclipseDate, latitude, longitude);
    const before = new Date(eclipseDate.getTime() - 60 * 60 * 1000);
    const after = new Date(eclipseDate.getTime() + 60 * 60 * 1000);
    const moonBefore = toolsAstronomy.getLunarPosition(before, latitude, longitude);
    const moonAfter = toolsAstronomy.getLunarPosition(after, latitude, longitude);
    return {
        visible: moonPos.altitude > -5 || moonBefore.altitude > -5 || moonAfter.altitude > -5,
        altitude: moonPos.altitude,
        bestAltitude: Math.max(moonPos.altitude, moonBefore.altitude, moonAfter.altitude),
    };
}

function getDanjonScale(magnitude) {
    if (magnitude < 1) return undefined;
    for (const level of DANJON_SCALE) if (magnitude >= level.minMag) return level;
    return DANJON_SCALE[DANJON_SCALE.length - 1];
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolarEclipses({ results, situation, dataCurrent }) {
    const { location, date } = situation;
    const { cloudCover } = dataCurrent;

    const now = new Date(date);

    let todayEclipse;
    let upcomingEclipse;
    let daysUntil;

    for (const eclipse of SOLAR_ECLIPSES) {
        const eclipseDate = new Date(eclipse.date);
        if (isSameDay(now, eclipseDate)) {
            todayEclipse = eclipse;
            break;
        }
        if (isWithinDays(eclipseDate, now, SOLAR_LOOKAHEAD_DAYS)) {
            const days = getDaysDifference(now, eclipseDate);
            if (days > 0 && (daysUntil === undefined || days < daysUntil)) {
                upcomingEclipse = eclipse;
                daysUntil = days;
            }
        }
    }

    // =====================================================================
    // TODAY'S SOLAR ECLIPSE
    // =====================================================================

    if (todayEclipse) {
        results.phenomena.push(`eclipse: ${FormatHelper.capitalise(todayEclipse.type)} solar eclipse today`);

        // eslint-disable-next-line unicorn/prefer-switch
        if (todayEclipse.type === 'total') {
            results.alerts.push('eclipse: RARE total solar eclipse');
            if (todayEclipse.duration) results.phenomena.push(`eclipse: totality duration ${todayEclipse.duration}`);
            if (todayEclipse.magnitude > 1.05) results.phenomena.push('eclipse: deep total eclipse - extended corona visible');
        } else if (todayEclipse.type === 'annular') {
            results.phenomena.push('eclipse: "ring of fire" annular eclipse');
            if (todayEclipse.duration) results.phenomena.push(`eclipse: annularity duration ${todayEclipse.duration}`);
        } else if (todayEclipse.type === 'hybrid') {
            results.phenomena.push('eclipse: rare hybrid (annular-total) eclipse');
        }

        // Visibility from user location
        if (todayEclipse.pathCoords) {
            const distance = calculateDistanceToPath(location.latitude, location.longitude, todayEclipse.pathCoords);
            if (distance !== undefined) {
                if (distance < 100) {
                    results.alerts.push(`eclipse: you are near the path of ${todayEclipse.type === 'total' ? 'totality' : 'annularity'}`);
                    results.phenomena.push(`eclipse: approximately ${FormatHelper.distanceKmToString(distance)} from central line`);
                } else if (distance < 500) results.phenomena.push('eclipse: deep partial eclipse visible from your location');
                else if (distance < 2000) results.phenomena.push('eclipse: partial eclipse visible from your location');
                else results.phenomena.push('eclipse: eclipse not well-placed for your location');
            }
        }

        if (todayEclipse.path) results.phenomena.push(`eclipse: path crosses: ${todayEclipse.path}`);

        // Viewing conditions
        if (cloudCover !== undefined) {
            if (cloudCover < 20) results.phenomena.push('eclipse: excellent viewing conditions - clear skies');
            else if (cloudCover < 50) results.phenomena.push('eclipse: fair viewing conditions - some clouds');
            else if (cloudCover < 80) results.phenomena.push('eclipse: poor viewing conditions - significant clouds');
            else results.phenomena.push('eclipse: eclipse likely obscured by heavy clouds');
        }

        // Safety
        results.alerts.push('eclipse: NEVER look directly at the Sun without certified eclipse glasses');
        if (todayEclipse.type === 'total') results.phenomena.push('eclipse: safe to view with naked eye ONLY during totality');
        else results.alerts.push('eclipse: eye protection required at ALL times');
    }

    // =====================================================================
    // UPCOMING SOLAR ECLIPSE
    // =====================================================================
    else if (upcomingEclipse && daysUntil <= SOLAR_LOOKAHEAD_DAYS) {
        if (daysUntil <= 7) {
            results.phenomena.push(`eclipse: ${FormatHelper.capitalise(upcomingEclipse.type)} solar eclipse in ${FormatHelper.pluralise('days', daysUntil)}`);
            if (upcomingEclipse.type === 'total') results.alerts.push('eclipse: rare total solar eclipse approaching');
            if (upcomingEclipse.pathCoords) {
                const distance = calculateDistanceToPath(location.latitude, location.longitude, upcomingEclipse.pathCoords);
                if (distance !== undefined && distance < 500) results.phenomena.push('eclipse: you may be near the eclipse path');
            }
            results.phenomena.push('eclipse: obtain certified eclipse glasses for safe viewing');
        } else if (daysUntil <= 14 && upcomingEclipse.type === 'total') results.phenomena.push(`eclipse: total solar eclipse in ${FormatHelper.pluralise('days', daysUntil)}`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarEclipses({ results, situation, dataCurrent }) {
    const { location, date } = situation;
    const { cloudCover } = dataCurrent;

    const now = new Date(date);

    let todayEclipse;
    let upcomingEclipse;
    let daysUntil;

    for (const eclipse of LUNAR_ECLIPSES) {
        const eclipseDate = new Date(eclipse.date);
        if (isSameDay(now, eclipseDate)) {
            todayEclipse = eclipse;
            break;
        }
        if (isWithinDays(eclipseDate, now, LUNAR_LOOKAHEAD_DAYS)) {
            const days = getDaysDifference(now, eclipseDate);
            if (days > 0 && (daysUntil === undefined || days < daysUntil)) {
                upcomingEclipse = eclipse;
                daysUntil = days;
            }
        }
    }

    // =====================================================================
    // TODAY'S LUNAR ECLIPSE
    // =====================================================================

    if (todayEclipse) {
        results.phenomena.push(`eclipse: ${FormatHelper.capitalise(todayEclipse.type)} lunar eclipse tonight`);

        // eslint-disable-next-line unicorn/prefer-switch
        if (todayEclipse.type === 'total') {
            if (todayEclipse.magnitude > 1.7) {
                results.alerts.push('eclipse: exceptionally deep total lunar eclipse');
                results.phenomena.push('eclipse: Moon will appear very dark red');
            } else if (todayEclipse.magnitude > 1.4) results.phenomena.push('eclipse: deep total eclipse - dark red Moon');
            else if (todayEclipse.magnitude > 1.2) results.phenomena.push('eclipse: Moon will appear copper-red');
            else results.phenomena.push('eclipse: Moon will appear bright red-orange');
            const danjon = getDanjonScale(todayEclipse.magnitude);
            if (danjon) results.phenomena.push(`eclipse: ${danjon.description}`);
            if (todayEclipse.totalDuration) results.phenomena.push(`eclipse: totality duration: ${todayEclipse.totalDuration}`);
            if (todayEclipse.note) results.phenomena.push(`eclipse: ${todayEclipse.note}`);
        } else if (todayEclipse.type === 'partial') {
            const pctStr = FormatHelper.probabilityToString(todayEclipse.magnitude * 100);
            results.phenomena.push(`eclipse: ${pctStr} of Moon enters umbral shadow`);
            if (todayEclipse.magnitude > 0.8) results.phenomena.push('eclipse: deep partial - significant darkening visible');
        } else if (todayEclipse.type === 'penumbral') {
            results.phenomena.push('eclipse: subtle penumbral eclipse - slight dimming');
        }

        // Visibility check
        const visibility = isLunarEclipseVisible(todayEclipse, location.latitude, location.longitude);
        if (visibility.visible) {
            if (visibility.bestAltitude > 30) results.phenomena.push('eclipse: excellent visibility - Moon high in sky');
            else if (visibility.bestAltitude > 10) results.phenomena.push('eclipse: Moon visible during eclipse');
            else results.phenomena.push('eclipse: Moon low on horizon - find clear view');
        } else {
            results.phenomena.push('eclipse: Moon below horizon from your location');
        }

        if (cloudCover !== undefined) {
            if (cloudCover < 20) results.phenomena.push('eclipse: excellent viewing conditions');
            else if (cloudCover < 50) results.phenomena.push('eclipse: fair conditions - some clouds');
            else results.phenomena.push('eclipse: clouds may interfere with viewing');
        }

        results.phenomena.push('eclipse: safe to view with naked eye');
    }

    // =====================================================================
    // UPCOMING LUNAR ECLIPSE
    // =====================================================================
    else if (upcomingEclipse && daysUntil <= LUNAR_LOOKAHEAD_DAYS) {
        if (upcomingEclipse.type === 'total' || (upcomingEclipse.type === 'partial' && upcomingEclipse.magnitude > 0.5)) {
            if (daysUntil <= 3) {
                results.phenomena.push(`eclipse: ${FormatHelper.capitalise(upcomingEclipse.type)} lunar eclipse in ${FormatHelper.pluralise('days', daysUntil)}`);
                if (isLunarEclipseVisible(upcomingEclipse, location.latitude, location.longitude).visible) results.phenomena.push('eclipse: will be visible from your location');
            } else if (daysUntil <= 7 && upcomingEclipse.type === 'total') results.phenomena.push(`eclipse: total lunar eclipse in ${FormatHelper.pluralise('days', daysUntil)}`);
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ store }) {
    if (!store.eclipses) store.eclipses = {};

    return {
        interpretSolarEclipses,
        interpretLunarEclipses,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// Eclipse Predictions by Fred Espenak, NASA GSFC Emeritus
// https://eclipse.gsfc.nasa.gov/
// -----------------------------------------------------------------------------------------------------------------------------------------
