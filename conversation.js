'use strict';

function toggleInboxOptions(force) {
    const menu = document.getElementById('inbox-options');
    const open = typeof force === 'boolean' ? force : menu.hidden;
    menu.hidden = !open;
    document.getElementById('inbox-options-button').setAttribute('aria-expanded', String(open));
}

function switchInboxTab(index) {
    toggleInboxOptions(false);
    switchAppTab(index);
}

function toggleInboxEdit(button) {
    const active = document.getElementById('view-messages').classList.toggle('inbox-editing');
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? '完成' : '编辑';
}

function openInboxConversation(key) {
    const id = chatList.find(chat => String(chat.id) === String(key))?.id;
    if (id == null) return;
    if (document.getElementById('view-messages').classList.contains('inbox-editing')) {
        editChat(id);
    } else {
        openChatRoom(id);
    }
}

function inboxAvatarMarkup(chat) {
    const initial = MiuApi.escapeHtml(Array.from(chat.name || '聊天')[0]);
    const avatar = chat.avatar ? `<img src="${MiuApi.escapeHtml(chat.avatar)}" alt="" loading="lazy" onerror="this.hidden=true">` : '';
    return `<span class="inbox-avatar" aria-hidden="true"><b>${initial}</b>${avatar}</span>`;
}

function populateConversationContact(doc, chat) {
    const name = chat?.name || '聊天';
    doc.getElementById('roomTitle').textContent = name;
    doc.getElementById('conversation-initial').textContent = Array.from(name)[0];
    const avatar = doc.getElementById('conversation-avatar');
    avatar.onerror = () => { avatar.hidden = true; };
    updateConversationPalette(doc.getElementById('chatRoom'));
    avatar.hidden = !chat?.avatar;
    if (chat?.avatar) avatar.src = chat.avatar;
    else avatar.removeAttribute('src');
}

const conversationWallpapers = new WeakMap();

function updateConversationPalette(room) {
    const background = room.style.backgroundImage;
    if (conversationWallpapers.get(room) === background) return;
    conversationWallpapers.set(room, background);
    const source = background.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
    room.toggleAttribute('data-wallpaper', !!source);
    delete room.dataset.tone;
    if (!source) return;

    const picture = new Image();
    picture.onload = () => {
        if (conversationWallpapers.get(room) !== background) return;
        const square = document.createElement('canvas');
        square.width = square.height = 12;
        const context = square.getContext('2d', {willReadFrequently: true});
        try {
            context.drawImage(picture, 0, 0, 12, 12);
            const pixels = context.getImageData(0, 0, 12, 12).data;
            let sum = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                sum += pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
            }
            if (sum / 144 < 118) room.dataset.tone = 'dark';
        } catch {
            // External wallpaper hosts may prevent sampling the pixels.
        }
    };
    picture.src = source;
}

function conversationTransferMarkup(message) {
    const outgoing = message.transferBy === 'me';
    const status = {
        received: outgoing ? '对方已收款' : '已收款',
        refunded: '已退还'
    }[message.status] || (outgoing ? '待对方收款' : '待收款');
    const note = String(message.note || '').trim();
    return `<button type="button" class="conversation-payment transfer-card" onclick="handleTransferClick(${Number(message.id)}, event)">
        <span class="payment-head"><i class="fas fa-exchange-alt" aria-hidden="true"></i><span>转账</span></span>
        <strong class="payment-amount">¥${MiuApi.escapeHtml(message.amount)}</strong>
        ${note ? `<span class="payment-note">${MiuApi.escapeHtml(note)}</span>` : ''}
        <span class="payment-status">${status}<i class="fas fa-chevron-right" aria-hidden="true"></i></span>
    </button>`;
}

function conversationImageNodes(text, owner = document) {
    const template = owner.createElement('template');
    template.innerHTML = text || '';
    return [...template.content.querySelectorAll('img.album-msg-img, img.photo-msg-img')].filter(img => {
        const source = img.getAttribute('src') || '';
        return /^(?:https?:\/\/|data:image\/(?:jpeg|png|webp|gif|avif|bmp|heic|heif);base64,)/i.test(source);
    });
}

function conversationVisionImages(text) {
    return conversationImageNodes(text)
        .filter(image => image.classList.contains('album-msg-img'))
        .map(image => image.getAttribute('src'));
}

async function readConversationPhoto(file) {
    if (!file.type.startsWith('image/')) throw new Error('Expected an image');
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.85);
    } finally {
        URL.revokeObjectURL(url);
    }
}

