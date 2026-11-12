(() => {
    const pages = document.getElementById('miuPages');
    const slides = Array.from(pages.children);
    const dots = Array.from(document.querySelectorAll('.miu-pagination button'));
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let currentPage = 0;

    function setCurrentPage(index) {
        currentPage = index;
        dots.forEach((dot, position) => {
            if (position === index) dot.setAttribute('aria-current', 'page');
            else dot.removeAttribute('aria-current');
        });
    }

    function goToPage(index, instant = false) {
        const target = Math.max(0, Math.min(index, slides.length - 1));
        pages.scrollTo({
            left: target * pages.clientWidth,
            behavior: instant || reducedMotion.matches ? 'instant' : 'smooth'
        });
    }

    dots.forEach((dot, index) => dot.addEventListener('click', () => goToPage(index)));
    pages.addEventListener('scroll', () => {
        if (pages.clientWidth) setCurrentPage(Math.round(pages.scrollLeft / pages.clientWidth));
    }, { passive: true });
    pages.addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        goToPage(currentPage + (event.key === 'ArrowLeft' ? -1 : 1));
    });
    let pageWidth = pages.clientWidth;
    new ResizeObserver(() => {
        if (pages.clientWidth === pageWidth) return;
        pageWidth = pages.clientWidth;
        goToPage(currentPage, true);
    }).observe(pages);

    document.querySelectorAll('.miu-home img').forEach(image => {
        const showFallback = () => image.classList.add('miu-image-failed');
        if (image.complete && !image.naturalWidth) showFallback();
        image.addEventListener('error', showFallback);
        image.addEventListener('load', () => image.classList.remove('miu-image-failed'));
    });

    const clock = document.getElementById('realTimeDisplay');
    const miniClock = document.querySelector('.miu-mini-clock time');
    const dateLabel = document.getElementById('realDateDisplay');
    const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    const monthFormat = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
    const calendarMonth = document.getElementById('miuCalendarMonth');
    const calendarDays = document.getElementById('miuCalendarDays');
    const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    let today = new Date();
    let displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    function renderCalendar() {
        const year = displayedMonth.getFullYear();
        const month = displayedMonth.getMonth();
        const firstColumn = (displayedMonth.getDay() + 6) % 7;
        const monthLength = new Date(year, month + 1, 0).getDate();
        const currentMonth = year === today.getFullYear() && month === today.getMonth();
        calendarMonth.textContent = monthFormat.format(displayedMonth).toUpperCase();
        calendarDays.replaceChildren();

        for (const weekday of weekdays) {
            const heading = document.createElement('span');
            heading.className = 'miu-weekday';
            heading.textContent = weekday;
            calendarDays.append(heading);
        }
        for (let day = 1 - firstColumn; day <= monthLength; day++) {
            const cell = document.createElement('span');
            if (day > 0) cell.textContent = day;
            if (currentMonth && day === today.getDate()) {
                cell.className = 'miu-today';
                cell.setAttribute('aria-current', 'date');
            }
            calendarDays.append(cell);
        }
    }

    function updateTime() {
        const now = new Date();
        const time = [now.getHours(), now.getMinutes()].map(value => String(value).padStart(2, '0')).join(':');
        if (clock.dateTime !== time) {
            for (const label of [clock, miniClock]) {
                label.dateTime = time;
                label.textContent = time;
            }
            dateLabel.textContent = dateFormat.format(now);
        }
        if (today.toDateString() !== now.toDateString()) {
            if (displayedMonth.getMonth() === today.getMonth() && displayedMonth.getFullYear() === today.getFullYear()) {
                displayedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            }
            today = now;
            dateLabel.textContent = dateFormat.format(now);
            renderCalendar();
        }
    }

    document.getElementById('miuPreviousMonth').addEventListener('click', () => {
        displayedMonth.setMonth(displayedMonth.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('miuNextMonth').addEventListener('click', () => {
        displayedMonth.setMonth(displayedMonth.getMonth() + 1);
        renderCalendar();
    });
    updateTime();
    renderCalendar();
    setInterval(updateTime, 1000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) updateTime();
    });

    const todos = Array.from(document.querySelectorAll('.miu-todos input'));
    const todoKey = 'miu-home-todos';
    try {
        const saved = JSON.parse(localStorage.getItem(todoKey));
        todos.forEach((item, index) => { item.checked = saved?.[index] === true; });
    } catch {
        // The checklist can still be used with storage disabled.
    }
    for (const item of todos) {
        item.addEventListener('change', () => {
            try {
                localStorage.setItem(todoKey, JSON.stringify(todos.map(todo => todo.checked)));
            } catch {
                // Keep the current checkboxes usable when storage is unavailable.
            }
        });
    }

    const play = document.getElementById('miuPlay');
    const playIcon = play.firstElementChild;
    const name = document.getElementById('miuTrackName');
    const artist = document.getElementById('miuTrackArtist');
    const elapsed = document.getElementById('miuTrackElapsed');
    const remaining = document.getElementById('miuTrackRemaining');
    const progress = document.getElementById('miuTrackProgress');

    function formatDuration(seconds) {
        return Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
    }

    function updatePlayer() {
        const track = musicPlaylist[currentMusicIndex];
        const playing = Boolean(track && !audioPlayer.paused && !audioPlayer.ended);
        const total = Number.isFinite(audioPlayer.duration) ? audioPlayer.duration : 0;
        const position = Math.min(audioPlayer.currentTime, total);
        name.textContent = track?.name || '未选择歌曲';
        artist.textContent = track ? track.artist || '未知歌手' : '播放列表';
        play.setAttribute('aria-label', playing ? '暂停' : '播放');
        playIcon.classList.toggle('fa-play', !playing);
        playIcon.classList.toggle('fa-pause', playing);
        elapsed.textContent = formatDuration(position);
        remaining.textContent = total ? '−' + formatDuration(total - position) : '–:––';
        progress.value = total ? position / total : 0;
    }

    play.addEventListener('click', () => {
        if (musicPlaylist.length) togglePlayback();
        else toggleMusicPanel(true);
    });
    for (const event of ['loadstart', 'loadedmetadata', 'durationchange', 'playing', 'pause', 'ended', 'timeupdate', 'emptied', 'error']) {
        audioPlayer.addEventListener(event, updatePlayer);
    }
    updatePlayer();
})();
