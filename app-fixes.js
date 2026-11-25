'use strict';
(() => {
    const inbox = document.getElementById('view-messages');
    const list = document.getElementById('chat-list-container');
    const toolbar = inbox.querySelector('.inbox-selection-toolbar');
    const selected = new Set();
    function syncSelection() {
        const editing = inbox.classList.contains('inbox-editing');
        toolbar.hidden = !editing;
        list.querySelectorAll('.chat-item-content').forEach(row => {
            row.classList.toggle('contact-selected', selected.has(row.dataset.chatId));
            row.setAttribute('role', editing ? 'checkbox' : 'button');
            if (editing) row.setAttribute('aria-checked', String(selected.has(row.dataset.chatId)));
            else row.removeAttribute('aria-checked');
        });
        document.getElementById('inboxSelectionCount').textContent = `已选 ${selected.size} 项`;
        toolbar.querySelectorAll('[data-contact-select="pin"],[data-contact-select="delete"]').forEach(button => button.disabled = !selected.size);
        const affected = chatList.filter(chat => selected.has(String(chat.id)));
        toolbar.querySelector('[data-contact-select="pin"]').textContent = affected.length && affected.every(chat => chat.isPinned) ? '取消置顶' : '置顶';
    }
    window.toggleInboxEdit = button => {
        const editing = inbox.classList.toggle('inbox-editing');
        selected.clear();
        button.textContent = editing ? '完成' : '编辑';
        button.setAttribute('aria-pressed', String(editing));
        toggleInboxOptions(false);
        syncSelection();
    };
    const openConversation = window.openInboxConversation;
    window.openInboxConversation = key => {
        if (!inbox.classList.contains('inbox-editing')) return openConversation(key);
        key = String(key);
        if (selected.has(key)) selected.delete(key); else selected.add(key);
        syncSelection();
    };
    // The old row handlers implement swipe actions; stop those gestures at the list.
    for (const type of ['touchstart','touchmove','touchend']) list.addEventListener(type, event => event.stopPropagation(), {capture:true,passive:true});
    new MutationObserver(syncSelection).observe(list, {childList:true,subtree:true});
    toolbar.addEventListener('click', async event => {
        const action = event.target.closest('[data-contact-select]')?.dataset.contactSelect;
        if (!action) return;
        if (action === 'all') {
            const rows = [...list.querySelectorAll('.chat-item-content')];
            if (rows.every(row => selected.has(row.dataset.chatId))) selected.clear();
            else rows.forEach(row => selected.add(row.dataset.chatId));
        } else {
            const affected = chatList.filter(chat => selected.has(String(chat.id)));
            if (!affected.length) return;
            if (action === 'pin') {
                const pin = !affected.every(chat => chat.isPinned);
                affected.forEach(chat => chat.isPinned = pin);
                await db.chats.bulkPut(affected);
            } else if (action === 'delete') {
                if (!confirm(`删除选中的 ${affected.length} 个联系人及聊天记录？`)) return;
                await db.chats.bulkDelete(affected.map(chat => chat.id));
                chatList = chatList.filter(chat => !selected.has(String(chat.id)));
                selected.clear();
            }
            saveData();
            renderChatList();
        }
        syncSelection();
    });
    const switchTab = window.switchAppTab;
    window.switchAppTab = index => {
        if (Number(index) === 3) { switchTab(0); openUserMaskPage(); }
        else switchTab(index);
    };
    const keepAlive = document.getElementById('apiKeepAliveToggle');
    const syncSwitch = () => keepAlive.classList.toggle('checked', keepAlive.getAttribute('aria-checked') === 'true');
    new MutationObserver(syncSwitch).observe(keepAlive,{attributes:true,attributeFilter:['aria-checked']});
    syncSwitch();
    syncSelection();
})();
