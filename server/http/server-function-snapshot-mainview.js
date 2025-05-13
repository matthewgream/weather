// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

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
    const { SnapshotThumbnailsManager, getThumbnailData } = require('./server-function-snapshot.js');
    const snapshotThumbnailsManager = new SnapshotThumbnailsManager({ maxEntries: THUMBNAIL_CACHE_SIZE, ttl: THUMBNAIL_CACHE_TIME });
    process.on('SIGTERM', () => {
        snapshotThumbnailsManager.dispose();
    });

    //

    async function getThumbnailImage(file, width) {
        if (!file.startsWith('snapshot') || !file.endsWith('.jpg')) return null;
        return getThumbnailData(snapshotThumbnailsManager, path.join(directory, file), width, width > THUMBNAIL_WIDTH_SNAPSHOT ? 80 : 70);
    }

    //

    // XXX should use SnapshotContentsManager
    // this is also not the correct way to do it. should not create symlink, but just return the specific timestamped
    // snapshot. otherwise, we can be out of sync between clients and thumbnails / snapshots.
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
    function snapshotsLoad(directory) {
        return fs
            .readdirSync(directory)
            .filter((file) => !file.startsWith('snapshot_M') && file.startsWith('snapshot_') && file.endsWith('.jpg'))
            .sort((a, b) => b.localeCompare(a));
    }
    function snapshotsExpire() {
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
    function snapshotsInsert(filename, data) {
        try {
            fs.writeFileSync(path.join(directory, filename), data);
            snapshotList__.unshift(filename);
            console.log(`snapshot received: ${filename} (--> ${directory})`);
        } catch (error) {
            console.error('Error storing snapshot:', error);
        }
    }

    //

    async function intervalsSnapshotsSet(sourcePath, targetName, width) {
        try {
            await getThumbnailImage(targetName, width);
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
    async function intervalsSnapshotsRebuild() {
        snapshotsExpire();
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
            await intervalsSnapshotsSet(path.join(directory, closestSnapshots[interval]), `snapshot_M${interval}.jpg`, THUMBNAIL_WIDTH_SNAPSHOT);
        await intervalsSnapshotsSet(path.join(directory, earliest), 'snapshot.jpg', THUMBNAIL_WIDTH_CAMERA);
    }
    async function intervalsThumbnailsGet() {
        async function makethumb(filename, width) {
            try {
                const imageBuffer = await getThumbnailImage(filename, width);
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

    snapshotList__ = snapshotsLoad(directory);
    intervalsSnapshotsRebuild();
    setInterval(intervalsSnapshotsRebuild, SNAPSHOT_REBUILD_TIME);

    //

    app.get(prefix + '/thumb/:file', async (req, res) => {
        const file = req.params.file;
        const width = parseInt(req.query.w) || THUMBNAIL_WIDTH_SNAPSHOT;
        try {
            const imagedata = await getThumbnailImage(file, width);
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
        getThumbnails: intervalsThumbnailsGet,
        insert: snapshotsInsert,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (app, prefix, options) {
    return initialise(app, prefix, options.directory || __dirname, options.server);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
