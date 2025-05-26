// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const { formatInTimeZone } = require('date-fns-tz');

function initialise(app, prefix, vars, tz, debug) {
    const variablesSet = {};
    function render() {
        return Object.fromEntries(vars.map((topic) => [topic, variablesSet[topic]]));
    }
    function update(topic, content) {
        if (vars.some((vars_topic) => topic.startsWith(vars_topic))) {
            variablesSet[topic] = { ...content, timestamp: formatInTimeZone(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX'Z'").replace(":00'Z", 'Z') };
            console.log(`variables: '${topic}' --> '${JSON.stringify(variablesSet[topic])}'`);
            return true;
        }
        return false;
    }
    function variables() {
        return variablesSet;
    }

    //

    app.get(prefix + '', (req, res) => {
        debug && console.log(`vars requested from '${req.headers['x-forwarded-for'] || req.connection.remoteAddress}'`);
        res.json(variablesSet);
    });

    //

    return { update, render, variables };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (app, prefix, options) {
    return initialise(app, prefix, options.vars || {}, options.tz || '');
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
