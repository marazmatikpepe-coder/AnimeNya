import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getDatabase, ref, push, set, get, remove } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";
import { firebaseConfig } from './firebase.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let allItems = [];
let currentSeasonId = null;
let currentSeasonType = null;

const $ = id => document.getElementById(id);

// Проверка прав
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    const snap = await get(ref(db, `users/${user.uid}/isAdmin`));
    if (snap.val() !== true) {
        alert('⛔ Нет прав администратора');
        window.location.href = 'index.html';
        return;
    }
    await loadAllItems();
    refreshAllLists();
});

async function loadAllItems() {
    const snap = await get(ref(db, 'items'));
    allItems = snap.exists() ? Object.entries(snap.val()).map(([id, v]) => ({ id, ...v })) : [];
}

async function refreshAllLists() {
    await loadAllItems();
    loadSelects();
    renderList('studios-list', 'studio', 'СТУДИЯ', 'type-studio');
    renderList('series-list', 'series', 'СЕРИАЛ', 'type-series');
    renderSeasonsList();
    renderList('movies-list', 'movie', 'ФИЛЬМ', 'type-movie');
    renderAllItemsList();
    loadEpisodeSeasonSelect();
}

function loadSelects() {
    const studios = allItems.filter(i => i.type === 'studio');
    const series = allItems.filter(i => i.type === 'series');

    ['series-parent', 'movie-parent'].forEach(id => {
        const sel = $(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Выберите студию --</option>';
        studios.forEach(s => { sel.innerHTML += `<option value="${s.id}">${s.title}</option>`; });
    });

    const seasonSel = $('season-parent');
    if (seasonSel) {
        seasonSel.innerHTML = '<option value="">-- Выберите сериал --</option>';
        series.forEach(s => { seasonSel.innerHTML += `<option value="${s.id}">${s.title}</option>`; });
    }
}

function renderList(containerId, type, typeName, typeClass) {
    const container = $(containerId);
    if (!container) return;
    const items = allItems.filter(i => i.type === type);
    if (!items.length) {
        container.innerHTML = '<div class="loading">📭 Нет элементов</div>';
        return;
    }
    container.innerHTML = items.map(item => {
        let parentName = '';
        if (item.parentId) {
            const parent = allItems.find(i => i.id === item.parentId);
            if (parent) parentName = `${parent.title} · `;
        }
        return `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-title">${item.title} <span class="folder-badge ${typeClass}" style="position:static;display:inline-block;margin-left:8px;">${typeName}</span></div>
                    <div class="item-meta">${parentName}${item.year || ''}</div>
                </div>
                <button class="delete-btn" data-id="${item.id}">🗑️</button>
            </div>`;
    }).join('');
    addDeleteHandlers();
}

function renderSeasonsList() {
    const container = $('seasons-list');
    if (!container) return;
    const items = allItems.filter(i => i.type === 'season');
    if (!items.length) {
        container.innerHTML = '<div class="loading">📭 Нет сезонов</div>';
        return;
    }
    container.innerHTML = items.map(item => {
        const parent = allItems.find(i => i.id === item.parentId);
        const typeBadge = item.seasonType === 'timeline'
            ? '<span style="background:#00bcd4;padding:2px 8px;border-radius:4px;font-size:10px;margin-left:6px;">📊 Таймкодный</span>'
            : '<span style="background:#ff9800;padding:2px 8px;border-radius:4px;font-size:10px;margin-left:6px;">📁 Раздельный</span>';
        return `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-title">${item.title} <span class="folder-badge season" style="position:static;display:inline-block;margin-left:8px;">СЕЗОН</span> ${typeBadge}</div>
                    <div class="item-meta">${parent?.title || ''} · ${item.year || ''}</div>
                </div>
                <button class="delete-btn" data-id="${item.id}">🗑️</button>
            </div>`;
    }).join('');
    addDeleteHandlers();
}

function renderAllItemsList() {
    const container = $('all-items-list');
    if (!container) return;
    if (!allItems.length) {
        container.innerHTML = '<div class="loading">📭 Нет элементов</div>';
        return;
    }
    const order = { studio: 1, series: 2, season: 3, episode: 4, movie: 5 };
    const sorted = [...allItems].sort((a, b) => (order[a.type] || 99) - (order[b.type] || 99));
    const typeMap = {
        studio: ['type-studio', 'СТУДИЯ'],
        series: ['type-series', 'СЕРИАЛ'],
        season: ['type-season', 'СЕЗОН'],
        episode: ['type-episode', 'СЕРИЯ'],
        movie: ['type-movie', 'ФИЛЬМ']
    };
    container.innerHTML = sorted.map(item => {
        const [cls, name] = typeMap[item.type] || ['', item.type];
        return `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-title">${item.title} <span class="folder-badge ${cls}" style="position:static;display:inline-block;margin-left:8px;">${name}</span></div>
                    <div class="item-meta">${item.year || ''}</div>
                </div>
                <button class="delete-btn" data-id="${item.id}">🗑️</button>
            </div>`;
    }).join('');
    addDeleteHandlers();
}

function addDeleteHandlers() {
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('Удалить элемент и всё содержимое?')) {
                await deleteItemAndChildren(btn.dataset.id);
                await refreshAllLists();
                showMessage('✅ Удалено');
            }
        };
    });
}

