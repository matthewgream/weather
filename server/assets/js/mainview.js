// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const format = (e, v) => (v != null ? (Number.isFinite(v) ? v : Number(v)).toFixed(e.decimals ?? 0) : 'n/a');
const formatWindSpeed = (e, v) => (v != null ? (v / 3.6).toFixed(e.decimals ?? 0) : 'n/a');
const formatWindDirection = (e, v) =>
    v == null
        ? 'n/a'
        : `${v.toFixed(e.decimals ?? 0)}° ${['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.floor(((v + 11.25) % 360) / 22.5)]}`;
const formatDepthFromMMtoCM = (e, v) => (v != null ? (v / 10).toFixed(e.decimals ?? 0) : 'n/a');

const model = [
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

function updateBanner(vars) {
    const timestamp = locate(vars, CONFIG.var_timestamp);
    const timediff = Math.floor((new Date() - new Date(timestamp.replace(/([+-]\d{2})Z$/, '$1:00'))) / (60 * 1000));
    const element = document.getElementById('banner');
    if (element) element.innerHTML = timediff > 60 ? formatBanner(timestamp, timediff) : '';
}

function createBanner(vars) {
    const timestamp = locate(vars, CONFIG.var_timestamp);
    const timediff = Math.floor((new Date() - new Date(timestamp.replace(/([+-]\d{2})Z$/, '$1:00'))) / (60 * 1000));
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

function createSectionDataSummary(vars) {
    const outside = model[0].elems;
    const lake = model[1].elems;
    const internal = model[2].elems;

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
    const snowDepth = locate(vars, outside[10].path) || null;
    const radiationCpm = locate(vars, outside[11].path) || null;
    const radiationAcpm = locate(vars, outside[12].path) || null;
    const radiationUsvh = locate(vars, outside[13].path) || null;
    const lakeSurface = locate(vars, lake[0].path);
    const lakeSubmerged = locate(vars, lake[1].path);
    const lakeIceDepth = null;
    const internalBatteryWH65 = locate(vars, internal[0].path);
    const aircraft = vars.aircraft;

    let summary = [];

    ////
    let details_list = [];
    if (temp !== null && humidity !== null && pressure !== null) {
        //
        if (temp === null || humidity === null || pressure === null) details_list.push('No temp.');
        else {
            const fTemp = outside[0].format(outside[0], temp);
            const fHumidity = outside[1].format(outside[1], humidity);
            const fPressure = outside[2].format(outside[2], pressure);
            let details_temp = `Temp <span class="value">${fTemp}°C</span> at <span class="value">${fHumidity}%</span> and <span class="value">${fPressure}</span> hPa.`;
            details_list.push(details_temp);
        }

        //
        if (!windSpeed) details_list.push('No wind.');
        else {
            const fWindSpeed = outside[3].format(outside[3], windSpeed);
            const fWindDir = outside[5].format(outside[5], windDir).replace('n/a', '');
            let details_wind = `Wind <span class="value">${fWindSpeed}</span> m/s <span class="value">${fWindDir}</span>`;
            if (windGust && windGust > windSpeed) {
                const fWindGust = outside[4].format(outside[4], windGust);
                details_wind += `, gusting <span class="value">${fWindGust}</span> m/s`;
            }
            details_list.push(details_wind + '.');
        }

        //
        if (!rainRate && !rainDaily) details_list.push('No rain.');
        else {
            const fRainRate = outside[8].format(outside[6], rainRate);
            let details_rain = `Rain <span class="value">${fRainRate}</span> mm/hr`;
            if (rainDaily) {
                const fRainDaily = outside[9].format(outside[7], rainDaily);
                details_rain += ` (<span class="value">${fRainDaily}</span> mm today)`;
            }
            details_list.push(details_rain + '.');
        }

        //
        if (!solarRad) details_list.push('No solar.');
        else {
            const fSolarRad = outside[6].format(outside[8], solarRad);
            let details_solar = `Solar <span class="value">${fSolarRad}</span> W/m²`;
            if (solarUvi) {
                const fSolarUvi = outside[7].format(outside[9], solarUvi);
                details_solar += `, UVI <span class="value">${fSolarUvi}</span>`;
            }
            details_list.push(details_solar + '.');
        }

        //
        if (!snowDepth);
        else {
            const fSnowDepth = outside[10].format(outside[10], snowDepth);
            let details_snow = `Snow <span class="value">${fSnowDepth / 10}</span> cm.`;
            details_list.push(details_snow);
        }

        //
        if (!radiationCpm);
        else {
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
        if (lakeSurface === null && lakeSubmerged === null && lakeIceDepth == null) details_list.push('No lake.');
        else {
            const fLakeSurface = lake[0].format(lake[0], lakeSurface);
            const fLakeSubmerged = lake[1].format(lake[1], lakeSubmerged);
            let details_lake = `Lake <span class="value">${fLakeSurface}°C</span> above, <span class="value">${fLakeSubmerged}°C</span> below`;
            if (lakeIceDepth) {
                const fLakeIceDepth = lake[2].format(lake[2], lakeIceDepth);
                details_lake += `, <span class="value">${fLakeIceDepth / 10}</span> cm ice`;
            }
            details_list.push(details_lake + '.');
        }
    }
    let details = details_list.join('<br>');
    summary.push(details);

    ////
    const formatTime = (date) =>
        date.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: CONFIG.timezone,
        });
    let timeinfo = '';
    const date = new Date();
    timeinfo += `Time <span class="value">${formatTime(date)}</span><sup>+${getDST(date) ? '2' : '1'}</sup>`;
    const solar = new SolarCalc(new Date(), CONFIG.location_data.latitude, CONFIG.location_data.longitude);
    timeinfo += `, daylight <span class="value">${formatTime(solar.sunrise)}</span><sup>-${Math.round((solar.sunrise - solar.civilDawn) / 60 / 1000)}</sup> to <span class="value">${formatTime(solar.sunset)}</span><sup>+${Math.round((solar.civilDusk - solar.sunset) / 60 / 1000)}</sup>`;
    timeinfo += `.`;

    summary.push(timeinfo);

    summary.push('');

    ////
    let analysis = '';
    let weather = null;
    if (temp !== null && humidity !== null && pressure !== null)
        weather = getWeatherInterpretation(CONFIG.location_data, {
            temp,
            humidity,
            pressure,
            windSpeed: windSpeed / 3.6,
            solarRad,
            solarUvi,
            rainRate,
            radiationCpm,
            radiationAcpm,
            radiationUsvh,
            snowDepth,
            iceDepth: lakeIceDepth,
        }); // XXX
    if (weather?.details) analysis += `${weather.details}`;
    if (analysis) summary.push(analysis);

    ////
    let warnings_list = [];
    if (weather?.alerts?.length > 0) warnings_list.push(...weather.alerts);
    if (internalBatteryWH65 !== 'OFF') warnings_list.push('faulty battery for WH66');
    let warnings = '';
    if (warnings_list.length > 0) warnings = `WARNING: ${joinand(warnings_list)}.`;
    if (warnings) summary.push(warnings);

    ////
    if (aircraft?.alerts?.length > 0) {
        const flights = aircraft.alerts.reduce((flights, alert) => ({ ...flights, [alert.flight]: [...(flights[alert.flight] || []), alert.text] }), {});
        const text = Object.entries(flights)
            .map(([flight, alerts]) => `${flight} ${alerts.join(', ')}`)
            .join('; ');
        summary.push('');
        summary.push(`Aircraft ${text}.`);
    }

    ////
    return summary.join('<br>');
}

function updateSectionData(vars) {
    const element = document.getElementById('text-summary-details');
    if (element) element.innerHTML = createSectionDataSummary(vars);
}
function createSectionData(vars) {
    return `
    	<section class="section">
        	<div class="text-summary" id="text-summary-details">
				${createSectionDataSummary(vars)}
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
const getThumbnailDay = (now) => `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

function updateSectionThumbs() {
    setTimeout(() => updateSectionThumbs(), UPDATE_THUMBS_PERIOD);
    const now = Date.now();
    thumbnails.forEach((thumbnail) => {
        const element = document.querySelector(`.thumbnail-image[data-thumbnail="${thumbnail.file}"]`);
        if (element) element.src = getThumbnailUrl(thumbnail.file, now);
    });
}
function createSectionThumbs(data) {
    setTimeout(() => updateSectionThumbs(), UPDATE_THUMBS_PERIOD);
    const now = Date.now();
    const thumbnailsBoxes = thumbnails
        .map((thumbnail) => {
            return `
            <div class="thumbnail-container">
                <a href="/${thumbnail.file}" target="_blank">
                    <img src="${getThumbnailUrl(thumbnail.file, now, data)}" alt="${thumbnail.label}" class="thumbnail-image" data-thumbnail="${thumbnail.file}">
                    <div class="thumbnail-label">${thumbnail.label}</div>
                </a>
            </div>
        `;
        })
        .join('');
    const thumbnailsLinks = `
        <div class="thumbnails-placeholder">
            <div class="snaps-nav-box">
                <div class="snaps-nav-item">
                    <a href="/snapshot/list/${getThumbnailDay(new Date())}" class="snaps-nav-link" title="Password is required for access">day</a>
                </div>
                <div class="snaps-nav-item">
                    <a href="/snapshot/list" class="snaps-nav-link" title="Password is required for access">all</a>
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
    const element = document.getElementById('main-camera');
    if (element) element.src = `/snapshot/thumb/snapshot.jpg?w=${MAIN_CAMERA_WIDTH}&t=${Date.now()}`;
}
function createSectionCamera(data) {
    setTimeout(() => updateSectionCamera(), UPDATE_CAMERA_PERIOD);
    const img = data?.thumbnails?.['current'] ? data.thumbnails['current'] : `/snapshot/thumb/snapshot.jpg?w=${MAIN_CAMERA_WIDTH}&t=${Date.now()}`;
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

const calculateTimeSince = (time) => `${Math.max(Math.floor((new Date() - new Date(time.replace(/([+-]\d{2})Z$/, '$1:00'))) / 1000), 0)} secs ago`;

function updateSectionTimeElementTimestamp(time) {
    const element = document.getElementById('time-update');
    if (element) element.textContent = time;
}
function updateSectionTimeElementTimecount(time) {
    const element = document.getElementById('time-since');
    if (element) element.textContent = calculateTimeSince(time);
}
function scheduleSectionTimeElementTimecount(time) {
    if (timecountInterval) clearInterval(timecountInterval);
    timecountInterval = setInterval(() => {
        updateSectionTimeElementTimecount(time);
    }, UPDATE_TIMECOUNT_PERIOD);
}
function updateSectionTime(vars) {
    const time = locate(vars, CONFIG.var_timestamp);
    if (time) {
        updateSectionTimeElementTimestamp(time);
        updateSectionTimeElementTimecount(time);
        scheduleSectionTimeElementTimecount(time);
    }
}
function createSectionTime(vars) {
    const time = locate(vars, CONFIG.var_timestamp);
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

function createSectionLinks() {
    const links = CONFIG.external_links?.map(({ title, link }) => `<a href="${link}" target="_blank"><strong>${title}</strong></a>`).join(' | ');
    return `
        <div class="external-links">
            ${links}
        </div>
    `;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function createHeader() {
    return `<div class="alerts-switch">&nbsp;</div>`;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const varsInterval = 30 * 1000;
let varsOffset = 1 * 1000;
let varsLast;
let varsTimer;

function update(vars) {
    varsLast = vars;

    updateBanner(vars);
    updateSectionData(vars);
    updateSectionTime(vars);
}

function request() {
    fetch('/vars')
        .then((response) => {
            if (!response.ok) throw new Error('vars: fetch error: network failure');
            return response.json();
        })
        .then((vars) => {
            if (locate(vars, CONFIG.var_timestamp) == locate(varsLast, CONFIG.var_timestamp)) varsOffset += 1000;
            else update(vars);
            schedule(vars);
        })
        .catch((error) => {
            console.error('vars: fetch error:', error);
            if (varsTimer) clearTimeout(varsTimer);
            varsTimer = setTimeout(request, varsInterval);
        });
}

function schedule(vars) {
    if (varsTimer) clearTimeout(varsTimer);
    const time = locate(vars, CONFIG.var_timestamp);
    if (time) {
        const timeSinceUpdate = new Date() - new Date(time.replace(/([+-]\d{2})Z$/, '$1:00'));
        const timeUntilUpdate = varsInterval - (timeSinceUpdate % varsInterval) + varsOffset;
        varsTimer = setTimeout(request, timeUntilUpdate);
        console.log(`vars: update in ${timeUntilUpdate / 1000}s (interval=${varsInterval / 1000}s, offset=${varsOffset / 1000}s)`);
    } else {
        varsOffset = 1 * 1000;
        varsTimer = setTimeout(request, varsInterval);
    }
}

function create(vars, data) {
    varsLast = vars;
    document.getElementById('weather-dashboard').innerHTML = [
        createHeader(),
        createBanner(vars),
        createSectionData(vars),
        createSectionCamera(data),
        createSectionTime(vars),
        createSectionLinks(),
    ].join('');
    schedule(vars);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
