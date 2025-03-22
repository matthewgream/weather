
/**
 * Enhanced weather interpretation function
 * Analyzes meteorological data to provide human-readable weather descriptions
 * Based on standard meteorological classifications and best practices
 * Optimized for Nordic forest location at 59°39'43.5"N 12°59'43.8"E (Central Sweden)
 * 
 * @param {Object} data - Weather data object
 * @param {number} data.temp - Temperature in Celsius
 * @param {number} data.humidity - Relative humidity percentage
 * @param {number} data.pressure - Atmospheric pressure in hPa/mb
 * @param {number} data.windSpeed - Wind speed in m/s
 * @param {number} data.solarRad - Solar radiation in W/m²
 * @param {number} data.solarUvi - UV index
 * @param {number} data.rainRate - Precipitation rate in mm/h
 * @param {number} [data.cloudCover] - Cloud cover percentage (optional)
 * @param {number} [data.visibility] - Visibility in km (optional)
 * @param {string} [data.location="Central Sweden"] - Location information (optional)
 * @param {string} [data.season] - Current season (optional)
 * @returns {Object} Weather interpretation with conditions, phenomena, and comfort
 */

const getWeatherInterpretation = (data) => {
    // Destructure with defaults for optional parameters
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
    
    // Location-specific constants for Central Sweden (59°39'43.5"N 12°59'43.8"E)
    const LOCATION_DATA = {
        elevation: 145,
        latitude: 59.662083,
        longitude: 12.995500,
        summerAvgHigh: 21, // °C
        winterAvgLow: -7, // °C
        annualRainfall: 750, // mm
        annualSnowfall: 150, // cm
        forestCoverage: "high",
        nearbyLakes: true,
        climateType: "humid continental"
    };

    // Calculate derived values
    const dewPoint = calculateDewPoint(temp, humidity);
    const heatIndex = calculateHeatIndex(temp, humidity);
    const windChill = calculateWindChill(temp, windSpeed);
    const feelsLike = determineFeelsLike(temp, humidity, windSpeed);
    const hour = new Date().getHours();
    const date = new Date();
    const month = date.getMonth(); // 0-11 (Jan-Dec)
    const day = date.getDate();
    
    // Calculate precise daylight hours for Nordic location
    const daylight = calculateDaylightHours(
        LOCATION_DATA.latitude, 
        LOCATION_DATA.longitude, 
        month, 
        day
    );
    
    const isDaytime = hour >= daylight.sunriseHour && hour <= daylight.sunsetHour;

    // Results object
    const results = {
        conditions: [],
        phenomena: [],
        comfort: null,
        alerts: [],
        description: null,
        feelsLike,
		daylight, isDaytime
    };

    // Atmospheric pressure conditions - Nordic context
    if (pressure !== null) {
        // Adjust pressure for elevation (approximately 150m)
        const elevationAdjustment = Math.exp(LOCATION_DATA.elevation / (29.3 * (temp + 273)));
        const adjustedPressure = pressure * elevationAdjustment;
        
        if (adjustedPressure < 970) {
            results.conditions.push("severe storm conditions");
            results.alerts.push("Dangerously low pressure system");
        } else if (adjustedPressure < 990) {
            results.conditions.push("stormy");
        } else if (adjustedPressure < 1000) {
            results.conditions.push("unsettled");
        } else if (adjustedPressure >= 1000 && adjustedPressure <= 1015) {
            // Normal pressure range - no specific condition
        } else if (adjustedPressure > 1015 && adjustedPressure <= 1025) {
            results.conditions.push("settled");
        } else if (adjustedPressure > 1025) {
            results.conditions.push("stable high pressure");
        }
        
        // Nordic-specific pressure context
        if (month >= 9 && month <= 3) { // Fall through early spring
            if (adjustedPressure > 1020) {
                // High pressure in winter often brings very cold conditions
                results.phenomena.push("clear winter conditions likely");
            } else if (adjustedPressure < 990 && temp > 0) {
                // Low pressure in winter with temps above freezing often brings precipitation
                results.phenomena.push("winter precipitation likely");
            }
        }
    }

    // Temperature conditions - adapted for Central Sweden climate
    if (temp !== null) {
        // Adjusted for Swedish climate where cold is more common and heat more exceptional
        if (temp < -25) {
            results.conditions.push("extremely cold");
            results.alerts.push("Extreme cold warning");
        } else if (temp < -15) {
            results.conditions.push("very cold");
        } else if (temp < -5) {
            results.conditions.push("cold");
        } else if (temp < 0) {
            results.conditions.push("freezing");
        } else if (temp < 5) {
            results.conditions.push("chilly");
        } else if (temp < 10) {
            results.conditions.push("cool");
        } else if (temp >= 10 && temp < 18) {
            results.conditions.push("mild");
        } else if (temp >= 18 && temp < 23) {
            results.conditions.push("warm");
        } else if (temp >= 23 && temp < 28) {
            results.conditions.push("hot");
        } else {
            results.conditions.push("very hot");
            if (temp >= 30) {
                results.alerts.push("Unusual heat for this region");
            }
        }
        
        // Season-specific temperature context for Sweden
        if (month >= 11 || month <= 2) { // Winter months
            if (temp > 5) {
                results.phenomena.push("unseasonably warm for winter");
            } else if (temp < -20) {
                results.phenomena.push("extreme Nordic winter conditions");
            }
        } else if (month >= 6 && month <= 8) { // Summer months
            if (temp > 25) {
                results.phenomena.push("unusually hot for this region");
            } else if (temp < 10) {
                results.phenomena.push("unseasonably cool for summer");
            }
        }
    }

    // Humidity conditions
    if (humidity !== null) {
        if (humidity > 90) {
            results.conditions.push("very humid");
        } else if (humidity > 70) {
            results.conditions.push("humid");
        } else if (humidity >= 30 && humidity <= 60) {
            // Comfortable humidity range - no specific condition
        } else if (humidity < 30) {
            results.conditions.push("dry");
            if (humidity < 15) {
                results.conditions.push("extremely dry");
            }
        }
    }

    // Wind conditions - using Beaufort scale as reference
    if (windSpeed !== null) {
        if (windSpeed < 0.5) {
            results.conditions.push("calm");
        } else if (windSpeed < 1.5) {
            results.conditions.push("light air");
        } else if (windSpeed < 3.3) {
            results.conditions.push("light breeze");
        } else if (windSpeed < 5.5) {
            results.conditions.push("gentle breeze");
        } else if (windSpeed < 7.9) {
            results.conditions.push("moderate breeze");
        } else if (windSpeed < 10.7) {
            results.conditions.push("fresh breeze");
        } else if (windSpeed < 13.8) {
            results.conditions.push("strong breeze");
        } else if (windSpeed < 17.1) {
            results.conditions.push("near gale");
            results.alerts.push("Strong wind advisory");
        } else if (windSpeed < 20.7) {
            results.conditions.push("gale");
            results.alerts.push("Gale warning");
        } else if (windSpeed < 24.4) {
            results.conditions.push("strong gale");
            results.alerts.push("Strong gale warning");
        } else if (windSpeed < 28.4) {
            results.conditions.push("storm");
            results.alerts.push("Storm warning");
        } else if (windSpeed < 32.6) {
            results.conditions.push("violent storm");
            results.alerts.push("Violent storm warning");
        } else {
            results.conditions.push("hurricane force");
            results.alerts.push("Hurricane force wind warning");
        }
    }

    // Cloud cover conditions
    if (cloudCover !== null) {
        if (cloudCover < 10) {
            results.conditions.push("clear sky");
        } else if (cloudCover < 30) {
            results.conditions.push("mostly clear");
        } else if (cloudCover < 70) {
            results.conditions.push("partly cloudy");
        } else if (cloudCover < 90) {
            results.conditions.push("mostly cloudy");
        } else {
            results.conditions.push("overcast");
        }
    }

    // Precipitation conditions
    if (rainRate !== null) {
        if (rainRate > 0 && rainRate < 0.5) {
            results.conditions.push("light precipitation");
        } else if (rainRate >= 0.5 && rainRate < 4) {
            results.conditions.push("moderate precipitation");
        } else if (rainRate >= 4 && rainRate < 8) {
            results.conditions.push("heavy precipitation");
        } else if (rainRate >= 8) {
            results.conditions.push("very heavy precipitation");
            results.alerts.push("Heavy rainfall warning");
        }
    }

    // Solar radiation and UV conditions
    if (solarRad !== null || solarUvi !== null) {
        if (solarRad > 800) {
            results.conditions.push("intense sunlight");
        } else if (solarRad > 500) {
            results.conditions.push("strong sunlight");
        }

        if (solarUvi !== null) {
            if (solarUvi >= 11) {
                results.conditions.push("extreme UV");
                results.alerts.push("Extreme UV warning");
            } else if (solarUvi >= 8) {
                results.conditions.push("very high UV");
                results.alerts.push("Very high UV warning");
            } else if (solarUvi >= 6) {
                results.conditions.push("high UV");
            } else if (solarUvi >= 3) {
                results.conditions.push("moderate UV");
            }
        }
    }

    // Visibility conditions
    if (visibility !== null) {
        if (visibility < 0.05) {
            results.conditions.push("dense fog");
            results.alerts.push("Dense fog warning");
        } else if (visibility < 0.2) {
            results.conditions.push("fog");
        } else if (visibility < 1) {
            results.conditions.push("mist");
        } else if (visibility < 4) {
            results.conditions.push("poor visibility");
        } else if (visibility > 20) {
            results.conditions.push("excellent visibility");
        }
    }

    // Weather phenomena interpretations - Nordic forest context
    if (temp !== null && humidity !== null) {
        // Snow conditions - common in this region
        if (temp < 0 && humidity > 70) {
            if (rainRate > 0) {
                if (temp < -10) {
                    results.phenomena.push("light powder snow likely");
                } else {
                    results.phenomena.push("snow likely");
                }
            } else if (temp < -2) {
                results.phenomena.push("frost likely");
            }
        }
        
        // Forest-specific snow conditions
        if (temp < 0 && cloudCover > 70 && month >= 10 && month <= 3) {
            results.phenomena.push("snow accumulation on trees possible");
            if (windSpeed > 5) {
                results.alerts.push("Risk of snow-laden tree branches");
            }
        }
        
        // Freezing rain conditions
        if (temp < 2 && temp > -8 && rainRate > 0) {
            results.phenomena.push("freezing rain possible");
            results.alerts.push("Ice hazard in forest conditions");
        }
        
        // Nordic summer humidity feels different - adjust muggy threshold
        if (temp > 20 && humidity > 75) {
            results.phenomena.push("humid for Nordic climate");
        }
        
        // Fog conditions - common in forested areas near lakes
        if (Math.abs(temp - dewPoint) < 3 && temp > 0) {
            if (visibility === null || visibility < 1) {
                if (hour < 10 || hour > 18) {
                    results.phenomena.push("forest fog likely");
                } else {
                    results.phenomena.push("fog likely");
                }
            }
        }
        
        // Forest-specific fire risk in dry conditions (rare but possible in summer)
        if (month >= 5 && month <= 8 && temp > 22 && humidity < 40 && rainRate === 0) {
            results.phenomena.push("dry forest conditions");
            if (humidity < 30 && temp > 25) {
                results.alerts.push("Elevated forest fire risk");
            }
        }
    }
    
    // Precipitation predictions based on pressure and humidity
    if (pressure !== null && humidity !== null) {
        if (pressure < 1000 && humidity > 75) {
            results.phenomena.push("precipitation likely");
        } else if (pressure > 1020 && humidity < 40) {
            results.phenomena.push("clear and dry");
        }
    }
    
    // Wind chill effect
    if (temp !== null && windSpeed !== null) {
        if (temp < 10 && windSpeed > 3) {
            const windChillDiff = Math.round(temp - windChill);
            if (windChillDiff >= 3) {
                results.phenomena.push(`feels ${windChillDiff}°C colder due to wind`);
            }
        }
    }
    
    // Heat index effect
    if (temp !== null && humidity !== null) {
        if (temp > 20 && humidity > 60) {
            const heatIndexDiff = Math.round(heatIndex - temp);
            if (heatIndexDiff >= 3) {
                results.phenomena.push(`feels ${heatIndexDiff}°C warmer due to humidity`);
            }
        }
    }
    
    // Time of day specific phenomena - adjusted for Swedish daylight patterns
    if (temp !== null) {
        // Nordic daylight considerations with precise calculations
        if (month >= 5 && month <= 7) { // Summer months with very long days
            if (isDaytime && hour > 20) {
                results.phenomena.push("extended Nordic summer evening light");
            }
            
            // Show precise sunrise time for very early summer mornings
            if (daylight.sunriseDecimal < 4.5 && hour < 7) {
                results.phenomena.push(`early sunrise`);
            }
            
            // Add twilight information when relevant
            if (!isDaytime && hour > daylight.sunsetHour && hour < daylight.sunsetHour + 2) {
                results.phenomena.push("lingering twilight");
            }
            
            // For near-solstice days
            if (month === 6 && daylight.daylightHours > 18) {
                results.phenomena.push("peak summer daylight period");
            }
        } else if (month >= 11 || month <= 1) { // Winter with very short days
            // Precise winter darkness timing
            if (!isDaytime && hour >= 15 && hour < 17) {
                results.phenomena.push(`early winter darkness`);
            }
            
            // Very short day warning
            if (daylight.daylightHours < 7) {
                results.phenomena.push(`short winter day (${Math.round(daylight.daylightHours)} hours of daylight)`);
            }
            
            // Cold daylight
            if (isDaytime && temp < -5) {
                results.phenomena.push("cold winter daylight");
            }
            
            // Near-solstice days
            if (month === 11 && day > 15) {
                results.phenomena.push("approaching winter solstice");
            }
        }
        
        // Civil twilight phenomena
        const currentHourDecimal = hour + new Date().getMinutes() / 60;
        if (!isDaytime && currentHourDecimal >= daylight.sunsetDecimal && currentHourDecimal <= daylight.civilDuskLocal) {
            results.phenomena.push("civil twilight");
        }
        
        // Standard time patterns adjusted for Nordic climate
        if (temp < 3 && hour > daylight.sunriseHour && hour < (daylight.sunriseHour + 3)) {
            results.phenomena.push("morning chill");
        }
        if (temp > 22 && hour > 12 && hour < 16) {
            results.phenomena.push("afternoon warmth");
        }
        
        // Forest-specific phenomena
        if (windSpeed > 5 && LOCATION_DATA.forestCoverage === "high") {
            results.phenomena.push("forest wind effect");
        }
    }
    
    // Season-specific interpretations for Nordic region
    if (season && temp !== null) {
        switch(season.toLowerCase()) {
            case "winter":
                if (temp > 5) {
                    results.phenomena.push("unusually mild winter day");
                }
                if (temp < -20) {
                    results.phenomena.push("severe Nordic winter conditions");
                }
                // Winter darkness phenomenon
                if (daylight.daylightHours < 7) {
                    results.phenomena.push("short winter day");
                }
                break;
            case "summer":
                if (temp < 12) {
                    results.phenomena.push("cool summer day");
                }
                if (temp > 25) {
                    results.phenomena.push("hot Nordic summer day");
                }
                // Midnight sun approximation (not quite at this latitude but still very bright evenings)
                if (daylight.daylightHours > 18) {
                    results.phenomena.push("extended Nordic summer daylight");
                }
                break;
            case "spring":
                if (month === 3 && temp > 10) {
                    results.phenomena.push("early spring warmth");
                }
                if (month === 4 && rainRate > 0 && temp > 5) {
                    results.phenomena.push("spring forest rain");
                }
                break;
            case "autumn":
                if (month === 9 && temp < 5) {
                    results.phenomena.push("early autumn chill");
                }
                if (month === 10 && rainRate > 0 && temp < 10) {
                    results.phenomena.push("cold autumn rain");
                }
                break;
        }
    }

    // Determine comfort level
    // results.comfort = determineComfortLevel(temp, humidity, windSpeed, solarRad);

    // Generate human-readable description
    results.description = generateDescription(results);

    return results;
};

