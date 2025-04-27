// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const joinand = (items) => {
    if (!items || items.length === 0) return '';
    else if (items.length === 1) return items[0];
    else if (items.length === 2) return `${items[0]} and ${items[1]}`;
    const lastItem = items.pop();
    return `${items.join(', ')}, and ${lastItem}`;
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const __generateDescription = (results) => {
    let details = '';
    if (results.conditions.length > 0) details = joinand([...new Set(results.conditions)]);
    if (results.phenomena.length > 0) details += (details ? ': ' : '') + joinand([...new Set(results.phenomena)]);
    if (details) {
        details = details.charAt(0).toUpperCase() + details.slice(1);
        if (!details.endsWith('.')) details += '.';
    }
    return details || null;
};

// -----------------------------------------------------------------------------------------------------------------------------------------

function getWeatherInterpretation(location_data, data) {
    const {
        temp,
        humidity,
        pressure,
        windSpeed,
        solarRad,
        solarUvi,
        rainRate,
        radiationCpm,
        radiationAcpm,
        radationUsvh,
        snowDepth,
        iceDepth,
        cloudCover = null,
        season = getSeason(location_data.hemisphere),
    } = data;

    const dewPoint = calculateDewPoint(temp, humidity);
    const heatIndex = calculateHeatIndex(temp, humidity);
    const windChill = calculateWindChill(temp, windSpeed);
    const feelsLike = calculateFeelsLike(temp, humidity, windSpeed);
    const month = new Date().getMonth();
    const day = new Date().getDate();
    const hour = new Date().getHours();
    const daylight = getDaylightHours(location_data.latitude, location_data.longitude);

    const results = {
        conditions: [],
        phenomena: [],
        comfort: null,
        alerts: [],
        details: null,
        feelsLike,
        daylight,
    };

    // Atmospheric pressure conditions - Nordic context
    if (pressure !== null) {
        const elevationAdjustment = Math.exp(location_data.elevation / (29.3 * (temp + 273))); // Adjust pressure for elevation (approximately 150m)
        const adjustedPressure = pressure * elevationAdjustment;
        if (adjustedPressure < 970) {
            results.conditions.push('severe storm conditions');
            results.alerts.push('dangerously low pressure');
        } else if (adjustedPressure < 990) results.conditions.push('stormy');
        else if (adjustedPressure < 1000) results.conditions.push('unsettled');
        else if (adjustedPressure >= 1000 && adjustedPressure <= 1015);
        else if (adjustedPressure > 1015 && adjustedPressure <= 1025)
            // Normal pressure range - no specific condition
            results.conditions.push('settled');
        else if (adjustedPressure > 1025) results.conditions.push('stable high pressure');
        if (month >= 9 && month <= 3) {
            // Nordic-specific pressure context - Fall through early spring
            if (adjustedPressure > 1020)
                results.phenomena.push('clear winter conditions likely'); // High pressure in winter often brings very cold conditions
            else if (adjustedPressure < 990 && temp > 0) results.phenomena.push('winter rain likely'); // Low pressure in winter with temps above freezing often brings rain
        }
    }

    // Temperature conditions - adjusted for Swedish climate where cold is more common and heat more exceptional
    if (temp !== null) {
        if (temp < -25) {
            results.conditions.push('extremely cold');
            results.alerts.push('extreme cold');
        } else if (temp < -15) results.conditions.push('very cold');
        else if (temp < -5) results.conditions.push('cold');
        else if (temp < 0) results.conditions.push('freezing');
        else if (temp < 5) results.conditions.push('chilly');
        else if (temp < 10) results.conditions.push('cool');
        else if (temp >= 10 && temp < 18) results.conditions.push('mild');
        else if (temp >= 18 && temp < 23) results.conditions.push('warm');
        else if (temp >= 23 && temp < 28) results.conditions.push('hot');
        else {
            results.conditions.push('very hot');
            if (temp >= 30) results.alerts.push('unusual heat for this region');
        }
        if (month >= 11 || month <= 2) {
            // Season-specific temperature context for Sweden
            if (temp > 5) results.phenomena.push('unseasonably warm for winter');
            else if (temp < -20) results.phenomena.push('extreme Nordic winter conditions');
        } else if (month >= 6 && month <= 8) {
            if (temp > 25) results.phenomena.push('unusually hot for this region');
            else if (temp < 10) results.phenomena.push('unseasonably cool for summer');
        }
    }

    // Humidity conditions
    if (humidity !== null) {
        if (humidity > 90) results.conditions.push('very humid');
        else if (humidity > 70) results.conditions.push('humid');
        else if (humidity >= 30 && humidity <= 60);
        else if (humidity < 30) {
            // Comfortable humidity range - no specific condition
            results.conditions.push('dry');
            if (humidity < 15) results.conditions.push('extremely dry');
        }
    }

    // Wind conditions - using Beaufort scale as reference
    if (windSpeed !== null) {
        if (windSpeed < 0.5) results.conditions.push('calm');
        else if (windSpeed < 1.5) results.conditions.push('light air');
        else if (windSpeed < 3.3) results.conditions.push('light breeze');
        else if (windSpeed < 5.5) results.conditions.push('gentle breeze');
        else if (windSpeed < 7.9) results.conditions.push('moderate breeze');
        else if (windSpeed < 10.7) results.conditions.push('fresh breeze');
        else if (windSpeed < 13.8) results.conditions.push('strong breeze');
        else if (windSpeed < 17.1) {
            results.conditions.push('near gale');
            results.alerts.push('strong wind');
        } else if (windSpeed < 20.7) {
            results.conditions.push('gale');
            results.alerts.push('gale');
        } else if (windSpeed < 24.4) {
            results.conditions.push('strong gale');
            results.alerts.push('strong gale');
        } else if (windSpeed < 28.4) {
            results.conditions.push('storm');
            results.alerts.push('storm');
        } else if (windSpeed < 32.6) {
            results.conditions.push('violent storm');
            results.alerts.push('violent storm');
        } else {
            results.conditions.push('hurricane force');
            results.alerts.push('hurricane force wind');
        }
    }

    // Cloud cover conditions
    if (cloudCover !== null) {
        if (cloudCover < 10) results.conditions.push('clear sky');
        else if (cloudCover < 30) results.conditions.push('mostly clear');
        else if (cloudCover < 70) results.conditions.push('partly cloudy');
        else if (cloudCover < 90) results.conditions.push('mostly cloudy');
        else results.conditions.push('overcast');
    }

    // Precipitation conditions
    if (rainRate !== null) {
        if (rainRate > 0 && rainRate < 0.5) results.conditions.push('light rain');
        else if (rainRate >= 0.5 && rainRate < 4) results.conditions.push('moderate rain');
        else if (rainRate >= 4 && rainRate < 8) results.conditions.push('heavy rain');
        else if (rainRate >= 8) {
            results.conditions.push('very heavy rain');
            results.alerts.push('heavy rainfall');
        }
    }

    // Solar radiation and UV conditions
    if (solarRad !== null || solarUvi !== null) {
        if (solarRad > 800) results.conditions.push('intense sunlight');
        else if (solarRad > 500) results.conditions.push('strong sunlight');
        if (solarUvi !== null) {
            if (solarUvi >= 11) {
                results.conditions.push('extreme UV');
                results.alerts.push('extreme UV');
            } else if (solarUvi >= 8) {
                results.conditions.push('very high UV');
                results.alerts.push('very high UV');
            } else if (solarUvi >= 6) results.conditions.push('high UV');
            else if (solarUvi >= 3) results.conditions.push('moderate UV');
        }
    }

    // Snow and Ice Depth Interpretation
    if (snowDepth !== null) {
        if (snowDepth === 0) {
            if (month >= 11 || month <= 2) results.phenomena.push('no snow cover during winter');
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
        if (month === 10 && snowDepth > 0)
            // Season-specific snow interpretations
            results.phenomena.push('early season snow');
        else if (month === 4 && snowDepth > 100) results.phenomena.push('late season persistent snow pack');
        else if (month >= 5 && month <= 8 && snowDepth > 0) results.phenomena.push('unusual summer snow');
        if (snowDepth > 30) {
            // Snow quality based on temperature
            if (temp < -15) results.phenomena.push('powder snow conditions');
            else if (temp < -5) results.phenomena.push('dry snow conditions');
            else if (temp < 0) results.phenomena.push('packed snow conditions');
            else if (temp > 0) {
                results.phenomena.push('wet snow conditions');
                if (temp > 5) results.phenomena.push('rapid snowmelt possible');
            }
        }
    }

    // Ice Depth Interpretation
    if (iceDepth !== null) {
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
        if (month === 10 && iceDepth > 0)
            // Season-specific ice interpretations
            results.phenomena.push('early lake ice formation');
        else if (month === 4 && iceDepth > 100) results.phenomena.push('late season persistent ice');
        else if (month >= 5 && month <= 9 && iceDepth > 0) results.phenomena.push('unusual season ice');
        if (iceDepth > 0) {
            // Ice safety and quality based on temperature and thickness
            if (temp > 0 && iceDepth < 150) results.alerts.push('weakening ice conditions');
            if (iceDepth < 50) results.alerts.push('thin ice hazard');
            else if (iceDepth >= 50 && iceDepth < 100) results.phenomena.push('ice may support single person');
            else if (iceDepth >= 100 && iceDepth < 200) results.phenomena.push('ice supports group activity');
            else if (iceDepth >= 200) results.phenomena.push('ice supports vehicle weight');
        }
        if (snowDepth > 100 && iceDepth > 100)
            // Combined snow and ice effects
            results.phenomena.push('typical Nordic winter conditions');
    }

    // Radiation Interpretation: prefer ACPM (rolling average) but fall back to CPM if needed
    const radiationValue = radiationAcpm !== null ? radiationAcpm : radiationCpm;
    const radiationSource = radiationAcpm !== null ? 'average' : 'instant';
    if (radiationValue !== null) {
        // Interpret radiation levels based on available readings
        if (radiationValue <= 30) {
            // Background radiation in Sweden normally ranges from 5-30 CPM
            // Normal background radiation - no specific condition
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
        if (radiationValue > 30) {
            // Context-specific radiation interpretations
            if (rainRate > 0) results.phenomena.push('possible radon washout in precipitation');
            if (month >= 9 || month <= 3) results.phenomena.push('seasonal radon fluctuation possible');
        }
        if (radiationValue > 50 && solarUvi > 5)
            // Radiation health context
            results.phenomena.push('combined radiation and UV exposure');
        // Add µSv/h context if available
        if (radationUsvh !== null) {
            if (radationUsvh > 0.5) results.alerts.push(`radiation dose rate: ${radationUsvh.toFixed(2)} µSv/h`);
            // Additional health context based on dose rate
            if (radationUsvh > 0.3 && radationUsvh <= 1) {
                results.phenomena.push('above typical background dose rate');
            } else if (radationUsvh > 1 && radationUsvh <= 5) {
                results.phenomena.push('elevated dose rate - limit prolonged exposure');
            } else if (radationUsvh > 5) {
                results.phenomena.push('significant dose rate - health concern');
            }
        }
    }

    // Weather phenomena interpretations - Nordic forest context
    if (temp !== null && humidity !== null) {
        if (temp < 0 && humidity > 70) {
            // Snow conditions - common in this region
            if (rainRate > 0) {
                if (temp < -10) results.phenomena.push('light powder snow likely');
                else results.phenomena.push('snow likely');
            } else if (temp < -2) results.phenomena.push('frost likely');
        }
        if (temp < 0 && cloudCover > 70 && month >= 10 && month <= 3) {
            // Forest-specific snow conditions
            results.phenomena.push('snow accumulation on trees possible');
            if (windSpeed > 5) results.alerts.push('risk of snow-laden branches');
        }
        if (temp < 2 && temp > -8 && rainRate > 0) {
            // Freezing rain conditions
            results.phenomena.push('freezing rain possible');
            results.alerts.push('forest ice hazard');
        }
        if (temp > 20 && humidity > 75)
            // Nordic summer humidity feels different - adjust muggy threshold
            results.phenomena.push('humid for Nordic climate');
        if (Math.abs(temp - dewPoint) < 3 && temp > 0) {
            // Fog conditions - common in forested areas near lakes
            if (hour < 10 || hour > 18) results.phenomena.push('forest fog likely');
            else results.phenomena.push('fog likely');
        }
        if (month >= 5 && month <= 8 && temp > 22 && humidity < 40 && rainRate === 0) {
            // Forest-specific fire risk in dry conditions (rare but possible in summer)
            results.phenomena.push('dry forest conditions');
            if (humidity < 30 && temp > 25) results.alerts.push('forest fire risk');
        }
    }

    // Precipitation predictions based on pressure and humidity
    if (pressure !== null && humidity !== null) {
        if (pressure < 1000 && humidity > 75) results.phenomena.push('rain likely');
        else if (pressure > 1020 && humidity < 40) results.phenomena.push('clear and dry');
    }

    // Wind chill effect
    if (temp !== null && windSpeed !== null) {
        if (temp < 10 && windSpeed > 3) {
            const windChillDiff = Math.round(temp - windChill);
            if (windChillDiff >= 3) results.phenomena.push(`feels ${windChillDiff}°C colder due to wind`);
        }
    }

    // Heat index effect
    if (temp !== null && humidity !== null) {
        if (temp > 20 && humidity > 60) {
            const heatIndexDiff = Math.round(heatIndex - temp);
            if (heatIndexDiff >= 3) results.phenomena.push(`feels ${heatIndexDiff}°C warmer due to humidity`);
        }
    }

    // Time of day specific phenomena - Nordic daylight considerations with precise calculations
    if (temp !== null) {
        if (month >= 5 && month <= 7) {
            // Summer months with very long days
            if (daylight.isDaytime && hour > 20) results.phenomena.push('extended Nordic summer evening light');
            if (daylight.sunriseDecimal < 4.5 && hour < 7)
                // Show precise sunrise time for very early summer mornings
                results.phenomena.push(`early sunrise`);
            if (!daylight.isDaytime && hour > Math.floor(daylight.sunsetDecimal) && hour < Math.floor(daylight.sunsetDecimal) + 2)
                // Add twilight information when relevant
                results.phenomena.push('lingering twilight');
            if (month === 6 && daylight.daylightHours > 18)
                // For near-solstice days
                results.phenomena.push('peak summer daylight period');
        } else if (month >= 11 || month <= 1) {
            // Winter with very short days
            if (!daylight.isDaytime && hour >= 15 && hour < 17)
                // Precise winter darkness timing
                results.phenomena.push(`early winter darkness`);
            if (daylight.daylightHours < 7)
                // Very short day warning
                results.phenomena.push(`short winter day (${Math.round(daylight.daylightHours)} hours of daylight)`);
            if (daylight.isDaytime && temp < -5)
                // Cold daylight
                results.phenomena.push('cold winter daylight');
            if (month === 11 && day > 15)
                // Near-solstice days
                results.phenomena.push('approaching winter solstice');
        }
        const currentHourDecimal = hour + new Date().getMinutes() / 60; // Civil twilight phenomena
        if (!daylight.isDaytime && currentHourDecimal >= daylight.sunsetDecimal && currentHourDecimal <= daylight.civilDuskLocal)
            results.phenomena.push('civil twilight');
        if (temp < 3 && hour > Math.floor(daylight.sunriseDecimal) && hour < Math.floor(daylight.sunriseDecimal) + 3)
            // Standard time patterns adjusted for Nordic climate
            results.phenomena.push('morning chill');
        if (temp > 22 && hour > 12 && hour < 16) results.phenomena.push('afternoon warmth');
        if (windSpeed > 5 && location_data.forestCoverage === 'high')
            // Forest-specific phenomena
            results.phenomena.push('forest wind effect');
    }

    // Season-specific interpretations for Nordic region
    if (season && temp !== null) {
        switch (season.toLowerCase()) {
            case 'winter':
                if (temp > 5) results.phenomena.push('unusually mild winter day');
                if (temp < -20) results.phenomena.push('severe Nordic winter conditions');
                if (daylight.daylightHours < 7)
                    // Winter darkness phenomenon
                    results.phenomena.push('short winter day');
                break;
            case 'summer':
                if (temp < 12) results.phenomena.push('cool summer day');
                if (temp > 25) results.phenomena.push('hot Nordic summer day');
                if (daylight.daylightHours > 18)
                    // Midnight sun approximation (not quite at this latitude but still very bright evenings)
                    results.phenomena.push('extended Nordic summer daylight');
                break;
            case 'spring':
                if (month === 3 && temp > 10) results.phenomena.push('early spring warmth');
                if (month === 4 && rainRate > 0 && temp > 5) results.phenomena.push('spring forest rain');
                break;
            case 'autumn':
                if (month === 9 && temp < 5) results.phenomena.push('early autumn chill');
                if (month === 10 && rainRate > 0 && temp < 10) results.phenomena.push('cold autumn rain');
                break;
        }
    }

    results.comfort = calculateComfortLevel(temp, humidity, windSpeed, solarRad);
    results.details = __generateDescription(results);

    return results;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const calculateDewPoint = (temp, humidity) => {
    // Magnus-Tetens formula
    const a = 17.27;
    const b = 237.7;
    const alpha = (a * temp) / (b + temp) + Math.log(humidity / 100);
    return (b * alpha) / (a - alpha);
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const calculateHeatIndex = (temp, rh) => {
    if (temp < 20) return temp; // Only applicable for temps > 20°C
    const tempF = (temp * 9) / 5 + 32; // Convert to Fahrenheit for the standard formula
    let heatIndexF = 0.5 * (tempF + 61.0 + (tempF - 68.0) * 1.2 + rh * 0.094); // Simplified heat index formula
    if (tempF >= 80) {
        // Use more precise formula if hot enough
        heatIndexF =
            -42.379 +
            2.04901523 * tempF +
            10.14333127 * rh -
            0.22475541 * tempF * rh -
            6.83783e-3 * tempF * tempF -
            5.481717e-2 * rh * rh +
            1.22874e-3 * tempF * tempF * rh +
            8.5282e-4 * tempF * rh * rh -
            1.99e-6 * tempF * tempF * rh * rh;
        if (rh < 13 && tempF >= 80 && tempF <= 112)
            // Apply adjustment for low humidity or cool temps
            heatIndexF -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
        else if (rh > 85 && tempF >= 80 && tempF <= 87) heatIndexF += ((rh - 85) / 10) * ((87 - tempF) / 5);
    }
    return ((heatIndexF - 32) * 5) / 9; // Convert back to Celsius
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const calculateWindChill = (temp, windSpeed) => {
    if (temp > 10 || windSpeed <= 1.3) return temp; // Only applicable for temps <= 10°C and wind > 1.3 m/s
    const windSpeedKmh = windSpeed * 3.6; // Convert wind speed to km/h
    return 13.12 + 0.6215 * temp - 11.37 * Math.pow(windSpeedKmh, 0.16) + 0.3965 * temp * Math.pow(windSpeedKmh, 0.16); // Calculate wind chill using Environment Canada formula
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const calculateFeelsLike = (temp, humidity, windSpeed) => {
    if (temp <= 10)
        // For cold conditions, use wind chill
        return calculateWindChill(temp, windSpeed);
    else if (temp >= 20)
        // For warm conditions, use heat index
        return calculateHeatIndex(temp, humidity); // For moderate conditions, just use the actual temperature
    else return temp;
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const calculateComfortLevel = (temp, humidity, windSpeed, solarRad) => {
    const feelsLike = calculateFeelsLike(temp, humidity, windSpeed);
    if (feelsLike < -10 || feelsLike > 35) return 'very uncomfortable';
    if (feelsLike < 0 || feelsLike > 30) return 'uncomfortable';
    if ((temp > 20 && humidity > 80) || humidity < 20) return 'somewhat uncomfortable';
    if (windSpeed > 8) return 'somewhat uncomfortable';
    if (solarRad > 700) return 'somewhat uncomfortable';
    if (feelsLike >= 18 && feelsLike <= 24 && humidity >= 30 && humidity <= 60) return 'very comfortable';
    if (feelsLike >= 15 && feelsLike <= 28) return 'comfortable';
    return 'moderately comfortable';
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const getSeason = (hemisphere = 'northern') => {
    // Nordic season adjustment - spring comes later, winter comes earlier
    const month = new Date().getMonth();
    if (hemisphere.toLowerCase() === 'northern') {
        if (month >= 3 && month <= 5) return 'spring';
        if (month >= 6 && month <= 8) return 'summer';
        if (month >= 9 && month <= 10) return 'autumn';
        return 'winter'; // Months 11, 0, 1, 2 (Nov-Feb)
    } else {
        if (month >= 3 && month <= 5) return 'autumn';
        if (month >= 6 && month <= 8) return 'winter';
        if (month >= 9 && month <= 10) return 'spring';
        return 'summer';
    }
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const getDST = (date) => {
    if (date.getMonth() > 10 || date.getMonth() < 2) return false; // November to February
    if (date.getMonth() > 3 && date.getMonth() < 9) return true; // April to September
    const lastDayOfMarch = new Date(date.getFullYear(), 2, 31);
    while (lastDayOfMarch.getMonth() > 2) lastDayOfMarch.setDate(lastDayOfMarch.getDate() - 1);
    const lastSundayOfMarch = new Date(lastDayOfMarch);
    while (lastSundayOfMarch.getDay() !== 0) lastSundayOfMarch.setDate(lastSundayOfMarch.getDate() - 1);
    lastSundayOfMarch.setHours(2, 0, 0, 0); // 02:00 CET
    const lastDayOfOctober = new Date(date.getFullYear(), 9, 31);
    while (lastDayOfOctober.getMonth() > 9) lastDayOfOctober.setDate(lastDayOfOctober.getDate() - 1);
    const lastSundayOfOctober = new Date(lastDayOfOctober);
    while (lastSundayOfOctober.getDay() !== 0) lastSundayOfOctober.setDate(lastSundayOfOctober.getDate() - 1);
    lastSundayOfOctober.setHours(3, 0, 0, 0); // 03:00 CEST
    return date >= lastSundayOfMarch && date < lastSundayOfOctober;
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const getDaylightHours = (latitude, longitude) => {
    const normalizeTime = (time) => (time < 0 ? time + 24 : time >= 24 ? time - 24 : time);
    const formatTime = (timeInHours) =>
        `${Math.floor(timeInHours).toString().padStart(2, '0')}:${Math.floor((timeInHours - Math.floor(timeInHours)) * 60)
            .toString()
            .padStart(2, '0')}`;
    //
    const date = new Date();
    const isLeapYear = (date.getFullYear() % 4 === 0 && date.getFullYear() % 100 !== 0) || date.getFullYear() % 400 === 0;
    const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let dayOfYear = date.getDate();
    for (let i = 0; i < date.getMonth(); i++) dayOfYear += daysInMonth[i];
    const latRad = (latitude * Math.PI) / 180;
    const fracYear = ((2 * Math.PI) / (isLeapYear ? 366 : 365)) * (dayOfYear - 1 + (date.getHours() - 12) / 24);
    const declination =
        0.006918 -
        0.399912 * Math.cos(fracYear) +
        0.070257 * Math.sin(fracYear) -
        0.006758 * Math.cos(2 * fracYear) +
        0.000907 * Math.sin(2 * fracYear) -
        0.002697 * Math.cos(3 * fracYear) +
        0.00148 * Math.sin(3 * fracYear);
    const eqTime =
        229.18 *
        (0.000075 + 0.001868 * Math.cos(fracYear) - 0.032077 * Math.sin(fracYear) - 0.014615 * Math.cos(2 * fracYear) - 0.040849 * Math.sin(2 * fracYear));
    const solarNoon = 12 - eqTime / 60 - longitude / 15;
    const zenith = (90.8333 * Math.PI) / 180; // Calculate sunrise/sunset hour angle, standard zenith: 90.8333 degrees (sun diameter + atmospheric refraction)
    const cosHourAngle = (Math.cos(zenith) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination));
    const isPolarDay = cosHourAngle < -1;
    const isPolarNight = cosHourAngle > 1;
    const hourAngle = !isPolarDay && !isPolarNight ? (Math.acos(cosHourAngle) * 180) / Math.PI / 15 : 0;
    const isDST = getDST(date);
    const utcOffset = isDST ? 2 : 1;
    //
    const cosCivilHourAngle = (Math.cos((96 * Math.PI) / 180) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination)); // 90 + 6 degrees
    const civilHourAngle =
        cosCivilHourAngle >= -1 && cosCivilHourAngle <= 1 ? (Math.acos(cosCivilHourAngle) * 180) / Math.PI / 15 : cosCivilHourAngle < -1 ? 12 : 0;
    const civilDawnUTC = solarNoon - civilHourAngle;
    const civilDuskUTC = solarNoon + civilHourAngle;
    const civilDawnLocal = civilDawnUTC + utcOffset;
    const civilDuskLocal = civilDuskUTC + utcOffset;
    const civilDawnDecimal = normalizeTime(civilDawnLocal);
    const civilDuskDecimal = normalizeTime(civilDuskLocal);
    //
    const sunriseUTC = solarNoon - hourAngle;
    const sunsetUTC = solarNoon + hourAngle;
    const sunriseLocal = sunriseUTC + utcOffset;
    const sunsetLocal = sunsetUTC + utcOffset;
    const sunriseDecimal = normalizeTime(sunriseLocal);
    const sunsetDecimal = normalizeTime(sunsetLocal);
    //
    const daylightHours = isPolarDay ? 24 : isPolarNight ? 0 : 2 * hourAngle;
    const isDaytime = date.getHours() + date.getMinutes() / 60 > sunriseDecimal && date.getHours() + date.getMinutes() / 60 < sunsetDecimal;
    //
    return {
        sunriseDecimal,
        sunsetDecimal,
        sunrise: formatTime(sunriseDecimal),
        sunset: formatTime(sunsetDecimal),
        civilDawn: formatTime(civilDawnDecimal),
        civilDusk: formatTime(civilDuskDecimal),
        daylightHours,
        isDaytime,
        isDST,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
