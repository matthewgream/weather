
const getWeatherInterpretation = (data) => {

    const {
        temp,
        humidity,
        pressure,
        windSpeed,
        solarRad,
        solarUvi,
        rainRate,
        cloudCover = null,
        visibility = null,
        location = "Central Sweden",
        season = getCurrentSeason("northern")
    } = data;

    const LOCATION_DATA = {
        elevation: 145,
        latitude: 59.662083,
        longitude: 12.995500,
        summerAvgHigh: 21,
        winterAvgLow: -7,
        annualRainfall: 750, // mm
        annualSnowfall: 150, // cm
        forestCoverage: "high",
        nearbyLakes: true,
        climateType: "humid continental"
    };

    const dewPoint = calculateDewPoint(temp, humidity);
    const heatIndex = calculateHeatIndex(temp, humidity);
    const windChill = calculateWindChill(temp, windSpeed);
    const feelsLike = determineFeelsLike(temp, humidity, windSpeed);
    const month = new Date().getMonth();
    const day = new Date().getDate();
    const hour = new Date().getHours();
    const daylight = calculateDaylightHours(LOCATION_DATA.latitude, LOCATION_DATA.longitude);

    const results = {
        conditions: [],
        phenomena: [],
        comfort: null,
        alerts: [],
        description: null,
        feelsLike,
        daylight
    };

    // Atmospheric pressure conditions - Nordic context
    if (pressure !== null) {
        const elevationAdjustment = Math.exp(LOCATION_DATA.elevation / (29.3 * (temp + 273))); // Adjust pressure for elevation (approximately 150m)
        const adjustedPressure = pressure * elevationAdjustment;
        if (adjustedPressure < 970) {
            results.conditions.push("severe storm conditions");
            results.alerts.push("dangerously low pressure");
        } else if (adjustedPressure < 990)
            results.conditions.push("stormy");
        else if (adjustedPressure < 1000)
            results.conditions.push("unsettled");
        else if (adjustedPressure >= 1000 && adjustedPressure <= 1015)
            ; // Normal pressure range - no specific condition
        else if (adjustedPressure > 1015 && adjustedPressure <= 1025)
            results.conditions.push("settled");
        else if (adjustedPressure > 1025)
            results.conditions.push("stable high pressure");
        if (month >= 9 && month <= 3) { // Nordic-specific pressure context - Fall through early spring
            if (adjustedPressure > 1020)
                results.phenomena.push("clear winter conditions likely"); // High pressure in winter often brings very cold conditions
            else if (adjustedPressure < 990 && temp > 0)
                results.phenomena.push("winter precipitation likely"); // Low pressure in winter with temps above freezing often brings precipitation
        }
    }

    // Temperature conditions - adjusted for Swedish climate where cold is more common and heat more exceptional
    if (temp !== null) {
        if (temp < -25) {
            results.conditions.push("extremely cold");
            results.alerts.push("extreme cold");
        } else if (temp < -15)
            results.conditions.push("very cold");
        else if (temp < -5)
            results.conditions.push("cold");
        else if (temp < 0)
            results.conditions.push("freezing");
        else if (temp < 5)
            results.conditions.push("chilly");
        else if (temp < 10)
            results.conditions.push("cool");
        else if (temp >= 10 && temp < 18)
            results.conditions.push("mild");
        else if (temp >= 18 && temp < 23)
            results.conditions.push("warm");
        else if (temp >= 23 && temp < 28)
            results.conditions.push("hot");
        else {
            results.conditions.push("very hot");
            if (temp >= 30)
                results.alerts.push("unusual heat for this region");
        }
        if (month >= 11 || month <= 2) { // Season-specific temperature context for Sweden
            if (temp > 5)
                results.phenomena.push("unseasonably warm for winter");
            else if (temp < -20)
                results.phenomena.push("extreme Nordic winter conditions");
        } else if (month >= 6 && month <= 8) {
            if (temp > 25)
                results.phenomena.push("unusually hot for this region");
            else if (temp < 10)
                results.phenomena.push("unseasonably cool for summer");
        }
    }

    // Humidity conditions
    if (humidity !== null) {
        if (humidity > 90)
            results.conditions.push("very humid");
        else if (humidity > 70)
            results.conditions.push("humid");
        else if (humidity >= 30 && humidity <= 60)
            ; // Comfortable humidity range - no specific condition
        else if (humidity < 30) {
            results.conditions.push("dry");
            if (humidity < 15)
                results.conditions.push("extremely dry");
        }
    }

    // Wind conditions - using Beaufort scale as reference
    if (windSpeed !== null) {
        if (windSpeed < 0.5)
            results.conditions.push("calm");
        else if (windSpeed < 1.5)
            results.conditions.push("light air");
        else if (windSpeed < 3.3)
            results.conditions.push("light breeze");
        else if (windSpeed < 5.5)
            results.conditions.push("gentle breeze");
        else if (windSpeed < 7.9)
            results.conditions.push("moderate breeze");
        else if (windSpeed < 10.7)
            results.conditions.push("fresh breeze");
        else if (windSpeed < 13.8)
            results.conditions.push("strong breeze");
        else if (windSpeed < 17.1) {
            results.conditions.push("near gale");
            results.alerts.push("strong wind");
        } else if (windSpeed < 20.7) {
            results.conditions.push("gale");
            results.alerts.push("gale warning");
        } else if (windSpeed < 24.4) {
            results.conditions.push("strong gale");
            results.alerts.push("strong gale");
        } else if (windSpeed < 28.4) {
            results.conditions.push("storm");
            results.alerts.push("storm");
        } else if (windSpeed < 32.6) {
            results.conditions.push("violent storm");
            results.alerts.push("violent storm");
        } else {
            results.conditions.push("hurricane force");
            results.alerts.push("hurricane force wind");
        }
    }

    // Cloud cover conditions
    if (cloudCover !== null) {
        if (cloudCover < 10)
            results.conditions.push("clear sky");
        else if (cloudCover < 30)
            results.conditions.push("mostly clear");
        else if (cloudCover < 70)
            results.conditions.push("partly cloudy");
        else if (cloudCover < 90)
            results.conditions.push("mostly cloudy");
        else
            results.conditions.push("overcast");
    }

    // Precipitation conditions
    if (rainRate !== null) {
        if (rainRate > 0 && rainRate < 0.5)
            results.conditions.push("light precipitation");
        else if (rainRate >= 0.5 && rainRate < 4)
            results.conditions.push("moderate precipitation");
        else if (rainRate >= 4 && rainRate < 8)
            results.conditions.push("heavy precipitation");
        else if (rainRate >= 8) {
            results.conditions.push("very heavy precipitation");
            results.alerts.push("heavy rainfall");
        }
    }

    // Solar radiation and UV conditions
    if (solarRad !== null || solarUvi !== null) {
        if (solarRad > 800)
            results.conditions.push("intense sunlight");
        else if (solarRad > 500)
            results.conditions.push("strong sunlight");
        if (solarUvi !== null) {
            if (solarUvi >= 11) {
                results.conditions.push("extreme UV");
                results.alerts.push("extreme UV");
            } else if (solarUvi >= 8) {
                results.conditions.push("very high UV");
                results.alerts.push("very high UV");
            } else if (solarUvi >= 6)
                results.conditions.push("high UV");
            else if (solarUvi >= 3)
                results.conditions.push("moderate UV");
        }
    }

    // Visibility conditions
    if (visibility !== null) {
        if (visibility < 0.05) {
            results.conditions.push("dense fog");
            results.alerts.push("dense fog");
        } else if (visibility < 0.2)
            results.conditions.push("fog");
        else if (visibility < 1)
            results.conditions.push("mist");
        else if (visibility < 4)
            results.conditions.push("poor visibility");
        else if (visibility > 20)
            results.conditions.push("excellent visibility");
    }

    // Weather phenomena interpretations - Nordic forest context
    if (temp !== null && humidity !== null) {
        if (temp < 0 && humidity > 70) { // Snow conditions - common in this region
            if (rainRate > 0) {
                if (temp < -10)
                    results.phenomena.push("light powder snow likely");
                else
                    results.phenomena.push("snow likely");
            } else if (temp < -2)
                results.phenomena.push("frost likely");
        }
        if (temp < 0 && cloudCover > 70 && month >= 10 && month <= 3) { // Forest-specific snow conditions
            results.phenomena.push("snow accumulation on trees possible");
            if (windSpeed > 5)
                results.alerts.push("risk of snow-laden branches");
        }
        if (temp < 2 && temp > -8 && rainRate > 0) { // Freezing rain conditions
            results.phenomena.push("freezing rain possible");
            results.alerts.push("forest ice hazard");
        }
        if (temp > 20 && humidity > 75) // Nordic summer humidity feels different - adjust muggy threshold
            results.phenomena.push("humid for Nordic climate");
        if (Math.abs(temp - dewPoint) < 3 && temp > 0) // Fog conditions - common in forested areas near lakes
            if (visibility === null || visibility < 1) {
                if (hour < 10 || hour > 18)
                    results.phenomena.push("forest fog likely");
                else
                    results.phenomena.push("fog likely");
            }
        if (month >= 5 && month <= 8 && temp > 22 && humidity < 40 && rainRate === 0) { // Forest-specific fire risk in dry conditions (rare but possible in summer)
            results.phenomena.push("dry forest conditions");
            if (humidity < 30 && temp > 25)
                results.alerts.push("forest fire risk");
        }
    }

    // Precipitation predictions based on pressure and humidity
    if (pressure !== null && humidity !== null) {
        if (pressure < 1000 && humidity > 75)
            results.phenomena.push("precipitation likely");
        else if (pressure > 1020 && humidity < 40)
            results.phenomena.push("clear and dry");
    }

    // Wind chill effect
    if (temp !== null && windSpeed !== null) {
        if (temp < 10 && windSpeed > 3) {
            const windChillDiff = Math.round(temp - windChill);
            if (windChillDiff >= 3)
                results.phenomena.push(`feels ${windChillDiff}°C colder due to wind`);
        }
    }

    // Heat index effect
    if (temp !== null && humidity !== null) {
        if (temp > 20 && humidity > 60) {
            const heatIndexDiff = Math.round(heatIndex - temp);
            if (heatIndexDiff >= 3)
                results.phenomena.push(`feels ${heatIndexDiff}°C warmer due to humidity`);
        }
    }

    // Time of day specific phenomena - Nordic daylight considerations with precise calculations
    if (temp !== null) {
        if (month >= 5 && month <= 7) { // Summer months with very long days
            if (daylight.isDaytime && hour > 20)
                results.phenomena.push("extended Nordic summer evening light");
            if (daylight.sunriseDecimal < 4.5 && hour < 7) // Show precise sunrise time for very early summer mornings
                results.phenomena.push(`early sunrise`);
            if (!daylight.isDaytime && hour > daylight.sunsetHour && hour < daylight.sunsetHour + 2) // Add twilight information when relevant
                results.phenomena.push("lingering twilight");
            if (month === 6 && daylight.daylightHours > 18) // For near-solstice days
                results.phenomena.push("peak summer daylight period");
        } else if (month >= 11 || month <= 1) { // Winter with very short days
            if (!daylight.isDaytime && hour >= 15 && hour < 17) // Precise winter darkness timing
                results.phenomena.push(`early winter darkness`);
            if (daylight.daylightHours < 7) // Very short day warning
                results.phenomena.push(`short winter day (${Math.round(daylight.daylightHours)} hours of daylight)`);
            if (daylight.isDaytime && temp < -5) // Cold daylight
                results.phenomena.push("cold winter daylight");
            if (month === 11 && day > 15) // Near-solstice days
                results.phenomena.push("approaching winter solstice");
        }
        const currentHourDecimal = hour + new Date().getMinutes() / 60; // Civil twilight phenomena
        if (!daylight.isDaytime && currentHourDecimal >= daylight.sunsetDecimal && currentHourDecimal <= daylight.civilDuskLocal)
            results.phenomena.push("civil twilight");
        if (temp < 3 && hour > daylight.sunriseHour && hour < (daylight.sunriseHour + 3)) // Standard time patterns adjusted for Nordic climate
            results.phenomena.push("morning chill");
        if (temp > 22 && hour > 12 && hour < 16)
            results.phenomena.push("afternoon warmth");
        if (windSpeed > 5 && LOCATION_DATA.forestCoverage === "high") // Forest-specific phenomena
            results.phenomena.push("forest wind effect");
    }

    // Season-specific interpretations for Nordic region
    if (season && temp !== null) {
        switch (season.toLowerCase()) {
            case "winter":
                if (temp > 5)
                    results.phenomena.push("unusually mild winter day");
                if (temp < -20)
                    results.phenomena.push("severe Nordic winter conditions");
                if (daylight.daylightHours < 7) // Winter darkness phenomenon
                    results.phenomena.push("short winter day");
                break;
            case "summer":
                if (temp < 12)
                    results.phenomena.push("cool summer day");
                if (temp > 25)
                    results.phenomena.push("hot Nordic summer day");
                if (daylight.daylightHours > 18) // Midnight sun approximation (not quite at this latitude but still very bright evenings)
                    results.phenomena.push("extended Nordic summer daylight");
                break;
            case "spring":
                if (month === 3 && temp > 10)
                    results.phenomena.push("early spring warmth");
                if (month === 4 && rainRate > 0 && temp > 5)
                    results.phenomena.push("spring forest rain");
                break;
            case "autumn":
                if (month === 9 && temp < 5)
                    results.phenomena.push("early autumn chill");
                if (month === 10 && rainRate > 0 && temp < 10)
                    results.phenomena.push("cold autumn rain");
                break;
        }
    }

    results.comfort = determineComfortLevel(temp, humidity, windSpeed, solarRad);
    results.description = generateDescription(results);

    return results;
};

