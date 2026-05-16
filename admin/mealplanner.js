/* global socket, instance, systemLang */
'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const MP_DAYS       = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const MP_TYPES      = ['normal','extern','event','leer'];
const MP_CATEGORIES = ['vegetarisch','fisch','fleisch','extern','event'];

const MP_TYPE_LABELS = {
    normal: 'Normal',
    extern: 'Auswärts',
    event: 'Event',
    leer: 'Leer'
};

const MP_CAT_LABELS = {
    vegetarisch: 'Vegetarisch',
    fisch: 'Fisch',
    fleisch: 'Fleisch',
    extern: 'Auswärts',
    event: 'Event'
};

// ─── State ───────────────────────────────────────────────────────────────────

let mp = {
    dishes: [],
    sides: [],
    plan: { current: null, next: null },
    categories: MP_CATEGORIES,
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function mpSendTo(command, message) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            console.error(`[mealplanner] sendTo timeout: ${command}`);
            reject(new Error(`Timeout bei Befehl: ${command}`));
        }, 8000);
        console.log(`[mealplanner] sendTo → mealplanner.${instance} | cmd: ${command}`);
        socket.emit('sendTo', `mealplanner.${instance}`, command, message, (res) => {
            clearTimeout(timeout);
            console.log(`[mealplanner] sendTo ← ${command}:`, res);
            resolve(res);
        });
    });
}

function mpToday() {
    const days = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
    return days[new Date().getDay()];
}

function mpEsc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── Toast notifications ─────────────────────────────────────────────────────

let _toastTimer = null;

function mpToast(msg, isError) {
    let el = document.getElementById('mp-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'mp-toast';
        el.className = 'mp-toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'mp-toast' + (isError ? ' error' : '');
    // force reflow
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ─── Tab navigation ──────────────────────────────────────────────────────────

function mpInitTabs() {
    document.querySelectorAll('.mp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.mp-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.mp-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panelId = tab.dataset.panel;
            document.getElementById(panelId).classList.add('active');
        });
    });
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function mpLoadAll() {
    const [dishRes, sideRes, planRes] = await Promise.all([
        mpSendTo('getDishes', {}),
        mpSendTo('getSides', {}),
        mpSendTo('getPlan', {}),
    ]);
    if (dishRes && dishRes.result) mp.dishes = dishRes.result;
    if (sideRes && sideRes.result) mp.sides = sideRes.result;
    if (planRes && planRes.result) mp.plan = planRes.result;
}

// ─── Week planner ─────────────────────────────────────────────────────────────

function mpBuildDishOptions(selectedId, includeEmpty) {
    let html = includeEmpty ? '<option value="">— kein Gericht —</option>' : '';
    for (const d of mp.dishes) {
        html += `<option value="${mpEsc(d.id)}" ${d.id === selectedId ? 'selected' : ''}>${mpEsc(d.name)}</option>`;
    }
    return html;
}

function mpBuildSideOptions(selectedId, includeEmpty) {
    let html = includeEmpty ? '<option value="">— keine Beilage —</option>' : '';
    for (const s of mp.sides) {
        html += `<option value="${mpEsc(s.id)}" ${s.id === selectedId ? 'selected' : ''}>${mpEsc(s.name)}</option>`;
    }
    return html;
}

function mpBuildTypeOptions(selectedType) {
    return MP_TYPES.map(t =>
        `<option value="${t}" ${t === (selectedType || 'normal') ? 'selected' : ''}>${MP_TYPE_LABELS[t] || t}</option>`
    ).join('');
}

