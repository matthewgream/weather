// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const crypto = require('crypto');
const sharp = require('sharp');

let debugSnapshotFunctions = false;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

class SnapshotDirectoryManager {
    constructor({ directory }) {
        this.snapshotsDir = directory;
        this.snapshotsCache = [];
        this.isInitialized = false;
        this.watchers = [];
        this.expiryTime = 30 * 60 * 1000;
        this.cleanupInterval = setInterval(() => this.checkCacheExpiry(), this.expiryTime);
        this.lastAccessed = Date.now();
        this.initializeCache();
    }
    initializeCache() {
        try {
            this.snapshotsCache = this.readSnapshotDirectories();
            this.isInitialized = true;
            this.setupWatcher();
            debugSnapshotFunctions && console.log(`SnapshotDirectoryManager(${this.snapshotsDir}): initialized with ${this.snapshotsCache.length} entries`);
        } catch (error) {
            console.error(`SnapshotDirectoryManager(${this.snapshotsDir}): failed to initialize:`, error);
        }
    }
    readSnapshotDirectories() {
        try {
            return fs
                .readdirSync(this.snapshotsDir)
                .filter((item) => fs.statSync(path.join(this.snapshotsDir, item)).isDirectory() && /^\d{8}$/.test(item))
                .sort((a, b) => b.localeCompare(a))
                .map((dateCode) => ({ dateCode }));
        } catch (error) {
            console.error(`SnapshotDirectoryManager(${this.snapshotsDir}): error reading directory:`, error);
            return [];
        }
    }
    setupWatcher() {
        this.closeWatchers();
        const watcher = chokidar.watch(this.snapshotsDir, {
            persistent: true,
            ignoreInitial: true,
            depth: 0,
            awaitWriteFinish: true,
            ignored: /(^|[\/\\])\../, // eslint-disable-line no-useless-escape
        });
        watcher.on('addDir', (dirPath) => {
            const dirName = path.basename(dirPath);
            if (/^\d{8}$/.test(dirName)) this.cacheInsertDirectory(dirName);
        });
        watcher.on('unlinkDir', (dirPath) => {
            const dirName = path.basename(dirPath);
            if (/^\d{8}$/.test(dirName)) this.cacheRemoveDirectory(dirName);
        });
        watcher.on('error', (error) => {
            console.error(`SnapshotDirectoryManager(${this.snapshotsDir}): watcher error: ${error}`);
        });
        this.watchers.push(watcher);
    }
    cacheInsertDirectory(dirName) {
        if (!this.snapshotsCache.some((item) => item.dateCode === dirName)) {
            this.snapshotsCache.push({ dateCode: dirName });
            this.snapshotsCache.sort((a, b) => b.dateCode.localeCompare(a.dateCode));
            debugSnapshotFunctions && console.log(`SnapshotDirectoryManager(${this.snapshotsDir}): insert directory: ${dirName}`);
        }
    }
    cacheRemoveDirectory(dirName) {
        const initialLength = this.snapshotsCache.length;
        this.snapshotsCache = this.snapshotsCache.filter((item) => item.dateCode !== dirName);
        if (initialLength !== this.snapshotsCache.length)
            debugSnapshotFunctions && console.log(`SnapshotDirectoryManager(${this.snapshotsDir}): remove directory: ${dirName}`);
    }
    getListOfDates() {
        if (!this.isInitialized) this.initializeCache();
        this.lastAccessed = Date.now();
        return this.snapshotsCache;
    }
    checkCacheExpiry() {
        const now = Date.now();
        if (now - this.lastAccessed > this.expiryTime && this.isInitialized) {
            debugSnapshotFunctions && console.log(`SnapshotDirectoryManager(${this.snapshotsDir}): flushing (inactivity timeout)`);
            this.closeWatchers();
            this.snapshotsCache = [];
            this.isInitialized = false;
        }
    }
    closeWatchers() {
        this.watchers.forEach((watcher) => {
            try {
                watcher.close();
            } catch (error) {
                console.error(`SnapshotDirectoryManager(${this.snapshotsDir}): watcher error (on close):`, error);
            }
        });
        this.watchers = [];
    }
    dispose() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.closeWatchers();
        this.snapshotsCache = [];
        this.isInitialized = false;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

class SnapshotContentsManager {
    constructor({ directory }) {
        this.snapshotsDir = directory;
        this.cache = new Map();
        this.watchers = new Map();
        this.watcherTimestamps = new Map();
        this.cacheTimestamps = new Map();
        this.maxWatchers = 10;
        this.expiryTime = 30 * 60 * 1000;
        this.cleanupInterval = setInterval(() => this.cleanup(), this.expiryTime);
    }
    getListForDate(date) {
        this.cacheTimestamps.set(date, Date.now());
        if (this.cache.has(date)) return this.cache.get(date);
        try {
            const dateDir = path.join(this.snapshotsDir, date);
            if (!fs.existsSync(dateDir)) {
                this.cache.set(date, []);
                return [];
            }
            const snapshots = this.readSnapshotsFromDirectory(dateDir);
            this.cache.set(date, snapshots);
            this.watchDirectory(date, dateDir);
            return snapshots;
        } catch (error) {
            console.error(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) error reading entries:`, error);
            return [];
        }
    }
    readSnapshotsFromDirectory(dirPath) {
        return fs
            .readdirSync(dirPath)
            .filter((file) => file.startsWith('snapshot_') && file.endsWith('.jpg'))
            .sort((a, b) => b.localeCompare(a))
            .map((file) => ({ file }));
    }
    closeWatcher(date) {
        if (this.watchers.has(date)) {
            try {
                this.watchers.get(date).close();
                this.watchers.delete(date);
                this.watcherTimestamps.delete(date);
                debugSnapshotFunctions &&
                    console.log(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) watcher closed (watchers=${this.watchers.size})`);
            } catch (error) {
                console.error(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) watcher error:`, error);
            }
        }
    }
    watchDirectory(date, dirPath) {
        if (this.watchers.has(date)) return;
        this.enforceWatcherLimit();
        const watcher = chokidar.watch(dirPath, {
            persistent: true,
            ignoreInitial: true,
            depth: 0,
            awaitWriteFinish: true,
            ignored: /(^|[\/\\])\../, // eslint-disable-line no-useless-escape
        });
        watcher.on('all', (event, filePath) => {
            const fileName = path.basename(filePath);
            if (fileName.startsWith('snapshot_') && fileName.endsWith('.jpg')) {
                debugSnapshotFunctions && console.log(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) watcher event (${event}: ${fileName})`);
                this.closeWatcher(date);
                this.cache.delete(date);
                this.cacheTimestamps.delete(date);
            }
        });
        watcher.on('error', (error) => {
            console.error(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) Watcher error:`, error);
        });
        this.watchers.set(date, watcher);
        this.watcherTimestamps.set(date, Date.now());
        debugSnapshotFunctions && console.log(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) watcher started (watchers=${this.watchers.size})`);
    }
    enforceWatcherLimit() {
        if (this.watchers.size < this.maxWatchers) return;
        const entries = Array.from(this.watcherTimestamps.entries()).sort((a, b) => a[1] - b[1]);
        const numToClose = this.watchers.size - this.maxWatchers + 1; // +1 for the new one
        for (let i = 0; i < numToClose; i++) {
            if (i < entries.length) {
                const [date] = entries[i];
                debugSnapshotFunctions && console.log(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) watcher closed (limit reached)`);
                this.closeWatcher(date);
            }
        }
    }
    cleanup() {
        const now = Date.now();
        this.watcherTimestamps.forEach((timestamp, date) => {
            if (now - timestamp > this.expiryTime) {
                debugSnapshotFunctions && console.log(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) watcher closed (inactivity timeout)`);
                this.closeWatcher(date);
            }
        });
        this.cacheTimestamps.forEach((timestamp, date) => {
            if (now - timestamp > this.expiryTime) {
                debugSnapshotFunctions && console.log(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) flushing (inactivity timeout)`);
                this.cache.delete(date);
                this.cacheTimestamps.delete(date);
            }
        });
    }
    dispose() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.watchers.forEach((watcher, date) => {
            try {
                watcher.close();
                debugSnapshotFunctions && console.log(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) watcher closed`);
            } catch (error) {
                console.error(`SnapshotContentsManager(${this.snapshotsDir}): watcher error (on close):`, error);
            }
        });
        this.watchers.clear();
        this.watcherTimestamps.clear();
        this.cache.clear();
        this.cacheTimestamps.clear();
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