const calculateDewPoint = (temp, humidity) => { // Magnus-Tetens formula
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * temp) / (b + temp)) + Math.log(humidity / 100);
    return (b * alpha) / (a - alpha);
};

const calculateHeatIndex = (temp, rh) => {
    if (temp < 20) return temp; // Only applicable for temps > 20°C
    const tempF = (temp * 9 / 5) + 32; // Convert to Fahrenheit for the standard formula
    let heatIndexF = 0.5 * (tempF + 61.0 + ((tempF - 68.0) * 1.2) + (rh * 0.094)); // Simplified heat index formula
    if (tempF >= 80) { // Use more precise formula if hot enough
        heatIndexF = -42.379 + 2.04901523 * tempF + 10.14333127 * rh - 0.22475541 * tempF * rh - 6.83783e-3 * tempF * tempF - 5.481717e-2 * rh * rh +
            1.22874e-3 * tempF * tempF * rh + 8.5282e-4 * tempF * rh * rh - 1.99e-6 * tempF * tempF * rh * rh;
        if (rh < 13 && tempF >= 80 && tempF <= 112) // Apply adjustment for low humidity or cool temps
            heatIndexF -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
        else if (rh > 85 && tempF >= 80 && tempF <= 87)
            heatIndexF += ((rh - 85) / 10) * ((87 - tempF) / 5);
    }
    return (heatIndexF - 32) * 5 / 9; // Convert back to Celsius
};

