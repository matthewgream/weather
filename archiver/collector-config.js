// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function configLoad(configPath) {
    try {
        return require('fs')
            .readFileSync(configPath, 'utf8')
            .split('\n')
            .reduce((items, line) => {
                const [key, value] = line.split('=').map((s) => s.trim());
                if (key && value) items[key] = value;
                return items;
            }, {});
    } catch {
        console.warn(`config: could not load '${configPath}', using defaults (which may not work correctly)`);
        return {};
    }
}

function initialise(options) {
    const configPath = options?.file || 'config.txt';
    const conf = configLoad(configPath);
    const config = {
        mqtt: {
            servers: [
                { server: conf.MQTT, topics: ['weather/#', 'sensors/#', 'snapshots/#', 'server/#'] },
                { server: conf.SOURCE_AIRCRAFT_ADSB_MQTT_SERVER, topics: ['adsb/#'] },
                { server: 'mqtt://localhost:1883', topics: ['devices/#'] },
            ],
            clientId: 'archiver-collector-' + Math.random().toString(16).slice(2, 8),
        },
        storage: {
            messages: conf.STORAGE + '/messages',
            snapshots: conf.STORAGE + '/snapshots',
            timelapse: conf.STORAGE + '/timelapse',
        },
        topics: {
            messages: ['weather/', 'sensors/', 'server/', 'adsb/', 'devices/'],
            snapshots: ['snapshots/'],
        },
    };
    const configList = Object.entries(conf)
        .map(([k, v]) => k.toLowerCase() + '=' + v)
        .join(', ');
    console.log(`config: loaded using '${configPath}': ${configList}`);
    return config;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (options) {
    return initialise(options);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
