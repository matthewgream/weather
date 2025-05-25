#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const REPORT_PERIOD_DEFAULT = 30; // report output every this many minutes
const MONTHLY_CHECK_HOUR = 4; // Run monthly tasks after 4:00 AM on the first day of each month
const DAILY_CHECK_HOUR = 2; // Run monthly tasks after 2:00 AM on the first day of each month
const SCHEDULER_CHECK_INTERVAL = 60 * 60 * 1000; // Check every 60 minutes if tasks should run

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const config = require('./collector-config.js')({ file: process.argv[2] || 'secrets.txt' });

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let archiverLoaded = false;

const { ReportCounter } = require('./collector-functions.js');

const archiverConf = {
    messages: {
        enabled: true,
        functions: require('./collector-messages.js'),
        matches: (topic) => config.topics.messages.some((t) => topic.startsWith(t)),
    },
    snapshots: {
        enabled: true,
        functions: require('./collector-snapshots.js'),
        matches: (topic) => config.topics.snapshots.some((t) => topic.startsWith(t)),
    },
};

const archiverExec = {};

function __archiverExecute(name, func) {
    Object.entries(archiverConf)
        .filter(([_, conf]) => conf.enabled && conf.functions?.[name])
        .forEach(([type, conf]) => {
            try {
                if (!func || func(type, conf)) conf.functions[name]();
            } catch (e) {
                console.error(`archiver: ${name}: error executing for ${type}:`, e);
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
            __archiverExecute(name, (type, _) => {
                console.log(prefix + `running for ${type}`);
                return true;
            });
            task.lastRun = timestamp;
        }
    });
}

let __archiverPeriodicInterval;
function __archiverPeriodicBegin() {
    __archiverPeriodic();
    __archiverPeriodicInterval = setInterval(__archiverPeriodic, SCHEDULER_CHECK_INTERVAL);
}
function __archiverPeriodicEnd() {
    if (__archiverPeriodicInterval) {
        clearInterval(__archiverPeriodicInterval);
        __archiverPeriodicInterval = undefined;
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
        __archiverExecute('end', (type, _) => {
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
            if (conf.matches(topic)) {
                conf.functions.process(topic, message);
                archiverExec[type].report.update(topic);
            }
            return false; // skip inbuilt call
        });
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt = require('./collector-mqtt.js')(config.mqtt);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function collectorBegin() {
    archiverBegin();
    mqtt.begin(archiverProcess);
    console.log(`started (reporting-period=${REPORT_PERIOD_DEFAULT} mins)`);
}

function collectorEnd() {
    console.log(`stopping`);
    mqtt.end();
    archiverEnd();
    process.exit(0);
}

process.on('SIGINT', () => {
    collectorEnd();
});

collectorBegin();

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