const calculateWindChill = (temp, windSpeed) => {
    if (temp > 10 || windSpeed <= 1.3) return temp; // Only applicable for temps <= 10°C and wind > 1.3 m/s
    const windSpeedKmh = windSpeed * 3.6; // Convert wind speed to km/h
    return 13.12 + 0.6215 * temp - 11.37 * Math.pow(windSpeedKmh, 0.16) + 0.3965 * temp * Math.pow(windSpeedKmh, 0.16); // Calculate wind chill using Environment Canada formula
};

const determineFeelsLike = (temp, humidity, windSpeed) => {
    if (temp <= 10) // For cold conditions, use wind chill
        return calculateWindChill(temp, windSpeed);
    else if (temp >= 20) // For warm conditions, use heat index
        return calculateHeatIndex(temp, humidity);
    else // For moderate conditions, just use the actual temperature
        return temp;
};

const determineComfortLevel = (temp, humidity, windSpeed, solarRad) => {
    const feelsLike = determineFeelsLike(temp, humidity, windSpeed);
    if (feelsLike < -10 || feelsLike > 35)
        return "very uncomfortable";
    if (feelsLike < 0 || feelsLike > 30)
        return "uncomfortable";
    if ((temp > 20 && humidity > 80) || humidity < 20)
        return "somewhat uncomfortable";
    if (windSpeed > 8)
        return "somewhat uncomfortable";
    if (solarRad > 700)
        return "somewhat uncomfortable";
    if (feelsLike >= 18 && feelsLike <= 24 && humidity >= 30 && humidity <= 60)
        return "very comfortable";
    if (feelsLike >= 15 && feelsLike <= 28)
        return "comfortable";
    return "moderately comfortable";
};

