// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');

const EQUINOX_LOOKAHEAD_DAYS = 14;
const SOLSTICE_LOOKAHEAD_DAYS = 14;
const CROSSQUARTER_LOOKAHEAD_DAYS = 7;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretEquinox(results, situation, data, _data_previous, _store, _options) {
    const { windSpeed } = data;
    const { date, location } = situation;

    const equinoxInfo = helpers.isNearEquinox(date, location.hemisphere, EQUINOX_LOOKAHEAD_DAYS);
    if (equinoxInfo.near) {
        // Basic info if near
        let equinoxText;
        if (equinoxInfo.exact) equinoxText = 'today (equal day and night)';
        else if (equinoxInfo.days > 0) equinoxText = `in ${Math.ceil(equinoxInfo.days)} day${Math.ceil(equinoxInfo.days) > 1 ? 's' : ''}`;
        else equinoxText = `${Math.abs(Math.floor(equinoxInfo.days))} day${Math.abs(Math.floor(equinoxInfo.days)) > 1 ? 's' : ''} ago`;
        results.phenomena.push(`${equinoxInfo.type} ${equinoxText}`);

        // Daylight change rate
        results.phenomena.push(`rapidly ${equinoxInfo.type.includes('spring') ? 'increasing' : 'decreasing'} daylight`);

        // Calculate approximate daylight change rate
        if (location.latitude > 50)
            results.phenomena.push(`daylight changing ~${Math.round(Math.abs(Math.sin((location.latitude * Math.PI) / 180)) * 4)} min/day`);

        // Equinox storms
        if (Math.abs(equinoxInfo.days) <= 3 && windSpeed > 10) results.phenomena.push('equinoctial gales');

        // Aurora activity
        if (location.latitude > 55 && Math.abs(equinoxInfo.days) <= 7) results.phenomena.push('enhanced aurora activity period');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolstice(results, situation, data, _data_previous, _store, _options) {
    const { cloudCover, snowDepth, temp } = data;
    const { date, hour, location, daylight } = situation;

    const solsticeInfo = helpers.isNearSolstice(date, location.hemisphere, SOLSTICE_LOOKAHEAD_DAYS);
    if (solsticeInfo.near) {
        // Basic info if near
        let solsticeText;
        if (solsticeInfo.exact) solsticeText = 'today';
        else if (solsticeInfo.days > 0) solsticeText = `in ${Math.ceil(solsticeInfo.days)} day${Math.ceil(solsticeInfo.days) > 1 ? 's' : ''}`;
        else solsticeText = `${Math.abs(Math.floor(solsticeInfo.days))} day${Math.abs(Math.floor(solsticeInfo.days)) > 1 ? 's' : ''} ago`;
        results.phenomena.push(`${solsticeInfo.type} ${solsticeText}`);

        if (solsticeInfo.type === 'longest day') {
            // Summer solstice phenomena
            if (daylight.daylightHours > 16) {
                results.phenomena.push('extended daylight hours');
                if (daylight.daylightHours > 18) results.phenomena.push(`${Math.round(daylight.daylightHours)} hours of daylight`);
            }

            // Latitude variations
            if (location.latitude > 59.5) {
                if (location.latitude > 66.5 && daylight.daylightHours >= 24) {
                    results.phenomena.push('true midnight sun (sun never sets)');
                    if (cloudCover !== undefined && cloudCover < 50) results.phenomena.push('midnight sun visible');
                } else if (location.latitude > 63) {
                    results.phenomena.push('near-midnight sun');
                    if (daylight.civilDuskDecimal > 23 || daylight.civilDawnDecimal < 1) results.phenomena.push('no true darkness (civil twilight all night)');
                } else if (location.latitude > 60) {
                    results.phenomena.push('white nights period');
                    results.phenomena.push('twilight throughout the night');
                }
            }

            // Full moon during summer solstice
            const lunarPhase = helpers.getLunarPhase(date);
            if (lunarPhase >= 0.48 && lunarPhase <= 0.52) {
                results.phenomena.push('solstice full moon (rare astronomical event)');
                if (cloudCover !== undefined && cloudCover < 40) results.phenomena.push('strawberry moon visible');
            }

            // Cultural phenomena
            if (location.latitude > 55) if (Math.abs(solsticeInfo.days) <= 3) results.phenomena.push('midsummer celebration period');
        } else if (solsticeInfo.type === 'shortest day') {
            // Winter solstice phenomena
            if (daylight.daylightHours < 8) {
                results.phenomena.push(`brief daylight (${Math.round(daylight.daylightHours)} hours)`);
                if (daylight.daylightHours < 6) results.phenomena.push('minimal daylight period');
            }

            // Latitude variations
            if (location.latitude > 59.5) {
                results.phenomena.push('extended darkness period');
                if (location.latitude > 66.5 && daylight.daylightHours < 0.1) results.phenomena.push('polar night (sun never rises)');
                else if (location.latitude > 63) {
                    results.phenomena.push('near-polar twilight');
                    if (daylight.daylightHours < 3) results.phenomena.push('sun barely above horizon');
                } else if (location.latitude > 60) {
                    results.phenomena.push('very short days');
                    if (hour >= 14 && !daylight.isDaytime) results.phenomena.push('afternoon darkness');
                }
            }

            // Full moon during winter solstice
            const lunarPhase = helpers.getLunarPhase(date);
            if (lunarPhase >= 0.48 && lunarPhase <= 0.52) {
                results.phenomena.push('winter solstice full moon');
                if (cloudCover !== undefined && cloudCover < 40) {
                    results.phenomena.push('cold moon illuminating snow');
                    if (snowDepth > 50) results.phenomena.push('moonlight reflected by snow cover');
                }
            }

            // Temperature-related solstice phenomena
            if (temp !== undefined && temp < -10 && Math.abs(solsticeInfo.days) <= 7) results.phenomena.push('deep winter cold near solstice');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCrossQuarter(results, situation, _data, _data_previous, _store, _options) {
    const { date, hour, location, daylight } = situation;

    const crossQuarterInfo = helpers.isNearCrossQuarter(date, location.hemisphere, CROSSQUARTER_LOOKAHEAD_DAYS);
    if (crossQuarterInfo.near) {
        // Basic info if near
        let crossQuarterText;
        if (crossQuarterInfo.exact) crossQuarterText = 'today';
        else if (crossQuarterInfo.days > 0) crossQuarterText = `in ${Math.ceil(crossQuarterInfo.days)} day${Math.ceil(crossQuarterInfo.days) > 1 ? 's' : ''}`;
        else crossQuarterText = `${Math.abs(Math.floor(crossQuarterInfo.days))} day${Math.abs(Math.floor(crossQuarterInfo.days)) > 1 ? 's' : ''} ago`;

        // Add cultural concontext for cross-quarter days
        let context;
        if (crossQuarterInfo.name.includes('Imbolc')) context = 'traditional start of spring';
        else if (crossQuarterInfo.name.includes('Beltane'))
            context = 'traditional start of summer' + (location.latitude > 58 && hour >= 21 && daylight.isDaytime ? ': Beltane white nights' : '');
        else if (crossQuarterInfo.name.includes('Lughnasadh')) context = 'traditional harvest festival';
        else if (crossQuarterInfo.name.includes('Samhain'))
            context = 'traditional start of winter' + (hour >= 16 && !daylight.isDaytime ? ': Samhain early darkness' : '');

        results.phenomena.push(`cross-quater ${crossQuarterInfo.name} ${crossQuarterText}${context ? ' (' + context + ')' : ''}`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretMoonPhase(results, situation, data, _data_previous, store, _options) {
    const { cloudCover, snowDepth, humidity, temp } = data;
    const { date, month, day, hour, location } = situation;

    if (!store.astronomy) store.astronomy = {};
    if (store.astronomy?.currentMonth !== month) {
        store.astronomy.firstFullMoonDay = undefined;
        store.astronomy.firstFullMoonMonth = undefined;
        store.astronomy.currentMonth = month;
        store.astronomy.moonPhaseHistory = [];
    }

    const lunarPhase = helpers.getLunarPhase(date),
        lunarDistance = helpers.getLunarDistance(date);

    store.astronomy.moonPhaseHistory.push({ date, phase: lunarPhase });
    if (store.astronomy.moonPhaseHistory.length > 30) store.astronomy.moonPhaseHistory.shift();

    // Show moon distance info for all phases (not just full moon)
    if (lunarDistance.isSupermoon) {
        results.phenomena.push('supermoon - moon at closest approach');
        if (lunarPhase >= 0.48 && lunarPhase <= 0.52)
            results.phenomena.push(
                `supermoon appears larger and brighter: ${Math.round(((384400 - lunarDistance.distance) / 384400) * 100)}% closer than average`
            );
        else if (lunarPhase >= 0.98 || lunarPhase <= 0.02) results.phenomena.push('super new moon - extra high tides expected');
    } else if (lunarDistance.isMicromoon) {
        if (lunarPhase >= 0.48 && lunarPhase <= 0.52)
            results.phenomena.push(
                `micromoon - appears smaller and dimmer: ${Math.round(((lunarDistance.distance - 384400) / 384400) * 100)}% farther than average`
            );
    }

    const zodiac = helpers.getLunarZodiacSign(date);

    if (lunarPhase >= 0.48 && lunarPhase <= 0.52) {
        // Full moon
        results.phenomena.push('full moon tonight');

        if (!store.astronomy.firstFullMoonDay) {
            store.astronomy.firstFullMoonDay = day;
            store.astronomy.firstFullMoonMonth = month;
        } else if (month === store.astronomy.firstFullMoonMonth && day !== store.astronomy.firstFullMoonDay) {
            results.phenomena.push('blue moon (second full moon this month)');
            results.alerts.push('rare blue moon occurrence');
        }

        // Moon visibility conditions
        if (cloudCover !== undefined) {
            if (cloudCover < 30) {
                results.phenomena.push('clear skies for moon viewing');
                if (temp !== undefined && temp < -5 && humidity < 50) results.phenomena.push('crisp moonlight conditions');
            } else if (cloudCover < 70) results.phenomena.push('partial moon visibility through clouds');
            else results.phenomena.push('moon obscured by clouds');
        }

        // Snow and moon interaction
        if (snowDepth > 50 && cloudCover !== undefined && cloudCover < 40) {
            results.phenomena.push('bright moonlit snow landscape');
            if (temp < -10) results.phenomena.push('sparkling snow crystals in moonlight');
        }

        // Special full moon names
        const moonNames = [
            'wolf moon',
            'snow moon',
            'worm moon',
            'pink moon',
            'flower moon',
            'strawberry moon',
            'buck moon',
            'sturgeon moon',
            'harvest moon',
            "hunter's moon",
            'beaver moon',
            'cold moon',
        ];

        // Check if this is the harvest moon (closest to autumn equinox)
        if (month === 8 || month === 9) {
            const equinox = helpers.isNearEquinox(date, location.hemisphere, 30);
            if (equinox.near && equinox.type === 'autumn equinox' && Math.abs(equinox.days) < 15) {
                results.phenomena.push('harvest moon - closest full moon to autumn equinox');
                if (hour >= 17 && hour <= 20) results.phenomena.push('moon rising near sunset for several nights');
            } else results.phenomena.push(moonNames[month]);
        } else results.phenomena.push(moonNames[month]);

        // Special full moon combinations
        if (zodiac.position === 'late') results.phenomena.push(`moon in late ${zodiac.sign}, entering ${helpers.getNextSign(zodiac.sign)} soon`);
        else results.phenomena.push(`moon in ${zodiac.sign} ${zodiac.symbol}`);
        if (zodiac.sign === 'Cancer' || zodiac.sign === 'Pisces' || zodiac.sign === 'Scorpio') results.phenomena.push('emotional full moon in water sign');
    } else if (lunarPhase >= 0.98 || lunarPhase <= 0.02) {
        // New moon
        results.phenomena.push('new moon tonight');

        if (cloudCover !== undefined && cloudCover < 30) {
            if (location.lightPollution === 'low') {
                results.phenomena.push('excellent stargazing conditions');
                if (month >= 6 && month <= 8 && hour >= 22) results.phenomena.push('Milky Way visible');
            } else if (location.lightPollution === 'medium') results.phenomena.push('good conditions for bright stars');
        }

        // Meteor showers
        [
            { month: 0, start: 1, end: 5, name: 'Quadrantids meteor shower' },
            { month: 3, start: 16, end: 25, name: 'Lyrids meteor shower' },
            { month: 4, start: 5, end: 7, name: 'Eta Aquarids meteor shower' },
            { month: 7, start: 17, end: 24, name: 'Perseids meteor shower viewing optimal' },
            { month: 7, start: 28, end: 30, name: 'Delta Aquarids meteor shower' },
            { month: 9, start: 2, end: 7, name: 'Draconids meteor shower' },
            { month: 9, start: 21, end: 22, name: 'Orionids meteor shower' },
            { month: 10, start: 5, end: 10, name: 'Southern Taurids meteor shower' },
            { month: 10, start: 12, end: 23, name: 'Northern Taurids meteor shower' },
            { month: 10, start: 17, end: 25, name: 'Leonids meteor shower viewing optimal' },
            { month: 11, start: 7, end: 17, name: 'Geminids meteor shower - best of the year' },
            { month: 11, start: 17, end: 24, name: 'Ursids meteor shower' },
        ]
            .filter((shower) => month === shower.month && day >= shower.start && day <= shower.end)
            .forEach((shower) => results.phenomena.push(shower.name));

        // Zodiacal light
        if (cloudCover < 20 && location.lightPollution === 'low') {
            if (month >= 2 && month <= 4 && hour >= 19 && hour <= 21) results.phenomena.push('zodiacal light may be visible in western sky after sunset');
            else if (month >= 8 && month <= 10 && hour >= 4 && hour <= 6) results.phenomena.push('zodiacal light may be visible in eastern sky before dawn');
        }

        const neuMoonMeanings = {
            Aries: 'good for new beginnings and initiatives',
            Taurus: 'good for financial planning and material goals',
            Gemini: 'good for communication and learning projects',
            Cancer: 'good for home and family matters',
            Leo: 'good for creative projects and self-expression',
            Virgo: 'good for health and organization goals',
            Libra: 'good for relationships and partnerships',
            Scorpio: 'good for transformation and deep changes',
            Sagittarius: 'good for travel and educational pursuits',
            Capricorn: 'good for career and long-term goals',
            Aquarius: 'good for community and humanitarian projects',
            Pisces: 'good for spiritual and artistic endeavors',
        };
        if (neuMoonMeanings[zodiac.sign]) results.phenomena.push(`new moon in ${zodiac.sign} ${zodiac.symbol}: ${neuMoonMeanings[zodiac.sign]}`);
    } else if ((lunarPhase >= 0.23 && lunarPhase <= 0.27) || (lunarPhase >= 0.73 && lunarPhase <= 0.77)) {
        // Quarter moons
        const quarterType = lunarPhase < 0.5 ? 'first' : 'last';
        results.phenomena.push(`${quarterType} quarter moon tonight`);
        if (quarterType === 'first' && hour >= 18 && hour <= 23) results.phenomena.push('moon visible in evening sky');
        else if (quarterType === 'last' && hour >= 0 && hour <= 6) results.phenomena.push('moon visible in morning sky');
        if (zodiac.position === 'late') results.phenomena.push(`moon in late ${zodiac.sign}, entering ${helpers.getNextSign(zodiac.sign)} soon`);
        else results.phenomena.push(`moon in ${zodiac.sign} ${zodiac.symbol}`);
    } else {
        if (lunarPhase > 0.02 && lunarPhase < 0.23) results.phenomena.push('waxing crescent moon');
        else if (lunarPhase > 0.27 && lunarPhase < 0.48) results.phenomena.push('waxing gibbous moon');
        else if (lunarPhase > 0.52 && lunarPhase < 0.73) results.phenomena.push('waning gibbous moon');
        else if (lunarPhase > 0.77 && lunarPhase < 0.98) results.phenomena.push('waning crescent moon');

        const yesterday = store.astronomy.moonPhaseHistory[store.astronomy.moonPhaseHistory.length - 2];
        if (yesterday) {
            if (yesterday.phase < 0.02 && lunarPhase > 0.02) results.phenomena.push('moon has entered waxing phase');
            else if (yesterday.phase < 0.5 && lunarPhase > 0.5) results.phenomena.push('moon has passed full phase, now waning');
        }

        if (zodiac.position === 'late') results.phenomena.push(`moon in late ${zodiac.sign}, entering ${helpers.getNextSign(zodiac.sign)} soon`);
        else results.phenomena.push(`moon in ${zodiac.sign} ${zodiac.symbol}`);
    }

    // Moon Position
    const lunarPos = helpers.getLunarPosition(date, location.latitude, location.longitude);
    if (lunarPos.altitude > 0) {
        results.phenomena.push(`moon ${Math.round(lunarPos.altitude)}° above horizon`);
        if (lunarPos.altitude > 60) results.phenomena.push('moon near zenith - excellent viewing');
        else if (lunarPos.altitude < 10) results.phenomena.push('moon low on horizon');
        const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'],
            dirIndex = Math.round(lunarPos.azimuth / 45) % 8;
        results.phenomena.push(`moon in ${directions[dirIndex]} sky`);
    } else if (hour >= 6 && hour <= 18) results.phenomena.push('moon below horizon');

    // Moon rise/set
    const lunarTimes = helpers.getLunarTimes(date, location.latitude, location.longitude);
    if (lunarTimes.rise || lunarTimes.set) {
        const times = [];
        if (lunarTimes.rise) times.push(`rises ${lunarTimes.rise.toTimeString().slice(0, 5)}`);
        if (lunarTimes.set) times.push(`sets ${lunarTimes.set.toTimeString().slice(0, 5)}`);
        if (times.length > 0) results.phenomena.push(`moon ${times.join(', ')}`);
    }

    if (lunarPhase >= 0.48 && lunarPhase <= 0.52) {
        if (lunarPos.altitude > 0) results.phenomena.push('full moon visible now');
        else if (lunarTimes.rise && lunarTimes.rise.getHours() < 23) results.phenomena.push(`full moon rises at ${lunarTimes.rise.toTimeString().slice(0, 5)}`);
    }

    // Moon Illumination Percentage
    results.phenomena.push(`moon ${Math.round(((1 - Math.cos(lunarPhase * 2 * Math.PI)) / 2) * 100)}% illuminated`);

    // Noctilucent Clouds (Important for latitude 59.66°N)
    if (month >= 5 && month <= 7 && location.latitude > 50) if (hour >= 21 || hour <= 4) results.phenomena.push('noctilucent clouds possible in northern sky');

    // Moon and tides (for coastal areas)
    if (location.elevation < 50 && location.forestCoverage !== 'high') {
        if ((lunarPhase >= 0.48 && lunarPhase <= 0.52) || lunarPhase >= 0.98 || lunarPhase <= 0.02) {
            results.phenomena.push('spring tides (at coast)');
            if (lunarDistance.isSupermoon) results.phenomena.push('king tides possible');
        } else if ((lunarPhase >= 0.23 && lunarPhase <= 0.27) || (lunarPhase >= 0.73 && lunarPhase <= 0.77)) results.phenomena.push('neap tides (at coast)');
    }

    // Aurora predictions
    if (location.latitude > 55 && cloudCover < 50)
        if ((month >= 8 && month <= 10) || (month >= 2 && month <= 4))
            if (hour >= 21 || hour <= 3) {
                if (lunarPhase <= 0.3 || lunarPhase >= 0.7) results.phenomena.push('dark skies favorable for aurora viewing');
                if (location.latitude > 59) results.phenomena.push('aurora possible with moderate solar activity (Kp 4+)');
            }

    // Basic planetary visibility
    if (cloudCover < 50) {
        if (hour >= 4 && hour <= 7 && month >= 0) results.phenomena.push('Venus may be visible as morning star in east');
        else if (hour >= 18 && hour <= 21) results.phenomena.push('Venus may be visible as evening star in west');
        if (hour >= 22 || hour <= 2) {
            if (month >= 0 && month <= 3) results.phenomena.push('Jupiter well-placed for viewing');
            if (month >= 7 && month <= 10) results.phenomena.push('Saturn well-placed for viewing');
            if (month === 11 || month === 0) results.phenomena.push('Mars approaching opposition - bright and visible all night');
        }
    }

    // Comets
    const periodicComets = [
        { name: "Halley's Comet", period: 75.3, lastPerihelion: new Date('1986-02-09'), magnitude: 4 },
        { name: 'Comet Encke', period: 3.3, lastPerihelion: new Date('2023-10-22'), magnitude: 6 },
        { name: 'Comet 67P/Churyumov-Gerasimenko', period: 6.45, lastPerihelion: new Date('2021-11-02'), magnitude: 9 },
    ];

    periodicComets.forEach((comet) => {
        const yearsSinceLast = (date - comet.lastPerihelion) / (365.25 * 24 * 60 * 60 * 1000);
        const periodsElapsed = yearsSinceLast / comet.period;
        const nextReturn = Math.ceil(periodsElapsed) * comet.period - yearsSinceLast;

        if (nextReturn < 1) {
            // Within a year
            const daysUntil = Math.round(nextReturn * 365.25);
            if (daysUntil < 30) {
                results.phenomena.push(`${comet.name} approaching perihelion in ${daysUntil} days`);
            }
        }
    });

    if ((lunarPhase > 0.05 && lunarPhase < 0.15) || (lunarPhase > 0.85 && lunarPhase < 0.95))
        if (cloudCover < 30) results.phenomena.push('earthshine visible on dark portion of moon');

    const daysToNextPhase = Math.round((0.25 - (lunarPhase % 0.25)) * 29.53);
    if (daysToNextPhase <= 2) {
        const nextPhase = Math.ceil(lunarPhase * 4) % 4,
            phaseNames = ['new moon', 'first quarter', 'full moon', 'last quarter'];
        results.phenomena.push(`${phaseNames[nextPhase]} in ${daysToNextPhase} days`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (_options) {
    return {
        interpretEquinox,
        interpretSolstice,
        interpretCrossQuarter,
        interpretMoonPhase,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