/**
 * Calculate dew point temperature
 * @param {number} temp - Temperature in Celsius
 * @param {number} humidity - Relative humidity percentage
 * @returns {number} Dew point in Celsius
 */
const calculateDewPoint = (temp, humidity) => {
    // Magnus-Tetens formula
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * temp) / (b + temp)) + Math.log(humidity / 100);
    return (b * alpha) / (a - alpha);
};

/**
 * Calculate heat index (apparent temperature due to humidity)
 * @param {number} temp - Temperature in Celsius
 * @param {number} humidity - Relative humidity percentage
 * @returns {number} Heat index in Celsius
 */
const calculateHeatIndex = (temp, humidity) => {
    // Only applicable for temps > 20°C
    if (temp < 20) return temp;
    
    // Convert to Fahrenheit for the standard formula
    const tempF = (temp * 9/5) + 32;
    const rh = humidity;
    
    // Simplified heat index formula
    let heatIndexF = 0.5 * (tempF + 61.0 + ((tempF - 68.0) * 1.2) + (rh * 0.094));
    
    // Use more precise formula if hot enough
    if (tempF >= 80) {
        heatIndexF = -42.379 + 
                     2.04901523 * tempF + 
                     10.14333127 * rh - 
                     0.22475541 * tempF * rh - 
                     6.83783e-3 * tempF * tempF - 
                     5.481717e-2 * rh * rh + 
                     1.22874e-3 * tempF * tempF * rh + 
                     8.5282e-4 * tempF * rh * rh - 
                     1.99e-6 * tempF * tempF * rh * rh;
        
        // Apply adjustment for low humidity or cool temps
        if (rh < 13 && tempF >= 80 && tempF <= 112) {
            heatIndexF -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
        } else if (rh > 85 && tempF >= 80 && tempF <= 87) {
            heatIndexF += ((rh - 85) / 10) * ((87 - tempF) / 5);
        }
    }
    
    // Convert back to Celsius
    return (heatIndexF - 32) * 5/9;
};

