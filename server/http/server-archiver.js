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
const data_views = conf.DATA + '/http';
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

xxx.use('/static', exp.static(data_assets));
console.log(`Loaded 'static' using '/static -> ${data_assets}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const server_diagnostics = require('./server-functions-diagnostics')(xxx, '/diagnostics');
console.log(`Loaded 'diagnostics' on '/diagnostics'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const { SnapshotThumbnailsManager, SnapshotDirectoryManager, SnapshotContentsManager, SnapshotTimelapseManager } = require('./server-functions-snapshot.js');
const snapshotThumbnailsCacheSize = 2048;
const snapshotThumbnailsCacheTtl = 60 * 60 * 1000;
const snapshotThumbnailsWidthDefault = 200;
const snapshotDirectory = conf.STORAGE + '/snapshots';
const timelapseDirectory = conf.STORAGE + '/timelapse';

//

const sharp = require('sharp');
const crypto = require('crypto');

function getFormattedDate(date) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (!date || date.length < 8) return 'Invalid date';
    return `${date.substring(0, 4)} ${months[parseInt(date.substring(4, 6)) - 1]} ${parseInt(date.substring(6, 8))}`;
}
function getFormattedTime(time) {
    if (!time || time.length < 6) return 'Invalid time';
    return `${parseInt(time.substring(0, 2)).toString().padStart(2, '0')}:${parseInt(time.substring(2, 4)).toString().padStart(2, '0')}:${parseInt(time.substring(4, 6)).toString().padStart(2, '0')}`;
}
function getThumbnailKey(file, width) {
    const mtime = fs.statSync(file).mtime.getTime();
    return crypto.createHash('md5').update(`${file}-${width}-${mtime}`).digest('hex');
}

const snapshotThumbnailsManager = new SnapshotThumbnailsManager({
    maxEntries: snapshotThumbnailsCacheSize,
    ttl: snapshotThumbnailsCacheTtl,
});
const snapshotDirectoryManager = new SnapshotDirectoryManager({
    directory: snapshotDirectory,
});
const snapshotContentsManager = new SnapshotContentsManager({
    directory: snapshotDirectory,
});
const snapshotTimelapseManager = new SnapshotTimelapseManager({
    directory: timelapseDirectory,
});
process.on('SIGTERM', () => {
    snapshotDirectoryManager.dispose();
    snapshotContentsManager.dispose();
    snapshotThumbnailsManager.dispose();
    snapshotTimelapseManager.dispose();
});

//

function getSnapshotListOfDates() {
    return {
        entries: snapshotDirectoryManager.getListOfDates().map(({ dateCode }) => ({ dateCode, dateFormatted: getFormattedDate(dateCode) })),
    };
}
function getSnapshotListForDate(date) {
    return {
        dateFormatted: getFormattedDate(date),
        entries: snapshotContentsManager.getListForDate(date).map(({ file }) => ({ file, timeFormatted: getFormattedTime(file.slice(17, 23)) })),
    };
}
function getTimelapseListOfFiles() {
    return {
        entries: snapshotTimelapseManager.getListOfFiles().map(({ file }) => ({ file, dateFormatted: getFormattedDate(file.slice(10, 18)) })),
    };
}
function getSnapshotImageFilename(file) {
    const match = file.match(/snapshot_(\d{8})\d{6}\.jpg$/);
    if (!match?.[1]) return undefined;
    const date = match[1];
    const filePath = path.join(snapshotDirectory, date, file);
    if (!fs.existsSync(filePath)) return null;
    return filePath;
}

async function getSnapshotImageThumbnail(file, width) {
    const match = file.match(/snapshot_(\d{8})\d{6}\.jpg/);
    if (!match?.[1]) return null;
    const dateDir = match[1];
    const filePath = path.join(snapshotDirectory, dateDir, file);
    if (!fs.existsSync(filePath)) return null;
    const key = getThumbnailKey(filePath, width);
    let thumbnail = snapshotThumbnailsManager.retrieve(key);
    if (!thumbnail) {
        thumbnail = await sharp(filePath).resize(width).jpeg({ quality: 70 }).toBuffer();
        snapshotThumbnailsManager.insert(key, thumbnail);
    }
    return thumbnail;
}

function getTimelpaseVideoFilename(file) {
    const match = file.match(/timelapse_(\d{8})\.mp4$/);
    if (!match?.[1]) return undefined;
    const filePath = path.join(timelapseDirectory, file);
    if (!fs.existsSync(filePath)) return null;
    return filePath;
}

//

xxx.get('/snapshot/list', (req, res) => {
    return res.render('server-snapshot-list', {
        snapshotList: getSnapshotListOfDates(),
        timelapseList: getTimelapseListOfFiles(),
    });
});
xxx.get('/snapshot/list/:date', (req, res) => {
    return res.render('server-snapshot-date', getSnapshotListForDate(req.params.date));
});
xxx.get('/snapshot/file/:file', (req, res) => {
    const file = req.params.file;
    const filename = getSnapshotImageFilename(file);
    if (!filename) return res.status(404).send('Snapshot not found');
    return res.sendFile(filename);
});
xxx.get('/timelapse/file/:file', (req, res) => {
    const file = req.params.file;
    const filename = getTimelpaseVideoFilename(file);
    if (!filename) return res.status(404).send('Timelapse not found');
    return res.sendFile(filename);
});
xxx.get('/snapshot/thumb/:file', async (req, res) => {
    const file = req.params.file;
    const width = parseInt(req.query.w) || snapshotThumbnailsWidthDefault;
    try {
        const imagedata = await getSnapshotImageThumbnail(file, width);
        if (!imagedata) return res.status(404).send('Thumbnail not found');
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=300');
        return res.send(imagedata);
    } catch (error) {
        console.error('Error generating thumbnail:', error);
        return res.status(500).send('Error generating thumbnail');
    }
});

console.log(`Loaded 'snapshots' on '/snapshot', using 'thumbnail-cache-entries=${snapshotThumbnailsCacheSize}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.get('/', (req, res) => {
    return res.redirect('/snapshot/list');
});
console.log(`Loaded '/' using '/snapshot/list'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.use((req, res) => {
    console.error(
        `[${new Date().toISOString()}] 404 Not Found: ${req.method} ${req.url} from ${req.headers['x-forwarded-for'] || req.connection.remoteAddress}`
    );
    console.error(`  User-Agent: ${req.headers['user-agent']}`);
    console.error(`  Referrer: ${req.headers['referer'] || 'none'}`);
    console.error(`  Route path: ${req.path}`);
    res.status(404).send('not found');
});

const httpServer = require('http').createServer(xxx);
httpServer.listen(80, () => {
    console.log(`Loaded 'http' using 'port=${httpServer.address().port}'`);
});
const httpsServer = require('https').createServer(credentials, xxx);
httpsServer.listen(443, () => {
    console.log(`Loaded 'https' using 'port=${httpsServer.address().port}'`);
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
