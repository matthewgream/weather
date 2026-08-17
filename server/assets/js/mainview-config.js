// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

/* global weatherPushNotifications */

const FILTER_CATEGORIES_DISPLAY = ['aviation', 'astronomy'];
const FILTER_CATEGORIES_ALERTS = ['weather', ...FILTER_CATEGORIES_DISPLAY];
const STORAGE_KEY_FILTERS_DISPLAY = 'weather-prefs-filter-display';
const STORAGE_KEY_FILTERS_ALERTS = 'weather-prefs-filter-alerts';

// -----------------------------------------------------------------------------------------------------------------------------------------
// URL parameters — kiosk-mode knobs, all optional, sensible defaults.
//
//   sections=<list>   Which top-level sections to render, and in what order.
//                     Names: header banner data camera time links
//
//                     If every entry is prefixed '-', the default order is
//                     kept and those sections are dropped:
//                         ?sections=-header,-camera
//                     Otherwise the list IS the order, verbatim:
//                         ?sections=banner,data,time
//
//                     Only '-' is understood, never '+': a literal '+' in a
//                     query string decodes to a space.
//
//   display=<list>    Display categories — the same ones behind the
//                     [configure display] control: aviation, astronomy.
//                     '-' disables, a bare name enables:
//                         ?display=-aviation
//                     Applies to this page load only; nothing is written back
//                     to localStorage, so a personal browser keeps whatever
//                     it had saved.
//
//   inverse=on        Dark palette. Applied by an inline script in the
//                     document head rather than here, so the first paint is
//                     already dark instead of flashing white.
//
// Unknown names are warned about and skipped rather than failing the render —
// a wall display should degrade to showing something.
// -----------------------------------------------------------------------------------------------------------------------------------------

const SECTIONS_DEFAULT = ['header', 'banner', 'data', 'camera', 'time', 'links'];

const urlParams = new URLSearchParams(window.location.search);

function urlParamList(name) {
    return (urlParams.get(name) || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

// eslint-disable-next-line no-unused-vars
function viewSections() {
    const entries = urlParamList('sections');
    if (entries.length === 0) return SECTIONS_DEFAULT;
    const subtractive = entries.every((entry) => entry.startsWith('-'));
    const requested = subtractive
        ? SECTIONS_DEFAULT.filter((section) => !new Set(entries.map((entry) => entry.slice(1))).has(section))
        : entries;
    const unknown = requested.filter((section) => !SECTIONS_DEFAULT.includes(section));
    if (unknown.length > 0) console.warn(`params: ignoring unknown section(s): ${unknown.join(', ')}`);
    return requested.filter((section) => SECTIONS_DEFAULT.includes(section));
}

function preferencesApplyDisplayOverrides(filters) {
    for (const entry of urlParamList('display')) {
        const disable = entry.startsWith('-');
        const category = disable ? entry.slice(1) : entry;
        if (FILTER_CATEGORIES_DISPLAY.includes(category)) filters[category] = !disable;
        else console.warn(`params: ignoring unknown display category '${category}'`);
    }
    return filters;
}

function preferencesLoadFilters(key, categories) {
    try {
        const stored = localStorage.getItem(key);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error(`prefs: failed to load, key=${key}:`, e);
    }
    return Object.fromEntries(categories.map((category) => [category, true]));
}
function preferencesSaveFilters(key, filters) {
    try {
        localStorage.setItem(key, JSON.stringify(filters));
    } catch (e) {
        console.error(`prefs: failed to save, key=${key}:`, e);
    }
}
// The URL overrides the saved preferences, so ?display=-aviation wins over
// whatever this browser had stored — and because it is applied here, the
// existing .type-<category> machinery and the header toggles both see it.
let filtersDisplay = preferencesApplyDisplayOverrides(preferencesLoadFilters(STORAGE_KEY_FILTERS_DISPLAY, FILTER_CATEGORIES_DISPLAY));
let filtersAlerts = preferencesLoadFilters(STORAGE_KEY_FILTERS_ALERTS, FILTER_CATEGORIES_ALERTS);

// -----------------------------------------------------------------------------------------------------------------------------------------

function configurationSelectorPanelBuild(type, filters, categories) {
    const checkboxes = categories
        .map(
            (category) => `
        <label style="display: block; padding: 4px 0; cursor: pointer;">
            <input type="checkbox"
                   data-filter-type="${type}"
                   data-filter-cat="${category}"
                   ${filters[category] ? 'checked' : ''}
                   style="margin-right: 6px;">
            ${category.charAt(0).toUpperCase() + category.slice(1)}
        </label>
    `
        )
        .join('');
    return `
        <div class="config-selector-panel"
             data-panel-type="${type}"
             style="position: absolute;
                    top: 100%;
                    left: 0;
                    background: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    padding: 8px 12px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    z-index: 1000;
                    display: none;
                    min-width: 150px;">
            ${checkboxes}
        </div>
    `;
}

async function configurationSelectorInit(element, type, categories, storageKey, filters, updater) {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    const toggle = document.createElement('a');
    toggle.className = 'filter-toggle';
    toggle.style.cursor = 'pointer';
    toggle.style.marginRight = '0.5em';
    await updater(toggle);
    wrapper.innerHTML = configurationSelectorPanelBuild(type, filters, categories);
    wrapper.prepend(toggle);
    const panel = wrapper.querySelector('.config-selector-panel');
    let hoverTimeout;
    wrapper.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimeout);
        panel.style.display = 'block';
    });
    wrapper.addEventListener('mouseleave', () => {
        hoverTimeout = setTimeout(() => {
            panel.style.display = 'none';
        }, 300);
    });
    panel.addEventListener('change', async (e) => {
        if (e.target.type === 'checkbox') {
            filters[e.target.dataset.filterCat] = e.target.checked;
            preferencesSaveFilters(storageKey, filters);
            await updater(toggle, e.target.dataset.filterCat);
        }
    });
    element.append(wrapper);
}

