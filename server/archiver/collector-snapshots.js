// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');

const NUMBER_OF_DAYS_BACKWARDS_TIMELAPSE = 0; // make timelapse after this many days
const NUMBER_OF_DAYS_BACKWARDS_SNAPSHOTS = 28; // delete after this many days

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let __snapshotsDirectory = '';
let __timelapseDirectory = '';
let __snapshotReceiveImagedata = null;
let __timelapseTimer = null;

function __snapshotStoragePath(filename) {
    const match = filename.match(/snapshot_(\d{14})\.jpg/);
    if (match?.[1]) {
        const dirPath = path.join(__snapshotsDirectory, match[1].substring(0, 8));
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
    return path.join(__timelapseDirectory, `timelapse_${prefix}.mp4`);
}

function getSnapshotDirectory(prefix) {
    return path.join(__snapshotsDirectory, prefix);
}

function getCutoffDirectories(cutoffDateStr) {
    try {
        return fs
            .readdirSync(__snapshotsDirectory)
            .filter((item) => fs.statSync(path.join(__snapshotsDirectory, item)).isDirectory() && /^\d{8}$/.test(item) && item < cutoffDateStr)
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

// -----------------------------------------------------------------------------------------------------------------------------------------

function __snapshotToTimelapse(prefix) {
    return new Promise((resolve, reject) => {
        console.log(`snapshots: timelapse: ${prefix}: encode begin ${new Date().toISOString()}`);

        const snapshotsSrc = getSnapshotDirectory(prefix);
        const timelapseFile = getTimelapseFilename(prefix);
        const snapshotsFile = path.join('/tmp', `filelist_${prefix}.txt`);
        if (fs.existsSync(timelapseFile)) fs.unlinkSync(timelapseFile);

        let files;
        try {
            files = fs
                .readdirSync(snapshotsSrc)
                .filter((file) => file.startsWith(`snapshot_${prefix}`))
                .sort()
                .map((file) => path.join(snapshotsSrc, file));
        } catch (error) {
            console.error(`snapshots: timelapse: ${prefix}: encode error reading files: ${error.message}`);
            return reject(error);
        }

        if (files.length === 0) {
            console.warn(`snapshots: timelapse: ${prefix}: encode found no files`);
            return resolve({
                status: 'warning',
                message: `No snapshots found for prefix ${prefix}`,
            });
        }

        fs.writeFileSync(snapshotsFile, files.map((file) => `file '${file}'`).join('\n') + '\n');
        const snapshotsNumb = files.length;
        let snapshotsBytes = 0;
        files.forEach((file) => (snapshotsBytes += fs.statSync(file).size));
        const snapshotsSize = formatFileSize(snapshotsBytes);

        console.log(`snapshots: timelapse: ${prefix}: encode using files='${snapshotsNumb}', size=${snapshotsSize}`);

        const encodeTimeBegin = Math.floor(Date.now() / 1000);

        const ffmpegFps = 5;
        const ffmpegPreset = 'slow';
        const ffmpegCrf = 31;
        const ffmpegOpt = '';
        const ffmpegCodec = `-c:v libx265 -x265-params log-level=1 -crf ${ffmpegCrf}`;
        const ffmpegCmd = `ffmpeg -hide_banner -loglevel warning -f concat -safe 0 -i ${snapshotsFile} ${ffmpegCodec} -preset ${ffmpegPreset} -r ${ffmpegFps} ${ffmpegOpt} ${timelapseFile}`;

        const { exec } = require('child_process');
        console.log(`snapshots: timelapse: ${prefix}: encode ffmpeg: '${ffmpegCmd}'`);

        const ffmpegProcess = exec(ffmpegCmd, (error) => {
            if (error) {
                console.error(`snapshots: timelapse: ${prefix}: encode ffmpeg: error: ${error.message}`);
                if (fs.existsSync(snapshotsFile)) fs.unlinkSync(snapshotsFile);
                return reject(error);
            }

            const encodingTime = Math.floor(Date.now() / 1000) - encodeTimeBegin;
            console.log(`snapshots: timelapse: ${prefix}: encode finished (${encodingTime} seconds, ${(snapshotsNumb / encodingTime).toFixed(2)} FPS)`);

            const timelapseBytes = timelapseStats.size;
            const timelapseSize = formatFileSize(timelapseBytes);
            const compressionRatio = (snapshotsBytes / timelapseBytes).toFixed(2);

            console.log(
                `snapshots: timelapse: ${prefix}: encode complete: snapshots='${snapshotsNumb}', size=${snapshotsSize} --> timelapse='${timelapseFile}', size=${timelapseSize} (${compressionRatio}:1)`
            );

            const timelapseStats = fs.statSync(timelapseFile);
            if (fs.existsSync(snapshotsFile)) fs.unlinkSync(snapshotsFile);

            resolve({
                status: 'success',
                prefix,
                snapshotsNumb,
                snapshotsSize,
                timelapseFile,
                timelapseSize,
                compressionRatio,
                encodingTime,
            });
        });

        if (ffmpegProcess && ffmpegProcess.stderr)
            ffmpegProcess.stderr.on('data', (data) => {
                console.log(`snapshots: timelapse: ${prefix}: encode ffmpeg: ${data.toString().trim()}`);
            });
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------

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
        console.log(`snapshots: cleanup: ${dateDir}: removed ${formattedSize} snapshots`);
        return { dateDir, deleted: true, size: formattedSize };
    } catch (error) {
        console.error(`snapshots: cleanup: ${dateDir}: error (exception): ${error.message}`);
        throw error;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

async function snapshotMaintain() {
    const cutoffDays = NUMBER_OF_DAYS_BACKWARDS_SNAPSHOTS;
    const cutoffDateStr = getCutoffDate(cutoffDays);
    const dateDirs = getCutoffDirectories(cutoffDateStr);

    console.log(`snapshots: maintenance: ${dateDirs.length} directories older than ${cutoffDateStr} (${cutoffDays} days) to cleanup`);
    for (const dateDir of dateDirs) {
        try {
            if (fs.existsSync(getTimelapseFilename(dateDir))) await snapshotCleanup(dateDir, getSnapshotDirectory(dateDir));
            else console.warn(`snapshots: maintenance: ${dateDir}: cannot discard due to lack of timelapse`);
        } catch (dirError) {
            console.error(`snapshots: maintenance: ${dateDir}: error (exception): ${dirError.message}`);
        }
    }
    if (dateDirs.length > 0) console.log('snapshots: maintenance: complete');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

async function snapshotToTimelapse() {
    const cutoffDays = NUMBER_OF_DAYS_BACKWARDS_TIMELAPSE;
    const cutoffDateStr = getCutoffDate(cutoffDays);
    const dateDirs = getCutoffDirectories(cutoffDateStr).filter((dir) => !fs.existsSync(getTimelapseFilename(dir)));

    console.log(`snapshots: timelapse: ${dateDirs.length} directories older than ${cutoffDateStr} (${cutoffDays} days) to process`);
    for (const dateDir of dateDirs) {
        try {
            console.log(`snapshots: timelapse: ${dateDir}: generating`);
            const result = await __snapshotToTimelapse(dateDir);
            console.log(`snapshots: timelapse: ${dateDir}: generated (${JSON.stringify(result)})`);
        } catch (error) {
            console.error(`snapshots: timelapse: ${dateDir}: error (exception): ${error.message}`);
        }
    }
    if (dateDirs.length > 0) console.log('snapshots: timelapse: complete');

    snapshotMaintain();
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function snapshotStore(type, message) {
    if (type == 'imagedata') return __snapshotStoreImagedata(message);
    else if (type == 'metadata') return __snapshotStoreMetadata(message);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function snapshotBegin(config) {
    __snapshotsDirectory = config.storage.snapshots || 'snapshots';
    __timelapseDirectory = config.storage.timelapse || 'timelapse';
    if (!fs.existsSync(__snapshotsDirectory)) fs.mkdirSync(__snapshotsDirectory, { recursive: true });
    if (!fs.existsSync(__timelapseDirectory)) fs.mkdirSync(__timelapseDirectory, { recursive: true });
    const timeToNextCheck = msUntilNextTimelapseCheck();
    __timelapseTimer = setTimeout(() => {
        snapshotToTimelapse();
        __timelapseTimer = setInterval(snapshotToTimelapse, 24 * 60 * 60 * 1000);
    }, timeToNextCheck);
    console.log(`snapshots: timelapse: startup check, then next check in ${Math.floor(timeToNextCheck / 1000 / 60)} minutes`);
    snapshotToTimelapse();
    console.log(`snapshots: loaded using 'snapshots-path=${__snapshotsDirectory}, timelapse-path=${__timelapseDirectory}'`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function snapshotEnd() {
    if (__timelapseTimer) {
        clearTimeout(__timelapseTimer);
        clearInterval(__timelapseTimer);
        __timelapseTimer = null;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    begin: snapshotBegin,
    end: snapshotEnd,
    process: (topic, message) => snapshotStore(topic.split('/')[1], message),
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
