#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const weather_options = { debug: true, solarEclipse: { daysAhead: 512 }, lunarEclipse: { daysAhead: 512 }, suppress: { stable: true } };
const weather_topics = ['weather/branna', 'sensors/radiation'];
const weather_module = require('./server-function-weather.js')(weather_options);
const weather_mqtt = process.argv[2] || 'mqtt://localhost';
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
    climateType: 'humid continental',
    location: 'Central Sweden',
    hemisphere: 'northern',
    timezone: 'Europe/Stockholm',
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const weather_cache = {};

function weather_process(topic, data) {
    console.log(`weather: [${new Date().toISOString()}] received '${topic}':`, JSON.stringify(data, undefined, 2));
    weather_cache[topic] = data;
    if (weather_cache['weather/branna'] && weather_cache['sensors/radiation']) {
        const weatherData = weather_cache['weather/branna'],
            radiationData = weather_cache['sensors/radiation'];
        const interpretation = weather_module.getWeatherInterpretation(weather_location, {
            timestamp: Date.now(),
            temp: weatherData.temp,
            humidity: weatherData.humidity,
            pressure: weatherData.baromrel,
            windSpeed: weatherData.windspeed ? weatherData.windspeed / 3.6 : undefined,
            windGust: weatherData.windgust ? weatherData.windgust / 3.6 : undefined,
            windDir: weatherData.winddir,
            solarRad: weatherData.solarradiation,
            solarUvi: weatherData.uv,
            rainRate: weatherData.rainrate,
            radiationCpm: radiationData.cpm,
            radiationAcpm: radiationData.acpm,
            radiationUsvh: radiationData.usvh,
            cloudCover: undefined,
            snowDepth: undefined,
            iceDepth: undefined,
        });
        console.log(`weather: [${new Date().toISOString()}] returned:`, JSON.stringify(interpretation, undefined, 2));
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt = require('mqtt');
console.log(`mqtt: connect to '${weather_mqtt}'`);
const client = mqtt.connect(weather_mqtt, { clientId: 'test-weather-' + Math.random().toString(16).slice(2, 8) });
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
        weather_process(topic, JSON.parse(message.toString()));
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