function mpRenderWeekTable(weekData, weekLabel, tableId) {
    const today = mpToday();
    const days = weekData ? weekData.days : {};
    const kw   = weekData ? weekData.kw : '?';
    const key  = weekData ? weekData.key : '';

    let rows = '';
    for (const day of MP_DAYS) {
        const entry = days[day] || {};
        const isToday = (weekLabel === 'current' && day === today);
        rows += `
        <tr class="${isToday ? 'today' : ''}" data-week="${weekLabel}" data-day="${mpEsc(day)}" data-key="${mpEsc(key)}">
            <td class="col-day">${mpEsc(day)}${isToday ? ' &#x2605;' : ''}</td>
            <td class="col-main">
                <select class="mp-plan-main" onchange="mpPlanChange(this)">
                    ${mpBuildDishOptions(entry.hauptspeise_id, true)}
                </select>
            </td>
            <td class="col-side">
                <select class="mp-plan-side" onchange="mpPlanChange(this)">
                    ${mpBuildSideOptions(entry.beilage_id, true)}
                </select>
            </td>
            <td class="col-type">
                <select class="mp-plan-type" onchange="mpPlanChange(this)">
                    ${mpBuildTypeOptions(entry.typ)}
                </select>
            </td>
            <td class="col-note">
                <input type="text" class="mp-plan-note" value="${mpEsc(entry.notiz || '')}"
                    placeholder="Notiz..." onchange="mpPlanChange(this)">
            </td>
            <td class="col-action">
                <button class="mp-btn-icon" title="Zufallsvorschlag" onclick="mpSuggestDay('${weekLabel}','${mpEsc(day)}','${mpEsc(key)}')">&#x1F3B2;</button>
            </td>
        </tr>`;
    }

    document.getElementById(tableId).innerHTML = `
        <thead>
            <tr>
                <th class="col-day">Tag</th>
                <th class="col-main">Hauptspeise</th>
                <th class="col-side">Beilage</th>
                <th class="col-type">Typ</th>
                <th class="col-note">Notiz</th>
                <th class="col-action"></th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>`;

    document.getElementById(tableId + '-kw').textContent = `KW ${kw}`;
}

function mpRenderWeekPlanner() {
    mpRenderWeekTable(mp.plan.current, 'current', 'mp-table-current');
    mpRenderWeekTable(mp.plan.next, 'next', 'mp-table-next');
}

async function mpPlanChange(el) {
    const row = el.closest('tr');
    const day = row.dataset.day;
    const key = row.dataset.key;

    const hauptspeise_id = row.querySelector('.mp-plan-main').value;
    const beilage_id     = row.querySelector('.mp-plan-side').value;
    const typ            = row.querySelector('.mp-plan-type').value;
    const notiz          = row.querySelector('.mp-plan-note').value;

    const res = await mpSendTo('savePlanEntry', {
        weekKey: key,
        day,
        entry: { hauptspeise_id, beilage_id, typ, notiz }
    });
    if (res && res.error) {
        mpToast('Fehler: ' + res.error, true);
    }
    // Update local plan cache
    if (mp.plan.current && mp.plan.current.key === key) {
        if (!mp.plan.current.days) mp.plan.current.days = {};
        mp.plan.current.days[day] = { hauptspeise_id, beilage_id, typ, notiz };
    }
    if (mp.plan.next && mp.plan.next.key === key) {
        if (!mp.plan.next.days) mp.plan.next.days = {};
        mp.plan.next.days[day] = { hauptspeise_id, beilage_id, typ, notiz };
    }
}

async function mpSuggestDay(weekLabel, day, weekKey) {
    if (!mp.dishes.length) { mpToast('Keine Gerichte in der Datenbank', true); return; }
    const random = mp.dishes[Math.floor(Math.random() * mp.dishes.length)];
    const res = await mpSendTo('savePlanEntry', {
        weekKey,
        day,
        entry: { hauptspeise_id: random.id }
    });
    if (res && res.error) { mpToast('Fehler: ' + res.error, true); return; }
    // Refresh from server
    const planRes = await mpSendTo('getPlan', {});
    if (planRes && planRes.result) mp.plan = planRes.result;
    mpRenderWeekPlanner();
    mpToast(`${day}: ${random.name}`);
}

// ─── Dishes tab ───────────────────────────────────────────────────────────────

