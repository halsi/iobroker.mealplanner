/* global socket, instance, systemLang */
'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

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
    const [dishRes, sideRes] = await Promise.all([
        mpSendTo('getDishes', {}),
        mpSendTo('getSides', {}),
    ]);
    if (dishRes && dishRes.result) mp.dishes = dishRes.result;
    if (sideRes && sideRes.result) mp.sides = sideRes.result;
}

// ─── Dishes tab ───────────────────────────────────────────────────────────────

function mpUpdateDishSelCount() {
    const checked = document.querySelectorAll('#mp-dishes-tbody input[type=checkbox]:checked');
    const count = checked.length;
    document.getElementById('mp-dishes-sel-count').textContent = count;
    document.getElementById('mp-dishes-delete-btn').style.display = count ? '' : 'none';
    const allCb = document.getElementById('mp-dishes-check-all');
    if (allCb) allCb.indeterminate = count > 0 && count < mp.dishes.length;
    if (allCb) allCb.checked = mp.dishes.length > 0 && count === mp.dishes.length;
}

function mpToggleAllDishes(checked) {
    document.querySelectorAll('#mp-dishes-tbody input[type=checkbox]').forEach(cb => cb.checked = checked);
    mpUpdateDishSelCount();
}

async function mpDeleteSelectedDishes() {
    const checked = [...document.querySelectorAll('#mp-dishes-tbody input[type=checkbox]:checked')];
    if (!checked.length) return;
    const ids = checked.map(cb => cb.dataset.id);
    const names = ids.map(id => { const d = mp.dishes.find(x => x.id === id); return d ? d.name : id; });
    if (!confirm(`${ids.length} Gericht(e) wirklich löschen?\n${names.join(', ')}`)) return;
    const res = await mpSendTo('deleteDishes', { ids });
    if (res && res.error) { mpToast('Fehler: ' + res.error, true); return; }
    const dishRes = await mpSendTo('getDishes', {});
    if (dishRes && dishRes.result) mp.dishes = dishRes.result;
    document.getElementById('mp-dishes-check-all').checked = false;
    mpRenderDishes();
    mpToast(`${ids.length} Gericht(e) gelöscht`);
}

