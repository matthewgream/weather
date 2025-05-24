// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const REPORT_PERIOD_DEFAULT = 5;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getTimestamp() {
    const now = new Date();
    return (
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0')
    );
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

class ReportCounter {
    constructor({ label, period }) {
        this.label = label;
        this.period = (period || REPORT_PERIOD_DEFAULT) * 60 * 1000;
        this.counts = {};
        this.lastUpdateTimes = {};
        this.lastReportTime = Date.now();
        this.intervalId = setInterval(() => this.reportSummary(), this.period);
    }
    update(key = '') {
        const timestamp = getTimestamp();
        const now = Date.now();
        let first = false;
        if (this.counts[key] === undefined) {
            first = true;
            this.counts[key] = 0;
            this.lastUpdateTimes[key] = { times: [], lastTime: now };
        }
        this.counts[key]++;
        const lastTime = this.lastUpdateTimes[key].lastTime;
        if (lastTime !== now) {
            this.lastUpdateTimes[key].times.push(now - lastTime);
            if (this.lastUpdateTimes[key].times.length > 10) this.lastUpdateTimes[key].times.shift();
        }
        this.lastUpdateTimes[key].lastTime = now;
        if (first) {
            if (key) console.log(`${this.label}: [${timestamp}] received '${key}'`);
            else console.log(`${this.label}: [${timestamp}] received`);
        }
    }
    reportSummary() {
        const timestamp = getTimestamp();
        const now = Date.now();
        const elapsed = ((now - this.lastReportTime) / 60000).toFixed(0);
        if (Object.keys(this.counts).length > 0) {
            const countStr = Object.entries(this.counts)
                .map(([key, count]) => {
                    let str = `${count}`;
                    const times = this.lastUpdateTimes[key].times;
                    if (times.length > 1) str += ` (avg ${(times.reduce((sum, time) => sum + time, 0) / times.length / 1000).toFixed(2)}s)`;
                    this.counts[key] = 0;
                    return key ? `'${key}': ${str}` : str;
                })
                .join(', ');
            console.log(`${this.label}: [${timestamp}] received (${elapsed} mins) ${countStr}`);
        }
        this.lastReportTime = now;
    }
    end() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    ReportCounter,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
