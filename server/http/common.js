
// ------------------------------------------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------------------------------------------

var logger = {
};

function logger_init (name) {
    const syslog = require ('syslog-client');
    logger.client = syslog.createClient ('127.0.0.1', { transport: syslog.Transport.Udp, port: 514, facility: 16 });
    logger.error = (m) => logger?.client?.log (m, { severity: syslog.Severity.Error });
    logger.info = (m) => logger?.client?.log (m, { severity: syslog.Severity.Informational });
    logger.notice = (m) => logger?.client?.log (m, { severity: syslog.Severity.Notice });
    logger.debug = (m) => logger?.client?.log (m, { severity: syslog.Severity.Debug });
    return logger.client;
}

// ------------------------------------------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------------------------------------------

var options = { };

function options_init () {
    const getopt = require ('posix-getopt');
    var option;
    const parser = new getopt.BasicParser ('dc:', process.argv);
    while ((option = parser.getopt ()) !== undefined)
        switch (option.option) {
            case 'd': options ['debug'] = true; break;
        }
    return parser.optind ();
}

// ------------------------------------------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------------------------------------------

function app_fatal (message) {
    console.error (message);
    if (logger?.error) logger.error (message);
    process.exit (-1);
}
function app_error (message) {
    console.error (message);
    if (logger?.error) logger.error (message);
}
function app_notice (message) {
    console.log (message);
    if (logger?.notice) logger.notice (message);
}
function app_info (message) {
    console.log (message);
    if (logger?.info) logger.info (message);
}
function app_debug (message) {
    if (options ['debug']) {
        console.log (message);
        if (logger?.debug) logger.debug (message);
    }
}

// ------------------------------------------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------------------------------------------

var app_signal_count = 0;

function app_signalled () {
    return app_signal_count > 0;
}

function app_open (name, args = {}) {

    if (!options_init ())
        app_fatal (`app_open: options_init failed`);

    if (!logger_init (name))
        app_fatal (`app_open: logger_init failed`);
    logger.info (`starting [nodejs v${process.versions.node}]: ${Object.entries (args).map (x => x.join ('=')).join (', ')}`);

    ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach (signal => process.on (signal, () => {
        console.error (`\nsignalled (${signal})\n`);
        app_signal_count ++;
    }));
}

function app_close () {
}

// ------------------------------------------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------------------------------------------

module.exports = {
    app: { open: app_open, close: app_close, signalled: app_signalled, debug: app_debug, info: app_info, notice: app_notice, fatal: app_fatal },
};

// ------------------------------------------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------------------------------------------

