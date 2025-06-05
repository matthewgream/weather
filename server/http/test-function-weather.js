#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const weather_options = { debug: true, solarEclipse: { daysAhead: 512 }, lunarEclipse: { daysAhead: 512 }, suppress: { stable: true } };
const weather_topics = ['weather/branna', 'sensors/radiation'];
const weather_module = require('./server-function-weather.js')(weather_options);
const weather_server = process.argv[2] || 'mqtt://localhost';
const weather_location = {
    elevation: 135,
    latitude: 59.662111722943266,
    longitude: 12.9955069496646,
    summerAvgHigh: 21,
    winterAvgLow: -7,
    annualRainfall: 750,
    annualSnowfall: 150,
    forestCoverage: 'high',
    nearbyLakes: true,
    lightPollution: 'low',
    climateType: 'humid continental',
    location: 'Central Sweden',
    hemisphere: 'northern',
    timezone: 'Europe/Stockholm',
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const weatherCache = {},
    weatherQueue = [];

function weather_receive(topic, data) {
    console.log(`weather: [${new Date().toISOString()}] receive, '${topic}'`);
    weatherQueue.push({ topic, data });
}
function weather_updated() {
    if (weatherQueue.length === 0) return false;
    while (weatherQueue.length > 0) {
        const { topic, data } = weatherQueue.shift();
        weatherCache[topic] = data;
    }
    return true;
}
function weather_snapshot() {
    const snapshot = {
        'weather/branna': weatherCache['weather/branna'] ? { ...weatherCache['weather/branna'] } : undefined,
        'sensors/radiation': weatherCache['sensors/radiation'] ? { ...weatherCache['sensors/radiation'] } : undefined,
    };
    if (!snapshot['weather/branna'] || !snapshot['sensors/radiation']) return undefined;
    return snapshot;
}

function weather_process() {
    if (!weather_updated()) {
        console.log(`weather: [${new Date().toISOString()}] process, skipping - data not updated`);
        return;
    }
    const snapshot = weather_snapshot();
    if (!snapshot) {
        console.log(`weather: [${new Date().toISOString()}] process, skipping - data not available`);
        return;
    }

    try {
        const conditionsData = snapshot['weather/branna'],
            radiationData = snapshot['sensors/radiation'];
        console.log(`weather: [${new Date().toISOString()}] process, snapshot:`, JSON.stringify(snapshot, undefined, 2));
        const interpretation = weather_module.getWeatherInterpretation(weather_location, {
            timestamp: Date.now(),
            temp: conditionsData.temp,
            humidity: conditionsData.humidity,
            pressure: conditionsData.baromrel,
            windSpeed: conditionsData.windspeed ? conditionsData.windspeed / 3.6 : undefined,
            windGust: conditionsData.windgust ? conditionsData.windgust / 3.6 : undefined,
            windDir: conditionsData.winddir,
            solarRad: conditionsData.solarradiation,
            solarUvi: conditionsData.uv,
            rainRate: conditionsData.rainrate,
            radiationCpm: radiationData.cpm,
            radiationAcpm: radiationData.acpm,
            radiationUsvh: radiationData.usvh,
            cloudCover: undefined,
            snowDepth: undefined,
            iceDepth: undefined,
        });
        console.log(`weather: [${new Date().toISOString()}] process, response:`, JSON.stringify(interpretation, undefined, 2));
    } catch (e) {
        console.error(`weather: [${new Date().toISOString()}] process, error:`, e);
    }
}

let weatherInterval;
function startWeatherProcessing() {
    if (weatherInterval) clearInterval(weatherInterval);
    weatherInterval = setInterval(weather_process, 15 * 1000);
    console.log(`weather: [${new Date().toISOString()}] process, started (15 seconds)`);
}
/*function stopWeatherProcessing() {
    if (weatherInterval) {
        clearInterval(weatherInterval);
        weatherInterval = undefined;
        console.log(`weather: [${new Date().toISOString()}] process, stopped`);
    }
}*/

startWeatherProcessing();

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt = require('mqtt');
console.log(`mqtt: connect to '${weather_server}'`);
const client = mqtt.connect(weather_server, { clientId: 'test-weather-' + Math.random().toString(16).slice(2, 8) });
client.on('connect', () => {
    console.log('mqtt: connect succeess');
    console.log(`mqtt: subscribe to '${weather_topics.join(', ')}'`);
    client.subscribe(weather_topics, (err) => {
        if (err) {
            console.error('mqtt: subscribe error:', err);
            process.exit(1); // eslint-disable-line n/no-process-exit
        }
        console.log('mqtt: subscribe success');
        console.log('mqtt: waiting');
    });
});
client.on('error', (error) => {
    console.error('mqtt error:', error);
});
client.on('message', (topic, message) => {
    try {
        weather_receive(topic, JSON.parse(message.toString()));
    } catch (e) {
        console.error(`mqtt: weather_process '${topic}' error:`, e);
        console.error('message:', message.toString());
    }
});
process.on('SIGINT', () => {
    client.end();
    process.exit(0); // eslint-disable-line n/no-process-exit
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
