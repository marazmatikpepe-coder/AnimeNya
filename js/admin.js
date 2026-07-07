<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Админ — AnimeNya</title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <div class="admin-page">
        <h1>⚙️ Админ-панель AnimeNya</h1>

        <div class="tabs">
            <div class="tab active">🎬 Аниме</div>
        </div>

        <form id="anime-form" class="admin-form">
            <div class="form-group"><label>Название *</label><input type="text" id="anime-title" required></div>
            <div class="form-group"><label>Постер (URL) *</label><input type="url" id="anime-poster" required></div>
            <div class="form-group"><label>Ссылка на видео *</label><input type="url" id="anime-url" required placeholder="https://vk.com/video_ext.php?oid=..."></div>
            <div class="form-group"><label>Год</label><input type="text" id="anime-year" value="2024"></div>
            <div class="form-group"><label>Жанр</label><input type="text" id="anime-genre" value="Аниме" placeholder="Сёнэн, Романтика..."></div>
            <div class="form-group"><label>Описание</label><textarea id="anime-desc" rows="3"></textarea></div>
            <button type="submit" class="btn-submit">➕ Добавить аниме</button>
        </form>

        <div class="item-list" id="anime-list" style="margin-top:30px;">
            <div style="color:#888;">Загрузка...</div>
        </div>

        <div style="text-align:center;margin-top:30px;">
            <a href="index.html" style="color:#888;text-decoration:none;">← На главную</a>
        </div>
    </div>

    <div class="toast" id="toast"></div>

    <script type="module" src="js/admin.js"></script>
</body>
</html>
