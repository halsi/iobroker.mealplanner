'use strict';

const DAYS = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];

let db   = { dishes: [], sides: [], categories: [] };
let plan = { current: null, next: null };
let socket, ns;

window.addEventListener('DOMContentLoaded', () => {
    const p = new URLSearchParams(location.search);
    const instance = p.get('instance') || '0';
    ns = 'mealplanner.' + instance + '.';

    if (typeof io !== 'undefined') {
        socket = io.connect();
        socket.on('connect', loadAll);
        socket.on('disconnect', () => console.warn('[mp] disconnected'));
    } else {
        socket = { emit: (_ev, ...args) => { const cb = args[args.length - 1]; if (typeof cb === 'function') cb(null, null); } };
        loadAll();
    }

    document.addEventListener('click', hidePicker);
});

function getState(id) {
    return new Promise(resolve => socket.emit('getState', id, (_err, s) => resolve(s)));
}

async function loadAll() {
    const [dbState, planState, settingsState] = await Promise.all([
        getState(ns + 'info.database'),
        getState(ns + 'info.plan_json'),
        getState(ns + 'info.settings'),
    ]);

    if (dbState?.val) {
        try { Object.assign(db, JSON.parse(dbState.val)); } catch (e) { console.error('[mp] db parse', e); }
    }
    if (planState?.val) {
        try { plan = JSON.parse(planState.val); } catch (e) { console.error('[mp] plan parse', e); }
    }
    if (settingsState?.val) {
        try { applySettings(JSON.parse(settingsState.val)); } catch (e) { console.error('[mp] settings parse', e); }
    }

    render();
}

