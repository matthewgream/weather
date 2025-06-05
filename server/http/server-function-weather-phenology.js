// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

//const helpers = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function addEvent(store, category, eventId, message, durationHours = 24) {
    if (!store.events) {
        store.events = {};
        store.eventsCleanedUp = Date.now();
    }
    if (!store.events[category]) store.events[category] = {};
    const now = Date.now(),
        event = store.events[category][eventId];
    if (!event || now > event.expires) {
        store.events[category][eventId] = {
            message,
            detected: now,
            expires: now + durationHours * 60 * 60 * 1000,
            shown: false,
        };
        return true;
    }
    return false;
}
function getEvents(store, category) {
    if (!store.events || !store.events[category]) return [];
    const now = Date.now(),
        active = [];
    for (const [eventId, event] of Object.entries(store.events[category]))
        if (now <= event.expires) {
            active.push({
                id: eventId,
                ...event,
                isNew: !event.shown,
            });
            event.shown = true;
        }
    return active;
}

function checkEventCooldown(store, category, eventId, cooldownDays = 365) {
    if (!store.events || !store.events[category] || !store.events[category][eventId]) return true;
    const now = Date.now(),
        event = store.events[category][eventId];
    return now > event.detected + cooldownDays * 24 * 60 * 60 * 1000;
}

