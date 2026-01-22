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
        return left[0] === '' ? '0' : (secs < 0 ? '-' : '') + left[0].trim();
    }
    static secondsToString(secs, options = {}) {
        return FormatHelper._valueToString(secs, (v) => FormatHelper._secondsToString(v, options));
    }
    static millisToString(millis, options = {}) {
        return FormatHelper._valueToString(millis, (v) => FormatHelper._secondsToString(v / 1000, options));
    }
    static timeToString(time) {
        return FormatHelper._valueToString(time, (v) => new Date(v).toISOString());
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
    static litresRateToString(litres, type = 'h', options = {}) {
        return FormatHelper._valueToString(litres, (v) => v.toFixed(1) + (options.noUnits ? '' : `L/${type}`));
    }
    static bytesToString(bytes, options = {}) {
        return FormatHelper._valueToString(bytes, (v) => {
            if (v === 0) return '0' + (options.noUnits ? '' : 'b');
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return Number.parseFloat((bytes / 1024 ** i).toFixed(1)) + (options.noUnits ? '' : ['b', 'Kb', 'Mb', 'Gb'][i]);
        });
    }
    static objectToString(object, options = {}) {
        if (object === undefined) return '-';
        if (Array.isArray(object)) return object.join(', ');
        if (typeof object !== 'object') return `${object}`;
        return Object.entries(object)
            .map(([name, string], index) => (typeof string !== 'string' || string) && (index == 0 && options.skipFirstKey ? (options.formatter ? options.formatter(string) : string) : `${name}=${options.formatter ? options.formatter(string) : string}`))
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
    static joinand(items) {
       if (!items || items.length === 0) return '';
        else if (items.length === 1) return items[0];
        else if (items.length === 2) return `${items[0]} and ${items[1]}`;
        const lastItem = items.pop();
        return `${items.join(', ')}, and ${lastItem}`;
    }
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
    FormatHelper,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
