import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getDatabase, ref, push, set, get, remove, update } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";
import { firebaseConfig } from './firebase.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let allItems = [];
let currentView = 'anime'; // anime | series | season | episode
let currentParentId = null;
let currentParentTitle = '';
let contextTargetId = null;
const $ = id => document.getElementById(id);

// ====== AUTH ======
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    const snap = await get(ref(db, `users/${user.uid}/isAdmin`));
    if (snap.val() !== true) { alert('⛔ Нет прав'); window.location.href = 'index.html'; return; }
    await loadItems();
    refreshView();
});

// ====== DATA ======
async function loadItems() {
    const snap = await get(ref(db, 'items'));
    allItems = snap.exists() ? Object.entries(snap.val()).map(([id, v]) => ({ id, ...v })) : [];
    $('count-anime').textContent = allItems.filter(i => i.type === 'anime' || i.type === 'movie' || (!i.type && i.url)).length;
    $('count-series').textContent = allItems.filter(i => i.type === 'series').length;
}

// ====== VIEW ======
function refreshView() {
    $('context-menu').style.display = 'none';
    if (currentView === 'anime') showAnime();
    else if (currentView === 'series') showSeries();
    else if (currentView === 'season') showChildren('season', 'Сезоны');
    else if (currentView === 'episode') showChildren('episode', 'Серии');
}

function showAnime() {
    currentParentId = null;
    $('content-title').textContent = '🎬 Аниме / Фильмы';
    $('btn-add').textContent = '➕ Добавить аниме';
    $('btn-add').onclick = () => openModal('anime');
    $('breadcrumb').innerHTML = '';
    const items = allItems.filter(i => i.type === 'anime' || i.type === 'movie' || (!i.type && i.url));
    renderGrid(items, 'badge-anime', 'АНИМЕ');
}

function showSeries() {
    currentParentId = null;
    $('content-title').textContent = '📺 Сериалы';
    $('btn-add').textContent = '➕ Добавить сериал';
    $('btn-add').onclick = () => openModal('series');
    $('breadcrumb').innerHTML = '';
    const items = allItems.filter(i => i.type === 'series');
    renderGrid(items, 'badge-series', 'СЕРИАЛ');
}

function showChildren(type, label) {
    $('content-title').textContent = `📁 ${currentParentTitle} → ${label}`;
    $('btn-add').textContent = `➕ Добавить ${label.toLowerCase().slice(0, -1)}`;
    $('btn-add').onclick = () => openModal(type, currentParentId);
    $('breadcrumb').innerHTML = `<span style="cursor:pointer;color:#a78bfa;" onclick="window._navSeries()">📺 Сериалы</span> <span style="color:#666;">/</span> ${currentParentTitle}`;

    const items = allItems.filter(i => i.type === type && i.parentId === currentParentId);
    
    if (type === 'season') {
        // Для сезонов показываем тип
        const mapped = items.map(s => ({
            ...s,
            _badgeClass: s.seasonType === 'timeline' ? 'badge-timeline' : 'badge-separate',
            _badgeText: s.seasonType === 'timeline' ? 'ТАЙМКОД' : 'РАЗДЕЛЬНЫЙ'
        }));
        renderGrid(mapped, null, null, true);
    } else if (type === 'episode') {
        // Серии — таблица
        renderEpisodes(items);
    }
}

