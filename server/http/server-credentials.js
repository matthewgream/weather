// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function initialiseCredentials(fqdn) {
    const fs = require('fs');

    const letsencrypt = `/etc/letsencrypt/live/${fqdn}`;

    return {
        key: fs.readFileSync(`${letsencrypt}/privkey.pem`, 'utf8'),
        cert: fs.readFileSync(`${letsencrypt}/cert.pem`, 'utf8'),
        ca: fs.readFileSync(`${letsencrypt}/chain.pem`, 'utf8'),
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (fqdn) {
    return initialiseCredentials(fqdn);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
