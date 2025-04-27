// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');

function initialise(app, prefix, filename) {
    app.get(prefix + '', (req, res) => {
        const { mac } = req.query;
        if (!mac) {
            console.error(`sets request failed: no mac address provided`);
            return res.status(400).json({ error: 'MAC address required' });
        }
        try {
            const sets = JSON.parse(fs.readFileSync(filename, 'utf8'));
            if (!sets[mac]) {
                console.log(`sets request failed: no client for ${mac}`);
                return res.status(404).json({ error: 'MAC address unknown' });
            }
            res.json(sets[mac]);
            console.log(`sets request succeeded: ${mac}`);
        } catch (error) {
            console.error(`sets request failed: error reading client file, error <<${error}>>`);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (app, prefix, options) {
    return initialise(app, prefix, options.filename || 'client.json');
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
