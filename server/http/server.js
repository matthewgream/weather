#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function loadConfig(configPath) {
    try {
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

const configPath = path.join(__dirname, 'secrets.txt');
const conf = loadConfig(configPath);
const name = 'weather_server';
const fqdn = conf.FQDN;
const host = conf.HOST;
const port = conf.PORT;
const data = conf.DATA;
const logs = conf.LOGS;
const data_views = data + '/http';
const data_images = data + '/images';
const data_assets = data + '/assets';
const subs = ['weather/#'];
console.log(`Loaded 'config' using ${configPath}`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const letsencrypt = `/etc/letsencrypt/live/${fqdn}`;
const privateKey = fs.readFileSync(`${letsencrypt}/privkey.pem`, 'utf8');
const certificate = fs.readFileSync(`${letsencrypt}/cert.pem`, 'utf8');
const ca = fs.readFileSync(`${letsencrypt}/chain.pem`, 'utf8');
const credentials = {
    key: privateKey,
    cert: certificate,
    ca
};
console.log(`Loaded 'certificates' using ${letsencrypt}`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const exp = require('express');
const xxx = exp();
xxx.set('view engine', 'ejs');
xxx.set('views', data_views);
console.log(`Loaded 'EJS' using ${data_views}`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.use((req, res, next) => {
    if (req.path === '/' && !req.secure)
        return res.redirect(`https://${req.headers.host.split(':')[0]}${req.url}`);
    next();
});
console.log(`Loaded 'http -> https'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const http = require('http');
const https = require('https');
const httpsServer = https.createServer(credentials, xxx);
const httpServer = http.createServer(xxx);
const socket = require('socket.io')(httpsServer);
console.log(`Loaded 'socket_io' using https`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const { formatInTimeZone } = require('date-fns-tz');
const mqtt_content = {};
const mqtt_client = require('mqtt').connect('mqtt://localhost');
mqtt_client.on('connect', () => mqtt_client.subscribe(subs, () => {
    console.log(`mqtt connected & subscribed for '${subs}'`);
}));
mqtt_client.on('message', (topic, message) => {
    mqtt_content[topic] = { ...JSON.parse(message.toString()), timestamp: formatInTimeZone(new Date(), conf.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX'Z'").replace(":00'Z", 'Z') };
    if (topic == 'weather/branna') {
        console.log(`mqtt message received on '${topic}' with '${JSON.stringify(mqtt_content[topic])}'`);
        socket.emit('update', { [topic]: mqtt_content[topic] });
    }
});
console.log(`Loaded 'mqtt_subscriber' using 'mqtt:://localhost' for 'weather/branna'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

/* broken ...
xxx.use(require('express-status-monitor')({ 
    websocket: socket,
    port: 8080
}));
console.log (`Loaded 'express-status-monitor' on /status`);
*/

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const morgan = require('morgan');
const FileStreamRotator = require('file-stream-rotator');
const logsDir = logs;
fs.existsSync(logsDir) || fs.mkdirSync(logsDir);
const accessLogStream = FileStreamRotator.getStream({
    date_format: 'YYYY-MM-DD',
    filename: path.join(logsDir, 'access-%DATE%.log'),
    frequency: 'daily',
    verbose: false,
    size: '1M',
    max_logs: 10,
    audit_file: path.join(logsDir, 'audit.json'),
    end_stream: false
});
xxx.use(morgan('combined', { stream: accessLogStream }));
const requestStats = {
    totalRequests: 0,
    requestsByRoute: {},
    requestsByMethod: {},
    requestsByStatus: {},
    requestsByIp: {}
};
xxx.use((req, res, next) => {
    const originalEnd = res.end;
    requestStats.totalRequests++;
    requestStats.requestsByRoute[req.path] = (requestStats.requestsByRoute[req.path] || 0) + 1;
    requestStats.requestsByMethod[req.method] = (requestStats.requestsByMethod[req.method] || 0) + 1;
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    requestStats.requestsByIp[ip] = (requestStats.requestsByIp[ip] || 0) + 1;
    res.end = function (...args) {
        requestStats.requestsByStatus[res.statusCode] = (requestStats.requestsByStatus[res.statusCode] || 0) + 1;
        originalEnd.apply(res, args);
    };
    next();
});
xxx.get('/requests', (req, res) => {
    const files = fs.readdirSync(logsDir).filter(file => file.startsWith('access-'));
    const mostRecentLog = files.sort().pop();
    const recentLogs = mostRecentLog ? fs.readFileSync(path.join(logsDir, mostRecentLog), 'utf8').split('\n').filter(Boolean).slice(-100) : [];
    res.send(`
    <html>
      <head>
        <title>Server Stats</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1, h2 { color: #333; }
          .stats-container { display: flex; flex-wrap: wrap; }
          .stats-box { background: #f5f5f5; border-radius: 5px; padding: 15px; margin: 10px; min-width: 200px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
          tr:hover { background-color: #f1f1f1; }
          pre { background: #f8f8f8; border: 1px solid #ddd; border-radius: 3px; max-height: 500px; overflow: auto; padding: 10px; }
        </style>
      </head>
      <body>
        <div class="stats-container">
          <div class="stats-box">
            <h2>General</h2>
            <p>Total Requests: ${requestStats.totalRequests}</p>
          </div>
          <div class="stats-box">
            <h2>Routes</h2>
            <table>
              <tr><th>Path</th><th>Count</th></tr>
              ${Object.entries(requestStats.requestsByRoute)
            .sort((a, b) => b[1] - a[1])
            .map(([path, count]) => `<tr><td>${path}</td><td>${count}</td></tr>`)
            .join('')}
            </table>
          </div>
          <div class="stats-box">
            <h2>Methods</h2>
            <table>
              <tr><th>Method</th><th>Count</th></tr>
              ${Object.entries(requestStats.requestsByMethod)
            .map(([method, count]) => `<tr><td>${method}</td><td>${count}</td></tr>`)
            .join('')}
            </table>
          </div>
          <div class="stats-box">
            <h2>Status Codes</h2>
            <table>
              <tr><th>Status</th><th>Count</th></tr>
              ${Object.entries(requestStats.requestsByStatus)
            .map(([status, count]) => `<tr><td>${status}</td><td>${count}</td></tr>`)
            .join('')}
            </table>
          </div>
          <div class="stats-box">
            <h2>IP Addresses</h2>
            <table>
              <tr><th>IP</th><th>Count</th></tr>
              ${Object.entries(requestStats.requestsByIp)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([ip, count]) => `<tr><td>${ip}</td><td>${count}</td></tr>`)
            .join('')}
            </table>
          </div>
        </div>
        <h2>Recent Logs</h2>
        <pre>${recentLogs.join('\n')}</pre>
      </body>
    </html>
  `);
});
console.log(`Loaded 'morgan' on /requests using logs=${logsDir}`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.get('/', function (req, res) {
    res.render('server-mainview', { vars: { 'weather/branna': mqtt_content['weather/branna'] } });
});
console.log(`Loaded '/' using 'server-mainview' using vars='weather/branna'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.use(exp.static('/dev/shm'));
console.log(`Loaded 'static' using /dev/shm`);

xxx.use('/static', exp.static(data_assets));
console.log(`Loaded 'static' using /static -> ${data_assets}`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.get('/vars', function (req, res) {
    console.log(`/vars requested from '${req.headers['x-forwarded-for'] || req.connection.remoteAddress}'`);
    res.json(mqtt_content);
});
console.log(`Loaded 'vars/json' on /vars`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const snapshotsTime = (24 * 2 + 2) * 60 * 60; // 2 days + 2 hours, in seconds
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
    try {
        await fs.promises.mkdir(snapshotsDir__, { recursive: true });
        const files = await fs.promises.readdir(snapshotsDir__);
        snapshotsList__ = files
            .filter(file => file.match(/snapshot_\d{14}\.jpg/))
            .sort((a, b) => (snapshotTimestampParser(b) || 0) - (snapshotTimestampParser(a) || 0));
        console.log(`snapshot list loaded with ${snapshotsList__.length} existing files (with expiration of ${snapshotsTime / 60 / 60} hours)`);

    } catch (error) {
        console.error('Error loading snapshot list:', error);
        throw error;
    }
}
async function snapshotCapture() {
    try {
        const timestamp = (new Date()).toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '');
        const filename = `snapshot_${timestamp}.jpg`;
        const snapshotPath = path.join(snapshotsDir__, filename);
        const mainviewPath = '/dev/shm/snapshot.jpg';
        await new Promise((resolve, reject) => {
            require('child_process').exec(`ffmpeg -y -rtsp_transport tcp -i '${conf.RTSP}' -vframes 1 -q:v 7.5 -compression_level 9 "${snapshotPath}"`,
                (error) => {
                    if (error) reject(error);
                    else resolve();
                });
        });
        await fs.promises.copyFile(snapshotPath, mainviewPath);
        snapshotsList__.unshift(filename);
        console.log(`snapshot captured: ${filename}`);
    } catch (error) {
        console.error('Error capturing snapshot:', error);
    }
}
async function snapshotRebuild() {
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
                await fs.promises.copyFile(path.join(snapshotsDir__, closest), targetPath);
            } catch (err) {
                console.error(`Error creating snapshot for M${minutes}:`, err);
            }
        }
    }
}
async function snapshotCleanup() {
    try {
        const cleanupTime = new Date((new Date()).getTime() - snapshotsTime * 1000);
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
    await snapshotCapture();
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

const sharp = require('sharp');
const crypto = require('crypto');
const MAX_CACHE_ENTRIES = 50;
const thumbnailCache = {};
async function thumbnailLoad(width, filename, mtime) {
    const cacheKey = crypto.createHash('md5').update(`${filename}-${width}-${mtime}`).digest('hex');
    if (!thumbnailCache[cacheKey]) {
        thumbnailCache[cacheKey] = await sharp(sourcePath)
            .resize(width)
            .jpeg({ quality: 70 })
            .toBuffer();
        const cacheKeys = Object.keys(thumbnailCache);
        if (cacheKeys.length > MAX_CACHE_ENTRIES)
            cacheKeys.slice(0, cacheKeys.length - MAX_CACHE_ENTRIES)
                .forEach(key => delete thumbnailCache[key]);
    }
    return thumbnailCache[cacheKey];
}

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
        const sourcePath = `/dev/shm/${req.params.filename}`;
        if (!fs.existsSync(sourcePath))
            return res.status(404).send('Thumbnail not found');
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=300');
        return res.send(thumbnailLoad(parseInt(req.query.width) || 200, req.params.filename, fs.statSync(sourcePath).mtime.getTime()));
    } catch (error) {
        console.error('Error generating thumbnail:', error);
        res.status(500).send('Error generating thumbnail');
    }
});
console.log(`Loaded 'snapshots' on /snapshot, with thumbnail cache-entries=${MAX_CACHE_ENTRIES}`);

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
console.log(`Loaded 'images' on /images`);

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
console.log(`Loaded 'sets' on /sets`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.use(function (req, res) {
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.error(`[${new Date().toISOString()}] 404 Not Found: ${req.method} ${req.url} from ${clientIP}`);
    console.error(`  User-Agent: ${req.headers['user-agent']}`);
    console.error(`  Referrer: ${req.headers['referer'] || 'none'}`);
    console.error(`  Route path: ${req.path}`);
    res.status(404).send("not found");
});

httpServer.listen(80, function () {
    console.log(`Loaded 'http' on ${httpServer.address().port}`);
});
httpsServer.listen(443, function () {
    console.log(`Loaded 'https' on ${httpsServer.address().port}`);
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
