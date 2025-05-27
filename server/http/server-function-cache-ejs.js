// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ejs = require('ejs');

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
        this.minify = options.minify !== false; // Default true
        this.minifyOutput = options.minifyOutput === true; // Default false
        this.watch = options.watch !== false; // Default true
        this.ejsOptions = {
            cache: false,
            compileDebug: false,
            filename: this.templatePath,
            ...options.ejsOptions,
        };
        this.cached = undefined;
        this.watcher = undefined;
        this.isLoading = true;
        this.loadTemplate()
            .then(() => {
                this.isLoading = false;
            })
            .catch((e) => {
                console.error(`cache-ejs: failed to load template:`, e);
                this.isLoading = false;
            });
    }

    async loadTemplate() {
        try {
            const originalSource = fs.readFileSync(this.templatePath, 'utf8'),
                originalSize = Buffer.byteLength(originalSource, 'utf8');
            let templateSource = originalSource;
            if (this.minify) templateSource = await this.minifyTemplateSource(originalSource);
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
            if (this.watch) this.setupWatcher();
            console.log(
                `cache-ejs: template load '${this.templateName}' from '${this.templatePath}' (${originalSize} ${this.minify ? ' to ' + this.cached.minifiedSize + ' bytes' : ''})`
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

    async renderDirect(data) {
        if (!this.cached) throw new Error(`Template '${this.templateName}' not loaded`);
        try {
            let html = this.cached.template(data);
            const etag = `${this.cached.etag}-${crypto.createHash('md5').update(JSON.stringify(data)).digest('hex')}`;
            const time = new Date().toUTCString();
            if (this.minifyOutput) {
                //const originalSize = Buffer.byteLength(html, 'utf8');
                html = await this.minifyOutputHTML(html);
                //const minifiedSize = Buffer.byteLength(html, 'utf8');
                //console.log(`cache-ejs: output minified (${originalSize} to ${minifiedSize} bytes)`);
            }
            return {
                html,
                etag,
                lastModified: time,
                isMinifiedTemplate: this.minify,
                isMinifiedOutput: this.minifyOutput,
            };
        } catch (e) {
            console.error(`cache-ejs: direct render error for '${this.templateName}':`, e);
            throw e;
        }
    }

    getInfo() {
        return {
            templateName: this.templateName,
            templatePath: this.templatePath,
            etag: this.cached?.etag,
            lastModified: this.cached?.lastModified,
            loadedAt: this.cached?.loadedAt,
            originalSize: this.formatSize(this.cached?.originalSize || 0),
            minifiedSize: this.formatSize(this.cached?.minifiedSize || 0),
            templateMinificationEnabled: this.minify,
            outputMinificationEnabled: this.minifyOutput,
            watchingFile: this.watch,
            isLoaded: !!this.cached,
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
        getInfo: () => cache.getInfo(),
        dispose: () => cache.dispose(),
        routeHandler: (dataProvider) => {
            return async (req, res) => {
                try {
                    const data = typeof dataProvider === 'function' ? await dataProvider(req) : dataProvider;
                    const result = await cache.renderDirect(data);
                    res.set('Content-Type', 'text/html; charset=utf-8');
                    res.set('ETag', `"${result.etag}"`);
                    res.set('Last-Modified', result.lastModified);
                    if (result.isMinifiedTemplate || result.isMinifiedOutput)
                        res.set(
                            'X-Minified',
                            [result.isMinifiedTemplate ? 'template' : undefined, result.isMinifiedOutput ? 'output' : undefined].filter(Boolean).join(',')
                        );
                    if (req.headers?.['if-none-match'] === `"${result.etag}"` || req.headers?.['if-modified-since'] === result.lastModified)
                        return res.status(304).end();
                    res.send(result.html);
                } catch (e) {
                    console.error('cache-ejs: routeHandler error:', e);
                    res.status(500).send('Internal Server Error');
                }
            };
        },
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
