import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getDatabase, ref, get, set, push } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";
import { firebaseConfig } from './firebase.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ====== STATE ======
let currentUser = null;
let allAnime = [];
let userRatings = {};
let currentModalItem = null;

// ====== DOM ======
const $ = id => document.getElementById(id);
const navbar = $('navbar');
const heroImg = $('hero-img');
const heroTitle = $('hero-title');
const heroYear = $('hero-year');
const heroRating = $('hero-rating');
const heroGenre = $('hero-genre');
const heroDesc = $('hero-desc');
const mainContent = $('main-content');
const searchOverlay = $('search-overlay');
const searchInput = $('search-input');
const searchResults = $('search-results');
const modalOverlay = $('modal-overlay');
const playerOverlay = $('player-overlay');
const playerFrame = $('player-frame');
const btnUser = $('btn-user');
const btnAdmin = $('btn-admin');

// ====== SCROLL NAVBAR ======
window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
});

// ====== LOAD DATA ======
async function loadAllAnime() {
    const snap = await get(ref(db, 'items'));
    if (snap.exists()) {
        const obj = snap.val();
        allAnime = Object.entries(obj)
            .map(([id, v]) => ({ id, ...v }))
            .filter(item => item.type === 'anime' || item.type === 'movie' || item.type === 'episode');
    } else {
        allAnime = [];
    }
}

async function loadUserRatings() {
    if (!currentUser) { userRatings = {}; return; }
    const snap = await get(ref(db, `ratings/${currentUser.uid}`));
    userRatings = snap.exists() ? snap.val() : {};
}

// ====== RENDER ======
function renderHero() {
    if (!allAnime.length) return;
    const featured = allAnime
        .filter(a => a.rating > 0)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0] || allAnime[0];

    heroImg.src = featured.poster || 'https://via.placeholder.com/1920x800/1a1a2e/a855f7?text=AnimeNya';
    heroTitle.textContent = featured.title || 'Без названия';
    heroYear.textContent = featured.year || '2024';
    heroRating.textContent = `⭐ ${Number(featured.rating || 0).toFixed(1)}`;
    heroGenre.textContent = featured.genre || 'Аниме';
    heroDesc.textContent = featured.description || 'Описание отсутствует';

    $('btn-hero-play').onclick = () => playAnime(featured);
    $('btn-hero-info').onclick = () => openModal(featured);
    $('hero-badge').textContent = featured.rating > 8 ? '🌟 ТОП АНИМЕ' : featured.rating > 5 ? '🔥 ПОПУЛЯРНОЕ' : '🆕 НОВИНКА';
}

function renderSections() {
    if (!allAnime.length) {
        mainContent.innerHTML = '<div style="text-align:center;padding:60px;color:#888;">Нет контента. Добавьте аниме через админ-панель.</div>';
        return;
    }

    const popular = [...allAnime].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 12);
    const newest = [...allAnime].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 12);
    const genres = [...new Set(allAnime.map(a => a.genre).filter(Boolean))];

    let html = '';

    // Популярное
    if (popular.length) {
        html += `
            <div class="section">
                <div class="section-header">
                    <h3 class="section-title">🔥 Популярное</h3>
                    <a href="#" class="section-link" data-nav="popular">Смотреть все →</a>
                </div>
                <div class="row">${popular.map(a => renderCard(a)).join('')}</div>
            </div>`;
    }

    // Новинки
    if (newest.length) {
        html += `
            <div class="section">
                <div class="section-header">
                    <h3 class="section-title">🆕 Новинки</h3>
                    <a href="#" class="section-link" data-nav="new">Смотреть все →</a>
                </div>
                <div class="row">${newest.map(a => renderCard(a)).join('')}</div>
            </div>`;
    }

    // По жанрам (первые 4 жанра)
    genres.slice(0, 4).forEach(genre => {
        const items = allAnime.filter(a => a.genre === genre).slice(0, 12);
        if (!items.length) return;
        html += `
            <div class="section">
                <div class="section-header">
                    <h3 class="section-title">🎭 ${genre}</h3>
                    <a href="#" class="section-link" data-genre="${genre}">Смотреть все →</a>
                </div>
                <div class="row">${items.map(a => renderCard(a)).join('')}</div>
            </div>`;
    });

    mainContent.innerHTML = html;
}

