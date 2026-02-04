// -----------------------------------------------------------------------------------------------------------------------------------------
// Astronomy Meteors Realtime Module - Live meteor activity monitoring
// -----------------------------------------------------------------------------------------------------------------------------------------
//
//   - American Meteor Society (AMS) Fireball API - recent bright meteors
//   - Enhances static shower predictions with real observed data
//
// -----------------------------------------------------------------------------------------------------------------------------------------

// const { constants } = require('./server-function-weather-helpers.js');
const formatter = require('./server-function-weather-tools-format.js');
const { isNearLocation } = require('./server-function-weather-tools-calculators.js');
const { DataSlot, DataScheduler, fetchJson, createTimestampTracker } = require('./server-function-weather-tools-live.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const liveSlotFireballs = new DataSlot('fireballs', STALENESS.fireballs);
const liveScheduler = new DataScheduler('meteors');

async function liveNASAFireballsFetchAndProcess(state, situation) {
    const { location } = situation;

    return liveSlotFireballs.fetch(
        state,
        'meteors',
        async () => {
            // NASA Fireball API - documented at https://ssd-api.jpl.nasa.gov/doc/fireball.html
            // Returns fireballs detected by US Government sensors
            const params = new URLSearchParams({
                'date-min': new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                'date-max': new Date().toISOString().split('T')[0],
                'req-loc': 'true',
            });
            const data = await fetchJson(`${ENDPOINTS.nasaFireball}?${params}`);
            const _fetched = Date.now();

            // NASA returns { count, fields, data } where data is array of arrays
            if (!data.data || !Array.isArray(data.data)) {
                // No fireballs in period - this is normal
                return {
                    total: 0,
                    nearby: 0,
                    counts: { last24h: 0, last48h: 0, last7d: 0, last30d: 0 },
                    recent: [],
                    brightestRecent: undefined,
                    averagePerDay: 0,
                };
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
                    ageHours: (_fetched - date.getTime()) / 3600000,
                };
            });

            const nearby = fireballs.filter((fb) => isNearLocation(fb.lat, fb.lon, location.latitude, location.longitude, 30));
            const last24h = nearby.filter((fb) => fb.ageHours <= 24);
            const last48h = nearby.filter((fb) => fb.ageHours <= 48);
            const last7d = nearby.filter((fb) => fb.ageHours <= 168);
            const last30d = nearby;

            return {
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
        },
        `${liveSlotFireballs.get(state)?.counts?.last7d || 0} fireballs in 7d`
    );
}

