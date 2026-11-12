// 全局变量
let currentCoupleChatId = null;
let cpInputMode = 'post'; // 'post' 发动态, 'reply' 回复评论
let cpReplyContext = null; // { momentId, replyToName }
let currentCpTab = 'moments'; 
let cpCalCurrentDate = new Date(); 
let cpSelectedDateStr = null;  
let currentSelectedMoodId = null;
// --- 1. 界面导航逻辑 ---

// 打开情侣空间（进入选人界面）
function openCoupleSpace() {
    const overlay = document.getElementById('couple-space-overlay');
    if (overlay) {
        overlay.classList.add('active'); 
        renderCoupleSelector();
    }
}

// 关闭界面
function closeCoupleSpace() {
    const overlay = document.getElementById('couple-space-overlay');
    if (overlay) overlay.classList.remove('active');
}

async function checkAiPeriodAlert(chat) {
    if (!chat.coupleData || !chat.coupleData.periodMap) return;

    // 1. 获取今天的日期字符串
    const today = new Date();
    const todayStr = getFormatDateStr(today);
    
    // 2. ★★★ 核心修复：检查防骚扰冷却期 ★★★
    // 如果上次提醒的日期存在
    if (chat.coupleData.lastPeriodAlertDate) {
        const lastAlertDate = new Date(chat.coupleData.lastPeriodAlertDate);
        const diffTime = Math.abs(today - lastAlertDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // 如果 7 天内已经提醒过一次了，就绝对不要再说话了
        // 这样每个月的经期只会触发一次提醒
        if (diffDays < 7) return; 
    }

    // 3. 检查未来 2 天是否有 "predict" (预测经期)
    // 我们检查 今天、明天
    const checkDays = [0, 1];
    let isComing = false;
    
    for (let i of checkDays) {
        let d = new Date(today);
        d.setDate(d.getDate() + i);
        let dStr = getFormatDateStr(d);
        
        if (chat.coupleData.periodMap[dStr] === 'predict') {
            isComing = true;
            break;
        }
    }

    if (isComing) {
        // 记录今天已提醒 (先记录，防止重复触发)
        chat.coupleData.lastPeriodAlertDate = todayStr;
        saveData();
        
        // ★ 触发 AI 发送真实消息
        await triggerAiPeriodPopup(chat);
    }
}

// 触发 AI 经期关怀 (修复版：写入聊天记录)
async function triggerAiPeriodPopup(chat) {
    const apiKey = document.getElementById('apiKey').value;
    const endpoint = document.getElementById('apiEndpoint').value;
    const model = document.getElementById('apiModel').value;
    
    // 构造提示词
    const persona = getFullPersona(chat);
    const prompt = `
    你现在是 ${chat.name}，我是你的恋人。
    ${persona}
    
    【重要事件】：根据日历预测，我的经期（大姨妈）这两天就要到了。
    【任务】：
    请立刻给我发一条消息。
    语气要非常口语化，符合你的性格。
    可以提醒我不要吃冰的，或者说你会帮我揉肚子、陪着我。
    ★要求：20字以内，不要带引号，口语化。★
    `;

    try {
        // 1. 如果没有 Key，用默认文案
        if (!apiKey) {
            const defaultMsg = "宝宝，那几天快到了，记得别吃凉的哦，我会陪着你的。";
            sendRealPeriodMsg(chat, defaultMsg);
            return;
        }

        // 2. 调用 AI
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            })
        });
        const data = await response.json();
        const aiReply = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');

        // 3. ★★★ 核心：发送真实消息 ★★★
        sendRealPeriodMsg(chat, aiReply);

    } catch (e) {
        console.error("AI Period Alert Error", e);
    }
}

// 辅助函数：把文字变成真正的聊天气泡
function sendRealPeriodMsg(chat, text) {
    const timeStr = getNowTimeStr();
    
    // 1. 推入消息数组 (这样进聊天室就能看见了)
    chat.messages.push({
        text: text,
        isSelf: false, // 对方发的
        time: timeStr,
        timestamp: Date.now(),
        type: 'text' 
    });

    // 2. 更新列表预览
    chat.msg = text;
    chat.time = timeStr;
    
    // 3. 置顶聊天
    if (!chat.isPinned) {
        // chatList 是全局变量，这里需要重新排序
        // 注意：这里简单处理，移动到最前
        const idx = chatList.findIndex(c => c.id === chat.id);
        if (idx > -1) {
            chatList.splice(idx, 1);
            chatList.unshift(chat);
        }
    }
    
    // 4. 保存数据
    saveData();

    // 5. 视觉反馈
    // 如果你正好在看这个人的详情页，弹个 Toast 告诉你收到消息了
    if (typeof showNotification === 'function') {
        showNotification(chat, text);
    }
    
    // 如果你正好在这个人的聊天室里，刷新消息列表
    if (typeof currentChatId !== 'undefined' && currentChatId === chat.id) {
        renderMessages(chat);
        const container = document.getElementById('roomMessages');
        if(container) container.scrollTop = container.scrollHeight;
    }
}
// 返回选人列表
function backToCoupleList() {
    document.getElementById('couple-dashboard-view').style.display = 'none';
    document.getElementById('couple-list-view').style.display = 'flex';
    currentCoupleChatId = null;
    renderCoupleSelector();
}

