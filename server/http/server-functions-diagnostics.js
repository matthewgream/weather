// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const morgan = require('morgan');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const LOGS_INMEMORY_MAXSIZE = 8 * 1024 * 1024;
const LOGS_DISPLAY_DEFAULT = 100;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

class MemoryLogsManager {
    constructor({ maxSize = LOGS_INMEMORY_MAXSIZE } = {}) {
        this.logs = [];
        this.size = 0;
        this.maxSize = maxSize;
    }
    write(string) {
        this.logs.push(string);
        this.size += Buffer.byteLength(string, 'utf8');
        while (this.size > this.maxSize && this.logs.length > 0) this.size -= Buffer.byteLength(this.logs.shift(), 'utf8');
        return true;
    }
    getLogs() {
        return this.logs;
    }
    clear() {
        this.logs = [];
        this.size = 0;
    }
    createLogStream() {
        const self = this;
        return {
            write: function (string) {
                return self.write(string);
            },
        };
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

class RequestStatsManager {
    constructor() {
        this.stats = {
            total: 0,
            byRoute: {},
            byMethod: {},
            byStatus: {},
            byIP: {},
            startTime: new Date(),
        };
    }
    updateEnter(req) {
        this.stats.total++;
        this.stats.byRoute[req.path] = (this.stats.byRoute[req.path] || 0) + 1;
        this.stats.byMethod[req.method] = (this.stats.byMethod[req.method] || 0) + 1;
        const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        this.stats.byIP[ip] = (this.stats.byIP[ip] || 0) + 1;
    }
    updateLeave(res) {
        this.stats.byStatus[res.statusCode] = (this.stats.byStatus[res.statusCode] || 0) + 1;
    }
    getStats() {
        return this.stats;
    }
    clear() {
        this.stats = {
            total: 0,
            byRoute: {},
            byMethod: {},
            byStatus: {},
            byIP: {},
            startTime: new Date(),
        };
    }
    createMiddleware() {
        const self = this;
        return function (req, res, next) {
            const res_end = res.end;
            self.updateEnter(req);
            res.end = function (...args) {
                self.updateLeave(res);
                res_end.apply(res, args);
            };
            next();
        };
    }
    generateStatsPage(limit = LOGS_DISPLAY_DEFAULT, memoryLogs) {
        const recentLogs = memoryLogs ? memoryLogs.getLogs().slice(-limit) : [];
        const uptime = this._formatUptime(new Date() - this.stats.startTime);
        return `
        <html>
          <head>
            <title>Server Stats</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1, h2 { color: #333; }
              .stats-container { display: flex; flex-wrap: wrap; }
              .stats-box { background: #f5f5f5; border-radius: 5px; padding: 15px; margin: 10px; min-width: 200px; }
              table { border-collapse: collapse; width: 100%; }
              th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
              tr:hover { background-color: #f1f1f1; }
              pre { background: #f8f8f8; border: 1px solid #ddd; border-radius: 3px; max-height: 500px; overflow: auto; padding: 10px; }
            </style>
          </head>
          <body>
            <h1>Server Statistics</h1>
            <div class="stats-container">
              <div class="stats-box">
                <h2>General</h2>
                <p>Total Requests: ${this.stats.total}</p>
                <p>Server Uptime: ${uptime}</p>
              </div>
              <div class="stats-box">
                <h2>Routes</h2>
                <table>
                  <tr><th>Path</th><th>Count</th></tr>
                  ${Object.entries(this.stats.byRoute)
                      .sort((a, b) => b[1] - a[1])
                      .map(([path, count]) => `<tr><td>${path}</td><td>${count}</td></tr>`)
                      .join('')}
                </table>
              </div>
              <div class="stats-box">
                <h2>Methods</h2>
                <table>
                  <tr><th>Method</th><th>Count</th></tr>
                  ${Object.entries(this.stats.byMethod)
                      .map(([method, count]) => `<tr><td>${method}</td><td>${count}</td></tr>`)
                      .join('')}
                </table>
              </div>
              <div class="stats-box">
                <h2>Status Codes</h2>
                <table>
                  <tr><th>Status</th><th>Count</th></tr>
                  ${Object.entries(this.stats.byStatus)
                      .map(([status, count]) => `<tr><td>${status}</td><td>${count}</td></tr>`)
                      .join('')}
                </table>
              </div>
              <div class="stats-box">
                <h2>IP Addresses</h2>
                <table>
                  <tr><th>IP</th><th>Count</th></tr>
                  ${Object.entries(this.stats.byIP)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 10)
                      .map(([ip, count]) => `<tr><td>${ip}</td><td>${count}</td></tr>`)
                      .join('')}
                </table>
              </div>
            </div>
              <h2>Recent Logs (${recentLogs.length})</h2>
              <pre>${recentLogs.join('')}</pre>
          </body>
        </html>
      `;
    }
    _formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

class DiagnosticsManager {
    constructor(options = {}) {
        this.memoryLogs = new MemoryLogsManager({
            maxSize: options.maxLogSize || LOGS_INMEMORY_MAXSIZE,
        });
        this.requestStats = new RequestStatsManager();
        this.defaultLogLimit = options.defaultLogLimit || LOGS_DISPLAY_DEFAULT;
        this.morganFormat = options.morganFormat || 'combined';
    }
    setupMorgan(app) {
        const logStream = this.memoryLogs.createLogStream();
        app.use(morgan(this.morganFormat, { stream: logStream }));
        return this;
    }
    setupRequestTracking(app) {
        app.use(this.requestStats.createMiddleware());
        return this;
    }
    setupStatsRoute(app, route = '/requests') {
        const self = this;
        app.get(route, (req, res) => {
            const limit = req.query.limit ? parseInt(req.query.limit) : self.defaultLogLimit;
            return res.send(self.requestStats.generateStatsPage(limit, self.memoryLogs));
        });
        console.log(`Loaded 'diagnostics' on '${route}' using 'in-memory-logs-maxsize=${this.memoryLogs.maxSize}'`);
        return this;
    }
    setup(app, route = '/requests') {
        return this.setupMorgan(app).setupRequestTracking(app).setupStatsRoute(app, route);
    }
    getStats() {
        return this.requestStats.getStats();
    }
    getLogs(limit = this.defaultLogLimit) {
        return this.memoryLogs.getLogs().slice(-limit);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (options) {
    return new DiagnosticsManager(options);
};

module.exports.MemoryLogsManager = MemoryLogsManager;
module.exports.RequestStatsManager = RequestStatsManager;
module.exports.DiagnosticsManager = DiagnosticsManager;
module.exports.DEFAULT_LOGS_MAXSIZE = LOGS_INMEMORY_MAXSIZE;
module.exports.DEFAULT_LOGS_DISPLAY = LOGS_DISPLAY_DEFAULT;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