function renderCard(anime) {
    const rating = Number(anime.rating || 0);
    return `
        <div class="card-item" data-id="${anime.id}">
            <div class="card-poster" onclick="window._openModalById('${anime.id}')">
                <img src="${anime.poster || 'https://via.placeholder.com/300x450/1a1a2e/a855f7?text=Nya'}" 
                     alt="${anime.title}" 
                     loading="lazy"
                     onerror="this.src='https://via.placeholder.com/300x450/1a1a2e/a855f7?text=Error'">
                <div class="card-overlay">
                    <div class="card-play-btn" onclick="event.stopPropagation(); window._playById('${anime.id}')">▶</div>
                </div>
                ${rating > 0 ? `<div class="card-rating"><span class="star">⭐</span> ${rating.toFixed(1)}</div>` : ''}
            </div>
            <div class="card-title">${anime.title || 'Без названия'}</div>
            <div class="card-meta">${anime.year || ''} · ${anime.genre || 'Аниме'}</div>
        </div>`;
}

// ====== MODAL ======
function openModal(anime) {
    currentModalItem = anime;
    $('modal-img').src = anime.poster || '';
    $('modal-title').textContent = anime.title || '';
    $('modal-year').textContent = anime.year || '----';
    $('modal-rating').textContent = `⭐ ${Number(anime.rating || 0).toFixed(1)}`;
    $('modal-genre').textContent = anime.genre || 'Аниме';
    $('modal-desc').textContent = anime.description || 'Описание отсутствует';

    // Звёзды
    const starsDiv = $('modal-stars');
    starsDiv.innerHTML = '';
    if (currentUser) {
        const ur = userRatings[anime.id] || 0;
        for (let i = 1; i <= 10; i++) {
            const star = document.createElement('button');
            star.className = 'star-btn' + (i <= ur ? ' active' : '');
            star.textContent = i <= ur ? '★' : '☆';
            star.onclick = () => rateAnime(anime.id, i);
            starsDiv.appendChild(star);
        }
    } else {
        starsDiv.innerHTML = '<span style="color:#888;font-size:13px;">Войдите, чтобы оценивать</span>';
    }

    $('btn-modal-play').onclick = () => { closeModal(); playAnime(anime); };
    modalOverlay.classList.add('active');
}

function closeModal() {
    modalOverlay.classList.remove('active');
    currentModalItem = null;
}

// ====== RATING ======
async function rateAnime(itemId, rating) {
    if (!currentUser) { alert('Войдите в аккаунт!'); return; }
    try {
        await set(ref(db, `ratings/${currentUser.uid}/${itemId}`), rating);
        userRatings[itemId] = rating;

        const snap = await get(ref(db, 'ratings'));
        let total = 0, count = 0;
        if (snap.exists()) {
            for (const uid in snap.val()) {
                if (snap.val()[uid][itemId]) { total += snap.val()[uid][itemId]; count++; }
            }
        }
        const avg = count ? total / count : 0;
        await set(ref(db, `items/${itemId}/rating`), avg);
        const idx = allAnime.findIndex(a => a.id === itemId);
        if (idx !== -1) allAnime[idx].rating = avg;
        if (currentModalItem?.id === itemId) {
            currentModalItem.rating = avg;
            $('modal-rating').textContent = `⭐ ${avg.toFixed(1)}`;
        }
        // Перерендер звёзд
        openModal(currentModalItem || allAnime[idx]);
        renderHero();
        renderSections();
    } catch (e) { console.error(e); }
}

// ====== PLAYER ======
function playAnime(anime) {
    if (!currentUser) {
        alert('Войдите в аккаунт для просмотра!');
        window.location.href = 'login.html';
        return;
    }
    saveToHistory(anime.id, anime.title);
    let url = anime.url || anime.videoUrl || '';
    if (url && url.includes('vk.com/video') && !url.includes('video_ext.php')) {
        const m = url.match(/video[_-]?(\d+)[_-](\d+)/);
        if (m) url = `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2&autoplay=1`;
    }
    playerFrame.src = url;
    playerOverlay.classList.add('active');
}

async function saveToHistory(id, title) {
    try {
        await set(push(ref(db, `history/${currentUser.uid}`)), {
            movieId: id,
            movieTitle: title,
            timestamp: Date.now()
        });
    } catch (e) { console.error(e); }
}

