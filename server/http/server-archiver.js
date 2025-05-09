#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const configPath = process.argv[2] || 'secrets.txt';
const configData = require('./server-functions-config.js')(configPath);
const configList = Object.entries(configData)
    .map(([k, v]) => k.toLowerCase() + '=' + v)
    .join(', ');
configData.DIAGNOSTICS_PUBLISH_TOPIC = 'server/archiver';
configData.DIAGNOSTICS_PUBLISH_PERIOD = 60;
configData.DATA_VIEWS = configData.DATA + '/http';
configData.DATA_ASSETS = configData.DATA + '/assets';
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

const diagnostics = require('./server-functions-diagnostics')(app, { port: 80, path: '/status' }); // XXX PORT_EXTERNAL
console.log(`Loaded 'diagnostics' on '/status'`);

app.use((req, res, next) => {
    if (!req.headers.authorization) {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).send('Authentication required');
    }
    try {
        const pass = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString().split(':')?.[1];
        if (pass == configData.PASS) return next();
    } catch {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(400).send('Authentication malformedc');
    }
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).send('Authentication failed');
});
console.log(`Loaded 'authentication' using 'pass=${configData.PASS}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

app.use('/static', exp.static(configData.DATA_ASSETS));
console.log(`Loaded 'static' using '/static -> ${configData.DATA_ASSETS}'`);

const server_snapshots = require('./server-functions-snapshot-archiver.js')(app, '/snapshot', { directory: configData.STORAGE });
console.log(`Loaded 'snapshots' on '/snapshot', using '${configData.STORAGE}'`);

app.get('/', (req, res) => res.redirect(server_snapshots.getUrlList()));
console.log(`Loaded '/' using '${server_snapshots.getUrlList()}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt_client = require('mqtt').connect(configData.MQTT, {
    clientId: 'server-archiver-http-' + Math.random().toString(16).substring(2, 8),
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
