// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const multer = require('multer');

const image_dataType = (filename) => filename.match(/^([^_]+)/)?.[1] || '';
const image_dataVersion = (filename) => filename.match(/_v(\d+\.\d+\.\d+)/)?.[1] || '';
const image_dataCompress = (data) => zlib.deflateSync(data);
const image_dataManifest = (directory) =>
    Object.values(
        fs.readdirSync(directory).reduce((images, filename) => {
            const type = image_dataType(filename),
                version = image_dataVersion(filename);
            if (!images[type] || images[type].version < version) images[type] = { type, version, filename };
            return images;
        }, {})
    );

function initialise(app, prefix, directory, location) {
    const image_upload = multer({ dest: '/tmp' });

    //

    app.get(prefix + '/images.json', (req, res) => {
        const url_base = `http://${location}${prefix}/`;
        const manifest = image_dataManifest(directory).map(({ filename, ...rest }) => ({ ...rest, url: url_base + filename }));
        console.log(`images manifest request: ${manifest.length} items, ${JSON.stringify(manifest).length} bytes, types = ${manifest.map((item) => item.type).join(', ')}, version = ${req.query.version || 'unspecified'}`);
        res.json(manifest);
    });
    app.put(String(prefix) + '', image_upload.single('image'), (req, res) => {
        if (!req.file) {
            console.error(`images upload failed: file not provided`);
            return res.status(400).send('File not provided');
        }
        if (!req.file.originalname || !image_dataType(req.file.originalname) || !image_dataVersion(req.file.originalname)) {
            console.error(`images upload failed: file has no name or has bad type/version (received '${req.file.originalname}')`);
            return res.status(400).send('File has no name or bad type/version');
        }
        if (fs.existsSync(path.join(directory, req.file.originalname) + '.zz')) {
            console.error(`images upload failed: file already exists as '${path.join(directory, req.file.originalname)}'`);
            return res.status(409).send('File with this name already exists');
        }
        const remote = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        try {
            const uploadedName = req.file.originalname,
                uploadedData = fs.readFileSync(req.file.path);
            fs.unlinkSync(req.file.path);
            const compressedName = path.join(directory, uploadedName) + '.zz',
                compressedData = image_dataCompress(uploadedData);
            fs.writeFileSync(compressedName, compressedData);
            console.log(`images upload succeeded: '${uploadedName}' (${uploadedData.length} bytes) --> '${compressedName}' (${compressedData.length} bytes) [${remote}]`);
            return res.send('File uploaded, compressed, and saved successfully.');
        } catch (e) {
            console.error(`images upload failed [${remote}], error:`, e);
            return res.status(500).send('File upload error');
        }
    });
    app.get(prefix + '/:filename', (req, res) => {
        const downloadName = req.params.filename,
            downloadPath = path.join(directory, downloadName);
        try {
            res.set('Content-Type', 'application/octet-stream');
            res.send(fs.readFileSync(downloadPath));
            console.log(`images download succeeded: ${downloadName} (${downloadPath})`);
        } catch (e) {
            console.error(`images download failed: ${downloadName} (${downloadPath}), error:`, e);
            res.status(404).send('File not found');
        }
    });

    //

    return {};
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (app, prefix, options = {}) {
    return initialise(app, prefix, options.directory || __dirname, options.location || '');
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