function mpRenderDishes() {
    const tbody = document.getElementById('mp-dishes-tbody');
    if (!mp.dishes.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="mp-empty">Keine Gerichte vorhanden</td></tr>`;
        document.getElementById('mp-dishes-delete-btn').style.display = 'none';
        document.getElementById('mp-dishes-check-all').checked = false;
        return;
    }
    tbody.innerHTML = mp.dishes.map(d => `
        <tr>
            <td><input type="checkbox" data-id="${mpEsc(d.id)}" onchange="mpUpdateDishSelCount()"></td>
            <td>${mpEsc(d.name)}</td>
            <td><span class="mp-tag ${mpEsc(d.kategorie)}">${mpEsc(MP_CAT_LABELS[d.kategorie] || d.kategorie || '—')}</span></td>
            <td>${d.rezept_url ? `<a href="${mpEsc(d.rezept_url)}" target="_blank">Link</a>` : '—'}</td>
            <td>${d.portionen || '—'}</td>
            <td class="col-actions">
                <button class="mp-btn-icon" title="Bearbeiten" onclick="mpEditDish('${mpEsc(d.id)}')">&#x270E;</button>
                <button class="mp-btn-icon danger" title="Löschen" onclick="mpDeleteDish('${mpEsc(d.id)}','${mpEsc(d.name)}')">&#x1F5D1;</button>
            </td>
        </tr>`).join('');
    mpUpdateDishSelCount();
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
    const dishRes = await mpSendTo('getDishes', {});
    if (dishRes && dishRes.result) mp.dishes = dishRes.result;
    mpRenderDishes();
    mpToast('Gericht gespeichert');
}

async function mpDeleteDish(id, name) {
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    const res = await mpSendTo('deleteDish', { id });
    if (res && res.error) { mpToast('Fehler: ' + res.error, true); return; }
    const dishRes = await mpSendTo('getDishes', {});
    if (dishRes && dishRes.result) mp.dishes = dishRes.result;
    mpRenderDishes();
    mpToast('Gericht gelöscht');
}

function mpCloseDishModal() {
    document.getElementById('mp-dish-modal').classList.remove('open');
}

// ─── Sides tab ─────────────────────────────────────────────────────────────────

function mpUpdateSideSelCount() {
    const checked = document.querySelectorAll('#mp-sides-tbody input[type=checkbox]:checked');
    const count = checked.length;
    document.getElementById('mp-sides-sel-count').textContent = count;
    document.getElementById('mp-sides-delete-btn').style.display = count ? '' : 'none';
    const allCb = document.getElementById('mp-sides-check-all');
    if (allCb) allCb.indeterminate = count > 0 && count < mp.sides.length;
    if (allCb) allCb.checked = mp.sides.length > 0 && count === mp.sides.length;
}

function mpToggleAllSides(checked) {
    document.querySelectorAll('#mp-sides-tbody input[type=checkbox]').forEach(cb => cb.checked = checked);
    mpUpdateSideSelCount();
}

async function mpDeleteSelectedSides() {
    const checked = [...document.querySelectorAll('#mp-sides-tbody input[type=checkbox]:checked')];
    if (!checked.length) return;
    const ids = checked.map(cb => cb.dataset.id);
    const names = ids.map(id => { const s = mp.sides.find(x => x.id === id); return s ? s.name : id; });
    if (!confirm(`${ids.length} Beilage(n) wirklich löschen?\n${names.join(', ')}`)) return;
    const res = await mpSendTo('deleteSides', { ids });
    if (res && res.error) { mpToast('Fehler: ' + res.error, true); return; }
    const sideRes = await mpSendTo('getSides', {});
    if (sideRes && sideRes.result) mp.sides = sideRes.result;
    document.getElementById('mp-sides-check-all').checked = false;
    mpRenderSides();
    mpToast(`${ids.length} Beilage(n) gelöscht`);
}

function mpRenderSides() {
    const tbody = document.getElementById('mp-sides-tbody');
    if (!mp.sides.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="mp-empty">Keine Beilagen vorhanden</td></tr>`;
        document.getElementById('mp-sides-delete-btn').style.display = 'none';
        document.getElementById('mp-sides-check-all').checked = false;
        return;
    }
    tbody.innerHTML = mp.sides.map(s => `
        <tr>
            <td><input type="checkbox" data-id="${mpEsc(s.id)}" onchange="mpUpdateSideSelCount()"></td>
            <td>${mpEsc(s.name)}</td>
            <td>${s.rezept_url ? `<a href="${mpEsc(s.rezept_url)}" target="_blank">Link</a>` : '—'}</td>
            <td>${s.portionen || '—'}</td>
            <td class="col-actions">
                <button class="mp-btn-icon" title="Bearbeiten" onclick="mpEditSide('${mpEsc(s.id)}')">&#x270E;</button>
                <button class="mp-btn-icon danger" title="Löschen" onclick="mpDeleteSide('${mpEsc(s.id)}','${mpEsc(s.name)}')">&#x1F5D1;</button>
            </td>
        </tr>`).join('');
    mpUpdateSideSelCount();
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
    mpToast('Beilage gespeichert');
}

async function mpDeleteSide(id, name) {
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    const res = await mpSendTo('deleteSide', { id });
    if (res && res.error) { mpToast('Fehler: ' + res.error, true); return; }
    const sideRes = await mpSendTo('getSides', {});
    if (sideRes && sideRes.result) mp.sides = sideRes.result;
    mpRenderSides();
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
    mpToast('Wochenplan importiert');
}

async function mpDoImportDishes() {
    const csv = document.getElementById('mp-dishes-csv-area').value.trim();
    if (!csv) { mpToast('Bitte CSV-Daten eingeben', true); return; }
    const res = await mpSendTo('importDishes', { csv });
    if (res && res.error) { mpToast('Import fehlgeschlagen: ' + res.error, true); return; }
    const { imported, skipped } = (res && res.result) || {};
    const dishRes = await mpSendTo('getDishes', {});
    if (dishRes && dishRes.result) mp.dishes = dishRes.result;
    mpRenderDishes();
    mpRenderWeekPlanner();
    mpToast(`${imported} Gerichte importiert, ${skipped} übersprungen`);
}

async function mpDoImportSides() {
    const csv = document.getElementById('mp-sides-csv-area').value.trim();
    if (!csv) { mpToast('Bitte CSV-Daten eingeben', true); return; }
    const res = await mpSendTo('importSides', { csv });
    if (res && res.error) { mpToast('Import fehlgeschlagen: ' + res.error, true); return; }
    const { imported, skipped } = (res && res.result) || {};
    const sideRes = await mpSendTo('getSides', {});
    if (sideRes && sideRes.result) mp.sides = sideRes.result;
    mpRenderSides();
    mpToast(`${imported} Beilagen importiert, ${skipped} übersprungen`);
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
    mpInitTabs();
    mpInitModalClose();

    try {
        await mpLoadAll();
    } catch (e) {
        console.error('[mealplanner] Ladefehler:', e);
        return;
    }

    mpRenderDishes();
    mpRenderSides();
}
