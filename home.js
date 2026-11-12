(() => {
    // Older Android shortcuts may still be running with the standalone manifest.
    if (/Android/i.test(navigator.userAgent) && matchMedia('(display-mode: standalone)').matches &&
        document.fullscreenEnabled && document.documentElement.requestFullscreen) {
        const fullscreenOnInteraction = event => {
            if (!event.isTrusted || navigator.userActivation?.isActive === false) return;
            document.removeEventListener('pointerup', fullscreenOnInteraction, true);
            document.removeEventListener('keydown', fullscreenOnInteraction, true);
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
            }
        };
        document.addEventListener('pointerup', fullscreenOnInteraction, true);
        document.addEventListener('keydown', fullscreenOnInteraction, true);
    }

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
            item, icon: event.target.closest('[data-home-edit-icon], [data-home-pick-image]'), field: event.target.closest('[data-home-text]'), startX: point.clientX, startY: point.clientY,
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
        if (commit && !state.moved) {
            const field = state.field || state.item.querySelector('[data-home-text]');
            if (state.icon) openIconMenu(state.icon);
            else if (field) openEditor(field);
        }
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
    home.addEventListener('contextmenu', event => {
        if (event.target.closest('[data-home-item]')) event.preventDefault();
        const icon = event.target.closest('[data-home-edit-icon]');
        const field = event.target.closest('[data-home-text]');
        if (!gesture && (icon || field)) {
            event.stopPropagation();
            if (icon) openIconMenu(icon);
            else openEditor(field);
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

    const editor = document.getElementById('miuEditor');
    const editorTitle = document.getElementById('miuEditorTitle');
    const photoOptions = document.getElementById('miuEditorPhoto');
    const editorPreview = document.getElementById('miuEditorPreview');
    const editorClear = document.getElementById('miuEditorClear');
    const editorReset = document.getElementById('miuEditorReset');
    const editorRow = document.getElementById('miuEditorInputRow');
    const editorInput = document.getElementById('miuEditorInput');
    const editorFile = document.getElementById('miuEditorFile');
    const editorError = document.getElementById('miuEditorError');
    const textKey = 'miu-home-text-v1';
    const defaults = new WeakMap();
    const customText = new Map();
    let editing;

    try {
        for (const [key, value] of Object.entries(JSON.parse(localStorage.getItem(textKey)) || {})) {
            if (typeof value === 'string') customText.set(key, value);
        }
    } catch {
        // Desktop editing still works with storage disabled.
    }

    function renderText(field, original) {
        defaults.set(field, original);
        const text = customText.get(field.dataset.homeText) ?? original;
        field.textContent = text;
        if (field.hasAttribute('data-home-percent')) {
            document.getElementById('miuMemoProgress').value = Number.parseFloat(text);
        }
    }

    function registerText(field) {
        if (!field.closest('[data-home-launch-label]')) {
            field.tabIndex = 0;
            field.setAttribute('role', 'button');
        }
        renderText(field, field.textContent);
    }
    home.querySelectorAll('[data-home-text]').forEach(registerText);

    function positionEditor() {
        if (!editing) return;
        const rect = editing.anchor.getBoundingClientRect();
        const viewport = window.visualViewport;
        const leftEdge = viewport?.offsetLeft ?? 0;
        const topEdge = viewport?.offsetTop ?? 0;
        const width = viewport?.width ?? document.documentElement.clientWidth;
        const height = viewport?.height ?? document.documentElement.clientHeight;
        const left = Math.max(leftEdge + 8, Math.min(rect.left, leftEdge + width - editor.offsetWidth - 8));
        const below = rect.bottom + 7;
        const proposed = below + editor.offsetHeight < topEdge + height - 8 ? below : rect.top - editor.offsetHeight - 7;
        const top = Math.max(topEdge + 8, Math.min(proposed, topEdge + height - editor.offsetHeight - 8));
        editor.style.left = left + 'px';
        editor.style.top = top + 'px';
    }

    function closeEditor(restoreFocus = false) {
        const anchor = editing?.anchor;
        editing = undefined;
        editor.hidden = true;
        editorPreview.removeAttribute('src');
        if (restoreFocus) anchor?.focus({ preventScroll: true });
    }

    function openEditor(anchor, image = null) {
        const field = image ? null : anchor;
        const isPercent = field?.hasAttribute('data-home-percent');
        editing = { anchor, image, field, isPercent, url: false };
        editorTitle.textContent = image ? '更换图片' : '修改内容';
        editorInput.type = isPercent ? 'number' : 'text';
        editorInput.min = isPercent ? '0' : '';
        editorInput.max = isPercent ? '100' : '';
        editorInput.value = field ? (isPercent ? Number.parseFloat(field.textContent) : field.textContent) : '';
        editorInput.placeholder = '输入内容';
        editorInput.required = Boolean(isPercent);
        editorRow.hidden = Boolean(image);
        photoOptions.hidden = !image;
        const src = image?.getAttribute('src');
        editorPreview.hidden = !src;
        if (src) editorPreview.src = src;
        else editorPreview.removeAttribute('src');
        editorClear.hidden = !src;
        editorReset.hidden = !field;
        editorError.textContent = '';
        editor.hidden = false;
        positionEditor();
        if (field) editorInput.focus({ preventScroll: true });
    }

    function openIconMenu(anchor) {
        const image = anchor.querySelector('img');
        if (image) openEditor(anchor, image);
    }

    function saveText(state, reset = false) {
        const { field, isPercent } = state;
        const original = defaults.get(field) ?? '';
        const value = reset ? original : isPercent ? editorInput.value + '%' : editorInput.value;
        if (field.hasAttribute('data-home-legacy')) {
            field.textContent = value;
            saveData();
        } else {
            if (reset) customText.delete(field.dataset.homeText);
            else customText.set(field.dataset.homeText, value);
            renderText(field, original);
            try {
                localStorage.setItem(textKey, JSON.stringify(Object.fromEntries(customText)));
            } catch {
                // Keep the current edit usable for this session.
            }
        }
        closeEditor(true);
    }

    function saveImage(state, src) {
        if (editing !== state) return;
        if (src) {
            handleImageUpdate(src, state.image);
        } else {
            state.image.removeAttribute('src');
            saveData();
        }
        closeEditor(true);
    }

    async function validateImage(state, src, attempt) {
        if (editing !== state || state.imageAttempt !== attempt) return;
        editorError.textContent = '正在检查图片…';
        positionEditor();
        const candidate = new Image();
        let timeout;
        try {
            candidate.src = src;
            const timeLimit = new Promise((_, reject) => {
                timeout = setTimeout(reject, 12000);
            });
            await Promise.race([candidate.decode(), timeLimit]);
            if (state.imageAttempt === attempt) saveImage(state, src);
        } catch {
            if (editing === state && state.imageAttempt === attempt) {
                editorError.textContent = '图片加载失败，请检查链接或换一张图。';
                positionEditor();
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    editor.addEventListener('click', event => {
        const action = event.target.closest('[data-editor-action]')?.dataset.editorAction;
        if (!editing || !action) return;
        switch (action) {
            case 'close': closeEditor(true); break;
            case 'file': editorFile.click(); break;
            case 'url':
                editing.url = true;
                editorInput.type = 'url';
                editorInput.required = true;
                editorInput.placeholder = 'https://';
                editorInput.value = /^https?:/i.test(editing.image.src) ? editing.image.src : '';
                editorRow.hidden = false;
                positionEditor();
                editorInput.focus({ preventScroll: true });
                break;
            case 'clear': saveImage(editing, ''); break;
            case 'reset': saveText(editing, true); break;
        }
    });

    editor.addEventListener('submit', event => {
        event.preventDefault();
        if (!editing) return;
        if (editing.field) {
            saveText(editing);
        } else if (editing.url) {
            const attempt = editing.imageAttempt = Symbol();
            const src = editorInput.value.trim();
            if (!/^https?:\/\//i.test(src)) {
                editorError.textContent = '请输入 http 或 https 图片链接。';
                positionEditor();
                return;
            }
            validateImage(editing, src, attempt);
        }
    });

    editorFile.addEventListener('change', () => {
        const state = editing;
        const file = editorFile.files[0];
        editorFile.value = '';
        if (!state?.image || !file) return;
        const attempt = state.imageAttempt = Symbol();
        const reader = new FileReader();
        reader.addEventListener('load', () => validateImage(state, reader.result, attempt));
        reader.addEventListener('error', () => {
            if (editing === state && state.imageAttempt === attempt) {
                editorError.textContent = '图片读取失败。';
                positionEditor();
            }
        });
        reader.readAsDataURL(file);
    });

    home.addEventListener('click', event => {
        const photo = event.target.closest('[data-home-pick-image]');
        const targetId = event.target.closest('[data-home-edit-target]')?.dataset.homeEditTarget;
        const field = targetId ? document.getElementById(targetId) : event.target.closest('[data-home-text]');
        if (!photo && (!field || field.closest('[data-home-launch-label]'))) return;
        event.preventDefault();
        if (photo) openIconMenu(photo);
        else openEditor(field);
    });

    home.addEventListener('keydown', event => {
        const field = event.target.closest('[data-home-text]');
        if (!field || field.closest('[data-home-launch-label]') || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        openEditor(field);
    });
    document.addEventListener('pointerdown', event => {
        if (editing && !editor.contains(event.target)) closeEditor();
    });
    document.addEventListener('keydown', event => {
        if (editing && event.key === 'Escape') {
            event.preventDefault();
            closeEditor(true);
        }
    });
    window.addEventListener('resize', positionEditor);
    window.visualViewport?.addEventListener('resize', positionEditor);
    window.visualViewport?.addEventListener('scroll', positionEditor);
    pages.addEventListener('scroll', () => closeEditor(), { passive: true });

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
    const memoDate = document.getElementById('miuMemoDate');
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
        renderText(calendarMonth, monthFormat.format(displayedMonth).toUpperCase());
        calendarDays.replaceChildren();

        weekdays.forEach((weekday, index) => {
            const heading = document.createElement('span');
            heading.className = 'miu-weekday';
            heading.textContent = weekday;
            heading.dataset.homeText = 'calendar-weekday-' + index;
            registerText(heading);
            calendarDays.append(heading);
        });
        for (let day = 1 - firstColumn; day <= monthLength; day++) {
            const cell = document.createElement('span');
            if (day > 0) {
                cell.textContent = day;
                cell.dataset.homeText = 'calendar-day-' + year + '-' + month + '-' + day;
                registerText(cell);
            }
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
            for (const label of [clock, miniClock, weekTime]) {
                label.dateTime = time;
                renderText(label, time);
            }
            renderText(dateLabel, formatClockDate(now));
            memoDate.dateTime = clock.dateTime;
            renderText(memoDate, memoDateFormat.format(now) + '　' + time);
        }
        if (today.toDateString() !== now.toDateString()) {
            if (displayedMonth.getMonth() === today.getMonth() && displayedMonth.getFullYear() === today.getFullYear()) {
                displayedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            }
            today = now;
            renderText(dateLabel, formatClockDate(now));
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
})();