const getCurrentSeason = (hemisphere = 'northern') => { // Nordic season adjustment - spring comes later, winter comes earlier
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

const isDateInDST = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    if (month > 10 || month < 2) return false; // November to February
    if (month > 3 && month < 9) return true;   // April to September
    const lastDayOfMarch = new Date(year, 2, 31);
    while (lastDayOfMarch.getMonth() > 2)
        lastDayOfMarch.setDate(lastDayOfMarch.getDate() - 1);
    const lastSundayOfMarch = new Date(lastDayOfMarch);
    while (lastSundayOfMarch.getDay() !== 0)
        lastSundayOfMarch.setDate(lastSundayOfMarch.getDate() - 1);
    lastSundayOfMarch.setHours(2, 0, 0, 0); // 02:00 CET
    const lastDayOfOctober = new Date(year, 9, 31);
    while (lastDayOfOctober.getMonth() > 9)
        lastDayOfOctober.setDate(lastDayOfOctober.getDate() - 1);
    const lastSundayOfOctober = new Date(lastDayOfOctober);
    while (lastSundayOfOctober.getDay() !== 0)
        lastSundayOfOctober.setDate(lastSundayOfOctober.getDate() - 1);
    lastSundayOfOctober.setHours(3, 0, 0, 0); // 03:00 CEST
    return date >= lastSundayOfMarch && date < lastSundayOfOctober;
};

