// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

const THUMBNAIL_CACHE_SIZE = 128;
const THUMBNAIL_CACHE_TIME = 65 * 60 * 1000;
const THUMBNAIL_WIDTH_CAMERA = 600;
const THUMBNAIL_WIDTH_SNAPSHOT = 200;

const SNAPSHOT_INTERVALS = [15, 30, 45, 60];
const SNAPSHOT_CACHE_TIME = 65 * 60 * 1000;
const SNAPSHOT_REBUILD_TIME = 30 * 1000;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function initialise(app, prefix, directory, server) {
    const { SnapshotThumbnailsManager } = require('./server-functions-snapshot.js');
    const snapshotThumbnailsManager = new SnapshotThumbnailsManager({ maxEntries: THUMBNAIL_CACHE_SIZE, ttl: THUMBNAIL_CACHE_TIME });
    process.on('SIGTERM', () => {
        snapshotThumbnailsManager.dispose();
    });

    //

    function getThumbnailKey(file, width) {
        const mtime = fs.statSync(file).mtime.getTime();
        return crypto.createHash('md5').update(`${file}-${width}-${mtime}`).digest('hex');
    }
    async function getThumbnailData(file, width) {
        if (!file.match(/snapshot_(\d{8})\d{6}\.jpg/)?.[1]) return null;
        const filePath = path.join(directory, file);
        if (!fs.existsSync(filePath)) return null;
        const key = getThumbnailKey(filePath, width);
        let thumbnail = snapshotThumbnailsManager.retrieve(key);
        if (!thumbnail) {
            thumbnail = await sharp(filePath)
                .resize(width)
                .jpeg({ quality: width > THUMBNAIL_WIDTH_SNAPSHOT ? 80 : 70 })
                .toBuffer();
            snapshotThumbnailsManager.insert(key, thumbnail);
        }
        return thumbnail;
    }

    //

    // XXX should use SnapshotContentsManager

    let snapshotList__ = [];
    function getSnapshotTimestamp(filename) {
        const match = filename.match(/snapshot_(\d{14})\.jpg/);
        return match?.[1]
            ? new Date(
                  parseInt(match[1].substring(0, 4)),
                  parseInt(match[1].substring(4, 6)) - 1,
                  parseInt(match[1].substring(6, 8)),
                  parseInt(match[1].substring(8, 10)),
                  parseInt(match[1].substring(10, 12)),
                  parseInt(match[1].substring(12, 14))
              )
            : undefined;
    }
    function readSnapshotsFromDirectory(dirPath) {
        return fs
            .readdirSync(dirPath)
            .filter((file) => !file.startsWith('snapshot_M') && file.startsWith('snapshot_') && file.endsWith('.jpg'))
            .sort((a, b) => b.localeCompare(a))
            .map((file) => ({ file }));
    }
    function addSnapshot(filename, data) {
        try {
            fs.writeFileSync(path.join(directory, filename), data);
            snapshotList__.unshift(filename);
            console.log(`snapshot received: ${filename} (--> ${directory}`);
        } catch (error) {
            console.error('Error storing snapshot:', error);
        }
    }
    function expireSnapshot() {
        const expiryTime = new Date(new Date().getTime() - SNAPSHOT_CACHE_TIME);
        try {
            snapshotList__ = snapshotList__.filter((file) => {
                const fileTime = getSnapshotTimestamp(file);
                if (fileTime && fileTime < expiryTime)
                    try {
                        fs.unlinkSync(path.join(directory, file));
                        return false;
                    } catch (err) {
                        console.error(`Error processing file ${file} during expire:`, err);
                    }
                return true;
            });
        } catch (error) {
            console.error(`Error cleaning up old snapshots in ${directory}:`, error);
        }
    }
    async function setIntervalSnapshot(sourcePath, targetName, width) {
        try {
            await getThumbnailData(targetName, width);
        } catch (error) {
            console.error(`Error generating thumbnails for ${targetName}:`, error);
        }
        const targetPath = path.join(directory, targetName);
        try {
            fs.unlinkSync(targetPath);
        } catch (err) {
            if (err.code !== 'ENOENT') console.error(`Error removing symlink for ${targetPath}:`, err);
        }
        try {
            fs.symlinkSync(sourcePath, targetPath);
        } catch (err) {
            console.error(`Error creating symlink for ${targetPath}:`, err);
        }
    }
    async function rebuildIntervals() {
        expireSnapshot();
        if (snapshotList__.length == 0) return;
        const closestSnapshots = {};
        const earliest = snapshotList__[0];
        for (const interval of SNAPSHOT_INTERVALS) {
            const targetTime = new Date(new Date().getTime() - interval * 60 * 1000);
            const closest = snapshotList__.reduce(
                (closest, file) => {
                    try {
                        const fileTime = getSnapshotTimestamp(file);
                        if (fileTime) {
                            const diff = Math.abs(targetTime - fileTime);
                            if (!closest.file || diff < closest.diff) {
                                return { file, diff };
                            }
                        }
                    } catch (err) {
                        console.error(`Error comparing snapshot ${file}:`, err);
                    }
                    return closest;
                },
                { file: undefined, diff: Infinity }
            );
            if (closest.file) closestSnapshots[interval] = closest.file;
        }
        for (const interval in closestSnapshots)
            await setIntervalSnapshot(path.join(directory, closestSnapshots[interval]), `snapshot_M${interval}.jpg`, THUMBNAIL_WIDTH_SNAPSHOT);
        await setIntervalSnapshot(path.join(directory, earliest), 'snapshot.jpg', THUMBNAIL_WIDTH_CAMERA);
    }
    async function getIntervalThumbnails() {
        async function makethumb(filename, width) {
            try {
                const imageBuffer = await getThumbnailData(filename, width);
                if (imageBuffer) return `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
            } catch (err) {
                console.error(`Error getting thumbnail for ${filename}:`, err);
                return null;
            }
        }
        const thumbnails = {};
        for (const interval of SNAPSHOT_INTERVALS) thumbnails[`M${interval}`] = await makethumb(`snapshot_M${interval}.jpg`, THUMBNAIL_WIDTH_SNAPSHOT);
        thumbnails['current'] = await makethumb('snapshot.jpg', THUMBNAIL_WIDTH_CAMERA);
        return thumbnails;
    }

    snapshotList__ = readSnapshotsFromDirectory(directory);
    rebuildIntervals();
    setInterval(rebuildIntervals, SNAPSHOT_REBUILD_TIME);
    console.log(`snapshot intervals started using frequency=${SNAPSHOT_REBUILD_TIME}s`);

    //

    app.get(prefix + '/thumb/:file', async (req, res) => {
        const file = req.params.file;
        const width = parseInt(req.query.w) || THUMBNAIL_WIDTH_SNAPSHOT;
        try {
            const imagedata = await getThumbnailData(file, width);
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
        getThumbnails: getIntervalThumbnails,
        insert: addSnapshot,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (app, prefix, options) {
    return initialise(app, prefix, options.directory || __dirname, options.server);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
