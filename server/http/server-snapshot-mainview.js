// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const MAIN_CAMERA_WIDTH = 600;
const THUMBNAIL_WIDTH = 200;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function initialiseSnapshot(app, prefix, server) {
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
            fs.writeFileSync(shmPath, __snapshotReceiveImagedata);
            snapshotsList__.unshift(filename);
            __snapshotReceiveImagedata = null;
            console.log(`snapshot received: ${filename} (--> /dev/shm)`);
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
    function snapshotInitialise() {
        try {
            snapshotRebuild();
            setInterval(snapshotRebuild, 30000);
            console.log('snapshot process started with frequency=30 seconds');
        } catch (error) {
            console.error('Failed to start snapshot process:', error);
            throw error;
        }
    }
    snapshotInitialise();

    //

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

    app.get(prefix + '/thumb/:file', async (req, res) => {
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
    app.use(
        prefix,
        require('http-proxy-middleware').createProxyMiddleware({
            target: server,
            changeOrigin: true,
            secure: false,
            logLevel: 'debug',
            selfHandleResponse: false,
            followRedirects: false,
            pathRewrite: { '^/': '/snapshot/' },
        })
    );

    //

    return {
        getThumbnails: __generateThumbnailsToRender,
        receiveMetadata: snapshotReceiveMetadata,
        receiveImagedata: snapshotReceiveImagedata,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (app, prefix, server) {
    return initialiseSnapshot(app, prefix, server);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
