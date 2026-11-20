'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const room = document.getElementById('chatRoom');
    const source = document.getElementById('roomMessages');
    const nativeInput = document.getElementById('msgInput');
    if (!room || !source || !nativeInput) return;
    const host = document.createElement('ceshi-kiss-view');
    host.dataset.platform = /Android/i.test(navigator.userAgent) ? 'android' : 'other';
    const root = host.attachShadow({mode: 'open'});
    const shapes = {smile:'<circle cx="12" cy="12" r="10"/><path d="M7 13a5 5 0 0 0 10 0Zm2-4h.01M15 9h.01"/>',copy:'<rect x="8" y="8" width="12" height="14" rx="2"/><path d="M16 8V2H3v15h5"/>',translate:'<path d="M3 5h12M9 2v3m4 0C11 11 8 15 3 17m2-9c2 4 5 7 9 9m0 3 4-11 4 11m-7-3h6"/>',select:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/>',edit:'<path d="m4 16 12-12 4 4L8 20H4Zm9-9 4 4"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',back:'<path d="m14 4-8 8 8 8"/>',video:'<rect x="1.4" y="5.2" width="15.2" height="13.6" rx="2.8"/><path d="M16.6 9.8 21.2 6.4q1.2-.9 1.2.6v10q0 1.5-1.2.6l-4.6-3.4"/>',plus:'<path d="M12 5v14M5 12h14"/>',wave:'<path d="M4 10v4m4-7v10m4-14v18m4-14v10m4-7v4"/>',up:'<path d="M12 19V5m-6 6 6-6 6 6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',down:'<path d="m5 9 7 7 7-7"/>',reply:'<path d="m9 5-7 6 7 6v-4h5c4 0 6 2 8 6-1-8-5-10-13-10Z"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',check:'<path d="m5 12 4 4L19 6"/>'};
    shapes.send = shapes.up;
    shapes.undo = '<circle cx="12" cy="12" r="9"/><path d="m10 8-3 3 3 3m-3-3h6a3 3 0 0 1 0 6"/>';
    const svg = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (shapes[name] || shapes.plus) + '</svg>';
    const layout = "<link rel=\"stylesheet\" href=\"${asset}\"><div class=\"surface\"><div class=\"wallpaper\"></div><svg class=\"bubble-outline-defs\" width=\"0\" height=\"0\" aria-hidden=\"true\"><defs><linearGradient id=\"ki-incoming-rim\" x1=\"0%\" y1=\"20%\" x2=\"100%\" y2=\"80%\"><stop offset=\"0%\" stop-color=\"#e8e7ff\" stop-opacity=\".34\"/><stop offset=\"60%\" stop-color=\"#aecbe6\" stop-opacity=\".20\"/><stop offset=\"100%\" stop-color=\"#60b3d5\" stop-opacity=\".07\"/></linearGradient></defs></svg><main class=\"history\" aria-label=\"\u804a\u5929\u4fe1\u606f\" tabindex=\"-1\"></main><div class=\"edge-haze edge-top\"></div><div class=\"edge-haze edge-bottom\"></div><section class=\"reply-focus\" aria-label=\"\u56de\u590d\u4f1a\u8bdd\" hidden><div class=\"reply-feed\"></div></section><header class=\"floating-header\"><button class=\"glass back\" aria-label=\"\u8fd4\u56de\u804a\u5929\u5217\u8868\">${svg('back')}<span class=\"unread-count\" hidden></span></button><button class=\"contact\" aria-label=\"\u6253\u5f00\u804a\u5929\u8bbe\u7f6e\"><img class=\"avatar\" alt=\"\"><span class=\"glass name\"><b></b><svg viewBox=\"0 0 6 13\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M1.11 1.08a1.22 1.22 0 0 1 1.66.49l2.25 4.42a1.16 1.16 0 0 1 0 1.02l-2.25 4.42a1.22 1.22 0 0 1-2.15-1.16L2.54 6.5.62 2.73a1.22 1.22 0 0 1 .49-1.65Z\"/></svg></span></button><button class=\"glass video\" aria-label=\"\u901a\u8bdd\">${svg('video')}</button><button class=\"glass reply-close\" aria-label=\"\u5173\u95ed\u56de\u590d\u4f1a\u8bdd\" hidden>${svg('close')}</button></header><div class=\"typing\" role=\"status\" hidden>\u2022\u2022\u2022</div><button class=\"glass jump\" aria-label=\"\u8df3\u5230\u6700\u65b0\u6d88\u606f\" hidden>${svg('down')}<span></span></button><footer class=\"composer\"><div class=\"compose-row\"><button class=\"glass add\" aria-label=\"\u804a\u5929\u529f\u80fd\" aria-expanded=\"false\">${svg('plus')}</button><div class=\"glass input-capsule\"><textarea rows=\"1\" aria-label=\"iMessage\u4fe1\u606f\" placeholder=\"iMessage\u4fe1\u606f\" enterkeyhint=\"send\"></textarea><button class=\"submit\" aria-label=\"\u83b7\u53d6\u56de\u590d\">${svg('wave')}</button></div></div></footer><button class=\"tools-dismiss\" aria-label=\"\u6536\u8d77\u529f\u80fd\" hidden></button><section class=\"tools glass\" aria-label=\"\u804a\u5929\u529f\u80fd\" hidden><div class=\"tools-scroll\"></div></section><section class=\"selection glass\" hidden><button data-original=\"cancel-multi-select-btn\">\u53d6\u6d88</button><b></b><button data-original=\"delete-selected-btn\">\u5220\u9664</button><button data-original=\"collect-selected-btn\">\u6536\u85cf</button></section><div class=\"menu-layer\" hidden></div></div>";
    root.innerHTML = layout.replace('${asset}', 'kiss-view.css?v=1').replace(/\$\{svg\('([^']+)'\)\}/g, (_, name) => svg(name));
    const referenceStyle = document.createElement('link');
    referenceStyle.rel = 'stylesheet';
    referenceStyle.href = 'ios26-messages.css?v=2';
    root.append(referenceStyle);
    const extra = document.createElement('style');
    extra.textContent = `
        .avatar-initial{display:grid;place-items:center;font-size:29px;color:white;background:linear-gradient(145deg,#b1cde6,#7d8bb7)}
        .back,.video,.add{flex-shrink:0}
        .adapted-transfer{width:208px;max-width:79%;border-radius:17px;overflow:hidden;background:linear-gradient(155deg,#f0f6ff,#e7effc);color:#182338;padding:12px 13px 0}
        .payment-head,.payment-status{display:flex;justify-content:space-between;gap:7px;font-size:12px}
        .payment-amount{display:block;margin:7px 0;font-size:25px}
        .payment-note{display:block;font-size:13px;line-height:1.4;white-space:pre-wrap;margin-bottom:7px}
        .payment-status{padding:8px 13px;margin:0 -13px;background:#dce9fa}
        .adapted-transfer i{display:none}
        .photo-description{position:absolute;inset:0;background:white;color:#222;padding:15px;overflow:auto;font-size:14px;line-height:1.5;white-space:pre-wrap}
        .tool-icon svg{fill:none;stroke:currentColor;stroke-width:1.6}
        .voice-transcript.active{display:block}
        .native-rich{padding:12px;border-radius:18px;background:var(--incoming);max-width:79%;overflow:hidden}
        .native-rich img{max-width:100%}
        .reply-compose{display:flex;align-items:center;gap:8px;padding:8px 14px;margin-bottom:7px;border-radius:18px;pointer-events:auto}
        .reply-compose span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
        .reply-compose button{font-size:20px}
    `;
    root.append(extra);
    room.append(host);
    const $ = selector => root.querySelector(selector);
    const history = $('.history');
    const input = $('textarea');
    const submit = $('.submit');
    const albumStates = new Map();
    let pending = 0;
    let previousId;
    let frameMap = new WeakMap();
    let holdTimer;
    let suppressClickUntil = 0;

    const optics = window.KissIMessageLiquid.create({host, root});
    $('link').addEventListener('load', () => { room.classList.add('kiss-connected'); sync(); }, {once: true});
    $('.back').onclick = () => exitChatRoom();
    $('.contact').onclick = () => openChatSettings();
    $('.video').onclick = () => startVideoCallUI();
    $('.jump').onclick = () => { history.scrollTop = history.scrollHeight; };
    function updateInput() {
        nativeInput.value = input.value;
        nativeInput.dispatchEvent(new Event('input', {bubbles: true}));
        const sending = !!input.value.trim();
        submit.classList.toggle('send', sending);
        submit.setAttribute('aria-label', sending ? '发送信息' : '获取回复');
        submit.innerHTML = svg(sending ? 'send' : 'wave');
        input.style.height = '40px';
        input.style.height = Math.min(122, input.scrollHeight) + 'px';
        optics.schedule();
    }
    input.addEventListener('input', updateInput);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            submit.click();
        }
    });
    submit.onclick = async () => {
        nativeInput.value = input.value;
        await sendMsg();
        input.value = nativeInput.value;
        updateInput();
        schedule();
    };
    function toolsOpen(open) {
        $('.tools').hidden = !open;
        $('.tools-dismiss').hidden = !open;
        $('.add').setAttribute('aria-expanded', String(open));
        if (open) buildTools();
        optics.schedule();
    }
    $('.add').onclick = () => toolsOpen($('.tools').hidden);
    $('.tools-dismiss').onclick = () => toolsOpen(false);
    function buildTools() {
        const list = $('.tools-scroll');
        list.replaceChildren();
        const colors = ['#2acb65','#2396ee','#a578f6','#ff563f','#ffad14','#00bce7','#6388ef'];
        const entries = [...document.querySelectorAll('#toolsMainMenu > .tool-item')].sort((a,b) => Number(getComputedStyle(a).order) - Number(getComputedStyle(b).order));
        entries.forEach((entry, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'tool';
            const icon = document.createElement('span');
            icon.className = 'tool-icon';
            icon.style.background = colors[index % colors.length];
            const glyph = entry.querySelector('.tool-icon-box');
            // Source icons are kept as text-independent shapes in the isolated theme.
            const key = entry.dataset.chatTool;
            const paths = {
                album: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="8" r="2"/><path d="m4 18 5-5 4 3 3-5 5 6"/>',
                photo: '<rect x="3" y="6" width="18" height="15" rx="3"/><path d="m8 6 2-3h4l2 3"/><circle cx="12" cy="13" r="4"/>',
                emoji: '<path d="M20 13A9 9 0 1 1 9 3c1.4 5.1 5.9 9.6 11 10Z"/><path d="M9 3c.7 4.9 5.7 9.9 11 10"/>',
                voice: shapes.wave,
                payment: '<path d="M7 8h13l-4-4M17 16H4l4 4"/>'
            };
            icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[key] || '<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/>') + '</svg>';
            const label = document.createElement('span');
            label.textContent = key === 'emoji' ? '贴纸' : entry.querySelector('.tool-name')?.textContent || glyph?.textContent || '更多';
            button.append(icon,label);
            button.onclick = event => {
                event.stopPropagation();
                toolsOpen(false);
                entry.click();
                // Native actions expect to toggle the original tray closed.
                document.getElementById('chatToolsPanel').classList.remove('active');
                document.getElementById('newRoomFooter').classList.remove('tools-active');
                schedule();
            };
            list.append(button);
        });
    }

    function cleanClone(node) {
        const clone = node.cloneNode(true);
        for (const el of [clone, ...clone.querySelectorAll('*')]) {
            el.removeAttribute('style');
            el.removeAttribute('id');
            for (const attr of [...el.attributes]) if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
        }
        clone.querySelectorAll('script,style,iframe,video,object,embed,.conversation-contour').forEach(el => el.remove());
        return clone;
    }
    function attachPhotos(content, row, key) {
        const original = content.querySelector('.conversation-photo');
        const photos = [...original.querySelectorAll('.photo-frame')];
        const description = original.querySelector('.photo-description');
        const state = albumStates.get(key) || {index: 0, expanded: false};
        albumStates.set(key, state);
        const album = document.createElement('div');
        const stacked = original.classList.contains('photo-stack');
        album.className = stacked ? 'image-bubble im-album' : 'image-bubble im-single-photo';
        if (description) album.classList.add('im-text-photo');
        if (state.expanded) album.classList.add('im-album-expanded');
        const deck = document.createElement('div');
        deck.className = stacked ? 'im-album-deck' : '';
        photos.forEach((sourceFrame, index) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = stacked ? 'im-photo' : '';
            card.setAttribute('aria-label', description ? '查看照片文字' : '查看第 ' + (index + 1) + ' 张照片');
            const image = sourceFrame.querySelector('img').cloneNode();
            image.draggable = false;
            image.alt = '';
            card.append(image);
            const size = () => {
                if (!image.naturalWidth) return;
                const ratio = image.naturalWidth / image.naturalHeight;
                if (!stacked) album.style.setProperty('--photo-width', ratio > 1 ? '164px' : '176px');
                if (state.expanded) card.style.aspectRatio = String(ratio);
                else if (index === state.index) {
                    deck.style.setProperty('--photo-aspect', Math.max(.6, Math.min(1.6, ratio)));
                    album.style.setProperty('--photo-front-width', ratio > 1 ? '166px' : '184px');
                }
                optics.schedule();
            };
            image.onload = size;
            if (image.complete) size();
            if (stacked && !state.expanded) {
                const depth = (index - state.index + photos.length) % photos.length;
                card.style.setProperty('--depth', Math.min(depth,2));
                card.style.zIndex = String(10-depth);
                card.hidden = depth > 2;
            }
            if (state.expanded) card.style.setProperty('--photo-stagger', (index % 2 === 0) === row.classList.contains('sent') ? '35px' : '0px');
            card.onclick = event => {
                event.stopPropagation();
                if (Date.now() < suppressClickUntil) return;
                if (description) {
                    let copy = card.querySelector('.photo-description');
                    if (copy) copy.remove();
                    else card.append(cleanClone(description));
                    optics.invalidate(row);
                } else {
                    sourceFrame.dispatchEvent(new MouseEvent('click', {bubbles:true}));
                }
            };
            deck.append(card);
        });
        if (stacked) {
            const label = document.createElement('button');
            label.className = 'im-photo-count';
            label.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 1h6v6H1zm8 0h6v6H9zM1 9h6v6H1zm8 0h6v6H9z"/></svg>';
            label.append(document.createTextNode(photos.length + ' 张照片'));
            label.setAttribute('aria-expanded', String(state.expanded));
            label.onclick = () => { state.expanded = !state.expanded; schedule(); };
            album.append(label);
            let gesture;
            deck.addEventListener('pointerdown', event => { gesture = [event.clientX,event.clientY]; });
            deck.addEventListener('pointerup', event => {
                if (!gesture || state.expanded) return;
                const dx = event.clientX - gesture[0], dy = event.clientY - gesture[1];
                gesture = null;
                if (Math.abs(dx) < 28 || Math.abs(dx) < Math.abs(dy)) return;
                clearTimeout(holdTimer);
                suppressClickUntil = Date.now() + 350;
                state.index = (state.index + (dx < 0 ? 1 : photos.length - 1)) % photos.length;
                schedule();
            });
        }
        if (row.classList.contains('received') && !description) {
            const download = document.createElement('button');
            download.className = 'im-photo-download';
            download.setAttribute('aria-label', '下载照片');
            download.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v13m-4-4 4 4 4-4M4 15v6h16v-6"/></svg>';
            download.onclick = event => {
                event.stopPropagation();
                const link = document.createElement('a');
                link.href = photos[state.index]?.querySelector('img').src || photos[0].querySelector('img').src;
                link.download = '照片.jpg';
                link.target = '_blank';
                link.rel = 'noopener';
                link.click();
            };
            album.classList.add('im-downloadable');
            album.append(download);
        }
        if (stacked) album.append(deck);
        else {
            const card = deck.firstChild;
            const image = card.querySelector('img');
            album.append(image);
            album.tabIndex = 0;
            album.setAttribute('role','button');
            album.setAttribute('aria-label','查看照片');
            album.onclick = card.onclick;
            album.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); album.click(); }
            });
        }
        return album;
    }
    function makeRow(nativeRow) {
        const sent = nativeRow.classList.contains('user');
        const row = document.createElement('div');
        row.className = 'message-wrapper ' + (sent ? 'sent' : 'received');
        const content = nativeRow.querySelector('.content');
        if (!content) return null;
        const key = String(currentChatId) + ':' + content.dataset.index;
        row.dataset.id = key;
        row.dataset.index = content.dataset.index;
        const line = document.createElement('div');
        line.className = 'message-bubble-row';
        if (content.classList.contains('conversation-text')) {
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            const copy = cleanClone(content);
            while (copy.firstChild) bubble.append(copy.firstChild);
            if (Array.from(bubble.textContent.trim()).length === 1) bubble.classList.add('single-glyph');
            const reply = nativeRow.querySelector('.reply-tiny-bubble');
            if (reply) {
                const quote = document.createElement('div');
                quote.className = 'quoted-message';
                quote.textContent = reply.textContent;
                bubble.prepend(quote);
                row.classList.add('has-reply');
            }
            line.append(bubble);
        } else if (content.querySelector('.conversation-photo')) {
            line.append(attachPhotos(content,row,key));
        } else if (content.querySelector('.chat-sticker-img')) {
            const image = cleanClone(content.querySelector('.chat-sticker-img'));
            image.alt = '表情包';
            const holder = document.createElement('div');
            holder.className = 'image-bubble';
            holder.append(image);
            line.append(holder);
        } else if (content.classList.contains('voice-bubble')) {
            const voice = document.createElement('div');
            voice.className = 'voice-bubble';
            const play = document.createElement('button');
            play.className = 'voice-play';
            play.setAttribute('aria-label','播放语音');
            play.innerHTML = '<span class="play-icon">' + svg('video') + '</span>';
            play.querySelector('.play-icon').innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m7 3 15 9L7 21Z"/></svg>';
            const wave = document.createElement('span');
            wave.className = 'voice-wave';
            for (let i=0;i<48;i++) {
                const bar = document.createElement('i');
                bar.style.height = (23 + Math.sin(i*.62)*1.45 + Math.sin(i*1.89)*1.05) + 'px';
                wave.append(bar);
            }
            const duration = document.createElement('span');
            duration.className = 'duration';
            const seconds = parseInt(content.querySelector('.voice-duration')?.textContent,10) || 0;
            duration.textContent = String(Math.floor(seconds/60)).padStart(2,'0') + ':' + String(seconds%60).padStart(2,'0');
            play.onclick = event => {
                event.stopPropagation();
                toggleVoiceText(content.querySelector('.voice-inner-container'), event);
                let transcript = row.querySelector('.voice-transcript');
                if (!transcript) {
                    transcript = document.createElement('div');
                    transcript.className = 'voice-transcript active';
                    transcript.textContent = content.querySelector('.voice-trans-result')?.textContent || '';
                    row.append(transcript);
                } else transcript.remove();
                optics.invalidate(row);
            };
            voice.append(play,wave,duration);
            line.append(voice);
        } else if (content.querySelector('.conversation-payment')) {
            const sourcePayment = content.querySelector('.conversation-payment');
            const payment = document.createElement('button');
            payment.type = 'button';
            payment.className = 'transfer-card ios26-transfer';
            payment.innerHTML = '<span class="transfer-content"><span class="im-transfer-main"><span class="im-transfer-mark" aria-hidden="true"></span><span class="im-transfer-figure"><strong class="transfer-amount"></strong></span></span><span class="im-transfer-footer"><span class="transfer-label"></span><span>U&amp;Me</span></span></span>';
            const amount = sourcePayment.querySelector('.payment-amount')?.textContent || '¥0.00';
            payment.querySelector('.transfer-amount').textContent = amount;
            const note = sourcePayment.querySelector('.payment-note')?.textContent;
            if (note) {
                const remark = document.createElement('span');
                remark.className = 'transfer-remark';
                remark.textContent = note;
                payment.querySelector('.im-transfer-figure').append(remark);
            }
            const status = sourcePayment.querySelector('.payment-status')?.textContent.trim() || '';
            payment.querySelector('.transfer-label').textContent = /已|退还/.test(status) ? status : (row.classList.contains('sent') ? '转账' : '给你转账');
            payment.setAttribute('aria-label', `转账 ${amount} ${status}${note ? '，' + note : ''}`);
            payment.onclick = () => sourcePayment.click();
            line.append(payment);
        } else {
            const rich = cleanClone(content);
            rich.className = 'native-rich';
            rich.onclick = () => content.click();
            line.append(rich);
        }
        row.prepend(line);
        frameMap.set(row, content);
        return row;
    }
    function closeMenu() {
        $('.menu-layer').hidden = true;
        $('.menu-layer').replaceChildren();
    }
    function openMenu(row) {
        const sourceContent = frameMap.get(row);
        if (!sourceContent) return;
        activeMsgIndex = Number(row.dataset.index);
        activeMsgElement = sourceContent;
        const sent = row.classList.contains('sent');
        const layer = $('.menu-layer');
        layer.replaceChildren();
        const scrim = document.createElement('button');
        scrim.className = 'scrim';
        scrim.setAttribute('aria-label','关闭消息菜单');
        scrim.onclick = closeMenu;
        const menu = document.createElement('div');
        menu.className = 'message-actions';
        menu.setAttribute('role','menu');
        menu.setAttribute('aria-label','消息操作');
        const actions = [['copy','复制'],['reply','回复'],['edit','编辑'],[sent?'recall':'regen',sent?'撤回':'重新生成'],['multi','选择信息']];
        for (const [action,label] of actions) {
            const button = document.createElement('button');
            button.className = 'message-action';
            button.setAttribute('role','menuitem');
            button.innerHTML = svg(action === 'multi' ? 'select' : ['recall','regen'].includes(action) ? 'undo' : action);
            button.append(document.createTextNode(label));
            button.onclick = () => { closeMenu(); handleMenuAction(action); schedule(); };
            menu.append(button);
        }
        layer.append(scrim,menu);
        layer.hidden = false;
        const bounds = $('.surface').getBoundingClientRect();
        const box = row.getBoundingClientRect();
        const height = menu.offsetHeight;
        const left = Math.max(12,Math.min(box.left - bounds.left, bounds.width - menu.offsetWidth - 12));
        const top = Math.max(12,Math.min(box.bottom - bounds.top + 10,bounds.height - height - 12));
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    }
    history.addEventListener('contextmenu', event => {
        const row = event.target.closest('.message-wrapper');
        if (row) { event.preventDefault(); openMenu(row); }
    });
    history.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !event.target.closest('.message-wrapper')) return;
        const row = event.target.closest('.message-wrapper');
        const start = [event.clientX,event.clientY];
        holdTimer = setTimeout(() => { suppressClickUntil = Date.now()+400;openMenu(row); },450);
        const move = e => { if(Math.hypot(e.clientX-start[0],e.clientY-start[1])>8)clearTimeout(holdTimer); };
        history.addEventListener('pointermove',move,{once:true});
    });
    for (const event of ['pointerup','pointercancel']) history.addEventListener(event,()=>clearTimeout(holdTimer));
    history.addEventListener('scroll',()=>{ $('.jump').hidden = history.scrollHeight-history.scrollTop-history.clientHeight<180; optics.schedule(); },{passive:true});
    const rimObservers = new Map();
    function traceIncomingBubble(bubble) {
        const outline = bubble.querySelector('.incoming-rim path');
        if (!outline) return;
        const w = bubble.offsetWidth, h = bubble.offsetHeight;
        if (!w || !h) return;
        const tail = bubble.closest('.message-wrapper').classList.contains('tail');
        const bottomLeft = tail
            ? `H20 C17 ${h} 11 ${h+6} 8.4 ${h+6} C7.6 ${h+6} 7.6 ${h+5} 8.3 ${h+4} C10.7 ${h+.5} 10.7 ${h-2} 8 ${h-4.5} C4 ${h-8} .4 ${h-12} .4 ${h-18.5}`
            : `H18.5 C8.5 ${h-.4} .4 ${h-8.5} .4 ${h-18.5}`;
        outline.setAttribute('d', `M18.5 .4 H${w-18.5} C${w-8.5} .4 ${w-.4} 8.5 ${w-.4} 18.5 V${h-18.5} C${w-.4} ${h-8.5} ${w-8.5} ${h-.4} ${w-18.5} ${h-.4} ${bottomLeft} V18.5 C.4 8.5 8.5 .4 18.5 .4Z`);
    }
    function mountIncomingRims() {
        for (const observer of rimObservers.values()) observer.disconnect();
        rimObservers.clear();
        if (!host.hasAttribute('wallpaper')) return;
        for (const bubble of history.querySelectorAll('.received :is(.message-bubble:not(.html-bubble), .voice-bubble)')) {
            const ns = 'http://www.w3.org/2000/svg';
            const rim = document.createElementNS(ns, 'svg');
            rim.setAttribute('class', 'incoming-rim');
            rim.setAttribute('aria-hidden', 'true');
            const path = document.createElementNS(ns, 'path');
            path.setAttribute('stroke', 'url(#ki-incoming-rim)');
            rim.append(path);
            bubble.append(rim);
            traceIncomingBubble(bubble);
            if (typeof ResizeObserver === 'function') {
                const observer = new ResizeObserver(() => {
                    traceIncomingBubble(bubble);
                    optics.invalidate(bubble.closest('.message-wrapper'));
                });
                observer.observe(bubble);
                rimObservers.set(bubble, observer);
            }
        }
    }
    function sync() {
        pending = 0;
        const changed = previousId !== currentChatId;
        const stick = changed || history.scrollHeight-history.scrollTop-history.clientHeight<180;
        const scroll = history.scrollTop;
        previousId = currentChatId;
        document.getElementById('appOverlay').scrollTop = 0;
        if (changed && room.classList.contains('active')) {
            window.scrollTo(0,0);
            document.getElementById('appOverlay').scrollTop = 0;
        }
        $('.name b').textContent = document.getElementById('roomTitle').textContent;
        const avatar = document.getElementById('conversation-avatar');
        const image = $('.contact img.avatar');
        image.src = avatar?.getAttribute('src') || '';
        image.hidden = !avatar?.getAttribute('src');
        let initial = $('.avatar-initial');
        if (!initial) { initial=document.createElement('span');initial.className='avatar avatar-initial';$('.contact').prepend(initial); }
        initial.textContent = document.getElementById('conversation-initial').textContent;
        initial.hidden = !image.hidden;
        image.onerror = () => { image.hidden = true; initial.hidden = false; };
        const background = getComputedStyle(room).backgroundImage;
        const url = background.match(/^url\(["']?(.*?)["']?\)$/)?.[1] || '';
        host.toggleAttribute('wallpaper',!!url);
        $('.wallpaper').style.backgroundImage = background;
        optics.setBackground(url);
        for (const row of history.children) optics.invalidate(row);
        frameMap = new WeakMap();
        const rows = [];
        for (const native of source.children) {
            if (native.classList.contains('Miu-miu')) {
                const row = makeRow(native);
                if (row) rows.push(row);
            } else {
                const note = document.createElement('div');
                note.className = 'system-notification time-divider';
                note.textContent = native.textContent;
                if (native.classList.contains('conversation-delivery')) {
                    note.className = 'delivery';
                    note.style.textAlign = 'right';
                }
                if (native.querySelector('.fa-history')) {
                    note.className = 'load-more-btn';
                    note.onclick = () => native.click();
                }
                rows.push(note);
            }
        }
        rows.forEach((row,index)=>{
            if (!row.classList.contains('message-wrapper')) return;
            const next = rows[index+1];
            const same = next?.classList.contains('message-wrapper') &&
                row.classList.contains('sent') === next.classList.contains('sent') &&
                row.querySelector('.message-bubble') && next.querySelector('.message-bubble') &&
                !next.classList.contains('has-reply');
            row.classList.toggle('tail',!same);
            if (same) next.classList.add('grouped-text');
            const prev=rows[index-1];
            if (row.querySelector('.im-single-photo') && prev?.querySelector('.im-single-photo') &&
                row.classList.contains('sent')===prev.classList.contains('sent')) {
                row.classList.add('staggered-photo');
                row.classList.toggle('staggered-inset',!prev.classList.contains('staggered-inset'));
            }
        });
        history.replaceChildren(...rows);
        mountIncomingRims();
        const composer=$('.composer');
        let reply = $('.reply-compose');
        if (typeof activeReplyContext !== 'undefined' && activeReplyContext) {
            if (!reply) {
                reply=document.createElement('div');reply.className='reply-compose glass';
                const text=document.createElement('span'),cancel=document.createElement('button');
                cancel.textContent='×';cancel.setAttribute('aria-label','取消回复');cancel.onclick=()=>{cancelReply();schedule();};
                reply.append(text,cancel);composer.prepend(reply);
            }
            reply.querySelector('span').textContent = activeReplyContext.name + ' · ' + activeReplyContext.content;
        } else reply?.remove();
        if (document.activeElement !== nativeInput && root.activeElement !== input) {
            input.value = nativeInput.value;
            updateInput();
        }
        $('.surface').style.setProperty('--composer-height',composer.offsetHeight+'px');
        history.scrollTop = stick ? history.scrollHeight : scroll;
        optics.schedule();
    }
    function schedule() { if (!pending) pending=requestAnimationFrame(sync); }
    new MutationObserver(schedule).observe(source,{childList:true,subtree:true,characterData:true});
    new MutationObserver(schedule).observe(document.getElementById('roomTitle'),{childList:true,characterData:true,subtree:true});
    new MutationObserver(schedule).observe(room,{attributes:true,attributeFilter:['class','style']});
    nativeInput.addEventListener('input',()=>{if(root.activeElement!==input){input.value=nativeInput.value;submit.classList.toggle('send',!!input.value.trim());}});
    window.addEventListener('resize',schedule,{passive:true});
    schedule();
});
