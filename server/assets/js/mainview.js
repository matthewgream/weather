
// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const format = (e, v) => (v != null) ? (Number.isFinite (v) ? v : Number (v)).toFixed(e.decimals ?? 0) : 'n/a';
const formatWindSpeed = (e, v) => (v != null) ? (v / 3.6).toFixed(e.decimals ?? 0) : 'n/a';
const formatWindDirection = (e, v) => (v == null) ? 'n/a' : `${v.toFixed(e.decimals ?? 0)}° ${['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.floor(((v + 11.25) % 360) / 22.5)]}`;
const formatDepthFromMMtoCM = (e, v) => (v != null) ? (v / 10).toFixed(e.decimals ?? 0) : 'n/a';

const model = [
    {
        name: 'Outside', id: 'outside',
        elems: [
            { label: 'Temperature', id: 'temp', unit: '°C', path: 'weather/branna.temp', decimals: 1, format },
            { label: 'Humidity', id: 'humidity', unit: '%', path: 'weather/branna.humidity', format },
            { label: 'Pressure', id: 'pressure', unit: 'hPa', path: 'weather/branna.baromrel', decimals: 2, format },
            { label: 'Wind Speed', id: 'windspeed', unit: 'm/s', path: 'weather/branna.windspeed', decimals: 1, format: formatWindSpeed },
            { label: 'Wind Gust', id: 'windgust', unit: 'm/s', path: 'weather/branna.windgust', decimals: 1, format: formatWindSpeed },
            { label: 'Wind Direction', id: 'winddir', unit: '', path: 'weather/branna.winddir', format: formatWindDirection },
            { label: 'Rain Rate', id: 'rainrate', unit: 'mm/hr', path: 'weather/branna.rainrate', decimals: 1, format },
            { label: 'Rain Daily', id: 'raindaily', unit: 'mm', path: 'weather/branna.dailyrain', decimals: 1, format },
            { label: 'Solar Radiation', id: 'solarrad', unit: 'W/m²', path: 'weather/branna.solarradiation', decimals: 1, format },
            { label: 'Solar UVI', id: 'solaruv', unit: '', path: 'weather/branna.uv', decimals: 1, format },
            { label: 'Snow Depth', id: 'snowdepth', unit: 'cm', path: 'weather/branna.depth_ch1', decimals: 0, format: formatDepthFromMMtoCM },
            { label: 'Radiation', id: 'radiation', unit: 'cpm', path: 'sensors/radiation/cpm.value', decimals: 1, format },
        ]
    },
    {
        name: 'Lake', id: 'lake',
        elems: [
            { label: 'Surface (5-15cm)', id: 'surface', unit: '°C', path: 'weather/branna.tf_ch1', decimals: 1, format },
            { label: 'Submerged (-1m)', id: 'submerged', unit: '°C', path: 'weather/branna.tf_ch2', decimals: 1, format },
            { label: 'Ice Depth', id: 'icedepth', unit: 'cm', path: 'sensors/water.icedepth', decimals: 0, format: formatDepthFromMMtoCM }
        ]
    },
	{
		id: 'internal',
		elems: [
            { label: 'Battery WH65', id: 'battery', path: 'weather/branna.wh65batt' }
		]
	}
];

const locate = (data, path) => path.split('.').reduce((accm, part) => accm && accm[part], data);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const formatWarningBanner = (timestamp, timediff) => 
    `Weather data was last received at ${timestamp} (more than ${Math.floor(timediff)} minutes ago), thus the local weather station connection is offline.
     Please use <a href="https://www.wunderground.com/dashboard/pws/IBRUNS40">Weather Underground</a>. The Camera image is up to date.`;

const updateWarningBanner = (mode, vars) => {
    const timestamp = locate(vars, CONFIG.var_timestamp);
    const timediff = Math.floor((new Date() - new Date(timestamp.replace(/([+-]\d{2})Z$/, '$1:00'))) / (60 * 1000));
    const element = document.getElementById('warning-banner');
    if (element)
        element.innerHTML = (timediff > 60) ? formatWarningBanner(timestamp, timediff) : '';
};

