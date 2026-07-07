import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getDatabase, ref, push, set, get, remove, update } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";
import { firebaseConfig } from './firebase.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ====== STATE ======
let allItems = [];
let currentView = 'anime'; // 'anime' | 'series' | 'season' | 'episode'
let currentParentId = null; // для просмотра сезонов/серий внутри сериала
let currentParentTitle = '';
let contextTarget = null; // элемент для контекстного меню
let selectedItems = new Set();

// ====== DOM ======
const $ = id => document.getElementById(id);
const contextMenu = $('context-menu');
const modalOverlay = $('modal-overlay');
const modal = $('modal');
const contentGrid = $('content-grid');
const contentTitle = $('content-title');
const breadcrumb = $('breadcrumb');
const btnAdd = $('btn-add');

// ====== AUTH CHECK ======
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    const snap = await get(ref(db, `users/${user.uid}/isAdmin`));
    if (snap.val() !== true) {
        alert('⛔ Нет прав администратора');
        window.location.href = 'index.html';
        return;
    }
    await loadAllItems();
    refreshView();
});

// ====== DATA ======
async function loadAllItems() {
    const snap = await get(ref(db, 'items'));
    allItems = snap.exists() ? Object.entries(snap.val()).map(([id, v]) => ({ id, ...v })) : [];
    updateCounts();
}

function updateCounts() {
    $('count-anime').textContent = allItems.filter(i => i.type === 'anime' || i.type === 'movie' || (!i.type && i.url)).length;
    $('count-series').textContent = allItems.filter(i => i.type === 'series').length;
}

// ====== RENDER ======
function refreshView() {
    selectedItems.clear();
    contextMenu.style.display = 'none';

    if (currentView === 'anime') {
        renderAnimeView();
    } else if (currentView === 'series') {
        renderSeriesView();
    } else if (currentView === 'season') {
        renderChildrenView('season', 'Сезоны');
    } else if (currentView === 'episode') {
        renderChildrenView('episode', 'Серии');
    }
}

function renderAnimeView() {
    currentParentId = null;
    currentParentTitle = '';
    contentTitle.textContent = '🎬 Аниме / Фильмы';
    btnAdd.textContent = '➕ Добавить аниме';
    btnAdd.onclick = () => openModal('anime');
    breadcrumb.innerHTML = '';

    const items = allItems.filter(i => i.type === 'anime' || i.type === 'movie' || (!i.type && i.url));
    renderGrid(items, 'anime');
}

function renderSeriesView() {
    currentParentId = null;
    currentParentTitle = '';
    contentTitle.textContent = '📺 Сериалы';
    btnAdd.textContent = '➕ Добавить сериал';
    btnAdd.onclick = () => openModal('series');
    breadcrumb.innerHTML = '';

    const items = allItems.filter(i => i.type === 'series');
    renderGrid(items, 'series');
}

function renderChildrenView(type, label) {
    contentTitle.textContent = `📁 ${currentParentTitle} → ${label}`;
    btnAdd.textContent = `➕ Добавить ${label.toLowerCase().slice(0, -1)}`;
    btnAdd.onclick = () => openModal(type, currentParentId);
    breadcrumb.innerHTML = `
        <span onclick="window._navToSeries()">📺 Сериалы</span>
        <span style="color:#666;">/</span>
        <span style="color:#c4b5fd;">${currentParentTitle}</span>
    `;

    const items = allItems.filter(i => i.type === type && i.parentId === currentParentId);
    
    if (type === 'episode') {
        renderEpisodesTable(items);
    } else {
        renderGrid(items, type);
    }
}

