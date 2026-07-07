import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getDatabase, ref, get, set, push } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";
import { firebaseConfig } from './firebase.js';

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Глобальное состояние
let currentUser = null;
let allItems = [];
let currentItems = [];
let navigationStack = [];
let activeGridIndex = 0;
let appState = 'grid';
let activeMenuIndex = 0;
let infoTimeout = null;
let userRatings = {};
let COLS = window.innerWidth < 768 ? 3 : 6;

// DOM-элементы
const $ = id => document.getElementById(id);
const gridEl = $('grid');
const userAvatar = $('user-avatar');
const adminMenu = $('admin-menu');
const pageTitle = $('page-title');
const breadcrumbDiv = $('breadcrumb');
const searchBox = $('search-box');
const searchInput = $('search-input');
const playerDiv = $('player');
const videoFrame = $('video-frame');
const infoPanel = $('info-panel');
const menuItems = document.querySelectorAll('.menu-item');

// Обновление колонок при ресайзе
window.addEventListener('resize', () => {
    COLS = window.innerWidth < 768 ? 3 : 6;
    if (currentItems.length && appState === 'grid' && currentItems[0]?.type !== 'episode') {
        renderGrid();
    }
});

// ============ ЗАГРУЗКА ДАННЫХ ============
async function loadAllData() {
    try {
        const snap = await get(ref(db, 'items'));
        allItems = snap.exists() ? Object.entries(snap.val()).map(([id, v]) => ({ id, ...v })) : [];
        console.log(`📦 Загружено ${allItems.length} элементов`);
    } catch (e) {
        console.error('Ошибка загрузки:', e);
        allItems = [];
    }
}

async function loadUserRatings() {
    if (!currentUser) return;
    const snap = await get(ref(db, `ratings/${currentUser.uid}`));
    userRatings = snap.exists() ? snap.val() : {};
}

function getChildren(parentId) {
    return allItems.filter(i => i.parentId === parentId);
}

function getRootItems() {
    return allItems.filter(i => !i.parentId || i.parentId === 'root');
}

// ============ РЕНДЕР ============
function renderGrid() {
    if (!currentItems.length) {
        gridEl.innerHTML = '<div class="loading">📭 Ничего не найдено</div>';
        return;
    }

    // Список серий
    if (currentItems[0]?.type === 'episode') {
        gridEl.style.display = 'block';
        gridEl.innerHTML = '<div class="episodes-list"></div>';
        const cont = gridEl.querySelector('.episodes-list');
        currentItems.forEach((ep, i) => {
            const d = document.createElement('div');
            d.className = 'episode-item';
            d.onclick = () => openItem(ep, i);
            d.onmouseenter = () => { activeGridIndex = i; renderFocus(); };
            d.innerHTML = `
                <div class="episode-title">🎬 ${ep.episodeNumber || '?'}. ${ep.title || 'Без названия'}</div>
                <div class="episode-meta">${ep.duration || ''} ${ep.year ? '· ' + ep.year : ''}</div>`;
            cont.appendChild(d);
        });
        renderFocus();
        return;
    }

    // Грид карточек
    gridEl.style.display = 'grid';
    gridEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    gridEl.innerHTML = '';

    currentItems.forEach((item, i) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => openItem(item, i);
        card.onmouseenter = () => { activeGridIndex = i; renderFocus(); };

        let badge = '';
        if (item.type === 'studio') badge = '<div class="folder-badge">🏢 СТУДИЯ</div>';
        else if (item.type === 'series') badge = '<div class="folder-badge series">📺 СЕРИАЛ</div>';
        else if (item.type === 'season') badge = '<div class="folder-badge season">📁 СЕЗОН</div>';
        else if ((item.type === 'movie' || item.type === 'episode') && item.rating > 0)
            badge = `<div class="rating-badge"><span class="star-icon">⭐</span> ${Number(item.rating).toFixed(1)}</div>`;

        card.innerHTML = `${badge}<img src="${item.poster || 'https://via.placeholder.com/300x450/1a1a2e/a855f7?text=AnimeNya'}" referrerpolicy="no-referrer" onerror="this.src='https://via.placeholder.com/300x450/1a1a2e/a855f7?text=Error'">`;
        gridEl.appendChild(card);
    });
    renderFocus();
}