function conversationPhotoCard(message, doc) {
    const images = conversationImageNodes(message.text, doc);
    if (!images.length) return null;
    const card = doc.createElement('div');
    card.className = 'conversation-photo';
    const stack = images.length > 1 || images[0].classList.contains('photo-msg-img');
    if (stack) card.classList.add('photo-stack');

    const deck = doc.createElement('div');
    deck.className = 'photo-deck';
    card.append(deck);

    const description = images[0].classList.contains('photo-msg-img') && images[0].dataset.desc;
    const covers = ['photo-cover-1.webp', 'photo-cover-2.webp', 'photo-cover-3.webp'];
    const coverIndex = Math.abs(Number(message.timestamp || message.id) || 0) % covers.length;
    images.forEach((source, index) => {
        const frame = doc.createElement('button');
        frame.type = 'button';
        frame.className = 'photo-frame';
        frame.dataset.photoIndex = String(index);
        frame.setAttribute('aria-label', description ? '展开照片内容' : `查看照片 ${index + 1}`);
        const picture = doc.createElement('img');
        picture.src = description ? covers[coverIndex] : source.getAttribute('src');
        picture.alt = '照片';
        picture.draggable = false;
        if (index) picture.loading = 'lazy';
        frame.append(picture);
        if (description) {
            frame.setAttribute('aria-expanded', 'false');
            const copy = doc.createElement('span');
            copy.className = 'photo-description';
            copy.textContent = description;
            copy.hidden = true;
            frame.append(copy);
        }
        deck.append(frame);
    });
    if (stack) {
        const label = doc.createElement('button');
        label.type = 'button';
        label.className = 'photo-stack-label';
        label.setAttribute('aria-expanded', 'false');
        label.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1 1h6v6H1zm8 0h6v6H9zM1 9h6v6H1zm8 0h6v6H9z"/></svg> ${images.length} 张照片`;
        card.append(label);
        setConversationPhotoIndex(card, 0);
    }
    if (!message.isSelf && !description) {
        const download = doc.createElement('button');
        download.type = 'button';
        download.className = 'conversation-glass photo-save';
        download.setAttribute('aria-label', '保存当前照片');
        download.innerHTML = '<i class="fas fa-arrow-down" aria-hidden="true"></i>';
        card.append(download);
    }
    return card;
}

function measureConversationPhoto(picture) {
    const card = picture.closest('.conversation-photo');
    if (!card || !picture.naturalWidth || !picture.naturalHeight) return;
    const ratio = picture.naturalWidth / picture.naturalHeight;
    const frame = picture.closest('.photo-frame');
    frame.style.setProperty('--image-ratio', String(ratio));
    if (!card.classList.contains('photo-stack')) {
        card.style.setProperty('--single-photo-width', ratio > 1 ? '164px' : '176px');
    }
    if (frame.hasAttribute('data-front')) {
        card.style.setProperty('--front-ratio', String(Math.max(.6, Math.min(1.6, ratio))));
        card.style.setProperty('--photo-front-width', ratio > 1 ? '166px' : '184px');
    }
}

function refreshConversationPhotos(history) {
    for (const wave of history.querySelectorAll('.voice-bubble .voice-animate-icon')) {
        const pattern = [6, 12, 17, 9, 21, 33, 25, 13, 7, 17, 27, 21, 12, 6, 11, 18, 29, 36, 18, 11, 22, 28, 14, 8, 16, 24, 18, 8, 14, 25, 31, 19, 10, 17, 9, 5];
        const bars = pattern.map(height => {
            const bar = history.ownerDocument.createElement('span');
            bar.className = 'voice-line';
            bar.style.setProperty('--voice-height', height + 'px');
            return bar;
        });
        wave.replaceChildren(...bars);
    }
    history.querySelectorAll('.photo-frame img').forEach(picture => {
        if (picture.complete) measureConversationPhoto(picture);
        else picture.addEventListener('load', () => measureConversationPhoto(picture), {once:true});
    });
    const photos = history.querySelectorAll('.Miu-miu:has(.conversation-photo:not(.photo-stack))');
    for (const row of photos) {
        const prev = row.previousElementSibling;
        if (!prev?.querySelector('.conversation-photo:not(.photo-stack)')) continue;
        if (prev.classList.contains('user') !== row.classList.contains('user')) continue;
        if (prev.querySelector('.reply-tiny-bubble') || row.querySelector('.reply-tiny-bubble')) continue;
        row.classList.add('conversation-photo-run');
        row.classList.toggle('conversation-photo-inset', !prev.classList.contains('conversation-photo-inset'));
    }
}

function setConversationPhotoIndex(card, index) {
    const frames = [...card.querySelectorAll('.photo-frame')];
    card.dataset.current = String(index);
    frames.forEach((frame, pos) => {
        const layer = (pos - index + frames.length) % frames.length;
        frame.style.setProperty('--photo-layer', String(Math.min(layer, 3)));
        frame.toggleAttribute('data-front', !layer);
        frame.toggleAttribute('data-deep', layer > 2);
        frame.tabIndex = layer ? -1 : 0;
    });
    const front = frames[index]?.querySelector('img');
    if (front?.complete) measureConversationPhoto(front);
}

