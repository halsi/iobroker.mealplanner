'use strict';

// ─── Config from URL params ───────────────────────────────────────────────────
(function applyCssVars() {
    const p = new URLSearchParams(location.search);
    const vars = [
        'header_bg','header_fg','today_bg','row_bg','row_alt_bg','border',
        'cat_vegetarisch','cat_fisch','cat_fleisch','cat_extern','cat_event'
    ];
    const style = document.documentElement.style;
    vars.forEach(v => {
        const val = p.get(v);
        if (val) style.setProperty('--mp-' + v.replace(/_/g,'-'), decodeURIComponent(val));
    });
})();

// ─── State ───────────────────────────────────────────────────────────────────
const DAYS = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];

const CAT_COLORS = {
    vegetarisch: '#43a047',
    fisch:       '#0288d1',
    fleisch:     '#e53935',
    extern:      '#f9a825',
    event:       '#8e24aa',
};

let db    = { dishes: [], sides: [] };
let plan  = { current: null, next: null };
let socket, instance;

// Picker context
let pickerCtx = null; // { week, day, field }

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    const p = new URLSearchParams(location.search);
    instance = p.get('instance') || '0';

    if (typeof io !== 'undefined') {
        socket = io.connect();
        socket.on('connect', loadAll);
        socket.on('disconnect', () => console.warn('[mp-vis] disconnected'));
    } else {
        socket = { emit: (e, a, c, m, cb) => cb && cb({ result: [] }) };
        loadAll();
    }
});

function sendTo(cmd, msg) {
    return new Promise((resolve) => {
        socket.emit('sendTo', 'mealplanner.' + instance, cmd, msg, (res) => resolve(res));
    });
}

async function loadAll() {
    const [dRes, sRes, pRes] = await Promise.all([
        sendTo('getDishes', {}),
        sendTo('getSides',  {}),
        sendTo('getPlan',   {}),
    ]);
    if (dRes && dRes.result) db.dishes = dRes.result;
    if (sRes && sRes.result) db.sides  = sRes.result;
    if (pRes && pRes.result) plan      = pRes.result;
    render();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function todayName() {
    return ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][new Date().getDay()];
}

function render() {
    renderWeek('current', 'mp-tbl-current', 'mp-kw-current', 'Diese Woche');
    renderWeek('next',    'mp-tbl-next',    'mp-kw-next',    'Nächste Woche');
}

function renderWeek(weekLabel, tableId, headerId, label) {
    const weekData = plan[weekLabel];
    const kw  = weekData ? weekData.kw  : '—';
    const days = weekData ? weekData.days : {};

    document.getElementById(headerId).textContent = `KW ${kw} · ${label}`;

    const table = document.getElementById(tableId);
    const today = todayName();
    let html = '';

    for (const day of DAYS) {
        const entry   = days[day] || {};
        const isToday = weekLabel === 'current' && day === today;
        const mainDish = db.dishes.find(d => d.id === entry.hauptspeise_id) || null;
        const sideDish = db.sides.find(s => s.id === entry.beilage_id)     || null;
        const cat = mainDish ? (mainDish.kategorie || '') : '';

        html += `
        <tr class="${isToday ? 'mp-today' : ''}" data-week="${weekLabel}" data-day="${esc(day)}">
            <td class="mp-col-day">${esc(day)}</td>
            <td class="mp-col-main cat-${esc(cat)}"
                onclick="mpOpenPicker('${weekLabel}','${esc(day)}','main')">
                <div class="mp-cell">
                    <span class="mp-cell-name${mainDish ? '' : ' empty'}">${
                        mainDish ? esc(mainDish.name) : '— kein Gericht —'
                    }</span>
                    <button class="mp-btn-rand" title="Zufällig"
                        onclick="event.stopPropagation();mpRandom('${weekLabel}','${esc(day)}','main')">↻</button>
                </div>
            </td>
            <td class="mp-col-side"
                onclick="mpOpenPicker('${weekLabel}','${esc(day)}','side')">
                <div class="mp-cell">
                    <span class="mp-cell-name${sideDish ? '' : ' empty'}">${
                        sideDish ? esc(sideDish.name) : '— keine Beilage —'
                    }</span>
                    <button class="mp-btn-rand" title="Zufällig"
                        onclick="event.stopPropagation();mpRandom('${weekLabel}','${esc(day)}','side')">↻</button>
                </div>
            </td>
        </tr>`;
    }

    table.innerHTML = html;
}

function esc(s) {
    return String(s || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ─── Random ───────────────────────────────────────────────────────────────────
async function mpRandom(week, day, field) {
    const list = field === 'main' ? db.dishes : db.sides;
    if (!list.length) return;
    const pick = list[Math.floor(Math.random() * list.length)];
    await saveEntry(week, day, field, pick.id);
}

async function saveEntry(week, day, field, id) {
    const weekData = plan[week];
    if (!weekData) return;
    const entry = (weekData.days && weekData.days[day]) ? { ...weekData.days[day] } : {};

    if (field === 'main') entry.hauptspeise_id = id;
    else                  entry.beilage_id     = id;

    await sendTo('savePlanEntry', { weekKey: weekData.key, day, entry });

    // Update local cache
    if (!weekData.days) weekData.days = {};
    weekData.days[day] = entry;
    render();
}

// ─── Picker ───────────────────────────────────────────────────────────────────
function mpOpenPicker(week, day, field) {
    pickerCtx = { week, day, field };
    const isSide = field === 'side';
    const items  = isSide ? db.sides : db.dishes;
    const overlay = document.getElementById('mp-picker-overlay');
    const list    = document.getElementById('mp-picker-list');
    const search  = document.getElementById('mp-picker-search');

    search.value = '';

    let html = `
        <div class="mp-picker-item mp-picker-random" onclick="mpPickRandom()">
            ↻ &nbsp;Zufällig
        </div>
        <div class="mp-picker-item mp-picker-clear" onclick="mpPickItem(null)">
            — ${isSide ? 'keine Beilage' : 'kein Gericht'} —
        </div>`;

    for (const item of items) {
        const catColor = CAT_COLORS[item.kategorie] || '';
        const dot = catColor
            ? `<span class="mp-picker-cat" style="background:${catColor}"></span>`
            : '<span class="mp-picker-cat"></span>';
        html += `
        <div class="mp-picker-item" data-id="${esc(item.id)}" data-name="${esc(item.name)}"
            onclick="mpPickItem('${esc(item.id)}')">
            ${dot}${esc(item.name)}
        </div>`;
    }

    list.innerHTML = html;
    overlay.classList.add('open');
    search.focus();
}

function mpFilterPicker(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('#mp-picker-list .mp-picker-item[data-id]').forEach(el => {
        const name = (el.dataset.name || '').toLowerCase();
        el.dataset.hidden = (!name.includes(q)).toString();
    });
}

function mpPickItem(id) {
    if (pickerCtx) saveEntry(pickerCtx.week, pickerCtx.day, pickerCtx.field, id || '');
    mpClosePicker();
}

function mpPickRandom() {
    if (!pickerCtx) return;
    const list = pickerCtx.field === 'main' ? db.dishes : db.sides;
    if (!list.length) { mpClosePicker(); return; }
    const pick = list[Math.floor(Math.random() * list.length)];
    mpPickItem(pick.id);
}

function mpClosePicker(e) {
    if (e && e.target !== document.getElementById('mp-picker-overlay')) return;
    document.getElementById('mp-picker-overlay').classList.remove('open');
    pickerCtx = null;
}
