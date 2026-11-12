// 1. 安装与激活：跳过等待，立即接管
self.addEventListener('install', (event) => {
    console.log('[SW] Installed');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activated');
    event.waitUntil(self.clients.claim());
});

// 2. ★★★ 新增：监听主页面发来的弹窗指令 ★★★
// (这一步是你之前缺少的，没有它就不会弹窗)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'TRIGGER_SYSTEM_POPUP') {
        const title = event.data.title || '新消息';
        const options = {
            body: event.data.body || '你收到了一条消息',
            icon: event.data.icon || '', // 角色头像
            tag: 'ai-msg-' + Date.now(), // 确保消息不覆盖
            renotify: true, // 新消息震动/响铃
            data: event.data.data // 传递 chatId 等数据
        };

        // 显示通知
        event.waitUntil(
            self.registration.showNotification(title, options)
        );
    }
});

// 3. 监听点击通知事件 (处理跳转)
self.addEventListener('notificationclick', (event) => {
    // 关闭通知
    event.notification.close();

    // 解析参数 (从 showNotification 的 data 中获取)
    let chatId = null;
    if (event.notification.data && event.notification.data.chatId) {
        chatId = event.notification.data.chatId;
    }

    // 核心：查找并聚焦窗口
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // A. 优先寻找已经打开的窗口
            for (const client of clientList) {
                // 如果找到了当前域名的窗口
                if ('focus' in client) {
                    return client.focus().then((focusedClient) => {
                        // 聚焦成功后，发送数据给页面，让页面跳转路由
                        if (chatId) {
                            // 注意：这里直接用 client 对象发送更稳妥
                            client.postMessage({
                                action: 'open_chat_room',
                                chatId: chatId
                            });
                        }
                    });
                }
            }
            // B. 如果没有打开的窗口，则新开一个
            if (clients.openWindow) {
                // 注意：确保这里的路径正确，通常是 './' 或 './index.html'
                return clients.openWindow('./');
            }
        })
    );
});
