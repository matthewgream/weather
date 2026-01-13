// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// const helpers = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function proximity(type_, days_) {
    if (Math.abs(days_) < 1) return `${type_} today`;
    const rounded = Math.round(Math.abs(days_));
    const plural = rounded !== 1 ? 's' : '';
    if (days_ > 0) return `${type_} in ${rounded} day${plural}`;
    return `${type_} ${rounded} day${plural} ago`;
}
function altitude(altitude_) {
    return `${Math.round(altitude_)}°`;
}
function direction(bearing_) {
    return `${Math.round(bearing_)}°`;
}
function position(altitude_, bearing_, direction_) {
    return `${altitude(altitude_)} above horizon (bearing ${direction(bearing_)}, ${direction_})`;
}
// Passthrough for visibility descriptions - placeholder for future localization or enhancement
function visibility(condition_) {
    return condition_;
}
function magnitude(magnitude_) {
    return magnitude_ !== undefined && magnitude_ !== null ? magnitude_.toFixed(1) : '';
}
function percentage(value_) {
    return `${Math.round(value_)}%`;
}
function timeFromHM(hours_, minutes_ = 0) {
    const h = Math.floor(hours_) % 24;
    const m = Math.floor(minutes_) % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
function timeFromDate(date_, timezone_) {
    return date_.toLocaleTimeString('en-GB', {
        timeZone: timezone_ || 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    proximity,
    altitude,
    direction,
    position,
    visibility,
    magnitude,
    percentage,
    timeFromHM,
    timeFromDate,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
