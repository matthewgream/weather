#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');
const rimraf = require('rimraf');

const REPORT_PERIOD_DEFAULT = 15; // report output every this many minutes

const NUMBER_OF_DAYS_BACKWARDS_TIMELAPSE = 1; // make timelapse after this many days
const NUMBER_OF_DAYS_BACKWARDS_SNAPSHOTS = 28; // delete after this many days

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

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
    return now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
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
            if (key) console.log(`${this.name}: [${timestamp}] received '${key}'`);
            else console.log(`${this.name}: [${timestamp}] received`);
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
            console.log(`${this.name}: [${timestamp}] received (${elapsed} mins) ${countStr}`);
        }
        this.lastReportTime = now;
    }
    end() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const lzma = require('lzma-native');

const __messageCheckInterval = 60 * 1000;
let __messageInterval = null;
let __messageCurrentDate = '';
let __messageCurrentPath = '';
let __messageCurrentStream = null;
function __messageFilePath(dateString) {
    const dirPath = path.join(config.storage.messages, dateString.substring(0, 6));
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    return path.join(dirPath, `${dateString}.json`);
}
function __messageCompressedName(filePath) {
    return `${filePath}.xz`;
}
function __messageCompressStream() {
    return lzma.createCompressor({ preset: 9 });
}
function __messageCompressFile(dateString) {
    const filePath = __messageFilePath(dateString);
    if (!fs.existsSync(filePath)) return;
    console.log(`messages: ${dateString}: compress begin [${filePath}]`);
    try {
        const compressedPath = __messageCompressedName(filePath);
        const originalSize = fs.statSync(filePath).size;
        const readStream = fs.createReadStream(filePath);
        const writeStream = fs.createWriteStream(compressedPath);
        readStream.pipe(__messageCompressStream()).pipe(writeStream); // Maximum compression level
        writeStream.on('finish', () => {
            const compressedSize = fs.statSync(compressedPath).size;
            console.log(
                `messages: ${dateString}: compress complete (${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}, ${(originalSize / compressedSize).toFixed(2)}:1)`
            );
            fs.unlinkSync(filePath);
        });
        writeStream.on('error', (err) => console.error(`messages: ${dateString}: compress error (stream): ${err}`));
    } catch (err) {
        console.error(`messages: ${dateString}: compress error (process): ${err}`);
    }
}
function __messageWriteStream() {
    const dateString = getDatestring();
    if (dateString !== __messageCurrentDate) {
        if (__messageCurrentStream) {
            __messageCurrentStream.end();
            __messageCurrentStream = null;
        }
        const previousDate = __messageCurrentDate;
        if (previousDate) {
            console.log(`messages: rollover: ${previousDate} -> ${dateString}`);
            __messageCompressFile(previousDate);
        }
        __messageCurrentDate = dateString;
        __messageCurrentPath = __messageFilePath(dateString);
        console.log(`messages: writing to ${__messageCurrentPath}`);
        __messageCurrentStream = fs.createWriteStream(__messageCurrentPath, { flags: 'a' });
    }
    return __messageCurrentStream;
}

const __messageReport = new ReportCounter('messages');

function messageStore(topic, payload) {
    __messageReport.update(topic);
    const stream = __messageWriteStream();
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
    if (!fs.existsSync(config.storage.messages)) fs.mkdirSync(config.storage.messages, { recursive: true });
    __messageWriteStream();
    __messageInterval = setInterval(() => {
        __messageWriteStream();
    }, __messageCheckInterval);
}

function messageEnd() {
    if (__messageCurrentStream) {
        __messageCurrentStream.end();
        __messageCurrentStream = null;
    }
    if (__messageInterval) clearInterval(__messageInterval);
    __messageReport.end();
}

