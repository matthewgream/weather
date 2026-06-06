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
const SNAPSHOT_MIN_STORE_INTERVAL = 60 * 1000; // gate: store at most one snapshot per this interval (regardless of capture rate)

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getSnapshotTimestamp(filename) {
    const match = filename.match(/snapshot_(\d{14})\.jpg/);
    return match?.[1]
        ? new Date(
              Number.parseInt(match[1].slice(0, 4)),
              Number.parseInt(match[1].slice(4, 6)) - 1,
              Number.parseInt(match[1].slice(6, 8)),
              Number.parseInt(match[1].slice(8, 10)),
              Number.parseInt(match[1].slice(10, 12)),
              Number.parseInt(match[1].slice(12, 14))
          )
        : undefined;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function initialise(app, prefix, directory, server) {
    const { SnapshotThumbnailsManager, getThumbnailData } = require('./server-function-snapshot.js');
    const snapshotThumbnailsManager = new SnapshotThumbnailsManager({ maxEntries: THUMBNAIL_CACHE_SIZE, ttl: THUMBNAIL_CACHE_TIME });

    //

    async function getThumbnailImage(file, width) {
        if (!file.startsWith('snapshot') || !file.endsWith('.jpg')) return undefined;
        return getThumbnailData(snapshotThumbnailsManager, path.join(directory, file), width, width > THUMBNAIL_WIDTH_SNAPSHOT ? 80 : 70);
    }
    async function createThumbnailFromImage(filename, width) {
        try {
            const imageBuffer = await getThumbnailImage(filename, width);
            if (imageBuffer) return `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
            console.error(`Error generating thumbnail for ${filename}`);
            return undefined;
        } catch (e) {
            console.error(`Error getting thumbnail for ${filename}:`, e);
            return undefined;
        }
    }

    //

    // XXX should use SnapshotContentsManager
    // this is also not the correct way to do it. should not create symlink, but just return the specific timestamped
    // snapshot. otherwise, we can be out of sync between clients and thumbnails / snapshots.
    let snapshotList__ = [];
    let snapshotAnchorTime__; // receipt time of the most recent frame retained in the 1h trail
    let snapshotLatest__; // { file, time } of the freshest frame, kept for the live view, pending trail decision
    function snapshotsLoad(directory) {
        snapshotList__ = fs
            .readdirSync(directory)
            .filter((file) => !file.startsWith('snapshot_M') && file.startsWith('snapshot_') && file.endsWith('.jpg'))
            .sort((a, b) => b.localeCompare(a));
    }
    function snapshotsExpire() {
        const expiryTime = new Date(Date.now() - SNAPSHOT_CACHE_TIME);
        try {
            snapshotList__ = snapshotList__.filter((file) => {
                const fileTime = getSnapshotTimestamp(file);
                if (fileTime && fileTime < expiryTime)
                    try {
                        fs.unlinkSync(path.join(directory, file));
                        return false;
                    } catch (e) {
                        console.error(`Error processing file ${file} during expire:`, e);
                    }
                return true;
            });
        } catch (e) {
            console.error(`Error cleaning up old snapshots in ${directory}:`, e);
        }
    }
    function snapshotsInsert(filename, data) {
        const now = Date.now();
        // always store the freshest frame so the live/large view stays current
        try {
            fs.writeFileSync(path.join(directory, filename), data);
            snapshotList__.unshift(filename);
            console.log(`snapshot received: ${filename} (--> ${directory})`);
        } catch (e) {
            console.error('Error storing snapshot:', e);
            return;
        }
        // thin the 1h trail: the previous frame, now superseded, is kept only if it is far enough
        // from the last retained frame to anchor the trail (>= SNAPSHOT_MIN_STORE_INTERVAL); else drop it
        if (snapshotLatest__ === undefined) {
            snapshotAnchorTime__ = now; // first frame anchors the trail
        } else if (snapshotLatest__.time - snapshotAnchorTime__ >= SNAPSHOT_MIN_STORE_INTERVAL) {
            snapshotAnchorTime__ = snapshotLatest__.time; // far enough from last anchor: retain in trail
        } else {
            try {
                fs.unlinkSync(path.join(directory, snapshotLatest__.file));
            } catch (e) {
                if (e.code !== 'ENOENT') console.error(`Error dropping interim snapshot ${snapshotLatest__.file}:`, e);
            }
            snapshotList__ = snapshotList__.filter((file) => file !== snapshotLatest__.file);
            console.log(`snapshot trail-gated: ${snapshotLatest__.file} (interim, superseded after ${Math.round((now - snapshotLatest__.time) / 1000)}s)`);
        }
        snapshotLatest__ = { file: filename, time: now };
    }

    //

    async function intervalsSnapshotsSet(sourcePath, targetName, width) {
        try {
            await getThumbnailImage(targetName, width);
        } catch (e) {
            console.error(`Error generating thumbnails for ${targetName}:`, e);
        }
        const targetPath = path.join(directory, targetName);
        try {
            fs.unlinkSync(targetPath);
        } catch (e) {
            if (e.code !== 'ENOENT') console.error(`Error removing symlink for ${targetPath}:`, e);
        }
        try {
            fs.symlinkSync(sourcePath, targetPath);
        } catch (e) {
            console.error(`Error creating symlink for ${targetPath}:`, e);
        }
    }
    async function intervalsSnapshotsRebuild() {
        snapshotsExpire();
        if (snapshotList__.length === 0) return;
        const closestSnapshots = {};
        for (const interval of SNAPSHOT_INTERVALS) {
            const targetTime = new Date(Date.now() - interval * 60 * 1000);
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
                    } catch (e) {
                        console.error(`Error comparing snapshot ${file}:`, e);
                    }
                    return closest;
                },
                { file: undefined, diff: Infinity }
            );
            if (closest.file) closestSnapshots[interval] = closest.file;
        }
        for (const interval in closestSnapshots) await intervalsSnapshotsSet(path.join(directory, closestSnapshots[interval]), `snapshot_M${interval}.jpg`, THUMBNAIL_WIDTH_SNAPSHOT);
    }
    async function intervalsThumbnailsGet() {
        const thumbnails = {};
        for (const interval of SNAPSHOT_INTERVALS) thumbnails[`M${interval}`] = await createThumbnailFromImage(`snapshot_M${interval}.jpg`, THUMBNAIL_WIDTH_SNAPSHOT);
        // current view resolves to the freshest real frame (never gated), so it can never reference a deleted file
        // eslint-disable-next-line dot-notation
        thumbnails['current'] = snapshotList__.length > 0 ? await createThumbnailFromImage(snapshotList__[0], THUMBNAIL_WIDTH_CAMERA) : undefined;
        return thumbnails;
    }

    snapshotsLoad(directory);
    intervalsSnapshotsRebuild();
    setInterval(intervalsSnapshotsRebuild, SNAPSHOT_REBUILD_TIME);

    //

    app.get(prefix + '/thumb/:file(snapshot\\.jpg|snapshot_M\\d+\\.jpg)', async (req, res) => {
        const { file } = req.params;
        const width = Number.parseInt(req.query.w) || THUMBNAIL_WIDTH_SNAPSHOT;
        // 'snapshot.jpg' is the current-view alias; resolve it to the freshest real frame (never gated)
        const target = file === 'snapshot.jpg' ? snapshotList__[0] : file;
        try {
            if (!target) return res.status(404).send('Thumbnail not found');
            const imagedata = await getThumbnailImage(target, width);
            if (!imagedata) return res.status(404).send('Thumbnail not found');
            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=300');
            return res.send(imagedata);
        } catch (e) {
            console.error('Error generating thumbnail:', e);
            return res.status(500).send('Error generating thumbnail');
        }
    });
    app.use(
        prefix,
        require('http-proxy-middleware').createProxyMiddleware({
            target: server,
            changeOrigin: true,
            secure: false,
            selfHandleResponse: false,
            followRedirects: false,
            pathRewrite: { '^/': '/snapshot/' },
        })
    );

    //

    return {
        getThumbnails: intervalsThumbnailsGet,
        insert: snapshotsInsert,
        getDiagnosticsProxyConfig: () => ({
            target: server,
            description: 'Snapshot archiver server diagnostics and monitoring',
        }),
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (app, prefix, options) {
    return initialise(app, prefix, options.directory || __dirname, options.server);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
