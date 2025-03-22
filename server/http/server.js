#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

function loadConfig() {
    try {
        const configPath = path.join(__dirname, 'secrets.txt');
        const vars = {};
        fs.readFileSync(configPath, 'utf8').split('\n').forEach(line => {
            const [key, value] = line.split('=').map(s => s.trim());
            if (key && value)
                vars[key] = value;
        });
        return vars;
    } catch (err) {
        console.warn('Could not load secrets.txt, using defaults');
        return {};
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const conf = loadConfig();

const name = 'weather_server';
const fqdn = conf.FQDN;
const host = conf.HOST;
const port = conf.PORT;
const data = conf.DATA;
const data_views = data + '/http';
const data_images = data + '/images';

const subs = ['weather/#'];

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const http = require('http');
const https = require('https');

const letsencrypt = `/etc/letsencrypt/live/${fqdn}`;
const privateKey = fs.readFileSync(`${letsencrypt}/privkey.pem`, 'utf8');
const certificate = fs.readFileSync(`${letsencrypt}/cert.pem`, 'utf8');
const ca = fs.readFileSync(`${letsencrypt}/chain.pem`, 'utf8');
const credentials = {
    key: privateKey,
    cert: certificate,
    ca: ca
};

const exp = require('express');
const xxx = exp();
xxx.set('view engine', 'ejs');
xxx.set('views', data_views);
xxx.use(require('express-minify-html')({
    override: true,
    exception_url: false,
    htmlMinifier: {
        removeComments: true,
        collapseWhitespace: true,
        collapseBooleanAttributes: true,
        removeAttributeQuotes: true,
        removeEmptyAttributes: true,
        minifyCSS: true,
        minifyJS: true,
        minifyURLs: true
    }
}));
xxx.use(exp.static('/dev/shm'));
xxx.use((req, res, next) => {
    if (req.path === '/' && !req.secure) {
        return res.redirect(`https://${req.headers.host.split(':')[0]}${req.url}`);
    }
    next();
});

const httpsServer = https.createServer(credentials, xxx);
const httpServer = http.createServer(xxx);
const socket = require('socket.io')(httpsServer);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const snapshotsTime = (24*2 + 2) * 60 * 60; // 2 days + 2 hours, in seconds
const snapshotsDir__ = '/opt/snapshots';
let snapshotsList__ = [];

function snapshotTimestampParser(filename) {
    const match = filename.match(/snapshot_(\d{14})\.jpg/);
    if (match && match[1]) {
        const timestampStr = match[1];
        const isoString = `${timestampStr.substring(0, 4)}-${timestampStr.substring(4, 6)}-${timestampStr.substring(6, 8)}T` +
            `${timestampStr.substring(8, 10)}:${timestampStr.substring(10, 12)}:${timestampStr.substring(12, 14)}.000Z`;
        return new Date(isoString);
    }
    return null;
}

async function snapshotLoad() {
    const fs_async = require('fs').promises;

    try {
        await fs_async.mkdir(snapshotsDir__, { recursive: true });
        const files = await fs_async.readdir(snapshotsDir__);
        snapshotsList__ = files
            .filter(file => file.match(/snapshot_\d{14}\.jpg/))
            .sort((a, b) => (snapshotTimestampParser(b) || 0) - (snapshotTimestampParser(a) || 0));
        console.log(`Loaded snapshot list with ${snapshotsList__.length} existing files (with expiration of ${snapshotsTime/60/60} hours)`);

    } catch (error) {
        console.error('Error loading snapshot list:', error);
        throw error;
    }
}

async function snapshotCapture() {
    const exec = require('child_process').exec;
    const fs_async = require('fs').promises;
    const path = require('path');

    try {
        const timestamp = (new Date()).toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '');
        const filename = `snapshot_${timestamp}.jpg`;
        const snapshotPath = path.join(snapshotsDir__, filename);
        const mainviewPath = '/dev/shm/snapshot.jpg';

        await new Promise((resolve, reject) => {
            exec(`ffmpeg -y -rtsp_transport tcp -i '${conf.RTSP}' -vframes 1 -q:v 7.5 -compression_level 9 "${snapshotPath}"`,
                (error) => {
                    if (error) reject(error);
                    else resolve();
                });
        });
        await fs_async.copyFile(snapshotPath, mainviewPath);
        snapshotsList__.unshift(filename);
        console.log(`Snapshot captured: ${filename}`);
    } catch (error) {
        console.error('Error capturing snapshot:', error);
    }
}

async function snapshotRebuild() {
    const fs_async = require('fs').promises;
    const path = require('path');

    if (snapshotsList__.length == 0)
        return;
    const intervals = [15, 30, 45, 60];
    for (const minutes of intervals) {
        const targetTime = new Date((new Date()).getTime() - minutes * 60 * 1000);
        const targetPath = `/dev/shm/snapshot_M${minutes}.jpg`;
        let closest = null;
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
                await fs_async.copyFile(path.join(snapshotsDir__, closest), targetPath);
                // console.log(`Created snapshot M${minutes} from ${closest}`);
            } catch (err) {
                console.error(`Error creating snapshot for M${minutes}:`, err);
            }
        }
    }
}

