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
            if (this.minify) {
                templateSource = await this.minifyTemplateSource(originalSource);
                console.log(`cache-ejs: pre-minified template source (${originalSize} --> ${Buffer.byteLength(templateSource, 'utf8')} bytes)`);
            }
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
                `cache-ejs: template load '${this.templateName}' from '${this.templatePath}' (${originalSize} bytes${this.minify ? ' to ' + this.cached.minifiedSize + ' bytes' : ''})`
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
    render(data = {}) {
        if (!this.cached) throw new Error(`Template '${this.templateName}' not loaded`);
        try {
            console.log(`cache-ejs: rendering '${this.templateName}' with data keys: [${Object.keys(data).join(', ')}]`);
            const html = this.cached.template(data);
            console.log(`cache-ejs: rendered '${this.templateName}' (${html.length} chars)`);
            return {
                html,
                etag: this.cached.etag,
                lastModified: this.cached.lastModified,
                isMinified: this.minify, // Template source was pre-minified
            };
        } catch (e) {
            console.error(`cache-ejs: render error for '${this.templateName}':`, e);
            throw new Error(`Failed to render template '${this.templateName}': ${e.message}`);
        }
    }

    async minifyTemplateSource(templateSource) {
        if (!htmlMinifier) {
            console.log('cache-ejs: using fallback template minifier');
            return this.fallbackMinifyTemplate(templateSource);
        }
        try {
            console.log('cache-ejs: using html-minifier-terser for template source');
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
                console.warn('cache-ejs: html-minifier-terser returned undefined for template, using fallback');
                return this.fallbackMinifyTemplate(templateSource);
            }
            return minified;
        } catch (e) {
            console.warn('cache-ejs: template minification failed, using fallback:', e.message);
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
    createMiddleware() {
        return (req, res, next) => {
            const originalRender = res.render;
            res.render = (templateName, data, callback) => {
                console.log(`cache-ejs: render request for '${templateName}' (our template: '${this.templateName}')`);
                if (templateName === this.templateName) {
                    try {
                        console.log(`cache-ejs: using cached template for '${templateName}'`);
                        const result = this.render(data);
                        res.set('Content-Type', 'text/html; charset=utf-8');
                        res.set('ETag', `"${result.etag}"`);
                        res.set('Last-Modified', result.lastModified);
                        if (result.isMinified) res.set('X-Minified', 'true');
                        if (req.headers?.['if-none-match'] === `"${result.etag}"`) return res.status(304).end();
                        if (req.headers?.['if-modified-since'] === result.lastModified) return res.status(304).end();
                        console.log(`cache-ejs: sending response (${result.html.length} chars)`);
                        if (callback) {
                            callback(undefined, result.html);
                        } else {
                            res.send(result.html);
                        }
                        return;
                    } catch (e) {
                        console.error(`cache-ejs: error rendering '${templateName}':`, e);
                        console.warn(`cache-ejs: falling back to original render for '${templateName}':`, e.message);
                    }
                } else console.log(`cache-ejs: passing through to original render for '${templateName}'`);
                originalRender.call(res, templateName, data, callback);
            };
            next();
        };
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
            minificationEnabled: this.minify,
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
        middleware: cache.createMiddleware(),
        render: (data) => cache.render(data),
        getInfo: () => cache.getInfo(),
        dispose: () => cache.dispose(),
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