/**
 * Calculate wind chill factor
 * @param {number} temp - Temperature in Celsius
 * @param {number} windSpeed - Wind speed in m/s
 * @returns {number} Wind chill temperature in Celsius
 */
const calculateWindChill = (temp, windSpeed) => {
    // Only applicable for temps <= 10°C and wind > 1.3 m/s
    if (temp > 10 || windSpeed <= 1.3) return temp;
    
    // Convert wind speed to km/h
    const windSpeedKmh = windSpeed * 3.6;
    
    // Calculate wind chill using Environment Canada formula
    return 13.12 + 0.6215 * temp - 11.37 * Math.pow(windSpeedKmh, 0.16) + 0.3965 * temp * Math.pow(windSpeedKmh, 0.16);
};

/**
 * Determine "feels like" temperature considering wind chill and heat index
 * @param {number} temp - Temperature in Celsius
 * @param {number} humidity - Relative humidity percentage
 * @param {number} windSpeed - Wind speed in m/s
 * @returns {number} "Feels like" temperature in Celsius
 */
const determineFeelsLike = (temp, humidity, windSpeed) => {
    // For cold conditions, use wind chill
    if (temp <= 10) {
        return calculateWindChill(temp, windSpeed);
    }
    // For warm conditions, use heat index
    else if (temp >= 20) {
        return calculateHeatIndex(temp, humidity);
    }
    // For moderate conditions, just use the actual temperature
    else {
        return temp;
    }
};