// --- 修改 1：修复纪念日点击失效与冒泡换图冲突 (完美适配 iOS) ---
function renderCoupleDays(chat) {
    if (!chat.coupleData || !chat.coupleData.startDate) return;
    const start = chat.coupleData.startDate;
    const now = Date.now();
    const diff = now - start;
    let days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days < 0) days = 0;
    
    // 更新数字显示
    const numEl = document.getElementById('cp-days-num');
    if (numEl) {
        numEl.innerText = days + 1;
    }

    const infoEl = document.querySelector('.cp-days-info');
    
    if (infoEl) {
        infoEl.style.position = 'relative';
        infoEl.style.zIndex = '1001'; 
        
        // ★★★ 核心修复1：给容器加上阻止冒泡，切断往外层卡片的点击传递 ★★★
        infoEl.onclick = function(e) { e.stopPropagation(); };

        let datePicker = infoEl.querySelector('#cp-date-picker-ios');
        if (!datePicker) {
            datePicker = document.createElement('input');
            datePicker.type = 'date';
            datePicker.id = 'cp-date-picker-ios';
            
            datePicker.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                opacity: 0;
                cursor: pointer;
                -webkit-appearance: none;
                appearance: none;
                border: none;
                background: transparent;
                -webkit-tap-highlight-color: transparent; 
                outline: none;
            `;
            
            // ★★★ 核心修复2：给透明输入框也加上阻止冒泡，彻底杜绝换图菜单弹脸 ★★★
            datePicker.onclick = function(e) { e.stopPropagation(); };
            
            datePicker.onchange = function() { updateCoupleDate(this); };
            infoEl.appendChild(datePicker);
        }
    }
}

function triggerCoupleDatePicker() {
    console.log("已完全切换为 iOS 原生透明遮罩物理点击，废弃旧版 JS 触发");
}

function updateCoupleDate(input) {
    if (!currentCoupleChatId || !input.value) return;
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    if (chat && chat.coupleData) {
        // ★ 时区修复：直接拆分字符串，防止 new Date('YYYY-MM-DD') 导致东八区少一天的经典 Bug
        const parts = input.value.split('-'); 
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // JS 的月份从 0 开始
            const day = parseInt(parts[2], 10);
            // 生成当前时区下的零点时间
            chat.coupleData.startDate = new Date(year, month, day, 0, 0, 0).getTime();
        } else {
            // 兜底方案
            chat.coupleData.startDate = new Date(input.value).getTime();
        }
        
        saveData();
        renderCoupleDays(chat);
        
        // 选完后强制失去焦点，让 iOS 平滑收起日历滚轮面板
        input.blur(); 
    }
}

// ★★★ 核心：应用背景图 (读取数据并显示) ★★★
function applyCoupleVisuals(chat) {
    const bgLayer = document.getElementById('cp-bg-layer');
    const topCard = document.getElementById('cpTopCard');
    
    // 1. 全屏背景
    if (chat.coupleData && chat.coupleData.bgImage) {
        bgLayer.style.backgroundImage = `url(${chat.coupleData.bgImage})`;
    } else {
        // 默认背景
        bgLayer.style.backgroundImage = 'linear-gradient(180deg, #fff 0%, #ffe6ea 100%)';
    }

    // 2. 卡片背景
    if (chat.coupleData && chat.coupleData.cardImage) {
        topCard.style.backgroundImage = `url(${chat.coupleData.cardImage})`;
        topCard.style.backgroundColor = 'rgba(255,255,255,0.8)'; // 加点遮罩防止字看不清
    } else {
        topCard.style.backgroundImage = 'none';
        topCard.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
    }
}

// couple-space.js

function enterCoupleSpace(chatId) {
    const chat = chatList.find(c => c.id === chatId);
    if (!chat) return;
    
    currentCoupleChatId = chatId;

    // --- ★★★ 核心修复开始：进入前彻底清空旧数据 ★★★ ---
    
    // 1. 清空各个 Tab 的 HTML 内容容器
    document.getElementById('cp-moments-list').innerHTML = ''; // 清空动态列表
    document.getElementById('cp-album-grid').innerHTML = '';   // 清空相册
    document.getElementById('cpCalendarGrid').innerHTML = '';  // 清空日历
    document.getElementById('cp-letter-list').innerHTML = '';  // 清空信箱
    
    // 2. 清空 SVG 连线 (信箱页面的线)
    const oldSvg = document.getElementById('cpLinesSvg');
    if (oldSvg) oldSvg.innerHTML = '';

    // 3. 重置纪念日天数显示 (防止显示上一个人的天数闪烁)
    document.getElementById('cp-days-num').innerText = '-';

    // 4. 重置背景图为默认 (防止上一个人的背景图残留)
    const bgLayer = document.getElementById('cp-bg-layer');
    bgLayer.style.backgroundImage = 'linear-gradient(180deg, #fff 0%, #ffe6ea 100%)';
    const topCard = document.getElementById('cpTopCard');
    topCard.style.backgroundImage = 'none';
    topCard.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';

    // --- ★★★ 核心修复结束 ★★★ ---


    // 5. 切换视图
    document.getElementById('couple-list-view').style.display = 'none';
    const dashboard = document.getElementById('couple-dashboard-view');
    dashboard.style.display = 'flex';

    // 6. 渲染顶部数据 (已移除 Name 设置)
    // document.getElementById('cp-nav-title').innerText = chat.name; // <--- 这里是你之前要求注释掉的
    document.getElementById('cp-char-avatar').src = chat.avatar;
    
    // 获取我的头像
    const myAvatarSrc = chat.userAvatar || document.getElementById('meAvatarImg').src;
    document.getElementById('cp-user-avatar').src = myAvatarSrc;

    // 7. 计算天数
    renderCoupleDays(chat);

    // 8. 初始化数据结构 (防报错)
    if (!chat.coupleData) chat.coupleData = {};
    if (!chat.coupleData.startDate) chat.coupleData.startDate = Date.now();
    if (!chat.coupleData.moments) chat.coupleData.moments = [];
    if (!chat.coupleData.periodMap) chat.coupleData.periodMap = {};
    if (!chat.coupleData.album) chat.coupleData.album = []; // 补全初始化
    if (!chat.coupleData.letters) chat.coupleData.letters = []; // 补全初始化
    if (!chat.coupleData.questions) chat.coupleData.questions = [];

    // 9. 推算经期
    calculatePeriodPredictions(chat);

    // 10. 应用自定义背景 (如果有的话，会覆盖掉上面的默认背景)
    applyCoupleVisuals(chat);

    // 11. 默认渲染第一个 Tab (动态)
    // 强制重置 Tab 到 moments，防止停留在其他 Tab 但数据未加载
    switchCoupleTab('moments'); 
    
    // 12. 检查 AI 提醒
    if (typeof checkAiPeriodAlert === 'function') {
        checkAiPeriodAlert(chat);
    }
}
// 打开发布弹窗
function openCpPostModal(mode = 'post', context = null) {
    // 设置全局变量
    cpInputMode = mode;
    cpReplyContext = context;
    
    const title = document.getElementById('cpInputTitle');
    const input = document.getElementById('cp-input-text');
    
    // 清空输入框
    if(input) input.value = '';
    
    // 切换标题和占位符
    if (mode === 'post') {
        if(title) title.innerText = "发布悄悄话";
        if(input) input.placeholder = "写点什么...";
        
    } else if (mode === 'ask_question') {
        // ★★★ 新增：我向Char提问 ★★★
        if(title) title.innerText = "向TA提问";
        if(input) input.placeholder = "比如：你最喜欢我哪一点？";
        
    } else if (mode === 'answer_question') {
        // ★★★ 新增：回答Char的问题 ★★★
        // context 包含 { id: 问题ID, text: 问题内容 }
        if(title) title.innerText = "回答TA的问题";
        if(input) input.placeholder = "写下你的回答...";
        
    } else {
        // 回复评论模式
        if (context) {
            if(title) title.innerText = `回复 ${context.replyToName}`;
            if(input) input.placeholder = `回复 ${context.replyToName}:`;
        }
    }
    
    // 显示弹窗
    const overlay = document.getElementById('cpInputOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => input && input.focus(), 100);
    }
}

// 关闭发布弹窗
function closeCpPostModal() {
    const overlay = document.getElementById('cpInputOverlay');
    if (overlay) overlay.style.display = 'none';
}
// --- 修改 3：提交逻辑 ---
async function submitCpPost() {
    const text = document.getElementById('cp-input-text').value.trim();
    if (!text || !currentCoupleChatId) return;
    
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    
    // ★★★ 情况A：我发起提问 ★★★
    if (cpInputMode === 'ask_question') {
        if (!chat.coupleData.questions) chat.coupleData.questions = [];
        
        const newQ = {
            id: Date.now(),
            date: getFormatDateStr(new Date()),
            dayIndex: chat.coupleData.questions.length + 1,
            title: text,       // 问题内容
            asker: 'me',       // ★ 标记是我问的
            myAnswer: null,    // 我不需要回答
            charAnswer: null   // 等待AI回答
        };
        
        chat.coupleData.questions.unshift(newQ);
        saveData();
        renderCpQuestions(chat);
        closeCpPostModal();
        
        // 触发 AI 回答我的问题
        await triggerAiQuestionAnswer(chat, newQ);
        return;
    }

    // ★★★ 情况B：我回答Char的提问 ★★★
    if (cpInputMode === 'answer_question') {
        const qId = cpReplyContext.id;
        const q = chat.coupleData.questions.find(item => item.id === qId);
        if (q) {
            q.myAnswer = text; // 存入我的回答
            saveData();
            renderCpQuestions(chat);
        }
        closeCpPostModal();
        return;
    }

    // --- 下面是原有的发动态/回复评论逻辑 (保持不变) ---
    if (cpInputMode === 'post') {
        const newPost = {
            id: Date.now(), user: 'me', text: text, time: getNowTimeStr(), comments: []
        };
        chat.coupleData.moments.unshift(newPost);
        saveData();
        renderCpMoments(chat);
        closeCpPostModal();
        await triggerAiMomentComment(chat, newPost);
        
    } else {
        // 回复动态评论
        const { momentId, replyToName } = cpReplyContext;
        const post = chat.coupleData.moments.find(m => m.id === momentId);
        if (post) {
            const myName = chat.userRemark || "我";
            const replyContent = `回复${replyToName}：${text}`;
            post.comments.push({ user: 'me', text: replyContent, time: getNowTimeStr() });
            saveData();
            renderCpMoments(chat);
            closeCpPostModal();
            await triggerAiMomentReply(chat, post, text);
        }
    }
}

// 删除动态
function deleteCoupleMoment(momentId) {
    if (!confirm("确定删除这条动态吗？")) return;
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    if (!chat) return;
    
    chat.coupleData.moments = chat.coupleData.moments.filter(m => m.id !== momentId);
    saveData();
    renderCpMoments(chat);
}

// 渲染动态列表
function renderCpMoments(chat) {
    const container = document.getElementById('cp-moments-list');
    container.innerHTML = '';

    if (!chat.coupleData.moments || chat.coupleData.moments.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#666;font-size:12px;margin-top:50px;opacity:0.6;">这里空空的，快去发布第一条动态吧~</div>';
        return;
    }

    chat.coupleData.moments.forEach(post => {
        const isMe = post.user === 'me';
        const name = isMe ? "我" : chat.name;
        
        // 渲染评论
        let commentsHtml = '';
        if (post.comments && post.comments.length > 0) {
            let items = '';
            post.comments.forEach((c) => {
                const cUser = c.user === 'me' ? "我" : chat.name;
                
                let contentDisplay = "";
                if (c.text.trim().startsWith("回复")) {
                    contentDisplay = `<span class="cp-cmt-user">${cUser}</span> ${c.text}`;
                } else {
                    contentDisplay = `<span class="cp-cmt-user">${cUser}</span>：${c.text}`;
                }

                items += `
                    <div class="cp-comment-row" onclick="openCpPostModal('reply', {momentId: ${post.id}, replyToName: '${cUser}'})">
                        ${contentDisplay}
                    </div>
                `;
            });
            commentsHtml = `<div class="cp-comments-area">${items}</div>`;
        }

        // 删除按钮 (仅显示在自己或对方的动态上，这里逻辑是都能删)
        const deleteHtml = `<div class="cp-del-btn" onclick="deleteCoupleMoment(${post.id})"><i class="fas fa-trash-alt"></i></div>`;

        // ★★★ 修复：结构调整，使用 cp-feed-row 包裹文字和垃圾桶，实现左右对齐 ★★★
        const html = `
            <div class="cp-feed-item">
                <div class="cp-feed-header">
                    <span class="cp-feed-name">${name}</span>
                    <span class="cp-feed-time">${post.time}</span>
                </div>
                
                <!-- 核心修复：Flex布局容器 -->
                <div class="cp-feed-row">
                    <div class="cp-feed-text">${post.text}</div>
                    ${deleteHtml}
                </div>
                
                ${commentsHtml}
            </div>
        `;
        container.innerHTML += html;
    });
}

// 切换 Tab 标签 (完整修复版)
function switchCoupleTab(tabName) {
    // 1. 更新全局状态
    currentCpTab = tabName;

    // 2. 切换菜单激活状态
    const items = document.querySelectorAll('.cp-menu-item');
    items.forEach(item => item.classList.remove('active'));
    if(event && event.currentTarget) event.currentTarget.classList.add('active');

    // 3. 切换内容显示
    const contents = document.querySelectorAll('.cp-tab-content');
    contents.forEach(content => content.style.display = 'none');
    
    const fabBtn = document.querySelector('.cp-fab-btn');
    if (fabBtn) {
        // ★★★ 这里加上 || tabName === 'mood' ★★★
        if (tabName === 'moments' || tabName === 'questions' || tabName === 'album' || tabName === 'letter' || tabName === 'mood') {
            fabBtn.style.display = 'flex'; // 显示按钮
        } else {
            fabBtn.style.display = 'none'; // 只有日历页隐藏
        }
    }
   const target = document.getElementById(`cp-tab-${tabName}`);
    if (target) {
        target.style.display = 'block'; 
        
        // 4. 根据 Tab 加载数据
        const chat = chatList.find(c => c.id === currentCoupleChatId);
        if (chat) {
            // 初始化数据结构，防止报错
            if (!chat.coupleData) chat.coupleData = {};
            if (!chat.coupleData.questions) chat.coupleData.questions = [];

            if (tabName === 'moments') {
                renderCpMoments(chat);
            } else if (tabName === 'album') {
                renderCpAlbum(chat);
            } else if (tabName === 'period') {
                renderCpCalendar(chat, cpCalCurrentDate);
            } else if (tabName === 'letter') {
                renderCpLetters(chat);
            } 
            else if (tabName === 'mood') {
        renderCpMoodList(chat);
    }
            // ★★★ 核心修复：这里必须加上 questions 的渲染逻辑 ★★★
            else if (tabName === 'questions') {
                // 如果没有 renderCpQuestions 函数，说明还没复制到底部，或者复制位置不对
                if (typeof renderCpQuestions === 'function') {
                    renderCpQuestions(chat);
                } else {
                    console.error("找不到 renderCpQuestions 函数，请检查是否复制到了文件末尾");
                }
            }
        }
    }
}

function renderCpCalendar(chat, dateObj) {
    const grid = document.getElementById('cpCalendarGrid');
    const title = document.getElementById('cpCalTitle');
    if (!grid) return;
    
    grid.innerHTML = '';
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth(); // 0-11
    
    title.innerText = `${year}年 ${month + 1}月`;

    // 初始化数据结构
    if (!chat.coupleData.periodMap) chat.coupleData.periodMap = {}; // 格式: "2025-10-01": "period"

    // 计算当月第一天是周几 (0是周日, 1是周一... 我们需要周一为0, 周日为6)
    let firstDay = new Date(year, month, 1).getDay();
    firstDay = firstDay === 0 ? 6 : firstDay - 1; 

    // 当月总天数
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // 填充空白格子
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        grid.appendChild(emptyCell);
    }

    // 填充日期
    const todayStr = getFormatDateStr(new Date());

    for (let d = 1; d <= daysInMonth; d++) {
        const currentStr = getFormatDateStr(new Date(year, month, d));
        const status = chat.coupleData.periodMap[currentStr];
        
        const cell = document.createElement('div');
        cell.className = 'cp-date-cell';
        if (currentStr === todayStr) cell.classList.add('is-today');
        
        // 根据状态添加样式类
        if (status) cell.classList.add(`status-${status}`);

        cell.innerHTML = `
            <div class="cp-date-num">${d}</div>
            <div class="cp-date-icon"><i class="fas fa-heart"></i></div>
        `;
        
        // 点击事件
        cell.onclick = () => openPeriodModal(currentStr);
        
        grid.appendChild(cell);
    }
}


// --- ★★★ 新增：FAB 按钮智能点击逻辑 ★★★ ---
function onCpFabClick() {
    if (currentCpTab === 'moments') {
        // 如果在动态页，打开文字发布弹窗
        openCpPostModal();
    } else if (currentCpTab === 'album') {
        // 如果在相册页，直接触发系统文件选择
        document.getElementById('cp-album-input').click();
    } else {
        // 其他页面默认发动态
        openCpPostModal();
    }
}

// --- ★★★ 新增：相册功能逻辑 ★★★ ---

// 1. 处理图片选择
async function handleCpAlbumSelect(input) {
    if (!input.files || input.files.length === 0) return;
    
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    if (!chat) return;

    // 初始化相册数据结构
    if (!chat.coupleData.album) chat.coupleData.album = [];

    // 遍历选择的文件 (支持多选)
    for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        try {
            const base64 = await readFileAsBase64(file);
            // 插入到最前面
            chat.coupleData.album.unshift({
                id: Date.now() + Math.random(),
                url: base64,
                time: Date.now()
            });
        } catch (e) {
            console.error("图片读取失败", e);
        }
    }

    // 保存并重新渲染
    saveData();
    renderCpAlbum(chat);
    
    // 清空输入框，防止无法重复选择同一张
    input.value = '';
}

// 2. 渲染相册网格
function renderCpAlbum(chat) {
    const container = document.getElementById('cp-album-grid');
    if (!container) return;
    container.innerHTML = '';

    // 初始化
    if (!chat.coupleData) chat.coupleData = {};
    if (!chat.coupleData.album) chat.coupleData.album = [];

    if (chat.coupleData.album.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#999;font-size:12px;margin-top:50px;opacity:0.6;">相册空空的，点右下角上传照片吧~</div>';
        return;
    }

    chat.coupleData.album.forEach(imgData => {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'cp-album-item';
        // 点击预览大图 (简单实现，可根据需要扩展)
        imgDiv.onclick = () => showPhotoPreview(imgData.url); 
        
        const img = document.createElement('img');
        img.src = imgData.url;
        img.className = 'cp-album-img';
        
        // 删除按钮 (长按或右上角小标，这里简单做一个小垃圾桶在角落)
        const delBtn = document.createElement('div');
        delBtn.className = 'cp-album-del';
        delBtn.innerHTML = '<i class="fas fa-times"></i>';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deleteCpPhoto(chat, imgData.id);
        };

        imgDiv.appendChild(img);
        imgDiv.appendChild(delBtn);
        container.appendChild(imgDiv);
    });
}

// 3. 删除照片
function deleteCpPhoto(chat, photoId) {
    if (!confirm("要删除这张照片吗？")) return;
    chat.coupleData.album = chat.coupleData.album.filter(p => p.id !== photoId);
    saveData();
    renderCpAlbum(chat);
}

// 4. 辅助：读取文件为Base64 (如果 script.js 里有了就不用重复加，这里为了保险加上)
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

// --- 文件：couple-space.js ---

// 5. 简单的全屏预览 (这是情侣空间专用的预览逻辑)
function showPhotoPreview(url) {
    // 获取那个共用的弹窗元素
    const overlay = document.getElementById('photo-desc-overlay');
    const content = document.getElementById('photo-desc-content');
    if (overlay && overlay.parentElement !== document.body) {
        document.body.appendChild(overlay);
    }

    if(overlay && content) {
        content.innerHTML = `<img src="${url}" style="width:100%;height:auto;border-radius:8px;">`;
        overlay.classList.add('show');
    }
}
// --- ★★★ 修复代码开始：添加关闭函数 ★★★ ---
function closePhotoDesc() {
    const overlay = document.getElementById('photo-desc-overlay');
    if (overlay) {
        overlay.classList.remove('show');
        // 可选：稍后清空内容
        setTimeout(() => {
            const content = document.getElementById('photo-desc-content');
            if(content) content.innerHTML = '';
        }, 300);
    }
}
// 强制注册到全局 window 对象，防止 HTML onclick 找不到
window.closePhotoDesc = closePhotoDesc;
// --- ★★★ 修复代码结束 ★★★ ---
// --- 5. AI 逻辑 ---

// AI 评论动态
async function triggerAiMomentComment(chat, post) {
    const apiKey = document.getElementById('apiKey').value;
    const endpoint = document.getElementById('apiEndpoint').value;
    const model = document.getElementById('apiModel').value;
    if (!apiKey) return;

    // 1. 获取人设
    let persona = "";
    if (typeof getFullPersona === 'function') {
        persona = getFullPersona(chat);
    }
    
    // 2. 获取世界书
    let wbContext = "";
    if (typeof getWorldBookContext === 'function') {
        wbContext = getWorldBookContext(chat, post.text);
    }

    const prompt = `
    你现在是 ${chat.name}，我是你的恋人。
    
    ${persona}
    ${wbContext ? `【相关世界观】：${wbContext}` : ''}
    
    【背景】：我们在“情侣空间”APP里。
    【事件】：我刚刚发布了一条动态：
    "${post.text}"

    【任务】：
    请以你的性格，给这条动态写一条简短的评论。
    语气要亲密、自然，符合恋人关系。
    ★不要带引号，直接输出评论内容。★
    `;

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.8
            })
        });
        const data = await response.json();
        const aiReply = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');

        post.comments.push({
            user: 'char',
            text: aiReply,
            time: getNowTimeStr()
        });
        saveData();
        if (currentCoupleChatId === chat.id) renderCpMoments(chat);

    } catch (e) { console.error(e); }
}

// AI 追评 (回复用户的回复)
async function triggerAiMomentReply(chat, post, myReplyText) {
    const apiKey = document.getElementById('apiKey').value;
    const endpoint = document.getElementById('apiEndpoint').value;
    const model = document.getElementById('apiModel').value;
    if (!apiKey) return;

    if (Math.random() > 0.6) return; // 60% 概率不回复，防止太唠叨

    const prompt = `
    你现在是 ${chat.name}。
    我们在情侣空间的评论区。
    
    【原动态】：${post.text}
    【你上一条评论】：${post.comments[post.comments.length-2]?.text || ""}
    【我的回复】：${myReplyText}
    
    【任务】：
    简短回复我（15字以内），结束这个话题或调情一下。
    `;

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.8
            })
        });
        const data = await response.json();
        const aiReply = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');

        post.comments.push({
            user: 'char',
            text: `回复我：${aiReply}`,
            time: getNowTimeStr()
        });
        saveData();
        if (currentCoupleChatId === chat.id) renderCpMoments(chat);

    } catch (e) { console.error(e); }
}

// 辅助时间函数
function getNowTimeStr() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

// --- 6. 列表渲染 (保持原样) ---
function renderCoupleSelector() {
    const container = document.getElementById('couple-list-container');
    if (!container) return;
    container.innerHTML = '';

    const opened = chatList.filter(c => c.isCouple === true);
    const notOpened = chatList.filter(c => !c.isCouple);

    if (opened.length > 0) {
        const title = document.createElement('div');
        title.className = 'couple-section-title';
        title.innerText = '♥ 已开通 · Lovers';
        container.appendChild(title);
        const grid = document.createElement('div');
        grid.className = 'couple-grid';
        opened.forEach(chat => {
            grid.innerHTML += `
                <div class="couple-item" onclick="enterCoupleSpace(${chat.id})">
                    <div class="couple-avatar-box opened">
                        <img src="${chat.avatar}" class="couple-avatar">
                        <div class="couple-badge"><i class="fas fa-heart"></i></div>
                    </div>
                    <div class="couple-name">${chat.name}</div>
                </div>`;
        });
        container.appendChild(grid);
    }

    if (notOpened.length > 0) {
        const title2 = document.createElement('div');
        title2.className = 'couple-section-title';
        title2.innerText = '♡ 邀请开通 · Invite';
        container.appendChild(title2);
        const grid2 = document.createElement('div');
        grid2.className = 'couple-grid';
        notOpened.forEach(chat => {
            grid2.innerHTML += `
                <div class="couple-item" onclick="confirmCoupleInvite(${chat.id})">
                    <div class="couple-avatar-box">
                        <img src="${chat.avatar}" class="couple-avatar">
                        <div class="couple-plus"><i class="fas fa-plus"></i></div>
                    </div>
                    <div class="couple-name">${chat.name}</div>
                </div>`;
        });
        container.appendChild(grid2);
    }
}

// 发起邀请确认
function confirmCoupleInvite(chatId) {
    const chat = chatList.find(c => c.id === chatId);
    if (!chat) return;
    if (confirm(`要把“${chat.name}”邀请进情侣空间吗？`)) {
        closeCoupleSpace();
        openChatRoom(chat.id);
        setTimeout(() => { sendCoupleInvitationMsg(chat); }, 500);
    }
}

// 发送邀请卡片
async function sendCoupleInvitationMsg(chat) {
    const timeStr = getNowTimeStr();
    
    // ★★★ 修改 1：文案完全替换为 QQ 风格 ★★★
    const inviteHtml = `
        <div class="transfer-card couple-card pending">
            <div class="couple-card-top">
                <div class="couple-icon-row"><i class="fas fa-heartbeat"></i></div>
                <div class="couple-title">想和你建立情侣关系</div>
                <div class="couple-subtitle">和我成为情侣，一起我们记录每日点滴</div> 
            </div>
            <div class="couple-line"></div>
            <div class="couple-footer">亲密关系</div>
        </div>
    `;
    
    const inviteMsgId = Date.now();
    
    chat.messages.push({
        id: inviteMsgId, 
        text: inviteHtml, 
        isSelf: true, 
        time: timeStr,
        timestamp: Date.now(), 
        type: 'couple_invite', 
        // ★★★ 修改 2：强制指定列表预览文案，防止显示成“[转账]” ★★★
        contentDescription: '[情侣邀请]' 
    });
    
    chat.msg = '[情侣邀请]'; // 立即更新列表显示
    chat.time = timeStr;
    
    saveData();
    renderMessages(chat);
    
    // 触发 AI 思考
    await triggerAiCoupleDecision(chat, inviteMsgId);
}

async function triggerAiCoupleDecision(chat, inviteMsgId) {
    const apiKey = document.getElementById('apiKey').value;
    const endpoint = document.getElementById('apiEndpoint').value;
    const model = document.getElementById('apiModel').value;
    if (!apiKey) return;

    // ★ 修改：改变标题为输入中，而不是发气泡
    const titleEl = document.getElementById('roomTitle');
    if (titleEl && currentChatId === chat.id) {
        titleEl.innerText = "对方正在思考...";
    }

    const systemPrompt = `
    用户向你发起了【情侣空间】邀请，想和你确立恋爱关系。
    ${getFullPersona(chat)}
    请决定【接受 (ACCEPT)】还是【拒绝 (REJECT)】。
    返回 JSON: {"action": "ACCEPT", "replies": ["回复内容1", "回复内容2"]}
    `;

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.8
            })
        });
        const data = await response.json();
        
        // ★ 恢复标题
        if (titleEl && currentChatId === chat.id) {
            titleEl.innerText = chat.name;
        }

        const content = data.choices[0].message.content.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
        // 移除 loading (不需要了)
        // chat.messages = chat.messages.filter(m => !m.isLoading);

        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            const isAccept = result.action === 'ACCEPT';
            const timeStr = getNowTimeStr();
            
            // 更新原来的邀请卡片状态
            const inviteMsg = chat.messages.find(m => m.id === inviteMsgId);
            if (inviteMsg) {
                if (isAccept) {
                    inviteMsg.text = inviteMsg.text.replace('pending', 'accepted');
                    chat.isCouple = true;
                    if(!chat.coupleData) chat.coupleData = { startDate: Date.now(), interactionCount: 0 };
                } else {
                    inviteMsg.text = inviteMsg.text.replace('pending', 'rejected');
                }
            }

            // 1. AI 回复 (只保留这个)
            let replyList = Array.isArray(result.replies) ? result.replies : [result.reply || "好呀"];
            replyList.forEach((msgText, index) => {
                chat.messages.push({
                    id: Date.now() + index, text: msgText, isSelf: false, time: timeStr, timestamp: Date.now() + index, type: 'text'
                });
            });

            // 【已删除】原先这里的灰色系统提示已彻底移除

            // 2. 状态卡片
            let statusTitle = isAccept ? '我们已经成功建立情侣关系' : '未能建立情侣关系';
            let statusSubtitle = isAccept ? '我已经同意了你的邀请，现在我们是情侣啦' : '很遗憾，未能建立关系';
            let statusClass = isAccept ? 'accepted' : 'rejected';
            let iconHtml = isAccept ? '<i class="fas fa-heartbeat"></i>' : '<i class="fas fa-heart-broken"></i>';

            const responseCardHtml = `
                <div class="transfer-card couple-card ${statusClass}">
                    <div class="couple-card-top">
                        <div class="couple-icon-row">${iconHtml}</div>
                        <div class="couple-title">${statusTitle}</div>
                        <div class="couple-subtitle">${statusSubtitle}</div>
                    </div>
                    <div class="couple-line"></div>
                    <div class="couple-footer">亲密关系</div>
                </div>
            `;

            setTimeout(() => {
                chat.messages.push({
                    id: Date.now() + 100, 
                    text: responseCardHtml, 
                    isSelf: false, 
                    time: timeStr, 
                    timestamp: Date.now() + 100,
                    contentDescription: isAccept ? '[情侣关系已建立]' : '[情侣邀请已拒绝]'
                });
                chat.msg = isAccept ? '[情侣关系已建立]' : '[情侣邀请已拒绝]';
                saveData();
                renderMessages(chat);
            }, 1000);

            saveData();
            renderMessages(chat);
        }
    } catch (e) {
        // ★ 恢复标题
        const titleEl = document.getElementById('roomTitle');
        if (titleEl && currentChatId === chat.id) {
            titleEl.innerText = chat.name;
        }
        // chat.messages = chat.messages.filter(m => !m.isLoading);
        renderMessages(chat);
        alert("AI 思考超时，请重试");
    }
}
function getFormatDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
// --- 7. 日历交互逻辑修复 (补全缺失函数) ---

// 切换月份 (-1 上个月, 1 下个月)
function changeCpMonth(offset) {
    // 修改全局日期对象
    cpCalCurrentDate.setMonth(cpCalCurrentDate.getMonth() + offset);
    
    // 重新渲染日历
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    if (chat) {
        renderCpCalendar(chat, cpCalCurrentDate);
    }
}

// 打开日期标记弹窗
function openPeriodModal(dateStr) {
    cpSelectedDateStr = dateStr; // 记录当前点击的日期
    const modal = document.getElementById('cp-period-modal');
    const title = document.getElementById('cpPeriodModalTitle');
    
    if (title) title.innerText = `标记: ${dateStr}`;
    if (modal) modal.style.display = 'flex';
}

// 关闭日期标记弹窗
function closePeriodModal() {
    const modal = document.getElementById('cp-period-modal');
    if (modal) modal.style.display = 'none';
    cpSelectedDateStr = null;
}

// 设置日期状态 (经期/预测/排卵等)
function setPeriodStatus(status) {
    if (!currentCoupleChatId || !cpSelectedDateStr) return;
    
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    if (!chat) return;

    if (!chat.coupleData.periodMap) chat.coupleData.periodMap = {};

    if (status) {
        chat.coupleData.periodMap[cpSelectedDateStr] = status;
    } else {
        delete chat.coupleData.periodMap[cpSelectedDateStr];
    }

    // ★★★ 新增：每次手动改变状态后，重新计算一遍未来的预测 ★★★
    calculatePeriodPredictions(chat);

    saveData();
    renderCpCalendar(chat, cpCalCurrentDate);
    closePeriodModal();
    
    // 检查是否需要触发AI
    if (typeof checkAiPeriodAlert === 'function') {
        checkAiPeriodAlert(chat);
    }
}
// --- 8. 经期自动推算逻辑 (新增) ---

function calculatePeriodPredictions(chat) {
    if (!chat.coupleData.periodMap) return;

    // 1. 找出所有标记为 "period" (实测经期) 的日期
    const periodDates = [];
    for (let dateStr in chat.coupleData.periodMap) {
        if (chat.coupleData.periodMap[dateStr] === 'period') {
            periodDates.push(dateStr);
        }
    }

    // 如果没有记录，无法推算
    if (periodDates.length === 0) return;

    // 2. 排序找到“最后一次”经期的开始时间
    periodDates.sort(); 
    const lastPeriodStr = periodDates[periodDates.length - 1];
    const lastDate = new Date(lastPeriodStr);

    // 3. 推算未来 3 个月 (默认周期28天，经期持续5天)
    // 注意：这里仅填充空白格子，不覆盖你手动标记的内容
    const cycleLength = 28; 
    const duration = 5;

    // 循环推算未来 3 次
    for (let cycle = 1; cycle <= 3; cycle++) {
        // 推算下一次的开始日期
        let nextStartDate = new Date(lastDate);
        nextStartDate.setDate(nextStartDate.getDate() + (cycleLength * cycle));

        // 标记这一轮的 5 天
        for (let day = 0; day < duration; day++) {
            let predictDate = new Date(nextStartDate);
            predictDate.setDate(predictDate.getDate() + day);
            
            const pStr = getFormatDateStr(predictDate);

            // 只有当这一天是空的，或者原本就是预测状态时，才写入。
            // 这样不会覆盖你手动标记的真实经期
            if (!chat.coupleData.periodMap[pStr] || chat.coupleData.periodMap[pStr] === 'predict') {
                chat.coupleData.periodMap[pStr] = 'predict';
            }
        }
    }
    // 保存计算结果
    saveData();
}

/* --- 信箱功能 (Mailbox) --- */

// 1. 初始化与渲染 (信箱列表)
function renderCpLetters(chat) {
    const container = document.getElementById('cp-letter-list');
    if (!container) return;
    container.innerHTML = '';

    // 初始化数据
    if (!chat.coupleData.letters) chat.coupleData.letters = [];

    // 如果没有信件
    if (chat.coupleData.letters.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding-top:100px; color:#999;">
                <div style="font-size:40px;margin-bottom:10px;opacity:0.5;">✉️</div>
                <div style="font-size:13px;">信箱是空的</div>
                <div style="font-size:11px; margin-top:5px; opacity:0.7;">点右下角 + 写下第一封信</div>
            </div>
        `;
        return;
    }

    // ★ 1. 先插入 SVG 画布 (用来画线)
    // 注意：SVG必须在卡片生成之前插入，或者绝对定位在底层
    const svgLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgLayer.setAttribute("class", "cp-lines-layer");
    svgLayer.setAttribute("id", "cpLinesSvg");
    container.appendChild(svgLayer);

    // 按时间倒序排列 (最新的在最上面，显示为 No.大的)
    // 这里的逻辑：我们希望按 04 -> 03 -> 02 -> 01 这样连线
    // 排序保持 New -> Old
    const sortedLetters = [...chat.coupleData.letters].sort((a, b) => b.timestamp - a.timestamp);

    sortedLetters.forEach((letter, index) => {
        const sideClass = index % 2 === 0 ? 'left' : 'right';
        const fromName = letter.from === 'me' ? 'From Me' : `From ${chat.name}`;
        const numStr = String(letter.number).padStart(2, '0');
        const dateObj = new Date(letter.timestamp);
        const dateStr = `${dateObj.getFullYear()}.${dateObj.getMonth()+1}.${dateObj.getDate()}`;

        const card = document.createElement('div');
        card.className = `cp-letter-card ${sideClass}`;
        // 给卡片加个ID，方便画线时找位置
        card.id = `letter-card-${index}`;
        card.onclick = () => viewLetter(letter.id);
        
        card.innerHTML = `
            <div class="cp-l-header-row">
                <div class="cp-l-num">${numStr}</div>
                <div class="cp-l-sep-line"></div>
            </div>
            <div class="cp-l-title">${letter.title}</div>
            <div class="cp-l-footer">
                <span class="cp-l-from">${fromName}</span>
                <span>${dateStr}</span>
            </div>
        `;
        container.appendChild(card);
    });

    // ★ 2. 核心：等页面渲染完，马上计算坐标并画线
    // 使用 setTimeout 0 确保 DOM 已经布局完成
    setTimeout(() => {
        drawLetterConnections(sortedLetters.length);
    }, 50);
    
    // 监听窗口大小改变，重新画线（防止手机横屏或尺寸变化线歪了）
    window.removeEventListener('resize', window._redrawLetterLines);
    window._redrawLetterLines = () => drawLetterConnections(sortedLetters.length);
    window.addEventListener('resize', window._redrawLetterLines);
}
// 辅助函数：画出卡片之间的连线
function drawLetterConnections(count) {
    const svg = document.getElementById('cpLinesSvg');
    const container = document.getElementById('cp-letter-list');
    if (!svg || !container || count < 2) return;

    // 清空旧线
    svg.innerHTML = '';
    
    // 获取容器的绝对位置，用于计算相对坐标
    const containerRect = container.getBoundingClientRect();
    // 调整 SVG 高度以匹配滚动内容的高度
    svg.style.height = container.scrollHeight + 'px';

    // 遍历卡片，从第一张连到最后一张
    // index 0 是最新的卡片 (比如 04)，index 1 是 03...
    for (let i = 0; i < count - 1; i++) {
        const currentCard = document.getElementById(`letter-card-${i}`);
        const nextCard = document.getElementById(`letter-card-${i+1}`);

        if (currentCard && nextCard) {
            // 计算当前卡片钉子的位置 (顶部中间)
            const rect1 = currentCard.getBoundingClientRect();
            // 钉子在卡片宽度一半，顶部往下 0px (或者微调到 -6px 钉子中心)
            // 需要加上 scrollTop 偏移量吗？因为 containerRect 是相对视口的，rect1 也是，所以相减即可
            const x1 = rect1.left + rect1.width / 2 - containerRect.left;
            const y1 = rect1.top - containerRect.top; // 稍微向下一点点对应钉子位置

            // 计算下一张卡片钉子的位置
            const rect2 = nextCard.getBoundingClientRect();
            const x2 = rect2.left + rect2.width / 2 - containerRect.left;
            const y2 = rect2.top - containerRect.top;

            // 创建线条
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y1);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y2);
            line.setAttribute("class", "cp-connection-line");
            
            svg.appendChild(line);
        }
    }
}

