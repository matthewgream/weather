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

//const http = require('http');
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

//const server = http.createServer (xxx);
const server = https.createServer(credentials, xxx);
const socket = require ('socket.io') (server);

// -----------------------------------------------------------------------------------------------------------------------------------------

async function updateSnapshot() {
	const exec = require('child_process').exec;
	const fs_async = require('fs').promises;
    const tempPath = '/dev/shm/snapshot_temp.jpg';
    const finalPath = '/dev/shm/snapshot.jpg';
    
    try {
        await new Promise((resolve, reject) => {
            exec(`ffmpeg -y -rtsp_transport tcp -i '${conf.RTSP}' -vframes 1 ${tempPath}`,
                (error) => {
                    if (error) reject(error);
                    else resolve();
                });
        });
        await fs_async.rename(tempPath, finalPath);
    } catch (error) {
        console.error('Error updating snapshot:', error);
        try {
            await fs_async.unlink(tempPath);
        } catch (e) {
        }
    }
}
updateSnapshot();
setInterval(updateSnapshot, 30000);

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
    res.json ({ mqtt_content });
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
server.listen (port, function () {
    const { family, address, port } = server.address ();
    console.log (`express up for '${name}' ! -> ${family}/${address}:${port} [${data}]`);
});

// -----------------------------------------------------------------------------------------------------------------------------------------

