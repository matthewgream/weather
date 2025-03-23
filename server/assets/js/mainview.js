
// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const format = (elem, valu) => (valu != null) ? valu.toFixed(elem.decimals ?? 0) : 'n/a';
const formatWindSpeed = (elem, valu) => (valu != null) ? (valu / 3.6).toFixed(elem.decimals ?? 0) : 'n/a';
const formatWindDirection = (elem, valu) => (valu == null) ? 'n/a' : `${valu.toFixed(elem.decimals ?? 0)}° ${['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.floor(((valu + 11.25) % 360) / 22.5)]}`;

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
            { label: 'Solar Radiation', id: 'solarrad', unit: 'W/m²', path: 'weather/branna.solarradiation', decimals: 1, format },
            { label: 'Solar UVI', id: 'solaruv', unit: '', path: 'weather/branna.uv', decimals: 1, format: format },
            { label: 'Rain Rate', id: 'rainrate', unit: 'mm/hr', path: 'weather/branna.rainrate', decimals: 1, format: format },
            { label: 'Rain Daily', id: 'raindaily', unit: 'mm', path: 'weather/branna.dailyrain', decimals: 1, format: format }
        ]
    },
    {
        name: 'Lake', id: 'lake',
        elems: [
            { label: 'Surface (-15cm)', id: 'surface', unit: '°C', path: 'weather/branna.tf_ch1', decimals: 1, format },
            { label: 'Submerged (-1m)', id: 'submerged', unit: '°C', path: 'weather/branna.tf_ch2', decimals: 1, format }
        ]
    },
];

const locate = (data, path) => path.split('.').reduce((accm, part) => accm && accm[part], data);

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const formatWarningBanner = (timestamp, timeDiff) => {
	return `Weather data was last received at ${timestamp} (more than ${Math.floor(timeDiff)} minutes ago), thus the local weather station connection is offline.
        	Please use <a href="https://www.wunderground.com/dashboard/pws/IBRUNS40">Weather Underground</a>. The Camera image is up to date.`;
};

const createWarningBanner = (vars) => {
    const timestamp = locate(vars, config.var_timestamp);
    const timeDiff = Math.floor((new Date() - new Date(timestamp.replace(/([+-]\d{2})Z$/, '$1:00'))) / (60 * 1000));
    return (timeDiff > 60) ?
        `<section class="section>
			<div style="background-color: #fee2e2; border: 1px solid #ef4444; padding: 1rem; margin-bottom: 1rem; border-radius: 0.375rem; font-weight: bold;" id="warning-banner">
				${formatWarningBanner(timestamp, timeDiff)}
    		</div>
		 </section>
		` : '';
};

