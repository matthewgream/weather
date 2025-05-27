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
        return {
            write: (string) => this.write(string),
        };
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

class RequestStatsManager {
    constructor() {
        this.clear();
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
            startTime: Date.now(),
        };
    }
    createMiddleware() {
        return (req, res, next) => {
            const res_end = res.end;
            this.updateEnter(req);
            res.end = (...args) => {
                this.updateLeave(res);
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
        const basePath = options.path || '',
            basePort = options.port || 80;
        this.app = app;
        app.use(expressStatus({ port: basePort, path: basePath + '/internal' }));
        app.use(morgan(options.morganFormat || 'combined', { stream: this.memoryLogs.createLogStream() }));
        app.use(this.requestStats.createMiddleware());
        app.get(basePath, (req, res) => res.send(this.getPage(basePath)));
        app.get(basePath + '/diagnostics', (req, res) => {
            const stats = this.requestStats.getStats();
            return res.render('server-diagnostics', {
                stats,
                uptime: this._formatUptime(Date.now() - stats.startTime),
                logs: this.memoryLogs.getLogs().slice(-this.logLimitDisplay),
                additionalDiagnostics: this.additionalDiagnostics,
                process,
                formatTitle: this._formatTitle,
                formatValue: this._formatValue,
            });
        });
    }
    getPage(basePath) {
        const proxyLinks = (this.diagnosticsProxies || [])
            .map(
                (proxy) => `<a href="${proxy.path || `/status/${proxy.name.toLowerCase()}`}" class="status-link">
        <div class="status-link-title">${proxy.name}</div>
        <div class="status-link-desc">${proxy.description || `Remote diagnostics for ${proxy.name}`}</div>
    </a>`
            )
            .join('');
        return `<!DOCTYPE html>
<html>
<head>
    <title>Server Status</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0 auto; max-width: 600px; padding: 40px 20px; line-height: 1.6; color: #333; }
        .status-link { display: block; color: #3182ce; text-decoration: none; padding: 12px 16px; margin: 8px 0; background: white; border-radius: 6px; border: 1px solid #e2e8f0; transition: all 0.2s; }
        .status-link:hover { background: #ebf8ff; border-color: #3182ce; text-decoration: none; }
        .status-link-title { font-weight: 600; font-size: 1.1em; }
        .status-link-desc { color: #718096; font-size: 0.9em; margin-top: 4px; }
    </style>
</head>
<body>
    <a href="${basePath}/diagnostics" class="status-link">
        <div class="status-link-title">Diagnostics</div>
        <div class="status-link-desc">Server information, request statistics, and application insights</div>
    </a>
    <a href="${basePath}/internal" class="status-link">
        <div class="status-link-title">Monitor</div>
        <div class="status-link-desc">Server performance metrics and resource usage (in real-time)</div>
    </a>${proxyLinks}
</body>
</html>`;
    }

    registerDiagnosticsSource(name, sourceFunction) {
        if (typeof sourceFunction !== 'function') {
            console.error(`Invalid diagnostics source function for ${name}`);
            return false;
        }
        this.additionalDiagnostics.push({ name, sourceFunction });
        return true;
    }
    registerDiagnosticsProxy(name, proxyConfig) {
        if (!proxyConfig || !proxyConfig.target) {
            console.error(`Invalid diagnostics proxy configuration for ${name}`);
            return false;
        }
        const proxyPath = proxyConfig.path || `/status/${name.toLowerCase()}`;
        const targetPath = proxyConfig.targetPath || '/status';
        if (!this.diagnosticsProxies) this.diagnosticsProxies = [];
        this.diagnosticsProxies.push({
            name,
            path: proxyPath,
            description: proxyConfig.description || `Remote diagnostics for ${name}`,
            target: proxyConfig.target,
        });
        try {
            const { createProxyMiddleware } = require('http-proxy-middleware');
            const proxy = createProxyMiddleware({
                target: proxyConfig.target,
                changeOrigin: true,
                secure: false,
                ws: true,
                pathRewrite: (path, req) => (req.originalUrl || path).replace(proxyPath, targetPath),
                onProxyReq: (proxyReq, req) => {
                    proxyReq.setHeader('host', new URL(proxyConfig.target).host);
                    proxyReq.setHeader('x-forwarded-proto', 'https');
                    proxyReq.setHeader('x-forwarded-host', req.headers.host);
                    proxyReq.setHeader('x-forwarded-for', req.headers['x-forwarded-for'] || req.connection.remoteAddress);
                },
                onProxyRes: (proxyRes) => {
                    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                        const locationOriginal = proxyRes.headers.location;
                        try {
                            const locationUrl = new URL(locationOriginal, proxyConfig.target);
                            if (locationOriginal.startsWith('/') || locationUrl.origin === new URL(proxyConfig.target).origin) {
                                const locationNew = locationUrl.pathname + locationUrl.search + locationUrl.hash;
                                proxyRes.headers.location = locationNew.startsWith(targetPath)
                                    ? locationNew.replace(targetPath, proxyPath)
                                    : proxyPath + locationNew;
                            }
                        } catch (e) {
                            console.error(`[DiagnosticsProxy] Error parsing redirect location:`, e);
                        }
                    }
                    const contentType = proxyRes.headers['content-type'] || '';
                    if (contentType.includes('text/html')) {
                        delete proxyRes.headers['content-length'];
                        proxyRes.pipe.bind(proxyRes);
                        proxyRes.pipe = function (destination) {
                            const chunks = [];
                            proxyRes.on('data', (chunk) => chunks.push(chunk));
                            proxyRes.on('end', () => {
                                const modifiedBuffer = Buffer.from(
                                    Buffer.concat(chunks)
                                        .toString('utf8')
                                        .replace(new RegExp(`(href=["'])${targetPath}(/[^"']*)(["'])`, 'g'), `$1${proxyPath}$2$3`)
                                        .replace(new RegExp(`(href=["'])${targetPath}(["'])`, 'g'), `$1${proxyPath}$2`),
                                    'utf8'
                                );
                                destination.setHeader('content-length', modifiedBuffer.length);
                                destination.write(modifiedBuffer);
                                destination.end();
                            });
                            return proxyRes;
                        };
                    }
                },
                onError: (err, req, res) => {
                    console.error(`[DiagnosticsProxy] Proxy error for ${name}:`, err.message);
                    res.status(500).send(`Proxy error: ${err.message}`);
                },
            });
            this.app.use(proxyPath, proxy);
            console.log(`Registered diagnostics proxy: ${name} (${proxyPath} -> ${proxyConfig.target}${targetPath})`);
            return true;
        } catch (e) {
            console.error(`Failed to create diagnostics proxy for ${name}:`, e);
            return false;
        }
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
            uptime: Date.now() - stats.startTime,
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
            } catch (e) {
                baseStats[source.name] = { error: `Failed to retrieve diagnostics: ${e.message}` };
            }
        });

        return baseStats;
    }
    _formatTitle(str) {
        return str.replaceAll(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
    }
    _formatValue(value) {
        if (value === undefined) return '<em>None</em>';
        if (typeof value === 'boolean') return value ? '<span class="good">Enabled</span>' : '<span class="warning">Disabled</span>';
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'object') return '<pre>' + JSON.stringify(value, undefined, 2) + '</pre>';
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
