// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let terser, CleanCSS, htmlMinifier, svgo;
try {
    terser = require('terser');
} catch (e) {
    console.warn('cache: terser not available for JS minification:', e);
}
try {
    CleanCSS = require('clean-css');
} catch (e) {
    console.warn('cache: clean-css not available for CSS minification:', e);
}
try {
    htmlMinifier = require('html-minifier-terser');
} catch (e) {
    console.warn('cache: html-minifier-terser not available for HTML minification:', e);
}
try {
    const { optimize } = require('svgo');
    svgo = { optimize };
} catch (e) {
    console.warn('cache: svgo not available for SVG minification:', e);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

class StaticFileCache {
    constructor(options = {}) {
        this.directory = options.directory || __dirname;
        this.pathPrefix = options.path || '/static';
        this.minify = options.minify || false;
        this.options = options.options || {};
        this.ignoreDotFiles = options.ignoreDotFiles !== false; // Default true
        this.cache = new Map();
        this.isLoading = true;
        this.scanStats = { directories: 0, files: 0 };
        this.stats = {
            files: 0,
            totalOriginalSize: 0,
            totalCompressedSize: 0,
            byExtension: {},
            loadTime: 0,
        };
        this.mimeTypes = {
            '.html': 'text/html',
            '.htm': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf',
            '.eot': 'application/vnd.ms-fontobject',
            '.pdf': 'application/pdf',
            '.txt': 'text/plain',
            '.xml': 'application/xml',
            '.webp': 'image/webp',
        };
        this.handlers = {
            '.css': { method: 'minifyCSS', async: false },
            '.js': { method: 'minifyJS', async: true },
            '.html': { method: 'minifyHTML', async: false },
            '.htm': { method: 'minifyHTML', async: false },
            '.svg': { method: 'minifySVG', async: true },
            '.json': { method: 'minifyJSON', async: false },
        };
        this.initializeMinifiers();
        this.quickScan();
        this.startBackgroundLoading();
    }

    initializeMinifiers() {
        try {
            this.minifiers = {
                css: CleanCSS
                    ? new CleanCSS({
                          level: 1,
                          returnPromise: false,
                          rebase: false,
                          compatibility: 'ie9',
                      })
                    : undefined,
            };
            console.log('cache: minifiers:', {
                css: !!CleanCSS,
                js: !!terser,
                html: !!htmlMinifier,
                svg: !!svgo,
            });
        } catch (e) {
            console.error('cache: minifiers initialization failed:', e);
            this.minifiers = { css: undefined };
        }
    }

    quickScan() {
        this.scanDirectory(this.directory);
    }
    scanDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) return;
        try {
            this.scanStats.directories++;
            for (const item of fs.readdirSync(dirPath)) {
                if (this.ignoreDotFiles && item.startsWith('.')) continue;
                const fullPath = path.join(dirPath, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) this.scanDirectory(fullPath);
                else if (stat.isFile()) this.scanStats.files++;
            }
        } catch {
            // Ignore scan errors
        }
    }
    startBackgroundLoading() {
        (async () => {
            const startTime = Date.now();
            console.log(`cache: load starting with ${this.scanStats.files} files, ${this.scanStats.directories} directories`);
            try {
                await this.loadDirectory(this.directory, '');
                this.stats.loadTime = Date.now() - startTime;
                this.isLoading = false;
                console.log(`cache: load completed for ${this.stats.files} files: ${this.getFinalStatsString()}`);
            } catch (e) {
                console.error('cache: load failed:', e);
                this.isLoading = false;
            }
        })();
    }

    async loadDirectory(dirPath, relativePath) {
        if (!fs.existsSync(dirPath)) return;
        for (const item of fs.readdirSync(dirPath)) {
            if (this.ignoreDotFiles && item.startsWith('.')) continue;
            const fullPath = path.join(dirPath, item);
            const relativeItemPath = path.join(relativePath, item).replaceAll('\\', '/');
            try {
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) await this.loadDirectory(fullPath, relativeItemPath);
                else if (stat.isFile()) await this.loadFile(fullPath, relativeItemPath);
            } catch (e) {
                console.error(`cache: load error processing '${fullPath}':`, e);
            }
        }
    }
    async loadFile(filePath, relativePath) {
        try {
            const originalContent = fs.readFileSync(filePath);
            const ext = path.extname(relativePath).toLowerCase();
            const mimeType = this.mimeTypes[ext] || 'application/octet-stream';
            let processedContent = originalContent;
            let isMinified = false;
            if (this.minify && this.canMinify(ext)) {
                try {
                    processedContent = await this.minifyContentAsync(originalContent, ext);
                    isMinified = true;
                    await new Promise(resolve => setImmediate(resolve));
                } catch (e) {
                    console.warn(`cache: minification failed for '${relativePath}':`, e.message);
                    processedContent = originalContent;
                }
            }
            const etag = crypto.createHash('md5').update(processedContent).digest('hex');
            this.cache.set(relativePath, {
                content: processedContent,
                mimeType,
                etag,
                lastModified: fs.statSync(filePath).mtime.toUTCString(),
                originalSize: originalContent.length,
                compressedSize: processedContent.length,
                isMinified,
            });
            this.updateStats(ext, originalContent.length, processedContent.length);
        } catch (e) {
            console.error(`cache: failed to load '${relativePath}':`, e);
        }
    }

    canMinify(ext) {
        return ext in this.handlers;
    }

    async minifyContentAsync(content, ext) {
        const handler = this.handlers[ext];
        if (!handler) return content;
        try {
            const contentStr = content.toString('utf8');
            return Buffer.from(handler.async ? await this[handler.method](contentStr) : this[handler.method](contentStr), 'utf8');
        } catch (e) {
            console.warn(`cache: minification failed for ${ext}:`, e.message);
            return content;
        }
    }
    minifyCSS(css) {
        if (!this.minifiers.css) return this.fallbackMinifyCSS(css);
        try {
            const result = this.minifiers.css.minify(css);
            if (result.errors && result.errors.length > 0) {
                console.warn('cache: CSS minification errors:', result.errors);
                return this.fallbackMinifyCSS(css);
            }
            if (result.warnings && result.warnings.length > 0) console.log('cache: CSS minification warnings:', result.warnings);
            return result.styles || css;
        } catch (e) {
            console.warn('cache: CSS minification failed, using fallback:', e.message);
            return this.fallbackMinifyCSS(css);
        }
    }
    async minifyJS(js) {
        if (!terser) return this.fallbackMinifyJS(js);
        try {
            const options = {
                compress: {
                    drop_console: false,
                    drop_debugger: true,
                    pure_funcs: ['console.debug'],
                    passes: 2,
                    unsafe_math: true,
                    conditionals: true,
                    dead_code: true,
                    evaluate: true,
                    if_return: true,
                    join_vars: true,
                    loops: true,
                    reduce_vars: true,
                    sequences: true,
                    side_effects: true,
                    switches: true,
                    unused: true,
                },
                mangle: {
                    toplevel: false,
                    properties: false,
                    reserved: [],
                    ...this.options?.js?.mangle,
                },
                format: {
                    comments: false,
                    beautify: false,
                    semicolons: true,
                },
            };
            const result = await terser.minify(js, options);
            if (result.error) {
                console.warn('cache: JS minification failed, using fallback:', result.error);
                return this.fallbackMinifyJS(js);
            }
            return result.code || js;
        } catch (e) {
            console.warn('cache: JS minification failed, using fallback:', e.message);
            return this.fallbackMinifyJS(js);
        }
    }
    minifyHTML(html) {
        if (!htmlMinifier) return this.fallbackMinifyHTML(html);
        try {
            return htmlMinifier.minify(html, {
                collapseWhitespace: true,
                removeComments: true,
                removeRedundantAttributes: true,
                removeScriptTypeAttributes: true,
                removeStyleLinkTypeAttributes: true,
                useShortDoctype: true,
                minifyCSS: true,
                minifyJS: true,
            });
        } catch (e) {
            console.warn('cache: HTML minification failed, using fallback:', e.message);
            return this.fallbackMinifyHTML(html);
        }
    }
    async minifySVG(svg) {
        if (!svgo) return this.fallbackMinifySVG(svg);
        try {
            const result = await svgo.optimize(svg, {
                plugins: ['preset-default', 'removeDoctype', 'removeComments', 'cleanupIds'],
            });
            return result.data || svg;
        } catch (e) {
            console.warn('cache: SVG minification failed, using fallback:', e.message);
            return this.fallbackMinifySVG(svg);
        }
    }
    minifyJSON(json) {
        try {
            return JSON.stringify(JSON.parse(json));
        } catch {
            return json;
        }
    }

    fallbackMinifyCSS(css) {
        return css
            .replaceAll(/\/\*[\S\s]*?\*\//, '') // eslint-disable-line regexp/match-any
            .replaceAll(/\s+/, ' ')
            .replaceAll(/\s*([+,:;>{}~])\s*/, '$1')
            .replaceAll(';}', '}')
            .trim();
    }
    fallbackMinifyJS(js) {
        return js
            .replaceAll(/(?:^|\s)\/\/(?![^\n\r]*["'`]).*$/m, '')
            .replaceAll(/\/\*[\S\s]*?\*\//, '') // eslint-disable-line regexp/match-any
            .replaceAll(/\s+/, ' ')
            .replaceAll(/\s*([!%&()*+,/:;<=>?[\]^{|}~\-])\s*/, '$1') // eslint-disable-line no-useless-escape
            .replaceAll(';}', '}')
            .trim();
    }
    fallbackMinifyHTML(html) {
        return html
            .replaceAll(/<!--[\S\s]*?-->/, '') // eslint-disable-line regexp/match-any
            .replaceAll(/>\s+</, '><')
            .replaceAll(/^\s+/m, '')
            .replaceAll(/\s+$/m, '')
            .replaceAll(/\s+/, ' ')
            .trim();
    }
    fallbackMinifySVG(svg) {
        return svg
            .replaceAll(/<!--[\S\s]*?-->/, '') // eslint-disable-line regexp/match-any
            .replaceAll(/\s+/, ' ')
            .replaceAll(/\s*=\s*/, '=')
            .replaceAll(/(<\s+|\s+>)/, (match) => match.trim())
            .trim();
    }

    updateStats(ext, originalSize, compressedSize) {
        this.stats.files++;
        this.stats.totalOriginalSize += originalSize;
        this.stats.totalCompressedSize += compressedSize;
        if (!this.stats.byExtension[ext]) this.stats.byExtension[ext] = { files: 0, originalSize: 0, compressedSize: 0 };
        this.stats.byExtension[ext].files++;
        this.stats.byExtension[ext].originalSize += originalSize;
        this.stats.byExtension[ext].compressedSize += compressedSize;
    }
    formatSize(bytes) {
        if (bytes === 0) return '0B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Number.parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ['B', 'KB', 'MB', 'GB'][i];
    }

    getStatsString() {
        if (this.isLoading) return `${this.scanStats.files} files, ${this.scanStats.directories} directories`;
        if (this.stats.files === 0) return 'no files found';
        return this.getFinalStatsString();
    }
    getFinalStatsString() {
        const parts = [];
        for (const [ext, stats] of Object.entries(this.stats.byExtension)) {
            const originalSize = this.formatSize(stats.originalSize);
            const compressedSize = this.formatSize(stats.compressedSize);
            parts.push(
                `${ext.slice(1) || 'no-ext'} (${stats.files} file${stats.files === 1 ? '' : 's'}, ${originalSize}` +
                    (stats.originalSize === stats.compressedSize ? '' : ` to ${compressedSize}`) +
                    `)`
            );
        }
        return parts.join(', ');
    }

    createMiddleware() {
        return (req, res, next) => {
            if (!req.path.startsWith(this.pathPrefix)) return next();
            const requestPath = req.path.slice(this.pathPrefix.length);
            const cleanPath = requestPath.startsWith('/') ? requestPath.slice(1) : requestPath;
            if (this.cache.has(cleanPath)) {
                const cached = this.cache.get(cleanPath);
                if (req.headers?.['if-none-match'] === `"${cached.etag}"`) return res.status(304).end();
                if (req.headers?.['if-modified-since'] === cached.lastModified) return res.status(304).end();
                res.set('Content-Type', cached.mimeType);
                res.set('ETag', `"${cached.etag}"`);
                res.set('Last-Modified', cached.lastModified);
                res.set('Cache-Control', 'public, max-age=31536000'); // 1 year
                if (cached.isMinified) res.set('X-Minified', 'true');
                return res.send(cached.content);
            }
            if (this.isLoading) {
                const filePath = path.join(this.directory, cleanPath);
                if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                    res.set('Content-Type', this.mimeTypes[path.extname(cleanPath).toLowerCase()] || 'application/octet-stream');
                    res.set('X-Cache-Status', 'loading');
                    return res.sendFile(filePath);
                }
            }
            return next();
        };
    }

    getDiagnostics() {
        const compressionRatio =
            this.stats.totalOriginalSize > 0
                ? (((this.stats.totalOriginalSize - this.stats.totalCompressedSize) / this.stats.totalOriginalSize) * 100).toFixed(1)
                : 0;
        const availableMinifiers = [];
        if (terser) availableMinifiers.push('terser');
        if (CleanCSS) availableMinifiers.push('clean-css');
        if (htmlMinifier) availableMinifiers.push('html-minifier-terser');
        if (svgo) availableMinifiers.push('svgo');
        return {
            enabled: true,
            directory: this.directory,
            pathPrefix: this.pathPrefix,
            minificationEnabled: this.minify,
            ignoreDotFiles: this.ignoreDotFiles,
            availableMinifiers: availableMinifiers.length > 0 ? availableMinifiers : ['fallback-only'],
            totalFiles: this.stats.files,
            scanStats: this.scanStats,
            isLoading: this.isLoading,
            totalOriginalSize: this.formatSize(this.stats.totalOriginalSize),
            totalCompressedSize: this.formatSize(this.stats.totalCompressedSize),
            compressionRatio: `${compressionRatio}%`,
            loadTime: `${this.stats.loadTime}ms`,
            fileTypes: Object.keys(this.stats.byExtension).sort(),
            byExtension: Object.entries(this.stats.byExtension).map(([ext, stats]) => ({
                extension: ext || 'no-ext',
                files: stats.files,
                originalSize: this.formatSize(stats.originalSize),
                compressedSize: this.formatSize(stats.compressedSize),
                saved: stats.originalSize === stats.compressedSize ? '0B' : this.formatSize(stats.originalSize - stats.compressedSize),
            })),
        };
    }
    getFile(relativePath) {
        return this.cache.get(relativePath);
    }
    hasFile(relativePath) {
        return this.cache.has(relativePath);
    }
    listFiles() {
        return [...this.cache.keys()].sort();
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (options = {}) {
    const cache = new StaticFileCache(options);
    return {
        middleware: cache.createMiddleware(),
        getDiagnostics: () => cache.getDiagnostics(),
        stats: () => cache.getStatsString(),
        getFile: (path) => cache.getFile(path),
        hasFile: (path) => cache.hasFile(path),
        listFiles: () => cache.listFiles(),
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
