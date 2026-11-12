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

    const home = pages.closest('.miu-home');
    const sheets = slides.map(slide => slide.querySelector('.miu-sheet'));
    const dock = home.querySelector('.miu-dock');
    const items = new Map(sheets.flatMap(sheet => Array.from(sheet.children, item => [item.dataset.homeItem, item])));
    const layoutKey = 'miu-home-layout-v2';

    function setColumn(item, column) {
        if (item.classList.contains('miu-app')) {
            item.style.setProperty('--column', String(Math.max(1, Math.min(column, 4))));
        } else if (item.classList.contains('camera-widget')) {
            item.style.setProperty('--column', String(Math.max(1, Math.min(column, 3))));
        }
    }

    function getColumn(item) {
        return Number(item.style.getPropertyValue('--column')) || 1;
    }

    try {
        const saved = JSON.parse(localStorage.getItem(layoutKey));
        if (Array.isArray(saved)) {
            const restored = new Set();
            saved.forEach((entries, index) => {
                const zone = sheets[index];
                if (!zone || !Array.isArray(entries)) return;
                entries.forEach(entry => {
                    if (!Array.isArray(entry)) return;
                    const [id, col] = entry;
                    const item = items.get(id);
                    if (!item || restored.has(id)) return;
                    restored.add(id);
                    setColumn(item, Number.isInteger(col) ? col : getColumn(item));
                    zone.append(item);
                });
            });
            if (!restored.has('dock-forum')) {
                const firstSheet = sheets[0];
                const books = items.get('books');
                const duo = items.get('duo');
                const next = books?.parentElement === firstSheet ? books : duo?.parentElement === firstSheet ? duo : null;
                firstSheet.insertBefore(items.get('dock-forum'), next);
            }
        }
    } catch {
        // The default DOM order is usable when storage is unavailable.
    }

    function saveLayout() {
        const layout = sheets.map(zone => Array.from(zone.children, item => [item.dataset.homeItem, getColumn(item)]));
        try {
            localStorage.setItem(layoutKey, JSON.stringify(layout));
        } catch {
            // Keep the current arrangement usable for this session.
        }
    }

    let gesture;
    let suppressClickUntil = 0;

    function beginGesture(event, point) {
        if (gesture) return;
        const item = event.target.closest('[data-home-item]');
        if (!item || !home.contains(item)) return;
        suppressClickUntil = 0;
        const rect = item.getBoundingClientRect();
        const state = {
            item, icon: event.target.closest('[data-home-edit-icon]'), startX: point.clientX, startY: point.clientY,
            x: point.clientX, y: point.clientY,
            offsetX: point.clientX - rect.left, offsetY: point.clientY - rect.top,
            edge: 0, edgeAt: 0
        };
        gesture = state;
        state.hold = setTimeout(() => {
            if (gesture !== state) return;
            state.held = true;
            if (item.parentElement === dock) return;
            const preview = item.cloneNode(true);
            preview.removeAttribute('id');
            preview.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
            preview.removeAttribute('data-home-item');
            preview.classList.add('miu-drag-preview');
            preview.setAttribute('aria-hidden', 'true');
            preview.inert = true;
            preview.style.width = rect.width + 'px';
            preview.style.height = rect.height + 'px';
            item.classList.add('miu-drag-source');
            home.append(preview);
            state.preview = preview;
            paintGesture(state);
            state.scroll = setInterval(() => updateDragScroll(state), 40);
        }, 420);
    }

    function findDrop(state) {
        const hit = document.elementFromPoint(state.x, state.y);
        const dotIndex = dots.indexOf(hit);
        if (dotIndex >= 0) return { zone: sheets[dotIndex], dot: hit, column: getColumn(state.item) };
        if (!hit || !home.contains(hit)) return null;

        const isApp = state.item.classList.contains('miu-app');
        const zone = sheets[slides.indexOf(hit.closest('.miu-page'))];
        if (!zone) return null;

        const candidates = Array.from(zone.children).filter(item => item !== state.item);
        const target = hit.closest('[data-home-item]');
        const bounds = zone.getBoundingClientRect();
        const style = getComputedStyle(zone);
        const left = bounds.left + parseFloat(style.paddingLeft);
        const width = bounds.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const column = Math.max(1, Math.min(4, Math.floor((state.x - left) / (width / 4)) + 1));

        if (target && target !== state.item && target.parentElement === zone) {
            const targetRect = target.getBoundingClientRect();
            const targetIsApp = target.classList.contains('miu-app');
            const sameSize = isApp === targetIsApp &&
                state.item.classList.contains('camera-widget') === target.classList.contains('camera-widget');
            if (sameSize) return { zone, target, swap: true, column };
            return { zone, target, before: state.y < targetRect.top + targetRect.height / 2 ? target : target.nextElementSibling, column };
        }
        if (target === state.item) return null;

        const before = candidates.find(item => {
            const rect = item.getBoundingClientRect();
            return state.y < rect.top || (state.y < rect.bottom && state.x < rect.left + rect.width / 2);
        });
        return { zone, before, target: before, column };
    }

    function paintGesture(state) {
        state.preview.style.transform = 'translate3d(' + (state.x - state.offsetX) + 'px,' + (state.y - state.offsetY) + 'px,0)';
        const drop = findDrop(state);
        const highlight = drop?.dot || drop?.target || drop?.zone;
        if (highlight !== state.highlight) {
            state.highlight?.classList.remove('miu-drop-target', 'miu-drop-page');
            highlight?.classList.add(drop?.dot ? 'miu-drop-page' : 'miu-drop-target');
            state.highlight = highlight;
        }
        return drop;
    }

    function updateDragScroll(state) {
        const area = pages.getBoundingClientRect();
        const now = performance.now();
        if (state.y < area.top || state.y > area.bottom) return;
        const edge = state.x < area.left + 23 ? -1 : state.x > area.right - 23 ? 1 : 0;
        if (edge !== state.edge) {
            state.edge = edge;
            state.edgeAt = now;
        }
        if (edge && now - state.edgeAt > 520 && currentPage + edge >= 0 && currentPage + edge < slides.length) {
            goToPage(currentPage + edge, true);
            state.edgeAt = now + 350;
            paintGesture(state);
            return;
        }
        const slide = slides[currentPage];
        if (state.y < area.top + 36) slide.scrollTop -= 10;
        if (state.y > area.bottom - 36) slide.scrollTop += 10;
    }

    function moveGesture(event, point) {
        if (!gesture) return;
        const state = gesture;
        state.x = point.clientX;
        state.y = point.clientY;
        const moved = Math.hypot(state.x - state.startX, state.y - state.startY) > 8;
        state.moved ||= moved;
        if (!state.preview && moved && !state.held) {
            finishGesture(false);
        } else if (state.preview) {
            if (event.cancelable) event.preventDefault();
            paintGesture(state);
        }
    }

    function finishGesture(commit) {
        if (!gesture) return;
        const state = gesture;
        gesture = undefined;
        clearTimeout(state.hold);
        clearInterval(state.scroll);
        if (!state.held) return;
        suppressClickUntil = performance.now() + 500;
        if (commit && !state.moved && state.icon) openIconMenu(state.icon);
        if (!state.preview) return;
        const drop = commit && state.moved ? findDrop(state) : null;
        state.item.classList.remove('miu-drag-source');
        state.highlight?.classList.remove('miu-drop-target', 'miu-drop-page');
        state.preview.remove();
        if (!drop) return;

        if (drop.swap) {
            const marker = document.createComment('');
            const column = getColumn(state.item);
            state.item.replaceWith(marker);
            drop.target.replaceWith(state.item);
            marker.replaceWith(drop.target);
            setColumn(state.item, getColumn(drop.target));
            setColumn(drop.target, column);
        } else {
            drop.zone.insertBefore(state.item, drop.before || null);
            setColumn(state.item, drop.column);
        }
        if (drop.dot) goToPage(sheets.indexOf(drop.zone), true);
        saveLayout();
    }

    home.addEventListener('touchstart', event => {
        if (event.touches.length === 1) beginGesture(event, event.touches[0]);
        else finishGesture(false);
    }, { passive: true });
    document.addEventListener('touchmove', event => {
        if (event.touches.length === 1) moveGesture(event, event.touches[0]);
    }, { passive: false });
    document.addEventListener('touchend', () => finishGesture(true), { passive: true });
    document.addEventListener('touchcancel', () => finishGesture(false), { passive: true });
    home.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button === 0) beginGesture(event, event);
    });
    document.addEventListener('pointermove', event => {
        if (event.pointerType === 'mouse') moveGesture(event, event);
    });
    document.addEventListener('pointerup', event => {
        if (event.pointerType === 'mouse') finishGesture(true);
    });
    document.addEventListener('pointercancel', event => {
        if (event.pointerType === 'mouse') finishGesture(false);
    });
    window.addEventListener('blur', () => finishGesture(false));
    function openIconMenu(icon) {
        showMenu({ currentTarget: icon, detail: 0, stopPropagation() {} }, 'home');
    }

    home.addEventListener('contextmenu', event => {
        if (event.target.closest('[data-home-item]')) event.preventDefault();
        const icon = event.target.closest('[data-home-edit-icon]');
        if (icon && !gesture) {
            event.stopPropagation();
            openIconMenu(icon);
        }
    });
    home.addEventListener('click', event => {
        if (performance.now() >= suppressClickUntil) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);

    document.querySelectorAll('.miu-home img').forEach(image => {
        const showFallback = () => image.classList.add('miu-image-failed');
        if (image.complete && !image.naturalWidth) showFallback();
        image.addEventListener('error', showFallback);
        image.addEventListener('load', () => image.classList.remove('miu-image-failed'));
    });

    const clock = document.getElementById('realTimeDisplay');
    const miniClock = document.querySelector('.miu-mini-clock time');
    const dateLabel = document.getElementById('realDateDisplay');
    const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
    const lunarFormat = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' });
    const lunarDays = '一二三四五六七八九十';

    function formatClockDate(date) {
        const solar = dateFormat.format(date);
        const parts = Object.fromEntries(lunarFormat.formatToParts(date).map(part => [part.type, part.value]));
        const day = Number(parts.day);
        if (!parts.yearName || !parts.month || day < 1 || day > 30 || !Number.isInteger(day)) return solar;
        const lunarDay = day <= 10 ? '初' + lunarDays[day - 1] : day === 20 ? '二十' :
            day === 30 ? '三十' : (day < 20 ? '十' : '廿') + lunarDays[day % 10 - 1];
        return solar + ' · ' + parts.yearName + '年' + parts.month + lunarDay;
    }
    const monthFormat = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
    const weekTime = document.getElementById('miuWeekTime');
    const weekDate = document.getElementById('miuWeekDate');
    const weekDays = document.getElementById('miuWeekDays');
    const memoDate = document.getElementById('miuMemoDate');
    const memoPercent = document.getElementById('miuMemoPercent');
    const memoProgress = document.getElementById('miuMemoProgress');
    const chipDateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });
    const memoDateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
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

    function renderWeek() {
        weekDate.textContent = dateFormat.format(today);
        weekDays.replaceChildren();
        ['昨天', '今天', '明天'].forEach((label, index) => {
            const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + index - 1);
            const chip = document.createElement('span');
            chip.textContent = label + ' ' + chipDateFormat.format(day);
            if (index === 1) chip.setAttribute('aria-current', 'date');
            weekDays.append(chip);
        });
    }

    function updateTime() {
        const now = new Date();
        const time = [now.getHours(), now.getMinutes()].map(value => String(value).padStart(2, '0')).join(':');
        if (clock.dateTime !== time) {
            for (const label of [clock, miniClock, weekTime]) {
                label.dateTime = time;
                label.textContent = time;
            }
            dateLabel.textContent = formatClockDate(now);
            memoDate.dateTime = clock.dateTime;
            memoDate.textContent = memoDateFormat.format(now) + '　' + time;
            const minutes = now.getHours() * 60 + now.getMinutes();
            memoProgress.value = minutes;
            memoPercent.textContent = Math.floor(minutes * 100 / memoProgress.max) + '%';
        }
        if (today.toDateString() !== now.toDateString()) {
            if (displayedMonth.getMonth() === today.getMonth() && displayedMonth.getFullYear() === today.getFullYear()) {
                displayedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            }
            today = now;
            dateLabel.textContent = formatClockDate(now);
            renderCalendar();
            renderWeek();
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
    renderWeek();
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
})();
