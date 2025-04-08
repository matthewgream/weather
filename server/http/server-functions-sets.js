// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function initialiseSets(xxx, filename, directory) {
    const fs = require('fs');
    const path = require('path');

    xxx.get('/sets', (req, res) => {
        const { mac } = req.query;
        if (!mac) {
            console.error(`/sets request failed: no mac address provided`);
            return res.status(400).json({ error: 'MAC address required' });
        }
        try {
            const sets = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
            if (!sets[mac]) {
                console.log(`/sets request failed: no client for ${mac}`);
                return res.status(404).json({ error: 'MAC address unknown' });
            }
            res.json(sets[mac]);
            console.log(`/sets request succeeded: ${mac}`);
        } catch (error) {
            console.error(`/sets request failed: error reading client file, error <<${error}>>`);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (xxx, filename = 'client.json', directory = __dirname) {
    return initialiseSets(xxx, filename, directory);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
