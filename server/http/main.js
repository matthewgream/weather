#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const port = process.env.PORT || 80;
const data = process.env.DATA || '/opt/weather/server/http';

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const name = 'http';
const { app } = require ('./common.js');
app.open (name, { port });

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const ejs = require ('ejs');
const exp = require ('express');
const http = require ('http');
const socketIo = require ('socket.io');

const xxx = exp ();

xxx.set ('x-powered-by', false);
xxx.set ('view engine', 'ejs');
xxx.set ('views', data + "/views");
xxx.use (exp.json ());
xxx.use ('/assets', exp.static (data + "/assets"));
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
xxx.use (require ('body-parser').json ());
xxx.use (require ('express-device').capture ());

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const server = http.createServer (xxx);
const io = socketIo (server);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt_content = { };
const mqtt_client = require ('mqtt').connect ('mqtt://localhost');
mqtt_client.on ('connect', () => mqtt_client.subscribe (['weather_branna', 'weather_ulrikashus'], () => {
	app.info ('mqtt connected & subscribed');
}));
mqtt_client.on ('message', (topic, message) => {
	const data = JSON.parse (message.toString ());
	mqtt_content [topic] = data;
	io.emit ('update', { [topic]: data });
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.get ('/', function (req, res) {
    res.render ('pages/main', {
		type: req.device.type, vars: mqtt_content
    });
});

xxx.get ('/vars', function (req, res) {
    res.json ({ timestamp: Math.floor (Date.now () / 1000), ...mqtt_content });
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

xxx.use (function (req, res) {
    res.status (404).send ("not found");
});

server.listen (port, function () {
    const { family, address, port } = server.address ();
    app.info (`express up for '${name}' ! -> ${family}/${address}:${port}`);
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