async function configurationUpdateAlerts(element, category) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        element.textContent = '[alerts blocked]';
        element.style.color = 'var(--muted-color)';
    } else {
        const wantSubscribed = Object.values(filtersAlerts).some(Boolean);
        let isSubscribed = weatherPushNotifications.isSubscribed();
        if (wantSubscribed && !isSubscribed) {
            // Subscribe with current filter preferences
            await weatherPushNotifications.subscribe(filtersAlerts);
        } else if (!wantSubscribed && isSubscribed) {
            await weatherPushNotifications.unsubscribe();
        } else if (isSubscribed && category !== undefined) {
            // Already subscribed, just update preferences on server
            await weatherPushNotifications.updatePreferences(filtersAlerts);
        }
        isSubscribed = weatherPushNotifications.isSubscribed();
        if (wantSubscribed && !isSubscribed) {
            element.textContent = '[configure alerts \u26A0]';
            element.style.color = '#ff6b6b';
        } else {
            element.textContent = '[configure alerts]';
            element.style.color = isSubscribed ? 'var(--primary-color)' : 'var(--muted-color)';
        }
    }
}

async function configurationUpdateDisplay(element, category) {
    const anyEnabled = FILTER_CATEGORIES_DISPLAY.reduce((anyEnabled, cat) => {
        const enabled = filtersDisplay[cat];
        if (category === undefined || category === cat) document.querySelectorAll(`.type-${cat}`).forEach((e) => (e.style.display = enabled ? '' : 'none'));
        return anyEnabled || enabled;
    }, false);
    element.textContent = `[configure display]`;
    element.style.color = anyEnabled ? 'var(--primary-color)' : 'var(--muted-color)';
}

async function configurationInit() {
    document.querySelectorAll('.config-selector').forEach((element) => {
        configurationSelectorInit(element, 'alerts', FILTER_CATEGORIES_ALERTS, STORAGE_KEY_FILTERS_ALERTS, filtersAlerts, configurationUpdateAlerts);
        configurationSelectorInit(element, 'display', FILTER_CATEGORIES_DISPLAY, STORAGE_KEY_FILTERS_DISPLAY, filtersDisplay, configurationUpdateDisplay);
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function displayIsEnabled(category) {
    return Boolean(filtersDisplay[category]);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