function toggleConversationPhoto(card) {
    const copy = card.querySelector('.photo-description');
    const active = card.classList.toggle('photo-open');
    card.querySelector('.photo-stack-label').setAttribute('aria-expanded', String(active));
    if (copy) {
        copy.hidden = !active;
        copy.parentElement.setAttribute('aria-expanded', String(active));
    } else {
        card.querySelectorAll('.photo-frame').forEach(frame => { frame.tabIndex = active || frame.hasAttribute('data-front') ? 0 : -1; });
    }
}

function showConversationPhotoViewer(card, initialIndex) {
    const photos = [...card.querySelectorAll('.photo-frame img')];
    let index = initialIndex;
    const viewer = document.createElement('dialog');
    viewer.className = 'conversation-viewer';
    viewer.innerHTML = `<button type="button" class="viewer-close" aria-label="关闭">×</button>
        <img alt="照片">
        <div class="viewer-controls">
            <button type="button" data-step="-1" aria-label="上一张">‹</button>
            <span aria-live="polite"></span>
            <button type="button" data-step="1" aria-label="下一张">›</button>
        </div>`;
    const controls = viewer.querySelector('.viewer-controls');
    controls.hidden = photos.length === 1;
    const display = () => {
        viewer.querySelector('img').src = photos[index].src;
        controls.querySelector('span').textContent = `${index + 1} / ${photos.length}`;
        controls.firstElementChild.disabled = index === 0;
        controls.lastElementChild.disabled = index === photos.length - 1;
    };
    const step = delta => {
        index = Math.max(0, Math.min(photos.length - 1, index + delta));
        display();
    };
    viewer.addEventListener('click', event => {
        if (event.target === viewer || event.target.closest('.viewer-close')) viewer.close();
        const direction = event.target.closest('[data-step]');
        if (direction) step(Number(direction.dataset.step));
    });
    viewer.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft') step(-1);
        if (event.key === 'ArrowRight') step(1);
    });
    viewer.addEventListener('close', () => viewer.remove(), { once: true });
    document.body.append(viewer);
    display();
    viewer.showModal();
}

document.addEventListener('DOMContentLoaded', () => {
    const inbox = document.getElementById('view-messages');
    const history = document.getElementById('roomMessages');
    const room = document.getElementById('chatRoom');
    new MutationObserver(() => updateConversationPalette(room)).observe(room, {attributes:true, attributeFilter:['style']});
    updateConversationPalette(room);
    document.addEventListener('click', event => {
        if (!event.target.closest('#inbox-options, #inbox-options-button')) toggleInboxOptions(false);
    });
    inbox.addEventListener('keydown', event => {
        if (event.key === 'Escape') toggleInboxOptions(false);
    });
    let gesture;
    let lastSwipe = 0;
    history.addEventListener('pointerdown', event => {
        const card = event.target.closest('.photo-stack:not(.photo-open)');
        if (card && card.querySelectorAll('.photo-frame').length > 1) {
            gesture = { card, x: event.clientX, y: event.clientY };
        }
    });
    history.addEventListener('pointercancel', () => { gesture = null; });
    history.addEventListener('pointerup', event => {
        if (!gesture) return;
        const { card, x, y } = gesture;
        gesture = null;
        const dx = event.clientX - x;
        if (Math.abs(dx) < 28 || Math.abs(dx) < Math.abs(event.clientY - y)) return;
        const count = card.querySelectorAll('.photo-frame').length;
        const index = Number(card.dataset.current);
        setConversationPhotoIndex(card, (index + (dx < 0 ? 1 : count - 1)) % count);
        lastSwipe = Date.now();
    });
    history.addEventListener('click', event => {
        const card = event.target.closest('.conversation-photo');
        if (!card || document.getElementById('chatRoom').classList.contains('multi-select-mode')) return;
        event.stopPropagation();
        if (Date.now() - lastSwipe < 300) return;
        const frame = event.target.closest('.photo-frame');
        if (event.target.closest('.photo-save')) {
            const photo = card.querySelector('.photo-frame[data-front] img, .photo-frame:only-child img');
            if (!photo) return;
            const link = document.createElement('a');
            link.href = photo.src;
            link.download = '照片.jpg';
            link.target = '_blank';
            link.rel = 'noopener';
            link.click();
        } else if (event.target.closest('.photo-stack-label') || (frame && card.querySelector('.photo-description'))) {
            toggleConversationPhoto(card);
        } else if (frame) {
            showConversationPhotoViewer(card, Number(frame.dataset.photoIndex));
        }
    }, true);
});
