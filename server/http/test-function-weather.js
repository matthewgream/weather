#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const weatherOptions = { debug: true, solarEclipse: { daysAhead: 512 }, lunarEclipse: { daysAhead: 512 }, suppress: { stable: true } };
const weatherTopics = ['weather/branna', 'sensors/radiation'];
const weatherModule = require('./server-function-weather.js')(weatherOptions);
const weatherServer = process.argv[2] || 'mqtt://localhost';
const weatherLocation = {
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
    horizonClear: false,
    distanceToOcean: 140,
    nearMountains: true,
    climateType: 'humid continental',
    location: 'Central Sweden',
    hemisphere: 'northern',
    timezone: 'Europe/Stockholm',
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const weatherCache = {},
    weatherQueue = [];

function weatherReceive(topic, data) {
    console.error(`weather: [${new Date().toISOString()}] receive, '${topic}'`);
    weatherQueue.push({ topic, data });
}

function weatherUpdated() {
    if (weatherQueue.length === 0) return false;
    while (weatherQueue.length > 0) {
        const { topic, data } = weatherQueue.shift();
        weatherCache[topic] = data;
    }
    return true;
}

function weatherSnapshot() {
    return weatherTopics.every((topic) => weatherCache[topic]) ? Object.fromEntries(weatherTopics.map((topic) => [topic, { ...weatherCache[topic] }])) : undefined;
}

function weatherProcess() {
    if (!weatherUpdated()) {
        console.error(`weather: [${new Date().toISOString()}] process, skipping - data not updated`);
        return;
    }
    const snapshot = weatherSnapshot();
    if (!snapshot) {
        console.error(`weather: [${new Date().toISOString()}] process, skipping - data not available`);
        return;
    }

    try {
        const conditionsData = snapshot['weather/branna'],
            radiationData = snapshot['sensors/radiation'];
        console.error(`weather: [${new Date().toISOString()}] process, snapshot:`, snapshot);
        const interpretation = weatherModule.getWeatherInterpretation(weatherLocation, {
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
        console.error(`weather: [${new Date().toISOString()}] process, response:`, interpretation);
    } catch (e) {
        console.error(`weather: [${new Date().toISOString()}] process, error:`, e);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let weatherInterval;
function weatherProcessStart() {
    if (weatherInterval) clearInterval(weatherInterval);
    weatherInterval = setInterval(weatherProcess, 15 * 1000);
    console.error(`weather: [${new Date().toISOString()}] process, started (15 seconds)`);
}
/*function weatherProcessStop() {
    if (weatherInterval) {
        clearInterval(weatherInterval);
        weatherInterval = undefined;
        console.error(`weather: [${new Date().toISOString()}] process, stopped`);
    }
}*/

weatherProcessStart();

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt = require('mqtt');

console.error(`mqtt: connect to '${weatherServer}'`);
const client = mqtt.connect(weatherServer, { clientId: 'test-weather-' + Math.random().toString(16).slice(2, 8) });

client.on('connect', () => {
    console.error('mqtt: connect succeess');
    console.error(`mqtt: subscribe to '${weatherTopics.join(', ')}'`);
    client.subscribe(weatherTopics, (err) => {
        if (err) {
            console.error('mqtt: subscribe error:', err);
            process.exit(1); // eslint-disable-line n/no-process-exit
        }
        console.error('mqtt: subscribe success');
        console.error('mqtt: waiting');
    });
});

client.on('error', (error) => {
    console.error('mqtt error:', error);
});

client.on('message', (topic, message) => {
    try {
        weatherReceive(topic, JSON.parse(message.toString()));
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