function renderGrid(items, type) {
    if (!items.length) {
        contentGrid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <div class="icon">📭</div>
                <p>Нет контента</p>
                <button class="btn-add" onclick="$('btn-add').click()">➕ Добавить</button>
            </div>`;
        return;
    }

    contentGrid.className = 'content-grid';
    contentGrid.innerHTML = items.map(item => {
        const badgeClass = { anime: 'badge-anime', movie: 'badge-anime', series: 'badge-series', season: 'badge-season', episode: 'badge-episode' };
        const badgeText = { anime: 'АНИМЕ', movie: 'АНИМЕ', series: 'СЕРИАЛ', season: 'СЕЗОН', episode: 'СЕРИЯ' };
        const childrenCount = allItems.filter(i => i.parentId === item.id).length;
        
        return `
            <div class="content-card ${selectedItems.has(item.id) ? 'selected' : ''}" 
                 data-id="${item.id}" 
                 data-type="${item.type || 'anime'}"
                 data-title="${escapeHtml(item.title || '')}"
                 data-context="item">
                <div class="card-poster">
                    <img src="${item.poster || 'https://via.placeholder.com/400x250/1a1a2e/a855f7?text=Nya'}" 
                         onerror="this.src='https://via.placeholder.com/400x250/1a1a2e/a855f7?text=Error'">
                    <div class="card-type-badge ${badgeClass[item.type] || 'badge-anime'}">${badgeText[item.type] || 'КОНТЕНТ'}</div>
                </div>
                <div class="card-body">
                    <div class="card-name">${item.title || 'Без названия'}</div>
                    <div class="card-meta">
                        <span>${item.year || '—'}</span>
                        <span>·</span>
                        <span class="card-rating-badge">⭐ ${Number(item.rating || 0).toFixed(1)}</span>
                    </div>
                    ${childrenCount > 0 ? `<div class="card-children-count">📂 ${childrenCount} вложений</div>` : ''}
                </div>
            </div>`;
    }).join('');

    attachCardEvents();
}

function renderEpisodesTable(items) {
    contentGrid.className = '';
    if (!items.length) {
        contentGrid.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Нет серий</p></div>';
        return;
    }
    items.sort((a, b) => (parseInt(a.episodeNumber) || 0) - (parseInt(b.episodeNumber) || 0));
    contentGrid.innerHTML = `
        <table class="episodes-table">
            <thead><tr><th>№</th><th>Название</th><th>Длительность</th><th>Рейтинг</th></tr></thead>
            <tbody>
                ${items.map(ep => `
                    <tr class="${selectedItems.has(ep.id) ? 'selected' : ''}" 
                        data-id="${ep.id}" 
                        data-type="episode"
                        data-context="item">
                        <td>${ep.episodeNumber || '—'}</td>
                        <td><strong>${escapeHtml(ep.title || 'Без названия')}</strong></td>
                        <td>${ep.duration || '—'}</td>
                        <td>⭐ ${Number(ep.rating || 0).toFixed(1)}</td>
                    </tr>`).join('')}
            </tbody>
        </table>`;
    attachCardEvents();
}

function attachCardEvents() {
    document.querySelectorAll('[data-context="item"]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) {
                toggleSelect(el.dataset.id);
            }
        });

        el.addEventListener('dblclick', () => {
            const item = allItems.find(i => i.id === el.dataset.id);
            if (item) openItem(item);
        });

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            contextTarget = el;
            const item = allItems.find(i => i.id === el.dataset.id);
            showContextMenu(e.clientX, e.clientY, item);
        });
    });
}

function toggleSelect(id) {
    if (selectedItems.has(id)) {
        selectedItems.delete(id);
    } else {
        selectedItems.add(id);
    }
    // Обновить визуал
    document.querySelectorAll(`[data-id="${id}"]`).forEach(el => {
        el.classList.toggle('selected', selectedItems.has(id));
    });
}

function openItem(item) {
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
}

// ====== CONTEXT MENU ======
function showContextMenu(x, y, item) {
    const menu = contextMenu;
    menu.style.display = 'block';
    menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 180) + 'px';

    // Показываем/скрываем "Открыть" в зависимости от типа
    const openAction = menu.querySelector('[data-action="open-children"]');
    if (item.type === 'series' || item.type === 'season') {
        openAction.style.display = 'flex';
        const children = allItems.filter(i => i.parentId === item.id);
        openAction.textContent = item.type === 'series' ? '📂 Открыть (сезоны)' : `📂 Открыть (серии: ${children.length})`;
    } else {
        openAction.style.display = 'none';
    }

    menu.dataset.itemId = item.id;
}

document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
        contextMenu.style.display = 'none';
    }
});

// Действия контекстного меню
contextMenu.querySelector('[data-action="edit"]').onclick = () => {
    const id = contextMenu.dataset.itemId;
    const item = allItems.find(i => i.id === id);
    if (item) openModal(item.type || 'anime', item.parentId || null, item);
    contextMenu.style.display = 'none';
};

contextMenu.querySelector('[data-action="open-children"]').onclick = () => {
    const id = contextMenu.dataset.itemId;
    const item = allItems.find(i => i.id === id);
    if (item) openItem(item);
    contextMenu.style.display = 'none';
};

contextMenu.querySelector('[data-action="delete"]').onclick = async () => {
    const id = contextMenu.dataset.itemId;
    const item = allItems.find(i => i.id === id);
    if (!item) return;

    const childrenCount = allItems.filter(i => i.parentId === id).length;
    const confirmMsg = childrenCount > 0
        ? `Удалить "${item.title}" и ВСЕ вложенные элементы (${childrenCount} шт.)?`
        : `Удалить "${item.title}"?`;

    if (confirm(confirmMsg)) {
        await deleteRecursive(id);
        toast('🗑️ Удалено');
        await loadAllItems();
        refreshView();
    }
    contextMenu.style.display = 'none';
};

async function deleteRecursive(id) {
    const children = allItems.filter(i => i.parentId === id);
    for (const child of children) {
        await deleteRecursive(child.id);
    }
    await remove(ref(db, `items/${id}`));
}

// ====== MODAL ======
function openModal(type, parentId = null, editItem = null) {
    $('form-id').value = editItem?.id || '';
    $('form-type').value = type;
    $('form-parent').value = parentId || '';
    $('form-title').value = editItem?.title || '';
    $('form-poster').value = editItem?.poster || '';
    $('form-url').value = editItem?.url || editItem?.videoUrl || '';
    $('form-year').value = editItem?.year || '2024';
    $('form-genre').value = editItem?.genre || '';
    $('form-desc').value = editItem?.description || '';
    $('form-episode-number').value = editItem?.episodeNumber || 1;

    // Настройка полей в зависимости от типа
    const groupUrl = $('group-url');
    const groupEpNum = $('group-epnum');
    const urlInput = $('form-url');

    if (type === 'series') {
        groupUrl.style.display = 'none';
        urlInput.removeAttribute('required');
        groupEpNum.style.display = 'none';
    } else if (type === 'season') {
        groupUrl.style.display = 'block';
        urlInput.setAttribute('required', 'required');
        groupEpNum.style.display = 'none';
    } else if (type === 'episode') {
        groupUrl.style.display = 'block';
        urlInput.setAttribute('required', 'required');
        groupEpNum.style.display = 'block';
    } else {
        groupUrl.style.display = 'block';
        urlInput.setAttribute('required', 'required');
        groupEpNum.style.display = 'none';
    }

    const titles = { anime: 'Аниме/Фильм', series: 'Сериал', season: 'Сезон', episode: 'Серия' };
    $('modal-title').textContent = editItem ? `✏️ Изменить ${titles[type]}` : `➕ Добавить ${titles[type]}`;
    $('btn-submit').textContent = editItem ? '💾 Сохранить изменения' : '➕ Добавить';

    modalOverlay.classList.add('active');
}

function closeModal() {
    modalOverlay.classList.remove('active');
}

$('modal-close').onclick = closeModal;
modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) closeModal();
};

// Сохранение формы
$('modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('form-id').value;
    const type = $('form-type').value;
    const parentId = $('form-parent').value || null;

    const data = {
        type: type,
        title: $('form-title').value.trim(),
        poster: $('form-poster').value.trim(),
        year: $('form-year').value.trim() || '2024',
        genre: $('form-genre').value.trim() || 'Аниме',
        description: $('form-desc').value.trim() || '',
        rating: 0,
        updatedAt: Date.now()
    };

    if (type !== 'series') {
        data.url = $('form-url').value.trim();
        if (!data.url) { alert('Введите ссылку на видео!'); return; }
    }

    if (type === 'episode') {
        data.episodeNumber = $('form-episode-number').value;
    }

    if (parentId) data.parentId = parentId;

    if (!data.title || !data.poster) {
        alert('Заполните название и постер!');
        return;
    }

    try {
        if (id) {
            // Обновление
            await update(ref(db, `items/${id}`), data);
            toast('✅ Обновлено!');
        } else {
            // Создание
            data.createdAt = Date.now();
            await set(push(ref(db, 'items')), data);
            toast('✅ Добавлено!');
        }
        closeModal();
        await loadAllItems();
        refreshView();
    } catch (err) {
        console.error(err);
        alert('Ошибка: ' + err.message);
    }
});

// ====== TOAST ======
function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => { t.style.display = 'none'; }, 2500);
}

// ====== SIDEBAR NAVIGATION ======
document.querySelectorAll('.sidebar-item[data-type]').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-item[data-type]').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentView = item.dataset.type;
        currentParentId = null;
        refreshView();
    });
});

$('sidebar-add-anime').onclick = () => openModal('anime');
$('sidebar-add-series').onclick = () => openModal('series');

// ====== REFRESH ======
$('btn-refresh').onclick = async () => {
    $('btn-refresh').style.transform = 'rotate(360deg)';
    await loadAllItems();
    refreshView();
    toast('🔄 Обновлено');
    setTimeout(() => { $('btn-refresh').style.transform = ''; }, 300);
};

// ====== ГЛОБАЛЬНЫЕ ФУНКЦИИ ======
window._navToSeries = () => {
    currentView = 'series';
    currentParentId = null;
    document.querySelectorAll('.sidebar-item[data-type]').forEach(i => i.classList.remove('active'));
    document.querySelector('.sidebar-item[data-type="series"]')?.classList.add('active');
    refreshView();
};

// ====== КЛАВИШИ ======
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (modalOverlay.classList.contains('active')) closeModal();
        contextMenu.style.display = 'none';
    }
    if (e.key === 'Delete' && selectedItems.size > 0) {
        if (confirm(`Удалить ${selectedItems.size} выбранных элементов?`)) {
            Promise.all([...selectedItems].map(id => deleteRecursive(id))).then(async () => {
                selectedItems.clear();
                await loadAllItems();
                refreshView();
                toast('🗑️ Удалено');
            });
        }
    }
});

// ====== HELPER ======
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
