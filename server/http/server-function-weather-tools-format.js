// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// const helpers = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// eslint-disable-next-line unicorn/no-static-only-class
class FormatHelper {
    static _valueToString(value, func) {
        if (value === undefined) return '-';
        const original = value;
        if (typeof value === 'string') value = Number.parseFloat(value);
        if (Number.isNaN(value)) return `<${original}>`;
        return func(value);
    }
    static _secondsToString(secs, options = {}) {
        if (typeof options === 'string') options = { separator: options };
        const __l = (x, a, u, f, p) => {
            const q = Math.floor(x[1] / a);
            x[1] -= q * a;
            // eslint-disable-next-line sonarjs/no-nested-conditional
            x[0] += q > 0 || f ? (p ? String(q).padStart(2, '0') : q) + u + (options.separator ?? ' ') : '';
            return x;
        };
        const { force, round, pad } = options;
        let left = ['', Math.abs(secs)];
        left = __l(left, 86400, 'd', force?.includes('d'), pad?.includes('d'));
        if (!round?.includes('h')) {
            left = __l(left, 3600, 'h', force?.includes('h'), pad?.includes('h'));
            if (!round?.includes('m')) {
                left = __l(left, 60, 'm', force?.includes('m'), pad?.includes('m'));
                if (!round?.includes('s')) {
                    left = __l(left, 1, 's', force?.includes('s'), pad?.includes('s'));
                }
            }
        }
        // eslint-disable-next-line sonarjs/no-nested-conditional
        return left[0] === '' ? '0' : (secs < 0 ? '-' : '') + left[0].trim();
    }
    static secondsToString(secs, options = {}) {
        return FormatHelper._valueToString(secs, (v) => FormatHelper._secondsToString(v, options));
    }
    static millisToString(millis, options = {}) {
        return FormatHelper._valueToString(millis, (v) => FormatHelper._secondsToString(v / 1000, options));
    }
    static timeToString(time, options = {}) {
        return FormatHelper._valueToString(time, (v) => (options.hoursOnly ? `${String(new Date(v).getHours()).padStart(2, '0')}:${String(new Date(v).getMinutes()).padStart(2, '0')}` : new Date(v).toISOString()));
    }
    static timeLocalToString(time) {
        // XXX fix me
        return new Date(time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); // XXX fix me
    }
    static millimetresToString(millis, options = {}) {
        return FormatHelper._valueToString(millis, (v) => v.toFixed(1) + (options.noUnits ? '' : 'mm'));
    }
    static temperatureToString(temp, options = {}) {
        return FormatHelper._valueToString(temp, (v) => v.toFixed(1) + (options.noUnits ? '' : '°C'));
    }
    static pressureToString(pressure, options = {}) {
        return FormatHelper._valueToString(pressure, (v) => v.toFixed(1) + (options.noUnits ? '' : 'hPa'));
    }
    static humidityToString(humidity, options = {}) {
        return FormatHelper._valueToString(humidity, (v) => v.toFixed(1) + (options.noUnits ? '' : '%'));
    }
    static rainfallToString(rainfall, options = {}) {
        return FormatHelper._valueToString(rainfall, (v) => v.toFixed(1) + (options.noUnits ? '' : 'mm'));
    }
    static windspeedToString(windspeed, options = {}) {
        return FormatHelper._valueToString(windspeed, (v) => v.toFixed(1) + (options.noUnits ? '' : 'm/s'));
    }
    static snowdepthToString(snowdepth, options = {}) {
        return FormatHelper._valueToString(snowdepth, (v) => v.toFixed(1) + (options.noUnits ? '' : 'mm'));
    }
    static icedepthToString(icedepth, options = {}) {
        return FormatHelper._valueToString(icedepth, (v) => v.toFixed(1) + (options.noUnits ? '' : 'mm'));
    }
    static radiationToString(radiation, options = {}) {
        return FormatHelper._valueToString(radiation, (v) => v.toFixed(1) + (options.noUnits ? '' : 'µSv'));
    }
    static litresToString(litres, options = {}) {
        return FormatHelper._valueToString(litres, (v) => v.toFixed(1) + (options.noUnits ? '' : 'L'));
    }
    static solarToString(solar, options = {}) {
        return FormatHelper._valueToString(solar, (v) => v.toFixed(1) + (options.noUnits ? '' : 'W/m²'));
    }
    static uviToString(uvi) {
        return FormatHelper._valueToString(uvi, (v) => v.toFixed(0));
    }
    static bytesToString(bytes, options = {}) {
        return FormatHelper._valueToString(bytes, (v) => {
            if (v === 0) return '0' + (options.noUnits ? '' : 'b');
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return Number.parseFloat((bytes / 1024 ** i).toFixed(1)) + (options.noUnits ? '' : ['b', 'Kb', 'Mb', 'Gb'][i]);
        });
    }
    static kpToString(kp, options = {}) {
        return FormatHelper._valueToString(kp, (v) => v.toFixed(1) + (options.noUnits ? '' : ' Kp'));
    }
    static distanceKmToString(distance, options = {}) {
        return FormatHelper._valueToString(distance, (v) => Math.round(v) + (options.noUnits ? '' : ' km/s'));
    }
    static densityToString(density, options = {}) {
        return FormatHelper._valueToString(density, (v) => v.toFixed(1) + (options.noUnits ? '' : ' p/cm³'));
    }
    static magneticFieldToString(nT, options = {}) {
        return FormatHelper._valueToString(nT, (v) => v.toFixed(1) + (options.noUnits ? '' : ' nT'));
    }
    static probabilityToString(prob, options = {}) {
        return FormatHelper._valueToString(prob, (v) => Math.round(v) + (options.noUnits ? '' : '%'));
    }
    static degreesToString(deg, options = {}) {
        return FormatHelper._valueToString(deg, (v) => (options.digits ? v.toFixed(options.digits) : Math.round(v)) + (options.noUnits ? '' : '°'));
    }
    static magnitudeToString(mag, options = {}) {
        return FormatHelper._valueToString(mag, (v) => (options.noUnits ? '' : 'mag ') + v.toFixed(1));
    }
    static energyJoulesE10ToString(energy, options = {}) {
        return FormatHelper._valueToString(energy, (v) => v.toFixed(1) + (options.noUnits ? '' : '×10¹⁰ J'));
    }
    static zhrToString(zhr, options = {}) {
        return FormatHelper._valueToString(zhr, (v) => '~' + Math.round(v) + (options.noUnits ? '' : ' ZHR'));
    }
    static hoursAgoToString(hours) {
        return FormatHelper._valueToString(hours, (v) => Math.round(v) + 'h ago');
    }
    static countToString(n) {
        return FormatHelper._valueToString(n, (v) => Math.round(v).toString());
    }
    static azimuthToString(azimuth) {
        // XXX fix me
        return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(azimuth / 22.5) % 16];
    }
    static altitudeToString(altitude_) {
        // XXX fix me
        return `${Math.round(altitude_)}°`;
    }
    static positionToString(altitude_, bearing_, direction_) {
        // XXX fix me
        return `${FormatHelper.altitudeToString(altitude_)} above horizon (bearing ${Math.round(bearing_)}°, ${direction_})`;
    }
    static proximityToString(type_, days_) {
        // XXX fix me
        if (Math.abs(days_) < 1) return `${type_} today`;
        const rounded = Math.round(Math.abs(days_));
        if (days_ > 0) return `${type_} in ${rounded} day${rounded === 1 ? '' : 's'}`;
        return `${type_} ${rounded} day${rounded === 1 ? '' : 's'} ago`;
    }
    static relativeAbsoluteTime(timestamp, now, timeZone = 'UTC') {
        // XXX fix me
        if (timestamp === undefined || timestamp === null) return '-';
        const date = new Date(timestamp);
        const timeStr = date.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
        if (date.toLocaleDateString('en-GB', { timeZone }) === new Date(now).toLocaleDateString('en-GB', { timeZone })) return timeStr;
        else if ((now - timestamp) / (24 * 60 * 60 * 1000) < 7) return `${timeStr} (${date.toLocaleDateString('en-GB', { timeZone, weekday: 'short' })})`;
        else return date.toLocaleDateString('en-GB', { timeZone, day: '2-digit', month: '2-digit' });
    }
    static timestampBracket(timestamp, now, timezone = 'UTC') {
        const formatted = FormatHelper.relativeAbsoluteTime(timestamp, now, timezone);
        return formatted === '-' ? '' : `[${formatted}]`;
    }
    static percentageToString(percent, options = {}) {
        return FormatHelper._valueToString(percent, (v) => Math.round(v) + (options.noUnits ? '' : '%'));
    }
    static objectToString(object, options = {}) {
        if (object === undefined) return '-';
        if (Array.isArray(object)) return object.join(', ');
        if (typeof object !== 'object') return `${object}`;
        return Object.entries(object)
            .map(
                ([name, string], index) =>
                    // eslint-disable-next-line sonarjs/no-nested-conditional
                    (typeof string !== 'string' || string) && (index == 0 && options.skipFirstKey ? (options.formatter ? options.formatter(string) : string) : `${name}=${options.formatter ? options.formatter(string) : string}`)
            )
            .filter(Boolean)
            .join(options.separator ?? ', ');
    }
    static camelToKebabString(string) {
        return string
            .replaceAll(/([A-Z])/g, '-$1')
            .toLowerCase()
            .replace(/^-/, '');
    }
    static capitalise(string) {
        return string[0].toUpperCase() + string.slice(1);
    }
    static pluralise(name, string) {
        return `${string} ${name}${string > 1 ? 's' : ''}`;
    }
    static joinand(items, separator = ',') {
        if (!items || items.length === 0) return '';
        else if (items.length === 1) return items[0];
        else if (items.length === 2) return `${items[0]}${separator} and ${items[1]}`;
        const lastItem = items.pop();
        return `${items.join(separator + ' ')}${separator} and ${lastItem}`;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    FormatHelper,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