function renderGrid(items, defaultBadgeClass, defaultBadgeText, useCustomBadge = false) {
    const grid = $('content-grid');
    grid.className = 'content-grid';
    if (!items.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px;color:#666;">📭 Пусто</div>';
        return;
    }
    grid.innerHTML = items.map(item => {
        const bc = useCustomBadge ? item._badgeClass : defaultBadgeClass;
        const bt = useCustomBadge ? item._badgeText : defaultBadgeText;
        const children = allItems.filter(i => i.parentId === item.id).length;
        return `
            <div class="content-card" data-id="${item.id}" data-type="${item.type}" data-context="item"
                 ondblclick="window._openItem('${item.id}')"
                 oncontextmenu="window._ctx(event, '${item.id}')">
                <div class="card-poster">
                    <img src="${item.poster || 'https://via.placeholder.com/400x250/1a1a2e/a855f7?text=Nya'}" onerror="this.src='https://via.placeholder.com/400x250/1a1a2e/a855f7?text=Error'">
                    <div class="card-type-badge ${bc}">${bt}</div>
                </div>
                <div class="card-body">
                    <div class="card-name">${esc(item.title || '—')}</div>
                    <div class="card-meta">${item.year || ''} ${item.genre ? '· '+item.genre : ''}</div>
                    ${children ? `<div class="card-children-count">📂 ${children} вложений</div>` : ''}
                </div>
            </div>`;
    }).join('');
}