// 2. 打开写信弹窗
function openLetterWriteModal() {
    const modal = document.getElementById('cp-letter-write-modal');
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    
    const titleInput = document.getElementById('letter-title-input');
    const contentInput = document.getElementById('letter-content-input');

    // 1. 检查是否有草稿
    if (chat && chat.coupleData && chat.coupleData.letterDraft) {
        titleInput.value = chat.coupleData.letterDraft.title || '';
        contentInput.value = chat.coupleData.letterDraft.content || '';
    } else {
        // 2. 没有草稿则清空，防止显示上一次发送的内容
        titleInput.value = '';
        contentInput.value = '';
    }
    
    if (modal) modal.style.display = 'flex';
}
// 保存草稿并关闭
function saveLetterDraft() {
    if (!currentCoupleChatId) return;
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    
    const title = document.getElementById('letter-title-input').value;
    const content = document.getElementById('letter-content-input').value;

    // 只有当有内容时才保存
    if (title.trim() || content.trim()) {
        if (!chat.coupleData) chat.coupleData = {};
        
        // 保存到 chat 对象中
        chat.coupleData.letterDraft = {
            title: title,
            content: content,
            time: Date.now()
        };
        
        saveData(); // 写入本地存储
        
        // 可选：给个轻提示
        // alert("草稿已保存"); 
    } else {
        // 如果内容是空的，点击存草稿等同于清除草稿
        if (chat.coupleData && chat.coupleData.letterDraft) {
            delete chat.coupleData.letterDraft;
            saveData();
        }
    }

    // 关闭弹窗
    const modal = document.getElementById('cp-letter-write-modal');
    if (modal) modal.style.display = 'none';
}
function submitUserLetter() {
    if (!currentCoupleChatId) return;
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    if (!chat.coupleData) chat.coupleData = {};

    const title = document.getElementById('letter-title-input').value.trim();
    const content = document.getElementById('letter-content-input').value.trim();
    
    if (!title || !content) {
        alert("标题和内容不能为空哦");
        return;
    }

    const nextNum = (chat.coupleData.letters || []).length + 1;

    const newLetter = {
        id: Date.now(),
        from: 'me',
        title: title,
        content: content,
        timestamp: Date.now(),
        number: nextNum
    };

    if (!chat.coupleData.letters) chat.coupleData.letters = [];
    chat.coupleData.letters.push(newLetter);

    // --- ★★★ 新增：发送成功后，删除草稿 ★★★ ---
    if (chat.coupleData.letterDraft) {
        delete chat.coupleData.letterDraft;
    }
    // ----------------------------------------

    saveData();
    renderCpLetters(chat);
    
    // 关闭弹窗（使用原生关闭，因为不需要再存草稿了）
    const modal = document.getElementById('cp-letter-write-modal');
    if (modal) modal.style.display = 'none';
    
    // 触发 AI 回信
    setTimeout(() => {
        if (typeof triggerAiLetterResponse === 'function') {
            triggerAiLetterResponse(chat, newLetter);
        }
    }, 2000);
}
// 4. 查看信件 (Read)
function viewLetter(letterId) {
    if (!currentCoupleChatId) return;
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    const letter = chat.coupleData.letters.find(l => l.id === letterId);
    if (!letter) return;

    document.getElementById('read-letter-no').innerText = `No.${String(letter.number).padStart(2,'0')}`;
    document.getElementById('read-letter-date').innerText = new Date(letter.timestamp).toLocaleDateString();
    document.getElementById('read-letter-title').innerText = letter.title;
    document.getElementById('read-letter-content').innerText = letter.content;
    document.getElementById('read-letter-from').innerText = letter.from === 'me' ? 'Me' : chat.name;

    const modal = document.getElementById('cp-letter-read-modal');
    modal.classList.add('active');
}

