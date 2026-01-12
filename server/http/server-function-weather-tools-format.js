// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// const helpers = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function formatProximity(type, days) {
    if (Math.abs(days) < 1) return `${type} today`;
    else if (days > 0) return `${type} in ${Math.ceil(days)} day${Math.ceil(days) > 1 ? 's' : ''}`;
    else return `${type} ${Math.abs(Math.floor(days))} day${Math.abs(Math.floor(days)) > 1 ? 's' : ''} ago`;
}
function formatAltitude(altitude) {
    return `${Math.round(altitude)}°`;
}
function formatDirection(bearing) {
    return `${Math.round(bearing)}°`;
}
function formatPosition(altitude, bearing, direction) {
    return `${formatAltitude(altitude)} above horizon (bearing ${formatDirection(bearing)}, ${direction})`;
}
function formatVisibility(condition) {
    const visibilityMap = {
        excellent: 'excellent',
        good: 'good',
        fair: 'fair',
        poor: 'poor',
    };
    return visibilityMap[condition] || condition;
}
function formatMagnitude(mag) {
    return mag.toFixed(1);
}
function formatPercentage(value) {
    return `${Math.round(value)}%`;
}
function formatTimeFromHM(hours, minutes = 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}
function formatTimeFromDate(date, timeZone) {
    return date.toLocaleTimeString('en-GB', {
        timeZone: timeZone || 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    formatProximity,
    formatAltitude,
    formatDirection,
    formatPosition,
    formatVisibility,
    formatMagnitude,
    formatPercentage,
    formatTimeFromHM,
    formatTimeFromDate,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