const createWarningBanner = (mode, vars) => {
    const timestamp = locate(vars, CONFIG.var_timestamp);
    const timediff = Math.floor((new Date() - new Date(timestamp.replace(/([+-]\d{2})Z$/, '$1:00'))) / (60 * 1000));
    return (timediff > 60) ?
        `<section class="section>
			<div style="background-color: #fee2e2; border: 1px solid #ef4444; padding: 1rem; margin-bottom: 1rem; border-radius: 0.375rem; font-weight: bold;" id="warning-banner">
				${formatWarningBanner(timestamp, timediff)}
    		</div>
		 </section>
		` : '';
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const createViewTextSummary = (vars) => {

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
    const radiation = locate(vars, outside[11].path) || null;
    const lakeSurface = locate(vars, lake[0].path);
    const lakeSubmerged = locate(vars, lake[1].path);
	const lakeIceDepth = null;
    const internalBatteryWH65 = locate(vars, internal[0].path);

	let summary = [];

	////
	let details_list = [];
    if (temp !== null && humidity !== null && pressure !== null) {

		//
        if (temp === null || humidity === null || pressure === null)
            details_list.push ("No temp.");
        else {
            const fTemp = outside[0].format(outside[0], temp);
            const fHumidity = outside[1].format(outside[1], humidity);
            const fPressure = outside[2].format(outside[2], pressure);
            let details_temp = `Temp <span class="value">${fTemp}°C</span> at <span class="value">${fHumidity}%</span> and <span class="value">${fPressure}</span> hPa.`;
			details_list.push (details_temp);
        }

		//
        if (!windSpeed)
            details_list.push ("No wind.");
        else {
            const fWindSpeed = outside[3].format(outside[3], windSpeed);
            const fWindDir = outside[5].format(outside[5], windDir).replace('n/a', '');
            let details_wind = `Wind <span class="value">${fWindSpeed}</span> m/s <span class="value">${fWindDir}</span>`;
            if (windGust && windGust > windSpeed) {
                const fWindGust = outside[4].format(outside[4], windGust);
                details_wind += `, gusting <span class="value">${fWindGust}</span> m/s`;
            }
			details_list.push (details_wind + '.');
        }

		//
        if (!rainRate && !rainDaily)
            details_list.push ("No rain.");
        else {
           	const fRainRate = outside[8].format(outside[6], rainRate);
           	let details_rain = `Rain <span class="value">${fRainRate}</span> mm/hr`;
            if (rainDaily) {
                const fRainDaily = outside[9].format(outside[7], rainDaily);
                details_rain += ` (<span class="value">${fRainDaily}</span> mm today)`;
            }
			details_list.push (details_rain + '.');
        }

		//
        if (!solarRad)
            details_list.push ("No solar.");
        else {
            const fSolarRad = outside[6].format(outside[8], solarRad);
            let details_solar = `Solar <span class="value">${fSolarRad}</span> W/m²`;
            if (solarUvi) {
                const fSolarUvi = outside[7].format(outside[9], solarUvi);
                details_solar += `, UVI <span class="value">${fSolarUvi}</span>`;
            }
			details_list.push (details_solar + '.');
        }

		//
		if (!snowDepth)
			;
		else {
            const fSnowDepth = outside[10].format(outside[10], snowDepth);
            let details_snow = `Snow <span class="value">${fSnowDepth/10}</span> cm.`;
            details_list.push (details_snow);
		}

		//
		if (!radiation)
			;
		else {
            const fRadiation = outside[11].format(outside[11], radiation);
            let details_rads = `Radiation <span class="value">${fRadiation}</span> cpm.`;
            details_list.push (details_rads);
		}

		//
        if (lakeSurface === null && lakeSubmerged === null && lakeIceDepth == null)
            details_list.push ("No lake.");
        else {
            const fLakeSurface = lake[0].format(lake[0], lakeSurface);
            const fLakeSubmerged = lake[1].format(lake[1], lakeSubmerged);
            let details_lake = `Lake <span class="value">${fLakeSurface}°C</span> above, <span class="value">${fLakeSubmerged}°C</span> below`;
			if (lakeIceDepth) {
           		const fLakeIceDepth = lake[2].format(lake[2], lakeIceDepth);
           		details_lake += `, <span class="value">${fLakeIceDepth/10}</span> cm ice`;
			}
			details_list.push (details_lake + '.');
        }
    }
	let details = details_list.join ('<br>');
	summary.push (details);

	////
	let timeinfo = '';
   	const daylight = getDaylightHours(CONFIG.location_data.latitude, CONFIG.location_data.longitude);
	const date = new Date ();
	const formattedTime = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }); 
   	timeinfo += `Time <span class="value">${formattedTime}</span>`;
	if (daylight.isDST)
   		timeinfo += ` (DST)`;
	if (daylight.isDaytime && daylight.sunset)
		timeinfo += `, sunset <span class="value">${daylight.sunset}</span>, dusk <span class="value">${daylight.civilDusk}</span>`;
	else if (!daylight.isDaytime && daylight.sunrise)
		timeinfo += `, dawn <span class="value">${daylight.civilDawn}</span>, sunrise <span class="value">${daylight.sunrise}</span>`;
   	timeinfo += `.<br>`;
	summary.push (timeinfo);

	////
    let analysis = '';
	let weather = null;
    if (temp !== null && humidity !== null && pressure !== null)
   		weather = getWeatherInterpretation(CONFIG.location_data, { temp, humidity, pressure, windSpeed: windSpeed/3.6, solarRad, solarUvi, rainRate, radiation, snowDepth, iceDepth: lakeIceDepth }); // XXX
   	if (weather)
       	analysis += `${weather.description}`;
	if (analysis)
		summary.push (analysis);

	////
	let warnings_list = [];
	if (weather?.alerts?.length > 0) 
		warnings_list.push (...weather.alerts);
	if (internalBatteryWH65 !== 'OFF')
		warnings_list.push ('battery for WH66 is faulty');
	let warnings = '';
	if (warnings_list.length > 0)
        warnings = `WARNING: ${joinand(warnings_list)}.`;
	if (warnings)
		summary.push (warnings);

	////
    return summary.join ('<br>');
};