function closeLetterReadModal() {
    document.getElementById('cp-letter-read-modal').classList.remove('active');
}

// --- ★★★ 5. AI 自主写信逻辑 (核心) ★★★ ---

/**
 * 触发 AI 写信
 * @param {Object} chat 聊天对象
 * @param {Object} contextLetter (可选) 如果是因为用户写信了触发的回信，把用户的信传进去
 * @param {Boolean} force 强制写信 (用于调试或主动索要)
 */
async function triggerAiLetterResponse(chat, contextLetter = null, force = false) {
    const apiKey = document.getElementById('apiKey').value;
    const endpoint = document.getElementById('apiEndpoint').value;
    const model = document.getElementById('apiModel').value;
    if (!apiKey) return;

    // 1. 概率检查 (如果是回复，概率高；如果是自主发起，概率低)
    // 这里为了演示效果，我们设为：如果是回复(contextLetter存在)则100%回，否则 30%概率自主写
    // 实际使用可以调低
    if (!force && !contextLetter && Math.random() > 0.3) {
        console.log("AI 决定这次不写信");
        return;
    }

    // 2. 准备上下文
    const persona = getFullPersona(chat);
    // 获取最近几条聊天记录作为背景
    const recentMsgs = chat.messages.slice(-10).map(m => `${m.isSelf?'我':chat.name}: ${m.text}`).join('\n');
    
   // 3. 构建 Prompt (修改了文案)
    let systemPrompt = `
    你现在是 ${chat.name}。
    ${persona}
    
    【当前情境】：我们在情侣空间的【秘密信箱】里。
    这是一个很慢、很浪漫的地方。我们需要在这里写长信，表达深层的情感，而不是像平时那样发短消息。
    `;

    if (contextLetter) {
        systemPrompt += `
        【事件】：你的恋人给你写了一封信：
        标题：${contextLetter.title}
        内容：${contextLetter.content}
        
        【任务】：
        请给TA回一封信。
        1. 标题要文艺一点，或者与内容相关。
        2. 内容要长一点（150-300字），深情、真挚，结合你们的过往和人设。
        3. 就像真实的情侣写信一样，不要用太生硬的网文套路。
        `;
    } else {
        systemPrompt += `
        【事件】：夜深人静或者情感涌动时，你决定主动给TA写一封**深情的长信**。
        【参考最近聊天】：
        ${recentMsgs}
        
        【任务】：
        主动写一封信给TA。
        
        ★【强制要求】：
        1. **拒绝短小**：正文内容必须丰富，**字数至少在 200 字以上**！绝对不能只写两三句就结束。
        2. **拒绝流水账**：不要只写“在干嘛”或“晚安”。要写出你内心深处平时不好意思说出口的细腻情感。
        3. **细节描写**：可以回忆你们相处的某个具体细节，或者描述你现在环境的氛围（比如窗外的月光、手边的咖啡），以此来烘托思念。
        4. **标题**：要像一首诗的名字，或者一句情话。
        `;
    }

    systemPrompt += `
    ★必须返回 JSON 格式★：
    {
        "title": "信的标题",
        "content": "信的正文内容..."
    }
    `;

    try {
        // 显示一个 loading 状态 (可选，或者静默生成)
        // 这里静默生成，给用户惊喜

        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.85 // 高温，增加创造力
            })
        });
        const data = await response.json();
        let content = data.choices[0].message.content.trim();
        
        // 解析 JSON
        content = content.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            
            const nextNum = (chat.coupleData.letters.length || 0) + 1;
            const aiLetter = {
                id: Date.now(),
                from: 'char',
                title: result.title,
                content: result.content,
                timestamp: Date.now(),
                number: nextNum
            };

            chat.coupleData.letters.push(aiLetter);
            saveData();
            
            // 如果用户还在信箱界面，刷新
            if (currentCoupleChatId === chat.id && currentCpTab === 'letter') {
                renderCpLetters(chat);
            }
            
            // 可选：发一个 Toast 通知用户收到信了
            if (typeof showNotification === 'function') {
                showNotification(chat, `💌 收到一封来自${chat.name}的信`);
            }
        }

    } catch (e) {
        console.error("AI写信失败", e);
    }
}

