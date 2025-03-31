#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mqtt = require('mqtt');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const configPath = '/opt/weather/server/secrets.txt';

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
if (!fs.existsSync(config.storage.messages)) fs.mkdirSync(config.storage.messages, { recursive: true });
if (!fs.existsSync(config.storage.snapshots)) fs.mkdirSync(config.storage.snapshots, { recursive: true });
const configList = Object.entries(conf)
    .map(([k, v]) => k.toLowerCase() + '=' + v)
    .join(', ');
console.log(`Loaded 'config' using '${configPath}': ${configList}`);

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

function __messageStoragePath(dateString) {
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
        currentFilePath = __messageStoragePath(dateString);
        console.log(`collector: messages: writing to ${currentFilePath}`);
        writeStream = fs.createWriteStream(currentFilePath, { flags: 'a' });
    }
    return writeStream;
}

function compressPreviousDay(dateString) {
    const filePath = __messageStoragePath(dateString);
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

function __snapshotStoragePath(filename) {
    const match = filename.match(/snapshot_(\d{14})\.jpg/);
    if (match?.[1]) {
        const timestamp = match[1];
        const dirPath = path.join(config.storage.snapshots, timestamp.substring(0, 8));
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
        return path.join(dirPath, filename);
    }
    return undefined;
}

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
    const snapshotPath = __snapshotStoragePath(filename);
    if (snapshotPath) fs.writeFileSync(snapshotPath, __snapshotReceiveImagedata);
    __snapshotReceiveImagedata = null;
}

function storeSnapshot(type, message) {
    if (type == 'imagedata') return storeSnapshotImagedata(message);
    else if (type == 'metadata') return storeSnapshotMetadata(message);
}

function turnSnapshotIntoTimelapse(prefix) {
    return new Promise((resolve, reject) => {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        const timeBegin = Math.floor(Date.now() / 1000);
        console.log(`Starting timelapse processing for ${prefix} at ${new Date().toISOString()}`);

        const snapshotsSrc = path.join(config.storage.snapshots, prefix);
        const timelapseFile = path.join(config.storage.timelapse, `timelapse_${prefix}.mp4`);
        const snapshotsFile = path.join('/tmp', `filelist_${prefix}.txt`);
        if (!fs.existsSync(config.storage.timelapse)) fs.mkdirSync(config.storage.timelapse, { recursive: true });
        if (fs.existsSync(timelapseFile)) fs.unlinkSync(timelapseFile);

        const prepTimeBegin = Math.floor(Date.now() / 1000);
        // Get all snapshot files with the given prefix and sort them
        let files;
        try {
            files = fs
                .readdirSync(snapshotsSrc)
                .filter((file) => file.startsWith(`snapshot_${prefix}`))
                .sort()
                .map((file) => path.join(snapshotsSrc, file));
        } catch (error) {
            console.error(`Error reading snapshot directory: ${error.message}`);
            return reject(error);
        }
        if (files.length === 0) {
            console.warn(`No snapshots found for prefix ${prefix}`);
            return resolve({
                status: 'warning',
                message: `No snapshots found for prefix ${prefix}`,
            });
        }
        const fileListContent = files.map((file) => `file '${file}'`).join('\n');
        fs.writeFileSync(snapshotsFile, fileListContent);
        const snapshotsNumb = files.length;
        let snapshotsBytes = 0;
        files.forEach((file) => {
            snapshotsBytes += fs.statSync(file).size;
        });
        const snapshotsSize = formatSize(snapshotsBytes);
        const prepTimeEnd = Math.floor(Date.now() / 1000);
        const prepTimeOverall = prepTimeEnd - prepTimeBegin;
        console.log(`Generating from ${prefix} yielded ${snapshotsNumb} files with ${snapshotsSize} size`);
        console.log(`[preparation: ${prepTimeOverall} seconds]`);

        const encodeTimeBegin = Math.floor(Date.now() / 1000);

        const ffmpegFps = 5;
        const ffmpegPreset = 'slow';
        const ffmpegCrf = 31;
        const ffmpegOpt = '';
        const ffmpegCodec = `-c:v libx265 -crf ${ffmpegCrf}`;
        const ffmpegCmd = `ffmpeg -f concat -safe 0 -i ${snapshotsFile} ${ffmpegCodec} -preset ${ffmpegPreset} -r ${ffmpegFps} ${ffmpegOpt} ${timelapseFile}`;
        execAsync(ffmpegCmd)
            .then(() => {
                const encodeTimeEnd = Math.floor(Date.now() / 1000);
                const encodeTimeOverall = encodeTimeEnd - encodeTimeBegin;

                console.log(`[encoding: ${(snapshotsNumb / encodeTimeOverall).toFixed(2)} frames per second (real time)]`);

                const timeEnd = Math.floor(Date.now() / 1000);
                const timeOverall = timeEnd - timeBegin;
                console.log(`Completed processing at ${new Date().toISOString()}`);
                console.log(`[execution: ${timeOverall} seconds]`);

                const timelapseStats = fs.statSync(timelapseFile);
                const timelapseBytes = timelapseStats.size;
                const timelapseSize = formatSize(timelapseBytes);
                const compressionRatio = (snapshotsBytes / timelapseBytes).toFixed(2);
                console.log(`Processed ${snapshotsNumb} files with size ${snapshotsSize}`);
                console.log(`Generated '${timelapseFile}' with size ${timelapseSize}`);
                console.log(`Compression ratio: ${compressionRatio}:1`);

                if (fs.existsSync(snapshotsFile)) fs.unlinkSync(snapshotsFile);

                resolve({
                    status: 'success',
                    prefix,
                    snapshotsNumb,
                    snapshotsSize,
                    timelapseFile,
                    timelapseSize,
                    compressionRatio,
                    executionTime: timeOverall,
                });
            })
            .catch((error) => {
                console.error(`Error: ffmpeg encoding failed: ${error.message}`);
                if (fs.existsSync(snapshotsFile)) fs.unlinkSync(snapshotsFile);
                reject(error);
            });
    });
}