const updateViewText = (vars) => {
    const element = document.getElementById('text-summary-details');
    if (element)
        element.innerHTML = createViewTextSummary(vars);
}

const createViewText = (vars) => {
    return `
    	<section class="section">
        	<div class="text-summary" id="text-summary-details">
				${createViewTextSummary(vars)}
			</div>
    	</section>
	`;
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const updateViewData = (vars) => {
    model
		.filter(item => item.name)
		.forEach(item =>
        	item.elems.forEach(elem => {
            	const value = locate(vars, elem.path)
            	if (value !== null && value !== undefined) {
                	const element = document.getElementById(`${item.id}-${elem.id}`);
                	if (element)
                    	element.textContent = elem.format(elem, value);
            	}
        	})
    	);
}

const createViewData = (vars) => {
    return model
		.filter(item => item.name)
		.map(item => {
			const __table = (sect, elem, vars) => `
   				<div class="data-row">
       				<span class="label">
						${elem.label}
					</span>
       				<span class="value">
           				<span id="${sect}-${elem.id}">
							${elem.format(elem, locate(vars, elem.path))}
						</span>
           				<span class="unit">
							${elem.unit || ''}
						</span>
       				</span>
   				</div>
			`;
       		return `
      			<section class="section">
         			<h2>${item.name}</h2>
          			${item.elems.map(elem => __table (item.id, elem, vars)).join('')}
       			</section>
			`;
    	}).join('');
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const updateSectionData = (mode, vars) => {
    if (mode === 'text')
        updateViewText(vars);
    else
        updateViewData(vars);
};

const createSectionData = (mode, vars) => {
    if (mode === 'text')
        return createViewText(vars);
    else
        return createViewData(vars);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const UPDATE_THUMBS_PERIOD = 60*1000;

const thumbnails = [
    { file: 'snapshot_M15.jpg', label: 'T-15mins' },
    { file: 'snapshot_M30.jpg', label: 'T-30mins' },
    { file: 'snapshot_M45.jpg', label: 'T-45mins' },
    { file: 'snapshot_M60.jpg', label: 'T-60mins' }
];

const getThumbnailUrl = (file, now) =>
	`/snapshot/thumb/${file}?w=200&t=${now}`;
const getThumbnailDay = (now) => 
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

const updateSectionThumbs = () => {
    setTimeout(() => updateSectionThumbs(), UPDATE_THUMBS_PERIOD);
	const now = Date.now ();
	thumbnails.forEach(thumbnail => {
		const element = document.querySelector(`.thumbnail-image[data-thumbnail="${thumbnail.file}"]`);
        if (element)
        	element.src = getThumbnailUrl (thumbnail.file, now);
	});
};

const createSectionThumbs = () => {
    setTimeout(() => updateSectionThumbs(), UPDATE_THUMBS_PERIOD);
	const now = Date.now ();
    const thumbnailsBoxes = thumbnails.map (thumbnail => {
        return `
            <div class="thumbnail-container">
                <a href="/${thumbnail.file}" target="_blank">
                    <img src="${getThumbnailUrl (thumbnail.file, now)}" alt="${thumbnail.label}" class="thumbnail-image" data-thumbnail="${thumbnail.file}">
                    <div class="thumbnail-label">${thumbnail.label}</div>
                </a>
            </div>
        `;
	}).join ('');
    const thumbnailsLinks = `
        <div class="thumbnails-placeholder">
            <div class="snaps-nav-box">
                <div class="snaps-nav-item">
                    <a href="/snapshot/list/${getThumbnailDay (new Date ())}" class="snaps-nav-link">day</a>
                </div>
                <div class="snaps-nav-item">
                    <a href="/snapshot/list" class="snaps-nav-link">all</a>
                </div>
            </div>
        </div>
    `;
    return thumbnailsBoxes + thumbnailsLinks;
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const UPDATE_CAMERA_PERIOD = 30*1000;

const updateSectionCamera = () => {
    setTimeout(() => updateSectionCamera(), UPDATE_CAMERA_PERIOD);
    const element = document.getElementById('main-camera');
    if (element)
        element.src = '/snapshot.jpg?t=' + Date.now();
};

const createSectionCamera = (mode) => {
    setTimeout(() => updateSectionCamera(), UPDATE_CAMERA_PERIOD);
    return `
        <section class="section">
            ${mode === 'text' ? '' : '<h2>Camera</h2>'}
        	<div class="camera-container">
            	<a href="/snapshot.jpg" target="_blank" id="main-camera-link">
                	<img src="/snapshot.jpg" alt="Camera View" id="main-camera" class="weather-camera">
                	<div class="camera-hint">Click to view full size</div>
            	</a>
            	<div class="thumbnails-row" id="thumbnails-row">
                	${createSectionThumbs()}
            	</div>
        	</div>
        </section>
    `;
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const UPDATE_TIMECOUNT_PERIOD = 1*1000;

let timecountInterval;

const calculateTimeSince = (time) => 
    `${Math.max(Math.floor((new Date() - new Date(time.replace(/([+-]\d{2})Z$/, '$1:00'))) / 1000), 0)} secs ago`;
const updateSectionTimeElementTimestamp = (time) => {
    const element = document.getElementById('time-update');
	if (element)
		element.textContent = time;
};
const updateSectionTimeElementTimecount = (time) => {
    const element = document.getElementById('time-since');
	if (element)
		element.textContent = calculateTimeSince (time);
};
const scheduleSectionTimeElementTimecount = (time) => {
   	if (timecountInterval)
       	clearInterval(timecountInterval);
   	timecountInterval = setInterval(() => {
		updateSectionTimeElementTimecount (time);
	}, UPDATE_TIMECOUNT_PERIOD);
};

const updateSectionTime = (mode, vars) => {
    const time = locate(vars, CONFIG.var_timestamp);
    if (time) {
		updateSectionTimeElementTimestamp (time);
		updateSectionTimeElementTimecount (time);
		scheduleSectionTimeElementTimecount (time);
    }
};

const createSectionTime = (mode, vars) => {
    const time = locate(vars, CONFIG.var_timestamp);
	if (time)
		scheduleSectionTimeElementTimecount (time);
    return `
        <div class="time-updated">
            Updated <span id="time-update">${time || 'n/a'}</span>
            (<span id="time-since">${time ? calculateTimeSince (time) : 'n/a'}</span>)
        </div>
    `;
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const createSectionLinks = (mode) => {
    const links = CONFIG.external_links?.map(({ title, link }) =>
        `<a href="${link}" target="_blank"><strong>${title}</strong></a>`
    ).join(' | ');
    return `
        <div class="external-links">
            ${links}
        </div>
    `;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let varsLast;

const getMode = () =>
    localStorage.getItem('displayMode') || 'text';

const setMode = (mode) =>
    localStorage.setItem('displayMode', mode) + create(varsLast);

const displayMode = (mode) => `
	<div class="mode-switch">
		<a onclick="setMode('${mode === 'table' ? 'text' : 'table'}')">[${mode === 'table' ? 'table' : 'text'} view: click for ${mode === 'table' ? 'text' : 'table'}]</a>
	</div>`;

const update = (vars) => {
    varsLast = vars;
    const mode = getMode();

    updateWarningBanner(mode, vars);
    updateSectionData(mode, vars);
    updateSectionTime(mode, vars);
};

const create = (vars) => {
    varsLast = vars;
    const mode = getMode();

    document.getElementById('weather-dashboard').innerHTML = `
		${displayMode(mode)}
		${createWarningBanner(mode, vars)}
        ${createSectionData(mode, vars)}
        ${createSectionCamera(mode)}
        ${createSectionTime(mode, vars)}
        ${createSectionLinks(mode)}
	`;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