const updateWarningBanner = (vars) => {
    const timestamp = locate(vars, config.var_timestamp);
    const timeDiff = Math.floor((new Date() - new Date(timestamp.replace(/([+-]\d{2})Z$/, '$1:00'))) / (60 * 1000));
    const element = document.getElementById('warning-banner');
	if (element)
		element.innerHTML = (timeDiff > 60) ? formatWarningBanner(timestamp, timeDiff) : '';
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const createViewTextSummary = (vars) => {

    const outside = model[0];
    const lake = model[1];

    const temp = locate(vars, outside.elems[0].path);
    const humidity = locate(vars, outside.elems[1].path);
    const pressure = locate(vars, outside.elems[2].path);
    const windSpeed = locate(vars, outside.elems[3].path);
    const windGust = locate(vars, outside.elems[4].path);
    const windDir = locate(vars, outside.elems[5].path);
    const rainRate = locate(vars, outside.elems[8].path);
    const rainDaily = locate(vars, outside.elems[9].path);
    const solarRad = locate(vars, outside.elems[6].path);
    const solarUvi = locate(vars, outside.elems[7].path);
    const lakeSurface = locate(vars, lake.elems[0].path);
    const lakeSubmerged = locate(vars, lake.elems[1].path);

    let details = '';
	if (temp !== null && humidity !== null && pressure !== null) {
		if (temp === null || humidity === null || pressure === null)
			details += "No data.<br>";
		else {
    		const formattedTemp = outside.elems[0].format(outside.elems[0], temp);
    		const formattedHumidity = outside.elems[1].format(outside.elems[1], humidity);
    		const formattedPressure = outside.elems[2].format(outside.elems[2], pressure);
			details += `Temp <span class="value">${formattedTemp}°C</span> at <span class="value">${formattedHumidity}%</span> and <span class="value">${formattedPressure}</span> hPa.<br>`;
		}
    	if (!windSpeed)
        	details += "No wind.<br>";
    	else {
    		const formattedWindSpeed = outside.elems[3].format(outside.elems[3], windSpeed);
    		const formattedWindDir = outside.elems[5].format(outside.elems[5], windDir).replace('n/a', '');
        	details += `Wind <span class="value">${formattedWindSpeed}</span> m/s <span class="value">${formattedWindDir}</span>`;
        	if (windGust && windGust > windSpeed) {
    			const formattedWindGust = outside.elems[4].format(outside.elems[4], windGust);
            	details += `, gusting <span class="value">${formattedWindGust}</span> m/s</span>`;
			}
        	details += `.<br>`;
    	}
    	if (!rainRate && !rainDaily)
        	details += "No rain.<br>";
    	else {
    		const formattedRainRate = outside.elems[8].format(outside.elems[8], rainRate);
        	details += `Rain <span class="value">${formattedRainRate}</span> mm/hr`;
			if (rainDaily) {
    			const formattedRainDaily = outside.elems[9].format(outside.elems[9], rainDaily);
        		details += ` (<span class="value">${formattedRainDaily}</span>mm today)`;
			}
        	details += `.<br>`;
    	}
    	if (!solarRad)
        	details += "No solar.<br>";
    	else {
    		const formattedSolarRad = outside.elems[6].format(outside.elems[6], solarRad);
        	details += `Solar <span class="value">${formattedSolarRad}</span> W/m²</span>`;
        	if (solarUvi) {
    			const formattedSolarUvi = outside.elems[7].format(outside.elems[7], solarUvi);
            	details += `, UVI <span class="value">${formattedSolarUvi}</span>`;
			}
        	details += `.<br>`;
    	}
		if (lakeSurface === null && lakeSubmerged === null)
			details += "No lake.<br>";
		else {
    		const formattedLakeSurface = lake.elems[0].format(lake.elems[0], lakeSurface);
    		const formattedLakeSubmerged = lake.elems[1].format(lake.elems[1], lakeSubmerged);
    		details += `Lake <span class="value">${formattedLakeSurface}°C</span> above and <span class="value">${formattedLakeSubmerged}°C</span> below.`;
		}
	}

	let analysis = '';
	if (temp !== null && humidity !== null && pressure !== null) {
    	let w = getWeatherInterpretation({ temp, humidity, pressure, windSpeed, solarRad, solarUvi, rainRate });
    	if (w) {
        	analysis += `<br><br>${w.description}`;
			if (w.daylight) {
        		if (w.daylight.isDaytime && w.daylight.sunset)
            		analysis += ` Sunset at ${w.daylight.sunset}.`;
        		else if (!w.daylight.isDaytime && w.daylight.sunrise)
            		analysis += ` Sunrise at ${w.daylight.sunrise}.`;
			}
			if (w.alerts && w.alerts.length > 0)
				analysis += `<br><br>WARNING: ${joinand (w.alerts)}.`;
		}
	}

	let result = details + analysis;
	if (!result)
		result = "No data: likely technical fault.<br>";

	return result;
};

const createViewText = (vars) => {
	return `
    	<section class="section">
        	<div class="text-summary" id="text-summary-details">
				${createViewTextSummary(vars)}
			</div>
    	</section>
	`;
};
const updateViewText = (vars) => {
    const element = document.getElementById('text-summary-details');
    if (element)
        element.innerHTML = createViewTextSummary(vars);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const createViewDataTable = (sect, elem, vars) => `
    <div class="data-row">
        <span class="label">${elem.label}</span>
        <span class="value">
            <span id="${sect}-${elem.id}">${elem.format(elem, locate(vars, elem.path))}</span>
            ${elem.unit ? `<span class="unit">${elem.unit}</span>` : ''}
        </span>
    </div>
`;

const createViewData = (vars) => {
   	return model.map(item => {
       	return `
       		<section class="section">
           		<h2>${item.name}</h2>
           		${item.elems.map(elem => createViewDataTable(item.id, elem, vars)).join('')}
       		</section>
		`;
	}).join('');
};

const updateViewData = (vars) => {
    model.forEach(item =>
        item.elems.forEach(elem => {
            const value = locate(vars, elem.path)
			if (value !== null) {
				const element = document.getElementById(`${item.id}-${elem.id}`);
				if (element)
					element.textContent = elem.format(elem, value);
			}
        })
    );
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const createSectionData = (mode, vars) => {
	if (mode === 'text')
		return createViewText (vars);
	else
		return createViewData (vars);
};

const updateSectionData = (mode, vars) => {
    if (mode === 'text')
		updateViewText (vars);
    else
		updateViewData (vars);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const thumbnails = [
    { file: 'snapshot_M15.jpg', label: 'T-15mins' },
    { file: 'snapshot_M30.jpg', label: 'T-30mins' },
    { file: 'snapshot_M45.jpg', label: 'T-45mins' },
    { file: 'snapshot_M60.jpg', label: 'T-60mins' }
];

let thumbnailsLastUpdate = 0;
let thumbnailsCacheCurrent = {};
let thumbnailsCachePending = {};

const createSectionThumbs = () => {
    const now = new Date();
    const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    let thumbnailsHtml = '';
    for (const thumbnail of thumbnails) {
        const thumbnailSrc = thumbnailsCacheCurrent[thumbnail.file] ||
            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23eaeaea"/%3E%3C/svg%3E';
        thumbnailsHtml += `
            <div class="thumbnail-container">
                <a href="/${thumbnail.file}" target="_blank">
                    <img src="${thumbnailSrc}" alt="${thumbnail.label}" class="thumbnail-image" data-thumbnail="${thumbnail.file}">
                    <div class="thumbnail-label">${thumbnail.label}</div>
                </a>
            </div>
        `;
    }
    const thumbnailsLinks = `
        <div class="thumbnails-placeholder">
            <div class="snaps-nav-box">
                <div class="snaps-nav-item">
                    <a href="/snapshot/list/${day}" class="snaps-nav-link">day</a>
                </div>
                <div class="snaps-nav-item">
                    <a href="/snapshot/list" class="snaps-nav-link">all</a>
                </div>
            </div>
        </div>
    `;
    return thumbnailsHtml + thumbnailsLinks;
};

const loadSectionThumbs = () => {
    thumbnailsLastUpdate = Date.now();
    const thumbnailImages = document.querySelectorAll('.thumbnail-image[data-thumbnail]');
    thumbnailImages.forEach(img => {
        const thumbnailFile = img.getAttribute('data-thumbnail');
        if (thumbnailsCacheCurrent[thumbnailFile]) {
            img.src = thumbnailsCacheCurrent[thumbnailFile];
            return;
        }
        const thumbnailUrl = `/snapshot/thumb/${thumbnailFile}?width=200`;
        fetch(thumbnailUrl)
            .then(response => response.blob())
            .then(blob => {
                const url = URL.createObjectURL(blob);
                thumbnailsCacheCurrent[thumbnailFile] = url;
                img.src = url;
            })
            .catch(error => {
                console.error(`Error loading thumbnail ${thumbnailFile}:`, error);
                img.src = thumbnailUrl;
            });
    });
};

const updateSectionThumbs = () => {
    const currentTime = Date.now();
    const difference = currentTime - thumbnailsLastUpdate;
    const threshold = 60000;
    if (thumbnailsLastUpdate === 0 || difference > threshold) {
        thumbnailsCachePending = {};
        const preloadPromises = thumbnails.map(thumbnail => {
            const thumbnailUrl = `/snapshot/thumb/${thumbnail.file}?width=200&t=${currentTime}`;
            return fetch(thumbnailUrl)
                .then(response => response.blob())
                .then(blob => {
                    const url = URL.createObjectURL(blob);
                    thumbnailsCachePending[thumbnail.file] = url;
                    return thumbnail.file;
                })
                .catch(error => {
                    console.error(`Error pre-loading thumbnail ${thumbnail.file}:`, error);
                    return null;
                });
        });
        Promise.all(preloadPromises).then(() => {
            thumbnails.forEach(thumbnail => {
                const img = document.querySelector(`.thumbnail-image[data-thumbnail="${thumbnail.file}"]`);
                if (img && thumbnailsCachePending[thumbnail.file])
                    img.src = thumbnailsCachePending[thumbnail.file];
            });
            Object.values(thumbnailsCacheCurrent).forEach(url => {
                try {
                    URL.revokeObjectURL(url);
                } catch (e) { }
            });
            thumbnailsCacheCurrent = { ...thumbnailsCachePending };
            thumbnailsCachePending = {};
            thumbnailsLastUpdate = currentTime;
        });
    }
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const updateSectionCamera = () => {
    const camera = document.getElementById('main-camera');
    if (camera) {
        camera.src = '/snapshot.jpg?t=' + Date.now();
        setTimeout(() => updateSectionCamera(), 30000);
        updateSectionThumbs();
    }
};

const createSectionCamera = (mode) => {
    return `
        <section class="section">
            ${mode === 'text' ? '' : '<h2>Camera</h2>'}
        <div class="camera-container">
            <a href="/snapshot.jpg" target="_blank" id="main-camera-link">
                <img src="/snapshot.jpg" alt="Camera View" id="main-camera" onload="setTimeout(() => updateSectionCamera(), 30000)" class="weather-camera">
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

const createSectionLinks = (mode) => {
    const links = config.external_links.map(link => {
        const [label, url] = Object.entries(link)[0];
        return `<a href="${url}" target="_blank"><strong>${label}</strong></a>`;
    }).join(' | ');
    return `
        <div class="external-links">
            ${links}
        </div>
    `;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let timecountInterval;

const updateSectionTime = (mode, vars) => {

    const time = locate(vars, config.var_timestamp);
    if (time) {
        const timestampElement = document.getElementById('last-update');
        if (timestampElement)
            timestampElement.textContent = time;

        const updateTimecount = () => {
            const timecountElement = document.getElementById('time-ago');
            if (timecountElement)
                timecountElement.textContent = `${Math.max(Math.floor((new Date() - new Date(time.replace(/([+-]\d{2})Z$/, '$1:00'))) / 1000), 0)} secs ago`;
        }
        if (timecountInterval)
            clearInterval(timecountInterval);
        timecountInterval = setInterval(updateTimecount, 1000);

        updateTimecount();
    }
};

const createSectionTime = (mode, vars) => {
    const time = locate(vars, config.var_timestamp);
    const ago = time ? `${Math.max(Math.floor((new Date() - new Date(time.replace(/([+-]\d{2})Z$/, '$1:00'))) / 1000), 0)} secs ago` : '';

    const updateTimecount = () => {
        const timecountElement = document.getElementById('time-ago');
        if (timecountElement)
            timecountElement.textContent = `${Math.max(Math.floor((new Date() - new Date(time.replace(/([+-]\d{2})Z$/, '$1:00'))) / 1000), 0)} secs ago`;
    }
    if (timecountInterval)
        clearInterval(timecountInterval);
    timecountInterval = setInterval(updateTimecount, 1000);

    return `
        <div class="update-timestamp">
            Updated <span id="last-update">${time || 'n/a'}</span>
            (<span id="time-ago">${ago}</span>)
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

	updateWarningBanner(vars);
    updateSectionData(mode, vars);
    updateSectionTime(mode, vars);
};

const create = (vars) => {
    varsLast = vars;
    const mode = getMode();

    document.getElementById('weather-dashboard').innerHTML = `
		${displayMode(mode)}
		${createWarningBanner(vars)}
        ${createSectionData(mode, vars)}
        ${createSectionCamera(mode)}
        ${createSectionTime(mode, vars)}
        ${createSectionLinks(mode)}
	`;

    loadSectionThumbs();
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