function renderFocus() {
    document.querySelectorAll('.card, .episode-item').forEach(e => e.classList.remove('focused'));
    menuItems.forEach(e => e.classList.remove('focused'));

    if (appState === 'menu') {
        if (menuItems[activeMenuIndex]) menuItems[activeMenuIndex].classList.add('focused');
    } else if (appState === 'grid' && currentItems.length) {
        const els = currentItems[0]?.type === 'episode'
            ? document.querySelectorAll('.episode-item')
            : document.querySelectorAll('.card');
        if (els[activeGridIndex]) {
            els[activeGridIndex].classList.add('focused');
            els[activeGridIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            showInfoPanel(currentItems[activeGridIndex]);
        }
    }
}

function showInfoPanel(item) {
    if (infoTimeout) clearTimeout(infoTimeout);
    $('info-title').innerText = item.title || 'Без названия';
    
    const typeMap = {
        studio: 'Студия',
        series: 'Сериал',
        season: 'Сезон',
        episode: `Серия ${item.episodeNumber || ''}`,
        movie: item.genre || 'Аниме'
    };
    
    $('info-meta').innerHTML = `${item.year || '----'} · ${typeMap[item.type] || ''}`;
    $('info-desc').innerText = item.description || 'Нет описания';

    const starsDiv = $('rating-stars');
    if (currentUser && (item.type === 'movie' || item.type === 'episode') && item.id) {
        starsDiv.style.display = 'flex';
        starsDiv.innerHTML = '';
        const ur = userRatings[item.id] || 0;
        for (let i = 1; i <= 10; i++) {
            const s = document.createElement('span');
            s.className = 'star' + (i <= ur ? ' active' : '');
            s.innerHTML = i <= ur ? '★' : '☆';
            s.onclick = e => { e.stopPropagation(); rateItem(item.id, i); };
            starsDiv.appendChild(s);
        }
    } else {
        starsDiv.style.display = 'none';
    }

    infoPanel.classList.add('visible');
    infoTimeout = setTimeout(() => infoPanel.classList.remove('visible'), 6000);
}

async function rateItem(itemId, rating) {
    if (!currentUser) {
        alert('🔑 Войдите в аккаунт, чтобы оценивать!');
        return;
    }
    try {
        await set(ref(db, `ratings/${currentUser.uid}/${itemId}`), rating);
        userRatings[itemId] = rating;

        const snap = await get(ref(db, 'ratings'));
        let total = 0, count = 0;
        if (snap.exists()) {
            for (const uid in snap.val()) {
                if (snap.val()[uid][itemId]) {
                    total += snap.val()[uid][itemId];
                    count++;
                }
            }
        }
        const avg = count ? total / count : 0;
        await set(ref(db, `items/${itemId}/rating`), avg);

        const idx = allItems.findIndex(i => i.id === itemId);
        if (idx !== -1) allItems[idx].rating = avg;
        const cidx = currentItems.findIndex(i => i.id === itemId);
        if (cidx !== -1) currentItems[cidx].rating = avg;

        renderGrid();
        showInfoPanel(currentItems[activeGridIndex] || allItems[idx]);
    } catch (e) {
        console.error('Ошибка оценки:', e);
    }
}

// ============ ОТКРЫТИЕ ============
async function openItem(item, index) {
    // Папки
    if (item.type === 'studio' || item.type === 'series' || item.type === 'season') {
        navigationStack.push({
            parentId: item.id,
            title: item.title,
            items: [...currentItems],
            scrollIndex: activeGridIndex
        });
        updateBreadcrumb();
        currentItems = getChildren(item.id);
        pageTitle.innerText = item.title;
        searchBox.style.display = 'none';
        activeGridIndex = 0;
        appState = 'grid';
        renderGrid();
        return;
    }

    // Видео
    if (item.type === 'movie' || item.type === 'episode') {
        if (!currentUser) {
            alert('🔑 Войдите в аккаунт для просмотра!');
            window.location.href = 'login.html';
            return;
        }
        await saveToHistory(item.id, item.title);
        openIframePlayer(item.url, item.title);
    }
}

function openIframePlayer(videoUrl, title) {
    let embedUrl = videoUrl;
    
    // Конвертация ссылок VK Video
    if (videoUrl && videoUrl.includes('vk.com/video') && !videoUrl.includes('video_ext.php')) {
        const match = videoUrl.match(/video[_-]?(\d+)[_-](\d+)/);
        if (match) {
            embedUrl = `https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2&autoplay=1&z=video`;
        }
    }
    
    // Добавление параметров к embed
    if (embedUrl && embedUrl.includes('video_ext.php')) {
        const urlParams = new URLSearchParams(embedUrl.split('?')[1]);
        const oid = urlParams.get('oid');
        const id = urlParams.get('id');
        if (oid && id) {
            embedUrl = `https://vk.com/video_ext.php?oid=${oid}&id=${id}&hd=2&autoplay=1&z=video`;
        }
    }

    console.log('▶️ Открытие:', embedUrl);
    videoFrame.src = embedUrl || '';
    playerDiv.style.display = 'block';
    appState = 'player';
}

function closePlayer() {
    videoFrame.src = 'about:blank';
    playerDiv.style.display = 'none';
    appState = 'grid';
    renderFocus();
}

async function saveToHistory(id, title) {
    try {
        const historyRef = ref(db, `history/${currentUser.uid}`);
        await set(push(historyRef), {
            movieId: id,
            movieTitle: title,
            timestamp: Date.now()
        });
    } catch (e) {
        console.error('Ошибка истории:', e);
    }
}

// ============ НАВИГАЦИЯ ============
function updateBreadcrumb() {
    if (!navigationStack.length) {
        breadcrumbDiv.innerHTML = '';
        return;
    }
    let html = '<span class="back-btn" onclick="window.goBack()">← Назад</span> ';
    navigationStack.forEach((nav, idx) => {
        html += `<span onclick="window.goToLevel(${idx})">${nav.title}</span>`;
        if (idx < navigationStack.length - 1) html += ' / ';
    });
    breadcrumbDiv.innerHTML = html;
}

window.goBack = function() {
    if (navigationStack.length) {
        const last = navigationStack.pop();
        currentItems = last.items;
        pageTitle.innerText = last.title;
        activeGridIndex = last.scrollIndex || 0;
        updateBreadcrumb();
        appState = 'grid';
        renderGrid();
    } else {
        navigateToHome();
    }
};

window.goToLevel = function(level) {
    while (navigationStack.length > level + 1) navigationStack.pop();
    if (navigationStack.length) {
        const current = navigationStack[navigationStack.length - 1];
        currentItems = current.items;
        pageTitle.innerText = current.title;
        activeGridIndex = current.scrollIndex || 0;
        updateBreadcrumb();
        appState = 'grid';
        renderGrid();
    } else {
        navigateToHome();
    }
};

async function navigateToHome() {
    navigationStack = [];
    updateBreadcrumb();
    pageTitle.innerText = '🏢 Студии';
    searchBox.style.display = 'block';
    currentItems = getRootItems();
    activeGridIndex = 0;
    appState = 'grid';
    renderGrid();
}

async function navigateToHistory() {
    if (!currentUser) {
        alert('Войдите в аккаунт');
        return;
    }
    navigationStack = [];
    updateBreadcrumb();
    try {
        const snap = await get(ref(db, `history/${currentUser.uid}`));
        const historyItems = [];
        if (snap.exists()) {
            const arr = Object.values(snap.val()).sort((a, b) => b.timestamp - a.timestamp);
            for (const h of arr.slice(0, 50)) {
                const found = allItems.find(i => i.id === h.movieId);
                if (found) historyItems.push(found);
            }
        }
        currentItems = historyItems;
        pageTitle.innerText = '🕒 История просмотров';
        searchBox.style.display = 'none';
        renderGrid();
    } catch (e) {
        gridEl.innerHTML = '<div class="loading">Ошибка загрузки</div>';
    }
}

function navigateToKids() {
    navigationStack = [];
    updateBreadcrumb();
    currentItems = allItems.filter(i =>
        (i.type === 'movie' || i.type === 'episode') &&
        (i.forKids === true || i.genre === 'Мультфильм' || i.genre === 'Семейный' || i.genre === 'Кодомо')
    );
    pageTitle.innerText = '👶 Детям';
    searchBox.style.display = 'none';
    renderGrid();
}

function navigateToGenres() {
    navigationStack = [];
    updateBreadcrumb();
    const movies = allItems.filter(i => i.type === 'movie' || i.type === 'episode');
    const genres = [...new Set(movies.map(m => m.genre).filter(g => g))];
    gridEl.innerHTML = genres.map(g => `
        <div class="card" style="aspect-ratio:auto; padding:24px; text-align:center; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:8px;"
             onclick="window.navigateToGenre('${g.replace(/'/g, "\\'")}')">
            <span style="font-size:40px;">🎬</span>
            <strong>${g}</strong>
        </div>
    `).join('');
    pageTitle.innerText = '🎭 Жанры';
    searchBox.style.display = 'none';
    currentItems = [];
}

window.navigateToGenre = function(genre) {
    navigationStack = [];
    updateBreadcrumb();
    currentItems = allItems.filter(i => (i.type === 'movie' || i.type === 'episode') && i.genre === genre);
    pageTitle.innerText = `🎭 ${genre}`;
    searchBox.style.display = 'block';
    renderGrid();
};

// Поиск
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
        navigateToHome();
        return;
    }
    const content = allItems.filter(i => i.type === 'movie' || i.type === 'episode' || i.type === 'series');
    currentItems = content.filter(i =>
        i.title?.toLowerCase().includes(query) ||
        i.genre?.toLowerCase().includes(query) ||
        i.description?.toLowerCase().includes(query)
    );
    pageTitle.innerText = `🔍 Результаты: "${query}"`;
    activeGridIndex = 0;
    renderGrid();
});