// 6. 绑定到 FAB 按钮逻辑
// 修改 couple-space.js 中的 onCpFabClick 函数
const oldOnCpFabClick = onCpFabClick; // 保存旧引用（如果需要继承）

window.onCpFabClick = function() {
    // 获取当前激活的 tab (如果 global 变量没更新，尝试从 DOM 获取)
    if (typeof currentCpTab === 'undefined') currentCpTab = 'moments';

    if (currentCpTab === 'letter') {
        openLetterWriteModal();
    } else if (currentCpTab === 'moments') {
        openCpPostModal();
    } else if (currentCpTab === 'album') {
        document.getElementById('cp-album-input').click();
    } else if (currentCpTab === 'questions') {
        openCpPostModal('ask_question'); 
    } 
    // ★★★ 新增：如果在心情页，打开心情弹窗 ★★★
    else if (currentCpTab === 'mood') {
        openMoodModal();
    }
    else {
        openCpPostModal();
    }
}
// 7. 索要信件 (在右上角菜单中添加)
function askForLetter() {
    if (!currentCoupleChatId) return;
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    if(confirm(`想让 ${chat.name} 给你写一封信吗？`)) {
        triggerAiLetterResponse(chat, null, true); // force = true
        alert("请求已发送，TA正在酝酿中，请稍后...");
    }
}

// 1. 打开情侣空间设置菜单
function openCoupleSettingsMenu() {
    const overlay = document.getElementById('couple-settings-modal');
    if (overlay) overlay.style.display = 'flex';
}

// 2. 关闭情侣空间设置菜单
function closeCoupleSettingsMenu() {
    const overlay = document.getElementById('couple-settings-modal');
    if (overlay) overlay.style.display = 'none';
}

// 3. 核心功能：解除情侣关系
function cpActionBreakUp() {
    if (!confirm("确定要解除情侣关系吗？\n解除后将退出情侣空间，对方会收到通知。")) return;
    
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    if (!chat) return;

    // 1. 修改状态
    chat.isCouple = false;
    
    // 2. 发送解除关系的卡片通知 (复用现有的卡片样式)
    const timeStr = getNowTimeStr();
    const breakUpHtml = `
        <div class="transfer-card couple-card rejected">
            <div class="couple-card-top">
                <div class="couple-icon-row"><i class="fas fa-heart-broken"></i></div>
                <div class="couple-title">情侣空间已解除</div>
                <div class="couple-subtitle">恋爱关系已解除</div>
            </div>
            <div class="couple-line"></div>
            <div class="couple-footer">关系结束</div>
        </div>
    `;

    chat.messages.push({
        id: Date.now(),
        text: breakUpHtml,
        isSelf: true, // 假装是我发起的
        time: timeStr,
        timestamp: Date.now(),
        type: 'text', // 或者用 couple_event
        contentDescription: '[情侣关系已解除]'
    });
    
    chat.msg = '[情侣关系已解除]';
    chat.time = timeStr;

    // 3. 保存并退出
    saveData();
    closeCoupleSettingsMenu();
    closeCoupleSpace(); // 退出情侣空间
    
    // 如果正好在聊天室里，刷新一下消息
    if (typeof currentChatId !== 'undefined' && currentChatId === chat.id) {
        renderMessages(chat);
    }
    
    // 刷新情侣列表（因为少了一个人）
    renderCoupleSelector();
}

