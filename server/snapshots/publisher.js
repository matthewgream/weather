#!/usr/bin/env node

const fs = require('fs');
const { exec } = require('child_process');
const mqtt = require('mqtt');

// -----------------------------------------------------------------------------------------------------------------------------------------
// Load configuration
// -----------------------------------------------------------------------------------------------------------------------------------------

function configLoad(configPath) {
    try {
        const items = {};
        fs.readFileSync(configPath, 'utf8')
            .split('\n')
            .forEach((line) => {
                const [key, value] = line.split('=').map((s) => s.trim());
                if (key && value) items[key] = value;
            });
        return items;
    } catch (err) {
        console.warn(`Could not load '${configPath}', using defaults (which may not work correctly)`);
        return {};
    }
}

const configPath = '/opt/weather/server/secrets.txt';
const conf = configLoad(configPath);
console.log(
    `Loaded 'config' using '${configPath}': ${Object.entries(conf)
        .map(([k, v]) => k.toLowerCase() + '=' + v)
        .join(', ')}`
);

// -----------------------------------------------------------------------------------------------------------------------------------------
// Connect to MQTT
// -----------------------------------------------------------------------------------------------------------------------------------------

let mqtt_client = null;

function mqttBegin() {
    mqtt_client = mqtt.connect(conf.MQTT, {
        clientId: 'snapshots-publisher-' + Math.random().toString(16).substring(2, 8),
    });
    mqtt_client.on('connect', () => {
        console.log(`MQTT connected to ${conf.MQTT}`);
    });
}
function mqttEnd() {
    if (mqtt_client) {
        mqtt_client.end();
        mqtt_client = null;
    }
}

console.log(`Loaded 'mqtt' using '${conf.MQTT}'`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// Snapshot capture and publish
// -----------------------------------------------------------------------------------------------------------------------------------------

// original, 110K
// '-q:v', '7.5',
// '-compression_level', '9',

// better quality, but 199K
// '-q:v', '4',                    // Slightly better quality (1-31 scale, lower is better)
// '-pix_fmt', 'yuv420p',          // Consistent pixel format for web and video
// '-preset', 'medium',            // Good balance for single frame

// size conscious, 138K
// '-q:v', '6',                    // Balance between quality and size (5-8 is good range)
// '-pix_fmt', 'yuv420p',          // Consistent pixel format
// '-chroma_sample_location', 'center',  // Better color reproduction at lower sizes

async function snapshotCapture() {
    try {
        const now = new Date();
        const timestamp =
            now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');
        const filename = `snapshot_${timestamp}.jpg`;
        const chunks = [];
        await new Promise((resolve, reject) => {
            const ffmpeg = require('child_process').spawn('ffmpeg', [
                '-y',
                '-rtsp_transport', 'tcp',
                '-i', conf.RTSP,
                '-vframes', '1',
                '-q:v', '6', // Balance between quality and size
                '-pix_fmt', 'yuv420p', // Consistent pixel format
                '-chroma_sample_location', 'center', // Better color reproduction
                '-f', 'image2pipe',
                '-',
            ]);
            ffmpeg.stdout.on('data', (chunk) => {
                chunks.push(chunk);
            });
            ffmpeg.stderr.on('data', (data) => {
                if (data.toString().includes('Error')) console.error(`ffmpeg stderr: ${data}`);
            });
            ffmpeg.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`ffmpeg process exited with code ${code}`));
            });
            ffmpeg.on('error', (err) => {
                reject(err);
            });
        });
        const imageBuffer = Buffer.concat(chunks);
        if (mqtt_client) {
            mqtt_client.publish('snapshots/imagedata', imageBuffer, { retain: false });
            mqtt_client.publish(
                'snapshots/metadata',
                JSON.stringify({
                    filename,
                    timestamp,
                    size: imageBuffer.length,
                }),
                { retain: false }
            );
            console.log(`snapshot publisher: published '${filename}' (${imageBuffer.length} bytes)`);
        }
    } catch (error) {
        console.error('Error capturing and publishing snapshot:', error);
    }
}

let snapshotActive = false;
let snapshotSkippedNow = 0;
let snapshotSkippedAll = 0;
async function snapshotExecute() {
    if (snapshotActive) {
        snapshotSkippedNow++;
        snapshotSkippedAll++;
        console.log(`snapshot publisher: capture still active (${snapshotSkippedNow} / ${snapshotSkippedAll}), skipping this cycle`);
        return;
    }
    try {
        snapshotActive = true;
        await snapshotCapture();
    } catch (error) {
        console.error('Error in scheduled capture:', error);
    } finally {
        snapshotActive = false;
        snapshotSkippedNow = 0;
    }
}
function snapshotBegin() {
    console.log('snapshot publisher: starting with interval of 30 seconds ...');
    snapshotExecute();
    setInterval(snapshotExecute, 30000);
}
console.log(`Loaded 'snapshot' using interval=30s`);

// -----------------------------------------------------------------------------------------------------------------------------------------
// Handle exit gracefully
// -----------------------------------------------------------------------------------------------------------------------------------------

process.on('SIGINT', () => {
    console.log('snapshot publisher: stopping ...');
    mqttEnd();
    process.exit(0);
});

snapshotBegin();
mqttBegin();
console.log('snapshot publisher: started');
