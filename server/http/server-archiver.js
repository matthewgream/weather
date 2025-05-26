#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const path = require('path');

const configPath = process.argv[2] || 'secrets.txt';
const configData = require('./server-function-config.js')(configPath);
const configList = Object.entries(configData)
    .map(([k, v]) => k.toLowerCase() + '=' + v)
    .join(', ');
configData.DIAGNOSTICS_PUBLISH_TOPIC = 'server/archiver';
configData.DIAGNOSTICS_PUBLISH_PERIOD = 60;
configData.DATA_VIEWS = path.join(configData.DATA, 'http');
configData.DATA_ASSETS = path.join(configData.DATA, 'assets');
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

const credentials = require('./server-function-credentials.js')(configData.FQDN);
console.log(`Loaded 'credentials' using '${configData.FQDN}'`);

const diagnostics = require('./server-function-diagnostics.js')(app, { port: 80, path: '/status' }); // XXX PORT_EXTERNAL
console.log(`Loaded 'diagnostics' on '/status'`);

require('./server-function-authentication.js')(app, { type: 'basic', basic: { user: '', pass: configData.PASS } });
console.log(`Loaded 'authentication' using 'type=basic, pass=${configData.PASS}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const cache_static = require('./server-function-cache.js')({
    directory: configData.DATA_ASSETS,
    path: '/static',
    minify: true,
    options: configData?.CACHE?.static,
});
app.use(cache_static.middleware);
diagnostics.registerDiagnosticsSource('Cache::/static', () => cache_static.getDiagnostics());
console.log(`Loaded 'cache' using 'directory=${configData.DATA_ASSETS}, path=/static, minify=true': ${cache_static.stats()}`);

const server_snapshots = require('./server-function-snapshot-archiver.js')(app, '/snapshot', { directory: configData.STORAGE, templates: configData.VIEWS });
console.log(`Loaded 'snapshots' on '/snapshot', using '${configData.STORAGE}'`);

app.get('/', (req, res) => res.redirect(server_snapshots.getUrlList()));
console.log(`Loaded '/' using '${server_snapshots.getUrlList()}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt_client = require('mqtt').connect(configData.MQTT, {
    clientId: 'server-archiver-http-' + Math.random().toString(16).slice(2, 8),
});
mqtt_client.on('connect', () => console.log(`mqtt connected`));
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
