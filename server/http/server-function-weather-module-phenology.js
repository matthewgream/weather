// -----------------------------------------------------------------------------------------------------------------------------------------
// Phenology Module - Living landscape observations for Nordic rural environments
// -----------------------------------------------------------------------------------------------------------------------------------------
//
// Covers:
//   - Cultivation: Market garden, crops, orchards, livestock
//   - Forest: Wild berries, mushrooms, trees, forest floor
//   - Wildlife: Mammals (moose, deer, lynx, fox, wolf, squirrel, etc.)
//   - Birds: Resident and migratory species, behavior patterns
//   - Aquatic: Lake ecology, fish, amphibians
//   - Invertebrates: Insects, pollinators, pests
//   - Calendar: Traditional markers, phenological indicators
//
// Location context: Swedish countryside with forest, lake, and mixed habitats
//
// Dependencies:
//   - server-function-weather-tools-events.js
//   - server-function-weather-helpers.js
//
// -----------------------------------------------------------------------------------------------------------------------------------------

/* eslint-disable sonarjs/cognitive-complexity */

// const helpers = require('./server-function-weather-helpers.js');
const toolsEvents = require('./server-function-weather-tools-events.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const TEMP = {
    // Biological activity thresholds
    FROST: 0,
    SOIL_COLD: 5,
    SOIL_COOL: 8,
    SOIL_WARM: 10,
    GROWTH_MIN: 5,
    GROWTH_OPTIMAL: 15,
    HEAT_STRESS_PLANTS: 25,
    HEAT_STRESS_LIVESTOCK: 25,
    SEVERE_COLD_LIVESTOCK: -15,

    // Insect activity
    INSECT_DORMANT: 5,
    INSECT_LOW: 10,
    INSECT_MODERATE: 15,
    INSECT_HIGH: 20,
    MOSQUITO_ACTIVE: 10,
    TICK_ACTIVE: 5,

    // Fish activity
    PIKE_SPAWN: 4,
    PERCH_SPAWN: 8,
    CARP_ACTIVE: 15,
    TROUT_STRESS: 18,

    // Chill hours for fruit
    CHILL_MIN: 0,
    CHILL_MAX: 7,
};

const HUMIDITY = {
    DRY: 30,
    LOW: 50,
    MODERATE: 60,
    HIGH: 70,
    VERY_HIGH: 80,
    SATURATED: 90,

    // Disease pressure
    BLIGHT_RISK: 80,
    MILDEW_RISK: 70,
    FUNGAL_OPTIMAL: 85,

    // Mushroom conditions
    MUSHROOM_MIN: 60,
    MUSHROOM_OPTIMAL: 85,

    // Tick activity
    TICK_FAVORABLE: 70,
};

const WIND = {
    CALM: 2,
    LIGHT: 5,
    MODERATE: 10,
    STRONG: 15,

    // Pollination
    POLLINATION_MAX: 5,

    // Mosquito suppression
    MOSQUITO_SUPPRESS: 3,

    // Spray conditions
    SPRAY_MAX: 3,
};

const PRESSURE = {
    LOW: 1000,
    NORMAL: 1013,
    HIGH: 1025,
    CHANGE_SIGNIFICANT: 3,
    CHANGE_RAPID: 5,

    // Fishing
    FISHING_OPTIMAL_LOW: 1015,
    FISHING_OPTIMAL_HIGH: 1025,
};

const GDD = {
    // Base temperatures
    BASE_COOL: 5, // Grass, cool-season crops
    BASE_WARM: 10, // Warm-season crops

    // Milestones (base 5°C)
    PASTURE_GROWTH: 150,
    SPRING_GRAIN_SOW: 100,
    BILBERRY_FLOWER: 500,
    POTATO_FLOWER: 500,
    CHANTERELLE_EARLY: 600,
    HAY_FIRST_CUT: 600,
    STRAWBERRY_FLOWER: 250,
    RASPBERRY_RIPE: 700,
    BILBERRY_RIPE: 800,
    GRAIN_FLOWER: 900,
    GRAIN_HARVEST: 1200,
};

const CHILL = {
    EARLY_APPLE: 400,
    MOST_APPLE_PEAR: 800,
    ALL_FRUIT: 1200,
};

const MOISTURE = {
    MUSHROOM_MIN: 30,
    MUSHROOM_GOOD: 50,
    MUSHROOM_EXCELLENT: 70,
};

const HOURS = {
    // Dawn/dusk wildlife
    DAWN_START: 4,
    DAWN_END: 7,
    DUSK_START: 17,
    DUSK_END: 21,

    // Fishing
    FISH_MORNING_START: 4,
    FISH_MORNING_END: 8,
    FISH_EVENING_START: 17,
    FISH_EVENING_END: 21,

    // Mosquito peak
    MOSQUITO_EVENING_START: 18,
    MOSQUITO_NIGHT_END: 8,

    // Bird dawn chorus
    CHORUS_START: 3,
    CHORUS_END: 6,

    // Bat activity
    BAT_START: 21,
    BAT_END: 4,
};

