// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolarUV(results, _situation, data, data_history, _store) {
    const { solarRad: rad, solarUvi: uvi } = data;
    const fiveMinutesAgo = data.timestamp - 5 * 60 * 1000;

    let uviSum = 0,
        uviCnt = 0,
        radSum = 0,
        radCnt = 0,
        uviAvg,
        radAvg;
    Object.entries(data_history)
        .filter(([timestamp, _entry]) => timestamp > fiveMinutesAgo)
        .forEach(([_timestamp, entry]) => {
            if (entry.solarUvi !== undefined) {
                uviSum += entry.solarUvi;
                uviCnt++;
            }
            if (entry.solarRad !== undefined) {
                radSum += entry.solarRad;
                radCnt++;
            }
        });
    if (uviCnt > 0) uviAvg = uviSum / uviCnt;
    if (radCnt > 0) radAvg = radSum / radCnt;

    if (radAvg !== undefined) {
        if (radAvg > 800) results.conditions.push('intense sunlight');
        else if (radAvg > 500) results.conditions.push('strong sunlight');
    }

    if (uviAvg !== undefined && uviCnt >= 3) {
        if (uviAvg >= 11) {
            results.conditions.push('extreme UV');
            results.alerts.push('extreme UV (5-min avg)');
        } else if (uviAvg >= 8) {
            results.conditions.push('very high UV');
            results.alerts.push('very high UV (5-min avg)');
        } else if (uviAvg >= 6) results.conditions.push('high UV (5-min avg)');
        else if (uviAvg >= 3) results.conditions.push('moderate UV (5-min avg)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSnowDepth(results, situation, data, data_history, store) {
    const { snowDepth, temp, windSpeed, rainRate } = data;
    const { month, hour } = situation;

    if (snowDepth === undefined) return;

    if (!store.snow)
        store.snow = {
            maxDepth: 0,
            lastMeasurement: 0,
            accumulation24h: 0,
            meltRate24h: 0,
            seasonStart: undefined,
            daysWithSnow: 0,
        };

    const oneDayAgo = data.timestamp - 24 * 60 * 60 * 1000;
    let depth24hAgo;

    Object.entries(data_history)
        .filter(([timestamp, entry]) => timestamp > oneDayAgo && entry.snowDepth !== undefined)
        .sort(([a], [b]) => a - b)
        .forEach(([timestamp, entry]) => {
            if (depth24hAgo === undefined) depth24hAgo = entry.snowDepth;
        });

    if (depth24hAgo !== undefined) {
        const change24h = snowDepth - depth24hAgo;
        if (change24h > 0) {
            store.snow.accumulation24h = change24h;
            store.snow.meltRate24h = 0;
        } else if (change24h < 0) {
            store.snow.meltRate24h = Math.abs(change24h);
            store.snow.accumulation24h = 0;
        }
    }

    if (snowDepth > store.snow.maxDepth) store.snow.maxDepth = snowDepth;
    if (snowDepth > 0 && store.snow.lastMeasurement === 0) store.snow.seasonStart = new Date(data.timestamp);
    store.snow.lastMeasurement = snowDepth;

    if (snowDepth === 0) {
        if (month >= 11 || month <= 2) {
            results.phenomena.push('no snow cover during winter');
            if (store.snow.maxDepth > 100) results.phenomena.push(`snow-free after ${store.snow.maxDepth}mm max depth`);
        }
    } else if (snowDepth < 50) {
        results.conditions.push('light snow cover');
        if (month >= 3 && month <= 4) results.phenomena.push('spring snow melt beginning');
    } else if (snowDepth < 200) {
        results.conditions.push('moderate snow cover');
        if (temp > 0) results.phenomena.push('snow compaction likely');
    } else if (snowDepth < 500) {
        results.conditions.push('deep snow cover');
        results.phenomena.push('challenging forest mobility');
        if (windSpeed > 5) results.phenomena.push('snow drifting possible');
    } else {
        results.conditions.push('very deep snow cover');
        results.alerts.push('extreme snow depth');
        results.phenomena.push('restricted mobility in forest');
    }

    if (month === 10 && snowDepth > 0) results.phenomena.push('early season snow');
    else if (month === 4 && snowDepth > 100) results.phenomena.push('late season persistent snow pack');
    else if (month >= 5 && month <= 8 && snowDepth > 0) results.phenomena.push('unusual summer snow');

    if (snowDepth > 30) {
        if (temp < -15) results.phenomena.push('powder snow conditions');
        else if (temp < -5) results.phenomena.push('dry snow conditions');
        else if (temp < 0) results.phenomena.push('packed snow conditions');
        else if (temp > 0) {
            results.phenomena.push('wet snow conditions');
            if (temp > 5) results.phenomena.push('rapid snowmelt possible');
        }
    }

    if (store.snow.accumulation24h > 100) {
        results.alerts.push(`heavy snowfall: ${store.snow.accumulation24h}mm in 24h`);
        results.phenomena.push('significant snow accumulation');
    } else if (store.snow.accumulation24h > 50) results.phenomena.push(`moderate snowfall: ${store.snow.accumulation24h}mm in 24h`);
    else if (store.snow.accumulation24h > 10) results.phenomena.push(`light snowfall: ${store.snow.accumulation24h}mm in 24h`);

    if (store.snow.meltRate24h > 50) {
        results.phenomena.push(`rapid snowmelt: ${store.snow.meltRate24h}mm in 24h`);
        if (temp > 5 && rainRate > 0) results.alerts.push('rain-on-snow event - flood risk');
    } else if (store.snow.meltRate24h > 20) results.phenomena.push(`moderate snowmelt: ${store.snow.meltRate24h}mm in 24h`);

    if (snowDepth > 200 && windSpeed > 10) results.phenomena.push('snow loading on trees - branch fall risk');

    if (snowDepth > 300) {
        results.phenomena.push('wildlife movement patterns altered');
        if (month >= 12 || month <= 2) results.phenomena.push('deep snow provides insulation for small mammals');
    }

    if (snowDepth > 100) {
        if (temp >= -15 && temp <= -5) results.phenomena.push('excellent cross-country skiing conditions');
        else if (temp > -5 && temp < 0) results.phenomena.push('good skiing conditions');
        else if (temp >= 0) results.phenomena.push('wet/slow skiing conditions');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretIceDepth(results, situation, data, data_history, store) {
    const { iceDepth, temp, snowDepth } = data;
    const { month } = situation;

    if (iceDepth === undefined) return;

    if (!store.ice)
        store.ice = {
            maxDepth: 0,
            formationDate: undefined,
            breakupDate: undefined,
            growthRate7d: 0,
            meltRate7d: 0,
            consecutiveSafeDays: 0,
        };

    const oneWeekAgo = data.timestamp - 7 * 24 * 60 * 60 * 1000;
    let depth7dAgo;

    Object.entries(data_history)
        .filter(([timestamp, entry]) => timestamp > oneWeekAgo && entry.iceDepth !== undefined)
        .sort(([a], [b]) => a - b)
        .forEach(([timestamp, entry]) => {
            if (depth7dAgo === undefined) depth7dAgo = entry.iceDepth;
        });

    if (depth7dAgo !== undefined) {
        const change7d = iceDepth - depth7dAgo;
        if (change7d > 0) {
            store.ice.growthRate7d = change7d / 7;
            store.ice.meltRate7d = 0;
        } else if (change7d < 0) {
            store.ice.meltRate7d = Math.abs(change7d) / 7;
            store.ice.growthRate7d = 0;
        }
    }

    if (iceDepth > 0 && store.ice.maxDepth === 0) store.ice.formationDate = new Date(data.timestamp);
    else if (iceDepth === 0 && store.ice.maxDepth > 0) store.ice.breakupDate = new Date(data.timestamp);

    if (iceDepth > store.ice.maxDepth) store.ice.maxDepth = iceDepth;

    if (iceDepth >= 100) store.ice.consecutiveSafeDays++;
    else store.ice.consecutiveSafeDays = 0;

    if (iceDepth === 0) {
        if (month >= 11 || month <= 3) if (temp < -5) results.phenomena.push('ice formation beginning');
    } else if (iceDepth < 50) {
        results.conditions.push('thin ice cover');
        if (month >= 11 || month <= 3) results.alerts.push('unsafe ice conditions');
    } else if (iceDepth < 150) {
        results.conditions.push('moderate ice cover');
        if (month >= 11 || month <= 2) results.phenomena.push('lakes partially frozen');
    } else if (iceDepth < 300) {
        results.conditions.push('thick ice cover');
        results.phenomena.push('lakes solidly frozen');
    } else {
        results.conditions.push('very thick ice cover');
        results.phenomena.push('exceptional ice thickness');
    }

    if (month === 10 && iceDepth > 0) results.phenomena.push('early lake ice formation');
    else if (month === 4 && iceDepth > 100) results.phenomena.push('late season persistent ice');
    else if (month >= 5 && month <= 9 && iceDepth > 0) results.phenomena.push('unusual season ice');

    if (iceDepth > 0) {
        if (temp > 0 && iceDepth < 150) results.alerts.push('weakening ice conditions');
        if (iceDepth < 50) results.alerts.push('thin ice hazard - stay off ice');
        else if (iceDepth >= 50 && iceDepth < 100) results.phenomena.push('ice may support single person on foot');
        else if (iceDepth >= 100 && iceDepth < 200) {
            results.phenomena.push('ice supports group activities');
            if (store.ice.consecutiveSafeDays > 7) results.phenomena.push('ice fishing conditions established');
        } else if (iceDepth >= 200 && iceDepth < 250) results.phenomena.push('ice supports snowmobile');
        else if (iceDepth >= 250) results.phenomena.push('ice supports light vehicles');
    }

    if (iceDepth > 50) {
        if (snowDepth > 100) {
            results.phenomena.push('snow insulation slowing ice growth');
            results.alerts.push('variable ice thickness possible');
        }
        if (store.ice.growthRate7d > 5) results.phenomena.push(`rapid ice growth: ${store.ice.growthRate7d.toFixed(1)}mm/day`);
        else if (store.ice.meltRate7d > 3) {
            results.phenomena.push(`ice deteriorating: ${store.ice.meltRate7d.toFixed(1)}mm/day loss`);
            if (iceDepth < 150) results.alerts.push('ice becoming unsafe');
        }
    }

    if (snowDepth > 100 && iceDepth > 100) results.phenomena.push('typical Nordic winter conditions');

    if (iceDepth > 150) {
        if (snowDepth < 50) results.phenomena.push('excellent ice skating conditions');
        if (month >= 1 && month <= 3) results.phenomena.push('ice road conditions possible');
    }

    if (month >= 3 && month <= 4 && iceDepth > 0) {
        results.phenomena.push('spring ice - extra caution needed');
        if (temp > 5 || (temp > 0 && hour >= 10 && hour <= 16)) results.alerts.push('daytime ice deterioration');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretRadiation(results, situation, data, data_history, store) {
    const { radiationCpm, radiationAcpm, radationUsvh, rainRate, windSpeed, pressure } = data;
    const { month, hour } = situation;

    if (radiationCpm === undefined && radiationAcpm === undefined) return;

    if (!store.radiation)
        store.radiation = {
            baseline: undefined,
            maxReading: 0,
            anomalyCount: 0,
            lastAnomaly: undefined,
            dailyDose: 0,
            doseResetTime: undefined,
        };

    const radiationValue = radiationAcpm !== undefined ? radiationAcpm : radiationCpm,
        radiationSource = radiationAcpm !== undefined ? 'average' : 'instant';

    const oneDayAgo = data.timestamp - 24 * 60 * 60 * 1000;
    const historicalReadings = [];

    Object.entries(data_history)
        .filter(([timestamp, entry]) => timestamp > oneDayAgo && (entry.radiationAcpm !== undefined || entry.radiationCpm !== undefined))
        .forEach(([_, entry]) => {
            const value = entry.radiationAcpm !== undefined ? entry.radiationAcpm : entry.radiationCpm;
            if (value !== undefined) historicalReadings.push(value);
        });

    if (historicalReadings.length > 10) {
        historicalReadings.sort((a, b) => a - b);
        store.radiation.baseline = historicalReadings[Math.floor(historicalReadings.length / 2)];
    }

    if (radiationValue > store.radiation.maxReading) store.radiation.maxReading = radiationValue;

    if (radationUsvh !== undefined) {
        const now = new Date(data.timestamp);
        const resetTime = store.radiation.doseResetTime ? new Date(store.radiation.doseResetTime) : undefined;
        if (!resetTime || now.getDate() !== resetTime.getDate()) {
            store.radiation.dailyDose = 0;
            store.radiation.doseResetTime = data.timestamp;
        }
        store.radiation.dailyDose += radationUsvh / 60;
    }

    if (radiationValue <= 30) {
        // Normal background - no mention needed
    } else if (radiationValue > 30 && radiationValue <= 50) {
        results.conditions.push('slightly elevated radiation');
        results.phenomena.push('above normal background radiation');
    } else if (radiationValue > 50 && radiationValue <= 100) {
        results.conditions.push('moderately elevated radiation');
        results.alerts.push(`elevated radiation levels (${radiationSource})`);
        results.phenomena.push('investigate radiation source');
    } else if (radiationValue > 100 && radiationValue <= 300) {
        results.conditions.push('high radiation');
        results.alerts.push(`high radiation levels (${radiationSource})`);
        results.phenomena.push('minimize prolonged exposure');
    } else if (radiationValue > 300) {
        results.conditions.push('extremely high radiation');
        results.alerts.push(`dangerous radiation levels (${radiationSource})`);
        results.phenomena.push('seek immediate shelter');
    }

    if (store.radiation.baseline !== undefined && radiationValue > store.radiation.baseline * 2) {
        store.radiation.anomalyCount++;
        store.radiation.lastAnomaly = data.timestamp;
        if (radiationValue > store.radiation.baseline * 3)
            results.phenomena.push(`radiation ${(radiationValue / store.radiation.baseline).toFixed(1)}x above baseline`);
    }

    if (radiationValue > 30) {
        if (rainRate > 0) {
            results.phenomena.push('possible radon washout in precipitation');
            if (radiationValue > 50) results.phenomena.push('enhanced radon progeny deposition');
        }
        if (month >= 9 || month <= 3) {
            results.phenomena.push('seasonal radon fluctuation possible');
            if (pressure < 1000) results.phenomena.push('low pressure enhancing radon emission');
        }
        if (hour >= 18 || hour <= 6) {
            if (windSpeed < 1) results.phenomena.push('calm conditions concentrating radon');
        }
    }

    if (radationUsvh !== undefined) {
        if (radationUsvh > 0.5) results.alerts.push(`radiation dose rate: ${radationUsvh.toFixed(2)} µSv/h`);
        if (radationUsvh > 0.3 && radationUsvh <= 1) results.phenomena.push('above typical background dose rate');
        else if (radationUsvh > 1 && radationUsvh <= 5) results.phenomena.push('elevated dose rate - limit prolonged exposure');
        else if (radationUsvh > 5) results.phenomena.push('significant dose rate - health concern');
        if (store.radiation.dailyDose > 2.4) results.phenomena.push(`daily dose: ${store.radiation.dailyDose.toFixed(1)} µSv (above average)`);
    }

    if (radiationValue > 50 && data.solarUvi > 5) results.phenomena.push('combined radiation and UV exposure');

    if (radiationValue > 25 && radiationValue <= 40) if (month >= 11 || month <= 2) results.phenomena.push('typical winter indoor radon accumulation');

    if (store.radiation.anomalyCount > 5 && store.radiation.lastAnomaly && data.timestamp - store.radiation.lastAnomaly < 3600000)
        results.alerts.push('sustained elevated radiation - investigate source');
}
// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    interpretSolarUV,
    interpretSnowDepth,
    interpretIceDepth,
    interpretRadiation,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
