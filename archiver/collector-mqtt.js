// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const mqtt = require('mqtt');

let config = {};

function mqttReceive(server, receiver, topic, message) {
    try {
        receiver(topic, message);
    } catch (e) {
        console.error(`mqtt: [${server.server}] receiver on '${topic}', error (exception):`, e);
    }
}

function mqttSubscribe(server) {
    server.topics.forEach((topic) =>
        server.client.subscribe(topic, (err) => {
            if (err) console.error(`mqtt: [${server.server}] subscribe to '${topic}', error:`, err);
            else console.log(`mqtt: [${server.server}] subscribe to '${topic}', succeeded`);
        })
    );
}

function mqttBegin(receiver) {
    const clientId = config.clientId;
    config.servers.forEach((server) => {
        const options = { clientId };
        if (server.username) options.username = server.username;
        if (server.password) options.password = server.password;

        console.log(`mqtt: [${server.server}] connecting`);
        server.client = mqtt.connect(server.server, options);

        if (server.client) {
            server.client.on('connect', () => {
                console.log(`mqtt: [${server.server}] connected`);
                mqttSubscribe(server);
            });
            if (receiver) server.client.on('message', (topic, message) => mqttReceive(server, receiver, topic, message));
            server.client.on('error', (error) => console.error(`mqtt: [${server.server}] error:`, error));
            server.client.on('offline', () => console.warn(`mqtt: [${server.server}] offline`));
            server.client.on('reconnect', () => console.log(`mqtt: [${server.server}] reconnect`));
        }
    });
}

function mqttEnd() {
    config.servers
        .filter((server) => server.client)
        .forEach((server) => {
            server.client.end();
            server.client = undefined;
        });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (c) {
    config = c;
    return {
        begin: mqttBegin,
        end: mqttEnd,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
