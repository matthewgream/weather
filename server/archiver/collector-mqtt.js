// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt = require('mqtt');

let config = {};
let client = null;
let receiver = null;

function mqttReceive(topic, message) {
    try {
        if (receiver) receiver(topic, message);
    } catch (error) {
        console.error(`mqtt: receiver on '${topic}', error (exception):`, error);
    }
}

function mqttSubscribe() {
    if (client) {
        config.topics.forEach((topic) =>
            client.subscribe(topic, (err) => {
                if (err) console.error(`mqtt: subscribe to '${topic}', error:`, err);
                else console.log(`mqtt: subscribe to '${topic}', succeeded`);
            })
        );
    }
}

function mqttBegin(r) {
    const options = {
        clientId: config.clientId,
    };
    if (config.username && config.password) {
        options.username = config.username;
        options.password = config.password;
    }

    receiver = r;
    console.log(`mqtt: connecting to '${config.broker}'`);
    client = mqtt.connect(config.broker, options);

    if (client) {
        client.on('connect', () => {
            console.log('mqtt: connected');
            mqttSubscribe();
        });
        client.on('message', (topic, message) => {
            mqttReceive(topic, message);
        });
        client.on('error', (err) => console.error('mqtt: error:', err));
        client.on('offline', () => console.warn('mqtt: offline'));
        client.on('reconnect', () => console.log('mqtt: reconnect'));
    }

    console.log(`mqtt: loaded using 'broker=${config.broker}'`);
}

function mqttEnd() {
    if (client) {
        client.end();
        client = null;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (c) {
    config = c;
    return {
        begin: mqttBegin,
        end: mqttEnd,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
