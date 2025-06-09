// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

/* global weatherPushNotifications */

const FILTER_CATEGORIES_DISPLAY = ['aircraft', 'astronomy'];
const FILTER_CATEGORIES_ALERTS = ['weather', ...FILTER_CATEGORIES_DISPLAY];
const STORAGE_KEY_FILTERS_DISPLAY = 'weather-prefs-filter-display';
const STORAGE_KEY_FILTERS_ALERTS = 'weather-prefs-filter-alerts';

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
let filtersDisplay = preferencesLoadFilters(STORAGE_KEY_FILTERS_DISPLAY, FILTER_CATEGORIES_DISPLAY);
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
                    background: white;
                    border: 1px solid #ccc;
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

async function configurationUpdateAlerts(element) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        element.textContent = '[alerts blocked]';
        element.style.color = '#999';
    } else {
        const wantSubscribed = Object.values(filtersAlerts).some(Boolean);
        let isSubscribed = weatherPushNotifications.isSubscribed();
        if (wantSubscribed && !isSubscribed) await weatherPushNotifications.subscribe();
        else if (!wantSubscribed && isSubscribed) await weatherPushNotifications.unsubscribe();
        isSubscribed = weatherPushNotifications.isSubscribed();
        if (wantSubscribed && !isSubscribed) {
            element.textContent = '[configure alerts \u26A0]';
            element.style.color = '#ff6b6b';
        } else {
            element.textContent = '[configure alerts]';
            element.style.color = isSubscribed ? 'var(--primary-color)' : '#666';
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
    element.style.color = anyEnabled ? 'var(--primary-color)' : '#666';
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
