#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function configLoad(configPath) {
    try {
        const items = {};
        fs.readFileSync(configPath, 'utf8')
            .split('\n')
            .forEach((line) => {
                const [key, value] = line.split('=').map((s) => s.trim());
                if (key && value) items[key] = value;
            });
        return items;
    } catch (err) {
        console.warn(`Could not load '${configPath}', using defaults (which may not work correctly)`);
        return {};
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const configPath = '/opt/weather/server/secrets.txt';
const conf = configLoad(configPath);
const data_views = conf.DATA + '/http';
const data_assets = conf.DATA + '/assets';
console.log(
    `Loaded 'config' using '${configPath}': ${Object.entries(conf)
        .map(([k, v]) => k.toLowerCase() + '=' + v)
        .join(', ')}`
);

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

const LOGS_INMEMORY_MAXSIZE = 8 * 1024 * 1024;
const LOGS_DISPLAY_DEFAULT = 100;

const morgan = require('morgan');
const memoryLogs = {
    logs: [],
    size: 0,
    maxSize: LOGS_INMEMORY_MAXSIZE,
    write: function (string) {
        this.logs.push(string);
        this.size += Buffer.byteLength(string, 'utf8');
        while (this.size > this.maxSize && this.logs.length > 0) this.size -= Buffer.byteLength(this.logs.shift(), 'utf8');
        return true;
    },
    getLogs: function () {
        return this.logs;
    },
};
const logStream = {
    write: function (string) {
        return memoryLogs.write(string);
    },
};
xxx.use(morgan('combined', { stream: logStream }));
const requestStats = {
    total: 0,
    byRoute: {},
    byMethod: {},
    byStatus: {},
    byIP: {},
};
xxx.use((req, res, next) => {
    const res_end = res.end;
    requestStats.total++;
    requestStats.byRoute[req.path] = (requestStats.byRoute[req.path] || 0) + 1;
    requestStats.byMethod[req.method] = (requestStats.byMethod[req.method] || 0) + 1;
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    requestStats.byIP[ip] = (requestStats.byIP[ip] || 0) + 1;
    res.end = function (...args) {
        requestStats.byStatus[res.statusCode] = (requestStats.byStatus[res.statusCode] || 0) + 1;
        res_end.apply(res, args);
    };
    next();
});
xxx.get('/requests', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit) : LOGS_DISPLAY_DEFAULT;
    const recentLogs = memoryLogs.getLogs().slice(-limit);
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
            <p>Total Requests: ${requestStats.total}</p>
          </div>
          <div class="stats-box">
            <h2>Routes</h2>
            <table>
              <tr><th>Path</th><th>Count</th></tr>
              ${Object.entries(requestStats.byRoute)
                  .sort((a, b) => b[1] - a[1])
                  .map(([path, count]) => `<tr><td>${path}</td><td>${count}</td></tr>`)
                  .join('')}
            </table>
          </div>
          <div class="stats-box">
            <h2>Methods</h2>
            <table>
              <tr><th>Method</th><th>Count</th></tr>
              ${Object.entries(requestStats.byMethod)
                  .map(([method, count]) => `<tr><td>${method}</td><td>${count}</td></tr>`)
                  .join('')}
            </table>
          </div>
          <div class="stats-box">
            <h2>Status Codes</h2>
            <table>
              <tr><th>Status</th><th>Count</th></tr>
              ${Object.entries(requestStats.byStatus)
                  .map(([status, count]) => `<tr><td>${status}</td><td>${count}</td></tr>`)
                  .join('')}
            </table>
          </div>
          <div class="stats-box">
            <h2>IP Addresses</h2>
            <table>
              <tr><th>IP</th><th>Count</th></tr>
              ${Object.entries(requestStats.byIP)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([ip, count]) => `<tr><td>${ip}</td><td>${count}</td></tr>`)
                  .join('')}
            </table>
          </div>
        </div>
    	  <h2>Recent Logs (${recentLogs.length})</h2>
    	  <pre>
		    ${recentLogs.join('')}
          </pre>
      </body>
    </html>
  `);
});
console.log(`Loaded 'morgan' on '/requests' using 'in-memory-logs-maxsize=${LOGS_INMEMORY_MAXSIZE}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.use('/static', exp.static(data_assets));
console.log(`Loaded 'static' using '/static -> ${data_assets}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const sharp = require('sharp');
const crypto = require('crypto');

const snapshotsDir__ = conf.STORAGE + '/snapshots';

const cacheEntries = {};
const MAX_CACHE_ENTRIES = 2048;
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

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getFormattedDate(date) {
    return `${date.substring(0, 4)} ${months[parseInt(date.substring(4, 6)) - 1]} ${parseInt(date.substring(6, 8))}`;
}
function getFormattedTime(time) {
    return `${parseInt(time.substring(0, 2)).toString().padStart(2, '0')}:${parseInt(time.substring(2, 4)).toString().padStart(2, '0')}:${parseInt(time.substring(4, 6)).toString().padStart(2, '0')}`;
}

function getSnapshotsListOfDates() {
    try {
        const dates = fs
            .readdirSync(snapshotsDir__)
            .filter((item) => fs.statSync(path.join(snapshotsDir__, item)).isDirectory() && /^\d{8}$/.test(item))
            .sort((a, b) => b.localeCompare(a))
            .map((dateCode) => ({
                dateCode,
                dateFormatted: getFormattedDate(dateCode),
            }));
        return dates;
    } catch (error) {
        console.error('Error reading snapshot dates:', error);
        return [];
    }
}

function getSnapshotsListForDate(date) {
    try {
        const dateDir = path.join(snapshotsDir__, date);
        return !fs.existsSync(dateDir)
            ? []
            : fs
                  .readdirSync(dateDir)
                  .filter((file) => file.startsWith('snapshot_') && file.endsWith('.jpg'))
                  .sort((a, b) => b.localeCompare(a))
                  .map((file) => {
                      const timeCode = file.slice(17, 23); // Extract time portion from filename
                      return {
                          file,
                          timeFormatted: getFormattedTime(timeCode),
                      };
                  });
    } catch (error) {
        console.error(`Error reading snapshots for date ${date}:`, error);
        return [];
    }
}

function getSnapshotsImageFilename(file) {
    const match = file.match(/snapshot_(\d{8})\d{6}\.jpg/);
    if (!match || !match[1]) return undefined;
    const dateDir = match[1];
    const filePath = path.join(snapshotsDir__, dateDir, file);
    if (!fs.existsSync(filePath)) return null;
    return filePath;
}

async function getSnapshotsImageThumbnail(file, width) {
    const match = file.match(/snapshot_(\d{8})\d{6}\.jpg/);
    if (!match || !match[1]) return null;
    const dateDir = match[1];
    const filePath = path.join(snapshotsDir__, dateDir, file);
    if (!fs.existsSync(filePath)) return null;
    const mtime = fs.statSync(filePath).mtime.getTime();
    const cacheKey = crypto.createHash('md5').update(`${file}-${width}-${mtime}`).digest('hex');
    const cachedThumbnail = cacheRetreive(cacheKey);
    if (cachedThumbnail) return cachedThumbnail;
    const thumbnail = await sharp(filePath).resize(width).jpeg({ quality: 70 }).toBuffer();
    cacheInsert(cacheKey, thumbnail);
    return thumbnail;
}

xxx.get('/', function (req, res) {
    return res.redirect('/snapshot/list');
});

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
    if (filename == null) return res.status(404).send('Snapshot not found');
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

xxx.use(function (req, res) {
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.error(`[${new Date().toISOString()}] 404 Not Found: ${req.method} ${req.url} from ${clientIP}`);
    console.error(`  User-Agent: ${req.headers['user-agent']}`);
    console.error(`  Referrer: ${req.headers['referer'] || 'none'}`);
    console.error(`  Route path: ${req.path}`);
    res.status(404).send('not found');
});

const httpServer = require('http').createServer(xxx);
httpServer.listen(80, function () {
    console.log(`Loaded 'http' using 'port=${httpServer.address().port}'`);
});
const httpsServer = require('https').createServer(credentials, xxx);
httpsServer.listen(443, function () {
    console.log(`Loaded 'https' using 'port=${httpsServer.address().port}'`);
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