function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)}${units[unitIndex]}`;
}

let timelapseTimer = null;

function processSnapshotsIntoTimelapse() {
    const previousDate = new Date();
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDatePrefix = previousDate.toISOString().slice(0, 10).replace(/-/g, '');

    const timelapseFilePath = path.join(config.storage.timelapse, `timelapse_${previousDatePrefix}.mp4`);
    const snapshotDirPath = path.join(config.storage.snapshots, previousDatePrefix);

    if (fs.existsSync(snapshotDirPath) && !fs.existsSync(timelapseFilePath)) {
        console.log(`Timelapse check: Generating timelapse for previous day: ${previousDatePrefix}`);
        turnSnapshotIntoTimelapse(previousDatePrefix)
            .then((result) => {
                console.log(`Successfully generated timelapse for ${previousDatePrefix}`);
                console.log(result);
            })
            .catch((error) => {
                console.error(`Failed to generate timelapse for ${previousDatePrefix}: ${error.message}`);
            });
    } else {
        console.log(`Timelapse check: No new timelapse needed for ${previousDatePrefix}`);
    }
    maintainSnapshots();
}

function maintainSnapshots() {
    const { promisify } = require('util');
    const rimraf = promisify(require('rimraf'));

    console.log('Starting snapshot maintenance process...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 14);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10).replace(/-/g, '');

    console.log(`Maintenance cutoff date: ${cutoffDateStr} (will process directories older than this)`);

    let dateDirs;
    try {
        dateDirs = fs
            .readdirSync(config.storage.snapshots)
            .filter((item) => {
                return fs.statSync(path.join(config.storage.snapshots, item)).isDirectory() && /^\d{8}$/.test(item) && item < cutoffDateStr;
            })
            .sort();
    } catch (error) {
        console.error(`Error reading snapshot directories: ${error.message}`);
        return;
    }

    if (dateDirs.length === 0) {
        console.log('No snapshot directories older than 14 days found.');
        return;
    }

    console.log(`Found ${dateDirs.length} snapshot directories older than 14 days to process.`);

    const processPromises = dateDirs.map(async (dateDir) => {
        const timelapseFilePath = path.join(config.storage.timelapse, `timelapse_${dateDir}.mp4`);
        const snapshotDirPath = path.join(config.storage.snapshots, dateDir);
        if (!fs.existsSync(timelapseFilePath)) {
            console.log(`Maintenance: No timelapse found for ${dateDir}, generating...`);
            try {
                await turnSnapshotIntoTimelapse(dateDir);
                console.log(`Maintenance: Successfully generated timelapse for ${dateDir}`);
                await cleanupSnapshots(dateDir, snapshotDirPath);
            } catch (error) {
                console.error(`Maintenance: Failed to generate timelapse for ${dateDir}: ${error.message}`);
            }
        } else {
            await cleanupSnapshots(dateDir, snapshotDirPath);
        }
    });
    Promise.all(processPromises)
        .then(() => {
            console.log('Snapshot maintenance process completed.');
        })
        .catch((error) => {
            console.error(`Error during snapshot maintenance: ${error.message}`);
        });
}

async function cleanupSnapshots(dateDir, snapshotDirPath) {
    const { promisify } = require('util');
    const rimraf = promisify(require('rimraf'));
    if (fs.existsSync(snapshotDirPath)) {
        console.log(`Maintenance: Cleaning up snapshots for ${dateDir}`);
        try {
            const getDirectorySize = (dirPath) => {
                let totalSize = 0;
                for (const item of fs.readdirSync(dirPath)) {
                    const stats = fs.statSync(itemPath);
                    totalSize += stats.isDirectory() ? getDirectorySize(path.join(dirPath, item)) : stats.size;
                }
                return totalSize;
            };
            const sizeBefore = getDirectorySize(snapshotDirPath);
            const formattedSize = formatSize(sizeBefore);
            await rimraf(snapshotDirPath);
            console.log(`Maintenance: Successfully removed ${formattedSize} of snapshots for ${dateDir}`);
            return { dateDir, deleted: true, size: formattedSize };
        } catch (error) {
            console.error(`Maintenance: Error deleting snapshots for ${dateDir}: ${error.message}`);
            throw error;
        }
    } else {
        console.log(`Maintenance: No snapshots directory found for ${dateDir}`);
        return { dateDir, deleted: false };
    }
}

function msUntilNextTimelapseCheck() {
    const now = new Date();
    const target = new Date(now);
    target.setHours(6, 0, 0, 0);
    if (now >= target) target.setDate(target.getDate() + 1);
    return target - now;
}

function startTimelapse() {
    if (!config.storage.timelapse) config.storage.timelapse = path.join(config.storage.base || '/opt/storage', 'timelapse');
    if (!fs.existsSync(config.storage.timelapse)) fs.mkdirSync(config.storage.timelapse, { recursive: true });
    const timeToNextCheck = msUntilNextTimelapseCheck();
    console.log(`Timelapse service started. Next check in ${Math.floor(timeToNextCheck / 1000 / 60)} minutes`);
    timelapseTimer = setTimeout(() => {
        processSnapshotsIntoTimelapse();
        timelapseTimer = setInterval(processSnapshotsIntoTimelapse, 24 * 60 * 60 * 1000);
    }, timeToNextCheck);
}
function stopTimelapse() {
    if (timelapseTimer) {
        clearTimeout(timelapseTimer);
        clearInterval(timelapseTimer);
        timelapseTimer = null;
        console.log('Timelapse service stopped');
    }
}

function startSnapshot() {
    startTimelapse();
}
function stopSnapshot() {
    stopTimelapse();
}

console.log(`Loaded 'archiver/snapshots' using 'path=${config.storage.snapshots}, path=${config.storage.timelapse}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const archiverFunctions = {
    message: {
        start: startMessage,
        stop: stopMessage,
        process: (topic, message) => storeMessage(topic, message.toString()),
    },
    snapshot: {
        start: startSnapshot,
        stop: stopSnapshot,
        process: (topic, message) => storeSnapshot(topic.split('/')[1], message),
    },
};
const archiverConfig = {
    message: {
        enabled: true,
        topicPattern: (topic) => topic.startsWith('weather/') || topic.startsWith('sensors/'),
    },
    snapshot: {
        enabled: true,
        topicPattern: (topic) => topic.startsWith('snapshots/'),
    },
};

