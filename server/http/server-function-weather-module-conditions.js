// -----------------------------------------------------------------------------------------------------------------------------------------
// Conditions Module - Interprets basic weather variables and their combinations
// -----------------------------------------------------------------------------------------------------------------------------------------

const { cardinalDirection } = require('./server-function-weather-helpers.js');
const formatter = require('./server-function-weather-tools-format.js');

/* eslint-disable sonarjs/cognitive-complexity */

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const THRESHOLDS = {
    // =========================================================================
    // Temperature thresholds (Celsius) - Nordic climate calibrated
    // =========================================================================
    TEMP: {
        // Absolute thresholds
        EXTREME_COLD: -25, // Frostbite risk begins
        VERY_COLD: -15, // Severe cold
        COLD: -5, // Cold
        FREEZING: 0, // Water freezes
        CHILLY: 5, // Cool, biological zero (growing threshold)
        COOL: 10, // Mild cool
        MILD: 15, // Comfortable mild
        WARM: 20, // Warm
        HOT: 25, // Hot for Nordic
        VERY_HOT: 28, // Very hot for Nordic
        EXTREME_HOT: 30, // Swedish heat wave threshold
        DANGEROUS_HOT: 33, // Dangerous heat

        // Other thresholds
        TROPICAL_NIGHT: 20, // Min temp for "tropical night"

        // Seasonal anomaly detection
        WINTER_COLD: -20, // Unusually cold for winter
        WINTER_WARM: 5, // Unusually warm for winter
        WINTER_VERY_WARM: 10, // Very warm for winter
        SUMMER_COOL: 12, // Cool for summer
        SUMMER_COLD: 8, // Cold for summer

        // Change thresholds
        RAPID_HOURLY_CHANGE: 5,
        SIGNIFICANT_3H_CHANGE: 8,
        SIGNIFICANT_6H_CHANGE: 10,
        EXTREME_DIURNAL_RANGE: 20,
        STABLE_DIURNAL_RANGE: 5,
        EXTREME_WEEKLY_RANGE: 30,
    },

    // =========================================================================
    // Pressure thresholds (hPa)
    // =========================================================================
    PRESSURE: {
        // Absolute thresholds
        SEVERE_LOW: 970, // Major storm
        STORMY: 990, // Storm conditions
        UNSETTLED: 1000, // Unsettled weather
        NORMAL_LOW: 1005, // Lower normal range
        NORMAL_HIGH: 1015, // Upper normal range
        SETTLED: 1020, // Settled weather
        HIGH: 1030, // High pressure
        VERY_HIGH: 1040, // Siberian high type

        // Change thresholds
        RAPID_HOURLY_CHANGE: 3,
        SIGNIFICANT_3H_CHANGE: 5,
        MODERATE_3H_CHANGE: 3,
        SIGNIFICANT_24H_CHANGE: 10,
        EXTREME_24H_RANGE: 20,
        STABLE_24H_RANGE: 3,
        DEEPENING_LOW: -15,
        BUILDING_HIGH: 15,
    },

    // =========================================================================
    // Humidity thresholds (%)
    // =========================================================================
    HUMIDITY: {
        // Absolute thresholds
        VERY_DRY: 20, // Very dry air
        DRY: 30, // Dry air
        COMFORT_LOW: 35, // Lower comfort bound
        COMFORT_HIGH: 60, // Upper comfort bound
        HUMID: 70, // Humid
        VERY_HUMID: 85, // Very humid
        SATURATED: 95, // Near saturation
        FOG_LIKELY: 98, // Fog formation likely

        // Change thresholds
        RAPID_3H_CHANGE: 20,
        RAPID_6H_CHANGE: 30,

        // Streak thresholds (hours)
        DRY_STREAK_WARNING: 24,
        HUMID_STREAK_WARNING: 12,
        MOLD_RISK_HOURS: 48, // Sustained high humidity for mold risk
    },

    // =========================================================================
    // Wind thresholds (m/s) - Beaufort scale
    // =========================================================================
    WIND: {
        // Beaufort scale thresholds
        CALM: 0.5, // Bft 0-1 boundary
        LIGHT_AIR: 1.5, // Bft 1-2 boundary
        LIGHT_BREEZE: 3.3, // Bft 2-3 boundary
        GENTLE_BREEZE: 5.5, // Bft 3-4 boundary
        MODERATE_BREEZE: 7.9, // Bft 4-5 boundary
        FRESH_BREEZE: 10.7, // Bft 5-6 boundary
        STRONG_BREEZE: 13.8, // Bft 6-7 boundary
        NEAR_GALE: 17.1, // Bft 7-8 boundary
        GALE: 20.7, // Bft 8-9 boundary
        STRONG_GALE: 24.4, // Bft 9-10 boundary
        STORM: 28.4, // Bft 10-11 boundary
        VIOLENT_STORM: 32.6, // Bft 11-12 boundary

        // Gust thresholds
        MODERATE_GUST_FACTOR: 1.4,
        DANGEROUS_GUST_FACTOR: 1.7,
        SEVERE_GUST_FACTOR: 2,

        // Special conditions
        SNOW_DRIFT: 5, // Threshold for blowing/drifting snow
        TREE_DAMAGE: 25, // Severe tree damage threshold
        EVAPORATION_SIGNIFICANT: 4, // Significant evaporative cooling
    },

    // =========================================================================
    // Cloud cover thresholds (%)
    // =========================================================================
    CLOUDS: {
        // Coverage classification
        CLEAR: 10, // Clear skies
        MOSTLY_CLEAR: 25, // Few clouds
        PARTLY_CLOUDY: 50, // Scattered clouds
        MOSTLY_CLOUDY: 75, // Broken clouds
        OVERCAST: 90, // Overcast

        // Variability (24h range)
        HIGH_VARIABILITY: 50,
        LOW_VARIABILITY: 15,

        // Sunshine thresholds
        SUNSHINE_THRESHOLD: 30, // Below this = sunshine possible
    },

    // =========================================================================
    // Precipitation thresholds (mm/h for rate, mm for accumulation)
    // =========================================================================
    RAIN: {
        // Rate thresholds (mm/h)
        TRACE: 0.1, // Barely measurable
        LIGHT: 0.5, // Light rain
        LIGHT_MODERATE: 2.5, // Light to moderate
        MODERATE: 4, // Moderate rain
        HEAVY: 8, // Heavy rain
        VERY_HEAVY: 16, // Very heavy rain
        EXTREME: 30, // Extreme rainfall

        // Accumulation thresholds (mm)
        FLASH_FLOOD_RISK: 25, // 1h accumulation
        SIGNIFICANT_24H: 25,
        ALERT_24H: 50,
        EXTREME_24H: 100,
        WET_WEEK: 100, // 7d accumulation
        DRY_WEEK: 5,

        // Drought thresholds
        DRY_DAYS_CONCERN: 7,
        DROUGHT_DAYS: 14,
    },

    // =========================================================================
    // Snow thresholds (mm depth)
    // =========================================================================
    SNOW: {
        // Coverage thresholds
        TRACE: 10, // Trace snow cover
        LIGHT_COVER: 50, // Light snow cover
        MODERATE_COVER: 200, // Moderate cover
        DEEP_COVER: 500, // Deep snow
        VERY_DEEP_COVER: 800, // Very deep snow

        // 24h accumulation rates (mm)
        LIGHT_24H: 10,
        MODERATE_24H: 50,
        HEAVY_24H: 100,
        EXTREME_24H: 200,

        // Hourly rate thresholds (mm/h)
        RAPID_RATE: 10,

        // Melt rates (mm/24h)
        MODERATE_MELT: 20,
        RAPID_MELT: 50,

        // Skiing quality thresholds
        MIN_SKIING: 30, // Minimum for skiing
    },

    // =========================================================================
    // Ice thresholds (mm) - Swedish ice safety standards
    // =========================================================================
    ICE: {
        THIN: 50, // Unsafe
        WALKABLE: 100, // Single person (Swedish: 10 cm)
        GROUP_SAFE: 150, // Group activities
        SNOWMOBILE: 200, // Snowmobile (Swedish: 20 cm)
        VEHICLE: 250, // Light vehicle (Swedish: 25 cm)
        THICK: 300, // Very thick
        HEAVY_VEHICLE: 400, // Heavy vehicle

        // Growth/melt rate thresholds (mm/day)
        RAPID_GROWTH: 10,
        RAPID_MELT: 5,
    },

    // =========================================================================
    // Radiation thresholds (CPM for Geiger counter)
    // =========================================================================
    RADIATION: {
        NORMAL: 30, // Normal background
        SLIGHTLY_ELEVATED: 50,
        MODERATELY_ELEVATED: 100,
        HIGH: 300,
        DANGEROUS: 1000,

        // Anomaly detection multipliers
        ANOMALY_MULTIPLIER: 2,
        SEVERE_ANOMALY_MULTIPLIER: 3,
        CRITICAL_ANOMALY_MULTIPLIER: 5,

        // Dose rate thresholds (µSv/h)
        DOSE_NORMAL: 0.1,
        DOSE_ELEVATED: 0.3,
        DOSE_HIGH: 1,
        DOSE_DANGEROUS: 5,
    },

    // =========================================================================
    // Solar thresholds
    // =========================================================================
    SOLAR: {
        // Solar radiation (W/m²)
        LOW_RAD: 100,
        MODERATE_RAD: 300,
        STRONG_RAD: 500,
        INTENSE_RAD: 800,
        EXTREME_RAD: 1000,

        // UV Index
        UV_LOW: 2,
        UV_MODERATE: 3,
        UV_HIGH: 6,
        UV_VERY_HIGH: 8,
        UV_EXTREME: 11,
    },

    // =========================================================================
    // Dew point and fog thresholds
    // =========================================================================
    DEW_POINT: {
        // Spread thresholds (temp - dewpoint)
        DENSE_FOG_SPREAD: 1, // Dense fog likely
        FOG_SPREAD: 2, // Fog likely
        PATCHY_FOG_SPREAD: 3, // Patchy fog possible
        MIST_SPREAD: 5, // Mist possible

        // Comfort thresholds (absolute dew point)
        COMFORTABLE: 13, // Comfortable
        SOMEWHAT_HUMID: 16, // Somewhat humid
        HUMID: 18, // Humid/sticky
        OPPRESSIVE: 21, // Oppressive
        DANGEROUS: 24, // Dangerous heat stress risk
    },

    // =========================================================================
    // Combination/compound thresholds
    // =========================================================================
    COMPOUND: {
        // Wind chill thresholds (°C)
        WIND_CHILL_COLD: -10,
        WIND_CHILL_SEVERE: -20,
        WIND_CHILL_EXTREME: -30,
        WIND_CHILL_DANGEROUS: -40,

        // Heat index thresholds (°C)
        HEAT_INDEX_CAUTION: 27,
        HEAT_INDEX_WARNING: 32,
        HEAT_INDEX_DANGER: 39,
        HEAT_INDEX_EXTREME: 46,

        // Fire risk
        FIRE_RISK_TEMP: 22,
        FIRE_RISK_HUMIDITY: 40,
        FIRE_EXTREME_TEMP: 25,
        FIRE_EXTREME_HUMIDITY: 30,

        // Black ice risk
        BLACK_ICE_TEMP_LOW: -3,
        BLACK_ICE_TEMP_HIGH: 2,
        BLACK_ICE_HUMIDITY: 80,

        // Freezing rain
        FREEZING_RAIN_TEMP_LOW: -8,
        FREEZING_RAIN_TEMP_HIGH: 2,

        // Thunderstorm development
        THUNDER_TEMP: 20,
        THUNDER_HUMIDITY: 70,
        THUNDER_PRESSURE: 1010,

        // Blizzard conditions
        BLIZZARD_WIND: 15,
        BLIZZARD_VISIBILITY_SNOW: 1, // km visibility in snow
    },
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretTemperature({ results, situation, dataCurrent, store }) {
    const { temp } = dataCurrent;
    const { month, hour, location } = situation;

    if (temp === undefined) return;

    if (!store.temperature) store.temperature = {};

    // -------------------------------------------------------------------------
    // PART A: Basic Temperature Classification
    // -------------------------------------------------------------------------

    const TEMP_RANGES = [
        { below: THRESHOLDS.TEMP.EXTREME_COLD, label: 'extremely cold', showThreshold: '<', alert: 'extreme cold warning' },
        { below: THRESHOLDS.TEMP.VERY_COLD, label: 'very cold', showThreshold: '<' },
        { below: THRESHOLDS.TEMP.COLD, label: 'cold' },
        { below: THRESHOLDS.TEMP.FREEZING, label: 'sub-zero' },
        { below: THRESHOLDS.TEMP.CHILLY, label: 'chilly' },
        { below: THRESHOLDS.TEMP.COOL, label: 'cool' },
        { below: THRESHOLDS.TEMP.MILD, label: 'mild' },
        { below: THRESHOLDS.TEMP.WARM, label: 'mild to warm' },
        { below: THRESHOLDS.TEMP.HOT, label: 'warm' },
        { below: THRESHOLDS.TEMP.VERY_HOT, label: 'hot', showThreshold: '>' },
        { below: Infinity, label: 'very hot', showThreshold: '>' },
    ];

    for (const range of TEMP_RANGES)
        if (temp < range.below) {
            results.conditions.push(range.label + (range.showThreshold ? ` (${range.showThreshold} ${formatter.temperatureToString(range.below)})` : ''));
            if (range.alert) results.alerts.push(range.alert);
            break;
        }

    // -------------------------------------------------------------------------
    // PART B: Trend Analysis (temperature-only)
    // -------------------------------------------------------------------------

    const trends = store.conditions?.trends?.temp || {};

    const t1h = trends['1h'];
    if (t1h?.valid && t1h.back !== undefined) {
        const change1h = temp - t1h.back;
        if (Math.abs(change1h) > THRESHOLDS.TEMP.RAPID_HOURLY_CHANGE) {
            results.phenomena.push(`rapid hourly temperature ${change1h > 0 ? 'rise' : 'drop'} (${formatter.temperatureToString(Math.abs(change1h))})`);
            if (change1h < -THRESHOLDS.TEMP.RAPID_HOURLY_CHANGE && temp < THRESHOLDS.TEMP.CHILLY) {
                results.alerts.push('flash freeze possible');
            }
        }
        store.temperature.rateOfChange = change1h;
    }

    const t3h = trends['3h'];
    if (t3h?.valid && t3h.back !== undefined) {
        const change3h = temp - t3h.back;
        if (Math.abs(change3h) > THRESHOLDS.TEMP.SIGNIFICANT_3H_CHANGE) {
            results.phenomena.push(`significant 3 hour temperature ${change3h > 0 ? 'rise' : 'drop'} (${formatter.temperatureToString(Math.abs(change3h))})`);
        }
    }

    const t6h = trends['6h'];
    if (t6h?.valid && t6h.back !== undefined) {
        const change6h = temp - t6h.back;
        if (Math.abs(change6h) > THRESHOLDS.TEMP.SIGNIFICANT_6H_CHANGE) {
            results.phenomena.push(`significant 6 hour temperature ${change6h > 0 ? 'rise' : 'drop'} (${formatter.temperatureToString(Math.abs(change6h))})`);
        }
    }

    const t24h = trends['24h'];
    if (t24h?.valid) {
        if (t24h.back !== undefined) {
            if (temp <= THRESHOLDS.TEMP.FREEZING && t24h.back > THRESHOLDS.TEMP.FREEZING) {
                results.phenomena.push('temperature dropped below freezing'); // XXX at
            } else if (temp > THRESHOLDS.TEMP.FREEZING && t24h.min !== undefined && t24h.min <= THRESHOLDS.TEMP.FREEZING) {
                results.phenomena.push('frost occurred in last 24 hours');
            }
        }
        if (t24h.min !== undefined && t24h.max !== undefined) {
            store.temperature.extremes24h = {
                min: t24h.min,
                max: t24h.max,
                minTime: t24h.minTime,
                maxTime: t24h.maxTime,
            };
            const range24h = t24h.max - t24h.min;
            if (range24h > THRESHOLDS.TEMP.EXTREME_DIURNAL_RANGE) {
                results.phenomena.push(`extreme 24 hour temperature variation (${formatter.temperatureToString(range24h)})`);
                if (month >= 4 && month <= 9) results.phenomena.push('continental climate effect');
            } else if (range24h < THRESHOLDS.TEMP.STABLE_DIURNAL_RANGE) {
                results.phenomena.push(`stable 24 hour temperature variation (${formatter.temperatureToString(range24h)})`);
            }
        }
        if (t24h.minTime) {
            const minHour = new Date(t24h.minTime).getHours();
            if (minHour >= 10 && minHour <= 18) results.phenomena.push(`unusual daytime temperature minimum (at ${minHour})`);
        }
        if (t24h.maxTime) {
            const maxHour = new Date(t24h.maxTime).getHours();
            if (maxHour >= 22 || maxHour <= 6) results.phenomena.push(`unusual nighttime temperature maximum (at ${maxHour})`);
        }
    }

    const t7d = trends['7d'];
    if (t7d?.valid) {
        if (t7d.min !== undefined && t7d.max !== undefined) {
            store.temperature.extremes7d = {
                min: t7d.min,
                max: t7d.max,
                minTime: t7d.minTime,
                maxTime: t7d.maxTime,
            };
            const range7d = t7d.max - t7d.min;
            if (range7d > THRESHOLDS.TEMP.EXTREME_WEEKLY_RANGE) {
                results.phenomena.push(`extreme weekly temperature variation (${formatter.temperatureToString(range7d)})`);
            }
        }
    }

    // -------------------------------------------------------------------------
    // PART C: Nordic/Seasonal Context (temperature-only)
    // -------------------------------------------------------------------------

    if (month >= 11 || month <= 2) {
        if (temp > THRESHOLDS.TEMP.WINTER_WARM) {
            results.phenomena.push('unseasonably warm for winter');
            if (temp > THRESHOLDS.TEMP.WINTER_VERY_WARM) results.alerts.push('exceptional winter warmth');
        } else if (temp < THRESHOLDS.WINTER_COLD) {
            results.phenomena.push('extreme Nordic winter conditions');
            if (hour >= 6 && hour <= 18) results.phenomena.push('extreme cold despite daylight');
        }
        if (hour >= 0 && hour <= 6 && t6h?.valid && t6h.back !== undefined && temp > t6h.back + 3) {
            results.phenomena.push('possible temperature inversion');
        }
    } else if (month >= 6 && month <= 8) {
        if (temp > THRESHOLDS.TEMP.HOT) {
            results.phenomena.push('hot Nordic summer day');
            if (temp > THRESHOLDS.TEMP.VERY_HOT) {
                results.phenomena.push('exceptional summer heat');
                store.temperature.heatDays++;
            }
        } else if (temp < THRESHOLDS.TEMP.SUMMER_COOL) {
            results.phenomena.push('unseasonably cool for summer');
            if (temp < THRESHOLDS.TEMP.SUMMER_COLD) results.alerts.push('unusual summer cold');
        }
        if (hour >= 0 && hour <= 6 && t24h?.valid && t24h.min > THRESHOLDS.TEMP.TROPICAL_NIGHT) {
            results.phenomena.push(`tropical night (> ${formatter.temperatureToString(THRESHOLDS.TEMP.TROPICAL_NIGHT)})`);
        }
    }

    if (location.elevation > 500 && t24h?.valid && t24h.back !== undefined && temp < t24h.back - 5) {
        results.phenomena.push('cold air pooling in valley possible');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretPressure({ results, situation, dataCurrent, store }) {
    const { timestamp, pressure, temp } = dataCurrent;
    const { month, location } = situation;

    if (pressure === undefined) return;

    if (!store.pressure)
        store.pressure = {
            trend: 'stable',
            rapidChanges: [],
        };

    const pressureAdjusted = pressure * Math.exp(location.elevation / (29.3 * (273.15 + (temp || 15))));
    store.pressure.adjusted = pressureAdjusted;

    // -------------------------------------------------------------------------
    // PART A: Basic Pressure Classification
    // -------------------------------------------------------------------------

    if (pressureAdjusted < THRESHOLDS.PRESSURE.SEVERE_LOW) {
        results.conditions.push(`severe storm conditions (< ${formatter.pressureToString(THRESHOLDS.PRESSURE.SEVERE_LOW)})`);
        results.alerts.push(`dangerously low pressure`);
    } else if (pressureAdjusted < THRESHOLDS.PRESSURE.STORMY) {
        results.conditions.push(`stormy (< ${formatter.pressureToString(THRESHOLDS.PRESSURE.STORMY)})`);
    } else if (pressureAdjusted < THRESHOLDS.PRESSURE.UNSETTLED) {
        results.conditions.push('unsettled');
    } else if (pressureAdjusted >= THRESHOLDS.PRESSURE.NORMAL_LOW && pressureAdjusted <= THRESHOLDS.PRESSURE.NORMAL_HIGH) {
        // Normal range - no condition added
    } else if (pressureAdjusted > THRESHOLDS.PRESSURE.NORMAL_HIGH && pressureAdjusted <= THRESHOLDS.PRESSURE.SETTLED) {
        results.conditions.push('settled');
    } else if (pressureAdjusted > THRESHOLDS.PRESSURE.SETTLED && pressureAdjusted <= THRESHOLDS.PRESSURE.HIGH) {
        results.conditions.push('high pressure');
    } else if (pressureAdjusted > THRESHOLDS.PRESSURE.HIGH) {
        results.conditions.push(`very high pressure (> ${formatter.pressureToString(THRESHOLDS.PRESSURE.HIGH)})`);
    }

    // -------------------------------------------------------------------------
    // PART B: Trend Analysis (pressure-only)
    // -------------------------------------------------------------------------

    const trends = store.conditions?.trends?.pressure || {};

    const t1h = trends['1h'];
    if (t1h?.valid && t1h.back !== undefined) {
        const change1h = pressure - t1h.back;
        if (Math.abs(change1h) > THRESHOLDS.PRESSURE.RAPID_HOURLY_CHANGE) {
            results.alerts.push(`rapid hourly pressure ${change1h > 0 ? 'rise' : 'drop'} (${formatter.pressureToString(Math.abs(change1h))})`);
            store.pressure.rapidChanges.push({ timestamp, change: change1h });
        }
    }

    const t3h = trends['3h'];
    if (t3h?.valid && t3h.back !== undefined) {
        const change3h = pressure - t3h.back;
        store.pressure.change3h = change3h;
        if (Math.abs(change3h) < 1) store.pressure.trend = 'stable';
        else if (change3h > 0) store.pressure.trend = 'rising';
        else store.pressure.trend = 'falling';
        if (Math.abs(change3h) > THRESHOLDS.PRESSURE.SIGNIFICANT_3H_CHANGE) {
            results.phenomena.push(`significant 3h pressure ${change3h > 0 ? 'rise' : 'drop'} (${formatter.pressureToString(Math.abs(change3h))})`);
        } else if (Math.abs(change3h) > THRESHOLDS.PRESSURE.MODERATE_3H_CHANGE) {
            results.phenomena.push(`moderate 3h pressure ${change3h > 0 ? 'rise' : 'drop'} (${formatter.pressureToString(Math.abs(change3h))})`);
        }
        if (store.pressure.trend === 'falling') {
            if (change3h < -THRESHOLDS.PRESSURE.SIGNIFICANT_3H_CHANGE) {
                results.phenomena.push('rapidly falling pressure - storm approaching');
                if (month >= 9 || month <= 3) results.phenomena.push('winter storm possible');
            } else if (change3h < -THRESHOLDS.PRESSURE.MODERATE_3H_CHANGE) {
                results.phenomena.push('falling pressure - weather deteriorating');
            }
        } else if (store.pressure.trend === 'rising') {
            if (change3h > THRESHOLDS.PRESSURE.SIGNIFICANT_3H_CHANGE) {
                results.phenomena.push('rapidly rising pressure - clearing conditions');
            } else if (change3h > THRESHOLDS.PRESSURE.MODERATE_3H_CHANGE) {
                results.phenomena.push('rising pressure - improving weather');
            }
        }
        if (pressureAdjusted < THRESHOLDS.PRESSURE.UNSETTLED && Math.abs(change3h) > THRESHOLDS.PRESSURE.MODERATE_3H_CHANGE) {
            results.phenomena.push('barometric changes may affect sensitive individuals');
        }
        if (location.forestCoverage === 'high' && change3h < -THRESHOLDS.PRESSURE.SIGNIFICANT_3H_CHANGE) {
            results.phenomena.push('storm approaching - forest wind damage possible');
        }
    }

    const t24h = trends['24h'];
    if (t24h?.valid) {
        if (t24h.back !== undefined) {
            const change24h = pressure - t24h.back;
            store.pressure.change24h = change24h;
            if (Math.abs(change24h) > THRESHOLDS.PRESSURE.SIGNIFICANT_24H_CHANGE) {
                results.phenomena.push(`significant 24h pressure ${change24h > 0 ? 'rise' : 'drop'} (${formatter.pressureToString(Math.abs(change24h))})`);
                if (change24h > THRESHOLDS.PRESSURE.BUILDING_HIGH) results.phenomena.push('strong high pressure building');
                else if (change24h < THRESHOLDS.PRESSURE.DEEPENING_LOW) results.phenomena.push('deepening low pressure system');
            }
            if ((month >= 11 || month <= 2) && change24h > 10 && pressureAdjusted > THRESHOLDS.PRESSURE.SETTLED) {
                results.phenomena.push('arctic high strengthening');
            }
        }
        if (t24h.min !== undefined && t24h.max !== undefined) {
            store.pressure.extremes24h = {
                min: t24h.min,
                max: t24h.max,
                minTime: t24h.minTime,
                maxTime: t24h.maxTime,
            };
            const range24h = t24h.max - t24h.min;
            if (range24h > THRESHOLDS.PRESSURE.EXTREME_24H_RANGE) {
                results.phenomena.push(`extreme 24h pressure variation (${formatter.pressureToString(range24h)})`);
                results.alerts.push('unstable atmospheric conditions');
            } else if (range24h < THRESHOLDS.PRESSURE.STABLE_24H_RANGE) {
                results.phenomena.push('very stable pressure');
            }
        }
    }

    // -------------------------------------------------------------------------
    // PART C: Nordic/Seasonal Context (pressure-only)
    // -------------------------------------------------------------------------

    if (month >= 9 || month <= 3) {
        if (pressureAdjusted > THRESHOLDS.PRESSURE.SETTLED) {
            results.phenomena.push('winter high pressure - clear conditions likely');
        }
    } else if (month >= 6 && month <= 8) {
        if (pressureAdjusted > THRESHOLDS.PRESSURE.SETTLED) {
            results.phenomena.push('summer high pressure - likely warm and dry');
        } else if (pressureAdjusted < THRESHOLDS.PRESSURE.NORMAL_LOW) {
            results.phenomena.push('summer low pressure');
        }
    }

    store.pressure.lastReading = pressureAdjusted;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretHumidity({ results, situation, dataCurrent, store, weatherData }) {
    const { humidity } = dataCurrent;
    const { month, hour, location } = situation;

    if (humidity === undefined) return;

    if (!store.humidity)
        store.humidity = {
            dryHours24h: 0,
            humidHours24h: 0,
        };

    // -------------------------------------------------------------------------
    // PART A: Basic Humidity Classification
    // -------------------------------------------------------------------------

    if (humidity >= THRESHOLDS.HUMIDITY.FOG_LIKELY) {
        results.conditions.push(`saturated (> ${formatter.humidityToString(THRESHOLDS.HUMIDITY.FOG_LIKELY)})`);
    } else if (humidity > THRESHOLDS.HUMIDITY.VERY_HUMID) {
        results.conditions.push(`very humid (> ${formatter.humidityToString(THRESHOLDS.HUMIDITY.VERY_HUMID)})`);
    } else if (humidity > THRESHOLDS.HUMIDITY.HUMID) {
        results.conditions.push('humid');
    } else if (humidity >= THRESHOLDS.HUMIDITY.COMFORT_LOW && humidity <= THRESHOLDS.HUMIDITY.COMFORT_HIGH) {
        // Comfort range - no condition added
    } else if (humidity < THRESHOLDS.HUMIDITY.VERY_DRY) {
        results.conditions.push(`very dry (< ${formatter.humidityToString(THRESHOLDS.HUMIDITY.VERY_DRY)})`);
        results.alerts.push(`extremely dry conditions`);
    } else if (humidity < THRESHOLDS.HUMIDITY.DRY) {
        results.conditions.push('dry');
    }

    // -------------------------------------------------------------------------
    // PART B: Trend Analysis (humidity-only)
    // -------------------------------------------------------------------------

    const trends = store.conditions?.trends?.humidity || {};

    const t3h = trends['3h'];
    if (t3h?.valid && t3h.back !== undefined) {
        const change3h = humidity - t3h.back;
        store.humidity.change3h = change3h;
        if (Math.abs(change3h) > THRESHOLDS.HUMIDITY.RAPID_3H_CHANGE) {
            results.phenomena.push(`rapid 3 hour humidity ${change3h > 0 ? 'increase' : 'decrease'} (${formatter.humidityToString(Math.abs(change3h))})`);
        }
    }

    const t6h = trends['6h'];
    if (t6h?.valid && t6h.back !== undefined) {
        const change6h = humidity - t6h.back;
        store.humidity.change6h = change6h;
        if (Math.abs(change6h) > THRESHOLDS.HUMIDITY.RAPID_6H_CHANGE) {
            results.phenomena.push(`significant 6 hour humidity ${change6h > 0 ? 'increase' : 'decrease'} (${formatter.humidityToString(Math.abs(change6h))})`);
        }
    }

    const t24h = trends['24h'];
    if (t24h?.valid) {
        if (t24h.min !== undefined && t24h.max !== undefined) {
            store.humidity.extremes24h = {
                min: t24h.min,
                max: t24h.max,
                minTime: t24h.minTime,
                maxTime: t24h.maxTime,
            };
            const range24h = t24h.max - t24h.min;
            if (range24h > 50) {
                results.phenomena.push(`large 24 hour humidity variation (${formatter.humidityToString(range24h)})`);
            } else if (range24h < 10) {
                results.phenomena.push('stable 24 hour humidity levels');
            }
        }
    }

    // -------------------------------------------------------------------------
    // PART B2: Extended Period Analysis (humidity-only)
    // -------------------------------------------------------------------------

    const period24h = weatherData?.getPeriod?.('24h');
    if (period24h?.entries?.length) {
        store.humidity.dryHours24h = period24h.estimateHours((e) => e.humidity !== undefined && e.humidity < THRESHOLDS.HUMIDITY.DRY);
        store.humidity.humidHours24h = period24h.estimateHours((e) => e.humidity !== undefined && e.humidity > THRESHOLDS.HUMIDITY.VERY_HUMID);
        if (store.humidity.dryHours24h > THRESHOLDS.HUMIDITY.DRY_STREAK_WARNING) {
            results.phenomena.push(`prolonged dry conditions (${Math.round(store.humidity.dryHours24h)} hours in last 24h)`);
            results.phenomena.push('hydration important');
        }
        if (store.humidity.humidHours24h > THRESHOLDS.HUMIDITY.HUMID_STREAK_WARNING) {
            results.phenomena.push(`prolonged humid conditions (${Math.round(store.humidity.humidHours24h)} hours in last 24h)`);
        }
        if (store.humidity.humidHours24h > THRESHOLDS.HUMIDITY.MOLD_RISK_HOURS) {
            results.phenomena.push(`sustained high humidity (${Math.round(store.humidity.humidHours24h)} hours) - mold risk`);
        }
    }

    // -------------------------------------------------------------------------
    // PART C: Nordic/Seasonal Context (humidity-only)
    // -------------------------------------------------------------------------

    if (hour >= 18 || hour <= 6) {
        if (humidity < THRESHOLDS.HUMIDITY.DRY) {
            results.phenomena.push('indoor heating will create very dry conditions');
        } else if (humidity > THRESHOLDS.HUMIDITY.VERY_HUMID) {
            results.phenomena.push('indoor condensation risk');
        }
    }

    if (month >= 11 || month <= 2) {
        // Winter
        if (humidity < 40) {
            results.phenomena.push('low winter humidity');
        } else if (humidity > 85) {
            results.phenomena.push('damp winter air');
        }
    } else if (month >= 6 && month <= 8) {
        // Summer
        if (humidity > 80) {
            results.phenomena.push('muggy summer humidity');
        } else if (humidity < 40) {
            results.phenomena.push('dry summer air');
        }
    }

    // Forest transpiration effect (location + humidity only)
    if (location.forestCoverage === 'high' && humidity > 85) {
        results.phenomena.push('forest transpiration contributing to humidity');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretWind({ results, situation, dataCurrent, store, weatherData }) {
    const { windSpeed, windGust, windDir } = dataCurrent;
    const { month, hour, location } = situation;

    if (windSpeed === undefined) return;

    if (!store.wind)
        store.wind = {
            gustFactor: 1,
            calmHours24h: 0,
            stormHours24h: 0,
            directionChanges: 0,
            lastDirection: windDir,
        };

    // -------------------------------------------------------------------------
    // PART A: Basic Wind Classification (Beaufort Scale)
    // -------------------------------------------------------------------------

    if (windSpeed < THRESHOLDS.WIND.CALM) {
        results.conditions.push(`calm (< ${formatter.windspeedToString(THRESHOLDS.WIND.CALM)})`);
    } else if (windSpeed < THRESHOLDS.WIND.LIGHT_AIR) {
        results.conditions.push('light air');
    } else if (windSpeed < THRESHOLDS.WIND.LIGHT_BREEZE) {
        results.conditions.push('light breeze');
    } else if (windSpeed < THRESHOLDS.WIND.GENTLE_BREEZE) {
        results.conditions.push('gentle breeze');
    } else if (windSpeed < THRESHOLDS.WIND.MODERATE_BREEZE) {
        results.conditions.push('moderate breeze');
    } else if (windSpeed < THRESHOLDS.WIND.FRESH_BREEZE) {
        results.conditions.push('fresh breeze');
        if (location.forestCoverage === 'high') results.phenomena.push('trees swaying noticeably');
    } else if (windSpeed < THRESHOLDS.WIND.STRONG_BREEZE) {
        results.conditions.push('strong breeze');
        if (location.forestCoverage === 'high') results.phenomena.push('large branches in motion');
    } else if (windSpeed < THRESHOLDS.WIND.NEAR_GALE) {
        results.conditions.push(`near gale`);
        results.alerts.push(`strong wind warning`);
    } else if (windSpeed < THRESHOLDS.WIND.GALE) {
        results.conditions.push(`gale`);
        results.alerts.push(`gale warning`);
        if (location.forestCoverage === 'high') results.alerts.push('risk of falling branches');
    } else if (windSpeed < THRESHOLDS.WIND.STRONG_GALE) {
        results.conditions.push(`strong gale`);
        results.alerts.push(`strong gale warning`);
    } else if (windSpeed < THRESHOLDS.WIND.STORM) {
        results.conditions.push(`storm (< ${formatter.windspeedToString(THRESHOLDS.WIND.STORM)})`);
        results.alerts.push(`storm warning (< ${formatter.windspeedToString(THRESHOLDS.WIND.STORM)})`);
        if (location.forestCoverage === 'high') results.alerts.push('severe tree damage likely');
    } else if (windSpeed < THRESHOLDS.WIND.VIOLENT_STORM) {
        results.conditions.push(`violent storm (< ${formatter.windspeedToString(THRESHOLDS.WIND.VIOLENT_STORM)})`);
        results.alerts.push(`violent storm warning (< ${formatter.windspeedToString(THRESHOLDS.WIND.VIOLENT_STORM)})`);
    } else {
        results.conditions.push(`hurricane force`);
        results.alerts.push(`hurricane force wind warning`);
    }

    if (windGust !== undefined && windSpeed > 0) {
        store.wind.gustFactor = windGust / windSpeed;
    }
    if (store.wind.gustFactor > THRESHOLDS.WIND.SEVERE_GUST_FACTOR) {
        results.phenomena.push(`severe gusts (${Math.round((store.wind.gustFactor - 1) * 100)}% stronger, > ${formatter.windspeedToString(THRESHOLDS.WIND.SEVERE_GUST_FACTOR)})`);
        results.alerts.push(`dangerous gusts (${formatter.windspeedToString(windGust)}, > ${formatter.windspeedToString(THRESHOLDS.WIND.SEVERE_GUST_FACTOR)})`);
    } else if (store.wind.gustFactor > THRESHOLDS.WIND.DANGEROUS_GUST_FACTOR) {
        results.phenomena.push(`gusty (${Math.round((store.wind.gustFactor - 1) * 100)}% stronger, > ${formatter.windspeedToString(THRESHOLDS.WIND.DANGEROUS_GUST_FACTOR)})`);
        if (windSpeed > 10) results.alerts.push(`dangerous gusts (${formatter.windspeedToString(windGust)})`);
    } else if (store.wind.gustFactor > THRESHOLDS.WIND.MODERATE_GUST_FACTOR) {
        results.phenomena.push('moderate gusts');
    }

    if (windDir !== undefined) {
        store.wind.currentDirection = windDir;

        // Track direction changes
        if (store.wind.lastDirection !== undefined) {
            const directionChange = Math.abs(windDir - store.wind.lastDirection);
            if (directionChange > 90 && directionChange < 270) {
                if (++store.wind.directionChanges > 3) {
                    results.phenomena.push('variable wind direction');
                }
            }
        }
        store.wind.lastDirection = windDir;

        // Cardinal direction - basic classification
        const cardinalDir = cardinalDirection(windDir);
        store.wind.cardinalDirection = cardinalDir;

        // Nordic wind source indication (wind-only)
        if (month >= 11 || month <= 2) {
            if (cardinalDir === 'N' || cardinalDir === 'NE') {
                results.phenomena.push('northerly wind - winter Artic influence');
            } else if (cardinalDir === 'SW' || cardinalDir === 'W') {
                results.phenomena.push('westerly wind - winter Atlantic influence');
            }
        }

        // Wind veering/backing analysis from direction history
        const period24h = weatherData?.getPeriod?.('24h');
        if (period24h?.entries) {
            const dirHistory = period24h.entries.filter((e) => e.windDir !== undefined).map((e) => e.windDir);
            if (dirHistory.length > 5) {
                const dirChanges = [];
                for (let i = 1; i < dirHistory.length; i++) dirChanges.push(((dirHistory[i] - dirHistory[i - 1] + 180) % 360) - 180);
                const avgDirChange = dirChanges.reduce((a, b) => a + b, 0) / dirChanges.length;
                if (avgDirChange > 10) results.phenomena.push('wind veering (clockwise shift)');
                else if (avgDirChange < -10) results.phenomena.push('wind backing (counter-clockwise shift)');
            }
        }
    }

    // -------------------------------------------------------------------------
    // PART B: Trend Analysis (wind-only)
    // -------------------------------------------------------------------------

    const trends = store.conditions?.trends?.windSpeed || {};

    const t3h = trends['3h'];
    if (t3h?.valid && t3h.back !== undefined) {
        const change3h = windSpeed - t3h.back;
        store.wind.change3h = change3h;
        if (change3h > 5) {
            results.phenomena.push(`wind strengthening (+${formatter.windspeedToString(change3h)} in 3 hours)`);
        } else if (change3h < -5) {
            results.phenomena.push(`wind easing (-${formatter.windspeedToString(change3h)} in 3 hours)`);
        }
    }

    const t6h = trends['6h'];
    if (t6h?.valid) {
        store.wind.avgSpeed6h = t6h.avg;
    }

    const t24h = trends['24h'];
    if (t24h?.valid) {
        if (t24h.min !== undefined && t24h.max !== undefined) {
            store.wind.extremes24h = {
                maxSpeed: t24h.max,
                maxGust: store.conditions?.trends?.windGust?.['24h']?.max || t24h.max,
            };
        }
    }

    if (t24h?.valid && t6h?.valid) {
        const variance24h = t24h.max - t6h.avg;
        if (variance24h > 10) results.phenomena.push('highly variable wind speeds');
        else if (variance24h < 2 && windSpeed > 5) results.phenomena.push('steady wind conditions');
    }

    // -------------------------------------------------------------------------
    // PART D2: Extended Period Tracking (wind-only)
    // -------------------------------------------------------------------------

    const period24h = weatherData?.getPeriod?.('24h');
    if (period24h?.entries?.length) {
        store.wind.calmHours24h = period24h.estimateHours((e) => e.windSpeed !== undefined && e.windSpeed < THRESHOLDS.WIND.CALM);
        store.wind.stormHours24h = period24h.estimateHours((e) => e.windSpeed !== undefined && e.windSpeed > THRESHOLDS.WIND.NEAR_GALE);
    }

    // -------------------------------------------------------------------------
    // PART E: Forest Effects (wind + location only)
    // -------------------------------------------------------------------------

    if (location.forestCoverage === 'high') {
        if (windSpeed > 5 && windSpeed < 10) {
            results.phenomena.push('forest canopy reducing ground-level wind');
        } else if (windSpeed > 15) {
            results.phenomena.push('wind penetrating forest canopy');
        }
    }

    // -------------------------------------------------------------------------
    // PART F: Extended Periods (wind-only)
    // -------------------------------------------------------------------------

    if (store.wind.calmHours24h > 12) {
        results.phenomena.push(`extended calm period (${Math.round(store.wind.calmHours24h)} hours in last 24h)`);
    }

    if (store.wind.stormHours24h > 6) {
        results.alerts.push(`prolonged storm (${Math.round(store.wind.stormHours24h)} hours of gale-force winds)`);
    }

    // Diurnal patterns
    if (t6h?.valid && t6h.avg !== undefined) {
        if (hour >= 10 && hour <= 16 && windSpeed > t6h.avg * 1.5) {
            results.phenomena.push('daytime wind strengthening');
        } else if ((hour >= 22 || hour <= 4) && windSpeed < t6h.avg * 0.5) {
            results.phenomena.push('nocturnal wind calming');
        }
    }

    // -------------------------------------------------------------------------
    // PART G: Nordic/Seasonal Context (wind-only)
    // -------------------------------------------------------------------------

    if (month >= 9 && month <= 3) {
        // Fall through spring
        if (windSpeed > 15) {
            results.phenomena.push('autumn/winter storm conditions');
        }
    } else if (month >= 6 && month <= 8) {
        // Summer
        if (windSpeed < 2 && hour >= 10 && hour <= 16) {
            results.phenomena.push('calm summer conditions');
        }
    }

    // Elevation effects
    if (location.elevation > 500) {
        if (windSpeed > 10) results.phenomena.push('exposed elevation - enhanced wind');
        if ((hour >= 18 || hour <= 6) && windSpeed < 2) {
            results.phenomena.push('katabatic (downslope) flow possible');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretClouds({ results, situation, dataCurrent, store, weatherData }) {
    const { month, hour, daylight, location, lunar } = situation;
    const { cloudCover } = dataCurrent;

    if (cloudCover === undefined) return;

    if (!store.clouds)
        store.clouds = {
            clearHours24h: 0,
            overcastHours24h: 0,
            variability: 0,
        };

    // -------------------------------------------------------------------------
    // PART A: Basic Cloud Classification
    // -------------------------------------------------------------------------

    if (cloudCover < THRESHOLDS.CLOUDS.CLEAR) {
        results.conditions.push(`clear sky (< ${formatter.cloudCoverToString(THRESHOLDS.CLOUDS.CLEAR)})`);
        if (daylight.isDaytime) results.phenomena.push('full sunshine');
        else if (location.lightPollution === 'low') results.phenomena.push('excellent stargazing conditions');
    } else if (cloudCover < THRESHOLDS.CLOUDS.MOSTLY_CLEAR) {
        results.conditions.push('mostly clear');
        if (daylight.isDaytime) results.phenomena.push('mostly sunny');
    } else if (cloudCover < THRESHOLDS.CLOUDS.PARTLY_CLOUDY) {
        results.conditions.push('partly cloudy');
    } else if (cloudCover < THRESHOLDS.CLOUDS.MOSTLY_CLOUDY) {
        results.conditions.push('mostly cloudy');
        if (daylight.isDaytime) results.phenomena.push('limited sunshine');
    } else if (cloudCover < THRESHOLDS.CLOUDS.OVERCAST) {
        results.conditions.push('cloudy');
    } else {
        results.conditions.push(`overcast (> ${formatter.cloudCoverToString(THRESHOLDS.CLOUDS.OVERCAST)})`);
        if (daylight.isDaytime) results.phenomena.push('no direct sunshine');
    }

    // -------------------------------------------------------------------------
    // PART B: Trend Analysis (cloud-only)
    // -------------------------------------------------------------------------

    const trends = store.conditions?.trends?.cloudCover || {};

    const t3h = trends['3h'];
    if (t3h?.valid && t3h.back !== undefined) {
        const change3h = cloudCover - t3h.back;
        store.clouds.change3h = change3h;
        if (change3h > 40) {
            results.phenomena.push('rapidly increasing cloud cover');
        } else if (change3h < -40) {
            results.phenomena.push('rapidly clearing skies');
        }
    }

    const t6h = trends['6h'];
    if (t6h?.valid && t6h.back !== undefined) {
        const change6h = cloudCover - t6h.back;
        store.clouds.change6h = change6h;
        if (change6h > 50) {
            results.phenomena.push('significant cloud buildup over 6 hours');
        } else if (change6h < -50) {
            results.phenomena.push('significant clearing over 6 hours');
        }
    }

    const t24h = trends['24h'];
    if (t24h?.valid) {
        if (t24h.min !== undefined && t24h.max !== undefined) {
            const range24h = t24h.max - t24h.min;
            store.clouds.variability = range24h;
            if (range24h > THRESHOLDS.CLOUDS.HIGH_VARIABILITY) {
                results.phenomena.push('highly variable cloud cover');
                if (month >= 4 && month <= 9) results.phenomena.push('convective cloud development');
            } else if (range24h < THRESHOLDS.CLOUDS.LOW_VARIABILITY) {
                results.phenomena.push('stable cloud conditions');
            }
        }
    }

    // -------------------------------------------------------------------------
    // PART B2: Extended Period Tracking (cloud-only)
    // -------------------------------------------------------------------------

    const period24h = weatherData?.getPeriod?.('24h');
    if (period24h?.entries?.length) {
        store.clouds.clearHours24h = period24h.estimateHours((e) => e.cloudCover !== undefined && e.cloudCover < THRESHOLDS.CLOUDS.CLEAR);
        store.clouds.overcastHours24h = period24h.estimateHours((e) => e.cloudCover !== undefined && e.cloudCover > THRESHOLDS.CLOUDS.OVERCAST);
    }

    // -------------------------------------------------------------------------
    // PART C: Nighttime Sky Conditions (cloud + lunar only)
    // -------------------------------------------------------------------------

    if (!daylight.isDaytime) {
        if (cloudCover < THRESHOLDS.CLOUDS.CLEAR + 10) {
            if (lunar && (lunar.phase < 0.2 || lunar.phase > 0.8)) {
                results.phenomena.push('dark skies - good for astronomy');
            }
        } else if (cloudCover > 80 && location.lightPollution !== 'low') {
            results.phenomena.push('cloud reflection of urban lights');
        }
    }

    // -------------------------------------------------------------------------
    // PART D: Extended Periods (cloud-only)
    // -------------------------------------------------------------------------

    // Check for prolonged conditions over multiple days using 7d period
    const period7d = weatherData?.getPeriod?.('7d');
    if (period7d?.entries?.length) {
        const overcastHours7d = period7d.estimateHours((e) => e.cloudCover !== undefined && e.cloudCover > THRESHOLDS.CLOUDS.OVERCAST);
        const clearHours7d = period7d.estimateHours((e) => e.cloudCover !== undefined && e.cloudCover < THRESHOLDS.CLOUDS.CLEAR);
        if (overcastHours7d > 72) {
            // 3+ days of overcast
            results.phenomena.push(`prolonged overcast (${Math.round(overcastHours7d / 24)} days)`);
            if (month >= 11 || month <= 2) results.phenomena.push('persistent winter gloom');
        } else if (clearHours7d > 72) {
            // 3+ days of clear
            results.phenomena.push(`extended clear period (${Math.round(clearHours7d / 24)} days)`);
        }
    }

    // -------------------------------------------------------------------------
    // PART E: Nordic/Seasonal Context (cloud-only)
    // -------------------------------------------------------------------------

    if (month >= 11 || month <= 2) {
        // Winter
        if (cloudCover > THRESHOLDS.CLOUDS.OVERCAST) {
            results.phenomena.push('typical winter overcast');
        } else if (cloudCover < THRESHOLDS.CLOUDS.CLEAR) {
            results.phenomena.push('clear winter sky');
        }
    } else if (month >= 6 && month <= 8) {
        // Summer
        if (cloudCover > THRESHOLDS.CLOUDS.MOSTLY_CLEAR && cloudCover < THRESHOLDS.CLOUDS.PARTLY_CLOUDY && hour >= 12 && hour <= 18) {
            results.phenomena.push('fair weather cumulus likely');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretPrecipitation({ results, situation, dataCurrent, store, weatherData }) {
    const { timestamp, rainRate } = dataCurrent;
    const { month, hour, location } = situation;

    if (rainRate === undefined) return;

    if (!store.precipitation)
        store.precipitation = {
            accumulation1h: 0,
            accumulation24h: 0,
            accumulation7d: 0,
            wetHours24h: 0,
            dryDays7d: 0,
            maxRate24h: rainRate,
            rainEvents: [],
            currentEvent: undefined,
        };

    // -------------------------------------------------------------------------
    // PART A: Basic Precipitation Classification (rainRate-only)
    // -------------------------------------------------------------------------

    if (rainRate > 0) {
        if (rainRate < THRESHOLDS.RAIN.TRACE) {
            results.conditions.push('trace precipitation');
        } else if (rainRate < THRESHOLDS.RAIN.LIGHT) {
            results.conditions.push(`light precipitation (< ${formatter.rainfallToString(THRESHOLDS.RAIN.LIGHT)}/h)`);
        } else if (rainRate < THRESHOLDS.RAIN.LIGHT_MODERATE) {
            results.conditions.push('light to moderate precipitation');
        } else if (rainRate < THRESHOLDS.RAIN.MODERATE) {
            results.conditions.push('moderate precipitation');
        } else if (rainRate < THRESHOLDS.RAIN.HEAVY) {
            results.conditions.push(`heavy precipitation (< ${formatter.rainfallToString(THRESHOLDS.RAIN.HEAVY)}/h)`);
        } else if (rainRate < THRESHOLDS.RAIN.VERY_HEAVY) {
            results.conditions.push(`very heavy precipitation (< ${formatter.rainfallToString(THRESHOLDS.RAIN.VERY_HEAVY)}/h)`);
            results.alerts.push(`heavy rainfall warning (< ${formatter.rainfallToString(THRESHOLDS.RAIN.VERY_HEAVY)}/h)`);
        } else if (rainRate < THRESHOLDS.RAIN.EXTREME) {
            results.conditions.push(`extreme precipitation (< ${formatter.rainfallToString(THRESHOLDS.RAIN.EXTREME)}/h)`);
            results.alerts.push(`extreme rainfall warning (< ${formatter.rainfallToString(THRESHOLDS.RAIN.EXTREME)}/h)`);
        } else {
            results.conditions.push(`torrential precipitation`);
            results.alerts.push(`torrential rainfall`);
        }

        if (!store.precipitation.currentEvent)
            store.precipitation.currentEvent = {
                start: timestamp,
                accumulation: 0,
                maxRate: rainRate,
            };
        store.precipitation.currentEvent.accumulation += rainRate / 60;
        store.precipitation.currentEvent.maxRate = Math.max(store.precipitation.currentEvent.maxRate, rainRate);
        const duration = (timestamp - store.precipitation.currentEvent.start) / 3600000;
        if (duration > 0.5) results.phenomena.push(`ongoing precipitation event (${duration.toFixed(1)} hours)`);
    } else {
        if (store.precipitation.currentEvent && store.precipitation.currentEvent.accumulation > 1) {
            const duration = (timestamp - store.precipitation.currentEvent.start) / 3600000;
            if (duration > 0.5)
                store.precipitation.rainEvents.push({
                    ...store.precipitation.currentEvent,
                    end: timestamp,
                    duration,
                });
            store.precipitation.currentEvent = undefined;
        }
    }

    // -------------------------------------------------------------------------
    // PART B: Accumulation Analysis (precipitation-only)
    // -------------------------------------------------------------------------

    // const trends = store.conditions?.trends?.rainRate || {};

    const period1h = weatherData?.getPeriod?.('1h');
    if (period1h) {
        store.precipitation.accumulation1h = period1h.sum('rainRate') || 0;
    }
    if (store.precipitation.accumulation1h > THRESHOLDS.RAIN.FLASH_FLOOD_RISK) {
        results.alerts.push(`flash flood risk (${formatter.rainfallToString(store.precipitation.accumulation1h)} in an hour)`);
    }

    const period24h = weatherData?.getPeriod?.('24h');
    if (period24h?.entries?.length) {
        store.precipitation.accumulation24h = period24h.sum('rainRate') || 0;
        store.precipitation.maxRate24h = period24h.max('rainRate') || rainRate;
        store.precipitation.wetHours24h = period24h.estimateHours((e) => e.rainRate !== undefined && e.rainRate > 0);
    }
    if (store.precipitation.accumulation24h > THRESHOLDS.RAIN.EXTREME_24H) {
        results.alerts.push(`extreme 24 hour precipitation (${formatter.rainfallToString(store.precipitation.accumulation24h)})`);
    } else if (store.precipitation.accumulation24h > THRESHOLDS.RAIN.ALERT_24H) {
        results.alerts.push(`significant 24 hour precipitation (${formatter.rainfallToString(store.precipitation.accumulation24h)})`);
    } else if (store.precipitation.accumulation24h > THRESHOLDS.RAIN.SIGNIFICANT_24H) {
        results.phenomena.push(`notable 24 hour precipitation (${formatter.rainfallToString(store.precipitation.accumulation24h)})`);
    }

    const period7d = weatherData?.getPeriod?.('7d');
    if (period7d?.entries?.length) {
        store.precipitation.accumulation7d = period7d.sum('rainRate') || 0;
        store.precipitation.dryDays7d = Math.round(period7d.estimateHours((e) => e.rainRate === undefined || e.rainRate < 0.1) / 24);
    }
    if (store.precipitation.accumulation7d > THRESHOLDS.RAIN.WET_WEEK) {
        results.phenomena.push(`wet week (${formatter.rainfallToString(store.precipitation.accumulation7d)} total)`);
        if (location.forestCoverage === 'high') results.phenomena.push('saturated forest floor');
    } else if (store.precipitation.accumulation7d < THRESHOLDS.RAIN.DRY_WEEK) {
        results.phenomena.push('dry week');
    }

    // Drought tracking - use calculated dry days from 7d period
    if (store.precipitation.dryDays7d !== undefined) {
        if (store.precipitation.dryDays7d >= THRESHOLDS.RAIN.DROUGHT_DAYS) {
            results.alerts.push(`drought conditions (${store.precipitation.dryDays7d} dry days in last week)`);
        } else if (store.precipitation.dryDays7d >= THRESHOLDS.RAIN.DRY_DAYS_CONCERN) {
            results.phenomena.push(`extended dry period (${store.precipitation.dryDays7d} days)`);
        }
    }

    // -------------------------------------------------------------------------
    // PART C: Rainfall Patterns (precipitation-only)
    // -------------------------------------------------------------------------

    if (store.precipitation.maxRate24h > 10 && store.precipitation.accumulation24h > 20) {
        results.phenomena.push('periods of intense rainfall');
        if (month >= 6 && month <= 8) results.phenomena.push('convective precipitation');
    } else if (rainRate > 0 && rainRate < 1 && store.precipitation.wetHours24h > 6) {
        results.phenomena.push('persistent light precipitation');
        if (month >= 9 && month <= 11) results.phenomena.push('typical autumn drizzle');
    }

    // -------------------------------------------------------------------------
    // PART D: Nordic/Seasonal Context (precipitation-only)
    // -------------------------------------------------------------------------

    if (month >= 6 && month <= 8) {
        // Summer
        if (rainRate > THRESHOLDS.RAIN.HEAVY && hour >= 14 && hour <= 20) {
            results.phenomena.push('afternoon/evening convection');
        }
    }

    // Forest-specific effects (location + precipitation only)
    if (location.forestCoverage === 'high' && rainRate > 0) {
        if (rainRate < THRESHOLDS.RAIN.LIGHT) {
            results.phenomena.push('canopy interception reducing ground rainfall');
        } else if (store.precipitation.wetHours24h > 3) {
            results.phenomena.push('canopy drip enhancing ground moisture');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLight({ results, dataCurrent, store }) {
    const { solarRad: rad, solarUvi: uvi } = dataCurrent;

    // Get pre-computed trends (use 1h for short-term averaging)
    const radTrends = store.conditions?.trends?.solarRad || {};
    const uviTrends = store.conditions?.trends?.solarUvi || {};

    // Use 1-hour averages for more stable readings
    const radAvg = radTrends['1h']?.valid ? radTrends['1h'].avg : rad;
    const uviAvg = uviTrends['1h']?.valid ? uviTrends['1h'].avg : uvi;

    // Store for combination interpreter
    store.light = store.light || {};
    store.light.radAvg = radAvg;
    store.light.uviAvg = uviAvg;

    // -------------------------------------------------------------------------
    // PART A: Solar Radiation Classification
    // -------------------------------------------------------------------------

    if (radAvg !== undefined) {
        if (radAvg > THRESHOLDS.SOLAR.EXTREME_RAD) {
            results.conditions.push(`extreme sunlight (> ${formatter.solarToString(THRESHOLDS.SOLAR.EXTREME_RAD)})`);
        } else if (radAvg > THRESHOLDS.SOLAR.INTENSE_RAD) {
            results.conditions.push(`intense sunlight (> ${formatter.solarToString(THRESHOLDS.SOLAR.INTENSE_RAD)})`);
        } else if (radAvg > THRESHOLDS.SOLAR.STRONG_RAD) {
            results.conditions.push('strong sunlight');
        } else if (radAvg > THRESHOLDS.SOLAR.MODERATE_RAD) {
            results.conditions.push('moderate sunlight');
        } else if (radAvg > THRESHOLDS.SOLAR.LOW_RAD) {
            results.conditions.push('low sunlight');
        }
    }

    // -------------------------------------------------------------------------
    // PART B: UV Index Classification
    // -------------------------------------------------------------------------

    if (uviAvg !== undefined) {
        if (uviAvg >= THRESHOLDS.SOLAR.UV_EXTREME) {
            results.conditions.push(`extreme UV (> ${formatter.uviToString(THRESHOLDS.SOLAR.UV_EXTREME)})`);
            results.alerts.push(`extreme UV warning (> ${formatter.uviToString(THRESHOLDS.SOLAR.UV_EXTREME)})`);
        } else if (uviAvg >= THRESHOLDS.SOLAR.UV_VERY_HIGH) {
            results.conditions.push(`very high UV (> ${formatter.uviToString(THRESHOLDS.SOLAR.UV_VERY_HIGH)})`);
            results.alerts.push(`very high UV - sun protection essential (> ${formatter.uviToString(THRESHOLDS.SOLAR.UV_VERY_HIGH)})`);
        } else if (uviAvg >= THRESHOLDS.SOLAR.UV_HIGH) {
            results.conditions.push(`high UV (> ${formatter.uviToString(THRESHOLDS.SOLAR.UV_HIGH)})`);
            results.phenomena.push('sun protection recommended');
        } else if (uviAvg >= THRESHOLDS.SOLAR.UV_MODERATE) {
            results.conditions.push('moderate UV');
        } else if (uviAvg >= THRESHOLDS.SOLAR.UV_LOW) {
            results.conditions.push('low UV');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSnow({ results, situation, dataCurrent, store }) {
    const { snowDepth } = dataCurrent;
    const { month } = situation;

    if (snowDepth === undefined) return;

    if (!store.snow)
        store.snow = {
            maxDepth: 0,
            accumulation24h: 0,
            meltRate24h: 0,
            seasonStart: undefined,
            daysWithSnow: 0,
        };

    if (snowDepth > store.snow.maxDepth) store.snow.maxDepth = snowDepth;
    if (snowDepth > 0 && !store.snow.seasonStart) store.snow.seasonStart = new Date();

    // -------------------------------------------------------------------------
    // PART A: Basic Snow Cover Classification
    // -------------------------------------------------------------------------

    if (snowDepth === 0) {
        if (month >= 11 || month <= 2) {
            results.phenomena.push('no snow cover during winter');
            if (store.snow.maxDepth > 100) results.phenomena.push(`snow-free after ${formatter.snowdepthToString(store.snow.maxDepth)} max depth`);
        }
    } else if (snowDepth < THRESHOLDS.SNOW.TRACE) {
        results.conditions.push('trace snow cover');
    } else if (snowDepth < THRESHOLDS.SNOW.LIGHT_COVER) {
        results.conditions.push(`light snow cover (< ${formatter.snowdepthToString(THRESHOLDS.SNOW.LIGHT_COVER)})`);
        if (month >= 3 && month <= 4) results.phenomena.push('spring snow melt beginning');
    } else if (snowDepth < THRESHOLDS.SNOW.MODERATE_COVER) {
        results.conditions.push(`moderate snow cover (< ${formatter.snowdepthToString(THRESHOLDS.SNOW.MODERATE_COVER)})`);
    } else if (snowDepth < THRESHOLDS.SNOW.DEEP_COVER) {
        results.conditions.push(`deep snow cover (< ${formatter.snowdepthToString(THRESHOLDS.SNOW.DEEP_COVER)})`);
        results.phenomena.push('challenging forest mobility');
    } else if (snowDepth < THRESHOLDS.SNOW.VERY_DEEP_COVER) {
        results.conditions.push(`very deep snow cover (< ${formatter.snowdepthToString(THRESHOLDS.SNOW.VERY_DEEP_COVER)})`);
        results.alerts.push(`extreme snow depth (< ${formatter.snowdepthToString(THRESHOLDS.SNOW.VERY_DEEP_COVER)})`);
        results.phenomena.push('restricted mobility in forest');
    } else {
        results.conditions.push(`exceptional snow cover (> ${formatter.snowdepthToString(THRESHOLDS.SNOW.VERY_DEEP_COVER)})`);
        results.alerts.push(`exceptional snow depth (> ${formatter.snowdepthToString(THRESHOLDS.SNOW.VERY_DEEP_COVER)})`);
    }

    // -------------------------------------------------------------------------
    // PART B: Accumulation and Melt Analysis (snow-only)
    // -------------------------------------------------------------------------

    const trends = store.conditions?.trends?.snowDepth || {};

    const t24h = trends['24h'];
    if (t24h?.valid && t24h.back !== undefined) {
        const change24h = snowDepth - t24h.back;
        store.snow.change24h = change24h;
        if (change24h > 0) {
            store.snow.accumulation24h = change24h;
            store.snow.meltRate24h = 0;
        } else if (change24h < 0) {
            store.snow.meltRate24h = Math.abs(change24h);
            store.snow.accumulation24h = 0;
        }
    }
    if (store.snow.accumulation24h > THRESHOLDS.SNOW.EXTREME_24H) {
        results.alerts.push(`extreme 24 hour snowfall (${formatter.snowdepthToString(store.snow.accumulation24h)})`);
    } else if (store.snow.accumulation24h > THRESHOLDS.SNOW.HEAVY_24H) {
        results.alerts.push(`heavy 24 hour snowfall (${formatter.snowdepthToString(store.snow.accumulation24h)})`);
    } else if (store.snow.accumulation24h > THRESHOLDS.SNOW.MODERATE_24H) {
        results.phenomena.push(`moderate 24 hour snowfall (${formatter.snowdepthToString(store.snow.accumulation24h)})`);
    } else if (store.snow.accumulation24h > THRESHOLDS.SNOW.LIGHT_24H) {
        results.phenomena.push(`light 24 hour snowfall (${formatter.snowdepthToString(store.snow.accumulation24h)})`);
    }
    if (store.snow.meltRate24h > THRESHOLDS.SNOW.RAPID_MELT) {
        results.phenomena.push(`rapid 24 hour snowmelt (${formatter.snowdepthToString(store.snow.meltRate24h)})`);
    } else if (store.snow.meltRate24h > THRESHOLDS.SNOW.MODERATE_MELT) {
        results.phenomena.push(`moderate 24 hour snowmelt (${formatter.snowdepthToString(store.snow.meltRate24h)})`);
    }

    const t7d = trends['7d'];
    if (t7d?.valid && t7d.back !== undefined) {
        store.snow.change7d = snowDepth - t7d.back;
    }

    // -------------------------------------------------------------------------
    // PART C: Recreation Conditions (snow-only)
    // -------------------------------------------------------------------------

    if (snowDepth >= THRESHOLDS.SNOW.MIN_SKIING) {
        results.phenomena.push('sufficient snow for skiing');
    }

    // -------------------------------------------------------------------------
    // PART D: Seasonal Context (snow-only)
    // -------------------------------------------------------------------------

    if (month === 10 && snowDepth > 0) {
        results.phenomena.push('early season snow');
    } else if (month === 4 && snowDepth > 100) {
        results.phenomena.push('late season persistent snow pack');
    } else if (month >= 5 && month <= 8 && snowDepth > 0) {
        results.phenomena.push('unusual summer snow');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretIce({ results, situation, dataCurrent, store, weatherData }) {
    const { iceDepth } = dataCurrent;
    const { hour, month } = situation;

    if (iceDepth === undefined) return;

    if (!store.ice)
        store.ice = {
            maxDepth: 0,
            formationDate: undefined,
            breakupDate: undefined,
            growthRate7d: 0,
            meltRate7d: 0,
            safeDays7d: 0,
        };

    if (iceDepth > 0 && store.ice.maxDepth === 0) store.ice.formationDate = new Date();
    else if (iceDepth === 0 && store.ice.maxDepth > 0) store.ice.breakupDate = new Date();
    if (iceDepth > store.ice.maxDepth) store.ice.maxDepth = iceDepth;

    // -------------------------------------------------------------------------
    // PART A: Basic Ice Cover Classification
    // -------------------------------------------------------------------------

    if (iceDepth === 0) {
        if (month >= 11 || month <= 3) results.phenomena.push('open water');
    } else if (iceDepth < THRESHOLDS.ICE.THIN) {
        results.conditions.push(`thin ice cover (< ${formatter.icedepthToString(THRESHOLDS.ICE.THIN)})`);
        results.alerts.push('unsafe ice conditions - stay off ice');
    } else if (iceDepth < THRESHOLDS.ICE.WALKABLE) {
        results.conditions.push(`forming ice (< ${formatter.icedepthToString(THRESHOLDS.ICE.WALKABLE)})`);
        results.phenomena.push('ice may support single person on foot with caution');
    } else if (iceDepth < THRESHOLDS.ICE.GROUP_SAFE) {
        results.conditions.push(`moderate ice cover (< ${formatter.icedepthToString(THRESHOLDS.ICE.GROUP_SAFE)})`);
        results.phenomena.push('ice supports walking (Swedish: 10cm standard)');
    } else if (iceDepth < THRESHOLDS.ICE.SNOWMOBILE) {
        results.conditions.push(`thick ice cover (< ${formatter.icedepthToString(THRESHOLDS.ICE.SNOWMOBILE)})`);
        results.phenomena.push('ice supports group activities');
    } else if (iceDepth < THRESHOLDS.ICE.VEHICLE) {
        results.conditions.push(`very thick ice (< ${formatter.icedepthToString(THRESHOLDS.ICE.VEHICLE)})`);
        results.phenomena.push('ice supports snowmobile (Swedish: 20cm standard)');
    } else if (iceDepth < THRESHOLDS.ICE.HEAVY_VEHICLE) {
        results.conditions.push(`exceptional ice (< ${formatter.icedepthToString(THRESHOLDS.ICE.HEAVY_VEHICLE)})`);
        results.phenomena.push('ice supports light vehicles (Swedish: 25cm standard)');
    } else {
        results.conditions.push(`extreme ice thickness (> ${formatter.icedepthToString(THRESHOLDS.ICE.HEAVY_VEHICLE)})`);
        results.phenomena.push('ice supports heavy vehicles');
    }

    // -------------------------------------------------------------------------
    // PART B: Growth and Melt Analysis (ice-only)
    // -------------------------------------------------------------------------

    const trends = store.conditions?.trends?.iceDepth || {};

    const t7d = trends['7d'];
    if (t7d?.valid && t7d.back !== undefined) {
        const change7d = iceDepth - t7d.back;
        store.ice.change7d = change7d;
        if (change7d > 0) {
            store.ice.growthRate7d = change7d / 7;
            store.ice.meltRate7d = 0;
        } else if (change7d < 0) {
            store.ice.meltRate7d = Math.abs(change7d) / 7;
            store.ice.growthRate7d = 0;
        }
    }

    if (iceDepth > THRESHOLDS.ICE.THIN) {
        if (store.ice.growthRate7d > THRESHOLDS.ICE.RAPID_GROWTH) {
            results.phenomena.push(`rapid 7 day ice growth (${formatter.icedepthToString(store.ice.growthRate7d)})`);
        } else if (store.ice.meltRate7d > THRESHOLDS.ICE.RAPID_MELT) {
            results.phenomena.push(`ice deteriorating over 7 days (${formatter.icedepthToString(store.ice.meltRate7d)})`);
            if (iceDepth < THRESHOLDS.ICE.GROUP_SAFE) {
                results.alerts.push('ice becoming unsafe');
            }
        }
    }

    // -------------------------------------------------------------------------
    // PART C: Safety Status (ice-only)
    // -------------------------------------------------------------------------

    // Calculate safe days from 7d period data
    const period7d = weatherData?.getPeriod?.('7d');
    if (period7d?.entries?.length) {
        store.ice.safeDays7d = period7d.estimateDays((e) => e.iceDepth !== undefined && e.iceDepth >= THRESHOLDS.ICE.WALKABLE);
        if (iceDepth >= THRESHOLDS.ICE.WALKABLE && store.ice.safeDays7d > 5) {
            results.phenomena.push('ice fishing conditions established');
        }
    }

    // -------------------------------------------------------------------------
    // PART D: Seasonal Context (ice-only)
    // -------------------------------------------------------------------------

    if (month >= 3 && month <= 4 && iceDepth > 0) {
        results.phenomena.push('spring ice - extra caution needed');
        if (hour >= 10 && hour <= 16) {
            results.phenomena.push('daytime warming may affect ice');
        }
    }

    if (month === 10 && iceDepth > 0) {
        results.phenomena.push('early lake ice formation');
    } else if (month === 4 && iceDepth > THRESHOLDS.ICE.WALKABLE) {
        results.phenomena.push('late season persistent ice');
    } else if (month >= 5 && month <= 9 && iceDepth > 0) {
        results.phenomena.push('unusual season ice');
    }

    if (month >= 1 && month <= 3 && iceDepth > THRESHOLDS.ICE.GROUP_SAFE) {
        results.phenomena.push('ice road conditions possible');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretRadiation({ results, situation, dataCurrent, store }) {
    const { radiationCpm, radiationAcpm, radationUsvh } = dataCurrent;
    const { month } = situation;

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

    const radiationValue = radiationAcpm === undefined ? radiationCpm : radiationAcpm;
    const radiationSource = radiationAcpm === undefined ? 'instant' : 'average';
    store.radiation.currentValue = radiationValue;
    store.radiation.source = radiationSource;
    if (radiationValue > store.radiation.maxReading) store.radiation.maxReading = radiationValue;

    // -------------------------------------------------------------------------
    // PART A: Basic Radiation Classification (radiation-only)
    // -------------------------------------------------------------------------

    if (radiationValue <= THRESHOLDS.RADIATION.NORMAL) {
        // Normal background - no mention needed
    } else if (radiationValue <= THRESHOLDS.RADIATION.SLIGHTLY_ELEVATED) {
        results.conditions.push(`slightly elevated radiation (${radiationValue} CPM ${radiationSource})`);
        results.phenomena.push('above normal background radiation');
    } else if (radiationValue <= THRESHOLDS.RADIATION.MODERATELY_ELEVATED) {
        results.conditions.push(`moderately elevated radiation (${radiationValue} CPM)`);
        results.alerts.push(`elevated radiation levels (${radiationValue} CPM ${radiationSource})`);
        results.phenomena.push('investigate radiation source');
    } else if (radiationValue <= THRESHOLDS.RADIATION.HIGH) {
        results.conditions.push(`high radiation (${radiationValue} CPM)`);
        results.alerts.push(`high radiation levels (${radiationValue} CPM ${radiationSource})`);
        results.phenomena.push('minimize prolonged exposure');
    } else if (radiationValue <= THRESHOLDS.RADIATION.DANGEROUS) {
        results.conditions.push(`dangerous radiation (${radiationValue} CPM)`);
        results.alerts.push(`dangerous radiation levels (${radiationValue} CPM ${radiationSource})`);
    } else {
        results.conditions.push(`extremely high radiation (${radiationValue} CPM)`);
        results.alerts.push(`critical radiation levels (${radiationValue} CPM ${radiationSource})`);
        results.phenomena.push('seek immediate shelter');
    }

    // -------------------------------------------------------------------------
    // PART B: Anomaly Detection (radiation-only)
    // -------------------------------------------------------------------------

    const cpmTrends = store.conditions?.trends?.radiationCpm || {};
    const acpmTrends = store.conditions?.trends?.radiationAcpm || {};

    const t24h = radiationAcpm === undefined ? cpmTrends['24h'] : acpmTrends['24h'];
    if (t24h?.valid && t24h.avg !== undefined) store.radiation.baseline = t24h.avg;
    if (store.radiation.baseline > 0) {
        const ratio = radiationValue / store.radiation.baseline;
        if (ratio > THRESHOLDS.RADIATION.CRITICAL_ANOMALY_MULTIPLIER) {
            store.radiation.anomalyCount++;
            store.radiation.lastAnomaly = Date.now();
            results.alerts.push(`radiation critical (${ratio.toFixed(1)}x baseline)`);
        } else if (ratio > THRESHOLDS.RADIATION.SEVERE_ANOMALY_MULTIPLIER) {
            store.radiation.anomalyCount++;
            store.radiation.lastAnomaly = Date.now();
            results.phenomena.push(`radiation severe (${ratio.toFixed(1)}x baseline)`);
        } else if (ratio > THRESHOLDS.RADIATION.ANOMALY_MULTIPLIER) {
            results.phenomena.push(`radiation elevated (${ratio.toFixed(1)}x baseline)`);
        }
    }

    // -------------------------------------------------------------------------
    // PART C: Dose Rate Analysis (radiation-only)
    // -------------------------------------------------------------------------

    if (radationUsvh !== undefined) {
        if (radationUsvh > THRESHOLDS.RADIATION.DOSE_DANGEROUS) {
            results.alerts.push(`dangerous dose rate (> ${formatter.radiationToString(THRESHOLDS.RADIATION.DOSE_DANGEROUS)})`);
        } else if (radationUsvh > THRESHOLDS.RADIATION.DOSE_HIGH) {
            results.alerts.push(`high dose rate (> ${formatter.radiationToString(THRESHOLDS.RADIATION.DOSE_HIGH)})`);
            results.phenomena.push('limit prolonged exposure');
        } else if (radationUsvh > THRESHOLDS.RADIATION.DOSE_ELEVATED) {
            results.phenomena.push(`elevated dose rate (> ${formatter.radiationToString(THRESHOLDS.RADIATION.DOSE_ELEVATED)})`);
        }
        store.radiation.doseRate = radationUsvh;
        const now = new Date();
        const resetTime = store.radiation.doseResetTime ? new Date(store.radiation.doseResetTime) : undefined;
        if (!resetTime || now.getDate() !== resetTime.getDate()) {
            store.radiation.dailyDose = 0;
            store.radiation.doseResetTime = now.getTime();
        }
        store.radiation.dailyDose += radationUsvh / 60;
        if (store.radiation.dailyDose > 2.4) {
            results.phenomena.push(`daily dose ${formatter.radiationToString(store.radiation.dailyDose)} (above average ${formatter.radiationToString(2.4)})`);
        }
    }

    // -------------------------------------------------------------------------
    // PART D: Seasonal Context (radiation + time only)
    // -------------------------------------------------------------------------

    if (radiationValue > THRESHOLDS.RADIATION.NORMAL) {
        // Seasonal radon patterns
        if (month >= 9 || month <= 3) {
            results.phenomena.push('seasonal radon fluctuation possible');
        }
        // Winter indoor radon
        if (radiationValue > 25 && radiationValue <= 40 && (month >= 11 || month <= 2)) {
            results.phenomena.push('typical winter indoor radon accumulation');
        }
    }

    // Sustained anomaly warning
    if (store.radiation.anomalyCount > 5 && store.radiation.lastAnomaly && Date.now() - store.radiation.lastAnomaly < 3600000) {
        results.alerts.push('sustained elevated radiation - investigate source');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCombination({ results, situation, dataCurrent, store, weatherData }) {
    const { month, hour, location, dewPoint, windChill, heatIndex, daylight } = situation;
    const { temp, humidity, pressure, windSpeed, windDir, rainRate, snowDepth, cloudCover, iceDepth, solarUvi } = dataCurrent;

    // Get pre-computed trends
    const tempTrends = store.conditions?.trends?.temp || {};
    const pressureTrends = store.conditions?.trends?.pressure || {};

    // ==========================================================================
    // SECTION 1: TEMPERATURE + HUMIDITY COMBINATIONS
    // ==========================================================================

    if (temp !== undefined && humidity !== undefined) {
        // Ice crystal formation
        if (temp < THRESHOLDS.TEMP.VERY_COLD && humidity > 80) {
            results.phenomena.push('ice crystal formation likely');
        }

        // Oppressive humidity
        if (humidity > THRESHOLDS.HUMIDITY.VERY_HUMID && temp > THRESHOLDS.TEMP.WARM) {
            results.phenomena.push('oppressive humidity');
            if (heatIndex && heatIndex > temp + 5) {
                results.phenomena.push(`humidity making it feel ${formatter.temperatureToString(heatIndex - temp)} warmer`);
            }
        }

        // Heat index warnings
        if (heatIndex !== undefined) {
            if (heatIndex >= THRESHOLDS.COMPOUND.HEAT_INDEX_EXTREME) {
                results.alerts.push(`extreme heat index ${formatter.temperatureToString(heatIndex)} (> ${formatter.temperatureToString(THRESHOLDS.COMPOUND.HEAT_INDEX_EXTREME)})`);
            } else if (heatIndex >= THRESHOLDS.COMPOUND.HEAT_INDEX_DANGER) {
                results.alerts.push(`dangerous heat index ${formatter.temperatureToString(heatIndex)} (> ${formatter.temperatureToString(THRESHOLDS.COMPOUND.HEAT_INDEX_DANGER)})`);
            } else if (heatIndex >= THRESHOLDS.COMPOUND.HEAT_INDEX_WARNING) {
                results.alerts.push(`high heat index ${formatter.temperatureToString(heatIndex)} (> ${formatter.temperatureToString(THRESHOLDS.COMPOUND.HEAT_INDEX_WARNING)})`);
            } else if (heatIndex >= THRESHOLDS.COMPOUND.HEAT_INDEX_CAUTION) {
                results.phenomena.push(`heat index ${formatter.temperatureToString(heatIndex)} (> ${formatter.temperatureToString(THRESHOLDS.COMPOUND.HEAT_INDEX_CAUTION)})`);
            }
        }

        // Maritime influence detection
        const t24h = tempTrends['24h'];
        if (t24h?.valid) {
            if (t24h.min !== undefined && t24h.max !== undefined) {
                const range24h = t24h.max - t24h.min;
                if (range24h < THRESHOLDS.TEMP.STABLE_DIURNAL_RANGE && humidity > 80) {
                    results.phenomena.push('maritime influence likely');
                }
            }
        }

        // Precipitation type by temperature (moved from interpretPrecipitation)
        if (rainRate > 0) {
            if (temp < -5) {
                results.phenomena.push('snow (powder)');
                results.phenomena.push(`snow accumulation rate: ~${formatter.snowdepthToString(rainRate * 10)}/hour`);
            } else if (temp < -2) {
                results.phenomena.push('snow');
            } else if (temp < THRESHOLDS.TEMP.FREEZING) {
                results.phenomena.push('wet snow or sleet');
                results.alerts.push('slippery conditions');
            } else if (temp < 2) {
                results.phenomena.push('mixed precipitation possible');
            } else {
                results.phenomena.push('rain');
            }
        }

        // Imminent precipitation
        if (humidity > THRESHOLDS.HUMIDITY.SATURATED && rainRate === 0) {
            results.phenomena.push('saturated air - precipitation imminent');
        }
    }

    // ==========================================================================
    // SECTION 2: FOG PREDICTION (temp + humidity + dewPoint + wind)
    // ==========================================================================

    if (dewPoint !== undefined && temp !== undefined) {
        const dewPointSpread = temp - dewPoint;

        if (dewPointSpread < THRESHOLDS.DEW_POINT.DENSE_FOG_SPREAD && humidity > THRESHOLDS.HUMIDITY.SATURATED) {
            results.conditions.push('foggy conditions');
            if (temp < THRESHOLDS.TEMP.FREEZING) {
                results.phenomena.push('freezing fog');
                results.alerts.push('freezing fog - ice accumulation on surfaces');
            }
        } else if (dewPointSpread < THRESHOLDS.DEW_POINT.FOG_SPREAD && humidity > 85) {
            if (windSpeed !== undefined && windSpeed < 2) {
                results.phenomena.push('fog formation likely');
                if (hour >= 22 || hour <= 8) results.phenomena.push('overnight fog probable');
            } else if (windSpeed !== undefined && windSpeed < 5) {
                results.phenomena.push('patchy fog possible');
            }
        } else if (dewPointSpread < THRESHOLDS.DEW_POINT.MIST_SPREAD && humidity > 80) {
            results.phenomena.push('mist possible');
        }

        // Forest-specific fog
        if (location.forestCoverage === 'high' && dewPointSpread < THRESHOLDS.DEW_POINT.PATCHY_FOG_SPREAD && temp > THRESHOLDS.TEMP.FREEZING) {
            if (hour < 10 || hour > 18) {
                results.phenomena.push('forest fog likely');
                if (dewPointSpread < THRESHOLDS.DEW_POINT.DENSE_FOG_SPREAD) {
                    results.phenomena.push('dense fog in forest valleys');
                }
            } else {
                results.phenomena.push('patchy forest fog possible');
            }
        }
    }

    // ==========================================================================
    // SECTION 3: TEMPERATURE + WIND COMBINATIONS
    // ==========================================================================

    if (temp !== undefined && windSpeed !== undefined) {
        // Wind chill (moved from interpretWind)
        if (temp < 10 && windSpeed > 3 && windChill !== undefined) {
            const windChillDiff = Math.round(temp - windChill);
            if (windChillDiff >= 3) {
                results.phenomena.push(`feels ${formatter.temperatureToString(windChillDiff)} colder due to wind`);
                if (windChill < THRESHOLDS.COMPOUND.WIND_CHILL_DANGEROUS) {
                    results.alerts.push(`extreme wind chill ${formatter.temperatureToString(windChill)} (< ${formatter.temperatureToString(THRESHOLDS.COMPOUND.WIND_CHILL_DANGEROUS)}) - frostbite in minutes`);
                } else if (windChill < THRESHOLDS.COMPOUND.WIND_CHILL_EXTREME) {
                    results.alerts.push(`extreme wind chill ${formatter.temperatureToString(windChill)} (< ${formatter.temperatureToString(THRESHOLDS.COMPOUND.WIND_CHILL_EXTREME)})`);
                } else if (windChill < THRESHOLDS.COMPOUND.WIND_CHILL_SEVERE) {
                    results.alerts.push(`severe wind chill: ${formatter.temperatureToString(windChill)} (< ${formatter.temperatureToString(THRESHOLDS.COMPOUND.WIND_CHILL_SEVERE)}) - limit exposure`);
                } else if (windChill < THRESHOLDS.COMPOUND.WIND_CHILL_COLD) {
                    results.phenomena.push('significant wind chill factor');
                }
            }
        }

        // Still arctic air
        if (temp < THRESHOLDS.TEMP.VERY_COLD && windSpeed < THRESHOLDS.WIND.CALM) {
            results.phenomena.push('still arctic air');
            if (store.wind?.calmHours24h > 12) {
                results.phenomena.push('temperature inversion likely');
            }
        }

        // Arctic wind direction effects
        if (windDir !== undefined && (month >= 11 || month <= 2)) {
            const cardinalDir = store.wind?.cardinalDirection || cardinalDirection(windDir);
            if ((cardinalDir === 'N' || cardinalDir === 'NE') && temp < THRESHOLDS.TEMP.COLD) {
                results.phenomena.push('arctic wind - severe chill');
            }
        }

        // Hot still conditions
        if (temp > THRESHOLDS.TEMP.HOT && windSpeed < 2 && hour >= 10 && hour <= 16) {
            results.phenomena.push('still, hot conditions');
        }
    }

    // ==========================================================================
    // SECTION 4: TEMPERATURE + SNOW COMBINATIONS
    // ==========================================================================

    if (temp !== undefined && snowDepth !== undefined && snowDepth > 0) {
        // Snow type by temperature (moved from interpretSnow)
        if (snowDepth > 30) {
            if (temp < THRESHOLDS.TEMP.VERY_COLD) {
                results.phenomena.push('powder snow conditions');
            } else if (temp < THRESHOLDS.TEMP.COLD) {
                results.phenomena.push('dry snow conditions');
            } else if (temp < THRESHOLDS.TEMP.FREEZING) {
                results.phenomena.push('packed snow conditions');
            } else {
                results.phenomena.push('wet snow conditions');
                if (temp > THRESHOLDS.TEMP.CHILLY) results.phenomena.push('rapid snowmelt possible');
            }
        }

        // Skiing conditions
        if (snowDepth >= THRESHOLDS.SNOW.MIN_SKIING) {
            if (temp >= -15 && temp <= -5) {
                results.phenomena.push('excellent cross-country skiing conditions');
            } else if (temp > -5 && temp < THRESHOLDS.TEMP.FREEZING) {
                results.phenomena.push('good skiing conditions');
            } else if (temp >= THRESHOLDS.TEMP.FREEZING) {
                results.phenomena.push('wet/slow skiing conditions');
            }
        }

        // Winter warmth causing melt
        if ((month >= 11 || month <= 2) && temp > THRESHOLDS.TEMP.WINTER_WARM) {
            results.phenomena.push('rapid snowmelt likely');
        }
    }

    // ==========================================================================
    // SECTION 5: RAIN + SNOW COMBINATIONS (Rain on snow)
    // ==========================================================================

    if (rainRate !== undefined && rainRate > 0 && snowDepth !== undefined && snowDepth > THRESHOLDS.SNOW.LIGHT_COVER) {
        if (temp !== undefined && temp > 2) {
            results.alerts.push('rain on snow - rapid melt and flood risk');
            if (store.snow?.meltRate24h > THRESHOLDS.SNOW.RAPID_MELT) {
                results.alerts.push('significant rain-on-snow flood risk');
            }
        } else if (temp !== undefined && temp > THRESHOLDS.TEMP.FREEZING) {
            results.phenomena.push('rain on snow event');
        }
    }

    // ==========================================================================
    // SECTION 6: WIND + SNOW COMBINATIONS (Blizzard, drifting)
    // ==========================================================================

    if (windSpeed !== undefined && snowDepth !== undefined) {
        // Snow drifting
        if (windSpeed > THRESHOLDS.WIND.SNOW_DRIFT && temp !== undefined && temp < THRESHOLDS.TEMP.FREEZING && snowDepth > THRESHOLDS.SNOW.TRACE) {
            results.phenomena.push('snow drifting possible');
            if (windSpeed > THRESHOLDS.WIND.MODERATE_BREEZE) {
                results.phenomena.push('blowing snow conditions');
            }
        }

        // Blizzard conditions
        if (windSpeed >= THRESHOLDS.COMPOUND.BLIZZARD_WIND && rainRate > 0 && temp !== undefined && temp < THRESHOLDS.TEMP.FREEZING) {
            results.alerts.push('blizzard conditions');
        }

        // Snow loading on trees with wind
        if (snowDepth > THRESHOLDS.SNOW.MODERATE_COVER && windSpeed > 10 && location.forestCoverage === 'high') {
            results.phenomena.push('snow loading on trees - branch fall risk');
            if (rainRate > 0) {
                results.alerts.push('increased risk of tree damage - wet snow and wind');
            }
        }
    }

    // ==========================================================================
    // SECTION 7: WIND + RAIN COMBINATIONS
    // ==========================================================================

    if (windSpeed !== undefined && rainRate !== undefined && rainRate > 0) {
        if (windSpeed > THRESHOLDS.WIND.MODERATE_BREEZE) {
            results.phenomena.push('driving rain');
        }
        if (windSpeed > THRESHOLDS.WIND.FRESH_BREEZE && rainRate > THRESHOLDS.RAIN.MODERATE) {
            results.phenomena.push('horizontal precipitation');
        }

        // Forest tree damage risk
        if (location.forestCoverage === 'high' && windSpeed > 15 && (rainRate > 0 || snowDepth > 0)) {
            results.alerts.push('increased risk of tree damage');
        }
    }

    // ==========================================================================
    // SECTION 8: PRESSURE + HUMIDITY COMBINATIONS
    // ==========================================================================

    if (pressure !== undefined && humidity !== undefined) {
        const pressureAdjusted = store.pressure?.adjusted || pressure;
        let pressureTrend = 'stable';

        // Check pressure trend
        const t3h = pressureTrends['3h'];
        if (t3h?.valid && t3h.back !== undefined) {
            const pressureChange = pressure - t3h.back;
            if (pressureChange < -THRESHOLDS.PRESSURE.MODERATE_3H_CHANGE) pressureTrend = 'falling';
            else if (pressureChange > THRESHOLDS.PRESSURE.MODERATE_3H_CHANGE) pressureTrend = 'rising';
        }

        // Precipitation forecasting
        if (pressureAdjusted < THRESHOLDS.PRESSURE.STORMY && humidity > 85) {
            results.phenomena.push('precipitation very likely');
            if (temp !== undefined && temp < THRESHOLDS.TEMP.CHILLY && (month >= 10 || month <= 3)) {
                results.phenomena.push('winter precipitation imminent');
            }
        } else if (pressureAdjusted < THRESHOLDS.PRESSURE.UNSETTLED && humidity > 75) {
            results.phenomena.push('precipitation likely');
            if (pressureTrend === 'falling' && humidity > 80) {
                results.phenomena.push('precipitation approaching');
            }
        } else if (pressureAdjusted > THRESHOLDS.PRESSURE.SETTLED && humidity < 40) {
            results.phenomena.push('clear and dry conditions');
        }

        // Summer showers
        if (month >= 6 && month <= 8 && pressureAdjusted < THRESHOLDS.PRESSURE.NORMAL_LOW && humidity > THRESHOLDS.HUMIDITY.HUMID) {
            results.phenomena.push('summer showers possible');
        }
    }

    // ==========================================================================
    // SECTION 9: PRESSURE + TEMPERATURE COMBINATIONS
    // ==========================================================================

    if (pressure !== undefined && temp !== undefined) {
        const pressureAdjusted = store.pressure?.adjusted || pressure;

        // Cold high pressure
        if (pressureAdjusted > THRESHOLDS.PRESSURE.SETTLED && temp < THRESHOLDS.TEMP.VERY_COLD) {
            results.phenomena.push('cold high pressure system');
            if (month >= 11 || month <= 2) {
                results.phenomena.push('arctic high pressure - very cold');
            }
        }

        // Winter rain
        if ((month >= 11 || month <= 2) && pressureAdjusted < THRESHOLDS.PRESSURE.STORMY && temp > THRESHOLDS.TEMP.FREEZING) {
            results.phenomena.push('winter rain likely');
            if (store.pressure?.change3h < -THRESHOLDS.PRESSURE.MODERATE_3H_CHANGE) {
                results.alerts.push('winter storm developing');
            }
        }

        // Storm with active wind
        if (pressureAdjusted < THRESHOLDS.PRESSURE.STORMY && windSpeed !== undefined && windSpeed > 10) {
            results.alerts.push('storm system active');
        }

        // Variable wind near low pressure
        if (pressureAdjusted < THRESHOLDS.PRESSURE.UNSETTLED && store.wind?.directionChanges > 3) {
            results.phenomena.push('unstable conditions near low pressure');
        }
    }

    // ==========================================================================
    // SECTION 10: PRESSURE + WIND COMBINATIONS
    // ==========================================================================

    if (pressure !== undefined && windSpeed !== undefined) {
        const pressureAdjusted = store.pressure?.adjusted || pressure;

        if (pressureAdjusted < THRESHOLDS.PRESSURE.STORMY && windSpeed > THRESHOLDS.WIND.NEAR_GALE) {
            results.phenomena.push('deep low pressure system');
        }

        // Autumn/winter storm
        if ((month >= 9 || month <= 3) && windSpeed > 15 && pressureAdjusted < THRESHOLDS.PRESSURE.STORMY) {
            results.phenomena.push('deep low pressure system - strong storm');
        }
    }

    // ==========================================================================
    // SECTION 11: HUMIDITY + WIND COMBINATIONS
    // ==========================================================================

    if (humidity !== undefined && windSpeed !== undefined) {
        // Moisture source by wind direction
        if (humidity > 80 && windDir !== undefined && windDir >= 180 && windDir <= 270) {
            results.phenomena.push('moisture from Baltic Sea region');
        }

        // Evaporation/drying
        if (humidity < THRESHOLDS.HUMIDITY.DRY && windSpeed > THRESHOLDS.WIND.EVAPORATION_SIGNIFICANT) {
            results.phenomena.push('desiccating conditions');
            if (location.forestCoverage === 'high') {
                results.phenomena.push('rapid drying in forest');
            }
        }

        // Damp raw conditions
        if ((month >= 11 || month <= 2) && humidity > 85 && temp !== undefined && temp > -5 && windSpeed > 5) {
            results.phenomena.push('raw winter weather');
        }
    }

    // ==========================================================================
    // SECTION 12: CLOUD + OTHER COMBINATIONS
    // ==========================================================================

    if (cloudCover !== undefined) {
        // Cloud type inference
        if (cloudCover > THRESHOLDS.CLOUDS.PARTLY_CLOUDY && rainRate === 0 && humidity !== undefined && humidity < 80) {
            results.phenomena.push('high cloud layer likely');
        } else if (cloudCover > THRESHOLDS.CLOUDS.MOSTLY_CLOUDY && humidity !== undefined && humidity > THRESHOLDS.HUMIDITY.VERY_HUMID) {
            results.phenomena.push('low stratus cloud');
            if (dewPoint !== undefined && temp !== undefined && temp - dewPoint < THRESHOLDS.DEW_POINT.FOG_SPREAD) {
                results.phenomena.push('cloud base near ground level');
            }
        }

        // Sun breaking through
        if (daylight?.isDaytime && cloudCover > THRESHOLDS.CLOUDS.PARTLY_CLOUDY && cloudCover < THRESHOLDS.CLOUDS.MOSTLY_CLOUDY) {
            if (store.light?.radAvg > 300) {
                results.phenomena.push('sun breaking through clouds');
            }
        }

        // Cloud thermal effects
        if (cloudCover > THRESHOLDS.CLOUDS.OVERCAST) {
            if (month >= 11 || month <= 2) {
                results.phenomena.push('clouds providing insulation');
            } else if (month >= 6 && month <= 8 && daylight?.isDaytime) {
                results.phenomena.push('clouds limiting heating');
            }
        } else if (cloudCover < THRESHOLDS.CLOUDS.CLEAR) {
            if (!daylight?.isDaytime && temp !== undefined && temp < THRESHOLDS.TEMP.CHILLY) {
                results.phenomena.push('clear skies enhancing cooling');
            } else if (daylight?.isDaytime && month >= 6 && month <= 8) {
                results.phenomena.push('strong solar heating');
            }
            // Clear arctic conditions
            if (temp !== undefined && temp < THRESHOLDS.TEMP.VERY_COLD && (month >= 11 || month <= 2)) {
                results.phenomena.push('clear arctic conditions');
                results.phenomena.push('strong radiational cooling');
            }
        }

        // Summer convection
        if (month >= 6 && month <= 8 && cloudCover > THRESHOLDS.CLOUDS.MOSTLY_CLEAR && cloudCover < THRESHOLDS.CLOUDS.PARTLY_CLOUDY) {
            if (hour >= 12 && hour <= 18 && humidity !== undefined && humidity > THRESHOLDS.HUMIDITY.HUMID && temp !== undefined && temp > THRESHOLDS.TEMP.WARM) {
                results.phenomena.push('building cumulus - showers possible');
            }
        }

        // Approaching weather system
        if (store.clouds?.change6h > 50 && pressure !== undefined && pressure < THRESHOLDS.PRESSURE.NORMAL_HIGH) {
            results.phenomena.push('weather system approaching');
        } else if (store.clouds?.change6h < -50 && pressure !== undefined && pressure > THRESHOLDS.PRESSURE.NORMAL_HIGH) {
            results.phenomena.push('high pressure building');
        }
    }

    // ==========================================================================
    // SECTION 13: ICE + TEMPERATURE/SNOW COMBINATIONS
    // ==========================================================================

    if (iceDepth !== undefined && iceDepth > 0) {
        // Weakening ice
        if (temp !== undefined && temp > THRESHOLDS.TEMP.FREEZING && iceDepth < THRESHOLDS.ICE.GROUP_SAFE) {
            results.alerts.push('weakening ice conditions');
        }

        // Spring ice deterioration
        if (month >= 3 && month <= 4 && temp !== undefined) {
            if (temp > THRESHOLDS.TEMP.CHILLY || (temp > THRESHOLDS.TEMP.FREEZING && hour >= 10 && hour <= 16)) {
                results.alerts.push('daytime ice deterioration');
            }
        }

        // Ice formation conditions
        if (iceDepth === 0 && temp !== undefined && temp < THRESHOLDS.TEMP.COLD && (month >= 11 || month <= 3)) {
            results.phenomena.push('ice formation beginning');
        }

        // Snow insulation on ice
        if (snowDepth !== undefined && snowDepth > 100 && iceDepth > THRESHOLDS.ICE.THIN) {
            results.phenomena.push('snow insulation slowing ice growth');
            results.alerts.push('variable ice thickness possible');
        }

        // Nordic winter conditions
        if (snowDepth !== undefined && snowDepth > 100 && iceDepth > THRESHOLDS.ICE.WALKABLE) {
            results.phenomena.push('typical Nordic winter conditions');
        }

        // Ice skating conditions
        if (iceDepth > THRESHOLDS.ICE.GROUP_SAFE && snowDepth !== undefined && snowDepth < THRESHOLDS.SNOW.LIGHT_COVER) {
            results.phenomena.push('excellent ice skating conditions');
        }
    }

    // ==========================================================================
    // SECTION 14: UV + CLOUD COMBINATIONS
    // ==========================================================================

    if (solarUvi !== undefined && cloudCover !== undefined) {
        if (solarUvi > THRESHOLDS.SOLAR.UV_HIGH && cloudCover < THRESHOLDS.CLOUDS.PARTLY_CLOUDY) {
            results.phenomena.push('high UV exposure - sun protection essential');
        } else if (solarUvi > THRESHOLDS.SOLAR.UV_MODERATE && cloudCover > THRESHOLDS.CLOUDS.MOSTLY_CLOUDY) {
            results.phenomena.push('UV still moderate despite clouds');
        }
    }

    // ==========================================================================
    // SECTION 15: RADIATION + ENVIRONMENTAL COMBINATIONS
    // ==========================================================================

    if (store.radiation?.currentValue > THRESHOLDS.RADIATION.NORMAL) {
        // Radon washout during rain
        if (rainRate !== undefined && rainRate > 0) {
            results.phenomena.push('possible radon washout in precipitation');
            if (store.radiation.currentValue > THRESHOLDS.RADIATION.SLIGHTLY_ELEVATED) {
                results.phenomena.push('enhanced radon progeny deposition');
            }
        }

        // Low pressure enhancing radon
        if (pressure !== undefined && pressure < THRESHOLDS.PRESSURE.UNSETTLED) {
            results.phenomena.push('low pressure enhancing radon emission');
        }

        // Calm nighttime accumulation
        if ((hour >= 18 || hour <= 6) && windSpeed !== undefined && windSpeed < 1) {
            results.phenomena.push('calm conditions concentrating radon');
        }

        // Combined radiation + UV exposure
        if (solarUvi !== undefined && solarUvi > THRESHOLDS.SOLAR.UV_HIGH) {
            results.phenomena.push('combined radiation and UV exposure');
        }
    }

    // ==========================================================================
    // SECTION 16: THUNDERSTORM POTENTIAL (temp + humidity + pressure)
    // ==========================================================================

    if (temp !== undefined && humidity !== undefined && pressure !== undefined) {
        if (temp > THRESHOLDS.COMPOUND.THUNDER_TEMP && humidity > THRESHOLDS.COMPOUND.THUNDER_HUMIDITY && pressure < THRESHOLDS.COMPOUND.THUNDER_PRESSURE) {
            const t1h = tempTrends['1h'];
            if (t1h?.valid && t1h.back !== undefined) {
                const tempChange = temp - t1h.back;
                if (tempChange > 2) {
                    results.phenomena.push('thunderstorm development likely');
                    if (windSpeed !== undefined && windSpeed < 5 && month >= 6 && month <= 8) {
                        results.phenomena.push('conditions favorable for strong thunderstorms');
                    }
                } else if (tempChange > 1) {
                    results.phenomena.push('convective development possible');
                }

                // Rapid pressure drop with warming
                const p1h = pressureTrends['1h'];
                if (p1h?.valid && p1h.back !== undefined) {
                    const pressureChange = pressure - p1h.back;
                    if (pressureChange < -THRESHOLDS.PRESSURE.RAPID_HOURLY_CHANGE && tempChange > 1) {
                        results.phenomena.push('rapid atmospheric destabilization');
                    }
                }
            }
        }

        // Summer thunderstorm with heavy rain
        if (month >= 6 && month <= 8 && rainRate !== undefined && rainRate > THRESHOLDS.RAIN.HEAVY && pressure < THRESHOLDS.PRESSURE.NORMAL_HIGH) {
            results.phenomena.push('summer thunderstorm likely');
        }
    }

    // ==========================================================================
    // SECTION 17: FROST CONDITIONS (temp + humidity + wind)
    // ==========================================================================

    if (temp !== undefined && humidity !== undefined) {
        if (temp < -2 && humidity > THRESHOLDS.HUMIDITY.HUMID && (rainRate === undefined || rainRate === 0)) {
            if (humidity > THRESHOLDS.HUMIDITY.VERY_HUMID && (windSpeed === undefined || windSpeed < 2)) {
                results.phenomena.push('heavy frost likely');
                if (hour >= 4 && hour <= 8) results.phenomena.push('morning hoar frost possible');
            } else {
                results.phenomena.push('frost likely');
            }
        }
    }

    // ==========================================================================
    // SECTION 18: FREEZING RAIN/ICE (temp + humidity + rain)
    // ==========================================================================

    if (temp !== undefined && rainRate !== undefined && rainRate > 0) {
        if (temp >= THRESHOLDS.COMPOUND.FREEZING_RAIN_TEMP_LOW && temp < THRESHOLDS.COMPOUND.FREEZING_RAIN_TEMP_HIGH) {
            if (temp > -2 && temp < 1 && humidity !== undefined && humidity > THRESHOLDS.HUMIDITY.VERY_HUMID) {
                results.phenomena.push('freezing rain likely');
                results.alerts.push('severe ice hazard');
                if (location.forestCoverage === 'high') results.alerts.push('forest ice damage risk');
            } else if (humidity !== undefined && humidity > THRESHOLDS.HUMIDITY.SATURATED) {
                results.phenomena.push('freezing rain risk');
                results.alerts.push('ice hazard warning');
            } else {
                results.phenomena.push('freezing precipitation possible');
            }
        }
    }

    // ==========================================================================
    // SECTION 19: FOREST FIRE RISK (temp + humidity + wind + rain)
    // ==========================================================================

    if (month >= 5 && month <= 8 && temp !== undefined && humidity !== undefined) {
        if (temp > THRESHOLDS.COMPOUND.FIRE_RISK_TEMP && humidity < THRESHOLDS.COMPOUND.FIRE_RISK_HUMIDITY && (rainRate === undefined || rainRate === 0)) {
            results.phenomena.push('dry forest conditions');

            const period3d = weatherData?.getPeriod?.('3d');
            if (period3d?.isReasonablyDistributed()) {
                const dryHours = period3d.estimateHours((e) => (e.rainRate === undefined || e.rainRate === 0) && e.humidity !== undefined && e.humidity < 40);
                if (humidity < THRESHOLDS.COMPOUND.FIRE_EXTREME_HUMIDITY && temp > THRESHOLDS.COMPOUND.FIRE_EXTREME_TEMP) {
                    results.alerts.push('high forest fire risk');
                    if (windSpeed !== undefined && windSpeed > 10) {
                        results.alerts.push('extreme fire danger - rapid spread possible');
                    }
                } else if (dryHours > 48) {
                    results.alerts.push('elevated forest fire risk');
                }
                const period7d = weatherData?.getPeriod?.('7d');
                if (period7d?.isReasonablyDistributed()) {
                    const wetHours7d = period7d.estimateHours((e) => e.rainRate !== undefined && e.rainRate > 0);
                    if (wetHours7d < 5 && dryHours > 60) {
                        results.alerts.push('prolonged dry conditions - extreme fire risk');
                    }
                }
            }
        }
    }

    // ==========================================================================
    // SECTION 20: BLACK ICE RISK (temp + humidity + recent conditions)
    // ==========================================================================

    if (temp !== undefined && humidity !== undefined) {
        if (temp >= THRESHOLDS.COMPOUND.BLACK_ICE_TEMP_LOW && temp <= THRESHOLDS.COMPOUND.BLACK_ICE_TEMP_HIGH && humidity > THRESHOLDS.COMPOUND.BLACK_ICE_HUMIDITY) {
            // Check for recent rain or melt conditions
            const recentRain = store.precipitation?.wetHours24h > 0 || (rainRate !== undefined && rainRate > 0);
            const recentMelt = store.snow?.meltRate24h > 10;
            if (recentRain || recentMelt) {
                results.alerts.push('black ice risk');
                if (hour >= 18 || hour <= 8) {
                    results.alerts.push('black ice very likely overnight/morning');
                }
            } else if (humidity > THRESHOLDS.HUMIDITY.SATURATED) {
                results.phenomena.push('potential for black ice');
            }
        }
    }

    // ==========================================================================
    // SECTION 21: SPECIAL NORDIC PHENOMENA
    // ==========================================================================

    // Ice fog (extremely cold + high humidity)
    if (temp !== undefined && temp < -20 && humidity !== undefined && humidity > 70) {
        results.phenomena.push('ice fog possible');
    }

    // Diamond dust (extremely cold + clear + humidity)
    if (temp !== undefined && temp < THRESHOLDS.TEMP.EXTREME_COLD && cloudCover !== undefined && cloudCover < THRESHOLDS.CLOUDS.CLEAR && humidity !== undefined && humidity > 60) {
        results.phenomena.push('diamond dust possible');
    }

    // ==========================================================================
    // SECTION 23: SNOW TYPE DURING PRECIPITATION
    // ==========================================================================

    if (temp !== undefined && humidity !== undefined && rainRate !== undefined && rainRate > 0 && temp < THRESHOLDS.TEMP.FREEZING) {
        if (temp < -10) {
            results.phenomena.push('light powder snow');
            if (windSpeed !== undefined && windSpeed > THRESHOLDS.WIND.SNOW_DRIFT) {
                results.phenomena.push('blowing snow conditions');
            }
        } else if (temp < THRESHOLDS.TEMP.COLD) {
            results.phenomena.push('dry snow');
        } else {
            results.phenomena.push('wet snow');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function () {
    return {
        interpretTemperature,
        interpretPressure,
        interpretHumidity,
        interpretWind,
        interpretClouds,
        interpretPrecipitation,
        interpretLight,
        interpretSnow,
        interpretIce,
        interpretRadiation,
        //
        interpretCombination,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
