// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const AVIATION_LOG_INTERVAL = 60000;
const AVIATION_MAX_RECONNECT_ATTEMPTS = 5;
const AVIATION_MQTT_RECONNECT_PERIOD = 30 * 1000;
const AVIATION_MQTT_CONNECT_TIMEOUT = 10 * 1000;
const AVIATION_MQTT_TOPIC_ADSB = 'adsb/#';
const AVIATION_MQTT_TOPIC_WEATHER = 'weather/#';

function initialise(config) {
    let reconnect_attempts = 0;
    let last_log_time = 0;

    const mqtt_client = require('mqtt').connect(config.mqtt?.server || 'mqtt://localhost', {
        clientId: config.mqtt?.client || 'weather-' + Math.random().toString(16).slice(2, 8),
        reconnectPeriod: AVIATION_MQTT_RECONNECT_PERIOD,
        connectTimeout: AVIATION_MQTT_CONNECT_TIMEOUT,
    });
    mqtt_client.on('connect', () => {
        reconnect_attempts = 0;
        mqtt_client.subscribe(AVIATION_MQTT_TOPIC_ADSB, (error) => {
            if (error) console.error(`aviation-adsb: mqtt connected & subscribe failed for '${AVIATION_MQTT_TOPIC_ADSB}', error:`, error);
            else console.log(`aviation-adsb: mqtt connected & subscribed for '${AVIATION_MQTT_TOPIC_ADSB}'`);
        });
        mqtt_client.subscribe(AVIATION_MQTT_TOPIC_WEATHER, (error) => {
            if (error) console.error(`aviation-weather: mqtt connected & subscribe failed for '${AVIATION_MQTT_TOPIC_WEATHER}', error:`, error);
            else console.log(`aviation-weather: mqtt connected & subscribed for '${AVIATION_MQTT_TOPIC_WEATHER}'`);
        });
    });
    mqtt_client.on('message', (topic, message) => {
        try {
            if (topic === 'adsb/alert/insert') {
                const alert = JSON.parse(message.toString());
                const id = alert?.id;
                if (config.onAlertInserted && id) config.onAlertInserted(id, alert.warn, alert.flight, alert.text);
            } else if (topic === 'adsb/alert/remove') {
                const id = message.toString();
                if (config.onAlertRemoved && id) config.onAlertRemoved(id);
            } else if (topic.startsWith('weather/')) {
                if (config.onWeatherReceived) config.onWeatherReceived(topic, JSON.parse(message.toString()));
            }
        } catch (e) {
            console.error(`aviation: mqtt error on receive (topic: ${topic}):`, e);
        }
    });

    mqtt_client.on('error', (error) => {
        const now = Date.now();
        if (now - last_log_time > AVIATION_LOG_INTERVAL) {
            console.error(`aviation: mqtt error (suppressing further logs for ${AVIATION_LOG_INTERVAL / 1000}s):`, error.message);
            last_log_time = now;
        }
    });
    mqtt_client.on('offline', () => {
        if (++reconnect_attempts === 1) console.log('aviation: mqtt offline, will attempt to reconnect');
        else if (reconnect_attempts === AVIATION_MAX_RECONNECT_ATTEMPTS) console.log(`aviation: mqtt reconnect #${AVIATION_MAX_RECONNECT_ATTEMPTS}, will continue trying silently`);
    });
    mqtt_client.on('reconnect', () => {});
    mqtt_client.on('close', () => {});

    return {};
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (config) {
    return initialise(config);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
