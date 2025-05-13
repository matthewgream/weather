// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const morgan = require('morgan');
const expressStatus = require('express-status-monitor');
const path = require('path');

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
        app.get((options.path || '') + '/diagnostics', (req, res) => {
            const stats = this.requestStats.getStats();
            const uptime = this._formatUptime(new Date() - stats.startTime);
            const logs = this.memoryLogs.getLogs().slice(-this.logLimitDisplay);
            const additionalDiagnostics = this.additionalDiagnostics;
            const formatTitle = this._formatTitle;
            const formatValue = this._formatValue;
            res.render('server-diagnostics', {
                stats, uptime, logs, additionalDiagnostics, process, formatTitle, formatValue,
            });
        });
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
