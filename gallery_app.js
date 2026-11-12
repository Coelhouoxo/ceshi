/* --- gallery_app.js --- */

let currentGalleryCharId = null; 
let isPhotoDeleteMode = false;   
let longPressTimer = null;       

/* --- gallery_app.js --- */

function initGalleryApp() {
    if (!document.getElementById('galleryAppPage')) {
        const appHtml = `
        <div id="galleryAppPage">
            <!-- 背景 Input (保持不变) -->
            <input type="file" id="gal-bg-input" accept="image/*" style="display:none;" onchange="handleGalBgChange(this)">
            
            <div class="gal-header">
                <div class="gal-nav-icon" onclick="exitGalleryApp()">
                    <i class="fas fa-chevron-left"></i>
                </div>
                <div class="gal-title">相册</div>
                <!-- 修改：点击加号触发菜单，而不是直接上传 -->
                <div class="gal-action-icon" onclick="toggleGalAddMenu(event)">
                    <i class="fas fa-plus"></i>
                </div>
            </div>

            <!-- ★★★ 新增：添加方式选择菜单 ★★★ -->
            <div id="galAddMenu" class="gal-add-menu">
                <div class="gal-menu-item" onclick="handleGalAddAction('link')">
                    <i class="fas fa-link"></i> 图片链接
                </div>
                <div class="gal-menu-item" onclick="handleGalAddAction('local')">
                    <i class="fas fa-image"></i> 本地图片
                </div>
            </div>
            
            <div class="gal-scroll-view" onclick="handleGalBgClick()">
                <div class="gal-top-bar">
                    <div class="gal-circle-grid" id="galCharList"></div>
                </div>

                <div class="gal-photo-area">
                    <div id="galPhotoGrid" class="gal-polaroid-grid"></div>
                </div>
            </div>
            
            <!-- 上传 Input (保持不变) -->
            <input type="file" id="gal-upload-input" accept="image/*" style="display:none;" onchange="handleGalFile(this)">
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', appHtml);
    }
}

// 2. 打开 App
function openGalleryApp() {
    const overlay = document.getElementById('appOverlay');
    overlay.classList.add('active');
    initGalleryApp();

    ['chatAppPage', 'genericAppPage', 'forumPage'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });
    
    const page = document.getElementById('galleryAppPage');
    page.style.display = 'flex';
    
    if (globalData && globalData.galleryBg) {
        page.style.backgroundImage = `url(${globalData.galleryBg})`;
    } else {
        page.style.backgroundImage = 'none';
        page.style.backgroundColor = '#FFF2F4';
    }

    if (chatList && chatList.length > 0) {
        if (!currentGalleryCharId || !chatList.find(c => c.id === currentGalleryCharId)) {
            currentGalleryCharId = chatList[0].id;
        }
    } else {
        currentGalleryCharId = null;
    }

    renderGalInterface();
}

function exitGalleryApp() {
    const page = document.getElementById('galleryAppPage');
    if (page) page.style.display = 'none';
    if (typeof closeApp === 'function') closeApp();
    else document.getElementById('appOverlay').classList.remove('active');
    exitDeleteMode();
}

// 3. 渲染主界面
function renderGalInterface() {
    renderCircleList();
    renderPhotoWall();
}

// 渲染圆形头像列表
function renderCircleList() {
    const container = document.getElementById('galCharList');
    container.innerHTML = '';
    
    if (!chatList || chatList.length === 0) return;

    chatList.forEach((chat) => {
        const item = document.createElement('div');
        const isActive = (chat.id === currentGalleryCharId);
        item.className = `gal-circle-item ${isActive ? 'active' : ''}`;
        
        item.onclick = (e) => {
            e.stopPropagation();
            switchGalChar(chat.id);
        };

        item.innerHTML = `
            <div class="gal-circle-img-wrap">
                <img src="${chat.avatar}" class="gal-circle-img">
            </div>
            <div class="gal-circle-name">${chat.name}</div>
        `;
        container.appendChild(item);
    });
}

function switchGalChar(id) {
    if (currentGalleryCharId === id) return;
    currentGalleryCharId = id;
    exitDeleteMode(); 
    renderGalInterface(); 
}

// 渲染照片墙
function renderPhotoWall() {
    const grid = document.getElementById('galPhotoGrid');
    grid.innerHTML = '';
    
    // 如果没有选中角色，保持空白（或者您保留之前的提示也可以，这里统一清空）
    if (!currentGalleryCharId) {
        grid.innerHTML = ''; 
        return;
    }

    const chat = chatList.find(c => c.id === currentGalleryCharId);
    if (!chat) return;

    // ★★★ 修改点：如果相册为空，直接留白，不再显示提示文字 ★★★
    if (!chat.gallery || chat.gallery.length === 0) {
        grid.innerHTML = ''; // 这里之前是提示文字，现在清空
        return;
    }

    // 渲染照片列表（逻辑保持不变）
    [...chat.gallery].reverse().forEach((photo, index) => {
        const rot = (Math.random() * 6 - 3).toFixed(1);
        
        const card = document.createElement('div');
        card.className = 'gal-polaroid-photo';
        if (isPhotoDeleteMode) card.classList.add('shake-mode');
        card.style.transform = `rotate(${rot}deg)`;
        
        bindLongPress(card);

        card.onclick = (e) => {
            e.stopPropagation();
            if (isPhotoDeleteMode) return; 
            if(window.showPhotoDescription) {
                // 如果您有查看大图的功能
                window.showPhotoDescription(photo.description, e);
            }
        };

        // 绑定删除按钮逻辑
        card.innerHTML = `
            <div class="gal-photo-del" onclick="deleteGalPhoto(${index}, event)">×</div>
            <img src="${photo.url}">
        `;
        grid.appendChild(card);
    });
}

// 4. 长按逻辑
function bindLongPress(element) {
    const start = (e) => {
        if (isPhotoDeleteMode) return;
        longPressTimer = setTimeout(() => {
            enterDeleteMode();
            if(navigator.vibrate) navigator.vibrate(50);
        }, 800);
    };

    const cancel = (e) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    element.addEventListener('touchstart', start, {passive: true});
    element.addEventListener('touchend', cancel);
    element.addEventListener('touchmove', cancel);
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', cancel);
    element.addEventListener('mouseleave', cancel);
}

function enterDeleteMode() {
    isPhotoDeleteMode = true;
    const cards = document.querySelectorAll('.gal-polaroid-photo');
    cards.forEach(c => c.classList.add('shake-mode'));
}

function exitDeleteMode() {
    isPhotoDeleteMode = false;
    const cards = document.querySelectorAll('.gal-polaroid-photo');
    cards.forEach(c => c.classList.remove('shake-mode'));
}

// 5. 删除照片
function deleteGalPhoto(index, event) {
    event.stopPropagation();
    const chat = chatList.find(c => c.id === currentGalleryCharId);
    
    if (chat) {
        if (confirm("确定要撕掉这张照片吗？")) {
            const realIndex = chat.gallery.length - 1 - index;
            chat.gallery.splice(realIndex, 1);
            saveData();
            renderPhotoWall();
            if (chat.gallery.length === 0) exitDeleteMode();
        }
    }
}

// 6. 背景更换
function handleGalBgClick() {
    if (isPhotoDeleteMode) {
        exitDeleteMode();
        return;
    }
    triggerGalBgChange();
}

function triggerGalBgChange() {
    document.getElementById('gal-bg-input').click();
}

function handleGalBgChange(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const bgUrl = e.target.result;
        document.getElementById('galleryAppPage').style.backgroundImage = `url(${bgUrl})`;
        if (!globalData) globalData = {};
        globalData.galleryBg = bgUrl;
        saveData();
    };
    reader.readAsDataURL(file);
    input.value = '';
}

// 7. 图片上传
function triggerGalUpload() {
    if (!currentGalleryCharId) {
        alert("请先选择一个角色 (点击头像)");
        return;
    }
    document.getElementById('gal-upload-input').click();
}

function handleGalFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        processGalSave(e.target.result);
    };
    reader.readAsDataURL(file);
    input.value = '';
}

function processGalSave(url) {
    const desc = prompt("【AI 识别标签】\n这张照片是什么？(例如: 在游乐园)\n描述仅供 AI 读取，不会显示在相册上。");
    if (!desc) return; 

    const chat = chatList.find(c => c.id === currentGalleryCharId);
    if (chat) {
        if (!chat.gallery) chat.gallery = [];
        chat.gallery.push({
            id: Date.now(),
            url: url,
            description: desc
        });
        saveData();
        renderPhotoWall();
    }
}

// AI 接口
window.getGalleryPromptContext = function(chat) {
    if (!chat.gallery || chat.gallery.length === 0) return "";
    const photos = chat.gallery.slice(0, 15).map(p => {
        return `- ID:${p.id} | 内容:${p.description}`;
    }).join('\n');
    return `\n【你的私密相册】照片(ID|内容)：\n${photos}\n如需发送请输出JSON：{ "action": "SEND_GALLERY_IMG", "photoId": ID, "text": "配文" }\n`;
};

window.handleGalleryCommand = function(chat, jsonResult) {
    if (jsonResult.action === 'SEND_GALLERY_IMG' && jsonResult.photoId) {
        const photo = chat.gallery.find(p => p.id == jsonResult.photoId);
        if (photo) {
            console.log(`[相册] 发送: ${photo.description}`);
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            const imgHtml = `<img src="${photo.url}" class="photo-msg-img" data-desc="${photo.description}" onclick="showPhotoDescription(this.dataset.desc, event)">`;
            if (jsonResult.text) {
                chat.messages.push({ text: jsonResult.text, isSelf: false, time: timeStr, timestamp: Date.now() });
            }
            chat.messages.push({
                text: imgHtml, isSelf: false, time: timeStr, timestamp: Date.now() + 10,
                contentDescription: `[分享照片：${photo.description}]`
            });
            return true;
        }
    }
    return false;
};

// --- 新增：菜单控制逻辑 ---

// 1. 切换菜单显示/隐藏
function toggleGalAddMenu(e) {
    if(e) e.stopPropagation(); // 阻止冒泡，防止触发背景点击
    
    // 检查是否选了角色
    if (!currentGalleryCharId) {
        alert("请先选择一个角色 (点击头像)");
        return;
    }

    const menu = document.getElementById('galAddMenu');
    if (menu.classList.contains('active')) {
        menu.classList.remove('active');
    } else {
        menu.classList.add('active');
    }
}

// 2. 处理菜单点击
function handleGalAddAction(type) {
    // 关掉菜单
    document.getElementById('galAddMenu').classList.remove('active');
    
    if (type === 'local') {
        // 触发本地文件选择
        document.getElementById('gal-upload-input').click();
    } else if (type === 'link') {
        // 触发链接输入
        const url = prompt("请输入图片链接 (URL):");
        if (url && url.trim() !== "") {
            // 直接调用保存流程
            processGalSave(url.trim());
        }
    }
}

// 3. 修改背景点击逻辑，增加“点击空白处关闭菜单”的功能
// (替换原来的 handleGalBgClick)
function handleGalBgClick() {
    // 如果菜单是打开的，先关闭菜单
    const menu = document.getElementById('galAddMenu');
    if (menu && menu.classList.contains('active')) {
        menu.classList.remove('active');
        return; // 不触发换背景
    }

    if (isPhotoDeleteMode) {
        exitDeleteMode();
        return;
    }
    
    triggerGalBgChange();
}

// 4. (保持不变，确认一下) 图片处理逻辑
function handleGalFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        processGalSave(e.target.result); // 这里传入的是 base64
    };
    reader.readAsDataURL(file);
    input.value = '';
}

// 5. (保持不变，确认一下) 保存逻辑
function processGalSave(url) {
    // 弹窗让用户输入描述，这个描述就是 AI 识别图片的关键
    const desc = prompt("【AI 识别标签】\n这张照片是什么？(例如: 在游乐园自拍)\n描述越准确，AI 发图的时机越准。");
    
    // 如果用户点了取消，或者没填，就不保存
    if (!desc) return; 

    const chat = chatList.find(c => c.id === currentGalleryCharId);
    if (chat) {
        if (!chat.gallery) chat.gallery = [];
        
        // 保存数据
        chat.gallery.push({
            id: Date.now(),
            url: url,          // 无论是本地Base64还是网络链接，都存在这里
            description: desc  // AI 依靠这个字段来决定发什么图
        });
        
        saveData();       // 保存到数据库
        renderPhotoWall(); // 刷新界面
    }
}