// ============ КЛАВИАТУРА ============
document.addEventListener('keydown', (e) => {
    const key = e.key;

    // В плеере
    if (playerDiv.style.display === 'block') {
        if (key === 'Escape' || key === 'Backspace') {
            e.preventDefault();
            closePlayer();
        }
        return;
    }

    // В поиске
    if (document.activeElement === searchInput) {
        if (key === 'ArrowDown' && currentItems.length) {
            searchInput.blur();
            appState = 'grid';
            activeGridIndex = 0;
            renderFocus();
        }
        if (key === 'Escape') searchInput.blur();
        return;
    }

    // В меню
    if (appState === 'menu') {
        if (key === 'ArrowUp') { e.preventDefault(); activeMenuIndex = (activeMenuIndex - 1 + menuItems.length) % menuItems.length; renderFocus(); }
        else if (key === 'ArrowDown') { e.preventDefault(); activeMenuIndex = (activeMenuIndex + 1) % menuItems.length; renderFocus(); }
        else if (key === 'ArrowRight') { e.preventDefault(); if (currentItems.length) { appState = 'grid'; activeGridIndex = 0; renderFocus(); } }
        else if (key === 'Enter') {
            const nav = menuItems[activeMenuIndex].dataset.nav;
            handleMenuNavigation(nav);
        }
    }
    // В гриде
    else if (appState === 'grid' && currentItems.length) {
        const total = currentItems.length;
        const isEpisodes = currentItems[0]?.type === 'episode';

        if (key === 'ArrowRight') {
            e.preventDefault();
            if (!isEpisodes && activeGridIndex + 1 < total) activeGridIndex++;
            renderFocus();
        } else if (key === 'ArrowLeft') {
            e.preventDefault();
            if (!isEpisodes && activeGridIndex > 0) activeGridIndex--;
            else if (!isEpisodes && activeGridIndex === 0) { appState = 'menu'; activeMenuIndex = 0; renderFocus(); }
            renderFocus();
        } else if (key === 'ArrowDown') {
            e.preventDefault();
            if (isEpisodes) { if (activeGridIndex + 1 < total) activeGridIndex++; }
            else { let next = activeGridIndex + COLS; if (next < total) activeGridIndex = next; }
            renderFocus();
        } else if (key === 'ArrowUp') {
            e.preventDefault();
            if (isEpisodes) { if (activeGridIndex > 0) activeGridIndex--; else searchInput.focus(); }
            else { let prev = activeGridIndex - COLS; if (prev >= 0) activeGridIndex = prev; else searchInput.focus(); }
            renderFocus();
        } else if (key === 'Enter') {
            e.preventDefault();
            openItem(currentItems[activeGridIndex], activeGridIndex);
        } else if (key === 'Backspace' || key === 'Escape') {
            e.preventDefault();
            window.goBack();
        }
    }
});

