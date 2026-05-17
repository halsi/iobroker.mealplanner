'use strict';

const utils = require('@iobroker/adapter-core');
const fs = require('fs');
const path = require('path');

const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

const DEFAULT_CATEGORIES = [
    { name: 'Vegetarisch', color: '#43a047' },
    { name: 'Fisch',       color: '#0288d1' },
    { name: 'Fleisch',     color: '#e53935' },
    { name: 'Extern',      color: '#f9a825' },
];

const DEFAULT_SETTINGS = {
    widget: { width: 1480, height: 650 },
    fonts: {
        kw_label:   { size: 26, color: '#FFCC99' },
        date_range: { size: 17, color: '#FFCC99' },
        col_header: { size: 12, color: '#FFCC99' },
        day_name:   { size: 17, color: '#FF9900' },
        day_date:   { size: 13, color: '#886600' },
        category:   { size: 17, color: '#FF9900' },
        dish:       { size: 17, color: '#FF9900' },
        side:       { size: 17, color: '#FF9900' },
    }
};

class MealplannerAdapter extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'mealplanner' });
        this.dbPath = null;
        this.db = { dishes: [], sides: [], plan: {}, categories: [], settings: null };
        this.midnightTimer = null;
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    // ─── Database helpers ───────────────────────────────────────────────────────

    getDbPath() {
        const dataDir = path.join(utils.getAbsoluteDefaultDataDir(), 'mealplanner');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        return path.join(dataDir, 'database.json');
    }

    loadDb() {
        try {
            if (fs.existsSync(this.dbPath)) {
                this.db = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
                if (!this.db.dishes)     this.db.dishes     = [];
                if (!this.db.sides)      this.db.sides      = [];
                if (!this.db.plan)       this.db.plan       = {};
                if (!this.db.categories) this.db.categories = DEFAULT_CATEGORIES.map(c => ({ id: this.generateId(), ...c }));
                if (!this.db.settings)  this.db.settings  = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            }
        } catch (e) {
            this.log.warn('DB load failed, starting fresh: ' + e.message);
            this.db = { dishes: [], sides: [], plan: {}, categories: DEFAULT_CATEGORIES.map(c => ({ id: this.generateId(), ...c })), settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) };
        }
    }

    saveDb() {
        try {
            const byName = (a, b) => a.name.localeCompare(b.name, 'de');
            this.db.dishes     = [...this.db.dishes].sort(byName);
            this.db.sides      = [...this.db.sides].sort(byName);
            this.db.categories = [...this.db.categories].sort(byName);
            fs.writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2), 'utf8');
            this.setState('info.database', {
                val: JSON.stringify({ dishes: this.db.dishes, sides: this.db.sides, categories: this.db.categories }),
                ack: true
            });
            this.setState('info.settings', { val: JSON.stringify(this.db.settings), ack: true });
        } catch (e) {
            this.log.error('DB save failed: ' + e.message);
        }
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    // ─── Calendar week helpers ───────────────────────────────────────────────────

    getKW(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 4 - (d.getDay() || 7));
        const yearStart = new Date(d.getFullYear(), 0, 1);
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    getKWKey(kw, year) {
        return `${year}-W${String(kw).padStart(2, '0')}`;
    }

    getCurrentKWInfo() {
        const now = new Date();
        const kw = this.getKW(now);
        const year = now.getFullYear();
        const nextDate = new Date(now);
        nextDate.setDate(nextDate.getDate() + 7);
        const nextKW = this.getKW(nextDate);
        const nextYear = nextDate.getFullYear();
        return {
            kw,
            year,
            kwKey: this.getKWKey(kw, year),
            nextKW,
            nextYear,
            nextKWKey: this.getKWKey(nextKW, nextYear)
        };
    }

    getTodayDay() {
        const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        return days[new Date().getDay()];
    }

    // ─── Adapter lifecycle ───────────────────────────────────────────────────────

    async onReady() {

        this.dbPath = this.getDbPath();
        this.loadDb();

        const { kw, nextKW } = this.getCurrentKWInfo();
        await this.setStateAsync('info.current_kw', { val: kw, ack: true });
        await this.setStateAsync('info.next_kw', { val: nextKW, ack: true });
        await this.setStateAsync('info.db_dishes', { val: this.db.dishes.length, ack: true });
        await this.setStateAsync('info.db_sides', { val: this.db.sides.length, ack: true });
        await this.setStateAsync('info.database', {
            val: JSON.stringify({ dishes: this.db.dishes, sides: this.db.sides, categories: this.db.categories }),
            ack: true
        });
        await this.setObjectNotExistsAsync('info.settings', {
            type: 'state',
            common: { name: 'Widget Settings', type: 'string', role: 'json', read: true, write: false },
            native: {},
        });
        await this.setStateAsync('info.settings', {
            val: JSON.stringify(this.db.settings),
            ack: true
        });

        await this.updateTodayStates();
        await this.updateWeekStates();

        await this.subscribeStatesAsync('cmd.*');
        await this.subscribeStatesAsync('week.*');
        await this.subscribeStatesAsync('info.plan_json');

        this.scheduleMidnightUpdate();

        this.log.info(
            `Mealplanner Adapter bereit. Gerichte: ${this.db.dishes.length}, Beilagen: ${this.db.sides.length}`
        );
    }

    scheduleMidnightUpdate() {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setDate(midnight.getDate() + 1);
        midnight.setHours(0, 1, 0, 0); // 00:01
        const msUntilMidnight = midnight - now;
        this.midnightTimer = setTimeout(async () => {
            const { kw, nextKW } = this.getCurrentKWInfo();
            await this.setStateAsync('info.current_kw', { val: kw, ack: true });
            await this.setStateAsync('info.next_kw', { val: nextKW, ack: true });
            await this.updateTodayStates();
            await this.updateWeekStates();
            this.scheduleMidnightUpdate();
        }, msUntilMidnight);
    }

    // ─── State update helpers ────────────────────────────────────────────────────

    async updateTodayStates() {
        const { kwKey } = this.getCurrentKWInfo();
        const today = this.getTodayDay();
        const plan = this.db.plan[kwKey] || {};
        const entry = plan[today] || {};

        const mainDish = this.db.dishes.find(d => d.id === entry.hauptspeise_id) || {};
        const sideDish = this.db.sides.find(s => s.id === entry.beilage_id) || {};

        await this.setStateAsync('today.main', { val: entry.hauptspeise_id || '', ack: true });
        await this.setStateAsync('today.main_name', { val: mainDish.name || '', ack: true });
        await this.setStateAsync('today.side', { val: entry.beilage_id || '', ack: true });
        await this.setStateAsync('today.side_name', { val: sideDish.name || '', ack: true });
        await this.setStateAsync('today.category', { val: mainDish.kategorie || '', ack: true });
        await this.setStateAsync('today.type', { val: entry.typ || 'normal', ack: true });
        await this.setStateAsync('today.note', { val: entry.notiz || '', ack: true });
    }

    async updateWeekStates() {
        const { kw, kwKey, nextKW, nextKWKey } = this.getCurrentKWInfo();
        const currentPlan = this.db.plan[kwKey] || {};
        const nextPlan = this.db.plan[nextKWKey] || {};

        for (const day of DAYS) {
            await this.writeDayStates('week.current.' + day, currentPlan[day] || {});
            await this.writeDayStates('week.next.' + day, nextPlan[day] || {});
        }

        await this.setStateAsync('info.plan_json', {
            val: JSON.stringify({
                current: { kw, key: kwKey, days: currentPlan },
                next:    { kw: nextKW, key: nextKWKey, days: nextPlan }
            }),
            ack: true
        });
    }

    async writeDayStates(prefix, entry) {
        const mainDish = this.db.dishes.find(d => d.id === entry.hauptspeise_id) || {};
        const sideDish = this.db.sides.find(s => s.id === entry.beilage_id) || {};
        await this.setStateAsync(prefix + '.main', { val: entry.hauptspeise_id || '', ack: true });
        await this.setStateAsync(prefix + '.main_name', { val: mainDish.name || '', ack: true });
        await this.setStateAsync(prefix + '.side', { val: entry.beilage_id || '', ack: true });
        await this.setStateAsync(prefix + '.side_name', { val: sideDish.name || '', ack: true });
        await this.setStateAsync(prefix + '.category', { val: mainDish.kategorie || '', ack: true });
        await this.setStateAsync(prefix + '.type', { val: entry.typ || 'normal', ack: true });
        await this.setStateAsync(prefix + '.note', { val: entry.notiz || '', ack: true });
    }

    async updateDbCountStates() {
        await this.setStateAsync('info.db_dishes', { val: this.db.dishes.length, ack: true });
        await this.setStateAsync('info.db_sides', { val: this.db.sides.length, ack: true });
    }

    // ─── State change handler ────────────────────────────────────────────────────

    async onStateChange(id, state) {
        if (!state || state.ack) return;
        const localId = id.replace(`${this.namespace}.`, '');

        if (localId === 'info.plan_json') {
            await this.handlePlanJsonChange(state.val);
        } else if (localId === 'cmd.suggest') {
            await this.handleSuggest();
        } else if (localId === 'cmd.export') {
            await this.handleExport();
        } else if (localId === 'cmd.import') {
            await this.handleImport(state.val);
        } else if (localId.startsWith('week.')) {
            await this.handleWeekStateChange(localId, state.val);
        }
    }

    // ─── Command handlers ────────────────────────────────────────────────────────

    async handleSuggest() {
        const { kwKey } = this.getCurrentKWInfo();
        const today = this.getTodayDay();
        if (!this.db.dishes.length) {
            this.log.warn('Keine Gerichte in der DB — Zufallsvorschlag nicht möglich');
            await this.setStateAsync('cmd.suggest', { val: false, ack: true });
            return;
        }
        const random = this.db.dishes[Math.floor(Math.random() * this.db.dishes.length)];
        if (!this.db.plan[kwKey]) this.db.plan[kwKey] = {};
        if (!this.db.plan[kwKey][today]) this.db.plan[kwKey][today] = {};
        this.db.plan[kwKey][today].hauptspeise_id = random.id;
        this.saveDb();
        await this.updateTodayStates();
        await this.updateWeekStates();
        await this.setStateAsync('cmd.suggest', { val: false, ack: true });
        this.log.info('Zufallsvorschlag: ' + random.name);
    }

    async handleExport() {
        const { kwKey, kw, nextKW, nextKWKey } = this.getCurrentKWInfo();
        let csv = 'kw;wochentag;hauptspeise;beilage;typ;notiz\n';
        for (const [wkKey, weekNum] of [[kwKey, kw], [nextKWKey, nextKW]]) {
            const plan = this.db.plan[wkKey] || {};
            for (const day of DAYS) {
                const e = plan[day] || {};
                const m = this.db.dishes.find(d => d.id === e.hauptspeise_id);
                const s = this.db.sides.find(d => d.id === e.beilage_id);
                csv += `${weekNum};${day};${m ? m.name : ''};${s ? s.name : ''};${e.typ || ''};${e.notiz || ''}\n`;
            }
        }
        const exportTime = new Date().toISOString();
        await this.setStateAsync('cmd.export', { val: false, ack: true });
        await this.setStateAsync('info.last_export', { val: exportTime, ack: true });
        this.log.info('Export erstellt:\n' + csv);
    }

    async handleImport(csvData) {
        if (!csvData || typeof csvData !== 'string') return;
        const lines = csvData.split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('kw'));
        let imported = 0;
        for (const line of lines) {
            const [kw, day, main, side, typ, note] = line.split(';');
            if (!kw || !day) continue;
            const kwKey = Object.keys(this.db.plan)
                .find(k => k.endsWith(`-W${String(kw).padStart(2, '0')}`))
                || `${new Date().getFullYear()}-W${String(kw).padStart(2, '00')}`;
            if (!this.db.plan[kwKey]) this.db.plan[kwKey] = {};
            const mainDish = this.db.dishes.find(d => d.name.toLowerCase() === (main || '').toLowerCase());
            const sideDish = this.db.sides.find(d => d.name.toLowerCase() === (side || '').toLowerCase());
            this.db.plan[kwKey][day] = {
                hauptspeise_id: mainDish ? mainDish.id : '',
                beilage_id: sideDish ? sideDish.id : '',
                typ: typ || 'normal',
                notiz: note || ''
            };
            imported++;
        }
        this.saveDb();
        await this.updateTodayStates();
        await this.updateWeekStates();
        await this.setStateAsync('cmd.import', { val: '', ack: true });
        this.log.info(`Import: ${imported} Einträge importiert`);
    }

    async handlePlanJsonChange(val) {
        try {
            const planData = JSON.parse(val);
            if (planData.current?.key) this.db.plan[planData.current.key] = planData.current.days || {};
            if (planData.next?.key)    this.db.plan[planData.next.key]    = planData.next.days    || {};
            this.saveDb();
            await this.updateTodayStates();
            await this.updateWeekStates();
        } catch (e) {
            this.log.error('plan_json parse failed: ' + e.message);
        }
    }

    async handleWeekStateChange(localId, val) {
        // localId: week.current.Montag.main  OR  week.next.Freitag.note
        const parts = localId.split('.');
        if (parts.length < 4) return;
        const weekPart = parts[1]; // current | next
        const day = parts[2];
        const field = parts[3];

        const { kwKey, nextKWKey } = this.getCurrentKWInfo();
        const wkKey = weekPart === 'current' ? kwKey : nextKWKey;

        if (!this.db.plan[wkKey]) this.db.plan[wkKey] = {};
        if (!this.db.plan[wkKey][day]) this.db.plan[wkKey][day] = {};

        const fieldMap = {
            main: 'hauptspeise_id',
            side: 'beilage_id',
            type: 'typ',
            note: 'notiz',
            category: null  // read-only derived field — ignore
        };

        if (fieldMap[field] !== undefined && fieldMap[field] !== null) {
            this.db.plan[wkKey][day][fieldMap[field]] = val;
            this.saveDb();
            await this.updateTodayStates();
            await this.updateWeekStates();
        }
    }

    // ─── Admin message handler ───────────────────────────────────────────────────

    async onMessage(obj) {
        if (!obj || !obj.command) return;
        this.log.info(`onMessage: ${obj.command} | from=${obj.from} | callback type=${typeof obj.callback} | callback value=${JSON.stringify(obj.callback)}`);

        switch (obj.command) {
            case 'getDishes': {
                const resp = { result: this.db.dishes };
                this.log.info(`getDishes: replying with ${this.db.dishes.length} dishes`);
                try {
                    this.sendTo(obj.from, obj.command, resp, obj.callback);
                    this.log.info('getDishes: sendTo called successfully');
                } catch(e) {
                    this.log.error('getDishes: sendTo failed: ' + e.message);
                }
                break;
            }

            case 'getSides':
                this.sendTo(obj.from, obj.command, { result: this.db.sides }, obj.callback);
                break;

            case 'getCategories':
                this.sendTo(obj.from, obj.command, { result: this.db.categories }, obj.callback);
                break;

            case 'saveCategory': {
                const cat = obj.message;
                if (!cat || !cat.name) {
                    this.sendTo(obj.from, obj.command, { error: 'Name fehlt' }, obj.callback);
                    return;
                }
                if (cat.id) {
                    const idx = this.db.categories.findIndex(c => c.id === cat.id);
                    if (idx < 0) {
                        this.sendTo(obj.from, obj.command, { error: 'Kategorie nicht gefunden' }, obj.callback);
                        return;
                    }
                    const oldName = this.db.categories[idx].name;
                    this.db.categories[idx] = { ...this.db.categories[idx], ...cat };
                    if (oldName !== cat.name) {
                        this.db.dishes.forEach(d => { if (d.kategorie === oldName) d.kategorie = cat.name; });
                    }
                } else {
                    cat.id = this.generateId();
                    this.db.categories.push(cat);
                }
                this.saveDb();
                this.sendTo(obj.from, obj.command, { result: cat }, obj.callback);
                break;
            }

            case 'deleteCategory': {
                const { id } = obj.message || {};
                if (!id) {
                    this.sendTo(obj.from, obj.command, { error: 'ID fehlt' }, obj.callback);
                    return;
                }
                this.db.categories = this.db.categories.filter(c => c.id !== id);
                this.saveDb();
                this.sendTo(obj.from, obj.command, { result: 'ok' }, obj.callback);
                break;
            }

            case 'getCategories':
                this.sendTo(obj.from, obj.command, { result: CATEGORIES }, obj.callback);
                break;

            case 'getPlan': {
                const { kwKey, kw, nextKW, nextKWKey } = this.getCurrentKWInfo();
                this.sendTo(obj.from, obj.command, {
                    result: {
                        current: { kw, key: kwKey, days: this.db.plan[kwKey] || {} },
                        next: { kw: nextKW, key: nextKWKey, days: this.db.plan[nextKWKey] || {} }
                    }
                }, obj.callback);
                break;
            }

            case 'saveDish': {
                const dish = obj.message;
                if (!dish || !dish.name) {
                    this.sendTo(obj.from, obj.command, { error: 'Name fehlt' }, obj.callback);
                    return;
                }
                if (dish.id) {
                    const idx = this.db.dishes.findIndex(d => d.id === dish.id);
                    if (idx >= 0) {
                        this.db.dishes[idx] = { ...this.db.dishes[idx], ...dish };
                    } else {
                        this.sendTo(obj.from, obj.command, { error: 'Gericht nicht gefunden' }, obj.callback);
                        return;
                    }
                } else {
                    dish.id = this.generateId();
                    this.db.dishes.push(dish);
                }
                this.saveDb();
                await this.updateDbCountStates();
                await this.updateWeekStates();
                await this.updateTodayStates();
                this.sendTo(obj.from, obj.command, { result: dish }, obj.callback);
                break;
            }

            case 'deleteDish': {
                const { id } = obj.message || {};
                if (!id) {
                    this.sendTo(obj.from, obj.command, { error: 'ID fehlt' }, obj.callback);
                    return;
                }
                this.db.dishes = this.db.dishes.filter(d => d.id !== id);
                for (const wkKey of Object.keys(this.db.plan)) {
                    for (const day of Object.keys(this.db.plan[wkKey])) {
                        if (this.db.plan[wkKey][day].hauptspeise_id === id) {
                            this.db.plan[wkKey][day].hauptspeise_id = '';
                        }
                    }
                }
                this.saveDb();
                await this.updateDbCountStates();
                await this.updateWeekStates();
                await this.updateTodayStates();
                this.sendTo(obj.from, obj.command, { result: 'ok' }, obj.callback);
                break;
            }

            case 'deleteDishes': {
                const { ids } = obj.message || {};
                if (!Array.isArray(ids) || !ids.length) {
                    this.sendTo(obj.from, obj.command, { error: 'ids fehlt' }, obj.callback);
                    return;
                }
                const idSet = new Set(ids);
                this.db.dishes = this.db.dishes.filter(d => !idSet.has(d.id));
                for (const wkKey of Object.keys(this.db.plan)) {
                    for (const day of Object.keys(this.db.plan[wkKey])) {
                        if (idSet.has(this.db.plan[wkKey][day].hauptspeise_id)) {
                            this.db.plan[wkKey][day].hauptspeise_id = '';
                        }
                    }
                }
                this.saveDb();
                await this.updateDbCountStates();
                await this.updateWeekStates();
                await this.updateTodayStates();
                this.sendTo(obj.from, obj.command, { result: ids.length }, obj.callback);
                break;
            }

            case 'saveSide': {
                const side = obj.message;
                if (!side || !side.name) {
                    this.sendTo(obj.from, obj.command, { error: 'Name fehlt' }, obj.callback);
                    return;
                }
                if (side.id) {
                    const idx = this.db.sides.findIndex(s => s.id === side.id);
                    if (idx >= 0) {
                        this.db.sides[idx] = { ...this.db.sides[idx], ...side };
                    } else {
                        this.sendTo(obj.from, obj.command, { error: 'Beilage nicht gefunden' }, obj.callback);
                        return;
                    }
                } else {
                    side.id = this.generateId();
                    this.db.sides.push(side);
                }
                this.saveDb();
                await this.updateDbCountStates();
                await this.updateWeekStates();
                await this.updateTodayStates();
                this.sendTo(obj.from, obj.command, { result: side }, obj.callback);
                break;
            }

            case 'deleteSide': {
                const { id } = obj.message || {};
                if (!id) {
                    this.sendTo(obj.from, obj.command, { error: 'ID fehlt' }, obj.callback);
                    return;
                }
                this.db.sides = this.db.sides.filter(s => s.id !== id);
                for (const wkKey of Object.keys(this.db.plan)) {
                    for (const day of Object.keys(this.db.plan[wkKey])) {
                        if (this.db.plan[wkKey][day].beilage_id === id) {
                            this.db.plan[wkKey][day].beilage_id = '';
                        }
                    }
                }
                this.saveDb();
                await this.updateDbCountStates();
                await this.updateWeekStates();
                await this.updateTodayStates();
                this.sendTo(obj.from, obj.command, { result: 'ok' }, obj.callback);
                break;
            }

            case 'deleteSides': {
                const { ids } = obj.message || {};
                if (!Array.isArray(ids) || !ids.length) {
                    this.sendTo(obj.from, obj.command, { error: 'ids fehlt' }, obj.callback);
                    return;
                }
                const idSet = new Set(ids);
                this.db.sides = this.db.sides.filter(s => !idSet.has(s.id));
                for (const wkKey of Object.keys(this.db.plan)) {
                    for (const day of Object.keys(this.db.plan[wkKey])) {
                        if (idSet.has(this.db.plan[wkKey][day].beilage_id)) {
                            this.db.plan[wkKey][day].beilage_id = '';
                        }
                    }
                }
                this.saveDb();
                await this.updateDbCountStates();
                await this.updateWeekStates();
                await this.updateTodayStates();
                this.sendTo(obj.from, obj.command, { result: ids.length }, obj.callback);
                break;
            }

            case 'savePlanEntry': {
                const { weekKey, day, entry } = obj.message || {};
                if (!weekKey || !day) {
                    this.sendTo(obj.from, obj.command, { error: 'weekKey und day erforderlich' }, obj.callback);
                    return;
                }
                if (!this.db.plan[weekKey]) this.db.plan[weekKey] = {};
                this.db.plan[weekKey][day] = { ...this.db.plan[weekKey][day], ...entry };
                this.saveDb();
                await this.updateTodayStates();
                await this.updateWeekStates();
                this.sendTo(obj.from, obj.command, { result: 'ok' }, obj.callback);
                break;
            }

            case 'exportCsv': {
                const { kwKey, kw, nextKW, nextKWKey } = this.getCurrentKWInfo();
                let csv = 'kw;wochentag;hauptspeise;beilage;typ;notiz\n';
                for (const [wkKey, weekNum] of [[kwKey, kw], [nextKWKey, nextKW]]) {
                    const plan = this.db.plan[wkKey] || {};
                    for (const day of DAYS) {
                        const e = plan[day] || {};
                        const m = this.db.dishes.find(d => d.id === e.hauptspeise_id);
                        const s = this.db.sides.find(d => d.id === e.beilage_id);
                        csv += `${weekNum};${day};${m ? m.name : ''};${s ? s.name : ''};${e.typ || ''};${e.notiz || ''}\n`;
                    }
                }
                const exportTime = new Date().toISOString();
                await this.setStateAsync('info.last_export', { val: exportTime, ack: true });
                this.sendTo(obj.from, obj.command, { result: csv }, obj.callback);
                break;
            }

            case 'importCsv': {
                await this.handleImport(obj.message && obj.message.csv);
                this.sendTo(obj.from, obj.command, { result: 'ok' }, obj.callback);
                break;
            }

            case 'importDishes': {
                const csv = (obj.message && obj.message.csv) || '';
                const lines = csv.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('name'));
                let imported = 0, skipped = 0;
                for (const line of lines) {
                    const parts = line.split(';');
                    const name = (parts[0] || '').trim();
                    if (!name) { skipped++; continue; }
                    if (this.db.dishes.find(d => d.name.toLowerCase() === name.toLowerCase())) {
                        skipped++;
                        continue;
                    }
                    this.db.dishes.push({
                        id: this.generateId(),
                        name,
                        kategorie: (parts[1] || '').trim(),
                        portionen: parseInt(parts[2]) || 2,
                        rezept_url: (parts[3] || '').trim()
                    });
                    imported++;
                }
                this.saveDb();
                await this.updateDbCountStates();
                this.sendTo(obj.from, obj.command, { result: { imported, skipped } }, obj.callback);
                break;
            }

            case 'getSettings':
                this.sendTo(obj.from, obj.command, { result: this.db.settings }, obj.callback);
                break;

            case 'saveSettings': {
                this.db.settings = obj.message;
                this.saveDb();
                this.sendTo(obj.from, obj.command, { result: this.db.settings }, obj.callback);
                break;
            }

            case 'sortAndSave': {
                this.saveDb();
                this.sendTo(obj.from, obj.command, { result: 'ok' }, obj.callback);
                break;
            }

            case 'importSides': {
                const csv = (obj.message && obj.message.csv) || '';
                const lines = csv.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('name'));
                let imported = 0, skipped = 0;
                for (const line of lines) {
                    const parts = line.split(';');
                    const name = (parts[0] || '').trim();
                    if (!name) { skipped++; continue; }
                    if (this.db.sides.find(s => s.name.toLowerCase() === name.toLowerCase())) {
                        skipped++;
                        continue;
                    }
                    this.db.sides.push({
                        id: this.generateId(),
                        name,
                        portionen: parseInt(parts[1]) || 2,
                        rezept_url: (parts[2] || '').trim()
                    });
                    imported++;
                }
                this.saveDb();
                await this.updateDbCountStates();
                this.sendTo(obj.from, obj.command, { result: { imported, skipped } }, obj.callback);
                break;
            }

            default:
                this.sendTo(obj.from, obj.command, { error: 'Unbekannter Befehl: ' + obj.command }, obj.callback);
        }
    }

    // ─── Unload ──────────────────────────────────────────────────────────────────

    onUnload(callback) {
        try {
            if (this.midnightTimer) clearTimeout(this.midnightTimer);
            callback();
        } catch {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new MealplannerAdapter(options);
} else {
    new MealplannerAdapter();
}
