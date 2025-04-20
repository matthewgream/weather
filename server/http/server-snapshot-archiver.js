// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function initialiseSnapshot(xxx, prefix, directory) {
    const {
        SnapshotThumbnailsManager,
        SnapshotDirectoryManager,
        SnapshotContentsManager,
        SnapshotTimelapseManager,
    } = require('./server-functions-snapshot.js');
    const snapshotThumbnailsCacheSize = 2048;
    const snapshotThumbnailsCacheTtl = 60 * 60 * 1000;
    const snapshotThumbnailsWidthDefault = 200;
    const snapshotDirectory = directory + '/snapshots';
    const timelapseDirectory = directory + '/timelapse';

    //

    const fs = require('fs');
    const path = require('path');
    const sharp = require('sharp');
    const crypto = require('crypto');

    function getFormattedDate(date) {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        if (!date || date.length < 8) return 'Invalid date';
        return `${date.substring(0, 4)} ${months[parseInt(date.substring(4, 6)) - 1]} ${parseInt(date.substring(6, 8))}`;
    }
    function getFormattedTime(time) {
        if (!time || time.length < 6) return 'Invalid time';
        return `${parseInt(time.substring(0, 2)).toString().padStart(2, '0')}:${parseInt(time.substring(2, 4)).toString().padStart(2, '0')}:${parseInt(time.substring(4, 6)).toString().padStart(2, '0')}`;
    }
    function getThumbnailKey(file, width) {
        const mtime = fs.statSync(file).mtime.getTime();
        return crypto.createHash('md5').update(`${file}-${width}-${mtime}`).digest('hex');
    }

    const snapshotThumbnailsManager = new SnapshotThumbnailsManager({
        maxEntries: snapshotThumbnailsCacheSize,
        ttl: snapshotThumbnailsCacheTtl,
    });
    const snapshotDirectoryManager = new SnapshotDirectoryManager({
        directory: snapshotDirectory,
    });
    const snapshotContentsManager = new SnapshotContentsManager({
        directory: snapshotDirectory,
    });
    const snapshotTimelapseManager = new SnapshotTimelapseManager({
        directory: timelapseDirectory,
    });
    process.on('SIGTERM', () => {
        snapshotDirectoryManager.dispose();
        snapshotContentsManager.dispose();
        snapshotThumbnailsManager.dispose();
        snapshotTimelapseManager.dispose();
    });

    //

    function getSnapshotListOfDates() {
        return {
            entries: snapshotDirectoryManager.getListOfDates().map(({ dateCode }) => ({ dateCode, dateFormatted: getFormattedDate(dateCode) })),
        };
    }
    function getSnapshotListForDate(date) {
        return {
            dateFormatted: getFormattedDate(date),
            entries: snapshotContentsManager.getListForDate(date).map(({ file }) => ({ file, timeFormatted: getFormattedTime(file.slice(17, 23)) })),
        };
    }
    function getTimelapseListOfFiles() {
        return {
            entries: snapshotTimelapseManager.getListOfFiles().map(({ file }) => ({ dateCode: file.slice (10, 18), file, dateFormatted: getFormattedDate(file.slice(10, 18)) })),
        };
    }
    function getSnapshotImageFilename(file) {
        const match = file.match(/snapshot_(\d{8})\d{6}\.jpg$/);
        if (!match?.[1]) return undefined;
        const date = match[1];
        const filePath = path.join(snapshotDirectory, date, file);
        if (!fs.existsSync(filePath)) return null;
        return filePath;
    }

    async function getSnapshotImageThumbnail(file, width) {
        const match = file.match(/snapshot_(\d{8})\d{6}\.jpg/);
        if (!match?.[1]) return null;
        const dateDir = match[1];
        const filePath = path.join(snapshotDirectory, dateDir, file);
        if (!fs.existsSync(filePath)) return null;
        const key = getThumbnailKey(filePath, width);
        let thumbnail = snapshotThumbnailsManager.retrieve(key);
        if (!thumbnail) {
            thumbnail = await sharp(filePath).resize(width).jpeg({ quality: 70 }).toBuffer();
            snapshotThumbnailsManager.insert(key, thumbnail);
        }
        return thumbnail;
    }

    function getTimelpaseVideoFilename(file) {
        const match = file.match(/timelapse_(\d{8})\.mp4$/);
        if (!match?.[1]) return undefined;
        const filePath = path.join(timelapseDirectory, file);
        if (!fs.existsSync(filePath)) return null;
        return filePath;
    }

    //

    xxx.get(prefix + '/list', (req, res) => {
        return res.render('server-snapshot-list', {
            snapshotList: getSnapshotListOfDates(),
            timelapseList: getTimelapseListOfFiles(),
        });
    });
    xxx.get(prefix + '/list/:date', (req, res) => {
        return res.render('server-snapshot-date', getSnapshotListForDate(req.params.date));
    });
    xxx.get(prefix + '/file/:file', (req, res) => {
        const file = req.params.file;
        filename = getSnapshotImageFilename(file);
        if (!filename) filename = getTimelpaseVideoFilename(file);
        if (!filename) return res.status(404).send('File not found');
        return res.sendFile(filename);
    });
    xxx.get(prefix + '/thumb/:file', async (req, res) => {
        const file = req.params.file;
        const width = parseInt(req.query.w) || snapshotThumbnailsWidthDefault;
        try {
            const imagedata = await getSnapshotImageThumbnail(file, width);
            if (!imagedata) return res.status(404).send('Thumbnail not found');
            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=300');
            return res.send(imagedata);
        } catch (error) {
            console.error('Error generating thumbnail:', error);
            return res.status(500).send('Error generating thumbnail');
        }
    });

    //

    return {
        getUrlList: () => prefix + '/list',
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (xxx, prefix, directory) {
    return initialiseSnapshot(xxx, prefix, directory);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