async function deleteItemAndChildren(id) {
    const children = allItems.filter(i => i.parentId === id);
    for (const child of children) await deleteItemAndChildren(child.id);
    await remove(ref(db, `items/${id}`));
}

function showMessage(msg) {
    const msgDiv = $('message');
    if (!msgDiv) return;
    msgDiv.textContent = msg;
    msgDiv.style.display = 'block';
    setTimeout(() => { msgDiv.style.display = 'none'; }, 2500);
}

// Формы добавления
$('studio-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = {
        type: 'studio',
        title: $('studio-title').value.trim(),
        poster: $('studio-poster').value.trim(),
        year: $('studio-year').value.trim(),
        description: $('studio-desc').value.trim(),
        createdAt: Date.now()
    };
    if (!item.title || !item.poster) { alert('Заполните название и постер'); return; }
    await set(push(ref(db, 'items')), item);
    showMessage('✅ Студия добавлена');
    e.target.reset();
    await refreshAllLists();
});

$('series-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const parentId = $('series-parent').value;
    if (!parentId) { alert('Выберите студию'); return; }
    const item = {
        type: 'series',
        parentId,
        title: $('series-title').value.trim(),
        poster: $('series-poster').value.trim(),
        year: $('series-year').value.trim(),
        description: $('series-desc').value.trim(),
        createdAt: Date.now()
    };
    if (!item.title || !item.poster) { alert('Заполните название и постер'); return; }
    await set(push(ref(db, 'items')), item);
    showMessage('✅ Сериал добавлен');
    e.target.reset();
    await refreshAllLists();
});

$('season-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const parentId = $('season-parent').value;
    if (!parentId) { alert('Выберите сериал'); return; }
    const seasonType = document.querySelector('input[name="season-type"]:checked')?.value || 'timeline';
    const item = {
        type: 'season',
        parentId,
        seasonType,
        title: $('season-title').value.trim(),
        poster: $('season-poster').value.trim(),
        year: $('season-year').value.trim(),
        description: $('season-desc').value.trim(),
        createdAt: Date.now()
    };
    if (seasonType === 'timeline') {
        const url = $('season-video-url').value.trim();
        if (!url) { alert('Укажите ссылку на видео'); return; }
        item.videoUrl = url;
    }
    if (!item.title || !item.poster) { alert('Заполните поля'); return; }
    await set(push(ref(db, 'items')), item);
    showMessage('✅ Сезон добавлен');
    e.target.reset();
    await refreshAllLists();
});

$('episode-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentSeasonId) { alert('Выберите сезон'); return; }
    const item = {
        type: 'episode',
        parentId: currentSeasonId,
        title: $('episode-title').value.trim(),
        episodeNumber: $('episode-number').value.trim(),
        duration: $('episode-duration').value.trim(),
        year: $('episode-year').value.trim() || '2024',
        genre: $('episode-genre').value.trim() || 'Аниме',
        rating: 0,
        createdAt: Date.now()
    };
    if (currentSeasonType === 'timeline') {
        const start = parseInt($('episode-start').value) || 0;
        const end = parseInt($('episode-end').value) || 0;
        if (end <= start) { alert('Конец должен быть больше начала'); return; }
        item.startTime = start;
        item.endTime = end;
    } else {
        const url = $('episode-url').value.trim();
        if (!url) { alert('Введите ссылку на видео'); return; }
        item.url = url;
    }
    if (!item.title || !item.episodeNumber) { alert('Заполните поля'); return; }
    await set(push(ref(db, 'items')), item);
    showMessage('✅ Серия добавлена');
    e.target.reset();
    await refreshAllLists();
    if (currentSeasonId) await loadEpisodesForSeason(currentSeasonId);
});