function renderEpisodes(items) {
    const grid = $('content-grid');
    grid.className = '';
    if (!items.length) {
        grid.innerHTML = '<div style="text-align:center;padding:60px;color:#666;">📭 Нет серий</div>';
        return;
    }
    items.sort((a, b) => (parseInt(a.episodeNumber) || 0) - (parseInt(b.episodeNumber) || 0));
    const season = allItems.find(i => i.id === currentParentId);
    const isTimeline = season?.seasonType === 'timeline';
    grid.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);">
                <th style="padding:10px 14px;color:#666;font-size:11px;text-transform:uppercase;">№</th>
                <th style="padding:10px 14px;color:#666;font-size:11px;text-transform:uppercase;">Название</th>
                ${isTimeline ? '<th style="padding:10px 14px;color:#666;font-size:11px;text-transform:uppercase;">Таймкоды</th>' : ''}
                <th style="padding:10px 14px;color:#666;font-size:11px;text-transform:uppercase;">Рейтинг</th>
            </tr></thead>
            <tbody>${items.map(ep => `
                <tr data-id="${ep.id}" data-type="episode" data-context="item"
                    ondblclick="window._openItem('${ep.id}')"
                    oncontextmenu="window._ctx(event, '${ep.id}')"
                    style="cursor:pointer;transition:0.2s;border-bottom:1px solid rgba(255,255,255,0.02);"
                    onmouseover="this.style.background='rgba(168,85,247,0.05)'"
                    onmouseout="this.style.background=''">
                    <td style="padding:10px 14px;">${ep.episodeNumber || '—'}</td>
                    <td style="padding:10px 14px;font-weight:600;">${esc(ep.title || 'Без названия')}</td>
                    ${isTimeline ? `<td style="padding:10px 14px;font-size:12px;color:#888;">${fmt(ep.startTime)} → ${fmt(ep.endTime)}</td>` : ''}
                    <td style="padding:10px 14px;color:#fbbf24;">⭐ ${Number(ep.rating||0).toFixed(1)}</td>
                </tr>`).join('')}</tbody>
        </table>`;
}

// ====== MODAL ======
function openModal(type, parentId = null, editItem = null) {
    $('form-id').value = editItem?.id || '';
    $('form-type').value = type;
    $('form-parent').value = parentId || '';
    $('form-title').value = editItem?.title || '';
    $('form-poster').value = editItem?.poster || '';
    $('form-year').value = editItem?.year || '2024';
    $('form-genre').value = editItem?.genre || '';
    $('form-desc').value = editItem?.description || '';
    $('form-url').value = editItem?.url || editItem?.videoUrl || '';
    $('form-ep-num').value = editItem?.episodeNumber || 1;
    $('form-start').value = fmt(editItem?.startTime || 0);
    $('form-end').value = fmt(editItem?.endTime || 0);

    // Сброс видимости
    ['group-poster','group-meta','group-url','group-season-type','group-ep-num','group-timeline'].forEach(id => {
        const el = $(id); if (el) el.style.display = 'none';
    });
    $('form-poster').removeAttribute('required');
    $('form-url').removeAttribute('required');

    const titles = { anime: 'Аниме/Фильм', series: 'Сериал', season: 'Сезон', episode: 'Серия' };
    $('modal-title').textContent = editItem ? `✏️ ${titles[type]}` : `➕ ${titles[type]}`;
    $('btn-submit').textContent = editItem ? '💾 Сохранить' : '➕ Добавить';

    if (type === 'anime') {
        $('group-poster').style.display = 'block'; $('form-poster').required = true;
        $('group-meta').style.display = 'block';
        $('group-url').style.display = 'block'; $('form-url').required = true;
    } else if (type === 'series') {
        $('group-poster').style.display = 'block'; $('form-poster').required = true;
        $('group-meta').style.display = 'block';
        // НЕТ url
    } else if (type === 'season') {
        $('group-poster').style.display = 'block'; $('form-poster').required = true;
        $('group-meta').style.display = 'block';
        $('group-season-type').style.display = 'block';
        // Устанавливаем радио
        const st = editItem?.seasonType || 'timeline';
        document.querySelector('input[name="season-type"][value="' + st + '"]').checked = true;
        toggleSeasonUrlFields();
        document.querySelectorAll('input[name="season-type"]').forEach(r => r.onchange = toggleSeasonUrlFields);
    } else if (type === 'episode') {
        $('group-poster').style.display = 'none';
        $('group-ep-num').style.display = 'block';
        const season = allItems.find(i => i.id === parentId);
        const isTimeline = season?.seasonType === 'timeline';
        if (isTimeline) {
            $('group-timeline').style.display = 'block';
        } else {
            $('group-url').style.display = 'block'; $('form-url').required = true;
        }
    }

    $('modal-overlay').classList.add('active');
}

function toggleSeasonUrlFields() {
    const isTimeline = document.querySelector('input[name="season-type"]:checked')?.value === 'timeline';
    $('group-url').style.display = isTimeline ? 'block' : 'none';
    if (isTimeline) $('form-url').required = true;
    else $('form-url').removeAttribute('required');
}

function closeModal() { $('modal-overlay').classList.remove('active'); }
$('modal-close').onclick = closeModal;
$('modal-overlay').onclick = e => { if (e.target === $('modal-overlay')) closeModal(); };

// Сохранение
$('modal-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('form-id').value;
    const type = $('form-type').value;
    const parentId = $('form-parent').value || null;

    const data = {
        type,
        title: $('form-title').value.trim(),
        updatedAt: Date.now()
    };

    // Общие поля
    if (['anime','series','season'].includes(type)) {
        data.poster = $('form-poster').value.trim();
        if (!data.poster) { alert('Введи постер!'); return; }
    }
    if (['anime','series','season'].includes(type)) {
        data.year = $('form-year').value.trim() || '2024';
        data.genre = $('form-genre').value.trim() || '';
        data.description = $('form-desc').value.trim() || '';
    }
    if (type === 'anime') {
        data.url = $('form-url').value.trim();
        if (!data.url) { alert('Введи ссылку!'); return; }
    }
    if (type === 'season') {
        data.seasonType = document.querySelector('input[name="season-type"]:checked')?.value || 'timeline';
        if (data.seasonType === 'timeline') {
            data.videoUrl = $('form-url').value.trim();
            if (!data.videoUrl) { alert('Введи ссылку на видео для таймкодного сезона!'); return; }
        }
    }
    if (type === 'episode') {
        data.episodeNumber = $('form-ep-num').value;
        const season = allItems.find(i => i.id === parentId);
        if (season?.seasonType === 'timeline') {
            data.startTime = parseTime($('form-start').value);
            data.endTime = parseTime($('form-end').value);
            if (data.endTime <= data.startTime) { alert('Конец должен быть позже начала!'); return; }
        } else {
            data.url = $('form-url').value.trim();
            if (!data.url) { alert('Введи ссылку на видео серии!'); return; }
        }
    }
    if (parentId) data.parentId = parentId;
    if (!data.title) { alert('Введи название!'); return; }

    try {
        if (id) {
            await update(ref(db, `items/${id}`), data);
            toast('✅ Обновлено!');
        } else {
            data.createdAt = Date.now();
            data.rating = 0;
            await set(push(ref(db, 'items')), data);
            toast('✅ Добавлено!');
        }
        closeModal();
        await loadItems();
        refreshView();
    } catch (err) { console.error(err); alert('Ошибка: ' + err.message); }
});

// ====== CONTEXT MENU ======
window._ctx = function(e, id) {
    e.preventDefault();
    contextTargetId = id;
    const menu = $('context-menu');
    const item = allItems.find(i => i.id === id);
    menu.style.display = 'block';
    menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 160) + 'px';
    const openBtn = menu.querySelector('[data-action="open"]');
    if (item?.type === 'series' || item?.type === 'season') {
        openBtn.style.display = 'flex';
        openBtn.textContent = item.type === 'series' ? '📂 Открыть сезоны' : '📂 Открыть серии';
    } else {
        openBtn.style.display = 'none';
    }
};

document.addEventListener('click', e => {
    if (!$('context-menu').contains(e.target)) $('context-menu').style.display = 'none';
});

$('context-menu').querySelector('[data-action="edit"]').onclick = () => {
    const item = allItems.find(i => i.id === contextTargetId);
    if (item) openModal(item.type, item.parentId, item);
    $('context-menu').style.display = 'none';
};
$('context-menu').querySelector('[data-action="open"]').onclick = () => {
    window._openItem(contextTargetId);
    $('context-menu').style.display = 'none';
};
$('context-menu').querySelector('[data-action="delete"]').onclick = async () => {
    if (confirm('Удалить вместе с вложениями?')) {
        await deleteRecursive(contextTargetId);
        toast('🗑️ Удалено');
        await loadItems();
        refreshView();
    }
    $('context-menu').style.display = 'none';
};

window._openItem = function(id) {
    const item = allItems.find(i => i.id === id);
    if (!item) return;
    if (item.type === 'series') {
        currentView = 'season';
        currentParentId = item.id;
        currentParentTitle = item.title || 'Сериал';
        refreshView();
    } else if (item.type === 'season') {
        currentView = 'episode';
        currentParentId = item.id;
        currentParentTitle = item.title || 'Сезон';
        refreshView();
    }
};

async function deleteRecursive(id) {
    for (const child of allItems.filter(i => i.parentId === id)) {
        await deleteRecursive(child.id);
    }
    await remove(ref(db, `items/${id}`));
}

// ====== SIDEBAR ======
document.querySelectorAll('.sidebar-item[data-type]').forEach(el => {
    el.onclick = () => {
        document.querySelectorAll('.sidebar-item[data-type]').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        currentView = el.dataset.type;
        currentParentId = null;
        refreshView();
    };
});
$('sidebar-add-anime').onclick = () => openModal('anime');
$('sidebar-add-series').onclick = () => openModal('series');
$('btn-refresh').onclick = async () => { await loadItems(); refreshView(); toast('🔄 Обновлено'); };
window._navSeries = () => {
    currentView = 'series';
    currentParentId = null;
    document.querySelectorAll('.sidebar-item[data-type]').forEach(e => e.classList.remove('active'));
    document.querySelector('.sidebar-item[data-type="series"]')?.classList.add('active');
    refreshView();
};

// ====== HELPERS ======
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmt(sec) {
    if (!sec && sec !== 0) return '0:00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}
function parseTime(str) {
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
    if (parts.length === 2) return parts[0]*60 + parts[1];
    return parseInt(str) || 0;
}
function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._t);
    t._t = setTimeout(() => t.style.display = 'none', 2500);
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); $('context-menu').style.display = 'none'; }
});
