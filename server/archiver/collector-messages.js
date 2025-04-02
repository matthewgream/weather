// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

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

const lzma = require('lzma-native');

const __messageCheckInterval = 60 * 1000;
let __messageDirectory = '';
let __messageInterval = null;
let __messageCurrentDate = '';
let __messageCurrentPath = '';
let __messageCurrentStream = null;

function __messageFilePath(dateString) {
    const dirPath = path.join(__messageDirectory, dateString.substring(0, 6));
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
        writeStream.on('error', (err) => console.error(`messages: ${dateString}: compress error (stream write): ${err}`));
    } catch (err) {
        console.error(`messages: ${dateString}: compress error (exception): ${err}`);
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
            console.log(`messages: rollover ${previousDate} -> ${dateString}`);
            __messageCompressFile(previousDate);
        }
        __messageCurrentDate = dateString;
        __messageCurrentPath = __messageFilePath(dateString);
        console.log(`messages: writing to ${__messageCurrentPath}`);
        __messageCurrentStream = fs.createWriteStream(__messageCurrentPath, { flags: 'a' });
    }
    return __messageCurrentStream;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function messageStore(topic, payload) {
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
    return true;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function messageBegin(config) {
    __messageDirectory = config.storage.messages || 'messages';
    if (!fs.existsSync(__messageDirectory)) fs.mkdirSync(__messageDirectory, { recursive: true });
    __messageWriteStream();
    __messageInterval = setInterval(() => {
        __messageWriteStream();
    }, __messageCheckInterval);
    console.log(`messages: loaded using 'path=${__messageDirectory}'`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function messageEnd() {
    if (__messageCurrentStream) {
        __messageCurrentStream.end();
        __messageCurrentStream = null;
    }
    if (__messageInterval) clearInterval(__messageInterval);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    begin: messageBegin,
    end: messageEnd,
    process: (topic, message) => messageStore(topic, message.toString()),
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