/**
 * Determine overall comfort level based on weather conditions
 * @param {number} temp - Temperature in Celsius
 * @param {number} humidity - Relative humidity percentage
 * @param {number} windSpeed - Wind speed in m/s
 * @param {number} solarRad - Solar radiation in W/m²
 * @returns {string} Comfort level description
 */
const determineComfortLevel = (temp, humidity, windSpeed, solarRad) => {
    // Calculate "feels like" temperature
    const feelsLike = determineFeelsLike(temp, humidity, windSpeed);
    
    // Very uncomfortable conditions
    if (feelsLike < -10 || feelsLike > 35) {
        return "very uncomfortable";
    }
    
    // Uncomfortable conditions
    if (feelsLike < 0 || feelsLike > 30) {
        return "uncomfortable";
    }
    
    // Check humidity discomfort
    if ((temp > 20 && humidity > 80) || humidity < 20) {
        return "somewhat uncomfortable";
    }
    
    // Check strong wind discomfort
    if (windSpeed > 8) {
        return "somewhat uncomfortable";
    }
    
    // Check intense sun discomfort
    if (solarRad > 700) {
        return "somewhat uncomfortable";
    }
    
    // Ideal comfort range
    if (feelsLike >= 18 && feelsLike <= 24 && humidity >= 30 && humidity <= 60) {
        return "very comfortable";
    }
    
    // Generally comfortable range
    if (feelsLike >= 15 && feelsLike <= 28) {
        return "comfortable";
    }
    
    // Default
    return "moderately comfortable";
};

