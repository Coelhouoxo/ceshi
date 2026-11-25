'use strict';
(() => {
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
