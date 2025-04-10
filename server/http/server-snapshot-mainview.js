// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

/*
const { createProxyMiddleware } = require('http-proxy-middleware');
const TARGET_SERVER = 'http://workshop.local:80';
const snapshotProxy = createProxyMiddleware({
    target: TARGET_SERVER,
    changeOrigin: true,
    onProxyRes: (proxyRes, req, res) => {
        console.log(`Proxied ${req.method} ${req.path} -> ${TARGET_SERVER} [${proxyRes.statusCode}]`);
    },
    onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.status(500).send('Proxy error occurred');
    }
});
app.use('/snapshot/list', snapshotProxy);
app.use('/snapshot/file', snapshotProxy);
*/

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const MAIN_CAMERA_WIDTH = 600;
const THUMBNAIL_WIDTH = 200;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function initialiseSnapshot(xxx, prefix, directory) {
    //

    const snapshotsTime = (24 * 2 + 2) * 60 * 60; // 2 days + 2 hours, in seconds
    const snapshotsDir__ = directory + '/snapshots';
    let snapshotsList__ = [];
    function snapshotTimestampParser(filename) {
        const match = filename.match(/snapshot_(\d{14})\.jpg/);
        if (match?.[1]) {
            const str = match[1];
            return new Date(
                parseInt(str.substring(0, 4)),
                parseInt(str.substring(4, 6)) - 1,
                parseInt(str.substring(6, 8)),
                parseInt(str.substring(8, 10)),
                parseInt(str.substring(10, 12)),
                parseInt(str.substring(12, 14))
            );
        }
        return undefined;
    }

    //

    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    function getFormattedDate(date) {
        return `${date.substring(0, 4)} ${months[parseInt(date.substring(4, 6)) - 1]} ${parseInt(date.substring(6, 8))}`;
    }
    function getFormattedTime(time) {
        return `${parseInt(time.substring(0, 2)).toString().padStart(2, '0')}:${parseInt(time.substring(2, 4)).toString().padStart(2, '0')}:${parseInt(time.substring(4, 6)).toString().padStart(2, '0')}`;
    }
    function getSnapshotsListForDate(date) {
        return snapshotsList__
            .filter((file) => file.slice(9, 17) === date)
            .sort((a, b) => b.localeCompare(a))
            .map((file) => ({ file, timeCode: file.slice(17, 23) }))
            .map(({ file, timeCode }) => ({
                file,
                timeFormatted: getFormattedTime(timeCode),
            }));
    }
    function getSnapshotsListOfDates() {
        return [...new Set(snapshotsList__.map((file) => file.slice(9, 17)))]
            .sort((a, b) => b.localeCompare(a))
            .map((dateCode) => ({
                dateCode,
                dateFormatted: getFormattedDate(dateCode),
            }));
    }
    function getSnapshotsImageFilename(file) {
        if (snapshotsList__.includes(file)) return `${snapshotsDir__}/${file}`;
        return undefined;
    }
    const fs = require('fs');
    const path = require('path');
    const sharp = require('sharp');
    const crypto = require('crypto');
    const cacheEntries = {};
    const MAX_CACHE_ENTRIES = 32;
    const CACHE_TTL = 24 * 60 * 60 * 1000;
    const cacheDetails = {};
    function cacheInsert(key, value) {
        const now = Date.now();
        cacheEntries[key] = value;
        cacheDetails[key] = {
            added: now,
            lastAccessed: now,
        };
        cacheCleanup();
    }
    function cacheRetrieve(key) {
        const entry = cacheEntries[key];
        if (entry) cacheDetails[key].lastAccessed = Date.now();
        return entry;
    }
    function cacheCleanup() {
        const now = Date.now();
        const cacheKeys = Object.keys(cacheEntries);
        if (cacheKeys.length <= MAX_CACHE_ENTRIES) {
            cacheKeys.forEach((key) => {
                if (now - cacheDetails[key].added > CACHE_TTL) {
                    delete cacheEntries[key];
                    delete cacheDetails[key];
                }
            });
            return;
        }
        const sortedKeys = cacheKeys.sort((a, b) => cacheDetails[a].lastAccessed - cacheDetails[b].lastAccessed);
        let keysToRemove = sortedKeys.filter((key) => now - cacheDetails[key].added > CACHE_TTL);
        if (cacheKeys.length - keysToRemove.length > MAX_CACHE_ENTRIES) {
            const targetSize = Math.floor(MAX_CACHE_ENTRIES * 0.9);
            const additionalToRemove = cacheKeys.length - keysToRemove.length - targetSize;
            if (additionalToRemove > 0)
                keysToRemove = keysToRemove.concat(sortedKeys.filter((key) => !keysToRemove.includes(key)).slice(0, additionalToRemove));
        }
        keysToRemove.forEach((key) => {
            delete cacheEntries[key];
            delete cacheDetails[key];
        });
    }

    async function getSnapshotsImageThumbnail(file, width) {
        const sourcePath = `/dev/shm/${file}`;
        if (!fs.existsSync(sourcePath)) return null;
        const mtime = fs.statSync(sourcePath).mtime.getTime();
        const cacheKey = crypto.createHash('md5').update(`${file}-${width}-${mtime}`).digest('hex');
        const cachedThumbnail = cacheRetrieve(cacheKey);
        if (cachedThumbnail) return cachedThumbnail;
        const thumbnail = await sharp(sourcePath)
            .resize(width)
            .jpeg({ quality: width > 200 ? 80 : 70 })
            .toBuffer();
        cacheInsert(cacheKey, thumbnail);
        return thumbnail;
    }

    //

    function snapshotLoad() {
        try {
            fs.mkdirSync(snapshotsDir__, { recursive: true });
            const files = fs.readdirSync(snapshotsDir__);
            snapshotsList__ = files
                .filter((file) => file.match(/snapshot_\d{14}\.jpg/))
                .sort((a, b) => (snapshotTimestampParser(b) || 0) - (snapshotTimestampParser(a) || 0));
            console.log(`snapshot list loaded with ${snapshotsList__.length} existing files (with expiration of ${snapshotsTime / 60 / 60} hours)`);
        } catch (error) {
            console.error('Error loading snapshot list:', error);
            throw error;
        }
    }
    let __snapshotReceiveImagedata = null;
    function snapshotReceiveImagedata(message) {
        __snapshotReceiveImagedata = message;
    }
    function snapshotReceiveMetadata(message) {
        try {
            if (!__snapshotReceiveImagedata) {
                console.error('Received snapshot metadata but no image data is available');
                return;
            }
            const metadata = JSON.parse(message.toString());
            const filename = metadata.filename;
            const shmPath = path.join('/dev/shm', filename);
            const snapshotPath = path.join(snapshotsDir__, filename);
            fs.writeFileSync(shmPath, __snapshotReceiveImagedata);
            fs.writeFileSync(snapshotPath, __snapshotReceiveImagedata);
            snapshotsList__.unshift(filename);
            __snapshotReceiveImagedata = null;
            console.log(`snapshot received: ${filename} (--> /dev/shm, --> ${snapshotsDir__})`);
        } catch (error) {
            console.error('Error processing snapshot metadata:', error);
        }
    }
    async function __snapshotInstall(sourcePath, targetFilename, width) {
        try {
            await getSnapshotsImageThumbnail(targetFilename, width);
        } catch (error) {
            console.error(`Error generating thumbnails for ${targetFilename}:`, error);
        }
        const symlinkPath = `/dev/shm/${targetFilename}`;
        try {
            fs.unlinkSync(symlinkPath);
        } catch (err) {
            if (err.code !== 'ENOENT') console.error(`Error removing symlink for ${symlinkPath}:`, err);
        }
        try {
            fs.symlinkSync(sourcePath, symlinkPath);
        } catch (err) {
            console.error(`Error creating symlink for ${symlinkPath}:`, err);
        }
    }
    async function snapshotRebuild() {
        if (snapshotsList__.length == 0) return;
        const intervals = [15, 30, 45, 60];
        const now = new Date();
        let oldestNeededTimestamp = null;
        const closestSnapshots = {};
        for (const minutes of intervals) {
            const targetTime = new Date(now.getTime() - minutes * 60 * 1000);
            let closest = undefined;
            let closestDiff = Infinity;
            for (const file of snapshotsList__) {
                try {
                    const fileTime = snapshotTimestampParser(file);
                    if (fileTime) {
                        const diff = Math.abs(targetTime - fileTime);
                        if (diff < closestDiff) {
                            closestDiff = diff;
                            closest = file;
                        }
                    }
                } catch (err) {
                    console.error(`Error comparing snapshot ${file}:`, err);
                }
            }
            if (closest) {
                closestSnapshots[minutes] = closest;
                if (minutes === 60) oldestNeededTimestamp = snapshotTimestampParser(closest);
            }
        }
        for (const minutes of intervals)
            if (closestSnapshots[minutes])
                await __snapshotInstall(path.join('/dev/shm', closestSnapshots[minutes]), `snapshot_M${minutes}.jpg`, THUMBNAIL_WIDTH);
        if (snapshotsList__.length > 0) await __snapshotInstall(path.join('/dev/shm', snapshotsList__[0]), 'snapshot.jpg', MAIN_CAMERA_WIDTH);
        if (oldestNeededTimestamp) {
            try {
                const files = fs.readdirSync('/dev/shm');
                for (const file of files) {
                    if (file.match(/snapshot_\d{14}\.jpg/) && !file.startsWith('snapshot_M')) {
                        try {
                            const fileTime = snapshotTimestampParser(file);
                            if (fileTime && fileTime.getTime() < oldestNeededTimestamp.getTime() - 5 * 60 * 1000) fs.unlinkSync(path.join('/dev/shm', file));
                        } catch (err) {
                            console.error(`Error processing file ${file} during cleanup:`, err);
                        }
                    }
                }
            } catch (error) {
                console.error('Error cleaning up old snapshots in /dev/shm:', error);
            }
        }
    }
    function snapshotCleanup() {
        try {
            const cleanupTime = new Date(new Date().getTime() - snapshotsTime * 1000);
            const files = fs.readdirSync(snapshotsDir__);
            for (const file of files) {
                if (file.startsWith('snapshot_')) {
                    try {
                        const fileTime = snapshotTimestampParser(file);
                        if (fileTime && fileTime < cleanupTime) {
                            const filePath = path.join(snapshotsDir__, file);
                            fs.unlinkSync(filePath);
                            const index = snapshotsList__.indexOf(file);
                            if (index !== -1) {
                                console.log(`snapshot removed: ${file}`);
                                snapshotsList__.splice(index, 1);
                            }
                        }
                    } catch (err) {
                        console.error(`Error removing file ${file}:`, err);
                    }
                }
            }
        } catch (error) {
            console.error('Error updating snapshot:', error);
        }
    }
    function snapshotUpdate() {
        snapshotRebuild();
        snapshotCleanup();
    }
    function snapshotInitialise() {
        try {
            snapshotLoad();
            snapshotUpdate();
            setInterval(snapshotUpdate, 30000);
            console.log('snapshot process started with frequency=30 seconds');
        } catch (error) {
            console.error('Failed to start snapshot process:', error);
            throw error;
        }
    }
    snapshotInitialise();

    async function __generateThumbnailsToRender() {
        const thumbnails = {};
        async function makethumb(filename, width) {
            try {
                const imageBuffer = await getSnapshotsImageThumbnail(filename, width);
                if (imageBuffer) return `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
            } catch (err) {
                console.error(`Error getting thumbnail for ${filename}:`, err);
                return null;
            }
        }
        const intervals = [15, 30, 45, 60];
        for (const minutes of intervals) thumbnails[`M${minutes}`] = await makethumb(`snapshot_M${minutes}.jpg`, THUMBNAIL_WIDTH);
        thumbnails['current'] = await makethumb('snapshot.jpg', MAIN_CAMERA_WIDTH);
        return thumbnails;
    }

    //

    xxx.get(prefix + '/list', (req, res) => {
        return res.render('server-snapshot-list', {
            snapshotList: {
                entries: getSnapshotsListOfDates(),
            },
            timelapseList: {},
        });
    });
    xxx.get(prefix + '/list/:date', (req, res) => {
        const date = req.params.date;
        return res.render('server-snapshot-date', {
            dateFormatted: getFormattedDate(date),
            entries: getSnapshotsListForDate(date),
        });
    });
    xxx.get(prefix + '/file/:file', (req, res) => {
        const file = req.params.file;
        const filename = getSnapshotsImageFilename(file);
        if (!filename) return res.status(404).send('Snapshot not found');
        return res.sendFile(filename);
    });
    xxx.get(prefix + '/thumb/:file', async (req, res) => {
        const file = req.params.file;
        const width = parseInt(req.query.w) || THUMBNAIL_WIDTH;
        try {
            const imagedata = await getSnapshotsImageThumbnail(file, width);
            if (imagedata == null) return res.status(404).send('Thumbnail not found');
            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=300');
            return res.send(imagedata);
        } catch (error) {
            console.error('Error generating thumbnail:', error);
            return res.status(500).send('Error generating thumbnail');
        }
    });

    //

    return {
        getThumbnails: __generateThumbnailsToRender,
        receiveMetadata: snapshotReceiveMetadata,
        receiveImagedata: snapshotReceiveImagedata,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (xxx, prefix, directory) {
    return initialiseSnapshot(xxx, prefix, directory);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