function mpRenderDishes() {
    const tbody = document.getElementById('mp-dishes-tbody');
    if (!mp.dishes.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="mp-empty">Keine Gerichte vorhanden</td></tr>`;
        return;
    }
    tbody.innerHTML = mp.dishes.map(d => `
        <tr>
            <td>${mpEsc(d.name)}</td>
            <td><span class="mp-tag ${mpEsc(d.kategorie)}">${mpEsc(MP_CAT_LABELS[d.kategorie] || d.kategorie || '—')}</span></td>
            <td>${d.rezept_url ? `<a href="${mpEsc(d.rezept_url)}" target="_blank">Link</a>` : '—'}</td>
            <td>${d.portionen || '—'}</td>
            <td class="col-actions">
                <button class="mp-btn-icon" title="Bearbeiten" onclick="mpEditDish('${mpEsc(d.id)}')">&#x270E;</button>
                <button class="mp-btn-icon danger" title="Löschen" onclick="mpDeleteDish('${mpEsc(d.id)}','${mpEsc(d.name)}')">&#x1F5D1;</button>
            </td>
        </tr>`).join('');
}

function mpEditDish(id) {
    const d = id ? mp.dishes.find(x => x.id === id) : null;
    document.getElementById('mp-dish-modal-title').textContent = d ? 'Gericht bearbeiten' : 'Neues Gericht';
    document.getElementById('mp-dish-id').value    = d ? d.id : '';
    document.getElementById('mp-dish-name').value  = d ? d.name : '';
    document.getElementById('mp-dish-cat').value   = d ? (d.kategorie || '') : '';
    document.getElementById('mp-dish-url').value   = d ? (d.rezept_url || '') : '';
    document.getElementById('mp-dish-port').value  = d ? (d.portionen || '') : '';
    document.getElementById('mp-dish-modal').classList.add('open');
    document.getElementById('mp-dish-name').focus();
}

async function mpSaveDish() {
    const name = document.getElementById('mp-dish-name').value.trim();
    if (!name) { mpToast('Name ist erforderlich', true); return; }
    const dish = {
        id:         document.getElementById('mp-dish-id').value || undefined,
        name,
        kategorie:  document.getElementById('mp-dish-cat').value,
        rezept_url: document.getElementById('mp-dish-url').value.trim(),
        portionen:  parseInt(document.getElementById('mp-dish-port').value) || 2,
    };
    if (!dish.id) delete dish.id;
    const res = await mpSendTo('saveDish', dish);
    if (res && res.error) { mpToast('Fehler: ' + res.error, true); return; }
    mpCloseDishModal();
    // Reload
    const dishRes = await mpSendTo('getDishes', {});
    if (dishRes && dishRes.result) mp.dishes = dishRes.result;
    mpRenderDishes();
    mpRenderWeekPlanner(); // refresh selects
    mpToast('Gericht gespeichert');
}

async function mpDeleteDish(id, name) {
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    const res = await mpSendTo('deleteDish', { id });
    if (res && res.error) { mpToast('Fehler: ' + res.error, true); return; }
    const dishRes = await mpSendTo('getDishes', {});
    if (dishRes && dishRes.result) mp.dishes = dishRes.result;
    mpRenderDishes();
    mpRenderWeekPlanner();
    mpToast('Gericht gelöscht');
}

function mpCloseDishModal() {
    document.getElementById('mp-dish-modal').classList.remove('open');
}

// ─── Sides tab ─────────────────────────────────────────────────────────────────

function mpRenderSides() {
    const tbody = document.getElementById('mp-sides-tbody');
    if (!mp.sides.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="mp-empty">Keine Beilagen vorhanden</td></tr>`;
        return;
    }
    tbody.innerHTML = mp.sides.map(s => `
        <tr>
            <td>${mpEsc(s.name)}</td>
            <td>${s.rezept_url ? `<a href="${mpEsc(s.rezept_url)}" target="_blank">Link</a>` : '—'}</td>
            <td>${s.portionen || '—'}</td>
            <td class="col-actions">
                <button class="mp-btn-icon" title="Bearbeiten" onclick="mpEditSide('${mpEsc(s.id)}')">&#x270E;</button>
                <button class="mp-btn-icon danger" title="Löschen" onclick="mpDeleteSide('${mpEsc(s.id)}','${mpEsc(s.name)}')">&#x1F5D1;</button>
            </td>
        </tr>`).join('');
}

