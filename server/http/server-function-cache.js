// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const zlib = require('zlib');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function install_if_available(name, what) {
    try {
        return require(name);
    } catch (e) {
        console.warn(`cache: '${name}' not available for '${what}' minification:`, e);
        return undefined;
    }
}

const terser = install_if_available('terser', 'JS');
const cleanCSS = install_if_available('clean-css', 'CSS');
const htmlMinifier = install_if_available('html-minifier-terser', 'HTML');
const svgo = install_if_available('svgo', 'SVG');

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
        this.debug = options.debug === true; // Default false
        this.compressionTypes = (options.compress || '').split(',').map((type) => type.toLowerCase().trim());
        this.compressionThreshold = options.compressionThreshold || 2048; // 4096 byte default
        this.compressionRatio = options.compressionRatio || 80; // Only store if compressed is less than 80% of original
        this.compressionLevel = {
            gzip: options.compressionLevelGzip || 6,
            brotli: options.compressionLevelBrotli || 4,
        };
        this.initializeMinifiers();
        this.initDetailedStats();
        this.quickScan();
        this.startBackgroundLoading();
    }

    initializeMinifiers() {
        this.minifiers_options = {
            cleanCSS: {
                level: 1,
                returnPromise: false,
                rebase: false,
                compatibility: 'ie9',
            },
            terser: {
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
            },
            htmlMinifier: {
                collapseWhitespace: true,
                removeComments: true,
                removeRedundantAttributes: true,
                removeScriptTypeAttributes: true,
                removeStyleLinkTypeAttributes: true,
                useShortDoctype: true,
                minifyCSS: true,
                minifyJS: true,
            },
            svgo: {
                plugins: ['preset-default', 'removeDoctype', 'removeComments', 'cleanupIds'],
            },
        };

        try {
            this.minifiers = {
                css: cleanCSS ? new cleanCSS(this.minifiers_options.cleanCSS) : undefined,
            };
            console.log('cache: minifiers:', {
                css: Boolean(cleanCSS),
                js: Boolean(terser),
                html: Boolean(htmlMinifier),
                svg: Boolean(svgo),
            });
        } catch (e) {
            console.error('cache: minifiers initialization failed:', e);
            this.minifiers = { css: undefined };
        }
    }

    initDetailedStats() {
        this.detailedStats = {
            files: {
                loaded: 0,
                loadErrors: 0,
                loadTime: 0,
                minified: 0,
                minifyErrors: 0,
                minifyTime: 0,
            },
            compression: {
                total: {
                    requests: 0,
                    compressed: 0,
                    uncompressed: 0,
                    bytesSaved: 0,
                    compressionTime: 0,
                },
                byType: {
                    gzip: this.initCompressionTypeStats(),
                    brotli: this.initCompressionTypeStats(),
                },
                belowThreshold: {
                    count: 0,
                    totalSize: 0,
                },
                skipRatio: {
                    count: 0,
                    totalSize: 0,
                },
            },
            cache: {
                hits: 0,
                misses: 0,
                notFound: 0,
                servedWhileLoading: 0,
                hitRate: 0,
            },
            byExtension: {},
        };
    }
    initCompressionTypeStats() {
        return {
            requests: 0,
            compressed: 0,
            uncompressed: 0,
            bytesSaved: 0,
            compressionTime: 0,
            avgCompressionRatio: 0,
        };
    }
    updateCompressionStats(type, originalSize, compressedSize, time, wasCompressed) {
        const stats = this.detailedStats.compression;
        const typeStats = stats.byType[type];
        if (typeStats) {
            typeStats.requests++;
            if (wasCompressed) {
                typeStats.compressed++;
                typeStats.bytesSaved += originalSize - compressedSize;
                typeStats.compressionTime += time;
                const totalBytes = typeStats.compressed * originalSize;
                const totalCompressed = totalBytes - typeStats.bytesSaved;
                typeStats.avgCompressionRatio = ((1 - totalCompressed / totalBytes) * 100).toFixed(1);
            } else typeStats.uncompressed++;
        }
        stats.total.requests++;
        if (wasCompressed) {
            stats.total.compressed++;
            stats.total.bytesSaved += originalSize - compressedSize;
            stats.total.compressionTime += time;
        } else stats.total.uncompressed++;
    }
    updateCacheStats(type) {
        const { cache } = this.detailedStats;
        cache[type]++;
        const total = cache.hits + cache.misses;
        cache.hitRate = total > 0 ? ((cache.hits / total) * 100).toFixed(1) : 0;
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
        const loadStart = process.hrtime.bigint();
        try {
            const originalContent = fs.readFileSync(filePath);
            const ext = path.extname(relativePath).toLowerCase();
            const mimeType = this.mimeTypes[ext] || 'application/octet-stream';
            let processedContent = originalContent;
            let isMinified = false;
            if (this.minify && this.canMinify(ext)) {
                const minifyStart = process.hrtime.bigint();
                try {
                    processedContent = await this.minifyContentAsync(originalContent, ext);
                    isMinified = true;
                    const minifyTime = Number(process.hrtime.bigint() - minifyStart) / 1_000_000;
                    this.detailedStats.files.minified++;
                    this.detailedStats.files.minifyTime += minifyTime;
                } catch (e) {
                    this.detailedStats.files.minifyErrors++;
                    console.warn(`cache: minification failed for '${relativePath}':`, e.message);
                    processedContent = originalContent;
                }
            }
            const etag = createHash('md5').update(processedContent).digest('hex');
            const contentCompressed = {
                // order in priority of serving
                br: this.compressionWrapper('brotli', `${this.compressionLevel.brotli} <${relativePath}>`, (content, opts) => zlib.brotliCompressSync(content, opts), processedContent, {
                    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: this.compressionLevel.brotli },
                }),
                gzip: this.compressionWrapper('gzip', `${this.compressionLevel.gzip} <${relativePath}>`, (content, opts) => zlib.gzipSync(content, opts), processedContent, {
                    level: this.compressionLevel.gzip,
                }),
            };

            this.cache.set(relativePath, {
                content: processedContent,
                contentCompressed,
                mimeType,
                etag,
                lastModified: fs.statSync(filePath).mtime,
                originalSize: originalContent.length,
                compressedSize: processedContent.length,
                isMinified,
            });

            if (!this.detailedStats.byExtension[ext])
                this.detailedStats.byExtension[ext] = {
                    files: 0,
                    minified: 0,
                    compressed: { gzip: 0, brotli: 0 },
                };
            this.detailedStats.byExtension[ext].files++;
            if (isMinified) this.detailedStats.byExtension[ext].minified++;
            if (contentCompressed.gzip) this.detailedStats.byExtension[ext].compressed.gzip++;
            if (contentCompressed.br) this.detailedStats.byExtension[ext].compressed.brotli++;
            const loadTime = Number(process.hrtime.bigint() - loadStart) / 1_000_000;
            this.detailedStats.files.loaded++;
            this.detailedStats.files.loadTime += loadTime;
            this.updateStats(ext, originalContent.length, processedContent.length);
        } catch (e) {
            console.error(`cache: failed to load '${relativePath}':`, e);
        }
        await new Promise((resolve) => setImmediate(resolve)); // yield after each file
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
            if (result.errors?.length > 0) {
                console.warn('cache: CSS minification errors:', result.errors);
                return this.fallbackMinifyCSS(css);
            }
            if (result.warnings?.length > 0) console.log('cache: CSS minification warnings:', result.warnings);
            return result.styles || css;
        } catch (e) {
            console.warn('cache: CSS minification failed, using fallback:', e.message);
            return this.fallbackMinifyCSS(css);
        }
    }
    async minifyJS(js) {
        if (!terser) return this.fallbackMinifyJS(js);
        try {
            const result = await terser.minify(js, this.minifiers_options.terser);
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
            return htmlMinifier.minify(html, this.minifiers_options.htmlMinifier);
        } catch (e) {
            console.warn('cache: HTML minification failed, using fallback:', e.message);
            return this.fallbackMinifyHTML(html);
        }
    }
    async minifySVG(svg) {
        if (!svgo) return this.fallbackMinifySVG(svg);
        try {
            const result = await svgo.optimize(svg, this.minifiers_options.svgo);
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

    compressionWrapper(name, detail, compressionFn, content, options = {}) {
        const contentSize = content.length;
        if (!this.compressionTypes.includes(name)) return undefined;

        if (contentSize <= this.compressionThreshold) {
            this.detailedStats.compression.belowThreshold.count++;
            this.detailedStats.compression.belowThreshold.totalSize += contentSize;
            return undefined;
        }

        const start = process.hrtime.bigint();
        try {
            const compressed = compressionFn(content, options);
            const time = Number(process.hrtime.bigint() - start) / 1_000_000;
            const compressedSize = compressed.length;
            const ratio = (compressedSize / contentSize) * 100;
            const reduction = Math.round((1 - compressedSize / contentSize) * 100);
            if (ratio >= this.compressionRatio) {
                this.detailedStats.compression.skipRatio.count++;
                this.detailedStats.compression.skipRatio.totalSize += contentSize;
                if (this.debug)
                    console.log(`cache: compressed [${name}:${detail}] ${contentSize} -> ${compressedSize} bytes (${reduction}% reduction, ratio ${ratio.toFixed(1)}%) in ${time.toFixed(2)}ms - SKIPPED (ratio >= ${this.compressionRatio}%)`);
                this.updateCompressionStats(name, contentSize, compressedSize, time, false);
                return undefined;
            }
            if (this.debug) console.log(`cache: compressed [${name}:${detail}] ${contentSize} -> ${compressedSize} bytes (${reduction}% reduction) in ${time.toFixed(2)}ms`);
            this.updateCompressionStats(name, contentSize, compressedSize, time, true);
            return compressed;
        } catch (e) {
            console.warn(`cache: compression failed [${name}]:`, e.message);
            return undefined;
        }
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
        return Number.parseFloat((bytes / 1024 ** i).toFixed(1)) + ['B', 'KB', 'MB', 'GB'][i];
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
            parts.push(`${ext.slice(1) || 'no-ext'} (${stats.files} file${stats.files === 1 ? '' : 's'}, ${originalSize}` + (stats.originalSize === stats.compressedSize ? '' : ` to ${compressedSize}`) + `)`);
        }
        return parts.join(', ');
    }

    serveCached(req, res, cached) {
        this.updateCacheStats('hits');
        const etag = `"${cached.etag}"`;
        if (req.headers?.['if-none-match'] === etag) return res.status(304).end();
        const lastModified = cached.lastModified?.toUTCString();
        if (req.headers?.['if-modified-since'] === lastModified) return res.status(304).end();
        res.set('Content-Type', cached.mimeType);
        res.set('ETag', etag);
        res.set('Last-Modified', lastModified);
        res.set('Cache-Control', 'public, max-age=31536000'); // 1 year
        if (cached.isMinified) res.set('X-Minified', 'output');
        for (const [type, compressed] of Object.entries(cached.contentCompressed))
            if (compressed && req.headers['accept-encoding']?.includes(type)) {
                res.set('Content-Encoding', type);
                res.set('Vary', 'Accept-Encoding');
                return res.send(compressed);
            }
        return res.send(cached.content);
    }

    createMiddleware() {
        return (req, res, next) => {
            if (!req.path.startsWith(this.pathPrefix)) return next();
            const requestPath = req.path.slice(this.pathPrefix.length);
            const cleanPath = requestPath.startsWith('/') ? requestPath.slice(1) : requestPath;
            if (this.cache.has(cleanPath)) return this.serveCached(req, res, this.cache.get(cleanPath));
            if (this.isLoading) {
                const filePath = path.join(this.directory, cleanPath);
                if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                    this.updateCacheStats('servedWhileLoading');
                    res.set('Content-Type', this.mimeTypes[path.extname(cleanPath).toLowerCase()] || 'application/octet-stream');
                    res.set('X-Cache-Status', 'loading');
                    return res.sendFile(filePath);
                }
            }
            this.updateCacheStats('notFound');
            return next();
        };
    }

    getDiagnostics() {
        const compressionRatio = this.stats.totalOriginalSize > 0 ? (((this.stats.totalOriginalSize - this.stats.totalCompressedSize) / this.stats.totalOriginalSize) * 100).toFixed(1) : 0;
        const availableMinifiers = [];
        if (terser) availableMinifiers.push('terser');
        if (cleanCSS) availableMinifiers.push('clean-css');
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
            stats: this.getStats(),
        };
    }

    getStats() {
        const { files, compression, cache, byExtension } = this.detailedStats;

        return {
            files: {
                loaded: files.loaded,
                loadErrors: files.loadErrors,
                avgLoadTime: files.loaded > 0 ? `${(files.loadTime / files.loaded).toFixed(2)}ms` : '0ms',
                minified: files.minified,
                minifyErrors: files.minifyErrors,
                avgMinifyTime: files.minified > 0 ? `${(files.minifyTime / files.minified).toFixed(2)}ms` : '0ms',
            },
            compression: {
                total: {
                    ...compression.total,
                    avgCompressionTime: compression.total.compressed > 0 ? `${(compression.total.compressionTime / compression.total.compressed).toFixed(2)}ms` : '0ms',
                    totalBytesSaved: this.formatSize(compression.total.bytesSaved),
                },
                byType: Object.entries(compression.byType).reduce((acc, [type, stats]) => {
                    acc[type] = {
                        ...stats,
                        avgCompressionTime: stats.compressed > 0 ? `${(stats.compressionTime / stats.compressed).toFixed(2)}ms` : '0ms',
                        totalBytesSaved: this.formatSize(stats.bytesSaved),
                        avgCompressionRatio: `${stats.avgCompressionRatio}%`,
                    };
                    return acc;
                }, {}),
                belowThreshold: {
                    ...compression.belowThreshold,
                    avgSize: compression.belowThreshold.count > 0 ? this.formatSize(compression.belowThreshold.totalSize / compression.belowThreshold.count) : '0B',
                    totalSize: this.formatSize(compression.belowThreshold.totalSize),
                },
                skipRatio: {
                    ...compression.skipRatio,
                    avgSize: compression.skipRatio.count > 0 ? this.formatSize(compression.skipRatio.totalSize / compression.skipRatio.count) : '0B',
                    totalSize: this.formatSize(compression.skipRatio.totalSize),
                },
            },
            cache: {
                ...cache,
                hitRate: `${cache.hitRate}%`,
            },
            byExtension,
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
        getStats: () => cache.getStats(),
        stats: () => cache.getStatsString(),
        getFile: (path) => cache.getFile(path),
        hasFile: (path) => cache.hasFile(path),
        listFiles: () => cache.listFiles(),
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