function applySettings(s) {
    if (!s) return;
    const r = document.documentElement;
    const w = s.widget || {};
    const f = s.fonts  || {};
    const p = s.picker || {};
    if (w.width)  r.style.setProperty('--mp-w', w.width  + 'px');
    if (w.height) r.style.setProperty('--mp-h', w.height + 'px');
    if (p.bg) r.style.setProperty('--mp-picker-bg', p.bg);
    if (p.fs) r.style.setProperty('--mp-picker-fs', p.fs + 'px');
    const map = {
        kw_label:   ['--mp-fs-kw',   '--mp-c-kw'],
        date_range: ['--mp-fs-dr',   '--mp-c-dr'],
        col_header: ['--mp-fs-ch',   '--mp-c-ch'],
        day_name:   ['--mp-fs-dn',   '--mp-c-dn'],
        day_date:   ['--mp-fs-dd',   '--mp-c-dd'],
        category:   ['--mp-fs-cat',  '--mp-c-cat'],
        dish:       ['--mp-fs-dish', '--mp-c-dish'],
        side:       ['--mp-fs-side', '--mp-c-side'],
    };
    for (const [key, [fsVar, cVar]] of Object.entries(map)) {
        if (f[key]?.size)  r.style.setProperty(fsVar, f[key].size  + 'px');
        if (f[key]?.color) r.style.setProperty(cVar,  f[key].color);
    }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function mondayOfKW(kw, year) {
    const jan4 = new Date(year, 0, 4);
    const dow  = (jan4.getDay() + 6) % 7;
    const monday1 = new Date(jan4);
    monday1.setDate(jan4.getDate() - dow);
    const result = new Date(monday1);
    result.setDate(monday1.getDate() + (kw - 1) * 7);
    return result;
}

function yearForKW(kw) {
    const now = new Date();
    const y   = now.getFullYear();
    if (kw === 1  && now.getMonth() === 11) return y + 1;
    if (kw >= 52  && now.getMonth() === 0)  return y - 1;
    return y;
}

function fmtDate(date) {
    return date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtShort(date) {
    return date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
}

function todayDayName() {
    return ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][new Date().getDay()];
}

function currentWeekKey() {
    return new URLSearchParams(location.search).get('week') === 'next' ? 'next' : 'current';
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
    const weekKey  = currentWeekKey();
    const weekData = plan[weekKey];
    const kw   = weekData?.kw   || null;
    const days = weekData?.days || {};

    if (kw) {
        const year   = yearForKW(kw);
        const monday = mondayOfKW(kw, year);
        const sunday = new Date(monday.getTime() + 6 * 86400000);
        document.getElementById('mp-kw-label').textContent   = 'KW ' + kw;
        document.getElementById('mp-date-range').textContent = fmtDate(monday) + ' – ' + fmtDate(sunday);
    } else {
        document.getElementById('mp-kw-label').textContent   = '—';
        document.getElementById('mp-date-range').textContent = '';
    }

    const today      = todayDayName();
    const mondayDate = kw ? mondayOfKW(kw, yearForKW(kw)) : null;
    const tbody      = document.getElementById('mp-tbody');
    tbody.innerHTML  = '';

    DAYS.forEach((day, i) => {
        const entry   = days[day] || {};
        const dish    = db.dishes.find(d => d.id === entry.hauptspeise_id) || null;
        const side    = db.sides.find(s => s.id === entry.beilage_id)      || null;
        const catName = entry.kategorie || dish?.kategorie || '';
        const catObj  = db.categories.find(c => c.name === catName) || null;
        const isToday = weekKey === 'current' && day === today;

        const tr = document.createElement('tr');
        if (isToday) tr.className = 'today';

        // Day cell
        const tdDay = document.createElement('td');
        tdDay.className = 'col-day';
        const spanName = document.createElement('span');
        spanName.className = 'day-name';
        spanName.textContent = day;
        const spanDate = document.createElement('span');
        spanDate.className = 'day-date';
        spanDate.textContent = mondayDate ? fmtShort(new Date(mondayDate.getTime() + i * 86400000)) : '';
        tdDay.appendChild(spanName);
        tdDay.appendChild(spanDate);

        // Category cell
        const tdCat = document.createElement('td');
        tdCat.className = 'col-cat col-pick';
        const dot = document.createElement('span');
        dot.className = 'cat-dot' + (catObj ? '' : ' empty');
        if (catObj) dot.style.background = catObj.color;
        const catSpan = document.createElement('span');
        if (catName) {
            catSpan.textContent = catName;
            if (catObj) catSpan.style.color = catObj.color;
        } else {
            catSpan.className = 'empty';
            catSpan.textContent = '—';
        }
        tdCat.appendChild(dot);
        tdCat.appendChild(catSpan);
        tdCat.addEventListener('click', e => { e.stopPropagation(); openCatPicker(e, day); });

        // Dish cell
        const tdMain = document.createElement('td');
        tdMain.className = 'col-main col-pick';
        if (dish) {
            tdMain.textContent = dish.name;
        } else {
            const empty = document.createElement('span');
            empty.className = 'empty';
            empty.textContent = '—';
            tdMain.appendChild(empty);
        }
        tdMain.addEventListener('click', e => { e.stopPropagation(); openDishPicker(e, day); });

        // Side cell
        const isExtern = catName === 'Extern';
        const tdSide = document.createElement('td');
        tdSide.className = 'col-side' + (isExtern ? '' : ' col-pick');
        if (side && !isExtern) {
            tdSide.textContent = side.name;
        } else {
            const empty = document.createElement('span');
            empty.className = 'empty';
            empty.textContent = '—';
            tdSide.appendChild(empty);
        }
        if (!isExtern) {
            tdSide.addEventListener('click', e => { e.stopPropagation(); openSidePicker(e, day); });
        }

        tr.appendChild(tdDay);
        tr.appendChild(tdCat);
        tr.appendChild(tdMain);
        tr.appendChild(tdSide);
        tbody.appendChild(tr);
    });
}

// ─── Picker ───────────────────────────────────────────────────────────────────

let _pickerDay = null;
let _pickerWeekKey = null;
let _pickerAnchorRect = null;

function hidePicker() {
    const el = document.getElementById('mp-picker');
    if (el) el.style.display = 'none';
}

function openPicker(e) {
    _pickerWeekKey = currentWeekKey();
    let el = document.getElementById('mp-picker');
    if (!el) {
        el = document.createElement('div');
        el.id = 'mp-picker';
        el.className = 'mp-picker';
        el.addEventListener('click', ev => ev.stopPropagation());
        document.body.appendChild(el);
    }
    while (el.firstChild) el.removeChild(el.firstChild);
    _pickerAnchorRect = e.currentTarget.getBoundingClientRect();
    el.style.left     = _pickerAnchorRect.left + 'px';
    el.style.top      = (_pickerAnchorRect.bottom + 4) + 'px';
    el.style.maxHeight = '420px';
    el.style.display  = 'block';
    return el;
}

function adjustPickerPosition() {
    const el = document.getElementById('mp-picker');
    if (!el || !_pickerAnchorRect) return;
    const rect      = _pickerAnchorRect;
    const vh        = window.innerHeight;
    const pickerH   = el.offsetHeight;
    const spaceBelow = vh - rect.bottom - 4;
    if (pickerH > spaceBelow && rect.top > pickerH) {
        el.style.top       = (rect.top - pickerH - 4) + 'px';
        el.style.maxHeight = (rect.top - 8) + 'px';
    } else if (pickerH > spaceBelow) {
        el.style.maxHeight = Math.max(80, spaceBelow) + 'px';
    }
}

function pickerBtn(label, color, onClick) {
    const btn = document.createElement('button');
    btn.className = 'mp-pick-opt';
    btn.textContent = label;
    if (color) btn.style.color = color;
    btn.addEventListener('click', () => { hidePicker(); onClick(); });
    return btn;
}

function pickerHeader(label, color) {
    const d = document.createElement('div');
    d.className = 'mp-pick-header';
    d.textContent = label;
    if (color) d.style.color = color;
    return d;
}

function pickerEmpty(msg) {
    const d = document.createElement('div');
    d.className = 'mp-pick-empty';
    d.textContent = msg;
    return d;
}

function pickerClear(onClick) {
    const btn = document.createElement('button');
    btn.className = 'mp-pick-opt mp-pick-clear';
    btn.textContent = '— löschen —';
    btn.addEventListener('click', () => { hidePicker(); onClick(); });
    return btn;
}

function dayEntry(day) {
    const wk = _pickerWeekKey;
    if (!plan[wk])           plan[wk] = { days: {} };
    if (!plan[wk].days)      plan[wk].days = {};
    if (!plan[wk].days[day]) plan[wk].days[day] = {};
    return plan[wk].days[day];
}

function savePlan() {
    socket.emit('setState', ns + 'info.plan_json', { val: JSON.stringify(plan), ack: false }, () => {});
}

// ─── Category picker ──────────────────────────────────────────────────────────

function openCatPicker(e, day) {
    _pickerDay = day;
    const el = openPicker(e);

    if (db.categories.length === 0) {
        el.appendChild(pickerEmpty('Keine Kategorien angelegt'));
    } else {
        db.categories.forEach(c => {
            el.appendChild(pickerBtn(c.name, c.color, () => {
                const entry = dayEntry(day);
                entry.kategorie = c.name;
                if (entry.hauptspeise_id) {
                    const dish = db.dishes.find(d => d.id === entry.hauptspeise_id);
                    if (dish && dish.kategorie !== c.name) entry.hauptspeise_id = '';
                }
                if (c.name === 'Extern') entry.beilage_id = '';
                savePlan();
                render();
            }));
        });
    }
    el.appendChild(pickerClear(() => {
        const entry = dayEntry(day);
        delete entry.kategorie;
        savePlan();
        render();
    }));
    adjustPickerPosition();
}

// ─── Dish picker ──────────────────────────────────────────────────────────────

function openDishPicker(e, day) {
    _pickerDay = day;
    const el = openPicker(e);

    const wk      = _pickerWeekKey;
    const entry   = (plan[wk]?.days || {})[day] || {};
    const catName = entry.kategorie || '';
    const catObj  = db.categories.find(c => c.name === catName);
    const color   = catObj?.color || null;
    const dishes  = catName ? db.dishes.filter(d => d.kategorie === catName) : db.dishes;

    el.appendChild(pickerHeader(catName || 'Alle Gerichte', catName ? color : 'rgba(255,153,0,.5)'));

    if (dishes.length === 0) {
        el.appendChild(pickerEmpty('Keine Gerichte in dieser Kategorie'));
    } else {
        dishes.forEach(d => {
            el.appendChild(pickerBtn(d.name, color, () => {
                const entry2 = dayEntry(day);
                entry2.hauptspeise_id = d.id;
                if (!entry2.kategorie && d.kategorie) entry2.kategorie = d.kategorie;
                savePlan();
                render();
            }));
        });
    }
    el.appendChild(pickerClear(() => {
        const entry2 = dayEntry(day);
        entry2.hauptspeise_id = '';
        savePlan();
        render();
    }));
    adjustPickerPosition();
}

// ─── Side picker ──────────────────────────────────────────────────────────────

function openSidePicker(e, day) {
    _pickerDay = day;
    const el = openPicker(e);

    el.appendChild(pickerHeader('Beilage', null));

    if (db.sides.length === 0) {
        el.appendChild(pickerEmpty('Keine Beilagen angelegt'));
    } else {
        db.sides.forEach(s => {
            el.appendChild(pickerBtn(s.name, null, () => {
                const entry = dayEntry(day);
                entry.beilage_id = s.id;
                savePlan();
                render();
            }));
        });
    }
    el.appendChild(pickerClear(() => {
        const entry = dayEntry(day);
        entry.beilage_id = '';
        savePlan();
        render();
    }));
    adjustPickerPosition();
}
