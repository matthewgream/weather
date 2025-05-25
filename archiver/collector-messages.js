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
let __messageInterval;
let __messageCurrentDate = '';
let __messageCurrentPath = '';
let __messageCurrentStream;

function __messageDirectoryPath(dateString) {
    const dirPath = path.join(__messageDirectory, dateString.slice(0, 6));
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
}

function __messageFilePath(dateString) {
    return path.join(__messageDirectoryPath(dateString), `${dateString}.json`);
}

function __messageCompressedName(filePath) {
    return `${filePath}.xz`;
}

function __messageCompressStream() {
    return lzma.createCompressor({ preset: 9 });
}

function __messageCompressPath(filePath, dateString) {
    if (!fs.existsSync(filePath)) return Promise.resolve();
    const prefix = `messages: ${dateString}: compress [${filePath}]: `;
    console.log(prefix + `begin`);
    return new Promise((resolve, reject) => {
        try {
            const compressedPath = __messageCompressedName(filePath);
            const originalSize = fs.statSync(filePath).size;
            const readStream = fs.createReadStream(filePath);
            const writeStream = fs.createWriteStream(compressedPath);
            readStream.pipe(__messageCompressStream()).pipe(writeStream); // Maximum compression level
            writeStream.on('finish', () => {
                const compressedSize = fs.statSync(compressedPath).size;
                console.log(
                    prefix + `complete (${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}, ${(originalSize / compressedSize).toFixed(2)}:1)`
                );
                fs.unlinkSync(filePath);
                resolve(compressedPath);
            });
            writeStream.on('error', (err) => {
                console.error(prefix + `error (stream write): ${err}`);
                reject(err);
            });
            readStream.on('error', (err) => {
                console.error(prefix + `error (stream read): ${err}`);
                reject(err);
            });
        } catch (e) {
            console.error(prefix + `error (exception): ${e}`);
            reject(e);
        }
    });
}
function __messageCompressDate(dateString) {
    __messageCompressPath(__messageFilePath(dateString), dateString);
}

function __messageWriteStream() {
    const dateString = getDatestring();
    if (dateString !== __messageCurrentDate) {
        if (__messageCurrentStream) {
            __messageCurrentStream.end();
            __messageCurrentStream = undefined;
        }
        const previousDate = __messageCurrentDate;
        if (previousDate) {
            console.log(`messages: rollover ${previousDate} -> ${dateString}`);
            __messageCompressDate(previousDate);
        }
        __messageCurrentDate = dateString;
        __messageCurrentPath = __messageFilePath(dateString);
        console.log(`messages: writing to ${__messageCurrentPath}`);
        __messageCurrentStream = fs.createWriteStream(__messageCurrentPath, { flags: 'a' });
    }
    return __messageCurrentStream;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

async function __messageMonthlyVerifyAndCleanup(dateString, messagesDir, messagesFiles, originalContent, compressedMonthlyFile) {
    const prefix = `messages: ${dateString}: monthly ${compressedMonthlyFile}: verify `;
    try {
        console.log(prefix + `begin`);
        try {
            const decompressedData = await lzma.decompress(fs.readFileSync(compressedMonthlyFile));
            const decompressedContent = decompressedData.toString('utf8');
            if (decompressedContent === originalContent) {
                console.log(prefix + `succeeded, cleanup begin`);
                try {
                    messagesFiles.forEach((file) => fs.unlinkSync(path.join(messagesDir, file)));
                    fs.rmdirSync(messagesDir);
                    console.log(prefix + `cleanup complete`);
                } catch (e) {
                    console.error(prefix + `cleanup error: ${e}`);
                }
            } else {
                console.error(prefix + `failed (original ${originalContent.length}, decompressed ${decompressedContent.length})`);
            }
        } catch (e) {
            console.error(prefix + `error (lzma decompress): ${e}`);
        }
    } catch (e) {
        console.error(prefix + `error (exception): ${e}`);
    }
}

async function messageMonthly() {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const dateString = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0');
    const messagesDir = __messageDirectoryPath(dateString);
    const monthlyFile = messagesDir + '.json';

    const prefix = `messages: ${dateString}: monthly ${monthlyFile}: `;
    let files;
    try {
        files = fs
            .readdirSync(messagesDir)
            .filter((file) => file.startsWith(dateString) && file.endsWith('json.xz'))
            .sort();
    } catch (e) {
        console.error(prefix + `error reading files: ${e.message}`);
    }
    if (files.length === 0) return;

    console.log(prefix + `using ${files.length} files (${files[0]} ... ${files[files.length - 1]})`);
    try {
        const fileContents = await Promise.all(
            files.map(async (file) => {
                try {
                    const decompressedData = await lzma.decompress(fs.readFileSync(path.join(messagesDir, file)));
                    const decompressedStr = decompressedData.toString('utf8').replace(/\n$/, '');
                    if (!JSON.parse(decompressedStr)) throw 'could not parse JSON (individual file)';
                    return decompressedStr;
                } catch (e) {
                    console.error(prefix + `error (processing ${file}): ${e}`);
                    return undefined;
                }
            })
        );
        const monthly = fileContents.filter((content) => content !== undefined).join('\n');
        if (!JSON.parse(monthly)) throw 'could not parse JSON (aggregate file)';
        fs.writeFileSync(monthlyFile, monthly);
        console.log(prefix + `wrote ${formatFileSize(monthly.length)}`);
        await __messageCompressPath(monthlyFile, `${dateString}: monthly ${monthlyFile}`);
        __messageMonthlyVerifyAndCleanup(dateString, messagesDir, files, monthly, __messageCompressedName(monthlyFile));
    } catch (e) {
        console.error(prefix + `error (exception): ${e}`);
    }
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
        try {
            __messageCurrentStream.end();
        } catch {}
        __messageCurrentStream = undefined;
    }
    if (__messageInterval) {
        clearInterval(__messageInterval);
        __messageInterval = undefined;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    begin: messageBegin,
    end: messageEnd,
    process: (topic, message) => messageStore(topic, message.toString()),
    monthly: messageMonthly,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