const SNOW = {
    TRACE: 1,
    LIGHT_COVER: 10,
    MODERATE: 30,
    DEEP: 50,
    VERY_DEEP: 100,

    // Wildlife impact
    WOLF_HUNTING_CHANGE: 100,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateGDD(temp, baseTemp = GDD.BASE_COOL, maxTemp = 30) {
    if (temp === undefined) return 0;
    return Math.max(0, Math.max(baseTemp, Math.min(temp, maxTemp)) - baseTemp);
}

function isChillHour(temp) {
    return temp !== undefined && temp >= TEMP.CHILL_MIN && temp <= TEMP.CHILL_MAX;
}

function getRecentRainfall(weatherData, daysBack = 7) {
    if (!weatherData?.getPeriod) return 0;
    const period = weatherData.getPeriod(`${daysBack * 24}h`);
    if (!period?.entries) return 0;
    return period.entries.reduce((total, entry) => (entry.rainRate === undefined ? total : total + entry.rainRate / 60), 0);
}

function isDawnOrDusk(hour, minutes, daylight) {
    if (!daylight?.sunriseDecimal || !daylight?.sunsetDecimal) return false;
    const timeDecimal = hour + minutes / 60;
    const nearDawn = Math.abs(timeDecimal - daylight.sunriseDecimal) < 1;
    const nearDusk = Math.abs(timeDecimal - daylight.sunsetDecimal) < 1;
    return nearDawn || nearDusk;
}

// function isGoldenHour(hour, minutes, daylight) {
//     if (!daylight?.sunriseDecimal || !daylight?.sunsetDecimal) return false;
//     const timeDecimal = hour + minutes / 60;
//     const morningGolden = timeDecimal >= daylight.sunriseDecimal && timeDecimal <= daylight.sunriseDecimal + 1;
//     const eveningGolden = timeDecimal >= daylight.sunsetDecimal - 1 && timeDecimal <= daylight.sunsetDecimal;
//     return morningGolden || eveningGolden;
// }

function getPressureTrend(weatherData, hoursBack = 3) {
    if (!weatherData?.getPeriod) return undefined;

    const period = weatherData.getPeriod(`${hoursBack}h`);
    if (!period?.entries?.length) return undefined;

    const [oldest] = period.entries;
    const newest = period.entries[period.entries.length - 1];
    if (oldest?.pressure === undefined || newest?.pressure === undefined) return undefined;
    return newest.pressure - oldest.pressure;
}

// function getTemperatureTrend(weatherData, hoursBack = 1) {
//     if (!weatherData?.getPeriod) return undefined;

//     const period = weatherData.getPeriod(`${hoursBack}h`);
//     if (!period?.entries?.length) return undefined;

//     const [oldest] = period.entries;
//     const newest = period.entries[period.entries.length - 1];
//     if (oldest?.temp === undefined || newest?.temp === undefined) return undefined;
//     return newest.temp - oldest.temp;
// }

function hadRecentFrost(weatherData, hoursBack = 24) {
    if (!weatherData?.getPeriod) return false;

    const period = weatherData.getPeriod(`${hoursBack}h`);
    if (!period?.entries) return false;
    return period.entries.some((entry) => entry.temp !== undefined && entry.temp <= TEMP.FROST);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// CULTIVATION: Market Garden, Crops, Orchards, Livestock
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCultivation({ results, situation, dataCurrent, weatherData, store }) {
    const { month, day, daylight } = situation;
    const { temp, humidity, rainRate, snowDepth, windSpeed, cloudCover } = dataCurrent;
    const state = store.phenology;

    const timestamp = Date.now();
    const today = new Date(timestamp);
    today.setHours(0, 0, 0, 0);

    // *** GDD Tracking ***
    if (!state.gdd.lastUpdate || state.gdd.lastUpdate < today.getTime()) {
        state.gdd.base5 += calculateGDD(temp, GDD.BASE_COOL);
        state.gdd.base10 += calculateGDD(temp, GDD.BASE_WARM);
        state.gdd.lastUpdate = today.getTime();
        // Reset on January 1
        if (month === 0 && day === 1) {
            state.gdd.base5 = 0;
            state.gdd.base10 = 0;
        }
    }

    // *** Frost Tracking ***
    const hadFrost = hadRecentFrost(weatherData, 24) || temp <= TEMP.FROST;
    if (temp <= TEMP.FROST) {
        state.frost.lastDate = timestamp;
        state.frost.consecutiveFrostFreeDays = 0;
        if ((month >= 8 || month <= 2) && toolsEvents.isCooldown(store, 'cultivation', 'firstFrost', 180)) {
            toolsEvents.add(store, 'cultivation', 'firstFrost', 'first frost of season - protect tender plants', 48);
        }
    } else if (!hadFrost) {
        state.frost.consecutiveFrostFreeDays++;
    }

    // Last spring frost (very important for gardeners)
    if (month >= 3 && month <= 5 && state.frost.consecutiveFrostFreeDays > 14) {
        if (toolsEvents.isCooldown(store, 'cultivation', 'lastSpringFrost', 300)) {
            toolsEvents.add(store, 'cultivation', 'lastSpringFrost', 'probable last spring frost has passed - safe for tender plants', 168);
        }
    }

    // *** Growing Season ***
    if (!state.frost.growingSeasonActive && month >= 4 && month <= 9 && state.frost.consecutiveFrostFreeDays > 14 && temp > TEMP.GROWTH_MIN) {
        state.frost.growingSeasonActive = true;
        toolsEvents.add(store, 'cultivation', 'growingSeasonStart', 'growing season has begun', 72);
    } else if (state.frost.growingSeasonActive && hadFrost && month >= 9) {
        state.frost.growingSeasonActive = false;
        toolsEvents.add(store, 'cultivation', 'growingSeasonEnd', 'growing season ending - harvest remaining crops', 72);
    }

    // *** Chill Hours for Fruit Trees ***
    if ((month >= 9 || month <= 3) && isChillHour(temp)) {
        state.frost.chillHours++;
        // eslint-disable-next-line unicorn/prefer-switch
        if (state.frost.chillHours === CHILL.EARLY_APPLE) {
            toolsEvents.add(store, 'cultivation', 'chillHours400', 'early apple varieties reaching chill requirement', 24);
        } else if (state.frost.chillHours === CHILL.MOST_APPLE_PEAR) {
            toolsEvents.add(store, 'cultivation', 'chillHours800', 'most apple and pear varieties have met chill requirements', 24);
        } else if (state.frost.chillHours === CHILL.ALL_FRUIT) {
            toolsEvents.add(store, 'cultivation', 'chillHours1200', 'all fruit trees have sufficient chill hours', 24);
        }
    } else if (month === 4) {
        state.frost.chillHours = 0;
    }

    // =====================================================================
    // MARKET GARDEN - Vegetables
    // =====================================================================

    // *** Early Spring (March-April) ***
    if (month === 2 && temp > TEMP.SOIL_COLD && snowDepth === 0) {
        if (toolsEvents.isCooldown(store, 'cultivation', 'coldFrameStart', 300)) {
            toolsEvents.add(store, 'cultivation', 'coldFrameStart', 'cold frames can be planted - lettuce, spinach, radish', 168);
        }
    }

    if (month === 3 && temp > TEMP.SOIL_COLD) {
        toolsEvents.add(store, 'cultivation', 'earlyPeas', 'early peas can be direct sown', 168);
        toolsEvents.add(store, 'cultivation', 'onionSets', 'plant onion sets and shallots', 168);
    }

    // *** Main Planting (May-June) ***
    if (month === 4 && temp > TEMP.SOIL_WARM && state.frost.consecutiveFrostFreeDays > 7) {
        toolsEvents.add(store, 'cultivation', 'mainPlanting', 'main vegetable planting can begin - beans, squash, cucumbers', 168);

        if (snowDepth === 0) {
            toolsEvents.add(store, 'cultivation', 'potatoPlanting', 'soil warming - potato planting can begin', 168);
        }
    }

    if (month === 5 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'cultivation', 'tenderPlanting', 'plant out tender crops - tomatoes, peppers, courgettes', 168);
        toolsEvents.add(store, 'cultivation', 'successionSowing', 'succession sow lettuce, radish, carrots every 2 weeks', 336);
    }

    // *** Summer Care (June-August) ***
    if (month === 5 && state.gdd.base5 > GDD.STRAWBERRY_FLOWER) {
        toolsEvents.add(store, 'cultivation', 'strawberryFlowering', 'strawberries flowering - protect from late frost', 72);
    }

    if (month === 6 && state.gdd.base5 > GDD.POTATO_FLOWER) {
        toolsEvents.add(store, 'cultivation', 'potatoFlowering', 'potatoes flowering - critical period for blight watch', 72);
    }

    if (month === 7 && state.gdd.base5 > GDD.RASPBERRY_RIPE) {
        toolsEvents.add(store, 'cultivation', 'raspberryHarvest', 'raspberries ripening - harvest daily', 168);
    }

    if (month === 8) {
        toolsEvents.add(store, 'cultivation', 'blackcurrantHarvest', 'blackcurrants ready for harvest', 168);
    }

    // *** Autumn (September-October) ***
    if (month === 8 && day >= 20) {
        toolsEvents.add(store, 'cultivation', 'earlyPotatoHarvest', 'early potatoes ready - maincrop in 2-3 weeks', 168);
    }

    if (month === 9) {
        toolsEvents.add(store, 'cultivation', 'winterVegPlanting', 'plant garlic and overwintering onions', 168);
        toolsEvents.add(store, 'cultivation', 'rootHarvest', 'harvest and store root vegetables before hard frost', 336);
    }

    // =====================================================================
    // GRAIN CROPS
    // =====================================================================

    if (month === 4 && temp > TEMP.GROWTH_MIN && state.gdd.base5 > GDD.SPRING_GRAIN_SOW) {
        toolsEvents.add(store, 'cultivation', 'springGrainSowing', 'spring grain sowing time (oats, barley)', 168);
    }

    if (month === 7 && state.gdd.base5 > GDD.GRAIN_FLOWER) {
        toolsEvents.add(store, 'cultivation', 'grainFlowering', 'grain crops flowering - avoid spraying', 72);
    }

    if (month === 8 && state.gdd.base5 > GDD.GRAIN_HARVEST && humidity < HUMIDITY.HIGH) {
        toolsEvents.add(store, 'cultivation', 'grainHarvest', 'grain harvest conditions approaching', 168);
    }

    // =====================================================================
    // PASTURE AND HAY
    // =====================================================================

    if (month === 4 && state.gdd.base5 > GDD.PASTURE_GROWTH) {
        toolsEvents.add(store, 'cultivation', 'pastureGrowth', 'pasture grass beginning rapid growth', 72);
    }

    if (month === 6 && state.gdd.base5 > GDD.HAY_FIRST_CUT && rainRate === 0 && humidity < HUMIDITY.HIGH) {
        toolsEvents.add(store, 'cultivation', 'firstHayCut', 'optimal first hay cutting conditions', 72);
    }

    if (month === 7 && day >= 20 && rainRate === 0) {
        toolsEvents.add(store, 'cultivation', 'secondHayCut', 'second hay cut timing', 72);
    }

    // =====================================================================
    // CURRENT CONDITIONS - Stress and Risks
    // =====================================================================

    // Water stress
    if (temp > TEMP.HEAT_STRESS_PLANTS && month >= 6 && month <= 8 && humidity < HUMIDITY.LOW) {
        results.phenomena.push('garden: water stress likely in shallow-rooted crops');
    }

    // Radiation frost risk
    if (temp > TEMP.FROST && temp < 3 && month >= 4 && month <= 5 && cloudCover !== undefined && cloudCover < 50) {
        results.phenomena.push('garden: radiation frost risk tonight - cover sensitive plants');
    }

    // Pollination conditions
    if (month === 5 && temp > TEMP.GROWTH_OPTIMAL && temp < TEMP.HEAT_STRESS_PLANTS && windSpeed < WIND.POLLINATION_MAX && rainRate === 0 && daylight?.isDaytime) {
        results.phenomena.push('garden: excellent pollination weather');
    }

    // Disease pressure
    if (temp > TEMP.GROWTH_OPTIMAL && humidity > HUMIDITY.BLIGHT_RISK && month >= 6 && month <= 8) {
        results.phenomena.push('garden: high disease pressure - check for blight, mildew');
    }

    // Slug activity
    if (humidity > HUMIDITY.VERY_HIGH && temp > TEMP.SOIL_WARM && temp < TEMP.INSECT_HIGH && (rainRate > 0 || !daylight?.isDaytime)) {
        results.phenomena.push('garden: high slug activity - protect seedlings');
    }

    // Ideal transplanting
    if (cloudCover !== undefined && cloudCover > 70 && temp > TEMP.SOIL_WARM && temp < TEMP.HEAT_STRESS_PLANTS && month >= 4 && month <= 8) {
        results.phenomena.push('garden: good transplanting conditions (overcast, mild)');
    }

    // Bolting risk
    if (month >= 5 && month <= 7 && daylight?.daylightHours > 16 && temp > 20) {
        results.phenomena.push('garden: long days may trigger bolting in lettuce, spinach');
    }

    // =====================================================================
    // LIVESTOCK
    // =====================================================================

    // Cold stress
    if (temp < TEMP.SEVERE_COLD_LIVESTOCK && windSpeed > WIND.LIGHT) {
        results.phenomena.push('livestock: severe cold stress - ensure shelter and unfrozen water');
    }

    // Heat stress
    if (temp > TEMP.HEAT_STRESS_LIVESTOCK && humidity > HUMIDITY.HIGH) {
        results.phenomena.push('livestock: heat stress risk - ensure shade and water access');
    }

    // Sheep shearing
    if (month === 4 && temp > TEMP.SOIL_WARM && rainRate === 0) {
        toolsEvents.add(store, 'cultivation', 'sheepShearing', 'sheep shearing weather - dry conditions', 72);
    }

    // Cattle to pasture
    if (month === 5 && temp > 12) {
        toolsEvents.add(store, 'cultivation', 'cattleToPassture', 'traditional time to move cattle to summer pastures', 72);
    }

    // Poultry lighting
    if (daylight?.daylightHours < 10 && month >= 10) {
        results.phenomena.push('poultry: supplemental lighting needed for egg production');
    }

    // =====================================================================
    // Output Events
    // =====================================================================

    toolsEvents
        .get(store, 'cultivation')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(`cultivation: ${event.message}`));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// FOREST: Wild Berries, Mushrooms, Trees, Forest Floor
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretForest({ results, situation, dataCurrent, weatherData, store }) {
    const { month, day, daylight } = situation;
    const { temp, humidity, snowDepth, windSpeed } = dataCurrent;
    const state = store.phenology;

    // Track moisture for mushrooms
    const recentRain = getRecentRainfall(weatherData, 7);
    state.foraging.mushroomMoisture = Math.max(0, Math.min(100, recentRain * 2));

    // =====================================================================
    // WILD BERRIES (Swedish specialties)
    // =====================================================================

    // *** Cloudberries (hjortron) - bog areas ***
    if (month === 5 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'forest', 'cloudberryFlower', 'cloudberries flowering in bog areas', 72);
    }
    if (month === 7 && day >= 20) {
        toolsEvents.add(store, 'forest', 'cloudberryRipe', 'cloudberries ripening - check wetland areas', 168);
    }

    // *** Bilberries (blåbär) - most abundant ***
    if (month === 6 && state.gdd.base5 > GDD.BILBERRY_FLOWER) {
        toolsEvents.add(store, 'forest', 'bilberryFlower', 'bilberries flowering in forest understory', 48);
    }
    if (month === 7 && state.gdd.base5 > GDD.BILBERRY_RIPE) {
        toolsEvents.add(store, 'forest', 'bilberryRipe', 'bilberries ripening - forest floors turning blue', 336);
    }
    if (month === 7 && day >= 15) {
        results.phenomena.push('foraging: bilberry season - bring a berry picker');
    }

    // *** Lingonberries (lingon) ***
    if (month === 8 && day >= 15) {
        toolsEvents.add(store, 'forest', 'lingonberryFirst', 'first lingonberries beginning to ripen', 168);
    }
    if (month === 9) {
        toolsEvents.add(store, 'forest', 'lingonberryPrime', 'lingonberry harvest at peak - traditional preserving time', 336);
    }

    // *** Wild raspberries (vilda hallon) ***
    if (month === 7 && temp > 18) {
        toolsEvents.add(store, 'forest', 'wildRaspberry', 'wild raspberries ripe in sunny forest edges', 168);
    }

    // *** Wild strawberries (smultron) ***
    if (month === 6 && temp > TEMP.GROWTH_OPTIMAL) {
        toolsEvents.add(store, 'forest', 'wildStrawberry', 'wild strawberries ripening in sunny clearings', 168);
    }

    // *** Rowan berries (rönnbär) ***
    if (month === 8 && day >= 15) {
        toolsEvents.add(store, 'forest', 'rowanBerries', 'rowan berries turning red - sign of approaching autumn', 168);
    }

    // *** Rosehips (nypon) ***
    if (month === 9 && temp < 15) {
        toolsEvents.add(store, 'forest', 'rosehips', 'rosehips ready for harvest - high in vitamin C', 336);
    }

    // =====================================================================
    // MUSHROOMS (major foraging in Swedish forests)
    // =====================================================================

    // *** Morels (murklor) - spring delicacy ***
    if (month === 4 && temp > TEMP.SOIL_WARM && state.foraging.mushroomMoisture > MOISTURE.MUSHROOM_MIN) {
        toolsEvents.add(store, 'forest', 'morelSeason', 'morel mushrooms emerging - check burned areas and south-facing slopes', 168);
    }

    // *** Chanterelles (kantareller) - most popular ***
    if (month === 6 && temp > TEMP.GROWTH_OPTIMAL && state.foraging.mushroomMoisture > MOISTURE.MUSHROOM_MIN + 10) {
        toolsEvents.add(store, 'forest', 'chanterelleEarly', 'early chanterelles appearing in mossy spruce forests', 72);
    }
    if (month === 7 && recentRain > 20 && temp > 12) {
        toolsEvents.add(store, 'forest', 'chanterellePrime', 'prime chanterelle season - abundant in forests', 336);
    }

    // *** Porcini/Ceps (karljohan) ***
    if (month === 7 && temp > TEMP.GROWTH_OPTIMAL && state.foraging.mushroomMoisture > MOISTURE.MUSHROOM_GOOD) {
        toolsEvents.add(store, 'forest', 'porciniStart', 'porcini mushrooms appearing - check pine and birch forests', 168);
    }
    if (month === 8 && recentRain > 30) {
        toolsEvents.add(store, 'forest', 'porciniPeak', 'peak porcini season - excellent foraging conditions', 336);
    }

    // *** Hedgehog mushrooms (blek taggsvamp) ***
    if (month === 8 && temp < 20 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'forest', 'hedgehogMushroom', 'hedgehog mushrooms abundant - easy to identify, no poisonous lookalikes', 336);
    }

    // *** Funnel chanterelles (trattkantareller) ***
    if (month === 9 && temp < 15 && recentRain > 20) {
        toolsEvents.add(store, 'forest', 'funnelChanterelle', 'funnel chanterelles in abundance - late season favorite', 336);
    }

    // *** Black trumpet (svart trumpetsvamp) ***
    if (month === 8 && state.foraging.mushroomMoisture > MOISTURE.MUSHROOM_GOOD) {
        toolsEvents.add(store, 'forest', 'blackTrumpet', 'black trumpet mushrooms in mossy beech/oak areas', 168);
    }

    // *** Matsutake (tallmusserong) - prized ***
    if (month === 9 && temp < 12 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'forest', 'matsutake', 'matsutake season in pine forests - aromatic prize', 168);
    }

    // Current mushroom conditions
    if (humidity > HUMIDITY.SATURATED && temp > TEMP.SOIL_WARM && temp < TEMP.INSECT_HIGH && month >= 7 && month <= 9) {
        results.phenomena.push('foraging: perfect mushroom growing conditions');
    }

    if (humidity > HUMIDITY.VERY_HIGH && !daylight?.isDaytime && month >= 7 && month <= 9) {
        results.phenomena.push('foraging: morning dew tomorrow good for mushroom spotting');
    }

    // =====================================================================
    // FOREST FLOWERS AND PLANTS
    // =====================================================================

    // *** Hepatica (blåsippa) - first forest flower ***
    if (month === 3 && temp > TEMP.GROWTH_MIN && snowDepth < SNOW.VERY_DEEP) {
        toolsEvents.add(store, 'forest', 'hepatica', 'hepatica (blåsippa) blooming - first forest flower', 72);
    }

    // *** Wood anemone (vitsippa) ***
    if (month === 4 && temp > TEMP.SOIL_COOL) {
        toolsEvents.add(store, 'forest', 'woodAnemone', 'wood anemones carpeting forest floor', 168);
    }

    // *** Lily of the valley (liljekonvalj) ***
    if (month === 5 && temp > 12) {
        toolsEvents.add(store, 'forest', 'lilyValley', 'lily of the valley blooming - fragrant but poisonous', 168);
    }

    // *** Lingonberry flowers ***
    if (month === 5 && state.gdd.base5 > 300) {
        toolsEvents.add(store, 'forest', 'lingonFlower', 'lingonberry flowers opening - bees very active', 72);
    }

    // *** Fireweed (mjölkört) ***
    if (month === 6 && temp > TEMP.GROWTH_OPTIMAL) {
        toolsEvents.add(store, 'forest', 'fireweed', 'fireweed blooming in clearings - excellent bee plant', 168);
    }

    // *** Heather (ljung) ***
    if (month === 7 && day >= 15) {
        toolsEvents.add(store, 'forest', 'heather', 'heather blooming on forest edges and bogs', 336);
    }

    // =====================================================================
    // TREE PHENOLOGY
    // =====================================================================

    // *** Birch sap (björksav) ***
    if (month === 2 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'forest', 'sapRising', 'birch sap rising - traditional tapping period', 168);
    }

    // *** Birch leaves ***
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'forest', 'birchLeafBurst', 'birch leaves emerging - "mouse ear" stage marks true spring', 72);
    }

    // *** Bird cherry (hägg) blooming ***
    if (month === 4 && temp > 12) {
        toolsEvents.add(store, 'forest', 'birdCherry', 'bird cherry blooming - traditionally signals "häggvinter" cold snap possible', 72);
    }

    // *** Spruce flowering ***
    if (month === 5 && temp > 15) {
        toolsEvents.add(store, 'forest', 'spruceFlower', 'spruce trees releasing pollen - yellow dust everywhere', 72);
    }

    // *** Autumn colors ***
    if (month === 9 && temp < TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'forest', 'autumnColors', 'autumn colors beginning - birches turning golden, aspens orange', 336);
    }

    // *** Leaf fall ***
    if (month === 10 && (windSpeed > WIND.MODERATE || temp < TEMP.GROWTH_MIN)) {
        results.phenomena.push('forest: leaves falling rapidly');
    }

    // =====================================================================
    // FOREST FLOOR CONDITIONS
    // =====================================================================

    // Fire risk
    if (month >= 5 && month <= 8 && recentRain < 5 && humidity < HUMIDITY.LOW) {
        results.phenomena.push('forest: fire risk HIGH - avoid open fires');
    } else if (month >= 5 && month <= 8 && recentRain < 15 && humidity < HUMIDITY.MODERATE) {
        results.phenomena.push('forest: fire risk moderate - be careful with fires');
    }

    // Forest scents
    if (temp > TEMP.INSECT_HIGH && humidity > HUMIDITY.MODERATE && month >= 6 && month <= 8 && daylight?.isDaytime) {
        results.phenomena.push('forest: warm humid air releasing pine and spruce resin scents');
    }

    if (recentRain > 10 && temp > TEMP.SOIL_WARM && month >= 7 && month <= 9) {
        results.phenomena.push('forest: petrichor and mushroom scent in the air');
    }

    // =====================================================================
    // Output Events
    // =====================================================================

    toolsEvents
        .get(store, 'forest')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(`forest: ${event.message}`));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// WILDLIFE: Mammals
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretMammals({ results, situation, dataCurrent, weatherData, store }) {
    const { month, hour, minutes, daylight } = situation;
    const { temp, windSpeed, snowDepth } = dataCurrent;
    const state = store.phenology;

    const timestamp = Date.now();
    const isDawnDusk = isDawnOrDusk(hour, minutes, daylight);

    // *** Pressure-based behavior ***
    const pressureTrend = getPressureTrend(weatherData, 3);
    if (pressureTrend !== undefined && pressureTrend < -PRESSURE.CHANGE_SIGNIFICANT) {
        state.wildlife.lastPressureDrop = timestamp;
        results.phenomena.push('wildlife: animals feeding actively before weather change');
    }

    if (state.wildlife.lastPressureDrop && timestamp - state.wildlife.lastPressureDrop < 6 * 3600000) {
        results.phenomena.push('wildlife: increased activity before approaching weather front');
    }

    // =====================================================================
    // MOOSE (älg) - Iconic Swedish animal
    // =====================================================================

    if (isDawnDusk && temp > -10 && temp < 20 && windSpeed < WIND.LIGHT) {
        // Rate limit moose warnings
        if (!state.wildlife.lastMooseWarning || timestamp - state.wildlife.lastMooseWarning > 6 * 3600000) {
            results.phenomena.push('wildlife: moose most active now - drive carefully');
            state.wildlife.lastMooseWarning = timestamp;
        }
    }

    if (month >= 8 && month <= 10) {
        toolsEvents.add(store, 'wildlife', 'mooseRut', 'moose rutting season - bulls aggressive and unpredictable', 720);
    }

    if (month >= 5 && month <= 6) {
        toolsEvents.add(store, 'wildlife', 'mooseCalving', 'moose calving season - give cows wide berth', 336);
    }

    if (snowDepth > SNOW.VERY_DEEP && temp < -15) {
        results.phenomena.push('wildlife: moose yarding in sheltered areas - deep snow limits movement');
    }

    // =====================================================================
    // DEER (rådjur - roe deer, and occasional red deer)
    // =====================================================================

    if ((hour >= HOURS.DAWN_START && hour <= HOURS.DAWN_END) || (hour >= HOURS.DUSK_START && hour <= HOURS.DUSK_END)) {
        if (temp > -5 && windSpeed < WIND.LIGHT) {
            results.phenomena.push('wildlife: roe deer grazing in forest edges and meadows');
        }
    }

    if (month === 7 || month === 8) {
        toolsEvents.add(store, 'wildlife', 'roeDeerRut', 'roe deer rutting season - bucks chasing does', 720);
    }

    if (month >= 4 && month <= 5) {
        toolsEvents.add(store, 'wildlife', 'roeDeerFawns', 'roe deer fawns being born - leave "abandoned" fawns alone, mother is nearby', 336);
    }

    // =====================================================================
    // LYNX (lodjur)
    // =====================================================================

    if (month >= 2 && month <= 3) {
        toolsEvents.add(store, 'wildlife', 'lynxMating', 'lynx mating season - eerie calls may be heard at night', 168);
    }

    if (snowDepth > SNOW.MODERATE && temp < -5) {
        results.phenomena.push('wildlife: lynx hunting advantage in deep snow - look for tracks');
    }

    if (month >= 5 && month <= 6) {
        toolsEvents.add(store, 'wildlife', 'lynxKittens', 'lynx kitten season - females with young are secretive', 336);
    }

    // =====================================================================
    // WOLF (varg)
    // =====================================================================

    if (snowDepth > SNOW.WOLF_HUNTING_CHANGE && temp < -5) {
        results.phenomena.push('wildlife: wolf pack hunting patterns change - following prey in deep snow');
    }

    if (month >= 1 && month <= 3) {
        toolsEvents.add(store, 'wildlife', 'wolfMating', 'wolf mating season - increased howling', 168);
    }

    if (month >= 4 && month <= 5) {
        toolsEvents.add(store, 'wildlife', 'wolfPups', 'wolf pup season - packs centered on den sites', 336);
    }

    // =====================================================================
    // FOX (räv - red fox)
    // =====================================================================

    if (month >= 0 && month <= 2) {
        toolsEvents.add(store, 'wildlife', 'foxMating', 'fox mating season - screaming calls at night', 168);
    }

    if (!daylight?.isDaytime && temp > -10) {
        results.phenomena.push('wildlife: foxes hunting in twilight and darkness');
    }

    if (month >= 3 && month <= 4) {
        toolsEvents.add(store, 'wildlife', 'foxCubs', 'fox cubs emerging from dens - playful at dusk', 336);
    }

    // =====================================================================
    // SQUIRREL (ekorre - red squirrel, native)
    // =====================================================================

    if (daylight?.isDaytime && temp > -5 && temp < 20) {
        if (hour >= 7 && hour <= 17) {
            // Most active mid-morning and mid-afternoon
            if ((hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16)) {
                results.phenomena.push('wildlife: squirrels most active - foraging in trees');
            }
        }
    }

    if (month >= 9 && month <= 10) {
        toolsEvents.add(store, 'wildlife', 'squirrelCaching', 'squirrels caching food for winter - very busy', 336);
    }

    if (month >= 1 && month <= 3) {
        toolsEvents.add(store, 'wildlife', 'squirrelMating', 'squirrel mating chases - acrobatic displays in treetops', 168);
    }

    if (month >= 7 && month <= 8) {
        results.phenomena.push('wildlife: squirrels feeding on spruce cones and mushrooms');
    }

    // =====================================================================
    // BADGER (grävling)
    // =====================================================================

    if (!daylight?.isDaytime && temp > TEMP.GROWTH_MIN && month >= 3 && month <= 10) {
        results.phenomena.push('wildlife: badgers foraging at night - listen for snuffling');
    }

    if (month === 2 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'wildlife', 'badgerEmerge', 'badgers emerging from winter torpor', 72);
    }

    // =====================================================================
    // HEDGEHOG (igelkott)
    // =====================================================================

    if (!daylight?.isDaytime && temp > TEMP.SOIL_WARM && month >= 5 && month <= 9) {
        results.phenomena.push('wildlife: hedgehogs active at night - check before mowing');
    }

    if (month === 4 && temp > TEMP.SOIL_COOL) {
        toolsEvents.add(store, 'wildlife', 'hedgehogWake', 'hedgehogs waking from hibernation - need food and water', 168);
    }

    if (month === 10 && temp < TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'wildlife', 'hedgehogNest', 'hedgehogs seeking hibernation sites - leave leaf piles for them', 168);
    }

    // =====================================================================
    // HARE (hare - mountain hare, and brown hare)
    // =====================================================================

    if (month >= 2 && month <= 4) {
        toolsEvents.add(store, 'wildlife', 'hareMating', 'hare "mad March" boxing behavior', 168);
    }

    if (snowDepth > SNOW.LIGHT_COVER && month >= 11) {
        results.phenomena.push('wildlife: mountain hares turning white for winter camouflage');
    }

    // =====================================================================
    // BEAVER (bäver)
    // =====================================================================

    if (month === 9 || month === 10) {
        toolsEvents.add(store, 'wildlife', 'beaverActive', 'beavers preparing for winter - dam building activity high', 336);
    }

    if (!daylight?.isDaytime && temp > TEMP.FROST && month >= 4 && month <= 10) {
        results.phenomena.push('wildlife: beavers active at dusk near waterways');
    }

    // =====================================================================
    // BAT (fladdermus)
    // =====================================================================

    if (month >= 5 && month <= 9 && temp > TEMP.INSECT_LOW) {
        if (hour >= HOURS.BAT_START || hour <= HOURS.BAT_END) {
            results.phenomena.push('wildlife: bats hunting insects in twilight');
        }
    }

    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'wildlife', 'batEmerge', 'bats emerging from hibernation', 72);
    }

    if (month === 8) {
        toolsEvents.add(store, 'wildlife', 'batSwarming', 'bats swarming at roost sites - mating season', 168);
    }

    // =====================================================================
    // BEAR (björn) - present in Värmland forests
    // =====================================================================

    if (month === 3 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'wildlife', 'bearEmerge', 'bears emerging from hibernation - be alert, they are hungry', 168);
    }

    if (month >= 7 && month <= 9) {
        toolsEvents.add(store, 'wildlife', 'bearBerry', 'bears feeding heavily on berries - make noise when foraging', 720);
    }

    if (month === 10 && temp < TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'wildlife', 'bearDenning', 'bears seeking dens - hyperphagia (intense feeding)', 168);
    }

    // =====================================================================
    // Output Events
    // =====================================================================

    toolsEvents
        .get(store, 'wildlife')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(`wildlife: ${event.message}`));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// BIRDS: Resident and Migratory Species
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretBirds({ results, situation, dataCurrent, weatherData, store }) {
    const { month, hour, daylight } = situation;
    const { temp, pressure, windSpeed, snowDepth, rainRate } = dataCurrent;

    const pressureTrend = getPressureTrend(weatherData, 3);

    // =====================================================================
    // DAWN CHORUS
    // =====================================================================

    if (month >= 4 && month <= 6 && hour >= HOURS.CHORUS_START && hour <= HOURS.CHORUS_END && temp > TEMP.GROWTH_MIN) {
        results.phenomena.push('birds: dawn chorus at peak - dozens of species singing');
    }

    // =====================================================================
    // MIGRATION - Spring arrivals
    // =====================================================================

    // *** Cranes (tranor) ***
    if (month === 3 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'birds', 'craneArrival', 'cranes returning - listen for trumpeting calls overhead', 168);
    }

    // *** Swallows and swifts ***
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'birds', 'swallowArrival', 'swallows and house martins arriving - summer is near', 168);
    }

    if (month === 5 && temp > TEMP.GROWTH_OPTIMAL) {
        toolsEvents.add(store, 'birds', 'swiftArrival', 'swifts screaming through the skies - last migrants to arrive', 72);
    }

    // *** Cuckoo ***
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'birds', 'cuckooArrival', 'listen for first cuckoo - traditional spring marker', 168);
    }

    // *** Warblers and flycatchers ***
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'birds', 'songbirdReturn', 'migratory songbirds returning - woods filling with song', 168);
    }

    // =====================================================================
    // MIGRATION - Autumn departures
    // =====================================================================

    if (month === 9 && pressure > PRESSURE.NORMAL) {
        toolsEvents.add(store, 'birds', 'craneMigration', 'crane migration southward - large V-formations visible', 336);
    }

    if (month === 8 && temp < 20) {
        toolsEvents.add(store, 'birds', 'swiftDeparture', 'swifts departing - one of first to leave', 168);
    }

    if (month === 9 && pressureTrend > 0) {
        results.phenomena.push('birds: high pressure favoring migration - watch for flocks heading south');
    }

    // =====================================================================
    // GAME BIRDS
    // =====================================================================

    // *** Capercaillie (tjäder) ***
    if (month === 4 && hour >= 3 && hour <= 6 && temp > TEMP.FROST) {
        toolsEvents.add(store, 'birds', 'capercaillieLek', 'capercaillie lekking - dawn displays in old-growth forest', 168);
    }

    // *** Black grouse (orre) ***
    if (month === 4 && hour >= 4 && hour <= 7) {
        toolsEvents.add(store, 'birds', 'blackGrouseLek', 'black grouse lekking on forest bogs - bubbling calls', 168);
    }

    // *** Hazel grouse (järpe) ***
    if (month === 9 && hour >= 6 && hour <= 10) {
        toolsEvents.add(store, 'birds', 'hazelGrouse', 'hazel grouse whistling in dense forest', 168);
    }

    // =====================================================================
    // WOODPECKERS
    // =====================================================================

    if (month === 3 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'birds', 'woodpeckerDrumming', 'woodpeckers drumming to establish territories', 72);
    }

    if (month >= 4 && month <= 6 && daylight?.isDaytime) {
        results.phenomena.push('birds: woodpeckers excavating nest holes');
    }

    if (month >= 11 || month <= 2) {
        results.phenomena.push('birds: woodpeckers visit feeders and suet in winter');
    }

    // =====================================================================
    // OWLS
    // =====================================================================

    if (month >= 1 && month <= 3 && !daylight?.isDaytime) {
        toolsEvents.add(store, 'birds', 'owlCalling', 'owl courtship calls - tawny owl hooting, pygmy owl whistling', 168);
    }

    if (!daylight?.isDaytime && temp > -15 && windSpeed < WIND.MODERATE) {
        results.phenomena.push('birds: owls hunting - listen for calls');
    }

    // =====================================================================
    // WATERBIRDS
    // =====================================================================

    // *** Swans (svan) ***
    if (month === 3 && temp > TEMP.FROST) {
        toolsEvents.add(store, 'birds', 'swanReturn', 'whooper swans returning to lakes', 168);
    }

    // *** Geese ***
    if (month === 4 || month === 9) {
        if (pressureTrend > 0) {
            results.phenomena.push('birds: goose flocks migrating overhead');
        }
    }

    // *** Ducks ***
    if (month === 4 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'birds', 'duckCourtship', 'duck courtship displays on lakes', 168);
    }

    // *** Loons/Divers (lom) ***
    if (month === 4 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'birds', 'loonArrival', 'black-throated divers arriving at lakes - haunting calls', 168);
    }

    // *** Great crested grebe ***
    if (month === 4 && temp > TEMP.SOIL_COOL) {
        toolsEvents.add(store, 'birds', 'grebeDisplay', 'great crested grebe courtship dances on lakes', 168);
    }

    // =====================================================================
    // RAPTORS
    // =====================================================================

    // *** White-tailed eagle (havsörn) ***
    if (month === 2) {
        toolsEvents.add(store, 'birds', 'eagleNesting', 'white-tailed eagles building/repairing nests', 168);
    }

    // *** Osprey (fiskgjuse) ***
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'birds', 'ospreyArrival', 'ospreys returning to nest platforms', 168);
    }

    // *** Buzzard (ormvråk) ***
    if (month === 3 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'birds', 'buzzardDisplay', 'buzzards soaring and displaying over territories', 72);
    }

    // *** Goshawk (duvhök) ***
    if (month === 3) {
        toolsEvents.add(store, 'birds', 'goshawkDisplay', 'goshawk sky-dance display over forests', 72);
    }

    // =====================================================================
    // COMMON GARDEN/FEEDER BIRDS
    // =====================================================================

    if (month >= 11 || month <= 2) {
        // Winter feeding activity
        if (temp < TEMP.FROST && snowDepth > SNOW.LIGHT_COVER) {
            results.phenomena.push('birds: high feeder activity - tits, nuthatches, and finches hungry');
        }

        // Waxwings
        if (month >= 11 && month <= 1) {
            toolsEvents.add(store, 'birds', 'waxwings', 'watch for waxwing flocks on rowan and apple trees', 336);
        }

        // Crossbills
        results.phenomena.push('birds: crossbills feeding on spruce cones');
    }

    // Nesting season warnings
    if (month >= 4 && month <= 7) {
        results.phenomena.push('birds: nesting season - minimize disturbance, keep cats indoors');
    }

    // =====================================================================
    // CORVIDS (crows, ravens, jays)
    // =====================================================================

    if (month === 2 || month === 3) {
        toolsEvents.add(store, 'birds', 'ravenDisplay', 'ravens performing aerial courtship rolls', 72);
    }

    if (month >= 9 && month <= 10) {
        results.phenomena.push('birds: jays caching acorns - important forest regeneration');
    }

    // =====================================================================
    // Weather-related behavior
    // =====================================================================

    if (pressureTrend !== undefined && pressureTrend < -PRESSURE.CHANGE_RAPID) {
        results.phenomena.push('birds: feeding frantically before storm');
    }

    if (rainRate > 0 && temp > TEMP.SOIL_WARM) {
        results.phenomena.push('birds: thrushes hunting worms after rain');
    }

    // =====================================================================
    // Output Events
    // =====================================================================

    toolsEvents
        .get(store, 'birds')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(`birds: ${event.message}`));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// AQUATIC: Lake Ecology, Fish, Amphibians
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAquatic({ results, situation, dataCurrent, weatherData, store }) {
    const { month, hour, daylight } = situation;
    const { temp, pressure, windSpeed, humidity, rainRate } = dataCurrent;
    const state = store.phenology;

    const pressureTrend = getPressureTrend(weatherData, 3);

    // Estimate lake temperature (lags air temp by weeks)
    if (temp !== undefined) {
        const lagFactor = 0.1; // Lake temp changes slowly
        state.lake.estimatedTemp = state.lake.estimatedTemp === undefined ? temp - 5 : state.lake.estimatedTemp + (temp - state.lake.estimatedTemp) * lagFactor; // Start estimate cooler than air
    }

    // =====================================================================
    // LAKE CONDITIONS
    // =====================================================================

    // *** Ice formation/breakup ***
    if (month >= 10 && temp < -5 && windSpeed < WIND.LIGHT) {
        if (state.lake.iceStatus !== 'forming') {
            toolsEvents.add(store, 'lake', 'lakeFreeze', 'lake ice beginning to form - stay off until thick enough', 168);
            state.lake.iceStatus = 'forming';
        }
    }

    if (month >= 11 && temp < -10 && state.lake.iceStatus === 'forming') {
        toolsEvents.add(store, 'lake', 'iceSafe', 'ice thickening - check locally before walking', 168);
        state.lake.iceStatus = 'frozen';
    }

    if (month === 3 && temp > TEMP.GROWTH_MIN) {
        if (state.lake.iceStatus === 'frozen') {
            toolsEvents.add(store, 'lake', 'iceBreakup', 'lake ice weakening - DANGEROUS, stay off', 168);
            state.lake.iceStatus = 'breaking';
        }
    }

    if (month === 4 && temp > TEMP.SOIL_WARM) {
        state.lake.iceStatus = 'open';
    }

    // *** Algae blooms ***
    if (month >= 6 && month <= 8 && temp > 20 && windSpeed < WIND.LIGHT) {
        results.phenomena.push('lake: conditions favor algae growth - check before swimming');
    }

    // *** Swimming conditions ***
    if (month >= 6 && month <= 8 && state.lake.estimatedTemp > 18 && windSpeed < WIND.MODERATE) {
        results.phenomena.push('lake: pleasant swimming temperature');
    }

    // *** Turnover ***
    if (month === 4 && temp > TEMP.SOIL_COOL && temp < 12) {
        toolsEvents.add(store, 'lake', 'springTurnover', 'lake spring turnover - oxygen mixing throughout', 168);
    }

    if (month === 10 && temp < 10 && temp > TEMP.FROST) {
        toolsEvents.add(store, 'lake', 'fallTurnover', 'lake fall turnover - fish moving to new depths', 168);
    }

    // =====================================================================
    // FISH - Carp (specific to your lake)
    // =====================================================================

    if (state.lake.estimatedTemp > TEMP.CARP_ACTIVE && month >= 5 && month <= 9) {
        results.phenomena.push('fish: carp active in warm shallows');
    }

    if (month === 5 && state.lake.estimatedTemp > 18) {
        toolsEvents.add(store, 'fish', 'carpSpawning', 'carp spawning in shallow weedy areas - splashing visible', 168);
    }

    if (month >= 6 && month <= 8 && hour >= HOURS.FISH_EVENING_START && temp > 20 && windSpeed < WIND.LIGHT) {
        results.phenomena.push('fish: carp surface feeding in evening - watch for bubbles and swirls');
    }

    // =====================================================================
    // FISH - Pike (gädda)
    // =====================================================================

    if (month === 3 && state.lake.estimatedTemp > TEMP.PIKE_SPAWN) {
        toolsEvents.add(store, 'fish', 'pikeSpawning', 'pike moving to shallow bays for spawning', 168);
    }

    if (month >= 4 && month <= 5) {
        toolsEvents.add(store, 'fish', 'pikePostSpawn', 'pike recovering in shallows - good fishing', 336);
    }

    if (month >= 9 && month <= 11 && state.lake.estimatedTemp < 15) {
        results.phenomena.push('fish: pike feeding heavily before winter - excellent fishing');
    }

    // =====================================================================
    // FISH - Perch (abborre)
    // =====================================================================

    if (month === 4 && state.lake.estimatedTemp > TEMP.PERCH_SPAWN) {
        toolsEvents.add(store, 'fish', 'perchSpawning', 'perch spawning around submerged vegetation', 72);
    }

    if (month >= 6 && month <= 8 && daylight?.isDaytime) {
        results.phenomena.push('fish: perch schooling around structures - look for diving birds');
    }

    // =====================================================================
    // FISH - Trout (if present)
    // =====================================================================

    if (state.lake.estimatedTemp > TEMP.TROUT_STRESS && month >= 7 && month <= 8) {
        results.phenomena.push('fish: trout stressed by warm water - seek cool springs and depths');
    }

    if (month >= 9 && month <= 11 && state.lake.estimatedTemp < TEMP.GROWTH_OPTIMAL) {
        toolsEvents.add(store, 'fish', 'troutSpawning', 'brown trout moving to spawning streams', 336);
    }

    // =====================================================================
    // GENERAL FISHING CONDITIONS
    // =====================================================================

    if (pressure > PRESSURE.FISHING_OPTIMAL_LOW && pressure < PRESSURE.FISHING_OPTIMAL_HIGH && windSpeed < WIND.LIGHT) {
        if ((hour >= HOURS.FISH_MORNING_START && hour <= HOURS.FISH_MORNING_END) || (hour >= HOURS.FISH_EVENING_START && hour <= HOURS.FISH_EVENING_END)) {
            results.phenomena.push('fishing: excellent conditions (stable pressure, light wind)');
        }
    }

    if (pressureTrend !== undefined && pressureTrend < -PRESSURE.CHANGE_SIGNIFICANT) {
        results.phenomena.push('fishing: fish feeding actively before pressure drop');
    }

    if (pressureTrend !== undefined && pressureTrend > PRESSURE.CHANGE_SIGNIFICANT) {
        results.phenomena.push('fishing: fish may be sluggish after pressure rise');
    }

    // Insect hatches affect fishing
    if (month >= 5 && month <= 8 && temp > TEMP.GROWTH_OPTIMAL && temp < 25 && hour >= 17 && hour <= 21 && windSpeed < WIND.LIGHT) {
        results.phenomena.push('fishing: evening insect hatch likely - fish rising');
    }

    // =====================================================================
    // AMPHIBIANS
    // =====================================================================

    // *** Frog migration and spawning ***
    if (month === 3 && temp > TEMP.GROWTH_MIN && (rainRate > 0 || humidity > HUMIDITY.VERY_HIGH)) {
        toolsEvents.add(store, 'amphibians', 'frogMigration', 'frogs migrating to breeding ponds - watch for road crossings', 72);
    }

    if (month === 4 && temp > TEMP.SOIL_COOL) {
        toolsEvents.add(store, 'amphibians', 'frogSpawn', 'frog spawn in ponds and lake shallows', 168);
    }

    // *** Toad migration ***
    if (month === 4 && temp > TEMP.SOIL_COOL && (rainRate > 0 || humidity > HUMIDITY.HIGH)) {
        toolsEvents.add(store, 'amphibians', 'toadMigration', 'toads migrating to breeding sites - especially after dusk rain', 72);
    }

    // *** Frog chorus ***
    if (month >= 4 && month <= 6 && !daylight?.isDaytime && temp > TEMP.SOIL_WARM) {
        results.phenomena.push('amphibians: frog chorus from wetlands and lake edges');
    }

    // *** Newts ***
    if (month === 4 && temp > TEMP.SOIL_COOL) {
        toolsEvents.add(store, 'amphibians', 'newtBreeding', 'newts in breeding ponds - males displaying crests', 168);
    }

    // =====================================================================
    // REPTILES
    // =====================================================================

    // *** Grass snake (snok) ***
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'reptiles', 'snakeEmerge', 'grass snakes emerging from hibernation - often near water', 168);
    }

    if (month >= 5 && month <= 8 && temp > TEMP.INSECT_HIGH && daylight?.isDaytime) {
        results.phenomena.push('reptiles: grass snakes basking and hunting frogs near lake');
    }

    if (month === 7) {
        toolsEvents.add(store, 'reptiles', 'snakeEggs', 'grass snakes laying eggs in warm compost/manure heaps', 168);
    }

    // *** Adder (huggorm) - caution ***
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'reptiles', 'adderEmerge', 'adders emerging - watch where you step in sunny spots', 168);
    }

    if (temp > TEMP.INSECT_HIGH && month >= 4 && month <= 9) {
        results.phenomena.push('reptiles: adders may be basking - be aware in rocky, sunny areas');
    }

    // *** Slow worm (kopparödla - actually a legless lizard) ***
    if (month >= 4 && month <= 9 && temp > TEMP.GROWTH_OPTIMAL && humidity > HUMIDITY.HIGH) {
        results.phenomena.push('reptiles: slow worms active under logs and in compost');
    }

    // =====================================================================
    // Output Events
    // =====================================================================

    toolsEvents
        .get(store, 'lake')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(`lake: ${event.message}`));

    toolsEvents
        .get(store, 'fish')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(`fish: ${event.message}`));

    toolsEvents
        .get(store, 'amphibians')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(`amphibians: ${event.message}`));

    toolsEvents
        .get(store, 'reptiles')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(`reptiles: ${event.message}`));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// INVERTEBRATES: Insects, Pollinators, Pests, Arachnids
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretInvertebrates({ results, situation, dataCurrent, store }) {
    const { month, hour, daylight } = situation;
    const { temp, humidity, windSpeed, rainRate } = dataCurrent;
    const state = store.phenology;

    // Update insect activity level
    if (temp < TEMP.INSECT_DORMANT) {
        state.wildlife.insectActivityLevel = 'dormant';
    } else if (temp < TEMP.INSECT_LOW) {
        state.wildlife.insectActivityLevel = 'low';
    } else if (temp < TEMP.INSECT_MODERATE) {
        state.wildlife.insectActivityLevel = 'moderate';
    } else {
        state.wildlife.insectActivityLevel = 'high';
    }

    // =====================================================================
    // POLLINATORS
    // =====================================================================

    // *** Bumblebee queens ***
    if (month === 3 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'insects', 'bumblebeeQueens', 'bumblebee queens emerging - first pollinators active', 72);
    }

    // *** Honeybees ***
    if (temp > TEMP.INSECT_LOW && temp < 35 && windSpeed < WIND.MODERATE && rainRate === 0 && daylight?.isDaytime) {
        if (month >= 4 && month <= 9) {
            results.phenomena.push('insects: bees actively foraging');
        }
    }

    if (month === 5 && temp > TEMP.INSECT_MODERATE) {
        toolsEvents.add(store, 'insects', 'beeSwarm', 'bee swarming season - watch for clusters on branches', 336);
    }

    // *** Butterflies ***
    if (month === 3 && temp > TEMP.SOIL_WARM && daylight?.isDaytime) {
        toolsEvents.add(store, 'insects', 'firstButterflies', 'first butterflies emerging - brimstone, peacock, tortoiseshell', 72);
    }

    if (month >= 6 && month <= 8 && temp > TEMP.INSECT_MODERATE && daylight?.isDaytime) {
        results.phenomena.push('insects: peak butterfly activity');
    }

    // *** Hoverflies ***
    if (month >= 5 && month <= 9 && temp > TEMP.GROWTH_OPTIMAL && daylight?.isDaytime) {
        results.phenomena.push('insects: hoverflies active - important pollinators, hover in place');
    }

    // Pollination conditions
    if (month >= 5 && month <= 8 && temp > TEMP.GROWTH_OPTIMAL && humidity > HUMIDITY.MODERATE && windSpeed < WIND.POLLINATION_MAX) {
        if (daylight?.isDaytime && state.wildlife.insectActivityLevel !== 'dormant') {
            results.phenomena.push('insects: ideal pollination conditions');
        }
    }

    // =====================================================================
    // MOSQUITOES
    // =====================================================================

    if (temp > TEMP.MOSQUITO_ACTIVE && month >= 5 && month <= 9) {
        if (humidity > HUMIDITY.MODERATE && windSpeed < WIND.MOSQUITO_SUPPRESS) {
            results.phenomena.push('insects: mosquito activity likely');

            if (hour >= HOURS.MOSQUITO_EVENING_START || hour <= HOURS.MOSQUITO_NIGHT_END) {
                results.phenomena.push('insects: peak mosquito activity time - use repellent');
            }
        }
    }

    if (month === 5 && humidity > HUMIDITY.MODERATE && temp > TEMP.GROWTH_OPTIMAL) {
        toolsEvents.add(store, 'insects', 'mosquitoHatch', 'mosquito hatching beginning - prepare defenses', 168);
    }

    // *** Midges (knott) ***
    if (month >= 5 && month <= 8 && humidity > HUMIDITY.HIGH && windSpeed < WIND.CALM && (hour >= 17 || hour <= 9)) {
        results.phenomena.push('insects: midge swarms likely near water');
    }

    // =====================================================================
    // TICKS (fästingar) - Important health concern
    // =====================================================================

    if (temp > TEMP.TICK_ACTIVE && month >= 3 && month <= 11) {
        if (humidity > HUMIDITY.TICK_FAVORABLE || rainRate > 0) {
            results.phenomena.push('insects: high tick activity - check yourself after outdoor activities');
        } else if (humidity > HUMIDITY.MODERATE) {
            results.phenomena.push('insects: moderate tick activity - stay on paths');
        }
    }

    if (month === 4 && temp > TEMP.SOIL_COOL) {
        toolsEvents.add(store, 'insects', 'tickPeak', 'tick season beginning - nymph activity increasing', 168);
    }

    // =====================================================================
    // WASPS AND HORNETS
    // =====================================================================

    if (month === 4 && temp > TEMP.INSECT_LOW) {
        toolsEvents.add(store, 'insects', 'waspQueens', 'wasp queens seeking nest sites', 168);
    }

    if (month >= 8 && month <= 9 && temp > TEMP.GROWTH_OPTIMAL) {
        results.phenomena.push('insects: wasps aggressive - colonies at peak, seeking sugar');
    }

    // =====================================================================
    // DRAGONFLIES AND DAMSELFLIES
    // =====================================================================

    if (month === 5 && temp > TEMP.GROWTH_OPTIMAL) {
        toolsEvents.add(store, 'insects', 'dragonflyEmerge', 'dragonflies emerging from lake - watch for empty cases on reeds', 168);
    }

    if (month >= 6 && month <= 8 && temp > TEMP.INSECT_MODERATE && daylight?.isDaytime) {
        results.phenomena.push('insects: dragonflies patrolling - excellent mosquito predators');
    }

    // =====================================================================
    // FIREFLIES (rare in Sweden but present)
    // =====================================================================

    if (month >= 6 && month <= 7 && !daylight?.isDaytime && temp > TEMP.GROWTH_OPTIMAL && humidity > HUMIDITY.HIGH) {
        results.phenomena.push('insects: firefly season - watch for glowing females in grass');
    }

    // =====================================================================
    // BENEFICIAL AND PEST INSECTS
    // =====================================================================

    // *** Ladybugs ***
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'insects', 'ladybugWake', 'ladybugs emerging - aphid control starting', 72);
    }

    // *** Aphids ***
    if (month >= 5 && month <= 8 && temp > TEMP.GROWTH_OPTIMAL && humidity < HUMIDITY.MODERATE) {
        results.phenomena.push('garden: watch for aphid buildup on tender shoots');
    }

    // *** Ants ***
    if (month === 7 && temp > 20 && humidity > HUMIDITY.HIGH) {
        results.phenomena.push('insects: flying ant day conditions - watch for swarms');
    }

    // *** Cockchafer (maybug) ***
    if (month === 5 && temp > TEMP.GROWTH_OPTIMAL && !daylight?.isDaytime) {
        toolsEvents.add(store, 'insects', 'cockchafer', 'cockchafer (maybug) flight - bumbling around lights', 168);
    }

    // =====================================================================
    // Output Events
    // =====================================================================

    toolsEvents
        .get(store, 'insects')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(`insects: ${event.message}`));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// CALENDAR: Traditional Markers and Phenological Indicators
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCalendar({ results, situation, dataCurrent, store }) {
    const { month, day, daylight } = situation;
    const { temp, humidity, snowDepth, rainRate } = dataCurrent;
    const state = store.phenology;

    // =====================================================================
    // TRADITIONAL SWEDISH CALENDAR DAYS
    // =====================================================================

    // *** Spring markers ***
    if (month === 2 && day === 2) {
        if (temp > TEMP.FROST && rainRate > 0) {
            results.phenomena.push('calendar: Candlemas thaw - "better a wolf in the stable than a warm Candlemas"');
        } else if (temp < -5) {
            results.phenomena.push('calendar: cold Candlemas - traditionally means early spring');
        }
    }

    if (month === 2 && day === 24) {
        toolsEvents.add(store, 'calendar', 'stMatthias', 'St. Matthias Day - "Matthias breaks the ice, if he finds any"', 24);
    }

    if (month === 3 && day === 25) {
        toolsEvents.add(store, 'calendar', 'ladyDay', 'Vårfrudagen (Lady Day) - traditional start of spring farm work', 24);
    }

    if (month === 4 && day === 30) {
        toolsEvents.add(store, 'calendar', 'walpurgis', 'Valborgsafton (Walpurgis Night) - welcoming spring with bonfires', 24);
    }

    // *** Summer markers ***
    if (month === 5 && day === 25) {
        toolsEvents.add(store, 'calendar', 'urbanDay', 'Urban\'s Day - "what weather Urban gives, stays for three weeks"', 24);
    }

    if (month === 6 && day === 8) {
        if (temp > 20) {
            results.phenomena.push('calendar: St. Medardus warm - "as Medardus, so 40 days after"');
        }
    }

    if (month === 6 && day >= 19 && day <= 26 && daylight?.daylightHours > 18) {
        toolsEvents.add(store, 'calendar', 'midsummer', 'Midsommar period - peak of light, traditional celebrations', 168);
    }

    // *** Autumn markers ***
    if (month === 7 && day === 29) {
        toolsEvents.add(store, 'calendar', 'olofsDay', "Olof's Day - traditional harvest weather prediction", 24);
    }

    if (month === 8 && day === 24) {
        toolsEvents.add(store, 'calendar', 'bartholDay', 'Bartholomew\'s Day - "autumn shows its intentions"', 24);
    }

    if (month === 9 && day === 29) {
        toolsEvents.add(store, 'calendar', 'michaelmas', 'Michaelmas - traditional end of harvest season', 24);
    }

    // *** Winter markers ***
    if (month === 10 && day === 14) {
        toolsEvents.add(store, 'calendar', 'winterNights', 'Winter Nights - old Norse calendar winter beginning', 24);
    }

    if (month === 11 && day === 11) {
        toolsEvents.add(store, 'calendar', 'martinmas', 'St. Martin\'s Day - "Martin\'s geese" weather prediction', 24);
    }

    if (month === 11 && day === 13) {
        toolsEvents.add(store, 'calendar', 'lucia', 'Lucia preparations - darkest time before the light returns', 24);
    }

    if (month === 11 && day === 30) {
        toolsEvents.add(store, 'calendar', 'stAndrew', "St. Andrew's Day - traditional start of Christmas season", 24);
    }

    // =====================================================================
    // NATURAL PHENOLOGICAL MARKERS
    // =====================================================================

    // *** Ice breakup ***
    if (month === 3 && temp > TEMP.GROWTH_MIN) {
        if (toolsEvents.isCooldown(store, 'calendar', 'iceBreakup', 300)) {
            toolsEvents.add(store, 'calendar', 'iceBreakup', 'lake ice breaking up - "islossning" marks true spring arrival', 168);
        }
    }

    // *** First flowers ***
    if (month === 3 && temp > TEMP.GROWTH_MIN && snowDepth < SNOW.MODERATE) {
        if (toolsEvents.isCooldown(store, 'calendar', 'coltsfoot', 300)) {
            toolsEvents.add(store, 'calendar', 'coltsfoot', 'tussilago (coltsfoot) blooming - first flower of spring', 72);
        }
    }

    // *** Birch leaf phenology ***
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        if (toolsEvents.isCooldown(store, 'calendar', 'birchLeaf', 300)) {
            toolsEvents.add(store, 'calendar', 'birchLeaf', 'birch leaves "mouse ear" size - phenological spring has arrived', 72);
        }
    }

    // *** Bird cherry (hägg) ***
    if (month === 4 && temp > 12) {
        if (toolsEvents.isCooldown(store, 'calendar', 'haggBloom', 300)) {
            toolsEvents.add(store, 'calendar', 'haggBloom', 'hägg blooming - "häggvinter" cold snap may follow', 72);
        }
    }

    // *** Lilac bloom ***
    if (month === 5 && temp > TEMP.GROWTH_OPTIMAL) {
        if (toolsEvents.isCooldown(store, 'calendar', 'lilacBloom', 300)) {
            toolsEvents.add(store, 'calendar', 'lilacBloom', 'lilacs blooming - phenological summer has begun', 168);
        }
    }

    // *** Rowan flower then berry ***
    if (month === 5 && day >= 15) {
        if (toolsEvents.isCooldown(store, 'calendar', 'rowanFlower', 300)) {
            toolsEvents.add(store, 'calendar', 'rowanFlower', 'rowan flowering - important for pollinators', 168);
        }
    }

    // *** First snow ***
    if (month >= 9 && month <= 11 && snowDepth > SNOW.TRACE) {
        if (toolsEvents.isCooldown(store, 'calendar', 'firstSnow', 200)) {
            toolsEvents.add(store, 'calendar', 'firstSnow', 'first snow of the season - winter approaching', 48);
        }
    }

    // *** Lake freeze ***
    if (month >= 11 && temp < -5) {
        if (toolsEvents.isCooldown(store, 'calendar', 'lakeFreeze', 300)) {
            toolsEvents.add(store, 'calendar', 'lakeFreeze', 'lakes beginning to freeze - "isläggning" winter taking hold', 168);
        }
    }

    // =====================================================================
    // TRADITIONAL PLANTING WISDOM
    // =====================================================================

    // Connected to natural phenology
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        results.phenomena.push('wisdom: "when birch leaves are mouse-ear size, plant potatoes"');
    }

    if (month === 5 && temp < TEMP.SOIL_WARM && state.gdd.base5 < 300) {
        results.phenomena.push('wisdom: "cold May fills the barn" - cool spring often means good harvest');
    }

    if (month === 7 && temp > 25 && humidity < HUMIDITY.LOW) {
        results.phenomena.push('wisdom: "dry July, full barn" - drought stress can increase grain protein');
    }

    // =====================================================================
    // Output Events
    // =====================================================================

    toolsEvents
        .get(store, 'calendar')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(`calendar: ${event.message}`));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// NIGHT SOUNDS AND ATMOSPHERE
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAtmosphere({ results, situation, dataCurrent }) {
    const { month, hour, daylight } = situation;
    const { temp, humidity, windSpeed } = dataCurrent;

    // Only relevant at night
    if (daylight?.isDaytime) return;

    // =====================================================================
    // NIGHT SOUNDS
    // =====================================================================

    if (month >= 5 && month <= 8 && temp > TEMP.SOIL_WARM) {
        const sounds = [];

        if (temp > TEMP.GROWTH_OPTIMAL) {
            sounds.push('frog chorus from the lake');
        }

        if (humidity > HUMIDITY.HIGH && windSpeed < WIND.CALM) {
            sounds.push('nightjar churring in forest clearings');
        }

        if (hour >= 22 || hour <= 3) {
            sounds.push('owls calling');
            if (month >= 5 && month <= 6) {
                sounds.push('corncrake rasping in meadows');
            }
        }

        if (sounds.length > 0) {
            results.phenomena.push(`night sounds: ${sounds.join(', ')}`);
        }
    }

    // Winter night sounds
    if ((month >= 11 || month <= 2) && temp < -10 && windSpeed < WIND.CALM) {
        results.phenomena.push('night sounds: trees cracking in frost, ice singing on the lake');
    }

    // =====================================================================
    // SUMMER NIGHTS
    // =====================================================================

    if (month >= 5 && month <= 7 && temp > TEMP.SOIL_WARM && hour >= 22 && hour <= 3) {
        results.phenomena.push('atmosphere: magical Nordic summer night - never fully dark');
    }

    if (month === 5 && daylight?.daylightHours > 16 && hour >= 22) {
        results.phenomena.push('atmosphere: twilight merging with dawn - the "nightless night" approaching');
    }

    // =====================================================================
    // NIGHT WILDLIFE ACTIVITY
    // =====================================================================

    if (!daylight?.isDaytime && month >= 5 && month <= 9 && temp > TEMP.SOIL_WARM) {
        if (hour >= 22 || hour <= 4) {
            results.phenomena.push('wildlife: hedgehogs, bats, and badgers active in the darkness');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ store }) {
    if (!store.phenology)
        store.phenology = {
            // Growing degree days
            gdd: {
                base5: 0,
                base10: 0,
                lastUpdate: undefined,
            },
            // Frost tracking
            frost: {
                lastDate: undefined,
                consecutiveFrostFreeDays: 0,
                chillHours: 0,
                growingSeasonActive: false,
            },
            // Foraging conditions
            foraging: {
                mushroomMoisture: 0,
                berryRipeness: {},
            },
            // Wildlife observations
            wildlife: {
                lastPressureDrop: undefined,
                insectActivityLevel: 'dormant',
                lastMooseWarning: undefined,
            },
            // Lake conditions
            lake: {
                estimatedTemp: undefined,
                iceStatus: 'unknown',
            },
        };

    return {
        interpretCultivation,
        interpretForest,
        interpretMammals,
        interpretBirds,
        interpretAquatic,
        interpretInvertebrates,
        interpretCalendar,
        interpretAtmosphere,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