// 4. 核心功能：清空记录 (修复：同步清空心情日记)
function cpActionClearData() {
    if (!confirm("确定要清空所有记录吗？\n动态、相册、日历、信件、提问、心情日记将被删除。\n背景图和纪念日会保留。")) return;

    const chat = chatList.find(c => c.id === currentCoupleChatId);
    if (!chat || !chat.coupleData) return;

    // 1. 清空所有数组
    chat.coupleData.moments = [];
    chat.coupleData.album = [];
    chat.coupleData.periodMap = {};
    chat.coupleData.letters = [];
    chat.coupleData.questions = [];
    chat.coupleData.moods = []; // ★★★ 修复：增加这一行 ★★★
    
    // 2. 保存
    saveData();
    
    // 3. 刷新视图
    if (currentCpTab === 'moments') renderCpMoments(chat);
    else if (currentCpTab === 'album') renderCpAlbum(chat);
    else if (currentCpTab === 'period') renderCpCalendar(chat, cpCalCurrentDate);
    else if (currentCpTab === 'letter') renderCpLetters(chat);
    else if (currentCpTab === 'questions') renderCpQuestions(chat);
    else if (currentCpTab === 'mood') renderCpMoodList(chat); // 刷新心情页

    closeCoupleSettingsMenu();
    alert("所有记录已清空。");
}

function handleCoupleSpaceCommands(chat, text) {
    if (!text) return text;

    // --- 1. 处理信件 (CP_LETTER) ---
    // 兼容 [CP_LETTER:xxx] 和 【CP_LETTER：xxx】
    const letterRegex = /[\[【]CP_LETTER\s*[:：]\s*(.*?)\s*[:：]\s*([\s\S]*?)(?:[\]】]|$)/i;
    const letterMatch = text.match(letterRegex);
    
    if (letterMatch) {
        const lTitle = letterMatch[1].trim();
        let lContent = letterMatch[2].trim();
        // 清理尾部可能残留的括号符号
        if (lContent.endsWith(']') || lContent.endsWith('】')) {
            lContent = lContent.slice(0, -1).trim();
        }

        if (!chat.coupleData) chat.coupleData = {};
        if (!chat.coupleData.letters) chat.coupleData.letters = [];
        
        chat.coupleData.letters.push({
            id: Date.now(),
            from: 'char',
            title: lTitle,
            content: lContent,
            timestamp: Date.now(),
            number: chat.coupleData.letters.length + 1
        });
        
        if (typeof saveData === 'function') saveData(); 
        
        if (typeof currentCoupleChatId !== 'undefined' && currentCoupleChatId === chat.id && typeof currentCpTab !== 'undefined' && currentCpTab === 'letter') {
             if (typeof renderCpLetters === 'function') renderCpLetters(chat);
        }

        let newText = text.replace(letterMatch[0], "").trim();
        if (newText === ']' || newText === '】') newText = "";
        text = newText; 
    }

    // --- 2. 处理提问 (CP_ASK) ---
    // 兼容 [CP_ASK:xxx] 和 【CP_ASK：xxx】
    const askRegex = /[\[【]CP_ASK\s*[:：]\s*(.*?)[\]】]/i;
    const askMatch = text.match(askRegex);

    if (askMatch) {
        const qContent = askMatch[1].trim(); 
        
        if (qContent) {
            if (!chat.coupleData) chat.coupleData = {};
            if (!chat.coupleData.questions) chat.coupleData.questions = [];

            const newQ = {
                id: Date.now() + Math.floor(Math.random() * 100), 
                date: getFormatDateStr(new Date()),
                dayIndex: chat.coupleData.questions.length + 1,
                title: qContent,
                asker: 'char',     
                myAnswer: null,    
                charAnswer: null
            };

            chat.coupleData.questions.unshift(newQ);
            if (typeof saveData === 'function') saveData();
            
            console.log(`[情侣空间] ✅ 成功捕获Char提问: ${qContent}`);

            if (typeof currentCoupleChatId !== 'undefined' && currentCoupleChatId === chat.id && 
                typeof currentCpTab !== 'undefined' && currentCpTab === 'questions') {
                if (typeof renderCpQuestions === 'function') renderCpQuestions(chat);
            }

            let newText = text.replace(askMatch[0], "").trim();
            text = newText;
        }
    }

    // --- 3. 处理动态 (CP_POST) ---
    // 兼容 [CP_POST:xxx] 和 【CP_POST：xxx】
    const postRegex = /[\[【]CP_POST\s*[:：]\s*(.*?)[\]】]/i;
    const postMatch = text.match(postRegex);

    if (postMatch) {
        const postContent = postMatch[1].trim();
        if (postContent) {
            if (!chat.coupleData) chat.coupleData = {};
            if (!chat.coupleData.moments) chat.coupleData.moments = [];

            const newPost = {
                id: Date.now(), 
                user: 'char', 
                text: postContent, 
                time: getNowTimeStr(), 
                comments: []
            };
            
            chat.coupleData.moments.unshift(newPost);
            saveData();
            
            if (typeof currentCoupleChatId !== 'undefined' && currentCoupleChatId === chat.id &&
                typeof currentCpTab !== 'undefined' && currentCpTab === 'moments') {
                renderCpMoments(chat);
            }
            
            let newText = text.replace(postMatch[0], "").trim();
            if (newText === ']' || newText === '】') newText = "";
            text = newText;
        }
    }

    return text; 
}

// 注册
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.registerAiCommand) {
            window.registerAiCommand(handleCoupleSpaceCommands);
        }
    }, 500);
});

function initCoupleSpaceRegistration() {
    if (typeof window.registerAiCommand === 'function') {
        // 避免重复注册
        if (!window.aiCommandProcessors.includes(handleCoupleSpaceCommands)) {
            window.registerAiCommand(handleCoupleSpaceCommands);
            console.log("情侣空间 AI指令处理器已成功注册");
        }
    } else {
        console.warn("暂未找到 window.registerAiCommand，将在 DOMContentLoaded 或延迟后重试...");
    }
}

// 立即尝试注册
initCoupleSpaceRegistration();

// 注册事件备份，防止生命周期错位
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCoupleSpaceRegistration);
} else {
    // 延迟重试保障安全
    setTimeout(initCoupleSpaceRegistration, 200);
    setTimeout(initCoupleSpaceRegistration, 500);
}

