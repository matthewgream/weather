// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

/* global getDST, SolarCalc, configurationInit, notificationsInit, displayIsEnabled */

let timezone;

function encodehtml(s) {
    return s.replaceAll('&', '&amp;').replaceAll('>', '&gt;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
}
function joinand(items, separator = ',') {
    if (!items || items.length === 0) return '';
    else if (items.length === 1) return items[0];
    else if (items.length === 2) return `${items[0]}${separator} and ${items[1]}`;
    const lastItem = items.pop();
    return `${items.join(separator + ' ')}${separator} and ${lastItem}`;
}
function capitalise(string) {
    return string[0].toUpperCase() + string.slice(1);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const format = (e, v) => (v === undefined ? 'n/a' : Number(v).toFixed(e.decimals ?? 0));
const formatWindSpeed = (e, v) => (v === undefined ? 'n/a' : (v / 3.6).toFixed(e.decimals ?? 0));
const formatWindDirection = (e, v) =>
    v === undefined ? 'n/a' : `${v.toFixed(e.decimals ?? 0)}° ${['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.floor(((v + 11.25) % 360) / 22.5)]}`;
const formatDepthFromMMtoCM = (e, v) => (v === undefined ? 'n/a' : (v / 10).toFixed(e.decimals ?? 0));

const formatList = [
    {
        name: 'Outside',
        id: 'outside',
        elems: [
            {
                label: 'Temperature',
                id: 'temp',
                unit: '°C',
                path: 'weather/branna.temp',
                decimals: 1,
                format,
            },
            {
                label: 'Humidity',
                id: 'humidity',
                unit: '%',
                path: 'weather/branna.humidity',
                format,
            },
            {
                label: 'Pressure',
                id: 'pressure',
                unit: 'hPa',
                path: 'weather/branna.baromrel',
                decimals: 2,
                format,
            },
            {
                label: 'Wind Speed',
                id: 'windspeed',
                unit: 'm/s',
                path: 'weather/branna.windspeed',
                decimals: 1,
                format: formatWindSpeed,
            },
            {
                label: 'Wind Gust',
                id: 'windgust',
                unit: 'm/s',
                path: 'weather/branna.windgust',
                decimals: 1,
                format: formatWindSpeed,
            },
            {
                label: 'Wind Direction',
                id: 'winddir',
                unit: '',
                path: 'weather/branna.winddir',
                format: formatWindDirection,
            },
            {
                label: 'Rain Rate',
                id: 'rainrate',
                unit: 'mm/hr',
                path: 'weather/branna.rainrate',
                decimals: 1,
                format,
            },
            {
                label: 'Rain Daily',
                id: 'raindaily',
                unit: 'mm',
                path: 'weather/branna.dailyrain',
                decimals: 1,
                format,
            },
            {
                label: 'Solar Radiation',
                id: 'solarrad',
                unit: 'W/m²',
                path: 'weather/branna.solarradiation',
                decimals: 1,
                format,
            },
            {
                label: 'Solar UVI',
                id: 'solaruv',
                unit: '',
                path: 'weather/branna.uv',
                decimals: 1,
                format,
            },
            {
                label: 'Snow Depth',
                id: 'snowdepth',
                unit: 'cm',
                path: 'weather/branna.depth_ch1',
                decimals: 0,
                format: formatDepthFromMMtoCM,
            },
            {
                label: 'Radiation',
                id: 'radiationcpm',
                unit: 'cpm',
                path: 'sensors/radiation.cpm',
                decimals: 1,
                format,
            },
            {
                label: 'Radiation (1 hour avg)',
                id: 'radiationacpm',
                unit: 'cpm',
                path: 'sensors/radiation.acpm',
                decimals: 1,
                format,
            },
            {
                label: 'Radiation (dosing)',
                id: 'radiationusvh',
                unit: 'uSv/h',
                path: 'sensors/radiation.usvh',
                decimals: 2,
                format,
            },
        ],
    },
    {
        name: 'Lake',
        id: 'lake',
        elems: [
            {
                label: 'Surface (5-15cm)',
                id: 'surface',
                unit: '°C',
                path: 'weather/branna.tf_ch1',
                decimals: 1,
                format,
            },
            {
                label: 'Submerged (-1m)',
                id: 'submerged',
                unit: '°C',
                path: 'weather/branna.tf_ch2',
                decimals: 1,
                format,
            },
            {
                label: 'Ice Depth',
                id: 'icedepth',
                unit: 'cm',
                path: 'sensors/water.icedepth',
                decimals: 0,
                format: formatDepthFromMMtoCM,
            },
        ],
    },
    {
        id: 'internal',
        elems: [{ label: 'Battery WH65', id: 'battery', path: 'weather/branna.wh65batt' }],
    },
];

const locate = (data, path) => path.split('.').reduce((accm, part) => accm && accm[part], data);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const formatBanner = (timestamp, timediff) =>
    `Weather data was last received at ${timestamp} (more than ${Math.floor(timediff)} minutes ago), thus the local weather station connection is offline.
     Please use <a href="https://www.wunderground.com/dashboard/pws/IBRUNS40">Weather Underground</a>. The Camera image is up to date.`;

function updateBanner(timestamp) {
    const timediff = Math.floor((Date.now() - new Date(timestamp.replace(/([+-]\d{2})Z$/, '$1:00')).getTime()) / (60 * 1000));
    const element = document.querySelector('#banner');
    if (element) element.innerHTML = timediff > 60 ? formatBanner(timestamp, timediff) : '';
}

function createBanner(timestamp) {
    const timediff = Math.floor((Date.now() - new Date(timestamp.replace(/([+-]\d{2})Z$/, '$1:00')).getTime()) / (60 * 1000));
    return timediff > 60
        ? `<section class="section>
			<div style="background-color: #fee2e2; border: 1px solid #ef4444; padding: 1rem; margin-bottom: 1rem; border-radius: 0.375rem; font-weight: bold;" id="banner">
				${formatBanner(timestamp, timediff)}
    		</div>
		 </section>
		`
        : '';
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function coalescePhenomena(phenomena) {
    const groups = new Map();
    const result = [];
    for (const item of phenomena) {
        const colonIndex = item.indexOf(':');
        if (colonIndex > 0 && colonIndex < 25) {
            // Reasonable prefix length
            const prefix = item.slice(0, Math.max(0, colonIndex)).trim();
            const suffix = item.slice(Math.max(0, colonIndex + 1)).trim();
            if (!groups.has(prefix)) groups.set(prefix, []);
            groups.get(prefix).push(suffix);
        } else {
            if (!groups.has('conditions')) groups.set('conditions', []);
            groups.get('conditions').push(item);
        }
    }
    for (const [prefix, suffixes] of groups) result.push(`<b>${prefix}:</b> ${suffixes.join(', ')}`);
    return result;
}

function createSectionDataSummary(data_location, vars) {
    const outside = formatList[0].elems;
    const lake = formatList[1].elems;
    const internal = formatList[2].elems;

    const temp = locate(vars, outside[0].path);
    const humidity = locate(vars, outside[1].path);
    const pressure = locate(vars, outside[2].path);
    const windSpeed = locate(vars, outside[3].path);
    const windGust = locate(vars, outside[4].path);
    const windDir = locate(vars, outside[5].path);
    const rainRate = locate(vars, outside[6].path);
    const rainDaily = locate(vars, outside[7].path);
    const solarRad = locate(vars, outside[8].path);
    const solarUvi = locate(vars, outside[9].path);
    const snowDepth = locate(vars, outside[10].path);
    const radiationCpm = locate(vars, outside[11].path);
    const radiationAcpm = locate(vars, outside[12].path);
    const radiationUsvh = locate(vars, outside[13].path);
    const lakeSurface = locate(vars, lake[0].path);
    const lakeSubmerged = locate(vars, lake[1].path);
    const lakeIceDepth = undefined;
    const internalBatteryWH65 = locate(vars, internal[0].path);
    const { interpretation, aviation_alerts, aviation_weather } = vars;

    let summary = [];

    ////
    let details_list = [];
    if (temp !== undefined && humidity !== undefined && pressure !== undefined) {
        //
        if (temp !== undefined && humidity !== undefined && pressure !== undefined) {
            const fTemp = outside[0].format(outside[0], temp);
            const fHumidity = outside[1].format(outside[1], humidity);
            const fPressure = outside[2].format(outside[2], pressure);
            let details_temp = `Temp <span class="value">${fTemp}°C</span> at <span class="value">${fHumidity}%</span> and <span class="value">${fPressure}</span> hPa.`;
            details_list.push(details_temp);
        } else details_list.push('No temp.');

        //
        if (windSpeed) {
            const fWindSpeed = outside[3].format(outside[3], windSpeed);
            const fWindDir = outside[5].format(outside[5], windDir).replace('n/a', '');
            let details_wind = `Wind <span class="value">${fWindSpeed}</span> m/s <span class="value">${fWindDir}</span>`;
            if (windGust && windGust > windSpeed) {
                const fWindGust = outside[4].format(outside[4], windGust);
                details_wind += `, gusting <span class="value">${fWindGust}</span> m/s`;
            }
            details_list.push(details_wind + '.');
        } else details_list.push('No wind.');

        //
        if (rainRate || rainDaily) {
            const fRainRate = outside[8].format(outside[6], rainRate);
            let details_rain = `Rain <span class="value">${fRainRate}</span> mm/hr`;
            if (rainDaily) {
                const fRainDaily = outside[9].format(outside[7], rainDaily);
                details_rain += ` (<span class="value">${fRainDaily}</span> mm today)`;
            }
            details_list.push(details_rain + '.');
        } else details_list.push('No rain.');

        //
        if (solarRad) {
            const fSolarRad = outside[6].format(outside[8], solarRad);
            let details_solar = `Solar <span class="value">${fSolarRad}</span> W/m²`;
            if (solarUvi) {
                const fSolarUvi = outside[7].format(outside[9], solarUvi);
                details_solar += `, UVI <span class="value">${fSolarUvi}</span>`;
            }
            details_list.push(details_solar + '.');
        } else details_list.push('No solar.');

        //
        if (snowDepth) {
            const fSnowDepth = outside[10].format(outside[10], snowDepth);
            let details_snow = `Snow <span class="value">${fSnowDepth / 10}</span> cm.`;
            details_list.push(details_snow);
        }

        //
        if (radiationCpm) {
            const fRadiationCpm = outside[11].format(outside[11], radiationCpm);
            let details_rads = `Radiation <span class="value">${fRadiationCpm}</span> cpm`;
            if (radiationAcpm) {
                const fRadiationAcpm = outside[12].format(outside[12], radiationAcpm);
                details_rads += ` (<span class="value">${fRadiationAcpm}</span> avg)`;
            }
            if (radiationUsvh) {
                const fRadiationUsvh = outside[13].format(outside[13], radiationUsvh);
                details_rads += `, <span class="value">${fRadiationUsvh}</span> uSv/h`;
            }
            details_list.push(details_rads + '.');
        }

        //
        if (lakeSurface !== undefined || lakeSubmerged !== undefined || lakeIceDepth) {
            const fLakeSurface = lake[0].format(lake[0], lakeSurface);
            const fLakeSubmerged = lake[1].format(lake[1], lakeSubmerged);
            let details_lake = `Lake <span class="value">${fLakeSurface}°C</span> above, <span class="value">${fLakeSubmerged}°C</span> below`;
            if (lakeIceDepth) {
                const fLakeIceDepth = lake[2].format(lake[2], lakeIceDepth);
                details_lake += `, <span class="value">${fLakeIceDepth / 10}</span> cm ice`;
            }
            details_list.push(details_lake + '.');
        } else details_list.push('No lake.');
    }
    let details = details_list.join('<br>');
    summary.push(details);

    ////
    const formatTime = (date) =>
        date.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone,
        });
    let timeinfo = '';
    const date = new Date();
    timeinfo += `Time <span class="value">${formatTime(date)}</span><sup>+${getDST(date) ? '2' : '1'}</sup>`;
    const solar = new SolarCalc(new Date(), data_location.latitude, data_location.longitude);
    timeinfo += `, daylight <span class="value">${formatTime(solar.sunrise)}</span><sup>-${Math.round((solar.sunrise - solar.civilDawn) / 60 / 1000)}</sup> to <span class="value">${formatTime(solar.sunset)}</span><sup>+${Math.round((solar.civilDusk - solar.sunset) / 60 / 1000)}</sup>`;
    timeinfo += `.`;
    summary.push(timeinfo);

	////
	const { alerts, conditions, phenomena } = interpretation;
    if (alerts?.length || internalBatteryWH65 !== 'OFF') summary.push('', '<span style="font-weight:bold;">' + capitalise (joinand([ ...(alerts || []), ...(internalBatteryWH65 === 'OFF' ? [] : ['faulty battery for WH66'])])) + '.</span>');
    if (conditions?.length) summary.push ('', capitalise (joinand([...new Set(conditions)])) + '.');
    if (phenomena?.length) summary.push ('', coalescePhenomena([...new Set(phenomena)]).join ('; ') + '.');

    ////
    if (aviation_alerts?.alerts?.length || aviation_weather?.weather?.length) {
        const flights = aviation_alerts?.alerts?.reduce((flights, alert) => ({ ...flights, [alert.flight]: [...(flights[alert.flight] || []), encodehtml(alert.text)] }), {});
        const text_flights = flights ? Object.entries(flights).map(([flight, alerts]) => `${flight} ${alerts.join(', ')}`).join('; ') : '';
        const text_weather = aviation_weather?.weather?.flatMap (w => [w.taf?.text, w.metar?.text]).filter (Boolean).join (' * ').trim().replaceAll ('\n', ': ');
		if (text_flights || text_weather) {
			let text = [];
			if (text_flights) text.push(`<span style="font-weight:bold;">flights:</span> ${text_flights}`);
			if (text_weather) text.push(`<span style="font-weight:bold;">weather:</span> ${text_weather}`);
            summary.push('', `<div class="type-aviation" style="display: ${displayIsEnabled('aviation') ? 'block' : 'none'}"><span style="font-size:90%;line-height:1.3em;display: inline-block;">${text.join(';<br>')}</span></div>`);
	    }
    }

    ////
    return summary.join('<br>');
}

function updateSectionData(data_location, vars) {
    const element = document.querySelector('#text-summary-details');
    if (element) element.innerHTML = createSectionDataSummary(data_location, vars);
}
function createSectionData(data_location, vars) {
    return `
    	<section class="section">
        	<div class="text-summary" id="text-summary-details">
				${createSectionDataSummary(data_location, vars)}
			</div>
    	</section>
	`;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const UPDATE_THUMBS_PERIOD = 60 * 1000;

const thumbnails = [
    { file: 'snapshot_M15.jpg', label: 'T-15mins' },
    { file: 'snapshot_M30.jpg', label: 'T-30mins' },
    { file: 'snapshot_M45.jpg', label: 'T-45mins' },
    { file: 'snapshot_M60.jpg', label: 'T-60mins' },
];

const getThumbnailUrl = (file, now, data) => {
    if (data) {
        const min = file.match(/snapshot_M(\d+)\.jpg/);
        if (min && data[`M${min[1]}`]) return data[`M${min[1]}`];
    }
    return `/snapshot/thumb/${file}?w=200&t=${now}`;
};
const getThumbnailDay = (now) => {
    const dateInTimezone = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    return `${dateInTimezone.getFullYear()}${String(dateInTimezone.getMonth() + 1).padStart(2, '0')}${String(dateInTimezone.getDate()).padStart(2, '0')}`;
};

function updateSectionThumbs() {
    setTimeout(() => updateSectionThumbs(), UPDATE_THUMBS_PERIOD);
    const now = Date.now();
    thumbnails.forEach((thumbnail) => {
        const element = document.querySelector(`.thumbnail-image[data-thumbnail="${thumbnail.file}"]`);
        if (element) element.src = getThumbnailUrl(thumbnail.file, now);
    });
    const element = document.querySelector('.snaps-nav-link[snaps-nav-type="day"]');
    if (element) element.href = `/snapshot/list/${getThumbnailDay(new Date())}`;
}
function createSectionThumbs(data) {
    setTimeout(() => updateSectionThumbs(), UPDATE_THUMBS_PERIOD);
    const now = Date.now();
    const thumbnailsBoxes = thumbnails
        .map(
            (thumbnail) => `
            <div class="thumbnail-container">
                <a href="/${thumbnail.file}" target="_blank">
                    <img src="${getThumbnailUrl(thumbnail.file, now, data)}" alt="${thumbnail.label}" class="thumbnail-image" data-thumbnail="${thumbnail.file}">
                    <div class="thumbnail-label">${thumbnail.label}</div>
                </a>
            </div>
        `
        )
        .join('');
    const thumbnailsLinks = `
        <div class="thumbnails-placeholder">
            <div class="snaps-nav-box">
                <div class="snaps-nav-item">
                    <a href="/snapshot/list/${getThumbnailDay(new Date())}" class="snaps-nav-link" snaps-nav-type="day" title="Password is required for access">day</a>
                </div>
                <div class="snaps-nav-item">
                    <a href="/snapshot/list" class="snaps-nav-link" snaps-nav-type="all" title="Password is required for access">all</a>
                </div>
            </div>
        </div>
    `;
    return thumbnailsBoxes + thumbnailsLinks;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const UPDATE_CAMERA_PERIOD = 30 * 1000;
const MAIN_CAMERA_WIDTH = 600;

function updateSectionCamera() {
    setTimeout(() => updateSectionCamera(), UPDATE_CAMERA_PERIOD);
    const element = document.querySelector('#main-camera');
    if (element) element.src = `/snapshot/thumb/snapshot.jpg?w=${MAIN_CAMERA_WIDTH}&t=${Date.now()}`;
}
function createSectionCamera(data) {
    setTimeout(() => updateSectionCamera(), UPDATE_CAMERA_PERIOD);
    const img = data?.thumbnails?.current || `/snapshot/thumb/snapshot.jpg?w=${MAIN_CAMERA_WIDTH}&t=${Date.now()}`;
    return `
        <section class="section">
        	<div class="camera-container">
            	<a href="/snapshot.jpg" target="_blank" id="main-camera-link">
                	<img src="${img}" alt="Camera View" id="main-camera" class="weather-camera">
                	<div class="camera-hint">Click to view full size</div>
            	</a>
            	<div class="thumbnails-row" id="thumbnails-row">
                	${createSectionThumbs(data?.thumbnails)}
            	</div>
        	</div>
        </section>
    `;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const UPDATE_TIMECOUNT_PERIOD = 1 * 1000;

let timecountInterval;

const calculateTimeSince = (time) => `${Math.max(Math.floor((Date.now() - new Date(time.replace(/([+-]\d{2})Z$/, '$1:00')).getTime()) / 1000), 0)} secs ago`;

function updateSectionTimeElementTimestamp(time) {
    const element = document.querySelector('#time-update');
    if (element) element.textContent = time;
}
function updateSectionTimeElementTimecount(time) {
    const element = document.querySelector('#time-since');
    if (element) element.textContent = calculateTimeSince(time);
}
function scheduleSectionTimeElementTimecount(time) {
    if (timecountInterval) clearInterval(timecountInterval);
    timecountInterval = setInterval(() => {
        updateSectionTimeElementTimecount(time);
    }, UPDATE_TIMECOUNT_PERIOD);
}
function updateSectionTime(time) {
    if (time) {
        updateSectionTimeElementTimestamp(time);
        updateSectionTimeElementTimecount(time);
        scheduleSectionTimeElementTimecount(time);
    }
}
function createSectionTime(time) {
    if (time) scheduleSectionTimeElementTimecount(time);
    return `
        <div class="time-updated">
            Updated <span id="time-update">${time || 'n/a'}</span>
            (<span id="time-since">${time ? calculateTimeSince(time) : 'n/a'}</span>)
        </div>
    `;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function createSectionLinks(links) {
    const html = links?.map(({ title, link }) => `<a href="${link}" target="_blank"><strong>${title}</strong></a>`).join(' | ');
    return `
        <div class="external-links">
            ${html}
        </div>
    `;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function createHeader() {
    return `<div class="config-selector" style="display: flex; align-items: center;"></div>`;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const conf = CONFIG;
const varsInterval = 30 * 1000;
let varsOffset = 1 * 1000;
let varsLast;
let varsTimer;

function update(vars) {
    varsLast = vars;
    const time = locate(vars, conf.var_timestamp);
    updateBanner(time);
    updateSectionData(conf.location_data, vars);
    updateSectionTime(time);
}

function request() {
    fetch('/vars')
        .then((response) => {
            if (!response.ok) throw new Error('vars: fetch error: network failure');
            return response.json();
        })
        .then((vars) => {
            if (locate(vars, conf.var_timestamp) == locate(varsLast, conf.var_timestamp)) varsOffset += 1000;
            else update(vars);
            schedule(vars);
        })
        .catch((e) => {
            console.error('vars: fetch error:', e);
            if (varsTimer) clearTimeout(varsTimer);
            varsTimer = setTimeout(request, varsInterval);
        });
}

function schedule(vars) {
    if (varsTimer) clearTimeout(varsTimer);
    const time = locate(vars, conf.var_timestamp);
    if (time) {
        const timeSinceUpdate = Date.now() - new Date(time.replace(/([+-]\d{2})Z$/, '$1:00')).getTime();
        const timeUntilUpdate = varsInterval - (timeSinceUpdate % varsInterval) + varsOffset;
        varsTimer = setTimeout(request, timeUntilUpdate);
        console.log(`vars: update in ${timeUntilUpdate / 1000}s (interval=${varsInterval / 1000}s, offset=${varsOffset / 1000}s)`);
    } else {
        varsOffset = 1 * 1000;
        varsTimer = setTimeout(request, varsInterval);
    }
}

// eslint-disable-next-line no-unused-vars
function create(vars, data) {
    varsLast = vars;
    timezone = conf.location_data.timezone; // eslint-disable-line prefer-destructuring
    const time = locate(vars, conf.var_timestamp);
    const links = conf.external_links;
    document.querySelector('#weather-dashboard').innerHTML = [createHeader(), createBanner(time), createSectionData(conf.location_data, vars), createSectionCamera(data), createSectionTime(time), createSectionLinks(links)].join('');
    schedule(vars);
}

document.addEventListener('DOMContentLoaded', async () => {
    //setTimeout(async () => {
    await notificationsInit();
    configurationInit();
    //}, 1000)
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