class SnapshotThumbnailsManager {
    constructor(options = {}) {
        this.cacheEntries = {};
        this.cacheDetails = {};
        this.cacheSize = options.size || 2048;
        this.cacheTime = options.time || 24 * 60 * 60 * 1000;
        if (options.autoCleanup !== false) {
            const cleanupInterval = options.cleanupInterval || this.cacheTime / 4;
            this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
        }
    }
    insert(key, value) {
        const now = Date.now();
        this.cacheEntries[key] = value;
        this.cacheDetails[key] = {
            added: now,
            lastAccessed: now,
        };
        this.cleanup();
        return value;
    }
    retrieve(key) {
        const entry = this.cacheEntries[key];
        if (entry !== undefined) this.cacheDetails[key].lastAccessed = Date.now();
        return entry;
    }
    //   has(key) {
    //     return this.cacheEntries.hasOwnProperty(key);
    //   }
    //   remove(key) {
    //     delete this.cacheEntries[key];
    //     delete this.cacheDetails[key];
    //   }
    clear() {
        this.cacheEntries = {};
        this.cacheDetails = {};
    }
    //   size() {
    //     return Object.keys(this.cacheEntries).length;
    //   }
    cleanup() {
        const now = Date.now();
        const cacheKeys = Object.keys(this.cacheEntries);
        if (cacheKeys.length <= this.cacheSize) {
            cacheKeys.forEach((key) => {
                if (now - this.cacheDetails[key].added > this.cacheTime) {
                    delete this.cacheEntries[key];
                    delete this.cacheDetails[key];
                }
            });
            return;
        }
        const sortedKeys = cacheKeys.sort((a, b) => this.cacheDetails[a].lastAccessed - this.cacheDetails[b].lastAccessed);
        let keysToRemove = sortedKeys.filter((key) => now - this.cacheDetails[key].added > this.cacheTime);
        if (cacheKeys.length - keysToRemove.length > this.cacheSize) {
            const additionalToRemove = cacheKeys.length - keysToRemove.length - Math.floor(this.cacheSize * 0.9);
            if (additionalToRemove > 0)
                keysToRemove = keysToRemove.concat(sortedKeys.filter((key) => !keysToRemove.includes(key)).slice(0, additionalToRemove));
        }
        keysToRemove.forEach((key) => {
            delete this.cacheEntries[key];
            delete this.cacheDetails[key];
        });
    }
    dispose() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.clear();
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

class SnapshotTimelapseManager {
    constructor({ directory }) {
        this.timelapseDir = directory;
        this.timelapseCache = [];
        this.isInitialized = false;
        this.watcher = null;
        this.expiryTime = 30 * 60 * 1000;
        this.cleanupInterval = setInterval(() => this.checkCacheExpiry(), this.expiryTime);
        this.lastAccessed = Date.now();
        this.initializeCache();
    }
    initializeCache() {
        try {
            this.timelapseCache = this.readTimelapseFiles();
            this.isInitialized = true;
            this.setupWatcher();
            debugSnapshotFunctions && console.log(`SnapshotTimelapseManager(${this.timelapseDir}): initialized with ${this.timelapseCache.length} entries`);
        } catch (error) {
            console.error(`SnapshotTimelapseManager(${this.timelapseDir}): failed to initialize:`, error);
        }
    }
    readTimelapseFiles() {
        try {
            return fs
                .readdirSync(this.timelapseDir)
                .filter((file) => file.startsWith('timelapse_') && file.endsWith('.mp4'))
                .sort((a, b) => b.localeCompare(a))
                .map((file) => ({ file }));
        } catch (error) {
            console.error(`SnapshotTimelapseManager(${this.timelapseDir}): error reading directory:`, error);
            return [];
        }
    }
    setupWatcher() {
        this.closeWatcher();
        const watcher = chokidar.watch(this.timelapseDir, {
            persistent: true,
            ignoreInitial: true,
            depth: 0,
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100,
            },
            ignored: /(^|[\/\\])\../, // eslint-disable-line no-useless-escape
        });
        watcher.on('add', (filePath) => {
            const fileName = path.basename(filePath);
            if (fileName.startsWith('timelapse_') && fileName.endsWith('.mp4')) this.updateCacheWithNewFile(fileName, filePath);
        });
        watcher.on('unlink', (filePath) => {
            const fileName = path.basename(filePath);
            if (fileName.startsWith('timelapse_') && fileName.endsWith('.mp4')) this.removeFileFromCache(fileName);
        });
        watcher.on('error', (error) => {
            console.error(`SnapshotTimelapseManager(${this.timelapseDir}): watcher error: ${error}`);
        });
        this.watcher = watcher;
    }
    updateCacheWithNewFile(fileName, filePath) {
        const dateCode = fileName.slice(10, 18);
        const existingIndex = this.timelapseCache.findIndex((item) => item.file === fileName);
        if (existingIndex !== -1) {
            this.timelapseCache[existingIndex] = {
                file: fileName,
                dateCode,
                filePath,
                fileSizeBytes: fs.statSync(filePath).size,
            };
            debugSnapshotFunctions && console.log(`SnapshotTimelapseManager(${this.timelapseDir}): updated file: ${fileName}`);
        } else {
            this.timelapseCache.push({
                file: fileName,
                dateCode,
                filePath,
                fileSizeBytes: fs.statSync(filePath).size,
            });
            this.timelapseCache.sort((a, b) => b.file.localeCompare(a.file));
            debugSnapshotFunctions && console.log(`SnapshotTimelapseManager(${this.timelapseDir}): adding new file: ${fileName}`);
        }
    }
    removeFileFromCache(fileName) {
        const initialLength = this.timelapseCache.length;
        this.timelapseCache = this.timelapseCache.filter((item) => item.file !== fileName);
        if (initialLength !== this.timelapseCache.length)
            debugSnapshotFunctions && console.log(`SnapshotTimelapseManager(${this.timelapseDir}): removed file: ${fileName}`);
    }
    getListOfFiles() {
        if (!this.isInitialized) this.initializeCache();
        this.lastAccessed = Date.now();
        return this.timelapseCache;
    }
    checkCacheExpiry() {
        const now = Date.now();
        if (now - this.lastAccessed > this.expiryTime && this.isInitialized) {
            debugSnapshotFunctions && console.log(`SnapshotTimelapseManager(${this.timelapseDir}): flushing (inactivity timeout)`);
            this.closeWatcher();
            this.timelapseCache = [];
            this.isInitialized = false;
        }
    }
    closeWatcher() {
        if (this.watcher) {
            try {
                this.watcher.close();
                debugSnapshotFunctions && console.log(`SnapshotTimelapseManager(${this.timelapseDir}): watcher closed`);
            } catch (error) {
                console.error(`SnapshotTimelapseManager(${this.timelapseDir}): watcher error (on close):`, error);
            }
            this.watcher = null;
        }
    }
    dispose() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.closeWatcher();
        this.timelapseCache = [];
        this.isInitialized = false;
        debugSnapshotFunctions && console.log(`SnapshotTimelapseManager(${this.timelapseDir}): disposed`);
    }
}

function getThumbnailKey(file, width) {
    const mtime = fs.statSync(file).mtime.getTime();
    return crypto.createHash('md5').update(`${file}-${width}-${mtime}`).digest('hex');
}
async function getThumbnailData(manager, filePath, width, quality) {
    if (!fs.existsSync(filePath)) return null;
    const key = getThumbnailKey(filePath, width);
    let thumbnail = manager.retrieve(key);
    if (!thumbnail) {
        thumbnail = await sharp(filePath).resize(width).jpeg({ quality }).toBuffer();
        manager.insert(key, thumbnail);
    }
    return thumbnail;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    debugSnapshotFunctions,
    SnapshotDirectoryManager,
    SnapshotContentsManager,
    SnapshotThumbnailsManager,
    SnapshotTimelapseManager,
    getThumbnailData,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
