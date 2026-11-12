(function() {
    const root = document.getElementById('check-phone-root');
    if (!root) {
        console.error("❌ 找不到 #check-phone-root");
        return;
    }

    // 1. 注入 HTML 结构
    const htmlTemplate = `
    <!-- 隐藏的文件上传 Input -->
    <input type="file" id="cp-wallpaper-input" accept="image/*" style="display:none;">

    <!-- 1. 选人遮罩 -->
    <div id="cp-selector-overlay">
        <div class="cp-blue-glass">
            <div class="cp-blue-header">选择要检查的设备</div>
            <div class="couple-scroll-area" id="phone-char-list" style="flex:1; overflow-y:auto;"></div>
            <div class="wb-cancel-btn" onclick="closeCheckPhoneSelector()" style="margin-top:20px; text-align:center; cursor:pointer; color:#666;">取消</div>
        </div>
    </div>

    <!-- 2. 手机系统 -->
    <div id="phone-system-overlay" onclick="handleOverlayClick(event)">
        <div class="phone-bezel" onclick="event.stopPropagation()">
            <!-- 壁纸层 -->
            <div class="phone-screen-layer" id="phoneScreenBg" onclick="handleWallpaperClick(event)"></div>

            <!-- A. 锁屏层 (极简+换壁纸) -->
            <!-- 点击这个区域(空白处)会触发 handleWallpaperClick 换壁纸 -->
            <div class="lock-screen-panel" id="phoneLockScreen" onclick="handleWallpaperClick(event)">

            <div class="ls-exit-btn" onclick="window.exitPhoneSystem(); event.stopPropagation();">
                    <i class="fas fa-times"></i>
                </div>
                
                <!-- 纯净的时间日期 (无状态栏) -->
                <div class="ls-clock-container">
                    <div class="ls-date-header" id="lsDateHeader">10月9日 星期四</div>
                    <div class="ls-time-huge" id="lsTimeHuge">09:00</div>
                </div>
                
                <!-- 加载提示 -->
                <div class="lock-screen-loading" id="lsLoading">
                    <div class="cp-spinner"></div>
                    <span class="loading-text">解锁中...</span>
                </div>

                <!-- 原始样式的滑动条 (阻止点击冒泡，防止拖动时触发换壁纸) -->
                <div class="slider-container" id="unlockSlider" onclick="event.stopPropagation()">
                    <div class="slider-text">滑动查看内容</div>
                    <div class="slider-knob" id="unlockKnob"><i class="fas fa-chevron-right"></i></div>
                </div>
            </div>

            <!-- B. APP 主界面容器 -->
            <div class="app-main-container" id="appMainContainer">
                
                <!-- 顶部标题栏 -->
                <div class="cp-app-header">
                    <!-- 左侧：返回箭头 (无背景) -->
                    <div class="cp-icon-btn" onclick="handleHeaderBack()">
                        <i class="fas fa-chevron-left"></i>
                    </div>
                    
                    <div class="cp-header-title" id="cpHeaderTitle">手机</div>
                    
                    <!-- 右侧：刷新 (无背景) -->
                    <div class="cp-icon-btn" onclick="refreshPhoneData()" id="headerRefreshBtn">
                        <i class="fas fa-sync-alt" id="refreshIcon" style="font-size:16px;"></i>
                    </div>
                </div>

                <!-- 列表内容区 -->
                <div class="cp-content-area" id="cpContentArea">
                    <div class="cp-page-view active" id="view-msg"><div id="msgListContainer"></div></div>
                    <div class="cp-page-view" id="view-memo"><div id="memoListContainer"></div></div>
                    <div class="cp-page-view" id="view-shop"><div id="shopListContainer"></div></div>
                    <div class="cp-page-view" id="view-tiktok"><div id="tiktokListContainer"></div></div>
                    <div class="cp-page-view" id="view-search"><div id="searchListContainer"></div></div>
                </div>

                <!-- 底部 Tab 导航 -->
                <div class="cp-tab-bar" id="cpTabBar">
                    <div class="cp-tab-item active" onclick="switchPhoneTab('msg', this)">
                        <i class="fas fa-comment cp-tab-icon"></i><span class="cp-tab-label">微信</span>
                    </div>
                    <div class="cp-tab-item" onclick="switchPhoneTab('memo', this)">
                        <i class="far fa-sticky-note cp-tab-icon"></i><span class="cp-tab-label">备忘录</span>
                    </div>
                    <div class="cp-tab-item" onclick="switchPhoneTab('shop', this)">
                        <i class="fas fa-shopping-bag cp-tab-icon"></i><span class="cp-tab-label">购物</span>
                    </div>
                    <div class="cp-tab-item" onclick="switchPhoneTab('tiktok', this)">
                        <i class="fab fa-tiktok cp-tab-icon"></i><span class="cp-tab-label">抖音</span>
                    </div>
                    <div class="cp-tab-item" onclick="switchPhoneTab('search', this)">
                        <i class="fab fa-safari cp-tab-icon"></i><span class="cp-tab-label">浏览器</span>
                    </div>
                </div>

                <!-- ★★★ 详情页覆盖层 (全屏覆盖) ★★★ -->
                <div class="cp-detail-view" id="cpDetailView">
                    <!-- 详情页头部 (复用) -->
                    <div class="cp-app-header" style="background:#F2F3F5; border-bottom:1px solid #e0e0e0;">
                        <div class="cp-icon-btn" onclick="closeDetailView()">
                            <i class="fas fa-chevron-left"></i>
                        </div>
                        <div class="cp-header-title" id="cpDetailTitle">详情</div>
                        <div class="cp-icon-btn" style="opacity:0;"><i class="fas fa-ellipsis-h"></i></div>
                    </div>
                    
                    <div class="cp-detail-content" id="cpDetailContent">
                        <!-- 动态内容 -->
                    </div>
                </div>

            </div>
        </div>
    </div>
    `;

    root.innerHTML = htmlTemplate;

    // --- 变量 ---
    let currentCheckCharId = null;
    let isLocked = true;
    let isGenerating = false;
    let g_phoneData = null; 
    let isDetailOpen = false; 
    window.cp_data_cache = window.cp_data_cache || {};

    // --- 1. 选人逻辑 ---
    window.openCheckPhoneSelector = function() {
        const overlay = document.getElementById('cp-selector-overlay');
        const list = document.getElementById('phone-char-list');
        list.innerHTML = '';
        
        if (typeof chatList !== 'undefined' && chatList.length > 0) {
            const grid = document.createElement('div');
            grid.className = 'couple-grid';
            chatList.forEach(chat => {
                const item = document.createElement('div');
                item.className = 'couple-item';
                item.onclick = () => enterPhoneSystem(chat.id);
                item.innerHTML = `
                    <div class="couple-avatar-box"><img src="${chat.avatar}" class="couple-avatar"></div>
                    <div class="couple-name" style="color:#333;">${chat.name}</div>
                `;
                grid.appendChild(item);
            });
            list.appendChild(grid);
        } else {
            list.innerHTML = '<div style="text-align:center;color:#999;margin-top:20px;">暂无角色</div>';
        }
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('active'), 10);
    };

    window.closeCheckPhoneSelector = function() {
        const overlay = document.getElementById('cp-selector-overlay');
        overlay.classList.remove('active');
        setTimeout(() => overlay.style.display = 'none', 300);
    };

    window.cp_wallpapers_cache = window.cp_wallpapers_cache || {};

        window.enterPhoneSystem = function(charId) {
        currentCheckCharId = charId;
        closeCheckPhoneSelector();
        
        const char = chatList.find(c => c.id === charId);
        if(char) {
            document.getElementById('cpHeaderTitle').innerText = char.name + "的手机";
        }
        window.cp_data_cache = window.cp_data_cache || {};
        window.cp_wallpapers_cache = window.cp_wallpapers_cache || {};

        // 1. 初始化变量
        isLocked = true;
        isGenerating = false;
        isDetailOpen = false;
        
        // ★★★ 修复 1：优先从本地数据库恢复数据 ★★★
        if (char && char.checkPhoneData) {
            g_phoneData = char.checkPhoneData;
            window.cp_data_cache[charId] = g_phoneData; // 同步回内存
            console.log("已从数据库恢复手机数据");
        } else if (window.cp_data_cache[charId]) {
            g_phoneData = window.cp_data_cache[charId]; 
        } else {
            g_phoneData = null; 
        }

        const lockScreen = document.getElementById('phoneLockScreen');
        const homeBg = document.getElementById('phoneScreenBg'); 
        
        // ★★★ 修复 2：优先从本地数据库恢复壁纸 ★★★
        let savedWallpaper = null;
        if (char && char.checkPhoneWallpaper) {
            savedWallpaper = char.checkPhoneWallpaper;
            window.cp_wallpapers_cache[charId] = savedWallpaper;
        } else if (window.cp_wallpapers_cache[charId]) {
            savedWallpaper = window.cp_wallpapers_cache[charId];
        }
        
        if (savedWallpaper) {
            const styleString = `url(${savedWallpaper})`;
            if(lockScreen) {
                lockScreen.style.backgroundImage = styleString;
                lockScreen.style.backgroundSize = 'cover';
            }
            if(homeBg) {
                homeBg.style.backgroundImage = styleString;
                homeBg.style.backgroundSize = 'cover';
            }
        } else {
            if(lockScreen) lockScreen.style.backgroundImage = '';
            if(homeBg) homeBg.style.backgroundImage = '';
        }
        lockScreen.style.transform = 'translateY(0)';
        
        document.getElementById('lsLoading').classList.remove('show');
        document.getElementById('unlockSlider').style.opacity = 1;
        document.getElementById('unlockSlider').style.pointerEvents = 'auto';
        document.getElementById('cpDetailView').classList.remove('active');
        document.getElementById('cpTabBar').style.display = 'flex';

        resetUnlockSlider();
        updateLockScreenTime();
        switchPhoneTab('msg', document.querySelector('.cp-tab-item'));

        const overlay = document.getElementById('phone-system-overlay');
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('active'), 10);
    };


    // 头部返回按钮逻辑
    window.handleHeaderBack = function() {
        // 主界面的返回退出手机
        exitPhoneSystem();
    };

    window.exitPhoneSystem = function() {
        const overlay = document.getElementById('phone-system-overlay');
        overlay.classList.remove('active');
        setTimeout(() => overlay.style.display = 'none', 400);
    };

    window.handleOverlayClick = function(e) {
        if(e.target.id === 'phone-system-overlay') {
            exitPhoneSystem();
        }
    };

    

    // --- 4. 渲染列表 ---
    function renderAllTabs(data) {
        g_phoneData = data; // 保存全局

        // A. 消息
        const msgContainer = document.getElementById('msgListContainer');
        msgContainer.innerHTML = '';
        
        const char = chatList.find(c => c.id === currentCheckCharId);
        
        // --- 1. 渲染【我】(置顶卡片) ---
        // 获取真实的最后一条消息
        let myPreview = "暂无消息";
        let myTime = "刚刚";
        if (char && char.messages.length > 0) {
            const lastMsg = char.messages[char.messages.length - 1];
            // 简单过滤 HTML 标签
            myPreview = lastMsg.text.replace(/<[^>]+>/g, '').slice(0, 20);
            if(lastMsg.text.includes('<img')) myPreview = '[图片]';
        }
        
        // 获取我的头像
        const myAvatar = document.getElementById('meAvatarImg') ? document.getElementById('meAvatarImg').src : 'https://placehold.co/100';
        
        // ★★★ 修复点 1：尝试获取角色对我的备注 ★★★
        // 优先读取 char.user_name (如果插件支持)，否则读取 char.name 的对话对象，最后兜底 "我"
        let myName = "我"; 
        if (char.user_name) {
            myName = char.user_name; // 部分系统会有这个字段
        } else {
             // 这里可以根据你的需求自定义，比如写死 "亲爱的" 或者保持 "我"
             myName = "我"; 
        }

        // 构造置顶卡片 (这是真实的聊天入口)
        const pinnedGroup = document.createElement('div');
        pinnedGroup.className = 'cp-list-group';
        pinnedGroup.innerHTML = `
            <div class="cp-chat-card" onclick="window.openDetail('me', -1)">
                <img src="${myAvatar}" class="cp-card-avatar">
                <div class="cp-card-info">
                    <div class="cp-card-row1">
                        <span class="cp-card-name">${myName}</span>
                        <span class="cp-card-time">${myTime}</span>
                    </div>
                    <div class="cp-card-preview">${myPreview}</div>
                </div>
            </div>`;
        msgContainer.appendChild(pinnedGroup);

                // --- 2. 渲染【其他联系人】 (AI 生成) ---
        if(data.messages && data.messages.length > 0) {
            const otherGroup = document.createElement('div');
            otherGroup.className = 'cp-list-group';
            
            // ★★★ 修复点 2：过滤掉 AI 可能生成的“我/User/宝宝”等重复项 ★★★
            const filterKeywords = ['我', 'Me', 'User', '男朋友', '女朋友', '老公', '老婆', '宝宝', myName];
            
            data.messages.forEach((item, index) => {
                // 如果 AI 生成的名字包含上面的关键词，直接跳过，防止重复
                if (filterKeywords.some(k => item.name.includes(k))) return;

                const ava = `https://placehold.co/100/e0e0e0/555?text=${item.name ? item.name[0] : 'U'}`;
                
                // ★★★ 兼容多回合聊天格式 ★★★
                let displayPreview = "查看消息";
                if (item.chatHistory && item.chatHistory.length > 0) {
                    // 如果有历史记录，取最后一条作为列表页的预览
                    displayPreview = item.chatHistory[item.chatHistory.length - 1].text;
                } else {
                    // 兼容以前旧的 incoming / reply 格式
                    const incomingMsg = item.incoming || item.msg || "查看消息";
                    displayPreview = item.reply ? item.reply : incomingMsg;
                }
                
                otherGroup.innerHTML += `
                    <div class="cp-chat-card" onclick="window.openDetail('msg', ${index})">
                        <img src="${ava}" class="cp-card-avatar">
                        <div class="cp-card-info">
                            <div class="cp-card-row1">
                                <span class="cp-card-name">${item.name}</span>
                                <span class="cp-card-time">${item.time}</span>
                            </div>
                            <div class="cp-card-preview">${displayPreview}</div>
                        </div>
                    </div>`;
            });
            msgContainer.appendChild(otherGroup);
        }

                // B. 备忘录 (时间轴日记风格)
        const memoContainer = document.getElementById('memoListContainer');
        memoContainer.innerHTML = '';
        if(data.memos && data.memos.length) {
            data.memos.forEach((item) => {
                // ★★★ 修复：清理 AI 生成的首行缩进空格，并替换换行符 ★★★
                const cleanText = item.text.replace(/^[ \t]+/gm, ''); 
                const textContent = cleanText.replace(/\n/g, '<br>');
                const titleText = item.title || "记录";
                
                // 去掉了多余的 dateText 时间戳
                memoContainer.innerHTML += `
                    <div class="cp-memo-item">
                        <div class="cp-memo-header">
                            <span class="cp-memo-title">${titleText}</span>
                        </div>
                        <div class="cp-memo-box">
                            ${textContent}
                        </div>
                    </div>`;
            });
        } else { 
            memoContainer.innerHTML = '<div style="text-align:center;color:#999;margin-top:50px;">暂无备忘录</div>'; 
        }


        // C. 购物
        const shopContainer = document.getElementById('shopListContainer');
        shopContainer.innerHTML = '';
        if(data.shopping && data.shopping.length) {
            data.shopping.forEach(item => {
                shopContainer.innerHTML += `
                    <div class="cp-shop-card">
                        <div class="cp-shop-icon"><i class="fas fa-shopping-bag"></i></div>
                        <div class="cp-shop-details">
                            <div class="cp-shop-title">${item.title}</div>
                            <div class="cp-shop-price">${item.price}</div>
                        </div>
                    </div>`;
            });
        } else { shopContainer.innerHTML = '<div style="text-align:center;color:#999;margin-top:50px;">购物车为空</div>'; }

        // D. 抖音
        const tiktokContainer = document.getElementById('tiktokListContainer');
        tiktokContainer.innerHTML = '';
        if(data.tiktok && data.tiktok.length) {
            data.tiktok.forEach((item, index) => {
                tiktokContainer.innerHTML += `
                    <div class="cp-tiktok-card" onclick="window.openDetail('tiktok', ${index})">
                        <div class="cp-tiktok-cover"><i class="fas fa-play"></i></div>
                        <div class="cp-tiktok-info">
                            <div class="cp-tiktok-desc">${item.desc}</div>
                        </div>
                        <div class="cp-tiktok-like"><i class="fas fa-heart" style="color:#FE2C55"></i></div>
                    </div>`;
            });
        } else { tiktokContainer.innerHTML = '<div style="text-align:center;color:#999;margin-top:50px;">暂无喜欢的内容</div>'; }

        // E. 搜索
        const searchContainer = document.getElementById('searchListContainer');
        searchContainer.innerHTML = '';
        if(data.search && data.search.length) {
            data.search.forEach((item, index) => {
                searchContainer.innerHTML += `
                    <div class="cp-search-card" onclick="window.openDetail('search', ${index})">
                        <div class="cp-search-left">
                            <i class="fas fa-clock" style="color:#999;font-size:12px;"></i>
                            <span class="cp-search-text">${item.text}</span>
                        </div>
                    </div>`;
            });
        } else { searchContainer.innerHTML = '<div style="text-align:center;color:#999;margin-top:50px;">搜索记录为空</div>'; }
    }

        window.openDetail = function(type, index) {
        const view = document.getElementById('cpDetailView');
        const content = document.getElementById('cpDetailContent');
        const detailTitle = document.getElementById('cpDetailTitle');
        const char = chatList.find(c => c.id === currentCheckCharId);

        isDetailOpen = true;

        if (type === 'me') {
            detailTitle.innerText = "我";
            renderRealChatDetail(content, char);
            view.style.background = '#F2F3F5';
        } else if (type === 'msg') {
            const msgData = g_phoneData.messages[index];
            detailTitle.innerText = msgData.name;
            renderSimulatedChatDetail(content, msgData);
            view.style.background = '#F2F3F5';
        } else if (type === 'memo') {
            const memoData = g_phoneData.memos[index];
            detailTitle.innerText = "备忘录";
            renderMemoDetail(content, memoData);
            view.style.background = '#fff';
        } else if (type === 'tiktok') {
            const ttData = g_phoneData.tiktok[index];
            detailTitle.innerText = "视频详情";
            renderTiktokDetail(content, ttData);
            view.style.background = '#000';
        } else if (type === 'search') {
            const searchData = g_phoneData.search[index];
            detailTitle.innerText = "浏览器";
            renderSearchDetail(content, searchData);
            view.style.background = '#fff';
        }

        view.classList.add('active');
    };

    window.closeDetailView = function() {
        const view = document.getElementById('cpDetailView');
        view.classList.remove('active');
        isDetailOpen = false;
        
        setTimeout(() => {
            view.style.background = '#F2F3F5'; 
            document.getElementById('cpDetailContent').innerHTML = '';
        }, 300);
    };

    // 新增：渲染备忘录详情页
    function renderMemoDetail(container, data) {
        const titleHtml = data.title ? `<div class="md-title">${data.title}</div>` : '';
        container.innerHTML = `
            <div class="memo-detail-container">
                <div class="md-date">${data.date}</div>
                ${titleHtml}
                <div class="md-text">${data.text}</div>
            </div>
        `;
    }

    // 替换：渲染多回合聊天详情
    function renderSimulatedChatDetail(container, data) {
        const npcAvatar = `https://placehold.co/100/e0e0e0/555?text=${data.name ? data.name[0] : '?'}`;
        let charAvatar = 'https://placehold.co/100';
        if(currentCheckCharId && typeof chatList !== 'undefined') {
            const charObj = chatList.find(c => c.id === currentCheckCharId);
            if(charObj) charAvatar = charObj.avatar;
        }

        let html = `<div class="chat-detail-container"><div class="chat-time-center">${data.time}</div>`;

        if (data.chatHistory && data.chatHistory.length > 0) {
            // 新版：遍历多条聊天记录
            data.chatHistory.forEach(msg => {
                const isSelf = msg.sender === 'self';
                const rowClass = isSelf ? 'right' : 'left';
                const bubbleClass = isSelf ? 'chat-msg-right-bubble' : 'chat-msg-left-bubble';
                const avatarSrc = isSelf ? charAvatar : npcAvatar;
                
                html += `
                <div class="chat-msg-row ${rowClass}">
                    <img src="${avatarSrc}" class="chat-avatar-img">
                    <div class="chat-bubble-box">
                        <div class="chat-msg-bubble ${bubbleClass}">${msg.text.replace(/\n/g, '<br>')}</div>
                    </div>
                </div>`;
            });
        } else {
            // 兼容旧版
            const incomingText = data.incoming || data.msg || "Wait...";
            const replyText = data.reply || ""; 
            html += `
                <div class="chat-msg-row left">
                    <img src="${npcAvatar}" class="chat-avatar-img">
                    <div class="chat-bubble-box">
                        <div class="chat-msg-bubble chat-msg-left-bubble">${incomingText}</div>
                    </div>
                </div>`;
            if(replyText && replyText.trim() !== "") {
                html += `
                    <div class="chat-msg-row right">
                        <img src="${charAvatar}" class="chat-avatar-img">
                        <div class="chat-bubble-box">
                            <div class="chat-msg-bubble chat-msg-right-bubble">${replyText}</div>
                        </div>
                    </div>`;
            }
        }

        html += `</div>`; 
        container.innerHTML = html;
        
        setTimeout(() => {
            const detailContent = document.getElementById('cpDetailContent');
            if(detailContent) detailContent.scrollTop = detailContent.scrollHeight;
        }, 50);
    }


    function renderTiktokDetail(container, data) {
        // 1. 博主名字
        const randomCreators = ['生活大爆炸', '电影解说君', '每日萌宠', '旅行日记', '美食探店', '搞笑集合'];
        const creatorName = data.creator || randomCreators[Math.floor(Math.random() * randomCreators.length)];

        // 2. 视频画面描述
        const videoScript = data.script || data.desc || "视频正在缓冲...";
        
        // 3. 评论处理 (加入随机名字兜底)
        const fallbackNames = ["Momo", "熬夜冠军", "纯路人", "用户8859", "快乐小狗", "芝士雪豹", "AAA建材老王", "也就是个小号", "卡比巴拉"];
        
        let commentsHtml = '';
        if (data.comments && data.comments.length > 0) {
            data.comments.forEach(c => {
                // 如果名字是“网友”，或者为空，就随机取一个
                let finalName = c.name;
                if (!finalName || finalName === '网友' || finalName === 'User') {
                    finalName = fallbackNames[Math.floor(Math.random() * fallbackNames.length)];
                }

                const ava = `https://placehold.co/100/333/fff?text=${finalName[0]}`;
                commentsHtml += `
                <div class="tt-comment-item">
                    <img src="${ava}" class="tt-cmt-avatar">
                    <div class="tt-cmt-content">
                        <div class="tt-cmt-name">${finalName}</div>
                        <div class="tt-cmt-text">${c.text}</div>
                    </div>
                    <div class="tt-cmt-like"><i class="far fa-heart"></i></div>
                </div>`;
            });
        } else {
            commentsHtml = '<div style="text-align:center;color:#666;padding:20px;font-size:12px;">暂无评论</div>';
        }

        // 4. 渲染 (结构微调，更符合原版样式)
        container.innerHTML = `
            <div class="tiktok-detail-container">
                <!-- 视频区域 -->
                <div class="tt-video-placeholder" onclick="playTiktokDescription(this)">
                    <i class="fas fa-play" id="ttPlayIcon"></i>
                    <div id="ttHiddenScript" style="display:none;">${videoScript}</div>
                    <div class="tt-video-text-overlay" id="ttTextOverlay"></div>
                </div>

                <!-- 滚动区域：包含信息和评论 -->
                <div class="tt-scroll-content">
                    <!-- 视频信息 -->
                    <div class="tt-text-content">
                        <div class="tt-title">@${creatorName}</div>
                        <div class="tt-desc">${data.desc}</div>
                        <div class="tt-tags">#${data.tag || '推荐'} #热门</div>
                        <div class="tt-stats">
                            <span><i class="fas fa-heart"></i> ${Math.floor(Math.random()*50)}w</span>
                            <span><i class="fas fa-comment"></i> ${data.comments ? data.comments.length * 99 : 20}</span>
                            <span><i class="fas fa-share"></i> ${Math.floor(Math.random()*800)}</span>
                        </div>
                    </div>

                    <!-- 评论区分割线 -->
                    <div style="height:1px; background:#222; margin: 0 15px;"></div>

                    <!-- 评论列表 -->
                    <div class="tt-comment-section">
                        <div class="tt-cmt-header">评论 (${data.comments ? data.comments.length : 0})</div>
                        <div class="tt-cmt-list">
                            ${commentsHtml}
                        </div>
                    </div>
                </div>
            </div>`;
    }

    // --- 新增：处理点击播放文字描述的函数 ---
    window.playTiktokDescription = function(el) {
        const icon = el.querySelector('#ttPlayIcon');
        const overlay = el.querySelector('#ttTextOverlay');
        const scriptText = el.querySelector('#ttHiddenScript').innerText;

        // 如果已经播放过，就不再播放
        if (overlay.innerText.length > 0) return;

        // 隐藏播放按钮
        if(icon) icon.style.opacity = '0';

        // 打字机效果
        let i = 0;
        const speed = 50; // 打字速度
        function typeWriter() {
            if (i < scriptText.length) {
                overlay.innerHTML += scriptText.charAt(i);
                i++;
                setTimeout(typeWriter, speed);
            }
        }
        typeWriter();
    };

    // --- 3. 生成内容 (API) - 修复版：加入世界书读取 ---
    async function realGeneratePhoneContent(charId) {
        const char = chatList.find(c => c.id === charId);
        if (!char) throw new Error("角色不存在");

        // 使用主程序的中央分流路由器
    const apiConfig = window.getApiCredentials('check_phone');
    const endpoint = apiConfig.endpoint;
    const key = apiConfig.key;
    const model = apiConfig.model;
    
    if (!key) throw new Error("请先在副 API 配置中填写 Key 并勾选对应功能");

        // 1. 获取人设
        let persona = typeof getFullPersona === 'function' ? getFullPersona(char) : `角色：${char.name}\n设定：${char.charPersona}`;
        
        // 2. 获取最近聊天 (作为上下文)
        const recentChat = char.messages.slice(-20).map(m => `${m.isSelf ? '用户' : '我'}: ${m.text}`).join('\n');
        
                let wbContext = "";
        // 检查主程序里有没有这个函数 (script.js 里的)
        if (typeof getWorldBookContext === 'function') {
            // 传入 char 和 recentChat (用于检测关键词触发的条目)
            wbContext = getWorldBookContext(char, recentChat);
            console.log("查手机已注入世界书长度:", wbContext.length);
        } else {
            console.warn("未找到 getWorldBookContext 函数，无法读取世界书");
        }

                // ★★★ 新增：读取线上与线下记忆总结 ★★★
        let onlineMemText = "";
        if (char.summaries && char.summaries.length > 0) {
            onlineMemText = char.summaries.slice(-2).map(s => `[记录于 ${s.date}]: ${s.content}`).join('\n');
        }

        let offlineMemText = "";
        if (char.offlineSummaries && char.offlineSummaries.length > 0) {
            offlineMemText = char.offlineSummaries.slice(-2).map((s, i) => `[线下记忆片段${i+1}]: ${s.content}`).join('\n');
        } else if (char.offlineSummary) {
            offlineMemText = char.offlineSummary;
        }


        const systemPrompt = `
你现在扮演“${char.name}”，正在展示你手机里的真实内容。

【背景设定】：
${persona}

【必须遵守的世界观/额外设定】：
${wbContext}

${onlineMemText ? `【线上微信记忆摘要】：\n${onlineMemText}\n` : ''}
${offlineMemText ? `【线下剧场/约会记忆】：\n${offlineMemText}\n` : ''}

【最近聊天摘要】：
${recentChat}

【任务要求】：
生成以下 5 个模块的 JSON 数据。请根据上面的【世界观】、【人设】和【记忆摘要】来生成内容。

1. **messages (微信消息)**：
   - 生成 3-5 个其他联系人（父母、朋友、同学、世界观里的NPC等）。
   - **禁止**生成与“我/User/宝宝”等代指玩家本人的直接聊天记录。
   - **核心要求1：极其真实的碎片化聊天！** 绝对不要把长篇大论塞进一个气泡里！像现代真人发微信一样，**一句话甚至几个字就发一条**。如果对方有很多事要说，必须拆分成连续的 3-5 条短消息连发！
   - **核心要求2：多回合拉扯**。模拟真实的聊天流（因为拆分得很细，每个联系人请生成 6-15 条短对话）。
   - **核心要求3：关联最近聊天与记忆**。请让其中 **1-2个联系人** 的聊天话题，与上面的【最近聊天摘要】或【记忆摘要】中发生的事情相关！（比如在背后和闺蜜/兄弟吐槽线下约会的细节、分享、求助关于 User 的事情，或者提及刚刚发生的事）。
   - 字段格式：包含 name, time, 以及 chatHistory 数组（sender 为 "other" 表示对方发来的，"self" 表示你发出的）。

2. **search (浏览器/社区历史)**：
   - **数量要求**：生成 5-10 条记录。
   - **核心要求**：请为其中 5 到 8条记录生成详细的“正文(forumBody)”和“评论区(forumReplies)”。
   - **内容类型**：吐槽贴、求助贴、日常记录等。
   - **评论格式 (forumReplies) 重要指令**：
     - **name 字段**：**不要编造名字！** 所有路人/陌生人统一填写 **"网友"**。只有当你（楼主）回复时，name 填写 **"${char.name}"**。
     - **★★★ 核心要求：评论区必须热闹！每篇帖子必须强制生成 8 到 15 条评论！！！绝对不能少于8条！★★★**
     - **你的互动**：请在评论区里挑 1-2 条进行回复。回复格式必须使用 **"回复X楼："**，不要使用 "@用户名"。

3. **tiktok (抖音/短视频)**：
   - 生成 2-4 条视频。包含 creator(博主名), desc(文案), script(画面描述), comments(3-5条评论)。

4. **其他模块**：
   - memos (备忘录)：生成 2-4 条。**核心要求**：不要只写干瘪的“买菜/拿快递”。请结合【线下约会记忆】或【线上聊天】，写一些符合人设的“私人记录”，比如：关于 User 的暗中观察日记、吃醋记录、吵架后的反思、或者不可告人的小秘密。
     - 字段必须包含：title(标题), date(日期), text(正文内容，可以详细一点)。
   - shopping (购物车)：1-3 条。

【输出格式 (JSON 示例)】：
{
  "messages": [ 
      {
          "name": "高扬", 
          "time": "17:30",
          "chatHistory": [
              {"sender": "other", "text": "周一训练你来吗"},
              {"sender": "other", "text": "教练说要定名单了"},
              {"sender": "self", "text": "去"},
              {"sender": "other", "text": "行"},
              {"sender": "other", "text": "记得把训练服带上"},
              {"sender": "other", "text": "对了"},
              {"sender": "other", "text": "物理错题集整理好没"},
              {"sender": "other", "text": "借我抄下思路[可怜]"},
              {"sender": "self", "text": "在书包里"},
              {"sender": "self", "text": "周一给你"}
          ]
      },
      {
          "name": "死党",
          "time": "刚刚",
          "chatHistory": [
              {"sender": "self", "text": "救命"},
              {"sender": "self", "text": "我好像说错话了"},
              {"sender": "other", "text": "？"},
              {"sender": "other", "text": "你又干嘛了"},
              {"sender": "self", "text": "（结合最近聊天摘要的内容进行极短的吐槽...）"}
          ]
      }
  ],
  "memos": [ 
      {
          "title": "关于(User名字)的观察日记", 
          "date": "10月9日 23:00", 
          "text": "今天他/她居然... 真的好可爱，但是又不想直接跟他说。下次要记得惹他/她生气的时候买那个蛋糕哄一下。"
      }
  ],
  "shopping": [ {"title": "复古胶片相机", "price": "¥299"} ],
  "tiktok": [ 
      {
          "creator": "甚至有点好笑",
          "desc": "异地恋怎么维持新鲜感？", 
          "tag": "情感心理", 
          "script": "镜头对着博主...",
          "comments": [{"name": "网友", "text": "太真实了"}]
      }
  ],
  "search": [ 
      {
          "text": "（吐槽）男朋友是个直男是什么体验", 
          "time": "18:00",
          "forumBody": "真的服了，昨天我暗示他...",
          "forumReplies": [
              {"name": "网友", "text": "同一个世界同一个男友。"},
              {"name": "${char.name}", "text": "回复1楼：太难了。"}
          ]
      }
  ]
}
        `;

        


        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${key}` 
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.8
            })
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status} (请检查Key或模型)`);
        }

        const data = await response.json();

        // 1. 拦截“假成功”
        if (
            (data.usage && data.usage.completion_tokens === 0) || 
            (data.choices && data.choices.length > 0 && data.choices[0].finish_reason === "content_filter")
        ) {
            throw new Error("生成失败：内容被AI模型拦截或为空，请修改提示词后重试。");
        }

        // 2. 拦截“结构错误”
        if (!data.choices || data.choices.length === 0) {
            if (data.error && data.error.message) {
                const cleanError = data.error.message.length > 50 ? data.error.message.slice(0, 50) + "..." : data.error.message;
                throw new Error(`API报错: ${cleanError}`);
            }
            throw new Error("生成失败：内容被AI模型拦截或为空，请修改提示词后重试。");
        }

        let content = data.choices[0].message.content;

        content = content.replace(/```json/gi, '').replace(/```/g, '').trim();
        const first = content.indexOf('{');
        const last = content.lastIndexOf('}');
        if (first !== -1 && last !== -1) {
            content = content.substring(first, last + 1);
        }
        
        return JSON.parse(content);
    }

    // --- 6. 交互：滑动解锁 (修改版：仅解锁，不刷新) ---
    async function triggerUnlockProcess() {
        // 如果正在交互中，防止重复触发
        if(isGenerating) return; 
        
        // UI 动画：滑块滑到底
        const knob = document.getElementById('unlockKnob');
        const slider = document.getElementById('unlockSlider');
        const maxMove = slider.offsetWidth - knob.offsetWidth - 8;
        knob.style.transform = `translateX(${maxMove}px)`; 
        slider.style.pointerEvents = 'none';
        document.querySelector('.slider-text').style.opacity = 0;
        
        // 显示一点点加载动画，增加仪式感（也可以去掉）
        document.getElementById('lsLoading').classList.add('show');

        // 模拟解锁延迟 (500ms)，让用户感觉像真手机解锁
        setTimeout(() => {
            // ★★★ 核心逻辑修改：不生成，直接渲染 ★★★
            
            if (g_phoneData) {
                // 1. 如果有缓存数据，直接显示
                renderAllTabs(g_phoneData);
            } else {
                // 2. 如果没有数据（第一次进），渲染空状态
                // 构造一个全空的对象，防止 renderAllTabs 报错
                const emptyData = {
                    messages: [],
                    memos: [{ date: "系统", text: "暂无数据，请点击右上角刷新按钮获取内容。" }], // 提示用户去刷新
                    shopping: [],
                    tiktok: [],
                    search: []
                };
                renderAllTabs(emptyData);
            }

            // 执行解锁动作
            isLocked = false;
            document.getElementById('phoneLockScreen').style.transform = 'translateY(-100%)';
            
            // 重置 UI 状态
            document.getElementById('lsLoading').classList.remove('show');
            isGenerating = false;
            
        }, 600); 
    }

        window.refreshPhoneData = async function() {
        if(!currentCheckCharId) return;
        
        const icon = document.getElementById('refreshIcon');
        icon.classList.add('fa-spin'); // 图标转圈圈
        
        try {
            // 调用 AI 生成接口
            const data = await realGeneratePhoneContent(currentCheckCharId);
            
            // 存入内存缓存
            window.cp_data_cache[currentCheckCharId] = data;
            g_phoneData = data; 
            
            // ★★★ 修复 3：生成成功后，存入主数据库，防止刷新丢失 ★★★
            const char = chatList.find(c => c.id === currentCheckCharId);
            if (char) {
                char.checkPhoneData = data;
                if (typeof saveData === 'function') saveData();
            }
            
            // 渲染界面
            renderAllTabs(data);
            
        } catch(e) {
            alert("刷新失败: " + e.message);
        } finally {
            icon.classList.remove('fa-spin'); // 停止转圈
        }
    };


    window.switchPhoneTab = function(tabName, el) {
        document.querySelectorAll('.cp-tab-item').forEach(item => item.classList.remove('active'));
        el.classList.add('active');
        document.querySelectorAll('.cp-page-view').forEach(view => view.classList.remove('active'));
        document.getElementById('view-' + tabName).classList.add('active');
    };

    window.handleWallpaperClick = function(e) {
        if (!isLocked) document.getElementById('cp-wallpaper-input').click();
    };
    
    const wallpaperInput = document.getElementById('cp-wallpaper-input');
    if (wallpaperInput) {
        // 1. 克隆节点：移除旧的监听器，防止重复绑定导致代码运行多次
        const newWallpaperInput = wallpaperInput.cloneNode(true);
        wallpaperInput.parentNode.replaceChild(newWallpaperInput, wallpaperInput);

        // 2. 添加新的监听器
        newWallpaperInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            // 必须要有当前角色ID才能保存，否则不知道存给谁
            if (!currentCheckCharId) {
                console.error("未找到当前角色ID，无法保存壁纸");
                return;
            }

                        const reader = new FileReader();
            reader.onload = function(evt) {
                const resultSrc = evt.target.result;
                const bgUrl = `url(${resultSrc})`;

                // --- A. 应用到当前界面 (立刻生效) ---
                
                // 1. 锁屏层 (Lock Screen)
                const lockScreen = document.getElementById('phoneLockScreen');
                if (lockScreen) {
                    lockScreen.style.backgroundImage = bgUrl;
                    lockScreen.style.backgroundSize = 'cover';
                    lockScreen.style.backgroundPosition = 'center';
                }

                // 2. 主屏幕底层 (Home Screen)
                const homeBg = document.getElementById('phoneScreenBg');
                if (homeBg) {
                    homeBg.style.backgroundImage = bgUrl;
                    homeBg.style.backgroundSize = 'cover';
                    homeBg.style.backgroundPosition = 'center';
                }

                // --- B. 保存到全局缓存 (下次进来还有) ---
                window.cp_wallpapers_cache = window.cp_wallpapers_cache || {};
                window.cp_wallpapers_cache[currentCheckCharId] = resultSrc;
                
                // ★★★ 修复 4：将壁纸存入主数据库，防止刷新丢失 ★★★
                const char = chatList.find(c => c.id === currentCheckCharId);
                if (char) {
                    char.checkPhoneWallpaper = resultSrc;
                    if (typeof saveData === 'function') saveData();
                }
                
                console.log(`已保存角色 [${currentCheckCharId}] 的壁纸`);
            };
            reader.readAsDataURL(file);

            // 清空 value 以便下次还能选同一张图
            e.target.value = '';
        });
    }

    // --- 确保点击锁屏任意位置触发换图 ---
    window.handleWallpaperClick = function(e) {
        // 只有在锁定状态下点击才有效
        if (isLocked) {
             const input = document.getElementById('cp-wallpaper-input');
             if(input) input.click();
        }
    };

    // 滑动条
    const slider = document.getElementById('unlockSlider');
    const knob = document.getElementById('unlockKnob');
    let isDragging = false, startX = 0;

    function resetUnlockSlider() {
        knob.style.transform = 'translateX(0px)';
        document.querySelector('.slider-text').style.opacity = 1;
        document.getElementById('unlockSlider').style.pointerEvents = 'auto';
    }

    function onDragStart(e) {
        if(isGenerating) return;
        isDragging = true;
        startX = (e.touches ? e.touches[0].clientX : e.clientX);
        knob.style.transition = 'none';
    }
    function onDragMove(e) {
        if (!isDragging || isGenerating) return;
        const currentX = (e.touches ? e.touches[0].clientX : e.clientX);
        let diff = currentX - startX;
        const maxMove = slider.offsetWidth - knob.offsetWidth - 8;
        if (diff < 0) diff = 0;
        if (diff > maxMove) diff = maxMove;
        knob.style.transform = `translateX(${diff}px)`;
        document.querySelector('.slider-text').style.opacity = 1 - (diff / maxMove);
        if (diff >= maxMove - 5) {
            isDragging = false;
            triggerUnlockProcess();
        }
    }
    function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        knob.style.transition = 'transform 0.3s';
        knob.style.transform = 'translateX(0px)';
        document.querySelector('.slider-text').style.opacity = 1;
    }

    knob.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
    knob.addEventListener('touchstart', onDragStart);
    window.addEventListener('touchmove', onDragMove);
    window.addEventListener('touchend', onDragEnd);

    // --- 极简时间更新 (日期在上，时间在下) ---
    function updateLockScreenTime() {
        const now = new Date();
        
        // 1. 日期行 (10月9日 星期四)
        const month = now.getMonth() + 1;
        const date = now.getDate();
        const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        const dayStr = days[now.getDay()];
        const dateStr = `${month}月${date}日 ${dayStr}`;

        // 2. 时间行 (09:00)
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${hh}:${mm}`;

        const timeEl = document.getElementById('lsTimeHuge');
        const dateEl = document.getElementById('lsDateHeader');
        
        if (dateEl) dateEl.innerText = dateStr;
        if (timeEl) timeEl.innerText = timeStr;
    }

    // --- 点击换壁纸处理 ---
    window.handleWallpaperClick = function(e) {
        // 如果正在解锁或已经解锁，不触发
        if (!isLocked) return;
        // 触发文件选择
        document.getElementById('cp-wallpaper-input').click();
    };

    console.log("✅ 查手机 V3.5 (海盐仿微信版) 已加载");
})();

    // --- 补回丢失的函数：浏览器/论坛详情渲染 (终极防报错版) ---
    function renderSearchDetail(container, data) {
        let charName = "匿名用户";
        let charAvatar = "https://placehold.co/100";
        
        // 【核心修复】：直接从手机界面的标题栏获取名字，彻底避开作用域报错！
        const titleEl = document.getElementById('cpHeaderTitle');
        if (titleEl && typeof chatList !== 'undefined') {
            const extractedName = titleEl.innerText.replace('的手机', '');
            const charObj = chatList.find(c => c.name === extractedName);
            if (charObj) {
                charName = charObj.name;
                charAvatar = charObj.avatar;
            }
        }

        const postTitle = data.text || "无标题";
        const postBody = data.forumBody || data.text; 
        const replies = data.forumReplies || [];

        let repliesHtml = '';
        if (replies.length > 0) {
            replies.forEach((rep, idx) => {
                const repName = rep.name || "";
                const isLZ = (repName === charName || repName === '楼主' || repName.includes(charName));
                const badgeHtml = isLZ ? `<span class="fc-lz-badge" style="margin-left:6px;">楼主</span>` : '';
                const floorNum = idx + 1;

                let displayText = rep.text;
                displayText = displayText.replace(/@[\w\u4e00-\u9fa5]+\s?[:：]?/g, ''); 
                displayText = displayText.replace(/(回复\d+楼[:：]?)/g, '<span style="color:#999;font-size:0.9em;margin-right:4px;">$1</span>');
                displayText = displayText.replace(/^(回复[:：])/g, '<span style="color:#999;font-size:0.9em;margin-right:4px;">$1</span>');

                repliesHtml += `
                <div class="forum-comment-item">
                    <div class="fc-meta-row">
                        <span class="fc-floor-label">${floorNum}楼</span>
                        ${badgeHtml}
                    </div>
                    <div class="fc-content" style="margin-top:4px;">${displayText}</div>
                </div>`;
            });
        } else {
            repliesHtml = '<div style="padding:40px;text-align:center;color:#ccc;font-size:13px;">- 暂无回复 -</div>';
        }

        container.innerHTML = `
            <div class="cp-forum-container">
                <div class="forum-main-area">
                    <div class="forum-header-row">
                        <img src="${charAvatar}" class="forum-avatar">
                        <div class="forum-user-name">${charName}</div>
                    </div>
                    <div class="forum-post-title">${postTitle}</div>
                    <div class="forum-post-body">${postBody}</div>
                </div>
                <div class="forum-reply-divider"></div>
                <div class="forum-reply-title">全部回复 (${replies.length})</div>
                <div class="forum-comment-list">${repliesHtml}</div>
            </div>`;
    }
