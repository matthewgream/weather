
// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const locate = (data, path) => path.split('.').reduce((accm, part) => accm && accm[part], data);

const joinand = (items) => {
    if (!items || items.length === 0) return "";
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const getWeatherInterpretation = (data) => {

    const { temp, humidity, pressure, windSpeed, solarRad, solarUvi, rainRate } = data;

    let conditions = [];
    if (pressure < 980)
        conditions.push("stormy");
    else if (pressure < 1000)
        conditions.push("unsettled");
    else if (pressure > 1030)
        conditions.push("stable");
    if (temp < -10)
        conditions.push("extremely cold");
    else if (temp < 0)
        conditions.push("freezing");
    else if (temp < 5)
        conditions.push("cold");
    else if (temp < 10)
        conditions.push("chilly");
    else if (temp < 18)
        conditions.push("cool");
    else if (temp < 24)
        ;	// conditions.push("comfortable");
    else if (temp < 30)
        conditions.push("warm");
    else
        conditions.push("hot");
    if (humidity > 90)
        conditions.push("very humid");
    else if (humidity > 70)
        conditions.push("humid");
    else if (humidity < 30)
        conditions.push("dry");
    let result = conditions.length > 0 ? joinand(conditions) : "";

    const dewPoint = temp - ((100 - humidity) / 5);
    const hour = new Date().getHours();
    let interpreted = [];
    if (temp < 0 && humidity > 85)
        interpreted.push("likely frost/snow");
    else if (temp > 25 && humidity > 80)
        interpreted.push("muggy");
    else if (pressure < 1000 && humidity > 80)
        interpreted.push("likely rain");
    else if (pressure > 1020 && humidity < 40)
        interpreted.push("clear/dry");
    if (temp < 10 && windSpeed > 3 && !interpreted.includes("frost"))
        interpreted.push("feels colder (wind chill)");
    if (temp > 20 && humidity > 60 && !interpreted.includes("muggy"))
        interpreted.push("feels warmer (humidity)");
    if (solarRad > 500)
        interpreted.push("strong sun");
    if (Math.abs(temp - dewPoint) < 2.5 && temp > 0)
        interpreted.push("possible fog");
    if (temp < 3 && temp > -2 && rainRate > 0)
        interpreted.push("possible freezing rain");
    if (temp < 5 && hour > 5 && hour < 10)
        interpreted.push("morning chill");
    let result_interpreted = interpreted.length > 0 ? joinand(interpreted) : "";

    result += (result.length > 0 && result_interpreted.length > 0 ? ": " : "") + result_interpreted;
    return result.length > 0 ? result.charAt(0).toUpperCase() + result.slice(1) + "." : null;
};

const createViewDataText = (vars) => {

    const outside = secs[0];
    const lake = secs[1];

    const temp = locate(vars, outside.elems[0].path);
    const humidity = locate(vars, outside.elems[1].path);
    const pressure = locate(vars, outside.elems[2].path);
    const windSpeed = locate(vars, outside.elems[3].path) || 0;
    const windGust = locate(vars, outside.elems[4].path);
    const windDir = locate(vars, outside.elems[5].path);
    const solarRad = locate(vars, outside.elems[6].path) || 0;
    const solarUvi = locate(vars, outside.elems[7].path) || 0;
    const rainRate = locate(vars, outside.elems[8].path) || 0;
    const rainDaily = locate(vars, outside.elems[9].path);
    const lakeSurface = locate(vars, lake.elems[0].path);
    const lakeSubmerged = locate(vars, lake.elems[1].path);

    const formattedTemp = outside.elems[0].format(outside.elems[0], temp);
    const formattedHumidity = outside.elems[1].format(outside.elems[1], humidity);
    const formattedPressure = outside.elems[2].format(outside.elems[2], pressure);
    const formattedWindSpeed = outside.elems[3].format(outside.elems[3], windSpeed);
    const formattedWindGust = outside.elems[4].format(outside.elems[4], windGust);
    const formattedWindDir = outside.elems[5].format(outside.elems[5], windDir).replace('n/a', '');
    const formattedSolarRad = outside.elems[6].format(outside.elems[6], solarRad);
    const formattedSolarUvi = outside.elems[7].format(outside.elems[7], solarUvi);
    const formattedRainRate = outside.elems[8].format(outside.elems[8], rainRate);
    const formattedRainDaily = outside.elems[9].format(outside.elems[9], rainDaily);
    const formattedLakeSurface = lake.elems[0].format(lake.elems[0], lakeSurface);
    const formattedLakeSubmerged = lake.elems[1].format(lake.elems[1], lakeSubmerged);

    let summary = `Temp <span class="value">${formattedTemp}°C</span> at <span class="value">${formattedHumidity}%</span> and <span class="value">${formattedPressure}</span> hPa.<br>`;
    if (!windSpeed)
        summary += "No wind.<br>";
    else {
        summary += `Wind <span class="value">${formattedWindSpeed}</span> m/s <span class="value">${formattedWindDir}</span>`;
        if (windGust && windGust > windSpeed)
            summary += `, gusting <span class="value">${formattedWindGust}</span> m/s</span>`;
        summary += `.<br>`;
    }
    if (!rainRate && !rainDaily)
        summary += "No rain.<br>";
    else {
        if (!rainRate && rainDaily)
            summary += `No rain`;
        else
            summary += `Rain <span class="value">${formattedRainRate}</span> mm/hr`;
        summary += ` (<span class="value">${formattedRainDaily}</span>mm today).<br>`;
    }
    if (!solarRad && !solarUvi)
        summary += "No solar.<br>";
    else {
        summary += `Solar <span class="value">${formattedSolarRad}</span> W/m²</span>`;
        if (solarUvi)
            summary += `, UVI <span class="value">${formattedSolarUvi}</span>`;
        summary += `.<br>`;
    }
    summary += `Lake <span class="value">${formattedLakeSurface}°C</span> above and <span class="value">${formattedLakeSubmerged}°C</span> below.`;

    let interpretation = getWeatherInterpretation({ temp, humidity, pressure, windSpeed, solarRad, solarUvi, rainRate });
    if (interpretation !== null)
        summary += `<br><br>${interpretation}`;

    return summary;
};

const format = (elem, valu) => (valu != null) ? valu.toFixed(elem.decimals ?? 0) : 'n/a';

const formatWindSpeed = (elem, valu) => (valu != null) ? (valu / 3.6).toFixed(elem.decimals ?? 0) : 'n/a';

const formatWindDirection = (elem, valu) => (valu == null) ? 'n/a' : `${valu.toFixed(elem.decimals ?? 0)}° ${['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.floor(((valu + 11.25) % 360) / 22.5)]}`;

const secs = [
    {
        name: 'Outside', id: 'outside',
        elems: [
            { label: 'Temperature', id: 'temp', unit: '°C', path: 'weather/branna.temp', decimals: 1, format },
            { label: 'Humidity', id: 'humidity', unit: '%', path: 'weather/branna.humidity', format },
            { label: 'Pressure', id: 'pressure', unit: 'hPa', path: 'weather/branna.baromrel', format },
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

const createViewDataTable = (sect, elem, vars) => `
    <div class="data-row">
        <span class="label">${elem.label}</span>
        <span class="value">
            <span id="${sect}-${elem.id}">${elem.format(elem, locate(vars, elem.path))}</span>
            ${elem.unit ? `<span class="unit">${elem.unit}</span>` : ''}
        </span>
    </div>
`;

const createViewData = (mode, sect, vars) => {
    const timestamp = locate(vars, config.var_timestamp);
    const timeDiff = Math.floor((new Date() - new Date(timestamp.replace(/([+-]\d{2})Z$/, '$1:00'))) / (60 * 1000));
    const warningBanner = (sect.id === 'outside' && timeDiff > 60) ?
        `<div style="background-color: #fee2e2; border: 1px solid #ef4444; padding: 1rem; margin-bottom: 1rem; border-radius: 0.375rem; font-weight: bold;">
        Weather data was last received at ${timestamp} (more than ${Math.floor(timeDiff)} minutes ago), thus the local weather station connection is offline.
        Please use <a href="https://www.wunderground.com/dashboard/pws/IBRUNS40">Weather Underground</a>. The Camera image is up to date.
    </div>` : '';
    if (mode === 'text' && sect.id === 'outside') {
        return `
        <section class="section">
            ${warningBanner}
            <div class="text-summary"><div id="text-summary-details">${createViewDataText(vars)}</span></div>
        </section>`;
    } else if (mode === 'text' && sect.id === 'lake') {
        return ''; // Skip lake section in text mode as it's included in the summary
    } else {
        return `
        <section class="section">
            ${warningBanner}
            <h2>${sect.name}</h2>
            ${sect.elems.map(elem => createViewDataTable(sect.id, elem, vars)).join('')}
        </section>`;
    }
};

const createSectionData = (mode, vars) => {
    return secs.map(sect => createViewData(mode, sect, vars)).join('')
}
const updateSectionData = (mode, vars) => {

    if (mode === 'text') {
        const textElement = document.getElementById('text-summary-details');
        if (textElement)
            textElement.innerHTML = createViewDataText(vars);
    } else {
        secs.forEach(sect =>
            sect.elems.forEach(elem => {
                const valu = locate(vars, elem.path), id = `${sect.id}-${elem.id}`;
                if (valu != null && document.getElementById(id) != null) document.getElementById(id).textContent = elem.format(elem, valu);
            })
        );
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const thumbnails = [
    { file: 'snapshot_M15.jpg', label: 'T-15mins' },
    { file: 'snapshot_M30.jpg', label: 'T-30mins' },
    { file: 'snapshot_M45.jpg', label: 'T-45mins' },
    { file: 'snapshot_M60.jpg', label: 'T-60mins' }
];
const thumbnailsCache = {};

const createSectionThumbs = () => {
    const now = new Date();
    const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    let thumbnailsHtml = '';
    for (const thumbnail of thumbnails) {
        const thumbnailSrc = thumbnailsCache[thumbnail.file] ||
            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23eaeaea"/%3E%3C/svg%3E';
        thumbnailsHtml += `
            <div class="thumbnail-container">
                <a href="/${thumbnail.file}" target="_blank">
                    <img src="${thumbnailSrc}" alt="${thumbnail.label}" 
                         class="thumbnail-image"
                         data-thumbnail="${thumbnail.file}">
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

let lastThumbnailUpdate = 0;

const loadSectionThumbs = () => {
    lastThumbnailUpdate = Date.now();
    const thumbnailImages = document.querySelectorAll('.thumbnail-image[data-thumbnail]');
    thumbnailImages.forEach(img => {
        const thumbnailFile = img.getAttribute('data-thumbnail');
        if (thumbnailsCache[thumbnailFile])
            return;
        const thumbnailUrl = `/snapshot/thumb/${thumbnailFile}?width=200`;
        fetch(thumbnailUrl)
            .then(response => response.blob())
            .then(blob => {
                const url = URL.createObjectURL(blob);
                thumbnailsCache[thumbnailFile] = url;
                img.src = url;
            })
            .catch(error => {
                console.error(`Error loading thumbnail ${thumbnailFile}:`, error);
                img.src = thumbnailUrl;
            });
    });
};

const updateSectionThumbs = () => {
    const difference = Date.now() - lastThumbnailUpdate;
    if (lastThumbnailUpdate === 0 || difference > 60 * 1 * 1000) {
        Object.values(thumbnailsCache).forEach(url => {
            try {
                URL.revokeObjectURL(url);
            } catch (e) { }
        });
        for (const thumbnailFile in thumbnailsCache)
            delete thumbnailsCache[thumbnailFile];
        const thumbnailsRow = document.getElementById('thumbnails-row');
        if (thumbnailsRow) {
            thumbnailsRow.innerHTML = createSectionThumbs();
            loadSectionThumbs();
        }
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

const update = (vars) => {

    const mode = getMode();

    updateSectionData(mode, vars);
    updateSectionTime(mode, vars);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const create = (vars) => {

    const mode = getMode();

    document.getElementById('weather-dashboard').innerHTML = `
        <div class="mode-switch">
            <a onclick="setMode('${mode === 'table' ? 'text' : 'table'}')">[${mode === 'table' ? 'table' : 'text'} mode: switch to ${mode === 'table' ? 'text' : 'table'} mode]</a>
        </div>
        ${createSectionData(mode, vars)}
        ${createSectionCamera(mode)}
        ${createSectionTime(mode, vars)}
        ${createSectionLinks(mode)}
	`;

    loadSectionThumbs();
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