function liveNASAFireballsCalculateUpdateInterval(_situation) {
    const month = new Date().getMonth(),
        day = new Date().getDate(),
        hour = new Date().getHours();
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

function liveSchedulerStart(state, situation) {
    liveScheduler.run(
        () => liveNASAFireballsFetchAndProcess(state, situation),
        () => liveNASAFireballsCalculateUpdateInterval(situation)
    );
}

function getFireballs(state) {
    return liveSlotFireballs.get(state);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretMeteorActivity({ temporal, results, situation, store }) {
    const { month, day, hour, daylight } = situation;

    // Only report at night or during twilight
    if (daylight?.isDaytime && hour > 6 && hour < 18) return;

    const fireballs = getFireballs(store.astronomy_meteors_realtime);
    const shower = getCurrentShower(month, day);

    const ts = createTimestampTracker(temporal, situation);

    // *** Active shower with real-time data ***
    if (shower && fireballs) {
        const activityLevel = assessActivityLevel(fireballs.counts.last24h, shower.typicalZHR, 24);

        if (activityLevel === 'outburst')
            results.alerts.push(
                `meteors: ${ts.get('fireballs', fireballs._fetched)}${shower.name} OUTBURST detected (${formatter.countToString(fireballs.counts.last24h)} fireballs in 24h, typical ${formatter.countToString(Math.round(shower.typicalZHR * 0.015))})`
            );
        else if (activityLevel === 'enhanced') results.phenomena.push(`meteors: ${ts.get('fireballs', fireballs._fetched)}${shower.name} showing enhanced activity (${formatter.countToString(fireballs.counts.last24h)} fireballs in 24h)`);
        else if (shower.isAtPeak || shower.isNearPeak)
            results.phenomena.push(
                `meteors: ${ts.get('fireballs', fireballs._fetched)}${shower.name} ${shower.isAtPeak ? 'at peak' : 'near peak'} (${activityLevel} activity, ${formatter.countToString(fireballs.counts.last24h)} fireballs reported)`
            );

        // Variable shower note
        if (shower.variable && shower.isNearPeak) results.phenomena.push(`meteors: ${shower.name} is historically variable - outbursts possible`);

        // Taurid fireball note
        if (shower.fireballs) results.phenomena.push(`meteors: ${shower.name} known for bright fireballs - watch for spectacular events`);
    }

    // *** No shower but fireball data available ***
    else if (fireballs) {
        // Report if unusual activity
        if (fireballs.counts.last24h > 5) results.phenomena.push(`meteors: ${ts.get('fireballs', fireballs._fetched)}elevated fireball activity (${formatter.countToString(fireballs.counts.last24h)} reported in 24h)`);
    }

    // *** Most energetic recent fireball ***
    const fb = fireballs?.brightestRecent;
    if (fb && fb.ageHours < 48)
        if (fb?.energy > 0.5) results.phenomena.push(`meteors: ${ts.get('fireballs', fireballs._fetched)}energetic fireball detected (${formatter.energyJoulesE10ToString(fb.energy)}, ${formatter.hoursAgoToString(fb.ageHours)})`);
}

function interpretFireballAlert({ temporal, results, situation, store }) {
    const { daylight } = situation;

    // Only at night
    if (daylight?.isDaytime) return;

    const fireballs = getFireballs(store.astronomy_meteors_realtime);
    if (!fireballs) return;

    const ts = createTimestampTracker(temporal, situation);

    // Alert for very recent energetic fireballs (within 6 hours), > 10^10 J
    const veryRecent = fireballs.recent?.filter((fb) => fb.ageHours < 6 && fb.energy && fb.energy > 1);
    if (veryRecent?.length) {
        const [fb] = veryRecent;
        results.alerts.push(`meteors: ${ts.get('fireballs', fireballs._fetched)}significant fireball nearby (${formatter.energyJoulesE10ToString(fb.energy)}, ${formatter.hoursAgoToString(fb.ageHours)})`);
    }
}

function interpretShowerForecast({ results, situation }) {
    const { month, day } = situation;
    for (const shower of Object.values(MAJOR_SHOWERS)) {
        const peakDate = new Date(2024, shower.peakMonth, shower.peakDay);
        const currentDate = new Date(2024, month, day);
        const daysToPeak = Math.round((peakDate - currentDate) / (24 * 60 * 60 * 1000));
        // Alert 3-7 days before major showers
        if (daysToPeak > 0 && daysToPeak <= 7)
            if (shower.typicalZHR >= 50) {
                // Major shower
                if (daysToPeak <= 3) results.phenomena.push(`meteors: ${shower.name} peak in ${daysToPeak} ${daysToPeak === 1 ? 'day' : 'days'} (${formatter.zhrToString(shower.typicalZHR)})`);
                else if (daysToPeak <= 7) results.phenomena.push(`meteors: ${shower.name} approaching (peak in ${daysToPeak} ${daysToPeak === 1 ? 'day' : 'days'})`);
                break; // Only report one upcoming shower
            }
    }
}

function interpretTauridSeason({ temporal, results, situation, store }) {
    const { month, day } = situation;

    const ts = createTimestampTracker(temporal, situation);

    if ((month === 9 || month === 10) && day >= 20 && day <= 15) {
        let text = 'meteors: Taurid fireball season active';
        // Taurid "swarm" years - enhanced fireball activity: this is roughly every 7 years, last was 2022, next ~2029
        if ((new Date().getFullYear() - 2022) % 7 === 0) text += ' (SWARM YEAR - enhanced fireball rates expected)';
        const fireballs = getFireballs(store.astronomy_meteors_realtime);
        if (fireballs?.counts.last24h > 3) {
            text = `meteors: ${ts.get('fireballs', fireballs._fetched)}Taurid fireball season active (${formatter.countToString(fireballs.counts.last24h)} fireballs in 24h)`;
            if ((new Date().getFullYear() - 2022) % 7 === 0) text += ' - SWARM YEAR';
        }
        results.phenomena.push(text);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ location, store }) {
    if (!store.astronomy_meteors_realtime) store.astronomy_meteors_realtime = {};

    liveSchedulerStart(store.astronomy_meteors_realtime, { location });

    return {
        interpretMeteorActivity,
        interpretFireballAlert,
        interpretShowerForecast,
        interpretTauridSeason,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
