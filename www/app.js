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
    const [dbState, planState] = await Promise.all([
        getState(ns + 'info.database'),
        getState(ns + 'info.plan_json'),
    ]);

    if (dbState?.val) {
        try { Object.assign(db, JSON.parse(dbState.val)); } catch (e) { console.error('[mp] db parse', e); }
    }
    if (planState?.val) {
        try { plan = JSON.parse(planState.val); } catch (e) { console.error('[mp] plan parse', e); }
    }

    render();
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

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
    const p       = new URLSearchParams(location.search);
    const weekKey = p.get('week') === 'next' ? 'next' : 'current';
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

    const rows = DAYS.map((day, i) => {
        const entry   = days[day] || {};
        const dish    = db.dishes.find(d => d.id === entry.hauptspeise_id) || null;
        const side    = db.sides.find(s => s.id === entry.beilage_id)      || null;
        const catName = entry.kategorie || dish?.kategorie || '';
        const catObj  = db.categories.find(c => c.name === catName) || null;
        const isToday = weekKey === 'current' && day === today;

        const dateStr = mondayDate ? fmtShort(new Date(mondayDate.getTime() + i * 86400000)) : '';

        const catDot = catObj
            ? `<span class="cat-dot" style="background:${catObj.color}"></span>`
            : '<span class="cat-dot empty"></span>';

        const catTextStyle = catObj ? ` style="color:${catObj.color}"` : '';
        const catLabel     = catName
            ? `<span${catTextStyle}>${esc(catName)}</span>`
            : '<span class="empty">—</span>';

        return `<tr class="${isToday ? 'today' : ''}">
            <td class="col-day">
                <span class="day-name">${esc(day)}</span>
                <span class="day-date">${dateStr}</span>
            </td>
            <td class="col-cat" onclick="openCatPicker(event,'${esc(day)}')">
                ${catDot}${catLabel}
            </td>
            <td class="col-main">${dish ? esc(dish.name) : '<span class="empty">—</span>'}</td>
            <td class="col-side">${side ? esc(side.name) : '<span class="empty">—</span>'}</td>
        </tr>`;
    });

    document.getElementById('mp-tbody').innerHTML = rows.join('');
}

function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ─── Category picker ──────────────────────────────────────────────────────────

let _pickerDay = null;
let _pickerWeekKey = null;

function openCatPicker(e, day) {
    e.stopPropagation();

    const p = new URLSearchParams(location.search);
    _pickerWeekKey = p.get('week') === 'next' ? 'next' : 'current';
    _pickerDay     = day;

    let picker = document.getElementById('mp-cat-picker');
    if (!picker) {
        picker = document.createElement('div');
        picker.id = 'mp-cat-picker';
        document.body.appendChild(picker);
        picker.addEventListener('click', e2 => e2.stopPropagation());
    }

    const cats = db.categories;
    let html = '';

    if (cats.length === 0) {
        html = '<div class="mp-cat-option" style="color:rgba(255,153,0,.45);cursor:default">Keine Kategorien</div>';
    } else {
        html = cats.map(c =>
            `<button class="mp-cat-option" style="color:${c.color}" onclick="selectCat('${c.name.replace(/'/g,"\\'")}')">${esc(c.name)}</button>`
        ).join('');
    }
    html += `<button class="mp-cat-option mp-cat-option-clear" onclick="selectCat('')">— löschen —</button>`;
    picker.innerHTML = html;

    const rect = e.currentTarget.getBoundingClientRect();
    picker.style.left    = rect.left + 'px';
    picker.style.top     = (rect.bottom + 4) + 'px';
    picker.style.display = 'block';
}

function hidePicker() {
    const picker = document.getElementById('mp-cat-picker');
    if (picker) picker.style.display = 'none';
}

function selectCat(catName) {
    hidePicker();
    if (!_pickerDay || !_pickerWeekKey) return;

    if (!plan[_pickerWeekKey])       plan[_pickerWeekKey] = { days: {} };
    if (!plan[_pickerWeekKey].days)  plan[_pickerWeekKey].days = {};
    if (!plan[_pickerWeekKey].days[_pickerDay]) plan[_pickerWeekKey].days[_pickerDay] = {};

    if (catName) {
        plan[_pickerWeekKey].days[_pickerDay].kategorie = catName;
    } else {
        delete plan[_pickerWeekKey].days[_pickerDay].kategorie;
    }

    socket.emit('setState', ns + 'info.plan_json', { val: JSON.stringify(plan), ack: false }, () => {});
    render();
}
