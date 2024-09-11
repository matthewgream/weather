#!/usr/bin/env node

// -----------------------------------------------------------------------------------------------------------------------------------------

const name = 'weather_server';
const port = process.env.PORT || 80;
const data = process.env.DATA || '/opt/weather/server/http';
const subs = [ 'weather_branna', 'weather_ulrikashus' ];

// -----------------------------------------------------------------------------------------------------------------------------------------

const exp = require ('express');
const xxx = exp ();
xxx.set ('view engine', 'ejs');
xxx.set ('views', data);

const server = require ('http').createServer (xxx);
const socket = require ('socket.io') (server);

// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt_content = {}, mqtt_client = require ('mqtt').connect ('mqtt://localhost');
mqtt_client.on ('connect', () => mqtt_client.subscribe (subs, () => {
    console.log ('mqtt connected & subscribed');
}));
mqtt_client.on ('message', (topic, message) => {
    mqtt_content [topic] = JSON.parse (message.toString ());
    socket.emit ('update', { [topic]: mqtt_content [topic] });
});

//

xxx.get ('/', function (req, res) {
    res.render ('server', { vars: mqtt_content });
});

xxx.get ('/vars', function (req, res) {
    console.log (`/vars requested from '${req.headers ['x-forwarded-for'] || req.connection.remoteAddress}'`);
    res.json ({ timestamp: Math.floor (Date.now () / 1000), ...mqtt_content });
});

//

xxx.use (function (req, res) {
    res.status (404).send ("not found");
});
server.listen (port, function () {
    const { family, address, port } = server.address ();
    console.log (`express up for '${name}' ! -> ${family}/${address}:${port}`);
});

// -----------------------------------------------------------------------------------------------------------------------------------------

