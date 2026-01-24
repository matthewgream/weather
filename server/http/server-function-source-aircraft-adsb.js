// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const ADSB_LOG_INTERVAL = 60000;
const ADSB_MAX_RECONNECT_ATTEMPTS = 5;
const ADSB_MQTT_TOPIC = 'adsb/#';
const ADSB_MQTT_RECONNECT_PERIOD = 30 * 1000;
const ADSB_MQTT_CONNECT_TIMEOUT = 10 * 1000;

function initialise(config) {
    let reconnect_attempts = 0;
    let last_log_time = 0;

    const mqtt_client = require('mqtt').connect(config.mqtt?.server || 'mqtt://localhost', {
        clientId: config.mqtt?.client || 'client-adsb-' + Math.random().toString(16).slice(2, 8),
        reconnectPeriod: ADSB_MQTT_RECONNECT_PERIOD,
        connectTimeout: ADSB_MQTT_CONNECT_TIMEOUT,
    });
    mqtt_client.on('connect', () => {
        reconnect_attempts = 0;
        mqtt_client.subscribe(ADSB_MQTT_TOPIC, (error) => {
            if (error) console.error(`aircraft-adsb: mqtt connected & subscribe failed for '${ADSB_MQTT_TOPIC}', error:`, error);
            else console.log(`aircraft-adsb: mqtt connected & subscribed for '${ADSB_MQTT_TOPIC}'`);
        });
    });
    mqtt_client.on('message', (topic, message) => {
        try {
            //console.log(`aircraft-adsb: mqtt received: topic='${topic}', message='${message}'`);
            if (topic === 'adsb/alert/insert') {
                const alert = JSON.parse(message.toString());
                const id = alert?.id;
                if (config.onAlertInserted && id) config.onAlertInserted(id, alert.warn, alert.flight, alert.text);
            } else if (topic === 'adsb/alert/remove') {
                const id = message.toString();
                if (config.onAlertRemoved && id) config.onAlertRemoved(id);
            }
        } catch (e) {
            console.error(`aircraft-adsb: onAlertInserted/onAlertRemoved error:`, e);
        }
    });

    mqtt_client.on('error', (error) => {
        const now = Date.now();
        if (now - last_log_time > ADSB_LOG_INTERVAL) {
            console.error(`aircraft-adsb: mqtt error (suppressing further logs for ${ADSB_LOG_INTERVAL / 1000}s):`, error.message);
            last_log_time = now;
        }
    });
    mqtt_client.on('offline', () => {
        if (++reconnect_attempts === 1) console.log('aircraft-adsb: mqtt offline, will attempt to reconnect');
        else if (reconnect_attempts === ADSB_MAX_RECONNECT_ATTEMPTS) console.log(`aircraft-adsb: mqtt reconnect #${ADSB_MAX_RECONNECT_ATTEMPTS}, will continue trying silently`);
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