$('movie-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const parentId = $('movie-parent').value;
    if (!parentId) { alert('Выберите студию'); return; }
    const item = {
        type: 'movie',
        parentId,
        title: $('movie-title').value.trim(),
        poster: $('movie-poster').value.trim(),
        url: $('movie-url').value.trim(),
        year: $('movie-year').value.trim() || '2024',
        genre: $('movie-genre').value.trim() || 'Аниме',
        description: $('movie-desc').value.trim() || 'Без описания',
        forKids: $('movie-forKids')?.checked || false,
        rating: 0,
        createdAt: Date.now()
    };
    if (!item.title || !item.poster || !item.url) { alert('Заполните поля'); return; }
    await set(push(ref(db, 'items')), item);
    showMessage('✅ Фильм добавлен');
    e.target.reset();
    await refreshAllLists();
});

// Табы
document.querySelectorAll('.tab-btn')?.forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        $(`tab-${btn.dataset.tab}`)?.classList.add('active');
    });
});

// Радио-кнопки типа сезона
document.querySelector('input[value="timeline"]')?.addEventListener('change', () => {
    const g = $('timeline-url-group');
    if (g) g.style.display = 'block';
});
document.querySelector('input[value="separate"]')?.addEventListener('change', () => {
    const g = $('timeline-url-group');
    if (g) g.style.display = 'none';
});

function loadEpisodeSeasonSelect() {
    const select = $('episode-season-select');
    if (!select) return;
    const seasons = allItems.filter(i => i.type === 'season');
    select.innerHTML = '<option value="">-- Выберите сезон --</option>';
    seasons.forEach(s => {
        const parent = allItems.find(i => i.id === s.parentId);
        const typeText = s.seasonType === 'timeline' ? '📊 Таймкодный' : '📁 Раздельный';
        select.innerHTML += `<option value="${s.id}" data-type="${s.seasonType || 'timeline'}">${parent?.title || ''} / ${s.title} (${typeText})</option>`;
    });
    select.onchange = async () => {
        currentSeasonId = select.value;
        if (currentSeasonId) {
            currentSeasonType = select.options[select.selectedIndex].dataset.type || 'timeline';
            $('season-info').style.display = 'block';
            $('season-type-display').innerHTML = currentSeasonType === 'timeline'
                ? '📊 Таймкодный (один файл + таймкоды)'
                : '📁 Раздельный (отдельные видео)';
            $('episode-add-form').style.display = 'block';
            $('timeline-fields').style.display = currentSeasonType === 'timeline' ? 'block' : 'none';
            $('separate-fields').style.display = currentSeasonType === 'separate' ? 'block' : 'none';
            await loadEpisodesForSeason(currentSeasonId);
        } else {
            $('episode-add-form').style.display = 'none';
            $('episodes-list').innerHTML = '<div class="loading">Выберите сезон</div>';
            $('season-info').style.display = 'none';
        }
    };
}

async function loadEpisodesForSeason(seasonId) {
    const container = $('episodes-list');
    if (!container) return;
    const episodes = allItems.filter(i => i.type === 'episode' && i.parentId === seasonId);
    const season = allItems.find(i => i.id === seasonId);
    if (!episodes.length) {
        container.innerHTML = '<div class="loading">📭 Нет серий</div>';
        return;
    }
    episodes.sort((a, b) => (parseInt(a.episodeNumber) || 0) - (parseInt(b.episodeNumber) || 0));
    const isTimeline = season?.seasonType === 'timeline';
    container.innerHTML = episodes.map(ep => {
        if (isTimeline) {
            const startStr = formatTime(ep.startTime || 0);
            const endStr = formatTime(ep.endTime || 0);
            return `<div class="item-card">
                <div class="item-info">
                    <div class="item-title">${ep.episodeNumber}. ${ep.title}</div>
                    <div class="item-meta">⏱ ${startStr} - ${endStr}</div>
                </div>
                <button class="delete-btn" data-id="${ep.id}">🗑️</button>
            </div>`;
        }
        return `<div class="item-card">
            <div class="item-info">
                <div class="item-title">${ep.episodeNumber}. ${ep.title}</div>
                <div class="item-meta">🎬 ${ep.url ? 'Видео загружено' : 'Нет видео'}</div>
            </div>
            <button class="delete-btn" data-id="${ep.id}">🗑️</button>
        </div>`;
    }).join('');
    addDeleteHandlers();
}

function formatTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