async function snapshotCleanup() {
    const fs_async = require('fs').promises;
    const path = require('path');

    try {
        const cleanupTime = new Date((new Date()).getTime() - snapshotsTime * 1000);
        const files = await fs_async.readdir(snapshotsDir__);
        for (const file of files) {
            if (file.startsWith('snapshot_')) {
                try {
                    const fileTime = snapshotTimestampParser(file);
                    if (fileTime && fileTime < cleanupTime) {
                        const filePath = path.join(snapshotsDir__, file);
                        await fs_async.unlink(filePath);
                        const index = snapshotsList__.indexOf(file);
                        if (index !== -1) {
                            console.log(`Snapshot removed: ${file}`);
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
    await snapshotCapture();
    snapshotRebuild();
    snapshotCleanup();
}

async function snapshotInitialise() {
    try {
        await snapshotLoad();
        snapshotUpdate();
        setInterval(snapshotUpdate, 30000);
    } catch (error) {
        console.error('Failed to start snapshot process:', error);
        throw error;
    }
}

snapshotInitialise();

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const { formatInTimeZone } = require('date-fns-tz');

const mqtt_content = {}, mqtt_client = require('mqtt').connect('mqtt://localhost');
mqtt_client.on('connect', () => mqtt_client.subscribe(subs, () => {
    console.log('mqtt connected & subscribed');
}));
mqtt_client.on('message', (topic, message) => {
    mqtt_content[topic] = { ...JSON.parse(message.toString()), timestamp: formatInTimeZone(new Date(), conf.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX'Z'").replace(":00'Z", 'Z') };
    if (topic == 'weather/branna')
        socket.emit('update', { [topic]: mqtt_content[topic] });
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.get('/', function (req, res) {
    res.render('server-mainview', { vars: { 'weather/branna': mqtt_content['weather/branna'] } });
});

xxx.get('/vars', function (req, res) {
    console.log(`/vars requested from '${req.headers['x-forwarded-for'] || req.connection.remoteAddress}'`);
    res.json(mqtt_content);
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const sharp = require('sharp');
const crypto = require('crypto');
const thumbnailCache = {};

xxx.get('/snapshot/list', function (req, res) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const formattedDates = [...new Set(snapshotsList__.map(file => file.slice(9, 17)))].sort((a, b) => b.localeCompare(a))
        .map(dateCode => ({
            dateCode,
            formattedDate: `${dateCode.substring(0, 4)} ${months[parseInt(dateCode.substring(4, 6)) - 1]} ${parseInt(dateCode.substring(6, 8))}`
        }));
    res.render('server-snapshot-list', {
        formattedDates
    });
});
xxx.get('/snapshot/list/:date', function (req, res) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dateStr = req.params.date;
    const formattedDate = `${dateStr.substring(0, 4)} ${months[parseInt(dateStr.substring(4, 6)) - 1]} ${parseInt(dateStr.substring(6, 8))}`;
    const snapshots = snapshotsList__
        .filter(file => file.slice(9, 17) === dateStr)
        .sort((a, b) => b.localeCompare(a))
        .map(filename => ({ filename, timeStr: filename.slice(17, 23) }))
        .map(({ filename, timeStr }) => ({
            filename,
            formattedTime: `${parseInt(timeStr.substring(0, 2)).toString().padStart(2, '0')}:${parseInt(timeStr.substring(2, 4)).toString().padStart(2, '0')}:${parseInt(timeStr.substring(4, 6)).toString().padStart(2, '0')}`
        }));
    res.render('server-snapshot-date', {
        formattedDate,
        snapshots
    });
});
xxx.get('/snapshot/file/:file', function (req, res) {
    if (snapshotsList__.includes(req.params.file))
        res.sendFile(`/opt/snapshots/${req.params.file}`);
    else
        res.status(404).send('Snapshot not found');
});
xxx.get('/snapshot/thumb/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const sourcePath = `/dev/shm/${filename}`;
        if (!fs.existsSync(sourcePath))
            return res.status(404).send('Image not found');
        const width = parseInt(req.query.width) || 200;
        const mtime = fs.statSync(sourcePath).mtime.getTime();
        const cacheKey = crypto.createHash('md5').update(`${filename}-${width}-${mtime}`).digest('hex');
        if (thumbnailCache[cacheKey]) {
            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=300');
            return res.send(thumbnailCache[cacheKey]);
        }
        const thumbnail = await sharp(sourcePath)
            .resize(width)
            .jpeg({ quality: 70 })
            .toBuffer();
        thumbnailCache[cacheKey] = thumbnail;
        const MAX_CACHE_ENTRIES = 50;
        const cacheKeys = Object.keys(thumbnailCache);
        if (cacheKeys.length > MAX_CACHE_ENTRIES)
            cacheKeys.slice(0, cacheKeys.length - MAX_CACHE_ENTRIES)
                .forEach(key => delete thumbnailCache[key]);
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=300');
        res.send(thumbnail);
    } catch (error) {
        console.error('Error generating thumbnail:', error);
        res.status(500).send('Error generating thumbnail');
    }
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const zlib = require('zlib');
const multer = require('multer');

const image_upload = multer({ dest: '/tmp' });
const image_dataType = (filename) => filename.match(/^([^_]+)/)?.[1] || '';
const image_dataVersion = (filename) => filename.match(/_v(\d+\.\d+\.\d+)/)?.[1] || '';
const image_dataCompress = (data) => zlib.deflateSync(data);
const image_dataManifest = (directory) => Object.values(fs.readdirSync(directory).reduce((images, filename) => {
    const type = image_dataType(filename), version = image_dataVersion(filename);
    if (!images[type] || images[type].version < version)
        images[type] = { type, version, filename };
    return images;
}, {}));

xxx.get('/images/images.json', async (req, res) => {
    const url_base = `http://${host}:${port}/images/`;
    const manifest = image_dataManifest(data_images).map(({ filename, ...rest }) => ({ ...rest, url: url_base + filename }));
    console.log(`/images manifest request: ${manifest.length} items, ${JSON.stringify(manifest).length} bytes, types = ${manifest.map(item => item.type).join(', ')}, version = ${req.query.version || 'unspecified'}`);
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
        const uploadedName = req.file.originalname, uploadedData = fs.readFileSync(req.file.path); fs.unlinkSync(req.file.path);
        const compressedName = path.join(data_images, uploadedName) + '.zz', compressedData = image_dataCompress(uploadedData);
        fs.writeFileSync(compressedName, compressedData);
        console.log(`/images upload succeeded: '${uploadedName}' (${uploadedData.length} bytes) --> '${compressedName}' (${compressedData.length} bytes) [${req.headers['x-forwarded-for'] || req.connection.remoteAddress}]`);
        res.send('File uploaded, compressed, and saved successfully.');
    } catch (error) {
        console.error(`/images upload failed: error <<<${error}>>> [${req.headers['x-forwarded-for'] || req.connection.remoteAddress}]`);
        res.status(500).send('File upload error');
    }
});
xxx.get('/images/:filename', (req, res) => {
    const downloadName = req.params.filename, downloadPath = path.join(data_images, downloadName);
    try {
        res.set('Content-Type', 'application/octet-stream');
        res.send(fs.readFileSync(downloadPath));
        console.log(`/images download succeeded: ${downloadName} (${downloadPath})`);
    } catch (error) {
        console.error(`/images download failed: ${downloadName} (${downloadPath}), error <<<${error}>>>`);
        res.status(404).send('File not found');
    }
});

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

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.use(function (req, res) {
    res.status(404).send("not found");
});
httpServer.listen(80, function () {
    console.log(`express http up for '${name}' ! -> ${httpServer.address().port}`);
});
httpsServer.listen(443, function () {
    console.log(`express https up for '${name}' ! -> ${httpsServer.address().port}`);
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