console.log(`Loaded 'archiver/messages' using 'path=${config.storage.messages}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let __snapshotReceiveImagedata = null;
let timelapseTimer = null;
function __snapshotStoragePath(filename) {
    const match = filename.match(/snapshot_(\d{14})\.jpg/);
    if (match?.[1]) {
        const dirPath = path.join(config.storage.snapshots, match[1].substring(0, 8));
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
        return path.join(dirPath, filename);
    }
    return undefined;
}
function __snapshotStoreImagedata(message) {
    __snapshotReceiveImagedata = message;
}
function __snapshotStoreMetadata(message) {
    if (!__snapshotReceiveImagedata) {
        console.error('snapshots: error, received snapshot metadata but no image data is available');
        return;
    }
    const metadata = JSON.parse(message.toString());
    const filename = metadata.filename;
    const snapshotPath = __snapshotStoragePath(filename);
    if (snapshotPath) fs.writeFileSync(snapshotPath, __snapshotReceiveImagedata);
    __snapshotReceiveImagedata = null;
}
function getCutoffDate(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return cutoffDate.toISOString().slice(0, 10).replace(/-/g, '');
}
function getTimelapseFilename(prefix) {
    return path.join(config.storage.timelapse, `timelapse_${prefix}.mp4`);
}
function getSnapshotDirectory(prefix) {
    return path.join(config.storage.snapshots, prefix);
}
function getCutoffDirectories(cutoffDateStr) {
    try {
        return fs
            .readdirSync(config.storage.snapshots)
            .filter((item) => fs.statSync(path.join(config.storage.snapshots, item)).isDirectory() && /^\d{8}$/.test(item) && item < cutoffDateStr)
            .sort();
    } catch (error) {
        console.error(`snapshots: error reading directories: ${error.message}`);
        return [];
    }
}
function msUntilNextTimelapseCheck() {
    const now = new Date();
    const target = new Date(now);
    target.setHours(6, 0, 0, 0);
    if (now >= target) target.setDate(target.getDate() + 1);
    return target - now;
}
function __snapshotToTimelapse(prefix) {
    return new Promise((resolve, reject) => {
        const timeBegin = Math.floor(Date.now() / 1000);
        console.log(`snapshots: timelapse: ${prefix} begin at ${new Date().toISOString()}`);

        const snapshotsSrc = getSnapshotDirectory(prefix);
        const timelapseFile = getTimelapseFilename(prefix);
        const snapshotsFile = path.join('/tmp', `filelist_${prefix}.txt`);
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
            console.error(`snapshots: timelapse: error reading directories: ${error.message}`);
            return reject(error);
        }

        if (files.length === 0) {
            console.warn(`snapshots: timelapse: ${prefix} no files found`);
            return resolve({
                status: 'warning',
                message: `No snapshots found for prefix ${prefix}`,
            });
        }

        fs.writeFileSync(snapshotsFile, files.map((file) => `file '${file}'`).join('\n'));
        const snapshotsNumb = files.length;
        let snapshotsBytes = 0;
        files.forEach((file) => (snapshotsBytes += fs.statSync(file).size));
        const snapshotsSize = formatFileSize(snapshotsBytes);

        const preparationTime = Math.floor(Date.now() / 1000) - prepTimeBegin;
        console.log(`snapshots: timelapse: ${prefix}: generation yielded ${snapshotsNumb} files with ${snapshotsSize} size`);
        console.log(`snapshots: timelapse: ${prefix}: [preparation: ${preparationTime} seconds]`);

        const encodeTimeBegin = Math.floor(Date.now() / 1000);

        const ffmpegFps = 5;
        const ffmpegPreset = 'slow';
        const ffmpegCrf = 31;
        const ffmpegOpt = '';
        const ffmpegCodec = `-c:v libx265 -x265-params log-level=1 -crf ${ffmpegCrf}`;
        const ffmpegCmd = `ffmpeg -hide_banner -loglevel warning -f concat -safe 0 -i ${snapshotsFile} ${ffmpegCodec} -preset ${ffmpegPreset} -r ${ffmpegFps} ${ffmpegOpt} ${timelapseFile}`;

        const { exec } = require('child_process');
        console.log(`snapshots: timelapse: ${prefix}: Executing command: ${ffmpegCmd}`);

        const ffmpegProcess = exec(ffmpegCmd, (error) => {
            if (error) {
                console.error(`snapshots: timelapse: ${prefix}: ffmpeg error: ${error.message}`);
                if (fs.existsSync(snapshotsFile)) fs.unlinkSync(snapshotsFile);
                return reject(error);
            }

            const encodingTime = Math.floor(Date.now() / 1000) - encodeTimeBegin;
            console.log(`snapshots: timelapse: ${prefix}: [encoding: ${encodingTime} seconds, ${(snapshotsNumb / encodingTime).toFixed(2)} FPS]`);

            const executionTime = Math.floor(Date.now() / 1000) - timeBegin;
            console.log(`snapshots: timelapse: ${prefix}: Completed processing at ${new Date().toISOString()}`);
            console.log(`snapshots: timelapse: ${prefix}: [execution: ${executionTime} seconds]`);

            const timelapseStats = fs.statSync(timelapseFile);
            const timelapseBytes = timelapseStats.size;
            const timelapseSize = formatFileSize(timelapseBytes);
            const compressionRatio = (snapshotsBytes / timelapseBytes).toFixed(2);

            console.log(`snapshots: timelapse: ${prefix}: Processed ${snapshotsNumb} files with size ${snapshotsSize}`);
            console.log(`snapshots: timelapse: ${prefix}: Generated '${timelapseFile}' with size ${timelapseSize}`);
            console.log(`snapshots: timelapse: ${prefix}: Compression ratio: ${compressionRatio}:1`);

            if (fs.existsSync(snapshotsFile)) fs.unlinkSync(snapshotsFile);

            resolve({
                status: 'success',
                prefix,
                snapshotsNumb,
                snapshotsSize,
                timelapseFile,
                timelapseSize,
                compressionRatio,
                executionTime,
            });
        });

        if (ffmpegProcess && ffmpegProcess.stderr)
            ffmpegProcess.stderr.on('data', (data) => {
                console.log(`snapshots: timelapse: ${prefix}: ffmpeg: ${data.toString().trim()}`);
            });
    });
}

const __snapshotReport = new ReportCounter('snapshots');

function snapshotStore(type, message) {
    if (type == 'imagedata') return __snapshotStoreImagedata(message);
    else if (type == 'metadata') {
        __snapshotReport.update();
        return __snapshotStoreMetadata(message);
    }
}

async function snapshotCleanup(dateDir, snapshotDirPath) {
    if (!fs.existsSync(snapshotDirPath)) return { dateDir, deleted: false };
    try {
        const getDirectorySize = (dirPath) => {
            let totalSize = 0;
            fs.readdirSync(dirPath).forEach((item) => {
                const itemPath = path.join(dirPath, item);
                const stats = fs.statSync(itemPath);
                totalSize += stats.isDirectory() ? getDirectorySize(itemPath) : stats.size;
            });
            return totalSize;
        };
        const sizeBefore = getDirectorySize(snapshotDirPath);
        const formattedSize = formatFileSize(sizeBefore);
        await new Promise((resolve, reject) => {
            rimraf(snapshotDirPath, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log(`snapshots: cleanup: ${dateDir}, removed ${formattedSize} snapshots`);
        return { dateDir, deleted: true, size: formattedSize };
    } catch (error) {
        console.error(`snapshots: cleanup: ${dateDir}, error processing: ${error.message}`);
        throw error;
    }
}

async function snapshotMaintain() {
    const cutoffDays = NUMBER_OF_DAYS_BACKWARDS_SNAPSHOTS;
    const cutoffDateStr = getCutoffDate(cutoffDays);
    const dateDirs = getCutoffDirectories(cutoffDateStr);

    console.log(`snapshots: maintenance: ${dateDirs.length} directories older than ${cutoffDateStr} (${cutoffDays} days) to cleanup`);
    for (const dateDir of dateDirs) {
        try {
            if (fs.existsSync(getTimelapseFilename(dateDir))) await snapshotCleanup(dateDir, getSnapshotDirectory(dateDir));
            else console.warning(`snapshots: maintenance: cannot discard ${dateDir} due to lack of timelapse`);
        } catch (dirError) {
            console.error(`snapshots: maintenance: error on maintenance for ${dateDir}: ${dirError.message}`);
        }
    }
    if (dateDirs.length > 0) console.log('snapshots: maintenance: complete');
}

async function snapshotToTimelapse() {
    const cutoffDays = NUMBER_OF_DAYS_BACKWARDS_TIMELAPSE;
    const cutoffDateStr = getCutoffDate(cutoffDays);
    const dateDirs = getCutoffDirectories(cutoffDateStr).filter((dir) => !fs.existsSync(getTimelapseFilename(dir)));

    console.log(`snapshots: timelapse: ${dateDirs.length} directories older than ${cutoffDateStr} (${cutoffDays} days) to process`);
    for (const dateDir of dateDirs) {
        try {
            console.log(`snapshots: timelapse: generating timelapse for: ${dateDir}`);
            const result = await __snapshotToTimelapse(dateDir);
            console.log(`snapshots: timelapse: generated timelapse for ${dateDir}: ${result}`);
        } catch (error) {
            console.error(`snapshots: timelapse: error generating timelapse for ${dateDir}: ${error.message}`);
        }
    }
    if (dateDirs.length > 0) console.log('snapshots: timelapse: complete');

    snapshotMaintain();
}

function snapshotBegin() {
    if (!fs.existsSync(config.storage.snapshots)) fs.mkdirSync(config.storage.snapshots, { recursive: true });
    if (!fs.existsSync(config.storage.timelapse)) fs.mkdirSync(config.storage.timelapse, { recursive: true });
    const timeToNextCheck = msUntilNextTimelapseCheck();
    timelapseTimer = setTimeout(() => {
        snapshotToTimelapse();
        timelapseTimer = setInterval(snapshotToTimelapse, 24 * 60 * 60 * 1000);
    }, timeToNextCheck);
    console.log(`snapshots: timelapse: next check in ${Math.floor(timeToNextCheck / 1000 / 60)} minutes`);
}
function snapshotEnd() {
    if (timelapseTimer) {
        clearTimeout(timelapseTimer);
        clearInterval(timelapseTimer);
        timelapseTimer = null;
    }
    __snapshotReport.end();
}

console.log(`Loaded 'archiver/snapshots' using 'path=${config.storage.snapshots}, path=${config.storage.timelapse}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const archiverFunctions = {
    message: {
        begin: messageBegin,
        end: messageEnd,
        process: (topic, message) => messageStore(topic, message.toString()),
    },
    snapshot: {
        begin: snapshotBegin,
        end: snapshotEnd,
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
        .filter(([type, config]) => config.enabled && archiverFunctions[type]?.begin)
        .forEach(([type]) => archiverFunctions[type].begin());
}
function archiverEnd() {
    Object.entries(archiverConfig)
        .reverse()
        .filter(([type, config]) => config.enabled && archiverFunctions[type]?.end)
        .forEach(([type]) => archiverFunctions[type].end());
}
function archiverProcess(topic, message) {
    Object.entries(archiverConfig)
        .filter(([type, config]) => config.enabled && archiverFunctions[type]?.process && config.topicPattern(topic))
        .forEach(([type]) => archiverFunctions[type].process(topic, message));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let client = null;

function mqttReceive(topic, message) {
    try {
        archiverProcess(topic, message);
    } catch (error) {
        console.error(`mqtt: receive error for message with 'topic=${topic}', error:`, error);
    }
}

function mqttSubscribe() {
    if (client) {
        config.mqtt.topics.forEach((topic) =>
            client.subscribe(topic, (err) => {
                if (err) console.error(`mqtt: error subscribing to ${topic}:`, err);
                else console.log(`mqtt: subscribed to ${topic}`);
            })
        );
    }
}

function mqttBegin() {
    console.log(`mqtt: connecting to broker at ${config.mqtt.broker}`);

    const options = {
        clientId: config.mqtt.clientId,
    };
    if (config.mqtt.username && config.mqtt.password) {
        options.username = config.mqtt.username;
        options.password = config.mqtt.password;
    }

    client = mqtt.connect(config.mqtt.broker, options);

    if (client) {
        client.on('connect', () => {
            console.log('mqtt: connected');
            mqttSubscribe();
        });
        client.on('message', (topic, message) => {
            mqttReceive(topic, message);
        });
        client.on('error', (err) => console.error('mqtt: client error:', err));
        client.on('offline', () => console.warn('mqtt: client offline'));
        client.on('reconnect', () => console.log('mqtt: client reconnect'));
    }
}

function mqttEnd() {
    if (client) {
        client.end();
        client = null;
    }
}

console.log(`Loaded 'mqtt' using 'broker=${config.mqtt.broker}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function collectorBegin() {
    archiverBegin();
    mqttBegin();
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

//snapshotToTimelapse();
collectorBegin();

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
