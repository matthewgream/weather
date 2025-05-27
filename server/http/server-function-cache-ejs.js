// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ejs = require('ejs');
const zlib = require('zlib');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function install_if_available(name, what) {
    try {
        return require(name);
    } catch (e) {
        console.warn(`cache-ejs: '${name}' not available for '${what}' minification:`, e);
    }
}

const htmlMinifier = install_if_available('html-minifier-terser', 'HTML');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

class SingleEJSTemplateCache {
    constructor(templatePath, options = {}) {
        this.templatePath = path.resolve(templatePath);
        this.templateName = path.basename(templatePath, '.ejs');
        this.debug = options.debug === true; // Default false
        this.minifyTemplate = options.minifyTemplate !== false; // Default true
        this.minifyOutput = options.minifyOutput === true; // Default false
        this.watch = options.watch !== false; // Default true
        this.compressionTypes = options.compress?.split(',').map((type) => type.toLowerCase().trim()) || [];
        this.compressionThreshold = options.compressionThreshold || 4096; // 4096 byte default
        this.compressionRatio = options.compressionRatio || 0;
        this.compressionLevel = {
            gzip: options.compressionLevelGzip || 6,
            brotli: options.compressionLevelBrotli || 4,
        };
        this.ejsOptions = {
            cache: false,
            compileDebug: false,
            filename: this.templatePath,
            ...options.ejsOptions,
        };
        this.cached = undefined;
        this.lastHash = undefined;
        this.lastHtml = undefined;
        this.watcher = undefined;
        this.isLoading = true;
        this.initCompressionStats();

        this.loadTemplate()
            .then(() => {
                this.isLoading = false;
            })
            .catch((e) => {
                console.error(`cache-ejs: failed to load template:`, e);
                this.isLoading = false;
            });
    }