function getCoupleStatusForAI(chat) {
    // 1. 如果不是情侣，直接返回空，节省 Token
    if (!chat.isCouple) return "";

    let prompt = `\n\n=== 【情侣空间数据同步 (这是真实发生的历史，请勿虚构)】 ===\n`;
    
    // 2. 基础恋爱数据
    if (chat.coupleData && chat.coupleData.startDate) {
        const days = Math.floor((Date.now() - chat.coupleData.startDate) / (1000 * 60 * 60 * 24)) + 1;
        prompt += `[恋爱状态]: 你们已恋爱 ${days} 天。\n`;
    }

    // ===========================================
    // ★★★ 核心修复：把情侣空间的动态和评论“喂”给AI ★★★
    // ===========================================
    let cpMoments = (chat.coupleData && chat.coupleData.moments) ? chat.coupleData.moments : [];
    
    if (cpMoments.length > 0) {
        prompt += `\n[情侣空间-最近动态流 (请基于此回答用户关于情侣空间的问题)]:\n`;
        
        // 只读取最近 3 条动态，防止 Token 爆炸
        const recentPosts = cpMoments.slice(0, 3);
        
        recentPosts.forEach(post => {
            // 1. 动态本身
            const author = (post.user === 'me') ? 'User(你的恋人)' : '你(Char)';
            prompt += `> [动态] ${author} 在 ${post.time} 发布: "${post.text}"\n`;
            
            // 2. 评论区 (这是修复“牛头不对马嘴”的关键)
            if (post.comments && post.comments.length > 0) {
                prompt += `  [评论区对话]:\n`;
                post.comments.forEach(c => {
                    const cAuthor = (c.user === 'me') ? 'User' : '你';
                    let cContent = c.text;
                    
                    // 处理 "回复xxx：" 这种格式，让 AI 读起来更顺畅
                    // 如果内容是 "回复时屿：xxx"，清洗为 "xxx"
                    if (cContent.includes('：')) {
                        const parts = cContent.split('：');
                        if (parts.length > 1) cContent = parts[1];
                    }
                    else if (cContent.includes(':')) {
                         const parts = cContent.split(':');
                         if (parts.length > 1) cContent = parts[1];
                    }

                    prompt += `  - ${cAuthor} 说: "${cContent}"\n`;
                });
            }
            prompt += `  ---(这条动态结束)---\n`;
        });
    } else {
        prompt += `(情侣空间暂无动态)\n`;
    }

    // ===========================================
    // 3. 信箱数据 (保持原有逻辑)
    // ===========================================
    let letters = (chat.coupleData && chat.coupleData.letters) ? chat.coupleData.letters : [];
    if (letters.length > 0) {
        prompt += `\n[秘密信箱-最近通信]:\n`;
        const recentLetters = letters.slice(-2); 
        recentLetters.forEach(l => {
            const sender = l.from === 'me' ? 'User' : '你';
            const receiver = l.from === 'me' ? '你' : 'User';
            prompt += `- [${sender} 写给 ${receiver} 的信]: 标题《${l.title}》, 内容: "${l.content.substring(0, 50)}..."\n`;
        });
    }

    // ===========================================
    // 4. 每日一问 (保持原有逻辑)
    // ===========================================
    let questions = (chat.coupleData && chat.coupleData.questions) ? chat.coupleData.questions : [];
    if (questions.length > 0) {
        const lastQ = questions[0];
        prompt += `\n[每日一问]: "${lastQ.title}"\n`;
        if (lastQ.myAnswer) prompt += ` - User回答: ${lastQ.myAnswer}\n`;
        if (lastQ.charAnswer) prompt += ` - 你的回答: ${lastQ.charAnswer}\n`;
    }

    // 5. 告诉他指令格式 (必不可少)
prompt += `
【功能权限说明】：
1. **写信**：想写长篇情书时，回复末尾加：[CP_LETTER:标题:正文内容(150字以上)]
2. 写信是为了存放那些深沉、细腻、平时羞于启齿的长篇爱意。
3. **发起提问**：当你通过“每日一问”或者想主动问User一个问题（例如关于三观、回忆、喜好）并让他回答时，必须使用指令：
   [CP_ASK:你的问题内容]
   (例如：[CP_ASK:如果我们可以一起去旅行，你最想去哪里？])
   ★注意：使用了此指令后，问题会自动变成一张“问答卡片”出现在情侣空间里，User点击后才能回答。
4. **发动态**: 想在情侣空间发一条动态时，回复: [CP_POST:内容] (例如: [CP_POST:今天和你聊天好开心])
\n`;
if (chat.coupleData.moods && chat.coupleData.moods.length > 0) {
        // 获取最新的两条心情（我和Char的）
        const recentMoods = chat.coupleData.moods.slice(0, 2);
        prompt += `\n[情侣空间-最新心情日记]:\n`;
        
        recentMoods.forEach(m => {
            const who = m.userId === 'me' ? 'User' : '你(Char)';
            const moodText = CP_MOODS_DB.find(db => db.id === m.moodId)?.text || '未知心情';
            // 转换时间戳为易读格式
            const d = new Date(m.timestamp);
            const timeStr = `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
            
            prompt += `- ${timeStr} ${who}: 状态[${moodText}], 说: "${m.text}"\n`;
        });
        
        prompt += `(你可以根据这些心情状态来调整聊天的语气，比如如果User心情不好，就多关心一下)\n`;
    }
    return prompt;
    
}

// 挂载到全局，让 script.js 能调用
window.getCoupleStatusForAI = getCoupleStatusForAI;

// =========================================
// ★★★ 新增功能：情侣每日一问 (Questions) ★★★
// =========================================

// 预设问题库 (你可以自己加更多)
const CP_QUESTIONS_DB = [
    "你相信一见钟情吗？",
    "描述一下你理想中的完美约会。",
    "你觉得恋爱中最重要的三个品质是什么？",
    "如果是世界末日，你想和我做的最后一件事是什么？",
    "你最喜欢我身上的哪个部位？",
    "有没有哪一首歌会让你想起我？",
    "第一次见到我的时候，你心里在想什么？",
    "我们之间最让你难忘的一个瞬间是什么？",
    "你觉得我们老了以后会是什么样子？",
    "如果可以去世界上任何地方，你想和我去哪里？"
];

// 获取或生成今天的问题
function getTodayQuestion(chat) {
    if (!chat.coupleData.questions) chat.coupleData.questions = [];
    
    const todayStr = getFormatDateStr(new Date());
    
    // 查找今天是否已经有问题了
    let q = chat.coupleData.questions.find(item => item.date === todayStr);
    
    if (!q) {
        // 如果没有，生成一个新的
        // 简单逻辑：按天数取余，循环使用问题库，或者随机
        const dayIndex = chat.coupleData.questions.length; 
        const questionText = CP_QUESTIONS_DB[dayIndex % CP_QUESTIONS_DB.length];
        
        q = {
            id: Date.now(),
            date: todayStr,
            dayIndex: dayIndex + 1, // 第几个问题
            title: questionText,
            myAnswer: null,
            charAnswer: null
        };
        // 插入到数组最前面（最新的在上面）
        chat.coupleData.questions.unshift(q);
        saveData();
    }
    return q;
}

// --- 修改后的 renderCpQuestions ---
function renderCpQuestions(chat) {
    const container = document.getElementById('cp-questions-list');
    if (!container) return;
    container.innerHTML = '';

    // 初始化数组
    if (!chat.coupleData.questions) chat.coupleData.questions = [];
    
    // 空状态
    if (chat.coupleData.questions.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#999;font-size:12px;margin-top:50px;opacity:0.6;">还没有提问，点右下角 + 问TA一个问题吧~</div>';
        return;
    }

    const start = chat.coupleData.startDate || Date.now();
    const diff = Date.now() - start;
    const daysCount = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;

    chat.coupleData.questions.forEach(q => {
        const charName = chat.name;
        const myName = chat.userRemark || "我";
        const asker = q.asker || 'char'; 

        let answerAreaHtml = '';
        
        if (asker === 'me') {
            // 我问 Char
            if (q.charAnswer) {
                answerAreaHtml = `
                    <div class="cp-qa-row">
                        <div class="cp-qa-name is-char">${charName}：</div>
                        <div class="cp-qa-text">${q.charAnswer}</div>
                    </div>
                `;
            } else {
                answerAreaHtml = `
                    <div class="cp-qa-waiting-text">( ${charName} 正在思考中... )</div>
                `;
            }
        } else {
            // Char 问 我
            if (q.myAnswer) {
                answerAreaHtml = `
                    <div class="cp-qa-row">
                        <div class="cp-qa-name is-me">${myName}：</div>
                        <div class="cp-qa-text">${q.myAnswer}</div>
                    </div>
                    <div style="text-align:right; margin-top:5px;">
                        <span style="font-size:11px; color:#ccc; cursor:pointer;" onclick="reEditAnswer(${q.id}, '${q.myAnswer}')">修改</span>
                    </div>
                `;
            } else {
                answerAreaHtml = `
                    <div class="cp-qa-input-row">
                        <input type="text" id="qa-input-${q.id}" class="cp-qa-inline-input" placeholder="写下你的回答..." autocomplete="off">
                        <button class="cp-qa-inline-btn" onclick="submitCpQuestionInline(${q.id})">发送</button>
                    </div>
                `;
            }
        }

        // ★★★ 核心修改：包裹左滑结构 ★★★
        const cardHtml = `
            <div class="cp-qa-swipe-container" id="qa-wrap-${q.id}">
                <!-- 红色删除层 -->
                <div class="cp-qa-delete-action" onclick="deleteCpQuestion(${q.id})">
                    <i class="fas fa-trash-alt"></i>
                </div>
                
                <!-- 可滑动卡片层 -->
                <div class="cp-qa-card cp-qa-card-slider" id="qa-slider-${q.id}"
                     ontouchstart="handleQaSwipeStart(event, ${q.id})"
                     ontouchmove="handleQaSwipeMove(event, ${q.id})"
                     ontouchend="handleQaSwipeEnd(event, ${q.id})">
                     
                    <div class="cp-qa-title">${q.title}</div>
                    <div class="cp-qa-sub">#第${q.dayIndex}个问题 · 在一起${daysCount}天</div>
                    <div class="cp-qa-line"></div>
                    
                    <div class="cp-qa-answer-block">
                        ${answerAreaHtml}
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += cardHtml;
    });
}

// --- 新增：左滑删除逻辑 ---

let qaSwipeStartX = 0;
let qaSwipeCurrentX = 0;
let qaActiveSwipeId = null; // 当前正在滑动的ID

function handleQaSwipeStart(e, id) {
    qaSwipeStartX = e.touches[0].clientX;
    qaActiveSwipeId = id;
    
    // 如果点了别的卡片，把其他的都复位
    document.querySelectorAll('.cp-qa-card-slider').forEach(el => {
        if (el.id !== `qa-slider-${id}`) {
            el.style.transform = 'translateX(0)';
        }
    });
}

/* --- couple-space.js 末尾 --- */

// 左滑移动中
function handleQaSwipeMove(e, id) {
    if (qaActiveSwipeId !== id) return;
    
    qaSwipeCurrentX = e.touches[0].clientX;
    let diff = qaSwipeCurrentX - qaSwipeStartX;
    
    // 只能向左滑
    if (diff < -80) diff = -80;
    if (diff > 0) diff = 0;

    const slider = document.getElementById(`qa-slider-${id}`);
    if (slider) {
        slider.style.transition = 'none';
        slider.style.transform = `translateX(${diff}px)`;
        
        // ★★★ 新增：只要开始滑动，就让红色按钮显形 ★★★
        if (diff < -5) {
            const wrap = document.getElementById(`qa-wrap-${id}`);
            const delBtn = wrap ? wrap.querySelector('.cp-qa-delete-action') : null;
            if (delBtn) delBtn.style.opacity = '1';
        }
    }
}

// 左滑结束
function handleQaSwipeEnd(e, id) {
    if (qaActiveSwipeId !== id) return;
    
    const slider = document.getElementById(`qa-slider-${id}`);
    // 获取删除按钮
    const wrap = document.getElementById(`qa-wrap-${id}`);
    const delBtn = wrap ? wrap.querySelector('.cp-qa-delete-action') : null;

    if (!slider) return;

    slider.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';

    const diff = qaSwipeCurrentX - qaSwipeStartX;
    
    // 如果滑动距离超过 40，则展开
    if (diff < -40) {
        slider.style.transform = 'translateX(-70px)';
        // ★★★ 保持显示 ★★★
        if (delBtn) delBtn.style.opacity = '1';
    } else {
        // 否则回弹关闭
        slider.style.transform = 'translateX(0)';
        // ★★★ 核心修复：回弹后隐藏红色按钮，彻底杜绝溢色 ★★★
        if (delBtn) delBtn.style.opacity = '0';
    }
    
    qaSwipeStartX = 0;
    qaSwipeCurrentX = 0;
    qaActiveSwipeId = null;
}
// --- 新增：执行删除提问 ---
function deleteCpQuestion(questionId) {
    if (!confirm("确定要删除这个问题吗？")) {
        // 如果取消，把滑块滑回去
        const slider = document.getElementById(`qa-slider-${questionId}`);
        if(slider) slider.style.transform = 'translateX(0)';
        return;
    }

    const chat = chatList.find(c => c.id === currentCoupleChatId);
    if (!chat || !chat.coupleData || !chat.coupleData.questions) return;

    // 过滤掉该ID的问题
    chat.coupleData.questions = chat.coupleData.questions.filter(q => q.id !== questionId);
    
    saveData();
    renderCpQuestions(chat);
}
// --- 提交回答的函数 (请确保把它也加上) ---
function submitCpQuestionInline(questionId) {
    const input = document.getElementById(`qa-input-${questionId}`);
    if (!input) return;
    
    const text = input.value.trim();
    if (!text) return; 

    const chat = chatList.find(c => c.id === currentCoupleChatId);
    if (!chat || !chat.coupleData || !chat.coupleData.questions) return;

    const q = chat.coupleData.questions.find(item => item.id === questionId);
    if (q) {
        q.myAnswer = text; 
        saveData();        
        renderCpQuestions(chat); // 重新渲染，输入框会自动消失，变成文本
    }
}

// --- (可选) 允许修改回答 ---
function reEditAnswer(questionId, oldText) {
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    if (!chat) return;
    const q = chat.coupleData.questions.find(item => item.id === questionId);
    if (q) {
        q.myAnswer = null; // 暂时清空，触发重新渲染为输入框
        // 渲染界面
        renderCpQuestions(chat);
        // 自动填入旧值
        setTimeout(() => {
            const input = document.getElementById(`qa-input-${questionId}`);
            if(input) input.value = oldText;
        }, 50);
    }
}

// --- 修改 5：AI 回答逻辑 ---
async function triggerAiQuestionAnswer(chat, questionObj) {
    const apiKey = document.getElementById('apiKey').value;
    const endpoint = document.getElementById('apiEndpoint').value;
    const model = document.getElementById('apiModel').value;
    
    // 只有当我问的时候，或者AI没回答的时候才触发
    if (!apiKey || questionObj.charAnswer) return;

    const persona = getFullPersona(chat);
    
    // 构造提示词：因为是我问，AI只需要回答
    const prompt = `
    你现在是 ${chat.name}，我是你的恋人。
    ${persona}
    
    【我的提问】："${questionObj.title}"
    
    【任务】：
    请直接回答我的这个问题。
    语气要亲密、自然、符合你的性格。
    ★不要带引号，不要重复问题，直接输出你的回答。★
    `;

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.8
            })
        });
        const data = await response.json();
        const aiReply = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');

        // 写入回答
        questionObj.charAnswer = aiReply;
        saveData();
        
        // 刷新界面
        if (currentCpTab === 'questions' && currentCoupleChatId === chat.id) {
            renderCpQuestions(chat);
        }

    } catch (e) {
        console.error("AI QA Error", e);
    }
}

// --- 辅助：触发 Char 主动提问 ---
// 你可以在 enterCoupleSpace() 的末尾调用它： checkAndTriggerCharAsk(chat);
async function checkAndTriggerCharAsk(chat) {
    const todayStr = getFormatDateStr(new Date());
    if (!chat.coupleData.questions) chat.coupleData.questions = [];

    // 检查今天是否已经有人提问了（不管是通过谁）
    const hasTodayQ = chat.coupleData.questions.some(q => q.date === todayStr);
    
    // 如果今天没问题，且随机概率触发 (这里为了测试设为 100%，你可以改为 Math.random() > 0.5)
    if (!hasTodayQ) {
        await triggerAiToAskQuestion(chat);
    }
}

