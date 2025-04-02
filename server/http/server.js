#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const configPath = process.argv[2] || 'secrets.txt';
const { configLoad } = require('./server-functions.js');
const conf = configLoad(configPath);
const configList = Object.entries(conf)
    .map(([k, v]) => k.toLowerCase() + '=' + v)
    .join(', ');
const subs = ['weather/#', 'sensors/#', 'snapshots/#'];
const vars = ['weather/branna', 'sensors/radiation/cpm'];
const data_views = conf.DATA + '/http';
const data_images = conf.DATA + '/images';
const data_assets = conf.DATA + '/assets';
console.log(`Loaded 'config' using '${configPath}': ${configList}`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const letsencrypt = `/etc/letsencrypt/live/${conf.FQDN}`;
const credentials = {
    key: fs.readFileSync(`${letsencrypt}/privkey.pem`, 'utf8'),
    cert: fs.readFileSync(`${letsencrypt}/cert.pem`, 'utf8'),
    ca: fs.readFileSync(`${letsencrypt}/chain.pem`, 'utf8'),
};
console.log(`Loaded 'certificates' using '${letsencrypt}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const exp = require('express');
const xxx = exp();
xxx.set('view engine', 'ejs');
xxx.set('views', data_views);
console.log(`Loaded 'express' using 'ejs=${data_views}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.use((req, res, next) => {
    if (req.path === '/' && !req.secure) return res.redirect(`https://${req.headers.host.split(':')[0]}${req.url}`);
    next();
});
console.log(`Loaded 'redirect' using 'http -> https'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.use(exp.static('/dev/shm'));
console.log(`Loaded 'static' using '/dev/shm'`);

xxx.use('/static', exp.static(data_assets));
console.log(`Loaded 'static' using '/static -> ${data_assets}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const requestStatsManager = require('./server-functions-diagnostics');
requestStatsManager().setup(xxx);
console.log(`Loaded 'diagnostics' on '/requests'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const http = require('http');
const https = require('https');
const httpsServer = https.createServer(credentials, xxx);
const httpServer = http.createServer(xxx);
const socket = require('socket.io')(httpsServer);
console.log(`Loaded 'socket_io' using 'https'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const { formatInTimeZone } = require('date-fns-tz');
const getTimestamp = (tz) => formatInTimeZone(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX'Z'").replace(":00'Z", 'Z');

const variablesSet = {};
function variablesGet() {
    return variablesSet;
}
function variablesRender() {
    return Object.fromEntries(vars.map((topic) => [topic, variablesSet[topic]]));
}
function variablesUpdate(topic, message) {
    if (topic.startsWith('sensors')) variablesSet[topic] = { value: message.toString(), timestamp: getTimestamp(conf.TZ) };
    else if (topic.startsWith('weather')) variablesSet[topic] = { ...JSON.parse(message.toString()), timestamp: getTimestamp(conf.TZ) };
    else return;
    if (vars.includes(topic)) {
        console.log(`variables: '${topic}' --> '${JSON.stringify(variablesSet[topic])}'`);
        socket.emit('update', variablesRender());
    }
}
console.log(`Loaded 'variables' using '${vars.join(', ')}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt_client = require('mqtt').connect(conf.MQTT, {
    clientId: 'server-http-' + Math.random().toString(16).substring(2, 8),
});
mqtt_client.on('connect', () =>
    mqtt_client.subscribe(subs, () => {
        console.log(`mqtt connected & subscribed for '${subs}'`);
    })
);
mqtt_client.on('message', (topic, message) => {
    if (topic === 'snapshots/imagedata') snapshotReceiveImagedata(message);
    else if (topic === 'snapshots/metadata') snapshotReceiveMetadata(message);
    else variablesUpdate(topic, message);
});
console.log(`Loaded 'mqtt:subscriber' using '${conf.MQTT}'`);

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

const snapshotsTime = (24 * 2 + 2) * 60 * 60; // 2 days + 2 hours, in seconds
const snapshotsDir__ = conf.STORAGE + '/snapshots';
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
async function snapshotLoad() {
    try {
        await fs.promises.mkdir(snapshotsDir__, { recursive: true });
        const files = await fs.promises.readdir(snapshotsDir__);
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
async function snapshotRebuild() {
    if (snapshotsList__.length == 0) return;
    const intervals = [15, 30, 45, 60];
    const now = new Date();
    let oldestNeededTimestamp = null;
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
            try {
                const symlinkPath = `/dev/shm/snapshot_M${minutes}.jpg`;
                const sourcePath = path.join('/dev/shm', closest);
                if (minutes === 60) oldestNeededTimestamp = snapshotTimestampParser(closest);
                try {
                    fs.unlinkSync(symlinkPath);
                } catch (err) {
                    if (err.code !== 'ENOENT') console.error(`Error removing existing symlink for M${minutes}:`, err);
                }
                await fs.promises.symlink(sourcePath, symlinkPath);
                //console.log(`snapshot (M${minutes}): ${symlinkPath} -> ${sourcePath}`);
            } catch (err) {
                console.error(`Error creating symlink for snapshot(M${minutes}):`, err);
            }
        }
    }
    if (snapshotsList__.length > 0) {
        const symlinkPath = `/dev/shm/snapshot.jpg`;
        const sourcePath = path.join('/dev/shm', snapshotsList__[0]);
        try {
            try {
                fs.unlinkSync(symlinkPath);
            } catch (err) {
                if (err.code !== 'ENOENT') console.error(`Error removing existing symlink for current snapshot:`, err);
            }
            await fs.promises.symlink(sourcePath, symlinkPath);
            //console.log(`snapshot (current): ${symlinkPath} -> ${sourcePath}`);
        } catch (err) {
            console.error(`Error creating symlink for snapshot(current):`, err);
        }
    }
    if (oldestNeededTimestamp) {
        try {
            const files = await fs.promises.readdir('/dev/shm');
            for (const file of files) {
                if (file.match(/snapshot_\d{14}\.jpg/) && !file.startsWith('snapshot_M')) {
                    try {
                        const fileTime = snapshotTimestampParser(file);
                        if (fileTime && fileTime.getTime() < oldestNeededTimestamp.getTime() - 5 * 60 * 1000)
                            // Add 5-minute buffer to avoid removing files we might need
                            await fs.promises.unlink(path.join('/dev/shm', file));
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
async function snapshotCleanup() {
    try {
        const cleanupTime = new Date(new Date().getTime() - snapshotsTime * 1000);
        const files = await fs.promises.readdir(snapshotsDir__);
        for (const file of files) {
            if (file.startsWith('snapshot_')) {
                try {
                    const fileTime = snapshotTimestampParser(file);
                    if (fileTime && fileTime < cleanupTime) {
                        const filePath = path.join(snapshotsDir__, file);
                        await fs.promises.unlink(filePath);
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
async function snapshotUpdate() {
    snapshotRebuild();
    snapshotCleanup();
}
async function snapshotInitialise() {
    try {
        await snapshotLoad();
        snapshotUpdate();
        setInterval(snapshotUpdate, 30000);
        console.log('snapshot process started with frequency=30 seconds');
    } catch (error) {
        console.error('Failed to start snapshot process:', error);
        throw error;
    }
}
snapshotInitialise();

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
        if (additionalToRemove > 0) keysToRemove = keysToRemove.concat(sortedKeys.filter((key) => !keysToRemove.includes(key)).slice(0, additionalToRemove));
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
    const thumbnail = await sharp(sourcePath).resize(width).jpeg({ quality: 70 }).toBuffer();
    cacheInsert(cacheKey, thumbnail);
    return thumbnail;
}

//

xxx.get('/snapshot/list', function (req, res) {
    return res.render('server-snapshot-list', {
        entries: getSnapshotsListOfDates(),
    });
});
xxx.get('/snapshot/list/:date', function (req, res) {
    const date = req.params.date;
    return res.render('server-snapshot-date', {
        dateFormatted: getFormattedDate(date),
        entries: getSnapshotsListForDate(date),
    });
});
xxx.get('/snapshot/file/:file', function (req, res) {
    const file = req.params.file;
    const filename = getSnapshotsImageFilename(file);
    if (!filename) return res.status(404).send('Snapshot not found');
    return res.sendFile(filename);
});
xxx.get('/snapshot/thumb/:file', async (req, res) => {
    const file = req.params.file;
    const width = parseInt(req.query.w) || 200;
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
console.log(`Loaded 'snapshots' on '/snapshot', using 'thumbnail-cache-entries=${MAX_CACHE_ENTRIES}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const zlib = require('zlib');
const multer = require('multer');

const image_upload = multer({ dest: '/tmp' });
const image_dataType = (filename) => filename.match(/^([^_]+)/)?.[1] || '';
const image_dataVersion = (filename) => filename.match(/_v(\d+\.\d+\.\d+)/)?.[1] || '';
const image_dataCompress = (data) => zlib.deflateSync(data);
const image_dataManifest = (directory) =>
    Object.values(
        fs.readdirSync(directory).reduce((images, filename) => {
            const type = image_dataType(filename),
                version = image_dataVersion(filename);
            if (!images[type] || images[type].version < version) images[type] = { type, version, filename };
            return images;
        }, {})
    );

//

xxx.get('/images/images.json', async (req, res) => {
    const url_base = `http://${conf.HOST}:${conf.PORT}/images/`;
    const manifest = image_dataManifest(data_images).map(({ filename, ...rest }) => ({ ...rest, url: url_base + filename }));
    console.log(
        `/images manifest request: ${manifest.length} items, ${JSON.stringify(manifest).length} bytes, types = ${manifest.map((item) => item.type).join(', ')}, version = ${req.query.version || 'unspecified'}`
    );
    res.json(manifest);
});
xxx.put('/images', image_upload.single('image'), (req, res) => {
    if (!req.file) {
        console.error(`/images upload failed: file not provided`);
        return res.status(400).send('File not provided');
    }
    if (!req.file.originalname || !image_dataType(req.file.originalname) || !image_dataVersion(req.file.originalname)) {
        console.error(`/images upload failed: file has no name or has bad type/version (received '${req.file.originalname}')`);
        return res.status(400).send('File has no name or bad type/version');
    }
    if (fs.existsSync(path.join(data_images, req.file.originalname) + '.zz')) {
        console.error(`/images upload failed: file already exists as '${path.join(data_images, req.file.originalname)}'`);
        return res.status(409).send('File with this name already exists');
    }
    try {
        const uploadedName = req.file.originalname,
            uploadedData = fs.readFileSync(req.file.path);
        fs.unlinkSync(req.file.path);
        const compressedName = path.join(data_images, uploadedName) + '.zz',
            compressedData = image_dataCompress(uploadedData);
        fs.writeFileSync(compressedName, compressedData);
        console.log(
            `/images upload succeeded: '${uploadedName}' (${uploadedData.length} bytes) --> '${compressedName}' (${compressedData.length} bytes) [${req.headers['x-forwarded-for'] || req.connection.remoteAddress}]`
        );
        res.send('File uploaded, compressed, and saved successfully.');
    } catch (error) {
        console.error(`/images upload failed: error <<<${error}>>> [${req.headers['x-forwarded-for'] || req.connection.remoteAddress}]`);
        res.status(500).send('File upload error');
    }
});
xxx.get('/images/:filename', (req, res) => {
    const downloadName = req.params.filename,
        downloadPath = path.join(data_images, downloadName);
    try {
        res.set('Content-Type', 'application/octet-stream');
        res.send(fs.readFileSync(downloadPath));
        console.log(`/images download succeeded: ${downloadName} (${downloadPath})`);
    } catch (error) {
        console.error(`/images download failed: ${downloadName} (${downloadPath}), error <<<${error}>>>`);
        res.status(404).send('File not found');
    }
});
console.log(`Loaded 'images' on '/images'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.get('/sets', (req, res) => {
    const { mac } = req.query;
    if (!mac) {
        console.error(`/sets request failed: no mac address provided`);
        return res.status(400).json({ error: 'MAC address required' });
    }
    try {
        const sets = JSON.parse(fs.readFileSync(path.join(__dirname, 'client.json'), 'utf8'));
        if (!sets[mac]) {
            console.log(`/sets request failed: no client for ${mac}`);
            return res.status(404).json({ error: 'MAC address unknown' });
        }
        res.json(sets[mac]);
        console.log(`/sets request succeeded: ${mac}`);
    } catch (error) {
        console.error(`/sets request failed: error reading client file, error <<${error}>>`);
        res.status(500).json({ error: 'Internal server error' });
    }
});
console.log(`Loaded 'sets' on '/sets'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.get('/vars', function (req, res) {
    console.log(`/vars requested from '${req.headers['x-forwarded-for'] || req.connection.remoteAddress}'`);
    res.json(variablesGet());
});
console.log(`Loaded 'vars' on '/vars'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.get('/', function (req, res) {
    res.render('server-mainview', {
        vars: variablesRender(),
    });
});
console.log(`Loaded '/' using 'server-mainview'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.use(function (req, res) {
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.error(`[${new Date().toISOString()}] 404 Not Found: ${req.method} ${req.url} from ${clientIP}`);
    console.error(`  User-Agent: ${req.headers['user-agent']}`);
    console.error(`  Referrer: ${req.headers['referer'] || 'none'}`);
    console.error(`  Route path: ${req.path}`);
    res.status(404).send('not found');
});

httpServer.listen(80, function () {
    console.log(`Loaded 'http' using 'port=${httpServer.address().port}'`);
});
httpsServer.listen(443, function () {
    console.log(`Loaded 'https' using 'port=${httpsServer.address().port}'`);
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
