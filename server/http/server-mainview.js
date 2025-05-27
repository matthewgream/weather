#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const configPath = process.argv[2] || 'secrets.txt';
const configData = require('./server-function-config.js')(configPath);
const configList = Object.entries(configData)
    .map(([k, v]) => k.toLowerCase() + '=' + v)
    .join(', ');
configData.CONTENT_DATA_SUBS = ['weather/#', 'sensors/#', 'snapshots/#', 'alert/#'];
configData.CONTENT_VIEW_VARS = ['weather/branna', 'sensors/radiation', 'aircraft', 'interpretation'];
configData.DIAGNOSTICS_PUBLISH_TOPIC = 'server/mainview';
configData.DIAGNOSTICS_PUBLISH_PERIOD = 60;
configData.DATA_VIEWS = path.join(configData.DATA, 'http');
configData.DATA_ASSETS = path.join(configData.DATA, 'assets');
configData.DATA_IMAGES = path.join(configData.DATA, 'images');
configData.DATA_STORE = path.join(configData.DATA, 'store');
configData.DATA_CACHE = '/dev/shm/weather';
configData.MQTT_CLIENT = 'server-mainview-http-' + Math.random().toString(16).slice(2, 8);
configData.FILE_SETS = path.join(__dirname, 'client.json');
console.log(`Loaded 'config' using '${configPath}': ${configList}`);

