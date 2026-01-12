#!/usr/bin/env node

const mqtt = require('mqtt');
const fs = require('node:fs');

// -----------------------------------------------------------------------------------------------------------------------------------------

const mqttServer = process.argv[2];
if (!mqttServer) {
    console.error('Usage: node mqtt-recorder.js <mqtt-server> [output-file] [topics...]');
    console.error('Example: node mqtt-recorder.js mqtt://branna.local recording.jsonl weather/# sensors/#');
    process.exit(1);
}

const outputFile = process.argv[3] || `mqtt-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
const topics = process.argv.slice(4);
if (topics.length === 0) topics.push('weather/#', 'sensors/#');

let messageCount = 0;
let startTime;
let writeStream;
let buffer = [];
const BUFFER_FLUSH_INTERVAL = 10000;

// -----------------------------------------------------------------------------------------------------------------------------------------

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000),
        minutes = Math.floor(seconds / 60),
        hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function flushBuffer() {
    if (buffer.length > 0) {
        writeStream.write(buffer.join('\n') + '\n');
        buffer = [];
    }
}

function shutdown() {
    flushBuffer();
    writeStream.end(() => {
        console.error(`recorder: finished`);
        console.error(`recorder: ${messageCount} messages recorded`);
        console.error(`recorder: duration: ${formatDuration(Date.now() - startTime)}`);
        console.error(`recorder: file: ${outputFile} (${Math.round(fs.statSync(outputFile).size / 1024)}KB)`);
        process.exit(0);
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------

console.error(`recorder: MQTT Message Recorder`);
console.error(`recorder: server: ${mqttServer}`);
console.error(`recorder: output: ${outputFile}`);
console.error(`recorder: topics: ${topics.join(', ')}`);
console.error(`recorder: press Ctrl+C to stop and save\n`);

writeStream = fs.createWriteStream(outputFile, { flags: 'a' });
setInterval(flushBuffer, BUFFER_FLUSH_INTERVAL);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const client = mqtt.connect(mqttServer);

client.on('connect', () => {
    console.error(`recorder: connected to ${mqttServer}`);
    topics.forEach((topic) => client.subscribe(topic, (err) => console.error(err ? `recorder: failed to subscribe to ${topic}: ${err.message}` : `recorder: subscribed to ${topic}`)));
    startTime = Date.now();
});

client.on('message', (topic, message) => {
    const t = Date.now() - startTime;
    let data;
    try {
        data = JSON.parse(message.toString());
    } catch {
        data = message.toString();
    }
    buffer.push(JSON.stringify({ t, topic, data }));
    if (++messageCount % 100 === 0) console.error(`recorder: ${messageCount} messages over ${formatDuration(t)}`);
});

client.on('error', (err) => console.error(`recorder: MQTT error: ${err.message}`));

client.on('offline', () => console.error(`recorder: MQTT offline, will reconnect...`));

// -----------------------------------------------------------------------------------------------------------------------------------------