    initCompressionStats() {
        this.stats = {
            templates: {
                loaded: 0,
                reloaded: 0,
                renderCount: 0,
                renderTime: 0,
                renderErrors: 0,
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
                hitRate: 0,
            },
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
        const stats = this.stats.compression;
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
            } else {
                typeStats.uncompressed++;
            }
        }
        stats.total.requests++;
        if (wasCompressed) {
            stats.total.compressed++;
            stats.total.bytesSaved += originalSize - compressedSize;
            stats.total.compressionTime += time;
        } else stats.total.uncompressed++;
    }
    updateCacheStats(hit) {
        const cache = this.stats.cache;
        if (hit) cache.hits++;
        else cache.misses++;
        const total = cache.hits + cache.misses;
        cache.hitRate = total > 0 ? ((cache.hits / total) * 100).toFixed(1) : 0;
    }

    async loadTemplate() {
        try {
            const originalSource = fs.readFileSync(this.templatePath, 'utf8'),
                originalSize = Buffer.byteLength(originalSource, 'utf8');
            const templateSource = this.minifyTemplate ? await this.minifyTemplateSource(originalSource) : originalSource;
            const template = ejs.compile(templateSource, this.ejsOptions);
            const etag = crypto.createHash('md5').update(originalSource).digest('hex');
            const lastModified = fs.statSync(this.templatePath).mtime?.toUTCString();
            this.cached = {
                template,
                originalSource,
                minifiedSource: templateSource,
                etag,
                lastModified,
                originalSize,
                minifiedSize: Buffer.byteLength(templateSource, 'utf8'),
                loadedAt: new Date(),
            };
            this.lastHash = undefined;
            this.lastHtml = undefined;
            if (this.watch) this.setupWatcher();
            const opts = [
                `minTemplate:${this.minifyTemplate}`,
                `minOutput:${this.minifyOutput}`,
                ...this.compressionTypes.map((type) => `${type}:${this.compressionLevel?.[type] || '?'}`),
            ];
            this.stats.templates.loaded++;
            console.log(
                `cache-ejs: template load '${this.templateName}' from '${this.templatePath}' (${originalSize} ${this.minifyTemplate ? 'to ' + this.cached.minifiedSize + ' bytes' : ''}): ${opts.join(', ')}`
            );
        } catch (e) {
            console.error(`cache-ejs: template load '${this.templateName}' from '${this.templatePath}' error:`, e);
            throw e;
        }
    }

    setupWatcher() {
        if (this.watcher) fs.unwatchFile(this.templatePath);
        try {
            this.watcher = fs.watchFile(this.templatePath, { interval: 1000 }, (curr, prev) => {
                if (curr.mtime !== prev.mtime) {
                    console.log(`cache-ejs: template reload '${this.templateName}' (file changed)`);
                    this.stats.templates.reloaded++;
                    this.loadTemplate().catch((e) => console.error(`cache-ejs: template reload failed:`, e));
                }
            });
        } catch (e) {
            console.warn(`cache-ejs: template watch '${this.templatePath}' error:`, e);
        }
    }

    async minifyTemplateSource(templateSource) {
        if (!htmlMinifier) return this.fallbackMinifyTemplate(templateSource);
        try {
            const minified = await htmlMinifier.minify(templateSource, {
                collapseWhitespace: true,
                removeComments: true,
                removeRedundantAttributes: true,
                removeScriptTypeAttributes: true,
                removeStyleLinkTypeAttributes: true,
                useShortDoctype: true,
                minifyCSS: false, // Don't minify CSS in EJS templates (might break EJS tags)
                minifyJS: false, // Don't minify JS in EJS templates (might break EJS tags)
                preserveLineBreaks: false,
                removeEmptyAttributes: true,
                removeOptionalTags: false,
                removeAttributeQuotes: false,
                ignoreCustomFragments: [
                    /<%[\S\s]*?%>/, // eslint-disable-line regexp/match-any
                    /<%-[\S\s]*?%>/, // eslint-disable-line regexp/match-any
                    /<%=[\S\s]*?%>/, // eslint-disable-line regexp/match-any
                    /<%#[\S\s]*?%>/, // eslint-disable-line regexp/match-any
                ],
            });
            if (!minified) {
                console.warn('cache-ejs: html-minifier-terser failed for template (undefined result), using fallback');
                return this.fallbackMinifyTemplate(templateSource);
            }
            return minified;
        } catch (e) {
            console.warn('cache-ejs: html-minifier-terser failed for template, using fallback:', e.message);
            return this.fallbackMinifyTemplate(templateSource);
        }
    }
    fallbackMinifyTemplate(templateSource) {
        return templateSource
            .replaceAll(/<!--[\S\s]*?-->/, '') // eslint-disable-line regexp/match-any
            .replaceAll(/>\s+</, '><')
            .replaceAll(/\s+/, ' ')
            .trim();
    }

    async minifyOutputHTML(html) {
        if (!htmlMinifier) return this.fallbackMinifyOutput(html);
        try {
            const minified = await htmlMinifier.minify(html, {
                collapseWhitespace: true,
                removeComments: true,
                removeRedundantAttributes: true,
                removeScriptTypeAttributes: true,
                removeStyleLinkTypeAttributes: true,
                removeEmptyAttributes: true,
                removeOptionalTags: true, // More aggressive than template minification
                useShortDoctype: true,
                minifyCSS: true, // Can minify CSS in final output
                minifyJS: true, // Can minify JS in final output
                minifyURLs: true,
                removeAttributeQuotes: true, // More aggressive
                sortAttributes: true,
                sortClassName: true,
                decodeEntities: true,
                processConditionalComments: true,
                processScripts: ['text/javascript', 'application/javascript'],
                collapseInlineTagWhitespace: true,
                conservativeCollapse: false, // More aggressive
                continueOnParseError: true,
            });
            if (!minified) {
                console.warn('cache-ejs: html-minifier-terser failed for output (undefined result), using fallback');
                return this.fallbackMinifyOutput(html);
            }
            return minified;
        } catch (e) {
            console.warn('cache-ejs: html-minifier-terser failed for output, using fallback:', e.message);
            return this.fallbackMinifyOutput(html);
        }
    }
    fallbackMinifyOutput(html) {
        return html
            .replaceAll(/<!--[\S\s]*?-->/, '') // eslint-disable-line regexp/match-any
            .replaceAll(/>\s+</, '><')
            .replaceAll(/\s+/, ' ')
            .replaceAll(/\s*([,:;{}])\s*/, '$1')
            .replaceAll(/;\s*}/, '}') // eslint-disable-line regexp/strict
            .replaceAll(/\s+(?=<\/)/, '')
            .replaceAll(/(?<=>)\s+/, '')
            .replaceAll(/"\s+>/, '">')
            .replaceAll(/\s+\/>/, '/>')
            .trim();
    }

    compressionWrapper(name, detail, compressionFn, html, options = {}) {
        const htmlSize = Buffer.byteLength(html, 'utf8');
        if (!this.compressionTypes.includes(name)) return undefined;

        if (htmlSize <= this.compressionThreshold) {
            this.stats.compression.belowThreshold.count++;
            this.stats.compression.belowThreshold.totalSize += htmlSize;
            return undefined;
        }

        const start = process.hrtime.bigint();
        const compressed = compressionFn(html, options);
        const time = Number(process.hrtime.bigint() - start) / 1_000_000;
        const compressedSize = compressed.length;
        const reduction = Math.round((1 - compressedSize / htmlSize) * 100);

        // Check if we should skip due to insufficient compression
        const ratio = (compressedSize / htmlSize) * 100;
        if (this.compressionRatio && ratio >= this.compressionRatio) {
            this.stats.compression.skipRatio.count++;
            this.stats.compression.skipRatio.totalSize += htmlSize;
            if (this.debug)
                console.log(
                    `cache-ejs: compressed [${name}:${detail}] ${htmlSize} -> ${compressedSize} bytes (${reduction}% reduction, ratio ${ratio.toFixed(1)}%) in ${time.toFixed(2)}ms - SKIPPED`
                );
            this.updateCompressionStats(name, htmlSize, compressedSize, time, false);
            return undefined;
        }

        if (this.debug)
            console.log(`cache-ejs: compressed [${name}:${detail}] ${htmlSize} -> ${compressedSize} bytes (${reduction}% reduction) in ${time.toFixed(2)}ms`);

        this.updateCompressionStats(name, htmlSize, compressedSize, time, true);
        return compressed;
    }

    async renderDirect(data) {
        if (!this.cached) throw new Error(`Template '${this.templateName}' not loaded`);
        const renderStart = process.hrtime.bigint();
        try {
            const hash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
            if (this.lastHash === hash && this.lastHtml) {
                this.updateCacheStats(true);
                return this.lastHtml;
            }
            this.updateCacheStats(false);
            let html = this.cached.template(data);
            if (this.minifyOutput) html = await this.minifyOutputHTML(html);
            const htmlCompressed = {
                // order in priority of serving
                br: this.compressionWrapper('brotli', `${this.compressionLevel['brotli']}`, (html, opts) => zlib.brotliCompressSync(html, opts), html, {
                    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: this.compressionLevel['brotli'] },
                }),
                gzip: this.compressionWrapper('gzip', `${this.compressionLevel['gzip']}`, (html, opts) => zlib.gzipSync(html, opts), html, {
                    level: this.compressionLevel['gzip'],
                }),
            };
            this.lastHash = hash;
            this.lastHtml = {
                html,
                htmlCompressed,
                etag: `${this.cached.etag}-${hash}`,
                lastModified: new Date().toUTCString(),
                isMinifiedTemplate: this.minifyTemplate,
                isMinifiedOutput: this.minifyOutput,
            };
            const renderTime = Number(process.hrtime.bigint() - renderStart) / 1_000_000;
            this.stats.templates.renderCount++;
            this.stats.templates.renderTime += renderTime;
            return this.lastHtml;
        } catch (e) {
            this.stats.templates.renderErrors++;
            console.error(`cache-ejs: direct render error for '${this.templateName}':`, e);
            throw e;
        }
    }

    getDiagnostics() {
        return {
            templateName: this.templateName,
            templatePath: this.templatePath,
            etag: this.cached?.etag,
            lastModified: this.cached?.lastModified,
            loadedAt: this.cached?.loadedAt,
            originalSize: this.formatSize(this.cached?.originalSize || 0),
            minifiedSize: this.formatSize(this.cached?.minifiedSize || 0),
            templateMinificationEnabled: this.minifyTemplate,
            outputMinificationEnabled: this.minifyOutput,
            watchingFile: this.watch,
            isLoaded: !!this.cached,
            stats: this.getStats(),
        };
    }

    getStats() {
        const avgRenderTime = this.stats.templates.renderCount > 0 ? (this.stats.templates.renderTime / this.stats.templates.renderCount).toFixed(2) : 0;
        return {
            templateName: this.templateName,
            templates: {
                ...this.stats.templates,
                avgRenderTime: `${avgRenderTime}ms`,
            },
            compression: {
                ...this.stats.compression,
                total: {
                    ...this.stats.compression.total,
                    avgCompressionTime:
                        this.stats.compression.total.compressed > 0
                            ? `${(this.stats.compression.total.compressionTime / this.stats.compression.total.compressed).toFixed(2)}ms`
                            : '0ms',
                    totalBytesSaved: this.formatSize(this.stats.compression.total.bytesSaved),
                },
                byType: Object.entries(this.stats.compression.byType).reduce((acc, [type, stats]) => {
                    acc[type] = {
                        ...stats,
                        avgCompressionTime: stats.compressed > 0 ? `${(stats.compressionTime / stats.compressed).toFixed(2)}ms` : '0ms',
                        totalBytesSaved: this.formatSize(stats.bytesSaved),
                        avgCompressionRatio: `${stats.avgCompressionRatio}%`,
                    };
                    return acc;
                }, {}),
                belowThreshold: {
                    ...this.stats.compression.belowThreshold,
                    avgSize:
                        this.stats.compression.belowThreshold.count > 0
                            ? this.formatSize(this.stats.compression.belowThreshold.totalSize / this.stats.compression.belowThreshold.count)
                            : '0B',
                },
                skipRatio: {
                    ...this.stats.compression.skipRatio,
                    avgSize:
                        this.stats.compression.skipRatio.count > 0
                            ? this.formatSize(this.stats.compression.skipRatio.totalSize / this.stats.compression.skipRatio.count)
                            : '0B',
                },
            },
            cache: {
                ...this.stats.cache,
                hitRate: `${this.stats.cache.hitRate}%`,
            },
        };
    }

    formatSize(bytes) {
        if (bytes === 0) return '0B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Number.parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ['B', 'KB', 'MB', 'GB'][i];
    }

    dispose() {
        if (this.watcher) {
            fs.unwatchFile(this.templatePath);
            this.watcher = undefined;
        }
        this.cached = undefined;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (templatePath, options = {}) {
    const cache = new SingleEJSTemplateCache(templatePath, options);
    return {
        getDiagnostics: () => cache.getDiagnostics(),
        getStats: () => cache.getStats(),
        dispose: () => cache.dispose(),
        routeHandler: (dataProvider) => {
            return async (req, res) => {
                try {
                    const data = typeof dataProvider === 'function' ? await dataProvider(req) : dataProvider;
                    const result = await cache.renderDirect(data);
                    const etag = `"${result.etag}"`;
                    res.set('ETag', etag);
                    res.set('Last-Modified', result.lastModified);
                    if (req.headers?.['if-none-match'] === etag || req.headers?.['if-modified-since'] === result.lastModified) return res.status(304).end();
                    res.set('Content-Type', 'text/html; charset=utf-8');
                    if (result.isMinifiedTemplate || result.isMinifiedOutput)
                        res.set(
                            'X-Minified',
                            [result.isMinifiedTemplate ? 'template' : undefined, result.isMinifiedOutput ? 'output' : undefined].filter(Boolean).join(',')
                        );
                    for (const [type, html] of Object.entries(result.htmlCompressed)) {
                        if (html && req.headers['accept-encoding']?.includes(type)) {
                            res.set('Content-Encoding', type);
                            res.set('Vary', 'Accept-Encoding');
                            return res.send(html);
                        }
                    }
                    return res.send(result.html);
                } catch (e) {
                    console.error('cache-ejs: routeHandler error:', e);
                    return res.status(500).send('Internal Server Error');
                }
            };
        },
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
