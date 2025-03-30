#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mqtt = require('mqtt');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

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
    } catch (err) {
        console.warn(`Could not load '${configPath}', using defaults (which may not work correctly)`);
        return {};
    }
}

const configPath = '/opt/weather/secrets.txt';
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
    },
};

if (!fs.existsSync(config.storage.messages)) fs.mkdirSync(config.storage.messages, { recursive: true });
if (!fs.existsSync(config.storage.snapshots)) fs.mkdirSync(config.storage.snapshots, { recursive: true });

console.log(
    `Loaded 'config' using '${configPath}': ${Object.entries(conf)
        .map(([k, v]) => k.toLowerCase() + '=' + v)
        .join(', ')}`
);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function getTimestamp() {
    const now = new Date();
    return (
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0')
    );
}

function getDatestring() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const checkInterval = 60 * 1000;

let currentDate = '';
let currentFilePath = '';
let writeStream = null;

function getFilePath(dateString) {
    const dirPath = path.join(config.storage.messages, dateString.substring(0, 6));
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    return path.join(dirPath, `${dateString}.json`);
}

function setupWriteStream() {
    const dateString = getDatestring();
    if (dateString !== currentDate) {
        if (writeStream) {
            writeStream.end();
            writeStream = null;
        }
        const previousDate = currentDate;
        if (previousDate) {
            console.log(`collector: messages: date changed: ${previousDate} -> ${dateString}`);
            compressPreviousDay(previousDate);
        }
        currentDate = dateString;
        currentFilePath = getFilePath(dateString);
        console.log(`collector: messages: writing to ${currentFilePath}`);
        writeStream = fs.createWriteStream(currentFilePath, { flags: 'a' });
    }
    return writeStream;
}

function compressPreviousDay(dateString) {
    const filePath = getFilePath(dateString);
    const gzipPath = `${filePath}.gz`;
    if (fs.existsSync(filePath)) {
        console.log(`collector: messages: compress previous day's file: ${filePath}`);
        try {
            const originalSize = fs.statSync(filePath).size;
            const readableOriginalSize = formatFileSize(originalSize);
            const readStream = fs.createReadStream(filePath);
            const writeStream = fs.createWriteStream(gzipPath);
            const gzip = zlib.createGzip({ level: 9 }); // Maximum compression level
            readStream.pipe(gzip).pipe(writeStream);
            writeStream.on('finish', () => {
                const compressedSize = fs.statSync(gzipPath).size;
                const readableCompressedSize = formatFileSize(compressedSize);
                const compressionRatio = (originalSize / compressedSize).toFixed(2);
                console.log(`collector: messages: compression stats: ${readableOriginalSize} → ${readableCompressedSize} (${compressionRatio}:1 ratio)`);
                fs.unlink(filePath, (err) => {
                    if (err) console.error(`collector: messages: error removing original file: ${err}`);
                    else console.log(`collector: messages: compress complete, original file removed: ${filePath}`);
                });
            });
            writeStream.on('error', (err) => {
                console.error(`collector: messages: error compressing file: ${err}`);
            });
        } catch (err) {
            console.error(`collector: messages: error setting up compression: ${err}`);
        }
    }
}

function storeMessage(topic, payload) {
    const timestamp = getTimestamp();
    console.log(`collector: messages: [${timestamp}] received, topic='${topic}'`);
    const stream = setupWriteStream();
    let parsedPayload;
    let isJson = false;
    try {
        parsedPayload = JSON.parse(payload);
        isJson = true;
    } catch (e) {
        parsedPayload = payload;
    }
    const logEntry = {
        timestamp,
        topic,
        payload: parsedPayload,
        type: isJson ? 'json' : 'string',
    };
    stream.write(JSON.stringify(logEntry) + '\n');
}

function startMessage() {
    setupWriteStream();
    setInterval(() => {
        setupWriteStream();
    }, checkInterval);
}

function stopMessage() {
    if (writeStream) {
        writeStream.end();
        writeStream = null;
    }
}

console.log(`Loaded 'archiver/messages' using 'path=${config.storage.messages}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let __snapshotReceiveImagedata = null;

function storeSnapshotImagedata(message) {
    __snapshotReceiveImagedata = message;
}

function storeSnapshotMetadata(message) {
    if (!__snapshotReceiveImagedata) {
        console.error('collector: snapshots: error, received snapshot metadata but no image data is available');
        return;
    }
    const timestamp = getTimestamp();
    const metadata = JSON.parse(message.toString());
    const filename = metadata.filename;
    console.log(`collector: snapshots: [${timestamp}] received, filename='${filename}'`);
    const snapshotPath = path.join(config.storage.snapshots, filename);
    // fs.writeFileSync(snapshotPath, __snapshotReceiveImagedata);
    __snapshotReceiveImagedata = null;
}

function storeSnapshot(type, message) {
    if (type == 'imagedata') return storeSnapshotImagedata(message);
    else if (type == 'metadata') return storeSnapshotMetadata(message);
}

function startSnapshot() {}

function stopSnapshot() {}

console.log(`Loaded 'archiver/snapshots' using 'path=${config.storage.snapshots}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function store(topic, message) {
    try {
        if (topic.startsWith('snapshots/')) storeSnapshot(topic.split('/')[1], message);
        else storeMessage(topic, message.toString());
    } catch (error) {
        console.error(`collector: error processing message with 'topic=${topic}', error:`, error);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let client = null;

function startMQTT() {
    console.log(`collector: mqtt: connecting to broker at ${config.mqtt.broker}`);

    const mqttOptions = {
        clientId: config.mqtt.clientId,
    };
    if (config.mqtt.username && config.mqtt.password) {
        mqttOptions.username = config.mqtt.username;
        mqttOptions.password = config.mqtt.password;
    }

    client = mqtt.connect(config.mqtt.broker, mqttOptions);

    if (client) {
        client.on('connect', () => {
            console.log('collector: mqtt: connected');
            config.mqtt.topics.forEach((topic) => {
                client.subscribe(topic, (err) => {
                    if (err) console.error(`collector: mqtt: error subscribing to ${topic}:`, err);
                    else console.log(`collector: mqtt: subscribed to ${topic}`);
                });
            });
        });
        client.on('message', (topic, message) => {
            store(topic, message);
        });
        client.on('error', (err) => {
            console.error('collector: mqtt: client error:', err);
        });
        client.on('offline', () => {
            console.warn('collector: mqtt: client offline');
        });
        client.on('reconnect', () => {
            console.log('collector: mqtt: client reconnecting');
        });
    }
}

function stopMQTT() {
    if (client) {
        client.end();
        client = null;
    }
}

console.log(`Loaded 'mqtt' using 'broker=${config.mqtt.broker}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function archiverStart() {
    startMessage();
    startSnapshot();
    startMQTT();
    console.log(`collector: started`);
}

function archiverStop() {
    console.log(`collector: stopping`);
    stopMQTT();
    stopMessage();
    stopSnapshot();
    process.exit(0);
}

process.on('SIGINT', () => {
    archiverStop();
});

archiverStart();
console.log(`press CTRL+C to exit`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
