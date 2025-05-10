#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const configPath = process.argv[2] || 'secrets.txt';
const configData = require('./server-functions-config.js')(configPath);
const configList = Object.entries(configData)
    .map(([k, v]) => k.toLowerCase() + '=' + v)
    .join(', ');
configData.CONTENT_DATA_SUBS = ['weather/#', 'sensors/#', 'snapshots/#'];
configData.CONTENT_VIEW_VARS = ['weather/branna', 'sensors/radiation'];
configData.DIAGNOSTICS_PUBLISH_TOPIC = 'server/mainview';
configData.DIAGNOSTICS_PUBLISH_PERIOD = 60;
configData.DATA_VIEWS = configData.DATA + '/http';
configData.DATA_ASSETS = configData.DATA + '/assets';
configData.DATA_IMAGES = configData.DATA + '/images';
configData.DATA_CACHE = '/dev/shm/weather';
configData.FILE_SETS = require('path').join(__dirname, 'client.json');
console.log(`Loaded 'config' using '${configPath}': ${configList}`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const exp = require('express');
const app = exp();
app.set('view engine', 'ejs');
app.set('views', configData.DATA_VIEWS);
console.log(`Loaded 'express' using 'ejs=${configData.DATA_VIEWS}'`);

app.use((req, res, next) => {
    if (req.path === '/' && !req.secure) return res.redirect(`https://${req.headers.host.split(':')[0]}${req.url}`);
    next();
});
console.log(`Loaded 'redirect' using 'http -> https'`);

const credentials = require('./server-functions-credentials.js')(configData.FQDN);
console.log(`Loaded 'credentials' using '${configData.FQDN}'`);

const diagnostics = require('./server-functions-diagnostics')(app, { port: 8080, path: '/status' }); // XXX PORT_EXTERNAL
console.log(`Loaded 'diagnostics' on '/status'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
fs.existsSync(configData.DATA_CACHE) || fs.mkdirSync(configData.DATA_CACHE, { recursive: true });
app.use(exp.static(configData.DATA_CACHE));
console.log(`Loaded 'static' using '${configData.DATA_CACHE}'`);
app.use('/static', exp.static(configData.DATA_ASSETS));
console.log(`Loaded 'static' using '/static -> ${configData.DATA_ASSETS}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

require('./server-functions-images.js')(app, '/images', { directory: configData.DATA_IMAGES, location: `http://${configData.HOST}:${configData.PORT}` });
console.log(`Loaded 'images' on '/images' using 'directory=${configData.DATA_IMAGES}'`);
require('./server-functions-sets.js')(app, '/sets', { filename: configData.FILE_SETS });
console.log(`Loaded 'sets' on '/sets' using 'filename=${configData.FILE_SETS}`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const server_snapshots = require('./server-functions-snapshot-mainview.js')(app, '/snapshot', {
    directory: configData.DATA_CACHE,
    server: configData.SERVER_ARCHIVER,
});
console.log(`Loaded 'snapshots' on '/snapshot' using 'directory=${configData.DATA_CACHE}, server=${configData.SERVER_ARCHIVER}'`);

const server_data = {
    render: async function () {
        return {
            thumbnails: await server_snapshots.getThumbnails(),
        };
    },
};
console.log(`Loaded 'data' using 'data=thumbnails'`);
const server_vars = require('./server-functions-vars.js')(app, '/vars', { vars: configData.CONTENT_VIEW_VARS, tz: configData.TZ });
console.log(`Loaded 'vars' on '/vars' using 'vars=[${configData.CONTENT_VIEW_VARS.join(', ')}]'`);

app.get('/', async (req, res) =>
    res.render('server-mainview', {
        vars: server_vars.render(),
        data: await server_data.render(),
    })
);
console.log(`Loaded '/' using 'server-mainview' && data/vars`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let __snapshotImagedata = null;
function receive_snapshotImagedata(message) {
    __snapshotImagedata = message;
}
function receive_snapshotMetadata(message) {
    if (!__snapshotImagedata) console.error('Received snapshot metadata but no image data is available');
    else {
        try {
            server_snapshots.insert(`snapshot_${JSON.parse(message.toString()).time}.jpg`, __snapshotImagedata);
        } catch (error) {
            console.error('Error processing snapshot metadata:', error);
        }
        __snapshotImagedata = null;
    }
}
const mqtt_client = require('mqtt').connect(configData.MQTT, {
    clientId: 'server-mainview-http-' + Math.random().toString(16).substring(2, 8),
});
mqtt_client.on('connect', () =>
    mqtt_client.subscribe(configData.CONTENT_DATA_SUBS, () => console.log(`mqtt connected & subscribed for '${configData.CONTENT_DATA_SUBS}'`))
);
mqtt_client.on('message', (topic, message) => {
    if (topic === 'snapshots/imagedata') receive_snapshotImagedata(message);
    else if (topic === 'snapshots/metadata') receive_snapshotMetadata(message);
    else server_vars.update(topic, message);
});
console.log(`Loaded 'mqtt:subscriber' using 'server=${configData.MQTT}, topics=[${configData.CONTENT_DATA_SUBS.join(', ')}]'`);

setInterval(() => {
    mqtt_client.publish(configData.DIAGNOSTICS_PUBLISH_TOPIC, JSON.stringify(diagnostics.getPublishableStats()));
}, configData.DIAGNOSTICS_PUBLISH_PERIOD * 1000);
console.log(`Loaded 'mqtt:publisher' using 'topic=${configData.DIAGNOSTICS_PUBLISH_TOPIC}, period=${configData.DIAGNOSTICS_PUBLISH_PERIOD}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

app.use((req, res) => {
    const req_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.error(`[${new Date().toISOString()}] 404 Not Found: ${req.method} ${req.url} from ${req_ip}`);
    console.error(`  User-Agent: ${req.headers['user-agent']}`);
    console.error(`  Referrer: ${req.headers['referer'] || 'none'}`);
    console.error(`  Route path: ${req.path}`);
    res.status(404).send('not found');
});

const httpServer = require('http').createServer(app);
const httpsServer = require('https').createServer(credentials, app);
httpServer.listen(80, () => {
    console.log(`Loaded 'http' using 'port=${httpServer.address().port}'`);
});
httpsServer.listen(443, () => {
    console.log(`Loaded 'https' using 'port=${httpsServer.address().port}'`);
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
