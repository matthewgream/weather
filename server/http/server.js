#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require ('fs');
const path = require ('path');

function loadConfig () {
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

const conf = loadConfig ();

const name = 'weather_server';
const fqdn = conf.FQDN;
const host = conf.HOST;
const port = conf.PORT;
const data = conf.DATA;
const data_views = data + '/http';
const data_images = data + '/images';

const subs = [ 'weather/#' ];

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

const exp = require ('express');
const xxx = exp ();
xxx.set ('view engine', 'ejs');
xxx.set ('views', data_views);
xxx.use (require ('express-minify-html') ({
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
xxx.use (exp.static ('/dev/shm'));
xxx.use((req, res, next) => {
    if (req.path === '/' && !req.secure) {
        return res.redirect(`https://${req.headers.host.split(':')[0]}${req.url}`);
    }
    next();
});

const httpsServer = https.createServer(credentials, xxx);
const httpServer = http.createServer (xxx);
const socket = require ('socket.io') (httpsServer);

// -----------------------------------------------------------------------------------------------------------------------------------------

const snapshotsDir__ = '/opt/snapshots';

let snapshotsList__ = [];
function snapshotList() {
    return snapshotsList__;
}
async function snapshotListInitialise() {
    const fs_async = require('fs').promises;
    const path = require('path');
    try {

        await fs_async.mkdir(snapshotsDir__, { recursive: true });
        const files = await fs_async.readdir(snapshotsDir__);
        snapshotsList__ = files
            .filter(file => file.match(/snapshot_\d{14}\.jpg/))
            .sort((a, b) => {
                const timeA = snapshotTimestamp(a) || 0;
                const timeB = snapshotTimestamp(b) || 0;
                return timeB - timeA;
            });
        console.log(`Initialized snapshots list with ${snapshotsList__.length} existing files`);

        if (snapshotsList__.length > 0) {
            const currentTime = new Date();
            const intervals = [15, 30, 45, 60];
            for (const minutes of intervals) {
                const targetTime = new Date(currentTime.getTime() - minutes * 60 * 1000);
                const targetPath = `/dev/shm/snapshot_M${minutes}.jpg`;
                let closest = null;
                let closestDiff = Infinity;
                for (const file of snapshotsList__) {
					try {
                    	const fileTime = snapshotTimestamp(file);
                    	if (fileTime) {
                        	const diff = Math.abs(targetTime - fileTime);
                        	if (diff < closestDiff) {
                            	closestDiff = diff;
                            	closest = file;
                        	}
                    	}
                	} catch (err) {
                    	console.error(`Error comparing file ${file}:`, err);
                	}
				}
                if (closest) {
                    try {
                        await fs_async.copyFile(path.join(snapshotsDir__, closest), targetPath);
                        console.log(`Created initial M${minutes} snapshot from ${closest}`);
                    } catch (err) {
                        console.error(`Error creating snapshot for M${minutes}:`, err);
                    }
                }
            }
        }

    } catch (error) {
        console.error('Error initializing snapshots list:', error);
        throw error;
    }
}

async function snapshotInitialise() {
    try {
        await snapshotListInitialise();
        await snapshotUpdate();
        setInterval(snapshotUpdate, 30000);
    } catch (error) {
        console.error('Failed to start snapshot process:', error);
        throw error;
    }
}

async function snapshotUpdate() {
    const exec = require('child_process').exec;
    const fs_async = require('fs').promises;
    const path = require('path');
    
    try {
        const currentTime = new Date();
        const timestamp = currentTime.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', ''); 
        const filename = `snapshot_${timestamp}.jpg`;
        const snapshotPath = path.join(snapshotsDir__, filename);
        const currentPath = '/dev/shm/snapshot.jpg';
        
        await new Promise((resolve, reject) => {
            exec(`ffmpeg -y -rtsp_transport tcp -i '${conf.RTSP}' -vframes 1 -q:v 7.5 -compression_level 9 "${snapshotPath}"`,
                (error) => {
                    if (error) reject(error);
                    else resolve();
                });
        });
        await fs_async.copyFile(snapshotPath, currentPath);
        snapshotsList__.unshift(filename);

        const cleanupTime = new Date(currentTime.getTime() - 26 * 60 * 60 * 1000);
        const files = await fs_async.readdir(snapshotsDir__);
        for (const file of files) {
            if (file.startsWith('snapshot_')) {
                try {
                    const fileTime = snapshotTimestamp(file);
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
                    console.error(`Error processing file ${file}:`, err);
                }
            }
        }
        
        const intervals = [15, 30, 45, 60];
        for (const minutes of intervals) {
            const targetTime = new Date(currentTime.getTime() - minutes * 60 * 1000);
            const targetPath = `/dev/shm/snapshot_M${minutes}.jpg`;
            let closest = null;
            let closestDiff = Infinity;
            for (const file of snapshotsList__) {
                try {
                    const fileTime = snapshotTimestamp(file);
                    if (fileTime) {
                        const diff = Math.abs(targetTime - fileTime);
                        if (diff < closestDiff) {
                            closestDiff = diff;
                            closest = file;
                        }
                    }
                } catch (err) {
                    console.error(`Error comparing file ${file}:`, err);
                }
            }
            if (closest) {
                try {
                    await fs_async.copyFile(path.join(snapshotsDir__, closest), targetPath);
                } catch (err) {
                    console.error(`Error copying snapshot for M${minutes}:`, err);
                }
            }
        }

	    console.log(`Snapshot updated: ${filename}`);

    } catch (error) {
        console.error('Error updating snapshot:', error);
    }
}

function snapshotTimestamp(filename) {
    const match = filename.match(/snapshot_(\d{14})\.jpg/);
    if (match && match[1]) {
        const timestampStr = match[1];
        const isoString = `${timestampStr.substring(0, 4)}-${timestampStr.substring(4, 6)}-${timestampStr.substring(6, 8)}T` +
            `${timestampStr.substring(8, 10)}:${timestampStr.substring(10, 12)}:${timestampStr.substring(12, 14)}.000Z`;
        return new Date(isoString);
    }
    return null;
}

snapshotInitialise();

// -----------------------------------------------------------------------------------------------------------------------------------------

const { formatInTimeZone } = require('date-fns-tz');

const mqtt_content = {}, mqtt_client = require ('mqtt').connect ('mqtt://localhost');
mqtt_client.on ('connect', () => mqtt_client.subscribe (subs, () => {
    console.log ('mqtt connected & subscribed');
}));
mqtt_client.on ('message', (topic, message) => {
    mqtt_content [topic] = { ...JSON.parse (message.toString ()), timestamp: formatInTimeZone (new Date(), conf.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX'Z'").replace (":00'Z", 'Z') };
	if (topic == 'weather/branna')
    	socket.emit ('update', { [topic]: mqtt_content [topic] });
});

//

xxx.get ('/', function (req, res) {
    res.render ('server', { vars: { 'weather/branna': mqtt_content ['weather/branna'] } });
});

xxx.get ('/vars', function (req, res) {
    console.log (`/vars requested from '${req.headers ['x-forwarded-for'] || req.connection.remoteAddress}'`);
    res.json ( mqtt_content );
});

//

const sharp = require('sharp');
const crypto = require('crypto');
const thumbnailCache = {};

xxx.get('/snapshot/list', function (req, res) {
    const dates = [...new Set(snapshotsList__.map(file => file.slice(9, 17)))].sort((a, b) => b.localeCompare(a));
    const formattedDates = dates.map(dateStr => {
        const year = dateStr.substring(0, 4);
        const month = parseInt(dateStr.substring(4, 6));
        const day = parseInt(dateStr.substring(6, 8));
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = monthNames[month - 1]; // Convert 1-based month to 0-based index
        return {
            dateCode: dateStr,
            formatted: `${year} ${monthName} ${day}`
        };
    });
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Snapshots</title>
        <style>
            body {
                font-family: 'Inter', sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f0f4f8;
                color: #2d3748;
            }
            h1 {
                color: #4299e1;
                margin-bottom: 20px;
            }
            .date-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .date-item {
                background-color: white;
                padding: 12px 16px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .date-item a {
                color: #4299e1;
                text-decoration: none;
                font-weight: 500;
                display: block;
            }
            .date-item a:hover {
                text-decoration: underline;
            }
            .back-link {
                margin-top: 20px;
                display: inline-block;
                color: #4299e1;
            }
        </style>
    </head>
    <body>
        <h1>Snapshots</h1>
        <div class="date-list">
    `;
    formattedDates.forEach(date => {
        html += `<div class="date-item"><a href="/snapshot/list/${date.dateCode}">${date.formatted}</a></div>`;
    });
    html += `
        </div>
    </body>
    </html>
    `;
    res.send(html);
});
xxx.get('/snapshot/list/:date', function (req, res) {
    const dateCode = req.params.date;
    const year = dateCode.substring(0, 4);
    const month = parseInt(dateCode.substring(4, 6));
    const day = parseInt(dateCode.substring(6, 8));
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const formattedDate = `${year} ${monthNames[month - 1]} ${day}`;
    const files = snapshotsList__
        .filter(file => file.slice(9, 17) === dateCode)
        .sort((a, b) => b.localeCompare(a));
    const snapshots = files.map(file => {
        const timeStr = file.slice(17, 23);
        const hour = parseInt(timeStr.substring(0, 2));
        const minute = parseInt(timeStr.substring(2, 4));
        const second = parseInt(timeStr.substring(4, 6));
        const formattedTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
        return {
            filename: file,
            formattedTime: formattedTime
        };
    });
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Snapshots: ${formattedDate}</title>
        <style>
            body {
                font-family: 'Inter', sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f0f4f8;
                color: #2d3748;
            }
            h1 {
                color: #4299e1;
                margin-bottom: 20px;
            }
			.snapshot-container {
    			background-color: white;
    			padding: 16px;
    			border-radius: 8px;
    			box-shadow: 0 2px 4px rgba(0,0,0,0.1);
			}
			.snapshot-row {
    			padding: 3px 0;
    			display: flex;
    			align-items: center;
			}
            .snapshot-row:last-child {
                border-bottom: none;
            }
			.snapshot-time {
    			font-weight: 500;
    			min-width: 80px;
			}
            .snapshot-row a {
                color: #4299e1;
                text-decoration: none;
                margin-left: 16px;
            }
            .snapshot-row a:hover {
                text-decoration: underline;
            }
            .back-link {
                margin-top: 20px;
                display: inline-block;
                color: #4299e1;
                margin-right: 15px;
            }
        </style>
    </head>
    <body>
        <h1>Snapshots: ${formattedDate}</h1>
        <div class="snapshot-container">
    `;
    snapshots.forEach(snapshot => {
        html += `
            <div class="snapshot-row">
                <span class="snapshot-time">${snapshot.formattedTime}</span>
                <a href="/snapshot/file/${snapshot.filename}" target="_blank">View Image</a>
            </div>
        `;
    });
    html += `
        </div>
    </body>
    </html>
    `;
    res.send(html);
});
xxx.get ('/snapshot/file/:file', function (req, res) {
    if (snapshotsList__.includes (req.params.file))
        res.sendFile (`/opt/snapshots/${req.params.file}`);
    else
        res.status (404).send ('Snapshot not found');
});
xxx.get('/snapshot/thumb/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const width = parseInt(req.query.width) || 200;
        const sourcePath = `/dev/shm/${filename}`;
        if (!fs.existsSync(sourcePath))
            return res.status(404).send('Image not found');
        const stats = fs.statSync(sourcePath);
        const mtime = stats.mtime.getTime();
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
        if (cacheKeys.length > MAX_CACHE_ENTRIES) {
            const keysToRemove = cacheKeys.slice(0, cacheKeys.length - MAX_CACHE_ENTRIES);
            keysToRemove.forEach(key => delete thumbnailCache[key]);
        }
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=300');
        res.send(thumbnail);
    } catch (error) {
        console.error('Error generating thumbnail:', error);
        res.status(500).send('Error generating thumbnail');
    }
});

//

const zlib = require ('zlib');
const multer = require ('multer');

const image_upload = multer ({ dest: '/tmp' });
const image_dataType = (filename) => filename.match (/^([^_]+)/)?.[1] || '';
const image_dataVersion = (filename) => filename.match (/_v(\d+\.\d+\.\d+)/)?.[1] || '';
const image_dataCompress = (data) => zlib.deflateSync (data);
const image_dataManifest = (directory) => Object.values (fs.readdirSync (directory).reduce ((images, filename) => {
        const type = image_dataType (filename), version = image_dataVersion (filename);
        if (!images [type] || images [type].version < version)
            images [type] = { type, version, filename };
        return images;
    }, {}));

xxx.get ('/images/images.json', async (req, res) => {
    const url_base = `http://${host}:${port}/images/`;
    const manifest = image_dataManifest (data_images).map (({ filename, ...rest }) => ({ ...rest, url: url_base + filename }));
    console.log (`/images manifest request: ${manifest.length} items, ${JSON.stringify (manifest).length} bytes, types = ${manifest.map (item => item.type).join (', ')}, version = ${ req.query.version || 'unspecified'}`);
    res.json (manifest);
});
xxx.put ('/images', image_upload.single ('image'), (req, res) => {
    if (!req.file) {
        console.error (`/images upload failed: file not provided`);
        return res.status (400).send ('File not provided');
    }
    if (!req.file.originalname || !image_dataType (req.file.originalname) || !image_dataVersion (req.file.originalname)) {
        console.error (`/images upload failed: file has no name or has bad type/version (received '${req.file.originalname}')`);
        return res.status (400).send ('File has no name or bad type/version');
    }
    if (fs.existsSync (path.join (data_images, req.file.originalname) + '.zz')) {
        console.error (`/images upload failed: file already exists as '${path.join (data_images, req.file.originalname)}'`);
        return res.status (409).send ('File with this name already exists');
    }
    try {
        const uploadedName = req.file.originalname, uploadedData = fs.readFileSync (req.file.path); fs.unlinkSync (req.file.path);
        const compressedName = path.join (data_images, uploadedName) + '.zz', compressedData = image_dataCompress (uploadedData);
        fs.writeFileSync (compressedName, compressedData);
        console.log (`/images upload succeeded: '${uploadedName}' (${uploadedData.length} bytes) --> '${compressedName}' (${compressedData.length} bytes) [${req.headers ['x-forwarded-for'] || req.connection.remoteAddress}]`);
        res.send ('File uploaded, compressed, and saved successfully.');
    } catch (error) {
        console.error (`/images upload failed: error <<<${error}>>> [${req.headers ['x-forwarded-for'] || req.connection.remoteAddress}]`);
        res.status (500).send ('File upload error');
    }
});
xxx.get ('/images/:filename', (req, res) => {
    const downloadName = req.params.filename, downloadPath = path.join (data_images, downloadName);
    try {
        res.set ('Content-Type', 'application/octet-stream');
        res.send (fs.readFileSync (downloadPath));
        console.log (`/images download succeeded: ${downloadName} (${downloadPath})`);
    } catch (error) {
        console.error (`/images download failed: ${downloadName} (${downloadPath}), error <<<${error}>>>`);
        res.status (404).send ('File not found');
    }
});

//

xxx.get ('/sets', (req, res) => {
    const { mac } = req.query;
    if (!mac) {
        console.error (`/sets request failed: no mac address provided`);
        return res.status (400).json ({ error: 'MAC address required' });
    }
    try {
        const sets = JSON.parse (fs.readFileSync (path.join (__dirname, 'client.json'), 'utf8'));
        if (!sets [mac]) {
            console.log (`/sets request failed: no client for ${mac}`);
            return res.status (404).json ({ error: 'MAC address unknown' });
        }
        res.json (sets [mac]);
        console.log (`/sets request succeeded: ${mac}`);
    } catch (error) {
        console.error (`/sets request failed: error reading client file, error <<${error}>>`);
        res.status (500).json ({ error: 'Internal server error' });
    }
});

//

xxx.use (function (req, res) {
    res.status (404).send ("not found");
});
httpServer.listen(80, function() {
    console.log(`express http up for '${name}' ! -> ${httpServer.address().port}`);
});
httpsServer.listen(443, function() {
    console.log(`express https up for '${name}' ! -> ${httpsServer.address().port}`);
});


// -----------------------------------------------------------------------------------------------------------------------------------------

