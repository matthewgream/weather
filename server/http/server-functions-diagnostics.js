// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const morgan = require('morgan');
const expressStatus = require('express-status-monitor');

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
    constructor(app, options = {}) {
        this.logLimitDisplay = options.logLimitDisplay || LOGS_DISPLAY_DEFAULT;
        this.memoryLogs = new MemoryLogsManager({ maxSize: options.logLimitStorage || LOGS_INMEMORY_MAXSIZE });
        this.requestStats = new RequestStatsManager();
        const self = this;
        app.use(expressStatus({ port: options.port || 80, path: (options.path || '') + '/internal' }));
        app.use(morgan(options.morganFormat || 'combined', { stream: self.memoryLogs.createLogStream() }));
        app.use(this.requestStats.createMiddleware());
        app.get((options.path || '') + '/requests', (req, res) =>
            res.send(self.requestStats.generateStatsPage(req.query.limit ? parseInt(req.query.limit) : self.logLimitDisplay, self.memoryLogs))
        );
    }
    getStats() {
        return this.requestStats.getStats();
    }
    getLogs(limit = this.logLimitDisplay) {
        return this.memoryLogs.getLogs().slice(-limit);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (app, options) {
    return new DiagnosticsManager(app, options);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