function mpEditSide(id) {
    const s = id ? mp.sides.find(x => x.id === id) : null;
    document.getElementById('mp-side-modal-title').textContent = s ? 'Beilage bearbeiten' : 'Neue Beilage';
    document.getElementById('mp-side-id').value   = s ? s.id : '';
    document.getElementById('mp-side-name').value = s ? s.name : '';
    document.getElementById('mp-side-url').value  = s ? (s.rezept_url || '') : '';
    document.getElementById('mp-side-port').value = s ? (s.portionen || '') : '';
    document.getElementById('mp-side-modal').classList.add('open');
    document.getElementById('mp-side-name').focus();
}

async function mpSaveSide() {
    const name = document.getElementById('mp-side-name').value.trim();
    if (!name) { mpToast('Name ist erforderlich', true); return; }
    const side = {
        id:         document.getElementById('mp-side-id').value || undefined,
        name,
        rezept_url: document.getElementById('mp-side-url').value.trim(),
        portionen:  parseInt(document.getElementById('mp-side-port').value) || 2,
    };
    if (!side.id) delete side.id;
    const res = await mpSendTo('saveSide', side);
    if (res && res.error) { mpToast('Fehler: ' + res.error, true); return; }
    mpCloseSideModal();
    const sideRes = await mpSendTo('getSides', {});
    if (sideRes && sideRes.result) mp.sides = sideRes.result;
    mpRenderSides();
    mpRenderWeekPlanner();
    mpToast('Beilage gespeichert');
}

async function mpDeleteSide(id, name) {
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    const res = await mpSendTo('deleteSide', { id });
    if (res && res.error) { mpToast('Fehler: ' + res.error, true); return; }
    const sideRes = await mpSendTo('getSides', {});
    if (sideRes && sideRes.result) mp.sides = sideRes.result;
    mpRenderSides();
    mpRenderWeekPlanner();
    mpToast('Beilage gelöscht');
}

function mpCloseSideModal() {
    document.getElementById('mp-side-modal').classList.remove('open');
}

// ─── Import / Export ──────────────────────────────────────────────────────────

async function mpDoExport() {
    const res = await mpSendTo('exportCsv', {});
    if (res && res.error) { mpToast('Export fehlgeschlagen: ' + res.error, true); return; }
    if (res && res.result) {
        document.getElementById('mp-csv-area').value = res.result;
        mpToast('CSV exportiert');
        // Also offer download
        const blob = new Blob([res.result], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `mealplan_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

async function mpDoImport() {
    const csv = document.getElementById('mp-csv-area').value.trim();
    if (!csv) { mpToast('Bitte CSV-Daten eingeben', true); return; }
    const res = await mpSendTo('importCsv', { csv });
    if (res && res.error) { mpToast('Import fehlgeschlagen: ' + res.error, true); return; }
    // Reload plan
    const planRes = await mpSendTo('getPlan', {});
    if (planRes && planRes.result) mp.plan = planRes.result;
    mpRenderWeekPlanner();
    mpToast('Import erfolgreich');
}

// Close modal on overlay click
function mpInitModalClose() {
    document.querySelectorAll('.mp-modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('open');
        });
    });
    // ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.mp-modal-overlay.open').forEach(o => o.classList.remove('open'));
        }
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function mpInit() {
    console.log(`[mealplanner] mpInit() — instance=${instance}, socket connected=${socket && socket.connected}`);
    mpInitTabs();
    mpInitModalClose();

    try {
        await mpLoadAll();
        console.log('[mealplanner] Daten geladen:', mp);
    } catch (e) {
        console.error('[mealplanner] Ladefehler:', e);
        document.getElementById('mp-root').innerHTML =
            `<div class="mp-empty" style="color:#c62828">Fehler beim Laden: ${mpEsc(e.message)}</div>`;
        return;
    }

    mpRenderWeekPlanner();
    mpRenderDishes();
    mpRenderSides();
    window._mpInitDone = true;
}
