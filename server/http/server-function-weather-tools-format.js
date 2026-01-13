// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// const helpers = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function proximity(type_, days_) {
    if (Math.abs(days_) < 1) return `${type_} today`;
    else if (days_ > 0) return `${type_} in ${Math.ceil(days_)} day${Math.ceil(days_) > 1 ? 's' : ''}`;
    else return `${type_} ${Math.abs(Math.floor(days_))} day${Math.abs(Math.floor(days_)) > 1 ? 's' : ''} ago`;
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
function visibility(condition_) {
    const visibilityMap = {
        excellent: 'excellent',
        good: 'good',
        fair: 'fair',
        poor: 'poor',
    };
    return visibilityMap[condition_] || condition_;
}
function magnitude(magnitude_) {
    return magnitude_.toFixed(1);
}
function percentage(value_) {
    return `${Math.round(value_)}%`;
}
function timeFromHM(hours_, minutes_ = 0) {
    return `${hours_}:${minutes_.toString().padStart(2, '0')}`;
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
