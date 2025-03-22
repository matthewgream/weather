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
            //
            const locate = (data, path) => path.split('.').reduce((accm, part) => accm && accm[part], data);

            const joinAnd = (items) => {
                if (!items || items.length === 0) return "";
                if (items.length === 1) return items[0];
                if (items.length === 2) return `${items[0]} and ${items[1]}`;
                return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
            };

            const getWeatherInterpretation = (data) => {

                const { temp, humidity, pressure, windSpeed, solarRad, uv, rainRate } = data;

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
                let result = conditions.length > 0 ? joinAnd(conditions) : "";

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
                let result_interpreted = interpreted.length > 0 ? joinAnd(interpreted) : "";

                result += (result.length > 0 && result_interpreted.length > 0 ? ": " : "") + result_interpreted;
                return result.length > 0 ? result.charAt(0).toUpperCase() + result.slice(1) + "." : null;
            };

            const createTextSummary = (vars) => {

                const outside = secs[0];
                const lake = secs[1];

                const temp = locate(vars, outside.elems[0].path);
                const humidity = locate(vars, outside.elems[1].path);
                const pressure = locate(vars, outside.elems[2].path);
                const windSpeed = locate(vars, outside.elems[3].path);
                const windGust = locate(vars, outside.elems[4].path);
                const windDir = locate(vars, outside.elems[5].path);
                const solarRad = locate(vars, outside.elems[6].path);
                const solarUvi = locate(vars, outside.elems[7].path);
                const rainRate = locate(vars, outside.elems[8].path);
                const rainDaily = locate(vars, outside.elems[9].path);
                const lakeSurface = locate(vars, lake.elems[0].path);
                const lakeSubmerged = locate(vars, lake.elems[1].path);
                const weatherData = {
                    temp, humidity, pressure,
                    windSpeed: windSpeed || 0,
                    solarRad: solarRad || 0,
                    uv: solarUvi || 0,
                    rainRate: rainRate || 0,
                };

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
                //
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

                let interpretation = getWeatherInterpretation(weatherData);
                if (interpretation !== null)
                    summary += `<br><br>${interpretation}`;

                return summary;
            };
            const create = (secs, vars) => {
                const mode = getMode();
                const __elem = (sect, elem, vars) => `
            	<div class="data-row">
                	<span class="label">${elem.label}</span>
                	<span class="value">
                    	<span id="${sect}-${elem.id}">${elem.format(elem, locate(vars, elem.path))}</span>
 						${elem.unit ? `<span class="unit">${elem.unit}</span>` : ''}
                	</span>
            	</div>`;
                const __sect = (sect, vars) => {
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
            				<div class="text-summary">${createTextSummary(vars)}</div>
        				</section>`;
                    } else if (mode === 'text' && sect.id === 'lake') {
                        return ''; // Skip lake section in text mode as it's included in the summary
                    } else {
                        return `
        				<section class="section">
            				${warningBanner}
            				<h2>${sect.name}</h2>
            				${sect.elems.map(elem => __elem(sect.id, elem, vars)).join('')}
        				</section>`;
                    }
                };
                const timestamp = locate(vars, config.var_timestamp);
                const linkshtml = config.external_links.map(link => {
                    const [label, url] = Object.entries(link)[0];
                    return `<a href="${url}" target="_blank"><strong>${label}</strong></a>`;
                }).join(' | ');
                const modeSwitch = `
                <div class="mode-switch">
                    <a onclick="setMode('${mode === 'table' ? 'text' : 'table'}')">[${mode === 'table' ? 'table' : 'text'} mode: switch to ${mode === 'table' ? 'text' : 'table'} mode]</a>
                </div>
            `;
                document.getElementById('weather-dashboard').innerHTML = `
    			${modeSwitch}
    			${secs.map(sect => __sect(sect, vars)).join('')}
				<section class="section">
    				${mode === 'text' ? '' : '<h2>Camera</h2>'}
				<div class="camera-container">
    				<a href="/snapshot.jpg" target="_blank" id="main-camera-link">
        				<img src="/snapshot.jpg" alt="Camera View" id="main-camera" onload="setTimeout(() => updateMainCamera(), 30000)" class="weather-camera">
        				<div class="camera-hint">Click to view full size</div>
    				</a>
    				<div class="thumbnails-row" id="thumbnails-row">
    				</div>
				</div>
				</section>
    			<div class="update-timestamp">
        			Updated <span id="last-update">${timestamp || 'n/a'}</span>
        			(<span id="time-ago"></span>)
    			</div>
    			<div class="external-links">
        			${linkshtml}
    			</div>
			`;
                updateTimeAgo(timestamp);
                initThumbnails();
            }
            const update = (vars) => {
                const mode = getMode();
                if (mode === 'text') {
                    create(secs, vars);
                    return;
                }
                secs.forEach(sect =>
                    sect.elems.forEach(elem => {
                        const valu = locate(vars, elem.path), id = `${sect.id}-${elem.id}`;
                        if (valu != null && document.getElementById(id) != null) document.getElementById(id).textContent = elem.format(elem, valu);
                    }
                    ));
                const timestamp = locate(vars, config.var_timestamp);
                const timestampElement = document.getElementById('last-update');
                if (timestamp != null && timestampElement != null) {
                    timestampElement.textContent = timestamp;
                    updateTimeAgo(timestamp);
                }
            };
            let timeagoInterval;
            const updateTimeAgo = (timestamp) => {
                const timeagoElement = document.getElementById('time-ago');
                if (timeagoInterval)
                    clearInterval(timeagoInterval);
                const updateCounter = () =>
                    timeagoElement.textContent = `${Math.max(Math.floor((new Date() - new Date(timestamp.replace(/([+-]\d{2})Z$/, '$1:00'))) / 1000), 0)} secs ago`;
                updateCounter();
                timeagoInterval = setInterval(updateCounter, 1000);
            };

            const thumbnails = [
                { file: 'snapshot_M15.jpg', label: 'T-15mins' },
                { file: 'snapshot_M30.jpg', label: 'T-30mins' },
                { file: 'snapshot_M45.jpg', label: 'T-45mins' },
                { file: 'snapshot_M60.jpg', label: 'T-60mins' }
            ];
            const clientThumbnailCache = {};
            const initThumbnails = () => {
                const container = document.getElementById('thumbnails-row');
                if (!container) return;
                let needsUpdate = container.children.length === 0;
                if (!needsUpdate) {
                    const cacheAge = localStorage.getItem('thumbnailCacheTimestamp');
                    if (!cacheAge || (Date.now() - parseInt(cacheAge)) > 1 * 60 * 1000)
                        needsUpdate = true;
                }
                if (needsUpdate) {
                    container.innerHTML = '';
                    for (const thumbnail of thumbnails) {
                        const thumbContainer = document.createElement('div');
                        thumbContainer.className = 'thumbnail-container';
                        const thumbLink = document.createElement('a');
                        thumbLink.href = '/' + thumbnail.file;
                        thumbLink.target = '_blank';
                        const thumbImg = document.createElement('img');
                        thumbImg.className = 'thumbnail-image';
                        const cacheKey = thumbnail.file;
                        const thumbnailUrl = `/snapshot/thumb/${thumbnail.file}?width=200`;
                        if (clientThumbnailCache[cacheKey]) {
                            thumbImg.src = clientThumbnailCache[cacheKey];
                        } else {
                            thumbImg.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23eaeaea"/%3E%3C/svg%3E';
                            fetch(thumbnailUrl)
                                .then(response => response.blob())
                                .then(blob => {
                                    const url = URL.createObjectURL(blob);
                                    clientThumbnailCache[cacheKey] = url;
                                    thumbImg.src = url;
                                })
                                .catch(error => {
                                    console.error(`Error loading thumbnail ${thumbnail.file}:`, error);
                                    thumbImg.src = thumbnailUrl; // Fallback to direct loading
                                });
                        }
                        thumbImg.alt = thumbnail.label;
                        const thumbLabel = document.createElement('div');
                        thumbLabel.className = 'thumbnail-label';
                        thumbLabel.textContent = thumbnail.label;
                        thumbLink.appendChild(thumbImg);
                        thumbContainer.appendChild(thumbLink);
                        thumbContainer.appendChild(thumbLabel);
                        container.appendChild(thumbContainer);
                    }

                    const placeholder = document.createElement('div');
                    placeholder.className = 'thumbnails-placeholder';
                    const snapsNavBox = document.createElement('div');
                    snapsNavBox.className = 'snaps-nav-box';
                    const now = new Date();
                    const dayFormat = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
                    /*
                            const snapsLabel = document.createElement('div');
                            snapsLabel.textContent = 'schnapps';
                            snapsLabel.className = 'snaps-nav-item snaps-nav-label';
                            snapsNavBox.appendChild(snapsLabel);
                    */
                    const dayItem = document.createElement('div');
                    dayItem.className = 'snaps-nav-item';
                    const dayArrow = document.createElement('span');
                    // dayArrow.textContent = '-> ';
                    dayArrow.textContent = '';
                    dayArrow.className = 'snaps-nav-arrow';
                    dayItem.appendChild(dayArrow);
                    const dayLink = document.createElement('a');
                    dayLink.href = `/snapshot/list/${dayFormat}`;
                    dayLink.textContent = 'day';
                    dayLink.className = 'snaps-nav-link';
                    dayItem.appendChild(dayLink);
                    snapsNavBox.appendChild(dayItem);
                    const allItem = document.createElement('div');
                    allItem.className = 'snaps-nav-item';
                    const allArrow = document.createElement('span');
                    // allArrow.textContent = '-> ';
                    allArrow.textContent = '';
                    allArrow.className = 'snaps-nav-arrow';
                    allItem.appendChild(allArrow);
                    const allLink = document.createElement('a');
                    allLink.href = '/snapshot/list';
                    allLink.textContent = 'all';
                    allLink.className = 'snaps-nav-link';
                    allItem.appendChild(allLink);
                    snapsNavBox.appendChild(allItem);
                    placeholder.appendChild(snapsNavBox);
                    container.appendChild(placeholder);

                    localStorage.setItem('thumbnailCacheTimestamp', Date.now().toString());
                }
            };

            const updateMainCamera = () => {
                const mainCamera = document.getElementById('main-camera');
                if (mainCamera) {
                    const timestamp = Date.now();
                    mainCamera.src = '/snapshot.jpg?t=' + timestamp;
                    setTimeout(() => updateMainCamera(), 30000);
                    const cacheAge = localStorage.getItem('thumbnailCacheTimestamp');
                    if (!cacheAge || (Date.now() - parseInt(cacheAge)) > 1 * 60 * 1000) {
                        Object.values(clientThumbnailCache).forEach(url => {
                            try {
                                URL.revokeObjectURL(url);
                            } catch (e) { }
                        });
                        for (const key in clientThumbnailCache)
                            delete clientThumbnailCache[key];
                        initThumbnails();
                    }
                }
            };