function eventsCleanup(store, daysAgo = 30) {
    if (!store.events || Date.now() - store.eventsCleanedUp < 24 * 60 * 60 * 1000) return;
    const expiry = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
    Object.entries(store.events).forEach(([category, events]) => {
        Object.entries(events)
            .filter(([_, event]) => event.expires < expiry)
            .forEach(([eventId]) => delete store.events[category][eventId]);
    });
    store.eventsCleanedUp = Date.now();
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateGDD(temp, baseTemp = 5, maxTemp = 30) {
    if (temp === undefined) return 0;
    return Math.max(0, Math.max(baseTemp, Math.min(temp, maxTemp)) - baseTemp);
}

function isChillHour(temp) {
    return temp !== undefined && temp >= 0 && temp <= 7;
}

function getRecentRainfall(data_previous, daysBack = 7) {
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    return Object.entries(data_previous)
        .filter(([timestamp, entry]) => timestamp > cutoff && entry.rainRate !== undefined)
        .reduce((total, [_, entry]) => total + entry.rainRate / 60, 0); // Approximate mm
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// CULTIVATION: Gardens, Crops, and Farm Animals
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCultivation(results, situation, data, data_previous, store, _options) {
    const { timestamp, temp, humidity, rainRate, snowDepth, windSpeed, cloudCover } = data;
    const { month, day, daylight } = situation;

    if (!store.cultivation)
        store.cultivation = {
            gddAccumulation: 0,
            gddBase5: 0, // For grass/pasture
            gddBase10: 0, // For warm crops
            lastGddUpdate: undefined,
            chillHours: 0,
            consecutiveFrostFreeDays: 0,
            lastFrostDate: undefined,
            growingSeasonActive: false,
        };

    // GDD tracking with multiple base temperatures
    if (temp !== undefined) {
        const today = new Date(timestamp);
        today.setHours(0, 0, 0, 0);

        if (!store.cultivation.lastGddUpdate || store.cultivation.lastGddUpdate < today.getTime()) {
            store.cultivation.gddBase5 += calculateGDD(temp, 5);
            store.cultivation.gddBase10 += calculateGDD(temp, 10);
            store.cultivation.lastGddUpdate = today.getTime();

            // Reset on January 1
            if (month === 0 && day === 1) {
                store.cultivation.gddBase5 = 0;
                store.cultivation.gddBase10 = 0;
            }
        }
    }

    // Check for frost in last 24 hours
    const twentyFourHoursAgo = timestamp - 24 * 60 * 60 * 1000;
    let hadFrost = false;
    Object.entries(data_previous)
        .filter(([timestamp, entry]) => timestamp > twentyFourHoursAgo && entry.temp !== undefined && entry.temp <= 0)
        .forEach(() => {
            hadFrost = true;
        });

    if (temp !== undefined) {
        // Frost tracking
        if (temp <= 0) {
            hadFrost = true;
            store.cultivation.lastFrostDate = timestamp;
            store.cultivation.consecutiveFrostFreeDays = 0;
            if ((month >= 8 || month <= 2) && checkEventCooldown(store, 'cultivation', 'firstFrost', 180))
                addEvent(store, 'cultivation', 'firstFrost', 'first frost of the season - protect tender plants', 48);
        } else if (!hadFrost) store.cultivation.consecutiveFrostFreeDays++;

        // Last spring frost (shows for 7 days as it's very important)
        if (month >= 3 && month <= 5 && store.cultivation.consecutiveFrostFreeDays > 14)
            if (checkEventCooldown(store, 'cultivation', 'lastSpringFrost', 300))
                addEvent(store, 'cultivation', 'lastSpringFrost', 'probable last spring frost has passed - safe for tender plants', 168);

        // Growing season
        if (!store.cultivation.growingSeasonActive && month >= 4 && month <= 9 && store.cultivation.consecutiveFrostFreeDays > 14 && temp > 5) {
            store.cultivation.growingSeasonActive = true;
            addEvent(store, 'cultivation', 'growingSeasonStart', 'growing season has begun', 72);
        } else if (store.cultivation.growingSeasonActive && hadFrost && month >= 9) {
            store.cultivation.growingSeasonActive = false;
            addEvent(store, 'cultivation', 'growingSeasonEnd', 'growing season ending - harvest remaining crops', 72);
        }

        // Chill hours for fruit trees
        if (month >= 9 || month <= 3) {
            if (isChillHour(temp)) {
                switch (++store.cultivation.chillHours) {
                    case 400: {
                        addEvent(store, 'cultivation', 'chillHours400', 'early apple varieties reaching chill requirement', 24);
                        break;
                    }
                    case 800: {
                        addEvent(store, 'cultivation', 'chillHours800', 'most apple and pear varieties have met chill requirements', 24);
                        break;
                    }
                    case 1200: {
                        addEvent(store, 'cultivation', 'chillHours1200', 'all fruit trees have sufficient chill hours', 24);
                        break;
                    }
                }
            }
        } else if (month === 4)
            // Reset chill hours in April
            store.cultivation.chillHours = 0;

        // Värmland-specific crop timing

        // Potatoes (major crop in Värmland)
        if (month === 4 && temp > 8 && snowDepth === 0 && store.cultivation.consecutiveFrostFreeDays > 7)
            addEvent(store, 'cultivation', 'potatoPlanting', 'soil warming - early potato planting can begin', 168);
        if (month === 5 && temp > 10) addEvent(store, 'cultivation', 'mainPotatoPlanting', 'main potato planting period - soil conditions optimal', 168);
        if (month === 6 && store.cultivation.gddBase5 > 500)
            addEvent(store, 'cultivation', 'potatoFlowering', 'potatoes flowering - critical period for blight watch', 72);
        if (month === 8 && day >= 20) addEvent(store, 'cultivation', 'earlyPotatoHarvest', 'early potatoes ready for harvest', 168);

        // Grain crops (oats, barley, wheat - traditional in Värmland)
        if (month === 4 && temp > 5 && store.cultivation.gddBase5 > 100)
            addEvent(store, 'cultivation', 'springGrainSowing', 'spring grain sowing time (oats, barley, wheat)', 168);
        if (month === 7 && store.cultivation.gddBase5 > 900) addEvent(store, 'cultivation', 'grainFlowering', 'grain crops flowering - avoid spraying', 72);
        if (month === 8 && store.cultivation.gddBase5 > 1200 && humidity < 70)
            addEvent(store, 'cultivation', 'grainHarvest', 'grain harvest conditions approaching', 168);

        // Pasture and hay (crucial for dairy farming)
        if (month === 4 && store.cultivation.gddBase5 > 150) addEvent(store, 'cultivation', 'pastureGrowth', 'pasture grass beginning rapid growth', 72);
        if (month === 5 && temp > 12) addEvent(store, 'cultivation', 'cattleToSummerPasture', 'traditional time to move cattle to summer pastures', 72);
        if (month === 6 && store.cultivation.gddBase5 > 600 && rainRate === 0)
            addEvent(store, 'cultivation', 'firstHayCut', 'optimal first hay cutting conditions', 72);
        if (month === 7 && day >= 20 && rainRate === 0) addEvent(store, 'cultivation', 'secondHayCut', 'second hay cut timing', 72);

        // Root vegetables (turnips, rutabaga - traditional fodder crops)
        if (month === 5 && temp > 10) addEvent(store, 'cultivation', 'rootVegPlanting', 'plant turnips and rutabaga for autumn harvest', 72);

        // Berry crops (important in Värmland)
        if (month === 5 && store.cultivation.gddBase5 > 250)
            addEvent(store, 'cultivation', 'strawberryFlowering', 'strawberries flowering - protect from late frost', 72);
        if (month === 7 && store.cultivation.gddBase5 > 700) addEvent(store, 'cultivation', 'raspberryHarvest', 'raspberries ripening - begin harvest', 168);
        if (month === 8) addEvent(store, 'cultivation', 'blackcurrantHarvest', 'blackcurrants ready for harvest', 168);

        if (temp > 25 && month >= 6 && month <= 8 && humidity < 40) {
            results.alerts.push('irrigation needed for vegetable gardens');
            results.phenomena.push('water stress likely in shallow-rooted crops');
        }
        if (temp < 3 && temp > -2 && month >= 4 && month <= 5 && cloudCover < 50) {
            results.alerts.push('radiation frost risk tonight');
            results.phenomena.push('cover sensitive plants or run irrigation');
        }

        // Pollination conditions
        if (month === 5 && temp > 15 && temp < 25 && windSpeed < 5 && rainRate === 0 && daylight.isDaytime)
            results.phenomena.push('excellent fruit tree pollination weather');

        // Disease pressure
        if (temp > 15 && humidity > 80 && month >= 6 && month <= 8) results.phenomena.push('high disease pressure - check for potato blight');
    }

    // Farm animal considerations
    if (temp !== undefined) {
        // Dairy cattle (major in Värmland)
        if (temp < -15 && windSpeed > 5) {
            results.alerts.push('severe cold stress for outdoor livestock');
            results.phenomena.push('ensure adequate shelter and unfrozen water');
        }
        if (temp > 25 && humidity > 70) {
            results.alerts.push('heat stress risk for dairy cattle');
            results.phenomena.push('ensure shade and water access');
        }

        // Sheep (common in Värmland)
        if (month === 4 && temp > 10 && rainRate === 0)
            addEvent(store, 'cultivation', 'sheepShearing', 'sheep shearing weather - dry conditions essential', 72);
        if (month === 5 && temp > 12) addEvent(store, 'cultivation', 'lambsToPassture', 'lambs ready for spring pasture', 48);

        // Pigs (outdoor)
        if (temp > 25) results.phenomena.push('provide wallows or sprinklers for outdoor pigs');
        if (temp < -10 && windSpeed > 3) results.phenomena.push('deep bedding needed for outdoor pigs');

        // Poultry
        if (daylight.daylightHours < 10 && month >= 10 && month <= 2) results.phenomena.push('supplemental lighting needed for egg production');
        if (temp < -20) results.alerts.push('check poultry water - prevent freezing');
    }

    getEvents(store, 'cultivation')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(event.message));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// WILD NATURE: Forest, Wild Plants, Berries, Mushrooms
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretWildNature(results, situation, data, data_previous, store, _options) {
    const { temp, humidity, snowDepth } = data;
    const { month, day, daylight } = situation;

    if (!store.wildnature)
        store.wildnature = {
            mushroomMoisture: 0,
            forestFloorTemp: temp || 10,
        };

    // Track moisture for mushrooms
    const recentRain = getRecentRainfall(data_previous, 7);
    store.wildnature.mushroomMoisture = Math.max(0, Math.min(100, recentRain * 2));

    if (temp !== undefined) {
        // Wild berries (Värmland specialties)

        // Cloudberries (hjortron) - grows in boggy areas
        if (month === 5 && temp > 10) addEvent(store, 'wildnature', 'cloudberryFlower', 'cloudberries flowering in bog areas', 72);
        if (month === 7 && day >= 20) addEvent(store, 'wildnature', 'cloudberryRipe', 'cloudberries ripening - prime foraging time', 168);

        // Bilberries/Blueberries (blåbär) - most common
        if (month === 6 && store.cultivation?.gddBase5 > 500) addEvent(store, 'wildnature', 'bilberryFlower', 'bilberries flowering in forest', 48);
        if (month === 7 && store.cultivation?.gddBase5 > 800)
            addEvent(store, 'wildnature', 'bilberryRipe', 'bilberries ripening - forest floors turning blue', 336); // 2 weeks

        // Lingonberries (lingon)
        if (month === 8 && day >= 15) addEvent(store, 'wildnature', 'lingonberryFirst', 'first lingonberries beginning to ripen', 168);
        if (month === 9) addEvent(store, 'wildnature', 'lingonberryPrime', 'lingonberry harvest at peak - traditional preserving time', 336);

        // Wild raspberries (vilda hallon)
        if (month === 7 && temp > 18) addEvent(store, 'wildnature', 'wildRaspberry', 'wild raspberries ripe in sunny forest edges', 168);

        // Mushrooms (major foraging activity in Värmland)
        // Morels (murklor) - spring delicacy
        if (month === 4 && temp > 10 && store.wildnature.mushroomMoisture > 30)
            addEvent(store, 'wildnature', 'morelSeason', 'morel mushrooms emerging - check burned areas', 168);
        // Chanterelles (kantareller) - most popular
        if (month === 6 && temp > 15 && store.wildnature.mushroomMoisture > 40)
            addEvent(store, 'wildnature', 'chanterelleEarly', 'early chanterelles appearing in mossy spruce forests', 72);
        if (month === 7 && recentRain > 20 && temp > 12)
            addEvent(store, 'wildnature', 'chanterellePrime', 'prime chanterelle season - abundant in forests', 336);
        // Porcini/Ceps (karljohan)
        if (month === 7 && temp > 15 && store.wildnature.mushroomMoisture > 50)
            addEvent(store, 'wildnature', 'porciniStart', 'porcini mushrooms beginning - check pine forests', 168);
        if (month === 8 && recentRain > 30) addEvent(store, 'wildnature', 'porciniPeak', 'peak porcini season - excellent foraging', 336);
        // Hedgehog mushrooms (blek taggsvamp)
        if (month === 8 && temp < 20 && temp > 10) addEvent(store, 'wildnature', 'hedgehogMushroom', 'hedgehog mushrooms abundant - easy to identify', 336);
        // Funnel chanterelles (trattkantareller)
        if (month === 9 && temp < 15 && recentRain > 20)
            addEvent(store, 'wildnature', 'funnelChanterelle', 'funnel chanterelles in abundance - late season favorite', 336);

        // Forest flowers and plants
        if (month === 3 && temp > 5 && snowDepth < 100) addEvent(store, 'wildnature', 'hepatica', 'hepatica (blåsippa) blooming - first forest flower', 72);
        if (month === 4 && temp > 8) addEvent(store, 'wildnature', 'woodAnemone', 'wood anemones carpeting forest floor', 168);
        if (month === 5 && temp > 12) addEvent(store, 'wildnature', 'lilyValley', 'lily of the valley blooming in shaded areas', 168);

        // Tree phenology
        if (month === 2 && temp > 5) addEvent(store, 'wildnature', 'sapRising', 'birch sap rising - traditional tapping period', 168);
        if (month === 4 && temp > 10) addEvent(store, 'wildnature', 'birchLeafBurst', 'birch leaves emerging - "mouse ear" stage marks true spring', 72);
        if (month === 9 && temp < 10) addEvent(store, 'wildnature', 'autumnColors', 'autumn colors beginning - birches turning golden', 336);

        // Special forest conditions
        if (humidity > 90 && temp > 10 && temp < 20 && month >= 7 && month <= 9) results.phenomena.push('perfect mushroom growing conditions');

        if (month >= 6 && month <= 8 && recentRain < 5 && humidity < 30) {
            results.alerts.push('extreme forest fire risk');
            results.phenomena.push('avoid open fires - forest floor very dry');
        }

        // Traditional foraging wisdom
        if (month === 8 && humidity > 70 && !daylight.isDaytime) results.phenomena.push('morning dew good for mushroom spotting');
    }

    getEvents(store, 'wildnature')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(event.message));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// WILDLIFE: Animals, Birds, Fish, Insects
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretWildlife(results, situation, data, data_previous, store, _options) {
    const { timestamp, temp, pressure, windSpeed, humidity, rainRate, snowDepth } = data;
    const { month, hour, daylight, minutes } = situation;

    if (!store.wildlife)
        store.wildlife = {
            lastPressureDrop: undefined,
            insectActivityLevel: 'dormant',
        };

    // Pressure changes affect animal behavior
    if (pressure !== undefined) {
        const threeHoursAgo = timestamp - 3 * 60 * 60 * 1000;
        let pressure3hAgo;
        Object.entries(data_previous)
            .filter(([timestamp, entry]) => timestamp > threeHoursAgo && entry.pressure !== undefined)
            .sort(([a], [b]) => a - b)
            .forEach(([_, entry]) => {
                if (pressure3hAgo === undefined) pressure3hAgo = entry.pressure;
            });
        if (pressure3hAgo && pressure < pressure3hAgo - 3) {
            store.wildlife.lastPressureDrop = timestamp;
            results.phenomena.push('wildlife feeding actively before weather change');
        }
    }

    if (temp !== undefined) {
        // Värmland-specific wildlife

        // Moose (älg) - iconic Swedish animal
        const isDawnDusk = Math.abs(hour + minutes / 60 - daylight.sunriseDecimal) < 1 || Math.abs(hour + minutes / 60 - daylight.sunsetDecimal) < 1;

        if (isDawnDusk && temp > -10 && temp < 20 && windSpeed < 5) results.phenomena.push('moose most active - drive carefully');
        if (month >= 8 && month <= 10) addEvent(store, 'wildlife', 'mooseRut', 'moose rutting season - bulls aggressive and unpredictable', 720); // 30 days

        // Roe deer (rådjur)
        if ((hour >= 4 && hour <= 7) || (hour >= 17 && hour <= 20)) if (temp > -5 && windSpeed < 5) results.phenomena.push('roe deer grazing in forest edges');
        if (month === 7 || month === 8) addEvent(store, 'wildlife', 'roeDeerRut', 'roe deer rutting season - increased activity', 720);

        // Wild boar (vildsvin) - increasing in Värmland
        if (!daylight.isDaytime && temp > 0 && month >= 4 && month <= 10) results.phenomena.push('wild boar may be active in forests');

        // Brown bear (björn)
        if (month === 3 && temp > 5) addEvent(store, 'wildlife', 'bearEmerge', 'bears emerging from hibernation - be alert in forests', 168);
        if (month >= 7 && month <= 9) addEvent(store, 'wildlife', 'bearBerry', 'bears feeding heavily on berries - make noise when foraging', 720);
        if (month === 10 && temp < 5) addEvent(store, 'wildlife', 'bearDenning', 'bears preparing for hibernation - very active feeding', 168);

        // Wolves (varg) - present in Värmland
        if (snowDepth > 100 && temp < -5) results.phenomena.push('wolf pack hunting patterns change - following prey in deep snow');

        // Lynx (lodjur)
        if (month >= 2 && month <= 3) addEvent(store, 'wildlife', 'lynxMating', 'lynx mating season - vocal in forests', 168);

        // Beavers (bäver)
        if (month === 9 || month === 10) addEvent(store, 'wildlife', 'beaverActive', 'beavers preparing for winter - dam building activity high', 336);

        // Birds - Värmland specifics
        // Cranes (tranor)
        if (month === 3 && temp > 5) addEvent(store, 'wildlife', 'craneArrival', 'cranes returning from migration - listen for trumpeting calls', 168);
        if (month === 9 && pressure > 1015) addEvent(store, 'wildlife', 'craneMigration', 'crane migration southward - large flocks visible', 336);
        // Capercaillie (tjäder)
        if (month === 4 && hour >= 3 && hour <= 6 && temp > 0)
            addEvent(store, 'wildlife', 'capercaillieLek', 'capercaillie lekking season - dawn displays in old forests', 168);
        // Black grouse (orre)
        if (month === 4 && hour >= 4 && hour <= 7) addEvent(store, 'wildlife', 'blackGrouseLek', 'black grouse lekking on forest bogs', 168);
        // Woodpeckers
        if (month === 3 && temp > 5) addEvent(store, 'wildlife', 'woodpeckerDrumming', 'woodpeckers drumming to establish territories', 72);
        // Migratory songbirds
        if (month === 4 && temp > 10) addEvent(store, 'wildlife', 'songbirdReturn', 'migratory songbirds returning - dawn chorus intensifying', 168);

        // Fish - Värmland lakes and rivers
        // Pike (gädda)
        if (month === 3 && temp > 4) addEvent(store, 'wildlife', 'pikeSpawning', 'pike moving to shallow waters for spawning', 168);
        // Perch (abborre)
        if (month === 4 && temp > 8) addEvent(store, 'wildlife', 'perchSpawning', 'perch spawning in shallow lake areas', 72);
        // Salmon and trout (lax och öring)
        if (month >= 8 && month <= 10 && temp < 15) addEvent(store, 'wildlife', 'salmonRun', 'salmon and sea trout running up rivers', 720);
        // Grayling (harr)
        if (month === 5 && temp > 10) addEvent(store, 'wildlife', 'graylingActive', 'grayling actively feeding - good fly fishing', 168);

        // Insects
        if (temp < 10) {
            store.wildlife.insectActivityLevel = 'dormant';
        } else if (temp >= 10 && temp < 15) {
            store.wildlife.insectActivityLevel = 'low';
            if (month === 3) addEvent(store, 'wildlife', 'bumblebeeQueens', 'bumblebee queens emerging - first pollinators active', 72);
        } else if (temp >= 15) {
            store.wildlife.insectActivityLevel = 'moderate';
            if (month === 5 && humidity > 60) addEvent(store, 'wildlife', 'mosquitoHatch', 'mosquito hatching beginning - protect yourself outdoors', 168);
            if (month === 6 && hour >= 21 && hour <= 23) results.phenomena.push('peak mosquito activity time');
        }

        // Ticks (fästingar) - important health concern
        if (temp > 5 && month >= 3 && month <= 11) if (humidity > 70 || rainRate > 0) results.phenomena.push('high tick activity - check after forest walks');

        // Amphibians
        if (month === 3 && temp > 5 && (rainRate > 0 || humidity > 80))
            addEvent(store, 'wildlife', 'frogMigration', 'frogs migrating to breeding ponds - watch for road crossings', 72);
        if (month === 4 && temp > 8) addEvent(store, 'wildlife', 'frogSpawn', 'frog spawning in ponds and wetlands', 168);

        // General wildlife feeding patterns
        if (store.wildlife.lastPressureDrop && timestamp - store.wildlife.lastPressureDrop < 6 * 3600000)
            results.phenomena.push('wildlife feeding intensely before storm');

        // Fishing conditions based on weather
        if (pressure > 1015 && pressure < 1025 && windSpeed < 5)
            if ((hour >= 4 && hour <= 8) || (hour >= 17 && hour <= 21)) results.phenomena.push('excellent fishing conditions');
    }

    getEvents(store, 'wildlife')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(event.message));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// SEASONAL MARKERS: Traditional and Natural Calendar Events
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSeasonalMarkers(results, situation, data, data_previous, store, _options) {
    const { temp, snowDepth, rainRate } = data;
    const { month, day, daylight } = situation;

    // Spring markers
    if (month === 2 && day === 24) addEvent(store, 'seasonal', 'stMatthias', 'St. Matthias Day - "Matthias breaks the ice, if he finds any"', 24);
    if (month === 3 && day === 25) addEvent(store, 'seasonal', 'ladyDay', 'Vårfrudagen (Lady Day) - traditional start of spring farm work', 24);
    if (month === 4 && day === 30) addEvent(store, 'seasonal', 'walpurgis', 'Walpurgis Night - welcoming spring with bonfires', 24);

    // Summer markers
    if (month === 5 && day === 25) addEvent(store, 'seasonal', 'urbanDay', 'Urban\'s Day - "what weather Urban gives, stays for three weeks"', 24);
    if (month === 6 && day >= 19 && day <= 26 && daylight.daylightHours > 18)
        addEvent(store, 'seasonal', 'midsummer', 'Midsummer period - peak of light and traditional celebrations', 168);

    // Autumn markers
    if (month === 7 && day === 29) addEvent(store, 'seasonal', 'olofsDay', "Olof's Day - traditional harvest weather prediction day", 24);
    if (month === 8 && day === 24) addEvent(store, 'seasonal', 'bartholDay', 'Bartholomew\'s Day - "autumn shows its intentions"', 24);
    if (month === 9 && day === 29) addEvent(store, 'seasonal', 'michaelmas', 'Michaelmas - traditional end of harvest season', 24);

    // Winter markers
    if (month === 10 && day === 14) addEvent(store, 'seasonal', 'winterNights', 'Winter Nights - old calendar winter beginning', 24);
    if (month === 11 && day === 11) addEvent(store, 'seasonal', 'martinmas', 'St. Martin\'s Day - "Martin\'s geese" weather prediction', 24);
    if (month === 11 && day === 30) addEvent(store, 'seasonal', 'stAndrew', "St. Andrew's Day - traditional start of Christmas season", 24);

    // Natural phenological markers
    if (temp !== undefined) {
        // Ice breakup
        if (month === 3 && temp > 5 && checkEventCooldown(store, 'seasonal', 'iceBreakup', 300))
            addEvent(store, 'seasonal', 'iceBreakup', 'lake ice beginning to break up - spring truly arriving', 168);
        // First flowers
        if (month === 3 && temp > 5 && snowDepth < 50 && checkEventCooldown(store, 'seasonal', 'coltsfoot', 300))
            addEvent(store, 'seasonal', 'coltsfoot', 'tussilago (coltsfoot) blooming - first flower of spring', 72);
        // Birch leaf
        if (month === 4 && temp > 10 && checkEventCooldown(store, 'seasonal', 'birchLeaf', 300))
            addEvent(store, 'seasonal', 'birchLeaf', 'birch leaves size of mouse ears - phenological spring', 72);
        // Lilac bloom
        if (month === 5 && temp > 15 && checkEventCooldown(store, 'seasonal', 'lilacBloom', 300))
            addEvent(store, 'seasonal', 'lilacBloom', 'lilacs blooming - phenological summer begins', 168);
        // Rowan berries
        if (month === 8 && day >= 15 && checkEventCooldown(store, 'seasonal', 'rowanBerries', 300))
            addEvent(store, 'seasonal', 'rowanBerries', 'rowan berries turning red - sign of approaching autumn', 168);
        // First snow
        if (month >= 9 && month <= 11 && snowDepth > 0 && checkEventCooldown(store, 'seasonal', 'firstSnow', 200))
            addEvent(store, 'seasonal', 'firstSnow', 'first snow of the season - winter approaching', 48);
        // Lake freeze
        if (month >= 11 && temp < -5 && checkEventCooldown(store, 'seasonal', 'lakeFreeze', 300))
            addEvent(store, 'seasonal', 'lakeFreeze', 'lakes beginning to freeze - winter taking hold', 168);
    }

    // Traditional weather wisdom
    if (month === 2 && day === 2) {
        if (temp > 0 && rainRate > 0) results.phenomena.push('Candlemas thaw - "better a wolf in the stable than a warm Candlemas"');
        else if (temp < -5) results.phenomena.push('cold Candlemas - traditionally means early spring');
    }

    if (month === 6 && day === 8) if (temp > 20) results.phenomena.push('St. Medardus warm - "as Medardus, so 40 days after"');

    // Show active events
    getEvents(store, 'seasonal')
        .filter((event) => event.isNew)
        .forEach((event) => results.phenomena.push(event.message));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretPhenology(results, situation, data, data_previous, store, _options) {
    const { temp, humidity, windSpeed } = data;
    const { month, hour, daylight } = situation;

    if (month >= 5 && month <= 8 && temp > 15 && humidity > 60 && windSpeed < 5)
        if (daylight.isDaytime && store.wildlife?.insectActivityLevel === 'moderate') results.phenomena.push('ideal conditions for garden pollination');

    // Traditional sayings that combine multiple factors
    if (month === 5 && temp < 10 && store.events?.seasonal?.birchLeaf)
        results.phenomena.push('"cold May fills the barn" - cool spring often means good harvest');
    if (month === 7 && temp > 25 && humidity < 40) results.phenomena.push('"dry July - wet barn" - drought stress can increase grain protein');

    // Night observations
    if (!daylight.isDaytime && hour >= 22 && hour <= 4)
        if (month >= 5 && month <= 7 && temp > 10) results.phenomena.push('summer night wildlife activity - hedgehogs, bats active');

    eventsCleanup(store);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (_options) {
    return {
        interpretCultivation,
        interpretWildNature,
        interpretWildlife,
        interpretSeasonalMarkers,
        interpretPhenology,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
