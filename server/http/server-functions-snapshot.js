// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

let debugSnapshotFunctions = true;

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
            console.log(`SnapshotDirectoryManager(${this.snapshotsDir}): initialized with ${this.snapshotsCache.length} entries`);
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
            ignored: /(^|[\/\\])\../, // Ignore dotfiles
        });
        watcher.on('addDir', (dirPath) => {
            const dirName = path.basename(dirPath);
            if (/^\d{8}$/.test(dirName)) this.updateCacheWithNewDirectory(dirName);
        });
        watcher.on('error', (error) => {
            console.error(`SnapshotDirectoryManager(${this.snapshotsDir}): watcher error: ${error}`);
        });
        this.watchers.push(watcher);
    }
    updateCacheWithNewDirectory(dirName) {
        if (!this.snapshotsCache.some((item) => item.dateCode === dirName)) {
            this.snapshotsCache.push({ dateCode: dirName });
            this.snapshotsCache.sort((a, b) => b.dateCode.localeCompare(a.dateCode));
            console.log(`SnapshotDirectoryManager(${this.snapshotsDir}): adding new directory: ${dirName}`);
        }
    }
    getListOfDates() {
        if (!this.isInitialized) this.initializeCache();
        this.lastAccessed = Date.now();
        return this.snapshotsCache;
    }
    checkCacheExpiry() {
        const now = Date.now();
        if (now - this.lastAccessed > this.expiryTime && this.isInitialized) {
            console.log(`SnapshotDirectoryManager(${this.snapshotsDir}): flushing (inactivity timeout)`);
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
            ignored: /(^|[\/\\])\../, // Ignore hidden files
        });
        watcher.on('all', (event, filePath) => {
            const fileName = path.basename(filePath);
            if (fileName.startsWith('snapshot_') && fileName.endsWith('.jpg')) {
                console.log(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) watcher event (${event}: ${fileName})`);
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
        console.log(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) watcher started (watchers=${this.watchers.size})`);
    }
    enforceWatcherLimit() {
        if (this.watchers.size < this.maxWatchers) return;
        const entries = Array.from(this.watcherTimestamps.entries()).sort((a, b) => a[1] - b[1]);
        const numToClose = this.watchers.size - this.maxWatchers + 1; // +1 for the new one
        for (let i = 0; i < numToClose; i++) {
            if (i < entries.length) {
                const [dateToClose] = entries[i];
                console.log(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) watcher closed (limit reached)`);
                this.closeWatcher(dateToClose);
            }
        }
    }
    cleanup() {
        const now = Date.now();
        this.watcherTimestamps.forEach((timestamp, date) => {
            if (now - timestamp > this.expiryTime) {
                console.log(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) watcher closed (inactivity timeout)`);
                this.closeWatcher(date);
            }
        });
        this.cacheTimestamps.forEach((timestamp, date) => {
            if (now - timestamp > this.expiryTime) {
                console.log(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) flushing (inactivity timeout)`);
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
                console.log(`SnapshotContentsManager(${this.snapshotsDir}): (date=${date}) watcher closed`);
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
        this.cacheLimit = options.maxEntries || 2048;
        this.cacheTimeout = options.ttl || 24 * 60 * 60 * 1000;
        if (options.autoCleanup !== false) {
            const cleanupInterval = options.cleanupInterval || this.cacheTimeout / 4;
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
    //   clear() {
    //     this.cacheEntries = {};
    //     this.cacheDetails = {};
    //   }
    //   size() {
    //     return Object.keys(this.cacheEntries).length;
    //   }
    cleanup() {
        const now = Date.now();
        const cacheKeys = Object.keys(this.cacheEntries);
        if (cacheKeys.length <= this.cacheLimit) {
            let expiredCount = 0;
            cacheKeys.forEach((key) => {
                if (now - this.cacheDetails[key].added > this.cacheTimeout) {
                    delete this.cacheEntries[key];
                    delete this.cacheDetails[key];
                    expiredCount++;
                }
            });
            return;
        }
        const sortedKeys = cacheKeys.sort((a, b) => this.cacheDetails[a].lastAccessed - this.cacheDetails[b].lastAccessed);
        let keysToRemove = sortedKeys.filter((key) => now - this.cacheDetails[key].added > this.cacheTimeout);
        if (cacheKeys.length - keysToRemove.length > this.cacheLimit) {
            const additionalToRemove = cacheKeys.length - keysToRemove.length - Math.floor(this.cacheLimit * 0.9);
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

module.exports = {
    debugSnapshotFunctions,
    SnapshotDirectoryManager,
    SnapshotContentsManager,
    SnapshotThumbnailsManager,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
