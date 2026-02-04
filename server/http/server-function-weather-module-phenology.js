// -----------------------------------------------------------------------------------------------------------------------------------------
// Phenology Module - Living landscape observations for Nordic rural environments
// -----------------------------------------------------------------------------------------------------------------------------------------
//
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
// -----------------------------------------------------------------------------------------------------------------------------------------

/* eslint-disable sonarjs/cognitive-complexity */

// const helpers = require('./server-function-weather-helpers.js');
// const { FormatHelper } = require('./server-function-weather-tools-format.js');
const toolsEvents = require('./server-function-weather-tools-events.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// CONSTANTS
// -----------------------------------------------------------------------------------------------------------------------------------------

const TEMP = {
    FROST: 0,
    SOIL_COLD: 5,
    SOIL_COOL: 8,
    SOIL_WARM: 10,
    GROWTH_MIN: 5,
    GROWTH_OPTIMAL: 15,
    HEAT_STRESS_PLANTS: 25,
    HEAT_STRESS_LIVESTOCK: 25,
    SEVERE_COLD_LIVESTOCK: -15,
    INSECT_DORMANT: 5,
    INSECT_LOW: 10,
    INSECT_MODERATE: 15,
    INSECT_HIGH: 20,
    MOSQUITO_ACTIVE: 10,
    TICK_ACTIVE: 5,
    PIKE_SPAWN: 4,
    PERCH_SPAWN: 8,
    CARP_ACTIVE: 15,
    TROUT_STRESS: 18,
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
    BLIGHT_RISK: 80,
    MILDEW_RISK: 70,
    FUNGAL_OPTIMAL: 85,
    MUSHROOM_MIN: 60,
    MUSHROOM_OPTIMAL: 85,
    TICK_FAVORABLE: 70,
};

const WIND = {
    CALM: 2,
    LIGHT: 5,
    MODERATE: 10,
    STRONG: 15,
    POLLINATION_MAX: 5,
    MOSQUITO_SUPPRESS: 3,
    SPRAY_MAX: 3,
};

const PRESSURE = {
    LOW: 1000,
    NORMAL: 1013,
    HIGH: 1025,
    CHANGE_SIGNIFICANT: 3,
    CHANGE_RAPID: 5,
    FISHING_OPTIMAL_LOW: 1015,
    FISHING_OPTIMAL_HIGH: 1025,
};

const GDD = {
    BASE_COOL: 5,
    BASE_WARM: 10,
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

const CHILL = { EARLY_APPLE: 400, MOST_APPLE_PEAR: 800, ALL_FRUIT: 1200 };

const MOISTURE = { MUSHROOM_MIN: 30, MUSHROOM_GOOD: 50, MUSHROOM_EXCELLENT: 70 };

const HOURS = {
    DAWN_START: 4,
    DAWN_END: 7,
    DUSK_START: 17,
    DUSK_END: 21,
    FISH_MORNING_START: 4,
    FISH_MORNING_END: 8,
    FISH_EVENING_START: 17,
    FISH_EVENING_END: 21,
    MOSQUITO_EVENING_START: 18,
    MOSQUITO_NIGHT_END: 8,
    CHORUS_START: 3,
    CHORUS_END: 6,
    BAT_START: 21,
    BAT_END: 4,
    SQUIRREL_MORNING_START: 9,
    SQUIRREL_AFTERNOON_START: 14,
};

const SNOW = { TRACE: 1, LIGHT_COVER: 10, MODERATE: 30, DEEP: 50, VERY_DEEP: 100, WOLF_HUNTING_CHANGE: 100 };

const DAYLIGHT = { HARE_COLOR_CHANGE: 10, SHORT_DAY: 8, LONG_DAY: 16, NIGHTLESS_NIGHT: 18 };

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

function isDawnOrDusk(hour, minute, daylight) {
    if (!daylight?.sunriseDecimal || !daylight?.sunsetDecimal) return false;
    const timeDecimal = hour + minute / 60;
    const nearDawn = Math.abs(timeDecimal - daylight.sunriseDecimal) < 1;
    const nearDusk = Math.abs(timeDecimal - daylight.sunsetDecimal) < 1;
    return nearDawn || nearDusk;
}

function getPressureTrend(weatherData, hoursBack = 3) {
    if (!weatherData?.getPeriod) return undefined;
    const period = weatherData.getPeriod(`${hoursBack}h`);
    if (!period?.entries?.length) return undefined;
    const [oldest] = period.entries;
    const newest = period.entries[period.entries.length - 1];
    if (oldest?.pressure === undefined || newest?.pressure === undefined) return undefined;
    return newest.pressure - oldest.pressure;
}

function hadRecentFrost(weatherData, hoursBack = 24) {
    if (!weatherData?.getPeriod) return false;
    const period = weatherData.getPeriod(`${hoursBack}h`);
    if (!period?.entries) return false;
    return period.entries.some((entry) => entry.temp !== undefined && entry.temp <= TEMP.FROST);
}

function isWindowStart(hour, minute, targetHour) {
    return hour === targetHour && minute < 15;
}
// CULTIVATION: Market Garden, Crops, Orchards, Livestock
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCultivation({ results, situation, dataCurrent, weatherData, store }) {
    const { month, day, daylight } = situation;
    const { temp, humidity, rainRate, snowDepth, windSpeed, cloudCover } = dataCurrent;
    const state = store.phenology;

    const timestamp = Date.now();
    const today = new Date(timestamp);
    today.setHours(0, 0, 0, 0);

    // GDD accumulates heat units above base temp; drives crop development timing
    if (!state.gdd.lastUpdate || state.gdd.lastUpdate < today.getTime()) {
        state.gdd.base5 += calculateGDD(temp, GDD.BASE_COOL);
        state.gdd.base10 += calculateGDD(temp, GDD.BASE_WARM);
        state.gdd.lastUpdate = today.getTime();
        if (month === 0 && day === 1) {
            state.gdd.base5 = 0;
            state.gdd.base10 = 0;
        }
    }

    const hadFrost = hadRecentFrost(weatherData, 24) || temp <= TEMP.FROST;
    if (temp <= TEMP.FROST) {
        state.frost.lastDate = timestamp;
        state.frost.consecutiveFrostFreeDays = 0;
        // First autumn frost damages unharvested tender crops; 180-day cooldown prevents repeat warnings
        if ((month >= 8 || month <= 2) && toolsEvents.isCooldown(store, 'cultivation', 'firstFrost', 180)) {
            toolsEvents.add(store, 'cultivation', 'firstFrost', 'first frost of season - protect tender plants', 48);
        }
    } else if (!hadFrost) {
        state.frost.consecutiveFrostFreeDays++;
    }

    // 14 frost-free days in spring indicates safe planting window for tender annuals
    if (month >= 3 && month <= 5 && state.frost.consecutiveFrostFreeDays > 14) {
        if (toolsEvents.isCooldown(store, 'cultivation', 'lastSpringFrost', 300)) {
            toolsEvents.add(store, 'cultivation', 'lastSpringFrost', 'probable last spring frost has passed - safe for tender plants', 168);
        }
    }

    // Growing season bookends determine outdoor cultivation window at this latitude
    if (!state.frost.growingSeasonActive && month >= 4 && month <= 9 && state.frost.consecutiveFrostFreeDays > 14 && temp > TEMP.GROWTH_MIN) {
        state.frost.growingSeasonActive = true;
        toolsEvents.add(store, 'cultivation', 'growingSeasonStart', 'growing season has begun', 72);
    } else if (state.frost.growingSeasonActive && hadFrost && month >= 9) {
        state.frost.growingSeasonActive = false;
        toolsEvents.add(store, 'cultivation', 'growingSeasonEnd', 'growing season ending - harvest remaining crops', 72);
    }

    // Fruit trees require winter vernalization (0-7°C) to break dormancy and flower properly
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

    // Cold frames extend season by 4-6 weeks; soil >5°C allows cold-hardy seed germination
    if (month === 2 && temp > TEMP.SOIL_COLD && snowDepth === 0) {
        if (toolsEvents.isCooldown(store, 'cultivation', 'coldFrameStart', 300)) {
            toolsEvents.add(store, 'cultivation', 'coldFrameStart', 'cold frames can be planted - lettuce, spinach, radish', 168);
        }
    }

    // Peas fix nitrogen and tolerate light frost; early sowing catches spring moisture
    if (month === 3 && temp > TEMP.SOIL_COLD) {
        toolsEvents.add(store, 'cultivation', 'earlyPeas', 'early peas can be direct sown', 168);
        toolsEvents.add(store, 'cultivation', 'onionSets', 'plant onion sets and shallots', 168);
    }

    // Warm-season crops need soil >10°C and settled weather to avoid transplant shock
    if (month === 4 && temp > TEMP.SOIL_WARM && state.frost.consecutiveFrostFreeDays > 7) {
        toolsEvents.add(store, 'cultivation', 'mainPlanting', 'main vegetable planting can begin - beans, squash, cucumbers', 168);
        if (snowDepth === 0) {
            toolsEvents.add(store, 'cultivation', 'potatoPlanting', 'soil warming - potato planting can begin', 168);
        }
    }

    // Frost-tender crops need night temps consistently >10°C
    if (month === 5 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'cultivation', 'tenderPlanting', 'plant out tender crops - tomatoes, peppers, courgettes', 168);
        toolsEvents.add(store, 'cultivation', 'successionSowing', 'succession sow lettuce, radish, carrots every 2 weeks', 336);
    }

    // Strawberry flowers vulnerable to late frost; GDD 250 indicates flowering imminent
    if (month === 5 && state.gdd.base5 > GDD.STRAWBERRY_FLOWER) {
        toolsEvents.add(store, 'cultivation', 'strawberryFlowering', 'strawberries flowering - protect from late frost', 72);
    }

    // Potato blight (Phytophthora) strikes when foliage is lush and humidity high
    if (month === 6 && state.gdd.base5 > GDD.POTATO_FLOWER) {
        toolsEvents.add(store, 'cultivation', 'potatoFlowering', 'potatoes flowering - critical period for blight watch', 72);
    }

    // Raspberries ripen over 2-3 weeks; daily picking prevents mold and bird loss
    if (month === 7 && state.gdd.base5 > GDD.RASPBERRY_RIPE) {
        toolsEvents.add(store, 'cultivation', 'raspberryHarvest', 'raspberries ripening - harvest daily', 168);
    }

    if (month === 8) {
        toolsEvents.add(store, 'cultivation', 'blackcurrantHarvest', 'blackcurrants ready for harvest', 168);
    }

    if (month === 8 && day >= 20) {
        toolsEvents.add(store, 'cultivation', 'earlyPotatoHarvest', 'early potatoes ready - maincrop in 2-3 weeks', 168);
    }

    // Garlic planted in autumn develops stronger root system and larger bulbs
    if (month === 9) {
        toolsEvents.add(store, 'cultivation', 'winterVegPlanting', 'plant garlic and overwintering onions', 168);
        toolsEvents.add(store, 'cultivation', 'rootHarvest', 'harvest and store root vegetables before hard frost', 336);
    }

    // Spring grains need soil workable and >5°C
    if (month === 4 && temp > TEMP.GROWTH_MIN && state.gdd.base5 > GDD.SPRING_GRAIN_SOW) {
        toolsEvents.add(store, 'cultivation', 'springGrainSowing', 'spring grain sowing time (oats, barley)', 168);
    }

    if (month === 7 && state.gdd.base5 > GDD.GRAIN_FLOWER) {
        toolsEvents.add(store, 'cultivation', 'grainFlowering', 'grain crops flowering - avoid spraying', 72);
    }

    if (month === 8 && state.gdd.base5 > GDD.GRAIN_HARVEST && humidity < HUMIDITY.HIGH) {
        toolsEvents.add(store, 'cultivation', 'grainHarvest', 'grain harvest conditions approaching', 168);
    }

    // Grass growth accelerates sharply at GDD 150
    if (month === 4 && state.gdd.base5 > GDD.PASTURE_GROWTH) {
        toolsEvents.add(store, 'cultivation', 'pastureGrowth', 'pasture grass beginning rapid growth', 72);
    }

    // First cut hay at early flower stage; needs 3-4 dry days to cure
    if (month === 6 && state.gdd.base5 > GDD.HAY_FIRST_CUT && rainRate === 0 && humidity < HUMIDITY.HIGH) {
        toolsEvents.add(store, 'cultivation', 'firstHayCut', 'optimal first hay cutting conditions', 72);
    }

    if (month === 7 && day >= 20 && rainRate === 0) {
        toolsEvents.add(store, 'cultivation', 'secondHayCut', 'second hay cut timing', 72);
    }

    // Realtime: Shallow-rooted crops wilt first in heat+dry conditions
    if (temp > TEMP.HEAT_STRESS_PLANTS && month >= 6 && month <= 8 && humidity < HUMIDITY.LOW) {
        results.phenomena.push('cultivation: garden water stress likely in shallow-rooted crops');
    }

    // Realtime: Radiation frost forms on clear calm nights
    if (temp > TEMP.FROST && temp < 3 && month >= 4 && month <= 5 && cloudCover !== undefined && cloudCover < 50) {
        results.phenomena.push('cultivation: garden radiation frost risk tonight - cover sensitive plants');
    }

    // Realtime: Bees need calm dry conditions >15°C for efficient pollination
    if (month === 5 && temp > TEMP.GROWTH_OPTIMAL && temp < TEMP.HEAT_STRESS_PLANTS && windSpeed < WIND.POLLINATION_MAX && rainRate === 0 && daylight?.isDaytime) {
        results.phenomena.push('cultivation: garden excellent pollination weather');
    }

    // Realtime: Blight and mildew spores germinate rapidly in warm humid conditions
    if (temp > TEMP.GROWTH_OPTIMAL && humidity > HUMIDITY.BLIGHT_RISK && month >= 6 && month <= 8) {
        results.phenomena.push('cultivation: garden high disease pressure - check for blight, mildew');
    }

    // Realtime: Slugs are nocturnal, need moisture to move
    if (humidity > HUMIDITY.VERY_HIGH && temp > TEMP.SOIL_WARM && temp < TEMP.INSECT_HIGH && (rainRate > 0 || !daylight?.isDaytime)) {
        results.phenomena.push('cultivation: garden high slug activity - protect seedlings');
    }

    // Realtime: Overcast conditions reduce transplant stress
    if (cloudCover !== undefined && cloudCover > 70 && temp > TEMP.SOIL_WARM && temp < TEMP.HEAT_STRESS_PLANTS && month >= 4 && month <= 8) {
        results.phenomena.push('cultivation: garden good transplanting conditions (overcast, mild)');
    }

    // Long days trigger bolting in lettuce, spinach - seasonal pattern, 336h display
    if (month >= 5 && month <= 7 && daylight?.daylightHours > DAYLIGHT.LONG_DAY && temp > 20) {
        if (toolsEvents.isCooldown(store, 'cultivation', 'boltingRisk', 300)) {
            toolsEvents.add(store, 'cultivation', 'boltingRisk', 'long days may trigger bolting in lettuce, spinach, coriander', 336);
        }
    }

    // Realtime: Wind chill dramatically increases heat loss for livestock
    if (temp < TEMP.SEVERE_COLD_LIVESTOCK && windSpeed > WIND.LIGHT) {
        results.phenomena.push('cultivation: livestock severe cold stress - ensure shelter and unfrozen water');
    }

    // Realtime: Cattle and pigs cannot sweat efficiently
    if (temp > TEMP.HEAT_STRESS_LIVESTOCK && humidity > HUMIDITY.HIGH) {
        results.phenomena.push('cultivation: livestock heat stress risk - ensure shade and water access');
    }

    // Sheep shearing needs dry fleece
    if (month === 4 && temp > TEMP.SOIL_WARM && rainRate === 0) {
        toolsEvents.add(store, 'cultivation', 'sheepShearing', 'sheep shearing weather - dry conditions', 72);
    }

    // Traditional Swedish "kosläpp" (cattle release to pasture)
    if (month === 5 && temp > 12) {
        toolsEvents.add(store, 'cultivation', 'cattleToPasture', 'traditional time to move cattle to summer pastures', 72);
    }

    // Hens need 14-16 hours light for consistent laying - seasonal pattern, 336h display
    if (daylight?.daylightHours < 10 && month >= 10) {
        if (toolsEvents.isCooldown(store, 'cultivation', 'poultryLighting', 300)) {
            toolsEvents.add(store, 'cultivation', 'poultryLighting', 'poultry supplemental lighting needed for egg production', 336);
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// FOREST: Wild Berries, Mushrooms, Trees, Forest Floor
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretForest({ results, situation, dataCurrent, weatherData, store }) {
    const { month, day, daylight } = situation;
    const { temp, humidity, snowDepth, windSpeed } = dataCurrent;
    const state = store.phenology;

    const recentRain = getRecentRainfall(weatherData, 7);
    state.foraging.mushroomMoisture = Math.max(0, Math.min(100, recentRain * 2));

    // Nettles contain oxalic acid that breaks down with cooking; harvest young tops before flowering
    if (month === 3 && temp > TEMP.SOIL_COOL && snowDepth < SNOW.LIGHT_COVER) {
        if (toolsEvents.isCooldown(store, 'forest', 'nettleSeason', 300)) {
            toolsEvents.add(store, 'forest', 'nettleSeason', 'young nettles emerging - harvest tops for soup, dry for tea', 168);
        }
    }

    // Ramsons (wild garlic) carpet forest floors before tree canopy closes
    if (month === 4 && temp > TEMP.SOIL_COOL) {
        if (toolsEvents.isCooldown(store, 'forest', 'ramsonsSeason', 300)) {
            toolsEvents.add(store, 'forest', 'ramsonsSeason', 'ramsons (wild garlic) in damp woodland - harvest leaves for pesto', 168);
        }
    }

    // Cloudberries (hjortron) grow in bogs; flowers frost-sensitive
    if (month === 5 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'forest', 'cloudberryFlower', 'cloudberries flowering in bog areas', 72);
    }
    if (month === 7 && day >= 20) {
        toolsEvents.add(store, 'forest', 'cloudberryRipe', 'cloudberries ripening - check wetland areas', 168);
    }

    // Bilberries (blåbär) carpet forest understory
    if (month === 6 && state.gdd.base5 > GDD.BILBERRY_FLOWER) {
        toolsEvents.add(store, 'forest', 'bilberryFlower', 'bilberries flowering in forest understory', 48);
    }
    if (month === 7 && state.gdd.base5 > GDD.BILBERRY_RIPE) {
        toolsEvents.add(store, 'forest', 'bilberryRipe', 'bilberries ripening - forest floors turning blue', 336);
    }
    // Peak bilberry season; hand-rake picker dramatically speeds harvest - seasonal, 336h
    if (month === 7 && day >= 15) {
        if (toolsEvents.isCooldown(store, 'forest', 'bilberrySeason', 300)) {
            toolsEvents.add(store, 'forest', 'bilberrySeason', 'bilberry season at peak - bring a berry picker (bärplockare)', 336);
        }
    }

    if (month === 8 && day >= 15) {
        toolsEvents.add(store, 'forest', 'lingonberryFirst', 'first lingonberries beginning to ripen', 168);
    }
    if (month === 9) {
        toolsEvents.add(store, 'forest', 'lingonberryPrime', 'lingonberry harvest at peak - traditional preserving time', 336);
    }

    if (month === 7 && temp > 18) {
        toolsEvents.add(store, 'forest', 'wildRaspberry', 'wild raspberries ripe in sunny forest edges', 168);
    }

    if (month === 6 && temp > TEMP.GROWTH_OPTIMAL) {
        toolsEvents.add(store, 'forest', 'wildStrawberry', 'wild strawberries ripening in sunny clearings', 168);
    }

    if (month === 8 && day >= 15) {
        toolsEvents.add(store, 'forest', 'rowanBerries', 'rowan berries turning red - sign of approaching autumn', 168);
    }

    if (month === 9 && temp < 15) {
        toolsEvents.add(store, 'forest', 'rosehips', 'rosehips ready for harvest - high in vitamin C', 336);
    }

    // Elderflower makes cordial; pick on dry sunny days for best aroma
    if (month === 6 && temp > TEMP.GROWTH_OPTIMAL) {
        if (toolsEvents.isCooldown(store, 'forest', 'elderflower', 300)) {
            toolsEvents.add(store, 'forest', 'elderflower', 'elderflowers blooming - harvest for cordial (fläderblomssaft)', 168);
        }
    }

    // Elderberries ripen after flowers; cook before eating (raw contains mild toxins)
    if (month === 9 && day >= 10) {
        if (toolsEvents.isCooldown(store, 'forest', 'elderberry', 300)) {
            toolsEvents.add(store, 'forest', 'elderberry', 'elderberries ripening - harvest for syrup, wine (cook before using)', 336);
        }
    }

    // Sloe berries best after frost converts starches to sugars; traditional for sloe gin
    if (month >= 10 && hadRecentFrost(weatherData, 72)) {
        if (toolsEvents.isCooldown(store, 'forest', 'sloeBerries', 300)) {
            toolsEvents.add(store, 'forest', 'sloeBerries', 'sloe berries sweetened by frost - harvest for sloe gin', 336);
        }
    }

    // Morels fruit in disturbed ground, burned areas
    if (month === 4 && temp > TEMP.SOIL_WARM && state.foraging.mushroomMoisture > MOISTURE.MUSHROOM_MIN) {
        toolsEvents.add(store, 'forest', 'morelSeason', 'morel mushrooms emerging - check burned areas and south-facing slopes', 168);
    }

    // Chanterelles need 2-3 weeks of moisture and soil >12°C to initiate fruiting
    if (month === 6 && temp > TEMP.GROWTH_OPTIMAL && state.foraging.mushroomMoisture > MOISTURE.MUSHROOM_MIN + 10) {
        toolsEvents.add(store, 'forest', 'chanterelleEarly', 'early chanterelles appearing in mossy spruce forests', 72);
    }
    if (month === 7 && recentRain > 20 && temp > 12) {
        toolsEvents.add(store, 'forest', 'chanterellePrime', 'prime chanterelle season - abundant in forests', 336);
    }

    // Porcini need warm soil and moisture
    if (month === 7 && temp > TEMP.GROWTH_OPTIMAL && state.foraging.mushroomMoisture > MOISTURE.MUSHROOM_GOOD) {
        toolsEvents.add(store, 'forest', 'porciniStart', 'porcini mushrooms appearing - check pine and birch forests', 168);
    }
    if (month === 8 && recentRain > 30) {
        toolsEvents.add(store, 'forest', 'porciniPeak', 'peak porcini season - excellent foraging conditions', 336);
    }

    // Hedgehog mushrooms easy to identify (spines not gills); no dangerous lookalikes
    if (month === 8 && temp < 20 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'forest', 'hedgehogMushroom', 'hedgehog mushrooms abundant - easy to identify, no poisonous lookalikes', 336);
    }

    // Funnel chanterelles fruit late into autumn
    if (month === 9 && temp < 15 && recentRain > 20) {
        toolsEvents.add(store, 'forest', 'funnelChanterelle', 'funnel chanterelles in abundance - late season favorite', 336);
    }

    if (month === 8 && state.foraging.mushroomMoisture > MOISTURE.MUSHROOM_GOOD) {
        toolsEvents.add(store, 'forest', 'blackTrumpet', 'black trumpet mushrooms in mossy beech/oak areas', 168);
    }

    // Matsutake prized for aroma; fruit in cool autumn under pine
    if (month === 9 && temp < 12 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'forest', 'matsutake', 'matsutake season in pine forests - aromatic prize', 168);
    }

    // Realtime: High humidity and warmth together create ideal fruiting conditions
    if (humidity > HUMIDITY.SATURATED && temp > TEMP.SOIL_WARM && temp < TEMP.INSECT_HIGH && month >= 7 && month <= 9) {
        results.phenomena.push('forest: perfect mushroom growing conditions');
    }

    // Trigger with consequence: Evening humidity predicts morning dew; 48h duration
    if (humidity > HUMIDITY.VERY_HIGH && !daylight?.isDaytime && month >= 7 && month <= 9) {
        if (toolsEvents.isCooldown(store, 'forest', 'mushroomDew', 20)) {
            toolsEvents.add(store, 'forest', 'mushroomDew', 'morning dew expected - good mushroom spotting conditions tomorrow', 48);
        }
    }

    // Hepatica first forest flower; blooms before trees leaf out
    if (month === 3 && temp > TEMP.GROWTH_MIN && snowDepth < SNOW.VERY_DEEP) {
        toolsEvents.add(store, 'forest', 'hepatica', 'hepatica (blåsippa) blooming - first forest flower', 72);
    }

    if (month === 4 && temp > TEMP.SOIL_COOL) {
        toolsEvents.add(store, 'forest', 'woodAnemone', 'wood anemones carpeting forest floor', 168);
    }

    if (month === 5 && temp > 12) {
        toolsEvents.add(store, 'forest', 'lilyValley', 'lily of the valley blooming - fragrant but poisonous', 168);
    }

    if (month === 5 && state.gdd.base5 > 300) {
        toolsEvents.add(store, 'forest', 'lingonFlower', 'lingonberry flowers opening - bees very active', 72);
    }

    if (month === 6 && temp > TEMP.GROWTH_OPTIMAL) {
        toolsEvents.add(store, 'forest', 'fireweed', 'fireweed blooming in clearings - excellent bee plant', 168);
    }

    if (month === 7 && day >= 15) {
        toolsEvents.add(store, 'forest', 'heather', 'heather blooming on forest edges and bogs', 336);
    }

    // Birch sap flows when day thaws but night freezes, creating pressure differential
    if (month === 2 && temp > TEMP.GROWTH_MIN && hadRecentFrost(weatherData, 24)) {
        toolsEvents.add(store, 'forest', 'sapRising', 'birch sap rising (freeze-thaw cycle active) - traditional tapping period', 168);
    }

    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'forest', 'birchLeafBurst', 'birch leaves emerging - "mouse ear" stage marks true spring', 72);
    }

    // Bird cherry blooms before leaves fully out; "häggvinter" cold snap often follows
    if (month === 4 && temp > 12) {
        toolsEvents.add(store, 'forest', 'birdCherry', 'bird cherry blooming - traditionally signals "häggvinter" cold snap possible', 72);
    }

    // Spruce pollen release creates yellow dust on water and cars
    if (month === 5 && temp > 15) {
        toolsEvents.add(store, 'forest', 'spruceFlower', 'spruce trees releasing pollen - yellow dust everywhere', 72);
    }

    // Autumn color change triggered by shortening days and cooling
    if (month === 9 && temp < TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'forest', 'autumnColors', 'autumn colors beginning - birches turning golden, aspens orange', 336);
    }

    // Realtime: Strong wind or frost accelerates leaf fall
    if (month === 10 && (windSpeed > WIND.MODERATE || temp < TEMP.GROWTH_MIN)) {
        results.phenomena.push('forest: leaves falling rapidly');
    }

    // Realtime: Fire risk based on recent rainfall and current humidity
    if (month >= 5 && month <= 8 && recentRain < 5 && humidity < HUMIDITY.LOW) {
        results.phenomena.push('forest: fire risk HIGH - avoid open fires');
    } else if (month >= 5 && month <= 8 && recentRain < 15 && humidity < HUMIDITY.MODERATE) {
        results.phenomena.push('forest: fire risk moderate - be careful with fires');
    }

    // Realtime: Terpenes volatilize from conifer resin in warm humid conditions
    if (temp > TEMP.INSECT_HIGH && humidity > HUMIDITY.MODERATE && month >= 6 && month <= 8 && daylight?.isDaytime) {
        results.phenomena.push('forest: warm humid air releasing pine and spruce resin scents');
    }

    // Realtime: Petrichor from geosmin released by soil bacteria after rain
    if (recentRain > 10 && temp > TEMP.SOIL_WARM && month >= 7 && month <= 9) {
        results.phenomena.push('forest: petrichor and mushroom scent in the air');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// WILDLIFE: Mammals
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretMammals({ results, situation, dataCurrent, weatherData, store }) {
    const { month, hour, minute, daylight } = situation;
    const { temp, windSpeed, snowDepth } = dataCurrent;
    const state = store.phenology;

    const timestamp = Date.now();
    const isDawnDusk = isDawnOrDusk(hour, minute, daylight);

    // Animals sense pressure drops before storms and feed intensively
    const pressureTrend = getPressureTrend(weatherData, 3);
    if (pressureTrend !== undefined && pressureTrend < -PRESSURE.CHANGE_SIGNIFICANT) {
        state.wildlife.lastPressureDrop = timestamp;
    }

    // Realtime: Feeding activity elevated for ~6 hours after pressure begins dropping
    if (state.wildlife.lastPressureDrop && timestamp - state.wildlife.lastPressureDrop < 6 * 3600000) {
        results.phenomena.push('wildlife: animals feeding actively before weather change');
    }

    // Realtime: Moose most active at dawn/dusk; crepuscular to avoid heat and predators
    if (isDawnDusk && temp > -10 && temp < 20 && windSpeed < WIND.LIGHT) {
        if (!state.wildlife.lastMooseWarning || timestamp - state.wildlife.lastMooseWarning > 6 * 3600000) {
            results.phenomena.push('wildlife: moose most active now - drive carefully');
            state.wildlife.lastMooseWarning = timestamp;
        }
    }

    // Moose rut (brunst) peaks September-October; bulls aggressive, territorial
    if (month >= 8 && month <= 10) {
        toolsEvents.add(store, 'wildlife', 'mooseRut', 'moose rutting season - bulls aggressive and unpredictable', 720);
    }

    // Calving May-June; cows very protective and may charge
    if (month >= 5 && month <= 6) {
        toolsEvents.add(store, 'wildlife', 'mooseCalving', 'moose calving season - give cows wide berth', 336);
    }

    // Realtime: Deep snow restricts moose movement
    if (snowDepth > SNOW.VERY_DEEP && temp < -15) {
        results.phenomena.push('wildlife: moose yarding in sheltered areas - deep snow limits movement');
    }

    // Realtime: Roe deer feed at forest-field edges at dusk/dawn
    if ((hour >= HOURS.DAWN_START && hour <= HOURS.DAWN_END) || (hour >= HOURS.DUSK_START && hour <= HOURS.DUSK_END)) {
        if (temp > -5 && windSpeed < WIND.LIGHT) {
            results.phenomena.push('wildlife: roe deer grazing in forest edges and meadows');
        }
    }

    // Roe deer rut July-August
    if (month === 7 || month === 8) {
        toolsEvents.add(store, 'wildlife', 'roeDeerRut', 'roe deer rutting season - bucks chasing does', 720);
    }

    // Fawns born spotted for camouflage; mother hides them
    if (month >= 4 && month <= 5) {
        toolsEvents.add(store, 'wildlife', 'roeDeerFawns', 'roe deer fawns being born - leave "abandoned" fawns alone, mother is nearby', 336);
    }

    // Lynx mating calls eerie and cat-like; February-March
    if (month >= 2 && month <= 3) {
        toolsEvents.add(store, 'wildlife', 'lynxMating', 'lynx mating season - eerie calls may be heard at night', 168);
    }

    // Realtime: Lynx evolved for deep snow; large paws give advantage
    if (snowDepth > SNOW.MODERATE && temp < -5) {
        results.phenomena.push('wildlife: lynx hunting advantage in deep snow - look for tracks');
    }

    if (month >= 5 && month <= 6) {
        toolsEvents.add(store, 'wildlife', 'lynxKittens', 'lynx kitten season - females with young are secretive', 336);
    }

    // Realtime: Wolves can run on crusted snow while ungulates break through
    if (snowDepth > SNOW.WOLF_HUNTING_CHANGE && temp < -5) {
        results.phenomena.push('wildlife: wolf pack hunting patterns change - following prey in deep snow');
    }

    if (month >= 1 && month <= 3) {
        toolsEvents.add(store, 'wildlife', 'wolfMating', 'wolf mating season - increased howling', 168);
    }

    if (month >= 4 && month <= 5) {
        toolsEvents.add(store, 'wildlife', 'wolfPups', 'wolf pup season - packs centered on den sites', 336);
    }

    // Fox mating calls (screaming vixen) distinctive in winter nights
    if (month >= 0 && month <= 2) {
        toolsEvents.add(store, 'wildlife', 'foxMating', 'fox mating season - screaming calls at night', 168);
    }

    // Realtime: Foxes hunt primarily at night
    if (!daylight?.isDaytime && temp > -10) {
        results.phenomena.push('wildlife: foxes hunting in twilight and darkness');
    }

    if (month >= 3 && month <= 4) {
        toolsEvents.add(store, 'wildlife', 'foxCubs', 'fox cubs emerging from dens - playful at dusk', 336);
    }

    // Window-start: Red squirrels have bimodal activity peaks; show at start of each window only
    if (daylight?.isDaytime && temp > -5 && temp < 20 && hour >= 7 && hour <= 17) {
        if (isWindowStart(hour, minute, HOURS.SQUIRREL_MORNING_START)) {
            toolsEvents.add(store, 'wildlife', 'squirrelMorningActive', 'squirrels most active now - foraging in trees (morning peak)', 1);
        }
        if (isWindowStart(hour, minute, HOURS.SQUIRREL_AFTERNOON_START)) {
            toolsEvents.add(store, 'wildlife', 'squirrelAfternoonActive', 'squirrels most active now - foraging in trees (afternoon peak)', 1);
        }
    }

    // Autumn caching behavior intense; squirrels scatter-hoard for winter survival
    if (month >= 9 && month <= 10) {
        toolsEvents.add(store, 'wildlife', 'squirrelCaching', 'squirrels caching food for winter - very busy', 336);
    }

    if (month >= 1 && month <= 3) {
        toolsEvents.add(store, 'wildlife', 'squirrelMating', 'squirrel mating chases - acrobatic displays in treetops', 168);
    }

    // Summer diet shifts to fungi and berries; they dry mushrooms in tree forks - seasonal, 336h
    if (month >= 7 && month <= 8) {
        if (toolsEvents.isCooldown(store, 'wildlife', 'squirrelFeeding', 300)) {
            toolsEvents.add(store, 'wildlife', 'squirrelFeeding', 'squirrels feeding on spruce cones and drying mushrooms', 336);
        }
    }

    // Realtime: Badgers primarily nocturnal; forage for earthworms
    if (!daylight?.isDaytime && temp > TEMP.GROWTH_MIN && month >= 3 && month <= 10) {
        results.phenomena.push('wildlife: badgers foraging at night - listen for snuffling');
    }

    if (month === 2 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'wildlife', 'badgerEmerge', 'badgers emerging from winter torpor', 72);
    }

    // Realtime: Hedgehogs nocturnal, insectivorous; check long grass before mowing
    if (!daylight?.isDaytime && temp > TEMP.SOIL_WARM && month >= 5 && month <= 9) {
        results.phenomena.push('wildlife: hedgehogs active at night - check before mowing');
    }

    if (month === 4 && temp > TEMP.SOIL_COOL) {
        toolsEvents.add(store, 'wildlife', 'hedgehogWake', 'hedgehogs waking from hibernation - need food and water', 168);
    }

    if (month === 10 && temp < TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'wildlife', 'hedgehogNest', 'hedgehogs seeking hibernation sites - leave leaf piles for them', 168);
    }

    // "Mad March hares" - boxing behavior is females rebuffing unwanted male advances
    if (month >= 2 && month <= 4) {
        toolsEvents.add(store, 'wildlife', 'hareMating', 'hare "mad March" boxing behavior', 168);
    }

    // Mountain hare coat change triggered by photoperiod, not snow - corrected ecological accuracy
    if (month >= 10 && daylight?.daylightHours < DAYLIGHT.HARE_COLOR_CHANGE) {
        if (toolsEvents.isCooldown(store, 'wildlife', 'hareWhite', 300)) {
            toolsEvents.add(store, 'wildlife', 'hareWhite', 'mountain hares molting to white winter coat (triggered by day length)', 336);
        }
    }

    // Beavers prepare for winter by reinforcing dams and caching branches underwater
    if (month === 9 || month === 10) {
        toolsEvents.add(store, 'wildlife', 'beaverActive', 'beavers preparing for winter - dam building activity high', 336);
    }

    // Realtime: Beavers crepuscular/nocturnal
    if (!daylight?.isDaytime && temp > TEMP.FROST && month >= 4 && month <= 10) {
        results.phenomena.push('wildlife: beavers active at dusk near waterways');
    }

    // Realtime: Bats need flying insects; only emerge when temps support insect activity
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

    // Bears emerge hungry after 5-7 months in den
    if (month === 3 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'wildlife', 'bearEmerge', 'bears emerging from hibernation - be alert, they are hungry', 168);
    }

    // Bears shift to berry diet in late summer; can eat 20kg blueberries daily
    if (month >= 7 && month <= 9) {
        toolsEvents.add(store, 'wildlife', 'bearBerry', 'bears feeding heavily on berries - make noise when foraging', 720);
    }

    // Hyperphagia: bears eating frantically to build fat reserves before denning
    if (month === 10 && temp < TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'wildlife', 'bearDenning', 'bears seeking dens - hyperphagia (intense feeding)', 168);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// BIRDS: Resident and Migratory Species
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretBirds({ results, situation, dataCurrent, weatherData, store }) {
    const { month, hour, minute, daylight } = situation;
    const { temp, pressure, windSpeed, snowDepth, rainRate } = dataCurrent;

    const pressureTrend = getPressureTrend(weatherData, 3);

    // Window-start: Dawn chorus peaks in breeding season; show at start of window only
    if (month >= 4 && month <= 6 && temp > TEMP.GROWTH_MIN) {
        if (isWindowStart(hour, minute, HOURS.CHORUS_START)) {
            toolsEvents.add(store, 'birds', 'dawnChorus', 'dawn chorus at peak - dozens of species singing', 3);
        }
    }

    // Cranes return early; iconic V-formations and trumpeting calls
    if (month === 3 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'birds', 'craneArrival', 'cranes returning - listen for trumpeting calls overhead', 168);
    }

    // Swallows are insectivores; arrive when flying insects emerge
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'birds', 'swallowArrival', 'swallows and house martins arriving - summer is near', 168);
    }

    // Swifts among last migrants; spend almost entire lives on the wing
    if (month === 5 && temp > TEMP.GROWTH_OPTIMAL) {
        toolsEvents.add(store, 'birds', 'swiftArrival', 'swifts screaming through the skies - last migrants to arrive', 72);
    }

    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'birds', 'cuckooArrival', 'listen for first cuckoo - traditional spring marker', 168);
    }

    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'birds', 'songbirdReturn', 'migratory songbirds returning - woods filling with song', 168);
    }

    // Cranes stage in large flocks before heading south
    if (month === 9 && pressure > PRESSURE.NORMAL) {
        toolsEvents.add(store, 'birds', 'craneMigration', 'crane migration southward - large V-formations visible', 336);
    }

    if (month === 8 && temp < 20) {
        toolsEvents.add(store, 'birds', 'swiftDeparture', 'swifts departing - one of first to leave', 168);
    }

    // Realtime: High pressure provides stable conditions for migration flights
    if (month === 9 && pressureTrend > 0) {
        results.phenomena.push('birds: high pressure favoring migration - watch for flocks heading south');
    }

    // Capercaillie lek at traditional sites; males display with bizarre sounds
    if (month === 4 && hour >= 3 && hour <= 6 && temp > TEMP.FROST) {
        toolsEvents.add(store, 'birds', 'capercaillieLek', 'capercaillie lekking - dawn displays in old-growth forest', 168);
    }

    if (month === 4 && hour >= 4 && hour <= 7) {
        toolsEvents.add(store, 'birds', 'blackGrouseLek', 'black grouse lekking on forest bogs - bubbling calls', 168);
    }

    if (month === 9 && hour >= 6 && hour <= 10) {
        toolsEvents.add(store, 'birds', 'hazelGrouse', 'hazel grouse whistling in dense forest', 168);
    }

    // Drumming is territorial
    if (month === 3 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'birds', 'woodpeckerDrumming', 'woodpeckers drumming to establish territories', 72);
    }

    // Nest excavation takes 2-4 weeks - seasonal, 336h
    if (month >= 4 && month <= 6) {
        if (toolsEvents.isCooldown(store, 'birds', 'woodpeckerNesting', 300)) {
            toolsEvents.add(store, 'birds', 'woodpeckerNesting', 'woodpeckers excavating nest holes', 336);
        }
    }

    // Winter woodpecker activity concentrates at feeders - seasonal, 336h
    if (month >= 11 || month <= 2) {
        if (toolsEvents.isCooldown(store, 'birds', 'woodpeckerWinter', 300)) {
            toolsEvents.add(store, 'birds', 'woodpeckerWinter', 'woodpeckers visiting feeders and suet in winter', 336);
        }
    }

    // Owl courtship calls peak in late winter
    if (month >= 1 && month <= 3 && !daylight?.isDaytime) {
        toolsEvents.add(store, 'birds', 'owlCalling', 'owl courtship calls - tawny owl hooting, pygmy owl whistling', 168);
    }

    // Realtime: Owls hunt in darkness
    if (!daylight?.isDaytime && temp > -15 && windSpeed < WIND.MODERATE) {
        results.phenomena.push('birds: owls hunting - listen for calls');
    }

    if (month === 3 && temp > TEMP.FROST) {
        toolsEvents.add(store, 'birds', 'swanReturn', 'whooper swans returning to lakes', 168);
    }

    // Realtime: Geese migrate in large noisy flocks
    if ((month === 4 || month === 9) && pressureTrend > 0) {
        results.phenomena.push('birds: goose flocks migrating overhead');
    }

    if (month === 4 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'birds', 'duckCourtship', 'duck courtship displays on lakes', 168);
    }

    if (month === 4 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'birds', 'loonArrival', 'black-throated divers arriving at lakes - haunting calls', 168);
    }

    if (month === 4 && temp > TEMP.SOIL_COOL) {
        toolsEvents.add(store, 'birds', 'grebeDisplay', 'great crested grebe courtship dances on lakes', 168);
    }

    if (month === 2) {
        toolsEvents.add(store, 'birds', 'eagleNesting', 'white-tailed eagles building/repairing nests', 168);
    }

    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'birds', 'ospreyArrival', 'ospreys returning to nest platforms', 168);
    }

    if (month === 3 && temp > TEMP.GROWTH_MIN) {
        toolsEvents.add(store, 'birds', 'buzzardDisplay', 'buzzards soaring and displaying over territories', 72);
    }

    if (month === 3) {
        toolsEvents.add(store, 'birds', 'goshawkDisplay', 'goshawk sky-dance display over forests', 72);
    }

    // Realtime: Winter feeding critical when natural food scarce
    if ((month >= 11 || month <= 2) && temp < TEMP.FROST && snowDepth > SNOW.LIGHT_COVER) {
        results.phenomena.push('birds: high feeder activity - tits, nuthatches, and finches hungry');
    }

    // Waxwings irruptive; arrive in flocks when rowan/apple crops fail further north
    if (month >= 11 && month <= 1) {
        toolsEvents.add(store, 'birds', 'waxwings', 'watch for waxwing flocks on rowan and apple trees', 336);
    }

    // Crossbills specialize on conifer seeds - seasonal, 336h
    if (month >= 11 || month <= 2) {
        if (toolsEvents.isCooldown(store, 'birds', 'crossbills', 300)) {
            toolsEvents.add(store, 'birds', 'crossbills', 'crossbills feeding on spruce cones', 336);
        }
    }

    // Breeding season disturbance affects nest success - seasonal, 672h
    if (month >= 4 && month <= 7) {
        if (toolsEvents.isCooldown(store, 'birds', 'nestingSeason', 300)) {
            toolsEvents.add(store, 'birds', 'nestingSeason', 'nesting season - minimize disturbance, keep cats indoors', 672);
        }
    }

    // Ravens pair for life; aerial acrobatics strengthen pair bond
    if (month === 2 || month === 3) {
        toolsEvents.add(store, 'birds', 'ravenDisplay', 'ravens performing aerial courtship rolls', 72);
    }

    // Jays scatter-hoard acorns; forgotten caches regenerate oak forests - seasonal, 336h
    if (month >= 9 && month <= 10) {
        if (toolsEvents.isCooldown(store, 'birds', 'jaysCaching', 300)) {
            toolsEvents.add(store, 'birds', 'jaysCaching', 'jays caching acorns - important forest regeneration', 336);
        }
    }

    // Realtime: Birds feed intensively before storms
    if (pressureTrend !== undefined && pressureTrend < -PRESSURE.CHANGE_RAPID) {
        results.phenomena.push('birds: feeding frantically before storm');
    }

    // Realtime: Rain drives earthworms to surface
    if (rainRate > 0 && temp > TEMP.SOIL_WARM) {
        results.phenomena.push('birds: thrushes hunting worms after rain');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// AQUATIC: Lake Ecology, Fish, Amphibians
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAquatic({ results, situation, dataCurrent, weatherData, store }) {
    const { month, hour, daylight } = situation;
    const { temp, pressure, windSpeed, humidity, rainRate } = dataCurrent;
    const state = store.phenology;

    const pressureTrend = getPressureTrend(weatherData, 3);

    // Lake thermal mass creates lag; temp changes slowly compared to air
    if (temp !== undefined) {
        const lagFactor = 0.1;
        state.lake.estimatedTemp = state.lake.estimatedTemp === undefined ? temp - 5 : state.lake.estimatedTemp + (temp - state.lake.estimatedTemp) * lagFactor;
    }

    // Ice formation begins in calm cold conditions; dangerous thin ice period
    if (month >= 10 && temp < -5 && windSpeed < WIND.LIGHT) {
        if (state.lake.iceStatus !== 'forming') {
            toolsEvents.add(store, 'lake', 'iceForming', 'lake ice beginning to form - stay off until thick enough', 168);
            state.lake.iceStatus = 'forming';
        }
    }

    // Ice thickens with sustained cold; local knowledge essential for safety
    if (month >= 11 && temp < -10 && state.lake.iceStatus === 'forming') {
        toolsEvents.add(store, 'lake', 'iceSafe', 'ice thickening - check locally before walking', 168);
        state.lake.iceStatus = 'frozen';
    }

    // Spring ice extremely dangerous; looks solid but honeycombed and weak
    if (month === 3 && temp > TEMP.GROWTH_MIN) {
        if (state.lake.iceStatus === 'frozen') {
            toolsEvents.add(store, 'lake', 'iceBreakup', 'lake ice weakening - DANGEROUS, stay off', 168);
            state.lake.iceStatus = 'breaking';
        }
    }

    if (month === 4 && temp > TEMP.SOIL_WARM) {
        state.lake.iceStatus = 'open';
    }

    // Realtime: Blue-green algae blooms in warm still water; can be toxic
    if (month >= 6 && month <= 8 && temp > 20 && windSpeed < WIND.LIGHT) {
        results.phenomena.push('lake: conditions favor algae growth - check before swimming');
    }

    // Realtime: Lake temperature >18°C generally comfortable for swimming
    if (month >= 6 && month <= 8 && state.lake.estimatedTemp > 18 && windSpeed < WIND.MODERATE) {
        results.phenomena.push('lake: pleasant swimming temperature');
    }

    // Spring turnover: warming surface water sinks, mixing oxygen throughout
    if (month === 4 && temp > TEMP.SOIL_COOL && temp < 12) {
        toolsEvents.add(store, 'lake', 'springTurnover', 'lake spring turnover - oxygen mixing throughout', 168);
    }

    // Fall turnover: cooling surface sinks; fish redistribute to new depths
    if (month === 10 && temp < 10 && temp > TEMP.FROST) {
        toolsEvents.add(store, 'lake', 'fallTurnover', 'lake fall turnover - fish moving to new depths', 168);
    }

    // Realtime: Carp become active when water exceeds 15°C
    if (state.lake.estimatedTemp > TEMP.CARP_ACTIVE && month >= 5 && month <= 9) {
        results.phenomena.push('fish: carp active in warm shallows');
    }

    // Carp spawn in vegetation when water reaches 18°C
    if (month === 5 && state.lake.estimatedTemp > 18) {
        toolsEvents.add(store, 'fish', 'carpSpawning', 'carp spawning in shallow weedy areas - splashing visible', 168);
    }

    // Realtime: Carp surface feed in warm calm evenings
    if (month >= 6 && month <= 8 && hour >= HOURS.FISH_EVENING_START && temp > 20 && windSpeed < WIND.LIGHT) {
        results.phenomena.push('fish: carp surface feeding in evening - watch for bubbles and swirls');
    }

    // Pike spawn very early in cold water; move to shallow vegetated bays
    if (month === 3 && state.lake.estimatedTemp > TEMP.PIKE_SPAWN) {
        toolsEvents.add(store, 'fish', 'pikeSpawning', 'pike moving to shallow bays for spawning', 168);
    }

    // Post-spawn pike hungry and aggressive
    if (month >= 4 && month <= 5) {
        toolsEvents.add(store, 'fish', 'pikePostSpawn', 'pike recovering in shallows - good fishing', 336);
    }

    // Pike feed intensively to build reserves before winter - seasonal, 336h
    if (month >= 9 && month <= 11 && state.lake.estimatedTemp < 15) {
        if (toolsEvents.isCooldown(store, 'fish', 'pikeAutumn', 300)) {
            toolsEvents.add(store, 'fish', 'pikeAutumn', 'pike feeding heavily before winter - excellent fishing', 336);
        }
    }

    // Perch spawn later than pike
    if (month === 4 && state.lake.estimatedTemp > TEMP.PERCH_SPAWN) {
        toolsEvents.add(store, 'fish', 'perchSpawning', 'perch spawning around submerged vegetation', 72);
    }

    // Realtime: Perch school around structure
    if (month >= 6 && month <= 8 && daylight?.isDaytime) {
        results.phenomena.push('fish: perch schooling around structures - look for diving birds');
    }

    // Realtime: Trout need cold oxygenated water; stressed in warm summer
    if (state.lake.estimatedTemp > TEMP.TROUT_STRESS && month >= 7 && month <= 8) {
        results.phenomena.push('fish: trout stressed by warm water - seek cool springs and depths');
    }

    // Brown trout spawn in autumn
    if (month >= 9 && month <= 11 && state.lake.estimatedTemp < TEMP.GROWTH_OPTIMAL) {
        toolsEvents.add(store, 'fish', 'troutSpawning', 'brown trout moving to spawning streams', 336);
    }

    // Realtime: Stable high pressure and light wind create ideal fishing conditions
    if (pressure > PRESSURE.FISHING_OPTIMAL_LOW && pressure < PRESSURE.FISHING_OPTIMAL_HIGH && windSpeed < WIND.LIGHT) {
        if ((hour >= HOURS.FISH_MORNING_START && hour <= HOURS.FISH_MORNING_END) || (hour >= HOURS.FISH_EVENING_START && hour <= HOURS.FISH_EVENING_END)) {
            results.phenomena.push('fish: excellent conditions (stable pressure, light wind)');
        }
    }

    // Realtime: Fish feed actively when pressure dropping
    if (pressureTrend !== undefined && pressureTrend < -PRESSURE.CHANGE_SIGNIFICANT) {
        results.phenomena.push('fish: fish feeding actively before pressure drop');
    }

    // Realtime: Post-frontal high pressure often sees sluggish fish
    if (pressureTrend !== undefined && pressureTrend > PRESSURE.CHANGE_SIGNIFICANT) {
        results.phenomena.push('fish: fish may be sluggish after pressure rise');
    }

    // Realtime: Evening hatches of mayflies, caddis trigger surface feeding
    if (month >= 5 && month <= 8 && temp > TEMP.GROWTH_OPTIMAL && temp < 25 && hour >= 17 && hour <= 21 && windSpeed < WIND.LIGHT) {
        results.phenomena.push('fish: evening insect hatch likely - fish rising');
    }

    // Frogs migrate to breeding ponds on warm rainy nights; road mortality high
    if (month === 3 && temp > TEMP.GROWTH_MIN && (rainRate > 0 || humidity > HUMIDITY.VERY_HIGH)) {
        toolsEvents.add(store, 'amphibians', 'frogMigration', 'frogs migrating to breeding ponds - watch for road crossings', 72);
    }

    if (month === 4 && temp > TEMP.SOIL_COOL) {
        toolsEvents.add(store, 'amphibians', 'frogSpawn', 'frog spawn in ponds and lake shallows', 168);
    }

    // Toads migrate later than frogs
    if (month === 4 && temp > TEMP.SOIL_COOL && (rainRate > 0 || humidity > HUMIDITY.HIGH)) {
        toolsEvents.add(store, 'amphibians', 'toadMigration', 'toads migrating to breeding sites - especially after dusk rain', 72);
    }

    // Realtime: Frog chorus peaks on warm spring nights
    if (month >= 4 && month <= 6 && !daylight?.isDaytime && temp > TEMP.SOIL_WARM) {
        results.phenomena.push('amphibians: frog chorus from wetlands and lake edges');
    }

    if (month === 4 && temp > TEMP.SOIL_COOL) {
        toolsEvents.add(store, 'amphibians', 'newtBreeding', 'newts in breeding ponds - males displaying crests', 168);
    }

    // Grass snakes (non-venomous) excellent swimmers
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'reptiles', 'snakeEmerge', 'grass snakes emerging from hibernation - often near water', 168);
    }

    // Realtime: Grass snakes hunt frogs and fish; bask to raise body temperature
    if (month >= 5 && month <= 8 && temp > TEMP.INSECT_HIGH && daylight?.isDaytime) {
        results.phenomena.push('reptiles: grass snakes basking and hunting frogs near lake');
    }

    if (month === 7) {
        toolsEvents.add(store, 'reptiles', 'snakeEggs', 'grass snakes laying eggs in warm compost/manure heaps', 168);
    }

    // Adders (venomous) emerge and bask in spring
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'reptiles', 'adderEmerge', 'adders emerging - watch where you step in sunny spots', 168);
    }

    // Realtime: Adders bask on warm days
    if (temp > TEMP.INSECT_HIGH && month >= 4 && month <= 9) {
        results.phenomena.push('reptiles: adders may be basking - be aware in rocky, sunny areas');
    }

    // Realtime: Slow worms (legless lizards) hide under debris
    if (month >= 4 && month <= 9 && temp > TEMP.GROWTH_OPTIMAL && humidity > HUMIDITY.HIGH) {
        results.phenomena.push('reptiles: slow worms active under logs and in compost');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// INVERTEBRATES: Insects, Pollinators, Pests, Arachnids
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretInvertebrates({ results, situation, dataCurrent, store }) {
    const { month, hour, daylight } = situation;
    const { temp, humidity, windSpeed, rainRate } = dataCurrent;
    const state = store.phenology;

    // Track insect activity level based on temperature thresholds
    if (temp < TEMP.INSECT_DORMANT) {
        state.wildlife.insectActivityLevel = 'dormant';
    } else if (temp < TEMP.INSECT_LOW) {
        state.wildlife.insectActivityLevel = 'low';
    } else if (temp < TEMP.INSECT_MODERATE) {
        state.wildlife.insectActivityLevel = 'moderate';
    } else {
        state.wildlife.insectActivityLevel = 'high';
    }

    // Bumblebee queens emerge early; only fertilized queens survive winter
    if (month === 3 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'insects', 'bumblebeeQueens', 'bumblebee queens emerging - first pollinators active', 72);
    }

    // Realtime: Honeybees need warm calm dry weather for efficient foraging
    if (temp > TEMP.INSECT_LOW && temp < 35 && windSpeed < WIND.MODERATE && rainRate === 0 && daylight?.isDaytime) {
        if (month >= 4 && month <= 9) {
            results.phenomena.push('insects: bees actively foraging');
        }
    }

    // Bee swarms occur when colonies reproduce
    if (month === 5 && temp > TEMP.INSECT_MODERATE) {
        toolsEvents.add(store, 'insects', 'beeSwarm', 'bee swarming season - watch for clusters on branches', 336);
    }

    // Overwintering butterflies emerge on first warm spring days
    if (month === 3 && temp > TEMP.SOIL_WARM && daylight?.isDaytime) {
        toolsEvents.add(store, 'insects', 'firstButterflies', 'first butterflies emerging - brimstone, peacock, tortoiseshell', 72);
    }

    // Peak butterfly diversity and abundance - seasonal, 672h
    if (month >= 6 && month <= 8 && temp > TEMP.INSECT_MODERATE && daylight?.isDaytime) {
        if (toolsEvents.isCooldown(store, 'insects', 'butterflyPeak', 300)) {
            toolsEvents.add(store, 'insects', 'butterflyPeak', 'peak butterfly activity', 672);
        }
    }

    // Realtime: Hoverflies mimic bees/wasps for protection
    if (month >= 5 && month <= 9 && temp > TEMP.GROWTH_OPTIMAL && daylight?.isDaytime) {
        results.phenomena.push('insects: hoverflies active - important pollinators, hover in place');
    }

    // Realtime: Optimal pollination conditions
    if (month >= 5 && month <= 8 && temp > TEMP.GROWTH_OPTIMAL && humidity > HUMIDITY.MODERATE && windSpeed < WIND.POLLINATION_MAX) {
        if (daylight?.isDaytime && state.wildlife.insectActivityLevel !== 'dormant') {
            results.phenomena.push('insects: ideal pollination conditions');
        }
    }

    // Realtime: Mosquitoes active above 10°C; suppressed by wind >3m/s
    if (temp > TEMP.MOSQUITO_ACTIVE && month >= 5 && month <= 9) {
        if (humidity > HUMIDITY.MODERATE && windSpeed < WIND.MOSQUITO_SUPPRESS) {
            results.phenomena.push('insects: mosquito activity likely');
            if (hour >= HOURS.MOSQUITO_EVENING_START || hour <= HOURS.MOSQUITO_NIGHT_END) {
                results.phenomena.push('insects: peak mosquito activity time - use repellent');
            }
        }
    }

    // Spring hatches produce large synchronized emergences
    if (month === 5 && humidity > HUMIDITY.MODERATE && temp > TEMP.GROWTH_OPTIMAL) {
        toolsEvents.add(store, 'insects', 'mosquitoHatch', 'mosquito hatching beginning - prepare defenses', 168);
    }

    // Realtime: Midges (knott) swarm in huge numbers
    if (month >= 5 && month <= 8 && humidity > HUMIDITY.HIGH && windSpeed < WIND.CALM && (hour >= 17 || hour <= 9)) {
        results.phenomena.push('insects: midge swarms likely near water');
    }

    // Realtime: Ticks active above 5°C; quest on vegetation tips
    if (temp > TEMP.TICK_ACTIVE && month >= 3 && month <= 11) {
        if (humidity > HUMIDITY.TICK_FAVORABLE || rainRate > 0) {
            results.phenomena.push('insects: high tick activity - check yourself after outdoor activities');
        } else if (humidity > HUMIDITY.MODERATE) {
            results.phenomena.push('insects: moderate tick activity - stay on paths');
        }
    }

    // Tick nymphs emerge in spring; smaller and harder to spot
    if (month === 4 && temp > TEMP.SOIL_COOL) {
        toolsEvents.add(store, 'insects', 'tickPeak', 'tick season beginning - nymph activity increasing', 168);
    }

    // Wasp queens seek nest sites in spring
    if (month === 4 && temp > TEMP.INSECT_LOW) {
        toolsEvents.add(store, 'insects', 'waspQueens', 'wasp queens seeking nest sites', 168);
    }

    // Late summer wasps seek sugar; colonies at maximum size - seasonal, 336h
    if (month >= 8 && month <= 9 && temp > TEMP.GROWTH_OPTIMAL) {
        if (toolsEvents.isCooldown(store, 'insects', 'waspAggressive', 300)) {
            toolsEvents.add(store, 'insects', 'waspAggressive', 'wasps aggressive - colonies at peak, seeking sugar', 336);
        }
    }

    // Dragonfly nymphs crawl up reeds to emerge as adults
    if (month === 5 && temp > TEMP.GROWTH_OPTIMAL) {
        toolsEvents.add(store, 'insects', 'dragonflyEmerge', 'dragonflies emerging from lake - watch for empty cases on reeds', 168);
    }

    // Dragonflies patrol territories and hunt mosquitoes - seasonal, 672h
    if (month >= 6 && month <= 8 && temp > TEMP.INSECT_MODERATE && daylight?.isDaytime) {
        if (toolsEvents.isCooldown(store, 'insects', 'dragonflyPatrol', 300)) {
            toolsEvents.add(store, 'insects', 'dragonflyPatrol', 'dragonflies patrolling - excellent mosquito predators', 672);
        }
    }

    // Female fireflies glow in grass; males fly searching - seasonal, 336h
    if (month >= 6 && month <= 7 && !daylight?.isDaytime && temp > TEMP.GROWTH_OPTIMAL && humidity > HUMIDITY.HIGH) {
        if (toolsEvents.isCooldown(store, 'insects', 'fireflySeason', 300)) {
            toolsEvents.add(store, 'insects', 'fireflySeason', 'firefly season - watch for glowing females in grass', 336);
        }
    }

    // Ladybugs overwinter in clusters; emerge hungry for aphids
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        toolsEvents.add(store, 'insects', 'ladybugWake', 'ladybugs emerging - aphid control starting', 72);
    }

    // Aphid populations explode in warm dry conditions - seasonal, 672h
    if (month >= 5 && month <= 8 && temp > TEMP.GROWTH_OPTIMAL && humidity < HUMIDITY.MODERATE) {
        if (toolsEvents.isCooldown(store, 'insects', 'aphidRisk', 300)) {
            toolsEvents.add(store, 'insects', 'aphidRisk', 'watch for aphid buildup on tender shoots', 672);
        }
    }

    // Realtime: Flying ant day; synchronized nuptial flights
    if (month === 7 && temp > 20 && humidity > HUMIDITY.HIGH) {
        results.phenomena.push('insects: flying ant day conditions - watch for swarms');
    }

    // Cockchafers (maybugs) emerge at dusk
    if (month === 5 && temp > TEMP.GROWTH_OPTIMAL && !daylight?.isDaytime) {
        toolsEvents.add(store, 'insects', 'cockchafer', 'cockchafer (maybug) flight - bumbling around lights', 168);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// CALENDAR: Traditional Markers and Phenological Indicators
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCalendar({ results, situation, dataCurrent, store }) {
    const { month, day, daylight } = situation;
    const { temp, humidity, snowDepth, rainRate } = dataCurrent;
    const state = store.phenology;

    // Candlemas: warm weather now means late spring; cold means early spring
    if (month === 2 && day === 2) {
        if (temp > TEMP.FROST && rainRate > 0) {
            results.phenomena.push('calendar: Candlemas thaw - "better a wolf in the stable than a warm Candlemas"');
        } else if (temp < -5) {
            results.phenomena.push('calendar: cold Candlemas - traditionally means early spring');
        }
    }

    // St. Matthias traditionally breaks winter ice; marks turn toward spring
    if (month === 2 && day === 24) {
        toolsEvents.add(store, 'calendar', 'stMatthias', 'St. Matthias Day - "Matthias breaks the ice, if he finds any"', 24);
    }

    // Lady Day (Vårfrudagen) marks traditional start of outdoor farm work
    if (month === 3 && day === 25) {
        toolsEvents.add(store, 'calendar', 'ladyDay', 'Vårfrudagen (Lady Day) - traditional start of spring farm work', 24);
    }

    // Walpurgis Night: bonfires welcome spring, drive away winter spirits
    if (month === 4 && day === 30) {
        toolsEvents.add(store, 'calendar', 'walpurgis', 'Valborgsafton (Walpurgis Night) - welcoming spring with bonfires', 24);
    }

    // Urban's Day: weather on this day supposedly continues for three weeks
    if (month === 5 && day === 25) {
        toolsEvents.add(store, 'calendar', 'urbanDay', 'Urban\'s Day - "what weather Urban gives, stays for three weeks"', 24);
    }

    // St. Medardus: weather on this day traditionally indicates next 40 days
    if (month === 6 && day === 8 && temp > 20) {
        results.phenomena.push('calendar: St. Medardus warm - "as Medardus, so 40 days after"');
    }

    // Midsummer: peak of light in Sweden, major celebration with maypole and herring
    if (month === 6 && day >= 19 && day <= 26 && daylight?.daylightHours > DAYLIGHT.NIGHTLESS_NIGHT) {
        toolsEvents.add(store, 'calendar', 'midsummer', 'Midsommar period - peak of light, traditional celebrations', 168);
    }

    // Olof's Day: traditional day for predicting harvest weather
    if (month === 7 && day === 29) {
        toolsEvents.add(store, 'calendar', 'olofsDay', "Olof's Day - traditional harvest weather prediction", 24);
    }

    // Bartholomew's Day marks shift toward autumn
    if (month === 8 && day === 24) {
        toolsEvents.add(store, 'calendar', 'bartholDay', 'Bartholomew\'s Day - "autumn shows its intentions"', 24);
    }

    // Michaelmas: end of harvest, accounts settled
    if (month === 9 && day === 29) {
        toolsEvents.add(store, 'calendar', 'michaelmas', 'Michaelmas - traditional end of harvest season', 24);
    }

    // Winter Nights: old Norse calendar marked winter's start mid-October
    if (month === 10 && day === 14) {
        toolsEvents.add(store, 'calendar', 'winterNights', 'Winter Nights - old Norse calendar winter beginning', 24);
    }

    // St. Martin's Day: goose feast, weather predictions for coming winter
    if (month === 11 && day === 11) {
        toolsEvents.add(store, 'calendar', 'martinmas', 'St. Martin\'s Day - "Martin\'s geese" weather prediction', 24);
    }

    // Lucia preparations: darkest time before winter solstice brings returning light
    if (month === 11 && day === 13) {
        toolsEvents.add(store, 'calendar', 'lucia', 'Lucia preparations - darkest time before the light returns', 24);
    }

    // St. Andrew's Day marks traditional start of Christmas preparations
    if (month === 11 && day === 30) {
        toolsEvents.add(store, 'calendar', 'stAndrew', "St. Andrew's Day - traditional start of Christmas season", 24);
    }

    // Ice breakup (islossning) definitive marker of spring
    if (month === 3 && temp > TEMP.GROWTH_MIN) {
        if (toolsEvents.isCooldown(store, 'calendar', 'iceBreakup', 300)) {
            toolsEvents.add(store, 'calendar', 'iceBreakup', 'lake ice breaking up - "islossning" marks true spring arrival', 168);
        }
    }

    // Coltsfoot (tussilago) blooms before leaves appear; first splash of yellow
    if (month === 3 && temp > TEMP.GROWTH_MIN && snowDepth < SNOW.MODERATE) {
        if (toolsEvents.isCooldown(store, 'calendar', 'coltsfoot', 300)) {
            toolsEvents.add(store, 'calendar', 'coltsfoot', 'tussilago (coltsfoot) blooming - first flower of spring', 72);
        }
    }

    // Birch leaf "mouse ear" stage: leaves size of mouse ear = traditional planting signal
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        if (toolsEvents.isCooldown(store, 'calendar', 'birchLeaf', 300)) {
            toolsEvents.add(store, 'calendar', 'birchLeaf', 'birch leaves "mouse ear" size - phenological spring has arrived', 72);
        }
    }

    // Bird cherry bloom often followed by cold snap ("häggvinter")
    if (month === 4 && temp > 12) {
        if (toolsEvents.isCooldown(store, 'calendar', 'haggBloom', 300)) {
            toolsEvents.add(store, 'calendar', 'haggBloom', 'hägg blooming - "häggvinter" cold snap may follow', 72);
        }
    }

    // Lilac bloom marks phenological summer; frost risk essentially past
    if (month === 5 && temp > TEMP.GROWTH_OPTIMAL) {
        if (toolsEvents.isCooldown(store, 'calendar', 'lilacBloom', 300)) {
            toolsEvents.add(store, 'calendar', 'lilacBloom', 'lilacs blooming - phenological summer has begun', 168);
        }
    }

    // Rowan flowers important for pollinators
    if (month === 5 && day >= 15) {
        if (toolsEvents.isCooldown(store, 'calendar', 'rowanFlower', 300)) {
            toolsEvents.add(store, 'calendar', 'rowanFlower', 'rowan flowering - important for pollinators', 168);
        }
    }

    // First snow psychologically significant; marks shift to winter mode
    if (month >= 9 && month <= 11 && snowDepth > SNOW.TRACE) {
        if (toolsEvents.isCooldown(store, 'calendar', 'firstSnow', 200)) {
            toolsEvents.add(store, 'calendar', 'firstSnow', 'first snow of the season - winter approaching', 48);
        }
    }

    // Lake freeze (isläggning) marks transition to winter activities
    if (month >= 11 && temp < -5) {
        if (toolsEvents.isCooldown(store, 'calendar', 'lakeFreeze', 300)) {
            toolsEvents.add(store, 'calendar', 'lakeFreeze', 'lakes beginning to freeze - "isläggning" winter taking hold', 168);
        }
    }

    // Birch leaf phenology linked to soil temperature; reliable planting indicator
    if (month === 4 && temp > TEMP.SOIL_WARM) {
        if (toolsEvents.isCooldown(store, 'calendar', 'potatoWisdom', 300)) {
            toolsEvents.add(store, 'calendar', 'potatoWisdom', '"when birch leaves are mouse-ear size, plant potatoes"', 168);
        }
    }

    // Cool spring delays pest emergence but extends grain fill period
    if (month === 5 && temp < TEMP.SOIL_WARM && state.gdd.base5 < 300) {
        if (toolsEvents.isCooldown(store, 'calendar', 'coldMay', 300)) {
            toolsEvents.add(store, 'calendar', 'coldMay', '"cold May fills the barn" - cool spring often means good harvest', 168);
        }
    }

    // Drought stress during grain fill concentrates protein
    if (month === 7 && temp > 25 && humidity < HUMIDITY.LOW) {
        if (toolsEvents.isCooldown(store, 'calendar', 'dryJuly', 300)) {
            toolsEvents.add(store, 'calendar', 'dryJuly', '"dry July, full barn" - drought stress can increase grain protein', 168);
        }
    }

    // Approaching nightless night: twilight merges with dawn at high latitudes
    if (month === 5 && daylight?.daylightHours > DAYLIGHT.LONG_DAY && !daylight?.isDaytime) {
        if (toolsEvents.isCooldown(store, 'calendar', 'nightlessApproach', 300)) {
            toolsEvents.add(store, 'calendar', 'nightlessApproach', 'twilight merging with dawn - the "nightless night" approaching', 168);
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// NIGHT SOUNDS AND ATMOSPHERE
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAtmosphere({ results, situation, dataCurrent }) {
    const { month, hour, daylight } = situation;
    const { temp, humidity, windSpeed } = dataCurrent;

    // Only relevant at night
    if (daylight?.isDaytime) return;

    // Summer night sounds: frogs need warm water, nightjar needs calm humid nights
    if (month >= 5 && month <= 8 && temp > TEMP.SOIL_WARM) {
        const sounds = [];

        // Frog chorus requires water temp >15°C
        if (temp > TEMP.GROWTH_OPTIMAL) {
            sounds.push('frog chorus from the lake');
        }

        // Nightjar "churrs" from perch in clearings; needs calm for sound to carry
        if (humidity > HUMIDITY.HIGH && windSpeed < WIND.CALM) {
            sounds.push('nightjar churring in forest clearings');
        }

        // Owls most vocal late night
        if (hour >= 22 || hour <= 3) {
            sounds.push('owls calling');
            // Corncrake rasping call from meadows; endangered, secretive
            if (month >= 5 && month <= 6) {
                sounds.push('corncrake rasping in meadows');
            }
        }

        if (sounds.length > 0) {
            results.phenomena.push(`atmosphere: night sounds, ${sounds.join(', ')}`);
        }
    }

    // Winter silence punctuated by frost sounds; ice on lakes "sings" as it expands
    if ((month >= 11 || month <= 2) && temp < -10 && windSpeed < WIND.CALM) {
        results.phenomena.push('atmosphere: night sounds, trees cracking in frost, ice singing on the lake');
    }

    // Nordic summer nights never fully dark; astronomical twilight persists at ~60°N
    if (month >= 5 && month <= 7 && temp > TEMP.SOIL_WARM && hour >= 22 && hour <= 3) {
        results.phenomena.push('atmosphere: magical Nordic summer night - never fully dark');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ store }) {
    if (!store.phenology)
        store.phenology = {
            gdd: { base5: 0, base10: 0, lastUpdate: undefined },
            frost: { lastDate: undefined, consecutiveFrostFreeDays: 0, chillHours: 0, growingSeasonActive: false },
            foraging: { mushroomMoisture: 0, berryRipeness: {} },
            wildlife: { lastPressureDrop: undefined, insectActivityLevel: 'dormant', lastMooseWarning: undefined },
            lake: { estimatedTemp: undefined, iceStatus: 'unknown' },
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
