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

function currentWeekKey() {
    const p = new URLSearchParams(location.search);
    return p.get('week') === 'next' ? 'next' : 'current';
}

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
        const catLabel = catName
            ? `<span${catTextStyle}>${esc(catName)}</span>`
            : '<span class="empty">—</span>';

        const dayAttr = `data-day="${esc(day)}"`;

        return `<tr class="${isToday ? 'today' : ''}">
            <td class="col-day">
                <span class="day-name">${esc(day)}</span>
                <span class="day-date">${dateStr}</span>
            </td>
            <td class="col-cat col-pick" ${dayAttr} onclick="openCatPicker(event,'${esc(day)}')">
                ${catDot}${catLabel}
            </td>
            <td class="col-main col-pick" ${dayAttr} onclick="openDishPicker(event,'${esc(day)}')">
                ${dish ? esc(dish.name) : '<span class="empty">—</span>'}
            </td>
            <td class="col-side col-pick" ${dayAttr} onclick="openSidePicker(event,'${esc(day)}')">
                ${side ? esc(side.name) : '<span class="empty">—</span>'}
            </td>
        </tr>`;
    });

    document.getElementById('mp-tbody').innerHTML = rows.join('');
}

function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ─── Generic picker ───────────────────────────────────────────────────────────

let _picker = { day: null, weekKey: null, type: null };

function getPicker() {
    let el = document.getElementById('mp-picker');
    if (!el) {
        el = document.createElement('div');
        el.id = 'mp-picker';
        el.className = 'mp-picker';
        document.body.appendChild(el);
        el.addEventListener('click', e => e.stopPropagation());
    }
    return el;
}

function showPicker(e, day, html) {
    const el = getPicker();
    el.innerHTML = html;
    const rect = e.currentTarget.getBoundingClientRect();
    el.style.left    = rect.left + 'px';
    el.style.top     = (rect.bottom + 4) + 'px';
    el.style.display = 'block';
}

function hidePicker() {
    const el = document.getElementById('mp-picker');
    if (el) el.style.display = 'none';
}

function dayEntry(weekKey, day) {
    if (!plan[weekKey])            plan[weekKey] = { days: {} };
    if (!plan[weekKey].days)       plan[weekKey].days = {};
    if (!plan[weekKey].days[day])  plan[weekKey].days[day] = {};
    return plan[weekKey].days[day];
}

function savePlan() {
    socket.emit('setState', ns + 'info.plan_json', { val: JSON.stringify(plan), ack: false }, () => {});
}

// ─── Category picker ──────────────────────────────────────────────────────────

function openCatPicker(e, day) {
    e.stopPropagation();
    _picker = { day, weekKey: currentWeekKey(), type: 'cat' };

    const cats = db.categories;
    let html = cats.length === 0
        ? '<div class="mp-pick-empty">Keine Kategorien angelegt</div>'
        : cats.map(c =>
            `<button class="mp-pick-opt" style="color:${c.color}" onclick="selectCat(${JSON.stringify(c.name)})">${esc(c.name)}</button>`
          ).join('');

    html += `<button class="mp-pick-opt mp-pick-clear" onclick="selectCat('')">— löschen —</button>`;
    showPicker(e, day, html);
}

function selectCat(catName) {
    hidePicker();
    const entry = dayEntry(_picker.weekKey, _picker.day);
    if (catName) {
        entry.kategorie = catName;
        if (entry.hauptspeise_id) {
            const dish = db.dishes.find(d => d.id === entry.hauptspeise_id);
            if (dish && dish.kategorie !== catName) {
                entry.hauptspeise_id = '';
            }
        }
    } else {
        delete entry.kategorie;
    }
    savePlan();
    render();
}

// ─── Dish picker ──────────────────────────────────────────────────────────────

function openDishPicker(e, day) {
    e.stopPropagation();
    _picker = { day, weekKey: currentWeekKey(), type: 'dish' };

    const entry   = (plan[_picker.weekKey]?.days || {})[day] || {};
    const catName = entry.kategorie || '';
    const dishes  = catName
        ? db.dishes.filter(d => d.kategorie === catName)
        : db.dishes;

    let header = catName
        ? `<div class="mp-pick-header">${esc(catName)}</div>`
        : '<div class="mp-pick-header" style="color:rgba(255,153,0,.5)">Alle Gerichte</div>';

    let html = header;
    if (dishes.length === 0) {
        html += '<div class="mp-pick-empty">Keine Gerichte in dieser Kategorie</div>';
    } else {
        const catObj = db.categories.find(c => c.name === catName);
        const color  = catObj?.color || '#FF9900';
        html += dishes.map(d =>
            `<button class="mp-pick-opt" style="color:${color}" onclick="selectDish(${JSON.stringify(d.id)})">${esc(d.name)}</button>`
        ).join('');
    }
    html += `<button class="mp-pick-opt mp-pick-clear" onclick="selectDish('')">— löschen —</button>`;
    showPicker(e, day, html);
}

function selectDish(dishId) {
    hidePicker();
    const entry = dayEntry(_picker.weekKey, _picker.day);
    entry.hauptspeise_id = dishId;
    if (dishId && !entry.kategorie) {
        const dish = db.dishes.find(d => d.id === dishId);
        if (dish?.kategorie) entry.kategorie = dish.kategorie;
    }
    savePlan();
    render();
}

// ─── Side picker ──────────────────────────────────────────────────────────────

function openSidePicker(e, day) {
    e.stopPropagation();
    _picker = { day, weekKey: currentWeekKey(), type: 'side' };

    let html = '<div class="mp-pick-header">Beilage</div>';
    if (db.sides.length === 0) {
        html += '<div class="mp-pick-empty">Keine Beilagen angelegt</div>';
    } else {
        html += db.sides.map(s =>
            `<button class="mp-pick-opt" onclick="selectSide(${JSON.stringify(s.id)})">${esc(s.name)}</button>`
        ).join('');
    }
    html += `<button class="mp-pick-opt mp-pick-clear" onclick="selectSide('')">— löschen —</button>`;
    showPicker(e, day, html);
}

function selectSide(sideId) {
    hidePicker();
    const entry = dayEntry(_picker.weekKey, _picker.day);
    entry.beilage_id = sideId;
    savePlan();
    render();
}
