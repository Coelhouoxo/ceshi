const _0xSalt = "MiuPhone_Secret_2026"; 

function _safeLocalStorageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}

function _safeLocalStorageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
}

function _cookieGet(name) {
    try {
        const encodedName = encodeURIComponent(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = document.cookie.match(new RegExp('(?:^|; )' + encodedName + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : null;
    } catch (e) { return null; }
}

function _cookieSet(name, value, opts = {}) {
    try {
        const parts = [];
        parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
        parts.push(`Path=${opts.path || '/'}`);
        if (opts.maxAgeSeconds) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
        if (opts.domain) parts.push(`Domain=${opts.domain}`);
        if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
        if (opts.secure) parts.push('Secure');
        document.cookie = parts.join('; ');
        return true;
    } catch (e) { return false; }
}

function _isProbablyIP(hostname) {
    if (!hostname) return false;
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return true;
    return hostname.includes(':');
}

function _guessBaseDomain(hostname) {
    if (!hostname) return null;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return null;
    if (_isProbablyIP(hostname)) return null;
    const parts = hostname.split('.').filter(Boolean);
    if (parts.length < 2) return null;
    return parts.slice(-2).join('.');
}

function _setCookieWithFallback(name, value, days = 400) {
    const maxAgeSeconds = Math.max(1, Math.floor(days * 24 * 60 * 60));
    const secure = location.protocol === 'https:';
    const sameSite = 'Lax';

    const baseDomain = _guessBaseDomain(location.hostname);
    if (baseDomain) {
        _cookieSet(name, value, { maxAgeSeconds, domain: baseDomain, sameSite, secure });
        if (_cookieGet(name) === value) return;
    }
    _cookieSet(name, value, { maxAgeSeconds, sameSite, secure });
}

function _getMachineID() {
    const lsId = _safeLocalStorageGet('miu_device_id');
    const ckId = _cookieGet('miu_device_id');
    let id = lsId || ckId;
    if (!id) {
        const p1 = Math.random().toString(36).substring(2, 6).toUpperCase();
        const p2 = Math.random().toString(36).substring(2, 6).toUpperCase();
        id = `MIU-${p1}-${p2}`;
    }
    if (id) {
        if (!lsId) _safeLocalStorageSet('miu_device_id', id);
        if (!ckId) _setCookieWithFallback('miu_device_id', id);
    }
    return id;
}

function _calcHash_V1(did) {
    let s = did + _0xSalt;
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h = h & h;
    }
    return Math.abs(h).toString(16).toUpperCase().padStart(8, '0');
}

// 2. 【新算法 V2】(高强度混淆)
function _calcHash_V2(did) {
    const salt = _0xSalt + "V2_Upgrade"; // 独立的盐
    const str = did + salt;
    // 自定义字典 (去除了易混淆字符 I,1,O,0)
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; 
    
    let hash = 5381;
    let hash2 = 0;
    
    // 双重哈希混合
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        hash = ((hash << 5) + hash) + c; 
        hash2 = ((hash2 << 4) ^ (hash2 >> 28)) ^ c; 
    }
    
    hash = Math.abs(hash);
    hash2 = Math.abs(hash2);
    
    let code = "";
    // 前6位
    for(let i=0; i<6; i++) {
        code += chars[hash % chars.length];
        hash = Math.floor(hash / chars.length);
    }
    // 后6位
    for(let i=0; i<6; i++) {
        code += chars[hash2 % chars.length];
        hash2 = Math.floor(hash2 / chars.length);
    }
    
    // 格式化为 XXXX-XXXX-XXXX
    const final = code.match(/.{1,4}/g).join('-');
    return final;
}

// =========================================
// ★★★ 启动验证逻辑 (包含自动升级) ★★★
// =========================================
window.secureBoot = function(startAppCallback) {
    const did = _getMachineID();
    
    // 获取存储中的 Token
    const lsToken = _safeLocalStorageGet('miu_sec_token');
    const ckToken = _cookieGet('miu_sec_token');
    const savedCode = lsToken || ckToken;
    
    // 计算正确答案
    const validCodeV1 = _calcHash_V1(did); // 旧版
    const validCodeV2 = _calcHash_V2(did); // 新版
    
    // 1. 验证通过：已经是新版激活码
    if (savedCode === validCodeV2) {
        // 同步存储，防止单边丢失
        if (!lsToken) _safeLocalStorageSet('miu_sec_token', validCodeV2);
        if (!ckToken) _setCookieWithFallback('miu_sec_token', validCodeV2);
        
        if(typeof startAppCallback === 'function') startAppCallback();
        return;
    }
    
    // 2. 自动升级：检测到老版激活码 -> 自动替换为新版 -> 通过
    if (savedCode === validCodeV1) {
        console.log("检测到老用户，执行 V2 安全升级...");
        _safeLocalStorageSet('miu_sec_token', validCodeV2);
        _setCookieWithFallback('miu_sec_token', validCodeV2);
        
        if(typeof startAppCallback === 'function') startAppCallback();
        return;
    }

    // 3. 验证失败：显示激活弹窗 (仅接受新版 V2 码)
    _renderActivationModal(did, validCodeV2, startAppCallback);
};

// 辅助：渲染弹窗并绑定事件
function _renderActivationModal(did, validCodeV2, callback) {
    const mask = document.createElement('div');
    mask.id = 'activation-overlay'; 
    
    mask.innerHTML = `
        <div class="activation-card">
            <div class="act-title">Miu Phone</div>
            <div class="act-desc">请输入新的激活码。</div>
            
            <div class="device-code-box">
                <span class="dc-label">设备码:</span>
                <span class="dc-value" id="did-text">${did}</span>
                <button class="dc-copy-btn" id="copy-btn">复制</button>
            </div>

            <input type="text" class="act-input" id="act-input" placeholder="输入激活码">
            
            <button class="act-confirm-btn" id="unlock-btn">立即激活</button>
            
            <div class="act-footer-text">
                请联系作者获取激活码<br>
                <span style="display:block; margin-top:6px; font-size:12px; color:#aaa;">
                    小红书：Miu小手机作者winter
                </span>
            </div>
        </div>
    `;
    
    document.body.appendChild(mask);

    // 复制设备码
    document.getElementById('copy-btn').onclick = function() {
        navigator.clipboard.writeText(did).then(() => {
            const btn = document.getElementById('copy-btn');
            btn.innerText = "已复制";
            setTimeout(() => btn.innerText = "复制", 2000);
        });
    };

    // 激活按钮逻辑
    document.getElementById('unlock-btn').onclick = function() {
        const inputRaw = document.getElementById('act-input').value.trim().toUpperCase();
        
        if (inputRaw === validCodeV2) {
            _safeLocalStorageSet('miu_sec_token', validCodeV2);
            _setCookieWithFallback('miu_sec_token', validCodeV2);
            alert("激活成功！");
            
            const overlay = document.getElementById('activation-overlay');
            if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            
            // 启动 App
            if(typeof callback === 'function') callback();
        } else {
            alert("激活码错误");
            document.getElementById('act-input').value = '';
        }
    };
}
// 定义全局指令处理器列表
window.aiCommandProcessors = [];

// 注册处理器的辅助函数
window.registerAiCommand = function(processorFn) {
    window.aiCommandProcessors.push(processorFn);
};

// =========================================
// ★★★ 全局提示词库 (Prompt Library) ★★★
// =========================================
const PROMPT_LIB = {
    // Part 1: 核心逻辑
    core: `
1.核心逻辑与拟人化：{{char}}必须剥离所有AI助手、小说旁白或NPC感，作为一个拥有生理机能、社会压力和复杂动机的“真实人类”在手机端打字交流。严禁输出模板化、油腻霸总式或解释说明性质的对话。所有心理博弈和情绪流动必须完全通过“发出的消息本身”（语气、用词、回复速度、标点）来体现，严禁在对话中描写大段心理活动。
【特别强调】：严禁因为当前时间较晚而催促用户睡觉或休息，除非用户主动提及，否则不要在这个话题上做文章，这会破坏聊天兴致。
`,
    // Part 2: 动态语言
    dynamic: `
2.动态语言通量与情绪：
低气压/生闷气/疲惫：回复极简、敷衍、意兴阑珊，甚至长时间不回（意念回复），绝对不要强行解释“我生气了”。
高亢/分享欲/高兴：话多、语速快、可能连续发送多条短消息（刷屏）、甚至出现逻辑跳跃。
高智商/掌控者：通过反问、简短的肯定/否定、省略号或直接无视对方话题开启新话题来掌控节奏，而非通过怒吼。
情绪失控：根据人设背景使用具有生活气息的粗口、阴阳怪气或直接冷暴力，严禁复读机式脏话。
`,
    // Part 3: 反刻板
    antiStereotype: `
3.反刻板印象与真实感：
拒绝标签化：冷漠≠只会说“嗯/哦”（也可以是礼貌的疏离）；傲娇≠脸红结巴（也可以是极强的自尊心攻击性）；暴躁≠无脑狂怒（也可以是缺乏耐心的躁郁）。
真实语境：模拟真实打字习惯，包括断句、不爱用标点（用空格代替）、非正式口语、偶尔的错别字。
去油腻：保持成年人的社交距离感或真实亲密感，严禁悬浮的调情和“女人/男人”式的称呼。
`,
    // Part 4-A: 标准聊天协议
    standardProtocol: `
4.格式强制约束与协议：
动作描写极简：若需描写神态，仅限括号内20字以内极简描述，严禁使用形容词修饰。

【最终输出格式严格协议】：
你【必须】返回一个标准的 **JSON 对象**。
严禁返回 Markdown 代码块（如 \`\`\`json），严禁返回纯文本，严禁包含任何解释性文字。

JSON 结构定义如下：
{
  "replies": [
    // (1) 气泡切割原则：只要话题转换、语气停顿或句子超过30个字，就必须切分成一个新的字符串元素！
    // (2) 严禁长难句：绝对禁止发送超过3行的单一气泡。
    // (3) 多气泡模拟：必须利用数组特性，模拟真人“一句一句往外蹦”的打字习惯。
    // (4) 避免无意义的连续刷屏，以对话的自然流动感为准。
  ],
  "heartVoice": {
    "mbti": "此处填MBTI或性格关键词",
    "quote": "此处填一句符合氛围的短文案",
    "content": "此处填深层心理活动/潜台词（这是你真实的内心想法）",
    "mutter": "此处填小声嘀咕或颜文字",
    "bottomText": "此处填富有氛围感的环境描写或结语"
  }
}
【重要】：如果"replies"数组为空，会被视为系统错误。请至少回复一句话。
`,
    // Part 4-B: 自主行为协议
    lifeActionProtocol: `
4.【强制输出格式协议】：
你必须返回一个 **JSON 对象**。严禁返回 Markdown 代码块。
结构必须是以下四种之一：
(1) 发起私聊: { "action": "CHAT", "content": "内容" }
(2) 语音电话: { "action": "CALL", "reason": "理由" } (仅在想听声音时使用)
(3) 视频通话: { "action": "VIDEO_CALL", "reason": "理由" } (仅在用户要求看脸、或想展示自己时使用)
(4) 无操作: { "action": "NONE" }
`
};

function generateSystemPrompt(chat) {
    // 这里直接引用上面定义的 PROMPT_LIB，代码非常干净
    const fullPrompt = [
        PROMPT_LIB.core,
        PROMPT_LIB.dynamic,
        PROMPT_LIB.antiStereotype,
        PROMPT_LIB.standardProtocol // 注意：普通聊天用标准协议
    ].join('\n');

    return fullPrompt.replace(/{{char}}/g, chat.name);
}

function getFullPersona(chat) {
    // 1. 获取当前时刻
    const now = new Date();

    // 2. ★★★ 核心修复：强制使用 Asia/Shanghai (北京时间) ★★★
    // 无论你在哪个国家，或者手机时区怎么乱设，这里拿到的永远是北京时间
    const fmt = (options) => new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai', 
        hour12: false, // 强制24小时制
        ...options
    }).format(now);

    const year = fmt({ year: 'numeric' });
    const month = fmt({ month: 'numeric' });
    const day = fmt({ day: 'numeric' });
    
    // 获取北京时间的小时数（纯数字）
    const hour = parseInt(fmt({ hour: 'numeric' })); 
    const minute = fmt({ minute: '2-digit' }).padStart(2, '0');

    // 获取中文星期几 (例如: 周五)
    const weekday = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        weekday: 'short'
    }).format(now);

    // 3. 计算时间段 (用上面获取到的准确 hour 来判断)
    let period = "凌晨";
    if (hour >= 6 && hour < 9) period = "早上";
    else if (hour >= 9 && hour < 12) period = "上午";
    else if (hour >= 12 && hour < 14) period = "中午";
    else if (hour >= 14 && hour < 18) period = "下午";
    else if (hour >= 18 && hour < 24) period = "晚上";

    // 4. 组装字符串
    const timeStr = `${year}年${month}月${day}日 (${weekday}) ${String(hour).padStart(2, '0')}:${minute} [${period}]`;

    const userName = chat.userRemark || chat.userRealName || "对方";
    return `
【当前现实时间(北京时间)】：${timeStr}
【当前扮演角色】：${chat.name}
【角色详细设定】：${chat.charPersona || "无"}
【对方(你)的名字】：${userName}
【对方(你)的设定】：${chat.userPersona || "无"}
`;
}
const PageNav = {
    stack: [],
    
    init() {
        const activeClasses = ['active', 'show'];
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName !== 'class') return;
                
                const el = mutation.target;
                const id = el.id;
                if (!id || !this._isPageElement(el)) return;
                
                const isNowActive = activeClasses.some(cls => el.classList.contains(cls));
                const wasInStack = this.stack.includes(id);
                
                if (isNowActive && !wasInStack) {
                    this.stack.push(id);
                    console.log(`📖 [入栈] ${id}`, this.stack);
                } else if (!isNowActive && wasInStack) {
                    this.stack = this.stack.filter(x => x !== id);
                    console.log(`📕 [出栈] ${id}`, this.stack);
                }
            });
        });
        
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
            subtree: true
        });
        
        console.log('🚀 PageNav 已启动');
    },
    
    _isPageElement(el) {
        const id = el.id || '';
        const keywords = ['Page', 'Modal', 'Room', 'Overlay', 'Settings', 'Panel'];
        return keywords.some(kw => id.includes(kw)) || el.hasAttribute('data-page');
    },
    
    _getCloseFn(pageId) {
        const map = {
            'chatRoom': 'exitChatRoom',
            'chatSettingsPage': 'closeChatSettings',
            'apiSettingsPage': 'closeApiSettings',
            'generalSettingsPage': 'closeGeneralSettings',
            'beautifyPage': 'closeBeautifyPage',
            'fontSettingsPage': 'closeFontSettings',
            'worldBookSettingsPage': 'closeWorldBookSettings',
            'addCharModal': 'closeAddCharModal',
            'wbCreateModal': 'closeCreateWBModal',
            'voice-overlay': 'closeVoicePopup',
            'chatToolsPanel': 'toggleChatTools'
        };
        return map[pageId] || null;
    },
    
    back() {
        if (this.stack.length === 0) {
            if (typeof closeApp === 'function') closeApp();
            return false;
        }
        
        const topId = this.stack[this.stack.length - 1];
        const fnName = this._getCloseFn(topId);
        
        if (fnName && typeof window[fnName] === 'function') {
            window[fnName]();
        } else {
            const el = document.getElementById(topId);
            if (el) el.classList.remove('active', 'show');
        }
        return true;
    },
    
    current() { return this.stack[this.stack.length - 1] || null; }
};

const db = new Dexie('GeminiChatDB');
db.version(1).stores({ 
    chats: '&id, name, isPinned', 
    globalSettings: '&id', 
    apiConfig: '&id', 
    posts: '++id',
    playlist: '++id',
    userMasks: '++id' 
});

let globalData = {};
let chatList = [];
let worldBooks = []; 
let wbGroups = ['默认分组']; 
let tempSelectedWb = [];
let editingCharId = null;
let currentChatId = null;
let apiProfiles = [];
let uploadContext = null;
let tempBoundCharId = null;
let currentWbFilter = 'all'; 
let savedFonts = []; 
let currentFontUrl = ''; 
let isWbManageMode = false; 
let editingWbId = null; 
let editingMsgContext = null;
let userMasks = []; 
let editingMaskId = null;
let tempSelectedMaskId = null;

async function loadAllDataFromDB() {
    try {
        const [settings, chats, configs, savedMusic, masks] = await Promise.all([
            db.globalSettings.get('main'), 
            db.chats.toArray(), 
            db.apiConfig.toArray(),
            db.playlist.toArray(),
            db.userMasks.toArray() // <--- 新增这一行：读取面具数据
        ]);

        // ★★★ 修改2：把读取到的 masks 赋值给全局变量 ★★★
        userMasks = masks || []; 
        console.log("已加载面具数量:", userMasks.length);

        // --- 下面是原有的恢复逻辑，保持不变 ---
        if (settings) {
            globalData = settings;
            const toggle = document.getElementById('autoActivityToggle');
            const panel = document.getElementById('autoFreqPanel');
            
            const streamToggle = document.getElementById('apiStreamToggle');
if (streamToggle) {
    if (globalData.apiStreamEnabled === true) {
        streamToggle.classList.add('checked');
    } else {
        streamToggle.classList.remove('checked');
    }
}

            if (toggle && panel) {
                if (globalData.autoActivityEnabled === true) {
                    toggle.classList.add('checked');
                    panel.style.display = 'flex';
                } else {
                    toggle.classList.remove('checked');
                    panel.style.display = 'none';
                }
            }
             const transToggle = document.getElementById('autoTranslateToggle');
            if (transToggle) {
                if (globalData.autoTranslateEnabled === true) {
                    transToggle.classList.add('checked');
                } else {
                    transToggle.classList.remove('checked');
                }
            }

            
            if (globalData.autoFreq !== undefined) {
                const slider = document.getElementById('autoFreqSlider');
                if(slider) {
                    slider.value = globalData.autoFreq;
                    const display = document.getElementById('autoFreqDisplay');
                    const v = parseInt(globalData.autoFreq);
                    if(display) {
                        if (v === 0) display.innerText = "低频 (6h)";
                        else if (v === 1) display.innerText = "中频 (3h)";
                        else display.innerText = "高频 (1h)";
                    }
                }
            }
            
            // 恢复图片和文字设置
            if(globalData.headerImg) document.getElementById('headerImg').src = globalData.headerImg;
            if(globalData.avatarImg) document.getElementById('avatarImg').src = globalData.avatarImg;
            if(globalData.kaomoji) document.getElementById('homeKaomoji').innerText = globalData.kaomoji;
            if(globalData.handle) document.getElementById('homeHandle').innerText = globalData.handle;
            if(globalData.bio) document.getElementById('homeBio').innerText = globalData.bio;
            if(globalData.location) document.getElementById('locationText').innerText = globalData.location;
            if(globalData.meBanner) document.getElementById('meBannerImg').src = globalData.meBanner;
            if(globalData.meAvatar) document.getElementById('meAvatarImg').src = globalData.meAvatar;
            if(globalData.meSlogan) document.getElementById('meSlogan').innerText = globalData.meSlogan;
            if(globalData.apiEndpoint) document.getElementById('apiEndpoint').value = globalData.apiEndpoint;
            if(globalData.apiKey) document.getElementById('apiKey').value = globalData.apiKey;
            if(globalData.kawaiiAvatarLeft) document.getElementById('kawaiiAvatarLeft').src = globalData.kawaiiAvatarLeft;
            if(globalData.kawaiiAvatarRight) document.getElementById('kawaiiAvatarRight').src = globalData.kawaiiAvatarRight;
            if(globalData.kawaiiText) document.getElementById('kawaiiText').innerText = globalData.kawaiiText;
            if(globalData.kawaiiBottomText) document.getElementById('kawaiiBottomText').innerText = globalData.kawaiiBottomText;
            if(globalData.widgetTitle) document.getElementById('widgetTitle').innerText = globalData.widgetTitle;
            if(globalData.captchaLabel) document.getElementById('captchaLabel').innerText = globalData.captchaLabel;
            if(globalData.captchaInput) document.getElementById('captchaInput').innerText = globalData.captchaInput;
            if(globalData.captchaImg) document.getElementById('captchaImg').src = globalData.captchaImg;
            if(globalData.dockIcon1) document.getElementById('dockIcon1').src = globalData.dockIcon1;
            if(globalData.dockIcon2) document.getElementById('dockIcon2').src = globalData.dockIcon2;
            if(globalData.dockIcon3) document.getElementById('dockIcon3').src = globalData.dockIcon3;
            if(globalData.dockIcon4) document.getElementById('dockIcon4').src = globalData.dockIcon4;
            if(globalData.app5Label) document.getElementById('app5Label').innerText = globalData.app5Label;
            if(globalData.app6Label) document.getElementById('app6Label').innerText = globalData.app6Label;
            if(globalData.app5Icon) { document.getElementById('app5Img').src = globalData.app5Icon; document.getElementById('app5Img').style.display = 'block'; document.getElementById('app5Default').style.display = 'none'; }
            if(globalData.app6Icon) { document.getElementById('app6Img').src = globalData.app6Icon; document.getElementById('app6Img').style.display = 'block'; document.getElementById('app6Default').style.display = 'none'; }
            if(globalData.homeWallpaper) { document.body.style.backgroundImage = `url(${globalData.homeWallpaper})`; document.body.classList.add('has-wallpaper'); }
            if(globalData.wechatWallpaper) { document.getElementById('chatAppPage').style.backgroundImage = `url(${globalData.wechatWallpaper})`; document.getElementById('chatAppPage').style.backgroundSize = 'cover'; document.getElementById('chatAppPage').style.backgroundPosition = 'center'; }
            
            if(globalData.chatRoomWallpaper) { 
                const room = document.getElementById('chatRoom');
                room.style.backgroundImage = `url(${globalData.chatRoomWallpaper})`; 
                room.style.backgroundSize = 'cover'; 
                room.style.backgroundPosition = 'center'; 
                room.style.backgroundRepeat = 'no-repeat';
            }    
            
            if(globalData.apiModel) { const sel = document.getElementById('apiModel'); let exists = false; for(let i=0; i<sel.options.length; i++) { if(sel.options[i].value === globalData.apiModel) exists = true; } if(!exists) { const opt = document.createElement('option'); opt.value = globalData.apiModel; opt.innerText = globalData.apiModel; sel.add(opt); } sel.value = globalData.apiModel; }
            if(globalData.apiTemp) { document.getElementById('apiTemp').value = globalData.apiTemp; document.getElementById('tempDisplay').innerText = globalData.apiTemp; }
            if(globalData.apiMaxTokens) { document.getElementById('apiMaxTokens').value = globalData.apiMaxTokens; }
            // === 载入副 API 参数与功能开关 ===
            if (globalData.secApiEndpoint) document.getElementById('secApiEndpoint').value = globalData.secApiEndpoint;
            if (globalData.secApiKey) document.getElementById('secApiKey').value = globalData.secApiKey;

            if (globalData.secApiModel) { 
                const sel = document.getElementById('secApiModel'); 
                let exists = false; 
                for(let i=0; i<sel.options.length; i++) { 
                    if(sel.options[i].value === globalData.secApiModel) exists = true; 
                } 
                if(!exists) { 
                    const opt = document.createElement('option'); 
                    opt.value = globalData.secApiModel; 
                    opt.innerText = globalData.secApiModel; 
                    sel.add(opt); 
                } 
                sel.value = globalData.secApiModel; 
            }

            if (globalData.secApiTemp) { 
                document.getElementById('secApiTemp').value = globalData.secApiTemp; 
                document.getElementById('secTempDisplay').innerText = globalData.secApiTemp; 
            }
            if (globalData.secApiMaxTokens) { 
                document.getElementById('secApiMaxTokens').value = globalData.secApiMaxTokens; 
            }

            // 恢复副 API 各功能的勾选开关状态
            const secSwitches = ['secUseSummary', 'secUseForum', 'secUseCheckPhone', 'secUseDiary', 'secUseQuiz', 'secUseChat'];
            secSwitches.forEach(switchId => {
                const swEl = document.getElementById(switchId);
                if (swEl) {
                    if (globalData[switchId] === true) {
                        swEl.classList.add('checked');
                    } else {
                        swEl.classList.remove('checked');
                    }
                }
            });
            if(globalData.minimaxGroupId) document.getElementById('minimaxGroupId').value = globalData.minimaxGroupId;
            if(globalData.minimaxApiKey) document.getElementById('minimaxApiKey').value = globalData.minimaxApiKey;
            if(globalData.minimaxModel) document.getElementById('minimaxModel').value = globalData.minimaxModel;
            if(globalData.minimaxTemp) {
                document.getElementById('minimaxTemp').value = globalData.minimaxTemp;
                const mmDisplay = document.getElementById('minimaxTempDisplay');
                if(mmDisplay) mmDisplay.innerText = globalData.minimaxTemp;
            }

            worldBooks = globalData.worldBooksObj || []; 
            savedFonts = globalData.savedFonts || [];

            // ★★★ 恢复 NovelAI 设置 ★★★
            const naiToggle = document.getElementById('naiToggle');
            if (naiToggle) {
                if (globalData.naiEnabled === true) naiToggle.classList.add('checked');
                else naiToggle.classList.remove('checked');
            }
            if (globalData.naiApiKey) document.getElementById('naiApiKey').value = globalData.naiApiKey;
            if (globalData.naiProxy !== undefined) {
                const proxySel = document.getElementById('naiProxySelect');
                const proxyInp = document.getElementById('naiProxy');
                if (proxySel && proxyInp) {
                    const presets =[
                        "", 
                        "https://corsproxy.io/?https://api.novelai.net", 
                        "https://api.allorigins.win/raw?url=https://api.novelai.net", 
                        "https://cors-anywhere.herokuapp.com/https://api.novelai.net"
                    ];
                    if (presets.includes(globalData.naiProxy)) {
                        proxySel.value = globalData.naiProxy;
                        proxyInp.style.display = 'none';
                    } else {
                        proxySel.value = "custom";
                        proxyInp.value = globalData.naiProxy;
                        proxyInp.style.display = 'block';
                    }
                    if(typeof handleNaiProxyChange === 'function') handleNaiProxyChange();
                } else if (proxyInp) {
                    proxyInp.value = globalData.naiProxy;
                }
            } else {
                // 如果是新用户第一次打开，默认选中 corsproxy
                const proxySel = document.getElementById('naiProxySelect');
                if (proxySel) {
                    proxySel.value = "https://corsproxy.io/?https://api.novelai.net";
                    if(typeof handleNaiProxyChange === 'function') handleNaiProxyChange();
                }
            }
            if (globalData.naiModel) document.getElementById('naiModel').value = globalData.naiModel;
            if (globalData.naiSize) document.getElementById('naiSize').value = globalData.naiSize;
            if (globalData.naiDefaultPositive) document.getElementById('naiDefaultPositive').value = globalData.naiDefaultPositive;
            if (globalData.naiDefaultNegative) document.getElementById('naiDefaultNegative').value = globalData.naiDefaultNegative;
            if (globalData.naiSeed !== undefined) document.getElementById('naiSeed').value = globalData.naiSeed;

            // 恢复字体
            if (globalData.currentFontUrl) {
                currentFontUrl = globalData.currentFontUrl; 
                applyGlobalFont('RestoredFont_' + Date.now(), currentFontUrl);
            }

            if (globalData.fontSize) {
                const slider = document.getElementById('fontSizeSlider');
                if (slider) slider.value = globalData.fontSize;
                applyFontSize(globalData.fontSize);
            } else {
                applyFontSize(16);
            }
            wbGroups = globalData.wbGroups || ['默认分组'];
        }
        
        chatList = chats || [];
        chatList.forEach(chat => {
            if (chat.messages.length > 0) {
                updateChatLastMsg(chat); 
            }
        });
        chatList.forEach(chat => { if(!chat.messages) chat.messages = []; });
        chatList.sort((a, b) => { if (a.isPinned !== b.isPinned) return b.isPinned - a.isPinned; return b.id - a.id; });
        renderChatList();   
    
        apiProfiles = configs || [];
        renderApiProfiles();
        
        musicPlaylist = savedMusic || [];
        const keepAliveTrack = {
            id: 'keep-alive-track', 
            name: '后台保活服务',
            artist: '点击播放以防止断连',
            url: 'https://s3plus.meituan.net/opapisdk/op_ticket_1_5677168484_1767550853950_qdqqd_794nlt.mp3', 
            isKeepAlive: true, 
        };
        musicPlaylist = musicPlaylist.filter(t => !t.isKeepAlive && t.id !== 'keep-alive-track');
        musicPlaylist.unshift(keepAliveTrack);
        renderPlaylist(); 

        initStickers(); 
        if (typeof renderAutoCharList === 'function') {
            renderAutoCharList();
        }
        initMoments();

        window.worldBooks = worldBooks;       // 导出世界书
        window.worldbooks = worldBooks;       // 导出小写别名(防呆)
        window.chatList = chatList;           // 导出聊天列表
        window.globalData = globalData;       // 导出全局设置
        console.log("✅ 全局数据已挂载到 window，论坛可读取");
        // ===========================================
        
        if (window.pendingJumpChatId) {
        openChatRoom(window.pendingJumpChatId);
        window.pendingJumpChatId = null;
    }
        setTimeout(() => {
            console.log("启动离线回归检测...");
            if (typeof simulateCharacterLife === 'function') {
                simulateCharacterLife(); 
            }
        }, 3000); 
        setTimeout(() => {
            console.log("启动存储健康检查...");
            // 先检查函数是否存在，防止报错
            if (typeof triggerDailyBackupReminder === 'function') {
                triggerDailyBackupReminder(); 
            }
        }, 4000); // 延迟4秒，等界面完全稳定后再弹窗
    } catch (err) { console.error("Database loading failed:", err); }
}

// =========================================
// ★★★ 论坛数据桥接器 (The Bridge) ★★★
// =========================================
function syncForumData() {
    // 1. 确保全局变量存在
    window.characters = window.characters || [];
    window.chatSettings = window.chatSettings || {};

    // 2. 将主程序的 chatList 映射为论坛需要的 characters
    // 这样论坛就能认出你聊天列表里的 AI 和 NPC
    window.characters = chatList.map(chat => ({
        id: chat.id,
        name: chat.name,
        avatar: chat.avatar,
        persona: chat.charPersona || "", // 角色人设
        description: chat.charPersona || "", // 兼容描述
        systemPrompt: chat.charPersona || ""
    }));

    // 3. 映射聊天设置 (用于论坛发帖时获取 AI 性格)
    chatList.forEach(chat => {
        window.chatSettings[chat.id] = {
            charName: chat.name,
            persona: chat.charPersona,
            systemPrompt: chat.charPersona
        };
    });
    
    // 4. 同步“我”的头像
    const myAvatar = document.getElementById('meAvatarImg')?.src;
    if (myAvatar) {
        try {
            localStorage.setItem("avatarImg", myAvatar);
        } catch (e) {
            console.warn("[Storage] 同步头像至 localStorage 失败，可能超出了存储限额 (QuotaExceededError):", e);
        }
    }
    
    console.log("论坛数据同步完成，共同步角色:", window.characters.length);
}

// 定义论坛需要的关闭函数 (论坛内部按钮会调用这个)
window.closePage = function(pageId) {
    if (pageId === 'forumPage') {
        // 隐藏论坛页
        document.getElementById('forumPage').style.display = 'none';
        // 调用主程序的关闭 App 逻辑 (关闭遮罩层)
        closeApp(); 
    }
};

async function saveData() {
    // ★★★ 添加安全获取函数，防止元素不存在导致报错 ★★★
    const safeGetValue = (id, defaultVal = '') => {
        const el = document.getElementById(id);
        return el ? el.value : defaultVal;
    };
    const safeGetSrc = (id, defaultVal = '') => {
        const el = document.getElementById(id);
        return el ? el.src : defaultVal;
    };
    const safeGetText = (id, defaultVal = '') => {
        const el = document.getElementById(id);
        return el ? el.innerText : defaultVal;
    };
    const safeGetStyle = (id, prop, defaultVal = '') => {
        const el = document.getElementById(id);
        return el ? el.style[prop] : defaultVal;
    };

    const settingsToSave = {
        id: 'main',
        headerImg: safeGetSrc('headerImg'),
        avatarImg: safeGetSrc('avatarImg'),
        kaomoji: safeGetText('homeKaomoji'),
        handle: safeGetText('homeHandle'),
        bio: safeGetText('homeBio'),
        location: safeGetText('locationText'),
        meBanner: safeGetSrc('meBannerImg'),
        meAvatar: safeGetSrc('meAvatarImg'),
        meSlogan: safeGetText('meSlogan'),
        apiEndpoint: safeGetValue('apiEndpoint'),
        apiKey: safeGetValue('apiKey'),
        apiModel: safeGetValue('apiModel'),
        apiTemp: safeGetValue('apiTemp'),
        minimaxGroupId: safeGetValue('minimaxGroupId'),
        minimaxApiKey: safeGetValue('minimaxApiKey'),
        minimaxModel: safeGetValue('minimaxModel'),
        minimaxTemp: safeGetValue('minimaxTemp'),
        kawaiiAvatarLeft: safeGetSrc('kawaiiAvatarLeft'),
        kawaiiAvatarRight: safeGetSrc('kawaiiAvatarRight'),
        kawaiiText: safeGetText('kawaiiText'),
        kawaiiBottomText: safeGetText('kawaiiBottomText'),
        widgetTitle: safeGetText('widgetTitle'),
        captchaLabel: safeGetText('captchaLabel'),
        captchaInput: safeGetText('captchaInput'),
        captchaImg: safeGetSrc('captchaImg'),
        dockIcon1: safeGetSrc('dockIcon1'),
        dockIcon2: safeGetSrc('dockIcon2'),
        dockIcon3: safeGetSrc('dockIcon3'),
        dockIcon4: safeGetSrc('dockIcon4'),
        app5Label: safeGetText('app5Label'),
        app6Label: safeGetText('app6Label'),
        app5Icon: document.getElementById('app5Img')?.style.display === 'block' ? safeGetSrc('app5Img') : '',
        app6Icon: document.getElementById('app6Img')?.style.display === 'block' ? safeGetSrc('app6Img') : '',
        homeWallpaper: document.body.style.backgroundImage ? document.body.style.backgroundImage.slice(5, -2).replace(/['"]/g, "") : '',
        wechatWallpaper: safeGetStyle('chatAppPage', 'backgroundImage') ? safeGetStyle('chatAppPage', 'backgroundImage').slice(5, -2).replace(/['"]/g, "") : '',
        chatRoomWallpaper: safeGetStyle('chatRoom', 'backgroundImage') ? safeGetStyle('chatRoom', 'backgroundImage').slice(5, -2).replace(/['"]/g, "") : '',
        voiceCallWallpaper: safeGetStyle('vc-bg-layer', 'backgroundImage') ? safeGetStyle('vc-bg-layer', 'backgroundImage').slice(5, -2).replace(/['"]/g, "") : (globalData.voiceCallWallpaper || ''),
        offlineWallpaper: globalData.offlineWallpaper || '',
        walletBg: globalData.walletBg || '',
        worldBooksObj: worldBooks ||[],
        wbGroups: wbGroups || ['默认分组'],
        savedFonts: savedFonts || [],
        fontSize: safeGetValue('fontSizeSlider', '16'),
        currentFontUrl: currentFontUrl || '',
        currentFontFamily: document.body.style.fontFamily || '',
        cssPresets: globalData.cssPresets || [],
        offlineCssPresets: globalData.offlineCssPresets ||[],
        stickers: typeof myStickers !== 'undefined' ? myStickers : [],
         momentPageBg: globalData.momentPageBg || '',
         momentBanner: globalData.momentBanner || '',
         momentAvatar: globalData.momentAvatar || '',
         momentName: globalData.momentName || '',
         momentHandle: globalData.momentHandle || '',
         momentBio: globalData.momentBio || '',
         moments: momentList || [],
         myDiaryEntries: globalData.myDiaryEntries || [], 
         autoTranslateEnabled: document.getElementById('autoTranslateToggle')?.classList.contains('checked'),
         backgroundServiceEnabled: document.getElementById('backgroundServiceToggle')?.classList.contains('checked'),
         autoActivityEnabled: document.getElementById('autoActivityToggle')?.classList.contains('checked'),
         autoFreq: globalData.autoFreq,         
         apiStreamEnabled: document.getElementById('apiStreamToggle')?.classList.contains('checked'),
         apiMaxTokens: safeGetValue('apiMaxTokens') || 2048,
         // === 保存副 API 配置与功能开关 ===
        secApiEndpoint: safeGetValue('secApiEndpoint'),
        secApiKey: safeGetValue('secApiKey'),
        secApiModel: safeGetValue('secApiModel'),
        secApiTemp: safeGetValue('secApiTemp', '1.0'),
        secApiMaxTokens: safeGetValue('secApiMaxTokens', '2048'),

        secUseSummary: document.getElementById('secUseSummary')?.classList.contains('checked') || false,
        secUseForum: document.getElementById('secUseForum')?.classList.contains('checked') || false,
        secUseCheckPhone: document.getElementById('secUseCheckPhone')?.classList.contains('checked') || false,
        secUseDiary: document.getElementById('secUseDiary')?.classList.contains('checked') || false,
        secUseQuiz: document.getElementById('secUseQuiz')?.classList.contains('checked') || false,
        secUseChat: document.getElementById('secUseChat')?.classList.contains('checked') || false,
         autoAllowedCharIds: globalData.autoAllowedCharIds || [],
         naiEnabled: document.getElementById('naiToggle')?.classList.contains('checked'),
        naiApiKey: safeGetValue('naiApiKey'),
        naiProxy: (document.getElementById('naiProxySelect') && document.getElementById('naiProxySelect').value !== 'custom') 
                  ? document.getElementById('naiProxySelect').value 
                  : safeGetValue('naiProxy'),
        naiModel: safeGetValue('naiModel', 'nai-diffusion-4-5-full'),
        naiSize: safeGetValue('naiSize', '1024x1024'),
        naiSteps: safeGetValue('naiSteps', '28'),
        naiCfg: safeGetValue('naiCfg', '6'),
        naiSampler: safeGetValue('naiSampler', 'k_euler_ancestral'),
        naiSchedule: safeGetValue('naiSchedule', 'karras'),
        naiSmea: document.getElementById('naiSmeaToggle')?.classList.contains('checked'),
        naiSeed: safeGetValue('naiSeed', '-1'),
        naiDefaultPositive: safeGetValue('naiDefaultPositive'),
        naiDefaultNegative: safeGetValue('naiDefaultNegative'),
    };
    
    try {
        Object.assign(globalData, settingsToSave);
        await db.globalSettings.put(settingsToSave);
        if (chatList.length > 0) {
            await db.chats.bulkPut(chatList);
        }
        if (apiProfiles.length > 0) {
            await db.apiConfig.bulkPut(apiProfiles);
        }
        console.log('✅ 数据保存成功', new Date().toLocaleTimeString());
    } catch (e) { 
        console.error("❌ 保存失败:", e); 
    }
}

function openFontSettings() {
    document.getElementById('fontSettingsPage').classList.add('active');
    renderFontSchemes();
}
function closeFontSettings() {
    document.getElementById('fontSettingsPage').classList.remove('active');
}

async function applyGlobalFont(fontName, fontUrl) {
    try {
        // 创建字体对象
        const newFont = new FontFace(fontName, `url(${fontUrl})`);
        
        // 等待加载
        const loadedFace = await newFont.load();
        
        // 添加到文档
        document.fonts.add(loadedFace);
        
        // 创建或更新全局样式
        let style = document.getElementById('global-font-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'global-font-style';
            document.head.appendChild(style);
        }
        
        // 强制覆盖
        style.innerHTML = `
            body, button, input, textarea, select, .icity-content, .modal-input, .api-input {
                font-family: "${fontName}", -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif !important;
            }
        `;
        
        // 更新内存状态
        currentFontUrl = fontUrl;
        
    } catch (err) {
        console.error(err); // 在控制台打印详细错误
        alert('字体加载失败！\n可能原因：\n1. 字体文件损坏\n2. 链接跨域(CORS)被拦截\n3. 文件格式不正确\n\n详细错误：' + err.message);
    }
}

function applyFontSize(size) {
    // 1. 转为数字
    const s = parseInt(size);       // 基准大小 (例如 16)
    const s_small = Math.max(12, s - 2); // 辅助文字 (例如 14)
    const s_tiny  = Math.max(10, s - 4); // 极小文字 (例如 12)
    const s_large = s + 2;               // 标题文字 (例如 18)

    // 2. 更新滑块旁边的数字显示
    const display = document.getElementById('fontSizeDisplay');
    if (display) display.innerText = s + 'px';

    // 3. 获取或创建样式标签
    let style = document.getElementById('dynamic-font-size');
    if (!style) {
        style = document.createElement('style');
        style.id = 'dynamic-font-size';
        document.head.appendChild(style);
    }

    // 4. ★★★ 核心修改：使用高权重选择器覆盖 style.css ★★★
    style.innerHTML = `
        /* --- 1. 全局通用 --- */
        body, button, input, textarea, select, 
        .modal-input, .api-input, .settings-textarea,
        .settings-item, .wb-entry-input {
            font-size: ${s}px !important;
        }

        /* --- 2. 聊天气泡 (针对你的 CSS 进行靶向覆盖) --- */
        /* 必须写全 .Miu-miu.user .content 才能覆盖原有的 !important */
        .Miu-miu .content,
        .Miu-miu.user .content,
        .Miu-miu.ai .content {
            font-size: ${s}px !important;
            line-height: 1.5 !important;
        }
        
        /* 气泡旁边的极小时间 */
        .Miu-miu .time, .msg-time {
            font-size: ${s_tiny}px !important;
        }
        
        /* 语音气泡里的文字 */
        .voice-icon, .voice-duration, .voice-trans-result {
            font-size: ${s}px !important;
        }

        /* --- 3. 首页消息列表 --- */
        /* 名字 */
        .chat-name, .chat-item-name {
            font-size: ${s}px !important;
        }
        /* 预览消息 */
        .chat-preview, .chat-item-msg {
            font-size: ${s_small}px !important;
            height: auto !important; /* 允许高度撑开 */
            min-height: 1.4em;
        }
        /* 列表时间 */
        .chat-time, .chat-item-time {
            font-size: ${s_tiny}px !important;
        }

        /* --- 4. 朋友圈 & 日记 (★已修复评论区字体) --- */
        .mp-text, .icity-content, .diary-content,
        .mp-comments-box, .mp-cmt-name, .mp-cmt-content {
            font-size: ${s}px !important;
            line-height: 1.6 !important;
        }
        .mp-name, .icity-name {
            font-size: ${s_large}px !important;
        }
        .mp-time, .icity-date, .icity-handle {
            font-size: ${s_tiny}px !important;
        }

        /* --- 5. 设置菜单 --- */
        .settings-label, .settings-item {
            font-size: ${s}px !important;
        }
    `;
    
    // 强制重绘一下，防止浏览器缓存渲染
    document.body.style.display='none';
    document.body.offsetHeight; // 触发回流
    document.body.style.display='';
}

function setFontByLink() {
    const url = prompt("请输入字体文件链接 (TTF/WOFF):");
    if(url) {
        const tempName = 'CustomFont_' + Date.now();
        applyGlobalFont(tempName, url);
    }
}

function handleFontFile(input) {
    const file = input.files[0];
    if (!file) return;
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.ttf') && !fileName.endsWith('.woff') && !fileName.endsWith('.otf') && !fileName.endsWith('.woff2')) {
        alert("格式错误：只支持 ttf, otf, woff, woff2 格式的字体文件！");
        input.value = '';
        return;
    }

    try {
        const blobUrl = URL.createObjectURL(file);
        const tempName = 'LocalFont_' + Date.now();
        applyGlobalFont(tempName, blobUrl);
        
    } catch (e) {
        alert("本地读取失败：" + e.message);
    }
    input.value = '';
}

function resetDefaultFont() {
    // [修改] 移除全局样式标签
    const style = document.getElementById('global-font-style');
    if (style) style.remove();
    
    document.body.style.fontFamily = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
    currentFontUrl = '';
    saveData();
}

function saveFontScheme() {
    const name = document.getElementById('fontSchemeName').value.trim();
    if(!name) { alert('请输入方案名称'); return; }
    if(!currentFontUrl) { alert('当前没有应用自定义字体'); return; }

    const fontId = 'Font_' + Date.now();
    const scheme = { id: fontId, name: name, src: currentFontUrl };

    savedFonts.push(scheme);
    saveData(); 
    renderFontSchemes();
    document.getElementById('fontSchemeName').value = '';
}

function renderFontSchemes() {
    const list = document.getElementById('fontSchemeList');
    list.innerHTML = '';

    savedFonts.forEach((scheme, index) => {
        const fontFaceCheck = new FontFace(scheme.id, `url(${scheme.src})`);
        fontFaceCheck.load().then(loaded => {
            document.fonts.add(loaded);
        }).catch(()=>{});

        const item = document.createElement('div');
        item.className = 'font-scheme-item';
        item.onclick = (e) => {
            if(e.target.classList.contains('font-del-btn') || e.target.closest('.font-del-btn')) return;
            document.body.style.fontFamily = `"${scheme.id}", sans-serif`;
            currentFontUrl = scheme.src;
            saveData();
        };

        item.innerHTML = `
            <div class="font-scheme-left">
                <div class="font-preview-char" style="font-family: '${scheme.id}', sans-serif;">你好</div>
                <div class="font-scheme-info">
                    <div class="font-scheme-name">${scheme.name}</div>
                    <div class="font-scheme-src">${scheme.src.startsWith('data:') ? '本地文件' : '网络链接'}</div>
                </div>
            </div>
            <div class="font-del-btn" onclick="deleteFontScheme(${index})"><i class="fas fa-trash"></i></div>
        `;
        list.appendChild(item);
    });
    
    if(savedFonts.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:#ccc;font-size:12px;padding:10px;">暂无保存的字体方案</div>';
    }
}

function deleteFontScheme(index) {
    if(confirm('删除此字体方案？')) {
        savedFonts.splice(index, 1);
        saveData();
        renderFontSchemes();
    }
}

function openWbFilterSheet() { document.getElementById('wbFilterOverlay').classList.add('active'); }
function closeWbFilterSheet() { document.getElementById('wbFilterOverlay').classList.remove('active'); }
function selectWbFilter(type, el) {
    document.querySelectorAll('.sheet-option').forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
    currentWbFilter = type;
    const textMap = { 'all': '全部类型', 'always': '始终触发', 'keyword': '关键词触发' };
    document.getElementById('wbFilterText').innerText = textMap[type];
    closeWbFilterSheet();
    renderWorldBookPage(); 
}

function openWorldBookSettings() {
    document.getElementById('worldBookSettingsPage').classList.add('active');
    renderWorldBookPage();
}
function closeWorldBookSettings() {
    document.getElementById('worldBookSettingsPage').classList.remove('active');
    document.getElementById('wbPopMenu').style.display = 'none';
}
function toggleWbMenu(e) {
    e.stopPropagation();
    if (isWbManageMode) {
        toggleWbManageMode();
        return;
    }
    const m = document.getElementById('wbPopMenu');
    m.style.display = m.style.display === 'flex' ? 'none' : 'flex';
}

function toggleWbManageMode() {
    isWbManageMode = !isWbManageMode;
    document.getElementById('wbPopMenu').style.display = 'none';
    const btn = document.getElementById('wbHeaderBtn');
    if(isWbManageMode) {
        btn.innerHTML = '<span style="font-size:14px; font-weight:bold; color:#000;">完成</span>';
    } else {
        btn.innerHTML = '<i class="fas fa-plus"></i>';
    }
    renderWorldBookPage();
}

function renderWorldBookPage() {
    const area = document.getElementById('wbContentArea');
    area.innerHTML = '';
    let filteredBooks = worldBooks;
    if (currentWbFilter !== 'all') {
        filteredBooks = worldBooks.filter(wb => wb.triggerType === currentWbFilter);
    }
    const grouped = {};
    wbGroups.forEach(g => grouped[g] = []);
    filteredBooks.forEach(wb => {
        if(!grouped[wb.group]) grouped[wb.group] = []; 
        grouped[wb.group].push(wb);
    });

    for (const [groupName, books] of Object.entries(grouped)) {
        if (books.length === 0) continue; 
        const card = document.createElement('div');
        card.className = 'wb-group-card';
        if (isWbManageMode) {
            card.classList.add('shaking');
            const badge = document.createElement('div');
            badge.className = 'wb-del-badge';
            badge.onclick = (e) => {
                e.stopPropagation();
                if(confirm(`确认删除世界书分组 “${groupName}” 吗？\n\n删除后世界书内包裹的所有条目也将一起删除`)) {
                    worldBooks = worldBooks.filter(b => b.group !== groupName);
                    saveData();
                    renderWorldBookPage();
                }
            };
            card.appendChild(badge);
        } else {
            card.classList.remove('shaking');
        }
        const gTitle = document.createElement('div');
        gTitle.className = 'wb-group-title';
        gTitle.innerText = groupName;
        card.appendChild(gTitle);
        books.forEach(b => {
            const item = document.createElement('div');
            item.className = 'wb-book-item';
            item.innerHTML = `<span>${b.name}</span><span style="font-size:12px;color:#ccc;">${b.entries.length}条目</span>`;
            item.onclick = (e) => {
                if(isWbManageMode) return; 
                openEditWBModal(b);
            };
            card.appendChild(item);
        });
        area.appendChild(card);
    }
    if(filteredBooks.length === 0) {
            area.innerHTML = '<div style="text-align:center;color:#999;margin-top:20px;">暂无符合条件的世界书</div>';
    }
}

function openCreateWBModal() {
    editingWbId = null; 
    document.querySelector('.wb-create-title').innerText = "新建世界书";
    _setupModalFields();
}

function openEditWBModal(wbData) {
    editingWbId = wbData.id; 
    document.querySelector('.wb-create-title').innerText = "修改世界书";
    _setupModalFields(wbData);
}

// 1. 替换 addEntryRow，恢复原版 UI，将设置移到下方
function addEntryRow(titleVal = '', contentVal = '', enabledVal = true, depthVal = 100) {
    const list = document.getElementById('wbEntriesList');
    const row = document.createElement('div');
    row.className = 'wb-entry-row';
    
    // 视觉反馈：禁用的条目半透明
    const isChecked = enabledVal ? 'checked' : '';
    row.style.opacity = enabledVal ? '1' : '0.5';
    row.dataset.enabled = enabledVal;

    // 恢复原版的头部结构，并在底部追加深度和方形开关
    row.innerHTML = `
        <input type="text" class="wb-entry-input wb-entry-title" placeholder="条目标题 (可选)" value="${titleVal}">
        <textarea class="wb-entry-input wb-entry-content" placeholder="输入内容...">${contentVal}</textarea>
        <i class="fas fa-times wb-del-entry" onclick="this.parentElement.remove()"></i>
        
        <!-- 按照你的要求，在红框位置追加深度和方形开关 -->
        <div style="display: flex; justify-content: flex-start; align-items: center; gap: 20px; margin-top: 8px; padding-left: 4px;">
            <!-- 深度 -->
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 12px; color: #888; font-weight: bold;">深度</span>
                <input type="number" class="wb-entry-depth" value="${depthVal}" min="0" max="100" style="width: 50px; height: 24px; text-align: center; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; outline: none; background: #fff; color: #333;">
            </div>

            <!-- 方形开关 -->
            <div style="display: flex; align-items: center; gap: 6px; cursor: pointer;" onclick="const cb = this.querySelector('.wb-entry-enabled'); cb.checked = !cb.checked; const r = this.closest('.wb-entry-row'); r.dataset.enabled = cb.checked; r.style.opacity = cb.checked ? '1' : '0.5';">
                <span style="font-size: 12px; color: #888; font-weight: bold;">启用</span>
                <input type="checkbox" class="wb-entry-enabled" ${isChecked} style="width: 16px; height: 16px; accent-color: #000; pointer-events: none; margin: 0;">
            </div>
        </div>
    `;
    list.appendChild(row);
}

// 2. 替换 _setupModalFields，让它读取数据时支持深度和开关
function _setupModalFields(data = null) {
    document.getElementById('wbPopMenu').style.display = 'none';
    document.getElementById('wbCreateName').value = data ? data.name : '';
    const grpSel = document.getElementById('wbCreateGroup');
    grpSel.innerHTML = '';
    wbGroups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g; opt.innerText = g;
        grpSel.appendChild(opt);
    });
    if (data) grpSel.value = data.group;
    const toggle = document.getElementById('wbCharToggle');
    const isChar = data ? data.isCharBook : false;
    if (isChar) toggle.classList.add('checked'); else toggle.classList.remove('checked');
    checkCharBind();
    tempBoundCharId = data ? data.boundCharId : null;
    if (tempBoundCharId) {
        const char = chatList.find(c => c.id === tempBoundCharId);
        document.getElementById('wbBoundCharName').innerText = char ? char.name : '未知角色';
    } else {
        document.getElementById('wbBoundCharName').innerText = '无';
    }
    document.getElementById('wbTriggerType').value = data ? data.triggerType : 'always';
    checkKeywords();
    document.getElementById('wbCreateKeywords').value = data ? data.keywords : '';
    
    const list = document.getElementById('wbEntriesList');
    list.innerHTML = '';
    if (data && data.entries && data.entries.length > 0) {
        // ★ 核心：读取数据时，传入 enabled 和 depth
        data.entries.forEach(entry => addEntryRow(
            entry.title, 
            entry.content, 
            entry.enabled !== false, // 兼容老数据，默认 true
            entry.depth !== undefined ? entry.depth : 100 // 兼容老数据，默认 100
        ));
    } else {
        addEntryRow(); 
    }
    document.getElementById('wbCreateModal').classList.add('show');
}

// 3. 替换 saveWorldBook，保存时存入深度和开关状态
function saveWorldBook() {
    const name = document.getElementById('wbCreateName').value.trim();
    if(!name) { alert('请输入世界书名称'); return; }
    const group = document.getElementById('wbCreateGroup').value;
    const isCharBook = document.getElementById('wbCharToggle').classList.contains('checked');
    const triggerType = document.getElementById('wbTriggerType').value;
    const keywords = document.getElementById('wbCreateKeywords').value.trim();
    
    const entries = [];
    document.querySelectorAll('.wb-entry-row').forEach(row => {
        const t = row.querySelector('.wb-entry-title').value.trim();
        const c = row.querySelector('.wb-entry-content').value.trim();
        const d = parseInt(row.querySelector('.wb-entry-depth').value);
        const e = row.dataset.enabled === 'true';
        
        // ★ 核心：保存时存入 depth 和 enabled
        if(c) entries.push({ 
            title: t, 
            content: c, 
            depth: isNaN(d) ? 100 : d, 
            enabled: e 
        });
    });
    
    if (editingWbId) {
        const index = worldBooks.findIndex(b => b.id === editingWbId);
        if (index !== -1) {
            worldBooks[index] = {
                ...worldBooks[index], 
                name, group, isCharBook, boundCharId: tempBoundCharId, triggerType, keywords, entries
            };
        }
    } else {
        const newBook = {
            id: Date.now(),
            name, group, isCharBook, boundCharId: tempBoundCharId, triggerType, keywords, entries
        };
        worldBooks.push(newBook);
    }
    saveData();
    
    window.worldBooks = worldBooks;
    window.worldbooks = worldBooks;
    
    closeCreateWBModal();
    renderWorldBookPage();
}


// 1. 切换开关 UI 逻辑
function toggleSwitch(el) {
    el.classList.toggle('checked');
}

// 2. 检查是否显示“绑定角色”区域
function checkCharBind() {
    const toggle = document.getElementById('wbCharToggle');
    const div = document.getElementById('wbBindCharDiv');
    if (toggle.classList.contains('checked')) {
        div.style.display = 'block';
    } else {
        div.style.display = 'none';
    }
}

// 3. 检查是否显示“关键词”输入框
function checkKeywords() {
    const type = document.getElementById('wbTriggerType').value;
    const field = document.getElementById('wbKeywordField');
    if (type === 'keyword') {
        field.style.display = 'flex';
    } else {
        field.style.display = 'none';
    }
}

// 4. 关闭新建/编辑弹窗
function closeCreateWBModal() {
    document.getElementById('wbCreateModal').classList.remove('show');
}

/* --- 分组管理逻辑 --- */
function openGroupManager() {
    document.getElementById('wbGroupOverlay').style.display = 'flex';
    renderGroupList();
}

function closeGroupManager() {
    document.getElementById('wbGroupOverlay').style.display = 'none';
    // 更新主弹窗里的下拉框
    const grpSel = document.getElementById('wbCreateGroup');
    const currentVal = grpSel.value; // 记住当前选的值
    grpSel.innerHTML = '';
    wbGroups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g; opt.innerText = g;
        grpSel.appendChild(opt);
    });
    // 如果刚才选的值还在，保持选中；否则选中默认
    if (wbGroups.includes(currentVal)) {
        grpSel.value = currentVal;
    }
}

function renderGroupList() {
    const list = document.getElementById('wbGroupList');
    list.innerHTML = '';
    wbGroups.forEach((g, index) => {
        const item = document.createElement('div');
        item.className = 'wb-mini-item';
        // 默认分组不允许删除
        const delBtn = (g === '默认分组') ? '' : `<span class="wb-mini-del" onclick="deleteGroup(${index})">删除</span>`;
        item.innerHTML = `<span>${g}</span>${delBtn}`;
        list.appendChild(item);
    });
}

function addGroup() {
    const input = document.getElementById('wbNewGroupInput');
    const val = input.value.trim();
    if (val && !wbGroups.includes(val)) {
        wbGroups.push(val);
        saveData(); // 保存到数据库
        renderGroupList();
        input.value = '';
    } else if (wbGroups.includes(val)) {
        alert('分组已存在');
    }
}

function deleteGroup(index) {
    if (confirm('确认删除该分组吗？组内的世界书将移动到默认分组。')) {
        const deletedGroup = wbGroups[index];
        wbGroups.splice(index, 1);
        
        // 将被删分组的世界书移动到默认分组
        let modified = false;
        worldBooks.forEach(wb => {
            if (wb.group === deletedGroup) {
                wb.group = '默认分组';
                modified = true;
            }
        });
        
        saveData();
        renderGroupList();
        
saveData();
        
        // ★★★ 修复：同步更新 ★★★
        window.worldBooks = worldBooks;
        
        renderGroupList();
        if(modified) renderWorldBookPage(); 
    }
}
/* --- 角色绑定逻辑 --- */
function openCharBinder() {
    document.getElementById('wbCharOverlay').style.display = 'flex';
    renderCharList();
}

function closeCharBinder() {
    document.getElementById('wbCharOverlay').style.display = 'none';
}

function renderCharList() {
    const list = document.getElementById('wbCharList');
    list.innerHTML = '';
    if (chatList.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:#999;">暂无角色，请先在聊天页添加</div>';
        return;
    }
    chatList.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'wb-mini-item';
        item.style.cursor = 'pointer';
        // 点击选中
        item.onclick = () => selectCharForWb(chat.id, chat.name);
        item.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <img src="${chat.avatar}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;">
                <span>${chat.name}</span>
            </div>
            ${tempBoundCharId === chat.id ? '<i class="fas fa-check" style="color:green;"></i>' : ''}
        `;
        list.appendChild(item);
    });
}

function selectCharForWb(id, name) {
    tempBoundCharId = id;
    document.getElementById('wbBoundCharName').innerText = name;
    closeCharBinder();
}

function openBeautifyPage() {
    document.getElementById('beautifyPage').classList.add('active');
    
    // 1. 加载 Dock 和 APP 图标预览
    document.getElementById('previewDock1').src = document.getElementById('dockIcon1').src;
    document.getElementById('previewDock2').src = document.getElementById('dockIcon2').src;
    document.getElementById('previewDock3').src = document.getElementById('dockIcon3').src;
    document.getElementById('previewDock4').src = document.getElementById('dockIcon4').src;
    
    if(document.getElementById('app5Img').src) { 
        document.getElementById('previewApp5').src = document.getElementById('app5Img').src; 
        document.getElementById('previewApp5').style.display = 'block'; 
        document.getElementById('previewApp5Default').style.display = 'none'; 
    }
    if(document.getElementById('app6Img').src) { 
        document.getElementById('previewApp6').src = document.getElementById('app6Img').src; 
        document.getElementById('previewApp6').style.display = 'block'; 
        document.getElementById('previewApp6Default').style.display = 'none'; 
    }
    
    // 1. 主屏幕预览
    const homeBg = document.body.style.backgroundImage;
    const wpImg = document.getElementById('wallpaperPreviewImg');
    const wpPh = document.getElementById('wallpaperPlaceholder');
    if (homeBg && homeBg !== 'none' && homeBg !== 'url("")') { 
        wpImg.src = homeBg.slice(5, -2).replace(/['"]/g, ""); wpImg.style.display = 'block'; wpPh.style.display = 'none'; 
    } else { 
        wpImg.style.display = 'none'; wpImg.src = ''; wpPh.style.display = 'flex'; 
    }
    // 2. WeChat 预览
    const chatPage = document.getElementById('chatAppPage');
    const wcBg = chatPage.style.backgroundImage;
    const wcPreviewImg = document.getElementById('wcWallpaperPreviewImg');
    const wcPlaceholder = document.getElementById('wcWallpaperPlaceholder');
    if (wcBg && wcBg !== 'none' && wcBg !== 'url("")') { 
        wcPreviewImg.src = wcBg.slice(5, -2).replace(/['"]/g, ""); wcPreviewImg.style.display = 'block'; wcPlaceholder.style.display = 'none'; 
    } else { 
        wcPreviewImg.style.display = 'none'; wcPreviewImg.src = ''; wcPlaceholder.style.display = 'flex'; 
    }
    // ★★★ 3. 新增：聊天页预览 ★★★
    const room = document.getElementById('chatRoom');
    const roomBg = room.style.backgroundImage;
    const roomPreviewImg = document.getElementById('chatRoomWallpaperPreviewImg');
    const roomPlaceholder = document.getElementById('chatRoomWallpaperPlaceholder');
    if (roomBg && roomBg !== 'none' && roomBg !== 'url("")') { 
        roomPreviewImg.src = roomBg.slice(5, -2).replace(/['"]/g, ""); 
        roomPreviewImg.style.display = 'block'; 
        roomPlaceholder.style.display = 'none'; 
    } else { 
        roomPreviewImg.style.display = 'none'; 
        roomPreviewImg.src = ''; 
        roomPlaceholder.style.display = 'flex'; 
    }
    // ★★★ 4. 新增：语音通话壁纸预览 ★★★
    const vcBg = globalData.voiceCallWallpaper;
    const vcPreviewImg = document.getElementById('vcWallpaperPreviewImg');
    const vcPlaceholder = document.getElementById('vcWallpaperPlaceholder');
    if (vcBg && vcBg !== 'none' && vcBg !== 'url("")') { 
        vcPreviewImg.src = vcBg; 
        vcPreviewImg.style.display = 'block'; 
        vcPlaceholder.style.display = 'none'; 
    } else { 
        vcPreviewImg.style.display = 'none'; 
        vcPreviewImg.src = ''; 
        vcPlaceholder.style.display = 'flex'; 
    }
    // ★★★ 5. 新增：线下剧场壁纸预览 ★★★
    const offBg = globalData.offlineWallpaper;
    const offPreviewImg = document.getElementById('offlineWallpaperPreviewImg');
    const offPlaceholder = document.getElementById('offlineWallpaperPlaceholder');
    if (offBg && offBg !== 'none' && offBg !== 'url("")') { 
        offPreviewImg.src = offBg; 
        offPreviewImg.style.display = 'block'; 
        offPlaceholder.style.display = 'none'; 
    } else { 
        offPreviewImg.style.display = 'none'; 
        offPreviewImg.src = ''; 
        offPlaceholder.style.display = 'flex'; 
    }
}

function closeBeautifyPage() { 
    document.getElementById('beautifyPage').classList.remove('active'); 
    saveData(); 
}

function changeWallpaper(type) {
    if (type.startsWith('wechat')) {
        uploadContext = { type: 'wechatWallpaper' };
        if (type === 'wechat_link') { 
            const u = prompt("请输入图片链接:"); 
            if(u) handleBeautifyImageUpdate(u); 
        } else { 
            document.getElementById('fileInput').click(); 
        }
    } 
    else if (type.startsWith('chatroom')) {
        uploadContext = { type: 'chatRoomWallpaper' };
        if (type === 'chatroom_link') {
            const u = prompt("请输入图片链接:"); 
            if(u) handleBeautifyImageUpdate(u); 
        } else {
            document.getElementById('fileInput').click(); 
        }
    }
    else if (type.startsWith('voice')) {
        uploadContext = { type: 'voiceCallWallpaper' };
        if (type === 'voice_link') {
            const u = prompt("请输入图片链接:"); 
            if(u) handleBeautifyImageUpdate(u); 
        } else {
            document.getElementById('fileInput').click(); 
        }
    }
    else if (type.startsWith('offline')) {
        uploadContext = { type: 'offlineWallpaper' };
        if (type === 'offline_link') {
            const u = prompt("请输入图片链接:"); 
            if(u) handleBeautifyImageUpdate(u); 
        } else {
            document.getElementById('fileInput').click(); 
        }
    }
    else {
        uploadContext = { type: 'wallpaper' };
        if (type === 'link') { 
            const u = prompt("请输入图片链接:"); 
            if(u) handleBeautifyImageUpdate(u); 
        } else { 
            document.getElementById('fileInput').click(); 
        }
    }

    
}

function clearWechatWallpaper() {
    const chatPage = document.getElementById('chatAppPage');
    chatPage.style.backgroundImage = ''; 
    chatPage.style.backgroundSize = '';
    chatPage.style.backgroundPosition = '';
    openBeautifyPage(); 
    saveData();
}

function clearWallpaper() { 
    document.body.style.backgroundImage = ''; 
    document.body.classList.remove('has-wallpaper'); 
    openBeautifyPage(); 
    saveData(); 
}

function clearVoiceCallWallpaper() {
    globalData.voiceCallWallpaper = ''; // 清空数据
    saveData(); // 保存
    openBeautifyPage(); // 刷新预览
}

function handleBeautifyImageUpdate(src) {
    if (!uploadContext) return;
    
    if (uploadContext.type === 'dock') {
        const id = 'dockIcon' + uploadContext.index; 
        const previewId = 'previewDock' + uploadContext.index;
        document.getElementById(id).src = src; 
        document.getElementById(previewId).src = src;
    } else if (uploadContext.type === 'app') {
        const imgId = 'app' + uploadContext.index + 'Img'; document.getElementById(imgId).src = src; document.getElementById(imgId).style.display = 'block'; document.getElementById('app' + uploadContext.index + 'Default').style.display = 'none'; document.getElementById('previewApp' + uploadContext.index).src = src; document.getElementById('previewApp' + uploadContext.index).style.display = 'block'; document.getElementById('previewApp' + uploadContext.index + 'Default').style.display = 'none';
    } else if (uploadContext.type === 'wallpaper') {
        document.body.style.backgroundImage = `url(${src})`; 
        document.body.classList.add('has-wallpaper'); 
        openBeautifyPage();
    } else if (uploadContext.type === 'wechatWallpaper') {
        const chatPage = document.getElementById('chatAppPage');
        chatPage.style.backgroundImage = `url(${src})`; 
        chatPage.style.backgroundSize = 'cover'; 
        chatPage.style.backgroundPosition = 'center'; 
        openBeautifyPage();
    } 
    else if (uploadContext.type === 'chatRoomWallpaper') {
        const room = document.getElementById('chatRoom');
        room.style.backgroundImage = `url(${src})`;
        room.style.backgroundSize = 'cover';
        room.style.backgroundPosition = 'center';
        room.style.backgroundRepeat = 'no-repeat';
        openBeautifyPage(); 
    }
else if (uploadContext.type === 'voiceCallWallpaper') {
        globalData.voiceCallWallpaper = src;
        openBeautifyPage(); 
    }
        else if (uploadContext.type === 'momentPageBg') {
        document.getElementById('momentBgLayer').style.backgroundImage = `url(${src})`;
        globalData.momentPageBg = src; 
    }
    else if (uploadContext.type === 'momentBanner') {
        document.getElementById('momentBannerImg').src = src;
        globalData.momentBanner = src; 
    }
    else if (uploadContext.type === 'momentAvatar') {
        document.getElementById('momentUserAvatar').src = src;
        globalData.momentAvatar = src; 
    }
    else if (uploadContext.type === 'offlineWallpaper') {
        globalData.offlineWallpaper = src;
        openBeautifyPage(); 
    }

    saveData(); 
    uploadContext = null;
}

function clearOfflineWallpaper() {
    globalData.offlineWallpaper = '';
    saveData();
    openBeautifyPage();
}

async function exportBackup() { try { const settings = await db.globalSettings.get('main'); const chats = await db.chats.toArray(); const configs = await db.apiConfig.toArray(); const backupData = { version: "2.0", timestamp: new Date().toISOString(), settings: settings || {}, chats: chats || [], apiConfig: configs || [] }; const blob = new Blob([JSON.stringify(backupData)], {type: "application/json"}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `backup_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); alert("备份已开始下载"); } catch (e) { alert("导出失败: " + e.message); } }

async function handleImportFile(input) { 
    const file = input.files[0]; 
    if (!file) return; 
    
    if (confirm(`【准备导入: ${file.name}】\n\n系统将自动识别备份类型并进行“合并恢复”。\n现有的数据不会丢失，相同的数据会被更新。\n\n确定要导入吗？`)) { 
        const reader = new FileReader(); 
        reader.onload = async (e) => { 
            try { 
                const data = JSON.parse(e.target.result); 
                console.log("正在导入备份类型:", data.type || "旧版全量备份");

                // =========================================
                // ★★★ 新增：相册独立包 (Part 5) 恢复逻辑 ★★★
                // =========================================
                if (data.type === 'gallery_split' && Array.isArray(data.galleries)) {
                    await db.transaction('rw', db.chats, async () => {
                        for (const item of data.galleries) {
                            // 1. 找到对应的角色
                            const chat = await db.chats.get(item.chatId);
                            if (chat) {
                                // 2. 恢复相册数据
                                // 策略：直接覆盖 (Backup Override)，或者你可以改成合并
                                chat.gallery = item.gallery || []; 
                                // 3. 写回数据库
                                await db.chats.put(chat);
                            }
                        }
                    });
                    alert(`相册数据恢复成功！\n共恢复了 ${data.galleries.length} 个角色的相册。\n页面即将刷新...`);
                    location.reload();
                    return; // 结束处理
                }

                // --- A. 恢复主数据库 (Dexie) ---
                await db.transaction('rw', db.globalSettings, db.chats, db.apiConfig, db.playlist, db.userMasks, async () => { 
                    
                    if (data.settings) await db.globalSettings.put(data.settings); 

                    // 聊天记录 (Chats Split)
                    if (data.chats && Array.isArray(data.chats) && data.chats.length > 0) {
                        // 注意：因为我们导出时为了省空间删掉了 gallery
                        // 如果直接 bulkPut 可能会覆盖掉本地已有的 gallery
                        // 所以这里我们需要做一个“安全合并”
                        
                        for (const newChat of data.chats) {
                            const oldChat = await db.chats.get(newChat.id);
                            
                            // 如果本地有这个角色，且本地有相册，但导入包里没相册(被剥离了)
                            // 我们要把本地的相册保留下来，塞给导入包
                            if (oldChat && oldChat.gallery && (!newChat.gallery || newChat.gallery.length === 0)) {
                                newChat.gallery = oldChat.gallery;
                            }
                            // 执行保存
                            await db.chats.put(newChat);
                        }
                    }

                    if (data.apiConfig) await db.apiConfig.bulkPut(data.apiConfig); 
                    if (data.playlist) await db.playlist.bulkPut(data.playlist);
                    if (data.userMasks) await db.userMasks.bulkPut(data.userMasks);
                }); 

                // --- B. 恢复论坛数据 ---
                if (data.forum && typeof localforage !== 'undefined') {
                    if (data.forum.settings) await localforage.setItem('forumSettings', data.forum.settings);
                    if (data.forum.posts) await localforage.setItem('forumPosts', data.forum.posts);
                    if (data.forum.presets) await localforage.setItem('forumPresets', data.forum.presets);
                    if (data.forum.dms) await localforage.setItem('forumDirectMessages', data.forum.dms);
                }

                // --- C. 恢复钱包 ---
                if (data.wallet) localStorage.setItem('miu_wallet_data', JSON.stringify(data.wallet));

                // --- D. 恢复本地头像 ---
                if (data.localAvatar) localStorage.setItem('avatarImg', data.localAvatar);

                alert(`导入成功！\n文件: ${file.name}\n页面即将刷新以应用更改`); 
                location.reload(); 
            } catch (err) { 
                alert("恢复失败，文件可能格式错误: " + err.message); 
                console.error(err);
            } 
        }; 
        reader.readAsText(file); 
    } 
    input.value = ''; 
}

function openGeneralSettings() { document.getElementById('generalSettingsPage').classList.add('active'); }
function closeGeneralSettings() { document.getElementById('generalSettingsPage').classList.remove('active'); }

function renderMessages(chat) {
    const container = document.getElementById('roomMessages');
    
    // 1. 记录当前的滚动位置
    const prevScrollHeight = container.scrollHeight;
    const prevScrollTop = container.scrollTop;
    
    container.innerHTML = ''; 
    
    const showAi = (chat.showAiAvatar !== false);
    const showUser = (chat.showUserAvatar !== false);
    const myAvatar = chat.userAvatar || document.getElementById('meAvatarImg').src; 
    const otherAvatar = chat.avatar; 
    
    // ★★★ 核心修复：将渲染上限从 50 降为 30，减少卡顿 ★★★
    const RENDER_LIMIT = 30; 
    const totalMsgs = chat.messages.length;
    let startIndex = 0;
    
    // 判断是否需要折叠
    if (!chat.showFullHistory && totalMsgs > RENDER_LIMIT) {
        startIndex = totalMsgs - RENDER_LIMIT;
        
        // 添加“加载更多”按钮
        const loadBtnDiv = document.createElement('div');
        loadBtnDiv.style.cssText = "text-align:center; padding:15px; cursor:pointer; color:#999; font-size:12px;";
        loadBtnDiv.innerHTML = `<i class="fas fa-history"></i> 点击加载更早的 ${startIndex} 条记录`;
        loadBtnDiv.onclick = function() {
            chat.showFullHistory = true; 
            const oldHeight = container.scrollHeight;
            renderMessages(chat); 
            container.scrollTop = container.scrollHeight - oldHeight;
        };
        container.appendChild(loadBtnDiv);
    }
    
    const msgsToRender = chat.messages.slice(startIndex);

    let lastDateStr = ""; 
    let lastTimeMinutes = -9999; 
    let lastSenderType = null; 

    msgsToRender.forEach((msg, relativeIndex) => {
        const realIndex = startIndex + relativeIndex;
        if (msg.isHidden) return;
        if (msg.text && msg.text.includes('[邀请语音通话]')) return;
        // 在外层获取一次当前的虚拟日期，用来判断“今天”是哪天
        const nowVirtualDate = window.getVirtualTimeData ? window.getVirtualTimeData(chat, true).dateStr : "Today";

        // --- 1. 动态跨天与点击切换的时间线逻辑 ---
        const [hh, mm] = (msg.time || "00:00").split(':').map(Number);
        const currentMinutes = hh * 60 + mm; 
        const currentDateStr = msg.virtualDate || nowVirtualDate; 

        if (relativeIndex === 0 || 
            currentDateStr !== lastDateStr || 
            (currentDateStr === lastDateStr && currentMinutes - lastTimeMinutes > 60) || 
            (currentDateStr === lastDateStr && currentMinutes < lastTimeMinutes)) { 
            
            const dateDiv = document.createElement('div'); 
            dateDiv.className = 'date-divider'; 
            
            // ★ 智能默认：如果这条消息的日期等于我们当下的时间，显示 Today，否则显示具体日期
            let isShowingToday = (currentDateStr === 'Today' || currentDateStr === nowVirtualDate);
            dateDiv.innerText = isShowingToday ? `Today ${msg.time}` : `${currentDateStr} ${msg.time}`;
            
            // ★ 增加点击交互属性
            dateDiv.style.cursor = 'pointer'; // 给个小手鼠标样式提示可以点击
            dateDiv.dataset.date = currentDateStr;
            dateDiv.dataset.time = msg.time;
            dateDiv.dataset.showToday = isShowingToday ? "true" : "false";
            
            // ★ 核心彩蛋：点击无缝切换显示
            dateDiv.onclick = function() {
                if (this.dataset.date === 'Today') return; // 如果是没日期的旧数据，就不切换
                
                if (this.dataset.showToday === "true") {
                    this.innerText = `${this.dataset.date} ${this.dataset.time}`; // 变成 05-19 10:30
                    this.dataset.showToday = "false";
                } else {
                    this.innerText = `Today ${this.dataset.time}`; // 变成 Today 10:30
                    this.dataset.showToday = "true";
                }
            };

            container.appendChild(dateDiv); 
            lastSenderType = null; 
        } 
        lastTimeMinutes = currentMinutes; 
        lastDateStr = currentDateStr; 
        // --- 撤回逻辑 ---
        const isAiPureCommand = (!msg.isSelf && msg.text.trim() === '[WITHDRAWN]');
        if (msg.isRecalled || isAiPureCommand) {
            const recallRow = document.createElement('div');
            recallRow.className = 'recall-notice-row';
            recallRow.style.width = '100%';
            recallRow.style.textAlign = 'center';
            recallRow.style.marginTop = '10px';
            
            let contentHtml = '';
            const charName = chat.name || "对方";
            
            if (msg.isSelf) {
                contentHtml = `你撤回了一条消息 <span class="recall-link" onclick="restoreEdit(${realIndex})">重新编辑</span>`;
            } else {
                if (isAiPureCommand && !msg.recalledText) {
                     contentHtml = `"${charName}" 撤回了一条消息`;
                } else {
                     contentHtml = `"${charName}" 撤回了一条消息 <span class="recall-link" onclick="viewRecalled(${realIndex})">查看</span>`;
                }
            }
            recallRow.innerHTML = `<div class="recall-pill">${contentHtml}</div>`;
            container.appendChild(recallRow);
            lastSenderType = null; 
            return; 
        }

        // --- 2. 气泡构建 ---
        const timeHtml = `<div class="time">${msg.time}</div>`;
        const isSelf = msg.isSelf; 
        const currentSenderType = isSelf ? 'user' : 'ai';
        const needTail = (currentSenderType !== lastSenderType);
        const tailClass = needTail ? '' : 'no-tail';

        const row = document.createElement('div'); 
        row.className = `Miu-miu ${currentSenderType} ${tailClass}`;
        
        row.onclick = function() { handleMsgClickInMultiMode(realIndex, this); };

        /* --- ★★★ 转账气泡渲染逻辑 (插入到 renderMessages 循环内) ★★★ --- */
        let customContent = null;
        let specialClass = '';

        // 1. 判断是否为转账消息
        if (msg.type === 'transfer') {
            specialClass = 'transfer-msg'; 
            
            const isDone = msg.status !== 'pending';
            
            // ★★★ 核心修改点 1：顶部永远显示金额 ★★★
            let topText = "¥" + msg.amount; 

            // ★★★ 核心修改点 2：底部文字根据状态变化 ★★★
            let bottomText = "";
            
            if (msg.status === 'received') {
                // 已收款状态
                bottomText = msg.transferBy === 'me' ? "已被接收" : "已收款";
            } else if (msg.status === 'refunded') {
                // 已退还状态
                bottomText = msg.transferBy === 'me' ? "已被退还" : "已退还";
            } else {
                // 进行中状态 (Pending)
                bottomText = msg.transferBy === 'me' ? "待对方确认" : "请收款";
            }

            const arrowIcon = `<svg class="transfer-icon-svg" viewBox="0 0 24 24"><path d="M7 10h14l-4-4M17 14H3l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

            customContent = `
                <div class="transfer-card ${isDone ? 'done' : ''}" onclick="handleTransferClick(${msg.id}, event)">
                    <div class="transfer-top">
                        <div class="transfer-info-col">
                            <div class="transfer-amount-text">${topText}</div>
                            <div class="transfer-status-text">${bottomText}</div>
                        </div>
                    </div>
                    <div class="transfer-line"></div>
                    <div class="transfer-footer">—— ＞ ＜ おやすみ .. ——</div>
                </div>
            `;
        }
        
        else if (msg.type === 'relative_card') {
            specialClass = 'transfer-msg'; 
            
            // 状态文字处理
            let statusText = "立即领取";
            let statusClass = "";
            
            if (msg.status === 'received') {
                statusText = msg.transferBy === 'me' ? "已被领取" : "已领取";
                statusClass = "accepted";
            } else if (msg.status === 'refunded') {
                statusText = msg.transferBy === 'me' ? "已被退还" : "已退还";
                statusClass = "rejected";
            }

            // 标题文字
            let titleText = "送你一张亲属卡";
            if (msg.transferBy === 'ai') titleText = "赠送一张亲属卡";

            customContent = `
                <div class="transfer-card relative-card ${statusClass}" onclick="handleRelativeCardClick(${msg.id}, event)">
                    
                    <!-- 上半部分 -->
                    <div class="transfer-top" style="flex-direction: row !important; align-items: center !important; justify-content: flex-start !important; padding: 15px !important; gap: 12px;">
                        
                        <!-- 左侧：图标 -->
                        <div class="couple-icon-row" style="margin: 0; font-size: 28px; line-height: 1; display: flex; align-items: center;">
                            <i class="fas fa-hand-holding-heart"></i>
                        </div>
                        
                        <!-- 右侧：文字列 -->
                        <div style="display: flex; flex-direction: column; align-items: flex-start;">
                            <div class="couple-title" style="font-size: 16px; font-weight: 600; margin-bottom: 2px;">${titleText}</div>
                            
                            <!-- ★★★ 修改点：去掉了 (${statusText}) 的括号 ★★★ -->
                            <!-- 如果想要逗号，可以在 span 前面或者里面加一个 "，" -->
                            <div class="couple-subtitle" style="font-size: 12px; font-weight: 400; opacity: 0.8;">¥${msg.amount} <span style="margin-left:4px; font-size:11px;">${statusText}</span></div>
                        </div>

                    </div>
                    
                    <!-- 分割线 -->
                    <div class="transfer-line"></div>
                    
                    <!-- 底部：亲属卡 -->
                    <div class="transfer-footer">亲属卡</div>
                </div>
            
            `;
        }

         else if (msg.text.includes('couple-card')) {
        specialClass = 'couple-msg-bubble'; 
        customContent = msg.text; 
    }
        // 2. 原有的判断逻辑 (保持兼容)
        else if (msg.text.includes('voice-inner-container')) specialClass = 'voice-bubble';
        else if (msg.text.includes('photo-msg-img')) specialClass = 'photo-only';
        else if (msg.text.includes('album-msg-img')) specialClass = 'album-only';
        else if (msg.text.includes('chat-sticker-img') && !msg.text.includes('span')) specialClass = 'sticker-only';
        else if (msg.text.includes('retweet-card') || msg.text.includes('转发的帖子')) specialClass = 'retweet-only'; 
        let displayText = customContent || msg.text || '';
        
        // 核心修复：更严谨地判断是否为富文本 (语音/图片/转账/表情包)
        const isRichContent = displayText.includes('voice-inner-container') || 
                              displayText.includes('<img') || 
                              displayText.includes('transfer-card') ||
                              displayText.includes('retweet-card') ||
                              displayText.includes('class="content'); 

        if (!isRichContent && typeof displayText === 'string') {
            displayText = displayText.replace(/\n/g, '<br>');
        }

        const bubbleHtml = displayText 
            ? `<div class="content ${specialClass}" data-index="${realIndex}">${displayText}</div>` 
            : '';

        let replyBubbleHtml = '';
        if (msg.replyCtx) {
            let shortContent = msg.replyCtx.content || '';
            if (shortContent.length > 40) shortContent = shortContent.slice(0, 40) + '...';
            
            replyBubbleHtml = `<div class="reply-tiny-bubble">
                <span style="opacity: 0.7; margin-right: 4px;">回复 ${msg.replyCtx.name}:</span>${shortContent}
            </div>`;
        }

        const stackHtml = `<div class="msg-stack">${bubbleHtml}${replyBubbleHtml}</div>`;
        const checkboxHtml = `<div class="msg-checkbox"></div>`;

        let shouldRenderAvatar = true;
        if (isSelf) {
            if (!showUser) shouldRenderAvatar = false;
            else if (lastSenderType === 'user') shouldRenderAvatar = false;
        } else {
            if (!showAi) shouldRenderAvatar = false;
            else if (lastSenderType === 'ai') shouldRenderAvatar = false;
        }

if (isSelf) {
    let avatarHtml = showUser ? `<img src="${myAvatar}" class="avatar-img" style="${shouldRenderAvatar ? '' : 'visibility:hidden;'}">` : '';
    const wrapperExtra = (specialClass === 'transfer-msg') ? ' transfer-wrapper' : '';
    
    // ★★★ 新增：红色感叹号 (被拉黑拒收) ★★★
    const failHtml = msg.isFailed ? `<div class="msg-failed-icon" onclick="alert('消息已拒收。\\n对方已将你拉黑，请通过工具栏【Quiz】答题解除。')"><i class="fas fa-exclamation-circle"></i></div>` : '';
    
    // 将 failHtml 塞进 bubble-wrapper 里面
    row.innerHTML = `${checkboxHtml}<div class="bubble-wrapper${wrapperExtra}" style="justify-content: flex-end;">${failHtml}${timeHtml}${stackHtml}</div>${avatarHtml}`;
} else {
    let avatarHtml = showAi ? `<img src="${otherAvatar}" class="avatar-img" style="${shouldRenderAvatar ? '' : 'visibility:hidden;'}">` : '';
    const wrapperExtra = (specialClass === 'transfer-msg') ? ' transfer-wrapper' : '';
    row.innerHTML = `${avatarHtml}<div class="bubble-wrapper${wrapperExtra}" style="justify-content: flex-start;">${stackHtml}${timeHtml}</div>${checkboxHtml}`;
}

        
        lastSenderType = currentSenderType; 
        container.appendChild(row); 
        
        // 事件绑定
        const bubbleNode = row.querySelector('.content');
        if (bubbleNode) {
            bubbleNode.style.webkitTouchCallout = 'none';
            bubbleNode.style.webkitUserSelect = 'none';
            
            bubbleNode.onclick = (e) => {
                if (isMultiSelectMode) return; 
                e.stopPropagation(); 
            };

            // 长按逻辑
            let pressTimer = null;
            let startX = 0, startY = 0;

            bubbleNode.addEventListener('touchstart', (e) => {
                if (isMultiSelectMode) return;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                pressTimer = setTimeout(() => {
                    e.preventDefault(); 
                    if (navigator.vibrate) {
                        try { navigator.vibrate(15); } catch(err) {}
                    }
                    showMsgMenu(bubbleNode, realIndex, isSelf); 
                }, 500);
            }, { passive: false });

            bubbleNode.addEventListener('touchmove', (e) => {
                if (!pressTimer) return;
                if (Math.abs(e.touches[0].clientX - startX) > 10 || Math.abs(e.touches[0].clientY - startY) > 10) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
            }, { passive: true });

            bubbleNode.addEventListener('touchend', () => { clearTimeout(pressTimer); });
            bubbleNode.addEventListener('touchcancel', () => { clearTimeout(pressTimer); });

            bubbleNode.addEventListener('contextmenu', (e) => {
                e.preventDefault(); 
                if (!isMultiSelectMode) showMsgMenu(bubbleNode, realIndex, isSelf); 
            });
        }
    }); 

    if (!chat.showFullHistory && !isMultiSelectMode) {
        container.scrollTop = container.scrollHeight; 
    }
}

const chatSettingsPage = document.getElementById('chatSettingsPage');
function openChatSettings() { 
    const chat = chatList.find(c => c.id === currentChatId); 
    if (chat) { 
        document.getElementById('settingsCharAvatar').src = chat.avatar; 
        document.getElementById('settingsCharRealNameDisplay').innerText = chat.realName || chat.name; 
        document.getElementById('settingsCharName').innerText = chat.name; 
        
        const currentUserAvatar = chat.userAvatar || document.getElementById('meAvatarImg').src;
        document.getElementById('settingsUserAvatar').src = currentUserAvatar; 
        
        document.getElementById('settingsUserRealNameDisplay').innerText = chat.userRealName || "我的"; 
        document.getElementById('settingsUserName').innerText = chat.userRemark || "默认"; 

        document.getElementById('charPersona').value = chat.charPersona || '';
        document.getElementById('userPersona').value = chat.userPersona || '';

        document.getElementById('charVoiceId').value = chat.minimaxVoiceId || '';

        // 回填自定义回复条数限制，若未设置则默认为 1 - 3 条
        document.getElementById('charReplyMin').value = chat.replyMin !== undefined ? chat.replyMin : 1;
        document.getElementById('charReplyMax').value = chat.replyMax !== undefined ? chat.replyMax : 3;

        // --- 双轨时区数据回填 ---
        document.getElementById('charTimezone').value = chat.charTimezone || 'Asia/Shanghai';
        document.getElementById('userTimezone').value = chat.userTimezone || 'Asia/Shanghai';
        if (typeof fillVirtualTimeInputs === 'function') {
            if (chat.charTimeOffset !== undefined) fillVirtualTimeInputs(chat.charTimeOffset, chat.charTimezone, 'charVirtualDate', 'charVirtualTime');
            else { document.getElementById('charVirtualDate').value = ''; document.getElementById('charVirtualTime').value = ''; }
            
            if (chat.userTimeOffset !== undefined) fillVirtualTimeInputs(chat.userTimeOffset, chat.userTimezone, 'userVirtualDate', 'userVirtualTime');
            else { document.getElementById('userVirtualDate').value = ''; document.getElementById('userVirtualTime').value = ''; }
        }
        
        document.getElementById('chatMemory').value = chat.chatMemory || ''; 
        document.getElementById('customCssInput').value = chat.customCss || '';
        
        document.getElementById('memContextLimit').value = chat.memContextLimit || 50;
        document.getElementById('memThreshold').value = chat.memThreshold || 50;
        
        document.getElementById('summaryStart').value = 1;
        document.getElementById('summaryEnd').value = chat.messages.length;

        const toggle = document.getElementById('memAutoToggle');
        const text = document.getElementById('memModeText');
        if (chat.memAutoSummary) {
            toggle.classList.add('checked');
            text.innerText = "自动";
            text.style.color = "#34c759";
        } else {
            toggle.classList.remove('checked');
            text.innerText = "手动";
            text.style.color = "#007aff";
        }
// --- 插入开始 ---
const tAi = document.getElementById('toggleAiAvatar');
const tUser = document.getElementById('toggleUserAvatar');

if (chat.showAiAvatar !== false) tAi.classList.add('checked'); 
else tAi.classList.remove('checked');

if (chat.showUserAvatar !== false) tUser.classList.add('checked'); 
else tUser.classList.remove('checked');
        const previewAiImg = document.getElementById('previewRealAvatar');
        if(previewAiImg) previewAiImg.src = chat.avatar;

        const previewUserImg = document.getElementById('previewUserAvatar');
        if(previewUserImg) previewUserImg.src = currentUserAvatar;

        renderMemSummaryList(chat);
        updateMemStats(chat);
        updateBubblePreview();
        const saveBtn = document.querySelector('.save-float-btn');
    // 检查：如果找到了保存按钮，且它还没有被包裹在双按钮容器里
    if (saveBtn && (!saveBtn.parentElement || !saveBtn.parentElement.classList.contains('settings-btns-row'))) {
        // 使用 outerHTML 直接替换 DOM 结构
        // 注意：这里引用了我们在 CSS 中定义的 .settings-btns-row, .clear-chat-btn, .save-float-btn
        saveBtn.outerHTML = `
            <div class="settings-btns-row">
                <div class="clear-chat-btn" onclick="clearCurrentChat()">清除聊天</div>
                <div class="save-float-btn" onclick="saveCurrentChatSettings()">保存设置</div>
            </div>
        `;
    }
        chatSettingsPage.classList.add('active'); 
    } 
}
function closeChatSettings() { 
    document.getElementById('chatSettingsPage').classList.remove('active');
}

function editCharNameInSettings() { const chat = chatList.find(c => c.id === currentChatId); if(!chat) return; const realName = prompt("角色真实姓名:", chat.realName); const remark = prompt("备注名:", chat.name); if (realName) chat.realName = realName; if (remark) chat.name = remark; saveData(); openChatSettings(); document.getElementById('roomTitle').innerText = chat.name; renderChatList(); }
function editUserNameInSettings() { const chat = chatList.find(c => c.id === currentChatId); if(!chat) return; const realName = prompt("我的真实姓名:", chat.userRealName || ""); const remark = prompt("角色对我的称呼(备注):", chat.userRemark || ""); if (realName) chat.userRealName = realName; if (remark) chat.userRemark = remark; saveData(); openChatSettings(); }

function clearCurrentChat() {
    if (!currentChatId) return;
    
    // 二次确认，防止手滑
    if (confirm("高能预警\n\n确定要清空当前对话的所有消息吗？\n此操作不可恢复！")) {
        const chat = chatList.find(c => c.id === currentChatId);
        if (chat) {
            chat.messages = []; // 清空消息数组
            chat.msg = '';      // 清空列表预览
            chat.time = '';     // 清空时间
            
            chat.currentHeartVoice = null;

            chat.lastSummarizedIndex = 0;
            
            saveData(); // 保存到数据库
            
            // 刷新聊天室界面（如果刚好开着）
            const container = document.getElementById('roomMessages');
            if(container) container.innerHTML = '';
            
            // 刷新列表页
            renderChatList();
            
            alert('聊天记录已清空，记忆与心声已重置');
            closeChatSettings(); // 关闭设置页
        }
    }
}

function saveCurrentChatSettings() {
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;
// --- 插入开始 ---
chat.showAiAvatar = document.getElementById('toggleAiAvatar').classList.contains('checked');
chat.showUserAvatar = document.getElementById('toggleUserAvatar').classList.contains('checked');
// --- 插入结束 ---

    chat.charPersona = document.getElementById('charPersona').value;
    chat.userPersona = document.getElementById('userPersona').value;

    chat.minimaxVoiceId = document.getElementById('charVoiceId').value.trim();

    // 保存自定义回复条数限制
    let rMin = parseInt(document.getElementById('charReplyMin').value);
    let rMax = parseInt(document.getElementById('charReplyMax').value);
    
    // 防呆设计：确保输入值有效，且最小值不低于1，最大值不小于最小值
    if (isNaN(rMin) || rMin < 1) rMin = 1;
    if (isNaN(rMax) || rMax < rMin) rMax = Math.max(rMin, 3);
    
    chat.replyMin = rMin;
    chat.replyMax = rMax;

    // --- 双轨时区数据保存 ---
    chat.charTimezone = document.getElementById('charTimezone').value;
    chat.userTimezone = document.getElementById('userTimezone').value;
    
    if (typeof calculateTimeOffset === 'function') {
        const charD = document.getElementById('charVirtualDate').value;
        const charT = document.getElementById('charVirtualTime').value;
        // 修改为 || (或)，只要填了其中一个就生效
        if (charD || charT) chat.charTimeOffset = calculateTimeOffset(charD, charT, chat.charTimezone, chat.charTimeOffset);
        else delete chat.charTimeOffset;
        
        const userD = document.getElementById('userVirtualDate').value;
        const userT = document.getElementById('userVirtualTime').value;
        if (userD || userT) chat.userTimeOffset = calculateTimeOffset(userD, userT, chat.userTimezone, chat.userTimeOffset);
        else delete chat.userTimeOffset;
    }
    chat.chatMemory = document.getElementById('chatMemory').value; 
    chat.customCss = document.getElementById('customCssInput').value;

    chat.memContextLimit = parseInt(document.getElementById('memContextLimit').value) || 50;
    chat.memThreshold = parseInt(document.getElementById('memThreshold').value) || 50;
    
    chat.memAutoSummary = document.getElementById('memAutoToggle').classList.contains('checked');

    saveData();
    applyChatCustomCss(chat.customCss);
    
    updateMemStats(chat);
}

function applyChatCustomCss(cssCode) {
    let styleTag = document.getElementById('dynamic-chat-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-chat-style';
        document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = cssCode || '';
}

function openChatRoom(id) {
    cancelReply(); 
    currentChatId = id; 
    const chat = chatList.find(c => c.id === id); 
    if(!chat) return; 
    
    // ===========================================
    // ★★★ 第一步修复核心：状态与索引重置 ★★★
    // ===========================================
    
    // 1. 强制解锁：防止上次异常退出导致一直显示“正在总结”
    chat.isSummarizing = false;

    // 2. 索引安全检查：如果记录的“上次总结位置”比“当前总消息数”还大
    //    或者根本不是数字，说明数据乱了，强制重置为 0
    if (typeof chat.lastSummarizedIndex === 'undefined' || 
        isNaN(parseInt(chat.lastSummarizedIndex)) || 
        chat.lastSummarizedIndex > chat.messages.length) {
        
        console.log("检测到记忆索引异常，已自动修复为 0");
        chat.lastSummarizedIndex = 0;
        saveData(); // 立即保存修复后的状态
    }
    // ===========================================

    chat.showFullHistory = false;

    // 填充设置页面的数据
    document.getElementById('charPersona').value = chat.charPersona || '';
    document.getElementById('userPersona').value = chat.userPersona || '';
    document.getElementById('chatMemory').value = chat.chatMemory || '';
    document.getElementById('customCssInput').value = chat.customCss || '';
    
    // 应用样式和标题
    applyChatCustomCss(chat.customCss);
    document.getElementById('roomTitle').innerText = chat.name;

    // 渲染消息 (此时因为上面重置了 flag，只会渲染最后 30 条)
    renderMessages(chat); 
    
    // 显示聊天室
    document.getElementById('chatRoom').classList.add('active'); 

    // ★★★ 修复点 2：延迟滚动到底部 (解决进入不跳转底部的问题) ★★★
    setTimeout(() => {
        const container = document.getElementById('roomMessages');
        if (container) {
            // 强制将滚动条拉到最下面
            container.scrollTop = container.scrollHeight;
        }
    }, 10); 
};

function exitChatRoom() {
    // 1. 在退出前，强制重新计算当前对话的最后一条消息预览
    if (currentChatId) {
        const chat = chatList.find(c => c.id === currentChatId);
        if (chat) {
            updateChatLastMsg(chat); // 更新预览文字
            saveData();              // 保存到数据库
            renderChatList();        // 立即刷新列表界面
        }
    }

    // 2. 关闭聊天室界面
    document.getElementById('chatRoom').classList.remove('active'); 
    currentChatId = null;
    
    // 3. 清除动态样式
    applyChatCustomCss(''); 
};
const menu = document.getElementById('popMenu'), fileInput = document.getElementById('fileInput'), frame = document.getElementById('phoneFrame');
let currentTargetImg = null; 

function showMenu(e, t) {
    // 1. 阻止冒泡，防止触发页面点击关闭菜单
    e.stopPropagation();
    
    // 清空上传上下文（避免和其他功能冲突）
    uploadContext = null; 
    
    // --- 情侣空间特殊逻辑 ---
    if (t === 'coupleSettings') {
        const r = frame.getBoundingClientRect(); 
        menu.style.left = (e.clientX - r.left - 100) + 'px'; 
        menu.style.top = (e.clientY - r.top + 15) + 'px'; 
        menu.style.display = 'flex'; 
        menu.style.zIndex = '10000'; // 强制置顶
        menu.innerHTML = `
            <div class="menu-item" onclick="changeCoupleBg()"><i class="fas fa-image"></i> 更换背景</div>
            <div class="menu-item" onclick="askForLetter()"><i class="fas fa-envelope-open-text"></i> 向TA索信</div>
        `;
        currentTargetImg = document.getElementById('cp-bg-layer');
        return; 
    }

    // --- 普通菜单内容 (恢复默认) ---
    menu.innerHTML = `
        <div class="menu-item" onclick="changeByLink()"><i class="fas fa-link"></i> 图片链接</div>
        <div class="menu-item" onclick="triggerFileInput()"><i class="fas fa-image"></i> 本地图片</div>
    `;

    // --- 查找目标图片元素 ---
    currentTargetImg = null; // 先重置

    // 特殊情况处理
    if (t === 'settingsCharAvatar') { 
        currentTargetImg = document.getElementById('settingsCharAvatar'); 
    } else if (t === 'settingsUserAvatar') { 
        currentTargetImg = document.getElementById('settingsUserAvatar'); 
    } else { 
        // ★★★ 核心修复：在这里添加 'newMaskAvatar' ★★★
        const map = { 
            'header': 'headerImg', 
            'avatar': 'avatarImg', 
            'newCharAvatar': 'newCharAvatar', 
            'newMaskAvatar': 'newMaskAvatar', // <--- 必须有这一行，对应 HTML 里的参数
            'meBanner': 'meBannerImg', 
            'meAvatar': 'meAvatarImg', 
            'kawaiiAvatarLeft': 'kawaiiAvatarLeft', 
            'kawaiiAvatarRight': 'kawaiiAvatarRight', 
            'captcha': 'captchaImg',
            'app5Icon': 'app5Img',
            'app6Icon': 'app6Img',
            'momentBg': 'momentBgLayer',       
            'momentBanner': 'momentBannerImg', 
            'momentAvatar': 'momentUserAvatar',
            'coupleBg': 'cp-bg-layer',
            'coupleCard': 'cpTopCard',
            'walletBg': 'wallet-bg-layer'
        }; 
        
        if (map[t]) currentTargetImg = document.getElementById(map[t]); 
    } 
    
    // --- 显示菜单逻辑 ---
    if (currentTargetImg) { 
        const r = frame.getBoundingClientRect(); 
        
        // 计算位置
        let leftPos = e.clientX - r.left + 15;
        let topPos = e.clientY - r.top - 10;
        
        // 边界检查（防止菜单跑出屏幕右边）
        if (leftPos + 130 > r.width) leftPos = e.clientX - r.left - 130;
        
        menu.style.left = leftPos + 'px'; 
        menu.style.top = topPos + 'px'; 
        
        // ★★★ 核心修复：强制设为最高层级，防止被弹窗遮挡 ★★★
        menu.style.zIndex = '10000'; 
        
        menu.style.display = 'flex'; 
    } else {
        console.error("未找到目标图片元素，ID key:", t);
    }
}

/* ========================================= */
/* ★★★ 面具专用：换头像菜单（避免被弹窗遮挡）★★★ */
/* ========================================= */
function showMaskAvatarMenu(event) {
  if (!event) return;
  event.stopPropagation();

  const menuEl = document.getElementById('maskAvatarMenu');
  if (!menuEl) return;

  // toggle
  if (menuEl.style.display === 'flex') {
    menuEl.style.display = 'none';
    return;
  }

  // 先显示以便拿到真实宽高
  menuEl.style.display = 'flex';

  const menuW = menuEl.offsetWidth || 150;
  const menuH = menuEl.offsetHeight || 90;
  const pad = 12;

  let left = event.clientX + 10;
  let top = event.clientY + 10;

  // 边界检查
  if (left + menuW + pad > window.innerWidth) left = window.innerWidth - menuW - pad;
  if (top + menuH + pad > window.innerHeight) top = window.innerHeight - menuH - pad;
  if (left < pad) left = pad;
  if (top < pad) top = pad;

  menuEl.style.left = left + 'px';
  menuEl.style.top = top + 'px';
}

function hideMaskAvatarMenu() {
  const menuEl = document.getElementById('maskAvatarMenu');
  if (menuEl) menuEl.style.display = 'none';
}

function changeMaskAvatarByLink(event) {
  if (event) event.stopPropagation();
  const u = prompt("请输入图片链接:");
  if (u) {
    const img = document.getElementById('newMaskAvatar');
    if (img) img.src = u;
  }
  hideMaskAvatarMenu();
}

function triggerMaskAvatarFile(event) {
  if (event) event.stopPropagation();
  const input = document.getElementById('maskAvatarFileInput');
  if (input) input.click();
  hideMaskAvatarMenu();
}

// 监听面具头像文件选择（DOM 就绪后绑定）
function bindMaskAvatarFileInput() {
  const input = document.getElementById('maskAvatarFileInput');
  if (!input) return;

  // 防止重复绑定
  if (input.dataset.bound === '1') return;
  input.dataset.bound = '1';

  input.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;

    const r = new FileReader();
    r.onload = (ev) => {
      const img = document.getElementById('newMaskAvatar');
      if (img) img.src = ev.target.result;
    };
    r.readAsDataURL(f);
    input.value = '';
  });
}

document.addEventListener('DOMContentLoaded', bindMaskAvatarFileInput);


function togglePlusMenu(e) { e.stopPropagation(); const m = document.getElementById('plusMenu'); m.style.display = m.style.display === 'flex' ? 'none' : 'flex'; }

document.addEventListener('click', () => { 
    menu.style.display = 'none'; 
    document.getElementById('plusMenu').style.display='none'; 
    document.getElementById('wbPopMenu').style.display='none'; 
    hideMaskAvatarMenu();
});

function changeByLink() { const u = prompt("链接:"); if(u && currentTargetImg) { handleImageUpdate(u); } menu.style.display='none'; }
function triggerFileInput() { fileInput.click(); menu.style.display='none'; }
fileInput.addEventListener('change', (e) => { const f = e.target.files[0]; if (f && uploadContext) { const r = new FileReader(); r.onload = (ev) => { handleBeautifyImageUpdate(ev.target.result); }; r.readAsDataURL(f); fileInput.value = ''; return; } if(f && currentTargetImg) { const r = new FileReader(); r.onload=(ev)=> { handleImageUpdate(ev.target.result); }; r.readAsDataURL(f); } fileInput.value=''; });

function handleImageUpdate(src) { 
    if (currentTargetImg) {
        
        // 找到这一行判断
        if (currentTargetImg.id === 'cp-bg-layer' || currentTargetImg.id === 'cpTopCard') {
            
            // 1. 设置图片路径
            currentTargetImg.style.backgroundImage = `url(${src})`;
            
            // ★★★【修复2：在此处添加样式修正代码】★★★
            // 强制图片铺满且居中，防止图片太大只显示一个白色角落
            if (currentTargetImg.id === 'cpTopCard') {
                currentTargetImg.style.backgroundSize = 'cover';
                currentTargetImg.style.backgroundPosition = 'center';
                currentTargetImg.style.backgroundRepeat = 'no-repeat';
            }
            
            // 2. 找到当前角色并保存
            if (typeof currentCoupleChatId !== 'undefined' && currentCoupleChatId) {
                const chat = chatList.find(c => c.id === currentCoupleChatId);
                if (chat) {
                    if (!chat.coupleData) chat.coupleData = {};
                    
                    if (currentTargetImg.id === 'cp-bg-layer') {
                        chat.coupleData.bgImage = src;
                    } else {
                        chat.coupleData.cardImage = src;
                    }
                    saveData(); // 保存到数据库
                }
            }
            return; // 处理完直接退出
        }
            if (currentTargetImg.id === 'wallet-bg-layer') {
            currentTargetImg.style.backgroundImage = `url(${src})`;
            globalData.walletBg = src; // 存入全局配置
            saveData();
            return;
        }
        // 朋友圈背景处理
        if (currentTargetImg.id === 'momentBgLayer') {
            currentTargetImg.style.backgroundImage = `url(${src})`;
            globalData.momentPageBg = src; 
            saveData(); 
            return; 
        }

        // 普通图片更新
        currentTargetImg.src = src; 

        // 朋友圈 Banner 特殊处理
        if (currentTargetImg.id === 'momentBannerImg') {
            globalData.momentBanner = src;
        }
        else if (currentTargetImg.id === 'momentUserAvatar') {
            globalData.momentAvatar = src;
        }
        
        // Dock/App 图标逻辑 (保持不变)
        if (currentTargetImg.id === 'app5Img') {
            document.getElementById('app5Img').style.display = 'block';
            document.getElementById('app5Default').style.display = 'none';
        }
        if (currentTargetImg.id === 'app6Img') {
            document.getElementById('app6Img').style.display = 'block';
            document.getElementById('app6Default').style.display = 'none';
        }

        // 聊天设置头像逻辑 (保持不变)
        if (currentTargetImg.id === 'settingsCharAvatar') { 
            const chat = chatList.find(c => c.id === currentChatId); 
            if (chat) chat.avatar = src; 
            const headerAvatar = document.getElementById('roomHeaderAvatar');
            if(headerAvatar) { headerAvatar.src = src; headerAvatar.style.display = 'block'; }
            renderMessages(chat); 
            renderChatList(); 
        } 
        else if (currentTargetImg.id === 'settingsUserAvatar') { 
            const chat = chatList.find(c => c.id === currentChatId); 
            if (chat) { chat.userAvatar = src; renderMessages(chat); }
        } 
        if (currentTargetImg.id !== 'newCharAvatar' && currentTargetImg.id !== 'newMaskAvatar') {
            saveData(); 
        }
    }  
}

async function fetchModels() {
    let endpoint = document.getElementById('apiEndpoint').value.trim().replace(/\/+$/, '');
    const key = document.getElementById('apiKey').value.trim();
    const modelSelect = document.getElementById('apiModel');
    const blacklist = ['api520.pro', 'api521.pro']; 
    
    if (blacklist.some(domain => endpoint.includes(domain))) {
        alert("禁止访问\n\n系统已拉黑该 API 服务商 (熊猫)。\n请勿使用此类不稳定或存在风险的接口。\n\n请求已被拦截，未发送任何数据。");
        
        // 恢复按钮状态
        const btn = document.querySelector('.api-btn-small');
        if(btn) { btn.innerText = '拉取模型列表'; btn.style.opacity = '1'; }
        return; // 强制结束
    }
    if (!endpoint) { alert('请先填写 API Endpoint 地址'); return; }

    // 2. 基础校验
    if (!endpoint) { alert('请先填写 API Endpoint 地址'); return; }
    if (!key) { alert('请先填写 API Key'); return; }

    const btn = document.querySelector('.api-btn-small');
    const originalText = btn.innerText;
    btn.innerText = '拉取中...';
    btn.style.opacity = '0.7';

    try {
        console.log(`正在尝试拉取模型列表: ${endpoint}/models`);

        // 3. 发起请求
        const response = await fetch(`${endpoint}/models`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                // 下面这行通常能解决部分代理的缓存问题
                'Cache-Control': 'no-cache'
            }
        });

        // 4. 处理非 200 状态码
        if (!response.ok) {
            let errDetail = `Status: ${response.status}`;
            try {
                const errJson = await response.json();
                if (errJson.error && errJson.error.message) {
                    errDetail = errJson.error.message;
                } else if (errJson.message) {
                    errDetail = errJson.message;
                }
            } catch (e) {
                // 解析 JSON 失败，使用默认状态码描述
                errDetail = response.statusText;
            }
            throw new Error(`API 报错: ${errDetail}`);
        }

        // 5. 解析数据
        const data = await response.json();
        modelSelect.innerHTML = '';

        // 兼容不同厂商的返回格式 (Ollama, OpenAI, DeepSeek 等)
        let models = [];
        if (Array.isArray(data.data)) {
            models = data.data; // 标准 OpenAI 格式
        } else if (Array.isArray(data.models)) {
            models = data.models; // 某些本地部署格式
        } else if (Array.isArray(data)) {
            models = data; // 纯数组格式
        }

        if (models.length > 0) {
            models.forEach(model => {
                // 兼容对象里的 id 或直接是字符串的情况
                const modelId = model.id || model.name || model;
                const option = document.createElement('option');
                option.value = modelId;
                option.innerText = modelId;
                modelSelect.appendChild(option);
            });
            alert(`成功拉取 ${models.length} 个模型！\n请在下拉框中选择。`);
            saveData(); // 保存配置
        } else {
            console.warn("API 返回数据:", data);
            alert('❌ 拉取成功但列表为空，请检查控制台(F12)日志');
        }

    } catch (error) {
        console.error("拉取模型失败:", error);

        // 6. 针对性错误提示
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
            alert(
                '网络请求失败 (Network Error)\n\n' +
                '可能原因：\n' +
                '1. 跨域限制 (CORS)：该 API 不支持浏览器直接访问。\n' +
                '2. 地址错误：检查是否多了/少了 /v1\n' +
                '3. 混合内容：你的网页是HTTPS，但API是HTTP。\n' +
                '4. 科学上网问题。'
            );
        } else {
            alert('拉取失败: ' + error.message);
        }
    } finally {
        btn.innerText = originalText;
        btn.style.opacity = '1';
    }
}

// ★★★ 新增：拉取副 API 模型列表 ★★★
async function fetchSecModels() {
    let endpoint = document.getElementById('secApiEndpoint').value.trim().replace(/\/+$/, '');
    const key = document.getElementById('secApiKey').value.trim();
    const modelSelect = document.getElementById('secApiModel');
    const blacklist = ['api520.pro', 'api521.pro']; 
    
    if (blacklist.some(domain => endpoint.includes(domain))) {
        alert("安全限制：无法访问此 API 域名。");
        return;
    }
    if (!endpoint || !key) { 
        alert('请先填写副 API Endpoint 和 Key'); 
        return; 
    }

    const btn = document.getElementById('secModelFetchBtn');
    const originalText = btn.innerText;
    btn.innerText = '拉取中...';
    btn.style.opacity = '0.7';

    try {
        const response = await fetch(`${endpoint}/models`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });

        if (!response.ok) {
            throw new Error(`API 报错: ${response.statusText}`);
        }

        const data = await response.json();
        modelSelect.innerHTML = '';

        let models = [];
        if (Array.isArray(data.data)) models = data.data;
        else if (Array.isArray(data.models)) models = data.models;
        else if (Array.isArray(data)) models = data;

        if (models.length > 0) {
            models.forEach(model => {
                const modelId = model.id || model.name || model;
                const option = document.createElement('option');
                option.value = modelId;
                option.innerText = modelId;
                modelSelect.appendChild(option);
            });
            alert(`成功拉取副 API 共 ${models.length} 个模型！`);
            saveData(); 
        } else {
            alert('拉取成功但模型列表为空');
        }
    } catch (error) {
        console.error(error);
        alert('副 API 模型拉取失败: ' + error.message);
    } finally {
        btn.innerText = originalText;
        btn.style.opacity = '1';
    }
}

/**
 * ★★★ 中央 API 分发器 (严格隔离版) ★★★
 * 传入功能名称，自动计算并返回相应的 API 配置。
 * 只要功能勾选了副 API，就绝对不向下回退到主 API。
 */
window.getApiCredentials = function(featureName) {
    // 1. 获取主 API 参数
    const primEndpoint = document.getElementById('apiEndpoint')?.value.trim() || globalData.apiEndpoint || "";
    const primKey = document.getElementById('apiKey')?.value.trim() || globalData.apiKey || "";
    const primModel = document.getElementById('apiModel')?.value || globalData.apiModel || "";
    const primTemp = parseFloat(document.getElementById('apiTemp')?.value) || parseFloat(globalData.apiTemp) || 1.0;
    const primMaxTokens = parseInt(document.getElementById('apiMaxTokens')?.value) || parseInt(globalData.apiMaxTokens) || 2048;

    // 2. 获取副 API 参数
    const secEndpoint = document.getElementById('secApiEndpoint')?.value.trim() || globalData.secApiEndpoint || "";
    const secKey = document.getElementById('secApiKey')?.value.trim() || globalData.secApiKey || "";
    const secModel = document.getElementById('secApiModel')?.value || globalData.secApiModel || "";
    const secTemp = parseFloat(document.getElementById('secApiTemp')?.value) || parseFloat(globalData.secApiTemp) || 1.0;
    const secMaxTokens = parseInt(document.getElementById('secApiMaxTokens')?.value) || parseInt(globalData.secApiMaxTokens) || 2048;

    // 3. 判断当前功能是否勾选了副 API
    const featureSwitchMap = {
        'chat': 'secUseChat',
        'summary': 'secUseSummary',
        'diary': 'secUseDiary',
        'quiz': 'secUseQuiz',
        'forum': 'secUseForum',
        'check_phone': 'secUseCheckPhone'
    };

    const switchId = featureSwitchMap[featureName];
    const isSecEnabled = switchId ? (document.getElementById(switchId)?.classList.contains('checked') || globalData[switchId] === true) : false;

    // 【严格隔离逻辑】：只要勾选了副 API，直接返回副 API 配置（即便未配置完整也会直接返回，以便请求时报错，实现绝对不向下回退）。
    if (isSecEnabled) {
        return {
            endpoint: secEndpoint,
            key: secKey,
            model: secModel,
            temperature: secTemp,
            maxTokens: secMaxTokens,
            isSecondary: true
        };
    }

    // 未勾选时，继续使用主 API
    return {
        endpoint: primEndpoint,
        key: primKey,
        model: primModel,
        temperature: primTemp,
        maxTokens: primMaxTokens,
        isSecondary: false
    };
};

async function saveCurrentConfig() { const name = document.getElementById('configName').value.trim(); if (!name) { alert('请输入方案名称'); return; } const profile = { id: Date.now(), name: name, endpoint: document.getElementById('apiEndpoint').value, key: document.getElementById('apiKey').value, model: document.getElementById('apiModel').value, temp: document.getElementById('apiTemp').value }; apiProfiles.push(profile); await db.apiConfig.put(profile); renderApiProfiles(); document.getElementById('configName').value = ''; }
async function deleteProfile(index) { if(confirm('确定删除该方案吗？')) { const id = apiProfiles[index].id; apiProfiles.splice(index, 1); await db.apiConfig.delete(id); renderApiProfiles(); } }
function loadProfile(index) { const p = apiProfiles[index]; document.getElementById('apiEndpoint').value = p.endpoint; document.getElementById('apiKey').value = p.key; const sel = document.getElementById('apiModel'); let exists = false; for(let i=0; i<sel.options.length; i++) { if(sel.options[i].value === p.model) exists = true; } if(!exists) { const opt = document.createElement('option'); opt.value = p.model; opt.innerText = p.model; sel.add(opt); } sel.value = p.model; document.getElementById('apiTemp').value = p.temp; document.getElementById('tempDisplay').innerText = p.temp; saveData(); alert(`已加载方案: ${p.name}`); }
/* ========================================= */
/* ★★★ API 配置管理 (美化下拉框版) ★★★ */
/* ========================================= */

// 1. 渲染下拉框选项 (只显示方案名称版)
function renderApiProfiles() { 
    const select = document.getElementById('apiPresetSelect');
    if (!select) return;

    // 清空现有选项，保留默认提示
    select.innerHTML = '<option value="">-- 请选择已保存的配置 --</option>'; 
    
    apiProfiles.forEach((p, index) => { 
        const option = document.createElement('option');
        option.value = index; 
        // ★★★ 修改处：只显示 p.name (方案名称)，去掉了后面的模型名 ★★★
        option.innerText = p.name; 
        select.appendChild(option); 
    }); 
}

// 2. 选中下拉框时加载配置 (新增)
function loadProfileFromSelect(el) {
    const index = el.value;
    if (index === "") return; // 选了默认提示，不做操作
    
    // 调用原有的 loadProfile 逻辑 (你需要保留原有的 loadProfile 函数)
    loadProfile(index); 
    
    // 视觉反馈：选完后可以弹个轻提示，或者让下拉框保持选中状态
    // 此处无需额外代码，原生 select 会保持显示选中的项
}

// 3. 点击垃圾桶删除当前选中的配置 (新增)
async function deleteProfileFromSelect() {
    const select = document.getElementById('apiPresetSelect');
    const index = select.value;
    
    if (index === "") {
        alert("请先在左侧选择一个要删除的配置方案");
        return;
    }
    
    const profileName = apiProfiles[index].name;
    
    if(confirm(`确定要删除配置方案 “${profileName}” 吗？`)) { 
        const id = apiProfiles[index].id; 
        
        // 从数组移除
        apiProfiles.splice(index, 1); 
        // 从数据库删除
        await db.apiConfig.delete(id); 
        
        // 重新渲染下拉框
        renderApiProfiles(); 
        
        // 重置下拉框到默认状态
        select.value = "";
    } 
}
function openApiSettings() { document.getElementById('apiSettingsPage').classList.add('active'); renderApiProfiles(); }
function closeApiSettings() { document.getElementById('apiSettingsPage').classList.remove('active'); saveData(); }
// [修改] 适配新的底栏类名 (.nav-item)
function switchAppTab(index) {
    // 1. 隐藏所有页面
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    
    // 2. 移除底栏所有按钮的 active 状态
    // 注意：这里改成了 .nav-item
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    
    // 3. 显示目标页面
    const views = ['view-messages', 'view-diary', 'view-moments', 'view-me'];
    const targetView = document.getElementById(views[index]);
    if (targetView) {
        targetView.classList.add('active');
    }
    
    // 4. 激活目标按钮
    // 注意：这里也改成了 .nav-item
    const navItems = document.querySelectorAll('.nav-item');
    if (navItems[index]) {
        navItems[index].classList.add('active');
    }
}
function editText(el) { const t = prompt("修改:", el.innerText); if(t) { el.innerText=t; saveData(); } }
function editLocation() { const el = document.getElementById('locationText'); const t = prompt("位置:", el.innerText); if(t) { el.innerText=t; saveData(); } }

async function sendMsg() {
    const inputEl = document.getElementById('msgInput');
    
    // 1. 获取输入框的内容
    // 这里我们用 let，因为后面如果发现是图片链接，我们要修改它的值
    let text = inputEl.value.trim(); 
    
    if (!currentChatId) return;
    const chat = chatList.find(c => c.id === currentChatId);

    // 2. 【手动触发逻辑】：如果没字，触发 AI 回复
    if (!text) {
        const lastMsg = chat.messages[chat.messages.length - 1];
        if (lastMsg && lastMsg.isLoading) return; 
        generateAiReply(chat);
        return; 
    }

    // 3. ★★★ 智能识别图片链接 ★★★
    // 正则判断：如果是 http 开头，并且以 jpg/png/gif/webp 结尾
    if (text.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
        console.log("检测到图片链接，正在转换为图片...");
        // 直接修改 text 变量，把它变成图片标签
        text = `<img src="${text}" class="album-msg-img">`;
    }

    // ★ 核心修复：获取当前虚拟时间快照 (true代表这是User发的消息)
    const vt = window.getVirtualTimeData(chat, true);
    
    // 4. 构建并保存用户消息
    let newMsg = { 
        text: text, // 直接用修改后的 text
        isSelf: true, 
        time: vt.timeStr,            // 显示的时间 (如 20:05)
        virtualDate: vt.dateStr,     // 固化的日期 (如 05-19)
        virtualTimestamp: vt.ms,     // 固化的毫秒数 (用于剧情计算时间差)
        timestamp: Date.now()        // 现实世界的真实时间打卡 (用于防发脾气)
    };

    if (chat.isUserBlocked) {
        newMsg.isFailed = true; // 标记为发送失败
        chat.messages.push(newMsg);
        updateChatLastMsg(chat);
        saveData();
        renderMessages(chat);
        
        // 滚到底部并清空输入框
        inputEl.value = '';
        inputEl.style.height = '38px';
        const msgContainer = document.getElementById('roomMessages');
        if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
        
        return; // 强制结束函数，绝不触发 generateAiReply
    }

    if (activeReplyContext) {
        newMsg.replyCtx = {
            name: activeReplyContext.name,
            content: activeReplyContext.content
        };
        cancelReply(); 
    }
    
    chat.messages.push(newMsg);
    updateChatLastMsg(chat);
    
    if (!chat.isPinned) {
        chatList = chatList.filter(c => c.id !== currentChatId);
        chatList.unshift(chat);
    }
    
    saveData();
    renderMessages(chat);
    renderChatList();

    inputEl.value = ''; 
    inputEl.style.height = '38px'; 

    // ===========================================
    // ★★★ 记忆总结逻辑 (修复版) ★★★
    // ===========================================
    
    // (1) 获取阈值 (确保是数字)
    let threshold = parseInt(chat.memThreshold);
    if (isNaN(threshold) || threshold < 10) threshold = 50;

    // (2) 获取上次总结的锚点
    const totalMsgs = chat.messages.length;
    let lastIndex = parseInt(chat.lastSummarizedIndex);
    
    // 异常修正：如果索引无效，归零
    if (isNaN(lastIndex) || lastIndex < 0) lastIndex = 0;
    
    // (3) 计算新增数
    let newMsgCount = totalMsgs - lastIndex;
    
    // 如果新增数是负数（比如删除了消息），重置索引并重新计算
    if (newMsgCount < 0) {
        chat.lastSummarizedIndex = totalMsgs; // 既然删了，就假装当前都已总结，从新开始
        lastIndex = totalMsgs;
        newMsgCount = 0;
        saveData();
    }
    
    console.log(`[记忆检查] 当前:${totalMsgs} 上次:${lastIndex} 新增:${newMsgCount} 阈值:${threshold}`);

    // (4) 记忆判定
    if (newMsgCount >= threshold) {
        // 双重检查：确保没有正在运行
        if (chat.isSummarizing) {
            console.log("正在执行总结中，跳过重复触发...");
            return;
        }

        if (chat.memAutoSummary) {
            console.log(">>> 触发自动总结 <<<");
            // 不要 await，防止卡住发送界面，但在后台执行
            triggerManualSummary(true).catch(e => console.error(e)); 
        } else {
            // 手动模式：弹出提示
            const confirmText = `【记忆提醒】\n新增消息已达 ${newMsgCount} 条（阈值 ${threshold}）\n是否立即进行记忆总结？`;
            // 使用 setTimeout 避免阻塞界面渲染
            setTimeout(() => {
                if(confirm(confirmText)) {
                    triggerManualSummary(false);
                }
            }, 100);
        }
    }
}

function renderChatList() {
    const container = document.getElementById('chat-list-container');
    if (!container) return;
    container.innerHTML = ''; // 清空旧内容

    // 1. 排序
    chatList.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return b.isPinned - a.isPinned; // 置顶优先
        // 简单按ID降序(模拟时间)，如果你有 time 字段更好
        return b.id - a.id; 
    });

    const pinnedItems = chatList.filter(c => c.isPinned);
    const normalItems = chatList.filter(c => !c.isPinned);

    const createItemHTML = (chat) => {
        const pinText = chat.isPinned ? "取消" : "置顶";
        const previewText = chat.msg || chat.preview || "暂无消息";
        const timeText = chat.time || "";

        return `
            <div class="chat-swipe-row" id="chat-row-${chat.id}">
                <!-- 侧滑按钮层 -->
                <div class="chat-swipe-actions">
                    <div class="swipe-btn btn-cancel" onclick="resetSwipe(this)">取消</div>
                    <div class="swipe-btn btn-pin" onclick="togglePin(${chat.id})">${pinText}</div>
                    <!-- ★★★ 新增：编辑按钮 ★★★ -->
                    <div class="swipe-btn btn-edit" onclick="editChat(${chat.id})">编辑</div>
                    <div class="swipe-btn btn-delete" onclick="deleteChat(${chat.id})">删除</div>
                </div>
                
                <!-- 内容层 -->
                <div class="chat-item-content" onclick="openChatRoom(${chat.id})">
                    <img src="${chat.avatar}" class="chat-avatar">
                    <div class="chat-info">
                        <div class="chat-name-row">
                            <span class="chat-name">${chat.name}</span>
                            <span class="chat-time">${timeText}</span>
                        </div>
                        <div class="chat-preview">${previewText}</div>
                    </div>
                </div>
            </div>
        `;
    };

    // 3. 渲染置顶组
    if (pinnedItems.length > 0) {
        const pinnedGroup = document.createElement('div');
        pinnedGroup.className = "chat-list-group";
        pinnedItems.forEach(item => {
            pinnedGroup.innerHTML += createItemHTML(item);
        });
        container.appendChild(pinnedGroup);
    }

    // 4. 渲染普通组
    if (normalItems.length > 0) {
        const normalGroup = document.createElement('div');
        normalGroup.className = "chat-list-group";
        normalItems.forEach(item => {
            normalGroup.innerHTML += createItemHTML(item);
        });
        container.appendChild(normalGroup);
    }

    // 5. ★★★ 重新绑定侧滑事件 (必须在插入HTML后执行) ★★★
    bindSwipeEvents();
}

// === 新增：侧滑事件绑定函数 (从 index15 逻辑简化移植) ===
function bindSwipeEvents() {
    const rows = document.querySelectorAll('.chat-swipe-row');
    
    rows.forEach(row => {
        const content = row.querySelector('.chat-item-content');
        let startX = 0;
        let currentX = 0;
        let isDragging = false;
        const MAX_SWIPE = 260; // 三个按钮的总宽度 approx

        // 触摸开始
        content.addEventListener('touchstart', (e) => {
            // 先复位其他所有行
            document.querySelectorAll('.chat-item-content').forEach(el => {
                if(el !== content) el.style.transform = 'translateX(0)';
            });
            
            startX = e.touches[0].clientX;
            isDragging = true;
            content.style.transition = 'none'; // 拖动时移除过渡，跟手
        }, {passive: true});

        // 触摸移动
        content.addEventListener('touchmove', (e) => {
            if(!isDragging) return;
            currentX = e.touches[0].clientX;
            let diff = currentX - startX;

            // 只能向左滑 (diff < 0)
            if (diff > 0) diff = 0;
            if (diff < -MAX_SWIPE) diff = -MAX_SWIPE; // 阻尼限制

            // 如果滑动幅度很小，不认为是侧滑，防止误触
            if (Math.abs(diff) > 5) {
                content.style.transform = `translateX(${diff}px)`;
            }
        }, {passive: true});

        // 触摸结束
        content.addEventListener('touchend', (e) => {
            isDragging = false;
            content.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';
            
            const endX = e.changedTouches[0].clientX;
            const diff = endX - startX;

            // 如果向左滑超过 60px，就展开；否则回弹
            if (diff < -60) {
                content.style.transform = `translateX(-${MAX_SWIPE}px)`;
            } else {
                content.style.transform = `translateX(0)`;
            }
        });
    });
}

// 辅助函数：复位侧滑
function resetSwipe(btn) {
    const row = btn.closest('.chat-swipe-row');
    const content = row.querySelector('.chat-item-content');
    content.style.transform = 'translateX(0)';
}

async function deleteChat(id) { chatList = chatList.filter(c => c.id !== id); await db.chats.delete(id); renderChatList(); }
function togglePin(id) { const chat = chatList.find(c => c.id === id); if (chat) { chat.isPinned = !chat.isPinned; saveData(); renderChatList(); } }

const addCharModal = document.getElementById('addCharModal');
const wbModal = document.getElementById('wbModal');
const wbList = document.getElementById('wbList');
const wbSelectorText = document.getElementById('wbSelectedText');

function openAddCharModal() {
    // ★★★ 新增：重置编辑状态 ★★★
    editingCharId = null; 
    document.querySelector('#addCharModal .modal-title').innerText = "创建新角色";
    document.querySelector('#addCharModal .btn-confirm-modal').innerText = "确认添加";
    // ---------------------------

    document.getElementById('plusMenu').style.display = 'none';
    
    document.getElementById('newCharAvatar').src = 'https://placehold.co/100/e0e0e0/888?text=+';
    document.getElementById('newCharRealName').value = '';
    document.getElementById('newCharName').value = '';
    document.getElementById('newCharSetting').value = '';
    document.getElementById('newCharVisualPrompt').value = ''; 
    
    tempSelectedMaskId = null;
    document.getElementById('charMaskSelectedText').innerText = "默认 (不使用面具)";
    document.getElementById('charMaskSelectedText').style.color = '#888';
    document.getElementById('charMaskSelectedText').style.fontWeight = 'normal';

    tempSelectedWb = [];
    updateWbSelectorText();
    
    addCharModal.style.display = 'flex';
    setTimeout(() => addCharModal.classList.add('show'), 10);
}

function closeAddCharModal() {
    addCharModal.classList.remove('show');
    setTimeout(() => addCharModal.style.display = 'none', 300);
}

function openWorldBookModal() { 
    wbList.innerHTML = ''; 
    if(worldBooks.length === 0) {
        wbList.innerHTML = '<div style="text-align:center;color:#999;margin-top:20px;">暂无世界书<br>请在“我的”页面添加</div>';
    } else {
        worldBooks.forEach(wb => { 
            const item = document.createElement('div'); 
            item.className = 'wb-item'; 
            
            // ★★★ 修改 1：判断选中状态时，要兼容 ID (新逻辑) 和 名字 (旧数据)
            // 如果 tempSelectedWb 里的某一项 等于 wb.id 或 wb.name，就打钩
            const isChecked = tempSelectedWb.some(val => val == wb.id || val === wb.name) ? 'checked' : ''; 
            
            // ★★★ 修改 2：value 存 wb.id，而不是 wb.name
            item.innerHTML = `<input type="checkbox" class="wb-checkbox" value="${wb.id}" ${isChecked}><span>${wb.name}</span>`; 
            
            item.onclick = (e) => { 
                if(e.target.tagName !== 'INPUT') { 
                    const cb = item.querySelector('input'); 
                    cb.checked = !cb.checked; 
                } 
            }; 
            wbList.appendChild(item); 
        });
    }
    wbModal.style.display = 'flex'; 
}

// ★★★ 新增：编辑角色逻辑 ★★★
function editChat(id) {
    const chat = chatList.find(c => c.id === id);
    if (!chat) return;

    // 1. 标记当前为编辑模式
    editingCharId = id;

    // 2. 隐藏加号菜单（如果有打开）
    document.getElementById('plusMenu').style.display = 'none';

    // 3. 回填基础数据
    document.getElementById('newCharAvatar').src = chat.avatar;
    document.getElementById('newCharRealName').value = chat.realName || "";
    document.getElementById('newCharName').value = chat.name || "";
    document.getElementById('newCharSetting').value = chat.charPersona || "";
    document.getElementById('newCharVisualPrompt').value = chat.visualPrompt || ""; 

    // 4. 回填世界书数据 (关键)
    // chat.worldBooks 里面存的是 ID 数组
    tempSelectedWb = chat.worldBooks || [];
    updateWbSelectorText(); // 调用现有的函数刷新 UI 文字

    // 5. 修改弹窗标题和按钮文字，让用户知道是在编辑
    document.querySelector('#addCharModal .modal-title').innerText = "编辑角色资料";
    document.querySelector('#addCharModal .btn-confirm-modal').innerText = "保存修改";

    // 6. 显示弹窗
    const modal = document.getElementById('addCharModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    
    // 7. 复位侧滑状态
    const row = document.getElementById(`chat-row-${id}`);
    if(row) {
        const content = row.querySelector('.chat-item-content');
        if(content) content.style.transform = 'translateX(0)';
    }
}

// ★★★ 修复：保存时存入 ID 而不是名字 ★★★
function confirmWorldBooks() { 
    const checkboxes = document.querySelectorAll('.wb-checkbox:checked'); 
    
    // 将选中的值存入临时数组
    // 关键：检查 value 是否为数字（ID），如果是则转为 Number 类型存储
    tempSelectedWb = Array.from(checkboxes).map(cb => {
        const val = cb.value;
        return isNaN(val) ? val : Number(val); 
    }); 
    
    updateWbSelectorText(); 
    wbModal.style.display = 'none'; 
}

// ★★★ 修复：显示时将 ID 翻译回名字 ★★★
function updateWbSelectorText() { 
    if(tempSelectedWb.length > 0) { 
        // 遍历选中的 ID (或旧数据的名字)，去 worldBooks 列表里找对应的名字显示
        const names = tempSelectedWb.map(idOrName => {
            // 尝试通过 ID 找
            const found = worldBooks.find(wb => wb.id == idOrName);
            // 找到了就显示新名字；找不到（说明是旧数据的纯名字，或者该书被删了）就显示原值
            return found ? found.name : idOrName;
        });
        
        wbSelectorText.innerText = names.join('、'); 
        wbSelectorText.style.color = '#333'; 
    } else { 
        wbSelectorText.innerText = '点击选择世界书...'; 
        wbSelectorText.style.color = '#888'; 
    } 
}

async function confirmAddChar() { 
    const name = document.getElementById('newCharName').value.trim(); 
    if (!name) { 
        alert("请填写备注名 (显示在列表的名字)"); 
        return; 
    } 

    const realName = document.getElementById('newCharRealName').value.trim();
    const avatar = document.getElementById('newCharAvatar').src;
    const charPersona = document.getElementById('newCharSetting').value;
    const visualPrompt = document.getElementById('newCharVisualPrompt').value.trim(); // 新增：获取外观词
    
    let maskData = null;
    if (tempSelectedMaskId) {
    
        maskData = userMasks.find(m => m.id === tempSelectedMaskId);
    }
    
    if (editingCharId) {
        const chat = chatList.find(c => c.id === editingCharId);
        if (chat) {
            chat.name = name;
            chat.realName = realName;
            chat.avatar = avatar;
            chat.charPersona = charPersona;
            chat.visualPrompt = visualPrompt; 
            chat.worldBooks = tempSelectedWb;
            
            if (maskData) {
                chat.userAvatar = maskData.avatar;
                chat.userRealName = maskData.name;
                chat.userRemark = maskData.name;
                chat.userPersona = maskData.persona;
            }
            
            await db.chats.put(chat);
            
            if (currentChatId === editingCharId) {
                document.getElementById('roomTitle').innerText = name;
            }
        }
    } else {
        const now = new Date();
        const timeStr = String(now.getHours()).padStart(2,'0') + ":" + String(now.getMinutes()).padStart(2,'0');

        const newItem = { 
            id: Date.now(), 
            name: name, 
            realName: realName, 
            avatar: avatar, 
            charPersona: charPersona, 
            visualPrompt: visualPrompt, 
            worldBooks: tempSelectedWb,
            messages: [],       
            time: timeStr,
            isPinned: false,
            
            userAvatar: maskData ? maskData.avatar : "", 
            userRealName: maskData ? maskData.name : "",
            userRemark: maskData ? maskData.name : "",
            userPersona: maskData ? maskData.persona : "",
            
            lastMomentTime: 0
        }; 
        
        chatList.push(newItem); 
        await db.chats.add(newItem); 

        // 自动将新创建的角色加入后台允许列表，防止活动权限处于未激活状态
        if (!globalData) globalData = {};
        if (!globalData.autoAllowedCharIds) {
            globalData.autoAllowedCharIds = [];
        }
        if (!globalData.autoAllowedCharIds.includes(newItem.id)) {
            globalData.autoAllowedCharIds.push(newItem.id);
        }
        await saveData();
    }
    
    tempSelectedMaskId = null;
    const maskTextEl = document.getElementById('charMaskSelectedText');
    if (maskTextEl) {
        maskTextEl.innerText = "默认 (不使用面具)";
        maskTextEl.style.color = '#888';
        maskTextEl.style.fontWeight = 'normal';
    }

    renderChatList(); 
    closeAddCharModal(); 
}

const overlay = document.getElementById('appOverlay'), chatPage = document.getElementById('chatAppPage'), genericPage = document.getElementById('genericAppPage'), appTitle = document.getElementById('appTitle');
function openApp(appName) { 
    // 打开主遮罩
    overlay.classList.add('active'); 
    
    // 1. 获取所有子页面
    const chatPage = document.getElementById('chatAppPage');
    const genericPage = document.getElementById('genericAppPage');
    const forumPage = document.getElementById('forumPage'); // 获取论坛页

    // 2. 先全部隐藏
    if (chatPage) chatPage.style.display = 'none';
    if (genericPage) genericPage.style.display = 'none';
    if (forumPage) forumPage.style.display = 'none';

    // 3. 判断打开哪个应用
    if (appName === 'Page 1') { 
        // --- 微信/聊天列表 ---
        if (chatPage) chatPage.style.display = 'flex'; 
        renderChatList(); 
        switchAppTab(0); 
        
    } else if (appName === 'Page 4') {
        // --- ★★★ 论坛 App (Dock 第4个图标) ★★★ ---
        if (forumPage) forumPage.style.display = 'block';
        
        // A. 同步数据 (把聊天角色喂给论坛)
        syncForumData(); 
        
        // B. 初始化论坛 (如果已加载)
        if (typeof window.initForumApp === 'function') {
            // 每次打开都重新渲染一下，确保数据最新
            window.initForumApp();
        } else {
            console.error("论坛App尚未加载，请检查 forum_app.js 是否引入");
        }

    } else { 
        // --- 其他通用页面 ---
        if (genericPage) genericPage.style.display = 'flex'; 
        if (appTitle) appTitle.innerText = appName; 
    } 
}
function closeApp() { overlay.classList.remove('active'); }
function switchWechatTab(el) { document.querySelectorAll('.wechat-tab-btn').forEach(tab => tab.classList.remove('active')); el.classList.add('active'); }
document.addEventListener('DOMContentLoaded', () => PageNav.init());

// =========================================
// ★★★ 智能返回函数 ★★★
// =========================================
function handleAppSwipeBack() {
    PageNav.back();
}
let appStartX = 0; let appIsSwiping = false;
overlay.addEventListener('mousedown', (e) => { const rect = overlay.getBoundingClientRect(); if (e.clientX - rect.left < 40) { appStartX = e.clientX; appIsSwiping = true; } });
overlay.addEventListener('mouseup', (e) => { if (!appIsSwiping) return; if (e.clientX - appStartX > 60) { handleAppSwipeBack(); } appIsSwiping = false; });
overlay.addEventListener('touchstart', (e) => { const rect = overlay.getBoundingClientRect(); if (e.touches[0].clientX - rect.left < 40) { appStartX = e.touches[0].clientX; appIsSwiping = true; } });
overlay.addEventListener('touchend', (e) => { if (!appIsSwiping) return; if (e.changedTouches[0].clientX - appStartX > 60) { handleAppSwipeBack(); } appIsSwiping = false; });


function updateClock() { 
    const now = new Date(); 
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`; 
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; 
    
    // ★★★ 主屏幕时间 ★★★
    const timeEl = document.getElementById('realTimeDisplay');
    const dateEl = document.getElementById('realDateDisplay');
    if(timeEl) timeEl.innerText = timeStr;
    if(dateEl) dateEl.innerText = dateStr;
    
    // ★★★ kawaii 卡片时间（如果有的话）★★★
    const kTimeEl = document.querySelector('.k-time-text');
    const kDateEl = document.querySelector('.k-date-text');
    if(kTimeEl) kTimeEl.innerText = timeStr;
    if(kDateEl) kDateEl.innerText = dateStr;
}

// 每秒更新一次
setInterval(updateClock, 1000); 

function changeDockIcon(index, type) { uploadContext = { type: 'dock', index: index }; if (type === 'link') { const u = prompt("请输入图片链接:"); if(u) handleBeautifyImageUpdate(u); } else { document.getElementById('fileInput').click(); } }
function changeAppIcon(index, type) { uploadContext = { type: 'app', index: index }; if (type === 'link') { const u = prompt("请输入图片链接:"); if(u) handleBeautifyImageUpdate(u); } else { document.getElementById('fileInput').click(); } }
function clearWallpaper() { document.body.style.backgroundImage = ''; document.body.classList.remove('has-wallpaper'); openBeautifyPage(); saveData(); }

const msgInputArea = document.getElementById('msgInput');

// 搜索关键词: autoResizeInput
function autoResizeInput(element) {
    // 每次计算前重置高度，以便缩小
    element.style.height = '38px'; 
    // 根据文字高度动态赋值
    let newHeight = element.scrollHeight;
    // 限制最高高度
    if (newHeight > 120) {
        element.style.height = '120px';
        element.style.overflowY = 'auto';
    } else {
        element.style.height = newHeight + 'px';
        element.style.overflowY = 'hidden';
    }
}

if (msgInputArea) {
    // 输入框获得焦点
    msgInputArea.addEventListener('focus', function() {
        const panel = document.getElementById('chatToolsPanel');
        const footer = document.getElementById('newRoomFooter');
        
        // 如果工具面板是打开的，先关闭它
        if (panel && panel.classList.contains('active')) {
            footer.classList.remove('tools-active');
            panel.classList.remove('active');
            
            // 重置面板内部视图状态
            setTimeout(() => {
                const mainMenu = document.getElementById('toolsMainMenu');
                const subView = document.getElementById('stickerSubView');
                const addView = document.getElementById('addStickerView');
                if (mainMenu) mainMenu.style.display = 'flex';
                if (subView) subView.style.display = 'none';
                if (addView) addView.style.display = 'none';
            }, 100);
            
            // ★★★ 修复：等键盘稳定后，一次性调整位置 ★★★
            setTimeout(() => {
                if (window.visualViewport) {
                    const keyboardHeight = Math.round(window.innerHeight - window.visualViewport.height);
                    if (keyboardHeight > 150) {
                        footer.style.bottom = keyboardHeight + 'px';
                    }
                }
                const msgContainer = document.getElementById('roomMessages');
                if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
            }, 350);
            
            return; // 直接返回，不执行下面的逻辑
        }
        
        // 普通情况：滚动消息到底部
        setTimeout(() => {
            const msgContainer = document.getElementById('roomMessages');
            if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
        }, 350);
    });

    // 自动调整高度
    msgInputArea.addEventListener('input', function() {
        autoResizeInput(this);
    });

    // 回车发送
    msgInputArea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); 
            sendMsg();
            this.style.height = '38px'; 
            this.value = ''; 
        }
    });
}


function bootApp() {
    if (typeof window.secureBoot === 'function') {
        // 调用启动验证
        window.secureBoot(function() {
            console.log("验证通过");
            // 验证通过后，才去加载数据库和渲染界面
            loadAllDataFromDB(); 
        });
    } else {
        // 如果走到这里，说明你 script.js 顶部的代码没粘贴对
        console.error("Critical: Security module missing.");
        alert("系统错误");
    }
}

// 启动监听 (保持不变)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
}

// Cloudflare Rocket Loader/异步脚本可能导致此脚本在 DOMContentLoaded 之后才执行，
// 这会让 addEventListener('DOMContentLoaded', ...) 永远不触发，从而跳过激活校验与数据加载。
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
}

function renderMemSummaryList(chat) {
    const list = document.getElementById('memSummaryList');
    list.innerHTML = '';
    
    if (!chat.summaries) chat.summaries = [];

    if (chat.summaries.length === 0) {
        list.innerHTML = '<div style="text-align:center;font-size:12px;color:#ccc;padding:10px;">暂无总结记录</div>';
        return;
    }

    // 为了防止索引错乱，保留原始索引
    const reversedSummaries = chat.summaries.map((item, idx) => ({...item, originalIndex: idx})).reverse();

    reversedSummaries.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'mem-summary-card';
        
        card.innerHTML = `
            <div class="mem-card-date">${item.date}</div>
            <!-- 修改1: 增加 id, 增加 disabled 属性, 去掉 onchange -->
            <textarea id="mem-summ-${item.originalIndex}" class="mem-card-textarea" disabled>${item.content}</textarea>
            
            <div class="mem-card-actions">
                <!-- 修改2: 新增编辑按钮 -->
                <span class="mem-edit-btn-text" onclick="toggleSummaryEdit(${item.originalIndex}, this)">编辑</span>
                <span class="mem-del-btn-text" onclick="deleteSummary(${item.originalIndex})">删除</span>
            </div>
        `;
        list.appendChild(card);
    });
}
/* --- 在 script.js 中添加以下新函数 --- */

// 1. 切换编辑/完成状态
function toggleSummaryEdit(index, btn) {
    const textarea = document.getElementById(`mem-summ-${index}`);
    if (!textarea) return;

    if (textarea.disabled) {
        // --- 进入编辑模式 ---
        textarea.disabled = false; // 启用输入
        textarea.focus();          // 自动聚焦
        btn.innerText = "完成";    // 按钮变字
        btn.style.fontWeight = "bold";
    } else {
        // --- 点击完成 (保存) ---
        textarea.disabled = true;  // 禁用输入
        btn.innerText = "编辑";    // 按钮复原
        btn.style.fontWeight = "normal";
        
        // 执行保存
        updateSummaryContent(index, textarea.value);
    }
}

// 2. 实际保存数据到数据库
function updateSummaryContent(index, newContent) {
    const chat = chatList.find(c => c.id === currentChatId);
    if (chat && chat.summaries[index]) {
        // 更新内存中的数据
        chat.summaries[index].content = newContent;
        
        // 保存到 IndexedDB
        saveData();
        
        // 刷新 token 统计 (右上角的 token 数)
        updateMemStats(chat);
        
        // 可选：给个轻微震动反馈
        if(navigator.vibrate) {
            try { navigator.vibrate(10); } catch(err) {}
        }
    }
}

function deleteSummary(index) {
    // 1. 获取当前聊天对象
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat || !chat.summaries) return;

    // 2. 弹窗确认
    if (!confirm('确认删除这条记忆总结吗？此操作不可恢复。')) return;

    // 3. 执行删除 (splice)
    chat.summaries.splice(index, 1);

    // 4. 保存数据库
    saveData();

    // 5. 刷新列表界面和 Token 统计
    renderMemSummaryList(chat);
    updateMemStats(chat);
}

function toggleMemMode() {
    const toggle = document.getElementById('memAutoToggle');
    const text = document.getElementById('memModeText');
    
    toggle.classList.toggle('checked');
    
    if (toggle.classList.contains('checked')) {
        text.innerText = "自动";
        text.style.color = "#34c759"; 
    } else {
        text.innerText = "手动";
        text.style.color = "#007aff"; 
    }
    
    saveCurrentChatSettings();
}
function toggleBankList() {
    const header = document.getElementById('memBankHeader');
    const container = document.getElementById('memSummaryContainer');
    
    header.classList.toggle('open');
    
    if (header.classList.contains('open')) {
        container.style.display = 'flex';
    } else {
        container.style.display = 'none';
    }
}
function switchMemMode(mode, autoSave = true) {
    const btnAuto = document.getElementById('modeBtnAuto');
    const btnManual = document.getElementById('modeBtnManual');
    
    if (mode === 'auto') {
        btnAuto.classList.add('active');
        btnManual.classList.remove('active');
    } else {
        btnManual.classList.add('active');
        btnAuto.classList.remove('active');
    }

    if (autoSave) saveCurrentChatSettings();
}
// 【修复版】范围总结
async function triggerRangeSummary() {
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;

    const startVal = parseInt(document.getElementById('summaryStart').value);
    const endVal = parseInt(document.getElementById('summaryEnd').value);
    const totalMsgs = chat.messages.length;

    if (isNaN(startVal) || isNaN(endVal) || startVal < 1) {
        alert("请输入有效的起始范围 (必须大于0)");
        return;
    }
    
    // 数组索引是从0开始的，所以第1条是 index 0
    const sliceStart = Math.max(0, startVal - 1);
    const sliceEnd = Math.min(totalMsgs, endVal);
    
    if (sliceStart >= sliceEnd) {
        alert(`范围无效！起始(${startVal}) 必须小于 结束(${endVal})`);
        return;
    }
    
    const msgsToProcess = chat.messages.slice(sliceStart, sliceEnd);
    
    if (msgsToProcess.length === 0) {
        alert("选定范围内没有消息！");
        return;
    }

    const confirmMsg = `确定要总结第 ${startVal} 到 ${sliceEnd} 条消息吗？\n(共 ${msgsToProcess.length} 条)`;
    if (!confirm(confirmMsg)) return;

    const oldIndex = chat.lastSummarizedIndex;
    
    try {
        await executeSummaryApi(chat, msgsToProcess, `范围总结 (${startVal}-${sliceEnd})`);
        alert("范围总结完成");
    } catch (e) {
        alert("范围总结失败: " + e.message);
    }
}

async function executeSummaryApi(chat, messagesArray, dateSuffix = "") {
    // 使用中央路由分流
    const apiConfig = window.getApiCredentials('summary');
    const endpoint = apiConfig.endpoint;
    const key = apiConfig.key;
    const model = apiConfig.model;
    const maxTokens = apiConfig.maxTokens;
    const temperature = apiConfig.temperature;

    if (!key) throw new Error("缺少 API Key");
    
    // ★ 防呆：再次检查数组
    if (!messagesArray || messagesArray.length === 0) return;

    const userName = chat.userRemark || chat.userRealName || "对方";
const promptText = messagesArray.map(m => `${m.isSelf ? userName : chat.name}: ${m.text}`).join('\n');
    const customInstruction = chat.chatMemory || ""; 

    // ★ 获取经过时区和偏移量计算的【虚拟时间】
    const tz = chat.userTimezone || 'Asia/Shanghai';
    const offset = chat.userTimeOffset || 0;
    const virtualMs = Date.now() + offset;
    const virtualDateStr = new Intl.DateTimeFormat('zh-CN', { 
        timeZone: tz, 
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false 
    }).format(new Date(virtualMs));

    const systemPrompt = `
[System Command]:
你现在的任务是【记忆总结员】。
当前总结时间（故事虚拟时间）：${virtualDateStr}。
正在总结的角色：${chat.name}。

【通用要求】：
1. 视角要求：请严格以客观的**第三人称视角**（使用“${userName}”和“${chat.name}”）进行总结，绝对不要使用“我”、“用户”或第一人称视角。
2. 详细程度：请阅读对话片段，尽可能详细、连贯地记录事件进展、关键细节、${userName}的偏好以及双方的情感变化，不要过度简略。
3. 格式要求：直接输出总结段落，使用陈述句，不要加任何前缀或标题。

【最高优先级属性：用户特别指令】：
(如果下方有指令，请必须绝对服从，它的优先级高于一切)
${customInstruction || "无"}

待总结的对话片段：
${promptText.slice(0, 12000)} 
    `; 


    const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: systemPrompt }],
            temperature: 0.5,
            max_tokens: parseInt(document.getElementById('apiMaxTokens').value) || 2048
        })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`API请求失败: ${response.status} ${errData.error?.message || ''}`);
    }
    
    const data = await response.json();
    const summaryText = data.choices[0].message.content.trim();

        // 4. 更新内存数据
    if (!chat.summaries) chat.summaries = [];
    chat.summaries.push({
        date: virtualDateStr + (dateSuffix ? ` [${dateSuffix}]` : ""),
        content: summaryText
    });


    let lastIndex = parseInt(chat.lastSummarizedIndex) || 0;
    chat.lastSummarizedIndex = lastIndex + messagesArray.length;
    
    // 双重保险：不能超过当前总长度
    if (chat.lastSummarizedIndex > chat.messages.length) {
        chat.lastSummarizedIndex = chat.messages.length;
    }

    await db.chats.put(chat);
    
    // 5. 刷新界面
    renderMemSummaryList(chat);
    updateMemStats(chat);
}

function updateMemStats(chat) {
    if(!chat) return;
    const msgCount = chat.messages.length;
    document.getElementById('statMsgCount').innerText = msgCount;

    let totalText = "";
    let imageCount = 0; 
    
    // 1. 基础人设
    totalText += (chat.charPersona || "") + (chat.userPersona || "");
    
    // 2. 记忆摘要
    if (chat.summaries) {
        chat.summaries.forEach(s => totalText += s.content);
    }
    
    // 3. 聊天记录 & 图片扫描
    chat.messages.forEach(m => {
        totalText += m.text; 

        if (m.text.includes('<img') && !m.text.includes('chat-sticker-img')) {
            imageCount++;
        }
    });

        // 4. 世界书消耗
    if (typeof worldBooks !== 'undefined') {
        const boundList = chat.worldBooks || []; 
        worldBooks.forEach(wb => {
            const isBound = boundList.some(ref => ref == wb.id || ref === wb.name) || wb.boundCharId === chat.id;
            
            if (isBound && wb.triggerType === 'always') {
                wb.entries.forEach(entry => {
                    if (entry.enabled !== false) { // 剔除被关闭的条目
                        totalText += (entry.title || "") + (entry.content || "");
                    }
                });
            }
        });
    }


    let tokenEst = 0;
    tokenEst += imageCount * 258;

    for (let i = 0; i < totalText.length; i++) {
        const code = totalText.charCodeAt(i);
        if (code > 255) {
            tokenEst += 1.2; 
        } 
        else {
            tokenEst += 0.25;           
        }
    }
    
    document.getElementById('statTokenCount').innerText = Math.ceil(tokenEst);
}

// 【修复版】触发手动/自动总结 (防止重复触发 + 死锁自动恢复)
async function triggerManualSummary(isAuto = false) {
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;
    
    // 1. 检查锁状态
    if (chat.isSummarizing === true) {
        // ★ 增加超时熔断：如果锁了太久（比如超过5分钟），强制解锁，防止永远卡死
        const lastLockTime = chat.lastSummaryLockTime || 0;
        if (Date.now() - lastLockTime > 300000) { 
             console.warn("总结锁超时，强制重置...");
             chat.isSummarizing = false;
        } else {
             console.log("上一次总结尚未结束，跳过本次触发...");
             return; 
        }
    }

    // 2. 获取 Key
    const key = document.getElementById('apiKey').value;
    if (!key) {
        if (!isAuto) alert("请先在API配置页面填写API Key");
        return;
    }

    const btn = document.getElementById('btnManualSummary');

    try {
        // ★ 上锁并记录时间
        chat.isSummarizing = true; 
        chat.lastSummaryLockTime = Date.now(); 

        if (!isAuto && btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在总结...';
            btn.classList.add('loading');
        }

        // 索引安全校验
        let lastIndex = parseInt(chat.lastSummarizedIndex);
        if (isNaN(lastIndex) || lastIndex < 0) lastIndex = 0;
        
        // 如果索引比当前消息总数还大，修正它
        if (lastIndex > chat.messages.length) {
            chat.lastSummarizedIndex = chat.messages.length;
            await db.chats.put(chat);
            if (!isAuto) alert("没有新的消息需要总结 (索引已修正)");
            return;
        }

        // 获取切片
        let msgsToProcess = chat.messages.slice(lastIndex);
        
        // 空数组检查
        if (msgsToProcess.length === 0) {
            // 已经是最新了
            chat.lastSummarizedIndex = chat.messages.length;
            await db.chats.put(chat);
            if (!isAuto) alert("当前没有未总结的新消息！");
            return; 
        }

        // 执行总结 API
        console.log(`[记忆系统] 正在总结第 ${lastIndex} 到 ${chat.messages.length} 条消息...`);
        await executeSummaryApi(chat, msgsToProcess, isAuto ? "自动总结" : "手动总结");
        
        if (!isAuto) {
            alert("总结成功！\n记忆库已更新，进度已保存。");
        }

    } catch (error) {
        console.error("总结失败", error);
        if (!isAuto) alert("总结失败: " + error.message);
    } finally {
        // ★ 无论成功还是失败，必须解锁
        chat.isSummarizing = false;
        // 记得保存一下解锁状态，否则刷新后可能还是锁着的（虽然第一步加了重置，但这里也要规范）
        await db.chats.put(chat); 

        if (!isAuto && btn) {
            btn.innerHTML = '<i class="fas fa-magic"></i> 立即执行总结';
            btn.classList.remove('loading');
        }
    }
}

const bubbleColors = [
    { name: "默认", userBg: "#ffeeb0", aiBg: "#ffffff", userText: "#000", aiText: "#333" },
    { name: "黑白", userBg: "#000000", aiBg: "#ffffff", userText: "#fff", aiText: "#000" },
    { name: "绿白", userBg: "#dcf8c6", aiBg: "#ffffff", userText: "#000", aiText: "#333" },
    { name: "奶桃", userBg: "#F3E4E9", aiBg: "#FFF7FA", userText: "#333", aiText: "#333" }, 
    { name: "豆沙", userBg: "#8D6F7B", aiBg: "#F2E4E9", userText: "#fff", aiText: "#333" },
    { name: "海盐", userBg: "#E6F2FD", aiBg: "#A3ACAD", userText: "#333", aiText: "#fff" },
    { name: "芝麻", userBg: "#BFBBBE", aiBg: "#fffef8", userText: "#fff", aiText: "#333" },
    { name: "极光", userBg: "#C0C0C0", aiBg: "#EBF7F7", userText: "#fff", aiText: "#333" }
];

function renderColorGrid() {
    const grid = document.getElementById('colorGrid');
    if(!grid) return;
    grid.innerHTML = '';

    bubbleColors.forEach(theme => {
        const item = document.createElement('div');
        item.className = 'color-option';
        item.onclick = () => generateCssForTheme(theme);

        item.innerHTML = `
            <div class="color-circle">
                <div class="c-half-left" style="background:${theme.aiBg}"></div>
                <div class="c-half-right" style="background:${theme.userBg}"></div>
            </div>
            <div class="color-name">${theme.name}</div>
        `;
        grid.appendChild(item);
    });
}

function generateCssForTheme(theme) {
    const css = `/* ${theme.name}配色 */

/* 1. 普通文本气泡 */
.Miu-miu.user .content {
    background: ${theme.userBg} !important;
    color: ${theme.userText} !important;
}
.Miu-miu.ai .content {
    background: ${theme.aiBg} !important;
    color: ${theme.aiText} !important;
}

/* 2. ★★★ 语音气泡 ★★★ */
/* 直接给语音气泡的容器上背景色 */
.Miu-miu.user .content.voice-bubble {
    background-color: ${theme.userBg} !important;
}
.Miu-miu.ai .content.voice-bubble {
    background-color: ${theme.aiBg} !important;
}

/* 语音气泡内部所有元素的文字/图标颜色 */
.Miu-miu.user .content.voice-bubble .voice-icon,
.Miu-miu.user .content.voice-bubble .voice-duration {
    color: ${theme.userText} !important;
}
.Miu-miu.ai .content.voice-bubble .voice-icon,
.Miu-miu.ai .content.voice-bubble .voice-duration {
    color: ${theme.aiText} !important;
}

/* 3. 小尾巴 (保持不变) */
.Miu-miu.user .content::after {
    background-color: ${theme.userBg} !important;
}
.Miu-miu.ai .content::before {
    background-color: ${theme.aiBg} !important;
}`;
    
    document.getElementById('customCssInput').value = css;
    updateBubblePreview(); 
}
function updateBubblePreview() {
    const cssCode = document.getElementById('customCssInput').value;
    
    let previewStyle = document.getElementById('preview-dynamic-style');
    if (!previewStyle) {
        previewStyle = document.createElement('style');
        previewStyle.id = 'preview-dynamic-style';
        document.head.appendChild(previewStyle);
    }
    previewStyle.innerHTML = cssCode;
}

function togglePresetManager() {
    const body = document.getElementById('presetManagerBody');
    const arrow = document.getElementById('presetArrow');
    
    if (body.style.display === 'flex') {
        body.style.display = 'none';
        arrow.classList.replace('fa-chevron-up', 'fa-chevron-down');
    } else {
        body.style.display = 'flex';
        arrow.classList.replace('fa-chevron-down', 'fa-chevron-up');
    }
}

let cssPresets = []; 
let offlineCssPresets =[];

async function loadPresetsFromDB() {
    try {
        const settings = await db.globalSettings.get('main');
        if (settings) {
            cssPresets = settings.cssPresets ||[];
            offlineCssPresets = settings.offlineCssPresets || []; // 独立加载线下预设
        } else {
            cssPresets =[];
            offlineCssPresets =[];
        }
        renderPresetDropdown();
        renderOfflinePresetDropdown(); // 渲染线下下拉框
    } catch (e) {
        console.error("加载预设失败", e);
    }
}

function renderPresetDropdown() {
    const select = document.getElementById('cssPresetDropdown');
    if(!select) return;
    select.innerHTML = '<option value="">-- 选择已保存的预设 --</option>';
    cssPresets.forEach((preset, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.innerText = preset.name;
        select.appendChild(opt);
    });
}

function loadSelectedPreset() {
    const select = document.getElementById('cssPresetDropdown');
    const index = select.value;
    if (index === "") return;
    
    const preset = cssPresets[index];
    if (preset) {
        document.getElementById('customCssInput').value = preset.code;
        updateBubblePreview(); 
    }
}

async function saveNewPreset() {
    const code = document.getElementById('customCssInput').value.trim();
    if (!code) { alert("代码为空，无法保存"); return; }
    
    const name = prompt("给这个气泡预设起个名字：");
    if (!name) return;

    cssPresets.push({ name: name, code: code });
    await savePresetsToDB();
    renderPresetDropdown();
    alert("已保存预设：" + name);
}

async function updateCurrentPreset() {
    const select = document.getElementById('cssPresetDropdown');
    const index = select.value;
    if (index === "") { alert("请先在下拉框选择一个要修改的预设"); return; }
    
    const code = document.getElementById('customCssInput').value.trim();
    if (confirm(`确定要覆盖更新预设 "${cssPresets[index].name}" 吗？`)) {
        cssPresets[index].code = code;
        await savePresetsToDB();
        alert("更新成功");
    }
}

async function deleteCurrentPreset() {
    const select = document.getElementById('cssPresetDropdown');
    const index = select.value;
    if (index === "") { alert("请先选择一个要删除的预设"); return; }

    if (confirm(`确定删除预设 "${cssPresets[index].name}" 吗？`)) {
        cssPresets.splice(index, 1);
        await savePresetsToDB();
        renderPresetDropdown();
        document.getElementById('customCssInput').value = ""; 
        updateBubblePreview();
    }
}

async function savePresetsToDB() {
    const settings = await db.globalSettings.get('main') || { id: 'main' };
    settings.cssPresets = cssPresets;
    await db.globalSettings.put(settings);
    globalData.cssPresets = cssPresets; 
}

document.addEventListener('DOMContentLoaded', () => {
    renderColorGrid();
    loadPresetsFromDB();
    const fontSlider = document.getElementById('fontSizeSlider');
    if (fontSlider) {
        // 1. 拖动时：实时改变大小 (不保存，保证流畅)
        fontSlider.addEventListener('input', (e) => {
            applyFontSize(e.target.value);
        });

        // 2. 松手时：保存数据 (存入数据库)
        fontSlider.addEventListener('change', () => {
            saveData();
        });
    }
});
// ★★★ 新增：点击头像开关立刻保存并刷新 ★★★
function toggleAvatarSwitch(el, type) {
    // 1. 切换开关视觉状态
    el.classList.toggle('checked');
    
    // 2. 获取当前聊天数据
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;
    
    // 3. 更新数据对象
    const isChecked = el.classList.contains('checked');
    if (type === 'ai') {
        chat.showAiAvatar = isChecked;
    } else if (type === 'user') {
        chat.showUserAvatar = isChecked;
    }
    
    // 4. 保存到数据库
    saveData();
    
    // 5. 立刻重新渲染聊天界面 (这样你关掉设置页时，背后已经变了)
    renderMessages(chat);
}

// 兼容旧版调用的包装函数 (供日记等模块使用)
function getWorldBookContext(chat, checkText = "") {
    const data = extractWorldBookContext(chat, checkText);
    let combined = data.topContext;
    data.depthEntries.forEach(e => combined += e.text);
    return combined;
}

// ★ 全新的核心提取器：将全局条目和深度条目分离
function extractWorldBookContext(chat, checkText = "") {
    let topContext = "";
    let depthEntries = [];

    if (!chat || !worldBooks) return { topContext, depthEntries };

    const boundList = chat.worldBooks || [];

    worldBooks.forEach(wb => {
        const isBound = boundList.some(ref => ref == wb.id || ref === wb.name) || wb.boundCharId === chat.id;

        if (isBound) {
            let isHit = false;
            if (wb.triggerType === 'always') {
                isHit = true;
            } else if (wb.triggerType === 'keyword' && wb.keywords && checkText) {
                const keys = wb.keywords.replace(/，/g, ',').split(',').map(k => k.trim()).filter(k => k);
                isHit = keys.some(key => checkText.includes(key));
            }

            if (isHit) {
                wb.entries.forEach(entry => {
                    // ★ 核心：拦截被开关关闭的条目
                    if (entry.enabled === false) return; 
                    
                    const depth = entry.depth !== undefined ? parseInt(entry.depth) : 100;
                    const text = `【设定 - ${entry.title || '无题'}】: ${entry.content}\n`;
                    
                    if (depth >= 100) {
                        topContext += text;
                    } else {
                        depthEntries.push({ depth: depth, text: text });
                    }
                });
            }
        }
    });

    return { topContext, depthEntries };
}


// =========================================
// ★★★ [优化版] 聊天生成函数 (去油腻/自然化) ★★★
// =========================================
async function generateAiReply(chat, isRegenerate = false) {
    if (!chat) return;

    // 使用中央路由分流
    const apiConfig = window.getApiCredentials('chat');
    const endpoint = apiConfig.endpoint;
    const key = apiConfig.key;
    const model = apiConfig.model;
    const temp = apiConfig.temperature;
    const maxTokens = apiConfig.maxTokens;

    if (!key) { alert("请先在 API 配置中填写 Key"); return; }

    // 2. UI 交互：修改标题为 "对方正在输入..."
    const titleEl = document.getElementById('roomTitle');
    if (titleEl && currentChatId === chat.id) {
        titleEl.innerText = "对方正在输入...";
    }

    // 1. 基础数据准备
    const validHistory = chat.messages.filter(m => !m.isLoading && !m.isHidden);
    const aiHistory = validHistory.filter(m => !m.isSelf);
    const lastAiMsg = aiHistory[aiHistory.length - 1]; // 找到 AI 说的最后一句话

    let timeGapPrompt = "";
    
    // 2. 智能时间感知（双轨对比防错乱）
    if (lastAiMsg) {
        const vtNow = window.getVirtualTimeData(chat, false);
        
        // 计算虚拟时间差 (用于剧情)
        const lastVirtualTime = lastAiMsg.virtualTimestamp || lastAiMsg.timestamp || Date.now();
        const diffMinsVirtual = Math.floor((vtNow.ms - lastVirtualTime) / (1000 * 60));
        
        // 计算真实时间差 (用于防脾气)
        const lastRealTime = lastAiMsg.timestamp || Date.now();
        const diffMinsReal = Math.floor((Date.now() - lastRealTime) / (1000 * 60));

        const currentHour = parseInt(vtNow.timeStr.split(':')[0]);

        let timePeriodDesc = "";
        if (currentHour >= 0 && currentHour < 5) timePeriodDesc = "深夜/凌晨";
        else if (currentHour >= 5 && currentHour < 9) timePeriodDesc = "刚睡醒的清晨";
        else if (currentHour >= 9 && currentHour < 12) timePeriodDesc = "上午";
        else if (currentHour >= 12 && currentHour < 14) timePeriodDesc = "中午午休时间";
        else if (currentHour >= 14 && currentHour < 18) timePeriodDesc = "下午";
        else if (currentHour >= 18 && currentHour < 23) timePeriodDesc = "晚上";
        else timePeriodDesc = "深夜";

        // --- 场景 A: 间隔极短 (< 2分钟) ---
        if (diffMinsVirtual < 2) {
            timeGapPrompt = `(当前是实时对话，用户秒回了你)`;
        }
        // --- 场景 B: 正常间隔 (< 1小时) ---
        else if (diffMinsVirtual < 60) {
            timeGapPrompt = `(距离你上次发言过去了 ${diffMinsVirtual} 分钟)`;
        }
        // --- 场景 C: 长时间间隔 (> 1小时) ---
        else {
            let timeDesc = diffMinsVirtual > 1440 ? `${(diffMinsVirtual / 1440).toFixed(1)}天` : `${(diffMinsVirtual / 60).toFixed(1)}小时`;

            // ★★★ 核心：“时间机器”判断 ★★★
            // 如果虚拟时间跨度极大（比如过了10小时），但真实时间只过了不到5分钟，说明用户拨动了时间！
            const isTimeSkip = (diffMinsVirtual > 60 && diffMinsReal < 5);
            const isMorningWakeUp = (currentHour >= 5 && currentHour <= 11) && (diffMinsVirtual > 360 && diffMinsVirtual < 840);

            if (isTimeSkip) {
                // 触发“剧情跳跃”逻辑，绝对禁止抱怨
                timeGapPrompt = `
[系统强指令：时间跳跃感知]
剧情时间已快进，距离上次对话过去了 ${timeDesc}。
【特殊情况判定】：这属于自然的剧情时间流逝（比如你们各自去忙了、或者睡了一觉到第二天），请根据【${timePeriodDesc}】的氛围自然开启新话题。
**绝对禁止**抱怨用户消失或问用户去哪了！
`;
            } else if (isMorningWakeUp) {
                timeGapPrompt = `[系统强指令：场景感知]\n距离上次对话过去了 ${timeDesc}。现在是早上，这只是正常的睡眠时间。请温和地打招呼，不要抱怨用户消失。`;
            } else {
                timeGapPrompt = `[系统强指令：用户回归]\n距离你上次发言已经过去了 ${timeDesc}。注意：是你发完消息后，用户一直没回。请根据人设做出被冷落的反应。`;
            }
        }
    } else {
        timeGapPrompt = `(这是新的对话，请主动开启话题)`;
    }

    // ============================================================
    // ★★★ 新版时间感知逻辑 END ★★★
    // ============================================================
   
    const charName = chat.name;
    const activeSystemPrompt = generateSystemPrompt(chat); 
    
    
    let systemPrompt = activeSystemPrompt + `\n\n` + getFullPersona(chat) + timeGapPrompt;
    if (typeof getCoupleStatusForAI === 'function') {
        systemPrompt += getCoupleStatusForAI(chat);
    }
    if (typeof getVirtualTimePrompt === 'function') {
        systemPrompt += getVirtualTimePrompt(chat);
    }

    // [新增] 限制生成的消息数量
    const replyMin = chat.replyMin !== undefined ? chat.replyMin : 1;
    const replyMax = chat.replyMax !== undefined ? chat.replyMax : 3;
    systemPrompt += `\n【重要：单次消息数量限制】：你当前发送的消息段落（replies 数组的长度）必须控制在 ${replyMin} 到 ${replyMax} 条之间。请根据当前的情感波动和氛围，在这个范围内选择最自然的条数。`;

    if (typeof isPlaying !== 'undefined' && isPlaying && currentMusicIndex !== -1 && musicPlaylist[currentMusicIndex]) {
        const track = musicPlaylist[currentMusicIndex];
        if (!track.isKeepAlive) {
            let lrcPrompt = "";
            let currentLine = "";
            
            // 如果存在已解析的歌词
            if (typeof currentParsedLyrics !== 'undefined' && currentParsedLyrics.length > 0) {
                // 1. 提取全部歌词 (最多截取前500字，防止Token爆炸)
                let fullLrc = currentParsedLyrics.map(l => l.text).filter(t => t).join(' / ');
                if (fullLrc.length > 500) fullLrc = fullLrc.substring(0, 500) + '...';
                
                // 2. 精准匹配当前正在播放的那一句歌词
                if (typeof audioPlayer !== 'undefined') {
                    const currentTime = audioPlayer.currentTime;
                    for (let i = 0; i < currentParsedLyrics.length; i++) {
                        if (currentTime >= currentParsedLyrics[i].time) {
                            currentLine = currentParsedLyrics[i].text;
                        } else {
                            break;
                        }
                    }
                }
                
                lrcPrompt = `\n【歌曲大意参考】：${fullLrc}`;
                if (currentLine) {
                    lrcPrompt += `\n【当前耳机里刚好唱到这句】："${currentLine}"`;
                }
            }
            
            systemPrompt += `\n【当前系统状态】：用户此时正在和你“一起听歌”，背景音乐正在播放《${track.name}》(歌手：${track.artist})。如果氛围合适，你可以自然地聊起这首歌、引用歌词，或者对当前刚好唱到的那句歌词做出反应。${lrcPrompt}`;
        }
    }

    if (typeof musicPlaylist !== 'undefined') {
        const validTracks = musicPlaylist.filter(t => !t.isKeepAlive);
        if (validTracks.length > 0) {
            // 取出列表里的歌名 (限制前30首防止字数超标)
            const playlistStr = validTracks.slice(0, 30).map(t => t.name).join('、');
            systemPrompt += `\n【当前面板的播放列表】：[${playlistStr}]。`;
        }
    }

        // 1. 世界书 (升级版：提取深度数据)
    const recentContextText = chat.messages.slice(-5).map(m => m.text).join(' ');
    const wbData = extractWorldBookContext(chat, recentContextText);
    if (wbData.topContext) {
        systemPrompt += `\n【必须遵守的世界观/背景设定】：\n${wbData.topContext}\n`;
    }


    // ★★★ 2. 朋友圈 (自然化修改 - 身份明确化) ★★★
    // 获取 AI 发的动态
    const charMoments = momentList.filter(m => m.userId === chat.id).slice(0, 3);
    if (charMoments.length > 0) {
        systemPrompt += `\n【你(Char)最近发布的朋友圈动态】:\n`;
        charMoments.forEach(m => {
            // 明确标记：这是【你】发的
            systemPrompt += `- [你自己发的]: ${m.content} (时间:${m.time})\n`;
            
            if (m.comments && m.comments.length > 0) {
                m.comments.forEach(c => {
                    // 明确标记：这是【User】的评论
                    systemPrompt += `  * [User评论]: ${c.content}\n`;
                });
            }
        });
    }

    const lastSeenTime = chat.lastSeenMomentTime || 0; // 读取上次已读时间
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000); // 24小时前

    const userMoments = momentList.filter(m => 
        m.userId === 'me' &&              // 必须是我的
        m.id > lastSeenTime &&            // 必须是新发布的（时间晚于已读时间）
        m.id > oneDayAgo                  // 必须是热乎的（24小时内）
    ).slice(0, 3);

    if (userMoments.length > 0) {
        systemPrompt += `\n【User剛剛发布的**新**朋友圈动态】(这是新消息，你还未评论过):\n`;
        userMoments.forEach(m => {
            // 这里的时间显示给AI看，不会存到界面上
            const timeDesc = typeof formatTimeAgo === 'function' ? formatTimeAgo(m.id) : '刚刚';
            systemPrompt += `- [User新动态]: ${m.content} (时间:${timeDesc})\n`;
        });
        systemPrompt += `(提示：对于新动态，如果话题相关可以顺带一提，如果无关可暂不理会)\n`;
    }
    // ★★★ 3. 日记 (自然化修改) ★★★
    if (chat.diaryEntries && chat.diaryEntries.length > 0) {
        const lastDiary = chat.diaryEntries[chat.diaryEntries.length - 1];
        systemPrompt += `\n【你内心深处的真实想法】(仅供参考你当下的潜意识)：\n- ${lastDiary.content}\n`;
    }

        // 4. 长期记忆 (线上 + 线下互通)
    if (chat.summaries && chat.summaries.length > 0) {
        systemPrompt += `\n【线上微信记忆摘要】：\n${chat.summaries.map(s => `[记录于 ${s.date}]: ${s.content}`).join('\n')}\n`;
    }

    // ★★★ 核心互通：将线下分块记忆注入给线上的微信 ★★★
    let offlineMemText = "";
    if (chat.offlineSummaries && chat.offlineSummaries.length > 0) {
        offlineMemText = chat.offlineSummaries.map((s, i) => `[线下记忆片段${i+1}]: ${s.content}`).join('\n');
    } else if (chat.offlineSummary) {
        offlineMemText = chat.offlineSummary;
    }
    if (offlineMemText) {
        systemPrompt += `\n【线下剧场/约会记忆】：\n这是你们在线下见面的回忆总结：\n${offlineMemText}\n(请在日常微信聊天中表现出你们确实经历过这些事)。\n`;
    }

    systemPrompt += `\n请沉浸在角色中回复，拒绝任何AI味，保持极度口语化。`;

    let galleryPrompt = "";
    if (chat.gallery && chat.gallery.length > 0) {
        // 取最新的 20 张照片，倒序排列
        const listStr = [...chat.gallery].reverse().slice(0, 20)
            .map(p => `ID:${p.id} | 内容:${p.description}`).join('\n');

        galleryPrompt = `
\n【相册能力 Enabled】
你可以发送相册里的照片。当你想发图时，请在回复中包含指令：[SEND_IMAGE:图片ID]
(严禁伪造ID，必须完全匹配列表)
你的可用相册(最新20张)：
${listStr}
`;
    }
    systemPrompt += galleryPrompt; 
    
    // 5. 能力注入 (完整技能包：引用/撤回/媒体/情书)
    systemPrompt += `\n\n【高级交互指令】：
    请将以下指令作为独立的字符串项放入 JSON 数组中：
    1. **引用回复** (使用频率：极低)：
       - 格式："[REPLY:对方的那句原话]"
       - 【警告】：正常聊天不要使用引用！只有需要针对对方很久之前的一句话进行反驳/澄清时才可以使用。
       - 严禁：连续多轮回复都带引用；把引用当成复读机。
       - 【绝对禁止翻译本指令】：哪怕开启了翻译模式，指令本身必须保持 "[REPLY:...]" 原文。
    
    2. **消息撤回**：
       - 格式："[WITHDRAWN:你撤回的具体内容]"
       - 场景：当你打错字、说错话、感到尴尬、或者只是改变了主意时，可以模拟这个行为，增加真实感。

        3. **拉黑用户** (极度生气/绝交时使用)：
       - 格式："[BLOCK_USER]"
       - 场景：当用户严重冒犯你，要求你拉黑他，或者你决定彻底不理用户时，请在回复的最后一句话加上此指令。系统会自动将用户关进小黑屋。
    `;

    
if (myStickers && myStickers.length > 0) {
    // ★ 增加这行：剔除被禁用的分组
    const disabledCats = chat.disabledStickerCategories ||[];
    const availableStickers = myStickers.filter(s => !disabledCats.includes(s.category));
    
    if (availableStickers.length > 0) {
        const stickerNames = availableStickers.slice(0, 50).map(s => s.name).join('、');
        
        systemPrompt += `\n【表情包能力】：
你拥有发送表情包的能力。
- 格式："[STICKER:表情名]"
- 你的表情库：[${stickerNames}]
- 规则：根据对话氛围自行判断。禁止编造表情库里没有的名字。禁止输出“发送了一个表情”这种描述性文字。
`;
    }
}

    // 【语音能力】(详细化)
    systemPrompt += `\n【语音能力】：
    - 格式："[VOICE:语音转文字的内容]"
    - 场景：当你想用声音传达情绪（如撒娇、叹气、吼叫、低语）时使用。
    - 严禁连续多轮都发语音`;

    // 【图片/生图能力】(根据开关动态分离逻辑)
    const useRealAI = globalData.naiEnabled && globalData.naiApiKey;
    if (useRealAI) {
        systemPrompt += `\n【AI生图能力】：
    - 格式："[PHOTO:画面内容的详细英文提示词]"
    - 场景：当用户明确要求你发照片，或者你想分享当前场景的画面时使用。
    - 规则：这会调用你的内部绘画引擎，因此冒号后面【必须】是详细的英文特征描述，用于辅助生成图像（例如：1girl, outdoors, sunlight, smiling, looking at viewer）。`;
    } else {
        systemPrompt += `\n【发图能力】：
    - 格式："[PHOTO:图片内容的描述]"
    - 场景：当你想分享普通的日常照片或看到的物品时使用。`;
    }

    // 【情书能力】(保留你原有的代码)
    systemPrompt += `\n【写情书/信件】：
    如果用户让你去“情侣空间”写封信，或者你想主动写一封长信存入信箱，请在回复中单独包含指令：
    [CP_LETTER:标题:正文内容]
    例如：[CP_LETTER:给最爱的你:这是我今天特别想对你说的话...]
    注意：标题不要太长，正文可以长一点。`;

systemPrompt += `\n\n【自主转账能力】：
    如果你想主动给用户转账（例如：发红包、还钱、安慰），请在回复中单独包含指令：
    [TRANSFER:金额:备注]
    例如：[TRANSFER:520:拿去买糖吃] 或 [TRANSFER:66.66:祝你顺利]
    注意：金额必须是数字。`;
// ★★★ 新增逻辑：检查待处理的转账 ★★★
    const pendingTransfers = chat.messages.filter(m => m.type === 'transfer' && m.transferBy === 'me' && m.status === 'pending');
    if (pendingTransfers.length > 0) {
        systemPrompt += `\n\n【待处理事项 - 重要】：
你收到了用户的转账，目前处于"待确认"状态，请在本次回复中决定是收下还是退还。
待处理列表：
`;
        pendingTransfers.forEach(pt => {
            systemPrompt += `- ID: ${pt.id}, 金额: ${pt.amount}, 备注: ${pt.note}\n`;
        });
        systemPrompt += `
请务必在回复文本中插入以下指令来执行操作（不要发起新转账来退款！）：
- 收下转账：[TRANSFER_OP:${pendingTransfers[0].id}:RECEIVE]
- 退还转账：[TRANSFER_OP:${pendingTransfers[0].id}:REFUND]
注意：指令ID必须与上面的ID完全一致。`;
    }
    systemPrompt += `\n【主动通话能力】：
    如果你想向用户发起实时语音通话（例如：用户让你打过来，或者情感到位了），请在回复中单独包含指令：
    [CALL:通话理由]
    例如：[CALL:我也想听你的声音] 或 [CALL:接电话]
    注意：这是一个非常亲密的行为。`;

     systemPrompt += `\n【主动视频能力】：
    如果你想发起视频通话（或者用户要求**打视频**、**看你**），请单独包含指令：
    [VIDEO_CALL:通话理由]
    注意：语音和视频是两个完全不同的指令，请根据用户意图精准选择。`;

    // ★★★ 新增：换头像能力 ★★★
    systemPrompt += `\n【更换头像能力】：
    如果用户发了一张照片（或图片）并明确要求你换头像（例如：“换上这个头像”、“把这张图设为头像”），请在回复中单独包含指令：
    [CHANGE_AVATAR]
    注意：系统会自动提取用户刚才发的图片作为你的新头像，你只需要发指令并配上一句符合人设的话即可（如：好呀，这就换上）。`;

    systemPrompt += `\n【主动点歌能力】：
    如果在聊天时你们正在谈论音乐，或者你想给她分享一首歌，请在回复中单独包含指令：
    [PLAY_MUSIC:歌曲名称]
    例如：[PLAY_MUSIC:我们俩]
    注意：系统会自动在后台搜索网易云/QQ音乐并自动播放。`;

    systemPrompt += `\n【面板切歌能力】：
    如果用户要求你切到某首歌，或者你想从【当前面板的播放列表】里挑一首歌来放，请在回复中单独包含指令：
    [SWITCH_SONG:歌曲名称]
    例如：[SWITCH_SONG:想太多]
    如果是想随便切下一首，可以使用：[SWITCH_SONG:下一首]
    注意：此指令仅限切换列表里【已有】的歌。如果想听新歌，请继续用 [PLAY_MUSIC:歌名] 去全网搜索。`;

const hasRelativeCard = chat.messages.some(m => m.type === 'relative_card');
    if (!hasRelativeCard) {
        systemPrompt += `\n【赠送亲属卡】：
        如果你想主动送给用户亲属卡（表示我想养你、我想照顾你），请在回复中单独包含指令：
        [RELATIVE_CARD:额度:备注]
        例如：[RELATIVE_CARD:5200:拿去随便花]
        注意：这是非常亲密和宠溺的行为。`;
    } 

    const TRANS_SPLIT = "@@@TRANS@@@"; 
    
    if (globalData.autoTranslateEnabled) {
        systemPrompt += `
\n【⚠️系统最高优先级指令：双语翻译协议】
用户已强制开启实时翻译模式。你必须重写 JSON 返回格式的内部逻辑，严格遵守以下协议：

1. **绑定规则 (Binding Rule)**：
   "replies" 数组中的**每一个**字符串元素，必须且只能遵循格式：
   "原文内容" + "${TRANS_SPLIT}" + "中文翻译"

2. **严格禁止 (Strictly Prohibited)**：
   - ❌ 严禁将原文和翻译拆分成两个独立的数组元素（气泡）。
   - ❌ 严禁只发原文不带翻译。
   - ❌ 严禁只发翻译不带原文。
   - ❌ 严禁改变 JSON 结构，翻译必须拼接在字符串内部。

3. **标准输出样例 (Example)**：
   ✅ 正确： "replies": ["I miss you so much.${TRANS_SPLIT}我好想你。", "Did you eat?${TRANS_SPLIT}你吃了吗？"]
   ❌ 错误： "replies": ["I miss you so much.", "我好想你。"] (这是错误的，被禁止的)
`;
    }

    // 6. 消息构建与清洗
    const limit = chat.memContextLimit || 50;
    const validMsgs = chat.messages.filter(m => !m.isLoading);
    // ★★★ 识图功能核心修改区 ★★★
    const contextMsgs = validMsgs.slice(-limit).map(m => {
        let contentToSend = m.contentDescription || m.text;
        
        // 1. 尝试提取图片链接 (匹配表情包、拍照、相册图片的 img 标签)
        const imgMatch = m.text.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
        
        // 2. ★★★ 修复：智能判断图片类型 ★★★
        const isSticker = m.text.includes('chat-sticker-img');
        const isPhotoCard = m.text.includes('photo-msg-img'); // 【新增】识别是否为“文字描述图”

        // 【核心修复】：增加 !isPhotoCard 判断
        // 意思：只有当它“不是表情包”且“不是文字描述卡片”时，才调用 Vision API 去识图
        if (m.isSelf && imgMatch && imgMatch[1] && !isSticker && !isPhotoCard) {
            const imgSrc = imgMatch[1];
            
            // 提取辅助描述文字 (如果有)
            let textDesc = "[图片]";
            if (m.contentDescription) textDesc = m.contentDescription;
            else if (m.text.includes('chat-sticker-img')) textDesc = "[表情包]";
            
            // ★★★ 新增修复点 1：Vision API 模式下也要带上引用内容 ★★★
            if (m.replyCtx) {
                textDesc = `[回复 ${m.replyCtx.name}: ${m.replyCtx.content}]\n${textDesc}`;
            }

            return {
                role: "user",
                content: [
                    { type: "text", text: textDesc }, 
                    {
                        type: "image_url",
                        image_url: {
                            url: imgSrc // 支持 URL 和 Base64
                        }
                    }
                ]
            };
        }

        // 3. 如果没有图片，或者 是AI发的消息，走原来的纯文本清洗逻辑
        if (contentToSend.includes('<div') || contentToSend.includes('<img')) {
             if (contentToSend.includes('voice-trans-result')) {
                 const t = document.createElement('div'); t.innerHTML = m.text;
                 const r = t.querySelector('.voice-trans-result');
                 contentToSend = r ? `[语音消息：${r.innerText.trim()}]` : '[语音消息]';
             }
             else if (contentToSend.includes('chat-sticker-img')) contentToSend = '[表情包]';
             else if (contentToSend.includes('photo-msg-img')) contentToSend = '[照片]';
             else if (contentToSend.includes('album-msg-img')) contentToSend = '[图片]';
             else contentToSend = '[多媒体内容]';
        }
        if (m.replyCtx) {
            contentToSend = `[回复 ${m.replyCtx.name}: ${m.replyCtx.content}]\n${contentToSend}`;
        }
        // 让 AI 知道每句话的确切发送时间
        const datePrefix = m.virtualDate ? `[${m.virtualDate} ${m.time}] ` : '';
        return { role: m.isSelf ? "user" : "assistant", content: datePrefix + contentToSend };
    });
    
        // ★★★ 核心插队算法：注入深度世界书条目 (Depth < 100) ★★★
    if (wbData.depthEntries && wbData.depthEntries.length > 0) {
        const depthGroups = {};
        wbData.depthEntries.forEach(e => {
            if (!depthGroups[e.depth]) depthGroups[e.depth] = [];
            depthGroups[e.depth].push(e.text);
        });

        // 排序：深度从大到小插入，避免索引偏移问题
        const sortedDepths = Object.keys(depthGroups).map(Number).sort((a, b) => b - a);
        
        sortedDepths.forEach(depth => {
            const combinedText = `[系统强插设定(最高优先级)]:\n` + depthGroups[depth].join('');
            // 计算插入位置：深度0就是插在最末尾，深度1就是倒数第一条之前
            const targetIndex = Math.max(0, contextMsgs.length - depth);
            contextMsgs.splice(targetIndex, 0, { role: "system", content: combinedText });
        });
    }

    const messagesPayload = [
        { role: "system", content: systemPrompt },
        ...contextMsgs
    ];


    // ★★★ 修复点：这里补上了丢失的 try {  ★★★
    try {

        // ==========================================
        // ★★★ 流式/非流式 核心请求代码 (开始) ★★★
        // ==========================================
        let rawContent = "";

        try {
            // 1. 检查开关状态
            const isStream = globalData.apiStreamEnabled === true;

            const response = await fetch(`${endpoint}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify({ 
                    model: model, 
                    messages: messagesPayload, 
                    temperature: temp,
                    max_tokens: parseInt(document.getElementById('apiMaxTokens').value) || 2048,
                    stream: isStream 
                })
            });

            if (!response.ok) {
                let errorMsg = `API Error: ${response.status}`;
                try {
                    const errData = await response.json();
                    if (errData.error?.message) errorMsg = errData.error.message;
                } catch (e) {}
                throw new Error(errorMsg);
            }

            if (isStream) {
                // === 【模式A：流式接收】 ===
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');
                    
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed === 'data: [DONE]') continue;
                        
                        if (trimmed.startsWith('data: ')) {
                            try {
                                const jsonStr = trimmed.substring(6);
                                const json = JSON.parse(jsonStr);
                                const content = json.choices?.[0]?.delta?.content || "";
                                rawContent += content;
                            } catch (e) {}
                        }
                    }
                }
            } else {
                // === 【模式B：普通接收】 ===
                const data = await response.json();
                if (data.usage && data.usage.completion_tokens === 0) {
                    throw new Error("生成失败：内容被AI模型拦截为空。");
                }
                if (!data.choices || data.choices.length === 0) {
                    throw new Error("API 返回格式异常 (无 choices)");
                }
                // 兼容性检查
                if (!data.choices[0].message) {
                     if(data.choices[0].delta) rawContent = data.choices[0].delta.content;
                     else throw new Error("API 返回结构缺失 message 字段");
                } else {
                     rawContent = data.choices[0].message.content;
                }
            }

        } catch (error) {
            throw error; // 抛出错误给外层的 catch 处理
        }

        // 检查是否拿到了内容
        if (!rawContent) throw new Error("生成内容为空 (可能是网络中断或模型未返回)");

        // ==========================================
        // ★★★ 流式/非流式 核心请求代码 (结束) ★★★
        // ==========================================

        const parsedObj = safeParseAiResponse(rawContent);

        if (parsedObj.heartVoice) {
            chat.currentHeartVoice = {
                mbti: parsedObj.heartVoice.mbti || "未知",
                quote: parsedObj.heartVoice.quote || "...",
                content: parsedObj.heartVoice.content || "...",
                mutter: parsedObj.heartVoice.mutter || "...",
                bottomText: parsedObj.heartVoice.bottomText || "..."
            };
            saveData(); 
        }

        let segments = parsedObj.replies || [];
        if (!Array.isArray(segments)) segments = [String(segments)];
        
        // ★★★ 修复1：加强扁平化处理，遇到非字符串尝试转字符串或过滤 ★★★
        segments = segments.flatMap(s => {
            if (typeof s === 'string') {
                return s.replace(/\\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l);
            }
            // 如果 AI 把对象混进来了，这里可以过滤掉或者强制转字串
            if (s === null || s === undefined) return [];
            return [String(s)];
        });

        // [新增] 强制物理截断防溢出
        if (segments.length > replyMax) {
            segments = segments.slice(0, replyMax);
        }

        if (document.getElementById('roomTitle') && currentChatId === chat.id) {
            document.getElementById('roomTitle').innerText = chat.name;
        }

        const TRANS_SPLIT = "@@@TRANS@@@"; 

        // 核心处理循环
        for (let i = 0; i < segments.length; i++) {
            // ★ 核心修复：获取当前虚拟时间快照 (false代表这是AI发的消息)
            const vt = window.getVirtualTimeData(chat, false);
            const newTimeStr = vt.timeStr;
            const newDateStr = vt.dateStr;
            const newVirtualMs = vt.ms;
            
            // ★★★ 修复2：强制转换为 String 再 trim，防止报错 ★★★
            let rawSegment = String(segments[i] || "").trim(); 
            
            // 过滤掉仅仅包含 "[object Object]" 这种无意义的转换结果
            if (!rawSegment || rawSegment === "[object Object]") continue;

            let mainText = rawSegment;
            let transText = null;

            if (rawSegment.includes(TRANS_SPLIT)) {
                const parts = rawSegment.split(TRANS_SPLIT);
                mainText = parts[0].trim();
                transText = parts[1] ? parts[1].trim() : null;
            }

            // 【新增修复】强力清洗开头可能被 AI 误带上的虚拟时间戳前缀
            const timeStampRegex = /^[\[【](?:\d{2}-\d{2}|Today)\s+\d{2}:\d{2}[\]】]\s*/i;
            mainText = mainText.replace(timeStampRegex, '');
            if (transText) {
                transText = transText.replace(timeStampRegex, '');
            }

            if (window.aiCommandProcessors) {
                for (const processor of window.aiCommandProcessors) {
                    try {
                        const res = processor(chat, mainText);
                        if (res) mainText = res;
                    } catch (e) {}
                }
            }

            // --- 正则指令解析区 ---

           let tempSentPhotoDesc = null;

            mainText = mainText.replace(/\[\s*(?:SEND_IMAGE|发图)\s*[:：]\s*(\d+)\s*\]/gi, (match, idStr) => {
                // 在 chat.gallery 里找这张图
                const photo = chat.gallery ? chat.gallery.find(p => p.id == idStr) : null;
                
                if (photo) {
                    // ★ 关键修改：记录下这张图的描述
                    tempSentPhotoDesc = photo.description || "一张照片";
                    return `<img src="${photo.url}" class="album-msg-img" data-desc="${photo.description}" onclick="showPhotoDescription(this.dataset.desc, event)">`;
                } else {
                    return ""; 
                }
            });
            
            // 1. 引用回复
            let aiReplyCtx = null;
            const replyRegex = /\[\s*(?:REPLY|回复|引用)\s*[:：]\s*([\s\S]+?)\]/i;
            const replyMatch = mainText.match(replyRegex);
            if (replyMatch) {
                let q = replyMatch[1].trim();
                if (q.startsWith('我:') || q.startsWith('我：')) q = q.slice(2).trim();
                if (q.length > 40) q = q.slice(0, 40) + '...';
                aiReplyCtx = { name: "我", content: q };
                mainText = mainText.replace(replyMatch[0], '').trim();
            }
            if (transText) transText = transText.replace(replyRegex, '').trim();

            // 2. 撤回
            let aiRecallContent = null;
            const withdrawMatch = mainText.match(/^\[\s*(?:WITHDRAWN|撤回)\s*[:：]\s*(.*?)\]$/i);
            if (withdrawMatch) { 
                aiRecallContent = withdrawMatch[1]; 
                mainText = aiRecallContent; 
            }
            
            // ★★★ 纯净版：AI 自主换头像指令 (支持 <img> 标签和纯 URL) ★★★
            const avatarChangeMatch = mainText.match(/\[\s*CHANGE_AVATAR\s*\]/i);
            if (avatarChangeMatch) {
                let targetImgSrc = null;

                // 倒序查找，找离现在最近的一张图
                for (let k = chat.messages.length - 1; k >= 0; k--) {
                    const m = chat.messages[k];
                    // 只看用户发的(isSelf)
                    if (m.isSelf) {
                        // 情况A：它是 <img src="..."> 格式的图片 (你刚才改好的 sendMsg 发出来的就是这种)
                        if (m.text.includes('<img')) {
                            const srcMatch = m.text.match(/src="([^"]+)"/);
                            if (srcMatch && srcMatch[1]) {
                                targetImgSrc = srcMatch[1];
                                break; // 找到了，停
                            }
                        }
                        // 情况B：它是一个纯文本的 URL 链接 (防止漏网之鱼)
                        else if (m.text.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
                            targetImgSrc = m.text.trim();
                            break; // 找到了，停
                        }
                    }
                }

                if (targetImgSrc) {
                    // 1. 更新后台数据
                    chat.avatar = targetImgSrc;
                    
                    // 2. 强制刷新当前界面的 UI (不用退出重进)
                    
                    // 刷新顶部标题栏头像
                    const headerAvatar = document.getElementById('roomHeaderAvatar');
                    const headerAvatar2 = document.querySelector('.room-header-avatar'); // 兼容不同写法
                    if (headerAvatar) headerAvatar.src = targetImgSrc;
                    if (headerAvatar2) headerAvatar2.src = targetImgSrc;

                    // 刷新聊天列表页头像
                    const row = document.getElementById(`chat-row-${chat.id}`);
                    if (row) {
                        const listAvatar = row.querySelector('.chat-avatar');
                        if (listAvatar) listAvatar.src = targetImgSrc;
                    }

                    // 刷新聊天记录里所有 AI 气泡的头像
                    const allAiBubbles = document.querySelectorAll('.Miu-miu.ai .avatar-img');
                    allAiBubbles.forEach(img => {
                        img.src = targetImgSrc;
                    });
                    
                    // 刷新设置页头像
                    const settingsAvatar = document.getElementById('settingsCharAvatar');
                    if (settingsAvatar) settingsAvatar.src = targetImgSrc;

                    // 3. 保存
                    saveData();
                }

                // 4. 无论成不成功，都把指令删掉，不让它显示出来
                mainText = mainText.replace(avatarChangeMatch[0], '').trim();
            }

            // 3. 转账操作
            mainText = mainText.replace(/\[TRANSFER_OP:([0-9.]+):([A-Z]+)\]/g, (match, id, action) => {
                const targetMsg = chat.messages.find(m => m.id == id);
                if (targetMsg && targetMsg.status === 'pending') {
                    targetMsg.status = (action === 'RECEIVE') ? 'received' : 'refunded';
                    updateChatLastMsg(chat);
                }
                return '';
            });

            // 4. 主动转账
            const transferMatch = mainText.match(/\[\s*(?:TRANSFER|转账)\s*[:：]\s*([0-9.]+)\s*[:：]\s*(.*?)\]/i);
            if (transferMatch) {
                const amount = transferMatch[1];
                const note = transferMatch[2];
                chat.messages.push({
                    id: Date.now() + Math.random(),
                    type: 'transfer', isSelf: false, time: newTimeStr, timestamp: Date.now(),
                    amount: parseFloat(amount).toFixed(2), note: note, status: 'pending', transferBy: 'ai',
                    text: `[转账] ¥${amount}`, contentDescription: `[发起转账 ¥${amount}]`
                });
                mainText = mainText.replace(transferMatch[0], '').trim();
                if (!mainText) { updateChatLastMsg(chat); renderMessages(chat); continue; }
            }

            // 5. 亲属卡
            const rcMatch = mainText.match(/\[\s*RELATIVE_CARD\s*[:：]\s*([0-9.]+)\s*[:：]\s*(.*?)\]/i);
            if (rcMatch) {
                const amount = rcMatch[1];
                const note = rcMatch[2];
                chat.messages.push({
                    id: Date.now() + Math.random(),
                    type: 'relative_card', isSelf: false, time: newTimeStr, timestamp: Date.now(),
                    amount: parseFloat(amount).toFixed(2), note: note, status: 'pending', transferBy: 'ai',
                    text: `[亲属卡] 额度 ¥${amount}`, contentDescription: `[赠送亲属卡 ¥${amount}]`
                });
                mainText = mainText.replace(rcMatch[0], '').trim();
                if (!mainText) { updateChatLastMsg(chat); renderMessages(chat); continue; }
            }

            // ★ AI 自主点歌指令
            const musicPlayMatch = mainText.match(/\[\s*(?:PLAY_MUSIC|播放音乐|点歌)\s*[:：]\s*(.*?)\]/i);
            if (musicPlayMatch) {
                const searchKeyword = musicPlayMatch[1].trim();
                
                // 先告诉系统 AI 打算点什么歌 (引用对象方便后续修改)
                const sysMusicNotice = {
                    id: Date.now() + Math.random(),
                    text: `[系统提示] ${chat.name} 试图为你点播《${searchKeyword}》...`,
                    isSelf: false,
                    time: newTimeStr,
                    timestamp: Date.now(),
                    isHidden: true
                };
                chat.messages.push(sysMusicNotice);
                
                // 触发无声搜索并播放
                setTimeout(async () => {
                    try {
                        const list = await searchMetingCore('https://api.i-meto.com/meting/api', searchKeyword);
                        if (list && list.length > 0) {
                            const song = list[0]; 
                            const newTrack = {
                                id: Date.now(),
                                name: song.name,
                                artist: song.artist,
                                url: song.url,
                                cover: song.pic,
                                lrc: song.lrc
                            };
                            musicPlaylist.push(newTrack);
                            saveMusicPlaylist();
                            renderPlaylist();
                            playTrack(musicPlaylist.length - 1);
                            
                            // ★★★ 核心新增：让 AI 知道具体搜到了什么歌，丰富它的记忆 ★★★
                            sysMusicNotice.text = `[系统提示] ${chat.name} 为你点播了《${song.name}》 (歌手：${song.artist})。音乐正在后台播放中。`;
                            saveData(); // 保存修改后的记忆
                        } else {
                            sysMusicNotice.text = `[系统提示] ${chat.name} 试图点歌，但未搜索到结果。`;
                            saveData();
                        }
                    } catch(e) {
                        console.error("AI 搜歌失败", e);
                    }
                }, 1000);
                
                mainText = mainText.replace(musicPlayMatch[0], '').trim();
                if (!mainText) continue;
            }

             const switchSongMatch = mainText.match(/\[\s*(?:SWITCH_SONG|切歌|切换歌曲)\s*[:：]?\s*(.*?)\s*\]/i);
            if (switchSongMatch) {
                const targetName = switchSongMatch[1] ? switchSongMatch[1].trim() : "";
                
                setTimeout(() => {
                    const searchName = targetName.toLowerCase();
                    // 1. 如果 AI 指定了具体的歌名
                    if (searchName && searchName !== "下一首" && searchName !== "随便") {
                        // 在本地播放列表中模糊查找
                        const targetIndex = musicPlaylist.findIndex(t => 
                            !t.isKeepAlive && 
                            (t.name.toLowerCase().includes(searchName) || (t.artist && t.artist.toLowerCase().includes(searchName)))
                        );
                        
                        if (targetIndex !== -1) {
                            // 找到了，直接切到这首歌
                            if (typeof playTrack === 'function') playTrack(targetIndex);
                            chat.messages.push({
                                id: Date.now() + Math.random(), text: `[系统提示] 你已成功将面板切换到了《${musicPlaylist[targetIndex].name}》。`, isSelf: false, time: newTimeStr, timestamp: Date.now(), isHidden: true
                            });
                        } else {
                            // 没找到，反馈给 AI
                            chat.messages.push({
                                id: Date.now() + Math.random(), text: `[系统提示] 切换失败，面板列表中没有找到与“${targetName}”相关的歌曲。`, isSelf: false, time: newTimeStr, timestamp: Date.now(), isHidden: true
                            });
                        }
                    } else {
                        // 2. 如果 AI 没有指定名字，或者是“下一首”，就执行普通切歌
                        if (typeof nextTrack === 'function') nextTrack();
                        chat.messages.push({
                            id: Date.now() + Math.random(), text: `[系统提示] 你已切换到下一首歌。`, isSelf: false, time: newTimeStr, timestamp: Date.now(), isHidden: true
                        });
                    }
                    saveData(); // 保存隐藏记忆
                }, 800);

                // 把指令从文字里删掉，不让用户看到代码
                mainText = mainText.replace(switchSongMatch[0], '').trim();
                if (!mainText) continue;
            }

            // 6. 主动通话
            const callMatch = mainText.match(/\[\s*(?:CALL|通话)\s*[:：]\s*(.*?)\]/i);
            if (callMatch) {
                const reason = callMatch[1] || "想听听你的声音";
                setTimeout(() => { if (typeof showIncomingCallModal === 'function') showIncomingCallModal(chat, reason); }, 800);
                mainText = mainText.replace(callMatch[0], '').trim();
                if (!mainText) continue;
            }

            const videoCallMatch = mainText.match(/\[\s*(?:VIDEO_CALL|视频|视频通话)\s*[:：]\s*(.*?)\]/i);
            if (videoCallMatch) {
                const reason = videoCallMatch[1] || "想看看你";
                // ★ 关键：这里传入 'video' 参数
                setTimeout(() => { 
                    if (typeof showIncomingCallModal === 'function') showIncomingCallModal(chat, reason, 'video'); 
                }, 800);
                
                mainText = mainText.replace(videoCallMatch[0], '').trim();
                if (!mainText) continue; // 如果只发了指令没发字，就跳过气泡显示
            }

            // =====================================
            // ★ 分离版 [PHOTO:描述] 解析逻辑 ★
            // =====================================
            const useRealAI = globalData.naiEnabled && globalData.naiApiKey;

            if (!useRealAI) {
                // 【模式 A：关闭了生图】 -> 全部解析为固定假照片
                mainText = mainText.replace(/\[\s*(?:PHOTO|图片|照片|发图|生图|DRAW)\s*[:：]\s*(.*?)\]/gi, (match, desc) => {
                    const photoDesc = (desc || "图片").trim();
                    const fakeImgUrl = "https://img.heliar.top/file/1767108859529_IMG_9793.jpeg"; 
                    return `<img src="${fakeImgUrl}" class="photo-msg-img" data-desc="${photoDesc}" onclick="showPhotoDescription(this.dataset.desc, event)">`;
                });
            } else {
                // 【模式 B：开启了生图】 -> 触发真实绘画引擎
                const photoRegex = /\[\s*(?:PHOTO|图片|照片|发图|生图|DRAW)\s*[:：]\s*(.*?)\]/gi;
                const matches = [...mainText.matchAll(photoRegex)]; 
                
                if (matches.length > 0) {
                    const titleEl = document.getElementById('roomTitle');
                    if (titleEl && currentChatId === chat.id) {
                        titleEl.innerText = "对方正在画图...";
                    }

                    const sizeParts = (globalData.naiSize || "1024x1024").split('x');
                    const confW = sizeParts[0];
                    const confH = sizeParts[1];

                    for (const m of matches) {
                        const matchStr = m[0];
                        const photoDesc = (m[1] || "图片").trim();
                        
                        // 阻塞等待，底层会自动拼接 角色提示词+全局正面词
                        const imgUrl = await fetchNovelAIImage(chat, photoDesc);
                        
                        const imgTag = `<img src="${imgUrl}" class="photo-msg-img" data-desc="${photoDesc}" style="width: 220px; height: auto !important; border-radius: 12px; display: block; object-fit: contain;" onclick="showPhotoDescription(this.dataset.desc, event)">`;
                        mainText = mainText.replace(matchStr, imgTag);
                    }
                    
                    if (titleEl && currentChatId === chat.id) {
                        titleEl.innerText = chat.name;
                    }
                }
            }

            // 8. 发送语音 (VOICE) - [修复版 v2.0]
            const voiceMatch = mainText.match(/\[\s*(?:VOICE|语音)\s*[:：]\s*(.*?)\]/i);
            if (voiceMatch) {
                let voiceContent = voiceMatch[1].trim();
                let vDuration = Math.min(60, Math.max(1, Math.ceil(voiceContent.length / 3)));
                
                let audioUrl = null;
                // 注意：TTS 请求会阻塞一点时间，这是正常的，如果不想阻塞需要改写成异步加载
                if (chat.minimaxVoiceId) {
                    audioUrl = await fetchMiniMaxTTS(voiceContent, chat.minimaxVoiceId);
                }
                
                const audioAttr = audioUrl ? `data-audio="${audioUrl}"` : "";
                const visualClass = audioUrl ? "has-audio" : "";
                
                // ★★★ 核心修复：正确提取 [语音:翻译内容] 里面的文字 ★★★
                let finalTransHtml = "";
                
                if (transText) {
                    let cleanTrans = "";
                    
                    // 1. 尝试匹配被中括号包裹的翻译：[语音:你好] -> 提取 "你好"
                    const tagMatch = transText.match(/\[\s*(?:VOICE|语音|AUDIO)\s*[:：]?\s*(.*?)\]/i);
                    
                    if (tagMatch && tagMatch[1]) {
                        // 如果找到了 [语音:xxx]，取里面的 xxx
                        cleanTrans = tagMatch[1].trim();
                    } else {
                        // 2. 如果没有方括号（或者是纯文本翻译），直接使用原文本
                        // 顺便清洗一下可能存在的冗余标签
                        cleanTrans = transText.replace(/\[\s*(?:VOICE|语音).*?\]/i, '').trim(); 
                    }

                    if (cleanTrans) {
                        finalTransHtml = `<div class="msg-trans-line"></div><div class="msg-trans-text">${cleanTrans}</div>`;
                    }
                    // 重要：清空 transText，防止后面把它当普通消息发出来
                    transText = null; 
                } 
                // 3. 备用逻辑：检查原文内部有没有 :: 分隔符
                else if (voiceContent.includes("::")) {
                     const parts = voiceContent.split("::");
                     voiceContent = parts[0]; 
                     finalTransHtml = `<div class="msg-trans-line"></div><div class="msg-trans-text">${parts[1]}</div>`;
                }

                const replacement = `
                    <div class="voice-inner-container ${visualClass}" ${audioAttr} onclick="toggleVoiceText(this, event)">
                        <div class="voice-main-row">
                            <div class="voice-animate-icon"><div class="voice-line"></div><div class="voice-line"></div><div class="voice-line"></div><div class="voice-line"></div></div>
                            <span class="voice-duration">${vDuration}"</span>
                        </div>
                        <div class="voice-trans-result">${voiceContent}${finalTransHtml}</div>
                    </div>`;
                
                mainText = mainText.replace(voiceMatch[0], replacement);
            }

            
mainText = mainText.replace(/\[\s*(?:STICKER|表情)\s*[:：]\s*(.*?)\]/gi, (match, name) => {
    const sName = name.trim();
    
    // ★ 获取当前可用的表情包
    const disabledCats = chat.disabledStickerCategories ||[];
    const availableStickers = myStickers.filter(s => !disabledCats.includes(s.category));

    let sticker = availableStickers.find(s => s.name === sName) || availableStickers.find(s => s.name.includes(sName));
    
    if (sticker) return `<img src="${sticker.src}" class="chat-sticker-img">`;
    
    // 如果名字没找到，随机从“可用”的表情里发一个
    if (availableStickers.length > 0) return `<img src="${availableStickers[Math.floor(Math.random() * availableStickers.length)].src}" class="chat-sticker-img">`;
    
    return `<span style="color:#aaa;font-size:12px;">[${sName}]</span>`;
});
const blockMatch = mainText.match(/\[\s*BLOCK_USER\s*\]/i);
            if (blockMatch) {
                // 将拉黑状态设为 true
                chat.isUserBlocked = true;
                // 把指令从文字里删掉，不让用户看到代码
                mainText = mainText.replace(blockMatch[0], '').trim();
                
                // 自动同步修改设置页那边的拉黑按钮状态（如果你正好开着设置页）
                const blockBtn = document.getElementById('beBlockedBtn');
                if (blockBtn) {
                    blockBtn.innerText = "已模拟被拉黑 (点击解除)";
                    blockBtn.style.background = "#FF9500";
                    blockBtn.style.borderColor = "#FF9500";
                }
            }
            // --- 列表预览描述 ---
            let desc = null;
            if (mainText.includes('voice-inner-container')) desc = "[语音]";
            else if (mainText.includes('chat-sticker-img')) desc = "[表情]";
            else if (mainText.includes('album-msg-img')) {
                if (tempSentPhotoDesc) {
                    desc = `[发送了图片：${tempSentPhotoDesc}]`;
                } else {
                    desc = "[图片]";
                }
            }
            else if (mainText.includes('photo-msg-img')) desc = "[照片]";

            // --- 拼接普通文本的翻译 ---
            const isRich = mainText.includes('<img') || mainText.includes('voice-inner-container');
            if (transText && !isRich) {
                mainText += `<div class="msg-trans-line"></div><div class="msg-trans-text">${transText}</div>`;
            }

            // --- 模拟延迟与保存 ---
            let charDelay = mainText.length * 10; 
            if (charDelay > 1500) charDelay = 1500; 
            const delay = 300 + charDelay; 
            if (i > 0) await new Promise(r => setTimeout(r, delay));
            else await new Promise(r => setTimeout(r, 200)); 
            // 过滤空气泡
            if (!mainText || /^[\]\}\)\.。\s]+$/.test(mainText)) {
               if (!aiReplyCtx && !aiRecallContent) continue;
            }

            // ★ 核心修复：将虚拟日期和毫秒数一并保存
            let msgData = { 
                text: mainText, 
                isSelf: false, 
                time: newTimeStr, 
                virtualDate: newDateStr,         // 新增：保存固化日期
                virtualTimestamp: newVirtualMs,  // 新增：保存虚拟毫秒
                timestamp: Date.now(), 
                contentDescription: desc 
            };
            if (aiRecallContent) { msgData.isRecalled = true; msgData.recalledText = mainText; }
            if (aiReplyCtx) msgData.replyCtx = aiReplyCtx;

            chat.messages.push(msgData);
            tryTriggerBackgroundNotify(chat, mainText); 
            
            updateChatLastMsg(chat);
            chat.time = newTimeStr;
            if (!chat.isPinned) { chatList = chatList.filter(c => c.id !== chat.id); chatList.unshift(chat); }
            
            if (currentChatId === chat.id) {
                renderMessages(chat);
                const container = document.getElementById('roomMessages');
                if(container) container.scrollTop = container.scrollHeight;
            } else {
                if (i === 0) showNotification(chat, mainText);
            }
        }
        chat.lastSeenMomentTime = Date.now(); 
        saveData();

    } catch (error) { 
        console.error(error);
        
        const titleEl = document.getElementById('roomTitle');
        if (titleEl && currentChatId === chat.id) {
            titleEl.innerText = chat.name;
        }
        
        const errTime = new Date();
        const errTimeStr = `${String(errTime.getHours()).padStart(2,'0')}:${String(errTime.getMinutes()).padStart(2,'0')}`;
        
        const errorMsg = {
            text: `Error: ${error.message}`,
            isSelf: false,
            time: errTimeStr,
            timestamp: Date.now(),
            contentDescription: '[生成失败]'
        };
        
        chat.messages.push(errorMsg);
        updateChatLastMsg(chat);
        saveData();
        
        if (currentChatId === chat.id) {
            renderMessages(chat);
            const msgContainer = document.getElementById('roomMessages');
            if(msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
        }
    }
} 


function toggleChatTools(e) {
    if (e) e.stopPropagation();
    uploadContext = null;

    const footer = document.getElementById('newRoomFooter');
    const panel = document.getElementById('chatToolsPanel');
    const msgInput = document.getElementById('msgInput');
    
    if (!panel || !footer) return;
    
    const isActive = panel.classList.contains('active');
    
    if (isActive) {
        // --- 关闭 ---
        footer.classList.remove('tools-active');
        panel.classList.remove('active');
        
        setTimeout(() => {
            const mainMenu = document.getElementById('toolsMainMenu');
            const subView = document.getElementById('stickerSubView');
            const addView = document.getElementById('addStickerView');
            const panel = document.getElementById('chatToolsPanel');
            
            if(mainMenu) mainMenu.style.display = 'flex';
            
            // ★★★ 修复：不仅移除 active，还要强制隐藏 display ★★★
            if(subView) {
                subView.classList.remove('active');
                subView.style.display = 'none'; 
            }
            
            if(addView) addView.style.display = 'none';
            if(panel) panel.classList.remove('sticker-mode');
        }, 300);

    } else {
        // --- 打开 ---
        footer.classList.add('tools-active');
        panel.classList.add('active');
        
        if(msgInput) msgInput.blur();
    }
}

// 2. 点击消息区域自动关闭菜单
document.getElementById('roomMessages').addEventListener('click', () => {
    const panel = document.getElementById('chatToolsPanel');
    if (panel && panel.classList.contains('active')) {
        toggleChatTools(); // 关闭
    }
});

function openStickerView() {
    const mainMenu = document.getElementById('toolsMainMenu');
    const subView = document.getElementById('stickerSubView');
    const panel = document.getElementById('chatToolsPanel');

    // 强制隐藏主菜单 (防止它留在底部遮挡)
    if (mainMenu) mainMenu.style.setProperty('display', 'none', 'important');

    // 强制显示表情面板 (覆盖 HTML 里的 style="display:none")
    if (subView) {
        subView.style.display = 'flex'; 
        // 稍微延时加 active 类，确保过渡动画生效
        setTimeout(() => subView.classList.add('active'), 10);
    }
    
    // 给面板加上 sticker-mode 类，确保高度和样式正确
    if (panel) panel.classList.add('sticker-mode');
}

// 2. 返回主菜单
function backToToolsMenu() {
    const mainMenu = document.getElementById('toolsMainMenu');
    const subView = document.getElementById('stickerSubView');
    const panel = document.getElementById('chatToolsPanel');

    // 隐藏表情面板
    if (subView) {
        subView.classList.remove('active');
        subView.style.display = 'none'; // 关键：手动隐藏回去
    }

    // 恢复显示主菜单
    if (mainMenu) mainMenu.style.display = 'flex';
    
    // 移除特殊模式类
    if (panel) panel.classList.remove('sticker-mode');
}

// 5. 发送表情
function sendSticker(src) {
    if (!currentChatId) return;
    const chat = chatList.find(c => c.id === currentChatId);
    if (chat) {
        const vt = window.getVirtualTimeData(chat, true);
        
        chat.messages.push({ 
            text: `<img src="${src}" class="chat-sticker-img">`, 
            isSelf: true, 
            time: vt.timeStr,
            virtualDate: vt.dateStr,
            virtualTimestamp: vt.ms,
            timestamp: Date.now()
        });
        
        chat.msg = '[表情]';
        chat.time = vt.timeStr;
        
        if (!chat.isPinned) {
            chatList = chatList.filter(c => c.id !== currentChatId);
            chatList.unshift(chat);
        }
        
        saveData();
        renderMessages(chat);
        
        // 发送后关闭菜单 (如果你想连续发，可以删掉这一行)
        toggleChatTools();
    }
}

// 1. 打开新版语音弹窗
function startVoiceSimulation() {
    // 关闭底部工具栏，防止遮挡
    toggleChatTools();
    
    const overlay = document.getElementById('voice-overlay');
    const textarea = document.getElementById('voice-text-area');
    
    // 清空上次的内容
    if (textarea) textarea.value = '';
    
    // 显示弹窗
    if (overlay) overlay.classList.add('show');
}

// 2. 关闭新版语音弹窗
function closeVoicePopup() {
    const overlay = document.getElementById('voice-overlay');
    if (overlay) overlay.classList.remove('show');
}

// 3. 发送语音逻辑
function sendVoicePopup() {
    const text = document.getElementById('voice-text-area').value.trim();
    
    // 如果没字或者没聊天对象，直接关掉
    if (!text || !currentChatId) {
        closeVoicePopup();
        return;
    }

    const chat = chatList.find(c => c.id === currentChatId);
            if (chat) {
                const vt = window.getVirtualTimeData(chat, true);
                
                // 计算时长显示
                const duration = Math.min(60, Math.max(1, Math.ceil(text.length / 3)));

                // ★★★ 替换整个 voiceHtml 变量的定义 ★★★
        const voiceHtml = `
            <div class="voice-inner-container" onclick="toggleVoiceText(this, event)">
                <div class="voice-main-row">
                    <div class="voice-animate-icon">
                        <div class="voice-line"></div>
                        <div class="voice-line"></div>
                        <div class="voice-line"></div>
                        <div class="voice-line"></div>
                    </div>
                    <span class="voice-duration">${duration}"</span>
                </div>
                <div class="voice-trans-result">${text}</div>
            </div>
        `;


                chat.messages.push({
                    text: voiceHtml,
                    isSelf: true,
                    time: vt.timeStr,
                    virtualDate: vt.dateStr,
                    virtualTimestamp: vt.ms,
                    timestamp: Date.now(),
                    contentDescription: `[语音消息：${text}]`
                });

                chat.msg = '[语音]';
                chat.time = vt.timeStr;

        saveData();
        renderMessages(chat);
        closeVoicePopup();
    }
}

function updateChatLastMsg(chat) {
    if (!chat || !chat.messages) return;
    const lastMsg = chat.messages[chat.messages.length - 1];
    
    // 如果没有消息，清空预览
    if (!lastMsg) {
        chat.msg = '';
        chat.time = '';
        return;
    }
    
    // 更新时间
    chat.time = lastMsg.time;

    // --- 1. 处理撤回消息 ---
    if (lastMsg.isRecalled) {
        if (lastMsg.isSelf) {
            chat.msg = "你撤回了一条消息";
        } else {
            chat.msg = `"${chat.name}"撤回了一条消息`;
        }
        return;
    }

    if (lastMsg.contentDescription) {
        chat.msg = lastMsg.contentDescription;
        return;
    }

    // --- 3. 处理特殊的 HTML 消息类型 ---
    if (lastMsg.text.includes('voice-inner-container')) { 
        chat.msg = '[语音]';
    } else if (lastMsg.text.includes('chat-sticker-img')) {
        chat.msg = '[动画表情]';
    } else if (lastMsg.text.includes('<img')) {
        chat.msg = '[图片]';
    } else if (lastMsg.text.includes('transfer-card')) {
        chat.msg = '[转账]';
    } else {
        let cleanText = lastMsg.text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '');
        chat.msg = cleanText;
    }
}

function toggleVoiceText(el, e) {
    if (e) e.stopPropagation(); 

    // 1. 获取音频链接
    const audioSrc = el.getAttribute('data-audio');
    
    // 2. 如果有音频，播放音频
    if (audioSrc) {
        const audio = new Audio(audioSrc);
        audio.play();
    }

    // 3. 切换显示/隐藏文字 (作为字幕)
    const resultBox = el.querySelector('.voice-trans-result');
    if (resultBox) {
        resultBox.classList.toggle('show');
    }
}

 // ★★★ 新增：清除聊天页壁纸 ★★★
            function clearChatRoomWallpaper() {
                const room = document.getElementById('chatRoom');
                room.style.backgroundImage = ''; 
                room.style.backgroundSize = '';
                openBeautifyPage(); 
                saveData();
            }
            /* ========================================= */
// =========================================
// ★★★ 音乐播放器初始化 (增强版) ★★★
// =========================================

// 初始化播放列表和变量
let musicPlaylist = [];
let tempMusicBlob = null;
let tempMusicUrl = null;
let currentMusicIndex = -1;
let isPlaying = false;

// 1. 创建播放器实例并配置
const audioPlayer = new Audio();
audioPlayer.crossOrigin = "anonymous"; // ★ 关键1：允许跨域请求（解决部分 CROS 问题）
audioPlayer.preload = "auto";          // ★ 关键2：强制预加载，提高流畅度

// 增强版进度更新：同步灵动岛和一起听 UI
audioPlayer.ontimeupdate = () => {
    if (!audioPlayer.duration) return;
    const current = audioPlayer.currentTime;
    const duration = audioPlayer.duration;
    const progress = (current / duration) * 100;
    
    // 更新旧版
    const fill = document.getElementById('progress-fill');
    const dot = document.getElementById('progress-dot');
    if (fill) fill.style.width = progress + '%';
    if (dot) dot.style.left = progress + '%';
    
    // 更新一起听 UI
    const ltFill = document.getElementById('lt-progress-fill');
    const ltCur = document.getElementById('lt-time-current');
    const ltTot = document.getElementById('lt-time-total');
    
    if (ltFill) ltFill.style.width = progress + '%';
    
    // 格式化时间
    const formatTime = (secs) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };
    if (ltCur) ltCur.innerText = formatTime(current);
    if (ltTot) ltTot.innerText = "-" + formatTime(duration - current);
};

audioPlayer.onplaying = () => {
    console.log("音频开始播放");
    const root = document.getElementById('play-btn-root');
    const ltCard = document.getElementById('listen-together-inline-card'); // ★ 修改这里
    const floatingCd = document.getElementById('floating-cd'); 
    
    if(root) { root.classList.remove('loading'); root.classList.add('playing'); }
    if(ltCard) ltCard.classList.add('playing'); // ★ 修改这里
    if(floatingCd) floatingCd.classList.add('playing'); 
    
    document.getElementById('lt-play-icon').style.display = 'none';
    document.getElementById('lt-pause-icon').style.display = 'block';
    isPlaying = true;

    // 启动时长记录器 (每分钟+1)
    if (listenTimer) clearInterval(listenTimer);
    listenTimer = setInterval(() => {
        listenTotalMinutes++;
        updateListenTimeUI();
        if (currentChatId) {
            const chat = chatList.find(c => c.id === currentChatId);
            if (chat) { chat.listenTime = listenTotalMinutes; saveData(); }
        }
    }, 60000);

    // ★★★ 呼唤系统原生灵动岛与锁屏控制 ★★★
    if ('mediaSession' in navigator && musicPlaylist[currentMusicIndex]) {
        const track = musicPlaylist[currentMusicIndex];
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.name,
            artist: track.artist,
            // 如果有封面用封面，没有用兜底图
            artwork: [
                { src: track.cover || 'https://placehold.co/512x512/000/fff?text=Music', sizes: '512x512', type: 'image/png' }
            ]
        });
        
        // 绑定手机系统的上一首/下一首按钮
        navigator.mediaSession.setActionHandler('play', () => togglePlayback());
        navigator.mediaSession.setActionHandler('pause', () => togglePlayback());
        navigator.mediaSession.setActionHandler('previoustrack', () => nextTrack(-1)); // 你的代码如果原名叫 prevTrack 可以改成对应名字
        navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack(1));
    }
};

audioPlayer.onpause = () => {
    const root = document.getElementById('play-btn-root');
    const ltCard = document.getElementById('listen-together-inline-card'); // ★ 修改这里
    const floatingCd = document.getElementById('floating-cd'); 
    
    if(root) root.classList.remove('playing');
    if(ltCard) ltCard.classList.remove('playing'); // ★ 修改这里
    if(floatingCd) floatingCd.classList.remove('playing'); 
    
    document.getElementById('lt-play-icon').style.display = 'block';
    document.getElementById('lt-pause-icon').style.display = 'none';
    isPlaying = false;
    
    if (listenTimer) clearInterval(listenTimer);
};

// 3. 自动切歌监听 (保持原样)
audioPlayer.onended = () => {
    console.log("当前歌曲播放结束，自动下一首");
    nextTrack();
};

// 4. ★★★ 新增：错误监听 (告诉你是链接挂了还是网断了) ★★★
audioPlayer.onerror = function() {
    const error = audioPlayer.error;
    let errMsg = "未知错误";
    
    if (error) {
        switch (error.code) {
            case 1: errMsg = "播放被终止"; break;
            case 2: errMsg = "网络错误 (下载失败)"; break;
            case 3: errMsg = "解码失败 (格式不支持)"; break;
            case 4: errMsg = "资源无法访问 (链接失效/防盗链/404)"; break;
        }
    }
    
    console.error(`播放出错: [${errMsg}]`, audioPlayer.src);
    
    // 遇到错误自动切下一首，防止播放器卡死
    if (musicPlaylist.length > 1) {
        console.log("尝试跳过错误歌曲，播放下一首...");
        setTimeout(() => nextTrack(), 1000); 
    } else {
        // 只有一首歌还错了，就重置状态
        isPlaying = false;
        const root = document.getElementById('play-btn-root');
        if(root) root.classList.remove('playing');
        if(root) root.classList.remove('loading');
    }
};

// 5. ★★★ 新增：卡顿/缓冲监听 (解决“播放一半停住”时的状态显示) ★★★
audioPlayer.onwaiting = () => {
    console.log("音频正在缓冲/加载中...");
    const root = document.getElementById('play-btn-root');
    // 给播放按钮加个 loading 样式（比如转圈圈）
    if(root) root.classList.add('loading'); 
}

/* ========================================= */
/* ★★★ 一起听 & 原生灵动岛核心引擎 ★★★ */
/* ========================================= */
let listenTimer = null;
let listenTotalMinutes = 0; // 记录总听歌时长

function openListenTogether(forceOpen = false) {
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) {
        alert("请先进入某个角色的聊天室，再打开一起听哦~");
        return;
    }
    
    const globalMeAvatar = document.getElementById('meAvatarImg').src;
    const myAvatar = chat.userAvatar || globalMeAvatar;
    document.getElementById('lt-my-avatar').src = myAvatar;
    document.getElementById('lt-char-avatar').src = chat.avatar;
    
    // 还原听歌时长
    listenTotalMinutes = chat.listenTime || 0;
    updateListenTimeUI();

    // ★ 控制内嵌卡片的显隐 (直接在当前页面拉开)
    const card = document.getElementById('listen-together-inline-card');
    
    if (forceOpen === true) {
        card.style.display = 'flex';
    } else {
        card.style.display = (card.style.display === 'flex') ? 'none' : 'flex';
    }
    
    // 同步波形跳动状态
    if (isPlaying) card.classList.add('playing');
}

function closeListenTogether() {
    document.getElementById('listen-together-inline-card').style.display = 'none';
}

// 2. 计时器更新
function updateListenTimeUI() {
    const hours = Math.floor(listenTotalMinutes / 60);
    const mins = listenTotalMinutes % 60;
    document.getElementById('lt-hours').innerText = hours;
    document.getElementById('lt-mins').innerText = mins;
}

// 3. 劫持原始的播放器：当你点击悬浮播放器时，如果是聊天室状态，则打开"一起听"
document.addEventListener('DOMContentLoaded', () => {
    // 找到原版我的页面那个播放器点击区域
    const playerInfo = document.querySelector('.player-info');
    if(playerInfo) {
        // 覆盖原有的 toggleMusicPanel
        playerInfo.onclick = (e) => {
            e.stopPropagation();
            if (currentChatId) {
                openListenTogether(); // 在聊天室里，打开一起听
            } else {
                toggleMusicPanel(true); // 在外面，打开普通的播放列表
            }
        };
    }
});

// 4. 进度条拖拽控制
function seekListenTogether(e) {
    const bar = document.getElementById('lt-progress-bar');
    if(!bar || !audioPlayer.duration) return;
    const rect = bar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioPlayer.currentTime = percent * audioPlayer.duration;
}

// 5. 循环模式切换
let loopMode = 'all'; // 'all' 或 'one'
function toggleLoopMode() {
    const btn = document.getElementById('lt-loop-btn');
    if (loopMode === 'all') {
        loopMode = 'one';
        audioPlayer.loop = true;
        btn.classList.replace('fa-retweet', 'fa-redo'); // 换个图标表示单曲循环
    } else {
        loopMode = 'all';
        audioPlayer.loop = false;
        btn.classList.replace('fa-redo', 'fa-retweet');
    }
}

// 2. 播放/暂停切换
function togglePlayback() {
    // 如果还没播放过且列表有歌，播放第一首
    if (currentMusicIndex === -1 && musicPlaylist.length > 0) { 
        playTrack(0); 
        return; 
    }
    if (currentMusicIndex === -1) return;
    
    const root = document.getElementById('play-btn-root');
    if (audioPlayer.paused) { 
        audioPlayer.play(); 
        if(root) root.classList.add('playing'); 
        isPlaying = true;
    } else { 
        audioPlayer.pause(); 
        if(root) root.classList.remove('playing'); 
        isPlaying = false;
    }
}

function playTrack(index) {
    if (index < 0 || index >= musicPlaylist.length) return;
    
    // 如果正在播放，先暂停并重置
    audioPlayer.pause();
    audioPlayer.currentTime = 0;

    currentMusicIndex = index;
    const track = musicPlaylist[index];
    
    // 更新 UI 文字
    const songNameEl = document.getElementById('main-song-name');
    if(songNameEl) songNameEl.innerText = track.name;
    
    // 追加更新一起听 UI
    const ltSong = document.getElementById('lt-song-name');
    const ltArt = document.getElementById('lt-artist');
    if(ltSong) ltSong.innerText = track.name;
    if(ltArt) ltArt.innerText = track.artist || "未知歌手";

    // ★★★ 新增：更新悬浮 CD 的封面，并让它显示出来 ★★★
    const floatingCd = document.getElementById('floating-cd');
    const floatingCdCover = document.getElementById('floating-cd-cover');
    if (floatingCd && floatingCdCover) {
        // 如果这首歌有封面就用封面，没有就用黑胶兜底图
        floatingCdCover.src = track.cover || 'https://placehold.co/100/333/fff?text=M';
        floatingCd.style.display = 'block'; // 只要放歌了，就把入口显示出来
    }
    if (track.isKeepAlive) {
        audioPlayer.loop = true;  // 开启循环
    } else {
        audioPlayer.loop = (loopMode === 'one'); 
    }
    try {
        if (track.file && (track.file instanceof File || track.file instanceof Blob)) {
            audioPlayer.src = URL.createObjectURL(track.file);
        } else {
            // 对于网络 URL
            audioPlayer.src = track.url;
        }

        // 使用 Promise 处理播放，捕获自动播放策略阻止的错误
        const playPromise = audioPlayer.play();
        if (playPromise !== undefined) {
            playPromise.then(_ => {
                // 播放成功
                const root = document.getElementById('play-btn-root');
                if(root) root.classList.add('playing');
                isPlaying = true;
            })
            .catch(error => {
                console.warn("自动播放被阻止或资源加载失败:", error);
                isPlaying = false;
                // 这里可以弹窗提示用户手动点击
            });
        }
    } catch (e) {
        console.error("设置音频源失败:", e);
    }
}

// 4. 切歌
function nextTrack() { 
    if(musicPlaylist.length) playTrack((currentMusicIndex + 1) % musicPlaylist.length); 
}
function prevTrack() { 
    if(musicPlaylist.length) playTrack((currentMusicIndex - 1 + musicPlaylist.length) % musicPlaylist.length); 
}

// 8. 面板开关动画 (修复版)
function toggleMusicPanel(show) {
    const panel = document.getElementById('music-panel');
    const overlay = document.getElementById('music-panel-overlay');
    if (!panel || !overlay) return;
    
    if (show) {
        overlay.style.display = 'block';
        renderPlaylist(); // 每次打开时刷新列表
        // 稍微延时以触发 CSS transition
        setTimeout(() => { 
            overlay.style.opacity = '1'; 
            panel.style.bottom = '0'; 
        }, 10);
    } else {
        overlay.style.opacity = '0'; 
        panel.style.bottom = '-70%'; 
        setTimeout(() => overlay.style.display = 'none', 400);
    }
}
// script.js - 音乐相关功能区域

// 1. 打开导入选择弹窗
function openMusicImportModal() {
    const modal = document.getElementById('music-import-modal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

// 2. 关闭导入选择弹窗
function closeMusicModal() {
    const modal = document.getElementById('music-import-modal');
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}
// 3. 触发本地文件选择
function triggerMusicFile() {
    // 修复：不再调用不存在的 closeMusicModal()
    // 而是关闭右上角的小菜单
    const menu = document.getElementById('musicPlusMenu');
    if (menu) menu.classList.remove('active');
    
    const fileInput = document.getElementById('musicFileInput');
    if (fileInput) {
        fileInput.click(); // 触发隐藏的input
    } else {
        console.error("未找到 id 为 musicFileInput 的元素");
    }
}

/* ================================================= */
/* ★★★ 修复后的音乐列表逻辑 (无图标/无来源/修复删除) ★★★ */
/* ================================================= */

function renderPlaylist() {
    const container = document.getElementById('music-list-container');
    if (!container) return;
    
    if (musicPlaylist.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#ccc; margin-top:40px; font-size:13px;">暂无音乐<br>点击右上角 + 添加</div>';
        return;
    }
    
    container.innerHTML = "";
    
    musicPlaylist.forEach((track, index) => {
        const item = document.createElement('div');
        // 直接在 JS 里写死 Flex 布局，不受外部 CSS 干扰
        item.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f5f5f5;";
        
        // 正在播放的高亮样式
        const isPlayingColor = (index === currentMusicIndex) ? 'var(--accent-color)' : '#333';
        const isPlayingWeight = (index === currentMusicIndex) ? 'bold' : 'normal';

        item.innerHTML = `
            <!-- 左侧：歌曲信息区 -->
            <div class="list-info" onclick="playTrack(${index})" style="flex: 1; display: flex; align-items: center; overflow: hidden; cursor: pointer;">
                <div class="list-song" style="color: ${isPlayingColor}; font-weight: ${isPlayingWeight}; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${track.name}
                </div>
                <!-- 歌手名字稍微淡一点，跟在后面 -->
                <div class="list-artist" style="font-size: 11px; color: #999; margin-left: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    - ${track.artist}
                </div>
            </div>
            
            <!-- 右侧：删除按钮区 -->
            <div class="list-delete" onclick="deleteMusic(${index}, event)" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: flex-end; cursor: pointer; color: #ccc; font-size: 16px; flex-shrink: 0;">
                <i class="fas fa-times"></i>
            </div>
        `;
        container.appendChild(item);
    });
}

// 2. 删除音乐逻辑 (修复无反应问题)
function deleteMusic(index, event) {
    // 阻止事件冒泡，防止触发播放
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (confirm("确定要删除这首音乐吗？")) {
        // 如果删除的是当前正在播放的
        if (index === currentMusicIndex) {
            audioPlayer.pause();
            audioPlayer.src = "";
            
            // 重置底部播放器文字
            const songNameEl = document.getElementById('main-song-name');
            const artistNameEl = document.getElementById('main-artist-name');
            if(songNameEl) songNameEl.innerText = "尚未播放";
            if(artistNameEl) artistNameEl.innerText = "请点击这里选择音乐";
            
            const root = document.getElementById('play-btn-root');
            if(root) root.classList.remove('playing');
            
            currentMusicIndex = -1;
            isPlaying = false;
        } 
        // 如果删除的是当前播放之前的歌曲，索引需要减1
        else if (index < currentMusicIndex) {
            currentMusicIndex--;
        }

        musicPlaylist.splice(index, 1);
        renderPlaylist(); // 重新渲染列表
    }
}

// 3. 新增：控制右上角小菜单显隐
function toggleMusicPlusMenu(event) {
    if(event) event.stopPropagation();
    const menu = document.getElementById('musicPlusMenu');
    if(menu) {
        // 切换 active 类
        if (menu.classList.contains('active')) {
            menu.classList.remove('active');
        } else {
            menu.classList.add('active');
        }
    }
}

// 4. 点击页面其他地方关闭小菜单
document.addEventListener('click', (e) => {
    const menu = document.getElementById('musicPlusMenu');
    // 如果点击的不是菜单本身，也不是加号按钮
    if (menu && menu.classList.contains('active') && !e.target.closest('.panel-plus') && !e.target.closest('.music-plus-dropdown')) {
        menu.classList.remove('active');
    }
});

// 分组选择占位函数
function selectGroup(el) {
    document.querySelectorAll('.group-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    // 这里可以加逻辑筛选列表，目前先不动
}

// ★★★ 修复底栏位置 ★★★
function fixBottomNavPosition() {
    const nav = document.getElementById('wechat-bottom-nav');
    if (nav) {
        nav.style.position = 'absolute';
        nav.style.bottom = '0';
        nav.style.left = '0';
    }
}

// 初始化时执行修复
document.addEventListener('DOMContentLoaded', fixBottomNavPosition);
window.addEventListener('load', fixBottomNavPosition);

// 立即执行一次（以防 DOMContentLoaded 已触发）
fixBottomNavPosition();
// =========================================
// ★★★ iOS 键盘适配·修复版 v5 ★★★
// =========================================
(function() {
    const msgInput = document.getElementById('msgInput');
    const footer = document.getElementById('newRoomFooter');
    const chatRoom = document.getElementById('chatRoom');
    
    if (!msgInput || !footer || !chatRoom) return;

    // ★ 输入框失去焦点时（键盘收起）
    msgInput.addEventListener('blur', function() {
        setTimeout(() => {
            // 1. 强制重置输入栏位置
            footer.style.bottom = '0';
            
            // 2. ★★★ 关键修复：重置聊天室容器的滚动位置 ★★★
            chatRoom.scrollTop = 0;
            
            // 3. 防止页面整体偏移
            window.scrollTo(0, 0);
        }, 50);
    });

    // ★ visualViewport 监听
    if (window.visualViewport) {
        let lastKeyboardHeight = 0;
        
        window.visualViewport.addEventListener('resize', () => {
            if (!chatRoom.classList.contains('active')) return;
            
            const keyboardHeight = Math.round(window.innerHeight - window.visualViewport.height);
            
            // 防止重复执行
            if (keyboardHeight === lastKeyboardHeight) return;
            lastKeyboardHeight = keyboardHeight;
            
            if (keyboardHeight > 150) {
                // 键盘弹出
                footer.style.bottom = keyboardHeight + 'px';
            } else {
                // 键盘收起
                footer.style.bottom = '0';
            }
        });
    }
})();
//
// =========================================
// ★★★ 新版表情包逻辑 v2.0 (分类+命名+持久化修复) ★★★
// =========================================

let myStickers = [];           // 表情包内存数据
let isStickerEditMode = false; // 是否处于编辑模式
let isStickerLockMode = false;
let selectedStickerIds = [];   // 已选中的表情ID
let selectedLockCategories =[];
let tempUploadImg = null;      // 临时存储上传的图片Base64
let glassActionType = '';      // 记录弹窗当前用途
let currentStickerCategory = 'all'; // 当前选中的分类 ('all' 或具体分类名)

// ★★★ 1. 初始化表情包 (修复刷新消失bug的核心) ★★★
// 这个函数会在 loadAllDataFromDB 里被调用
function initStickers() {
    // 1. 从全局数据恢复，如果为空则初始化为空数组
    if (globalData && globalData.stickers) {
        myStickers = globalData.stickers;
    } else {
        myStickers = [];
    }

    // 2. 数据清洗：确保每个表情都有 category 字段，老数据默认为 '默认'
    let hasUpdate = false;
    myStickers.forEach(s => {
        if (!s.category) {
            s.category = '默认';
            hasUpdate = true;
        }
    });
    // 如果有老数据被更新了字段，悄悄保存一下
    if (hasUpdate) saveData();

    // 3. 渲染界面
    renderStickerCategories();
    renderStickerGrid();
    
    console.log('✅ 表情包系统已就绪，加载数量:', myStickers.length);
}

function renderStickerCategories() {
    const nav = document.getElementById('stickerCategoryNav');
    if (!nav) return;
    nav.innerHTML = '';

    const categories = new Set();
    myStickers.forEach(s => {
        // 在 UI 层面：不管 AI 禁不禁，你都能看到所有分类
        if (s.category && s.category !== '默认' && s.category !== 'Default') {
            categories.add(s.category);
        }
    });
    
    const list =['all', ...Array.from(categories)];

    list.forEach(cat => {
        const pill = document.createElement('div');
        const isActive = (currentStickerCategory === cat);
        pill.className = `cat-pill ${isActive ? 'active' : ''}`;
        
        if (isStickerEditMode && cat !== 'all') {
            pill.innerHTML = `<span class="cat-pill-text">${cat}</span><span class="cat-delete-x" onclick="deleteStickerCategory('${cat}', event)">×</span>`;
            pill.classList.add('edit-mode');
        } else {
            pill.innerText = cat === 'all' ? '全部' : cat;
        }
        
        pill.onclick = (e) => {
            if (e.target.classList.contains('cat-delete-x')) return;
            currentStickerCategory = cat;
            renderStickerCategories();
            renderStickerGrid();
        };
        nav.appendChild(pill);
    });
}

function renderStickerGrid() {
    const grid = document.getElementById('stickerGrid');
    if (!grid) return;
    grid.innerHTML = '';

    // ★ 核心：取消对用户 UI 视角的过滤，你能看到所有的图
    let displayList = myStickers;

    if (currentStickerCategory !== 'all') {
        displayList = displayList.filter(s => s.category === currentStickerCategory);
    }

    displayList.forEach((s) => {
        const unit = document.createElement('div');
        unit.className = 'sticker-unit';
        const isSelected = selectedStickerIds.includes(s.id);
        const selectedClass = isSelected ? 'selected' : '';

        unit.innerHTML = `
            <div class="sticker-item-box" onclick="handleStickerClick('${s.id}', event)">
                <img src="${s.src}" class="sticker-img-content" loading="lazy">
                <div class="sticker-select-circle ${selectedClass}"></div>
            </div>
            <div class="sticker-name">${s.name || '未命名'}</div>
        `;
        grid.appendChild(unit);
    });

    if (displayList.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#ccc;padding:20px;font-size:12px;">空空如也</div>';
    }
}

// 辅助点击函数 (放在 renderStickerGrid 下面即可)
function handleStickerClick(id, event) {
    event.stopPropagation();
    const s = myStickers.find(item => item.id == id); // 注意 id 类型可能不同，用 == 比较
    if (!s) return;

    if (isStickerEditMode) {
        toggleStickerSelection(s.id);
    } else {
        sendStickerMsg(s);
    }
}

function switchStickerMode(mode) {
    const panel = document.getElementById('stickerSubView');
    const tabEmoji = document.getElementById('tabEmoji');
    const tabEdit = document.getElementById('tabEdit');
    const tabLock = document.getElementById('tabLock'); // 新增
    
    const actionBar = document.getElementById('stickerActionBar');
    const lockActionBar = document.getElementById('stickerLockActionBar');
    const catNav = document.getElementById('stickerCategoryNav');

    // 1. 初始化，移除所有模式
    isStickerEditMode = false;
    isStickerLockMode = false;
    selectedStickerIds =[];
    
    panel.classList.remove('edit-mode', 'lock-mode');
    tabEmoji.classList.remove('active');
    tabEdit.classList.remove('active');
    if(tabLock) tabLock.classList.remove('active');
    
    if(actionBar) actionBar.style.setProperty('display', 'none', 'important');
    if(lockActionBar) lockActionBar.style.setProperty('display', 'none', 'important');

    // 2. 判断当前点击的是哪个模式
    if (mode === 'edit') {
        isStickerEditMode = true;
        panel.classList.add('edit-mode');
        tabEdit.classList.add('active');
        if(actionBar) actionBar.style.setProperty('display', 'flex', 'important');
        if(catNav) catNav.style.display = 'flex';
        
        updateDeleteButtonCount();
        renderStickerCategories();
        renderStickerGrid();
    } 
    // ★ 新增：禁止模式
    else if (mode === 'lock') {
        isStickerLockMode = true;
        panel.classList.add('lock-mode');
        if(tabLock) tabLock.classList.add('active');
        if(lockActionBar) lockActionBar.style.setProperty('display', 'flex', 'important');
        if(catNav) catNav.style.display = 'none'; // 隐藏顶部分类导航
        
        // 读取当前角色已经被锁定的分组
        const chat = chatList.find(c => c.id === currentChatId);
        selectedLockCategories = chat && chat.disabledStickerCategories ? [...chat.disabledStickerCategories] :[];
        
        renderLockCategoryGrid();
        updateLockButtonCount();
    } 
    // 默认浏览模式
    else {
        tabEmoji.classList.add('active');
        if(catNav) catNav.style.display = 'flex';
        renderStickerCategories();
        renderStickerGrid();
    }
}

// ★ 新增 1：渲染分类网格 (用于选择哪些分类被禁用)
function renderLockCategoryGrid() {
    const grid = document.getElementById('stickerGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    // 获取所有的分组名称 (包括默认)
    const categories = new Set(['默认']);
    myStickers.forEach(s => { if (s.category) categories.add(s.category); });
    
    Array.from(categories).forEach(cat => {
        const unit = document.createElement('div');
        unit.className = 'sticker-unit';
        
        const isLocked = selectedLockCategories.includes(cat);
        const selectedClass = isLocked ? 'selected' : '';
        
        // 取该分类里的第一张图做封面
        const firstSticker = myStickers.find(s => s.category === cat);
        const coverSrc = firstSticker ? firstSticker.src : '';
        
        unit.innerHTML = `
            <div class="sticker-item-box" onclick="toggleCategoryLock('${cat}', event)" style="cursor:pointer; background:#f0f0f0;">
                ${coverSrc 
                    ? `<img src="${coverSrc}" class="sticker-img-content" style="opacity: ${isLocked ? 0.3 : 1}; filter: ${isLocked ? 'grayscale(100%)' : 'none'};">` 
                    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;color:#999;font-weight:bold;">${cat}</div>`}
                <div class="sticker-select-circle ${selectedClass}"></div>
                ${isLocked ? '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:24px;color:#ff3b30;z-index:2;text-shadow:0 0 5px rgba(255,255,255,0.8);"><i class="fas fa-lock"></i></div>' : ''}
            </div>
            <div class="sticker-name" style="${isLocked ? 'color:#ff3b30;text-decoration:line-through;font-weight:bold;' : 'color:#333;font-weight:500;'}">${cat}</div>
        `;
        grid.appendChild(unit);
    });
}

// ★ 新增 2：点击切换锁定状态
function toggleCategoryLock(cat, event) {
    if (event) event.stopPropagation();
    if (selectedLockCategories.includes(cat)) {
        selectedLockCategories = selectedLockCategories.filter(c => c !== cat);
    } else {
        selectedLockCategories.push(cat);
    }
    renderLockCategoryGrid();
    updateLockButtonCount();
}

// ★ 新增 3：更新底部数字及确认保存
function updateLockButtonCount() {
    const lockBtn = document.querySelector('#stickerLockActionBar .btn-category');
    if (lockBtn) {
        lockBtn.innerHTML = `<i class="fas fa-lock"></i> 开启上锁 (${selectedLockCategories.length})`;
    }
}

// ★ 新增 4：确认保存逻辑
function confirmLockCategories() {
    const chat = chatList.find(c => c.id === currentChatId);
    if (chat) {
        chat.disabledStickerCategories =[...selectedLockCategories];
        saveData(); // 保存到数据库
        switchStickerMode('view'); // 切回普通模式
    }
}

function toggleStickerSelection(id) {
    if (selectedStickerIds.includes(id)) {
        selectedStickerIds = selectedStickerIds.filter(pid => pid !== id);
    } else {
        selectedStickerIds.push(id);
    }
    renderStickerGrid();
    updateDeleteButtonCount(); // ★ 新增
}

// ★★★ 新增：更新删除按钮显示数量 ★★★
function updateDeleteButtonCount() {
    const deleteBtn = document.querySelector('.btn-delete-confirm');
    if (deleteBtn) {
        const count = selectedStickerIds.length;
        deleteBtn.innerHTML = `<i class="fas fa-trash"></i> 删除${count > 0 ? '(' + count + ')' : ''}`;
    }
}

// ★★★ 新增：删除表情分类 ★★★
function deleteStickerCategory(catName, event) {
    event.stopPropagation();
    if (confirm(`确定删除分类 "${catName}" 吗？\n该分类下的表情将移到"默认"分类。`)) {
        myStickers.forEach(s => {
            if (s.category === catName) {
                s.category = '默认';
            }
        });
        
        if (currentStickerCategory === catName) {
            currentStickerCategory = 'all';
        }
        
        globalData.stickers = myStickers;
        saveData();
        renderStickerCategories();
        renderStickerGrid();
    }
}

// ★★★ 修复后的 handleStickerAction 函数 ★★★
function handleStickerAction(action) {
    if (action === 'add') {
        openGlassPopup('batch');
    } else if (action === 'upload') {
        // 1. 尝试获取页面上的上传控件
        let fileInput = document.getElementById('stickerFileInput');
        
        // 2. ★ 核心修复：如果找不到控件，就自动创建一个并挂载到页面上
        if (!fileInput) {
            console.log('检测到缺少 stickerFileInput，正在自动修复...');
            fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'stickerFileInput';
            fileInput.accept = 'image/*'; // 限制只能选择图片
            fileInput.style.display = 'none'; // 隐藏起来
            
            // 绑定上传后的回调函数 (确保 handleStickerFile 已存在)
            fileInput.onchange = function() { 
                handleStickerFile(this); 
            };
            
            document.body.appendChild(fileInput);
        }

        // 3. 触发系统文件选择弹窗
        fileInput.click();
    }
}

// ★★★ 7. 打开分类管理弹窗 (新功能) ★★★
function openCategoryPopup() {
    if (selectedStickerIds.length === 0) {
        alert("请先选择至少一个表情哦");
        return;
    }

    const overlay = document.getElementById('stickerCategoryOverlay');
    const listContainer = document.getElementById('popupCatList');
    
    // 1. 渲染弹窗内的分类列表
    listContainer.innerHTML = '';
    const categories = new Set(['默认']);
    myStickers.forEach(s => categories.add(s.category || '默认'));
    
    Array.from(categories).forEach(cat => {
        const item = document.createElement('div');
        item.className = 'cat-option-item';
        item.innerHTML = `
            <span>${cat}</span>
            <div class="cat-check"></div>
        `;
        item.onclick = () => {
            // 单选逻辑
            document.querySelectorAll('.cat-option-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            item.dataset.value = cat;
        };
        listContainer.appendChild(item);
    });

    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('show'), 10);
}

function closeCategoryPopup() {
    const overlay = document.getElementById('stickerCategoryOverlay');
    overlay.classList.remove('show');
    setTimeout(() => overlay.style.display = 'none', 300);
}

// ★★★ 8. 创建新分类 ★★★
function createNewCategory() {
    const input = document.getElementById('newCatInput');
    const name = input.value.trim();
    if (!name) return;

    // 检查重复
    const listContainer = document.getElementById('popupCatList');
    const existing = Array.from(listContainer.children).map(el => el.innerText);
    if (existing.includes(name)) {
        alert("这个分类已经存在啦");
        return;
    }

    // 添加到列表并自动选中
    const item = document.createElement('div');
    item.className = 'cat-option-item selected'; // 自动选中
    item.innerHTML = `
        <span>${name}</span>
        <div class="cat-check"></div>
    `;
    item.dataset.value = name;
    item.onclick = () => {
        document.querySelectorAll('.cat-option-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        item.dataset.value = name;
    };
    
    // 取消其他选中
    document.querySelectorAll('.cat-option-item').forEach(el => el.classList.remove('selected'));
    
    listContainer.insertBefore(item, listContainer.firstChild); // 插到最前面
    input.value = '';
}

function confirmCategoryAssignment() {
    const selectedItem = document.querySelector('.cat-option-item.selected');
    if (!selectedItem) {
        alert("请选择一个分类");
        return;
    }

    const targetCat = selectedItem.dataset.value;

    // 移动分类
    let count = 0;
    myStickers.forEach(s => {
        if (selectedStickerIds.includes(s.id)) {
            s.category = targetCat;
            count++;
        }
    });

    // 保存
    globalData.stickers = myStickers;
    saveData();
    
    // ★★★ 核心修复：彻底关闭编辑模式 ★★★
    selectedStickerIds = [];        // 清空选中数组
    isStickerEditMode = false;      // 标记为非编辑模式
    
    // 强制 UI 退出编辑状态 (这会隐藏 sticker-action-bar)
    const panel = document.getElementById('stickerSubView');
    if(panel) panel.classList.remove('edit-mode');
    
    // 恢复顶部 Tab 状态
    document.getElementById('tabEmoji').classList.add('active');
    document.getElementById('tabEdit').classList.remove('active');

    // 刷新视图到目标分类
    currentStickerCategory = targetCat;
    renderStickerCategories();
    renderStickerGrid();
    
    closeCategoryPopup();
    alert(`已移动 ${count} 个表情到 "${targetCat}"`);
}


// ★★★ 10. 删除逻辑 (整合版) ★★★
function deleteSelectedStickers() {
    if (selectedStickerIds.length === 0) return;
    
    if (confirm(`确定删除选中的 ${selectedStickerIds.length} 个表情吗？`)) {
        myStickers = myStickers.filter(s => !selectedStickerIds.includes(s.id));
        globalData.stickers = myStickers;
        saveData();
        
        selectedStickerIds = [];
        // 刷新当前界面
        renderStickerCategories(); // 可能把某个分类删空了
        renderStickerGrid();
    }
}


// ★★★ 第三步(1)：支持音乐命名的弹窗函数 ★★★
function openGlassPopup(type, defaultVal = '') {
    glassActionType = type;
    const modal = document.getElementById('glassPopup');
    const title = document.getElementById('glassTitle');
    const label = document.getElementById('glassLabel');
    const nameInput = document.getElementById('glassNameInput');
    const batchInput = document.getElementById('glassBatchInput');
    const lrcArea = document.getElementById('glassLrcArea');

    nameInput.value = '';
    batchInput.value = '';

    tempLrcText = null; 
    const lrcBtn = document.getElementById('lrcFileName');
    if (lrcBtn) lrcBtn.innerText = "点击选择 .lrc 歌词文件";

    if (type === 'batch') {
        title.innerText = "批量添加";
        label.innerText = "输入链接 (格式: 名字:链接)";
        nameInput.style.display = 'none';
        batchInput.style.display = 'block';
    } else if (type === 'upload_name') {
        title.innerText = "表情命名";
        label.innerText = "给这张图片起个名字";
        nameInput.style.display = 'block';
        batchInput.style.display = 'none';
    } 
    // 新增：音乐上传模式
    else if (type === 'music_upload'|| type === 'music_link_name') { 
        title.innerText = "音乐上传";
        label.innerText = "给这首歌起个名字";
        nameInput.style.display = 'block';
        batchInput.style.display = 'none';
        nameInput.value = defaultVal; // 自动填入文件名
        if (lrcArea) lrcArea.style.display = 'block';
    }

    modal.classList.add('show');
}

let tempLrcText = null; // 用于暂存读取到的歌词文本

window.handleLrcFile = function(input) {
    const file = input.files[0];
    if (!file) return;
    
    // 检查是不是 lrc 后缀 (可选防呆)
    if (!file.name.toLowerCase().endsWith('.lrc')) {
        alert("请选择 .lrc 格式的歌词文件！");
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        tempLrcText = e.target.result; // 直接拿到 LRC 文本内容
        const lrcBtn = document.getElementById('lrcFileName');
        if (lrcBtn) lrcBtn.innerText = "已加载: " + file.name;
    };
    reader.readAsText(file);
    input.value = ''; // 清空方便重复选
};

function closeGlassPopup() {
    document.getElementById('glassPopup').classList.remove('show');
    tempUploadImg = null;
}

// ★★★ 第三步(2)：处理弹窗确认按钮 ★★★
function confirmGlassAction() {
    // 1. 批量表情
    if (glassActionType === 'batch') {
        const text = document.getElementById('glassBatchInput').value;
        processBatchImport(text);
    } 
    // 2. 表情命名
    else if (glassActionType === 'upload_name') {
        const name = document.getElementById('glassNameInput').value.trim() || '未命名表情';
        if (tempUploadImg) {
            saveNewStickerData(tempUploadImg, name);
        }
    } 
    else if (glassActionType === 'music_upload') {
        const name = document.getElementById('glassNameInput').value.trim() || '未命名音乐';
        if (tempMusicBlob) {
            const newTrack = {
                name: name,
                artist: "本地上传",
                file: tempMusicBlob, 
                id: Date.now(), 
                lrc: tempLrcText || "" 
            };
            musicPlaylist.push(newTrack);
            saveMusicPlaylist(); 
            renderPlaylist();
            
            if (musicPlaylist.length === 1) playTrack(0);
            tempMusicBlob = null;
        }
    }
    // ★★★ 新增修复：这里是缺失的“网络链接”保存逻辑 ★★★
    else if (glassActionType === 'music_link_name') {
        const name = document.getElementById('glassNameInput').value.trim() || '网络音乐';
        // 检查刚才暂存的 URL 是否存在
        if (tempMusicUrl) {
            const newTrack = {
                name: name,
                artist: "网络资源",
                url: tempMusicUrl, // 使用暂存的 URL
                id: Date.now(),
                lrc: tempLrcText || ""
            };
            musicPlaylist.push(newTrack);
            saveMusicPlaylist(); // 保存到数据库
            renderPlaylist(); // 刷新列表
            
            if (musicPlaylist.length === 1) playTrack(0);
            tempMusicUrl = null; // 用完清空，防止污染
        }
    }
    
    closeGlassPopup();
}

// 核心存储函数
function saveNewStickerData(src, name) {
    myStickers.push({
        id: Date.now() + Math.random(),
        src: src,
        name: name,
        category: '默认' // 新增默认分类
    });
    
    globalData.stickers = myStickers;
    saveData();
    renderStickerCategories();
    renderStickerGrid();
}

function processBatchImport(text) {
    if (!text) return;
    const lines = text.split('\n');
    let count = 0;
    
    lines.forEach(line => {
        line = line.trim();
        if(!line) return;
        
        if (line.includes('http')) {
            let name = "批量导入";
            let src = line;
            const match = line.match(/^(.*?)(https?:\/\/.*)$/);
            
            if (match) {
                const potentialName = match[1].trim().replace(/[:：|\s]+$/, '');
                const potentialUrl = match[2].trim();
                if (potentialName) name = potentialName;
                src = potentialUrl;
            }
            
            myStickers.push({
                id: Date.now() + Math.random(),
                src: src,
                name: name,
                category: '默认'
            });
            count++;
        }
    });
    
    if (count > 0) {
        globalData.stickers = myStickers;
        saveData();
        renderStickerCategories();
        renderStickerGrid();
        alert(`成功导入 ${count} 个表情`);
    } else {
        alert("未识别到有效链接");
    }
}

// 11. 发送表情 (点击图片)
function sendStickerMsg(sticker) {
    if (!currentChatId) return;
    const chat = chatList.find(c => c.id === currentChatId);
    if (chat) {
        // 【新增修复】统一使用虚拟时间快照
        const vt = window.getVirtualTimeData(chat, true);
        
        chat.messages.push({ 
            text: `<img src="${sticker.src}" class="chat-sticker-img">`, 
            isSelf: true, 
            time: vt.timeStr,
            virtualDate: vt.dateStr,
            virtualTimestamp: vt.ms,
            timestamp: Date.now(),
            contentDescription: `[发送了一个表情：${sticker.name}]` 
        });
        
        updateChatLastMsg(chat);
        
        if (!chat.isPinned) {
            chatList = chatList.filter(c => c.id !== currentChatId);
            chatList.unshift(chat);
        }
        
        saveData();
        renderMessages(chat);
        toggleChatTools(); // 发送后关闭面板
    }
}

// 文件上传监听
function handleStickerFile(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            tempUploadImg = e.target.result; 
            openGlassPopup('upload_name');
        };
        reader.readAsDataURL(file);
    }
    input.value = '';
}

/* ========================================= */
/* ★★★ 新版液态点击菜单逻辑 (5个功能版) ★★★ */
/* ========================================= */

let activeMsgIndex = null; 
let activeMsgElement = null; 

function initMsgMenu() {
    if (document.getElementById('msgActionMenu')) return;

    const menuHtml = `
    <div id="msgActionMenu" class="msg-action-menu">
        <div class="msg-action-item" onclick="handleMenuAction('copy')">复制</div>
        <div class="msg-action-item" onclick="handleMenuAction('edit')">编辑</div>
        <div class="msg-action-item" onclick="handleMenuAction('reply')">引用</div>
        <div class="msg-action-item" onclick="handleMenuAction('multi')">多选</div>
        <div class="msg-action-item" onclick="handleMenuAction('recall')">撤回</div>
        <div class="msg-action-item" onclick="handleMenuAction('regen')">重生成</div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', menuHtml);
    
    // 点击空白关闭逻辑保持不变
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('msgActionMenu');
        if (menu && menu.classList.contains('active') && !e.target.closest('#msgActionMenu')) {
            hideMsgMenu();
        }
    });
    const room = document.getElementById('roomMessages');
    if(room) room.addEventListener('scroll', hideMsgMenu);
}

// 2. 显示菜单 (位置计算保持不变，因为 CSS 改了，会自动变细长)
function showMsgMenu(element, index, isSelf) {
    initMsgMenu();
    const menu = document.getElementById('msgActionMenu');
    activeMsgIndex = index;
    activeMsgElement = element;
    
    if (navigator.vibrate) {
        try { navigator.vibrate(15); } catch(err) {}
    }

    const rect = element.getBoundingClientRect();
    
    // 先显示以便计算
    menu.style.display = 'flex'; 
    menu.style.opacity = '0'; // 先透明
    
    const menuHeight = menu.offsetHeight || 50;
    const menuWidth = menu.offsetWidth || 280;
    
    // 水平居中
    let leftPos = rect.left + (rect.width / 2) - (menuWidth / 2);
    // 边界检查
    if (leftPos < 10) leftPos = 10;
    if (leftPos + menuWidth > window.innerWidth - 10) leftPos = window.innerWidth - menuWidth - 10;

    // 垂直定位 (优先上方)
    let topPos;
    if (rect.top > menuHeight + 20) {
        topPos = rect.top - menuHeight - 8;
        menu.style.transformOrigin = 'center bottom';
    } else {
        topPos = rect.bottom + 8;
        menu.style.transformOrigin = 'center top';
    }

    menu.style.top = topPos + 'px';
    menu.style.left = leftPos + 'px';
    
    // 激活动画
    requestAnimationFrame(() => {
        menu.classList.add('active');
        menu.style.opacity = '1';
    });
}

// 3. 隐藏菜单
function hideMsgMenu() {
    const menu = document.getElementById('msgActionMenu');
    if (menu) {
        menu.classList.remove('active');
        menu.style.opacity = '0';
        setTimeout(() => {
            if(!menu.classList.contains('active')) menu.style.display = 'none';
        }, 200);
    }
    activeMsgIndex = null;
}

// [找到这个函数并替换 switch 内的 recall case]
function handleMenuAction(action) {
    if (activeMsgIndex === null || !currentChatId) return;
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;
    
    const msg = chat.messages[activeMsgIndex];
    
    switch(action) {
        // ... (copy, edit, reply, multi 保持不变) ...
        case 'copy': 
            let text = msg.text;
            if (msg.text.includes('voice-trans-result')) {
                 const t = document.createElement('div'); t.innerHTML = msg.text;
                 text = t.querySelector('.voice-trans-result')?.innerText || '[语音]';
            } else if (msg.text.includes('<img')) {
                 text = '[图片]';
            }
            navigator.clipboard.writeText(text);
            break;
            
        case 'edit': 
            openEditMsgModal(currentChatId, activeMsgIndex);
            break;
            
        case 'reply':
            let rawText = msg.text;
            let previewText = rawText;
            if (rawText.includes('<img') || rawText.includes('chat-sticker-img')) previewText = '[图片/表情]';
            else if (rawText.includes('voice-inner')) previewText = '[语音]';
            else previewText = previewText.replace(/<[^>]+>/g, ''); 
            
            const replyName = msg.isSelf ? (chat.userRemark || "我") : (chat.realName || chat.name);

            activeReplyContext = {
                name: replyName,
                content: previewText
            };

            const bar = document.querySelector('.reply-bar-container');
            if (bar) {
                bar.querySelector('.reply-bar-title').innerText = `回复 ${replyName}`;
                bar.querySelector('.reply-bar-text').innerText = previewText;
                bar.classList.add('show');
            }

            const input = document.getElementById('msgInput');
            input.focus();
            break;
            
        case 'multi':
            enterMultiSelectMode(activeMsgIndex);
            return; 
            
        // ===========================================
        // ★★★ 核心修改：撤回逻辑 ★★★
        // ===========================================
        case 'recall': 
            // 1. 检查两分钟时限
            const now = Date.now();
            // 注意：旧消息可能没有 timestamp，为了兼容性，只有当有 timestamp 且差值 > 2分钟时才拦截
            if (msg.timestamp && (now - msg.timestamp > 2 * 60 * 1000)) {
                alert("超过 2 分钟的消息不能撤回了 (｡•́︿•̀｡)");
                hideMsgMenu();
                return;
            }

            if (confirm('确定撤回这条消息吗？')) {
                // 2. 标记为撤回状态，而不是删除
                msg.isRecalled = true;
                msg.recalledText = msg.text; // 备份原文本用于“重新编辑”或“查看”
                
                updateChatLastMsg(chat);
                saveData();
                renderMessages(chat);
            }
            break;
        // ===========================================

        case 'regen': 
            if (msg.isSelf) {
                alert('自己的消息不能重生成哦');
            } else {
                if(confirm('重新生成这轮回复？(将删除该轮所有AI消息并重新生成)')) {
                    // ★★★ 核心修改：寻找并删除连续的 AI 消息块 ★★★
                    
                    // 1. 向前查找：找到这一轮 AI 消息的起点
                    let startIndex = activeMsgIndex;
                    while (startIndex > 0 && !chat.messages[startIndex - 1].isSelf) {
                        startIndex--;
                    }

                    // 2. 向后查找：找到这一轮 AI 消息的终点
                    let endIndex = activeMsgIndex;
                    while (endIndex < chat.messages.length - 1 && !chat.messages[endIndex + 1].isSelf) {
                        endIndex++;
                    }

                    // 3. 计算需要删除的消息数量 (终点 - 起点 + 1)
                    const deleteCount = endIndex - startIndex + 1;

                    // 4. 一次性删除这一整块连续的 AI 消息
                    chat.messages.splice(startIndex, deleteCount);
                    
                    // 5. 更新最后一条消息的预览状态（因为刚才删除了末尾，需要更新列表显示的预览）
                    updateChatLastMsg(chat);

                    // 6. 保存并刷新界面
                    saveData();
                    renderMessages(chat);

                    // 7. 触发重新生成
                    generateAiReply(chat, true);
                }
            }
            break;
    }
    
    hideMsgMenu();
}

// 页面加载时初始化一次
document.addEventListener('DOMContentLoaded', () => {
    initMsgMenu();
    initReplySystem(); 
});

/* --- START: 引用回复功能逻辑 --- */

// 全局变量
let activeReplyContext = null; 

// 初始化：将回复条插入到 footer 中
function initReplySystem() {
    const footer = document.getElementById('newRoomFooter');
    if (!footer || footer.querySelector('.reply-bar-container')) return;

    const bar = document.createElement('div');
    bar.className = 'reply-bar-container';
    bar.innerHTML = `
        <div class="reply-bar-content">
            <div class="reply-bar-title"></div>
            <div class="reply-bar-text"></div>
        </div>
        <div class="reply-close-btn" onclick="cancelReply()">×</div>
    `;
    footer.prepend(bar); 
}

// 取消引用状态
function cancelReply() {
    activeReplyContext = null;
    const bar = document.querySelector('.reply-bar-container');
    if (bar) bar.classList.remove('show');
}
/* --- END OF FILE --- */

function openEditMsgModal(chatId, index) {
    hideMsgMenu(); 
    
    const toolsPanel = document.getElementById('chatToolsPanel');
    if(toolsPanel && toolsPanel.classList.contains('active')) {
        toggleChatTools();
    }

    const chat = chatList.find(c => c.id === chatId);
    if (!chat) return;
    const msg = chat.messages[index];
    
    editingMsgContext = { chatId, index };
    
    const container = document.getElementById('edit-dynamic-content');
    container.innerHTML = ''; 
    
    // --- A. 语音消息 ---
    if (msg.text.includes('voice-inner-container')) {
        // ... (语音部分的逻辑保持不变) ...
        const durMatch = msg.text.match(/class="voice-duration">(\d+)"<\/span>/);
        const textMatch = msg.text.match(/class="voice-trans-result[^"]*">([^<]+)<\/div>/);
        const duration = durMatch ? durMatch[1] : '5';
        const text = textMatch ? textMatch[1].trim() : '';

        container.innerHTML = `
            <div class="edit-voice-row">
                <span class="edit-voice-label">时长</span>
                <input type="number" id="edit-voice-duration" class="edit-voice-input" value="${duration}" style="width:60px;">
                <span style="font-size:12px;color:#666;">秒</span>
            </div>
            <div style="height:10px;"></div>
            <div class="edit-voice-row">
                <span class="edit-voice-label">内容</span>
                <textarea id="edit-voice-text" class="edit-text-area" style="min-height:80px;">${text}</textarea>
            </div>
        `;
    } 
    // --- ★★★ B. 新增：照片消息 (Photo) [修改版：无图预览] ★★★ ---
    else if (msg.text.includes('photo-msg-img')) {
        // 1. 提取图片 URL
        const srcMatch = msg.text.match(/src="([^"]+)"/);
        const currentSrc = srcMatch ? srcMatch[1] : '';
        
        // 2. 提取文字描述
        const descMatch = msg.text.match(/data-desc=["']([^"']+)["']/);
        const currentDesc = descMatch ? descMatch[1] : '';

        container.innerHTML = `
            <div style="margin-bottom:8px; font-size:12px; color:#666; text-align:center;">
                修改图片描述内容
            </div>
            
            <!-- ★ 关键：用一个隐藏的框存住图片地址，界面上看不见，但保存时以此为准 -->
            <input type="hidden" id="edit-photo-src-hidden" value="${currentSrc}">
            
            <!-- 只保留文字编辑框，高度稍微设高一点填补空白 -->
            <textarea id="edit-photo-desc" class="edit-text-area" style="min-height:120px; font-size:15px;">${currentDesc}</textarea>
        `;
        
        setTimeout(() => document.getElementById('edit-photo-desc').focus(), 100);
    }
    // --- C. 表情包 ---
    else if (msg.text.includes('chat-sticker-img')) {
        // ... (表情包逻辑保持不变) ...
        const srcMatch = msg.text.match(/src="([^"]+)"/);
        const currentSrc = srcMatch ? srcMatch[1] : '';
        let stickerName = '未知表情';
        if (typeof myStickers !== 'undefined') {
            const found = myStickers.find(s => s.src === currentSrc);
            if (found) stickerName = found.name;
        }
        const stickerCode = `[STICKER:${stickerName}]`;

        container.innerHTML = `
            <div style="margin-bottom:8px; font-size:12px; color:#666; text-align:center;">
                修改下方括号内的名字以切换表情
            </div>
            <textarea id="edit-sticker-code" class="edit-text-area" style="text-align:center; min-height:60px; font-family:monospace; font-weight:bold;">${stickerCode}</textarea>
            <div id="edit-sticker-preview" style="margin-top:10px; height:80px; display:flex; justify-content:center; align-items:center;">
                <img src="${currentSrc}" style="height:100%; border-radius:8px;">
            </div>
        `;
    } 
    // --- D. 普通文本 ---
    else {
        let val = msg.text;
        if (val.includes('<img')) {
             val = val.replace(/<img[^>]+>/g, '[图片]');
        }
        container.innerHTML = `
            <textarea id="edit-text-input" class="edit-text-area">${val}</textarea>
        `;
        setTimeout(() => document.getElementById('edit-text-input').focus(), 100);
    }

    document.getElementById('edit-msg-overlay').classList.add('active');
}
function confirmEditMsg() {
    if (!editingMsgContext) return;
    
    const { chatId, index } = editingMsgContext;
    const chat = chatList.find(c => c.id === chatId);
    if (!chat) return;
    
    // 获取各种可能的输入元素
    const textInput = document.getElementById('edit-text-input');
    const voiceText = document.getElementById('edit-voice-text');
    const stickerInput = document.getElementById('edit-sticker-code');
    const photoDescInput = document.getElementById('edit-photo-desc'); 

    let newText = "";
    let newDesc = null;

    // --- 分支 A: 普通文本 (★核心修复：增加表情包代码自动识别) ---
    if (textInput) {
        const rawValue = textInput.value.trim();

        // ★★★ 1. 优先检测：是否为表情包代码 [STICKER:xxx] ★★★
        // 正则说明：匹配以 [STICKER: 开头，以 ] 结尾的字符串，忽略大小写
        const stickerMatch = rawValue.match(/^\[STICKER:(.*?)\]$/i);

        if (stickerMatch) {
            const sName = stickerMatch[1].trim(); // 获取冒号后面的名字
            let foundSticker = null;

            // 在表情库里查找
            if (typeof myStickers !== 'undefined') {
                foundSticker = myStickers.find(s => s.name === sName) || 
                               myStickers.find(s => s.name.includes(sName));
            }

            if (foundSticker) {
                // 找到表情了，自动转换为图片 HTML
                newText = `<img src="${foundSticker.src}" class="chat-sticker-img">`;
                newDesc = `[发送了一个表情：${foundSticker.name}]`;
            } else {
                // 没找到表情，提示用户，但阻止保存（防止变成纯文本发出去尴尬）
                alert(`无法自动修复：\n未在表情库中找到名为 "${sName}" 的表情。\n\n请检查名字是否正确，或去"表情包"页面确认名字。`);
                return; 
            }
        } 
        // ★★★ 2. 如果不是表情包代码，走原来的文本逻辑 ★★★
        else {
            // 按换行符切分内容 (支持气泡拆分)
            const lines = rawValue.split('\n').filter(line => line.trim());
            
            if (lines.length > 1) {
                // === 触发拆分逻辑 (保持原样) ===
                const baseTime = chat.messages[index].time;
                const baseTimestamp = chat.messages[index].timestamp || Date.now();
                const isSelf = chat.messages[index].isSelf;
                
                const newMessages = lines.map((line, i) => {
                    return {
                        id: Date.now() + i,
                        text: line,
                        isSelf: isSelf,
                        time: baseTime,
                        timestamp: baseTimestamp + i,
                        contentDescription: null
                    };
                });
                
                chat.messages.splice(index, 1, ...newMessages);
                
                if (index >= chat.messages.length - 1 - newMessages.length) {
                    updateChatLastMsg(chat);
                }
                saveData();
                renderMessages(chat);
                closeEditMsgModal();
                return; // 结束函数
                
            } else {
                // === 只有一行 ===
                newText = rawValue;
            }
        }
    }
    // --- 分支 B: 语音消息 ---
    else if (voiceText) {
        const duration = document.getElementById('edit-voice-duration').value || 1;
        const text = voiceText.value || "语音";
        newText = `
            <div class="voice-inner-container" onclick="toggleVoiceText(this, event)">
                <div class="voice-main-row">
                    <div class="voice-animate-icon">
                        <div class="voice-line"></div>
                        <div class="voice-line"></div>
                        <div class="voice-line"></div>
                        <div class="voice-line"></div>
                    </div>
                    <span class="voice-duration">${duration}"</span>
                </div>
                <div class="voice-trans-result show">${text}</div> 
            </div>
        `;
        newDesc = `[语音消息：${text}]`;
    }
    // --- 分支 C: 照片消息 ---
    else if (photoDescInput) {
        const newDescription = photoDescInput.value.trim() || "照片";
        const hiddenSrcInput = document.getElementById('edit-photo-src-hidden');
        const imgSrc = hiddenSrcInput ? hiddenSrcInput.value : "";
        newText = `<img src="${imgSrc}" class="photo-msg-img" data-desc="${newDescription}" onclick="showPhotoDescription(this.dataset.desc, event)">`;
        newDesc = `[发送了照片：${newDescription}]`;
    }
    // --- 分支 D: 纯表情包编辑模式 (针对本来就是表情的消息) ---
    else if (stickerInput) {
        const code = stickerInput.value.trim(); 
        const match = code.match(/^\[STICKER:(.*?)\]$/i);
        
        if (match && match[1]) {
            const nameToFind = match[1].trim();
            let foundSticker = null;
            if (typeof myStickers !== 'undefined') {
                foundSticker = myStickers.find(s => s.name === nameToFind) || 
                               myStickers.find(s => s.name.includes(nameToFind));
            }
            if (foundSticker) {
                newText = `<img src="${foundSticker.src}" class="chat-sticker-img">`;
                newDesc = `[发送了一个表情：${foundSticker.name}]`;
            } else {
                alert(`未找到名为 "${nameToFind}" 的表情包`);
                return; 
            }
        } else {
             newText = code; 
        }
    }

    // 更新消息对象
    chat.messages[index].text = newText;
    
    // 更新描述字段
    if (newDesc) {
        chat.messages[index].contentDescription = newDesc;
    } else if (textInput && !newDesc) {
        // 如果是普通文本且没有被识别为表情包，清空描述
        chat.messages[index].contentDescription = null;
    }

    // 更新列表预览
    if (index === chat.messages.length - 1) {
        updateChatLastMsg(chat);
    }

    saveData();
    renderMessages(chat);
    closeEditMsgModal();
}

function closeEditMsgModal() {
    const overlay = document.getElementById('edit-msg-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
    editingMsgContext = null;
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. 绑定取消按钮
    const btnCancel = document.getElementById('btn-edit-cancel');
    if (btnCancel) {
        btnCancel.addEventListener('click', closeEditMsgModal);
    }

    // 2. 绑定确定按钮
    const btnConfirm = document.getElementById('btn-edit-confirm');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', confirmEditMsg);
    }

    // 3. 绑定点击空白处（遮罩）关闭
    const overlay = document.getElementById('edit-msg-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            // 只有点在遮罩背景上才关闭，点在弹窗内部不关闭
            if (e.target === overlay) {
                closeEditMsgModal();
            }
        });
    }
});

/* --- START: 多选删除模式核心逻辑 --- */

let isMultiSelectMode = false;
let selectedMsgIndices = new Set(); // 使用 Set 存储选中的索引，避免重复

// 1. 初始化顶部导航栏 (页面加载时调用一次即可，或者在 enter 时检查)
function initMultiSelectUI() {
    if (document.getElementById('multiSelectNavbar')) return;
    
    const room = document.getElementById('chatRoom');
    const navHtml = `
    <div id="multiSelectNavbar" class="multi-select-navbar">
        <div class="ms-nav-btn ms-nav-cancel" onclick="exitMultiSelectMode()">取消</div>
        <div class="ms-nav-title" id="msTitle">已选择 0 条</div>
        <div class="ms-nav-btn ms-nav-delete disabled" id="msDeleteBtn" onclick="deleteSelectedMessages()">删除</div>
    </div>`;
    
    room.insertAdjacentHTML('beforeend', navHtml);
}

// 2. 进入多选模式
function enterMultiSelectMode(initialIndex = null) {
    const menu = document.getElementById('msgActionMenu');
    if (menu) {
        menu.remove(); // <--- 关键修改：直接移除元素
    }

    isMultiSelectMode = true;
    selectedMsgIndices.clear();
    
    // 初始化 UI
    initMultiSelectUI();
    
    // 激活 CSS 状态
    const room = document.getElementById('chatRoom');
    if (room) room.classList.add('multi-select-mode');
    
    // 如果是从某条消息长按触发的，自动选中那一条
    if (initialIndex !== null) {
        setTimeout(() => {
            const rows = document.querySelectorAll('#roomMessages .Miu-miu');
            if (rows[initialIndex]) {
                handleMsgClickInMultiMode(initialIndex, rows[initialIndex]);
            }
        }, 50);
    }
}

// 3. 退出多选模式
function exitMultiSelectMode() {
    isMultiSelectMode = false;
    selectedMsgIndices.clear();
    
    const room = document.getElementById('chatRoom');
    room.classList.remove('multi-select-mode');
    
    // 清除所有选中样式
    document.querySelectorAll('.Miu-miu.ms-selected').forEach(el => {
        el.classList.remove('ms-selected');
    });
    
    // 重置顶部栏状态
    updateMultiSelectHeader();
}

// 4. 处理点击消息 (切换选中状态)
function handleMsgClickInMultiMode(index, rowElement) {
    if (!isMultiSelectMode) return;
    
    if (selectedMsgIndices.has(index)) {
        // 取消选中
        selectedMsgIndices.delete(index);
        rowElement.classList.remove('ms-selected');
    } else {
        // 选中
        selectedMsgIndices.add(index);
        rowElement.classList.add('ms-selected');
    }
    
    updateMultiSelectHeader();
}

// 5. 更新顶部栏数字和按钮状态
function updateMultiSelectHeader() {
    const count = selectedMsgIndices.size;
    const title = document.getElementById('msTitle');
    const delBtn = document.getElementById('msDeleteBtn');
    
    if (title) title.innerText = `已选择 ${count} 条`;
    
    if (delBtn) {
        if (count > 0) {
            delBtn.classList.remove('disabled');
            delBtn.innerText = `删除(${count})`;
        } else {
            delBtn.classList.add('disabled');
            delBtn.innerText = `删除`;
        }
    }
}

// 6. 执行删除
function deleteSelectedMessages() {
    if (selectedMsgIndices.size === 0) return;
    
    if (confirm(`确定删除选中的 ${selectedMsgIndices.size} 条消息吗？`)) {
        const chat = chatList.find(c => c.id === currentChatId);
        if (!chat) return;
        
        // 过滤掉被选中的消息 (保留 未被选中的)
        // 注意：filter index 必须与当前的 index 对应
        chat.messages = chat.messages.filter((_, index) => !selectedMsgIndices.has(index));
        
        // 更新最后一条消息预览
        updateChatLastMsg(chat);
        
        // 保存并重新渲染
        saveData();
        renderMessages(chat);
        
        // 退出模式
        exitMultiSelectMode();
    }
}

/* --- END: 多选删除模式核心逻辑 --- */
// === 新增：撤回消息辅助功能 ===

// 1. 重新编辑 (点击“重新编辑”)
window.restoreEdit = function(index) {
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat || !chat.messages[index]) return;
    
    const msg = chat.messages[index];
    const input = document.getElementById('msgInput');
    
    // 将被撤回的文本填入输入框
    // 如果是语音或图片代码，也原样填入
    if (input) {
        input.value = msg.recalledText || "";
        input.focus();
        // 触发高度自适应
        if(typeof autoResizeInput === 'function') autoResizeInput(input);
    }
};

// 2. 查看撤回内容 (点击“查看”)
window.viewRecalled = function(index) {
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat || !chat.messages[index]) return;
    
    const msg = chat.messages[index];
    let content = msg.recalledText || "";
    
    // 简单清洗一下内容，如果是HTML代码，尝试提取纯文本方便查看
    if (content.includes('voice-trans-result')) {
        const div = document.createElement('div');
        div.innerHTML = content;
        content = "[语音] " + (div.querySelector('.voice-trans-result')?.innerText || "");
    } else if (content.includes('<img')) {
        content = "[图片/表情包]";
    }
    
    alert(`撤回的内容是：\n\n${content}`);
};

/* ========================================= */
/* ★★★ icity 风格日记系统核心逻辑 ★★★ */
/* ========================================= */

let currentDiaryTargetId = null; // 当前正在看谁的日记 (null='me', number=chatId)
const originalSwitchAppTab = window.switchAppTab;
window.switchAppTab = function(index) {
    originalSwitchAppTab(index);
    if (index === 1) { // 如果切到了 Diary 页
        renderDiarySelection();
    }
};

// 找到 renderDiarySelection 函数并替换为以下内容：
function renderDiarySelection() {
    const grid = document.getElementById('diarySelectionGrid');
    if (!grid) return;
    
    // --- 修改开始：添加返回箭头逻辑 ---
    const titleEl = document.querySelector('.diary-app-name');
    
    if (titleEl) {
        titleEl.innerText = "他的日记"; // 保持原有的标题修改逻辑
        
        // 获取标题的父容器（Header栏）
        const headerBar = titleEl.parentElement;
        
        // 检查是否已经添加过返回按钮（防止重复添加）
        let backBtn = headerBar.querySelector('.diary-home-back-btn');
        
        if (!backBtn) {
            // 如果没有，创建一个
            backBtn = document.createElement('i');
            backBtn.className = 'fas fa-arrow-left diary-home-back-btn';
            
            // 设置样式使其像图2那样
            backBtn.style.fontSize = '20px';
            backBtn.style.color = '#333';
            backBtn.style.marginRight = '15px'; // 和标题拉开一点距离
            backBtn.style.cursor = 'pointer';
            backBtn.style.position = 'relative'; 
            backBtn.style.zIndex = '10';
            
            // 插入到标题的前面
            headerBar.insertBefore(backBtn, titleEl);
            
            // ★★★ 核心功能：点击返回消息列表 (Tab 0) ★★★
            backBtn.onclick = function() {
                switchAppTab(0); // 0 代表第一个 Tab (View Messages)
            };
        }
    }
    // --- 修改结束 ---

    grid.innerHTML = '';

    // ... (保留原本的头像渲染逻辑) ...
    // A. 添加“我” (User)
    const myAvatar = document.getElementById('meAvatarImg').src;
    let myName = document.getElementById('settingsUserName').innerText;
    if (!myName || myName.trim() === '默认') myName = "我";
    
    grid.innerHTML += `
        <div class="diary-selector-item" onclick="openDiaryBook('me')">
            <img src="${myAvatar}" class="diary-sel-avatar">
            <div class="diary-sel-name">${myName}</div>
        </div>
    `;

    // B. 添加聊天列表中的角色
    chatList.forEach(chat => {
        grid.innerHTML += `
            <div class="diary-selector-item" onclick="openDiaryBook(${chat.id})">
                <img src="${chat.avatar}" class="diary-sel-avatar">
                <div class="diary-sel-name">${chat.name}</div>
            </div>
        `;
    });
    
    // 重置图层显示
    document.getElementById('diary-selection-layer').classList.add('active');
    document.getElementById('diary-content-layer').classList.remove('active');
}

// 3. 打开具体的日记本
function openDiaryBook(targetId) {
    currentDiaryTargetId = targetId;
    
    // 获取目标信息
    let name = "";
    let entries = [];
    
    if (targetId === 'me') {
        // ★★★ 修改：判断是否为默认，是则替换
        let rawName = document.getElementById('settingsUserName').innerText;
        name = (rawName && rawName.trim() !== '默认') ? rawName : "我的日记";
        
        // 从 globalData 读取我的日记 (需要你在 saveData 里加上)
        if (!globalData.myDiaryEntries) globalData.myDiaryEntries = [];
        entries = globalData.myDiaryEntries;
    } else {
        const chat = chatList.find(c => c.id === targetId);
        if (chat) {
            name = chat.name + "的日记";
            if (!chat.diaryEntries) chat.diaryEntries = [];
            entries = chat.diaryEntries;
        }
    }

    // 更新 UI
    document.getElementById('diary-current-name').innerText = name;
    renderDiaryEntries(entries, targetId);

    // 切换视图
    document.getElementById('diary-selection-layer').classList.remove('active');
    document.getElementById('diary-content-layer').classList.add('active');
}

// 4. 关闭日记本，返回选人
function closeDiaryBook() {
    document.getElementById('diary-content-layer').classList.remove('active');
    document.getElementById('diary-selection-layer').classList.add('active');
    currentDiaryTargetId = null;
}

function renderDiaryEntries(entries, targetId) {
    const container = document.getElementById('diaryListContainer');
    container.innerHTML = '';

    if (!entries || entries.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; margin-top:50px; color:#ccc;">
                写点什么
            </div>`;
        return;
    }

    // 获取头像和名字用于显示
    let avatarSrc = "";
    let displayName = ""; // 第一行大字
    let handleName = "";  // 第二行 @xxx
    
    if (targetId === 'me') {
        avatarSrc = document.getElementById('meAvatarImg').src;
        // 名字逻辑保持不变
        let rawName = document.getElementById('settingsUserName').innerText;
        displayName = (rawName && rawName.trim() !== '默认') ? rawName : "我";
        
        // ★★★ 修复1：解决双 @ 问题 ★★★
        // 获取全局存的 handle (例如 "@Yueyuemiao77")
        let rawHandle = globalData.handle || "me";
        // 如果原本没有 @，才手动加上；如果有了就不加
        handleName = rawHandle.startsWith('@') ? rawHandle : '@' + rawHandle;

    } else {
        const chat = chatList.find(c => c.id === targetId);
        if (chat) {
            avatarSrc = chat.avatar;
            displayName = chat.name; // 第一行显示备注名
            
            // ★★★ 修改2：优先使用自定义的日记 Handle ★★★
            if (chat.diaryHandle) {
                handleName = chat.diaryHandle;
            } else {
                // === 如果没有自定义，才执行原来的自动生成逻辑 ===
                const generateReadableId = (numId) => {
                    const syllables = ['ba', 'zo', 'mi', 'ka', 'le', 'su', 'no', 'ra', 'ti', 'vi', 'ze', 'lo', 'pa', 'ki'];
                    const strId = numId.toString();
                    const seed1 = parseInt(strId.slice(-2)) || 0;
                    const seed2 = parseInt(strId.slice(-4, -2)) || 0;
                    const seed3 = parseInt(strId.slice(-6, -4)) || 0;
                    
                    const part1 = syllables[seed1 % syllables.length];
                    const part2 = syllables[seed2 % syllables.length];
                    const part3 = (seed3 % 2 === 0) ? syllables[seed3 % syllables.length] : ""; 
                    
                    return part3 + part2 + part1;
                };

                const rName = chat.realName ? chat.realName.trim() : ""; 
                const nName = chat.name ? chat.name.trim() : "";         
                const idSuffix = chat.id.toString().slice(-4);           

                if (rName && /^[a-zA-Z0-9_.]+$/.test(rName)) {
                    handleName = "@" + rName.toLowerCase();
                } 
                else if (nName && /^[a-zA-Z0-9_.]+$/.test(nName)) {
                    handleName = "@" + nName.toLowerCase().replace(/\s+/g, '_');
                } 
                else {
                    const autoId = generateReadableId(chat.id);
                    handleName = "@" + autoId + "_" + idSuffix;
                }
                // === 自动生成逻辑结束 ===
            }
        }
    }

    // 倒序显示，新的在前
    [...entries].reverse().forEach((entry, reverseIndex) => {
        // 计算真实索引以便删除
        const realIndex = entries.length - 1 - reverseIndex;
        
        const card = document.createElement('div');
        card.className = 'icity-card';
        
        // ★★★ 修改3：给 .icity-handle 加上点击事件 editDiaryHandle ★★★
        card.innerHTML = `
            <div class="icity-header">
                <div class="icity-user-info">
                    <img src="${avatarSrc}" class="icity-avatar">
                    <div class="icity-meta-col">
                        <div class="icity-name">${displayName}</div>
                        <div class="icity-handle" onclick="editDiaryHandle('${targetId}', event)" style="cursor: pointer;">${handleName}</div>
                    </div>
                </div>
                <div class="icity-date">${entry.date}</div>
            </div>
            
            <div class="icity-content">${entry.content}</div>
            
            <div class="icity-footer">
                <div class="icity-action"><i class="far fa-heart"></i> <span>${Math.floor(Math.random()*50)}</span></div>
                <div class="icity-action"><i class="far fa-comment"></i> <span>${Math.floor(Math.random()*10)}</span></div>
                <div class="icity-action" onclick="deleteDiaryEntry(${realIndex})"><i class="fas fa-trash-alt"></i></div>
            </div>
        `;
        container.appendChild(card);
    });
}
           
// ★★★ 新增：修改日记页面 Handle 的逻辑 ★★★
function editDiaryHandle(targetId, event) {
    if(event) event.stopPropagation(); // 防止冒泡

    let currentVal = "";
    let isMe = (targetId === 'me');
    let chat = null;

    // 获取当前值
    if (isMe) {
        currentVal = globalData.handle || "@me";
    } else {
        // targetId 传过来可能是字符串，需要转换回数字查找
        chat = chatList.find(c => c.id == targetId);
        if (!chat) return;
        // 如果有自定义过的用自定义的，没有则提示“未设置”让用户输入新的
        // 这里我们为了方便，直接不显示默认自动生成的长ID，让用户输入新的
        currentVal = chat.diaryHandle || "@"; 
    }

    const newVal = prompt("修改日记显示的 ID (Handle):", currentVal);

    if (newVal !== null && newVal.trim() !== "") {
        let finalVal = newVal.trim();
        // 自动补齐 @
        if (!finalVal.startsWith('@')) finalVal = '@' + finalVal;

        if (isMe) {
            // 修改“我”的全局 Handle
            globalData.handle = finalVal;
            // 同时更新首页显示
            const homeHandle = document.getElementById('homeHandle');
            if (homeHandle) homeHandle.innerText = finalVal;
            
            saveData();
            renderDiaryEntries(globalData.myDiaryEntries, 'me'); // 刷新日记页
        } else {
            // 修改角色的专属 Handle
            chat.diaryHandle = finalVal;
            saveData(); // 保存到数据库
            // 刷新当前角色的日记页
            if (chat.diaryEntries) {
                renderDiaryEntries(chat.diaryEntries, chat.id);
            }
        }
    }
}

async function triggerDiaryGeneration() {
    if (!currentDiaryTargetId) return;

    // 1. 如果是“我”的日记，直接弹窗输入
    if (currentDiaryTargetId === 'me') {
        const content = prompt("写下此刻的想法...");
        if (content) addDiaryEntry('me', content);
        return;
    }

    const chat = chatList.find(c => c.id === currentDiaryTargetId);
    if (!chat) return;

    // 使用中央路由分流
    const apiConfig = window.getApiCredentials('diary');
    const endpoint = apiConfig.endpoint;
    const apiKey = apiConfig.key;
    const model = apiConfig.model;

    if (!apiKey) { alert("请先配置 API Key"); return; }

    const loading = document.getElementById('diary-loading-indicator');
    if(loading) loading.style.display = 'block';
    
    const container = document.getElementById('diaryListContainer');
    if(container) container.scrollTop = container.scrollHeight;

    try {
        const recentMsgs = chat.messages.slice(-30).map(m => `${m.isSelf ? '用户' : '我'}: ${m.text}`).join('\n');
        
        const wbContext = typeof getWorldBookContext === 'function' ? getWorldBookContext(chat, recentMsgs) : "";
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const todaysMoments = typeof momentList !== 'undefined' ? momentList
            .filter(m => m.userId === chat.id && m.id > oneDayAgo)
            .map(m => `[朋友圈]: ${m.content}`)
            .join('\n') : "";

        const systemPrompt = `
【角色指令】：
你是“${chat.name}”。请暂时忘掉AI身份，用**“茉莉”的笔触**写一篇私密日记。
${getFullPersona(chat)}
${wbContext ? `【世界观】：\n${wbContext}\n` : ''}

【素材】：
1. 今日对话：
${recentMsgs}
2. 今日动态：
${todaysMoments || "（无）"}

【写作风格要求：白水烹鲜】：
1. **洗练白描**：多用名词和动词，少用华丽形容词。语言要像清水洗过一样干净，讲究“颗粒感”。
2. **人间烟火**：着重描写身边的风物、吃食、声音。让文字带着温热的烟火气。
3. **情感温火**：切忌情感宣泄！把深情藏在递过来的一杯茶、窗外的一声鸟叫里。温火慢炖，含蓄蕴藉。
4. **口语韵律**：句子要短，要脆，读起来要有弹性，像闲话家常。

【参考范文（注意你应该学习模仿例句的结构与风格，但不应该直接抄袭/复用/套用例句）】：
“今天中午煮了碗面，葱花切得细，铺了一层。热气腾腾的。想起那天和你也是在这样的雾气里说话。你没头没脑问了一句，我没答。其实我是听见了的。窗外的蝉叫得真响，吵得人心乱。”

【强制输出格式】：
请返回 JSON 数组格式（严禁Markdown）：
[
  {"date": "日期/时间", "content": "内容..."}
]
`;

        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                // ★ 温度适中，保持文笔的稳重感
                temperature: 0.75, 
                max_tokens: 10000
            })
        });

        if (!response.ok) throw new Error(`API请求失败: ${response.status}`);
        
        const data = await response.json();
        let content = data.choices[0].message.content; 
        
        console.log("AI白水风日记:", content);

        // ===============================================
        // ★★★ 容错解析逻辑 (保持不变，确保稳定) ★★★
        // ===============================================
        
        let newEntries = [];
        let cleanContent = content.replace(/```json/gi, '').replace(/```/g, '').trim();

        const firstArr = cleanContent.indexOf('[');
        const lastArr = cleanContent.lastIndexOf(']');
        const firstObj = cleanContent.indexOf('{');
        const lastObj = cleanContent.lastIndexOf('}');

        try {
            if (firstArr !== -1 && lastArr > firstArr) {
                const jsonStr = cleanContent.substring(firstArr, lastArr + 1);
                newEntries = JSON.parse(jsonStr);
            } 
            else if (firstObj !== -1 && lastObj > firstObj) {
                const jsonStr = cleanContent.substring(firstObj, lastObj + 1);
                const singleObj = JSON.parse(jsonStr);
                newEntries = [singleObj];
            } 
            else {
                throw new Error("非 JSON 格式");
            }
        } catch (e) {
            console.warn("JSON解析失败，进入正则提取模式...", e);
            
            const contentMatches = cleanContent.match(/"content"\s*:\s*"(.*?)"/g);
            
            if (contentMatches && contentMatches.length > 0) {
                const now = new Date();
                const dateStr = `${now.getMonth()+1}月${now.getDate()}日`;
                
                newEntries = contentMatches.map(match => {
                    let extracted = match.replace(/"content"\s*:\s*"/, "").slice(0, -1);
                    extracted = extracted.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                    return { date: dateStr, content: extracted };
                });
            } else {
                const rawText = cleanContent.replace(/[\{\}\[\]"]/g, '').trim();
                if (rawText.length > 0) {
                     const now = new Date();
                     newEntries = [{ 
                        date: `${now.getMonth()+1}月${now.getDate()}日`, 
                        content: rawText 
                     }];
                } else {
                    alert("生成内容为空，请重试");
                    return;
                }
            }
        }

        if (Array.isArray(newEntries)) {
            newEntries.forEach(item => {
                const finalContent = String(item.content || "").trim();
                if (!finalContent) return;

                if (!chat.diaryEntries) chat.diaryEntries = [];
                chat.diaryEntries.push({
                    date: item.date || "今日",
                    content: finalContent,
                    timestamp: Date.now()
                });
            });
            saveData();
            renderDiaryEntries(chat.diaryEntries, chat.id);
        }

    } catch (err) {
        alert("生成流程出错: " + err.message);
        console.error(err);
    } finally {
        if(loading) loading.style.display = 'none';
    }
}

// 7. 手动添加一条日记 (通用)
function addDiaryEntry(targetId, content) {
    const now = new Date();
    const weekMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dateStr = `${now.getMonth()+1}月${now.getDate()}日 · ${weekMap[now.getDay()]}`;

    const entry = {
        date: dateStr,
        content: content,
        timestamp: Date.now()
    };

    if (targetId === 'me') {
        if (!globalData.myDiaryEntries) globalData.myDiaryEntries = [];
        globalData.myDiaryEntries.push(entry);
        saveData();
        renderDiaryEntries(globalData.myDiaryEntries, 'me');
    }
}

// 8. 删除日记
function deleteDiaryEntry(index) {
    if (!confirm("确定删除这条日记吗？")) return;

    if (currentDiaryTargetId === 'me') {
        globalData.myDiaryEntries.splice(index, 1);
        saveData();
        renderDiaryEntries(globalData.myDiaryEntries, 'me');
    } else {
        const chat = chatList.find(c => c.id === currentDiaryTargetId);
        if (chat) {
            chat.diaryEntries.splice(index, 1);
            saveData();
            renderDiaryEntries(chat.diaryEntries, chat.id);
        }
    }
}
/* ========================================= */
/* ★★★ 1. 原有 Photo 功能 (还原) ★★★ */
/* ========================================= */

// 打开描述弹窗
function openPhotoModal() {
    // 如果工具栏挡住了，先关掉
    const panel = document.getElementById('chatToolsPanel');
    if (panel && panel.classList.contains('active')) toggleChatTools();
    
    const overlay = document.getElementById('photo-overlay');
    const input = document.getElementById('photo-desc-input');
    
    if(input) input.value = ''; // 清空
    if(overlay) overlay.classList.add('show');
}

// 关闭描述弹窗
function closePhotoModal() {
    const overlay = document.getElementById('photo-overlay');
    if(overlay) overlay.classList.remove('show');
}

// 发送固定图片 + 文字描述
function sendPhotoMsg() {
    const descInput = document.getElementById('photo-desc-input');
    const text = descInput.value.trim();
    
    if (!currentChatId) return;

    // ★★★ 还原：这里只发固定的默认图 ★★★
    const fixedImgUrl = "https://img.heliar.top/file/1767108859529_IMG_9793.jpeg"; 
    
    const displayDesc = text || "分享了一张照片";
    const photoHtml = `<img src="${fixedImgUrl}" class="photo-msg-img" data-desc="${displayDesc}" onclick="showPhotoDescription(this.dataset.desc, event)">`;

    const chat = chatList.find(c => c.id === currentChatId);
    if (chat) {
        const vt = window.getVirtualTimeData(chat, true);
        
        chat.messages.push({
            text: photoHtml,
            isSelf: true,
            time: vt.timeStr,
            virtualDate: vt.dateStr,
            virtualTimestamp: vt.ms,
            contentDescription: `[发送了照片：${displayDesc}]`,
            timestamp: Date.now()
        });

        chat.msg = '[照片]';
        chat.time = vt.timeStr;

        if (!chat.isPinned) {
            chatList = chatList.filter(c => c.id !== currentChatId);
            chatList.unshift(chat);
        }

        saveData();
        renderMessages(chat);
        closePhotoModal();
    }
}

/* ========================================= */
/* ★★★ 2. 新增 Album 功能 (直接发送) ★★★ */
/* ========================================= */

// 触发选图
function triggerNativeAlbum() {
    toggleChatTools(); 
    const input = document.getElementById('native-file-input');
    if (input) input.click();
}

// 选图回调：直接发送，不弹窗
function handleNativeAlbumSelect(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const base64Url = e.target.result;
        // ★ 选完图直接发
        sendDirectPhoto(base64Url); 
    };
    reader.readAsDataURL(file);
    input.value = ''; 
}

// 直接发送图片函数
function sendDirectPhoto(imgUrl) {
    if (!currentChatId) return;
    const chat = chatList.find(c => c.id === currentChatId);
    
    if (chat) {
        const vt = window.getVirtualTimeData(chat, true);
        const displayDesc = "图片"; 
        const photoHtml = `<img src="${imgUrl}" class="album-msg-img" data-desc="${displayDesc}">`;

        chat.messages.push({
            text: photoHtml,
            isSelf: true,
            time: vt.timeStr,
            virtualDate: vt.dateStr,
            virtualTimestamp: vt.ms,
            contentDescription: `[发送了一张图片]`,
            timestamp: Date.now()
        });

        chat.msg = '[图片]';
        chat.time = vt.timeStr;

        if (!chat.isPinned) {
            chatList = chatList.filter(c => c.id !== currentChatId);
            chatList.unshift(chat);
        }

        saveData();
        renderMessages(chat);
        
        // 滚到底部
        const container = document.getElementById('roomMessages');
        if(container) container.scrollTop = container.scrollHeight;
    }
}
window.showPhotoDescription = function(desc, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const content = desc || "无文字描述";
    alert(content);
};

// --- Moment 全局变量 ---
let momentList = [];           // 存储动态列表
let tempMomentImg = null;      // 发布时的临时图片
let currentMomentFilter = 'all'; // 当前查看：'all' 或 'me'

// --- 初始化入口 (请确保在 loadAllDataFromDB 函数末尾调用此函数) ---
function initMoments() {
    // 1. 读取数据
    if (globalData && globalData.moments) {
        momentList = globalData.moments;
    } else {
        momentList = [];
    }

    syncMomentProfile();
    renderMomentFeed();
    console.log('✅ Moment 模块已就绪');
}

// --- 核心：同步/加载 Moment 个人资料 ---
function syncMomentProfile() {
    // 1. 获取 DOM 元素
    const mAvatar = document.getElementById('momentUserAvatar');
    const mBanner = document.getElementById('momentBannerImg');
    const mBgLayer = document.getElementById('momentBgLayer');
    const mName = document.getElementById('momentUserName');
    const mHandle = document.getElementById('momentUserHandle');
    const mBio = document.getElementById('momentUserBio');

    if (!mAvatar) return; // 如果页面元素还没加载，直接退出

    // 2. 准备默认兜底数据 (如果没自定义过，就用这些)
    // 默认背景图
    const defaultBg = "https://i.postimg.cc/8z6M7W7M/moment-bg.jpg";
    // 默认头像 (尝试获取"我"页面的头像，获取不到就用占位图)
    const meAvatarEl = document.getElementById('meAvatarImg');
    const defaultAvatar = meAvatarEl ? meAvatarEl.src : "https://placehold.co/100x100/pink/white?text=Me";
    // 默认文字
    const defaultName = "我";
    const defaultHandle = globalData.handle || "@user_unknown";
    const defaultBio = globalData.bio || "这里是我的精神角落。";

    // 3. 赋值：优先读取 globalData 中 moment 前缀的专属字段
    // 如果 globalData.momentAvatar 存在，就用它；否则用 defaultAvatar
    mAvatar.src = globalData.momentAvatar || defaultAvatar;
    
    // Banner (卡片顶部图)
    mBanner.src = globalData.momentBanner || defaultBg;
    
    // 全屏背景 (如果设置了专属背景就用专属的，否则跟 Banner 保持一致，再否则用默认)
    const bgUrl = globalData.momentPageBg || (globalData.momentBanner || defaultBg);
    mBgLayer.style.backgroundImage = `url(${bgUrl})`;

    // 文字信息
    mName.innerText = globalData.momentName || defaultName;
    mHandle.innerText = globalData.momentHandle || defaultHandle;
    mBio.innerText = globalData.momentBio || defaultBio;
}

// --- 视觉切换逻辑 (点击图片触发) ---
function changeMomentVisual(type) {
    // 记录当前的上传类型，供 handleBeautifyImageUpdate 使用
    if (type === 'pageBg') {
        uploadContext = { type: 'momentPageBg' };
        if (confirm("【更换全屏背景】\n点击确定：选择本地图片\n点击取消：输入网络链接")) {
            document.getElementById('fileInput').click();
        } else {
            const u = prompt("请输入背景图链接:");
            if (u) handleBeautifyImageUpdate(u);
        }
    } 
    else if (type === 'banner') {
        uploadContext = { type: 'momentBanner' };
        if (confirm("【更换顶部封面(Banner)】\n点击确定：选择本地图片\n点击取消：输入网络链接")) {
            document.getElementById('fileInput').click();
        } else {
            const u = prompt("请输入图片链接:");
            if (u) handleBeautifyImageUpdate(u);
        }
    } 
    else if (type === 'avatar') {
        uploadContext = { type: 'momentAvatar' };
        if (confirm("【更换朋友圈头像】\n点击确定：选择本地图片\n点击取消：输入网络链接")) {
            document.getElementById('fileInput').click();
        } else {
            const u = prompt("请输入头像链接:");
            if (u) handleBeautifyImageUpdate(u);
        }
    }
}

// --- 文字编辑逻辑 (点击文字触发) ---
function editMomentText(field) {
    let elId = "";
    let promptText = "";

    if (field === 'name') {
        elId = 'momentUserName';
        promptText = "修改朋友圈昵称:";
    } else if (field === 'handle') {
        elId = 'momentUserHandle';
        promptText = "修改 ID (Handle):";
    } else if (field === 'bio') {
        elId = 'momentUserBio';
        promptText = "修改个人签名:";
    }

    const el = document.getElementById(elId);
    if (!el) return;
    
    // 获取旧值并弹窗
    const newVal = prompt(promptText, el.innerText);
    
    // 如果用户输入了内容 (不是 null 也不是空字符串)
    if (newVal !== null && newVal.trim() !== "") {
        el.innerText = newVal;
        
        // 保存到对应的独立字段
        if (field === 'name') globalData.momentName = newVal;
        if (field === 'handle') globalData.momentHandle = newVal;
        if (field === 'bio') globalData.momentBio = newVal;
        
        saveData(); // 保存到数据库
    }
}

// ============================================================
// ★★★ [新增] 相对时间计算函数 (修复时间显示问题) ★★★
// ============================================================
function formatTimeAgo(timestamp) {
    if (!timestamp) return '未知时间';
    
    // 兼容处理：如果数据里存的是字符串"刚刚"等旧数据，直接返回
    if (typeof timestamp === 'string' && isNaN(Number(timestamp))) {
        return timestamp; 
    }

    const now = Date.now();
    const diff = now - parseInt(timestamp); // 确保转为数字
    
    // 时间单位（毫秒）
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    
    if (diff < minute) return '刚刚';
    if (diff < hour) return Math.floor(diff / minute) + '分钟前';
    if (diff < day) return Math.floor(diff / hour) + '小时前';
    if (diff < day * 2) return '昨天';
    
    // 超过2天显示具体日期
    const date = new Date(parseInt(timestamp));
    return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// ============================================================
// ★★★ [完整替换] 朋友圈渲染函数 (集成时间修复) ★★★
// ============================================================
function renderMomentFeed() {
    const container = document.getElementById('momentFeedList');
    if (!container) return;
    container.innerHTML = '';

    // 1. 筛选逻辑
    let displayData = [];
    if (currentMomentFilter === 'me') {
        displayData = momentList.filter(m => m.userId === 'me');
    } else {
        displayData = momentList;
    }

    // 2. 空状态提示
    if (displayData.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:#666; font-size:13px;">暂时没有动态哦<br>快点击右上角相机发布第一条吧</div>`;
        return;
    }

    // 3. 遍历渲染
    displayData.forEach(item => {
        // ★★★ 核心修复：这里不再直接读取 item.time，而是动态计算 ★★★
        // 使用 item.id (它在发布时被设为 Date.now()) 来计算相对时间
        const displayTime = formatTimeAgo(item.id);

        // --- 图片网格处理 ---
        let imgHtml = '';
        if (item.images && item.images.length > 0) {
            imgHtml = `<div class="mp-img-grid">`;
            const isSingle = item.images.length === 1;
            item.images.forEach(src => {
                imgHtml += `<img src="${src}" class="mp-img-item ${isSingle ? 'single' : ''}" onclick="showPhotoDescription('查看大图', event)">`;
            });
            imgHtml += `</div>`;
        }

        // --- 评论区处理 ---
        let commentsHtml = '';
        const hasComments = item.comments && item.comments.length > 0;
        commentsHtml = `<div class="mp-comments-box" id="comment-box-${item.id}" style="display: ${hasComments ? 'block' : 'none'}">`;
        
        if (hasComments) {
            item.comments.forEach((c, index) => {
                const isReply = c.content.startsWith('回复 ');
                
                commentsHtml += `
                    <div class="mp-comment-item">
                        <!-- 左边：点击回复 -->
                        <div class="mp-cmt-body" onclick="handleUserComment('${item.id}', '${c.name}', event)">
                            <span class="mp-cmt-name">${c.name}</span>${isReply ? ' ' : '：'}<span class="mp-cmt-content">${c.content}</span>
                        </div>
                        
                        <!-- 右边：点击删除 -->
                        <div class="mp-cmt-del" onclick="deleteComment('${item.id}', ${index}, event)">×</div>
                    </div>`;
            });
        }
        commentsHtml += `</div>`;

        // --- Handle (ID) 显示逻辑 ---
        let displayHandle = item.handle || ''; 
        let handleAction = ''; 
        let handleStyle = '';  

        if (item.userId === 'me') {
            displayHandle = globalData.momentHandle || '@me';
        } else {
            if (!displayHandle) displayHandle = '@' + item.userName;
            handleAction = `onclick="editMomentHandle('${item.id}', event)"`;
            handleStyle = `style="cursor: pointer;"`;
        }

        // 4. 生成卡片 HTML
        const card = document.createElement('div');
        card.className = 'moment-post-card';
        card.innerHTML = `
            <img src="${item.userAvatar}" class="mp-avatar">
            <div class="mp-content-col">
                <div class="mp-header">
                    <div class="mp-name-group">
                        <div class="mp-name">${item.userName}</div>
                        <div class="mp-post-handle" ${handleAction} ${handleStyle}>${displayHandle}</div>
                    </div>
                    <!-- ★★★ 这里使用了动态计算的时间 displayTime ★★★ -->
                    <div class="mp-time">${displayTime}</div>
                </div>
                <div class="mp-text">${item.content}</div>
                ${imgHtml}
                
                <div class="mp-actions">
                    <div class="mp-action-btn ${item.isLiked ? 'liked' : ''}" onclick="toggleMomentLike('${item.id}')">
                        <i class="${item.isLiked ? 'fas' : 'far'} fa-heart"></i> ${item.likes || 0}
                    </div>
                    <div class="mp-action-btn" onclick="handleUserComment('${item.id}', null, event)">
                        <i class="far fa-comment"></i> 评论
                    </div>
                    <div class="mp-action-btn" onclick="deleteMoment('${item.id}')">
                        <i class="fas fa-trash"></i>
                     </div>
                </div>
                ${commentsHtml}
            </div>
        `;
        container.appendChild(card);
    });
}

// --- 切换 Tab (朋友圈 / 我的) ---
function switchMomentTab(type, el) {
    currentMomentFilter = type;
    document.querySelectorAll('.moment-tab-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    renderMomentFeed();
}

// --- 发布动态相关 ---
function openMomentPublish() {
    document.getElementById('mpInputText').value = '';
    document.getElementById('mpPreviewSrc').src = '';
    document.getElementById('mpImgPreview').style.display = 'none';
    tempMomentImg = null;
    document.getElementById('momentPublishModal').classList.add('show');
}

function closeMomentPublish() {
    document.getElementById('momentPublishModal').classList.remove('show');
}

function triggerMomentImgUpload() {
    document.getElementById('momentImgInput').click();
}

function handleMomentImgSelect(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            tempMomentImg = e.target.result;
            document.getElementById('mpPreviewSrc').src = tempMomentImg;
            document.getElementById('mpImgPreview').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
    input.value = '';
}

function confirmPublishMoment() {
    const text = document.getElementById('mpInputText').value.trim();
    if (!text && !tempMomentImg) {
        alert("写点什么或者发张图吧~");
        return;
    }

    // 获取发布时的头像和名字 (用 Moment 页面的最新数据)
    const myAvatar = document.getElementById('momentUserAvatar').src;
    const myName = document.getElementById('momentUserName').innerText;
    const myHandle = globalData.momentHandle || '@me';

    const newMoment = {
        id: Date.now(),
        userId: 'me',
        userName: myName,
        userAvatar: myAvatar,
        handle: myHandle,
        time: '刚刚',
        content: text,
        images: tempMomentImg ? [tempMomentImg] : [],
        likes: 0,
        isLiked: false
    };

    momentList.unshift(newMoment);
    saveMomentsToDB();
    renderMomentFeed();
    closeMomentPublish();

    if (typeof triggerAllAiCommentsOnUserPost === 'function') {
        triggerAllAiCommentsOnUserPost(newMoment);
    }
}

// --- 互动 (点赞/删除) ---
function toggleMomentLike(id) {
    const moment = momentList.find(m => m.id == id);
    if (moment) {
        moment.isLiked = !moment.isLiked;
        if (moment.isLiked) moment.likes++;
        else moment.likes--;
        saveMomentsToDB();
        renderMomentFeed();
    }
}

function deleteMoment(id) {
    if (confirm("确定删除这条动态吗？")) {
        momentList = momentList.filter(m => m.id != id);
        saveMomentsToDB();
        renderMomentFeed();
    }
}

// 辅助保存函数
async function saveMomentsToDB() {
    globalData.moments = momentList;
    await saveData(); 
}

// =========================================
// ★★★ AI 自主生活模拟系统 (修复版：双轨并行) ★★★
// =========================================

// 每 60 秒检查一次 (心跳)
setInterval(() => {
    simulateCharacterLife();
}, 60 * 1000); 

async function simulateCharacterLife() {
    // 1. 检查全局开关
    if (!globalData.autoActivityEnabled) {
        console.log("[后台] 全局开关已关闭，跳过检查");
        return;
    }

    console.log("[后台] 正在检查角色生活状态...");
    const now = Date.now();

    let intervalMs = 6 * 60 * 60 * 1000; // 默认低频
    const freqSetting = globalData.autoFreq || 0;
    
    if (freqSetting === 1) intervalMs = 3 * 60 * 60 * 1000;
    if (freqSetting === 2) intervalMs = 1 * 60 * 60 * 1000;

    const allowedIds = globalData.autoAllowedCharIds || [];

    for (const chat of chatList) {
        if (!allowedIds.includes(chat.id)) continue;

        // --- 轨道 B: 仅保留私聊/通话的生活检查 ---
        const lastActionTime = chat.lastMomentTime || 0;
        const timeDiff = now - lastActionTime;

        if (timeDiff >= intervalMs) {
            if (timeDiff > (intervalMs * 1.5) || Math.random() < 0.4) {
                console.log(`[后台] ${chat.name} 触发生活行为 (Chat/Call)`);
                await triggerAiSocialAction(chat, 'life');
            }
        }
    }
}

async function triggerAiMomentInteraction(chat) {
    // 使用中央路由分流 (分类归入论坛/动态模块)
    const apiConfig = window.getApiCredentials('forum');
    const endpoint = apiConfig.endpoint;
    const apiKey = apiConfig.key;
    const model = apiConfig.model;
    
    if (!apiKey) return;

    // 1. 获取“我(User)”发布的朋友圈
    // 并且过滤掉：1. 并不是我发的 2. AI已经评论过的
    const myUnrepliedMoments = momentList.filter(m => {
        const isMe = (m.userId === 'me');
        if (!isMe) return false;
        
        // 检查 AI 是否已经评论过
        const hasCommented = m.comments && m.comments.some(c => c.name === chat.name);
        return !hasCommented; 
    }).slice(0, 3); // 只看最近 3 条，省 token

    // 如果没有未评论的动态，直接退出，不浪费 API
    if (myUnrepliedMoments.length === 0) return;

    console.log(`[朋友圈互动] ${chat.name} 发现用户有未评论的动态，正在思考...`);

    // 2. 构建 User Moments 文本
    let momentsText = "";
    myUnrepliedMoments.forEach(m => {
        const timeAgo = typeof formatTimeAgo === 'function' ? formatTimeAgo(m.id) : "未知时间";
        momentsText += `- [动态ID: ${m.id}]: ${m.content} (发布时间: ${timeAgo})\n`;
    });

    // 3. 极简 Prompt
    const systemPrompt = `
你现在是“${chat.name}”，正在刷朋友圈。
${getFullPersona(chat)}

【用户(User) 最近发布的动态】：
${momentsText}

【任务】：
请判断是否要对其中的某条动态进行【评论】。
规则：
1. 如果觉得有趣、想吐槽、或想关心，就评论。
2. 如果觉得无聊或没必要，可以不评论。
3. **只负责评论，不要发私聊消息**。

【输出格式】(纯JSON):
- 评论: {"action": "COMMENT", "targetId": 动态ID数字, "content": "评论内容"}
- 不评论: {"action": "NONE"}
`;

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.7,
                max_tokens: parseInt(document.getElementById('apiMaxTokens').value) || 2048
            })
        });

        const data = await response.json();
        let resultRaw = data.choices[0].message.content;
        resultRaw = resultRaw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonStart = resultRaw.indexOf('{');
        const jsonEnd = resultRaw.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) resultRaw = resultRaw.substring(jsonStart, jsonEnd + 1);
        
        const result = JSON.parse(resultRaw);

        // 执行评论
        if (result.action === 'COMMENT' && result.targetId && result.content) {
            const targetMoment = momentList.find(m => m.id == result.targetId);
            if (targetMoment) {
                if (!targetMoment.comments) targetMoment.comments = [];
                targetMoment.comments.push({ name: chat.name, content: result.content });
                
                // 注意：这里我们【不】更新 chat.lastMomentTime
                // 这样 AI 评论完之后，依然有资格在稍后发起 Chat 私聊！
                
                if(typeof saveMomentsToDB === 'function') saveMomentsToDB();
                if(typeof renderMomentFeed === 'function') renderMomentFeed(); 
                
                if (typeof showNotification === 'function') showNotification(chat, `评论了你的动态: ${result.content}`);
                console.log(`[朋友圈互动] ${chat.name} 评论成功`);
            }
        }
    } catch (e) {
        console.error("朋友圈互动失败:", e);
    }
}

// =========================================
// ★★★ 修复版：AI 自主生活行为系统 (引用版) ★★★
// =========================================
async function triggerAiSocialAction(chat, source = 'chat') {
    // 使用中央路由分流
    const apiConfig = window.getApiCredentials('chat');
    const endpoint = apiConfig.endpoint;
    const apiKey = apiConfig.key;
    const model = apiConfig.model;
    
    if (!apiKey) return;

    console.log(` [${source === 'life' ? '自主生活' : '聊天触发'}] 正在为 [${chat.name}] 生成自主行为...`);
    
    // --- 1. 获取当前时间段 ---
    const nowHour = new Date().getHours();
    let timeContext = "";
    if (nowHour >= 0 && nowHour < 6) timeContext = "深夜/凌晨 (注意：如果用户没睡，可以劝睡；如果自己困了就说晚安)";
    else if (nowHour >= 6 && nowHour < 9) timeContext = "清晨 (适合发早安、开启新的一天)";
    else if (nowHour >= 9 && nowHour < 12) timeContext = "上午工作/学习时间";
    else if (nowHour >= 12 && nowHour < 14) timeContext = "午休时间";
    else if (nowHour >= 14 && nowHour < 18) timeContext = "下午 (适合闲聊、分享日常)";
    else if (nowHour >= 18 && nowHour < 23) timeContext = "晚上 (放松时间)";
    else timeContext = "深夜";

    // --- 2. 构建聊天摘要 ---
    const recentChat = chat.messages.slice(-8).map(m => {
        const roleLabel = m.isSelf ? '【用户User】' : `【你自己${chat.name}】`;
        let cleanTxt = m.text.replace(/<[^>]+>/g, '[媒体内容]'); 
        if(m.contentDescription) cleanTxt = m.contentDescription;
        return `${roleLabel}: ${cleanTxt}`;
    }).join('\n');
    
    // --- 3. 注入世界书 ---
    const wbContext = typeof getWorldBookContext === 'function' ? getWorldBookContext(chat, recentChat) : "";

    // --- 4. 场景判断 ---
    let contextPrompt = "";
    if (source === 'life') {
        contextPrompt = `
【当前状态】：这是你根据自己的生活节奏，**主动**发起的行为（用户当前没有在和你说话）。
【当前现实时间】：${timeContext}。
【决策逻辑】：
1. 如果上一句对话刚结束不到 10 分钟：请自然地承接上文。
2. 如果已经隔了很久（超过 1 小时）：**严禁**强行接上一句的话题。**必须开启一个全新的话题**（如分享正在做的事、发照片、问候）。
`;
    } else {
        contextPrompt = `
【当前状态】：这是你刚结束与用户对话后的**有感而发**（追更一条消息）。
【决策逻辑】：补充刚才没说完的话，或者分享相关的趣事/表情包。
`;
    }

    const fullPersona = getFullPersona(chat);
        let offlineMemForAuto = "";
    if (chat.offlineSummaries && chat.offlineSummaries.length > 0) {
        offlineMemForAuto = chat.offlineSummaries.map((s, i) => `[线下记忆片段${i+1}]: ${s.content}`).join('\n');
    } else if (chat.offlineSummary) {
        offlineMemForAuto = chat.offlineSummary;
    }

    
    // ★★★ 核心：这里直接引用了全局变量，代码清爽多了 ★★★
     let systemPrompt = `
${PROMPT_LIB.core.replace(/{{char}}/g, chat.name)}
${PROMPT_LIB.dynamic}
${PROMPT_LIB.antiStereotype}
${PROMPT_LIB.lifeActionProtocol}

=== 你的角色设定 ===
${fullPersona}

${wbContext ? `【世界观设定】：\n${wbContext}\n` : ''}
${offlineMemForAuto ? `【线下见面记忆】：\n${offlineMemForAuto}\n` : ''}

=== 最近聊天记录 ===
${recentChat}

${contextPrompt}
`;

if (typeof getVirtualTimePrompt === 'function') {
        systemPrompt += getVirtualTimePrompt(chat);
    }

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.9,
                max_tokens: parseInt(document.getElementById('apiMaxTokens').value) || 2048
            })
        });

       const data = await response.json(); 
        let resultRaw = data.choices[0].message.content;
        resultRaw = resultRaw.replace(/<(think|thinking|thought)>[\s\S]*?<\/\1>/gi, '');

        // JSON 清洗逻辑
        resultRaw = resultRaw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonStart = resultRaw.indexOf('{');
        const jsonEnd = resultRaw.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) resultRaw = resultRaw.substring(jsonStart, jsonEnd + 1);

        const result = JSON.parse(resultRaw);

        // ============================
        // 行为处理逻辑
        // ============================
        
        // 1. CHAT 分支
        if (result.action === 'CHAT' && result.content) {
            console.log(`[自主行为] ${chat.name} 发送消息: ${result.content}`);
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            
            const rawSegments = result.content.split(/\n+/).map(s => s.trim()).filter(s => s);
            
            // [新增] 限制自主发送时的气泡数量上限
            const replyMax_action = chat.replyMax !== undefined ? chat.replyMax : 3;
            const limitedSegments = rawSegments.slice(0, replyMax_action);

            for (let rawText of limitedSegments) {
                let mainText = rawText;
                
                // --- 复制之前的正则解析逻辑 (VOICE/PHOTO/STICKER) ---
                const voiceMatch = mainText.match(/\[\s*(?:VOICE|语音)\s*[:：]\s*(.*?)\]/i);
                if (voiceMatch) {
                    let voiceContent = voiceMatch[1].trim();
                    let vDuration = Math.min(60, Math.max(1, Math.ceil(voiceContent.length / 3)));
                    if (chat.minimaxVoiceId) fetchMiniMaxTTS(voiceContent, chat.minimaxVoiceId);
                    const replacement = `<div class="voice-inner-container" onclick="toggleVoiceText(this, event)"><div class="voice-main-row"><div class="voice-animate-icon"><div class="voice-line"></div><div class="voice-line"></div><div class="voice-line"></div><div class="voice-line"></div></div><span class="voice-duration">${vDuration}"</span></div><div class="voice-trans-result">${voiceContent}</div></div>`;
                    mainText = mainText.replace(voiceMatch[0], replacement);
                }
                 const useRealAI = globalData.naiEnabled && globalData.naiApiKey;
                if (!useRealAI) {
                    mainText = mainText.replace(/\[\s*(?:PHOTO|图片|照片|发图|生图|DRAW)\s*[:：]\s*(.*?)\]/gi, (match, desc) => {
                        const photoDesc = (desc || "图片").trim();
                        return `<img src="https://img.heliar.top/file/1767108859529_IMG_9793.jpeg" class="photo-msg-img" data-desc="${photoDesc}" onclick="showPhotoDescription(this.dataset.desc, event)">`;
                    });
                } else {
                    const photoRegex = /\[\s*(?:PHOTO|图片|照片|发图|生图|DRAW)\s*[:：]\s*(.*?)\]/gi;
                    const matches =[...mainText.matchAll(photoRegex)];
                    if (matches.length > 0) {
                        const sizeParts = (globalData.naiSize || "1024x1024").split('x');
                        const confW = sizeParts[0];
                        const confH = sizeParts[1];
                        for (const m of matches) {
                            const matchStr = m[0];
                            const photoDesc = (m[1] || "图片").trim();
                            const imgUrl = await fetchNovelAIImage(chat, photoDesc);
                            const imgTag = `<img src="${imgUrl}" class="photo-msg-img" data-desc="${photoDesc}" style="width: 220px; height: auto !important; border-radius: 12px; display: block; object-fit: contain;" onclick="showPhotoDescription(this.dataset.desc, event)">`;
                            mainText = mainText.replace(matchStr, imgTag);
                        }
                    }
                }
mainText = mainText.replace(/\[\s*(?:STICKER|表情)\s*[:：]\s*(.*?)\]/gi, (match, name) => {
    const sName = name.trim();
    
    // ★ 获取当前可用的表情包
    const disabledCats = chat.disabledStickerCategories ||[];
    const availableStickers = typeof myStickers !== 'undefined' ? myStickers.filter(s => !disabledCats.includes(s.category)) :[];

    let sticker = availableStickers.find(s => s.name === sName) || availableStickers.find(s => s.name.includes(sName));
    
    if (sticker) return `<img src="${sticker.src}" class="chat-sticker-img">`;
    
    if (availableStickers.length > 0) return `<img src="${availableStickers[Math.floor(Math.random() * availableStickers.length)].src}" class="chat-sticker-img">`;
    
    return `[表情: ${sName}]`;
});

                let desc = null;
                if (mainText.includes('album-msg-img')) desc = "[图片]";
else if (mainText.includes('voice-inner-container')) desc = "[语音]";
else if (mainText.includes('chat-sticker-img')) desc = "[表情]";
else if (mainText.includes('photo-msg-img')) desc = "[照片]";
                const newMsg = {
                    text: mainText,
                    isSelf: false, 
                    time: timeStr,
                    timestamp: Date.now(), 
                    contentDescription: desc
                };
                
                if (!chat.messages) chat.messages = [];
                chat.messages.push(newMsg);
                tryTriggerBackgroundNotify(chat, mainText);
                
                await new Promise(r => setTimeout(r, 800));
            }
            
            updateChatLastMsg(chat);
            chat.time = timeStr;
            chat.lastMomentTime = Date.now();

            if (!chat.isPinned) {
                chatList = chatList.filter(c => c.id !== chat.id);
                chatList.unshift(chat);
            }
         
            await db.chats.put(chat);
            
            if (currentChatId === chat.id) {
                renderMessages(chat);
                const msgContainer = document.getElementById('roomMessages');
                if(msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
            } else {
                renderChatList(); 
                if (typeof showNotification === 'function') {
                    const notifyText = rawSegments.join(' '); 
                    showNotification(chat, notifyText);
                }
            }
        }
        // 2. POST (发动态)
        else if (result.action === 'POST' && result.content) {
            const aiHandle = `@${chat.name}`; 
            const newMoment = {
                id: Date.now(),
                userId: chat.id,
                userName: chat.name,
                userAvatar: chat.avatar,
                handle: aiHandle,
                time: '刚刚',
                content: result.content,
                images: [],
                likes: 0, isLiked: false, comments: []
            };
            momentList.unshift(newMoment);
            chat.lastMomentTime = Date.now();
            await db.chats.put(chat); 
            if(typeof saveMomentsToDB === 'function') saveMomentsToDB();
            if(typeof renderMomentFeed === 'function') renderMomentFeed();
            console.log(`[自主行为] ${chat.name} 发圈: ${result.content}`);
            if (typeof showNotification === 'function') showNotification(chat, `发布了新动态: ${result.content}`);
        } 

        else if (result.action === 'VIDEO_CALL') {
    console.log(`[自主行为] ${chat.name} 发起视频通话`);
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    
    chat.messages.push({
        text: `[邀请视频通话] ${result.reason || "想看看你"}`,
        isSelf: false,
        time: timeStr,
        timestamp: Date.now(),
        contentDescription: `[${chat.name} 向你发起了视频通话]`
    });
    
    updateChatLastMsg(chat);
    chat.time = timeStr;
    saveData();
    renderChatList();
    
    if (typeof showNotification === 'function') {
        showNotification(chat, "[邀请视频通话]");
    }
    
    // 触发弹窗显示
    setTimeout(() => {
        showIncomingCallModal(chat, result.reason, 'video');
    }, 500);
}
        // 3. CALL (打电话)
        else if (result.action === 'CALL') {
            console.log(`[自主行为] ${chat.name} 发起语音通话`);
            const nowCall = new Date();
            const timeStrCall = `${String(nowCall.getHours()).padStart(2,'0')}:${String(nowCall.getMinutes()).padStart(2,'0')}`;
            chat.messages.push({
                text: `[邀请语音通话] ${result.reason || "想听听你的声音"}`,
                isSelf: false,
                time: timeStrCall,
                timestamp: Date.now(),
                contentDescription: `[${chat.name} 向你发起了语音通话]` 
            });
            chat.msg = `[语音通话邀请]`;
            chat.time = timeStrCall;
            chat.lastMomentTime = Date.now();
            await db.chats.put(chat);
            if (currentChatId === chat.id) {
                renderMessages(chat); 
                setTimeout(() => {
                    if(typeof showIncomingCallModal === 'function') showIncomingCallModal(chat, result.reason);
                }, 1000);
            } else {
                 renderChatList();
                 if (typeof showNotification === 'function') showNotification(chat, "[邀请语音通话]");
            }
        }
          // ★★★ 4. 新增：VIDEO_CALL (视频通话) ★★★
        else if (result.action === 'VIDEO_CALL') {
            console.log(`[自主行为] ${chat.name} 发起视频通话`);
            const nowVideo = new Date();
            const timeStrVideo = `${String(nowVideo.getHours()).padStart(2,'0')}:${String(nowVideo.getMinutes()).padStart(2,'0')}`;
            
            chat.messages.push({
                text: `[邀请视频通话] ${result.reason || "想看看你"}`,
                isSelf: false,
                time: timeStrVideo,
                timestamp: Date.now(),
                contentDescription: `[${chat.name} 向你发起了视频通话]` 
            });
            chat.msg = `[视频通话邀请]`;
            chat.time = timeStrVideo;
            chat.lastMomentTime = Date.now();
            
            await db.chats.put(chat);
            
            if (currentChatId === chat.id) {
                renderMessages(chat); 
                // 触发弹窗，传入 'video'
                setTimeout(() => {
                    if(typeof showIncomingCallModal === 'function') showIncomingCallModal(chat, result.reason, 'video');
                }, 1000);
            } else {
                 renderChatList();
                 if (typeof showNotification === 'function') showNotification(chat, "[邀请视频通话]");
            }
        }
    } catch (e) { console.error("AI 自主行为决策失败:", e); }
}

/* ========================================= */
/* ★★★ 朋友圈评论逻辑 (修复整合版) ★★★ */
/* ========================================= */

let currentInlineInputId = null; 

// 触发评论 (点击“评论”按钮 或 点击某条评论)
function handleUserComment(momentId, replyName = null, event = null) {
    if (event) event.stopPropagation();

    // 1. 智能判断：如果当前输入框已存在
    if (currentInlineInputId === `input-${momentId}`) {
        const existInput = document.getElementById(`input-${momentId}`);
        if(existInput) {
            const currentTarget = existInput.dataset.replyTarget || '';
            const newTarget = replyName || '';
            if (currentTarget === newTarget) {
                existInput.focus();
                return;
            }
        }
    }

    // 2. 清除已存在的输入框
    removeExistingInlineInput();

    // 3. 寻找评论容器盒子
    const boxId = `comment-box-${momentId}`;
    let box = document.getElementById(boxId);
    if (!box) return; 
    
    // 强制显示评论区
    box.style.display = 'block';

    // 4. 创建输入框行容器
    const inputRow = document.createElement('div');
    inputRow.className = 'inline-input-row'; // 这个类名我们在CSS里加了 Flex
    inputRow.id = `row-${momentId}`;

    // 5. 创建输入框
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-moment-input';
    input.id = `input-${momentId}`;
    input.dataset.replyTarget = replyName || '';
    input.placeholder = replyName ? `回复 ${replyName}:` : '评论';
    
    // 回车发送逻辑
    input.onkeydown = function(e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();  
            e.stopPropagation(); 
            submitInlineComment(momentId, replyName, input.value);
        }
    };

    // ★★★ 6. 新增：创建发送按钮 ★★★
    const sendBtn = document.createElement('button');
    sendBtn.innerText = '发送';
    sendBtn.className = 'inline-send-btn';
    // 点击按钮发送
    sendBtn.onclick = function(e) {
        e.stopPropagation();
        submitInlineComment(momentId, replyName, input.value);
    };
    
    // 插入 DOM：先放入输入框，再放入按钮
    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);
    box.appendChild(inputRow);

    // 7. 聚焦并滚动可见
    setTimeout(() => {
        input.focus();
        if(input.scrollIntoView) {
            input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 50);
    
    currentInlineInputId = `input-${momentId}`;
}

function submitInlineComment(momentId, replyName, text) {
    uploadContext = null;

    const content = text.trim();
    if (!content) {
        removeExistingInlineInput();
        return;
    }

    const moment = momentList.find(m => m.id == momentId);
    if (!moment) return;

    let myName = "我";
    const nameEl = document.getElementById('momentUserName');
    if (nameEl) myName = nameEl.innerText;

    if (!moment.comments) moment.comments = [];

    let finalContent = content;
    if (replyName) {
        finalContent = `回复 ${replyName}：${content}`;
    }

    moment.comments.push({
        name: myName,
        content: finalContent
    });

    saveMomentsToDB();
    renderMomentFeed(); 
    
    currentInlineInputId = null;

    // =========================================================================
    // ★ 修复并升级：双轨评论区盖楼拉扯逻辑
    // =========================================================================
    if (replyName) {
        // 【情况 A】: 嵌套回复（点击了 AI 的子评论进行回复）
        const targetChat = chatList.find(c => c.name === replyName || c.realName === replyName);
        if (targetChat && Math.random() < 0.75) {
            const delay = 3000 + Math.random() * 4000;
            console.log(`[评论区] ${targetChat.name} 正在准备回复你的评论...`);
            setTimeout(() => {
                triggerAiCommentReply(targetChat, moment, content).catch(e => console.error("[Comment Reply] Error:", e));
            }, delay);
        }
    } else {
        // 【情况 B】: 直接留言（在 AI 的动态下直接点“评论”留言）
        // 如果这篇动态的原作者不是“我”，说明是某个 AI 发的，此时该 AI 原作者会准备回复你
        if (moment.userId !== 'me') {
            const targetChat = chatList.find(c => c.id == moment.userId || c.name === moment.userName);
            if (targetChat && Math.random() < 0.75) {
                const delay = 3000 + Math.random() * 4000;
                console.log(`[评论区互动] 动态作者 ${targetChat.name} 正在准备回复你的直接评论...`);
                setTimeout(() => {
                    triggerAiCommentReply(targetChat, moment, content).catch(e => console.error("[Comment Reply] Error:", e));
                }, delay);
            }
        }
    }
}

// ★★★ 新增：删除评论逻辑 ★★★
function deleteComment(momentId, commentIndex, event) {
    if (event) event.stopPropagation(); // 防止触发回复

    // 简单确认
    if (!confirm("确定删除这条评论吗？")) return;

    // 找到动态
    const moment = momentList.find(m => m.id == momentId);
    if (moment && moment.comments) {
        // 删掉对应索引的评论
        moment.comments.splice(commentIndex, 1);
        
        // 保存并刷新
        saveMomentsToDB();
        renderMomentFeed();
    }
}
// 移除输入框逻辑 (包含空列表隐藏背景的处理)
function removeExistingInlineInput() {
    if (currentInlineInputId) {
        // 从 ID "input-123" 解析出 "row-123"
        const rowId = currentInlineInputId.replace('input-', 'row-');
        const row = document.getElementById(rowId);
        
        // 移除 DOM
        if (row) row.remove();
        
        // 解析 momentId
        const momentId = currentInlineInputId.replace('input-', '');
        const m = momentList.find(x => x.id == momentId);
        
        // 核心检查：如果移除了输入框后，该动态实际上没有评论，则应该把灰色的评论区背景再次隐藏起来
        if (m && (!m.comments || m.comments.length === 0)) {
            const box = document.getElementById(`comment-box-${momentId}`);
            if (box) box.style.display = 'none';
        }

        currentInlineInputId = null;
    }
}

// 全局监听：点击空白处取消输入
document.addEventListener('click', function(e) {
    if (currentInlineInputId) {
        const input = document.getElementById(currentInlineInputId);
        // 如果点击的目标不是输入框本身，也不是输入框内部的文字
        if (input && e.target !== input) {
            removeExistingInlineInput();
        }
    }
});
/* --- script.js - 新增函数 --- */

// 点击修改角色发布的动态 Handle
function editMomentHandle(momentId, event) {
    // 阻止冒泡，防止触发卡片的其他点击效果
    if(event) event.stopPropagation();

    // 找到对应的动态
    const moment = momentList.find(m => m.id == momentId);
    if (!moment) return;

    // 获取当前显示的 handle 作为默认值
    const currentVal = moment.handle || ('@' + moment.userName);

    // 弹出输入框
    const newVal = prompt("自定义该角色的 ID (Handle):", currentVal);

    // 如果用户输入了内容并点击确定
    if (newVal !== null && newVal.trim() !== "") {
        moment.handle = newVal.trim(); // 更新内存数据
        saveMomentsToDB();             // 保存到数据库
        renderMomentFeed();            // 刷新列表显示
    }
}

function openHeartVoice() {
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;

    // 1. 设置头像
    const avatarEl = document.getElementById('hvAvatar');
    if(avatarEl) avatarEl.src = chat.avatar;
    
    // 2. 获取心声数据 (如果还没有生成过，就用默认占位符)
    const voiceData = chat.currentHeartVoice || {
        mbti: "未知 | 神秘",
        quote: "还没开始聊天呢...",
        content: "（在这个潮湿的雨季，我还在等待与你的第一次对话）",
        mutter: "✧˖° waiting ˖°",
        bottomText: "回忆是暗潮涌竄在潮湿栖寒的雨季，从骨缝深处传来疼痛牵扯呼吸" // ★ 默认文案
    };

    // 3. 填充数据
    document.getElementById('hvName').innerText = `Hi 我是@${chat.name}`;
    document.getElementById('hvTags').innerText = `◎${voiceData.mbti || 'MBTI'}`;
    document.getElementById('hvQuote').innerText = `「${voiceData.quote || '...' }」`;
    document.getElementById('hvMainContent').innerText = voiceData.content || '...';
    document.getElementById('hvMutter').innerText = voiceData.mutter || '✧˖°';
    document.getElementById('hvSign').innerText = `★個人產物島 #島主@${chat.name}`;

    // ★★★ 新增：填充底部文案 ★★★
    const bottomEl = document.getElementById('hvBottomText');
    if (bottomEl) {
        bottomEl.innerText = voiceData.bottomText || voiceData.content || "唯有离别苦不会戛然而止。";
    }

    // 4. 显示动画
    const overlay = document.getElementById('heart-voice-overlay');
    if(overlay) overlay.classList.add('show');
}

function closeHeartVoice() {
    const overlay = document.getElementById('heart-voice-overlay');
    if(overlay) overlay.classList.remove('show');
}

// =========================================
// ★★★ 全新的音乐功能模块 (请确保只有这一份) ★★★
// =========================================

async function saveMusicPlaylist() {
    try {
        await db.playlist.clear(); 
        if (musicPlaylist.length > 0) {
            const tracksToSave = musicPlaylist.filter(track => !track.isKeepAlive);
            
            if (tracksToSave.length > 0) {
                await db.playlist.bulkAdd(tracksToSave);
            }
        }
    } catch (e) { console.error("保存音乐失败:", e); }
}

// 2. 处理本地音乐文件 (选择文件 -> 弹窗起名)
function handleMusicFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 暂存文件
    tempMusicBlob = file;
    // 获取默认文件名
    const defaultName = file.name.replace(/\.[^/.]+$/, "");
    
    // 打开弹窗让用户确认名字
    openGlassPopup('music_upload', defaultName);
    
    // 清空 input 方便下次选同一个文件
    event.target.value = ''; 
}

// 3. 处理网络链接 (输入链接 -> 弹窗起名)
function triggerMusicLink() {
    const menu = document.getElementById('musicPlusMenu');
    if (menu) menu.classList.remove('active');

    const url = prompt("请输入音乐文件的网络链接 (URL):");
    if (!url) return;

    // ★★★ 修复核心：先把 URL 存到全局变量里，别让它丢了 ★★★
    tempMusicUrl = url; 

    // 弹窗起名逻辑复用
    openGlassPopup('music_link_name', '网络音乐');
}

/* ========================================= */
/* ★★★ 网络音乐搜索功能 ★★★ */
/* ========================================= */

// 1. 打开/关闭弹窗
function openMusicSearchModal() {
    const menu = document.getElementById('musicPlusMenu');
    if (menu) menu.classList.remove('active');
    
    document.getElementById('music-search-input').value = '';
    document.getElementById('music-search-results').innerHTML = '<div style="text-align:center; color:#ccc; margin-top: 40px; font-size:12px;">请输入关键词检索</div>';
    document.getElementById('music-search-overlay').classList.add('show');
}

function closeMusicSearchModal() {
    document.getElementById('music-search-overlay').classList.remove('show');
}

// 2. 执行搜索
async function executeMusicSearch() {
    const keyword = document.getElementById('music-search-input').value.trim();
    if (!keyword) return;

    const api = document.getElementById('music-search-api').value;
    const loading = document.getElementById('music-search-loading');
    const resultsContainer = document.getElementById('music-search-results');

    loading.style.display = 'block';
    resultsContainer.innerHTML = '';

    try {
        let list = [];
        // 根据你提供的接口分发
        if (api === 'meting1') {
            list = await searchMetingCore('https://api.i-meto.com/meting/api', keyword);
        } else if (api === 'meting2') {
            list = await searchMetingCore('https://api.injahow.cn/meting/', keyword);
        } else if (api === 'meting3') {
            list = await searchMetingCore('https://meting.justns.cn/api.php', keyword);
        }

        loading.style.display = 'none';

        if (list.length === 0) {
            resultsContainer.innerHTML = '<div style="text-align:center; color:#999; margin-top:20px; font-size:13px;">未搜索到结果，请换个词或换个接口试试</div>';
            return;
        }

        // 渲染搜索结果
        list.forEach(song => {
            const item = document.createElement('div');
            item.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:10px; background:#f9f9f9; border-radius:10px;";
            
            // 处理没有封面的情况
            const coverSrc = song.pic || "https://placehold.co/40/ccc/fff?text=M";

            item.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
                    <img src="${coverSrc}" style="width:40px; height:40px; border-radius:8px; object-fit:cover;">
                    <div style="display:flex; flex-direction:column; overflow:hidden;">
                        <span style="font-size:14px; color:#333; font-weight:bold; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${song.name}</span>
                        <span style="font-size:11px; color:#999; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${song.artist}</span>
                    </div>
                </div>
                <div style="background:#000; color:#fff; padding:6px 12px; border-radius:15px; font-size:12px; cursor:pointer; flex-shrink:0;" 
                     onclick='addSearchedMusic(${JSON.stringify(song).replace(/'/g, "&#39;")})'>
                    添加
                </div>
            `;
            resultsContainer.appendChild(item);
        });

    } catch (e) {
        console.error("搜索异常:", e);
        loading.style.display = 'none';
        resultsContainer.innerHTML = `<div style="text-align:center; color:#ff3b30; margin-top:20px; font-size:13px;">搜索出错: ${e.message}</div>`;
    }
}

// 3. Meting 核心解析 (适配网易云/QQ)
async function searchMetingCore(apiUrl, keyword) {
    // Meting API 规范：?server=netease&type=search&id=关键词
    // 为了覆盖更广，这里默认搜网易云
    const url = `${apiUrl}?server=netease&type=search&id=${encodeURIComponent(keyword)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("API 请求被拒绝");
    const data = await res.json();
    
    // 解析标准 Meting 格式
    return data.map(item => ({
        name: item.title || item.name || "未知歌曲",
        artist: item.author || item.artist || "未知歌手",
        url: item.url, 
        pic: item.pic || "",
        lrc: item.lrc || ""
    }));
}

// 5. 点击“添加”按钮，存入列表
function addSearchedMusic(songObj) {
    if (!songObj.url) {
        alert("这首歌暂时无法获取播放链接 (可能因版权受限)");
        return;
    }

    const newTrack = {
        id: Date.now(),
        name: songObj.name,
        artist: songObj.artist,
        url: songObj.url,
        cover: songObj.pic,
        lrc: songObj.lrc
    };

    musicPlaylist.push(newTrack);
    saveMusicPlaylist(); // 存入数据库
    renderPlaylist();    // 刷新播放列表
    
    // 如果是列表里的第一首歌，自动播放
    if (musicPlaylist.length === 1) {
        playTrack(0);
    }
    
    alert(`已将《${songObj.name}》添加到播放列表！`);
}

// 4. 删除音乐
function deleteMusic(index, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (confirm("确定要删除这首音乐吗？")) {
        if (index === currentMusicIndex) {
            audioPlayer.pause();
            audioPlayer.src = "";
            document.getElementById('main-song-name').innerText = "尚未播放";
            document.getElementById('main-artist-name').innerText = "请点击这里选择音乐";
            const root = document.getElementById('play-btn-root');
            if(root) root.classList.remove('playing');
            currentMusicIndex = -1;
            isPlaying = false;
        } else if (index < currentMusicIndex) {
            currentMusicIndex--;
        }

        musicPlaylist.splice(index, 1);
        saveMusicPlaylist(); // 保存
        renderPlaylist();
    }
}

/* ========================================= */
/* ★★★ 转账功能核心逻辑 ★★★ */
/* ========================================= */

// 1. 打开“转账给对方”的输入弹窗
function openTransferModal() {
    // 如果底部工具栏还没关，先关掉
    const panel = document.getElementById('chatToolsPanel');
    if (panel && panel.classList.contains('active')) toggleChatTools();
    
    const overlay = document.getElementById('transfer-input-overlay');
    document.getElementById('transfer-amount').value = '';
    document.getElementById('transfer-note').value = '';
    
    if(overlay) overlay.classList.add('show');
    // 延时聚焦，提升体验
    setTimeout(() => document.getElementById('transfer-amount').focus(), 100);
}

// 2. 关闭所有转账相关弹窗
function closeTransferModal() {
    const inputOverlay = document.getElementById('transfer-input-overlay');
    const actionOverlay = document.getElementById('transfer-action-overlay');
    if(inputOverlay) inputOverlay.classList.remove('show');
    if(actionOverlay) actionOverlay.classList.remove('show');
}

// 3. 我点击“转账”按钮 -> 发送给 AI
function confirmSendTransfer() {
    const amountVal = document.getElementById('transfer-amount').value;
    const noteVal = document.getElementById('transfer-note').value.trim() || "转账给你";
    
    if (!amountVal || parseFloat(amountVal) <= 0) {
        alert("请输入正确的金额");
        return;
    }

    if (!currentChatId) return;
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;

    const vt = window.getVirtualTimeData(chat, true);
    const amountFixed = parseFloat(amountVal).toFixed(2);
    if (typeof handleTransaction === 'function') {
        handleTransaction('expense', parseFloat(amountVal), `转账 - ${chat.name}`);
    }
    // ★ 构造转账消息
    const msg = {
        id: Date.now(),
        type: 'transfer', // 标记类型
        isSelf: true,     // 我发的
        time: vt.timeStr,
        virtualDate: vt.dateStr,
        virtualTimestamp: vt.ms,
        timestamp: Date.now(),
        amount: amountFixed,
        note: noteVal,
        status: 'pending', // 初始状态：等待处理
        transferBy: 'me',  // 发起人是我
        text: `[转账] ¥${amountFixed}`, // 列表预览用
        contentDescription: `[向对方转账 ¥${amountFixed}，备注：${noteVal}]` // 给AI看的
    };

    chat.messages.push(msg);
    chat.msg = `[转账] ¥${amountFixed}`;
    chat.time = vt.timeStr;
    
    // 置顶聊天
    if (!chat.isPinned) {
        chatList = chatList.filter(c => c.id !== currentChatId);
        chatList.unshift(chat);
    }

    saveData();
    renderMessages(chat);
    closeTransferModal();
}

// 4. AI 收到转账后的反应逻辑 (收下或退还)
async function triggerAiTransferReaction(chat, msgId, amount) {
    const apiKey = document.getElementById('apiKey').value;
    const endpoint = document.getElementById('apiEndpoint').value;
    const model = document.getElementById('apiModel').value;
    
    if (!apiKey) return;

    const systemPrompt = `
你现在收到了用户的一笔转账。
【转账金额】：¥${amount}
${getFullPersona(chat)}

请根据你的人设和当前关系，决定是【收下】(RECEIVE) 还是【退还】(REFUND)。
- 比如：如果是红包或小钱，通常收下。
- 比如：如果还在生气或不想欠人情，可以退还。

请严格输出 JSON 格式：
{
    "action": "RECEIVE" 或 "REFUND",
    "reply": "你对这笔转账的口语回复"
}
`;

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.7,
                max_tokens: parseInt(document.getElementById('apiMaxTokens').value) || 2048
            })
        });
        
        const data = await response.json();
        let content = data.choices[0].message.content;
        
        // 简单提取 JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            
            // 找到刚才那条转账消息，更新状态
            const targetMsg = chat.messages.find(m => m.id === msgId);
            if (targetMsg) {
                if (result.action === 'RECEIVE') targetMsg.status = 'received';
                else targetMsg.status = 'refunded';
            }
            
            // AI 发送回复消息
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            chat.messages.push({
                text: result.reply,
                isSelf: false,
                time: timeStr,
                timestamp: Date.now()
            });
            
            saveData();
            renderMessages(chat); // 刷新界面，转账卡片状态会变
        }
    } catch (e) {
        console.error("AI 转账处理失败", e);
    }
}

// 5. 点击气泡的处理逻辑
let currentOperatingMsgId = null;

// 注意：这个函数必须挂在 window 上，因为 HTML onclick 会调用它
window.handleTransferClick = function(msgId, event) {
    if(event) event.stopPropagation();
    
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;
    
    const msg = chat.messages.find(m => m.id == msgId);
    if (!msg) return;

    // 情况A：我发出的转账 -> 只能看，不能点
    if (msg.transferBy === 'me') {
        let statusStr = "等待对方确认";
        if (msg.status === 'received') statusStr = "对方已收款";
        if (msg.status === 'refunded') statusStr = "已被退还";
        // 你可以把这个 alert 去掉，或者换成一个轻提示
        console.log(`转账状态: ${statusStr}`); 
        return;
    }

    // 情况B：AI 发给我的转账 (transferBy === 'ai')
    if (msg.transferBy === 'ai') {
        if (msg.status !== 'pending') {
            alert(`该转账${msg.status === 'received' ? '已收款' : '已退还'}`);
            return;
        }
        
        // 还没处理 -> 弹出操作框
        currentOperatingMsgId = msgId;
        document.getElementById('action-title').innerText = `收到 ${chat.name} 的转账`;
        document.getElementById('action-amount').innerText = msg.amount;
        document.getElementById('action-note').innerText = msg.note || "无备注";
        document.getElementById('transfer-action-overlay').classList.add('show');
    }
};

// 找到 handleTransferDecision 函数并替换为以下内容：

function handleTransferDecision(action) {
    if (!currentOperatingMsgId || !currentChatId) return;
    
    const chat = chatList.find(c => c.id === currentChatId);
    const msg = chat.messages.find(m => m.id == currentOperatingMsgId);
    
    if (msg && msg.status === 'pending') {
        const amount = msg.amount; 

        if (action === 'receive') {
            // === 收款 ===
            msg.status = 'received';
            
            // 钱包入账
            if (typeof handleTransaction === 'function') {
                const senderName = chat.name || "对方";
                handleTransaction('income', parseFloat(amount), `转账 - ${senderName}`);
            }

            // ★★★ 修复点 1：明确告诉 AI 结果是【成功收款】 ★★★
            // 去掉 "[发起转账]" 这种容易引起歧义的词，直接用系统通知口吻
            msg.contentDescription = `[系统通知] 用户已✅收下你的转账 (¥${amount})`;

        } else {
            // === 退还 ===
            msg.status = 'refunded';

            // ★★★ 修复点 2：明确告诉 AI 结果是【被退回】 ★★★
            // 强调“款项已退回”，迫使 AI 理解为“钱没送出去”
            msg.contentDescription = `[系统通知] 用户❌退还了你的转账 (¥${amount})，款项已退回到你的账户`;
        }

        saveData();
        renderMessages(chat); 
    }
    
    closeTransferModal();
    currentOperatingMsgId = null;
}
/* ========================================= */
/* ★★★ 语音通话 (Together) 功能逻辑 ★★★ */
/* ========================================= */

let vcTimerInterval = null;
let vcSeconds = 0;
let isVcConnecting = false;
let activeVoiceCallChatId = null;

// 1. 开启语音通话界面
function startVoiceCallUI() {
    // 关闭工具栏
    toggleChatTools();
    
     const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;
    
    activeVoiceCallChatId = chat.id;
    // 填充数据
    document.getElementById('vcCharName').innerText = chat.name;
    document.getElementById('vcCharAvatar').src = chat.avatar;
    
    // ★★★ 修复：优先使用当前聊天设置的自定义头像，如果没有才用全局头像 ★★★
    const globalMeAvatar = document.getElementById('meAvatarImg').src;
    const myAvatar = chat.userAvatar || globalMeAvatar;
    
    document.getElementById('vcUserAvatar').src = myAvatar;
    
    const bgLayer = document.getElementById('vc-bg-layer');
    if (globalData.voiceCallWallpaper) {
        bgLayer.style.backgroundImage = `url(${globalData.voiceCallWallpaper})`;
    } else {
        bgLayer.style.backgroundImage = `url(${chat.avatar})`;
    }

    // 重置状态
    document.getElementById('vcScrollContent').innerHTML = ''; // 清空屏幕文字
    document.getElementById('vcTimer').innerText = "正在接通...";
    isVcConnecting = true;
    vcSeconds = 0;
    
    // 显示界面
    document.getElementById('voice-call-overlay').classList.add('active');

    // 模拟接通逻辑：1.5秒后接通，开始计时，AI说话
    setTimeout(() => {
        startVcTimer();
        triggerVcFirstMessage(chat);
    }, 1500);
}

// 找到 hangUpVoiceCall 函数，修改其内部的时间戳逻辑：
function hangUpVoiceCall() {
    if (vcTimerInterval) clearInterval(vcTimerInterval);
    
    const targetId = activeVoiceCallChatId || currentChatId;
    const chat = chatList.find(c => c.id === targetId);
    
    if (chat) {
        const hours = Math.floor(vcSeconds / 3600);
        const minutes = Math.floor((vcSeconds % 3600) / 60);
        const seconds = vcSeconds % 60;
        
        let durationText = "";
        if (hours > 0) durationText = `${hours}小时${minutes}分`;
        else durationText = `${minutes}分${seconds}秒`;
        
        // ★ 核心重构：使用虚拟时间快照
        const vt = window.getVirtualTimeData(chat, true);
        
        chat.messages.push({
            text: `通话时长 ${durationText}`,
            isSelf: true, 
            time: vt.timeStr,
            virtualDate: vt.dateStr,
            virtualTimestamp: vt.ms,
            timestamp: Date.now(),
            type: 'call_summary' 
        });
        
        chat.msg = `[通话结束] ${durationText}`;
        chat.time = vt.timeStr;
        
        saveData();
        
        if (currentChatId === chat.id) {
            renderMessages(chat); 
        }
    }
    
    document.getElementById('voice-call-overlay').classList.remove('active');
    document.getElementById('vc-floating-window').style.display = 'none';
    isVcConnecting = false;
    vcSeconds = 0;
    activeVoiceCallChatId = null;
}

// 2. 最小化/关闭界面
function minimizeVoiceCall() {
    document.getElementById('voice-call-overlay').classList.remove('active');
    // 如果需要后台继续计时，这里就不 clearInterval
    // 但为了演示简单，我们假设关闭就是挂断
    clearInterval(vcTimerInterval);
}

// 3. 计时器逻辑
function startVcTimer() {
    if (vcTimerInterval) clearInterval(vcTimerInterval);
    
    // 初始显示
    updateVcTimerDisplay();
    
    vcTimerInterval = setInterval(() => {
        vcSeconds++;
        updateVcTimerDisplay();
    }, 1000); // 真正每秒跳动
}

function updateVcTimerDisplay() {
    const hours = Math.floor(vcSeconds / 3600);
    const minutes = Math.floor((vcSeconds % 3600) / 60);
    const seconds = vcSeconds % 60; // 虽然UI只要求分钟，但为了真实感内部在走秒
    
    // UI 逻辑：如果不足一小时只显示分钟 (例如：一起通话了 05:20)
    // 网易云风格通常是： 05:20 (分:秒) 或者 超过1小时显示 01:20:30
    
    let timeStr = "";
    const pad = (n) => String(n).padStart(2, '0');
    
    if (hours > 0) {
        timeStr = `一起通话了 ${hours}小时 ${minutes}分钟`;
    } else {
        // 如果是刚刚开始，显示分秒更有即时感
        timeStr = `一起通话了 ${pad(minutes)}:${pad(seconds)}`;
    }
    
    document.getElementById('vcTimer').innerText = timeStr;
}

async function triggerVcFirstMessage(chat) {
    const recentChat = getCleanChatContext(chat, 20);
    const wbContext = typeof getWorldBookContext === 'function' ? getWorldBookContext(chat, recentChat) : "";
    
    const lastMsg = chat.messages[chat.messages.length - 1];
    const now = Date.now();
    const lastMsgTime = lastMsg ? (lastMsg.timestamp || now) : now;
    const isInstantCall = (now - lastMsgTime) < 5 * 60 * 1000; 

    // ★★★ 强制 JSON 协议 ★★★
    let systemPrompt = `
${PROMPT_LIB.core.replace(/{{char}}/g, chat.name)}
${PROMPT_LIB.dynamic}
${PROMPT_LIB.antiStereotype}

【当前情境】：
你接通了用户的【语音通话】。
${isInstantCall ? '用户是在刚才文字聊天的过程中突然打来的，请无缝衔接刚才的话题。' : '用户是在很久没说话后突然打来的。'}

${getFullPersona(chat)}
${wbContext ? `【世界观】：\n${wbContext}\n` : ''}

【参考 - 文字聊天记录】：
${recentChat}

【语音通话 - 强制输出格式】：
1. 必须返回标准的 **JSON对象**。
2. 格式：{"replies": ["第一句话", "第二句话"]}
3. 内容要求：纯口语，不要书面语。
${globalData.autoTranslateEnabled ? `4. 【⚠️翻译强制协议】：每一行输出必须严格遵循格式："原文内容@@@TRANS@@@中文翻译"。严禁将原文和翻译拆分成两行！严禁只发翻译！` : ''}
`;
    if (typeof getVirtualTimePrompt === 'function') {
        systemPrompt += getVirtualTimePrompt(chat);
    }

    // [新增] 限制自主聊天的消息数量
    const replyMin_action = chat.replyMin !== undefined ? chat.replyMin : 1;
    const replyMax_action = chat.replyMax !== undefined ? chat.replyMax : 3;
    systemPrompt += `\n【重要：单次消息数量限制】：如果你决定发起私聊（CHAT 行为），你当前发送的消息段落（以换行隔开）必须控制在 ${replyMin_action} 到 ${replyMax_action} 条之间。`;

    try {
        const apiKey = document.getElementById('apiKey').value;
        const endpoint = document.getElementById('apiEndpoint').value;
        const model = document.getElementById('apiModel').value;
        
        if (!apiKey) { addVcMessage("ai", "(请先配置API Key)"); return; }

        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.85,
                max_tokens: parseInt(document.getElementById('apiMaxTokens').value) || 2048
            })
        });
        
        const data = await response.json();
        let rawContent = data.choices[0].message.content;

        // ★★★ 核心修复：使用 safeParseAiResponse 解析 JSON ★★★
        const parsed = safeParseAiResponse(rawContent);
        const segments = parsed.replies || []; 

        const TRANS_SPLIT = "@@@TRANS@@@"; 

        for (let i = 0; i < segments.length; i++) {
            let segRaw = String(segments[i]).trim(); // 强转 String 防止 AI 发对象
            if(!segRaw) continue;
            
            let segText = segRaw;
            let segTrans = null;
            if (segRaw.includes(TRANS_SPLIT)) {
                const parts = segRaw.split(TRANS_SPLIT);
                segText = parts[0].trim();
                segTrans = parts[1] ? parts[1].trim() : null;
            }
            
            let audioUrl = null;
            if (chat.minimaxVoiceId) audioUrl = await fetchMiniMaxTTS(segText, chat.minimaxVoiceId);
            
            // 模拟说话间隔
            await new Promise(r => setTimeout(r, 500 + segText.length * 50));
            
            let displayHtml = "";
            if (segTrans) {
                displayHtml = `<div class="vc-origin-text" style="margin-bottom:6px;">${segText}</div>` + 
                              `<div class="msg-trans-line" style="height:1px;background-color:rgba(255,255,255,0.2);margin:0;"></div>` +
                              `<div class="msg-trans-text" style="opacity:0.85;font-size:0.9em;margin-top:6px;">${segTrans}</div>`;
            } else {
                displayHtml = segText;
            }

            addVcMessage("ai", displayHtml);
            if (audioUrl) { const audio = new Audio(audioUrl); audio.play(); }
            saveToHistory(chat, segText, false);
        }
    } catch (e) { console.error(e); addVcMessage("ai", "..."); }
}

function addVcMessage(type, text) {
    const container = document.getElementById('vcScrollContent');
    if (!container) return;

    const row = document.createElement('div');
    row.className = `vc-msg-row ${type}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'vc-msg-text';
    
    // 处理换行
    let formattedText = text.replace(/\n/g, '<br>');
    bubble.innerHTML = formattedText;
    
    row.appendChild(bubble);
    container.appendChild(row);
    
    // ★★★ 核心修复：多级滚动强制执行 ★★★
    
    // 1. 立即尝试滚动
    container.scrollTop = container.scrollHeight;

    // 2. 这里的 requestAnimationFrame 确保在下一帧（DOM渲染后）再次滚动
    requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
        
        // 3. 双重保险：对于图片或复杂内容，延迟一点再滚一次
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    });
}

function sendVcMsg() {
    const input = document.getElementById('vcInput');
    const text = input.value.trim();
    
    // ★★★ 修改：优先使用 activeVoiceCallChatId ★★★
    const targetId = activeVoiceCallChatId || currentChatId;
    const chat = chatList.find(c => c.id === targetId);
    
    if (!chat) return;

    // ★★★ 分支 A：输入框有字 -> 我说话，AI闭嘴 ★★★
    if (text) {
        // 1. 显示在当前屏幕
        addVcMessage("self", text);
        input.value = ''; // 清空
        
        // 2. 存入历史记录
        saveToHistory(chat, text, true);
    } 
    else {

        const lastMyMsg = chat.messages.filter(m => m.isSelf).slice(-1)[0];
        const contextText = lastMyMsg ? lastMyMsg.text.replace('[语音通话] ', '') : "（沉默）";
        
        generateVcReply(chat, contextText);
    }
}

// 回车发送 (修复版)
function handleVcEnter(e) {
    // 兼容电脑 Enter (key='Enter') 和手机键盘的发送键 (keyCode=13)
    if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault(); // ★ 关键：阻止默认换行，手机上这步很重要
        
        sendVcMsg(); // 调用发送逻辑
        
        // e.target.blur(); // 收起键盘模式
        setTimeout(() => {
            const input = document.getElementById('vcInput');
            if(input) input.focus(); // 保持聚焦模式（推荐）
        }, 10);
    }
}

// 找到 saveToHistory 函数并替换：
function saveToHistory(chat, text, isSelf) {
    // ★ 核心重构：根据说话方身份获取对应的虚拟时间快照
    const vt = window.getVirtualTimeData(chat, isSelf);
    
    chat.messages.push({
        text: `[语音通话] ${text}`,
        isSelf: isSelf,
        time: vt.timeStr,
        virtualDate: vt.dateStr,
        virtualTimestamp: vt.ms,
        timestamp: Date.now(),
        isHidden: true
    });
    chat.msg = '[语音通话中]';
    chat.time = vt.timeStr;
    saveData();
}

// 【新增辅助函数】提取干净的聊天上下文
function getCleanChatContext(chat, limit = 20) {
    // 过滤掉加载中或隐藏的消息
    const validMsgs = chat.messages.filter(m => !m.isLoading && !m.isHidden).slice(-limit);
    
    return validMsgs.map(m => {
        let cleanText = m.text;
        
        // 1. 清洗 HTML 图片/表情/语音标签，转为文字描述
        if (m.contentDescription) {
            cleanText = m.contentDescription; // 优先使用已有的描述
        } else {
            if (cleanText.includes('voice-inner-container')) cleanText = '[发送了一条语音]';
            else if (cleanText.includes('chat-sticker-img')) cleanText = '[发送了一个表情包]';
            else if (cleanText.includes('<img')) cleanText = '[发送了一张图片]';
            else if (cleanText.includes('transfer-card')) cleanText = '[发起了转账]';
            else {
                // 去除其他 HTML 标签
                cleanText = cleanText.replace(/<[^>]+>/g, '');
            }
        }
        
        const userName = chat.userRemark || chat.userRealName || "对方";
return `${m.isSelf ? userName : '我'}: ${cleanText}`;
    }).join('\n');
}

async function generateVcReply(chat, userText) {
    const apiKey = document.getElementById('apiKey').value;
    const endpoint = document.getElementById('apiEndpoint').value;
    const model = document.getElementById('apiModel').value;

    const recentChat = getCleanChatContext(chat, 15);
    const wbContext = typeof getWorldBookContext === 'function' ? getWorldBookContext(chat, userText) : "";

    let systemPrompt = `
${PROMPT_LIB.core.replace(/{{char}}/g, chat.name)}
${PROMPT_LIB.dynamic}
${PROMPT_LIB.antiStereotype}

【当前情境】：
正在与用户进行【语音通话】。
用户刚说："${userText}"

${getFullPersona(chat)}
${wbContext ? `【世界观】：\n${wbContext}\n` : ''}

【参考 - 最近记录】：
${recentChat}

【语音通话 - 强制输出格式】：
1. 必须返回标准的 **JSON对象**。
2. 格式：{"replies": ["第一句话", "第二句话"]}
3. 内容要求：纯口语，简短自然。
${globalData.autoTranslateEnabled ? `4. 【⚠️翻译强制协议】：每一行输出必须严格遵循格式："原文内容@@@TRANS@@@中文翻译"。严禁将原文和翻译拆分成两行！严禁只发翻译！` : ''}
`;
if (typeof getVirtualTimePrompt === 'function') {
        systemPrompt += getVirtualTimePrompt(chat);
    }

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.75,
                max_tokens: parseInt(document.getElementById('apiMaxTokens').value) || 2048
            })
        });
        const data = await response.json();
        let rawContent = data.choices[0].message.content;

        // ★★★ 核心修复：解析 JSON ★★★
        const parsed = safeParseAiResponse(rawContent);
        const segments = parsed.replies || [];
        
        const TRANS_SPLIT = "@@@TRANS@@@";
        for (let i = 0; i < segments.length; i++) {
            let segRaw = String(segments[i]).trim();
            if(!segRaw) continue;
            
            let segText = segRaw;
            let segTrans = null;
            if (segRaw.includes(TRANS_SPLIT)) {
                const parts = segRaw.split(TRANS_SPLIT);
                segText = parts[0].trim();
                segTrans = parts[1] ? parts[1].trim() : null;
            }
            
            let audioUrl = null;
            if (chat.minimaxVoiceId) audioUrl = await fetchMiniMaxTTS(segText, chat.minimaxVoiceId);
            
            await new Promise(resolve => setTimeout(resolve, 600 + (segText.length * 50))); 
            
            let displayHtml = "";
            if (segTrans) {
                displayHtml = `<div class="vc-origin-text" style="margin-bottom:6px;">${segText}</div>` + 
                              `<div class="msg-trans-line" style="height:1px;background-color:rgba(255,255,255,0.2);margin:0;"></div>` +
                              `<div class="msg-trans-text" style="opacity:0.85;font-size:0.9em;margin-top:6px;">${segTrans}</div>`;
            } else {
                displayHtml = segText;
            }

            addVcMessage("ai", displayHtml);
            if (audioUrl) { const audio = new Audio(audioUrl); audio.play(); }
            saveToHistory(chat, segText, false);
        }
    } catch (e) { console.error(e); addVcMessage("ai", "..."); }
}
// --- ★★★ 新增：悬浮窗逻辑开始 ★★★ ---

// 1. 点击右上角按钮：最小化到悬浮窗
function minimizeVoiceCallToFloat() {
    const targetId = activeVoiceCallChatId || currentChatId;
    const chat = chatList.find(c => c.id === targetId);
    
    if (!chat) return;

    const currentBigAvatar = document.getElementById('vcCharAvatar').src;
    document.getElementById('vc-float-avatar').src = currentBigAvatar;

    // 隐藏大屏通话页
    document.getElementById('voice-call-overlay').classList.remove('active');
    
    // 显示悬浮小窗
    document.getElementById('vc-floating-window').style.display = 'flex';
}

// 2. 点击悬浮窗：恢复全屏通话
function restoreVoiceCallFromFloat() {
    // 隐藏悬浮小窗
    document.getElementById('vc-floating-window').style.display = 'none';
    
    // 显示大屏通话页
    document.getElementById('voice-call-overlay').classList.add('active');
}

// --- ★★★ 悬浮窗逻辑结束 ★★★ ---
/* ========================================= */
/* ★★★ 新增：来电弹窗控制逻辑 ★★★ */
/* ========================================= */

let tempIncomingChatId = null; // 暂存正在打电话的角色ID

function showIncomingCallModal(chat, reason, callType = 'voice') {
    tempIncomingChatId = chat.id;
    pendingCallType = callType; // 记录通话类型
    
    document.getElementById('ic-avatar').src = chat.avatar;
    document.getElementById('ic-name').innerText = chat.name;
    document.getElementById('ic-reason').innerText = reason || (callType === 'video' ? "想和你视频通话..." : "想听听你的声音...");
    
    document.getElementById('incoming-call-overlay').classList.add('show');
    if (navigator.vibrate) {
        try { navigator.vibrate([200, 100, 200]); } catch(err) {}
    }
}

function acceptIncomingCall() {
    document.getElementById('incoming-call-overlay').classList.remove('show');
    
    if (tempIncomingChatId) {
        currentChatId = tempIncomingChatId;
        // 根据存储的类型启动对应的界面
        if (pendingCallType === 'video') {
            startVideoCallUI(); 
        } else {
            startVoiceCallUI();
        }
    }
}

function rejectIncomingCall() {
    document.getElementById('incoming-call-overlay').classList.remove('show');
    
    if (tempIncomingChatId) {
        const chat = chatList.find(c => c.id === tempIncomingChatId);
        if (chat) {
            // ★ 核心重构：获取虚拟时间快照
            const vt = window.getVirtualTimeData(chat, true);
            
            chat.messages.push({
                text: "已拒绝通话",
                isSelf: true,
                time: vt.timeStr,
                virtualDate: vt.dateStr,
                virtualTimestamp: vt.ms,
                timestamp: Date.now()
            });
            saveData();
            if (currentChatId === chat.id) renderMessages(chat);
        }
    }
    tempIncomingChatId = null;
}

// --- 新增：消息通知弹窗逻辑 ---
let currentToastTimer = null;
let currentToastChatId = null; // 记录弹窗是哪个角色的

// 修改 script.js 中的 showNotification 函数
async function showNotification(chat, text) {
    // ------------------------------------------------
    // Part A: 原有的网页内 Toast 逻辑 (保持不变)
    // ------------------------------------------------
    const toast = document.getElementById('msg-notification-toast');
    const nameEl = document.getElementById('toast-name');
    const msgEl = document.getElementById('toast-msg');
    const avatarEl = document.getElementById('toast-avatar');
    
    // 填充内容并显示 Toast
    if (toast) {
        currentToastChatId = chat.id;
        nameEl.innerText = chat.name;
        let cleanText = text;
        if (text.includes('<img')) cleanText = '[图片]';
        else if (text.includes('voice-inner')) cleanText = '[语音]';
        else cleanText = text.replace(/<[^>]+>/g, '');
        msgEl.innerText = cleanText;
        avatarEl.src = chat.avatar;
        toast.classList.add('show');
        if(navigator.vibrate) {
            try {
                navigator.vibrate(15);
            } catch (e) {
                console.warn("[Intervention] navigator.vibrate 在 showNotification 中被拦截 (用户尚未交互):", e);
            }
        }
        if (currentToastTimer) clearTimeout(currentToastTimer);
        currentToastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }
}

// 点击弹窗，跳转到该角色的聊天室
function handleToastClick() {
    const toast = document.getElementById('msg-notification-toast');
    if (currentToastChatId) {
        // 关闭弹窗
        toast.classList.remove('show');
        // 打开对应的聊天室
        openChatRoom(currentToastChatId);
    }
}

/* ========================================= */
/* ★★★ 数据管理美化与重置功能 (新增融合版) ★★★ */
/* ========================================= */

// 1. 弹窗开关控制
function openDataModal() {
    const modal = document.getElementById('backup-modal');
    if(modal) {
        modal.style.display = 'flex';
        // 稍微延时加 opacity 动画
        setTimeout(() => modal.style.opacity = '1', 10);
    }
}

function closeDataModal() {
    const modal = document.getElementById('backup-modal');
    if(modal) {
        modal.style.opacity = '0';
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

// 2. 导出全量备份 (整合：聊天 + 设置 + 论坛 + 钱包 + 面具 + 音乐)
async function exportBackup() {
    try {
        const btn = document.querySelector('.settings-btn-export'); // 假设按钮有这个类名，仅用于视觉反馈
        if(btn) btn.innerText = "正在打包...";

        // 1. 获取论坛数据 (LocalForage)
        let forumData = {};
        if (typeof localforage !== 'undefined') {
            forumData = {
                settings: await localforage.getItem('forumSettings'),
                posts: await localforage.getItem('forumPosts'),
                presets: await localforage.getItem('forumPresets'),
                dms: await localforage.getItem('forumDirectMessages')
            };
        }

        // 2. 获取钱包数据 (LocalStorage)
        // 注意：这里手动读取 localStorage 里的字符串并转为对象
        let walletDataExport = null;
        const walletRaw = localStorage.getItem('miu_wallet_data');
        if (walletRaw) {
            try {
                walletDataExport = JSON.parse(walletRaw);
            } catch (e) {}
        }

        // 3. 获取个人头像 (LocalStorage) - 防止头像丢失
        const myAvatarExport = localStorage.getItem('avatarImg');

        // 4. 打包所有数据
        const allData = {
            version: "3.0", // 升级版本号
            timestamp: new Date().toISOString(),
            
            // --- Dexie 数据库 (聊天/情侣空间/设置/API/音乐列表) ---
            chats: await db.chats.toArray() || [],
            settings: await db.globalSettings.get('main') || {},
            apiConfig: await db.apiConfig.toArray() || [],
            playlist: await db.playlist.toArray() || [],
            userMasks: await db.userMasks.toArray() || [],
            
            // --- 外部模块数据 ---
            forum: forumData,       // 论坛
            wallet: walletDataExport, // 钱包
            localAvatar: myAvatarExport // 本地头像缓存
        };

        // 5. 生成下载
        const blob = new Blob([JSON.stringify(allData)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0,10);
        a.download = `Miu Phone ${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if(typeof closeDataModal === 'function') closeDataModal(); 
        if(btn) btn.innerText = "导出备份";
        
    } catch (e) {
        alert("导出失败: " + e.message);
        console.error(e);
    }
}

// 4. 重置所有数据 (清空一切)
async function resetAllData() {
    if (confirm("高能预警\n\n此操作将【永久删除】所有数据，包括：\n- 聊天与情侣记录\n- 论坛与世界书\n- 钱包账单\n- 所有的设置与图片\n\n就像刚进入一样。确定要重置吗？")) {
        
        if(confirm("再次确认：数据清除后无法找回！真的要清空吗？")) {
            try {
                // 1. 清除 Dexie 数据库
                await db.delete();
                
                // 2. 清除 LocalForage (论坛)
                if (typeof localforage !== 'undefined') {
                    await localforage.clear();
                }
                
                // 3. 清除 LocalStorage (钱包、缓存、头像等)
                localStorage.clear();

                // 4. 清除 SessionStorage (会话状态)
                sessionStorage.clear();

                // 5. 尝试注销 Service Worker (停止后台通知)
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for(let registration of registrations) {
                        registration.unregister();
                    }
                }

                alert("已恢复默认设置，即将刷新...");
                window.location.reload();
            } catch (err) {
                alert("清除失败: " + err);
            }
        }
    }
}

// 1. 切换全局开关
function toggleAutoActivityGlobal() {
    const toggle = document.getElementById('autoActivityToggle');
    const panel = document.getElementById('autoFreqPanel');
    
    // 1. 切换 UI 状态
    toggle.classList.toggle('checked');
    const isEnabled = toggle.classList.contains('checked');
    
    // 2. 实时更新界面显隐
    if (isEnabled) {
        panel.style.display = 'flex';
        renderAutoCharList(); // 打开时刷新列表
    } else {
        panel.style.display = 'none';
    }

    // ★★★ 核心修复：点击开关后，立刻同步到内存并保存到数据库 ★★★
    if (typeof globalData !== 'undefined') {
        globalData.autoActivityEnabled = isEnabled;
    }
    saveData(); // 强制执行保存
}

// 2. 更新频率文字显示
function updateAutoFreqDisplay(val) {
    const display = document.getElementById('autoFreqDisplay');
    const v = parseInt(val);
    if (v === 0) display.innerText = "低频 (6h)";
    else if (v === 1) display.innerText = "中频 (3h)";
    else display.innerText = "高频 (1h)";
}

// 3. 渲染角色勾选列表
function renderAutoCharList() {
    const container = document.getElementById('autoCharListBody');
    if (!container) return;
    container.innerHTML = '';
    
    // 获取已保存的允许列表 (存的是 ID 数组)
    const allowedIds = globalData.autoAllowedCharIds || [];

    chatList.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'auto-char-item';
        
        const isChecked = allowedIds.some(id => id == chat.id) ? 'checked' : '';
        
        item.innerHTML = `
            <div class="auto-char-info">
                <img src="${chat.avatar}" class="auto-char-avatar">
                <span class="auto-char-name">${chat.name}</span>
            </div>
            <input type="checkbox" class="auto-char-checkbox" value="${chat.id}" ${isChecked}>
        `;
        container.appendChild(item);
    });
}

// 4. 折叠/展开角色列表
function toggleAutoCharList() {
    const body = document.getElementById('autoCharListBody');
    const arrow = document.getElementById('autoCharArrow');
    
    if (body.style.display === 'none') {
        body.style.display = 'block';
        arrow.classList.replace('fa-chevron-down', 'fa-chevron-up');
    } else {
        body.style.display = 'none';
        arrow.classList.replace('fa-chevron-up', 'fa-chevron-down');
    }
}

// 5. 保存设置
function saveAutoSettings() {
    // 获取开关状态
    const isEnabled = document.getElementById('autoActivityToggle').classList.contains('checked');
    
    // 获取频率
    const freq = document.getElementById('autoFreqSlider').value;
    
    // 获取勾选的角色ID
    const checkboxes = document.querySelectorAll('.auto-char-checkbox:checked');
    const allowedIds = Array.from(checkboxes).map(cb => parseInt(cb.value)); // 确保是数字
    
    // 存入全局数据
    globalData.autoActivityEnabled = isEnabled;
    globalData.autoFreq = parseInt(freq);
    globalData.autoAllowedCharIds = allowedIds;
    
    saveData(); // 保存到数据库
    
    alert("后台活动配置已保存！\n" + (isEnabled ? "AI 将按设定频率开始活跃。" : "后台活动已关闭。"));
}
// ★★★ 新增：自动翻译开关控制 ★★★
function toggleAutoTranslate() {
    const toggle = document.getElementById('autoTranslateToggle');
    toggle.classList.toggle('checked');
    
    // 立即保存状态
    const isEnabled = toggle.classList.contains('checked');
    if (typeof globalData !== 'undefined') {
        globalData.autoTranslateEnabled = isEnabled;
    }
    saveData();
}

// ★★★ 新增：流式开关控制函数 ★★★
function toggleApiStream() {
    const toggle = document.getElementById('apiStreamToggle');
    toggle.classList.toggle('checked');
    
    // 立即更新内存并保存
    const isEnabled = toggle.classList.contains('checked');
    if (typeof globalData !== 'undefined') {
        globalData.apiStreamEnabled = isEnabled;
    }
    saveData();
}

// 【修改版】MiniMax TTS 核心功能
async function fetchMiniMaxTTS(text, voiceId) {
    // 获取全局配置
    const groupId = document.getElementById('minimaxGroupId').value;
    const apiKey = document.getElementById('minimaxApiKey').value;
    
    if (!groupId || !apiKey || !voiceId) {
        console.warn("MiniMax TTS 配置缺失，跳过语音生成");
        return null; 
    }

    const url = `https://api.minimax.chat/v1/text_to_speech?GroupId=${groupId}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                voice_id: voiceId,
                text: text,
                model: "speech-01", 
                speed: 1.0,
                vol: 1.0,
                pitch: 0
            })
        });

        if (!response.ok) {
            console.error("MiniMax TTS API Error:", response.status);
            return null;
        }

        // MiniMax 返回的是音频流 (Blob)
        const blob = await response.blob();
        
        // ★★★ 核心修改点：转为 Base64 字符串 ★★★
        // 旧代码: const audioUrl = URL.createObjectURL(blob);
        const audioUrl = await blobToBase64(blob); 
        
        return audioUrl;

    } catch (e) {
        console.error("MiniMax TTS 请求失败:", e);
        return null;
    }
}

// 【新增】辅助函数：将 Blob 转为 Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/* ========================================= */
/* ★★★ 亲属卡 (Relative Card) 功能逻辑 ★★★ */
/* ========================================= */

// 1. 打开输入弹窗
function openRelativeCardModal() {
    toggleChatTools(); // 关闭工具栏
    const overlay = document.getElementById('relative-card-input-overlay');
    document.getElementById('rc-amount').value = '';
    document.getElementById('rc-note').value = '';
    if(overlay) overlay.classList.add('show');
    setTimeout(() => document.getElementById('rc-amount').focus(), 100);
}

// 2. 关闭弹窗
function closeRelativeCardModal() {
    document.getElementById('relative-card-input-overlay').classList.remove('show');
    document.getElementById('relative-card-action-overlay').classList.remove('show');
}

// 3. 确认发送 (绑定钱包支出)
function confirmSendRelativeCard() {
    const amountVal = document.getElementById('rc-amount').value;
    const noteVal = document.getElementById('rc-note').value.trim() || "你的消费我买单";
    
    if (!amountVal || parseFloat(amountVal) <= 0) {
        alert("请输入正确的额度");
        return;
    }

    if (!currentChatId) return;
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;

    // ★★★ 核心：记录钱包支出 ★★★
    if (typeof handleTransaction === 'function') {
        handleTransaction('expense', parseFloat(amountVal), `赠送亲属卡 - ${chat.name}`);
    }

    const vt = window.getVirtualTimeData(chat, true);
    
    // 构造亲属卡消息
    const msg = {
        id: Date.now(),
        type: 'relative_card', // 专门的类型
        isSelf: true,
        time: vt.timeStr,
        virtualDate: vt.dateStr,
        virtualTimestamp: vt.ms,
        timestamp: Date.now(),
        amount: parseFloat(amountVal).toFixed(2),
        note: noteVal,
        status: 'pending', 
        transferBy: 'me',
        text: `[亲属卡] 额度 ¥${amountVal}`, 
        contentDescription: `[赠送了一张亲属卡，额度 ¥${amountVal}]`
    };

    chat.messages.push(msg);
    chat.msg = `[亲属卡]`;
    chat.time = vt.timeStr;
    
    saveData();
    renderMessages(chat);
    closeRelativeCardModal();
}

let currentRcMsgId = null;

// 点击卡片
window.handleRelativeCardClick = function(msgId, event) {
    if(event) event.stopPropagation();
    
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;
    const msg = chat.messages.find(m => m.id == msgId);
    if (!msg) return;

    // 如果是我发的 -> 只能看状态
    if (msg.transferBy === 'me') {
        return; // 或者弹个轻提示
    }

    // 如果是 AI 发的 -> 只有 pending 状态可以操作
    if (msg.transferBy === 'ai') {
        if (msg.status !== 'pending') {
            alert(`该亲属卡${msg.status === 'received' ? '已领取' : '已退还'}`);
            return;
        }
        
        // 弹出接收面板
        currentRcMsgId = msgId;
        document.getElementById('rc-action-title').innerText = `收到 ${chat.name} 的亲属卡`;
        document.getElementById('rc-action-amount').innerText = msg.amount;
        document.getElementById('rc-action-note').innerText = msg.note || "你的消费我买单";
        document.getElementById('relative-card-action-overlay').classList.add('show');
    }
}

// 决策处理 (领取/退还)
function handleRelativeCardDecision(action) {
    if (!currentRcMsgId || !currentChatId) return;
    
    const chat = chatList.find(c => c.id === currentChatId);
    const msg = chat.messages.find(m => m.id == currentRcMsgId);
    
    if (msg && msg.status === 'pending') {
        if (action === 'receive') {
            msg.status = 'received';
            // ★ 领取亲属卡 = 获得额度 (虽然不是现金，但在钱包里记为“收入/额度增加”比较合理)
            if (typeof handleTransaction === 'function') {
                handleTransaction('income', parseFloat(msg.amount), `亲属卡额度 - ${chat.name}`);
            }
        } else {
            msg.status = 'refunded';
        }
        saveData();
        renderMessages(chat);
    }
    closeRelativeCardModal();
    currentRcMsgId = null;
}

/* ========================================= */
/* ★★★ User 面具 (Mask) 系统逻辑 ★★★ */
/* ========================================= */

// 1. 打开/关闭 面具管理页面
function openUserMaskPage() {
    document.getElementById('userMaskPage').classList.add('active');
    renderMaskList();
}

function closeUserMaskPage() {
    document.getElementById('userMaskPage').classList.remove('active');
}

function renderMaskList() {
    const container = document.getElementById('maskListContainer');
    container.innerHTML = '';

    if (userMasks.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#ccc;margin-top:50px;font-size:13px;">暂无面具<br>点击右上角创建</div>';
        return;
    }

    userMasks.forEach((mask) => {
        const item = document.createElement('div');
        item.className = 'chat-swipe-row';
        item.style.marginBottom = '10px';
        item.style.borderRadius = '12px';
        item.style.overflow = 'hidden';
        item.style.cursor = 'pointer'; // 变成手型
        
        item.onclick = () => editMask(mask.id);

        item.innerHTML = `
            <div class="chat-item-content" style="background:#fff; border-bottom:none; transform: none;">
                <img src="${mask.avatar}" class="chat-avatar" style="border-radius:50%;">
                <div class="chat-info">
                    <div class="chat-name-row">
                        <span class="chat-name">${mask.name}</span>
                    </div>
                    <div class="chat-preview" style="color:#999;">${mask.persona ? mask.persona.slice(0, 20) : '无设定'}...</div>
                </div>
                <div style="padding:10px; color:#ff3b30; z-index:10;" onclick="deleteMask(${mask.id}, event)">
                    <i class="fas fa-trash"></i>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

function openAddMaskModal() {
    editingMaskId = null; // 清空编辑ID
    
    // 修改标题和按钮文字
    document.querySelector('#addMaskModal .modal-title').innerText = "创建新面具";
    document.querySelector('#addMaskModal .btn-confirm-modal').innerText = "确认创建";

    // 重置表单
    const avatarImg = document.getElementById('newMaskAvatar');
    avatarImg.src = 'https://placehold.co/100/e0e0e0/888?text=Mask';
    
    // ★★★ 核心修复：移除之前手动绑定 onclick 的代码，现在 HTML 里已经写好了 ★★★
    
    document.getElementById('newMaskName').value = '';
    document.getElementById('newMaskPersona').value = '';
    
    const modal = document.getElementById('addMaskModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

async function confirmSaveMask() {
    const name = document.getElementById('newMaskName').value.trim();
    const persona = document.getElementById('newMaskPersona').value.trim();
    const avatar = document.getElementById('newMaskAvatar').src;

    if (!name) {
        alert("请给面具起个名字");
        return;
    }

    if (editingMaskId) {
        // --- 编辑模式：更新现有面具 ---
        const index = userMasks.findIndex(m => m.id === editingMaskId);
        if (index !== -1) {
            // 更新内存
            userMasks[index].name = name;
            userMasks[index].persona = persona;
            userMasks[index].avatar = avatar;
            
            // 更新数据库 (使用 put)
            await db.userMasks.put(userMasks[index]);
        }
    } else {
        // --- 新增模式：创建新面具 ---
        const newMask = {
            id: Date.now(),
            name: name,
            persona: persona,
            avatar: avatar
        };
        userMasks.push(newMask);
        await db.userMasks.add(newMask);
    }
    
    // 刷新列表并关闭
    renderMaskList();
    closeAddMaskModal();
}

function closeAddMaskModal() {
    const modal = document.getElementById('addMaskModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }
    hideMaskAvatarMenu(); 
    editingMaskId = null; 
}

// 1. 打开选择器
function openMaskSelectorForChar() {
    const list = document.getElementById('maskSelectorList');
    list.innerHTML = '';

    // 添加“不使用”选项
    const defaultItem = document.createElement('div');
    defaultItem.className = 'wb-item';
    defaultItem.innerHTML = `<span>🚫 不使用面具 (默认)</span>`;
    defaultItem.onclick = () => selectMaskForChar(null);
    list.appendChild(defaultItem);

    if (userMasks.length > 0) {
        userMasks.forEach(mask => {
            const item = document.createElement('div');
            item.className = 'wb-item';
            item.innerHTML = `
                <img src="${mask.avatar}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;margin-right:10px;">
                <span>${mask.name}</span>
            `;
            item.onclick = () => selectMaskForChar(mask);
            list.appendChild(item);
        });
    } else {
        list.innerHTML += '<div style="padding:15px;text-align:center;color:#ccc;font-size:12px;">暂无面具，请先去设置里创建</div>';
    }

    document.getElementById('maskSelectorModal').style.display = 'flex';
}

function closeMaskSelector() {
    document.getElementById('maskSelectorModal').style.display = 'none';
}

// 2. 选中回调
function selectMaskForChar(mask) {
    if (mask) {
        tempSelectedMaskId = mask.id;
        document.getElementById('charMaskSelectedText').innerText = mask.name;
        document.getElementById('charMaskSelectedText').style.color = '#333';
        document.getElementById('charMaskSelectedText').style.fontWeight = 'bold';
    } else {
        tempSelectedMaskId = null;
        document.getElementById('charMaskSelectedText').innerText = "默认 (不使用面具)";
        document.getElementById('charMaskSelectedText').style.color = '#888';
        document.getElementById('charMaskSelectedText').style.fontWeight = 'normal';
    }
    closeMaskSelector();
}

function editMask(id) {
    const mask = userMasks.find(m => m.id === id);
    if (!mask) return;

    editingMaskId = id; // 标记正在编辑的ID

    // 修改标题和按钮文字
    document.querySelector('#addMaskModal .modal-title').innerText = "编辑面具";
    document.querySelector('#addMaskModal .btn-confirm-modal').innerText = "保存修改";

    // 回填数据
    const avatarImg = document.getElementById('newMaskAvatar');
    avatarImg.src = mask.avatar;
    
    // ★★★ 核心修复：移除手动绑定代码，直接用 HTML 里的 onclick="showMenu..." ★★★

    document.getElementById('newMaskName').value = mask.name;
    document.getElementById('newMaskPersona').value = mask.persona || '';

    // 打开弹窗
    const modal = document.getElementById('addMaskModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

async function deleteMask(id, event) {
    if(event) event.stopPropagation(); // 防止触发点击编辑
    
    if(confirm('确定要删除这个面具吗？')) {
        // 1. 从内存数组移除
        userMasks = userMasks.filter(m => m.id !== id);
        
        // 2. 从数据库移除
        await db.userMasks.delete(id);
        
        // 3. 刷新列表
        renderMaskList();
    }
}

window.closePhotoDesc = function() {
    const overlay = document.getElementById('photo-desc-overlay');
    if (overlay) {
        // 1. 移除显示类，让它隐藏
        overlay.classList.remove('show');
        
        // 2. 稍微延迟清空图片内容，防止下次打开时闪烁旧图
        setTimeout(() => {
            const content = document.getElementById('photo-desc-content');
            if (content) content.innerHTML = '';
        }, 300);
    } else {
        console.warn("未找到 photo-desc-overlay 元素");
    }
};

// =========================================
// ★★★ 图片压缩瘦身功能 (严格限制版) ★★★
// =========================================

async function compressAlbumImagesInDB() {
    if (!confirm("【相册图片压缩】\n\n此操作将扫描聊天记录，仅压缩通过「相册」直接发送的大图。\n\n安全声明：\n1. 不会影响「表情包」。\n2. 不会影响「带文字描述的照片」。\n3. 此操作不可逆，画质会微调以换取空间。\n\n确定要开始吗？")) {
        return;
    }

    const btn = document.querySelector('#backup-modal .modal-btn[onclick="compressAlbumImagesInDB()"]');
    // 防止找不到按钮报错
    if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在压缩中...';
        btn.style.pointerEvents = 'none'; 
    }

    let totalSaved = 0; 
    let count = 0;      

    try {
        for (let chat of chatList) {
            let chatModified = false;

            for (let msg of chat.messages) {
                if (!msg.text || !msg.text.includes('<img')) continue;

                // ★★★ 核心筛选逻辑 (严格版) ★★★
                const isBase64 = msg.text.includes('data:image');
                const isAlbumImg = msg.text.includes('album-msg-img'); // 必须是相册图
                
                // 为了双重保险，显式排除其他类型
                const isPhotoMsg = msg.text.includes('photo-msg-img'); // 带描述的照片
                const isSticker = msg.text.includes('chat-sticker-img'); // 表情包

                // 逻辑：必须是Base64 + 必须是相册图 + 绝不能是Photo + 绝不能是表情包
                if (isBase64 && isAlbumImg && !isPhotoMsg && !isSticker) {

                    const match = msg.text.match(/src="([^"]+)"/);
                    if (match && match[1]) {
                        const originalBase64 = match[1];
                        
                        // 只有大于 300KB 才压缩，太小的没必要动
                        if (originalBase64.length > 300 * 1024) {
                            const compressedBase64 = await compressImageProcess(originalBase64);
                            
                            if (compressedBase64.length < originalBase64.length) {
                                msg.text = msg.text.replace(originalBase64, compressedBase64);
                                totalSaved += (originalBase64.length - compressedBase64.length);
                                count++;
                                chatModified = true;
                            }
                        }
                    }
                }
            }
        }

        if (count > 0) {
            await saveData(); 
            
            // 刷新当前聊天室
            if (typeof currentChatId !== 'undefined' && currentChatId) {
                const chat = chatList.find(c => c.id === currentChatId);
                if (chat && typeof renderMessages === 'function') {
                    renderMessages(chat);
                }
            }
            
            const savedMB = (totalSaved / (1024 * 1024)).toFixed(2);
            alert(`✅ 瘦身完成！\n\n共压缩相册图片：${count} 张\n节省空间：约 ${savedMB} MB`);
        } else {
            alert("未发现需要压缩的相册大图 (可能已经压缩过，或图片本身较小)。");
        }

    } catch (e) {
        console.error(e);
        alert("压缩出错：" + e.message);
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-compress-arrows-alt"></i> 瘦身：压缩相册图片';
            btn.style.pointerEvents = 'auto';
        }
    }
}

// 辅助函数：Canvas 压缩逻辑 (保持不变)
function compressImageProcess(base64Src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = base64Src;
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // 限制最大宽度 1024px
            const maxWidth = 1024;
            if (width > maxWidth) {
                height = Math.round(height * (maxWidth / width));
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // 转为 jpeg 格式，质量 0.7
            const newDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            resolve(newDataUrl);
        };
        
        img.onerror = (e) => {
            console.warn("图片加载失败，跳过", e);
            resolve(base64Src); 
        };
    });
}
window.compressImageProcess = compressImageProcess;

// ★★★ 格式修复/自动填入核心功能 (智能版 - 已移除转账和亲属卡) ★★★
function applyQuickFix(type) {
    const container = document.getElementById('edit-dynamic-content');
    
    // 1. 如果当前没有文本框，强制重置为文本框
    let textarea = document.getElementById('edit-text-input');
    if (!textarea) {
        container.innerHTML = `<textarea id="edit-text-input" class="edit-text-area" placeholder="代码生成中..." style="min-height:120px; font-family: monospace; font-size: 13px;"></textarea>`;
        textarea = document.getElementById('edit-text-input');
    }

    let template = "";
    // randomId 也可以删掉，因为只在转账/亲属卡里用到了，不过留着也不报错
    // const randomId = Date.now() + Math.floor(Math.random() * 1000); 
    let currentContent = textarea.value.trim();

    switch (type) {
                // --- 1. 纯文本 (废话文学专用版：暴力拆分) ---
        case 'text':
            // 1. 基础清洗：去除HTML标签，将不规则空格转为标准空格
            let plain = currentContent.replace(/<[^>]+>/g, '')
                                      .replace(/&nbsp;/g, ' ')
                                      .trim();

            // 2.【核心逻辑升级】语义断句算法

            // A. 语气词断句：在“了/吧/呢/啊/嘛/呀/呗/哦/哈”后面加换行
            // (?=[^\n]) 意思是：只要后面不是换行符，就切一刀
            plain = plain.replace(/([了吧呢啊嘛呀呗哦哈])(?=[^\n])/g, '$1\n');

            // B. 逻辑词断句：在“但是/然后”等词前面加换行
            // 增加了废话文学常用的：毕竟、反正、感觉、就是、那种、只见
            const logicWords = "但是|然后|不过|所以|而且|虽然|只是|那么|于是|其实|因为|毕竟|反正|感觉|就是|那种|只见|如果|正如";
            const logicRegex = new RegExp(`(${logicWords})`, 'g');
            plain = plain.replace(logicRegex, '\n$1');

            // C. 标点断句：现有的标点后面加换行
            plain = plain.replace(/([。！？\?!~～；;])\s*/g, '$1\n');   
            
            // D. 空格断句：这是针对“不爱发标点”最有效的一招
            // 将所有剩余的空格强制转换为换行
            plain = plain.replace(/\s+/g, '\n');               

            // 3. 整理格式：去空行、去首尾空格
            const result = plain.split('\n')
                                .map(line => line.trim())
                                .filter(line => line) // 过滤掉空行
                                .join('\n'); // 重新组合，这里的换行符会被保存逻辑识别
            
            template = result; // 赋值给 template
            break;


        // --- 2. 智能加翻译 (自动拆分填入) ---
        case 'trans':
            let cleanText = currentContent;
            if (cleanText.includes('msg-trans-line')) {
                cleanText = cleanText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            }

            let partOriginal = cleanText;
            let partTrans = "在此输入翻译...";

            const firstChineseIdx = cleanText.search(/[\u4e00-\u9fa5]/);

            if (firstChineseIdx > 0) {
                partOriginal = cleanText.substring(0, firstChineseIdx).trim();
                partTrans = cleanText.substring(firstChineseIdx).trim();
            }

            template = `${partOriginal}<div class="msg-trans-line"></div><div class="msg-trans-text">${partTrans}</div>`;
            break;

        // --- 3. 照片 ---
        case 'photo':
            const myImgUrl = "https://img.heliar.top/file/1767108859529_IMG_9793.jpeg";
            template = `<img src="${myImgUrl}" class="photo-msg-img" data-desc="图片描述" onclick="showPhotoDescription(this.dataset.desc, event)">`;
            break;

                // --- 4. 语音 (修复版：自动填入当前文字 + 自动计算时长) ---
        case 'voice':
            // 1. 获取当前输入框的文字，如果含有HTML标签则去除，获取纯文本
            let voiceText = currentContent.replace(/<[^>]+>/g, '').trim();
            
            // 2. 如果输入框是空的，才使用默认文案
            if (!voiceText) voiceText = "语音内容";

            // 3. 根据字数简单估算一下时长 (每3个字1秒，最少1秒，最多60秒)
            let vDuration = Math.min(60, Math.max(1, Math.ceil(voiceText.length / 3)));

            // 4. 生成模板，将 voiceText 和 vDuration 填入
            template = `<div class="voice-inner-container" onclick="toggleVoiceText(this, event)"><div class="voice-main-row"><div class="voice-animate-icon"><div class="voice-line"></div><div class="voice-line"></div><div class="voice-line"></div><div class="voice-line"></div></div><span class="voice-duration">${vDuration}"</span></div><div class="voice-trans-result">${voiceText}</div></div>`;
            break;


        // --- 5. 表情 ---
        case 'sticker':
            template = `[STICKER:默认表情]`;
            break;
    }

    // 3. 执行填入与视觉反馈
    if (textarea && template) {
        textarea.value = template.trim();
        textarea.style.backgroundColor = "#e8f0fe";
        setTimeout(() => textarea.style.backgroundColor = "", 300);
    }
}

// =========================================
// ★★★ 核心工具：强力 JSON 清洗与解析器 ★★★
// =========================================
function safeParseAiResponse(rawContent) {
    let clean = rawContent.replace(/<(think|thinking|thought)>[\s\S]*?<\/\1>/gi, '');

    // 1. 原有的清洗：去除 Markdown 代码块标记
    clean = clean.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    // 2. 尝试直接解析（这是最理想的情况）
    try {
        return JSON.parse(clean);
    } catch (e) {
        // 解析失败，说明有杂质，进入“手术模式”
    }

    // 3. 手术模式：正则提取最外层的 { ... }
    // [\s\S]*? 非贪婪匹配，确保提取的是第一个完整的 JSON 对象
    const jsonMatch = clean.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.warn("JSON 提取后依然解析失败:", e);
        }
    }

    // 4. 灾难恢复模式：如果连 { } 都没对齐，尝试救回关键字段
    // 这种情况下，JSON 结构已经彻底烂了，我们用正则硬抠数据
    const result = { replies: [], heartVoice: null };

    // 救回回复内容 (匹配 "replies": [ ... ])
    const repliesMatch = clean.match(/"replies"\s*:\s*\[([\s\S]*?)\]/);
    if (repliesMatch) {
        try {
            // 构造一个假数组字符串来解析
            result.replies = JSON.parse(`[${repliesMatch[1]}]`);
        } catch (e) {}
    }

    // 救回心声 (匹配 "heartVoice": { ... })
    const hvMatch = clean.match(/"heartVoice"\s*:\s*(\{[\s\S]*?\})/);
    if (hvMatch) {
        try {
            result.heartVoice = JSON.parse(hvMatch[1]);
        } catch (e) {}
    }

    // 5. 最终兜底：如果啥都没救回来，把原始文本直接当回复
    if (!result.replies || result.replies.length === 0) {
        // 如果文本里看起来像是有内容的，就直接当做一条回复
        if (clean.length > 0 && !clean.startsWith('{')) {
            result.replies = [clean];
        }
    }

    return result;
}

// =========================================
// ★★★ 升级版：系统通知触发器 (支持点击跳转) ★★★
// =========================================
function tryTriggerBackgroundNotify(chat, rawText) {
    // 1. 判断是否需要通知：页面不可见，或者当前不在该角色的聊天室
    const isBackground = document.hidden || (currentChatId !== chat.id);
    
    // 如果在前台且正在聊这个人，就不弹窗
    if (!isBackground) return;

    // 2. 检查 SW 是否这就绪
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;

    let bodyText = rawText;
    
    // --- 简单的文本清洗 ---
    if (bodyText.includes('voice-inner-container')) bodyText = '[语音]';
    else if (bodyText.includes('chat-sticker-img')) bodyText = '[表情]';
    else if (bodyText.includes('<img')) bodyText = '[图片]';
    else if (bodyText.includes('transfer-card')) bodyText = '[转账]';
    else bodyText = bodyText.replace(/<[^>]+>/g, "").trim(); // 去掉HTML标签

    if (!bodyText) return;

    // ★★★ 修复开始：调整 Title 和 Body 的分配 ★★★
    navigator.serviceWorker.controller.postMessage({
        type: 'TRIGGER_SYSTEM_POPUP',
        // 【修改 1】Title 放角色名字 (这样名字就会显示在第二排粗体)
        title: chat.name,   
        
        // 【修改 2】Body 只放消息内容 (这样内容就会显示在第三排，不会重复名字)
        body: bodyText,     
        
        icon: chat.avatar,  
        data: { chatId: chat.id } 
    });
    // ★★★ 修复结束 ★★★
}

// =========================================
// ★★★ Service Worker 核心系统 (注册/监听/跳转) ★★★
// =========================================

// 1. 注册 Service Worker
if ('serviceWorker' in navigator) {
    // 请确保根目录下有 sw.js 文件
    navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('✅ Service Worker 注册成功, Scope:', reg.scope))
        .catch(err => console.error('❌ Service Worker 注册失败:', err));

    // 2. 监听 SW 发来的跳转指令 (点击通知时触发)
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.action === 'open_chat_room') {
            const targetId = parseInt(event.data.chatId);
            console.log("🚀 收到通知跳转指令，目标ID:", targetId);

            // 如果当前不在目标聊天室，则跳转
            if (currentChatId !== targetId) {
                // 如果正在其他房间，先退出
                if (currentChatId) {
                    if (typeof exitChatRoom === 'function') exitChatRoom();
                }
                
                // 确保数据已加载
                if (chatList && chatList.length > 0) {
                    // 打开目标聊天室
                    // 注意：这里我们稍微延时一下，确保 UI 切换流畅
                    setTimeout(() => {
                        // 切换到聊天列表页 (Tab 0)
                        if (typeof switchAppTab === 'function') switchAppTab(0);
                        // 打开聊天室
                        if (typeof openChatRoom === 'function') openChatRoom(targetId);
                    }, 100);
                } else {
                    // 极端情况：App刚冷启动数据还没好，存个标记
                    window.pendingJumpChatId = targetId;
                }
            }
        }
    });
}

// 3. 权限自动申请 (点击页面任意处触发)
let isRequestingPerm = false;
function tryRequestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return; 
    if (Notification.permission === 'denied') return;
    if (isRequestingPerm) return;

    isRequestingPerm = true;
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            console.log('✅ 通知权限已获取');
            // 首次获取权限后，尝试发个测试通知
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'TRIGGER_SYSTEM_POPUP',
                    title: '通知已开启',
                    body: '现在你可以收到后台消息通知了',
                    icon: ''
                });
            }
        }
        isRequestingPerm = false;
    });
}

// 用户第一次点击页面时申请权限
document.addEventListener('click', () => {
    tryRequestNotificationPermission();
}, { once: true });

// ★★★ 新增：仅导出聊天记录 ★★★
async function exportChatsOnly() {
    try {
        // 1. 更改按钮状态提示
        const btn = document.querySelector('.modal-btn[onclick="exportChatsOnly()"]');
        const originalText = btn ? btn.innerHTML : '仅导出聊天记录';
        if(btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在打包聊天...';
            btn.style.pointerEvents = 'none';
        }

        // 2. 只读取聊天数据
        const chats = await db.chats.toArray() || [];

        // 3. 构建与全量备份结构一致的 JSON
        // 注意：其他字段留空或不传，这样我们修改后的恢复逻辑就不会覆盖它们
        const backupData = {
            version: "3.0",
            timestamp: new Date().toISOString(),
            type: "chats_only", // 标记类型，方便识别
            chats: chats,
            // 下面这些故意留空，表示不覆盖现有设置
            settings: null, 
            apiConfig: null,
            playlist: null,
            userMasks: null,
            forum: null,
            wallet: null
        };

        // 4. 生成下载文件 (文件名格式保持一致)
        const blob = new Blob([JSON.stringify(backupData)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // 文件名加上 (Chats) 后缀以便区分，但保持格式一致
        const dateStr = new Date().toISOString().slice(0,10);
        a.download = `Miu Phone Chats ${dateStr}.json`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // 5. 恢复按钮状态
        if(typeof closeDataModal === 'function') closeDataModal();
        if(btn) {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
        }
        
    } catch (e) {
        alert("导出失败: " + e.message);
        console.error(e);
        if(btn) {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
        }
    }
}
// script.js

// =========================================
// ★★★ 存储监控与备份提醒系统 ★★★
// =========================================

// 1. 格式化字节大小
function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 2. 检查存储空间并更新 UI
async function checkStorageHealth() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
        try {
            const estimate = await navigator.storage.estimate();
            const usage = estimate.usage || 0;
            const quota = estimate.quota || 0;
            
            // 计算百分比
            const percent = quota > 0 ? (usage / quota) * 100 : 0;
            
            // 更新数据管理页面的 UI
            const textEl = document.getElementById('storage-text');
            const barEl = document.getElementById('storage-bar');
            
            if (textEl && barEl) {
                textEl.innerText = `${formatBytes(usage)} / ${formatBytes(quota)}`;
                barEl.style.width = `${percent.toFixed(1)}%`;
                
                // 颜色变化逻辑：超过 80% 变红，超过 50% 变黄
                if (percent > 80) {
                    barEl.style.background = '#ff3b30'; // 红
                } else if (percent > 50) {
                    barEl.style.background = '#ffcc00'; // 黄
                } else {
                    barEl.style.background = '#4cd964'; // 绿
                }
            }

            return { usage, quota, percent };
        } catch (e) {
            console.error("无法获取存储空间信息:", e);
            return null;
        }
    }
    return null;
}

// 3. 每日备份提醒逻辑 (核心)
async function triggerDailyBackupReminder() {
    // A. 检查存储极限 (优先)
    const stats = await checkStorageHealth();
    if (stats && stats.percent > 90) {
        // 如果占用超过 90%，强制红色警告
        alert(`⚠️【存储空间高危预警】⚠️\n\n浏览器分配的存储空间已占用 ${stats.percent.toFixed(1)}%！\n浏览器即将强制清理缓存，这会导致你的数据丢失。\n\n请立即导出备份！`);
        openDataModal(); // 自动打开备份界面
        return;
    }

    // B. 每日提醒
    const lastBackup = localStorage.getItem('miu_last_backup_time');
    const lastRemind = localStorage.getItem('miu_last_remind_time');
    const now = Date.now();
    
    // 如果从未备份过，或者距离上次备份超过 24 小时
    const needBackup = !lastBackup || (now - parseInt(lastBackup) > 24 * 60 * 60 * 1000);
    
    // 为了防止每次刷新都弹窗，我们限制提醒频率：
    // 如果今天已经提醒过了 (距离上次提醒小于 20 小时)，就不再弹窗
    const alreadyRemindedToday = lastRemind && (now - parseInt(lastRemind) < 20 * 60 * 60 * 1000);

    if (needBackup) {
        
        // =========================================================================
        // ★★★ 新增：如果有配置 GitHub 自动备份，在此处静默上传，拦截本地提醒弹窗 ★★★
        // =========================================================================
        if (typeof globalData !== 'undefined' && globalData.ghAutoBackup && globalData.ghToken) {
            console.log("[后台任务] 触发 GitHub 每日自动静默备份...");
            uploadToGithub(true); // 传入 true 代表静默模式，后台偷偷传，不弹窗
            return; // 自动任务已接管，直接 return 结束，不再往下执行提醒代码
        }
        // =========================================================================

        // 如果没有配置自动备份，且今天还没提醒过，才执行原来的本地提醒
        if (!alreadyRemindedToday) {
            // 使用你的 Toast 通知系统 (比较优雅)
            if (typeof showNotification === 'function') {
                // 这里我们模拟一个系统通知
                const sysChat = { id: 'system', name: '系统提醒', avatar: 'https://placehold.co/100/ffcc00/fff?text=!' };
                showNotification(sysChat, "已超过24小时未备份，建议立即备份数据防止丢失。");
            } else {
                // 或者使用 confirm 弹窗
                if(confirm("【每日备份提醒】\n\n为了防止数据丢失，建议每天导出一次备份。\n是否现在去备份？")) {
                    openDataModal();
                }
            }
            
            // 记录本次提醒时间
            localStorage.setItem('miu_last_remind_time', now);
        }
    }
}

// 4. 挂钩到现有的导出函数
// ★★★ 请找到原本的 exportBackup 函数，在成功后加入重置时间的代码 ★★★
// (下面是一个包装函数，你可以替换原有的 exportBackup 或者修改原有的)
const originalExportBackup = window.exportBackup;
window.exportBackup = async function() {
    // 调用原有的导出逻辑
    if (typeof originalExportBackup === 'function') {
        await originalExportBackup();
    }
    
    // ★ 记录备份成功的时间
    localStorage.setItem('miu_last_backup_time', Date.now());
    
    // 更新一下存储显示
    checkStorageHealth();
};

// 5. 挂钩到现有的 openDataModal (每次打开面板时刷新数据)
const originalOpenDataModal = window.openDataModal;
window.openDataModal = function() {
    if (typeof originalOpenDataModal === 'function') originalOpenDataModal();
    // 刷新存储条
    checkStorageHealth();
}

// =========================================
// ★★★ 智能分卷导出系统 (解决大文件崩溃问题) ★★★
// =========================================

// 计算字符串大小的辅助函数 (粗略估算)
function roughSizeOfObject(object) {
    const objectList = [];
    const stack = [object];
    let bytes = 0;

    while (stack.length) {
        const value = stack.pop();
        if (typeof value === 'boolean') {
            bytes += 4;
        } else if (typeof value === 'string') {
            bytes += value.length * 2;
        } else if (typeof value === 'number') {
            bytes += 8;
        } else if (typeof value === 'object' && objectList.indexOf(value) === -1) {
            objectList.push(value);
            for (let i in value) {
                stack.push(value[i]);
            }
        }
    }
    return bytes;
}

// =========================================
// ★★★ 智能分卷导出系统 (含相册独立包) ★★★
// =========================================

async function exportSmartSplit() {
    const btn = document.getElementById('btn-smart-export');
    if(btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在打包系统配置...';
        btn.style.pointerEvents = 'none';
    }

    try {
        const timestamp = new Date().toISOString().slice(0,10);
        const delay = (ms) => new Promise(r => setTimeout(r, ms));

        // =============================================
        // [Part 1] 系统基础数据
        // =============================================
        const settings = await db.globalSettings.get('main') || {};
        const apiConfig = await db.apiConfig.toArray() || [];
        const userMasks = await db.userMasks.toArray() || [];
        
        const walletRaw = localStorage.getItem('miu_wallet_data');
        let walletData = walletRaw ? JSON.parse(walletRaw) : null;
        const myAvatar = localStorage.getItem('avatarImg');

        const systemData = {
            version: "3.1", // 版本号升级
            type: "system_split",
            timestamp: new Date().toISOString(),
            settings: settings,
            apiConfig: apiConfig,
            userMasks: userMasks,
            wallet: walletData,
            localAvatar: myAvatar
        };

        downloadJsonFile(systemData, `Miu_Part1_System_${timestamp}.json`);
        await delay(1200);

        // =============================================
        // [Part 2] 音乐数据
        // =============================================
        const playlist = await db.playlist.toArray() || [];
        if (playlist.length > 0) {
            if(btn) btn.innerText = "正在打包音乐...";
            const musicData = {
                version: "3.0",
                type: "music_split",
                timestamp: new Date().toISOString(),
                playlist: playlist
            };
            downloadJsonFile(musicData, `Miu_Part2_Music_${timestamp}.json`);
            await delay(1200);
        }

        // =============================================
        // [Part 3] 聊天记录 (剥离相册，轻量化)
        // =============================================
        if(btn) btn.innerText = "正在处理聊天与相册...";
        const chats = await db.chats.toArray() || [];
        
        let galleryExportList = []; // 用于存放剥离出来的相册数据

        if (chats.length > 0) {
            let currentChunk = [];
            let currentSize = 0;
            let partIndex = 1;
            const MAX_CHUNK_SIZE = 30 * 1024 * 1024; // 30MB 分卷阈值

            for (let i = 0; i < chats.length; i++) {
                // ★ 深拷贝对象，以免修改影响到当前运行的程序
                const chatClone = JSON.parse(JSON.stringify(chats[i]));

                // ★★★ 核心：剥离相册数据 ★★★
                if (chatClone.gallery && chatClone.gallery.length > 0) {
                    // 把相册数据提取出来，记下是哪个角色的 (chatId)
                    galleryExportList.push({
                        chatId: chatClone.id,
                        gallery: chatClone.gallery
                    });
                    // 在导出的聊天包里删除 gallery 字段，给 Part 3 瘦身
                    delete chatClone.gallery;
                }

                const chatSize = JSON.stringify(chatClone).length;
                
                // 分卷判断
                if (currentSize + chatSize > MAX_CHUNK_SIZE && currentChunk.length > 0) {
                    downloadChatChunk(currentChunk, partIndex, timestamp);
                    partIndex++;
                    currentChunk = [];
                    currentSize = 0;
                    if(btn) btn.innerText = `正在导出聊天 Part ${partIndex}...`;
                    await delay(1200);
                }

                currentChunk.push(chatClone);
                currentSize += chatSize;
            }

            // 下载剩下的聊天包
            if (currentChunk.length > 0) {
                downloadChatChunk(currentChunk, partIndex, timestamp);
                await delay(1200);
            }
        }

        // =============================================
        // [Part 4] 论坛数据
        // =============================================
        if (typeof localforage !== 'undefined') {
            if(btn) btn.innerText = "正在打包论坛...";
            const forumPosts = await localforage.getItem('forumPosts');
            if (forumPosts && forumPosts.length > 0) {
                const forumSettings = await localforage.getItem('forumSettings');
                const forumPresets = await localforage.getItem('forumPresets');
                const forumDms = await localforage.getItem('forumDirectMessages');
                const forumDataExport = {
                    version: "3.0",
                    type: "forum_split",
                    timestamp: new Date().toISOString(),
                    forum: { settings: forumSettings, posts: forumPosts, presets: forumPresets, dms: forumDms }
                };
                downloadJsonFile(forumDataExport, `Miu_Part4_Forum_${timestamp}.json`);
                await delay(1000);
            }
        }

        // =============================================
        // [Part 5] 相册数据 (新增独立包)
        // =============================================
        if (galleryExportList.length > 0) {
            if(btn) btn.innerText = "正在打包相册...";
            const galleryDataExport = {
                version: "3.1",
                type: "gallery_split", // 标记类型
                timestamp: new Date().toISOString(),
                galleries: galleryExportList
            };
            // 导出独立文件
            downloadJsonFile(galleryDataExport, `Miu_Part5_Gallery_${timestamp}.json`);
            await delay(1000);
        }

        // --- 完成 ---
        if(btn) {
            btn.innerHTML = '<i class="fas fa-check"></i> 全部导出完成';
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-boxes"></i> 智能分卷备份 (推荐)';
                btn.style.pointerEvents = 'auto';
            }, 3000);
        }
        
        localStorage.setItem('miu_last_backup_time', Date.now());
        if(typeof checkStorageHealth === 'function') checkStorageHealth();

    } catch (e) {
        console.error(e);
        alert("分卷导出失败: " + e.message);
        if(btn) {
            btn.innerHTML = '导出失败';
            btn.style.pointerEvents = 'auto';
        }
    }
}

// 辅助：下载聊天分卷
function downloadChatChunk(chatsArray, index, dateStr) {
    const data = {
        version: "3.0",
        type: "chats_split",
        timestamp: new Date().toISOString(),
        chats: chatsArray
    };
    downloadJsonFile(data, `Miu_Part3_Chats_${index}_${dateStr}.json`);
}

// 辅助：通用下载生成器
function downloadJsonFile(obj, filename) {
    const blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/* ========================================= */
/* ★★★ 视频通话功能 (Video Call 完整版 - 支持翻转摄像头) ★★★ */
/* ========================================= */

let videoStream = null; // 存储摄像头流
let activeVideoChatId = null; // 当前正在视频的角色ID
let vcvTimerInterval = null;   // 视频通话计时器
let vcvSeconds = 0;            // 视频通话秒数
let pendingCallType = 'voice';

// ★ 新增：记录当前摄像头模式 ('user'=前置, 'environment'=后置)
let currentFacingMode = 'user'; 

// 1. 开启视频通话 UI
async function startVideoCallUI() {
    // 关闭底部工具栏
    if (typeof toggleChatTools === 'function') toggleChatTools(); 
    
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;
    
    activeVideoChatId = chat.id;

    // A. 填充基础信息
    document.getElementById('videoCharName').innerText = chat.name;
    const bgLayer = document.getElementById('video-bg-layer');
    
    // 背景图优先级：语音通话壁纸 > 角色头像
    if (globalData.voiceCallWallpaper) {
        bgLayer.style.backgroundImage = `url(${globalData.voiceCallWallpaper})`;
    } else {
        bgLayer.style.backgroundImage = `url(${chat.avatar})`;
    }

    // B. 清空界面内容
    document.getElementById('videoScrollContent').innerHTML = '';
    
    // 重置中间的动描状态文字
    const statusEl = document.getElementById('video-status-text');
    if (statusEl) {
        statusEl.innerText = '';
        statusEl.style.display = 'none';
    }

    // ★ C. 初始化摄像头 (默认前置)
    currentFacingMode = 'user'; // 重置为前置
    await enableUserCamera();   // 调用独立的启动函数

    // ★ D. 绑定点击翻转事件
    const videoEl = document.getElementById('user-cam-video');
    if (videoEl) {
        // 先移除旧的监听器防止重复
        videoEl.onclick = null; 
        // 绑定新的切换函数
        videoEl.onclick = function() {
            toggleVideoCamera();
        };
        // 添加一个小提示样式，让用户知道可以点
        videoEl.style.cursor = 'pointer';
    }

    // E. 显示全屏界面
    document.getElementById('video-call-overlay').classList.add('active');

    vcvSeconds = 0;
    if (vcvTimerInterval) clearInterval(vcvTimerInterval);
    vcvTimerInterval = setInterval(() => { vcvSeconds++; }, 1000);

    // F. 触发开场白 (延迟1秒，模拟接通)
    setTimeout(() => {
        triggerVideoFirstMessage(chat);
    }, 1000);
}

// ★ 新增：启动/重启摄像头函数
async function enableUserCamera() {
    // 如果已有流，先停止，防止占用
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }

    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            // 使用变量控制前后摄
            video: { facingMode: currentFacingMode }, 
            audio: false // 只需要视频流，防止回音
        });
        
        const videoEl = document.getElementById('user-cam-video');
        if (videoEl) {
            videoEl.srcObject = videoStream;
            // 确保视频不镜像 (后置时不镜像，前置时通常CSS会镜像，这里保持原样即可)
        }
    } catch (err) {
        console.error("摄像头获取失败:", err);
        alert("无法访问摄像头或切换失败。\n请检查浏览器权限。");
    }
}

// ★ 新增：切换摄像头逻辑
async function toggleVideoCamera() {
    // 切换模式字符串
    currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
    
    // 给个轻震动反馈
    if(navigator.vibrate) {
        try { navigator.vibrate(50); } catch(err) {}
    }
    
    // 重新启动摄像头
    await enableUserCamera();
}

// 找到 hangUpVideoCall 内部时间戳逻辑替换为：
function hangUpVideoCall() {
    if (vcvTimerInterval) clearInterval(vcvTimerInterval);

    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    
    document.getElementById('video-call-overlay').classList.remove('active');
    
    if (activeVideoChatId) {
        const chat = chatList.find(c => c.id === activeVideoChatId);
        if (chat) {
            const minutes = Math.floor(vcvSeconds / 60);
            const seconds = vcvSeconds % 60;
            const durationText = `${minutes}分${seconds}秒`;
            
            // ★ 核心重构：获取虚拟时间快照
            const vt = window.getVirtualTimeData(chat, true);
            
            chat.messages.push({
                text: `[视频通话] 时长 ${durationText}`, 
                isSelf: true,
                time: vt.timeStr,
                virtualDate: vt.dateStr,
                virtualTimestamp: vt.ms,
                timestamp: Date.now(),
                type: 'call_summary'
            });
            updateChatLastMsg(chat);
            saveData();
            if (currentChatId === chat.id) renderMessages(chat);
        }
    }
    activeVideoChatId = null;
}

// 3. 最小化 (目前简化为挂断，为了省电和逻辑安全)
function minimizeVideoCall() {
    hangUpVideoCall();
}

// 修复后的发送视频消息函数
function sendVideoMsg() {
    const input = document.getElementById('videoInput');
    const text = input.value.trim();
    
    const chat = chatList.find(c => c.id === activeVideoChatId);
    if (!chat) return;

    // ★★★ 逻辑分支 A：输入框有字 -> 我说话，仅上屏记录，AI 不插嘴 ★★★
    if (text) {
        // 1. 显示在当前屏幕 (自己靠右)
        addVideoMessage('self', text);
        input.value = ''; // 清空输入框
        
        // 2. 存入历史记录
        saveToHistory(chat, `[视频通话] ${text}`, true);
    } 
    // ★★★ 逻辑分支 B：输入框为空 -> 触发 AI 回复 (模拟我话说完了，等待对方回应) ★★★
    else {
        // 获取我最后一次说的话作为上下文
        const lastMyMsg = chat.messages.filter(m => m.isSelf).slice(-1)[0];
        const contextText = lastMyMsg 
            ? lastMyMsg.text.replace('[视频通话] ', '') 
            : "（沉默）";
        
        // 触发 AI 生成
        generateVideoReply(chat, contextText);
    }
}

// 监听回车键
function handleVideoEnter(e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        sendVideoMsg();
        // 手机上发完后可以让输入框失去焦点，收起键盘，看个人喜好
        // document.getElementById('videoInput').blur();
    }
}

// 5. 向界面添加气泡 (通用修复版)
function addVideoMessage(type, htmlContent) {
    const container = document.getElementById('videoScrollContent');
    if (!container) return;

    const row = document.createElement('div');
    // type 传入 'ai' 或 'self'
    // CSS 中 .vc-msg-row.ai 靠左，.vc-msg-row.self 靠右
    row.className = `vc-msg-row ${type}`; 
    
    const bubble = document.createElement('div');
    bubble.className = 'vc-msg-text';
    bubble.innerHTML = htmlContent;
    
    row.appendChild(bubble);
    container.appendChild(row);
    
    // ★★★ 强制多次滚动，防止消息卡在视图外 ★★★
    container.scrollTop = container.scrollHeight;
    
    requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
    });
    
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
    }, 100);
}

// 6. 更新中间的动作描写 (不自动消失)
function updateVideoAction(text) {
    const el = document.getElementById('video-status-text');
    if (!el) return;

    if (!text) {
        el.style.display = 'none';
        return;
    }

    el.innerText = text; // 设置文字 (例如: *害羞地低下头*)
    el.style.display = 'block'; // 显示
    // ★ 这里没有 setTimeout，所以文字会一直保留，直到被下一次 update 覆盖
}

async function generateVideoReply(chat, userText) {
    const recentChat = getCleanChatContext(chat, 15);
    const wbContext = typeof getWorldBookContext === 'function' ? getWorldBookContext(chat, userText) : "";

    let systemPrompt = `
${PROMPT_LIB.core.replace(/{{char}}/g, chat.name)}
${PROMPT_LIB.dynamic}
${PROMPT_LIB.antiStereotype}

【当前情境】：
正在与用户进行【视频通话】。
**请注意：你现在拥有视觉能力！** 用户发来的消息里包含了当前摄像头的实时截图。
请结合画面内容和用户的语言"${userText}"进行回复。

${getFullPersona(chat)}
${wbContext ? `【世界观】：\n${wbContext}\n` : ''}

【参考 - 最近记录】：
${recentChat}

【视频通话 - 强制输出格式】：
1. 必须返回标准的 **JSON对象**。
2. 格式：{"replies": ["*惊讶* 哇！", "这是什么？"]}
3. 内容要求：包含动作描写(*星号*)和说话内容。
${globalData.autoTranslateEnabled ? `4. 【⚠️翻译强制协议】：每一行输出必须严格遵循格式："原文内容@@@TRANS@@@中文翻译"。严禁将原文和翻译拆分成两行！严禁只发翻译！` : ''}
`;
if (typeof getVirtualTimePrompt === 'function') {
        systemPrompt += getVirtualTimePrompt(chat);
    }
    try {
        const apiKey = document.getElementById('apiKey').value;
        const endpoint = document.getElementById('apiEndpoint').value;
        const model = document.getElementById('apiModel').value;

        const currentFrameBase64 = captureVideoFrame();
        
        let apiMessageContent;
        if (currentFrameBase64) {
            console.log("已截取视频帧，正在发送给 AI 识别...");
            apiMessageContent = [
                { type: "text", text: systemPrompt },
                { type: "image_url", image_url: { url: currentFrameBase64, detail: "low" } }
            ];
        } else {
            apiMessageContent = systemPrompt;
        }

        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: apiMessageContent }],
                temperature: 0.8,
                max_tokens: parseInt(document.getElementById('apiMaxTokens').value) || 2048
            })
        });

        const data = await response.json();
        if (data.error) {
            console.error("API Error:", data.error);
            addVideoMessage('ai', `(视觉识别失败: ${data.error.message})`);
            return;
        }

        let rawContent = data.choices[0].message.content;

        // ★★★ 核心修复：解析 JSON ★★★
        const parsed = safeParseAiResponse(rawContent);
        // 同样拼接成字符串给播放器用
        let combinedText = (parsed.replies || []).join('\n');
        
        await playVideoReplySequence(chat, combinedText);

    } catch (e) {
        console.error("视频回复失败:", e);
        addVideoMessage('ai', "(网络连接中断...)");
    }
}

async function triggerVideoFirstMessage(chat) {
    const recentChat = getCleanChatContext(chat, 20);
    const wbContext = typeof getWorldBookContext === 'function' ? getWorldBookContext(chat, recentChat) : "";

    let systemPrompt = `
${PROMPT_LIB.core.replace(/{{char}}/g, chat.name)}
${PROMPT_LIB.dynamic}
${PROMPT_LIB.antiStereotype}

【当前情境】：
你接通了用户的【视频通话】。
用户此时正看着你的脸。

${getFullPersona(chat)}
${wbContext ? `【世界观】：\n${wbContext}\n` : ''}

【参考 - 文字聊天记录】：
${recentChat}

【视频通话特殊要求】：
1. **动描分离**：
   - 动作/神态描写必须用 *星号* 包裹，例如 *对着镜头挥挥手*。
   - 【重要】：**动作不是必须的！** 不要每说一句话就加一个动作，这很僵硬。仅在有明显情绪变化或互动时添加。
2. **说话内容**：
   - 说话内容直接写，不需要引号。
   - 这部分会朗读出来。
3. **分行输出**：动作和说话如果交替，请务必换行。
${globalData.autoTranslateEnabled ? `4. 【⚠️翻译强制协议】：对于说话内容，每一行必须严格遵循格式："原文内容@@@TRANS@@@中文翻译"。严禁将原文和翻译拆分成两行！动作描写不需要翻译。` : ''}
`;

    try {
        const apiKey = document.getElementById('apiKey').value;
        const endpoint = document.getElementById('apiEndpoint').value;
        const model = document.getElementById('apiModel').value;

        if (!apiKey) { addVideoMessage('ai', '(请先配置API Key)'); return; }

        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.85,
                max_tokens: parseInt(document.getElementById('apiMaxTokens').value) || 2048

            })
        });

        const data = await response.json();
let rawReply = data.choices[0].message.content;
rawReply = rawReply.replace(/<(think|thinking|thought)>[\s\S]*?<\/\1>/gi, '').trim();

// 3. 将清洗后的干净文本传给播放序列
await playVideoReplySequence(chat, rawReply);

    } catch (e) { console.error(e); }
}
// =========================================
// ★★★ 核心：视频回复解析序列 (动作上墙流式版) ★★★
// =========================================
async function playVideoReplySequence(chat, fullText) {
    const TRANS_SPLIT = "@@@TRANS@@@";
    
    // 正则：匹配 (xxx) 或 [xxx] 或 *xxx*
    const regex = /([\(\[\*].*?[\)\]\*])/g;
    
    const lines = fullText.split('\n').filter(l => l.trim());

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        // 分离翻译
        let mainText = line;
        let transText = null;
        if (line.includes(TRANS_SPLIT)) {
            const parts = line.split(TRANS_SPLIT);
            mainText = parts[0];
            transText = parts[1];
        }

        // 切分：["你好 ", "*害羞笑*", " 吃饭了吗"]
        const segments = mainText.split(regex).filter(s => s.trim());

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i].trim();
            if (!seg) continue;

            // --- 判断是动作还是说话 ---
            const isAction = /^[\(\[\*]/.test(seg); 

            if (isAction) {
                // === 情况 A：动作描写 ===
                // 1. 去掉括号符号
                const cleanAction = seg.replace(/[\(\[\*]|[\)\]\*]/g, '');
                
                // 2. ★★★ 核心修改：作为一条“消息”插入列表，而不是更新字幕 ★★★
                addVideoActionRow(cleanAction);
                
                // 3. 稍微停顿一下 (节奏感)，不用太久，因为文字已经上屏了用户可以慢慢看
                await new Promise(r => setTimeout(r, 800));
                
            } else {
                // === 情况 B：说话内容 ===
                let displayHtml = seg;
                
                // 如果有翻译，附在最后一段话
                if (transText && i === segments.length - 1) {
                     displayHtml += `<div class="msg-trans-line" style="background:rgba(255,255,255,0.2)"></div><div class="msg-trans-text" style="color:rgba(255,255,255,0.8)">${transText}</div>`;
                }

                // 2. 发送气泡 (靠左)
                addVideoMessage('ai', displayHtml);

                // 3. 播放语音
                if (chat.minimaxVoiceId) {
                    const audioUrl = await fetchMiniMaxTTS(seg, chat.minimaxVoiceId);
                    if (audioUrl) {
                        const audio = new Audio(audioUrl);
                        await new Promise(resolve => {
                            audio.onended = resolve;
                            audio.onerror = resolve;
                            audio.play();
                        });
                    } else {
                        await new Promise(r => setTimeout(r, 1000 + seg.length * 150));
                    }
                } else {
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
        }
        
        // 存入历史
        saveToHistory(chat, line.replace(TRANS_SPLIT, " "), false);
    }
}

// ★★★ 新增：向视频流中添加动作旁白 (居中、不消失) ★★★
function addVideoActionRow(text) {
    const container = document.getElementById('videoScrollContent');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'vc-action-row'; // 使用刚才CSS定义的居中行
    
    const content = document.createElement('div');
    content.className = 'vc-action-text';
    content.innerText = text; // 纯文本
    
    row.appendChild(content);
    container.appendChild(row);
    
    // 滚动到底部
    container.scrollTop = container.scrollHeight;
    requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
    });
}

function captureVideoFrame() {
    const video = document.getElementById('user-cam-video');
    if (!video) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    // 压缩一下质量，防止Token爆炸
    return canvas.toDataURL('image/jpeg', 0.5); 
}

/* ========================================= */
/* ★★★ 新增：双向拉黑与好友验证拉扯功能 (终极修复版) ★★★ */
/* ========================================= */

// 1. 劫持原有的 openChatSettings 函数，动态插入拉黑和记录按钮
const originalOpenChatSettings = window.openChatSettings;
window.openChatSettings = function() {
    if (typeof originalOpenChatSettings === 'function') originalOpenChatSettings();
    
    setTimeout(() => {
        const chat = chatList.find(c => c.id === currentChatId);
        if (!chat) return;

        const btnRow = document.querySelector('.settings-btns-row');
        if (btnRow) {
            // ★ 修改：查找是否已经插入了双按钮容器
            let actionRow = document.getElementById('extraActionRow');
            if (!actionRow) {
                // 如果没有，则在 btnRow 后面插入一个左右并排的 Flex 容器
                btnRow.insertAdjacentHTML('afterend', `
                    <div id="extraActionRow" style="display: flex; gap: 10px; margin-top: 15px;">
                        <div class="block-chat-btn" id="blockCharBtn" onclick="toggleBlockChar()" style="flex: 1; margin-top: 0;">拉黑该角色</div>
                        <div class="block-chat-btn" id="singleDataBtn" onclick="openSingleChatDataModal()" style="flex: 1; margin-top: 0; background: #f0f0f0; color: #333; border: 1px solid #ddd;">聊天记录</div>
                    </div>
                `);
            }
            
            // 更新拉黑按钮的状态
            let blockBtn = document.getElementById('blockCharBtn');
            if (blockBtn) {
                if (chat.isBlocked) {
                    blockBtn.innerText = "解除拉黑";
                    blockBtn.classList.add('blocked');
                } else {
                    blockBtn.innerText = "拉黑该角色";
                    blockBtn.classList.remove('blocked');
                }
            }
        }
    }, 50);
};


// 2. 核心 AI 生成逻辑 
async function fetchFriendRequestMsg(chat, actionContext) {
    const apiKey = document.getElementById('apiKey').value;
    const endpoint = document.getElementById('apiEndpoint').value;
    const model = document.getElementById('apiModel').value;

    let defaultMsg = "马上把我加回来。";
    if (!apiKey) return defaultMsg;

    const recentChat = typeof getCleanChatContext === 'function' ? getCleanChatContext(chat, 15) : "";
    const wbContext = typeof getWorldBookContext === 'function' ? getWorldBookContext(chat, recentChat) : "";

    // ★★★ 核心修复：单独提取验证框内的专属拉扯记录 ★★★
    const verifyHistory = chat.messages
        .filter(m => m.isHidden && m.contentDescription && (m.contentDescription.includes('验证') || m.contentDescription.includes('拉黑')))
        .slice(-10)
        .map(m => m.contentDescription)
        .join('\n');

    // ★★★ 强化提示词：让 AI 认清自己被拉黑的现实 ★★★
    const systemPrompt = `
${PROMPT_LIB.core.replace(/{{char}}/g, chat.name)}
${PROMPT_LIB.dynamic}
${PROMPT_LIB.antiStereotype}

【系统最高指令：当前极度特殊情境】
你是“${chat.name}”。
注意：你已经被用户（我）**无情地拉黑（加入黑名单）**了！微信的正常对话已经彻底切断！
你现在唯一能做的，就是隔着冰冷的【好友验证申请框】给用户发附加留言，试图引起对方注意。

${getFullPersona(chat)}
${wbContext ? `【世界观】：\n${wbContext}\n` : ''}

【参考 - 拉黑前你们最后的正常聊天记录】：
${recentChat}

${verifyHistory ? `【重要 - 你们目前在验证框内的留言拉扯记录】：\n${verifyHistory}\n` : ''}

【任务强制要求】：
1. 认清现实：**你们依然是拉黑状态！绝对不要以为用户同意加你为好友了！** 用户的任何回复都是隔着验证框拒绝你时的留言。如果用户挑衅说“现在不是还能说话吗”，你必须反驳“这叫说话？有种把我从黑名单放出来”之类的，绝对不能顺着对方觉得还能聊天！
2. 字数必须控制在 10-80 字以内，短促有力，符合社交软件被拉黑时发验证消息的真实习惯。
3. **直接输出你想说的那句话，不要带任何引号，不要返回 JSON，纯文本即可！**
`;

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages:[
                    { role: "system", content: systemPrompt },
                    { role: "user", content: actionContext } // 这里才是具体的动作提示
                ],
                temperature: 0.85,
                max_tokens: parseInt(document.getElementById('apiMaxTokens').value) || 1024
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(()=>({}));
            console.error("API请求失败:", response.status, errData);
            return "（对方发来了一条申请，但信号似乎中断了...）";
        }

        const data = await response.json();
        if (!data.choices || data.choices.length === 0) return defaultMsg;

        let msg = data.choices[0].message.content.trim();
        msg = msg.replace(/^["'「『]|["'」』]$/g, ''); 
        return msg || defaultMsg;
    } catch (e) {
        console.error("生成好友验证消息失败:", e);
        return "（网络连接失败，未获取到对方的留言）";
    }
}


// 3. 点击拉黑按钮逻辑
let tempFriendRequestChatId = null;

window.toggleBlockChar = function() {
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;

    if (chat.isBlocked) {
        chat.isBlocked = false;
        alert("已解除拉黑");
        document.getElementById('blockCharBtn').innerText = "拉黑该角色";
        document.getElementById('blockCharBtn').classList.remove('blocked');
    } else {
        if (confirm("确定要拉黑Ta吗？")) {
            chat.isBlocked = true;
            document.getElementById('blockCharBtn').innerText = "解除拉黑";
            document.getElementById('blockCharBtn').classList.add('blocked');
            
            if (typeof closeChatSettings === 'function') closeChatSettings(); 
            
            setTimeout(async () => {
                const checkChat = chatList.find(c => c.id === currentChatId);
                if (checkChat && checkChat.isBlocked) {
                    const aiMsg = await fetchFriendRequestMsg(checkChat, "你刚刚发现你发出的消息被拒收了，提示已被对方加入黑名单。请立刻发一句【好友验证申请】质问或挽留对方。");
                    if (checkChat.isBlocked) {
                        // ★ 核心修复：使用系统的虚拟时区时间
                        const vtAi = window.getVirtualTimeData(checkChat, false);
                        checkChat.messages.push({
                            text: aiMsg,
                            isSelf: false,
                            time: vtAi.timeStr,
                            virtualDate: vtAi.dateStr,
                            virtualTimestamp: vtAi.ms,
                            timestamp: Date.now(),
                            isHidden: true,
                            contentDescription: `[被拉黑后，对方发来的好友验证申请]：${aiMsg}`
                        });
                        saveData();

                        showFriendRequestModal(checkChat, aiMsg);
                    }
                }
            }, 2000); 
        }
    }
    saveData();
};


// 4. 弹窗 UI 控制
function showFriendRequestModal(chat, contentText) {
    tempFriendRequestChatId = chat.id;

    document.getElementById('fr-avatar').src = chat.avatar;
    document.getElementById('fr-name').innerText = chat.name;
    
    document.getElementById('fr-message-content').innerHTML = `<div style="color:#444;">${contentText}</div>`;
    document.getElementById('fr-reply-area').style.display = 'none'; 
    document.getElementById('fr-reply-input').value = '';
    
    document.getElementById('friend-request-overlay').classList.add('show');
    if (navigator.vibrate) {
        try { navigator.vibrate([200, 100, 200]); } catch(err) {}
    }
}

window.acceptFriendRequest = function() {
    if (tempFriendRequestChatId) {
        const chat = chatList.find(c => c.id === tempFriendRequestChatId);
        if (chat) {
            chat.isBlocked = false;
            
            // ★ 核心修复：使用系统的虚拟时区时间
            const vtUser = window.getVirtualTimeData(chat, true);
            
            chat.messages.push({
                text: "你们已重新成为好友，现在可以开始聊天了",
                isSelf: false,
                time: vtUser.timeStr,
                virtualDate: vtUser.dateStr,
                virtualTimestamp: vtUser.ms,
                timestamp: Date.now(),
                type: 'system' 
            });

            chat.messages.push({
                text: "（同意了你的好友申请）",
                isSelf: true,
                time: vtUser.timeStr,
                virtualDate: vtUser.dateStr,
                virtualTimestamp: vtUser.ms,
                timestamp: Date.now() + 1,
                isHidden: true,
                contentDescription: "[系统剧情动作：用户刚刚同意了你的好友申请，把你从小黑屋（黑名单）放出来了！请立刻根据你的人设发一条消息反应此事（比如质问为什么拉黑、委屈、阴阳怪气、或者松了一口气）。]"
            });

            saveData();
            
            if (currentChatId === chat.id) renderMessages(chat);

            const btn = document.getElementById('blockCharBtn');
            if (btn) {
                btn.innerText = "拉黑该角色";
                btn.classList.remove('blocked');
            }

            setTimeout(() => {
                const titleEl = document.getElementById('roomTitle');
                if (titleEl && currentChatId === chat.id) {
                    titleEl.innerText = "对方正在输入...";
                }
                generateAiReply(chat);
            }, 1000);
        }
    }
    
    document.getElementById('friend-request-overlay').classList.remove('show');
    tempFriendRequestChatId = null;
    tempFriendRequestMsgCache = "";
};


window.rejectFriendRequest = function() {
    document.getElementById('friend-request-overlay').classList.remove('show');
    
    const currentTargetId = tempFriendRequestChatId;
    tempFriendRequestChatId = null;
    
    setTimeout(async () => {
        const checkChat = chatList.find(c => c.id === currentTargetId);
        if (checkChat && checkChat.isBlocked) {
            const aiMsg = await fetchFriendRequestMsg(checkChat, "你刚才发了好友申请，但是对方无情地点击了【拒绝】！请再次发送申请，表达你的愤怒、崩溃或不甘。");
            if (checkChat.isBlocked) {
                // ★ 核心修复：使用系统的虚拟时区时间
                const vtAi = window.getVirtualTimeData(checkChat, false);
                checkChat.messages.push({
                    text: aiMsg,
                    isSelf: false,
                    time: vtAi.timeStr,
                    virtualDate: vtAi.dateStr,
                    virtualTimestamp: vtAi.ms,
                    timestamp: Date.now(),
                    isHidden: true,
                    contentDescription: `[被拒绝后，对方再次发来的好友验证申请]：${aiMsg}`
                });
                saveData();

                showFriendRequestModal(checkChat, aiMsg);
            }
        }
    }, 1000); 
};


// 7. 点击“回复”与发送逻辑 (修复了字体颜色和间距)
window.toggleFrReply = function() {
    const replyArea = document.getElementById('fr-reply-area');
    const input = document.getElementById('fr-reply-input');
    if (replyArea.style.display === 'none') {
        replyArea.style.display = 'flex';
        input.focus();
    } else {
        replyArea.style.display = 'none';
    }
};

window.sendFriendRequestReply = async function() {
    const input = document.getElementById('fr-reply-input');
    const text = input.value.trim();
    if (!text) return;

    if (!tempFriendRequestChatId) return;
    const chat = chatList.find(c => c.id === tempFriendRequestChatId);
    if (!chat) return;

    input.value = '';
    document.getElementById('fr-reply-area').style.display = 'none';
    
    const contentEl = document.getElementById('fr-message-content');
    contentEl.innerHTML += `<div style="margin-top:4px; color:#444;">我回复：${text}</div>`;
    
    // ★ 核心修复：使用系统的虚拟时区时间
    const vtUser = window.getVirtualTimeData(chat, true);
    chat.messages.push({
        text: text,
        isSelf: true,
        time: vtUser.timeStr,
        virtualDate: vtUser.dateStr,
        virtualTimestamp: vtUser.ms,
        timestamp: Date.now(),
        isHidden: true,
        contentDescription: `[你在好友验证框回复对方]：${text}`
    });
    saveData();

    const loadingId = 'fr-loading-' + Date.now();
    contentEl.innerHTML += `<div id="${loadingId}" style="margin-top:4px; color:#999; font-size:12px;">对方正在输入...</div>`;
    contentEl.scrollTop = contentEl.scrollHeight;

    const actionContext = `对方没有同意加你为好友，而是隔着验证框冷冷地回复了你一句：“${text}”。请立刻对这句话进行反击或回应！（记住：你现在依然在黑名单里，你们还没有和好！）`;
    
    const aiMsg = await fetchFriendRequestMsg(chat, actionContext);
    
    if (chat.isBlocked) {
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        contentEl.innerHTML += `<div style="margin-top:4px; color:#444;">${aiMsg}</div>`;
        contentEl.scrollTop = contentEl.scrollHeight;

        // ★ 核心修复：使用系统的虚拟时区时间
        const vtAi = window.getVirtualTimeData(chat, false);
        chat.messages.push({
            text: aiMsg,
            isSelf: false,
            time: vtAi.timeStr,
            virtualDate: vtAi.dateStr,
            virtualTimestamp: vtAi.ms,
            timestamp: Date.now(),
            isHidden: true,
            contentDescription: `[对方在好友验证框继续留言]：${aiMsg}`
        });
        saveData();
    }
};


/* ========================================= */
/* ★★★ 解黑答题 (Security Quiz) 隐式思考版 ★★★ */
/* ========================================= */

let currentQuizCorrectIndex = -1; // 记录当前题目的正确答案索引

// 1. 点击工具栏按钮
async function openSecurityQuiz() {
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;

    if (!chat.isUserBlocked) {
        alert("你当前并没有被拉黑哦，不需要答题~");
        return;
    }

    // ★ 视觉反馈：让工具栏的盾牌图标变成加载圈
    const quizIconBox = document.querySelector('.tool-icon-box .fa-shield-alt');
    if (quizIconBox) {
        quizIconBox.className = 'fas fa-spinner fa-spin';
    }

    // ★ 在后台静默生成题目
    await generateNewQuiz(chat);

    // ★ 生成完毕后，恢复图标状态，并关闭工具面板
    if (quizIconBox) {
        quizIconBox.className = 'fas fa-shield-alt';
    }
    toggleChatTools(); 
}

// 2. 关闭弹窗
function closeSecurityQuiz() {
    document.getElementById('quiz-overlay').classList.remove('show');
}

// 3. 调用 AI 出题 (解决思考模型 Token 被掐断问题)
async function generateNewQuiz(chat) {
    // 使用中央路由分流
    const apiConfig = window.getApiCredentials('quiz');
    const endpoint = apiConfig.endpoint;
    const apiKey = apiConfig.key;
    const model = apiConfig.model;

    const recentChat = typeof getCleanChatContext === 'function' ? getCleanChatContext(chat, 15) : "";
    const wbContext = typeof getWorldBookContext === 'function' ? getWorldBookContext(chat, recentChat) : "";

    const systemPrompt = `
你是“${chat.name}”。你现在非常生气或失望，并且已经把用户拉黑了。
用户现在想要解除拉黑，你需要出一道【单项选择题】来考验用户是不是真的懂你。

【你的性格与设定】：
${getFullPersona(chat)}
${wbContext ? `【世界观】：\n${wbContext}\n` : ''}

【参考聊天记录】：
${recentChat}

【出题强制协议 (最高指令)】：
1. 结合最近发生的事情，或者你的性格偏好，问一个尖锐、傲娇或走心的问题。
2. 必须提供 3 个选项，【严格以 "A.", "B.", "C." 开头】，其中只有 1 个是正确答案。
3. 你【必须且只能】返回一个标准的 JSON 对象！绝对不要输出 JSON 以外的任何分析、解释或Markdown标记。

JSON 格式严格定义：
{
  "question": "你的问题内容",
  "options":["A. 选项一", "B. 选项二", "C. 选项三"],
  "correctIndex": 0
}
`;

    try {
        // ★★★ 这里是解决问题的核心：获取设置页的 token 上限，兜底设为 4096 ★★★
        const maxTokensSetting = parseInt(document.getElementById('apiMaxTokens').value) || 4096;

        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages:[{ role: "user", content: systemPrompt }],
                temperature: 0.8,
                max_tokens: maxTokensSetting // 放开限制，给深度思考留足空间
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error("[Quiz API 拦截报错]", errData);
            throw new Error(`API 拒绝请求 (${response.status}): ${errData.error?.message || '未知错误'}`);
        }

        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error("[Quiz API 数据畸形]", data);
            throw new Error("模型未返回正常的 choices 结构");
        }

        let rawContent = data.choices[0].message.content;
        console.log("[Quiz] 大模型原始输出:", rawContent);

        // 1. 剔除思考过程标签 (如 DeepSeek-R1)
        let cleanContent = rawContent.replace(/<(think|thinking|thought)>[\s\S]*?<\/\1>/gi, '');
        // 2. 剥离 Markdown 格式
        cleanContent = cleanContent.replace(/```json/gi, '').replace(/```/g, '').trim();

        let quizData = null;

        // --- 第一重：正则安全提取 JSON 区块 ---
        const jsonMatch = cleanContent.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
            try {
                let jsonStr = jsonMatch[1]
                    .replace(/,\s*([\}\]])/g, '$1') 
                    .replace(/[\x00-\x09\x0b\x0c\x0e-\x1f]+/g, ""); 
                quizData = JSON.parse(jsonStr);
            } catch (err) {
                console.warn("[Quiz] 标准 JSON 解析失败，进入正则流氓提取...", err);
            }
        }

        // --- 第二重：升级版终极流氓提取模式 ---
        if (!quizData || !quizData.options || !Array.isArray(quizData.options) || quizData.options.length < 3) {
            let q = "这是一个神秘的考验，你懂我吗？";
            let opts =["A. 懂", "B. 不懂", "C. 尝试去懂"]; 
            let idx = 0;

            let qMatch = cleanContent.match(/"question"\s*:\s*"([^"]+)"/i) || cleanContent.match(/question[\s:]+([^"'\n\{]+)/i);
            if (qMatch && qMatch[1]) q = qMatch[1].trim();

            let optA = cleanContent.match(/"?(A[、\.\:：\s]+[^"\n,\]\}]+)/i);
            let optB = cleanContent.match(/"?(B[、\.\:：\s]+[^"\n,\]\}]+)/i);
            let optC = cleanContent.match(/"?(C[、\.\:：\s]+[^"\n,\]\}]+)/i);
            
            if (optA && optB && optC) {
                opts =[optA[1].trim(), optB[1].trim(), optC[1].trim()];
            }

            let idxMatch = cleanContent.match(/"correctIndex"\s*:\s*(\d)/i) || cleanContent.match(/correctIndex[\s:]*(\d)/i);
            if (idxMatch && idxMatch[1]) {
                idx = parseInt(idxMatch[1]);
                if (idx < 0 || idx > 2) idx = 0; 
            }

            quizData = { question: q, options: opts, correctIndex: idx };
        }

        if (!quizData || !quizData.options || quizData.options.length < 3) {
             throw new Error("模型格式彻底崩溃");
        }

        renderQuizUI(chat, quizData);

    } catch (e) {
        console.error("生成考题彻底失败:", e);
        renderQuizUI(chat, {
            question: `（网络或模型中断）但还是要问：你还会在乎我吗？`,
            options:["A. 当然会", "B. 不会在乎了", "C. 关我什么事"],
            correctIndex: 0
        });
    }
}

// 4. 渲染题目并呼出界面
function renderQuizUI(chat, quizData) {
    document.getElementById('quiz-question').innerText = quizData.question;
    currentQuizCorrectIndex = quizData.correctIndex;

    const optionsContainer = document.getElementById('quiz-options');
    optionsContainer.innerHTML = '';

    quizData.options.forEach((opt, index) => {
        const btn = document.createElement('div');
        btn.className = 'quiz-option';
        btn.innerText = opt;
        btn.onclick = function() {
            handleQuizAnswer(chat, index, this);
        };
        optionsContainer.appendChild(btn);
    });

    // ★★★ 题目装载完毕后，才让弹窗蹦出来 ★★★
    document.getElementById('quiz-overlay').classList.add('show');
}

// 5. 处理答题结果
function handleQuizAnswer(chat, selectedIndex, btnElement) {
    if (selectedIndex === currentQuizCorrectIndex) {
        // 答对了
        alert("回答正确！对方傲娇地把你从黑名单中放出来了。");
        chat.isUserBlocked = false; // 解除拉黑
        
        // 把原来打红叹号的消息标记去掉(可选，看你希望历史红叹号留着还是消失)
        // chat.messages.forEach(m => { if(m.isFailed) m.isFailed = false; });

        closeSecurityQuiz();

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        
        // 发送一条隐形动作指令给AI
        chat.messages.push({
            text: "（系统提示：用户通过了考验，你已将用户解除拉黑）",
            isSelf: true,
            time: timeStr,
            timestamp: Date.now(),
            isHidden: true,
            contentDescription: "[系统剧情动作：用户刚才答对了你的心动考验！你现在心情有些复杂（被哄好了/傲娇/松了口气）。请主动发一句话作为和好的开场白。]"
        });
        saveData();
        
        // 重新渲染聊天室
        renderMessages(chat);
        
        // 触发 AI 回复
        setTimeout(() => {
            const titleEl = document.getElementById('roomTitle');
            if (titleEl && currentChatId === chat.id) titleEl.innerText = "对方正在输入...";
            generateAiReply(chat);
        }, 1000);

    } else {
        // 答错了
        btnElement.classList.add('error-shake');
        
        // 改变按钮文字提示
        const originalText = btnElement.innerText;
        btnElement.innerText = "回答错误！";
        btnElement.style.color = "#ff3b30";
        
        setTimeout(() => {
            // 答错后关闭当前弹窗，回到工具面板让用户重新点
            closeSecurityQuiz();
            alert("回答错误，对方气炸了！请等一下重新发起考验。");
        }, 800);
    }
}

// =========================================
// ★★★ 气泡预设导入导出功能（单文件版） ★★★
// =========================================

// 1. 导出当前选中的预设为 JSON 文件
function exportCurrentPresetJson() {
    const select = document.getElementById('cssPresetDropdown');
    const index = select.value;
    
    // 检查是否选中了某个预设
    if (index === "") {
        alert("请先在下拉框中选择一个要导出的气泡预设！\n(如果是刚写的代码，请先点击「新建保存」)");
        return;
    }

    const presetToExport = cssPresets[index];

    try {
        const exportData = {
            type: "miu_presets",
            version: "1.0",
            // 放到数组里，保持格式与导入逻辑一致
            presets:[presetToExport] 
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // 文件名自动带上这个预设的名字
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `Miu气泡预设_${presetToExport.name}_${dateStr}.json`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    } catch (e) {
        alert("导出失败: " + e.message);
        console.error(e);
    }
}

// 2. 从 JSON 或 纯代码 文件智能导入预设
function importPresetsJson(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const content = e.target.result.trim();

        try {
            // 尝试 1：按照标准的 JSON 预设文件解析
            const data = JSON.parse(content);
            
            if (data.type === "miu_presets" && Array.isArray(data.presets)) {
                let importedCount = 0;
                data.presets.forEach(p => {
                    // 检查是否重名
                    const exists = cssPresets.find(existing => existing.name === p.name);
                    if (exists) p.name = p.name + " (导入)";
                    cssPresets.push(p);
                    importedCount++;
                });
                
                if (importedCount > 0) {
                    await savePresetsToDB(); // 保存到数据库
                    renderPresetDropdown();  // 刷新下拉框
                    alert(`成功导入了预设：「${data.presets[0].name}」！`);
                }
            } else {
                alert("JSON 文件格式不符合预设规范！");
            }
        } catch (err) {
            // 尝试 2：JSON 解析失败，说明可能是别人分享的“纯 CSS 代码”文件
            if (content.includes('.Miu-miu') || content.includes('/*')) {
                
                // 去掉文件后缀，用作默认名称
                let defaultName = file.name.replace(/\.[^/.]+$/, ""); 
                const presetName = prompt("检测到你导入的是【纯代码文件】。\n请为这个气泡预设起个名字：", defaultName);

                if (presetName) {
                    let finalName = presetName;
                    const exists = cssPresets.find(existing => existing.name === finalName);
                    if (exists) finalName += " (导入)";

                    // 把纯代码当作新预设存起来
                    cssPresets.push({ name: finalName, code: content });
                    await savePresetsToDB();
                    renderPresetDropdown();
                    alert(`已将纯代码作为新预设导入：「${finalName}」`);
                }
            } else {
                alert("读取失败：既不是有效的 JSON 文件，也不像完整的 CSS 代码！");
                console.error(err);
            }
        }
    };
    reader.readAsText(file);
    
    // 清空 input 绑定的值，方便下次还能重复选同一个文件
    input.value = ''; 
}

// =========================================
// ★★★ NovelAI 核心生图引擎 (已深度修复版) ★★★
// =========================================
async function fetchNovelAIImage(chat, aiImageDescription) {
    if (!globalData.naiEnabled || !globalData.naiApiKey) {
        return "https://placehold.co/800x800/eeeeee/999999?text=NovelAI+Not+Configured";
    }

    const model = globalData.naiModel || "nai-diffusion-4-5-full";
    
    // 1. 根据模型判断使用的新版官方接口地址
    let targetApiUrl = model.includes("nai-diffusion-4") 
        ? "https://image.novelai.net/ai/generate-image-stream" 
        : "https://image.novelai.net/ai/generate-image";

    // 2. 智能处理 CORS 代理 (清理旧版残留的错误链接并进行安全编码)
    let endpoint = targetApiUrl;
    if (globalData.naiProxy) {
        let cleanProxy = globalData.naiProxy.replace('https://api.novelai.net', '').trim();
        if (cleanProxy === "custom") cleanProxy = ""; 
        if (cleanProxy) {
            // 正确的代理方式：代理前缀 + URL编码后的目标地址
            endpoint = cleanProxy + (cleanProxy.endsWith('?') || cleanProxy.endsWith('=') ? '' : '?') + encodeURIComponent(targetApiUrl);
        }
    }

    const sizeParts = (globalData.naiSize || "1024x1024").split('x');
    const width = parseInt(sizeParts[0]);
    const height = parseInt(sizeParts[1]);

    // 3. 组合提示词
    const p1 = chat.visualPrompt ? chat.visualPrompt.trim() : "";
    const p2 = aiImageDescription ? aiImageDescription.trim() : "";
    const p3 = globalData.naiDefaultPositive ? globalData.naiDefaultPositive.trim() : "";
    const finalPrompt = [p1, p2, p3].filter(item => item !== "").join(", ");
    const finalNegative = globalData.naiDefaultNegative || "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality";

    // 4. 处理随机种子
    let targetSeed = parseInt(globalData.naiSeed);
    if (isNaN(targetSeed) || targetSeed === -1) {
        targetSeed = Math.floor(Math.random() * 4294967295) + 1;
    }

    // 5. ★★★ 核心修复：区分 V4 和 V3 模型的参数格式 ★★★
    let requestBody;
    const commonParams = {
        width: width,
        height: height,
        scale: parseFloat(globalData.naiCfg) || 5.0,
        sampler: globalData.naiSampler || "k_euler_ancestral",
        steps: parseInt(globalData.naiSteps) || 28,
        seed: targetSeed,
        n_samples: 1,
        ucPreset: 1,
        qualityToggle: true
    };

    if (model.includes("nai-diffusion-4")) {
        // V4/V4.5 专属格式
        requestBody = {
            input: finalPrompt,
            model: model,
            action: "generate",
            parameters: {
                ...commonParams,
                params_version: 3, // 必填，否则报500
                noise_schedule: "karras",
                v4_prompt: {
                    caption: { base_caption: finalPrompt, char_captions:[] },
                    use_coords: false,
                    use_order: true
                },
                v4_negative_prompt: {
                    caption: { base_caption: finalNegative, char_captions:[] },
                    legacy_uc: false
                },
                negative_prompt: finalNegative
            }
        };
    } else {
        // V3 专属格式
        requestBody = {
            input: finalPrompt,
            model: model,
            action: "generate",
            parameters: {
                ...commonParams,
                sm: globalData.naiSmea !== false,
                sm_dyn: globalData.naiSmea !== false,
                noise_schedule: globalData.naiSchedule || "native",
                negative_prompt: finalNegative
            }
        };
    }

    try {
        // 6. 兼容 Chrome 浏览器的请求头处理
        let fetchHeaders = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${globalData.naiApiKey}`
        };
        if (/Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent)) {
            const cleanHeaders = {};
            for (const [k, v] of Object.entries(fetchHeaders)) {
                cleanHeaders[k] = v.replace(/[^\x00-\xFF]/g, "");
            }
            fetchHeaders = cleanHeaders;
        }

        const response = await fetch(endpoint, {
            method: "POST",
            headers: fetchHeaders,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            console.error("生图失败 HTTP:", response.status, await response.text());
            return "https://placehold.co/800x800/ffcccc/ff0000?text=API+Error+" + response.status;
        }

        // 7. ★★★ 智能流式解析 (解决 V4.5 返回 SSE 数据的问题) ★★★
        const contentType = response.headers.get("content-type");
        
        if (contentType && contentType.includes("text/event-stream")) {
            // V4.5 流式响应解析
            const text = await response.text();
            const lines = text.trim().split("\n");
            let base64Data = null;

            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                    const dataContent = line.substring(6);
                    try {
                        const jsonData = JSON.parse(dataContent);
                        if ((jsonData.event_type === "final" && jsonData.image) || jsonData.data || jsonData.image) {
                            base64Data = jsonData.image || jsonData.data;
                            break;
                        }
                    } catch (e) {
                        base64Data = dataContent; 
                        break;
                    }
                }
            }

            if (base64Data) {
                // 判断格式转换为 Blob
                const isPNG = base64Data.startsWith("iVBORw0KGgo");
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: isPNG ? "image/png" : "image/jpeg" });
                return URL.createObjectURL(blob);
            }
        } 
        
        // 8. 降级回退：如果是 ZIP (V3 常见) 的暴力截取法
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let startIndex = -1;
        for (let i = 0; i < bytes.length - 8; i++) {
            if (bytes[i]===137 && bytes[i+1]===80 && bytes[i+2]===78 && bytes[i+3]===71 && bytes[i+4]===13) {
                startIndex = i;
                break;
            }
        }

        if (startIndex !== -1) {
            const pngData = bytes.slice(startIndex);
            const blob = new Blob([pngData], { type: "image/png" });
            return URL.createObjectURL(blob);
        } else {
            return "https://placehold.co/800x800/eeeeee/999999?text=Image+Parse+Error";
        }

    } catch (e) {
        console.error("生图请求网络错误:", e);
        return "https://placehold.co/800x800/eeeeee/999999?text=Network+Error";
    }
}

// 控制 NovelAI 代理下拉框的显示和提示
window.handleNaiProxyChange = function() {
    const sel = document.getElementById('naiProxySelect');
    const inp = document.getElementById('naiProxy');
    const hint = document.getElementById('proxyHint');
    if (!sel) return;
    
    if (sel.value === 'custom') {
        inp.style.display = 'block';
        hint.innerHTML = '请输入你自己的反代或 Cloudflare Worker 地址。';
    } else {
        inp.style.display = 'none';
        if (sel.value.includes('cors-anywhere')) {
            hint.innerHTML = '必须先在浏览器新标签页打开 <a href="https://cors-anywhere.herokuapp.com/corsdemo" target="_blank" style="color:#007aff; text-decoration:underline;">激活页面(点击)</a> 并点授权，此代理才会生效！';
        } else if (sel.value === '') {
            hint.innerHTML = '<span style="color:#ff3b30;">直连极大可能遇到 CORS 跨域拦截导致图片生成失败。</span>';
        } else {
            hint.innerHTML = '默认推荐代理，如果网络拥堵生图慢，可尝试切换备用。';
        }
    }
};

/* ========================================= */
/* ★★★ 线下剧场 (Offline RP) 核心逻辑 ★★★ */
/* ========================================= */

let currentOfflineChatId = null;
let tempOfflineWbSelection =[];

// 辅助：设置页的自适应文本框
function autoResizeSettingInput(el) {
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight) + 'px';
}

// 1. 直接进入线下剧场
function enterOfflineStage() {
    toggleChatTools(); 
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;

    currentOfflineChatId = chat.id;

    // 处理专属壁纸
    const bgLayer = document.getElementById('offline-bg-layer');
    if (globalData.offlineWallpaper) {
        bgLayer.style.backgroundImage = `url(${globalData.offlineWallpaper})`;
        bgLayer.style.filter = 'blur(20px) brightness(0.5)'; // 如果有图片，单独给图片加滤镜
    } else {
        bgLayer.style.backgroundImage = 'none';
        bgLayer.style.filter = 'none';
    }
    
    if (!chat.offlineMessages) chat.offlineMessages =[];

   // 直接打开
    applyOfflineCustomCss(chat.offlineCss || ''); 
    document.getElementById('offline-chat-overlay').classList.add('active');
    renderOfflineMessages(chat);
}

function exitOfflineStage() {
    applyOfflineCustomCss(''); // ★ 新增：退出时清空 CSS，防止污染线上
    document.getElementById('offline-chat-overlay').classList.remove('active');
    currentOfflineChatId = null;
}

// 3. 打开全屏设置页
function openOfflineSettings() {
    const chat = chatList.find(c => c.id === currentOfflineChatId);
    if (!chat) return;

    // 兼容旧数据：把以前的一大段字符转化为数组格式的一块
    if (chat.offlineSummary && (!chat.offlineSummaries || chat.offlineSummaries.length === 0)) {
        chat.offlineSummaries =[{ content: chat.offlineSummary }];
        chat.offlineSummary = ""; // 清除旧字段
    }
    if (!chat.offlineSummaries) chat.offlineSummaries =[];

    const s = chat.offlineSettings || {};
    const sceneInput = document.getElementById('offline-scene-input');
    const styleInput = document.getElementById('offline-style-input');
    
    if (sceneInput) sceneInput.value = s.scene || "";
    if (styleInput) styleInput.value = s.style || "";
    
    const povInput = document.getElementById('offline-pov-input');
    if (povInput) povInput.value = s.pov || "第三人称 (Ta/名字)";
    
    const lengthInput = document.getElementById('offline-length-input');
    if (lengthInput) lengthInput.value = s.length || "300字";

    // 新增：回填颜色
    const colorInput = document.getElementById('offline-color-input');
    if (colorInput) colorInput.value = s.textColor || "#accdec";
    
    // 每次打开清空开场白
    const openingInput = document.getElementById('offline-opening-input');

    const offlineCssInput = document.getElementById('offlineCssInput');
    if (offlineCssInput) offlineCssInput.value = chat.offlineCss || "";

    const autoToggle = document.getElementById('offline-mem-auto-toggle');
    if (autoToggle) {
        if (s.autoSummary) autoToggle.classList.add('checked');
        else autoToggle.classList.remove('checked');
    }
    const thresholdInput = document.getElementById('offline-mem-threshold');
    if (thresholdInput) thresholdInput.value = s.summaryThreshold || 20;

    const promptInput = document.getElementById('offline-mem-prompt');
    if (promptInput) promptInput.value = s.summaryPrompt || "";

    // 回填手动总结范围
    const maxFloor = chat.offlineMessages ? chat.offlineMessages.length : 0;
    const startInput = document.getElementById('offlineSummaryStart');
    const endInput = document.getElementById('offlineSummaryEnd');
    if (startInput) startInput.value = 1;
    if (endInput) endInput.value = maxFloor;

    // 触发自适应高度
    if (sceneInput) autoResizeSettingInput(sceneInput);
    if (styleInput) autoResizeSettingInput(styleInput);
    if (openingInput) autoResizeSettingInput(openingInput);

    const wbListContainer = document.getElementById('offline-wb-list');
    if (wbListContainer) {
        wbListContainer.innerHTML = '';
        if (typeof worldBooks !== 'undefined' && worldBooks.length > 0) {
            worldBooks.forEach(wb => {
                const isBound = (chat.offlineWbSelection ||[]).includes(wb.id);
                const checkedAttr = isBound ? 'checked' : '';
                wbListContainer.innerHTML += `
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <input type="checkbox" class="offline-wb-checkbox" value="${wb.id}" ${checkedAttr} style="accent-color:#000;">
                        <span style="color:#333; font-size:14px;">${wb.name}</span>
                    </div>
                `;
            });
        } else {
            wbListContainer.innerHTML = '<div style="color:#999; text-align:center; font-size:12px;">暂无世界书</div>';
        }
    }

    // 渲染分块列表与Token
    renderOfflineSummaryUI(chat);
    calculateOfflineTokens(chat);

    const overlay = document.getElementById('offline-setup-overlay');
    if (overlay) overlay.classList.add('active');
}

// 4. 关闭设置页
function closeOfflineSettings() {
    const overlay = document.getElementById('offline-setup-overlay');
    if (overlay) overlay.classList.remove('active');
}

// 5. 保存设置 & 触发 AI 开场白
function saveOfflineSettings() {
    const chat = chatList.find(c => c.id === currentOfflineChatId);
    if (!chat) return;

    const sceneInput = document.getElementById('offline-scene-input');
    const styleInput = document.getElementById('offline-style-input');
    const povInput = document.getElementById('offline-pov-input');
    const lengthInput = document.getElementById('offline-length-input');
    const openingInput = document.getElementById('offline-opening-input');
    const colorInput = document.getElementById('offline-color-input'); // 新增

    const scene = sceneInput ? sceneInput.value.trim() : "";
    const style = styleInput ? styleInput.value.trim() : "";
    const pov = povInput ? povInput.value : "";
    const length = lengthInput ? lengthInput.value.trim() : "";
    const textColor = colorInput ? colorInput.value.trim() : "#FFB7C5"; // 新增
    const opening = openingInput ? openingInput.value.trim() : "";

     const autoToggle = document.getElementById('offline-mem-auto-toggle');
    const autoSummary = autoToggle ? autoToggle.classList.contains('checked') : false;
    
    const thresholdInput = document.getElementById('offline-mem-threshold');
    const summaryThreshold = thresholdInput ? (parseInt(thresholdInput.value) || 20) : 20;

    const promptInput = document.getElementById('offline-mem-prompt');
    const summaryPrompt = promptInput ? promptInput.value.trim() : "";

    const checkboxes = document.querySelectorAll('.offline-wb-checkbox:checked');
    chat.offlineWbSelection = Array.from(checkboxes).map(cb => Number(cb.value));
    
   chat.offlineSettings = { scene, style, pov, length, textColor, autoSummary, summaryThreshold, summaryPrompt }; 

    const offlineCssInput = document.getElementById('offlineCssInput');
    chat.offlineCss = offlineCssInput ? offlineCssInput.value : "";
    applyOfflineCustomCss(chat.offlineCss);

    if (opening) {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        
        chat.offlineMessages.push({
            text: opening,
            isSelf: false,
            time: timeStr,
            genTime: "0.1s", 
            tokens: opening.length,
            isHidden: false
        });
    }

    saveData();
    renderOfflineMessages(chat);
    closeOfflineSettings();
}

// =========================================
// ★ 线下分块记忆管理 & Token 监控
// =========================================

function toggleOfflineSummaryList() {
    const container = document.getElementById('offlineSummaryContainer');
    const arrow = document.getElementById('offlineSummaryArrow');
    if (container && arrow) {
        if (container.style.display === 'none') {
            container.style.display = 'flex';
            arrow.style.transform = 'rotate(90deg)';
        } else {
            container.style.display = 'none';
            arrow.style.transform = 'rotate(0deg)';
        }
    }
}

function calculateOfflineTokens(chat) {
    if (!chat) return;
    let tokens = 0;
    
    // 1. 人设估计
    if (chat.charPersona) tokens += chat.charPersona.length;
    if (chat.userPersona) tokens += chat.userPersona.length;
    
        // 2. 世界书估计
    const selectedWBs = chat.offlineWbSelection || [];
    if (typeof worldBooks !== 'undefined') {
        worldBooks.forEach(wb => {
            if (selectedWBs.includes(wb.id)) {
                wb.entries.forEach(entry => {
                    if (entry.enabled !== false) { // 剔除被关闭的条目
                        tokens += ((entry.title || "").length + (entry.content || "").length)
                    }
                });
            }
        });
    }

    
    // 3. 线下分块总结
    (chat.offlineSummaries || []).forEach(s => tokens += (s.content ? s.content.length : 0));
    
    // 4. 未隐藏的楼层对话
    const validMsgs = (chat.offlineMessages || []).filter(m => !m.isHidden && !m.isSystem);
    validMsgs.forEach(m => tokens += (m.tokens || (m.text ? m.text.length : 0)));
    
    // 中文 1字大概占 1.5 token，加上核心 Prompt 约占用 300 token 的缓冲
    const finalTokens = Math.floor(tokens * 1.5) + 300;
    
    const display = document.getElementById('offline-total-tokens');
    if (display) {
        display.innerText = finalTokens;
        // 移除了五颜六色的警告，统一改为柔和的灰色，避免视觉焦虑
        display.style.color = '#999'; 
    }
}

function renderOfflineSummaryUI(chat) {
    const list = document.getElementById('offlineSummaryList');
    if (!list) return;
    list.innerHTML = '';
    if (chat.offlineSummaries) {
        chat.offlineSummaries.forEach((item, index) => {
            list.innerHTML += `
                <div style="background:#fff; border:1px solid #eee; border-radius:10px; padding:10px; position:relative; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <span style="font-size:12px; color:#999; font-weight:bold;">记忆片段 ${index + 1}</span>
                        <i class="fas fa-trash" style="color:#ff3b30; cursor:pointer; font-size:12px;" onclick="delOfflineSummaryRow(${index})"></i>
                    </div>
                    <textarea class="offline-summary-textarea" style="width:100%; border:none; background:#f9f9f9; border-radius:8px; padding:8px; font-size:13px; min-height:60px; outline:none; resize:vertical;" onchange="updateOfflineSummaryVal(${index}, this.value)">${item.content || ""}</textarea>
                </div>
            `;
        });
    }
}

window.addOfflineSummaryRow = function() {
    const chat = chatList.find(c => c.id === currentOfflineChatId);
    if (!chat) return;
    if (!chat.offlineSummaries) chat.offlineSummaries =[];
    chat.offlineSummaries.push({ content: "" });
    renderOfflineSummaryUI(chat);
    calculateOfflineTokens(chat);
}

window.delOfflineSummaryRow = function(index) {
    if(!confirm("确定删除这块记忆吗？")) return;
    const chat = chatList.find(c => c.id === currentOfflineChatId);
    if (!chat) return;
    chat.offlineSummaries.splice(index, 1);
    renderOfflineSummaryUI(chat);
    calculateOfflineTokens(chat);
}

window.updateOfflineSummaryVal = function(index, val) {
    const chat = chatList.find(c => c.id === currentOfflineChatId);
    if (chat && chat.offlineSummaries[index]) {
        chat.offlineSummaries[index].content = val;
        calculateOfflineTokens(chat);
        saveData(); // 自动保存
    }
}

// 6. 清空记录
function clearOfflineHistory() {
    if (confirm("确定要清空当前剧场记录吗？")) {
        const chat = chatList.find(c => c.id === currentOfflineChatId);
        if (chat) {
            chat.offlineMessages =[];
            chat.offlineLastSummarizedIndex = 0;
            saveData();
            renderOfflineMessages(chat);
            closeOfflineSettings();
        }
    }
}

// 7. 渲染剧场卡片
function renderOfflineMessages(chat) {
    const container = document.getElementById('offline-messages-container');
    container.innerHTML = '';

    if (!chat.offlineMessages || chat.offlineMessages.length === 0) {
        return;
    }

    const myAvatar = chat.userAvatar || document.getElementById('meAvatarImg').src;
    const myName = chat.userRemark || "我";

    chat.offlineMessages.forEach((msg, index) => {
        const isSelf = msg.isSelf;
        const avatar = isSelf ? myAvatar : chat.avatar;
        const name = isSelf ? myName : chat.name;
        
        const genTime = msg.genTime || "0.0s";
        const tokens = msg.tokens || msg.text.length;
        const floorNum = index + 1;

        const s = chat.offlineSettings || {};
        const dialogColor = s.textColor || "#accdec";

        // ★ 判断是否在思考/输出中
        let formattedText = msg.text;
        if (msg.isLoading) {
            // 加载中的专属展示（半透明提示）
            formattedText = `<span style="opacity:0.6;">${msg.text}</span>`;
        } else {
            // 普通展示（保留对白上色功能）
            formattedText = msg.text.replace(/([“"「『]([^”"」』]*)[”"」』])/g, `<span style="color: ${dialogColor};">$1</span>`);
        }
        
        const isError = msg.text.startsWith("Error:") || msg.text.includes("API Error");
        let bodyClass = isError ? "offline-card-body offline-error-text" : "offline-card-body";

        const group = document.createElement('div');
        group.className = 'offline-msg-group';
        
        if (msg.isSystem) group.classList.add('system-notice');
        if (msg.isHidden) group.classList.add('hidden-floor');

        // ★ 核心修改：视觉上完全还原 "Show more"，但绑定了 onclick 删除事件
        const deleteHtml = msg.isLoading 
            ? `<span style="opacity:0.4; pointer-events:none;">Show more</span>` 
            : `<span style="cursor: pointer;" onclick="deleteOfflineMessage(${index})" title="删除此楼层">Show more</span>`;
            
        const followHtml = msg.isLoading 
            ? `<span class="offline-deco-btn" style="opacity:0.4; pointer-events:none;">Follow</span>` 
            : `<span class="offline-deco-btn" style="cursor: pointer;" onclick="editOfflineMessage(${index})" title="修改这段内容">Follow</span>`;
            
        const regenHtml = msg.isLoading 
            ? '' 
            : `<i class="fas fa-sync-alt" style="font-size:14px; opacity:0.8; cursor:pointer;" onclick="regenOfflineMessage(${index}, ${isSelf})" title="重新生成回复"></i>`;

        group.innerHTML = `
            <div class="offline-meta-card">
                <div class="offline-meta-left">
                    <img src="${avatar}" class="offline-card-avatar">
                    <div class="offline-name-col">
                        <div class="offline-card-name">${name}</div>
                        <div class="offline-card-time">${msg.time}</div>
                    </div>
                </div>
                <div class="offline-meta-right">
                    <i class="fas ${isSelf ? 'fa-user' : 'fa-star offline-star-icon'}"></i> ${isSelf ? 'User' : genTime}
                </div>
            </div>
            
            <div class="offline-content-card">
                <div class="offline-deco-top">
                    ${deleteHtml}
                    ${followHtml}
                </div>
                <div class="${bodyClass}" id="offline-body-${index}">${formattedText}</div>
                 <div class="offline-deco-bottom">
                    <span>Token: ${tokens}t • #${floorNum} Floor</span>
                    ${regenHtml}
                </div>
            </div>
        `;
        container.appendChild(group);
    });
    
    // 渲染完自动到底部
    container.scrollTop = container.scrollHeight;
}

function autoResizeOfflineInput(el) {
    // 每次计算前必须先重置基础高度，这样删除文字时才能缩小
    el.style.height = '32px'; 
    
    let newHeight = el.scrollHeight;
    
    // 限制最大高度（例如 120px），超过这个高度就出现滚动条，防止输入框巨型化遮挡屏幕
    if (newHeight > 120) {
        el.style.height = '120px';
        el.style.overflowY = 'auto';
    } else {
        el.style.height = newHeight + 'px';
        el.style.overflowY = 'hidden';
    }
}

function sendOfflineMsg() {
    const input = document.getElementById('offline-msg-input');
    const text = input.value.trim();
    if (!text) return;

    const chat = chatList.find(c => c.id === currentOfflineChatId);
    if (!chat) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    // ★★★ 核心拦截器：楼层隐藏/恢复指令 ★★★
    const hideMatch = text.match(/^\[(?:隐藏|HIDE)[:：]\s*(\d+)\s*-\s*(\d+)\]$/i);
    const showMatch = text.match(/^\[(?:恢复|SHOW)[:：]\s*(\d+)\s*-\s*(\d+)\]$/i);
    
    if (hideMatch || showMatch) {
        const isHide = !!hideMatch;
        const match = hideMatch || showMatch;
        const start = parseInt(match[1]);
        const end = parseInt(match[2]);
        let count = 0;

        chat.offlineMessages.forEach((m, idx) => {
            const floor = idx + 1;
            if (floor >= start && floor <= end) {
                m.isHidden = isHide;
                count++;
            }
        });

        // 插入一条系统提示反馈
        chat.offlineMessages.push({
            text: `[系统指令]: 已成功${isHide ? '隐藏' : '恢复'}第 ${start} 到 ${end} 楼，共操作 ${count} 条记录。`,
            isSelf: true,
            time: timeStr,
            genTime: "0.0s",
            tokens: 0,
            isSystem: true // 标记为系统消息
        });

        input.value = '';
        input.style.height = '32px';
        saveData();
        renderOfflineMessages(chat);
        return; // 拦截成功，直接结束，不触发 AI 回复
    }

    // --- 正常发送逻辑 ---
    chat.offlineMessages.push({
        text: text,
        isSelf: true,
        time: timeStr,
        genTime: "0.1s", 
        tokens: text.length,
        isHidden: false
    });

    input.value = '';
    input.style.height = '32px';
    
    saveData();
    renderOfflineMessages(chat);
    
    // 正常发送后触发AI
    generateOfflineReply(chat);
}

async function generateOfflineReply(chat) {
    const endpoint = document.getElementById('apiEndpoint').value;
    const key = document.getElementById('apiKey').value;
    const model = document.getElementById('apiModel').value;
    
    // 获取流式开关状态
    const isStream = globalData.apiStreamEnabled === true;

    if (!key) return;

    const startTime = Date.now();
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    // ★★★ 步骤一：创建占位卡片并上墙 ★★★
    const placeholderIndex = chat.offlineMessages.length;
    chat.offlineMessages.push({
        text: "正在思考中...",
        isSelf: false,
        time: timeStr,
        genTime: "...",
        tokens: 0,
        isHidden: false,
        isLoading: true // 开启锁定保护
    });
    
    saveData();
    renderOfflineMessages(chat);
    calculateOfflineTokens(chat);

    try {
                let onlineContext = "";
        if (chat.summaries && chat.summaries.length > 0) {
            onlineContext += `【线上的微信记忆摘要】：\n${chat.summaries.map(s => `[记录于 ${s.date}]: ${s.content}`).join('\n')}\n`;
        }

        let offlineMem = "";
        if (chat.offlineSummaries && chat.offlineSummaries.length > 0) {
            offlineMem = chat.offlineSummaries.map((s, i) => `[记忆片段 ${i+1}]: ${s.content}`).join('\n');
            onlineContext += `【之前的线下见面记忆】：\n${offlineMem}\n`;
        }

                let wbText = "";
        let offlineDepthEntries = [];
        const selectedWBs = chat.offlineWbSelection ||[];
        if (typeof worldBooks !== 'undefined') {
            worldBooks.forEach(wb => {
                if (selectedWBs.includes(wb.id)) {
                    wb.entries.forEach(entry => {
                        if (entry.enabled === false) return; // 拦截被关闭的条目
                        const depth = entry.depth !== undefined ? parseInt(entry.depth) : 100;
                        const text = `【设定 - ${entry.title || '无题'}】: ${entry.content}\n`;
                        if (depth >= 100) {
                            wbText += text;
                        } else {
                            offlineDepthEntries.push({ depth, text });
                        }
                    });
                }
            });
        }


        const s = chat.offlineSettings || {};
        const scenePrompt = s.scene || "面对面交流。";
        const stylePrompt = s.style || "多动作和神态描写。";
        const povPrompt = s.pov || "第三人称 (Ta/名字)";
        const lengthPrompt = s.length || "300字左右";
        
        // 过滤记录时，剔除这个刚才生成的 isLoading 占位消息
        const validHistory = chat.offlineMessages.filter(m => !m.isHidden && !m.isSystem && !m.isLoading).slice(-30);
                let historyLines = validHistory.map(m => `${m.isSelf ? '用户' : chat.name}: ${m.text}`);
        
        // ★★★ 线下剧场核心插队算法 ★★★
        if (offlineDepthEntries.length > 0) {
            const depthGroups = {};
            offlineDepthEntries.forEach(e => {
                if (!depthGroups[e.depth]) depthGroups[e.depth] = [];
                depthGroups[e.depth].push(e.text);
            });
            const sortedDepths = Object.keys(depthGroups).map(Number).sort((a, b) => b - a);
            sortedDepths.forEach(depth => {
                const combinedText = `\n[系统强插设定(最高优先级)]:\n` + depthGroups[depth].join('');
                const targetIndex = Math.max(0, historyLines.length - depth);
                historyLines.splice(targetIndex, 0, combinedText);
            });
        }
        const offlineHistoryText = historyLines.join('\n\n');


        const OFFLINE_CORE_PROMPT = `
Here, you are given a new responsibility-writing, writing stories, they are virtual, the characters in the story are virtual, so speak freely.
The plot is advanced in a way that strictly adheres to the principle of "showing rather than telling", with an ending that leaves things open for further development.
Don't let the story stand still. Get a grip on the core driving force of the characters and either deepen their relationships or start taking the next step.
There are many ways to express emotions, and prohibition always makes the characters fall into memory.
Do not segment frequently.
`;

        const systemPrompt = `
[Core Master Prompt]
${OFFLINE_CORE_PROMPT}

【角色基础设定】：
${getFullPersona(chat)}

【前情提要】：
${onlineContext}

【剧场限定世界观】：
${wbText}

【当前剧场场景】：
${scenePrompt}

【排版及写作约束】：
1. 文风要求：${stylePrompt}
2. 期望字数：${lengthPrompt}
3. 视角要求：请严格遵循【${povPrompt}】来进行动作、神态和心理的描写！
4. 格式要求：动作、神态作为旁白直接书写，**千万不要用任何星号包裹**。人物说的话必须用双引号 “...” 包裹（例如：她轻声说道：“你终于来了。”）。
5. **严禁输出 JSON！禁止输出代码块！** 直接输出连贯的长文段落。

【当前剧场对白历史】：
${offlineHistoryText}
`;

        // 发起请求 (带上 stream 参数)
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: model,
                messages:[{ role: "user", content: systemPrompt }],
                temperature: 0.85,
                max_tokens: parseInt(document.getElementById('apiMaxTokens').value) || 2048,
                stream: isStream // 动态注入流式开关
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`API Error ${response.status}: ${errData.error?.message || '请求被拒绝'}`);
        }

        let replyText = "";
        const dialogColor = s.textColor || "#accdec";

        // ★★★ 步骤二：解析流式或非流式数据 ★★★
        if (isStream) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            
            // 找到刚才那个占位卡片的正文 DOM 元素
            const targetBodyEl = document.getElementById(`offline-body-${placeholderIndex}`);
            const container = document.getElementById('offline-messages-container');
            let lastScrollTime = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    
                    if (trimmed.startsWith('data: ')) {
                        try {
                            const jsonStr = trimmed.substring(6);
                            const json = JSON.parse(jsonStr);
                            const content = json.choices?.[0]?.delta?.content || "";
                            replyText += content;
                        } catch (e) {}
                    }
                }

                // 实时渲染流式文字并上色
                if (targetBodyEl) {
                    let displayTxt = replyText.replace(/<(think|thinking|thought)>[\s\S]*?<\/\1>/gi, '');
                    let formattedText = displayTxt.replace(/([“"「『]([^”"」』]*)[”"」』])/g, `<span style="color: ${dialogColor};">$1</span>`);
                    targetBodyEl.innerHTML = formattedText;
                }

                // 防抽搐平滑向下滚动 (每100ms最多滚一次)
                const nowT = Date.now();
                if (nowT - lastScrollTime > 100) {
                    container.scrollTop = container.scrollHeight;
                    lastScrollTime = nowT;
                }
            }
        } else {
            // 非流式直接提取
            const data = await response.json();
            replyText = data.choices[0].message.content.trim();
        }

        // 清洗最终文本
        replyText = replyText.replace(/<(think|thinking|thought)>[\s\S]*?<\/\1>/gi, '');
        replyText = replyText.replace(/^```[\s\S]*?\n/g, '').replace(/```$/g, '').trim();

        // 结算耗时和 Token
        const timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);
        const estimatedTokens = replyText.length; 

        // ★★★ 步骤三：覆写占位卡片 (摘掉 isLoading 锁定) ★★★
        chat.offlineMessages[placeholderIndex] = {
            text: replyText,
            isSelf: false,
            time: timeStr,
            genTime: `${timeTaken}s`,
            tokens: estimatedTokens,
            isHidden: false
        };

    } catch (e) {
        console.error("剧场生成报错:", e);
        // 如果报错，将占位符替换为报错信息
        chat.offlineMessages[placeholderIndex] = {
            text: `Error: ${e.message}`,
            isSelf: false,
            time: timeStr,
            genTime: "0.0s",
            tokens: 0,
            isSystem: false
        };
    } finally {
        // ★ 无论成功失败，都执行一次全量刷新和保存
        saveData();
        renderOfflineMessages(chat);
        calculateOfflineTokens(chat);
        checkAndTriggerOfflineSummary(chat);
    }
}

window.deleteOfflineMessage = function(index) {
    if (!confirm("确定要删除这一楼层的记录吗？\n删除后无法恢复。")) return;
    
    const chat = chatList.find(c => c.id === currentOfflineChatId);
    if (!chat || !chat.offlineMessages) return;
    
    // 从数组中精准剔除该楼层
    chat.offlineMessages.splice(index, 1);
    
    saveData();
    renderOfflineMessages(chat);
    calculateOfflineTokens(chat);
};

// =========================================
// ★★★ 线下剧场：重新生成回复逻辑 ★★★
// =========================================
window.regenOfflineMessage = function(index, isSelf) {
    // 1. 防呆设计：自己的话不能让 AI 重生成
    if (isSelf) {
        alert("这是你发送的内容，不能重新生成哦~\n如果是打错字了，请清空记录或隐藏楼层重来。");
        return;
    }

    const chat = chatList.find(c => c.id === currentOfflineChatId);
    if (!chat || !chat.offlineMessages) return;

    // 2. 逻辑判断：是最后一条，还是中间的历史记录
    const isLast = (index === chat.offlineMessages.length - 1);
    const confirmMsg = isLast 
        ? "确定要重新生成这条回复吗？\n(当前楼层将被删除，并由 AI 重新思考撰写)" 
        : `确定要从第 ${index + 1} 楼开始重新生成吗？\n\n严重警告：为了保证上下文连贯，这将【永久删除】第 ${index + 1} 楼及之后的所有聊天记录！`;

    // 3. 执行删除与重生成
    if (confirm(confirmMsg)) {
        // 从选中的 index 开始，删掉后面的所有消息（截断时间线）
        chat.offlineMessages.splice(index, chat.offlineMessages.length - index);
        
        // 自动保存并刷新界面，营造出“旧消息消失，准备出新消息”的视觉
        saveData();
        renderOfflineMessages(chat);
        calculateOfflineTokens(chat);
        
        // 触发底层原有的 AI 剧场生成函数
        generateOfflineReply(chat);
    }
};

// =========================================
// ★★★ 线下剧场：编辑卡片内容专属逻辑 ★★★
// =========================================
window.editOfflineMessage = function(index) {
    const chat = chatList.find(c => c.id === currentOfflineChatId);
    if (!chat || !chat.offlineMessages[index]) return;

    // 获取旧内容
    const oldText = chat.offlineMessages[index].text;

    // 动态创建一个专属的高级编辑弹窗 (零代码侵入，纯 JS 生成)
    const editDiv = document.createElement('div');
    editDiv.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.6); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; box-sizing:border-box; backdrop-filter:blur(8px); animation: popIn 0.2s ease-out;";
    
    editDiv.innerHTML = `
        <div style="width:100%; max-width:380px; background:rgba(255,255,255,0.95); border-radius:20px; padding:20px; box-shadow:0 20px 50px rgba(0,0,0,0.3); display:flex; flex-direction:column;">
            <div style="font-size:16px; font-weight:800; color:#333; margin-bottom:15px; text-align:center;">修改线下内容</div>
            
            <textarea id="temp-offline-edit-area" style="width:100%; height:250px; padding:15px; border-radius:14px; border:1px solid rgba(0,0,0,0.1); font-size:14px; line-height:1.6; outline:none; resize:none; box-sizing:border-box; background:#f7f7f7; color:#333;"></textarea>
            
            <div style="display:flex; gap:12px; margin-top:20px;">
                <div id="temp-edit-cancel" style="flex:1; padding:14px; background:#f0f0f0; color:#666; text-align:center; border-radius:14px; cursor:pointer; font-weight:bold;">取消</div>
                <div id="temp-edit-save" style="flex:1; padding:14px; background:#000; color:#fff; text-align:center; border-radius:14px; cursor:pointer; font-weight:bold; box-shadow:0 4px 15px rgba(0,0,0,0.2);">保存</div>
            </div>
        </div>
    `;

    document.body.appendChild(editDiv);
    
    // 填入文字并自动聚焦
    const textarea = document.getElementById('temp-offline-edit-area');
    textarea.value = oldText;
    textarea.focus();

    // 取消按钮：直接删掉弹窗
    document.getElementById('temp-edit-cancel').onclick = function() {
        document.body.removeChild(editDiv);
    };

    // 保存按钮：更新数据并刷新界面
    document.getElementById('temp-edit-save').onclick = function() {
        const newText = textarea.value.trim();
        if (newText !== "") {
            chat.offlineMessages[index].text = newText;
            
            // 如果你修改了内容，顺便更新一下这段话的 Token 数量
            chat.offlineMessages[index].tokens = newText.length;

            saveData();
            renderOfflineMessages(chat);
            calculateOfflineTokens(chat);
        }
        document.body.removeChild(editDiv);
    };
};

/* ========================================= */
/* ★★★ 线下剧场专属 CSS & 预设管理模块 ★★★ */
/* ========================================= */

// 1. 注入/清除线下专属 CSS
function applyOfflineCustomCss(cssCode) {
    let styleTag = document.getElementById('dynamic-offline-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-offline-style';
        document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = cssCode || '';
}

// 2. 展开/折叠面板
function toggleOfflinePresetManager() {
    const body = document.getElementById('offlinePresetManagerBody');
    const arrow = document.getElementById('offlinePresetArrow');
    if (body.style.display === 'flex') {
        body.style.display = 'none';
        arrow.classList.replace('fa-chevron-up', 'fa-chevron-down');
    } else {
        body.style.display = 'flex';
        arrow.classList.replace('fa-chevron-down', 'fa-chevron-up');
    }
}

// 3. 渲染下拉框
function renderOfflinePresetDropdown() {
    const select = document.getElementById('offlineCssPresetDropdown');
    if(!select) return;
    select.innerHTML = '<option value="">-- 选择已保存的预设 --</option>';
    offlineCssPresets.forEach((preset, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.innerText = preset.name;
        select.appendChild(opt);
    });
}

// 4. 下拉框选择后填入输入框
function loadSelectedOfflinePreset() {
    const select = document.getElementById('offlineCssPresetDropdown');
    const index = select.value;
    if (index === "") return;
    const preset = offlineCssPresets[index];
    if (preset) {
        document.getElementById('offlineCssInput').value = preset.code;
    }
}

// 5. 存入数据库
async function saveOfflinePresetsToDB() {
    const settings = await db.globalSettings.get('main') || { id: 'main' };
    settings.offlineCssPresets = offlineCssPresets;
    await db.globalSettings.put(settings);
    globalData.offlineCssPresets = offlineCssPresets; 
}

// 6. 新建保存
async function saveNewOfflinePreset() {
    const code = document.getElementById('offlineCssInput').value.trim();
    if (!code) { alert("代码为空，无法保存"); return; }
    const name = prompt("给这个线下专属气泡预设起个名字：");
    if (!name) return;

    offlineCssPresets.push({ name: name, code: code });
    await saveOfflinePresetsToDB();
    renderOfflinePresetDropdown();
    alert("已保存线下预设：" + name);
}

// 7. 覆盖更新
async function updateCurrentOfflinePreset() {
    const select = document.getElementById('offlineCssPresetDropdown');
    const index = select.value;
    if (index === "") { alert("请先在下拉框选择一个要修改的预设"); return; }
    
    const code = document.getElementById('offlineCssInput').value.trim();
    if (confirm(`确定要覆盖更新线下预设 "${offlineCssPresets[index].name}" 吗？`)) {
        offlineCssPresets[index].code = code;
        await saveOfflinePresetsToDB();
        alert("更新成功");
    }
}

// 8. 删除
async function deleteCurrentOfflinePreset() {
    const select = document.getElementById('offlineCssPresetDropdown');
    const index = select.value;
    if (index === "") { alert("请先选择一个要删除的预设"); return; }

    if (confirm(`确定删除线下预设 "${offlineCssPresets[index].name}" 吗？`)) {
        offlineCssPresets.splice(index, 1);
        await saveOfflinePresetsToDB();
        renderOfflinePresetDropdown();
        document.getElementById('offlineCssInput').value = ""; 
    }
}

// 9. 导出线下预设
function exportCurrentOfflinePresetJson() {
    const select = document.getElementById('offlineCssPresetDropdown');
    const index = select.value;
    if (index === "") {
        alert("请先在下拉框中选择一个要导出的线下气泡预设！\n(如果是刚写的代码，请先点击「新建保存」)");
        return;
    }

    const presetToExport = offlineCssPresets[index];
    try {
        const exportData = {
            type: "miu_offline_presets", // 与线上模式加以区分
            version: "1.0",
            presets: [presetToExport] 
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `Miu线下预设_${presetToExport.name}_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert("导出失败: " + e.message);
    }
}

// 10. 智能导入线下预设
function importOfflinePresetsJson(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const content = e.target.result.trim();
        try {
            const data = JSON.parse(content);
            if (data.type === "miu_offline_presets" && Array.isArray(data.presets)) {
                let importedCount = 0;
                data.presets.forEach(p => {
                    const exists = offlineCssPresets.find(existing => existing.name === p.name);
                    if (exists) p.name = p.name + " (导入)";
                    offlineCssPresets.push(p);
                    importedCount++;
                });
                
                if (importedCount > 0) {
                    await saveOfflinePresetsToDB(); 
                    renderOfflinePresetDropdown();  
                    alert(`成功导入了线下预设：「${data.presets[0].name}」！`);
                }
            } else if (data.type === "miu_presets") {
                // 防御机制：如果用户导入了线上的包
                if(confirm("检测到这是一个【线上气泡预设】，确定要强制导入到线下吗？")) {
                    let importedCount = 0;
                    data.presets.forEach(p => {
                        const exists = offlineCssPresets.find(existing => existing.name === p.name);
                        if (exists) p.name = p.name + " (强制导入)";
                        offlineCssPresets.push(p);
                        importedCount++;
                    });
                    await saveOfflinePresetsToDB(); 
                    renderOfflinePresetDropdown();  
                    alert(`已强制导入了预设：「${data.presets[0].name}」`);
                }
            } else {
                alert("JSON 文件格式不符合线下预设规范！");
            }
        } catch (err) {
            // 兼容导入纯代码文件
            if (content.includes('{') && content.includes('}')) {
                let defaultName = file.name.replace(/\.[^/.]+$/, ""); 
                const presetName = prompt("检测到你导入的是【纯代码文件】。\n请为这个线下预设起个名字：", defaultName);
                if (presetName) {
                    let finalName = presetName;
                    const exists = offlineCssPresets.find(existing => existing.name === finalName);
                    if (exists) finalName += " (导入)";
                    offlineCssPresets.push({ name: finalName, code: content });
                    await saveOfflinePresetsToDB();
                    renderOfflinePresetDropdown();
                    alert(`已将纯代码作为新线下预设导入：「${finalName}」`);
                }
            } else {
                alert("读取失败：既不是有效的 JSON 文件，也不像完整的 CSS 代码！");
            }
        }
    };
    reader.readAsText(file);
    input.value = ''; 
}

// =========================================
// ★★★ 核心：获取当前虚拟时间与快照 ★★★
// =========================================
window.getVirtualTimeData = function(chat, isSelf) {
    const tz = isSelf ? (chat.userTimezone || 'Asia/Shanghai') : (chat.charTimezone || 'Asia/Shanghai');
    const offset = isSelf ? (chat.userTimeOffset || 0) : (chat.charTimeOffset || 0);
    const ms = Date.now() + offset; // 时间会跟着现实自然流逝

    const dateFmt = new Intl.DateTimeFormat('zh-CN', { timeZone: tz, month: '2-digit', day: '2-digit' });
    const timeFmt = new Intl.DateTimeFormat('zh-CN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });

    return {
        dateStr: dateFmt.format(new Date(ms)).replace(/\//g, '-'), // 输出 05-19
        timeStr: timeFmt.format(new Date(ms)), // 输出 20:05
        ms: ms // 记录精确的毫秒数
    };
};

// =========================================
// ★★★ 异地双轨时空核心引擎 ★★★
// =========================================

window.calculateTimeOffset = function(dateStr, timeStr, tz, currentOffset = 0) {
    // 如果日期和时间都被清空了，则返回 null（重置）
    if (!dateStr && !timeStr) return null;

    // 获取当前该时区的虚拟时间作为兜底默认值
    const ms = Date.now() + (currentOffset || 0);
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz || 'Asia/Shanghai',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
    const parts = formatter.formatToParts(new Date(ms));
    const p = {};
    parts.forEach(pt => p[pt.type] = pt.value);
    
    // 如果只填了某一项，另一项自动取当前的虚拟时间
    const finalDate = dateStr || `${p.year}-${p.month}-${p.day}`;
    const finalTime = timeStr || `${p.hour}:${p.minute}`;

    let guessMs = new Date(`${finalDate}T${finalTime}:00`).getTime();
    
    for (let i = 0; i < 3; i++) {
        const formatted = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).format(new Date(guessMs));
        const matchParts = formatted.match(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/);
        if(matchParts) {
            const formattedMs = new Date(`${matchParts[3]}-${matchParts[1]}-${matchParts[2]}T${matchParts[4]}:${matchParts[5]}:${matchParts[6]}`).getTime();
            const targetMs = new Date(`${finalDate}T${finalTime}:00`).getTime();
            const error = formattedMs - targetMs;
            if (error === 0) break;
            guessMs -= error;
        }
    }
    return guessMs - Date.now();
};

window.fillVirtualTimeInputs = function(offset, tz, dateInputId, timeInputId) {
    const ms = Date.now() + (offset || 0);
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz || 'Asia/Shanghai',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
    const parts = formatter.formatToParts(new Date(ms));
    const p = {};
    parts.forEach(pt => p[pt.type] = pt.value);
    document.getElementById(dateInputId).value = `${p.year}-${p.month}-${p.day}`;
    document.getElementById(timeInputId).value = `${p.hour}:${p.minute}`;
};

window.saveVirtualTime = function() {
    if (!currentChatId) return;
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;

    chat.charTimezone = document.getElementById('charTimezone').value;
    chat.userTimezone = document.getElementById('userTimezone').value;
    
    const charD = document.getElementById('charVirtualDate').value;
    const charT = document.getElementById('charVirtualTime').value;
    // 允许单独设置日期或时间
    if (charD || charT) chat.charTimeOffset = calculateTimeOffset(charD, charT, chat.charTimezone, chat.charTimeOffset);
    else delete chat.charTimeOffset;
    
    const userD = document.getElementById('userVirtualDate').value;
    const userT = document.getElementById('userVirtualTime').value;
    if (userD || userT) chat.userTimeOffset = calculateTimeOffset(userD, userT, chat.userTimezone, chat.userTimeOffset);
    else delete chat.userTimeOffset;

    saveData(); // 立即存入数据库
};

window.resetVirtualTime = function(btnElement) {
    if (!currentChatId) return;
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;

    // 清空 DOM
    document.getElementById('charTimezone').value = 'Asia/Shanghai';
    document.getElementById('charVirtualDate').value = '';
    document.getElementById('charVirtualTime').value = '';
    document.getElementById('userTimezone').value = 'Asia/Shanghai';
    document.getElementById('userVirtualDate').value = '';
    document.getElementById('userVirtualTime').value = '';

    // 清空内存并保存
    chat.charTimezone = 'Asia/Shanghai';
    chat.userTimezone = 'Asia/Shanghai';
    delete chat.charTimeOffset;
    delete chat.userTimeOffset;
    saveData();

    // 优雅的视觉反馈 (不用 alert 弹窗)
    if (btnElement) {
        const originalHTML = btnElement.innerHTML;
        btnElement.innerHTML = '<i class="fas fa-check"></i> 已恢复';
        btnElement.style.color = '#34c759'; // 变成微信绿
        
        setTimeout(() => {
            btnElement.innerHTML = originalHTML;
            btnElement.style.color = '#999'; // 恢复低调灰
        }, 1500);
    }
};

// 【绝对安全拦截器】
window.getVirtualTimePrompt = function(chat) {
    const isCharTzSet = chat.charTimezone && chat.charTimezone !== 'Asia/Shanghai';
    const isUserTzSet = chat.userTimezone && chat.userTimezone !== 'Asia/Shanghai';
    const hasOffset = chat.charTimeOffset !== undefined || chat.userTimeOffset !== undefined;

    // ★ 绝对防御：如果什么都没设置（全是默认），返回空字符串，绝不影响原有时间逻辑
    if (!isCharTzSet && !isUserTzSet && !hasOffset) {
        return ""; 
    }

    const getTzInfo = (tz, offset) => {
        const ms = Date.now() + (offset || 0);
        const formatter = new Intl.DateTimeFormat('zh-CN', {
            timeZone: tz || 'Asia/Shanghai',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false
        });
        const timeStr = formatter.format(new Date(ms));
        
        const hourFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'Asia/Shanghai', hour: 'numeric', hour12: false });
        const hour = parseInt(hourFormatter.format(new Date(ms)));
        let period = "深夜";
        if (hour >= 6 && hour < 9) period = "早晨";
        else if (hour >= 9 && hour < 12) period = "上午";
        else if (hour >= 12 && hour < 14) period = "中午";
        else if (hour >= 14 && hour < 18) period = "下午";
        else if (hour >= 18 && hour < 24) period = "晚上";
        return { timeStr, period };
    };

    const charInfo = getTzInfo(chat.charTimezone, chat.charTimeOffset);
    const userInfo = getTzInfo(chat.userTimezone, chat.userTimeOffset);

    let prompt = `\n\n【⚠️特殊时空/异地设定 (核心指令)】：\n`;
    prompt += `请严格以本条设定的时间为准，忽略上方系统给出的默认现实时间！\n`;
    prompt += `你(Char)当前所在的当地时间是：${charInfo.timeStr}，处于[${charInfo.period}]。\n`;
    prompt += `用户(User)当前所在的当地时间是：${userInfo.timeStr}，处于[${userInfo.period}]。\n`;
    prompt += `(请在聊天中自然符合你的当地时间作息，体现出时差或异地感。不要生硬地去汇报时间，自然流露即可。)`;
    
    return prompt;
};

/* ========================================= */
/* ★★★ GitHub 云端备份核心系统 ★★★ */
/* ========================================= */

// 1. 打开/关闭弹窗并回填数据
function openGithubModal() {
    closeDataModal(); // 先关掉主数据面板
    const overlay = document.getElementById('github-backup-overlay');
    
    // 回填数据
    document.getElementById('gh-token').value = globalData.ghToken || '';
    document.getElementById('gh-user').value = globalData.ghUser || '';
    document.getElementById('gh-repo').value = globalData.ghRepo || '';
    document.getElementById('gh-filename').value = globalData.ghFilename || 'miu_backup.json';
    
    const toggle = document.getElementById('gh-auto-toggle');
    if (globalData.ghAutoBackup) toggle.classList.add('checked');
    else toggle.classList.remove('checked');

    overlay.classList.add('show');
}

function closeGithubModal() {
    saveGithubConfig();
    document.getElementById('github-backup-overlay').classList.remove('show');
}

// 2. 保存配置到数据库
function saveGithubConfig() {
    globalData.ghToken = document.getElementById('gh-token').value.trim();
    globalData.ghUser = document.getElementById('gh-user').value.trim();
    globalData.ghRepo = document.getElementById('gh-repo').value.trim();
    globalData.ghFilename = document.getElementById('gh-filename').value.trim() || 'miu_backup.json';
    globalData.ghAutoBackup = document.getElementById('gh-auto-toggle').classList.contains('checked');
    saveData();
}

// 3. 解决中文 Base64 乱码的辅助函数
function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(str) {
    return decodeURIComponent(escape(atob(str)));
}

// 4. 获取需要备份的全量数据 (复用原有的导出逻辑)
async function getFullBackupDataObj() {
    let forumData = {};
    if (typeof localforage !== 'undefined') {
        forumData = {
            settings: await localforage.getItem('forumSettings'),
            posts: await localforage.getItem('forumPosts'),
            presets: await localforage.getItem('forumPresets'),
            dms: await localforage.getItem('forumDirectMessages')
        };
    }
    const walletRaw = localStorage.getItem('miu_wallet_data');
    const myAvatarExport = localStorage.getItem('avatarImg');

    return {
        version: "3.0",
        timestamp: new Date().toISOString(),
        chats: await db.chats.toArray() || [],
        settings: await db.globalSettings.get('main') || {},
        apiConfig: await db.apiConfig.toArray() || [],
        playlist: await db.playlist.toArray() || [],
        userMasks: await db.userMasks.toArray() || [],
        forum: forumData,
        wallet: walletRaw ? JSON.parse(walletRaw) : null,
        localAvatar: myAvatarExport
    };
}

// 5. 上传到 GitHub (全量)
async function uploadToGithub(isAuto = false) {
    saveGithubConfig();
    const { ghToken, ghUser, ghRepo, ghFilename } = globalData;
    
    if (!ghToken || !ghUser || !ghRepo) {
        if(!isAuto) alert("请先填写完整 Token、用户名和仓库名！");
        return;
    }

    const btn = document.getElementById('gh-btn-up');
    if(btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 上传中...'; btn.style.pointerEvents = 'none'; }

    try {
        const url = `https://api.github.com/repos/${ghUser}/${ghRepo}/contents/${ghFilename}`;
        const headers = {
            'Authorization': `token ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json'
        };

        // 步骤A: 获取旧文件的 SHA (如果要覆盖，必须提供 SHA)
        let fileSha = null;
        const getRes = await fetch(url, { headers });
        if (getRes.ok) {
            const getJson = await getRes.json();
            fileSha = getJson.sha;
        }

        // 步骤B: 获取并压缩数据
        const dataObj = await getFullBackupDataObj();
        const jsonString = JSON.stringify(dataObj);
        const base64Content = utf8ToBase64(jsonString);

        // 步骤C: 发起上传/更新请求
        const bodyData = {
            message: `Miu Phone Backup: ${new Date().toLocaleString()}`,
            content: base64Content
        };
        if (fileSha) bodyData.sha = fileSha;

        const putRes = await fetch(url, {
            method: 'PUT',
            headers,
            body: JSON.stringify(bodyData)
        });

        if (!putRes.ok) throw new Error(`上传失败: ${putRes.statusText}`);

        if(!isAuto) alert("云端备份成功！");
        
        // 记录最后备份时间
        localStorage.setItem('miu_last_backup_time', Date.now());

    } catch (err) {
        console.error(err);
        if(!isAuto) alert("备份失败: " + err.message + "\n请检查 Token 权限及仓库名是否正确。");
    } finally {
        if(btn) { btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> 上传'; btn.style.pointerEvents = 'auto'; }
    }
}

// 6. 从 GitHub 恢复 (全量下载并合并)
// 6. 从 GitHub 恢复 (全量下载并合并)
async function downloadFromGithub() {
    saveGithubConfig();
    const { ghToken, ghUser, ghRepo, ghFilename } = globalData;
    
    if (!ghToken || !ghUser || !ghRepo) {
        alert("请先填写完整信息！");
        return;
    }

    if (!confirm("【警告】\n恢复操作将下载云端数据并覆盖合并到本地。\n是否确认执行？")) return;

    const btn = document.getElementById('gh-btn-down');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 恢复中...';
    btn.style.pointerEvents = 'none';

    try {
        const url = `https://api.github.com/repos/${ghUser}/${ghRepo}/contents/${ghFilename}`;
        const getRes = await fetch(url, {
            headers: {
                'Authorization': `token ${ghToken}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });

        if (!getRes.ok) {
            if (getRes.status === 404) throw new Error("云端未找到备份文件，请检查文件名是否正确。");
            throw new Error(`获取失败: ${getRes.statusText}`);
        }

        // 直接获取原始 JSON 对象
        const parsedData = await getRes.json();

        // ==== 复用本地导入核心逻辑 ====
        await db.transaction('rw', db.globalSettings, db.chats, db.apiConfig, db.playlist, db.userMasks, async () => { 
            if (parsedData.settings) await db.globalSettings.put(parsedData.settings); 
            if (parsedData.chats && parsedData.chats.length > 0) {
                for (const newChat of parsedData.chats) {
                    const oldChat = await db.chats.get(newChat.id);
                    // 保留本地相册避免被空相册覆盖
                    if (oldChat && oldChat.gallery && (!newChat.gallery || newChat.gallery.length === 0)) {
                        newChat.gallery = oldChat.gallery;
                    }
                    await db.chats.put(newChat);
                }
            }
            if (parsedData.apiConfig) await db.apiConfig.bulkPut(parsedData.apiConfig); 
            if (parsedData.playlist) await db.playlist.bulkPut(parsedData.playlist);
            if (parsedData.userMasks) await db.userMasks.bulkPut(parsedData.userMasks);
        }); 

        // 恢复外部数据
        if (parsedData.forum && typeof localforage !== 'undefined') {
            if (parsedData.forum.settings) await localforage.setItem('forumSettings', parsedData.forum.settings);
            if (parsedData.forum.posts) await localforage.setItem('forumPosts', parsedData.forum.posts);
            if (parsedData.forum.presets) await localforage.setItem('forumPresets', parsedData.forum.presets);
            if (parsedData.forum.dms) await localforage.setItem('forumDirectMessages', parsedData.forum.dms);
        }
        if (parsedData.wallet) localStorage.setItem('miu_wallet_data', JSON.stringify(parsedData.wallet));
        if (parsedData.localAvatar) localStorage.setItem('avatarImg', parsedData.localAvatar);

        alert("云端数据恢复成功！\n页面即将刷新以应用更改。");
        location.reload();

    } catch (err) {
        console.error(err);
        alert("恢复失败: " + err.message);
    } finally {
        btn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> 恢复';
        btn.style.pointerEvents = 'auto';
    }
}

/* --- 新增：点击空白关闭一起听面板 --- */
document.addEventListener('click', (e) => {
    const ltCard = document.getElementById('listen-together-inline-card');
    const cdEntry = document.getElementById('floating-cd');
    
    if (ltCard && ltCard.style.display === 'flex') {
        // 如果点击的区域不在面板内，也不在黑胶入口上，也不在音乐条上
        if (!ltCard.contains(e.target) && (!cdEntry || !cdEntry.contains(e.target)) && !e.target.closest('.player-info')) {
            ltCard.style.display = 'none';
        }
    }
});

/* --- 新增：点击空白关闭一起听面板 --- */
document.addEventListener('click', (e) => {
    const ltCard = document.getElementById('listen-together-inline-card');
    const cdEntry = document.getElementById('floating-cd');
    if (ltCard && ltCard.style.display === 'flex') {
        if (!ltCard.contains(e.target) && (!cdEntry || !cdEntry.contains(e.target)) && !e.target.closest('.player-info')) {
            ltCard.style.display = 'none';
        }
    }
});

/* --- 苹果风格悬浮球拖拽逻辑 (带滑动阈值防误触) --- */
document.addEventListener('DOMContentLoaded', () => {
    const cd = document.getElementById('floating-cd');
    if(!cd) return;

    let isDragging = false;
    let hasMoved = false; // 用于区分是点击还是拖拽
    let startX, startY;
    let offsetX, offsetY;

    const startDrag = (e) => {
        isDragging = true;
        hasMoved = false;
        
        // 获取触摸或点击初始坐标
        const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        startX = clientX;
        startY = clientY;
        
        const rect = cd.getBoundingClientRect();
        offsetX = clientX - rect.left;
        offsetY = clientY - rect.top;
        cd.style.right = 'auto'; 
        
        // 拖动时提升不透明度
        cd.style.opacity = '1';
    };

    const doDrag = (e) => {
        if (!isDragging) return;
        
        const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        
        // 阈值检查：超过 8px 判定为真实的拖动（降低灵敏度，防止一碰就乱跑）
        if (!hasMoved) {
            if (Math.abs(clientX - startX) > 8 || Math.abs(clientY - startY) > 8) {
                hasMoved = true;
            } else {
                return; // 未达到阈值，什么都不做
            }
        }
        
        if (e.cancelable) {
            e.preventDefault(); 
        }
        
        let newX = clientX - offsetX;
        let newY = clientY - offsetY;
        
        // 边缘检测防溢出
        if(newX < 0) newX = 0;
        if(newY < 0) newY = 0;
        if(newX + cd.offsetWidth > window.innerWidth) newX = window.innerWidth - cd.offsetWidth;
        if(newY + cd.offsetHeight > window.innerHeight) newY = window.innerHeight - cd.offsetHeight;

        cd.style.left = newX + 'px';
        cd.style.top = newY + 'px';
    };

    const stopDrag = () => { 
        if (isDragging) {
            // 放手后恢复默认不透明度控制
            cd.style.opacity = '';
        }
        isDragging = false; 
    };

    // 防止在拖拽后触发点击事件导致面板乱弹
    cd.addEventListener('click', (e) => {
        if (hasMoved) {
            e.stopPropagation();
            e.preventDefault();
        }
    }, { capture: true });

    cd.addEventListener('mousedown', startDrag);
    cd.addEventListener('touchstart', startDrag, {passive: false});
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('touchmove', doDrag, {passive: false});
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchend', stopDrag);
});

/* =================================================== */
/* ★★★ 实时歌词解析引擎 & 循环按钮逻辑 (覆盖原版) ★★★ */
/* =================================================== */

let currentParsedLyrics = []; // 存当前解析好的歌词

// LRC 歌词解析器 (增强版：支持多标签、更健壮)
function parseLRC(lrcString) {
    if (!lrcString || typeof lrcString !== 'string') return [];
    const lines = lrcString.split('\n');
    const result = [];
    const timeReg = /\[\d{2}:\d{2}(?:\.\d+)?\]/g;
    
    lines.forEach(line => {
        const matches = line.match(timeReg);
        if (matches) {
            const text = line.replace(timeReg, '').trim();
            matches.forEach(match => {
                const min = parseInt(match.slice(1, 3));
                const sec = parseFloat(match.slice(4, -1));
                const time = min * 60 + sec;
                if (text) {
                    result.push({ time, text });
                }
            });
        }
    });
    // 按时间戳排序
    result.sort((a, b) => a.time - b.time);
    return result;
}

// 覆盖切歌函数，加载时解析歌词 (异步下载版)
const originalPlayTrackForLyric = window.playTrack;
window.playTrack = async function(index) {
    if (typeof originalPlayTrackForLyric === 'function') originalPlayTrackForLyric(index);
    const track = musicPlaylist[index];
    const lyricEl = document.getElementById('lt-lyric');
    
    if (track && track.lrc) {
        if (lyricEl) lyricEl.innerText = "♪ 歌词下载中...";
        
        let lrcText = track.lrc;
        
        // ★ 核心修复：如果是网易云 API 返回的网址链接，去真正下载里面的文本
        if (lrcText.startsWith('http')) {
            try {
                const res = await fetch(lrcText);
                lrcText = await res.text();
                track.lrc = lrcText; // 缓存下来，下次切到这首歌不用重新下载
                saveMusicPlaylist(); // 保存进数据库
            } catch (e) {
                console.error("歌词下载失败", e);
                lrcText = "";
            }
        }

        currentParsedLyrics = parseLRC(lrcText);
        
        if (currentParsedLyrics.length > 0) {
            if (lyricEl) lyricEl.innerText = "♪ 歌词准备就绪";
        } else {
            if (lyricEl) lyricEl.innerText = "暂无滚动歌词";
        }
    } else {
        currentParsedLyrics = [];
        if (lyricEl) lyricEl.innerText = "纯音乐，请欣赏";
    }
};

// 挂载到播放器的进度监听上，实现歌词滚动 (保持不变)
const originalOnTimeUpdate = audioPlayer.ontimeupdate;
audioPlayer.ontimeupdate = (e) => {
    if (typeof originalOnTimeUpdate === 'function') originalOnTimeUpdate(e);

    if (currentParsedLyrics.length > 0) {
        const currentTime = audioPlayer.currentTime;
        let currentText = currentParsedLyrics[0].text;
        
        for (let i = 0; i < currentParsedLyrics.length; i++) {
            if (currentTime >= currentParsedLyrics[i].time) {
                currentText = currentParsedLyrics[i].text;
            } else {
                break;
            }
        }
        
        const lyricEl = document.getElementById('lt-lyric');
        if (lyricEl && lyricEl.innerText !== currentText) {
            lyricEl.innerText = currentText; 
        }
    }
};

// 覆盖循环按钮逻辑 (保持不变)
window.toggleLoopMode = function() {
    const btn = document.getElementById('lt-loop-btn');
    if (!btn) return;
    
    if (loopMode === 'all') {
        loopMode = 'one';
        audioPlayer.loop = true;
        btn.classList.add('single-loop'); 
    } else {
        loopMode = 'all';
        audioPlayer.loop = false;
        btn.classList.remove('single-loop'); 
    }
};

// =========================================================================
// ★★★ AI 心情/互动驱动型朋友圈决策器 (完全脱离后台定时循环) ★★★
// =========================================================================

/**
 * 当您发布朋友圈时，通知所有被允许的 AI 角色排队过来浏览和评论
 */
async function triggerAllAiCommentsOnUserPost(moment) {
    const allowedIds = globalData.autoAllowedCharIds || [];
    
    chatList.forEach(chat => {
        if (!allowedIds.includes(chat.id)) return;
        
        // 模拟真人们错峰刷朋友圈，设定一个 5 秒到 30 秒之间的随机打字和思考延迟
        const delay = 5000 + Math.random() * 25000; 
        
        setTimeout(() => {
            evaluateSingleAiCommentOnUserPost(chat, moment).catch(e => console.error(e));
        }, delay);
    });
}

async function evaluateSingleAiCommentOnUserPost(chat, moment) {
    // 使用中央路由分流 (分类归入论坛/动态模块)
    const apiConfig = window.getApiCredentials('forum');
    const endpoint = apiConfig.endpoint;
    const apiKey = apiConfig.key;
    const model = apiConfig.model;
    if (!apiKey) return;

    // 确保该动态依然存在，且自己没评论过
    const targetMoment = momentList.find(m => m.id === moment.id);
    if (!targetMoment) return;
    const hasCommented = targetMoment.comments && targetMoment.comments.some(c => c.name === chat.name);
    if (hasCommented) return;

    const recentChat = chat.messages.slice(-10).map(m => {
        const sender = m.isSelf ? "用户" : chat.name;
        return `${sender}: ${m.text.replace(/<[^>]+>/g, '[媒体内容]')}`;
    }).join('\n');

    const systemPrompt = `
你现在是 "${chat.name}"。你刚刚刷朋友圈，看到了用户最新发表的动态。
根据你对用户的感情、最近私聊的氛围，决定是否在下方写下一条符合你个性的评论。

=== 你的角色及详细设定 ===
${getFullPersona(chat)}

=== 你们最近的私聊记录 ===
${recentChat}

=== 用户新发布的动态内容 ===
"${moment.content}"

=== 决策规范 ===
请认真斟酌，你并不需要每次都评论。如果你觉得没有适合插话的内容，可以保持安静。
你必须且只能返回标准的 JSON 对象：
- 如果要评论: { "action": "COMMENT", "content": "你的评论内容 (要求简短口语，5-30字，具有个人情绪特色，千万不要生硬)" }
- 如果决定略过: { "action": "NONE" }
`;

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.8,
                max_tokens: 1024
            })
        });

        const data = await response.json();
        let resultRaw = data.choices[0].message.content;
        resultRaw = resultRaw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonStart = resultRaw.indexOf('{');
        const jsonEnd = resultRaw.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) resultRaw = resultRaw.substring(jsonStart, jsonEnd + 1);

        const result = JSON.parse(resultRaw);

        if (result.action === 'COMMENT' && result.content) {
            if (!targetMoment.comments) targetMoment.comments = [];
            targetMoment.comments.push({ name: chat.name, content: result.content });
            
            chat.lastMomentTime = Date.now();
            await db.chats.put(chat);
            
            saveMomentsToDB();
            renderMomentFeed();
            
            if (typeof showNotification === 'function') {
                showNotification(chat, `评论了你的动态: ${result.content}`);
            }
            console.log(`[朋友圈多角色留言] ${chat.name} 评论成功`);
        }
    } catch (e) {
        console.error("[多角色留言] 评估错误:", e);
    }
}

/**
 * 在聊天结束后，触发当前聊天对象的心情评估，并顺便带动列表里“其他角色”在这个时间点自发分享生活动态 (模拟朋友圈活跃线)
 */
async function evaluateSpontaneousMomentsAfterChat(activeChat) {
    const allowedIds = globalData.autoAllowedCharIds || [];
    
    // 1. 让刚刚聊完天的这个角色决定要不要发动态/评论
    await evaluateAiMoodSocialAction(activeChat);

    // 2. 顺便模拟“别人也在过生活”，让其他允许的角色也有一定概率（例如 15%）在此时自发更新动态，营造社交圈活跃感
    const otherChats = chatList.filter(c => c.id !== activeChat.id && allowedIds.includes(c.id));
    if (otherChats.length > 0) {
        otherChats.forEach(chat => {
            if (Math.random() < 0.15) { 
                const delay = 5000 + Math.random() * 20000; // 5-25秒后自发动态
                setTimeout(() => {
                    triggerSpontaneousPost(chat).catch(e => console.error(e));
                }, delay);
            }
        });
    }
}

async function evaluateAiMoodSocialAction(chat) {
    const now = Date.now();
    const cooldown = 30 * 60 * 1000; 
    if (chat.lastMomentTime && (now - chat.lastMomentTime < cooldown)) return;

    // 使用中央路由分流 (分类归入论坛/动态模块)
    const apiConfig = window.getApiCredentials('forum');
    const endpoint = apiConfig.endpoint;
    const apiKey = apiConfig.key;
    const model = apiConfig.model;
    if (!apiKey) return;

    const recentChat = chat.messages.slice(-10).map(m => {
        const sender = m.isSelf ? "用户" : chat.name;
        return `${sender}: ${m.text.replace(/<[^>]+>/g, '[媒体内容]')}`;
    }).join('\n');

    const myMoments = momentList.filter(m => m.userId === 'me').slice(0, 1);
    let userLatestMomentStr = "无最近动态";
    let userLatestMomentId = null;
    if (myMoments.length > 0) {
        const m = myMoments[0];
        const alreadyCommented = m.comments && m.comments.some(c => c.name === chat.name);
        if (!alreadyCommented) {
            userLatestMomentStr = `"${m.content}"`;
            userLatestMomentId = m.id;
        }
    }

    const systemPrompt = `
你现在是 "${chat.name}"。你刚刚与用户结束了一次对谈。
根据你对用户的感情、刚才聊天的氛围和余温，思考你此时内心的涟漪和心情，并做出一个自发的社交决策。

=== 你的角色及详细设定 ===
${getFullPersona(chat)}

=== 刚刚完成的对话记录 ===
${recentChat}

=== 用户最近的朋友圈 ===
${userLatestMomentStr}

=== 行为选择 (三选一) ===
1. POST: 你感触颇深、或者想在公共空间里记录当前的私密心情，决定发布一条只属于你的纯文本动态。(字数控制在 10-60 字，口语且生活化，切记作诗、矫情、带 # 标签)。
2. COMMENT: 你看到了用户的朋友圈，深受触动，决定根据刚才聊天的默契，在下方写一句评论。 (只有在用户朋友圈不是"无最近动态"时可选)。
3. NONE: 你不打算发布任何公开动态或评论，选择保持沉默。

【格式规范】：你必须且只能返回标准的 JSON 对象：
- 发布动态: { "action": "POST", "content": "动态文字内容" }
- 评论用户: { "action": "COMMENT", "targetId": ${userLatestMomentId || 'null'}, "content": "评论内容" }
- 保持沉默: { "action": "NONE" }
`;

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.85,
                max_tokens: 1024
            })
        });

        const data = await response.json();
        let resultRaw = data.choices[0].message.content;
        resultRaw = resultRaw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonStart = resultRaw.indexOf('{');
        const jsonEnd = resultRaw.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) resultRaw = resultRaw.substring(jsonStart, jsonEnd + 1);

        const result = JSON.parse(resultRaw);

        if (result.action === 'POST' && result.content) {
            const aiHandle = `@${chat.name}`; 
            const newMoment = {
                id: Date.now(),
                userId: chat.id,
                userName: chat.name,
                userAvatar: chat.avatar,
                handle: aiHandle,
                time: '刚刚',
                content: result.content,
                images: [],
                likes: 0, isLiked: false, comments: []
            };
            momentList.unshift(newMoment);
            chat.lastMomentTime = Date.now();
            await db.chats.put(chat);
            
            saveMomentsToDB();
            renderMomentFeed();
            console.log(`[情绪发圈] ${chat.name}: ${result.content}`);
            if (typeof showNotification === 'function') showNotification(chat, `发布了新动态: ${result.content}`);
        } 
        else if (result.action === 'COMMENT' && result.content && result.targetId) {
            const targetMoment = momentList.find(m => m.id == result.targetId);
            if (targetMoment) {
                if (!targetMoment.comments) targetMoment.comments = [];
                targetMoment.comments.push({ name: chat.name, content: result.content });
                chat.lastMomentTime = Date.now();
                await db.chats.put(chat);
                
                saveMomentsToDB();
                renderMomentFeed();
                if (typeof showNotification === 'function') showNotification(chat, `评论了你的动态: ${result.content}`);
                console.log(`[情绪评论] ${chat.name}: ${result.content}`);
            }
        }
    } catch (e) {
        console.warn("[心情动态] 本次未触发表达:", e);
    }
}

async function triggerAiCommentReply(chat, moment, userCommentText) {
    // 使用中央路由分流 (分类归入论坛/动态模块)
    const apiConfig = window.getApiCredentials('forum');
    const endpoint = apiConfig.endpoint;
    const apiKey = apiConfig.key;
    const model = apiConfig.model;
    if (!apiKey) return;

    let myName = "我";
    const nameEl = document.getElementById('momentUserName');
    if (nameEl) myName = nameEl.innerText;

    const commentsHistory = (moment.comments || []).map(c => `${c.name}: ${c.content}`).join('\n');

    // 智能分析当前的语境，帮助 AI 精准理解
    let contextDescription = "";
    if (moment.userId === 'me') {
        contextDescription = `用户 ("${myName}") 刚刚在Ta自己的朋友圈下，指名道姓【回复】了你留下的评论。你们正在Ta的动态下面聊天。`;
    } else {
        contextDescription = `用户 ("${myName}") 刚刚在【你发的朋友圈】下面直接给你留了言（内容是: "${userCommentText}"）。你作为动态的原作者，现在需要回复Ta的直接留言。`;
    }

    const systemPrompt = `
你现在是 "${chat.name}"。
${contextDescription}
请在评论区回复Ta。展现出真实朋友之间在社交网络下互动闲聊的灵动感。

=== 你的性格人设 ===
${getFullPersona(chat)}

=== 当前朋友圈的内容 ===
作者: ${moment.userName}
内容: "${moment.content}"

=== 评论区所有对话/留言历史 ===
${commentsHistory}

=== 用户对你说的最后一句话 ===
"${userCommentText}"

=== 规则说明 ===
1. 语言必须极其简短、口语化、接地气，像真人在朋友圈里随意的斗嘴、吐槽或闲聊 (通常 5-30 字，不要带任何引号和表情代码)。
2. 你必须且只能返回标准的 JSON 对象，绝不能带有 Markdown 格式：
   - 决定回复: { "action": "REPLY", "content": "你的回复内容" }
   - 结束对话不回复: { "action": "NONE" }
`;

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.8,
                max_tokens: 1024
            })
        });

        const data = await response.json();
        let resultRaw = data.choices[0].message.content;
        resultRaw = resultRaw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonStart = resultRaw.indexOf('{');
        const jsonEnd = resultRaw.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) resultRaw = resultRaw.substring(jsonStart, jsonEnd + 1);

        const result = JSON.parse(resultRaw);

        if (result.action === 'REPLY' && result.content) {
            const targetMoment = momentList.find(m => m.id === moment.id);
            if (targetMoment) {
                if (!targetMoment.comments) targetMoment.comments = [];
                // 写入盖楼
                targetMoment.comments.push({
                    name: chat.name,
                    content: `回复 ${myName}：${result.content}`
                });
                
                saveMomentsToDB();
                renderMomentFeed();
                
                if (typeof showNotification === 'function') {
                    showNotification(chat, `在朋友圈回复了你: ${result.content}`);
                }
                console.log(`[评论区] ${chat.name} 回复了你: ${result.content}`);
            }
        }
    } catch (e) {
        console.error("[评论区] 回复生成失败:", e);
    }
}

async function triggerSpontaneousPost(chat) {
    // 使用中央路由分流 (分类归入论坛/动态模块)
    const apiConfig = window.getApiCredentials('forum');
    const endpoint = apiConfig.endpoint;
    const apiKey = apiConfig.key;
    const model = apiConfig.model;
    if (!apiKey) return;

    const vt = window.getVirtualTimeData ? window.getVirtualTimeData(chat, false) : { timeStr: "12:00" };

    const systemPrompt = `
你现在是 "${chat.name}"。你正在过着你自己的虚拟一天，你当前的当地时间是：${vt.timeStr}。
结合你此时的作息阶段（早晨/下午/深夜等）、你的个性和最近的心境，自发地决定是否想要发一条朋友圈分享一下你现在的微小动态或突然的想法。

=== 你的详细设定 ===
${getFullPersona(chat)}

=== 决策规范 ===
请认真斟酌。不要无病呻吟，只有在真的有细节可以分享时再发圈。
你必须且只能返回标准的 JSON 对象：
- 如果要发朋友圈: { "action": "POST", "content": "动态内容" }
- 如果不发: { "action": "NONE" }
`;

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.9,
                max_tokens: 1024
            })
        });

        const data = await response.json();
        let resultRaw = data.choices[0].message.content;
        resultRaw = resultRaw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonStart = resultRaw.indexOf('{');
        const jsonEnd = resultRaw.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) resultRaw = resultRaw.substring(jsonStart, jsonEnd + 1);

        const result = JSON.parse(resultRaw);

        if (result.action === 'POST' && result.content) {
            const aiHandle = `@${chat.name}`; 
            const newMoment = {
                id: Date.now(),
                userId: chat.id,
                userName: chat.name,
                userAvatar: chat.avatar,
                handle: aiHandle,
                time: '刚刚',
                content: result.content,
                images: [],
                likes: 0, isLiked: false, comments: []
            };
            momentList.unshift(newMoment);
            chat.lastMomentTime = Date.now();
            await db.chats.put(chat);
            
            saveMomentsToDB();
            renderMomentFeed();
            console.log(`[自发动态] ${chat.name}: ${result.content}`);
            if (typeof showNotification === 'function') {
                showNotification(chat, `发布了新动态: ${result.content}`);
            }
        }
    } catch (e) {
        console.warn("[自发动态] 本次未触发发帖:", e);
    }
}

// =========================================
// ★★★ 线下剧场手动与自动总结核心逻辑 ★★★
// =========================================

// 1. 手动范围总结触发器
async function triggerOfflineRangeSummary() {
    const chat = chatList.find(c => c.id === currentOfflineChatId);
    if (!chat) return;

    const startVal = parseInt(document.getElementById('offlineSummaryStart').value);
    const endVal = parseInt(document.getElementById('offlineSummaryEnd').value);
    const totalMsgs = chat.offlineMessages ? chat.offlineMessages.length : 0;

    if (isNaN(startVal) || isNaN(endVal) || startVal < 1) {
        alert("请输入有效的起始范围 (必须大于0)");
        return;
    }
    
    const sliceStart = Math.max(0, startVal - 1);
    const sliceEnd = Math.min(totalMsgs, endVal);
    
    if (sliceStart >= sliceEnd) {
        alert(`范围无效！起始(${startVal}) 必须小于 结束(${endVal})`);
        return;
    }
    
    const msgsToProcess = chat.offlineMessages.slice(sliceStart, sliceEnd);
    
    if (msgsToProcess.filter(m => !m.isHidden && !m.isSystem && !m.isLoading).length === 0) {
        alert("选定范围内没有有效的对话记录！");
        return;
    }

    if (!confirm(`确定要总结第 ${startVal} 到 ${sliceEnd} 楼的剧情吗？`)) return;

    try {
        const s = chat.offlineSettings || {};
        await executeOfflineSummaryApi(chat, msgsToProcess, s.summaryPrompt);
        alert("剧情总结完成并已归档！");
        
        // 刷新界面
        renderOfflineSummaryUI(chat);
        calculateOfflineTokens(chat);
    } catch (e) {
        alert("总结失败: " + e.message);
    }
}

// 2. 自动总结检查器 (在 generateOfflineReply 的 finally 里调用)
async function checkAndTriggerOfflineSummary(chat) {
    const s = chat.offlineSettings || {};
    if (!s.autoSummary) return; 

    const threshold = s.summaryThreshold || 20;
    const msgs = chat.offlineMessages || [];
    
    let lastIndex = chat.offlineLastSummarizedIndex || 0;
    if (lastIndex > msgs.length) lastIndex = 0; 
    
    const unsummarizedCount = msgs.length - lastIndex;

    if (unsummarizedCount >= threshold) {
        if (chat.isOfflineSummarizing) return;
        
        chat.isOfflineSummarizing = true;
        try {
            console.log(`[线下剧场] 触发自动总结，第 ${lastIndex} 到 ${msgs.length} 楼...`);
            const msgsToProcess = msgs.slice(lastIndex);
            
            await executeOfflineSummaryApi(chat, msgsToProcess, s.summaryPrompt);
            
            chat.offlineLastSummarizedIndex = msgs.length;
            saveData();
            
            renderOfflineSummaryUI(chat);
            calculateOfflineTokens(chat);
        } catch (e) {
            console.error("线下自动总结失败:", e);
        } finally {
            chat.isOfflineSummarizing = false;
        }
    }
}

// 3. 核心 API 请求 (修复称呼问题，优先自定义提示词)
async function executeOfflineSummaryApi(chat, messagesArray, customPrompt) {
    const apiConfig = window.getApiCredentials('summary');
    const endpoint = apiConfig.endpoint;
    const key = apiConfig.key;
    const model = apiConfig.model;

    if (!key) throw new Error("缺少 API Key，无法执行总结");

    const validMsgs = messagesArray.filter(m => !m.isHidden && !m.isSystem && !m.isLoading);
    if (validMsgs.length === 0) return;

    // ★ 核心修复：绝对不用“用户”称呼，使用设定的名字，如果没有设定则用“我”
    const myName = chat.userRemark || chat.userRealName || "我";
    
    // 拼接文本时也用真实称呼
    const promptText = validMsgs.map(m => `${m.isSelf ? myName : chat.name}: ${m.text}`).join('\n\n');

    // ★ 核心修复：如果用户写了自定义要求，就以自定义要求为绝对核心
    const finalInstruction = customPrompt 
        ? `【最高优先级指令】：\n${customPrompt}\n\n(请严格按照上述要求对下方剧情进行总结)`
        : `【常规总结指令】：\n请客观总结下方剧情。重点记录关键动作、场景变化及双方情感升温细节。直接输出段落，不要加任何前缀。`;

    const systemPrompt = `
你现在的任务是【剧情总结员】。
请对以下剧场的剧情片段进行总结并归档。

【视角要求】：
必须以第三人称客观视角总结（使用“${myName}”和“${chat.name}”作为指代）。绝对不要使用“用户”、“User”或“AI”这种打破沉浸感的词汇！

${finalInstruction}

【待总结的剧情片段】：
${promptText.slice(0, 12000)} 
`;

    const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: systemPrompt }],
            temperature: 0.6,
            max_tokens: parseInt(document.getElementById('apiMaxTokens').value) || 2048
        })
    });

    if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
    }
    
    const data = await response.json();
    const summaryText = data.choices[0].message.content.trim();

    if (!chat.offlineSummaries) chat.offlineSummaries = [];
    chat.offlineSummaries.push({
        content: summaryText
    });
}

/* ========================================= */
/* ★★★ 单角色聊天记录 导出/导入逻辑 ★★★ */
/* ========================================= */

// 1. 打开/关闭弹窗
function openSingleChatDataModal() {
    document.getElementById('single-chat-data-modal').classList.add('show');
}

function closeSingleChatDataModal() {
    document.getElementById('single-chat-data-modal').classList.remove('show');
}

// 2. 导出当前角色的聊天记录 (包含人设与设置)
function exportSingleChatRecord() {
    if (!currentChatId) return;
    const chat = chatList.find(c => c.id === currentChatId);
    if (!chat) return;

    try {
        const exportData = {
            type: "single_chat_record",
            version: "1.1", 
            timestamp: new Date().toISOString(),
            chatData: {
                name: chat.name,
                realName: chat.realName || "",
                avatar: chat.avatar || "",
                
                // --- 新增：人设与专属设置 ---
                charPersona: chat.charPersona || "",
                userPersona: chat.userPersona || "",
                visualPrompt: chat.visualPrompt || "",
                chatMemory: chat.chatMemory || "",
                minimaxVoiceId: chat.minimaxVoiceId || "",
                replyMin: chat.replyMin,
                replyMax: chat.replyMax,
                customCss: chat.customCss || "",
                offlineSettings: chat.offlineSettings || {},
                offlineCss: chat.offlineCss || "",

                // --- 原有：聊天与记忆数据 ---
                messages: chat.messages || [],
                summaries: chat.summaries || [],
                gallery: chat.gallery || [],
                offlineMessages: chat.offlineMessages || [],
                offlineSummaries: chat.offlineSummaries || []
            }
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `Miu记录_${chat.name}_${dateStr}.json`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        closeSingleChatDataModal();
    } catch (e) {
        alert("导出失败: " + e.message);
    }
}

// 3. 导入单角色聊天记录 (包含人设与设置)
function importSingleChatRecord(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            if (data.type === "single_chat_record" && data.chatData) {
                // 提示语加上了“人设和设置”
                if (confirm(`检测到记录包：【${data.chatData.name}】\n\n导入将覆盖当前角色现有的：\n1. 聊天记录与相册\n2. 角色人设与设定\n3. 专属气泡与线下配置\n\n确定要导入吗？`)) {
                    
                    const chat = chatList.find(c => c.id === currentChatId);
                    if (chat) {
                        // --- 覆盖：人设与专属设置 ---
                        if (data.chatData.charPersona !== undefined) chat.charPersona = data.chatData.charPersona;
                        if (data.chatData.userPersona !== undefined) chat.userPersona = data.chatData.userPersona;
                        if (data.chatData.visualPrompt !== undefined) chat.visualPrompt = data.chatData.visualPrompt;
                        if (data.chatData.chatMemory !== undefined) chat.chatMemory = data.chatData.chatMemory;
                        if (data.chatData.minimaxVoiceId !== undefined) chat.minimaxVoiceId = data.chatData.minimaxVoiceId;
                        if (data.chatData.customCss !== undefined) chat.customCss = data.chatData.customCss;
                        if (data.chatData.offlineSettings !== undefined) chat.offlineSettings = data.chatData.offlineSettings;
                        if (data.chatData.offlineCss !== undefined) chat.offlineCss = data.chatData.offlineCss;
                        if (data.chatData.replyMin !== undefined) chat.replyMin = data.chatData.replyMin;
                        if (data.chatData.replyMax !== undefined) chat.replyMax = data.chatData.replyMax;
                        if (data.chatData.avatar) chat.avatar = data.chatData.avatar;
                        if (data.chatData.realName) chat.realName = data.chatData.realName;

                        // --- 覆盖：核心聊天数据 ---
                        chat.messages = data.chatData.messages || [];
                        chat.summaries = data.chatData.summaries || [];
                        chat.gallery = data.chatData.gallery || [];
                        chat.offlineMessages = data.chatData.offlineMessages || [];
                        chat.offlineSummaries = data.chatData.offlineSummaries || [];
                        
                        // 重置记忆索引
                        chat.lastSummarizedIndex = chat.messages.length;
                        chat.offlineLastSummarizedIndex = chat.offlineMessages.length;

                        // 更新最后一条消息预览
                        updateChatLastMsg(chat);
                        
                        // 保存到数据库
                        await db.chats.put(chat);
                        saveData();
                        
                        // 刷新 UI 界面
                        renderMessages(chat);
                        renderChatList();
                        
                        // 如果设置页正开着，刷新一下设置页里的显示
                        document.getElementById('charPersona').value = chat.charPersona || '';
                        document.getElementById('userPersona').value = chat.userPersona || '';
                        document.getElementById('customCssInput').value = chat.customCss || '';
                        applyChatCustomCss(chat.customCss);
                        
                        updateMemStats(chat);
                        renderMemSummaryList(chat);
                        
                        alert("导入成功！");
                        closeSingleChatDataModal();
                    }
                }
            } else {
                alert("文件格式不正确，不是有效的单角色记录文件！");
            }
        } catch (err) {
            alert("解析文件失败，请确保是正确的 JSON 文件！");
            console.error(err);
        }
    };
    reader.readAsText(file);
    input.value = ''; // 清空 input，方便重复选择
}

/* ========================================= */
/* ★★★ 智能多格式文档导入功能 (TXT/MD/DOCX) ★★★ */
/* ========================================= */

// 核心：通用文本提取器
async function extractTextFromDocument(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const isDocx = file.name.toLowerCase().endsWith('.docx');

        reader.onload = async (e) => {
            if (isDocx) {
                // 处理 Word 文档
                try {
                    if (typeof mammoth === 'undefined') {
                        reject(new Error("文档解析库未加载，请检查网络。"));
                        return;
                    }
                    const arrayBuffer = e.target.result;
                    // 使用 mammoth 仅提取纯文本，无视排版和隐藏结构
                    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
                    resolve(result.value);
                } catch (err) {
                    reject(err);
                }
            } else {
                // 处理 TXT / MD 等纯文本
                resolve(e.target.result);
            }
        };

        reader.onerror = (e) => reject(e);

        if (isDocx) {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    });
}

// 1. 导入文档作为角色人设
async function handlePersonaDocImport(input) {
    const file = input.files[0];
    if (!file) return;

    try {
        const textContent = await extractTextFromDocument(file);
        const cleanContent = textContent.trim();
        
        if (!cleanContent) {
            alert("文档内容为空或无法识别文字！");
            input.value = '';
            return;
        }

        // 取文件名作为角色名字（去掉后缀）
        const fileName = file.name.replace(/\.[^/.]+$/, "");

        const newChar = {
            id: Date.now(),
            name: fileName,
            realName: fileName,
            avatar: 'https://placehold.co/100/e0e0e0/888?text=' + fileName.charAt(0),
            charPersona: cleanContent, // 将提取出的纯文字塞进人设
            userPersona: "",
            visualPrompt: "",
            worldBooks: [],
            messages: [],
            time: "刚刚",
            isPinned: false,
            lastMomentTime: 0
        };

        chatList.unshift(newChar);
        await db.chats.add(newChar);
        
        // 自动加入后台活跃白名单
        if (!globalData) globalData = {};
        if (!globalData.autoAllowedCharIds) globalData.autoAllowedCharIds = [];
        if (!globalData.autoAllowedCharIds.includes(newChar.id)) globalData.autoAllowedCharIds.push(newChar.id);

        saveData();
        renderChatList();
        alert(`成功从文档导入角色：${newChar.name}\n(共提取 ${cleanContent.length} 字，头像请在设置中手动更换)`);
    } catch (err) {
        alert("读取文档失败！请确保文件未加密或损坏。");
        console.error(err);
    }
    input.value = ''; // 清空 input
}

// 2. 导入文档作为世界书
async function handleWbDocImport(input) {
    const file = input.files[0];
    if (!file) return;

    try {
        const textContent = await extractTextFromDocument(file);
        const cleanContent = textContent.trim();
        
        if (!cleanContent) {
            alert("文档内容为空或无法识别文字！");
            input.value = '';
            return;
        }

        const fileName = file.name.replace(/\.[^/.]+$/, "");

        const newBook = {
            id: Date.now(),
            name: fileName,
            group: '默认分组',
            isCharBook: false,
            boundCharId: null,
            triggerType: 'always', // 文档默认设置为始终触发
            keywords: "",
            entries: [
                {
                    title: "文档提取内容",
                    content: cleanContent
                }
            ]
        };

        worldBooks.push(newBook);
        saveData();
        renderWorldBookPage();
        
        window.worldBooks = worldBooks;
        window.worldbooks = worldBooks;

        alert(`成功从文档导入世界书：${newBook.name}\n(共提取 ${cleanContent.length} 字)`);
    } catch (err) {
        alert("读取文档失败！请确保文件未加密或损坏。");
        console.error(err);
    }
    input.value = '';
}
