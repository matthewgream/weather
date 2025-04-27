// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const THUMBNAIL_CACHE_SIZE = 128;
const THUMBNAIL_CACHE_TIME = 60 * 60 * 1000;
const THUMBNAIL_WIDTH_SNAPSHOT = 200;

function initialise(app, prefix, directory) {
    const directorySnapshot = directory + '/snapshots';
    const directoryTimelapse = directory + '/timelapse';

    const {
        SnapshotThumbnailsManager,
        SnapshotDirectoryManager,
        SnapshotContentsManager,
        SnapshotTimelapseManager,
        getThumbnailData,
    } = require('./server-functions-snapshot.js');
    const snapshotThumbnailsManager = new SnapshotThumbnailsManager({ size: THUMBNAIL_CACHE_SIZE, time: THUMBNAIL_CACHE_TIME });
    const snapshotDirectoryManager = new SnapshotDirectoryManager({ directory: directorySnapshot });
    const snapshotContentsManager = new SnapshotContentsManager({ directory: directorySnapshot });
    const snapshotTimelapseManager = new SnapshotTimelapseManager({ directory: directoryTimelapse });
    process.on('SIGTERM', () => {
        snapshotDirectoryManager.dispose();
        snapshotContentsManager.dispose();
        snapshotThumbnailsManager.dispose();
        snapshotTimelapseManager.dispose();
    });

    //

    function getFormattedDate(date) {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        if (!date || date.length < 8) return 'Invalid date';
        return `${date.substring(0, 4)} ${months[parseInt(date.substring(4, 6)) - 1]} ${parseInt(date.substring(6, 8))}`;
    }
    function getFormattedTime(time) {
        if (!time || time.length < 6) return 'Invalid time';
        return `${parseInt(time.substring(0, 2)).toString().padStart(2, '0')}:${parseInt(time.substring(2, 4)).toString().padStart(2, '0')}:${parseInt(time.substring(4, 6)).toString().padStart(2, '0')}`;
    }
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
            entries: snapshotTimelapseManager
                .getListOfFiles()
                .map(({ file }) => ({ dateCode: file.slice(10, 18), file, dateFormatted: getFormattedDate(file.slice(10, 18)) })),
        };
    }
    function getSnapshotFilename(file) {
        const date = file.match(/snapshot_(\d{8})\d{6}\.jpg$/)?.[1];
        if (!date) return null;
        const filePath = path.join(directorySnapshot, date, file); // subdirectory
        if (!fs.existsSync(filePath)) return null;
        return filePath;
    }
    function getTimelapseFilename(file) {
        if (!file.match(/timelapse_(\d{8})\.mp4$/)?.[1]) return null;
        const filePath = path.join(directoryTimelapse, file);
        if (!fs.existsSync(filePath)) return null;
        return filePath;
    }
    async function getThumbnailImage(file, width) {
        const date = file.match(/snapshot_(\d{8})\d{6}\.jpg$/)?.[1];
        if (!date) return null;
        return getThumbnailData(snapshotThumbnailsManager, path.join(directorySnapshot, date, file), width, width > THUMBNAIL_WIDTH_SNAPSHOT ? 80 : 70); // subdirectory
    }

    //

    app.get(prefix + '/list', (req, res) => {
        return res.render('server-snapshot-list', { snapshotList: getSnapshotListOfDates(), timelapseList: getTimelapseListOfFiles() });
    });
    app.get(prefix + '/list/:date', (req, res) => {
        return res.render('server-snapshot-date', getSnapshotListForDate(req.params.date));
    });
    app.get(prefix + '/file/:file', (req, res) => {
        const file = req.params.file;
        let filename = getSnapshotFilename(file);
        if (!filename) filename = getTimelapseFilename(file);
        if (!filename) return res.status(404).send('File not found');
        return res.sendFile(filename);
    });
    app.get(prefix + '/thumb/:file', async (req, res) => {
        const file = req.params.file;
        const width = parseInt(req.query.w) || THUMBNAIL_WIDTH_SNAPSHOT;
        try {
            const imagedata = await getThumbnailImage(file, width);
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

module.exports = function (app, prefix, options) {
    return initialise(app, prefix, options.directory || __dirname);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
