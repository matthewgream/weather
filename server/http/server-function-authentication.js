// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function typeToWWW(type) {
    if (type == 'basic') return 'Basic';
    return 'Undefined';
}

function initialise(app, options) {
    let type = options.type || 'basic';

    //

    const authDenied = {};
    let authAllowed = 0;
    const authBasic = {};

    function authenticationDenied(res, code, reason) {
        authDenied[reason] = (authDenied[reason] || 0) + 1;
        res.setHeader('WWW-Authenticate', typeToWWW(type));
        return res.status(code).send(`Authentication ${reason}`);
    }
    function authenticationAllowed(next) {
        authAllowed++;
        return next();
    }

    app.use((req, res, next) => {
        if (!req.headers.authorization) return authenticationDenied(res, 401, 'required');
        try {
            if (type === 'basic') {
                const [user, pass] = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString().split(':');
                const okayUser = (options?.[type]?.user || '') === user,
                    okayPass = (options?.[type]?.pass || '') === pass;
                if (okayUser && okayPass) return authenticationAllowed(next);
                if (!okayUser) authBasic.badUser = (authBasic.badUser || 0) + 1;
                if (!okayPass) authBasic.badPass = (authBasic.badPass || 0) + 1;
            }
        } catch {
            return authenticationDenied(res, 400, 'malformed');
        }
        return authenticationDenied(res, 401, 'failed');
    });

    //

    return {
        getDiagnostics: () => {
            return {
                type: typeToWWW(type),
                denied: authDenied,
                allowed: authAllowed,
                basic: authBasic,
            };
        },
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (app, options) {
    return initialise(app, options);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