const calculateDaylightHours = (latitude, longitude) => {
    const date = new Date();
    const isLeapYear = (date.getFullYear() % 4 === 0 && date.getFullYear() % 100 !== 0) || (date.getFullYear() % 400 === 0);
    const daysInFebruary = isLeapYear ? 29 : 28;
    const daysInMonth = [31, daysInFebruary, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let dayOfYear = date.getDate();
    for (let i = 0; i < date.getMonth(); i++)
        dayOfYear += daysInMonth[i];
    const latRad = latitude * Math.PI / 180;
    const fracYear = 2 * Math.PI / (isLeapYear ? 366 : 365) * (dayOfYear - 1 + (date.getHours() - 12) / 24);
    const declination = 0.006918 - 0.399912 * Math.cos(fracYear) + 0.070257 * Math.sin(fracYear) - 0.006758 * Math.cos(2 * fracYear) + 0.000907 * Math.sin(2 * fracYear) -
        0.002697 * Math.cos(3 * fracYear) + 0.00148 * Math.sin(3 * fracYear);
    const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(fracYear) - 0.032077 * Math.sin(fracYear) - 0.014615 * Math.cos(2 * fracYear) - 0.040849 * Math.sin(2 * fracYear));
    const solarNoon = 12 - eqTime / 60 - longitude / 15;
    const zenith = 90.8333 * Math.PI / 180; // Calculate sunrise/sunset hour angle, standard zenith: 90.8333 degrees (sun diameter + atmospheric refraction)
    const cosHourAngle = (Math.cos(zenith) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination));
    const polarDay = (cosHourAngle < -1);
    const polarNight = (cosHourAngle > 1);
    const hourAngle = (!polarDay && !polarNight) ? Math.acos(cosHourAngle) * 180 / Math.PI / 15 : 0;
    const sunriseUTC = solarNoon - hourAngle;
    const sunsetUTC = solarNoon + hourAngle;
    const isDST = isDateInDST(date);
    const utcOffset = isDST ? 2 : 1;
    const sunriseLocal = sunriseUTC + utcOffset;
    const sunsetLocal = sunsetUTC + utcOffset;
    const civilZenith = 96 * Math.PI / 180; // 90 + 6 degrees
    const cosCivilHourAngle = (Math.cos(civilZenith) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination));
    const civilHourAngle = (cosCivilHourAngle >= -1 && cosCivilHourAngle <= 1) ? (Math.acos(cosCivilHourAngle) * 180 / Math.PI / 15) : (cosCivilHourAngle < -1 ? 12 : 0);
    const civilDawnUTC = solarNoon - civilHourAngle;
    const civilDuskUTC = solarNoon + civilHourAngle;
    const civilDawnLocal = civilDawnUTC + utcOffset;
    const civilDuskLocal = civilDuskUTC + utcOffset;
    const normalizeTime = (time) => time < 0 ? (time + 24) : (time >= 24 ? time - 24 : time);
    const finalSunrise = normalizeTime(sunriseLocal);
    const finalSunset = normalizeTime(sunsetLocal);
    const finalCivilDawn = normalizeTime(civilDawnLocal);
    const finalCivilDusk = normalizeTime(civilDuskLocal);
    const isDaytime = (date.getHours() + (date.getMinutes() / 60)) > finalSunrise && (date.getHours() + (date.getMinutes() / 60)) < finalSunset;
    const formatTime = (timeInHours) => `${Math.floor(timeInHours).toString().padStart(2, '0')}:${Math.floor((timeInHours - Math.floor(timeInHours)) * 60).toString().padStart(2, '0')}`;
    return {
        daylightHours: polarDay ? 24 : polarNight ? 0 : 2 * hourAngle,
        sunriseDecimal: finalSunrise,
        sunsetDecimal: finalSunset,
        sunrise: formatTime(finalSunrise),
        sunset: formatTime(finalSunset),
        civilDawn: formatTime(finalCivilDawn),
        civilDusk: formatTime(finalCivilDusk),
        isPolarDay: polarDay,
        isPolarNight: polarNight,
        sunriseHour: Math.floor(finalSunrise),
        sunsetHour: Math.floor(finalSunset),
        isDaytime
    };
};

const getJulianDate = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    return 367 * year - Math.floor(7 * (year + Math.floor((month + 9) / 12)) / 4) + Math.floor(275 * month / 9) + day + 1721013.5 + (hours + minutes / 60 + seconds / 3600) / 24;
};

const joinand = (items) => {
    if (!items || items.length === 0) return '';
    else if (items.length === 1) return items[0];
    else if (items.length === 2) return `${items[0]} and ${items[1]}`;
    const lastItem = items.pop();
    return `${items.join(', ')}, and ${lastItem}`;
};

const generateDescription = (results) => {
    let description = '';
    if (results.conditions.length > 0)
        description = joinand([...new Set(results.conditions)]);
    if (results.phenomena.length > 0)
        description += (description ? ": " : "") + joinand([...new Set(results.phenomena)]);
    if (description) {
        description = description.charAt(0).toUpperCase() + description.slice(1);
        if (!description.endsWith('.'))
            description += '.';
    }
    return description || null;
};