/**
 * Get current season based on hemisphere and month
 * Adjusted for Nordic climate where seasons are shifted slightly
 * @param {string} [hemisphere='northern'] - 'northern' or 'southern'
 * @returns {string} Current season name
 */
const getCurrentSeason = (hemisphere = 'northern') => {
    const month = new Date().getMonth();
    
    if (hemisphere.toLowerCase() === 'northern') {
        // Nordic season adjustment - spring comes later, winter comes earlier
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

/**
 * Determine if a given date is in Daylight Saving Time (DST) for Sweden
 * DST in Sweden runs from the last Sunday in March (02:00 CET) 
 * to the last Sunday in October (03:00 CEST)
 * 
 * @param {Date} date - Date to check
 * @returns {boolean} True if date is in DST period
 */
const isDateInDST = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11 for Jan-Dec
    
    // Early return for months definitely in or out of DST
    if (month > 10 || month < 2) return false; // November to February
    if (month > 3 && month < 9) return true;   // April to September
    
    // Calculate last Sunday of March
    const lastDayOfMarch = new Date(year, 2, 31);
    while (lastDayOfMarch.getMonth() > 2)
        lastDayOfMarch.setDate(lastDayOfMarch.getDate() - 1);
    const lastSundayOfMarch = new Date(lastDayOfMarch);
    while (lastSundayOfMarch.getDay() !== 0)
        lastSundayOfMarch.setDate(lastSundayOfMarch.getDate() - 1);
    lastSundayOfMarch.setHours(2, 0, 0, 0); // 02:00 CET
    
    // Calculate last Sunday of October
    const lastDayOfOctober = new Date(year, 9, 31);
    while (lastDayOfOctober.getMonth() > 9)
        lastDayOfOctober.setDate(lastDayOfOctober.getDate() - 1);
    const lastSundayOfOctober = new Date(lastDayOfOctober);
    while (lastSundayOfOctober.getDay() !== 0)
        lastSundayOfOctober.setDate(lastSundayOfOctober.getDate() - 1);
    lastSundayOfOctober.setHours(3, 0, 0, 0); // 03:00 CEST
    
    // Check if date is between these two times
    return date >= lastSundayOfMarch && date < lastSundayOfOctober;
};

/**
 * Calculate precise sunrise and sunset times based on location and date
 * Corrected and validated against standard astronomical algorithms
 * 
 * @param {number} latitude - Latitude in decimal degrees
 * @param {number} longitude - Longitude in decimal degrees
 * @param {number} month - Month (0-11)
 * @param {number} day - Day of month
 * @returns {Object} Detailed daylight information
 */
const calculateDaylightHours = (latitude, longitude, month = new Date().getMonth(), day = new Date().getDate()) => {
    // Create date object for calculations (use current year)
    const date = new Date();
    date.setMonth(month);
    date.setDate(day);
    
    // Calculate day of year (accounting for leap years)
    const isLeapYear = (date.getFullYear() % 4 === 0 && date.getFullYear() % 100 !== 0) || (date.getFullYear() % 400 === 0);
    const daysInFebruary = isLeapYear ? 29 : 28;
    const daysInMonth = [31, daysInFebruary, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let dayOfYear = day;
    for (let i = 0; i < month; i++)
        dayOfYear += daysInMonth[i];
    
    // Convert to radians for calculations
    const latRad = latitude * Math.PI / 180;
    
    // Calculate solar declination (more accurate formula)
    const fracYear = 2 * Math.PI / (isLeapYear ? 366 : 365) * (dayOfYear - 1 + (date.getHours() - 12) / 24);
    let declination = 0.006918 - 0.399912 * Math.cos(fracYear) + 0.070257 * Math.sin(fracYear) - 
                      0.006758 * Math.cos(2 * fracYear) + 0.000907 * Math.sin(2 * fracYear) - 
                      0.002697 * Math.cos(3 * fracYear) + 0.00148 * Math.sin(3 * fracYear);
    
    // Calculate equation of time (in minutes)
    const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(fracYear) - 0.032077 * Math.sin(fracYear) - 0.014615 * Math.cos(2 * fracYear) - 0.040849 * Math.sin(2 * fracYear));
    
    // Calculate solar noon (in hours, UTC)
    const solarNoon = 12 - eqTime / 60 - longitude / 15;
    
    // Calculate sunrise/sunset hour angle
    // Standard zenith: 90.8333 degrees (sun diameter + atmospheric refraction)
    const zenith = 90.8333 * Math.PI / 180;
    const cosHourAngle = (Math.cos(zenith) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination));
    
    // Check for polar day/night
    let polarDay = false;
    let polarNight = false;
    if (cosHourAngle < -1) {
        polarDay = true;
    } else if (cosHourAngle > 1) {
        polarNight = true;
    }
    
    // Calculate sunrise and sunset times (in UTC hours)
    let hourAngle = 0;
    if (!polarDay && !polarNight) {
        hourAngle = Math.acos(cosHourAngle);
        hourAngle = hourAngle * 180 / Math.PI / 15; // Convert to hours
    }
    const sunriseUTC = solarNoon - hourAngle;
    const sunsetUTC = solarNoon + hourAngle;
    // Apply UTC to local time conversion
    // For Sweden, UTC+1 in winter, UTC+2 in summer
    // Simplified approach - in reality, would need to check DST rules
    const isDST = isDateInDST(date);
    const utcOffset = isDST ? 2 : 1;
    const sunriseLocal = sunriseUTC + utcOffset;
    const sunsetLocal = sunsetUTC + utcOffset;
    
    // Calculate civil twilight (sun is 6 degrees below horizon)
    const civilZenith = 96 * Math.PI / 180; // 90 + 6 degrees
    const cosCivilHourAngle = (Math.cos(civilZenith) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination));
    let civilHourAngle = 0;
    if (cosCivilHourAngle >= -1 && cosCivilHourAngle <= 1) {
        civilHourAngle = Math.acos(cosCivilHourAngle) * 180 / Math.PI / 15;
    } else if (cosCivilHourAngle < -1) {
        // Continuous civil twilight or brighter
        civilHourAngle = 12;
    } else {
        // No civil twilight
        civilHourAngle = 0;
    }
    const civilDawnUTC = solarNoon - civilHourAngle;
    const civilDuskUTC = solarNoon + civilHourAngle;
    const civilDawnLocal = civilDawnUTC + utcOffset;
    const civilDuskLocal = civilDuskUTC + utcOffset;
    
    // Normalize times (handle wrapping around midnight)
    const normalizeTime = (time) => {
        if (time < 0) return time + 24;
        if (time >= 24) return time - 24;
        return time;
    };
    const finalSunrise = normalizeTime(sunriseLocal);
    const finalSunset = normalizeTime(sunsetLocal);
    const finalCivilDawn = normalizeTime(civilDawnLocal);
    const finalCivilDusk = normalizeTime(civilDuskLocal);
    
    // Format to HH:MM
    const formatTime = (timeInHours) => {
        const hours = Math.floor(timeInHours);
        const minutes = Math.floor((timeInHours - hours) * 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };
    
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
        sunsetHour: Math.floor(finalSunset)
    };
};

