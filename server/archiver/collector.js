#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const REPORT_PERIOD_DEFAULT = 15; // report output every this many minutes

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');

const configPath = process.argv[2] || 'secrets.txt';

function configLoad(configPath) {
    try {
        const items = {};
        fs.readFileSync(configPath, 'utf8')
            .split('\n')
            .forEach((line) => {
                const [key, value] = line.split('=').map((s) => s.trim());
                if (key && value) items[key] = value;
            });
        return items;
    } catch {
        console.warn(`config: could not load '${configPath}', using defaults (which may not work correctly)`);
        return {};
    }
}

const conf = configLoad(configPath);
const config = {
    mqtt: {
        broker: conf.MQTT,
        username: '',
        password: '',
        clientId: 'archiver-collector-' + Math.random().toString(16).substring(2, 8),
        topics: ['weather/#', 'sensors/#', 'snapshots/#'],
    },
    storage: {
        messages: conf.STORAGE + '/messages',
        snapshots: conf.STORAGE + '/snapshots',
        timelapse: conf.STORAGE + '/timelapse',
    },
};

const configList = Object.entries(conf)
    .map(([k, v]) => k.toLowerCase() + '=' + v)
    .join(', ');

console.log(`config: loaded using '${configPath}': ${configList}`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let archiverLoaded = false;

const { ReportCounter } = require('./collector-functions.js');

const archiverSpec = {
    messages: require('./collector-messages.js'),
    snapshots: require('./collector-snapshots.js'),
};

const archiverConf = {
    messages: {
        enabled: true,
        topicPattern: (topic) => topic.startsWith('weather/') || topic.startsWith('sensors/'),
    },
    snapshots: {
        enabled: true,
        topicPattern: (topic) => topic.startsWith('snapshots/'),
    },
};

const archiverExec = {};

function archiverBegin() {
    Object.entries(archiverConf)
        .filter(([type, conf]) => conf.enabled && archiverSpec[type]?.begin)
        .forEach(([type]) => {
            archiverSpec[type].begin(config);
            archiverExec[type] = { report: new ReportCounter({ label: type, period: REPORT_PERIOD_DEFAULT }) };
        });
    archiverLoaded = true;
}

function archiverEnd() {
    if (!archiverLoaded) return;
    Object.entries(archiverConf)
        .reverse()
        .filter(([type, conf]) => conf.enabled && archiverSpec[type]?.end)
        .forEach(([type]) => {
            archiverSpec[type].end();
            archiverExec[type].report.end();
        });
}

function archiverProcess(topic, message) {
    if (!archiverLoaded) return;
    Object.entries(archiverConf)
        .filter(([type, conf]) => conf.enabled && archiverSpec[type]?.process && conf.topicPattern(topic))
        .forEach(([type]) => {
            archiverSpec[type].process(topic, message);
            archiverExec[type].report.update(topic);
        });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt = require('mqtt');

let __client = null;
let __receiver = null;

function mqttReceive(topic, message) {
    try {
        if (__receiver) __receiver(topic, message);
    } catch (error) {
        console.error(`mqtt: receiver on '${topic}', error (exception):`, error);
    }
}

function mqttSubscribe() {
    if (__client) {
        config.mqtt.topics.forEach((topic) =>
            __client.subscribe(topic, (err) => {
                if (err) console.error(`mqtt: subscribe to '${topic}', error:`, err);
                else console.log(`mqtt: subscribed to '${topic}'`);
            })
        );
    }
}

function mqttBegin(receiver) {
    const options = {
        clientId: config.mqtt.clientId,
    };
    if (config.mqtt.username && config.mqtt.password) {
        options.username = config.mqtt.username;
        options.password = config.mqtt.password;
    }

    __receiver = receiver;
    console.log(`mqtt: connecting to '${config.mqtt.broker}'`);
    __client = mqtt.connect(config.mqtt.broker, options);

    if (__client) {
        __client.on('connect', () => {
            console.log('mqtt: connected');
            mqttSubscribe();
        });
        __client.on('message', (topic, message) => {
            mqttReceive(topic, message);
        });
        __client.on('error', (err) => console.error('mqtt: error:', err));
        __client.on('offline', () => console.warn('mqtt: offline'));
        __client.on('reconnect', () => console.log('mqtt: reconnect'));
    }

    console.log(`mqtt: loaded using 'broker=${config.mqtt.broker}'`);
}

function mqttEnd() {
    if (__client) {
        __client.end();
        __client = null;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function collectorBegin() {
    archiverBegin();
    mqttBegin(archiverProcess);
    console.log(`started`);
}

function collectorEnd() {
    console.log(`stopping`);
    mqttEnd();
    archiverEnd();
    process.exit(0);
}

process.on('SIGINT', () => {
    collectorEnd();
});

collectorBegin();

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
