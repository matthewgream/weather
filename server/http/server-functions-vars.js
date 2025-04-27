// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const { formatInTimeZone } = require('date-fns-tz');

function initialise(app, prefix, vars, tz, debug = null) {
    const getTimestamp = (tz) => formatInTimeZone(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX'Z'").replace(":00'Z", 'Z');
    const variablesSet = {};
    function render() {
        return Object.fromEntries(vars.map((topic) => [topic, variablesSet[topic]]));
    }
    function update(topic, message) {
        if (topic.startsWith('sensors') || topic.startsWith('weather'))
            variablesSet[topic] = { ...JSON.parse(message.toString()), timestamp: getTimestamp(tz) };
        else return;
        if (vars.includes(topic)) console.log(`variables: '${topic}' --> '${JSON.stringify(variablesSet[topic])}'`);
    }

    //

    app.get(prefix + '', (req, res) => {
        debug && console.log(`vars requested from '${req.headers['x-forwarded-for'] || req.connection.remoteAddress}'`);
        res.json(variablesSet);
    });

    //

    return { update, render };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (app, prefix, options) {
    return initialise(app, prefix, options.vars || {}, options.tz || '');
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
