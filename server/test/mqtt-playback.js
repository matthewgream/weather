#!/usr/bin/env node

const mqtt = require('mqtt');
const fs = require('node:fs');
const readline = require('node:readline');

// -----------------------------------------------------------------------------------------------------------------------------------------

const recordingFile = process.argv[2];
if (!recordingFile) {
    console.error('Usage: node mqtt-player.js <recording-file> [speed] [mqtt-server]');
    console.error('Example: node mqtt-player.js recording.jsonl 10 mqtt://localhost');
    console.error('  speed: playback speed multiplier (default: 1, use 60 for 1 hour in 1 minute)');
    process.exit(1);
}

const speed = parseFloat(process.argv[3]) || 1;
const mqttServer = process.argv[4] || 'mqtt://localhost';

let messages = [];
let messageIndex = 0;
let publishedCount = 0;
let startTime;
let client;

// -----------------------------------------------------------------------------------------------------------------------------------------

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000),
        minutes = Math.floor(seconds / 60),
        hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

async function loadRecording() {
    return new Promise((resolve, reject) => {
        const rl = readline.createInterface({
            input: fs.createReadStream(recordingFile),
            crlfDelay: Infinity,
        });
        rl.on('line', (line) => {
            if (line.trim())
                try {
                    messages.push(JSON.parse(line));
                } catch (e) {
                    console.error(`player: failed to parse line: ${e.message}`);
                }
        });
        rl.on('close', () => {
            messages.sort((a, b) => a.t - b.t);
            resolve();
        });
        rl.on('error', reject);
    });
}

function scheduleNext() {
    if (messageIndex >= messages.length) {
        console.error(`\nplayer: finished`);
        console.error(`player: ${publishedCount} messages published: playback took ${formatDuration(Date.now() - startTime)} at ${speed}x speed`);
        client.end();
        process.exit(0);
    }

    const msg = messages[messageIndex];
    const delay = Math.max(0, msg.t / speed - (Date.now() - startTime));

    setTimeout(() => {
        client.publish(msg.topic, typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data));
        messageIndex++;
        if (++publishedCount % 100 === 0) console.error(`player: ${publishedCount}/${messages.length} messages, original time: ${formatDuration(msg.t)}, playback time: ${formatDuration(Date.now() - startTime)}`);
        scheduleNext();
    }, delay);
}

function shutdown() {
    console.error(`\nplayer: interrupted at message ${messageIndex}/${messages.length}`);
    if (client) client.end();
    process.exit(0);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

async function main() {
    console.error(`player: MQTT Message Player`);
    console.error(`player: recording: ${recordingFile}`);
    console.error(`player: target: ${mqttServer}`);
    console.error(`player: speed: ${speed}x`);

    console.error(`player: loading recording...`);
    await loadRecording();
    if (messages.length === 0) {
        console.error(`player: no messages found in recording`);
        process.exit(1);
    }

    console.error(`player: ${messages.length} messages loaded, topics: ${[...new Set(messages.map((m) => m.topic))].join(', ')}`);
    console.error(`player: recording duration: ${formatDuration(messages[messages.length - 1].t)}`);
    console.error(`player: estimated playback: ${formatDuration(messages[messages.length - 1].t / speed)}`);

    client = mqtt.connect(mqttServer);
    client.on('connect', () => {
        console.error(`player: connected to ${mqttServer}`);
        console.error(`player: starting playback...\n`);
        startTime = Date.now();
        scheduleNext();
    });
    client.on('error', (err) => {
        console.error(`player: MQTT error: ${err.message}`);
        process.exit(1);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
    console.error(`player: error: ${err.message}`);
    process.exit(1);
});

// -----------------------------------------------------------------------------------------------------------------------------------------