configData.LOCATION = {
    elevation: 135,
    latitude: 59.662095,
    longitude: 12.995505,
    summerAvgHigh: 21,
    winterAvgLow: -7,
    annualRainfall: 750, // mm
    annualSnowfall: 150, // cm
    forestCoverage: 'high',
    nearbyLakes: true,
    climateType: 'humid continental',
    location: 'Central Sweden',
    hemisphere: 'northern',
    timezone: 'Europe/Stockholm',
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

fs.existsSync(configData.DATA_STORE) || fs.mkdirSync(configData.DATA_STORE, { recursive: true });
fs.existsSync(configData.DATA_CACHE) || fs.mkdirSync(configData.DATA_CACHE, { recursive: true });

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

const diagnostics = require('./server-function-diagnostics.js')(app, { port: 8080, path: '/status' }); // XXX PORT_EXTERNAL
console.log(`Loaded 'diagnostics' on '/status'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

app.use(exp.static(configData.DATA_CACHE));
console.log(`Loaded 'static' using '${configData.DATA_CACHE}'`);

const cache_static = require('./server-function-cache.js')({
    directory: configData.DATA_ASSETS,
    path: '/static',
    minify: true,
    compress: 'gzip,brotli',
    compressionThreshold: 2048,
    compressionRatio: 75,
    compressionLevelGzip: 9,
    compressionLevelBrotli: 9,
    options: configData?.CACHE?.static,
});
app.use(cache_static.middleware);
diagnostics.registerDiagnosticsSource('Cache::/static', () => cache_static.getDiagnostics());
console.log(`Loaded 'cache' using 'directory=${configData.DATA_ASSETS}, path=/static, minify=true': ${cache_static.stats()}`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

require('./server-function-images.js')(app, '/images', { directory: configData.DATA_IMAGES, location: `http://${configData.HOST}:${configData.PORT}` });
console.log(`Loaded 'images' on '/images' using 'directory=${configData.DATA_IMAGES}'`);

require('./server-function-sets.js')(app, '/sets', { filename: configData.FILE_SETS });
console.log(`Loaded 'sets' on '/sets' using 'filename=${configData.FILE_SETS}`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const server_snapshots = require('./server-function-snapshot-mainview.js')(app, '/snapshot', {
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

const server_vars = require('./server-function-vars.js')(app, '/vars', {
    vars: configData.CONTENT_VIEW_VARS,
    location: configData.LOCATION,
    tz: configData.TZ,
});
console.log(`Loaded 'vars' on '/vars' using 'vars=[${configData.CONTENT_VIEW_VARS.join(', ')}]'`);

app.get(
    '/',
    require('./server-function-cache-ejs.js')(path.join(configData.DATA_VIEWS, 'server-mainview.ejs')).routeHandler(async () => ({
        vars: server_vars.render(),
        data: await server_data.render(),
    }))
);
console.log(`Loaded '/' using 'server-mainview' && data/vars`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const weather_module = require('./server-function-weather.js');
function getWeatherInterpretation(vars) {
    try {
        const varsWeather = vars['weather/branna'] || {},
            varsRadiation = vars['sensors/radiation'] || {};
        const results = weather_module.getWeatherInterpretation(configData.LOCATION, {
            temp: varsWeather.temp,
            humidity: varsWeather.humidity,
            pressure: varsWeather.baromrel,
            windSpeed: varsWeather.windspeed ? varsWeather.windspeed / 3.6 : undefined,
            solarRad: varsWeather.solarradiation,
            solarUvi: varsWeather.uv,
            rainRate: varsWeather.rainrate,
            radiationCpm: varsRadiation.cpm,
            radiationAcpm: varsRadiation.acpm,
            radiationUsvh: varsRadiation.usvh,
            snowDepth: undefined,
            iceDepth: undefined,
        });
        return results;
    } catch (e) {
        console.error(`getWeatherInterpretation, error:`, e);
    }
}
console.log(`Loaded 'weather' using 'location=${JSON.stringify(configData.LOCATION)}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const notifications = require('./server-function-push.js')(app, '/push', {
    contactEmail: configData.ADMIN_EMAIL,
    dataDir: configData.DATA_STORE,
    vapidKeyFile: 'push-vapid-keys.json',
    subscriptionsFile: 'push-subscriptions.json',
    maxHistoryLength: 30,
});
diagnostics.registerDiagnosticsSource('Notifications', () => notifications.getDiagnostics());
console.log(`Loaded 'push-notifications' on '/push'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let __snapshotImagedataHolder;
function __snapshotImagedata(message) {
    __snapshotImagedataHolder = message;
}
function __snapshotMetadata(message) {
    if (__snapshotImagedataHolder) {
        try {
            server_snapshots.insert(`snapshot_${JSON.parse(message.toString()).time}.jpg`, __snapshotImagedataHolder);
        } catch (e) {
            console.error('Error processing snapshot metadata:', e);
        }
        __snapshotImagedataHolder = undefined;
    } else console.error('Received snapshot metadata but no image data is available');
}
function receive_snapshots(topic, message) {
    if (topic === 'snapshots/imagedata') __snapshotImagedata(message);
    else if (topic === 'snapshots/metadata') __snapshotMetadata(message);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

const __weatherAlerts = {},
    __weatherExpiry = 60 * 60 * 1000; // 60 minutes
function __weatherAlerts_update(alerts) {
    const now = Date.now();
    alerts
        .filter((alert) => !__weatherAlerts[alert])
        .forEach((alert) => {
            __weatherAlerts[alert] = now;
            notifications.notify(alert);
        });
    Object.entries(__weatherAlerts)
        .filter(([alert, timestamp]) => !alerts.includes(alert) && timestamp < now - __weatherExpiry)
        .forEach(([alert, _]) => delete __weatherAlerts[alert]);
}
function receive_variables(topic, message) {
    if (topic.startsWith('alert/')) notifications.notify(message.toString());
    try {
        server_vars.update(topic, JSON.parse(message.toString()));
        if (topic == 'weather/branna' || topic == 'sensors/radiation') {
            const interpretation = getWeatherInterpretation(server_vars.variables());
            server_vars.update('interpretation', interpretation);
            __weatherAlerts_update(interpretation.alerts);
        }
    } catch (e) {
        console.error(`Error processing mqtt message (topic='${topic}':`, e);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt_client = require('mqtt').connect(configData.MQTT, {
    clientId: configData.MQTT_CLIENT,
});
mqtt_client.on('connect', () =>
    mqtt_client.subscribe(configData.CONTENT_DATA_SUBS, () => console.log(`mqtt connected & subscribed for '${configData.CONTENT_DATA_SUBS}'`))
);
mqtt_client.on('message', (topic, message) => {
    if (topic.startsWith('snapshots')) receive_snapshots(topic, message);
    else receive_variables(topic, message);
});
console.log(`Loaded 'mqtt:subscriber' using 'server=${configData.MQTT}, topics=[${configData.CONTENT_DATA_SUBS.join(', ')}]'`);

setInterval(
    () => mqtt_client.publish(configData.DIAGNOSTICS_PUBLISH_TOPIC, JSON.stringify(diagnostics.getPublishableStats())),
    configData.DIAGNOSTICS_PUBLISH_PERIOD * 1000
);
console.log(`Loaded 'mqtt:publisher' using 'topic=${configData.DIAGNOSTICS_PUBLISH_TOPIC}, period=${configData.DIAGNOSTICS_PUBLISH_PERIOD}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

if (configData.SOURCE_AIRCRAFT_ADSB_MQTT_SERVER) {
    const alerts_active = {},
        alerts_expiry = 30 * 60 * 1000,
        alerts_check = 5 * 60 * 1000;
    setInterval(
        () =>
            Object.values(alerts_active)
                .filter((alert) => alert.expiry < Date.now())
                .forEach((alert) => delete alerts_active[alert.id]),
        alerts_check
    );
    const alerts_update = () => server_vars.update('aircraft', { alerts: Object.values(alerts_active) });
    require('./server-function-source-aircraft-adsb.js')({
        mqtt: {
            server: configData.SOURCE_AIRCRAFT_ADSB_MQTT_SERVER,
            client: configData.MQTT_CLIENT,
        },
        onAlertInserted: (id, warn, flight, text) => {
            if (warn && text) {
                alerts_active[id] = { id, flight, text, expiry: Date.now() + alerts_expiry };
                notifications.notify('aircraft', `${flight}: ${text}`);
                alerts_update();
            }
        },
        onAlertRemoved: (id) => {
            if (alerts_active[id]) {
                delete alerts_active[id];
                alerts_update();
            }
        },
    });
    console.log(`Loaded 'source-aircraft-adsb' using 'server=${configData.SOURCE_AIRCRAFT_ADSB_MQTT_SERVER}'`);
}

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