// ====== SEARCH ======
let searchTimeout;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const q = searchInput.value.toLowerCase().trim();
        if (!q) { searchResults.innerHTML = ''; return; }
        const results = allAnime.filter(a =>
            a.title?.toLowerCase().includes(q) ||
            a.genre?.toLowerCase().includes(q) ||
            a.description?.toLowerCase().includes(q)
        ).slice(0, 10);
        searchResults.innerHTML = results.map(a => `
            <div class="search-result-item" onclick="window._openModalById('${a.id}'); document.getElementById('search-overlay').classList.remove('active');">
                <img src="${a.poster || 'https://via.placeholder.com/50x70/1a1a2e/a855f7'}" onerror="this.src='https://via.placeholder.com/50x70/1a1a2e/a855f7'">
                <div class="search-result-info">
                    <div class="srt">${a.title}</div>
                    <div class="srm">${a.year || ''} · ⭐ ${Number(a.rating||0).toFixed(1)} · ${a.genre || ''}</div>
                </div>
            </div>
        `).join('');
    }, 300);
});

// ====== EVENT LISTENERS ======
$('btn-search').onclick = () => {
    searchOverlay.classList.toggle('active');
    if (searchOverlay.classList.contains('active')) {
        setTimeout(() => searchInput.focus(), 100);
    } else {
        searchInput.value = '';
        searchResults.innerHTML = '';
    }
};

$('modal-close').onclick = closeModal;
$('.modal-close-btn')?.addEventListener('click', closeModal);
modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeModal(); };
searchOverlay.onclick = (e) => {
    if (e.target === searchOverlay) {
        searchOverlay.classList.remove('active');
        searchInput.value = '';
        searchResults.innerHTML = '';
    }
};

$('player-close').onclick = () => {
    playerFrame.src = '';
    playerOverlay.classList.remove('active');
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (playerOverlay.classList.contains('active')) {
            playerFrame.src = '';
            playerOverlay.classList.remove('active');
        } else if (modalOverlay.classList.contains('active')) {
            closeModal();
        } else if (searchOverlay.classList.contains('active')) {
            searchOverlay.classList.remove('active');
            searchInput.value = '';
            searchResults.innerHTML = '';
        }
    }
});

// Nav links
document.querySelectorAll('.nav-links a, .section-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
        const navLink = document.querySelector(`.nav-links a[data-nav="${link.dataset.nav || link.dataset.genre}"]`);
        if (navLink) navLink.classList.add('active');

        const genre = link.dataset.genre;
        if (genre) {
            const items = allAnime.filter(a => a.genre === genre);
            mainContent.innerHTML = `
                <div class="section" style="padding:0 60px;">
                    <div class="section-header">
                        <h3 class="section-title">🎭 ${genre}</h3>
                    </div>
                    <div class="row" style="flex-wrap:wrap;gap:16px;">${items.map(a => renderCard(a)).join('')}</div>
                </div>`;
            window.scrollTo({ top: 300, behavior: 'smooth' });
        } else if (link.dataset.nav === 'popular') {
            const items = [...allAnime].sort((a, b) => (b.rating || 0) - (a.rating || 0));
            renderFilteredSection('🔥 Популярное', items);
        } else if (link.dataset.nav === 'new') {
            const items = [...allAnime].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            renderFilteredSection('🆕 Новинки', items);
        } else if (link.dataset.nav === 'home') {
            renderSections();
            renderHero();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
});

function renderFilteredSection(title, items) {
    mainContent.innerHTML = `
        <div class="section" style="padding:0 60px;">
            <div class="section-header">
                <h3 class="section-title">${title}</h3>
            </div>
            <div class="row" style="flex-wrap:wrap;gap:16px;">${items.map(a => renderCard(a)).join('')}</div>
        </div>`;
    window.scrollTo({ top: 300, behavior: 'smooth' });
}

btnUser.onclick = () => {
    if (!currentUser) window.location.href = 'login.html';
    else if (confirm('Выйти?')) signOut(auth).then(() => window.location.reload());
};

btnAdmin.onclick = () => window.location.href = 'admin.html';

// Глобальные хелперы для onclick в HTML
window._openModalById = (id) => {
    const anime = allAnime.find(a => a.id === id);
    if (anime) openModal(anime);
};
window._playById = (id) => {
    const anime = allAnime.find(a => a.id === id);
    if (anime) playAnime(anime);
};

// ====== AUTH ======
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        btnUser.innerHTML = `👤 ${(user.email || 'User').split('@')[0].slice(0, 12)}`;
        const snap = await get(ref(db, `users/${user.uid}/isAdmin`));
        if (snap.val() === true) btnAdmin.style.display = 'block';
        await loadUserRatings();
    } else {
        currentUser = null;
        btnUser.innerHTML = '🔑 Войти';
        btnAdmin.style.display = 'none';
        userRatings = {};
    }
    await loadAllAnime();
    renderHero();
    renderSections();
});
