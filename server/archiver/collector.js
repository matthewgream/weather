#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const REPORT_PERIOD_DEFAULT = 30; // report output every this many minutes
const MONTHLY_CHECK_HOUR = 4; // Run monthly tasks after 4:00 AM on the first day of each month
const DAILY_CHECK_HOUR = 2; // Run monthly tasks after 2:00 AM on the first day of each month
const SCHEDULER_CHECK_INTERVAL = 60 * 60 * 1000; // Check every 60 minutes if tasks should run

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

const archiverConf = {
    messages: {
        enabled: true,
        functions: require('./collector-messages.js'),
        topicPattern: (topic) => topic.startsWith('weather/') || topic.startsWith('sensors/'),
    },
    snapshots: {
        enabled: true,
        functions: require('./collector-snapshots.js'),
        topicPattern: (topic) => topic.startsWith('snapshots/'),
    },
};

const archiverExec = {};

function __archiverExecute(name, func) {
    Object.entries(archiverConf)
        .filter(([type, conf]) => conf.enabled && conf.functions?.[name])
        .forEach(([type, conf]) => {
            try {
                if (!func || func(type, conf)) conf.functions[name]();
            } catch (error) {
                console.error(`archiver: ${name}: error executing for ${type}:`, error);
            }
        });
}

const archiverTasks = {
    daily: {
        lastRun: '',
        getTimestamp: (now) => now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0'),
        shouldRun: (now, timestamp, lastRun) => timestamp !== lastRun && now.getHours() >= DAILY_CHECK_HOUR,
    },
    monthly: {
        lastRun: '',
        getTimestamp: (now) => now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0'),
        shouldRun: (now, timestamp, lastRun) => timestamp !== lastRun && now.getDate() === 1 && now.getHours() >= MONTHLY_CHECK_HOUR,
    },
};

function __archiverPeriodic() {
    const now = new Date();
    Object.entries(archiverTasks).forEach(([name, task]) => {
        const timestamp = task.getTimestamp(now);
        const prefix = `archiver: ${name}: ${timestamp} `;
        if (task.shouldRun(now, timestamp, task.lastRun)) {
            console.log(prefix + `running`);
            __archiverExecute(name, (type, conf) => {
                console.log(prefix + `running for ${type}`);
                return true;
            });
            task.lastRun = timestamp;
        }
    });
}

let __archiverPeriodicInterval = null;
function __archiverPeriodicBegin() {
    __archiverPeriodic();
    __archiverPeriodicInterval = setInterval(__archiverPeriodic, SCHEDULER_CHECK_INTERVAL);
}
function __archiverPeriodicEnd() {
    if (__archiverPeriodicInterval) {
        clearInterval(__archiverPeriodicInterval);
        __archiverPeriodicInterval = null;
    }
}

function archiverBegin() {
    if (!archiverLoaded) {
        __archiverExecute('begin', (type, conf) => {
            conf.functions.begin(config);
            archiverExec[type] = { report: new ReportCounter({ label: type, period: REPORT_PERIOD_DEFAULT }) };
            return false; // skip inbuilt call
        });
        __archiverPeriodicBegin();
        archiverLoaded = true;
    }
}

function archiverEnd() {
    if (archiverLoaded) {
        __archiverPeriodicEnd();
        __archiverExecute('end', (type, conf) => {
            archiverExec[type].report.end();
            delete archiverExec[type].report;
            return true;
        });
        archiverLoaded = false;
    }
}

function archiverProcess(topic, message) {
    if (archiverLoaded) {
        __archiverExecute('process', (type, conf) => {
            if (conf.topicPattern(topic)) {
                conf.functions.process(topic, message);
                archiverExec[type].report.update(topic);
            }
            return false; // skip inbuilt call
        });
    }
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
                else console.log(`mqtt: subscribe to '${topic}', succeeded`);
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
    console.log(`started (reporting-period=${REPORT_PERIOD_DEFAULT} mins)`);
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
