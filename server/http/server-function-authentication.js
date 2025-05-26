// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function typeToWWW(type) {
    if (type == 'basic') return 'Basic';
    return 'Undefined';
}

function initialise(app, options) {
    let type = options.type || 'basic';

    //

    app.use((req, res, next) => {
        if (!req.headers.authorization) {
            res.setHeader('WWW-Authenticate', typeToWWW(type));
            return res.status(401).send('Authentication required');
        }
        try {
            if (type === 'basic') {
                const [user, pass] = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString().split(':');
                if ((options?.[type]?.user || '') === user && (options?.[type]?.pass || '') == pass) return next();
            }
        } catch {
            res.setHeader('WWW-Authenticate', typeToWWW(type));
            return res.status(400).send('Authentication malformed');
        }
        res.setHeader('WWW-Authenticate', typeToWWW(type));
        return res.status(401).send('Authentication failed');
    });

    //

    return {};
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (app, options) {
    return initialise(app, options);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