/**
 * Calculate Julian date from JavaScript Date object
 * @param {Date} date - JavaScript Date object
 * @returns {number} Julian date
 */
const getJulianDate = (date) => {
    // Constants for calculating Julian date
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    // Calculate Julian date
    let jd = 367 * year - Math.floor(7 * (year + Math.floor((month + 9) / 12)) / 4);
    jd += Math.floor(275 * month / 9) + day + 1721013.5;
    
    // Add time of day
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    jd += (hours + minutes / 60 + seconds / 3600) / 24;
    
    return jd;
};

/**
 * Format list of items with proper grammar
 * @param {string[]} items - Array of string items to join
 * @returns {string} Grammatically correct joined string
 */
const joinAnd = (items) => {
    if (!items || items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    
    const lastItem = items.pop();
    return `${items.join(', ')}, and ${lastItem}`;
};

/**
 * Generate human-readable weather description
 * @param {Object} results - Weather interpretation results
 * @returns {string} Human-readable description
 */
const generateDescription = (results) => {
    let description = '';
    
    // Add main conditions
    if (results.conditions.length > 0) {
        const uniqueConditions = [...new Set(results.conditions)];
        description = joinAnd(uniqueConditions);
        description = description.charAt(0).toUpperCase() + description.slice(1);
    }
    
    // Add weather phenomena
    if (results.phenomena.length > 0) {
        const uniquePhenomena = [...new Set(results.phenomena)];
        const phenomenaText = joinAnd(uniquePhenomena);
        
        if (description) {
            description += ` with ${phenomenaText}`;
        } else {
            description = phenomenaText.charAt(0).toUpperCase() + phenomenaText.slice(1);
        }
    }
    
    // Add comfort level if available
    if (results.comfort && !description.includes(results.comfort)) {
        description += `. Conditions are ${results.comfort}`;
    }
    
    // Add period at the end if not already present
    if (description && !description.endsWith('.')) {
        description += '.';
    }
    
    return description || null;
};

