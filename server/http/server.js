#!/usr/bin/env node

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

const credentials = require('./server-credentials.js')(conf.FQDN);
console.log(`Loaded 'certificates' using '${conf.FQDN}'`);

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

const server_diagnostics = require('./server-functions-diagnostics')(xxx, '/status_requests');
console.log(`Loaded 'diagnostics' on '/status_requests'`);

xxx.use(require('express-status-monitor')({ port: 8080, path: '/status_system' }));
console.log(`Loaded 'express-status-monitor' on '/status_system'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const { formatInTimeZone } = require('date-fns-tz');
const getTimestamp = (tz) => formatInTimeZone(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX'Z'").replace(":00'Z", 'Z');

const variablesSet = {};
function variablesRender() {
    return Object.fromEntries(vars.map((topic) => [topic, variablesSet[topic]]));
}
function variablesUpdate(topic, message) {
    if (topic.startsWith('sensors')) variablesSet[topic] = { value: message.toString(), timestamp: getTimestamp(conf.TZ) };
    else if (topic.startsWith('weather')) variablesSet[topic] = { ...JSON.parse(message.toString()), timestamp: getTimestamp(conf.TZ) };
    else return;
    if (vars.includes(topic)) console.log(`variables: '${topic}' --> '${JSON.stringify(variablesSet[topic])}'`);
}
function variablesInitialise(xxx) {
    xxx.get('/vars', (req, res) => {
        console.log(`/vars requested from '${req.headers['x-forwarded-for'] || req.connection.remoteAddress}'`);
        res.json(variablesSet);
    });
}
console.log(`Loaded 'variables' using '${vars.join(', ')}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const server_snapshots = require('./server-snapshot-mainview.js')(xxx, '/snapshot', conf.STORAGE);
console.log(`Loaded 'snapshots' on '/snapshot', using '${conf.STORAGE}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt_client = require('mqtt').connect(conf.MQTT, {
    clientId: 'server-http-' + Math.random().toString(16).substring(2, 8),
});
mqtt_client.on('connect', () => mqtt_client.subscribe(subs, () => console.log(`mqtt connected & subscribed for '${subs}'`)));
mqtt_client.on('message', (topic, message) => {
    if (topic === 'snapshots/imagedata') server_snapshots.receiveImagedata(message);
    else if (topic === 'snapshots/metadata') server_snapshots.receiveMetadata(message);
    else variablesUpdate(topic, message);
});
console.log(`Loaded 'mqtt:subscriber' using '${conf.MQTT}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

async function dataRender() {
    return {
        thumbnails: await server_snapshots.getThumbnails(),
    };
}
console.log(`Loaded 'data'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const server_images = require('./server-functions-images.js')(xxx, data_images, conf.HOST, conf.PORT);
console.log(`Loaded 'images' on '/images' using 'images=${data_images}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const server_sets = require('./server-functions-sets.js')(xxx, 'client.json', __dirname);
console.log(`Loaded 'sets' on '/sets' using 'source=${__dirname}/client.json'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const server_vars = variablesInitialise(xxx);
console.log(`Loaded 'vars' on '/vars'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.get('/', async (req, res) =>
    res.render('server-mainview', {
        vars: variablesRender(),
        data: await dataRender(),
    })
);
console.log(`Loaded '/' using 'server-mainview' && data/vars`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.use((req, res) => {
    const req_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.error(`[${new Date().toISOString()}] 404 Not Found: ${req.method} ${req.url} from ${req_ip}`);
    console.error(`  User-Agent: ${req.headers['user-agent']}`);
    console.error(`  Referrer: ${req.headers['referer'] || 'none'}`);
    console.error(`  Route path: ${req.path}`);
    res.status(404).send('not found');
});

const http = require('http');
const https = require('https');
const httpsServer = https.createServer(credentials, xxx);
const httpServer = http.createServer(xxx);

httpServer.listen(80, () => {
    console.log(`Loaded 'http' using 'port=${httpServer.address().port}'`);
});
httpsServer.listen(443, () => {
    console.log(`Loaded 'https' using 'port=${httpsServer.address().port}'`);
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
