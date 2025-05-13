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
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

class DiagnosticsManager {
    constructor(app, options = {}) {
        this.logLimitDisplay = options.logLimitDisplay || LOGS_DISPLAY_DEFAULT;
        this.memoryLogs = new MemoryLogsManager({ maxSize: options.logLimitStorage || LOGS_INMEMORY_MAXSIZE });
        this.requestStats = new RequestStatsManager();
        this.additionalDiagnostics = [];
        const self = this;
        app.use(expressStatus({ port: options.port || 80, path: (options.path || '') + '/internal' }));
        app.use(morgan(options.morganFormat || 'combined', { stream: self.memoryLogs.createLogStream() }));
        app.use(this.requestStats.createMiddleware());
        app.get((options.path || '') + '/diagnostics', (req, res) => res.send(self.generateFullDiagnosticsPage(req, res)));
    }
    registerDiagnosticsSource(name, sourceFunction) {
        if (typeof sourceFunction !== 'function') {
            console.error(`Invalid diagnostics source function for ${name}`);
            return false;
        }
        this.additionalDiagnostics.push({ name, sourceFunction });
        return true;
    }
    getStats() {
        return this.requestStats.getStats();
    }
    getLogs(limit = this.logLimitDisplay) {
        return this.memoryLogs.getLogs().slice(-limit);
    }
    getPublishableStats() {
        const stats = this.requestStats.getStats();
        const baseStats = {
            totalRequests: stats.total,
            uptime: new Date() - stats.startTime,
            byRoute: stats.byRoute,
            byMethod: stats.byMethod,
            byStatus: stats.byStatus,
            topIPs: Object.entries(stats.byIP)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .reduce((obj, [ip, count]) => {
                    obj[ip] = count;
                    return obj;
                }, {}),
            memoryUsage: process.memoryUsage(),
            timestamp: new Date().toISOString(),
        };
        this.additionalDiagnostics.forEach((source) => {
            try {
                const sourceData = source.sourceFunction();
                if (sourceData && typeof sourceData === 'object') baseStats[source.name] = sourceData;
            } catch (error) {
                baseStats[source.name] = { error: `Failed to retrieve diagnostics: ${error.message}` };
            }
        });

        return baseStats;
    }
    generateFullDiagnosticsPage() {
        const stats = this.requestStats.getStats();
        const uptime = this._formatUptime(new Date() - stats.startTime);
        const additionalDiagnosticsList = this.additionalDiagnostics.map((source) => `<a href="#${source.name.toLowerCase()}">${source.name}</a>`).join('');
        const additionalDiagnosticsHtml = this.additionalDiagnostics
            .map((source) => {
                try {
                    return this._generateDiagnosticSourceHtml(source.name, source.sourceFunction());
                } catch (error) {
                    console.error(`Error rendering diagnostics from source ${source.name}:`, error);
                    return `<div class="stats-box">
                    <h2>${source.name}</h2>
                    <div class="error">Failed to retrieve diagnostics: ${error.message}</div>
                    </div>`;
                }
            })
            .join('');
        return `<html>
          <head>
            <title>Server Diagnostics</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; max-width: 1200px; margin: 0 auto; }
              h1, h2, h3 { color: #333; }
              .stats-container { display: flex; flex-wrap: wrap; }
              .stats-box { background: #f5f5f5; border-radius: 5px; padding: 15px; margin: 10px; min-width: 200px; flex: 1; }
              .section { margin: 20px 0; }
              table { border-collapse: collapse; width: 100%; }
              th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
              tr:hover { background-color: #f1f1f1; }
              pre { background: #f8f8f8; border: 1px solid #ddd; border-radius: 3px; max-height: 300px; overflow: auto; padding: 10px; }
              .error { color: #e53e3e; padding: 10px; background: #fff5f5; border-radius: 5px; }
              .good { color: #38a169; }
              .warning { color: #d69e2e; }
              .nav { margin-bottom: 20px; padding: 10px; background: #f5f5f5; border-radius: 5px; }
              .nav a { margin-right: 15px; color: #4299e1; text-decoration: none; }
              .nav a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <h1>Server Diagnostics</h1>
            <div class="nav">
              <a href="#general">General</a>
              <a href="#requests">Requests</a>
              <a href="#logs">Logs</a>
              ${additionalDiagnosticsList}
            </div>
            <div id="general" class="section">
              <h2>General Server Information</h2>
              <div class="stats-container">
                <div class="stats-box">
                  <h3>Basic Stats</h3>
                  <p>Total Requests: ${stats.total}</p>
                  <p>Server Uptime: ${uptime}</p>
                  <p>Node.js Version: ${process.version}</p>
                  <p>Platform: ${process.platform}</p>
                </div>
                <div class="stats-box">
                  <h3>Memory Usage</h3>
                  <table>
                    <tr><th>Type</th><th>Usage</th></tr>
                    ${Object.entries(process.memoryUsage())
                        .map(([type, bytes]) => `<tr><td>${type}</td><td>${Math.round((bytes / 1024 / 1024) * 100) / 100} MB</td></tr>`)
                        .join('')}
                  </table>
                </div>
              </div>
            </div>
            <div id="requests" class="section">
              <h2>Request Statistics</h2>
              <div class="stats-container">
                <div class="stats-box">
                  <h3>Routes</h3>
                  <table>
                    <tr><th>Path</th><th>Count</th></tr>
                    ${Object.entries(stats.byRoute)
                        .sort((a, b) => b[1] - a[1])
                        .map(([path, count]) => `<tr><td>${path}</td><td>${count}</td></tr>`)
                        .join('')}
                  </table>
                </div>
                <div class="stats-box">
                  <h3>Methods</h3>
                  <table>
                    <tr><th>Method</th><th>Count</th></tr>
                    ${Object.entries(stats.byMethod)
                        .map(([method, count]) => `<tr><td>${method}</td><td>${count}</td></tr>`)
                        .join('')}
                  </table>
                </div>
                <div class="stats-box">
                  <h3>Status Codes</h3>
                  <table>
                    <tr><th>Status</th><th>Count</th></tr>
                    ${Object.entries(stats.byStatus)
                        .map(([status, count]) => `<tr><td>${status}</td><td>${count}</td></tr>`)
                        .join('')}
                  </table>
                </div>
                <div class="stats-box">
                  <h3>Top IPs</h3>
                  <table>
                    <tr><th>IP</th><th>Count</th></tr>
                    ${Object.entries(stats.byIP)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 10)
                        .map(([ip, count]) => `<tr><td>${ip}</td><td>${count}</td></tr>`)
                        .join('')}
                  </table>
                </div>
              </div>
            </div>
            <!-- Additional diagnostics sources -->
            ${additionalDiagnosticsHtml}
            <div id="logs" class="section">
              <h2>Recent Logs</h2>
              <div class="stats-box" style="width: 100%; min-width: 100%;">
                <pre>${this.memoryLogs.getLogs().slice(-this.logLimitDisplay).join('')}</pre>
              </div>
            </div>
          </body>
        </html>`;
    }
    _generateDiagnosticSourceHtml(sourceName, data) {
        if (!data || typeof data !== 'object')
            return `<div id="${sourceName.toLowerCase()}" class="section">
                <h2>${sourceName}</h2>
                <div class="stats-box">
                    <p>No data available</p>
                </div>
            </div>`;
        let html = `<div id="${sourceName.toLowerCase()}" class="section">
            <h2>${sourceName}</h2>
            <div class="stats-container">`;
        for (const [key, value] of Object.entries(data))
            if (typeof value === 'object' && value !== null)
                html += `<div class="stats-box">
                    <h3>${this._formatTitle(key)}</h3>
                    ${this._formatObjectData(value)}
                </div>`;
        const simpleProps = Object.values(data).filter((v) => typeof v !== 'object' || v === null);
        if (simpleProps.length > 0)
            html += `<div class="stats-box">
                <h3>General</h3>
                <table>
                    ${simpleProps
                        .map(
                            ([k, v]) => `<tr>
                            <th>${this._formatTitle(k)}</th>
                            <td>${this._formatValue(v)}</td>
                        </tr>`
                        )
                        .join('')}
                </table>
            </div>`;
        html += `</div>
        </div>`;
        return html;
    }
    _formatObjectData(obj) {
        if (Array.isArray(obj)) {
            if (obj.length === 0) return '<p>No items</p>';
            if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null)
                return `<table>
                    <tr>${Object.keys(obj[0])
                        .map((k) => `<th>${this._formatTitle(k)}</th>`)
                        .join('')}</tr>
                    ${obj
                        .map(
                            (item) =>
                                `<tr>${Object.keys(obj[0])
                                    .map((k) => `<td>${this._formatValue(item[k])}</td>`)
                                    .join('')}</tr>`
                        )
                        .join('')}
                </table>`;
            return `<ul>${obj.map((item) => `<li>${this._formatValue(item)}</li>`).join('')}</ul>`;
        }
        return `<table>
            ${Object.entries(obj)
                .map(
                    ([k, v]) => `<tr>
                    <th>${this._formatTitle(k)}</th>
                    <td>${this._formatValue(v)}</td>
                </tr>`
                )
                .join('')}
        </table>`;
    }
    _formatTitle(str) {
        return str.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
    }
    _formatValue(value) {
        if (value === null || value === undefined) return '<em>None</em>';
        if (typeof value === 'boolean') return value ? '<span class="good">Enabled</span>' : '<span class="warning">Disabled</span>';
        if (typeof value === 'object') return '<pre>' + JSON.stringify(value, null, 2) + '</pre>';
        if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://')))
            return `<a href="${value}" target="_blank">${value}</a>`;
        return value.toString();
    }
    _formatUptime(ms) {
        const seconds = Math.floor(ms / 1000),
            minutes = Math.floor(seconds / 60),
            hours = Math.floor(minutes / 60),
            days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (app, options) {
    return new DiagnosticsManager(app, options);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
