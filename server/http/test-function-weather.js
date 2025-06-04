#!/usr/bin/env node

const mqtt = require('mqtt');
const weather_module = require('./server-function-weather.js')({ debug: true });

const MQTT_SERVER = process.argv[2] || 'mqtt://localhost';
const MQTT_CLIENT_ID = 'test-weather-' + Math.random().toString(16).slice(2, 8);
const TOPICS = ['weather/branna', 'sensors/radiation'];

const LOCATION = {
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

const latestData = {
    'weather/branna': undefined,
    'sensors/radiation': undefined,
};

console.log(`mqtt: connect to '${MQTT_SERVER}'`);
const client = mqtt.connect(MQTT_SERVER, { clientId: MQTT_CLIENT_ID });
client.on('connect', () => {
    console.log('mqtt: connect succeess');
    console.log(`mqtt: subscribe to '${TOPICS.join(', ')}'`);
    client.subscribe(TOPICS, (err) => {
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
        const data = JSON.parse(message.toString());
        console.log(`mqtt: [${new Date().toISOString()}] received '${topic}':`, JSON.stringify(data, undefined, 2));
        latestData[topic] = data;
        if (latestData['weather/branna'] && latestData['sensors/radiation']) {
            const weatherData = latestData['weather/branna'],
                radiationData = latestData['sensors/radiation'];
            const interpretation = weather_module.getWeatherInterpretation(
                LOCATION,
                {
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
                    snowDepth: undefined,
                    iceDepth: undefined,
                },
                { suppress: { stable: true } }
            );
            console.log('weather: getWeatherInterpretation:', JSON.stringify(interpretation, undefined, 2));
            if (interpretation?.alerts?.length > 0) console.log(`weather: ALERTS: ${interpretation.alerts.join(', ')}`);
        }
    } catch (e) {
        console.error(`weather: error processing '${topic}':`, e);
        console.error('message:', message.toString());
    }
});

process.on('SIGINT', () => {
    client.end();
    process.exit(0); // eslint-disable-line n/no-process-exit
});