function archiverStart() {
    Object.entries(archiverConfig)
        .filter(([type, config]) => config.enabled && archiverFunctions[type]?.start)
        .forEach(([type]) => archiverFunctions[type].start());
}
function archiverStop() {
    Object.entries(archiverConfig)
        .reverse()
        .filter(([type, config]) => config.enabled && archiverFunctions[type]?.stop)
        .forEach(([type]) => archiverFunctions[type].stop());
}
function archiverProcess(topic, message) {
    Object.entries(archiverConfig)
        .filter(([type, config]) => config.enabled && archiverFunctions[type]?.process && config.topicPattern(topic))
        .forEach(([type]) => archiverFunctions[type].process(topic, message));
}

function store(topic, message) {
    try {
        archiverProcess(topic, message);
    } catch (error) {
        console.error(`collector: error processing message with 'topic=${topic}', error:`, error);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let client = null;

function startMQTT() {
    console.log(`collector: mqtt: connecting to broker at ${config.mqtt.broker}`);

    const options = {
        clientId: config.mqtt.clientId,
    };
    if (config.mqtt.username && config.mqtt.password) {
        options.username = config.mqtt.username;
        options.password = config.mqtt.password;
    }

    client = mqtt.connect(config.mqtt.broker, options);
    if (!client) return;

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

function stopMQTT() {
    if (!client) return;
    client.end();
    client = null;
}

console.log(`Loaded 'mqtt' using 'broker=${config.mqtt.broker}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function archiverBegin() {
    archiverStart();
    startMQTT();
    console.log(`collector: started`);
}

function archiverEnd() {
    console.log(`collector: stopping`);
    stopMQTT();
    archiverStop();
    process.exit(0);
}

process.on('SIGINT', () => {
    archiverEnd();
});

archiverBegin();
console.log(`press CTRL+C to exit`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
