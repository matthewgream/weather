#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const weatherServer = process.argv[2] || 'mqtt://localhost';
const weatherConditionsTopic = 'weather/branna';
const weatherSensorRadiationTopic = 'sensors/radiation';
const weatherTopics = [weatherConditionsTopic, weatherSensorRadiationTopic];

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

const weatherOptions = { debug: true, solarEclipse: { daysAhead: 512 }, lunarEclipse: { daysAhead: 512 }, suppress: { stable: true } };

const weatherModule = require('server-function-weather.js')(weatherLocation, weatherOptions);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let weatherSnapshot = {};

function weatherReceive(topic, data) {
    console.error(`weather: [${new Date().toISOString()}] receive, '${topic}'`);
    weatherSnapshot[topic] = { ...data };
    if (topic == weatherConditionsTopic) weatherProcess(weatherSnapshot);
}

function weatherProcess(snapshot) {
    try {
        const dataConditions = snapshot[weatherConditionsTopic];
        const dataSensorRadiation = snapshot[weatherSensorRadiationTopic] || {};
        // assert (dataConditions);
        const timestamp = dataConditions.timestamp || Date.now();
        console.error(`weather: [${new Date().toISOString()}] process, snapshot <${new Date(timestamp).toISOString()}>:`, snapshot);
        const interpretation = weatherModule.getWeatherInterpretation({
            timestamp,
            temp: dataConditions.temp,
            humidity: dataConditions.humidity,
            pressure: dataConditions.baromrel,
            windSpeed: dataConditions.windspeed ? dataConditions.windspeed / 3.6 : undefined,
            windGust: dataConditions.windgust ? dataConditions.windgust / 3.6 : undefined,
            windDir: dataConditions.winddir,
            solarRad: dataConditions.solarradiation,
            solarUvi: dataConditions.uv,
            rainRate: dataConditions.rainrate,
            radiationCpm: dataSensorRadiation.cpm,
            radiationAcpm: dataSensorRadiation.acpm,
            radiationUsvh: dataSensorRadiation.usvh,
            cloudCover: undefined,
            snowDepth: undefined,
            iceDepth: undefined,
        });
        console.error(`weather: [${new Date().toISOString()}] process, response: <<<`, interpretation, `>>>`);
    } catch (e) {
        console.error(`weather: [${new Date().toISOString()}] process, error:`, e);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt = require('mqtt');

console.error(`mqtt: connect '${weatherServer}'`);
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
        console.error(`mqtt: process '${topic}' error:`, e);
        console.error('message:', message.toString());
    }
});

process.on('SIGINT', () => {
    client.end();
    process.exit(0); // eslint-disable-line n/no-process-exit
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
