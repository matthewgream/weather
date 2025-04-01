#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mqtt = require('mqtt');

const REPORT_PERIOD_DEFAULT = 15;

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
    } catch {
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

class ReportCounter {
    constructor(name, intervalMinutes = REPORT_PERIOD_DEFAULT) {
        this.name = name;
        this.intervalMs = intervalMinutes * 60 * 1000;
        this.counts = {};
        this.lastUpdateTimes = {};
        this.lastReportTime = Date.now();
        this.intervalId = setInterval(() => this.reportSummary(), this.intervalMs);
    }
    update(key = '') {
        const timestamp = getTimestamp();
        const now = Date.now();
        let first = false;
        if (this.counts[key] === undefined) {
            first = true;
            this.counts[key] = 0;
            this.lastUpdateTimes[key] = { times: [], lastTime: now };
        }
        this.counts[key]++;
        const lastTime = this.lastUpdateTimes[key].lastTime;
        if (lastTime !== now) {
            this.lastUpdateTimes[key].times.push(now - lastTime);
            if (this.lastUpdateTimes[key].times.length > 10) this.lastUpdateTimes[key].times.shift();
        }
        this.lastUpdateTimes[key].lastTime = now;
        if (first) {
            if (key) console.log(`collector: ${this.name}: [${timestamp}] received '${key}'`);
            else console.log(`collector: ${this.name}: [${timestamp}] received`);
        }
    }
    reportSummary() {
        const timestamp = getTimestamp();
        const now = Date.now();
        const elapsed = ((now - this.lastReportTime) / 60000).toFixed(0);
        if (Object.keys(this.counts).length > 0) {
            const countStr = Object.entries(this.counts)
                .map(([key, count]) => {
                    let str = `${count}`;
                    const times = this.lastUpdateTimes[key].times;
                    if (times.length > 1) str += ` (avg ${(times.reduce((sum, time) => sum + time, 0) / times.length / 1000).toFixed(2)}s)`;
                    this.counts[key] = 0;
                    if (key) return `'${key}': ${str}`;
                    else return str;
                })
                .join(', ');
            console.log(`collector: ${this.name}: [${timestamp}] received (${elapsed} mins) ${countStr}`);
        }
        this.lastReportTime = now;
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
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

function messageWriteStreamSetup() {
    const dateString = getDatestring();
    if (dateString !== currentDate) {
        if (writeStream) {
            writeStream.end();
            writeStream = null;
        }
        const previousDate = currentDate;
        if (previousDate) {
            console.log(`collector: messages: date changed: ${previousDate} -> ${dateString}`);
            messageCompressPreviousDay(previousDate);
        }
        currentDate = dateString;
        currentFilePath = __messageStoragePath(dateString);
        console.log(`collector: messages: writing to ${currentFilePath}`);
        writeStream = fs.createWriteStream(currentFilePath, { flags: 'a' });
    }
    return writeStream;
}

function messageCompressPreviousDay(dateString) {
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

const messageReport = new ReportCounter('messages');
function messageStore(topic, payload) {
    messageReport.update(topic);
    const stream = messageWriteStreamSetup();
    let parsedPayload;
    let isJson = false;
    try {
        parsedPayload = JSON.parse(payload);
        isJson = true;
    } catch {
        parsedPayload = payload;
    }
    const logEntry = {
        timestamp: getTimestamp(),
        topic,
        payload: parsedPayload,
        type: isJson ? 'json' : 'string',
    };
    stream.write(JSON.stringify(logEntry) + '\n');
}

function messageBegin() {
    messageWriteStreamSetup();
    setInterval(() => {
        messageWriteStreamSetup();
    }, checkInterval);
}

function messageEnd() {
    if (writeStream) {
        writeStream.end();
        writeStream = null;
    }
    messageReport.stop();
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

function snapshotStoreImagedata(message) {
    __snapshotReceiveImagedata = message;
}

const snapshotReport = new ReportCounter('snapshots');
function snapshotStoreMetadata(message) {
    if (!__snapshotReceiveImagedata) {
        console.error('collector: snapshots: error, received snapshot metadata but no image data is available');
        return;
    }
    const metadata = JSON.parse(message.toString());
    const filename = metadata.filename;
    snapshotReport.update();
    const snapshotPath = __snapshotStoragePath(filename);
    if (snapshotPath) fs.writeFileSync(snapshotPath, __snapshotReceiveImagedata);
    __snapshotReceiveImagedata = null;
}

function snapshotStore(type, message) {
    if (type == 'imagedata') return snapshotStoreImagedata(message);
    else if (type == 'metadata') return snapshotStoreMetadata(message);
}

async function snapshotCleanup(dateDir, snapshotDirPath) {
    const rimraf = require('rimraf');

    if (fs.existsSync(snapshotDirPath)) {
        console.log(`Maintenance: Cleaning up snapshots for ${dateDir}`);
        try {
            const getDirectorySize = (dirPath) => {
                let totalSize = 0;
                for (const item of fs.readdirSync(dirPath)) {
                    const itemPath = path.join(dirPath, item);
                    const stats = fs.statSync(itemPath);
                    totalSize += stats.isDirectory() ? getDirectorySize(itemPath) : stats.size;
                }
                return totalSize;
            };
            const sizeBefore = getDirectorySize(snapshotDirPath);
            const formattedSize = formatSize(sizeBefore);
            await new Promise((resolve, reject) => {
                rimraf(snapshotDirPath, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
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

const NUMBER_OF_DAYS_BACKWARDS_SNAPSHOTS = 28;

function snapshotMaintain() {
    console.log('Starting snapshot maintenance process...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - NUMBER_OF_DAYS_BACKWARDS_SNAPSHOTS);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10).replace(/-/g, '');

    console.log(`Maintenance cutoff date: ${cutoffDateStr} (will prune directories older than this)`);

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
                await snapshotToTimelapse(dateDir);
                console.log(`Maintenance: Successfully generated timelapse for ${dateDir}`);
                await snapshotCleanup(dateDir, snapshotDirPath);
            } catch (error) {
                console.error(`Maintenance: Failed to generate timelapse for ${dateDir}: ${error.message}`);
            }
        } else {
            await snapshotCleanup(dateDir, snapshotDirPath);
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

function snapshotToTimelapse(prefix) {
    return new Promise((resolve, reject) => {
        const timeBegin = Math.floor(Date.now() / 1000);
        console.log(`Starting timelapse processing for ${prefix} at ${new Date().toISOString()}`);

        const snapshotsSrc = path.join(config.storage.snapshots, prefix);
        const timelapseFile = path.join(config.storage.timelapse, `timelapse_${prefix}.mp4`);
        const snapshotsFile = path.join('/tmp', `filelist_${prefix}.txt`);
        if (!fs.existsSync(config.storage.timelapse)) fs.mkdirSync(config.storage.timelapse, { recursive: true });
        if (fs.existsSync(timelapseFile)) fs.unlinkSync(timelapseFile);

        const prepTimeBegin = Math.floor(Date.now() / 1000);
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

        const { exec } = require('childProcess');
        console.log(`Executing command: ${ffmpegCmd}`);

        const ffmpegProcess = exec(ffmpegCmd, (error) => {
            if (error) {
                console.error(`ffmpeg error: ${error.message}`);
                if (fs.existsSync(snapshotsFile)) fs.unlinkSync(snapshotsFile);
                return reject(error);
            }

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
        });

        if (ffmpegProcess && ffmpegProcess.stderr)
            ffmpegProcess.stderr.on('data', (data) => {
                console.log(`ffmpeg: ${data.toString().trim()}`);
            });
    });
}

function msUntilNextTimelapseCheck() {
    const now = new Date();
    const target = new Date(now);
    target.setHours(6, 0, 0, 0);
    if (now >= target) target.setDate(target.getDate() + 1);
    return target - now;
}

let timelapseTimer = null;

const NUMBER_OF_DAYS_BACKWARDS_TIMELAPSE = 1;

function timelapseFromSnapshot() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - NUMBER_OF_DAYS_BACKWARDS_TIMELAPSE);
    const cutoffDateString = cutoffDate.toISOString().slice(0, 10).replace(/-/g, '');
    const snapshotBasePath = config.storage.snapshots;
    const snapshotDirs = fs
        .readdirSync(snapshotBasePath)
        .filter((dir) => fs.statSync(path.join(snapshotBasePath, dir)).isDirectory() && dir <= cutoffDateString);
    console.log(`Timelapse check: Found ${snapshotDirs.length} snapshot directories older than ${NUMBER_OF_DAYS_BACKWARDS_TIMELAPSE} days`);
    for (const dirPrefix of snapshotDirs) {
        const timelapseFilePath = path.join(config.storage.timelapse, `timelapse_${dirPrefix}.mp4`);
        if (!fs.existsSync(timelapseFilePath)) {
            console.log(`Timelapse check: Generating timelapse for directory: ${dirPrefix}`);
            snapshotToTimelapse(dirPrefix)
                .then((result) => {
                    console.log(`Successfully generated timelapse for ${dirPrefix}`);
                    console.log(result);
                })
                .catch((error) => {
                    console.error(`Failed to generate timelapse for ${dirPrefix}: ${error.message}`);
                });
        } else {
            console.log(`Timelapse check: Timelapse already exists for ${dirPrefix}`);
        }
    }
    snapshotMaintain();
}
function timelapseBegin() {
    if (!config.storage.timelapse) config.storage.timelapse = path.join(config.storage.base || '/opt/storage', 'timelapse');
    if (!fs.existsSync(config.storage.timelapse)) fs.mkdirSync(config.storage.timelapse, { recursive: true });
    const timeToNextCheck = msUntilNextTimelapseCheck();
    console.log(`Timelapse service started. Next check in ${Math.floor(timeToNextCheck / 1000 / 60)} minutes`);
    timelapseTimer = setTimeout(() => {
        timelapseFromSnapshot();
        timelapseTimer = setInterval(timelapseFromSnapshot, 24 * 60 * 60 * 1000);
    }, timeToNextCheck);
}
function timelapseEnd() {
    if (timelapseTimer) {
        clearTimeout(timelapseTimer);
        clearInterval(timelapseTimer);
        timelapseTimer = null;
        console.log('Timelapse service stopped');
    }
}

function snapshotBegin() {
    timelapseBegin();
}
function snapshotEnd() {
    timelapseEnd();
    snapshotReport.stop();
}

console.log(`Loaded 'archiver/snapshots' using 'path=${config.storage.snapshots}, path=${config.storage.timelapse}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const archiverFunctions = {
    message: {
        start: messageBegin,
        stop: messageEnd,
        process: (topic, message) => messageStore(topic, message.toString()),
    },
    snapshot: {
        start: snapshotBegin,
        stop: snapshotEnd,
        process: (topic, message) => snapshotStore(topic.split('/')[1], message),
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

function archiverBegin() {
    Object.entries(archiverConfig)
        .filter(([type, config]) => config.enabled && archiverFunctions[type]?.start)
        .forEach(([type]) => archiverFunctions[type].start());
}
function archiverEnd() {
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

function mqttBegin() {
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

function mqttEnd() {
    if (!client) return;
    client.end();
    client = null;
}

console.log(`Loaded 'mqtt' using 'broker=${config.mqtt.broker}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function collectorBegin() {
    archiverBegin();
    mqttBegin();
    console.log(`collector: started`);
}

function collectorEnd() {
    console.log(`collector: stopping`);
    mqttEnd();
    archiverEnd();
    process.exit(0);
}

process.on('SIGINT', () => {
    collectorEnd();
});

collectorBegin();
console.log(`press CTRL+C to exit`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
