// -----------------------------------------------------------------------------------------------------------------------------------------
// Astronomy Meteors Realtime Module - Live meteor activity monitoring
// -----------------------------------------------------------------------------------------------------------------------------------------
//
//   - American Meteor Society (AMS) Fireball API - recent bright meteors
//   - Enhances static shower predictions with real observed data
//
// -----------------------------------------------------------------------------------------------------------------------------------------

// const helpers = require('./server-function-weather-helpers.js');

const ENDPOINTS = {
    nasaFireball: 'https://ssd-api.jpl.nasa.gov/fireball.api',
};

const INTERVALS = {
    activeShower: 30 * 60 * 1000, // 30 min during active showers
    showerPeak: 15 * 60 * 1000, // 15 min at peak
    normal: 2 * 60 * 60 * 1000, // 2 hours normally
    dormant: 6 * 60 * 60 * 1000, // 6 hours when no showers
};

const STALENESS = {
    fireballs: 60 * 60 * 1000, // 1 hour
};

const MAJOR_SHOWERS = {
    QUA: { name: 'Quadrantids', peakMonth: 0, peakDay: 3, typicalZHR: 120, duration: 1 },
    LYR: { name: 'Lyrids', peakMonth: 3, peakDay: 22, typicalZHR: 18, duration: 2 },
    ETA: { name: 'Eta Aquariids', peakMonth: 4, peakDay: 6, typicalZHR: 50, duration: 3 },
    SDA: { name: 'Delta Aquariids', peakMonth: 6, peakDay: 30, typicalZHR: 25, duration: 5 },
    PER: { name: 'Perseids', peakMonth: 7, peakDay: 12, typicalZHR: 100, duration: 3 },
    DRA: { name: 'Draconids', peakMonth: 9, peakDay: 8, typicalZHR: 10, duration: 1, variable: true },
    ORI: { name: 'Orionids', peakMonth: 9, peakDay: 21, typicalZHR: 20, duration: 3 },
    STA: { name: 'Southern Taurids', peakMonth: 10, peakDay: 10, typicalZHR: 10, duration: 7, fireballs: true },
    NTA: { name: 'Northern Taurids', peakMonth: 10, peakDay: 12, typicalZHR: 15, duration: 7, fireballs: true },
    LEO: { name: 'Leonids', peakMonth: 10, peakDay: 17, typicalZHR: 15, duration: 2, variable: true },
    GEM: { name: 'Geminids', peakMonth: 11, peakDay: 14, typicalZHR: 120, duration: 2 },
    URS: { name: 'Ursids', peakMonth: 11, peakDay: 22, typicalZHR: 10, duration: 2 },
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getCurrentShower(month, day) {
    for (const [code, shower] of Object.entries(MAJOR_SHOWERS)) {
        const peakDate = new Date(2024, shower.peakMonth, shower.peakDay);
        const currentDate = new Date(2024, month, day);
        const daysDiff = Math.abs((currentDate - peakDate) / (24 * 60 * 60 * 1000));
        if (daysDiff <= shower.duration + 2)
            return {
                code,
                ...shower,
                daysToPeak: Math.round((peakDate - currentDate) / (24 * 60 * 60 * 1000)),
                isAtPeak: daysDiff <= 0.5,
                isNearPeak: daysDiff <= 1,
            };
    }
    return undefined;
}

function assessActivityLevel(recentCount, typicalZHR, hours = 24) {
    // Estimate expected fireball count based on ZHR
    // Fireballs are roughly 1-2% of total meteors, and reporting efficiency ~10%
    const expectedFireballs = typicalZHR * hours * 0.015 * 0.1;
    if (recentCount > expectedFireballs * 3) return 'outburst';
    if (recentCount > expectedFireballs * 1.5) return 'enhanced';
    if (recentCount > expectedFireballs * 0.5) return 'normal';
    return 'low';
}

function isNearLocation(fireball, location, radiusDeg = 15) {
    if (!fireball.lat || !fireball.lon || !location?.latitude || !location?.longitude) return true; // If no location data, include it
    const latDiff = Math.abs(fireball.lat - location.latitude);
    const lonDiff = Math.abs(fireball.lon - location.longitude);
    return latDiff < radiusDeg && lonDiff < radiusDeg;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

async function fetchNASAFireballs(state, location) {
    if (!state.fireballs) state.fireballs = { data: undefined, lastUpdate: 0, lastError: undefined };
    try {
        // NASA Fireball API - documented at https://ssd-api.jpl.nasa.gov/doc/fireball.html
        // Returns fireballs detected by US Government sensors
        const endDate = new Date();
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
        const params = new URLSearchParams({
            'date-min': startDate.toISOString().split('T')[0],
            'date-max': endDate.toISOString().split('T')[0],
            'req-loc': 'true', // Require location data
        });
        const response = await fetch(`${ENDPOINTS.nasaFireball}?${params}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        // NASA returns { count, fields, data } where data is array of arrays
        if (!data.data || !Array.isArray(data.data)) {
            // No fireballs in period - this is normal
            state.fireballs.data = {
                total: 0,
                nearby: 0,
                counts: { last24h: 0, last48h: 0, last7d: 0, last30d: 0 },
                recent: [],
                brightestRecent: undefined,
                averagePerDay: 0,
            };
            state.fireballs.lastUpdate = Date.now();
            state.fireballs.lastError = undefined;
            console.error('meteors: update NASA success (0 fireballs in period)');
            return state.fireballs.data;
        }
        // Fields: date, energy, impact-e, lat, lat-dir, lon, lon-dir, alt, vel
        const { fields } = data;
        const dateIdx = fields.indexOf('date');
        const energyIdx = fields.indexOf('energy');
        const latIdx = fields.indexOf('lat');
        const latDirIdx = fields.indexOf('lat-dir');
        const lonIdx = fields.indexOf('lon');
        const lonDirIdx = fields.indexOf('lon-dir');
        const altIdx = fields.indexOf('alt');
        const velIdx = fields.indexOf('vel');
        const fireballs = data.data.map((row) => {
            const date = new Date(row[dateIdx]);
            const energy = row[energyIdx] ? Number.parseFloat(row[energyIdx]) : undefined;
            // Estimate magnitude from energy (rough approximation)
            // Energy is in joules (10^10 J), mag -10 ~ 10^12 J, mag -5 ~ 10^9 J
            return {
                date,
                lat: Number.parseFloat(row[latIdx]) * (row[latDirIdx] === 'S' ? -1 : 1),
                lon: Number.parseFloat(row[lonIdx]) * (row[lonDirIdx] === 'W' ? -1 : 1),
                energy,
                magnitude: energy ? Math.round(-2.5 * Math.log10((energy * 1e10) / 1e9) - 5) : undefined,
                altitude: row[altIdx] ? Number.parseFloat(row[altIdx]) : undefined,
                velocity: row[velIdx] ? Number.parseFloat(row[velIdx]) : undefined,
                ageHours: (Date.now() - date.getTime()) / 3600000,
            };
        });
        // Filter to nearby fireballs if location provided
        const nearby = location?.latitude ? fireballs.filter((fb) => isNearLocation(fb, location, 30)) : fireballs;
        const last24h = nearby.filter((fb) => fb.ageHours <= 24);
        const last48h = nearby.filter((fb) => fb.ageHours <= 48);
        const last7d = nearby.filter((fb) => fb.ageHours <= 168);
        const last30d = nearby;
        state.fireballs.data = {
            total: fireballs.length,
            nearby: nearby.length,
            counts: {
                last24h: last24h.length,
                last48h: last48h.length,
                last7d: last7d.length,
                last30d: last30d.length,
            },
            recent: last7d.slice(0, 10),
            brightestRecent: last7d.reduce((best, fb) => (!best || (fb.energy && fb.energy > (best.energy || 0)) ? fb : best), undefined),
            averagePerDay: Math.round((last30d.length / 30) * 10) / 10,
        };
        state.fireballs.lastUpdate = Date.now();
        state.fireballs.lastError = undefined;
        console.error(`meteors: update NASA success (${last7d.length} fireballs in 7d, ${nearby.length} nearby in 30d)`);
        return state.fireballs.data;
    } catch (e) {
        state.fireballs.lastError = e.message;
        console.error('meteors: update NASA failure:', e.message);
        return undefined;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getFireballs(state) {
    if (!state.fireballs?.data) return undefined;
    if (Date.now() - state.fireballs.lastUpdate > STALENESS.fireballs) return undefined;
    return state.fireballs.data;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateUpdateInterval(situation) {
    if (!situation) return [INTERVALS.normal, 'no-situation'];
    const { month, day, hour } = situation;
    const shower = getCurrentShower(month, day);
    if (shower) {
        if (shower.isAtPeak && (hour >= 22 || hour <= 5)) return [INTERVALS.showerPeak, 'shower-peak-night'];
        if (shower.isNearPeak) return [INTERVALS.activeShower, 'shower-near-peak'];
        return [INTERVALS.activeShower, 'shower-active'];
    }
    // Check for Taurid season (October-November) - famous for fireballs
    if (month === 9 || month === 10) return [INTERVALS.activeShower, 'taurid-season'];
    return [INTERVALS.dormant, 'no-shower'];
}

const _updateSchedule = { intervalId: undefined, currentInterval: undefined };
function updateSchedule(state, situation, location) {
    fetchNASAFireballs(state, location).then(() => {
        const [interval, reason] = calculateUpdateInterval(situation);
        if (_updateSchedule.currentInterval !== interval) {
            if (_updateSchedule.intervalId) clearInterval(_updateSchedule.intervalId);
            _updateSchedule.currentInterval = interval;
            _updateSchedule.intervalId = setInterval(() => updateSchedule(state, situation, location), interval);
            console.error(`meteors: update interval set to ${interval / 1000 / 60}m ('${reason}')`);
        }
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretMeteorActivity({ results, situation, store }) {
    const { month, day, hour, daylight } = situation;

    // Only report at night or during twilight
    if (daylight?.isDaytime && hour > 6 && hour < 18) return;

    const fireballs = getFireballs(store.astronomy_meteors_realtime);
    const shower = getCurrentShower(month, day);

    // *** Active shower with real-time data ***
    if (shower && fireballs) {
        const activityLevel = assessActivityLevel(fireballs.counts.last24h, shower.typicalZHR, 24);
        if (activityLevel === 'outburst') {
            results.alerts.push(`meteors: ${shower.name} OUTBURST detected! ${fireballs.counts.last24h} fireballs reported in 24h (typical: ${Math.round(shower.typicalZHR * 0.015)})`);
        } else if (activityLevel === 'enhanced') {
            results.phenomena.push(`meteors: ${shower.name} showing enhanced activity (${fireballs.counts.last24h} fireballs in 24h)`);
        } else if (shower.isAtPeak || shower.isNearPeak) {
            results.phenomena.push(`meteors: ${shower.name} ${shower.isAtPeak ? 'at peak' : 'near peak'} - activity ${activityLevel} (${fireballs.counts.last24h} fireballs reported)`);
        }

        // Variable shower note
        if (shower.variable && shower.isNearPeak) {
            results.phenomena.push(`meteors: ${shower.name} is historically variable - outbursts possible`);
        }

        // Taurid fireball note
        if (shower.fireballs) {
            results.phenomena.push(`meteors: ${shower.name} known for bright fireballs - watch for spectacular events`);
        }
    }
    // *** No shower but fireball data available ***
    else if (fireballs) {
        // Report if unusual activity
        if (fireballs.counts.last24h > 5) {
            results.phenomena.push(`meteors: elevated fireball activity (${fireballs.counts.last24h} reported in 24h)`);
        }
    }

    // *** Most energetic recent fireball ***
    if (fireballs?.brightestRecent && fireballs.brightestRecent.ageHours < 48) {
        const fb = fireballs.brightestRecent;
        if (fb?.energy > 0.5) {
            // Significant energy
            results.phenomena.push(`meteors: energetic fireball (${fb.energy.toFixed(1)}×10¹⁰ J) detected ${Math.round(fb.ageHours)}h ago`);
        }
    }
}

function interpretFireballAlert({ results, situation, store }) {
    const { daylight } = situation;

    // Only at night
    if (daylight?.isDaytime) return;

    const fireballs = getFireballs(store.astronomy_meteors_realtime);
    if (!fireballs) return;

    // Alert for very recent energetic fireballs (within 6 hours), > 10^10 J
    const veryRecent = fireballs.recent?.filter((fb) => fb.ageHours < 6 && fb.energy && fb.energy > 1);
    if (veryRecent && veryRecent.length > 0) {
        const [fb] = veryRecent;
        results.alerts.push(`meteors: significant fireball (${fb.energy.toFixed(1)}×10¹⁰ J) detected ${Math.round(fb.ageHours)}h ago nearby!`);
    }
}

function interpretShowerForecast({ results, situation }) {
    const { month, day } = situation;
    for (const [, shower] of Object.entries(MAJOR_SHOWERS)) {
        const peakDate = new Date(2024, shower.peakMonth, shower.peakDay);
        const currentDate = new Date(2024, month, day);
        const daysToPeak = Math.round((peakDate - currentDate) / (24 * 60 * 60 * 1000));
        // Alert 3-7 days before major showers
        if (daysToPeak > 0 && daysToPeak <= 7) {
            if (shower.typicalZHR >= 50) {
                // Major shower
                if (daysToPeak <= 3) {
                    results.phenomena.push(`meteors: ${shower.name} peak in ${daysToPeak} day${daysToPeak > 1 ? 's' : ''} (ZHR ~${shower.typicalZHR})`);
                } else if (daysToPeak <= 7) {
                    results.phenomena.push(`meteors: ${shower.name} approaching (peak in ${daysToPeak} days)`);
                }
                break; // Only report one upcoming shower
            }
        }
    }
}

function interpretTauridSeason({ results, situation, store }) {
    const { month, day } = situation;

    // Taurid "swarm" years - enhanced fireball activity
    // This is roughly every 7 years, last was 2022, next ~2029
    const year = new Date().getFullYear();
    const isSwarmYear = (year - 2022) % 7 === 0;

    if ((month === 9 || month === 10) && day >= 20 && day <= 15) {
        const fireballs = getFireballs(store.astronomy_meteors_realtime);
        let text = 'meteors: Taurid fireball season active';
        if (isSwarmYear) {
            text += ' (SWARM YEAR - enhanced fireball rates expected)';
        }
        if (fireballs?.counts.last24h > 3) {
            text += ` - ${fireballs.counts.last24h} fireballs reported in 24h`;
        }
        results.phenomena.push(text);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// Module Factory
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ location, store }) {
    if (!store.astronomy_meteors_realtime) store.astronomy_meteors_realtime = {};

    const now = new Date();
    updateSchedule(store.astronomy_meteors_realtime, { month: now.getMonth(), day: now.getDate(), hour: now.getHours() }, location);

    return {
        interpretMeteorActivity,
        interpretFireballAlert,
        interpretShowerForecast,
        interpretTauridSeason,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
