'use strict';
(() => {
    const navigation = document.querySelectorAll('#wechat-bottom-nav .nav-item');
    const navItems = [
        ['信息', '<path d="M4 3h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8l-6 4V5a2 2 0 0 1 2-2Z"/>'],
        ['日记', '<rect x="4" y="2" width="16" height="20" rx="3"/><path d="M8 7h8M8 11h8M8 15h5"/>'],
        ['动态', '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>'],
        ['我的', '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>']
    ];
    navigation.forEach((item,index) => {
        const [label,path] = navItems[index];
        item.setAttribute('role','button');
        item.setAttribute('tabindex','0');
        item.setAttribute('aria-label',label);
        item.querySelector('span').dataset.iosLabel = label;
        item.querySelector('.nav-icon').innerHTML = '<svg class="ios-account-nav-svg" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
        item.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault();item.click(); }
        });
    });
    const control = document.getElementById('apiKeepAliveToggle');
    const status = document.getElementById('apiKeepAliveStatus');
    let pending = false;
    function sync() {
        const track = musicPlaylist[currentMusicIndex];
        const active = !!track?.isKeepAlive && !audioPlayer.paused;
        control.setAttribute('aria-checked', String(active));
        status.textContent = pending ? '正在开启…' : active ? '播放中' : '已关闭';
    }
    control.addEventListener('click', async () => {
        if (pending) return;
        const track = musicPlaylist[currentMusicIndex];
        if (track?.isKeepAlive && !audioPlayer.paused) {
            audioPlayer.pause();
            sync();
            return;
        }
        const index = musicPlaylist.findIndex(item => item.isKeepAlive);
        if (index === -1) {
            status.textContent = '尚未就绪，请稍后重试';
            return;
        }
        pending = true;
        sync();
        try {
            // Reuse the application's existing looping keep-alive track and player.
            playTrack(index);
            await audioPlayer.play();
        } catch {
            pending = false;
            sync();
            status.textContent = '播放失败，请重试';
            return;
        } finally {
            pending = false;
        }
        sync();
    });
    for (const event of ['playing', 'pause', 'ended', 'emptied']) audioPlayer.addEventListener(event, sync);
    audioPlayer.addEventListener('error', () => {
        if (musicPlaylist[currentMusicIndex]?.isKeepAlive) {
            pending = false;
            control.setAttribute('aria-checked', 'false');
            status.textContent = '播放失败，请重试';
        }
    });
    sync();
})();