// AI 生成问题并发布
async function triggerAiToAskQuestion(chat) {
    const apiKey = document.getElementById('apiKey').value;
    const endpoint = document.getElementById('apiEndpoint').value;
    const model = document.getElementById('apiModel').value;
    if (!apiKey) return;

    const persona = getFullPersona(chat);
    const prompt = `
    你现在是 ${chat.name}，我是你的恋人。
    ${persona}
    
    【任务】：
    今天还没有进行“每日一问”。请你主动想一个关于恋爱、生活、三观或我们之间回忆的问题，来向我提问。
    
    ★【强制要求】：
    1. 绝对禁止输出动作描写（如 *歪头*、*微笑*）。
    2. 绝对禁止输出心理描写（如 (想了想)、(好奇)）。
    3. 不要带任何括号、星号、引号。
    4. 只输出问题本身的一句话。
    `;

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.9
            })
        });
        const data = await response.json();
        const questionText = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');

        // 存入数据：asker 是 'char'
        const newQ = {
            id: Date.now(),
            date: getFormatDateStr(new Date()),
            dayIndex: chat.coupleData.questions.length + 1,
            title: questionText,
            asker: 'char',     // ★ 标记是Char问的
            myAnswer: null,    // 等待我回答
            charAnswer: null   // Char不需要自问自答
        };

        chat.coupleData.questions.unshift(newQ);
        saveData();
        
        if (currentCpTab === 'questions' && currentCoupleChatId === chat.id) {
            renderCpQuestions(chat);
        }

    } catch (e) { console.error(e); }
}

// ★★★ 新增：行内直接提交回答 ★★★
function submitCpQuestionInline(questionId) {
    const input = document.getElementById(`qa-input-${questionId}`);
    if (!input) return;
    
    const text = input.value.trim();
    if (!text) return; // 空内容不提交

    const chat = chatList.find(c => c.id === currentCoupleChatId);
    if (!chat || !chat.coupleData || !chat.coupleData.questions) return;

    // 找到对应的问题
    const q = chat.coupleData.questions.find(item => item.id === questionId);
    if (q) {
        q.myAnswer = text; // 更新回答
        saveData();        // 保存
        renderCpQuestions(chat); // 刷新界面
    }
}

// =================================================
// ★★★ 新增功能：情侣心情日记 (Mood Diary) 修复版 ★★★
// =================================================

// 1. 补回丢失的数据配置 (必须要有这个！)
const CP_MOODS_DB = [
    { id: 'happy', text: '超级开心', url: 'https://i.postimg.cc/pTtNV5rB/002.png' },
    { id: 'sad', text: '有点难过', url: 'https://i.postimg.cc/4xKjzQh0/003.png' },
    { id: 'cry', text: '难过大哭', url: 'https://i.postimg.cc/MKHLSmtv/004.png' },
    { id: 'angry', text: '生气', url: 'https://i.postimg.cc/B6JhwTX3/017.png' },
    { id: 'shy', text: '害羞', url: 'https://i.postimg.cc/ZKWwgKKW/007.png' },
    { id: 'confused', text: '迷糊', url: 'https://i.postimg.cc/zf8SJJ5P/005.png' },
    { id: 'calm', text: '淡定', url: 'https://i.postimg.cc/xdny00Yg/008.png' },
    { id: 'shocked', text: '惊吓', url: 'https://i.postimg.cc/q74Xkk0b/024.png' }
];

// 2. 打开弹窗
function openMoodModal() {
    const modal = document.getElementById('cp-mood-modal');
    
    // 重置步骤
    const step1 = document.getElementById('mood-step-1');
    const step2 = document.getElementById('mood-step-2');
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    
    currentSelectedMoodId = null;

    // 渲染选图网格
    const grid = document.getElementById('cpMoodGrid');
    if (grid) {
        grid.innerHTML = '';
        CP_MOODS_DB.forEach(mood => {
            grid.innerHTML += `
                <div class="cp-mood-option" onclick="selectMood('${mood.id}')">
                    <img src="${mood.url}">
                    <span style="font-size:10px;color:#888;margin-top:5px;">${mood.text}</span>
                </div>
            `;
        });
    }

    if(modal) modal.style.display = 'flex';
}

function closeMoodModal() {
    const modal = document.getElementById('cp-mood-modal');
    if(modal) modal.style.display = 'none';
}

// 3. 选中贴图
function selectMood(moodId) {
    currentSelectedMoodId = moodId;
    const moodObj = CP_MOODS_DB.find(m => m.id === moodId);
    
    // 切换到输入界面
    document.getElementById('mood-step-1').style.display = 'none';
    document.getElementById('mood-step-2').style.display = 'flex';
    
    // 显示预览
    document.getElementById('mood-preview-img').src = moodObj.url;
    
    // 清空并聚焦输入框
    const input = document.getElementById('mood-input-text');
    if(input) {
        input.value = '';
        input.focus();
    }
}

// 4. 返回重选
function backToMoodStep1() {
    document.getElementById('mood-step-1').style.display = 'block';
    document.getElementById('mood-step-2').style.display = 'none';
}

// 5. 提交心情
async function submitMood() {
    if (!currentSelectedMoodId || !currentCoupleChatId) return;
    
    const text = document.getElementById('mood-input-text').value.trim();
    const chat = chatList.find(c => c.id === currentCoupleChatId);
    
    if (!chat.coupleData.moods) chat.coupleData.moods = [];

    const now = new Date();
    const entry = {
        id: Date.now(),
        userId: 'me',
        moodId: currentSelectedMoodId,
        text: text,
        timestamp: now.getTime(),
        dateStr: `${now.getMonth()+1}-${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    };

    chat.coupleData.moods.unshift(entry);
    saveData();

    renderCpMoodList(chat);
    closeMoodModal();

    await triggerAiMoodCheckIn(chat, entry);
}

// --- couple-space.js ---

// 渲染心情列表 (无轴线、直角版、带时间)
function renderCpMoodList(chat) {
    const container = document.getElementById('cp-mood-timeline');
    if (!container) return;
    container.innerHTML = '';

    if (!chat.coupleData.moods) chat.coupleData.moods = [];

    if (chat.coupleData.moods.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:#ccc;margin-top:50px;font-size:12px;">还没有心情记录~</div>`;
        return;
    }

    // ★★★ 1. 这里不再创建 timeline-center-line (中心线) ★★★

    chat.coupleData.moods.forEach(item => {
        const moodObj = CP_MOODS_DB.find(m => m.id === item.moodId) || CP_MOODS_DB[0];
        const isMe = item.userId === 'me';
        
        // 区分左右布局 (Char在左，Me在右)
        const sideClass = isMe ? 'right' : 'left'; 
        
        // ★★★ 2. 格式化日期和时间 ★★★
        const dateObj = new Date(item.timestamp);
        // 格式示例: 10月24日 14:30
        const dateStr = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日 ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
        
        // 卡片内部内容：贴图 + 文字
        const contentHtml = `
            <img src="${moodObj.url}" class="mood-sticker-img">
            ${item.text ? `<div class="mood-text-content">${item.text}</div>` : ''}
        `;

        // ★★★ 3. 组装 HTML (去掉了 mood-dot 和 mood-wrapper-side 的复杂嵌套) ★★★
        const html = `
            <div class="mood-node ${sideClass}">
                <!-- 时间日期标签 -->
                <div class="mood-date-tag">${dateStr}</div>
                
                <!-- 直角卡片 -->
                <div class="mood-unified-card">
                    ${contentHtml}
                </div>
            </div>
        `;
        container.innerHTML += html;
    });
}

async function triggerAiMoodCheckIn(chat, userEntry) {
    const apiKey = document.getElementById('apiKey').value;
    const endpoint = document.getElementById('apiEndpoint').value;
    const model = document.getElementById('apiModel').value;
    if (!apiKey) return;

    // 1. 获取人设
    const persona = getFullPersona(chat);
    
    // 获取当前时间段（早上/中午/晚上/深夜），帮助AI决定写什么
    const hour = new Date().getHours();
    let timeContext = "现在是白天";
    if(hour < 6) timeContext = "现在是凌晨，夜深人静";
    else if(hour < 11) timeContext = "现在是早晨";
    else if(hour < 14) timeContext = "现在是中午";
    else if(hour < 19) timeContext = "现在是下午";
    else timeContext = "现在是晚上";

    // 2. ★★★ 核心 Prompt 修改：强制独立生活模拟 ★★★
    const prompt = `
    你现在是 ${chat.name}。
    ${persona}

    【当前场景】：
    这是你的【私人心情记录】。你正在更新一条状态。
    ${timeContext}。

    【任务】：
    请完全**忽略**你的恋人(User)刚才发了什么。
    你需要**虚构**一件你刚才在“离线状态”下发生的、具体的**生活琐事**，并记录下来。

    【内容生成器 - 请从以下方向中随机选择一个】：
    1. **感官体验**：例如“便利店的饭团好难吃”、“刚洗完澡头发干得慢”、“隔壁装修好吵”、“外面的云像棉花糖”。
    2. **具体事件**：例如“刚刚打游戏五连跪心态崩了”、“下楼拿外卖差点摔倒”、“终于把作业/工作搞定了”。
    3. **胡思乱想**：例如“突然想喝奶茶了”、“在这个点醒来有点尴尬”、“不知道周末去哪里玩”。
    4. **身体状态**：例如“胃有点疼”、“困得睁不开眼”、“刚才跑了两圈现在好爽”。

    【绝对禁止】：
    ❌ 禁止回复User（不要说“我也这样觉得”、“抱抱你”）。
    ❌ 禁止提及User（除非是像“好想见TA”这种思念，否则不要因为User发了动态你才提TA）。
    ❌ 禁止空泛（不要只写“开心”或“难过”，要有**具体的原因**）。

    【语气要求】：
    - 极度口语化，像是在自言自语，或者发推特/微博。
    - 短小精悍（20字以内）。
    - 必须是你**自己**的生活记录。

    返回 JSON 格式: {"moodId": "心情ID", "text": "日记内容"}
    
    *心情ID可选值*: happy(开心), sad(难过), cry(大哭), angry(生气), shy(害羞), confused(迷糊), calm(淡定), shocked(震惊)。
    `;

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model, 
                messages: [{ role: "user", content: prompt }], 
                temperature: 0.9 // 温度调高，增加随机性和生活感
            })
        });
        const data = await response.json();
        let content = data.choices[0].message.content.trim().replace(/```json|```/g, '').trim();
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            
            // 简单的 moodId 容错映射
            let aiMoodId = result.moodId;
            const validMoods = CP_MOODS_DB.map(m => m.id);
            if (!validMoods.includes(aiMoodId)) {
                aiMoodId = 'calm'; 
            }

            const now = new Date();
            
            // 插入数据
            chat.coupleData.moods.unshift({
                id: Date.now() + 1,
                userId: 'char',
                moodId: aiMoodId,
                text: result.text, 
                timestamp: now.getTime(),
                dateStr: `${now.getMonth()+1}-${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
            });
            
            saveData();
            
            // 刷新列表
            if (currentCpTab === 'mood' && currentCoupleChatId === chat.id) {
                renderCpMoodList(chat);
            }
        }
    } catch (e) { 
        console.error("AI Mood Error", e); 
    }
}