function handleMenuNavigation(nav) {
    switch (nav) {
        case 'home': navigateToHome(); break;
        case 'history': navigateToHistory(); break;
        case 'kids': navigateToKids(); break;
        case 'genres': navigateToGenres(); break;
        case 'admin': window.location.href = 'admin.html'; break;
    }
}

// Клики по меню
menuItems.forEach(el => {
    el.addEventListener('click', () => handleMenuNavigation(el.dataset.nav));
});

// Кнопка пользователя
userAvatar.onclick = () => {
    if (!currentUser) {
        window.location.href = 'login.html';
    } else if (confirm('Выйти из аккаунта?')) {
        signOut(auth).then(() => window.location.reload());
    }
};

// Глобальные функции
window.closePlayer = closePlayer;
window.goBack = window.goBack;
window.goToLevel = window.goToLevel;
window.navigateToGenre = window.navigateToGenre;

// ============ АВТОРИЗАЦИЯ ============
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const displayName = user.email ? user.email.split('@')[0].slice(0, 15) : 'User';
        userAvatar.innerHTML = `👤 ${displayName}`;

        const userRef = ref(db, `users/${user.uid}/isAdmin`);
        const snap = await get(userRef);
        if (snap.val() === true) {
            adminMenu.style.display = 'flex';
        }

        await loadUserRatings();
        await loadAllData();
        navigateToHome();
    } else {
        currentUser = null;
        userAvatar.innerHTML = '🔑 Войти';
        adminMenu.style.display = 'none';
        userRatings = {};
        await loadAllData();
        navigateToHome();
    }
});
