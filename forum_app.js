// ==================== 论坛App ====================

// 论坛数据
let forumSettings = {
  worldview: "", // 世界观设定
  forumName: "广场", // 论坛名称
  followedUsers: [], 
  userAvatar: "",
  userIdentity: "", // 用户在论坛的身份
  userNickname: "", // 用户在论坛的昵称
  userHandle: "", // 用户的@ID
  userBio: "", // 个人介绍
  userBanner: "", // 背景图
  userFollowing: 0, // 关注数
  userFollowers: 0, // 粉丝数
  userJoinDate: "", // 加入时间
  aiParticipants: [], // AI参与者列表 [{ charId, identity, nickname, avatar, handle }]
  npcs: [], // NPC列表 [{ id, name, handle, avatar, identity, persona }]
  relationships: [], // 关系列表 [{ id, person1Type, person1Id, person2Type, person2Id, relationship, description }]
  worldbookIds: [], // 绑定的世界书ID列表
};

// 默认头像SVG（灰色背景+白色人形）
const DEFAULT_AVATAR_SVG = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="48" height="48" fill="#CFD9DE"/>
  <circle cx="24" cy="18" r="8" fill="white"/>
  <ellipse cx="24" cy="42" rx="14" ry="12" fill="white"/>
</svg>`;

// 获取默认头像的Data URL
function getDefaultAvatarDataUrl() {
  return 'data:image/svg+xml,' + encodeURIComponent(DEFAULT_AVATAR_SVG);
}

let forumPosts = []; // 帖子列表
let currentForumPostId = null; // 当前查看的帖子ID
let forumComposeAuthor = null; // 发帖时选择的作者
let forumReplyTarget = null; // 回复目标 { commentId, authorName }
let currentForumTab = 'recommend'; // 当前tab: 'recommend' 或 'following'
let forumPresets = [];

// ==================== 初始化 ====================

async function initForumApp() {
  // 强制移除forumPage的padding（覆盖style.css的.page样式）
  const forumPage = document.getElementById('forumPage');
  if (forumPage) {
    forumPage.style.padding = '0';
    forumPage.style.margin = '0';
  }
  
  const savedPresets = await localforage.getItem("forumPresets");
  if (savedPresets) {
    forumPresets = savedPresets;
  }

  // 加载保存的数据
  const savedSettings = await localforage.getItem("forumSettings");
  if (savedSettings) {
    forumSettings = { ...forumSettings, ...savedSettings };
  }

  const savedPosts = await localforage.getItem("forumPosts");
  if (savedPosts) {
    forumPosts = savedPosts;
  }

  // 渲染论坛主页
  renderForumPage();

  console.log("[论坛] 初始化完成");
}

// ==================== [核心重构] 身份与评论关系严格解析器 ====================

// 1. 严格身份解析器：杜绝模糊包含，仅限完全等值匹配
function resolveAuthorIdentity(rawName) {
  const name = (rawName || "").trim();
  const cleanName = name.toLowerCase();
  const globalChars = typeof characters !== 'undefined' ? characters : (window.characters || []);
  const aiParticipants = forumSettings.aiParticipants || [];
  const npcs = forumSettings.npcs || [];

  // 先匹配 AI 角色
  const matchedAI = aiParticipants.find(p => {
    const char = globalChars.find(ch => String(ch.id) === String(p.charId));
    const pName = (p.nickname || char?.name || '').trim().toLowerCase();
    return pName && cleanName === pName;
  });

  if (matchedAI) {
    const char = globalChars.find(c => String(c.id) === String(matchedAI.charId));
    return {
      type: "ai",
      id: matchedAI.charId,
      name: matchedAI.nickname || char?.name || name,
      avatar: matchedAI.avatar || char?.avatar || ''
    };
  }

  // 再匹配 NPC
  const matchedNPC = npcs.find(n => n.name && cleanName === n.name.trim().toLowerCase());
  if (matchedNPC) {
    return {
      type: "npc",
      id: matchedNPC.id,
      name: matchedNPC.name,
      avatar: matchedNPC.avatar || ''
    };
  }

  // 兜底为普通路人
  return {
    type: "npc",
    id: null,
    name: name,
    avatar: ""
  };
}

// 2. 闭环关系连线器：两阶段无冲突 ID 分配与引用查找 (带 AI 评论硬限防护)
function mapAndResolveComments(newComments, post) {
  if (!Array.isArray(newComments)) return [];
  
  const postComments = post.comments || [];
  const baseId = postComments.reduce((max, com) => Math.max(max, Number(com.id) || 0), 0);
  const myName = (forumSettings.userNickname || "用户").trim().toLowerCase();

  // 记录当前批次中每个 AI 角色的评论计数
  const aiCommentCounts = {};

  // Phase 1: 安全生成独立物理 ID 并精准匹配发布人
  const mapped = newComments
    .filter(c => {
      // 严格过滤掉代指用户的生成
      const cName = (c.authorName || "").trim().toLowerCase();
      return c.authorType !== 'user' && cName !== 'user' && cName !== myName;
    })
    .map((c, idx) => {
      const auth = resolveAuthorIdentity(c.authorName);
      return {
        auth: auth,
        originalComment: c,
        idx: idx // 记录在 AI 原始数组中的索引，确保过滤后 tempIdx 对应关系不断联
      };
    })
    .filter(item => {
      // ★★★ 核心修复：防刷屏过滤器。单次生成中，每个 AI 角色最多只允许保留 2 条评论 ★★★
      if (item.auth.type === 'ai') {
        const aiName = item.auth.name;
        aiCommentCounts[aiName] = (aiCommentCounts[aiName] || 0) + 1;
        
        if (aiCommentCounts[aiName] > 2) {
          console.log(`[论坛安全防护] 过滤掉 AI 角色 [${aiName}] 的第 ${aiCommentCounts[aiName]} 条多余评论，避免评论区刷屏。`);
          return false; // 抛弃该条多余评论
        }
      }
      return true;
    })
    .map((item, idx) => {
      const c = item.originalComment;
      const auth = item.auth;
      return {
        id: baseId + idx + 1,
        tempIdx: item.idx + 1, // 映射到原始数组序号，供 Phase 2 引用关系查找
        authorType: auth.type,
        authorId: auth.id,
        authorName: auth.name,
        authorAvatar: auth.avatar,
        handle: c.handle || generateEnglishHandle(auth.name),
        content: c.content || "",
        likes: c.likes || 0,
        liked: false,
        timestamp: Date.now() + idx * 1000,
        _aiReplyTo: c.replyTo || null,
        _aiReplyToName: (c.replyToName || "").trim()
      };
    });

  // Phase 2: 安全闭环关系链连接
  mapped.forEach(c => {
    let resolvedId = null;
    let resolvedName = null;

    if (c._aiReplyTo || c._aiReplyToName) {
      let parent = null;
      
      // A. 优先检索“当前批次”中生成的相邻评论（防断联）
      if (c._aiReplyToName) {
        parent = mapped.find(other => 
          other.authorName.toLowerCase() === c._aiReplyToName.toLowerCase() && 
          other.id !== c.id
        );
      }
      if (!parent && c._aiReplyTo) {
        const idxVal = Number(c._aiReplyTo);
        parent = mapped.find(other => 
          other.tempIdx === idxVal && 
          other.id !== c.id
        );
      }

      if (parent) {
        resolvedId = parent.id;
        resolvedName = parent.authorName;
      } else {
        // B. 次优先检索数据库中“历史已有”的评论
        let oldParent = null;
        if (c._aiReplyToName) {
          oldParent = postComments.find(old => 
            old.authorName.toLowerCase() === c._aiReplyToName.toLowerCase()
          );
        }
        if (oldParent) {
          resolvedId = oldParent.id;
          resolvedName = oldParent.authorName;
        }
      }
    }

    c.replyTo = resolvedId;
    c.replyToName = resolvedName;

    // 清洗掉过程临时属性，绝不污染最终存储的数据
    delete c.tempIdx;
    delete c._aiReplyTo;
    delete c._aiReplyToName;
  });

  return mapped;
}

// ★★★ 新增：超级头像查找函数 (修复头像不显示 & 修复 characters 报错) ★★★
function findBestAvatar(name, fallbackAvatar) {
  if (!name) return getDefaultAvatarDataUrl();
  const cleanName = name.trim().toLowerCase();
  const globalChars = typeof characters !== 'undefined' ? characters : (window.characters || []); 

  // 1. 精确匹配 AI 参与者
  const aiParticipants = forumSettings.aiParticipants || [];
  for (const p of aiParticipants) {
    if (p.nickname && p.nickname.trim().toLowerCase() === cleanName) {
      if (p.avatar) return p.avatar;
    }
    const char = globalChars.find(c => String(c.id) === String(p.charId));
    if (char && char.name && char.name.trim().toLowerCase() === cleanName) {
       return p.avatar || char.avatar || getDefaultAvatarDataUrl();
    }
  }

  // 2. 精确匹配 NPC 列表
  const npcs = forumSettings.npcs || [];
  for (const npc of npcs) {
    if (npc.name && npc.name.trim().toLowerCase() === cleanName) {
      if (npc.avatar) return npc.avatar;
    }
  }

  // 3. 匹配“我”
  const myName = (forumSettings.userNickname || '').trim().toLowerCase();
  if (cleanName === myName || cleanName === '我' || cleanName === '用户') {
      return localStorage.getItem("avatarImg") || getDefaultAvatarDataUrl();
  }

  // 4. 自带 Base64 回退
  if (fallbackAvatar && fallbackAvatar.length > 50) {
    return fallbackAvatar;
  }

  // 5. 全局角色池兜底捞
  const fallbackChar = globalChars.find(c => c.name && c.name.trim().toLowerCase() === cleanName);
  if (fallbackChar && fallbackChar.avatar) {
      return fallbackChar.avatar;
  }

  return getDefaultAvatarDataUrl();
}

// ==================== 渲染主页 (全屏沉浸版 - 修复版) ====================

function renderForumPage() {
  const container = document.getElementById("forumPageContent");
  if (!container) return;

  // 渲染页面结构：包含主容器、顶栏、底栏，以及【修复关键】：缺失的弹窗层
  container.innerHTML = `
    <div class="forum-container">
      <div class="forum-tabs">
        <button class="forum-nav-back forum-back-btn" onclick="closePage('forumPage')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        </button>
        
        <div class="forum-tab forum-home-tab active" onclick="switchForumTab('recommend')">推荐</div>
        <div class="forum-tab forum-home-tab" onclick="switchForumTab('following')">关注</div>
        
        <div class="forum-hot-title" style="display:none;">热点</div>
        
        <button class="forum-nav-back forum-refresh-btn" onclick="handleForumRefresh()" style="margin-left:auto;" title="刷新内容">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
        </button>
        <button class="forum-nav-back forum-settings-btn" onclick="openForumSettings()" style="margin-right:0;" title="设置">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>
        </button>
      </div>
      
      <div class="forum-feed" id="forumFeed"></div>
      
      <!-- 底部导航栏 -->
      <div class="forum-bottom-nav">
        <button class="forum-nav-item active" onclick="switchForumSection('home')">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 1.696L.622 8.807l1.06 1.696L3 9.679V19.5A2.5 2.5 0 0 0 5.5 22h13a2.5 2.5 0 0 0 2.5-2.5V9.679l1.318.824 1.06-1.696L12 1.696zM12 16.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>
        </button>
        <button class="forum-nav-item" onclick="switchForumSection('hot')">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        </button>
        <button class="forum-nav-item" onclick="switchForumSection('dm')">
           <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
        </button>
        <button class="forum-nav-item" onclick="switchForumSection('profile')">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        </button>
      </div>
      
      <button class="forum-fab" onclick="openForumCompose()">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>

      <!-- ============================================== -->
      <!-- ★★★ 修复开始：补全缺失的弹窗层 HTML ★★★ -->
      <!-- ============================================== -->

      <!-- 1. 设置弹窗 (之前就是缺了这个导致没反应) -->
      <div id="forumSettingsOverlay" class="forum-settings-overlay">
         <div class="forum-settings-header">
            <button class="forum-settings-back" onclick="closeForumSettings()">
               <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>
            <div class="forum-settings-title">论坛设置</div>
            <div style="width:36px"></div>
         </div>
         <div class="forum-settings-content" id="forumSettingsContent"></div>
      </div>

      <!-- 2. 发帖弹窗 -->
      <div id="forumComposeOverlay" class="forum-compose-overlay">
         <div class="forum-compose-header">
            <button class="forum-compose-cancel" onclick="closeForumCompose()">取消</button>
            <div class="forum-compose-title">发帖</div>
            <button class="forum-compose-submit" onclick="submitForumPost()">发布</button>
         </div>
         <div class="forum-compose-body">
            <div id="forumComposeUserInfo"></div>
            <textarea class="forum-compose-textarea" id="forumComposeTextarea" placeholder="有什么新鲜事？"></textarea>
            <div class="forum-compose-images" id="forumComposeImages"></div>
            <div class="forum-compose-toolbar">
               <button class="forum-compose-tool-btn" onclick="document.getElementById('forumComposeImageInput').click()">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
               </button>
               <input type="file" id="forumComposeImageInput" accept="image/*" multiple style="display:none" onchange="handleComposeImageUpload(this)">
            </div>
         </div>
      </div>

      <!-- 3. 帖子详情弹窗 -->
      <div id="forumDetailOverlay" class="forum-detail-overlay">
         <div class="forum-detail-header">
            <button class="forum-detail-back" onclick="closeForumPostDetail()">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>
            <div class="forum-detail-title">帖子</div>
            <div style="width:36px"></div>
         </div>
         <div id="forumDetailContent" style="flex:1; overflow-y:auto;"></div>
         <div id="forumReplyIndicator" style="display:none; padding:8px 16px; background:#f7f9f9; font-size:12px; color:#536471; align-items:center; border-top:1px solid #eff3f4;"></div>
         <div class="forum-comment-bar">
            <input type="text" class="forum-comment-input" id="forumCommentInput" placeholder="写评论...">
            <button class="forum-comment-send" onclick="submitForumComment()">发送</button>
         </div>
      </div>

    </div>
  `;

  renderForumFeed();
}

// 渲染信息流 (完整版：保留所有UI逻辑 + 关注列表过滤)
function renderForumFeed() {
  const container = document.getElementById("forumFeed");
  if (!container) return;

  // 1. 确保顶栏和FAB显示（从个人主页返回时可能被隐藏）
  const tabs = document.querySelector('.forum-tabs');
  const fab = document.querySelector('.forum-fab');
  if (tabs) tabs.style.display = 'flex';
  if (fab) fab.style.display = 'flex';
  
  // 2. 恢复safe area padding（从个人主页返回时）
  const forumContainer = document.querySelector('.forum-container');
  if (forumContainer) forumContainer.style.paddingTop = '';
  
  // 3. 显示主页的返回按钮、tab和设置按钮，隐藏热点标题
  const backBtn = document.querySelector('.forum-back-btn');
  const homeTabs = document.querySelectorAll('.forum-home-tab');
  const hotTitle = document.querySelector('.forum-hot-title');
  const settingsBtn = document.querySelector('.forum-settings-btn');
  if (backBtn) backBtn.style.display = 'flex';
  homeTabs.forEach(tab => tab.style.display = 'flex');
  if (hotTitle) hotTitle.style.display = 'none';
  if (settingsBtn) settingsBtn.style.display = 'flex';
  
  // 更新当前section状态
  window.currentForumSection = 'home';

  // 4. 检查是否已设置世界观
  if (!forumSettings.worldview) {
    container.innerHTML = `
      <div class="forum-empty">
        <div class="forum-empty-text">还没有设置世界观<br>先设置论坛的世界观和你的身份吧</div>
        <button class="forum-empty-btn" onclick="openForumSettings()">去设置</button>
      </div>
    `;
    return;
  }

  // 5. 过滤掉搜索结果帖子和他人主页生成的帖子，只显示主页帖子
  let filteredPosts = forumPosts.filter(p => !p.isSearchResult && !p.isProfileGenerated);
  
  // 6. 根据当前tab进一步过滤
  if (currentForumTab === 'following') {
    // ============================================================
    // ★★★ 核心修改：关注页过滤逻辑 (基于 followedUsers) ★★★
    // ============================================================
    const followed = forumSettings.followedUsers || [];

    if (followed.length === 0) {
        // 如果没关注任何人，直接清空列表
        filteredPosts = [];
    } else {
        filteredPosts = filteredPosts.filter(p => {
            // 1. 匹配 ID (如果帖子数据里有 authorId)
            if (p.authorId && followed.includes(String(p.authorId))) return true;
            
            // 2. 匹配 名字 (兼容旧数据或路人)
            if (followed.includes(p.authorName)) return true;
            
            // 3. 匹配 AI角色 (防止帖子只有名字没有ID)
            const aiChar = forumSettings.aiParticipants.find(ai => ai.nickname === p.authorName);
            if (aiChar && followed.includes(String(aiChar.charId))) return true;

            // 4. 匹配 NPC
            const npc = (forumSettings.npcs || []).find(n => n.name === p.authorName);
            if (npc && followed.includes(String(npc.id))) return true;

            return false;
        });
    }
    // ============================================================
  }

  // 7. 没有帖子时显示生成按钮
  if (filteredPosts.length === 0) {
    // 修改文案
    const emptyText = currentForumTab === 'following' 
      ? '关注列表暂无动态<br>点击角色头像进入主页即可自动关注'
      : '论坛里还没有帖子<br>点击下方按钮生成一些内容吧';
    
    // 逻辑优化：如果是关注页但没关注任何人，就不显示生成按钮（因为生成了也看不见）
    // 如果是关注页且有关注的人，显示生成按钮
    const hasFollows = (forumSettings.followedUsers && forumSettings.followedUsers.length > 0);
    const showGenBtn = currentForumTab !== 'following' || hasFollows;

    container.innerHTML = `
      <div class="forum-empty">
        <div class="forum-empty-icon"></div>
        <div class="forum-empty-text">${emptyText}</div>
        ${showGenBtn ? `<button class="forum-empty-btn" onclick="generateForumPosts()">生成帖子</button>` : ''}
      </div>
    `;
    return;
  }

  // 8. 渲染帖子列表
  let html = filteredPosts.map((post) => renderForumPostItem(post)).join("");
  container.innerHTML = html;
}

// 渲染单个帖子 (修复头像版)
function renderForumPostItem(post) {
  const tagHtml = "";
  
  // 强制使用最新昵称
  const displayAuthorName = post.authorType === 'user' ? (forumSettings.userNickname || '我') : post.authorName;

  // ★★★ 修复：使用超级查找器获取头像 ★★★
  const realAvatarUrl = findBestAvatar(displayAuthorName, post.authorAvatar);
  const avatarContent = `<img src="${realAvatarUrl}" alt="${displayAuthorName}">`;

  // 格式化时间
  const timeStr = formatForumTime(post.timestamp);
  const commentCount = post.comments?.length || 0;
  const handle = post.handle || generateEnglishHandle(post.authorName);
  const views = post.views || Math.floor(Math.random() * 1000) + 50;
  const retweets = post.retweets || 0;
  const contentHtml = formatForumContent(post.content);
  
  let imagesHtml = '';
  if (post.images && post.images.length > 0) {
    const imageCount = post.images.length;
    const gridClass = imageCount === 1 ? 'single' : imageCount === 2 ? 'double' : imageCount === 3 ? 'triple' : 'quad';
    imagesHtml = `
      <div class="forum-post-images ${gridClass}" onclick="event.stopPropagation();">
        ${post.images.map((img, idx) => `
          <div class="forum-post-image-item" onclick="showForumFullImage('${img.replace(/'/g, "\\'")}')">
            <img src="${img}" alt="">
          </div>
        `).join('')}
      </div>
    `;
  }
  
  // 原帖渲染逻辑...
  let originalPostHtml = '';
  if (post.isRetweet && post.originalPost) {
    const orig = post.originalPost;
    // 原帖头像也修复一下
    const origRealAvatar = findBestAvatar(orig.authorName, orig.authorAvatar);
    const origAvatarContent = `<img src="${origRealAvatar}" alt="">`;
    const origHandle = orig.handle || generateEnglishHandle(orig.authorName);
    const origContentHtml = formatForumContent(orig.content);
    
    let origImagesHtml = '';
    if (orig.images && orig.images.length > 0) {
        // ... (原帖图片代码保持不变) ...
        // 为了缩短篇幅，这里保留你原本的图片生成逻辑，略写
        const origImageCount = orig.images.length;
        const origGridClass = origImageCount === 1 ? 'single' : origImageCount === 2 ? 'double' : 'quad';
        origImagesHtml = `<div class="forum-post-images ${origGridClass}" onclick="event.stopPropagation();">${orig.images.slice(0, 4).map(img => `<div class="forum-post-image-item"><img src="${img}"></div>`).join('')}</div>`;
    }
    
    originalPostHtml = `
      <div class="forum-quote-card" onclick="event.stopPropagation(); openForumPostDetail(${orig.id})">
        <div class="forum-quote-header">
          <div class="forum-quote-avatar">${origAvatarContent}</div>
          <span class="forum-quote-name">${escapeForumHtml(orig.authorName)}</span>
          <span class="forum-quote-handle">${origHandle.startsWith('@') ? origHandle : '@' + origHandle}</span>
        </div>
        <div class="forum-quote-content">${origContentHtml}</div>
        ${origImagesHtml}
      </div>
    `;
  }

  return `
    <div class="forum-post" onclick="openForumPostDetail(${post.id})">
      <div class="forum-post-left">
        <div class="forum-post-avatar" onclick="event.stopPropagation(); openOtherUserProfile('${post.authorType}', '${escapeForumHtml(post.authorName)}', '${post.authorId || ''}')">${avatarContent}</div>
      </div>
      
      <div class="forum-post-right">
        <div class="forum-post-header">
          <span class="forum-post-name" onclick="event.stopPropagation(); openOtherUserProfile('${post.authorType}', '${escapeForumHtml(displayAuthorName)}', '${post.authorId || ''}')">${escapeForumHtml(
            displayAuthorName
          )}</span>
          ${tagHtml}
          <div class="forum-post-meta">
            <span>${handle.startsWith('@') ? handle : '@' + handle}</span>
            <span>·</span>
            <span>${timeStr}</span>
          </div>
          ${post.authorType === 'user' ? `
          <button class="forum-post-more-btn" onclick="event.stopPropagation(); showPostMoreMenu(${post.id}, this)" title="更多">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>
          </button>
          ` : ''}
        </div>
        
        ${post.content ? `<div class="forum-post-content">${contentHtml}</div>` : ''}
        ${imagesHtml}
        ${originalPostHtml}

        <div class="forum-post-actions">
          <div class="forum-action" onclick="event.stopPropagation(); refreshPostComments(${post.id}, this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
            <span>${commentCount || ""}</span>
          </div>
          <div class="forum-action" onclick="event.stopPropagation(); openQuoteRetweet(${post.id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
            <span>${retweets || ""}</span>
          </div>
          <div class="forum-action ${post.liked ? "liked" : ""}" onclick="event.stopPropagation(); toggleForumPostLike(${post.id})">
            <svg viewBox="0 0 24 24" fill="${post.liked ? "currentColor" : "none"}" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            <span>${post.likes || ""}</span>
          </div>
          <div class="forum-action" onclick="event.stopPropagation();">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
            <span>${views}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ==================== 修复：图片查看器挂载到论坛App内部 ====================
function showForumFullImage(imgSrc) {
  const modal = document.createElement('div');
  modal.className = 'forum-fullimage-modal';
  
  // ★★★ 核心修复1：强制提升层级 ★★★
  modal.style.zIndex = "10005";
  modal.style.position = "fixed"; // 确保它是固定的
  
  // 修复关键：阻止事件冒泡
  modal.onclick = (e) => {
    if (e.target === modal || e.target.classList.contains('forum-fullimage-close')) {
      modal.remove();
    }
  };

  modal.innerHTML = `
    <div class="forum-fullimage-content">
      <img src="${imgSrc}" alt="" onclick="event.stopPropagation()">
    </div>
    <button class="forum-fullimage-close">×</button>
  `;

  // ★★★ 核心修复2：挂载到 forumPage ★★★
  const forumPage = document.getElementById('forumPage');
  if (forumPage) {
    forumPage.appendChild(modal);
  } else {
    document.body.appendChild(modal); 
  }
}
// ==================== 帖子详情 ====================

function openForumPostDetail(postId) {
  // 确保ID是数字类型进行比较
  currentForumPostId = Number(postId);
  const overlay = document.getElementById("forumDetailOverlay");
  if (overlay) {
    overlay.classList.add("active");
    renderForumPostDetail();
  }
}

function closeForumPostDetail() {
  currentForumPostId = null;
  forumReplyTarget = null; // 重置回复状态
  const overlay = document.getElementById("forumDetailOverlay");
  if (overlay) {
    overlay.classList.remove("active");
  }
}

// 渲染帖子详情 (修复回复格式版)
function renderForumPostDetail() {
  const post = forumPosts.find((p) => Number(p.id) === Number(currentForumPostId));
  if (!post) return;

  const container = document.getElementById("forumDetailContent");
  if (!container) return;

  const displayAuthorName = post.authorType === 'user' ? (forumSettings.userNickname || '我') : post.authorName;
  const realAvatarUrl = findBestAvatar(displayAuthorName, post.authorAvatar);
  const avatarContent = `<img src="${realAvatarUrl}" alt="">`;
  const handle = post.handle || generateEnglishHandle(post.authorName);
  const retweets = post.retweets || 0;
  const views = post.views || 0;

  const commentsHtml = (post.comments || [])
    .map((comment) => {
      const commentDisplayName = comment.authorType === 'user' ? (forumSettings.userNickname || '我') : comment.authorName;
      const commentAvatarUrl = findBestAvatar(commentDisplayName, comment.authorAvatar);
      const commentAvatar = `<img src="${commentAvatarUrl}" alt="">`;

      // ★★★ 最终修正：回复是细灰，名字是粗蓝，冒号是细灰 ★★★
      let replyPrefix = "";
      if (comment.replyToName) {
         replyPrefix = `<span style="color:#536471;">回复 </span><span style="color:#1d9bf0; font-weight:bold;">@${escapeForumHtml(comment.replyToName)}</span><span style="color:#536471;">：</span>`;
      }

      // 【强化清洗】如果内容开头有“回复@某某：”或“回复某某：”，无论中英文，一律强行清洗，避免与系统前缀重复
      let cleanContent = formatForumContent(comment.content);
      const manualReplyPattern = /^回复\s*@?[a-zA-Z0-9_\u4e00-\u9fa5]+[:：\s]*/i;
      cleanContent = cleanContent.replace(manualReplyPattern, '');

      return `
      <div class="forum-comment" data-comment-id="${comment.id}">
        <div class="forum-comment-avatar" onclick="openOtherUserProfile('${comment.authorType}', '${escapeForumHtml(commentDisplayName)}', '')" style="cursor:pointer;">
            ${commentAvatar}
        </div>
        <div class="forum-comment-body">
          <div class="forum-comment-header">
            <span class="forum-comment-name" onclick="openOtherUserProfile('${comment.authorType}', '${escapeForumHtml(commentDisplayName)}', '')" style="cursor:pointer;">
                ${escapeForumHtml(commentDisplayName)}
            </span>
            <span class="forum-comment-time">· ${formatForumTime(comment.timestamp)}</span>
          </div>
          <!-- 这里应用新的回复格式 -->
          <div class="forum-comment-text">${replyPrefix}${cleanContent}</div>
          
          <div class="forum-comment-actions">
            <div class="forum-comment-action" onclick="replyToForumComment(${post.id}, ${comment.id}, '${escapeForumHtml(comment.authorName)}')">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
            </div>
            <div class="forum-comment-action ${comment.liked ? 'liked' : ''}" onclick="toggleForumCommentLike(${post.id}, ${comment.id})">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="${comment.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              <span>${comment.likes || ''}</span>
            </div>
          </div>
        </div>
      </div>
    `;
    })
    .join("");

  const fullTime = new Date(post.timestamp).toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  container.innerHTML = `
    <div class="forum-detail-post">
      <div class="forum-detail-author">
        <div class="forum-detail-avatar" onclick="openOtherUserProfile('${post.authorType}', '${escapeForumHtml(post.authorName)}', '${post.authorId || ''}')" style="cursor:pointer;">${avatarContent}</div>
        <div class="forum-detail-author-info">
          <div class="forum-detail-name" onclick="openOtherUserProfile('${post.authorType}', '${escapeForumHtml(displayAuthorName)}', '${post.authorId || ''}')" style="cursor:pointer;">${escapeForumHtml(displayAuthorName)}</div>
          <div class="forum-detail-handle">${handle.startsWith('@') ? handle : '@' + handle}</div>
        </div>
      </div>
      
      <div class="forum-detail-text">${formatForumContent(post.content)}</div>
      ${renderDetailImages(post)}
      
      <div class="forum-detail-time">${fullTime}</div>
      <div class="forum-detail-stats">
        <div class="forum-detail-stat"><strong>${retweets}</strong> 转发</div>
        <div class="forum-detail-stat"><strong>${post.likes || 0}</strong> 喜欢</div>
        <div class="forum-detail-stat"><strong>${views}</strong> 浏览</div>
      </div>
      
      <div class="forum-detail-actions">
        <div class="forum-detail-action" onclick="refreshPostComments(${post.id}, this)" title="点击生成新评论"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg></div>
        <div class="forum-detail-action" onclick="openQuoteRetweet(${post.id})"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg></div>
        <div class="forum-detail-action ${post.liked ? 'liked' : ''}" onclick="toggleForumPostLike(${post.id}); renderForumPostDetail();"><svg viewBox="0 0 24 24" width="20" height="20" fill="${post.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg></div>
        <div class="forum-detail-action" onclick="retweetToChat(${post.id})"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg></div>
      </div>
    </div>
    
    <div class="forum-comments-section">
      ${commentsHtml || '<div class="forum-no-comments">暂无评论，来说点什么吧</div>'}
    </div>
  `;

  updateForumCommentInput();
}

// 更新评论输入框状态
function updateForumCommentInput() {
  const input = document.getElementById("forumCommentInput");
  const replyIndicator = document.getElementById("forumReplyIndicator");

  if (forumReplyTarget) {
    if (input) input.placeholder = `回复 @${forumReplyTarget.authorName}...`;
    if (replyIndicator) {
      replyIndicator.style.display = "flex";
      replyIndicator.innerHTML = `
        <span>回复 @${escapeForumHtml(forumReplyTarget.authorName)}</span>
        <span style="cursor:pointer;margin-left:8px;" onclick="cancelForumReply();updateForumCommentInput();">✕</span>
      `;
    }
  } else {
    if (input) input.placeholder = "写评论...";
    if (replyIndicator) replyIndicator.style.display = "none";
  }
}

// ==================== 设置页面 ====================

function openForumSettings() {
  const overlay = document.getElementById("forumSettingsOverlay");
  if (overlay) {
    overlay.classList.add("active");
    renderForumSettings();
  }
}

async function closeForumSettings() {
  // 1. 强制获取当前输入框的值进行保存 (防止用户输完直接点关闭，没触发onchange)
  const nameInput = document.getElementById('forumNameInput');
  const worldviewInput = document.getElementById('forumWorldviewInput');
  
  // 如果输入框存在，就强制更新到内存变量中
  if (nameInput) forumSettings.forumName = nameInput.value;
  if (worldviewInput) forumSettings.worldview = worldviewInput.value;
  
  // 2. 存入数据库
  await localforage.setItem("forumSettings", forumSettings);
  console.log("[论坛] 设置页关闭，数据已强制保存");

  // 3. 关闭界面
  const overlay = document.getElementById("forumSettingsOverlay");
  if (overlay) {
    overlay.classList.remove("active");
  }
  
  // 4. 刷新主页，让新设置生效（比如世界观变化后，空状态提示会消失）
  renderForumFeed();
}

// ==================== 渲染设置页面 (UI升级版) ====================

function renderForumSettings() {
  const container = document.getElementById("forumSettingsContent");
  if (!container) return;

  // 1. 准备 AI角色、NPC、关系 的列表 HTML (保持原有逻辑不变)
  // ---------------------------------------------------------
  const participantsHtml = forumSettings.aiParticipants
    .map((p, index) => {
      const char = characters.find((c) => String(c.id) === String(p.charId));
      const avatarContent = p.avatar 
        ? `<img src="${p.avatar}" alt="">`
        : (char?.avatar ? `<img src="${char.avatar}" alt="">` : "🤖");
      const displayName = p.nickname || char?.name || "未知角色";
      const handleText = p.handle || generateEnglishHandle(displayName);

      return `
      <div class="forum-participant" onclick="editForumParticipant(${index})">
        <div class="forum-participant-avatar">${avatarContent}</div>
        <div class="forum-participant-info">
          <div class="forum-participant-name">${escapeForumHtml(displayName)}</div>
          <div class="forum-participant-handle">@${escapeForumHtml(handleText)}</div>
          <div class="forum-participant-identity">${escapeForumHtml(p.identity || "未设置身份")}</div>
        </div>
        <button class="forum-participant-remove" onclick="event.stopPropagation();removeForumParticipant(${index})">×</button>
      </div>
    `;
    }).join("");

  const npcsHtml = (forumSettings.npcs || [])
    .map((npc, index) => {
      const avatarContent = npc.avatar 
        ? `<img src="${npc.avatar}" alt="">`
        : (npc.name ? npc.name.charAt(0) : "👤");
      return `
      <div class="forum-participant" onclick="editForumNpc(${index})">
        <div class="forum-participant-avatar forum-npc-avatar">${avatarContent}</div>
        <div class="forum-participant-info">
          <div class="forum-participant-name">${escapeForumHtml(npc.name)}</div>
          <div class="forum-participant-handle">@${escapeForumHtml(npc.handle || '')}</div>
          <div class="forum-participant-identity">${escapeForumHtml(npc.identity || "未设置身份")}</div>
        </div>
        <button class="forum-participant-remove" onclick="event.stopPropagation();removeForumNpc(${index})">×</button>
      </div>
    `;
    }).join("");

  const relationshipsHtml = (forumSettings.relationships || [])
    .map((rel, index) => {
      const person1Name = getForumPersonName(rel.person1Type, rel.person1Id);
      const person2Name = getForumPersonName(rel.person2Type, rel.person2Id);
      return `
      <div class="forum-relationship-item" onclick="editForumRelationship(${index})">
        <div class="forum-relationship-people">
          <span class="forum-relationship-person">${escapeForumHtml(person1Name)}</span>
          <span class="forum-relationship-arrow">↔</span>
          <span class="forum-relationship-person">${escapeForumHtml(person2Name)}</span>
        </div>
        <div class="forum-relationship-type">${escapeForumHtml(rel.relationship || '未设置')}</div>
        <button class="forum-participant-remove" onclick="event.stopPropagation();removeForumRelationship(${index})">×</button>
      </div>
    `;
    }).join("");

  // 2. 生成预设下拉框的选项 HTML
  // ---------------------------------------------------------
  const presetsOptions = forumPresets.map((p, idx) => 
    `<option value="${idx}">${escapeForumHtml(p.name)}</option>`
  ).join("");


  // 3. 构建完整的页面 HTML (新 UI 结构)
  // ---------------------------------------------------------
  container.innerHTML = `
    <!-- ★★★ 纯净版：无图标、文字精简 ★★★ -->
    <div class="forum-section">
      <div class="forum-accordion" id="forumPresetAccordion">
        <!-- 标题栏：去掉文件夹图标，纯文字 -->
        <div class="forum-accordion-header" onclick="toggleForumPresetPanel()">
          <div class="forum-accordion-title">
            方案预设管理
          </div>
          <div class="forum-accordion-arrow">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#536471" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
        </div>
        
        <div class="forum-accordion-content">
          <select id="forumPresetSelect" class="forum-input forum-select" style="width:100%; background:#fff; margin-bottom:12px;" onchange="loadSelectedForumPreset()">
            <option value="">选择方案...</option>
            ${presetsOptions}
          </select>
          
          <div class="forum-btn-group">
            <!-- 删掉了 emoji 图标 -->
            <button class="forum-preset-btn save" onclick="saveNewForumPreset()">新建</button>
            <button class="forum-preset-btn update" onclick="updateCurrentForumPreset()">覆盖</button>
            <button class="forum-preset-btn delete" onclick="deleteSelectedForumPreset()">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 下面是原有的设置项，保持原样即可 -->
    <div class="forum-section">
      <div class="forum-section-title">世界观设定</div>
      <div class="forum-card">
        <div class="forum-item">
          <div class="forum-label">论坛名称</div>
          <input type="text" class="forum-input" id="forumNameInput" 
            value="${escapeForumHtml(forumSettings.forumName)}" 
            placeholder="如：豆瓣小组、微博超话..."
            oninput="forumSettings.forumName = this.value"
            onchange="saveForumSetting('forumName', this.value)">
        </div>
        <div class="forum-item">
          <div class="forum-label">世界观</div>
          <textarea class="forum-input" id="forumWorldviewInput" rows="4" 
            placeholder="描述这个论坛的世界观背景..."
            oninput="forumSettings.worldview = this.value"
            onchange="saveForumSetting('worldview', this.value)">${escapeForumHtml(forumSettings.worldview)}</textarea>
        </div>
        <div class="forum-item">
          <div class="forum-label">绑定世界书 <span class="forum-section-hint">可选</span></div>
          <div class="forum-worldbook-list" id="forumWorldbookList">
            ${renderForumWorldbookBindings()}
          </div>
          <button class="forum-add-btn forum-add-worldbook-btn" onclick="openForumWorldbookSelector()">+ 绑定世界书</button>
        </div>
      </div>
    </div>
    
    <div class="forum-section">
      <div class="forum-section-title">我的身份</div>
      <div class="forum-card">
        <div class="forum-item">
          <div class="forum-label">我的昵称</div>
          <input type="text" class="forum-input" 
            value="${escapeForumHtml(forumSettings.userNickname)}" 
            placeholder="你在论坛的昵称"
            oninput="forumSettings.userNickname = this.value"
            onchange="saveForumSetting('userNickname', this.value)">
        </div>
        <div class="forum-item">
          <div class="forum-label">我的身份</div>
          <textarea class="forum-input" rows="2" 
            placeholder="你在这个世界观里的身份..."
            oninput="forumSettings.userIdentity = this.value"
            onchange="saveForumSetting('userIdentity', this.value)">${escapeForumHtml(forumSettings.userIdentity)}</textarea>
        </div>
      </div>
    </div>
    
    <div class="forum-section">
      <div class="forum-section-title">AI角色 <span class="forum-section-hint">点击可编辑</span></div>
      ${participantsHtml || '<div class="forum-empty-hint">还没有添加AI角色</div>'}
      <button class="forum-add-btn" onclick="openAddForumParticipant()">+ 添加AI角色</button>
    </div>
    
    <div class="forum-section">
      <div class="forum-section-title">NPC角色 <span class="forum-section-hint">路人网友</span></div>
      ${npcsHtml || '<div class="forum-empty-hint">还没有添加NPC</div>'}
      <button class="forum-add-btn" onclick="openAddForumNpc()">+ 添加NPC</button>
    </div>
    
    <div class="forum-section">
      <div class="forum-section-title">人物关系 <span class="forum-section-hint">互动依据</span></div>
      ${relationshipsHtml || '<div class="forum-empty-hint">还没有设置关系</div>'}
      <button class="forum-add-btn" onclick="openAddForumRelationship()">+ 添加关系</button>
    </div>
    <div style="padding: 30px 10px 50px 10px;">
        <button onclick="clearGeneratedPosts()" style="
            width: 100%;
            height: 50px;
            background-color: #fff1f0; /* 截图同款浅粉底色 */
            color: #ff4d4f;            /* 截图同款红色文字 */
            border: none;
            border-radius: 25px;       /* 大圆角 */
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            一键清除生成的帖子
        </button>
    </div>
  `;
}

// ★★★ 修改：一键清除生成的帖子 + 私信 ★★★
async function clearGeneratedPosts() {
  // 1. 修改确认弹窗的文案
  if (!confirm("确定要清空所有 AI/NPC 生成的帖子以及所有私信记录吗？\n你的帖子和置顶帖会被保留。")) return;

  // 2. 清理帖子（原有逻辑：保留用户的和置顶的）
  forumPosts = forumPosts.filter(p => p.authorType === 'user' || p.isPinned);
  await localforage.setItem("forumPosts", forumPosts);

  // 3. 【新增】清理私信（全部清空）
  forumDirectMessages = []; // 清空内存中的私信列表
  await localforage.setItem("forumDirectMessages", []); // 清空数据库中的私信

  // 4. 提示并刷新
  showToast("帖子和私信已清理");
  
  // 刷新设置页
  renderForumSettings(); 
}

// 获取人物名称
function getForumPersonName(type, id) {
  if (type === 'ai') {
    const participant = forumSettings.aiParticipants.find(p => String(p.charId) === String(id));
    if (participant) {
      const char = characters.find(c => String(c.id) === String(id));
      return participant.nickname || char?.name || '未知AI';
    }
  } else if (type === 'npc') {
    const npc = (forumSettings.npcs || []).find(n => String(n.id) === String(id));
    return npc?.name || '未知NPC';
  } else if (type === 'user') {
    return forumSettings.userNickname || '用户';
  }
  return '未知';
}

async function saveForumSetting(key, value) {
  // 更新内存变量
  forumSettings[key] = value;
  
  // 存入数据库
  await localforage.setItem("forumSettings", forumSettings);
  
  console.log("[论坛] 设置已保存:", key);
  
  // ★★★ 新增：给出提示，让用户安心 ★★★
  // 如果你有 showToast 函数（上一步修复时加的），就调用它
  if (typeof showToast === 'function') {
      // 只有当 value 不为空时才提示，避免清空时也提示怪怪的，或者你可以一直提示
      if (value) showToast("设置已自动保存");
  }
}
// ==================== 世界书绑定管理 ====================

// 渲染已绑定的世界书列表 (修复版：纯文字 + 强力玻璃质感 UI)
function renderForumWorldbookBindings() {
  let forumBoundIds = forumSettings.worldbookIds || [];
  const allWorldbooks = getGlobalWorldbooks(); 
  
  // 自动清理逻辑：剔除已变成“角色专用”的书
  const cleanForumIds = forumBoundIds.filter(wbId => {
    const wb = allWorldbooks.find(w => w.id === Number(wbId));
    if (!wb) return false;
    if (wb.isCharBook === true) return false; // 踢出列表
    return true; 
  });
  
  // 同步清理后的数据
  if (cleanForumIds.length !== forumBoundIds.length) {
      forumSettings.worldbookIds = cleanForumIds;
      localforage.setItem("forumSettings", forumSettings);
      forumBoundIds = cleanForumIds; 
  }

  // --- 渲染 UI ---
  if (forumBoundIds.length === 0) {
    return `
      <div class="forum-empty-hint" style="text-align:center; padding:15px; background:rgba(255,255,255,0.5); border-radius:12px; color:#888; border:1px dashed rgba(0,0,0,0.1);">
        暂无额外绑定<br>
        <span style="font-size:12px; opacity:0.7">(角色绑定的世界书会自动生效)</span>
      </div>
    `;
  }
  
  return `
    <div class="forum-wb-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px;">
      ${forumBoundIds.map(wbId => {
        const wb = allWorldbooks.find(w => w.id === Number(wbId));
        if (!wb) return ''; 
        
        const entryCount = wb.entries?.length || 0;
        
        // ★★★ 强力玻璃质感样式 (无图标版) ★★★
        return `
          <div class="forum-wb-card" style="
              position: relative; 
              background: rgba(255, 255, 255, 0.65); /* 半透明白底 */
              backdrop-filter: blur(16px);           /* 强模糊 */
              -webkit-backdrop-filter: blur(16px);
              border: 1px solid rgba(255, 255, 255, 0.9); /* 亮边框 */
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); /* 柔和阴影 */
              border-radius: 12px; 
              padding: 12px 14px; 
              display: flex; 
              flex-direction: column; 
              justify-content: center;
              transition: all 0.2s;
              min-height: 50px;
          ">
            <!-- 标题 (加粗深色) -->
            <div style="font-weight: 600; font-size: 15px; color: #333; margin-bottom: 4px; padding-right: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeForumHtml(wb.name)}
            </div>
            
            <!-- 条目数 (浅色小字) -->
            <div style="font-size: 12px; color: #888; display: flex; align-items: center;">
               <span style="display:inline-block; width:6px; height:6px; background:#4cd964; border-radius:50%; margin-right:6px;"></span>
               ${entryCount} 条目
            </div>

            <!-- 删除按钮 (右上角悬浮) -->
            <button onclick="removeForumWorldbook('${wbId}')" style="
                position: absolute; 
                top: 8px; 
                right: 8px; 
                width: 22px; height: 22px; 
                border: none; 
                background: rgba(0,0,0,0.05); 
                border-radius: 50%;
                color: #999; 
                cursor: pointer; 
                display: flex; align-items: center; justify-content: center; 
                font-size: 14px;
                transition: all 0.2s;
            " 
            onmouseover="this.style.background='#ff4d4f'; this.style.color='white';" 
            onmouseout="this.style.background='rgba(0,0,0,0.05)'; this.style.color='#999';">×</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// 打开世界书选择器 (修复版：解除角色绑定过滤限制)
function openForumWorldbookSelector() {
  const worldbooks = getGlobalWorldbooks(); 
  const forumBoundIds = forumSettings.worldbookIds || []; 
  // const charBoundIds = getCharacterBoundWorldbooks(); // 不再需要获取角色绑定的列表来做过滤
  
  // 过滤逻辑
  const availableWorldbooks = worldbooks.filter(wb => {
    const wbId = Number(wb.id);
    
    // 1. 已经添加到论坛列表的，过滤掉 (防止重复添加)
    const isBoundToForum = forumBoundIds.some(id => Number(id) === wbId);
    
    // 2. 被禁用的，过滤掉
    const isEnabled = wb.enabled !== false; 
    
    // 3. 标记为“角色专属”且未绑定给当前论坛用户的，过滤掉
    // (普通的通用世界书即使被某个角色用了，也应该允许在论坛全局再次添加)
    const isCharExclusive = wb.isCharBook === true; 
    
    // ★★★ 核心修复：移除了 !isBoundToChar 的判断 ★★★
    // 这样即使某个 AI 角色私下带了这个书，你依然可以把它设为论坛的全局设定
    return !isBoundToForum && isEnabled && !isCharExclusive;
  });
  
  if (availableWorldbooks.length === 0) {
    showToast('没有可添加的通用世界书');
    return;
  }
  
  // --- 列表渲染 (保持原样) ---
  const html = availableWorldbooks.map(wb => {
    const entryCount = wb.entries?.length || 0;
    return `
      <div class="forum-char-select-item" onclick="addForumWorldbook('${wb.id}')" style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
        <!-- 左侧文字区 -->
        <div style="flex:1; display:flex; flex-direction:column; justify-content:center;">
            <div style="font-size:15px; font-weight:600; color:#333; margin-bottom:2px;">
                ${escapeForumHtml(wb.name)}
            </div>
            <div style="font-size:12px; color:#999;">
                共 ${entryCount} 条目
            </div>
        </div>
        
        <!-- 右侧加号 -->
        <div style="
            width: 32px; height: 32px; 
            border-radius: 50%; 
            background: #f5f7f9; 
            color: #007aff; 
            display: flex; align-items: center; justify-content: center; 
            font-size: 20px; 
            font-weight: 300;
        ">+</div>
      </div>
    `;
  }).join('');
  
  // 创建弹窗
  const modal = document.createElement('div');
  modal.id = 'forumWorldbookSelectorModal';
  modal.className = 'forum-modal-overlay';
  modal.innerHTML = `
    <div class="forum-modal-content" style="background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
      <div class="forum-modal-header" style="border-bottom:none; padding-bottom:0;">
        <span class="forum-modal-title">添加设定</span>
        <button class="forum-modal-close" onclick="closeForumWorldbookSelector()">×</button>
      </div>
      <div class="forum-modal-body" style="padding: 0 16px 16px 16px;">
        <div style="padding:10px; font-size:12px; color:#888; background:rgba(0,0,0,0.03); border-radius:8px; margin: 10px 0;">
          角色专属设定集已自动隐藏，通用设定集均可在此添加。
        </div>
        ${html}
      </div>
    </div>
  `;
  modal.onclick = (e) => { if (e.target === modal) closeForumWorldbookSelector(); };
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('active'), 10);
}

// 关闭世界书选择器
function closeForumWorldbookSelector() {
  const modal = document.getElementById('forumWorldbookSelectorModal');
  if (modal) modal.remove();
}

// 添加世界书绑定 (修复版：确保ID类型一致)
async function addForumWorldbook(worldbookId) {
  closeForumWorldbookSelector();
  
  // 确保 ID 是数字类型 (如果你的系统里 ID 是数字)
  const idToSave = Number(worldbookId);
  
  if (!forumSettings.worldbookIds) {
    forumSettings.worldbookIds = [];
  }
  
  if (!forumSettings.worldbookIds.includes(idToSave)) {
    forumSettings.worldbookIds.push(idToSave);
    
    // 立即保存到数据库
    await localforage.setItem('forumSettings', forumSettings);
    
    // 刷新显示
    const listEl = document.getElementById('forumWorldbookList');
    if (listEl) {
      listEl.innerHTML = renderForumWorldbookBindings();
    }
    
    showToast('世界书已绑定');
  }
}

// 移除世界书绑定 (修复版：强制类型转换)
async function removeForumWorldbook(worldbookId) {
  if (!forumSettings.worldbookIds) return;
  
  // ★★★ 核心修复：将传入的 ID (可能是字符串) 强制转为数字进行比对 ★★★
  const idToRemove = Number(worldbookId);
  
  forumSettings.worldbookIds = forumSettings.worldbookIds.filter(id => Number(id) !== idToRemove);
  
  await localforage.setItem('forumSettings', forumSettings);
  
  // 刷新显示
  const listEl = document.getElementById('forumWorldbookList');
  if (listEl) {
    listEl.innerHTML = renderForumWorldbookBindings();
  }
  
  // 使用新的 toast 提示
  if(typeof showToast === 'function') showToast('已移除该世界书');
}
// 获取论坛需要发送给AI的世界书内容
function getForumWorldbookContent(contextText = '') {
  // 1. 获取两部分 ID (论坛勾选的 + 角色自带的)
  const forumIds = forumSettings.worldbookIds || [];
  const charIds = getCharacterBoundWorldbooks(); 
  
  // 2. 合并并去重
  const allTargetIds = new Set([...forumIds, ...charIds]);
  
  if (allTargetIds.size === 0) return '';
  
  const contentParts = [];
  // ★★★ 修复点：使用新函数获取真实数据 ★★★
  const globalWorldbooks = getGlobalWorldbooks();

  // 3. 遍历去重后的 ID 列表
  allTargetIds.forEach(wbId => {
    const wb = globalWorldbooks.find(w => w.id === Number(wbId) && w.enabled !== false);
    if (!wb || !wb.entries) return;
    
    // 4. 遍历条目
    wb.entries.forEach(entry => {
      if (entry.enabled === false) return;
      
      let shouldInclude = false;
      
      if (wb.triggerType === 'always') {
        shouldInclude = true;
      } 
      else if (wb.triggerType === 'keyword' && entry.keywords && contextText) {
        const keywords = entry.keywords.split(/[,，]/).map(k => k.trim().toLowerCase()).filter(k => k);
        const contextLower = contextText.toLowerCase();
        if (keywords.some(kw => contextLower.includes(kw))) {
          shouldInclude = true;
        }
      }
      
      if (shouldInclude && entry.content) {
        const titlePart = entry.title ? `【设定：${entry.title}】` : '【相关设定】';
        contentParts.push(`${titlePart}\n${entry.content}`);
      }
    });
  });
  
  if (contentParts.length === 0) return '';
  return `\n[世界书/背景设定参考]:\n${contentParts.join('\n\n')}\n`;
}

// 获取角色的完整人设（聊天人设 + 论坛自定义设定）
function getCharacterFullPersona(participant) {
  const charId = participant.charId;
  const char = characters.find(c => String(c.id) === String(charId));
  if (!char) return participant.identity || '';
  
  // 获取聊天设置中的人设
  const settings = chatSettings[charId] || {};
  
  // 合并人设：聊天人设 + 角色描述 + 论坛自定义身份
  const parts = [];
  
  // 1. 角色原始描述/人设
  const originalPersona = settings.persona || char.description || char.persona || '';
  if (originalPersona) {
    parts.push(`【角色基础人设】${originalPersona}`);
  }
  
  // 2. 角色的系统提示词（如果有）
  const systemPrompt = settings.systemPrompt || char.systemPrompt || '';
  if (systemPrompt && systemPrompt !== originalPersona) {
    parts.push(`【角色性格特点】${systemPrompt.substring(0, 200)}`);
  }
  
  // 3. 论坛自定义身份设定
  if (participant.identity) {
    parts.push(`【在论坛中的身份】${participant.identity}`);
  }
  
  // 4. 论坛自定义简介
  if (participant.bio) {
    parts.push(`【个人简介】${participant.bio}`);
  }
  
  return parts.join('\n');
}

// ==================== AI参与者管理 ====================

function openAddForumParticipant() {
  const availableChars = characters.filter(
    (c) => !forumSettings.aiParticipants.find((p) => p.charId === c.id)
  );

  if (availableChars.length === 0) {
    showToast("没有可添加的角色");
    return;
  }

  const html = availableChars
    .map(
      (c) => `
    <div class="forum-char-select-item" onclick="selectForumParticipant('${c.id}')">
      <div class="forum-char-select-avatar">
        ${
          c.avatar
            ? `<img src="${c.avatar}" alt="">`
            : (c.name ? c.name.charAt(0) : "🤖")
        }
      </div>
      <div class="forum-char-select-name">${escapeForumHtml(c.name)}</div>
      <svg class="forum-char-select-arrow" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </div>
  `
    )
    .join("");

  const modal = document.createElement("div");
  modal.id = "forumAddParticipantModal";
  modal.className = "forum-modal-overlay";
  modal.innerHTML = `
    <div class="forum-modal-content">
      <div class="forum-modal-header">
        <span class="forum-modal-title">选择角色</span>
        <button class="forum-modal-close" onclick="closeForumParticipantModal()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="forum-modal-body">
        ${html}
      </div>
    </div>
  `;
  modal.onclick = (e) => {
    if (e.target === modal) closeForumParticipantModal();
  };
  document.body.appendChild(modal);
}

function closeForumParticipantModal() {
  const modal = document.getElementById("forumAddParticipantModal");
  if (modal) modal.remove();
}

async function selectForumParticipant(charId) {
  closeForumParticipantModal();

  const char = characters.find((c) => String(c.id) === String(charId));
  if (!char) return;
  
  showParticipantEditModal(charId, char, null); // null表示新增
}

// 编辑已有的AI参与者
function editForumParticipant(index) {
  const participant = forumSettings.aiParticipants[index];
  if (!participant) return;
  
  const char = characters.find((c) => String(c.id) === String(participant.charId));
  showParticipantEditModal(participant.charId, char, index);
}

// 显示AI参与者编辑弹窗
function showParticipantEditModal(charId, char, editIndex) {
  const isEdit = editIndex !== null;
  const participant = isEdit ? forumSettings.aiParticipants[editIndex] : {};
  const defaultHandle = generateEnglishHandle(participant.nickname || char?.name || '');
  
  // 当前头像：优先自定义头像，否则角色头像
  const currentAvatar = participant.avatar || char?.avatar || '';
  const avatarPreview = currentAvatar 
    ? `<img src="${currentAvatar}" alt="">` 
    : (char?.name ? char.name.charAt(0) : '🤖');
  
  // 背景图
  const currentBanner = participant.banner || '';
  const bannerPreview = currentBanner
    ? `<img src="${currentBanner}" alt="">`
    : '<div class="forum-profile-banner-placeholder"></div>';
  
  const modal = document.createElement("div");
  modal.id = "forumSetIdentityModal";
  modal.className = "forum-modal-overlay";
  modal.innerHTML = `
    <div class="forum-modal-content forum-modal-large">
      <div class="forum-modal-header">
        <span class="forum-modal-title">${isEdit ? '编辑' : '设置'}角色信息</span>
        <button class="forum-modal-close" onclick="document.getElementById('forumSetIdentityModal').remove()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="forum-modal-body" style="padding:16px;max-height:70vh;overflow-y:auto;">
        <!-- 背景图 -->
        <div class="forum-participant-banner-edit" onclick="document.getElementById('forumParticipantBannerInput').click()">
          ${bannerPreview}
          <div class="forum-participant-banner-overlay">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M9.697 3H11v2h-.697l-2 2H5c-.276 0-.5.224-.5.5v11c0 .276.224.5.5.5h14c.276 0 .5-.224.5-.5V10h2v8.5c0 1.381-1.119 2.5-2.5 2.5H5c-1.381 0-2.5-1.119-2.5-2.5v-11C2.5 6.119 3.619 5 5 5h1.697l2-2z"/></svg>
            <span>更换背景</span>
          </div>
        </div>
        <input type="file" id="forumParticipantBannerInput" accept="image/*" style="display:none" onchange="previewForumParticipantBanner(this)">
        <input type="hidden" id="forumParticipantBannerData" value="${currentBanner}">
        
        <div class="forum-identity-char">
          <div class="forum-identity-avatar" id="forumParticipantAvatarPreview" onclick="document.getElementById('forumParticipantAvatarInput').click()">
            ${avatarPreview}
            <div class="forum-avatar-edit-hint">点击更换</div>
          </div>
          <input type="file" id="forumParticipantAvatarInput" accept="image/*" style="display:none" onchange="previewForumParticipantAvatar(this)">
          <input type="hidden" id="forumParticipantAvatarData" value="${currentAvatar}">
          <div class="forum-identity-name">${escapeForumHtml(char?.name || '角色')}</div>
          <div class="forum-identity-hint">原角色名（论坛中可使用不同昵称）</div>
        </div>
        
        <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
          <div class="forum-label">论坛昵称</div>
          <input type="text" class="forum-input" id="forumParticipantNickname" 
            value="${escapeForumHtml(participant.nickname || '')}"
            placeholder="留空则使用角色原名：${char?.name || ''}">
        </div>
        
        <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
          <div class="forum-label">用户名 (Handle)</div>
          <div class="forum-input-with-prefix">
            <span class="forum-input-prefix">@</span>
            <input type="text" class="forum-input forum-input-handle" id="forumParticipantHandle" 
              value="${escapeForumHtml(participant.handle || '')}"
              placeholder="${defaultHandle}">
          </div>
        </div>
        
        <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
          <div class="forum-label">个人简介</div>
          <textarea class="forum-input" id="forumParticipantBio" rows="2"
            placeholder="个性签名或简介">${escapeForumHtml(participant.bio || '')}</textarea>
        </div>
        
        <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
          <div class="forum-label">身份设定</div>
          <textarea class="forum-input" id="forumParticipantIdentity" rows="3"
            placeholder="该角色在论坛的身份，如：资深摸鱼达人、某领域专家...">${escapeForumHtml(participant.identity || '')}</textarea>
        </div>
        
        <div class="forum-profile-editor-field-row">
          <div class="forum-profile-editor-field forum-profile-editor-field-half">
            <label>正在关注</label>
            <input type="text" class="forum-input" id="forumParticipantFollowing" 
              value="${participant.following || ''}" placeholder="如: 32, 1.2K">
          </div>
          <div class="forum-profile-editor-field forum-profile-editor-field-half">
            <label>关注者</label>
            <input type="text" class="forum-input" id="forumParticipantFollowers" 
              value="${participant.followers || ''}" placeholder="如: 96, 10K">
          </div>
        </div>
        
        <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
          <div class="forum-label">加入时间</div>
          <input type="text" class="forum-input" id="forumParticipantJoinDate" 
            value="${escapeForumHtml(participant.joinDate || '')}"
            placeholder="如: 2024年1月">
        </div>
        
        <button class="forum-identity-submit" onclick="confirmAddParticipant('${charId}', ${editIndex})">
          ${isEdit ? '保存修改' : '添加角色'}
        </button>
      </div>
    </div>
  `;
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  document.body.appendChild(modal);
}

// 预览背景图
function previewForumParticipantBanner(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const container = document.querySelector('.forum-participant-banner-edit');
      if (container) {
        const img = container.querySelector('img') || document.createElement('img');
        img.src = e.target.result;
        if (!container.querySelector('img')) {
          container.insertBefore(img, container.firstChild);
          const placeholder = container.querySelector('.forum-profile-banner-placeholder');
          if (placeholder) placeholder.remove();
        }
      }
      const dataInput = document.getElementById('forumParticipantBannerData');
      if (dataInput) {
        dataInput.value = e.target.result;
      }
    };
    reader.readAsDataURL(input.files[0]);
  }
}

// 预览头像
function previewForumParticipantAvatar(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const preview = document.getElementById('forumParticipantAvatarPreview');
      if (preview) {
        preview.innerHTML = `<img src="${e.target.result}" alt=""><div class="forum-avatar-edit-hint">点击更换</div>`;
      }
      const dataInput = document.getElementById('forumParticipantAvatarData');
      if (dataInput) {
        dataInput.value = e.target.result;
      }
    };
    reader.readAsDataURL(input.files[0]);
  }
}

async function confirmAddParticipant(charId, editIndex) {
  const nickname = document.getElementById('forumParticipantNickname')?.value || '';
  const handle = document.getElementById('forumParticipantHandle')?.value || '';
  const identity = document.getElementById('forumParticipantIdentity')?.value || '';
  const avatar = document.getElementById('forumParticipantAvatarData')?.value || '';
  const banner = document.getElementById('forumParticipantBannerData')?.value || '';
  const bio = document.getElementById('forumParticipantBio')?.value || '';
  const following = document.getElementById('forumParticipantFollowing')?.value || '';
  const followers = document.getElementById('forumParticipantFollowers')?.value || '';
  const joinDate = document.getElementById('forumParticipantJoinDate')?.value || '';
  
  document.getElementById('forumSetIdentityModal')?.remove();
  
  const participantData = {
    charId,
    nickname: nickname,
    handle: handle,
    identity: identity,
    avatar: avatar,
    banner: banner,
    bio: bio,
    following: following,
    followers: followers,
    joinDate: joinDate,
  };
  
  if (editIndex !== null && editIndex >= 0) {
    // 编辑模式
    forumSettings.aiParticipants[editIndex] = participantData;
    showToast('已保存修改');
  } else {
    // 新增模式
    forumSettings.aiParticipants.push(participantData);
    showToast('角色已添加');
  }

  await localforage.setItem("forumSettings", forumSettings);
  renderForumSettings();
}

async function removeForumParticipant(index) {
  forumSettings.aiParticipants.splice(index, 1);
  await localforage.setItem("forumSettings", forumSettings);
  renderForumSettings();
}

// ==================== NPC管理 ====================

function openAddForumNpc() {
  showNpcEditModal(null);
}

function editForumNpc(index) {
  showNpcEditModal(index);
}

function showNpcEditModal(editIndex) {
  const isEdit = editIndex !== null;
  const npc = isEdit ? (forumSettings.npcs || [])[editIndex] : {};
  
  const avatarPreview = npc.avatar 
    ? `<img src="${npc.avatar}" alt="">` 
    : (npc.name ? npc.name.charAt(0) : '👤');
  
  const modal = document.createElement("div");
  modal.id = "forumNpcModal";
  modal.className = "forum-modal-overlay";
  modal.innerHTML = `
    <div class="forum-modal-content forum-modal-large">
      <div class="forum-modal-header">
        <span class="forum-modal-title">${isEdit ? '编辑' : '添加'}NPC</span>
        <button class="forum-modal-close" onclick="document.getElementById('forumNpcModal').remove()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="forum-modal-body" style="padding:16px;max-height:70vh;overflow-y:auto;">
        <!-- 背景图 -->
        <div class="forum-participant-banner-edit" onclick="document.getElementById('forumNpcBannerInput').click()">
          ${npc.banner ? `<img src="${npc.banner}" alt="">` : '<div class="forum-profile-banner-placeholder"></div>'}
          <div class="forum-participant-banner-overlay">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M9.697 3H11v2h-.697l-2 2H5c-.276 0-.5.224-.5.5v11c0 .276.224.5.5.5h14c.276 0 .5-.224.5-.5V10h2v8.5c0 1.381-1.119 2.5-2.5 2.5H5c-1.381 0-2.5-1.119-2.5-2.5v-11C2.5 6.119 3.619 5 5 5h1.697l2-2z"/></svg>
            <span>更换背景</span>
          </div>
        </div>
        <input type="file" id="forumNpcBannerInput" accept="image/*" style="display:none" onchange="previewForumNpcBanner(this)">
        <input type="hidden" id="forumNpcBannerData" value="${npc.banner || ''}">
        
        <div class="forum-identity-char">
          <div class="forum-identity-avatar forum-npc-avatar" id="forumNpcAvatarPreview" onclick="document.getElementById('forumNpcAvatarInput').click()">
            ${avatarPreview}
            <div class="forum-avatar-edit-hint">点击上传</div>
          </div>
          <input type="file" id="forumNpcAvatarInput" accept="image/*" style="display:none" onchange="previewForumNpcAvatar(this)">
          <input type="hidden" id="forumNpcAvatarData" value="${npc.avatar || ''}">
        </div>
        
        <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
          <div class="forum-label">NPC昵称 <span class="forum-required">*</span></div>
          <input type="text" class="forum-input" id="forumNpcName" 
            value="${escapeForumHtml(npc.name || '')}"
            placeholder="如：路人甲、热心市民、吃瓜群众...">
        </div>
        
        <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
          <div class="forum-label">用户名 (Handle)</div>
          <div class="forum-input-with-prefix">
            <span class="forum-input-prefix">@</span>
            <input type="text" class="forum-input forum-input-handle" id="forumNpcHandle" 
              value="${escapeForumHtml(npc.handle || '')}"
              placeholder="英文用户名，如 CuriousCat_99">
          </div>
        </div>
        
        <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
          <div class="forum-label">个人简介</div>
          <textarea class="forum-input" id="forumNpcBio" rows="2"
            placeholder="个性签名或简介">${escapeForumHtml(npc.bio || '')}</textarea>
        </div>
        
        <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
          <div class="forum-label">身份设定</div>
          <textarea class="forum-input" id="forumNpcIdentity" rows="2"
            placeholder="这个NPC的背景身份">${escapeForumHtml(npc.identity || '')}</textarea>
        </div>
        
        <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
          <div class="forum-label">性格特点</div>
          <textarea class="forum-input" id="forumNpcPersona" rows="2"
            placeholder="这个NPC的性格和说话风格">${escapeForumHtml(npc.persona || '')}</textarea>
        </div>
        
        <div class="forum-profile-editor-field-row">
          <div class="forum-profile-editor-field forum-profile-editor-field-half">
            <label>正在关注</label>
            <input type="text" class="forum-input" id="forumNpcFollowing" 
              value="${npc.following || ''}" placeholder="如: 32, 1.2K">
          </div>
          <div class="forum-profile-editor-field forum-profile-editor-field-half">
            <label>关注者</label>
            <input type="text" class="forum-input" id="forumNpcFollowers" 
              value="${npc.followers || ''}" placeholder="如: 96, 10K">
          </div>
        </div>
        
        <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
          <div class="forum-label">加入时间</div>
          <input type="text" class="forum-input" id="forumNpcJoinDate" 
            value="${escapeForumHtml(npc.joinDate || '')}"
            placeholder="如: 2024年1月">
        </div>
        
        <button class="forum-identity-submit" onclick="confirmSaveNpc(${editIndex})">
          ${isEdit ? '保存修改' : '添加NPC'}
        </button>
      </div>
    </div>
  `;
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  document.body.appendChild(modal);
}

function previewForumNpcAvatar(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const preview = document.getElementById('forumNpcAvatarPreview');
      if (preview) {
        preview.innerHTML = `<img src="${e.target.result}" alt=""><div class="forum-avatar-edit-hint">点击更换</div>`;
      }
      const dataInput = document.getElementById('forumNpcAvatarData');
      if (dataInput) {
        dataInput.value = e.target.result;
      }
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function previewForumNpcBanner(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const container = document.querySelector('#forumNpcModal .forum-participant-banner-edit');
      if (container) {
        const img = container.querySelector('img') || document.createElement('img');
        img.src = e.target.result;
        if (!container.querySelector('img')) {
          container.insertBefore(img, container.firstChild);
          const placeholder = container.querySelector('.forum-profile-banner-placeholder');
          if (placeholder) placeholder.remove();
        }
      }
      const dataInput = document.getElementById('forumNpcBannerData');
      if (dataInput) {
        dataInput.value = e.target.result;
      }
    };
    reader.readAsDataURL(input.files[0]);
  }
}

async function confirmSaveNpc(editIndex) {
  const name = document.getElementById('forumNpcName')?.value?.trim() || '';
  const handle = document.getElementById('forumNpcHandle')?.value?.trim() || '';
  const identity = document.getElementById('forumNpcIdentity')?.value || '';
  const persona = document.getElementById('forumNpcPersona')?.value || '';
  const avatar = document.getElementById('forumNpcAvatarData')?.value || '';
  const banner = document.getElementById('forumNpcBannerData')?.value || '';
  const bio = document.getElementById('forumNpcBio')?.value || '';
  const following = document.getElementById('forumNpcFollowing')?.value || '';
  const followers = document.getElementById('forumNpcFollowers')?.value || '';
  const joinDate = document.getElementById('forumNpcJoinDate')?.value || '';
  
  if (!name) {
    showToast('请输入NPC昵称');
    return;
  }
  
  document.getElementById('forumNpcModal')?.remove();
  
  if (!forumSettings.npcs) forumSettings.npcs = [];
  
  const npcData = {
    id: editIndex !== null ? forumSettings.npcs[editIndex].id : Date.now(),
    name,
    handle: handle || generateEnglishHandle(name),
    identity,
    persona,
    avatar,
    banner,
    bio,
    following,
    followers,
    joinDate,
  };
  
  if (editIndex !== null && editIndex >= 0) {
    forumSettings.npcs[editIndex] = npcData;
    showToast('已保存修改');
  } else {
    forumSettings.npcs.push(npcData);
    showToast('NPC已添加');
  }

  await localforage.setItem("forumSettings", forumSettings);
  renderForumSettings();
}

async function removeForumNpc(index) {
  if (!forumSettings.npcs) return;
  forumSettings.npcs.splice(index, 1);
  await localforage.setItem("forumSettings", forumSettings);
  renderForumSettings();
}

// ==================== 关系管理 ====================

function openAddForumRelationship() {
  showRelationshipEditModal(null);
}

function editForumRelationship(index) {
  showRelationshipEditModal(index);
}

function showRelationshipEditModal(editIndex) {
  const isEdit = editIndex !== null;
  const rel = isEdit ? (forumSettings.relationships || [])[editIndex] : {};
  
  // 构建人物选项
  const personOptions = getForumPersonOptions();
  
  const person1Value = isEdit ? `${rel.person1Type}:${rel.person1Id}` : '';
  const person2Value = isEdit ? `${rel.person2Type}:${rel.person2Id}` : '';
  
  const modal = document.createElement("div");
  modal.id = "forumRelationshipModal";
  modal.className = "forum-modal-overlay";
  modal.innerHTML = `
    <div class="forum-modal-content">
      <div class="forum-modal-header">
        <span class="forum-modal-title">${isEdit ? '编辑' : '添加'}关系</span>
        <button class="forum-modal-close" onclick="document.getElementById('forumRelationshipModal').remove()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="forum-modal-body" style="padding:16px;">
        <div class="forum-relationship-form">
          <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
            <div class="forum-label">人物1</div>
            <select class="forum-input forum-select" id="forumRelPerson1">
              <option value="">请选择...</option>
              ${personOptions}
            </select>
          </div>
          
          <div class="forum-relationship-connector">
            <div class="forum-relationship-line"></div>
            <div class="forum-relationship-icon">↔</div>
            <div class="forum-relationship-line"></div>
          </div>
          
          <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
            <div class="forum-label">人物2</div>
            <select class="forum-input forum-select" id="forumRelPerson2">
              <option value="">请选择...</option>
              ${personOptions}
            </select>
          </div>
        </div>
        
        <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
          <div class="forum-label">关系类型</div>
          <input type="text" class="forum-input" id="forumRelType" 
            value="${escapeForumHtml(rel.relationship || '')}"
            placeholder="如：好友、情侣、死对头、师徒、暗恋...">
        </div>
        
        <div class="forum-item" style="padding:0;border:none;margin-bottom:16px;">
          <div class="forum-label">关系描述</div>
          <textarea class="forum-input" id="forumRelDesc" rows="3"
            placeholder="详细描述这段关系，会影响他们在论坛中的互动方式...">${escapeForumHtml(rel.description || '')}</textarea>
        </div>
        
        <button class="forum-identity-submit" onclick="confirmSaveRelationship(${editIndex})">
          ${isEdit ? '保存修改' : '添加关系'}
        </button>
      </div>
    </div>
  `;
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  document.body.appendChild(modal);
  
  // 设置默认值
  if (isEdit) {
    setTimeout(() => {
      const select1 = document.getElementById('forumRelPerson1');
      const select2 = document.getElementById('forumRelPerson2');
      if (select1) select1.value = person1Value;
      if (select2) select2.value = person2Value;
    }, 0);
  }
}

function getForumPersonOptions() {
  let options = '';
  
  // 用户
  const userName = forumSettings.userNickname || '用户(我)';
  options += `<option value="user:user">👤 ${escapeForumHtml(userName)}</option>`;
  
  // AI角色
  if (forumSettings.aiParticipants.length > 0) {
    options += '<optgroup label="AI角色">';
    forumSettings.aiParticipants.forEach(p => {
      const char = characters.find(c => String(c.id) === String(p.charId));
      const name = p.nickname || char?.name || '未知';
      options += `<option value="ai:${p.charId}">🤖 ${escapeForumHtml(name)}</option>`;
    });
    options += '</optgroup>';
  }
  
  // NPC
  if (forumSettings.npcs && forumSettings.npcs.length > 0) {
    options += '<optgroup label="NPC">';
    forumSettings.npcs.forEach(npc => {
      options += `<option value="npc:${npc.id}">👥 ${escapeForumHtml(npc.name)}</option>`;
    });
    options += '</optgroup>';
  }
  
  return options;
}

async function confirmSaveRelationship(editIndex) {
  const person1 = document.getElementById('forumRelPerson1')?.value || '';
  const person2 = document.getElementById('forumRelPerson2')?.value || '';
  const relType = document.getElementById('forumRelType')?.value?.trim() || '';
  const relDesc = document.getElementById('forumRelDesc')?.value || '';
  
  if (!person1 || !person2) {
    showToast('请选择两个人物');
    return;
  }
  
  if (person1 === person2) {
    showToast('不能选择同一个人物');
    return;
  }
  
  if (!relType) {
    showToast('请输入关系类型');
    return;
  }
  
  document.getElementById('forumRelationshipModal')?.remove();
  
  const [type1, id1] = person1.split(':');
  const [type2, id2] = person2.split(':');
  
  if (!forumSettings.relationships) forumSettings.relationships = [];
  
  const relData = {
    id: editIndex !== null ? forumSettings.relationships[editIndex].id : Date.now(),
    person1Type: type1,
    person1Id: id1,
    person2Type: type2,
    person2Id: id2,
    relationship: relType,
    description: relDesc,
  };
  
  if (editIndex !== null && editIndex >= 0) {
    forumSettings.relationships[editIndex] = relData;
    showToast('已保存修改');
  } else {
    forumSettings.relationships.push(relData);
    showToast('关系已添加');
  }

  await localforage.setItem("forumSettings", forumSettings);
  renderForumSettings();
}

async function removeForumRelationship(index) {
  if (!forumSettings.relationships) return;
  forumSettings.relationships.splice(index, 1);
  await localforage.setItem("forumSettings", forumSettings);
  renderForumSettings();
}

// ==================== 发帖 ====================

// 发帖时的图片数据
let forumComposeImages = [];

function openForumCompose() {
  forumComposeImages = []; // 重置图片
  const overlay = document.getElementById("forumComposeOverlay");
  if (overlay) {
    overlay.classList.add("active");
    // 兼容旧版HTML（有forumComposeAuthor元素）和新版HTML（有forumComposeUserInfo元素）
    if (document.getElementById("forumComposeAuthor")) {
      renderForumComposeAuthor();
    } else if (document.getElementById("forumComposeUserInfo")) {
      renderForumComposeUserInfo();
    }
    renderComposeImages();
    const textarea = document.getElementById("forumComposeTextarea");
    if (textarea) {
      textarea.value = "";
      textarea.focus();
    }
  }
}

function closeForumCompose() {
  const overlay = document.getElementById("forumComposeOverlay");
  if (overlay) {
    overlay.classList.remove("active");
  }
  forumComposeImages = [];
}

// 旧版：渲染发帖作者选择器（兼容旧HTML）
function renderForumComposeAuthor() {
  const container = document.getElementById("forumComposeAuthor");
  if (!container) return;

  const globalAvatar = localStorage.getItem("avatarImg");
  const avatarHtml = globalAvatar ? `<img src="${globalAvatar}" alt="">` : getDefaultAvatar();
  const userName = forumSettings.userNickname || "我";

  container.innerHTML = `
    <div class="forum-compose-avatar">${avatarHtml}</div>
    <div class="forum-compose-name">${escapeForumHtml(userName)}</div>
  `;
  // 移除点击事件（不再支持选择发帖人）
  container.onclick = null;
  container.style.cursor = 'default';
}

// 新版：渲染用户信息（不可点击）
function renderForumComposeUserInfo() {
  const container = document.getElementById("forumComposeUserInfo");
  if (!container) return;

  const globalAvatar = localStorage.getItem("avatarImg");
  const avatarHtml = globalAvatar ? `<img src="${globalAvatar}" alt="">` : getDefaultAvatar();
  const userName = forumSettings.userNickname || "我";
  const userHandle = forumSettings.userHandle || generateEnglishHandle(userName);

  container.innerHTML = `
    <div class="forum-compose-avatar">${avatarHtml}</div>
    <div class="forum-compose-user-text">
      <div class="forum-compose-name">${escapeForumHtml(userName)}</div>
      <div class="forum-compose-handle">@${escapeForumHtml(userHandle)}</div>
    </div>
  `;
}
// --- forum_app.js ---

// 处理图片上传 (修改版：集成图片压缩)
function handleComposeImageUpload(input) {
  if (!input || !input.files || input.files.length === 0) return;
  
  Array.from(input.files).forEach(file => {
    if (forumComposeImages.length >= 4) {
      showToast('最多只能添加4张图片');
      return;
    }
    
    // 简单的文件类型检查
    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件');
        return;
    }

    const reader = new FileReader();
    
    // ★ 注意这里加了 async
    reader.onload = async (e) => {
      let finalData = e.target.result;

      // ★★★ 核心逻辑：尝试调用主程序的压缩函数 ★★★
      if (typeof window.compressImageProcess === 'function') {
          // 只有大于 500KB 的图片才压缩，太小的没必要（可选策略）
          if (finalData.length > 500 * 1024) {
              try {
                  // 显示个提示，因为压缩需要几百毫秒
                  if (typeof showToast === 'function') showToast('正在压缩图片...');
                  
                  // 等待压缩完成
                  const compressedData = await window.compressImageProcess(finalData);
                  
                  // 如果压缩后确实变小了，就用压缩后的；否则用原图
                  if (compressedData.length < finalData.length) {
                      finalData = compressedData;
                      console.log(`[论坛] 图片已压缩: ${(compressedData.length/1024).toFixed(0)}KB`);
                  }
              } catch (err) {
                  console.warn("[论坛] 压缩失败，将使用原图:", err);
              }
          }
      }

      forumComposeImages.push({
        type: 'real',
        data: finalData
      });
      renderComposeImages();
    };
    reader.readAsDataURL(file);
  });
  
  input.value = ''; // 重置input
}

// 插入图片描述占位符
function insertImagePlaceholder() {
  const textarea = document.getElementById("forumComposeTextarea");
  if (!textarea) return;
  
  const placeholder = "[图片:在这里描述图片内容]";
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  
  textarea.value = text.substring(0, start) + placeholder + text.substring(end);
  textarea.focus();
  // 选中描述部分方便用户修改
  textarea.setSelectionRange(start + 4, start + placeholder.length - 1);
}

// 渲染已添加的图片
function renderComposeImages() {
  const container = document.getElementById("forumComposeImages");
  if (!container) return;
  
  if (forumComposeImages.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = forumComposeImages.map((img, idx) => `
    <div class="forum-compose-image-item">
      <img src="${img.data}" alt="">
      <button class="forum-compose-image-remove" onclick="removeComposeImage(${idx})">×</button>
    </div>
  `).join('');
}

// 移除图片
function removeComposeImage(index) {
  forumComposeImages.splice(index, 1);
  renderComposeImages();
}

function showForumAuthorPicker() {
  const globalAvatar = localStorage.getItem("avatarImg");
  const options = [{ 
    type: "user", 
    name: forumSettings.userNickname || "我",
    avatar: globalAvatar || null
  }];

  forumSettings.aiParticipants.forEach((p) => {
    const char = characters.find((c) => String(c.id) === String(p.charId));
    options.push({
      type: "ai",
      charId: p.charId,
      name: p.nickname || char?.name || "角色",
      avatar: p.avatar || char?.avatar || null
    });
  });

  const html = options
    .map(
      (opt, i) => {
        const avatarHtml = opt.avatar 
          ? `<img src="${opt.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">` 
          : (opt.type === 'user' ? '👤' : '🤖');
        const isSelected = forumComposeAuthor.type === opt.type && 
          (opt.type === 'user' || String(forumComposeAuthor.charId) === String(opt.charId));
        return `
    <div class="forum-author-option" onclick="selectForumComposeAuthor(${i})">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;border-radius:50%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;overflow:hidden;">${avatarHtml}</div>
        <span>${escapeForumHtml(opt.name)}</span>
      </div>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#f48fb1" stroke-width="2" style="opacity:${isSelected ? '1' : '0'}">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
  `;
      }
    )
    .join("");

  const modal = document.createElement("div");
  modal.id = "forumAuthorPickerModal";
  modal.className = "forum-author-picker-modal";
  modal.innerHTML = `
    <div class="forum-author-picker">
      <div class="forum-author-picker-header">
        <span>选择发帖身份</span>
        <button onclick="closeForumAuthorPicker()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="forum-author-picker-list">
        ${html}
      </div>
    </div>
  `;
  modal.onclick = (e) => {
    if (e.target === modal) closeForumAuthorPicker();
  };
  document.body.appendChild(modal);

  window.forumAuthorOptions = options;
}

function closeForumAuthorPicker() {
  const modal = document.getElementById("forumAuthorPickerModal");
  if (modal) modal.remove();
}

function selectForumComposeAuthor(index) {
  const opt = window.forumAuthorOptions[index];
  forumComposeAuthor = opt;
  closeForumAuthorPicker();
  // 旧函数已移除，这里不再需要调用
}

async function submitForumPost() {
  const textarea = document.getElementById("forumComposeTextarea");
  const content = textarea?.value?.trim();

  if (!content && forumComposeImages.length === 0) {
    showToast("请输入内容或添加图片");
    return;
  }

  // 用户发帖
  const authorType = "user";
  const authorName = forumSettings.userNickname || "我";
  const authorAvatar = localStorage.getItem("avatarImg") || "";
  const authorIdentity = forumSettings.userIdentity || "";
  const userHandle = forumSettings.userHandle || generateEnglishHandle(authorName);

  // 构建帖子内容（包含图片）
  let fullContent = content || "";
  
  // 添加真实图片数据
  const images = forumComposeImages.map(img => img.data);

  const newPost = {
    id: Date.now(),
    authorType,
    authorId: null,
    authorName,
    authorAvatar,
    authorIdentity,
    handle: userHandle,
    content: fullContent,
    images: images, // 真实图片数组
    timestamp: Date.now(),
    likes: 0,
    liked: false,
    retweets: 0,
    views: 0,
    comments: [],
  };

  forumPosts.unshift(newPost);
  await localforage.setItem("forumPosts", forumPosts);

  closeForumCompose();
  renderForumFeed();
  showToast("发布成功");
  
  // 更新粉丝数量
  await updateUserFollowers('post');
  
  // 自动生成评论和互动数据
  generateInteractionsForNewPost(newPost.id);
}

// 生成新帖子的互动数据 (防单一 AI 角色刷屏 + 强制丰富随机 NPC 比例版)
async function generateInteractionsForNewPost(postId) {
  const post = forumPosts.find((p) => p.id === postId);
  if (!post) return;

  const apiConfig = getActiveApiConfig();
  if (!apiConfig || !apiConfig.url || !apiConfig.key) {
    post.views = Math.floor(Math.random() * 500) + 50;
    post.likes = Math.floor(Math.random() * 30) + 5;
    post.retweets = Math.floor(Math.random() * 10);
    await localforage.setItem("forumPosts", forumPosts);
    renderForumFeed();
    return;
  }

  try {
    // 1. 收集 AI 参与者信息 (包含完整人设)
    const participants = forumSettings.aiParticipants.map((p) => {
      const char = characters.find((c) => String(c.id) === String(p.charId));
      const settings = chatSettings[p.charId] || {};
      return {
        name: p.nickname || settings.charName || char?.name || "角色",
        handle: p.handle || generateEnglishHandle(p.nickname || char?.name || ''),
        identity: p.identity || "",
        persona: settings.persona || char?.persona || getCharacterFullPersona(p),
      };
    });

    // 2. 收集 NPC 信息
    const npcs = (forumSettings.npcs || []).map(npc => ({
      name: npc.name,
      handle: npc.handle || generateEnglishHandle(npc.name),
      identity: npc.identity || "",
      persona: npc.persona || "",
    }));

    // 3. 收集人物关系
    const relationships = (forumSettings.relationships || []).map(rel => {
      const person1 = getForumPersonName(rel.person1Type, rel.person1Id);
      const person2 = getForumPersonName(rel.person2Type, rel.person2Id);
      return `${person1} 和 ${person2} 的关系：${rel.relationship}${rel.description ? '（' + rel.description + '）' : ''}`;
    });

    // 4. 构建图片描述
    let imageDesc = "";
    if (post.images && post.images.length > 0) {
      imageDesc = `\n【帖子包含${post.images.length}张图片】`;
    }
    
    // 5. 构建转发信息
    let retweetInfo = "";
    if (post.isRetweet && post.originalPost) {
      const orig = post.originalPost;
      retweetInfo = `\n【这是一条转发帖】\n原帖作者：${orig.authorName}\n原帖内容：${orig.content || '无文字内容'}\n${orig.images && orig.images.length > 0 ? `原帖包含${orig.images.length}张图片` : ''}\n用户转发时说：${post.content || '（未添加评论）'}`;
    }

    // ============================================================
    // ★★★ 核心重构：Prompt 重组，永久注入“随机路人”机制 ★★★
    // ============================================================
    let systemPrompt = `你是一个论坛互动生成器。请根据以下设定为帖子生成评论和互动数据。

【世界观】
${forumSettings.worldview}

【用户信息】
- 昵称：${post.authorName}
- 身份：${forumSettings.userIdentity || "普通用户"}

【帖子内容】${post.content}${imageDesc}${retweetInfo}

【AI角色】（在评论区中属于少数，仅发表 1~2 条高含金量回复，必须严格符合人设）
${participants.length > 0 
  ? participants.map((p, i) => 
      `${i + 1}. ${p.name}（@${p.handle}）：${p.identity || '未设置身份'}${p.persona ? '，性格/人设：' + p.persona.substring(0, 100) : ''}`
    ).join("\n")
  : "无"}`;

    // 无论后台有没有添加固定 NPC，都融合“随机匿名网友”，保证路人数量充沛
    systemPrompt += `\n\n【论坛网民群体（必需，用于活跃气氛）】`;
    if (npcs.length > 0) {
      systemPrompt += `\n1. 【已注册的固定NPC（优先使用）】:\n${npcs.map((n, i) => `  - ${n.name}（@${n.handle}）：${n.identity || '普通网友'}`).join("\n")}`;
    }
    systemPrompt += `\n2. 【随机匿名路人网友（必需，大量生成）】:\n请你自由发挥，扮演 8-15 个各种不同网名、不同背景和说话风格的普通路人网友（例如：“酸汤肥牛”、“夜航船”、“别整天做梦了”、“椰椰椰椰子”、“咸鱼突刺”等逼真且生活化的网名，禁止直接提取示例），参与回帖讨论。`;

    if (relationships.length > 0) {
      systemPrompt += `\n\n【人物关系】评论时体现这些关系\n${relationships.join("\n")}`;
    }

    const messages = [{ role: "system", content: systemPrompt }];
    let userContent = [];
    
    if (post.images && post.images.length > 0) {
      post.images.forEach(imgData => {
        userContent.push({
          type: "image_url",
          image_url: { url: imgData }
        });
      });
    }
    
    userContent.push({
      type: "text",
      text: `请为这条帖子生成互动数据，返回纯JSON对象：
{
  "views": 浏览量(根据用户身份和帖子内容，范围100-5000),
  "likes": 点赞数(范围10-200),
  "retweets": 转发数(范围0-50),
  "comments": [
    {
      "authorType": "ai或npc",
      "authorName": "昵称",
      "handle": "英文用户名",
      "content": "评论内容",
      "likes": 点赞数0-20,
      "replyTo": null或被回复评论在当前数组中的tempIdx(从1开始的序号),
      "replyToName": null或被回复者的【中文昵称】
    }
  ]
}
要求：
1. 根据用户的身份地位合理生成互动数据（身份越高，互动越多）
2. 如果帖子有图片，评论者应该能看到并评论图片内容
3. 请生成 10-20 条评论，让互动看起来热闹一些
4. **评论区人员结构（极其重要）：**
   - **必须有 70% 以上的评论来自“固定NPC”或“随机匿名网友”**，展现出公共论坛该有的热闹围观、闲聊、吃瓜等百家争鸣生态。
   - AI 角色（如“时屿”）在整篇评论区中是“稀缺嘉宾”，他们最多只能发表 1~2 条独立评论。绝对不许出现满篇都是 AI 角色在单机自言自语刷屏的情况。
5. authorType只能是"ai"或"npc"。如果是 "npc"，优先使用已注册的固定NPC，不足的配额必须全部用自由创造的随机匿名网友填满。
6. 评论要自然、符合世界观和角色性格
7. 禁止使用[爱心][笑哭][开心]等方括号表情格式，必须直接使用emoji如❤️😂😊等
8. 如果是转发帖，评论应该针对原帖内容或用户的转发评论
9. 【回复格式与规范】：
   - 评论内容（content字段）必须纯净！**绝对不要**在 content 中包含“回复@xxx：”或“回复 xxx”等前缀。
   - 如果有回复关系，请使用 \`replyTo\` 设为对方在数组中的序号（从1开始），并将 \`replyToName\` 设为对方的**【中文昵称】**（绝对不要写英文handle）。
   - **绝对不要**让任何评论回复用户（楼主/我），因为用户在此贴下还没有发表过评论。`
    });

    messages.push({ role: "user", content: userContent });

    const response = await fetch(`${apiConfig.url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiConfig.key}`,
      },
      body: JSON.stringify({
        model: apiConfig.model || "gpt-3.5-turbo",
        messages: messages,
        temperature: 0.9,
        max_tokens: parseInt(document.getElementById('apiMaxTokens')?.value) || 4096, 
      }),
    });

    if (!response.ok) throw new Error("API请求失败");

    const data = await response.json();
    let content = data.choices[0]?.message?.content || "";

    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      
      post.views = result.views || Math.floor(Math.random() * 500) + 50;
      post.likes = result.likes || Math.floor(Math.random() * 30) + 5;
      post.retweets = result.retweets || Math.floor(Math.random() * 10);

      if (result.comments && Array.isArray(result.comments)) {
        const resolved = mapAndResolveComments(result.comments, post);
        post.comments = [...(post.comments || []), ...resolved];
      }

      await localforage.setItem("forumPosts", forumPosts);
      renderForumFeed();
    }
  } catch (e) {
    console.error("[论坛] 生成互动失败:", e);
    post.views = Math.floor(Math.random() * 500) + 50;
    post.likes = Math.floor(Math.random() * 30) + 5;
    post.retweets = Math.floor(Math.random() * 10);
    await localforage.setItem("forumPosts", forumPosts);
    renderForumFeed();
  }
}

// 保留旧函数名兼容
async function generateCommentsForNewPost(postId) {
  return generateInteractionsForNewPost(postId);
}

// ==================== 评论 ====================

// 设置回复目标
function replyToForumComment(postId, commentId, authorName) {
  forumReplyTarget = { commentId, authorName };
  const input = document.getElementById("forumCommentInput");
  if (input) {
    input.placeholder = `回复 @${authorName}...`;
    input.focus();
  }
}

// 取消回复
function cancelForumReply() {
  forumReplyTarget = null;
  const input = document.getElementById("forumCommentInput");
  if (input) {
    input.placeholder = "写评论...";
  }
}

async function submitForumComment() {
  if (!currentForumPostId) return;

  const input = document.getElementById("forumCommentInput");
  const content = input?.value?.trim();

  if (!content) return;

  const post = forumPosts.find((p) => p.id === currentForumPostId);
  if (!post) return;

  if (!post.comments) post.comments = [];

  // 生成新的评论ID
  const maxId = post.comments.reduce((max, c) => Math.max(max, c.id || 0), 0);

  const newComment = {
    id: maxId + 1,
    authorType: "user",
    authorName: forumSettings.userNickname || "我",
    authorAvatar: localStorage.getItem("avatarImg") || "",
    content,
    replyTo: forumReplyTarget?.commentId || null,
    replyToName: forumReplyTarget?.authorName || null,
    timestamp: Date.now(),
    likes: 0,
    liked: false,
  };

  post.comments.push(newComment);
  await localforage.setItem("forumPosts", forumPosts);

  input.value = "";
  cancelForumReply(); // 重置回复状态
  renderForumPostDetail();
  
  // 更新粉丝数量
  await updateUserFollowers('comment');

  // 触发AI回复
  generateForumCommentReply(currentForumPostId, newComment);
}


// ==================== 修复：点赞无刷新更新 ====================
async function toggleForumPostLike(postId) {
  // 1. 更新内存数据
  const post = forumPosts.find((p) => Number(p.id) === Number(postId));
  if (!post) return;

  post.liked = !post.liked;
  post.likes = (post.likes || 0) + (post.liked ? 1 : -1);

  // 2. 异步保存到数据库（不阻塞UI）
  localforage.setItem("forumPosts", forumPosts);

  // 3. ★★★ 核心修复：直接操作DOM，而不是重新渲染整个页面 ★★★
  
  // 查找所有关联这个帖子ID的点赞按钮（可能在列表中，也可能在详情页中）
  // 这里的选择器逻辑是查找所有 onclick 包含该 ID 的 .forum-action 元素
  const likeBtns = document.querySelectorAll(`.forum-action[onclick*="toggleForumPostLike(${postId})"], .forum-detail-action[onclick*="toggleForumPostLike(${postId})"]`);

  likeBtns.forEach(btn => {
    const svg = btn.querySelector('svg');
    const span = btn.querySelector('span'); // 列表页有数字，详情页没数字span(在外面)

    // 切换 liked 类（处理颜色）
    if (post.liked) {
      btn.classList.add('liked');
      if (svg) svg.setAttribute('fill', 'currentColor');
    } else {
      btn.classList.remove('liked');
      if (svg) svg.setAttribute('fill', 'none');
    }

    // 更新数字 (仅针对列表页结构)
    if (span) {
      span.innerText = post.likes;
    } else {
      // 详情页结构不一样，数字是分开的，或者是详情页底部的统计
      // 如果是在详情页，我们刷新一下详情区域的数据即可，不用刷新整个APP
      const detailStats = document.querySelector('.forum-detail-stats');
      if (detailStats && currentForumPostId === Number(postId)) {
         // 简单粗暴：如果正在看这个帖子的详情，重新渲染详情部分
         renderForumPostDetail(); 
      }
    }
  });

  // 注意：删除了原来的 smartRenderCurrentPage() 调用
  // 这样就不会导致热点/搜索页面被强制刷新重置了
}

async function toggleForumCommentLike(postId, commentId) {
  const post = forumPosts.find((p) => Number(p.id) === Number(postId));
  if (!post) return;

  const comment = post.comments?.find((c) => Number(c.id) === Number(commentId));
  if (!comment) return;

  comment.liked = !comment.liked;
  comment.likes = (comment.likes || 0) + (comment.liked ? 1 : -1);

  await localforage.setItem("forumPosts", forumPosts);

  // ★★★ DOM 操作替换重绘 ★★★
  // 找到对应的评论DOM
  const commentDiv = document.querySelector(`.forum-comment[data-comment-id="${commentId}"]`);
  if (commentDiv) {
      const likeAction = commentDiv.querySelector(`.forum-comment-action[onclick*="toggleForumCommentLike"]`);
      if (likeAction) {
          const svg = likeAction.querySelector('svg');
          const span = likeAction.querySelector('span');
          
          if (comment.liked) {
              likeAction.classList.add('liked');
              if(svg) svg.setAttribute('fill', 'currentColor');
          } else {
              likeAction.classList.remove('liked');
              if(svg) svg.setAttribute('fill', 'none');
          }
          if(span) span.innerText = comment.likes;
      }
  } else {
      // 如果找不到DOM（极少情况），才回退到重绘
      renderForumPostDetail();
  }
}

// 生成论坛帖子 (完整版：包含关注页过滤 + 原版强力解析逻辑)
async function generateForumPosts() {
  if (!forumSettings.worldview) {
    showToast("请先设置世界观");
    openForumSettings();
    return;
  }

  const apiConfig = getActiveApiConfig();
  if (!apiConfig || !apiConfig.url || !apiConfig.key) {
    showToast("请先配置API");
    return;
  }

  // 刷新按钮开始旋转
  const refreshBtn = document.querySelector(".forum-refresh-btn");
  if (refreshBtn) refreshBtn.classList.add("spinning");

  try {
    const worldbookContent = getForumWorldbookContent(forumSettings.worldview);

    // ============================================================
    // ★★★ 新增：判断是否在关注页刷新 ★★★
    // ============================================================
    const isFollowingTab = (currentForumTab === 'following');
    const followed = forumSettings.followedUsers || [];
    
    // 1. 准备 AI 角色列表 (带ID以便过滤)
    let participants = forumSettings.aiParticipants.map((p) => {
      const char = characters.find((c) => String(c.id) === String(p.charId));
      const settings = chatSettings[p.charId] || {};
      return {
        id: String(p.charId), // ★ 记下ID用于比对
        name: p.nickname || settings.charName || char?.name || "角色",
        handle: p.handle || generateEnglishHandle(p.nickname || char?.name || ''),
        identity: p.identity || "",
        fullPersona: getCharacterFullPersona(p),
      };
    });

    // 2. 准备 NPC 列表 (带ID以便过滤)
    let npcs = (forumSettings.npcs || []).map(npc => ({
      id: String(npc.id), // ★ 记下ID用于比对
      name: npc.name,
      handle: npc.handle || generateEnglishHandle(npc.name),
      identity: npc.identity || "",
      persona: npc.persona || "",
    }));

    // 3. ★★★ 如果在关注页，执行过滤逻辑 ★★★
    if (isFollowingTab) {
        if (followed.length === 0) {
            showToast("你还没有关注任何人，无法刷新");
            if (refreshBtn) refreshBtn.classList.remove("spinning");
            return;
        }

        // 只保留已关注的 ID 或 名字
        participants = participants.filter(p => followed.includes(p.id));
        npcs = npcs.filter(n => followed.includes(n.id) || followed.includes(n.name));
        
        // 如果过滤后没人了
        if (participants.length === 0 && npcs.length === 0) {
             showToast("关注的角色列表为空或未找到");
             if (refreshBtn) refreshBtn.classList.remove("spinning");
             return;
        }
        
        showToast(`正在获取 ${participants.length + npcs.length} 位关注者的动态...`);
    }

    // 4. 准备人物关系
    const relationships = (forumSettings.relationships || []).map(rel => {
      const person1 = getForumPersonName(rel.person1Type, rel.person1Id);
      const person2 = getForumPersonName(rel.person2Type, rel.person2Id);
      return `${person1} 和 ${person2} 的关系：${rel.relationship}${rel.description ? '（' + rel.description + '）' : ''}`;
    });

    // 5. 构建 System Prompt
    let systemPrompt = `你是一个论坛内容生成器。请根据以下设定生成论坛帖子。

【世界观】
${forumSettings.worldview}
${worldbookContent ? '\n【世界书/详细设定】\n' + worldbookContent : ''}

【论坛名称】
${forumSettings.forumName}

【用户信息（参考）】
- 昵称：${forumSettings.userNickname || "用户"}
- 身份：${forumSettings.userIdentity || "普通成员"}
`;

    // ★★★ 动态注入指令：区分 关注页 和 推荐页(广场) 的发帖人比例 ★★★
    if (isFollowingTab) {
        systemPrompt += `\n【重要指令】当前用户正在查看“关注列表”。
请**仅生成**以下列出的【AI角色】或【固定NPC】发布的帖子。
**绝对不要**生成任何陌生路人或未列出角色的帖子。
`;
    } else {
        systemPrompt += `\n【重要指令】当前用户正在查看“广场推荐页”。
为了模拟一个真实、热闹的公共社区：
1. **发帖比例约束**：本次生成的 8-10 条帖子中，**必须有 70% 以上的帖子来自【随机路人网友】或【固定NPC】**（即模拟生动、逼真的论坛生态，不要让同一个角色霸屏）。
2. **AI角色发帖限额**：在单次生成的帖子中，**每个特定的 AI 角色（如“时屿”）最多只能发布 1 条独立帖子**。绝对禁止同一个 AI 角色发布多条帖子，他们属于论坛中的“稀缺嘉宾”。
`;
    }

    systemPrompt += `
【AI角色】
${participants.length > 0 
    ? participants.map((p, i) => `${i + 1}. ${p.name}（@${p.handle}）\n${p.fullPersona || p.identity || '未设置人设'}`).join("\n\n")
    : "无"
}`;

    if (npcs.length > 0) {
      systemPrompt += `\n\n【固定NPC】\n${npcs.map((n, i) => `${i + 1}. ${n.name}（@${n.handle}）`).join("\n")}`;
    }

    // ★★★ 推荐页注入随机发帖网民描述，大模型可由此作为素材发帖 ★★★
    if (!isFollowingTab) {
      systemPrompt += `\n\n【随机路人网友（无需固定，供发帖自由发挥）】
请扮演 10 个以上不同的、具有各种网络生活气息昵称的普通网友（例如：“酸汤肥牛”、“夜航船”、“别整天做梦了”、“椰椰椰椰子”、“咸鱼突刺”等，禁止直接提取昵称），让他们用不同的口吻发布吐槽、分享、求助等日常帖子。`;
    }

    if (relationships.length > 0) {
      systemPrompt += `\n\n【人物关系】\n${relationships.join("\n")}`;
    }

    const userPrompt = `请生成8-10条论坛帖子数据，直接返回JSON数组。
    
【重要格式要求】：
1. 必须是标准的JSON格式，不要有Markdown标记。
2. 帖子内容(content)中如果包含双引号 "，必须转义为 \\" 。建议在内容中尽量使用单引号 ' 代替双引号。
3. 确保JSON结构完整，不要被截断。
4. **关键要求：每条帖子必须包含 4 到 8 条精彩评论！让评论区看起来热闹一点！**
5. **回复格式规范（极其重要）：**
   - 评论内容（content字段）必须纯净！**绝对不要**在 content 中包含“回复@xxx：”或“回复 xxx”等前缀。
   - 如果有回复关系，请使用 \`replyToName\` 字段记录被回复者的**【中文昵称】**（绝对不要写英文handle，例如写“小明”而不是“tiny_time381”）。
   - 绝对不要生成任何回复用户（楼主/我）的评论，因为用户还没有在该贴发表过任何评论。
6. **发帖作者分配（推荐页核心）：**
   - 如果是在推荐页（广场），生成的帖子中，AI角色发帖的数量**不得超过2个**（且不能是同一个AI角色）。
   - 剩下的 6-8 个帖子必须全部分配给【固定NPC】或【随机路人网友】（分配给随机路人时，"authorType" 设为 "npc"，"authorName" 设为随机路人昵称，"handle" 设为英文用户名）。

格式模板：
[
  {
    "authorType": "ai", // 或 "npc"（固定NPC或随机路人均使用 "npc"），绝对不要生成 "user"
    "authorName": "角色名或路人昵称",
    "handle": "Handle名",
    "content": "内容中尽量用单引号。",
    "likes": 12,
    "retweets": 5,
    "views": 1024,
    "comments": [
      {
        "authorType": "npc",
        "authorName": "路人A",
        "content": "评论内容",
        "likes": 2,
        "replyTo": null,
        "replyToName": null
      },
      {
        "authorType": "ai",
        "authorName": "角色名",
        "content": "回复另一条评论的内容（不含任何回复前缀）",
        "likes": 1,
        "replyTo": 1, // 指向被回复的评论在当前comments数组中的序号(从1开始)
        "replyToName": "路人A" // 被回复者的【中文昵称】
      }
    ]
  }
]`;
    
    // 发送请求
    const response = await fetch(`${apiConfig.url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiConfig.key}`,
      },
      body: JSON.stringify({
        model: apiConfig.model || "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.9,
      }),
    });

    // 1. 基础 HTTP 状态检查
    if (!response.ok) {
       throw new Error(`API请求失败: ${response.status}`);
    }

    const data = await response.json();
    if (
        (data.usage && data.usage.completion_tokens === 0) || 
        (data.choices && data.choices.length > 0 && data.choices[0].finish_reason === "content_filter")
    ) {
        throw new Error("生成失败：内容被AI模型拦截或为空，请修改提示词后重试。");
    }

    // 3. 拦截 API 结构性错误 (如欠费导致没有 choices)
    if (!data.choices || data.choices.length === 0) {
        if (data.error && data.error.message) {
            // 截取过长的错误信息
            const cleanError = data.error.message.length > 50 ? data.error.message.slice(0, 50) + "..." : data.error.message;
            throw new Error(`API报错: ${cleanError}`);
        }
        throw new Error("生成失败：API返回数据异常，请检查Key或模型设置。");
    }

    let content = data.choices[0]?.message?.content || "";

    // 1. 基础清洗
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    // 2. 尝试标准解析 (保留了你原版的强力容错逻辑)
    let posts = [];
    try {
      let cleanContent = content;
      if (cleanContent.endsWith(',]')) cleanContent = cleanContent.replace(',]', ']');
      if (cleanContent.endsWith(',\n]')) cleanContent = cleanContent.replace(',\n]', '\n]');
      posts = JSON.parse(cleanContent);
    } catch (parseError) {
      console.warn("标准JSON解析失败，尝试暴力修复...", parseError);
      // ★★★ 这里是你原版的正则修复逻辑，完全保留 ★★★
      const postMatches = content.match(/\{\s*"authorType"[\s\S]*?"comments"\s*:\s*\[[\s\S]*?\]\s*\}/g);
      if (postMatches && postMatches.length > 0) {
        posts = [];
        for (const matchStr of postMatches) {
          try {
            const p = JSON.parse(matchStr);
            posts.push(p);
          } catch (e) {
             try {
               const fixedStr = matchStr.replace(/("content"\s*:\s*")([\s\S]*?)("\s*,\s*"likes")/g, (match, p1, p2, p3) => {
                   return p1 + p2.replace(/"/g, "'") + p3;
               });
               posts.push(JSON.parse(fixedStr));
            } catch (e2) {}
          }
        }
        if (posts.length > 0) {
           showToast(`成功抢救回 ${posts.length} 条数据`);
        }
      }
      if (posts.length === 0) throw new Error("生成的数据格式严重错误，无法解析。");
    }

    // 获取当前用户昵称用于过滤
    const myName = forumSettings.userNickname || "用户";

    // 3. 数据处理与合并 (保留用户帖子逻辑)
    const newPosts = posts
            .filter(p => {
                if (p.authorType === 'user') return false;
                if (p.authorName === myName) return false;
                return true;
            })
            .map((p, idx) => {
                const auth = resolveAuthorIdentity(p.authorName);
                
                const tempPost = {
                  id: Math.floor(Date.now() + idx * 1000 + Math.random() * 100),
                  authorType: auth.type,
                  authorId: auth.id,
                  authorName: auth.name,
                  authorAvatar: auth.avatar,
                  handle: p.handle || generateEnglishHandle(auth.name),
                  content: p.content || "",
                  timestamp: Date.now() - Math.random() * 7200000,
                  likes: p.likes || Math.floor(Math.random() * 50),
                  liked: false,
                  retweets: p.retweets || Math.floor(Math.random() * 30),
                  views: p.views || Math.floor(Math.random() * 4900) + 100,
                  isRetweet: p.isRetweet || false,
                  originalPost: p.originalPost || null,
                  comments: []
                };

                // 通过清洗器建立严格的物理关联，不发生自生自复
                tempPost.comments = mapAndResolveComments(p.comments, tempPost);
                return tempPost;
            });

    // 保留用户自己的帖子
    const keepPosts = forumPosts.filter(p => p.authorType === 'user' || p.isPinned);
    
    // 合并逻辑 (使用 Map 去重)
    const postMap = new Map();
    // 新帖子优先
    newPosts.forEach(p => postMap.set(p.id, p));
    // 旧帖子追加 (如果ID不冲突)
    forumPosts.forEach(p => {
        if (!postMap.has(p.id)) postMap.set(p.id, p);
    });
    
    forumPosts = Array.from(postMap.values());
    forumPosts.sort((a, b) => b.timestamp - a.timestamp);

    await localforage.setItem("forumPosts", forumPosts);
    showToast(`刷新成功`);
    renderForumFeed();

  } catch (e) {
    console.error("[论坛] 生成失败:", e);
    if (e.message.includes("JSON")) {
       showToast("AI生成格式错误，请重试 (建议调低API温度)");
    } else {
       showToast("生成失败: " + e.message);
    }
  } finally {
    if (refreshBtn) refreshBtn.classList.remove("spinning");
  }
}
// 生成评论回复
async function generateForumCommentReply(postId, userComment) {
  if (Math.random() > 0.6) return; // 40%概率有人回复

  const post = forumPosts.find((p) => p.id === postId);
  if (!post) return;

  const apiConfig = getActiveApiConfig();
  if (!apiConfig) return;

  // 收集已有评论作为上下文
  const commentsContext = (post.comments || [])
    .slice(-5)
    .map(
      (c) =>
        `${c.authorName}${c.replyToName ? " 回复 @" + c.replyToName : ""}：${
          c.content
        }`
    )
    .join("\n");

  // 获取世界书内容
  const contextText = `${forumSettings.worldview}\n${post.content}\n${commentsContext}\n${userComment.content}`;
  const worldbookContent = getForumWorldbookContent(contextText);
  
  // 决定由谁来回复（AI角色或路人）
  let replier = null;
  let replierPersona = '';
  
  // 40%概率由AI角色回复
  if (forumSettings.aiParticipants.length > 0 && Math.random() < 0.4) {
    const randomParticipant = forumSettings.aiParticipants[Math.floor(Math.random() * forumSettings.aiParticipants.length)];
    const char = characters.find(c => String(c.id) === String(randomParticipant.charId));
    replier = {
      name: randomParticipant.nickname || char?.name || '角色',
      avatar: randomParticipant.avatar || char?.avatar || '',
      type: 'ai'
    };
    replierPersona = getCharacterFullPersona(randomParticipant);
  }

  try {
    const prompt = `世界观：${forumSettings.worldview}
${worldbookContent ? '\n世界书设定：\n' + worldbookContent : ''}
帖子：${post.content}
已有评论：
${commentsContext}

用户 "${userComment.authorName}" 刚发了评论：${userComment.content}

${replier ? `请你扮演「${replier.name}」回复这条评论。\n角色人设：${replierPersona}\n要求：符合角色人设和性格特点` : '请你扮演一个网友回复这条评论'}
要求：
1. 符合世界观设定
2. 一句简短的话
3. 只输出回复内容，不要其他
4. 禁止使用[表情]格式，用emoji代替`;

    const response = await fetch(`${apiConfig.url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiConfig.key}`,
      },
      body: JSON.stringify({
        model: apiConfig.model || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        max_tokens: parseInt(document.getElementById('apiMaxTokens')?.value) || 2048,
      }),
    });

    if (!response.ok) return;

    const data = await response.json();
    const reply = data.choices[0]?.message?.content?.trim();

    if (reply) {
      const npcNames = [
        "路人甲",
        "吃瓜群众",
        "热心网友",
        "神秘人",
        "潜水党",
        "围观群众",
      ];
      const maxId = post.comments.reduce(
        (max, c) => Math.max(max, c.id || 0),
        0
      );

      post.comments.push({
        id: maxId + 1,
        authorType: replier ? replier.type : "npc",
        authorName: replier ? replier.name : npcNames[Math.floor(Math.random() * npcNames.length)],
        authorAvatar: replier ? replier.avatar : "",
        content: reply,
        replyTo: userComment.id, // 回复用户的评论
        replyToName: userComment.authorName,
        timestamp: Date.now(),
        likes: 0,
        liked: false,
      });

      await localforage.setItem("forumPosts", forumPosts);

      if (currentForumPostId === postId) {
        renderForumPostDetail();
      }
    }
  } catch (e) {
    console.error("[论坛] 生成回复失败:", e);
  }
}

// 生成更多评论 (同样加入强制路人 NPC 比例约束)
async function generateMoreComments(targetPostId = null) {
  const pid = targetPostId || currentForumPostId;
  if (!pid) return;

  const post = forumPosts.find((p) => p.id === pid);
  if (!post) return;

  const apiConfig = getActiveApiConfig();
  if (!apiConfig || !apiConfig.url || !apiConfig.key) {
    showToast("请先配置API");
    return;
  }

  const btn = document.querySelector(".forum-comment-refresh");
  if (btn) btn.classList.add("loading");
  showToast("网友正在赶来...");

  // 1. 收集已有评论作为上下文
  const existingComments = (post.comments || []).map((c) => ({
    id: c.id,
    author: c.authorName,
    content: c.content,
  }));
  
  // 2. 准备用户信息
  const myName = forumSettings.userNickname || "用户";

  // 3. 准备 AI 角色列表 (包含完整人设)
  const participantsInfo = forumSettings.aiParticipants.map((p) => {
    const char = characters.find((c) => String(c.id) === String(p.charId));
    const charName = p.nickname || char?.name || "角色";
    let rawPersona = getCharacterFullPersona(p);
    if (rawPersona) {
      const myNameForReplace = forumSettings.userNickname || "用户";
      rawPersona = rawPersona.replace(/\{\{user\}\}/gi, myNameForReplace).replace(/<user>/gi, myNameForReplace);
    }
    return { name: charName, fullPersona: rawPersona };
  });
  
  // 4. 准备 NPC 列表
  const npcsInfo = (forumSettings.npcs || []).map(n => 
    `${n.name}（${n.identity || '路人'}）`
  ).join('、');

  // 5. 准备世界书内容
  const contextText = `${forumSettings.worldview}\n${post.content}\n${existingComments.map(c => c.content).join('\n')}`;
  const worldbookContent = getForumWorldbookContent(contextText);

  try {
    let retweetInfo = "";
    if (post.isRetweet && post.originalPost) {
      const orig = post.originalPost;
      retweetInfo = `\n【这是一条转发帖】原帖作者：${orig.authorName}，原帖内容：${orig.content || '无'}`;
    }
    const prompt = `你是一个论坛评论生成器。

【世界观】${forumSettings.worldview}
${worldbookContent ? '\n【世界书/详细设定】\n' + worldbookContent : ''}

【帖子内容】${post.content}${retweetInfo}

【已有评论】
${existingComments.map(c => `[ID:${c.id}] ${c.author}：${c.content}`).join("\n") || "暂无评论"}

【用户信息】昵称：${forumSettings.userNickname || "用户"}

【AI角色】（在评论区中属于少数，必须符合人设）
${participantsInfo.length > 0 ? participantsInfo.map((p, i) => `${i + 1}. ${p.name}\n人设：${p.fullPersona}`).join('\n\n') : "无"}

【固定NPC可用】
${npcsInfo || "无"}

【随机匿名网民（必需，用于活跃气氛）】
请自由发挥，扮演各种不同网名、不同背景和说话风格的普通网友（如：“酸汤肥牛”、“椰椰椰椰子”、“別整天做梦了”、“落叶知秋”等有趣逼真的昵称，禁止直接提取示例）。

请生成5-10条新评论，严格遵守以下要求：
1. **评论区人员比例（极其重要）**：**必须有 70% 以上的新评论来自随机匿名网民或固定 NPC**，以模拟真实公共社区。AI 角色在整篇评论区中属于少数派，他们最多只能发表 1 条独立评论，绝不能连续刷屏。
2. **角色扮演**：AI角色的评论必须符合其人设、语气 and 性格特点！
3. **禁止扮演用户**：绝对不要生成用户的评论。
4. **回复格式**：如果要回复某人，请把被回复者的【中文昵称】写在 \`replyToName\` 字段里，而**不要**写在 content 内容里（千万不要写英文handle，如：写“小明”而不是“tiny_time381”，不要写“回复xx：”）。绝对不要回复用户（楼主），因为用户没有在当前的“已有评论”中发表过评论。
5. **内容纯净**：\`content\` 字段里只写他说的话。
6. **格式要求**：返回纯JSON数组格式。
7. **表情**：禁止使用 [表情] 格式，必须用 emoji。
8. **标点**：如果内容包含引号，请使用单引号。

JSON格式模板：
[
  {"authorType":"npc","authorName":"昵称","content":"单纯的评论内容","replyToName":null},
  {"authorType":"ai","authorName":"角色名","content":"这里的content不要包含'回复xx'","replyToName":"被回复者昵称"}
]`;

    const response = await fetch(`${apiConfig.url}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiConfig.key}` },
      body: JSON.stringify({
        model: apiConfig.model || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        max_tokens: parseInt(document.getElementById('apiMaxTokens')?.value) || 2048,
      }),
    });

    if (!response.ok) throw new Error(`API请求失败: ${response.status}`);

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
        throw new Error("生成失败：API返回无效数据。");
    }

    let content = data.choices[0]?.message?.content || "";
    content = content.replace(/```json|```/g, "").trim();

    let newComments = [];
    try {
        newComments = JSON.parse(content);
    } catch(e) {
        const match = content.match(/\[[\s\S]*\]/);
        if (match) {
            try { newComments = JSON.parse(match[0]); } catch(e2) {}
        }
    }

    if (newComments.length > 0) {
      const resolved = mapAndResolveComments(newComments, post);
      post.comments = [...(post.comments || []), ...resolved];

      await localforage.setItem("forumPosts", forumPosts);

      if (currentForumPostId === pid) {
        renderForumPostDetail();
      } else {
        renderForumFeed();
      }
      if (resolved.length > 0) showToast(`新增 ${resolved.length} 条评论`);
    }
  } catch (e) {
    console.error("[论坛] 生成评论失败:", e);
    showToast("生成失败: " + e.message);
  } finally {
    if (btn) btn.classList.remove("loading");
  }
}

// 显示帖子更多菜单 (修复版)
function showPostMoreMenu(postId, btnEl) {
  console.log("[论坛] 尝试打开菜单, PostID:", postId); // 添加日志方便调试

  // 1. 移除已存在的菜单（防止重复打开）
  const existingMenu = document.querySelector('.forum-post-more-menu');
  if (existingMenu) existingMenu.remove();
  
  // 2. 创建菜单元素
  const menu = document.createElement('div');
  menu.className = 'forum-post-more-menu';
  
  // ★★★ 核心修复：添加内联样式确保菜单一定可见且层级最高 ★★★
  menu.style.cssText = `
    position: fixed;
    z-index: 10000; /* 调高层级，防止被背景图遮挡 */
    background-color: #ffffff;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 8px 0;
    min-width: 140px;
    display: flex;
    flex-direction: column;
    border: 1px solid #eff3f4;
  `;

  // 3. 设置菜单内容
  menu.innerHTML = `
    <div class="forum-post-more-menu-item delete" onclick="confirmDeletePost(${postId})" 
         style="padding: 12px 16px; display: flex; align-items: center; gap: 10px; color: #ef5350; cursor: pointer; transition: background 0.2s;">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
      <span style="font-size: 14px; font-weight: 500;">删除帖子</span>
    </div>
  `;
  
  // 4. 定位菜单（基于按钮位置）
  const rect = btnEl.getBoundingClientRect();
  menu.style.top = (rect.bottom + 5) + 'px';
  // 确保菜单靠右对齐，防止超出屏幕
  menu.style.right = (window.innerWidth - rect.right) + 'px';
  
  document.body.appendChild(menu);
  
  // 5. 点击其他地方关闭菜单 (使用 setTimeout 防止点击按钮本身时立即触发关闭)
  setTimeout(() => {
    const closeMenu = (e) => {
      // 如果点击的不是菜单内部，也不是刚才那个按钮，就关闭
      if (!menu.contains(e.target) && !btnEl.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    document.addEventListener('click', closeMenu);
  }, 10);
}
// 1. 确认删除弹窗
function confirmDeletePost(postId) {
  // 使用浏览器自带的确认框，简单直接
  if (confirm("确定要删除这条帖子吗？删除后无法恢复。")) {
    deleteForumPost(postId);
  }
  
  // 删除后关闭菜单
  const menu = document.querySelector('.forum-post-more-menu');
  if (menu) menu.remove();
}

// 2. 执行删除逻辑
async function deleteForumPost(postId) {
  // 确保 ID 类型一致
  const idToDelete = Number(postId);
  
  // 在数组中过滤掉这条帖子
  forumPosts = forumPosts.filter(p => Number(p.id) !== idToDelete);
  
  // 保存更新后的列表到数据库
  await localforage.setItem("forumPosts", forumPosts);
  
  showToast("帖子已删除");
  
  // 如果当前正在看这条帖子的详情页，则关闭详情页
  if (currentForumPostId === idToDelete) {
    closeForumPostDetail();
  }
  
  // 刷新当前页面显示
  smartRenderCurrentPage();
}

// 智能渲染当前页面（根据用户所在位置）
function smartRenderCurrentPage() {
  const currentSection = window.currentForumSection || 'home';
  
  // 如果正在查看其他用户主页
  if (currentViewingUser) {
    const userPosts = forumPosts.filter(p => 
      p.authorName === currentViewingUser.name && p.authorType !== 'user'
    );
    renderOtherUserProfile(currentViewingUser, userPosts, false);
    return;
  }
  
  // 根据当前section渲染
  switch (currentSection) {
    case 'profile':
      renderForumProfile();
      break;
    case 'hot':
      renderForumHot();
      break;
    case 'home':
    default:
      renderForumFeed();
      break;
  }
}

// 生成英文handle
function generateEnglishHandle(name) {
  const prefixes = ['cool', 'happy', 'cute', 'super', 'tiny', 'big', 'sweet', 'star', 'moon', 'sun', 'sky', 'lucky', 'nice'];
  const suffixes = ['cat', 'dog', 'bird', 'fan', 'lover', 'star', 'dream', 'day', 'night', 'life', 'world', 'time'];
  const hash = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const prefix = prefixes[hash % prefixes.length];
  const suffix = suffixes[(hash * 7) % suffixes.length];
  const num = (hash % 900) + 100;
  return `${prefix}_${suffix}${num}`;
}

// 处理内容中的图片占位符
// 渲染帖子详情页的图片
function renderDetailImages(post) {
  if (!post.images || post.images.length === 0) return '';
  
  const imageCount = post.images.length;
  const gridClass = imageCount === 1 ? 'single' : imageCount === 2 ? 'double' : imageCount === 3 ? 'triple' : 'quad';
  
  return `
    <div class="forum-post-images ${gridClass}" style="margin: 12px 0;">
      ${post.images.map((img, idx) => `
        <div class="forum-post-image-item" onclick="showForumFullImage('${img.replace(/'/g, "\\'")}')">
          <img src="${img}" alt="">
        </div>
      `).join('')}
    </div>
  `;
}

function formatForumContent(content) {
  if (!content) return "";
  
  // 先转义HTML
  let html = escapeForumHtml(content);
  
  // 处理@提及 - 支持 @用户名 或 @handle 格式
  // 匹配 @后面跟着的中文、英文、数字、下划线，直到遇到空格或标点
  html = html.replace(/@([a-zA-Z0-9_\u4e00-\u9fa5]+)/g, (match, name) => {
    const escapedName = name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    return `<span class="forum-mention" onclick="event.stopPropagation(); handleMentionClick('${escapedName}')">@${name}</span>`;
  });
  
  // 替换 [图片] 或 [图片:描述] 为图片占位符
  // 匹配 [图片] 或 [图片:xxx]
  html = html.replace(/\[图片(?::([^\]]*))?\]/g, (match, desc) => {
    const description = desc || '点击查看图片';
    const escapedDesc = description.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    return `
      <div class="forum-image-placeholder" onclick="showForumImageDesc('${escapedDesc}')">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      </div>
    `;
  });
  
  // 也处理 [图] 格式
  html = html.replace(/\[图(?::([^\]]*))?\]/g, (match, desc) => {
    const description = desc || '点击查看图片';
    const escapedDesc = description.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    return `
      <div class="forum-image-placeholder" onclick="showForumImageDesc('${escapedDesc}')">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      </div>
    `;
  });
  
  return html;
}

// 处理@提及点击
function handleMentionClick(name) {
  // 先检查是否是用户自己
  if (name === forumSettings.userNickname || name === forumSettings.userHandle) {
    switchForumSection('profile');
    return;
  }
  
  // 查找AI角色 - 通过昵称或handle匹配
  for (const p of forumSettings.aiParticipants) {
    const char = characters.find(c => String(c.id) === String(p.charId));
    const charName = p.nickname || char?.name || '';
    const charHandle = p.handle || generateEnglishHandle(charName);
    
    if (charName === name || charHandle === name) {
      openOtherUserProfile('ai', charName, p.charId);
      return;
    }
  }
  
  // 查找NPC - 通过名字或handle匹配
  for (const npc of (forumSettings.npcs || [])) {
    const npcHandle = npc.handle || generateEnglishHandle(npc.name);
    
    if (npc.name === name || npcHandle === name) {
      openOtherUserProfile('npc', npc.name, npc.id);
      return;
    }
  }
  
  // 查找帖子中出现过的作者
  const matchedPost = forumPosts.find(p => {
    const postHandle = p.handle || generateEnglishHandle(p.authorName);
    return p.authorName === name || postHandle === name;
  });
  
  if (matchedPost) {
    openOtherUserProfile(matchedPost.authorType, matchedPost.authorName, matchedPost.authorId || '');
    return;
  }
  
  // 查找评论中出现过的作者
  for (const post of forumPosts) {
    const matchedComment = (post.comments || []).find(c => c.authorName === name);
    if (matchedComment) {
      openOtherUserProfile(matchedComment.authorType || 'npc', matchedComment.authorName, '');
      return;
    }
  }
  
  // 如果找不到，创建一个随机用户主页
  openOtherUserProfile('random', name, '');
}

// 显示图片描述弹窗 (修复版：挂载到论坛内部 + 强制高层级)
function showForumImageDesc(desc) {
  // 阻止事件冒泡，防止触发底下的元素
  if (window.event) window.event.stopPropagation();
  
  // 创建弹窗
  const modal = document.createElement('div');
  modal.className = 'forum-image-modal';
  
  // ★★★ 核心修复1：强制提升层级，确保在最上层 ★★★
  modal.style.zIndex = "10005"; 
  
  modal.innerHTML = `
    <div class="forum-image-modal-content">
      <div class="forum-image-modal-header">
        <span>图片描述</span>
        <button class="forum-image-modal-close">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="forum-image-modal-body">
        <div class="forum-image-preview">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </div>
        <p class="forum-image-desc-text">${desc}</p>
      </div>
    </div>
  `;

  // 关闭逻辑
  const closeFunc = () => modal.remove();
  
  // 绑定点击关闭（点击背景或关闭按钮）
  modal.onclick = (e) => {
    if (e.target === modal) closeFunc();
  };
  // 绑定按钮关闭
  setTimeout(() => {
    const closeBtn = modal.querySelector('.forum-image-modal-close');
    if(closeBtn) closeBtn.onclick = closeFunc;
  }, 0);

  // ★★★ 核心修复2：优先挂载到 forumPage，保证不被遮挡 ★★★
  const forumPage = document.getElementById('forumPage');
  if (forumPage) {
    forumPage.appendChild(modal);
  } else {
    document.body.appendChild(modal);
  }
}

function formatForumTime(timestamp) {
  if (!timestamp) return "";
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return Math.floor(diff / 60000) + "分钟前";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "小时前";
  if (diff < 604800000) return Math.floor(diff / 86400000) + "天前";

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function escapeForumHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// 获取默认头像（灰色背景+白色人形轮廓的SVG）
function getDefaultAvatar() {
  return `<img src="${getDefaultAvatarDataUrl()}" alt="" class="default-avatar">`;
}

// 保留旧函数名兼容，但改为返回默认头像
function getAvatarEmoji(name) {
  return getDefaultAvatar();
}

function switchForumTab(tab) {
  currentForumTab = tab;
  document
    .querySelectorAll(".forum-tab")
    .forEach((t) => t.classList.remove("active"));
  event.target.classList.add("active");
  renderForumFeed();
}

// 打开引用转发界面（推特风格）
function openQuoteRetweet(postId) {
  const post = forumPosts.find(p => Number(p.id) === Number(postId));
  if (!post) return;
  
  // 获取用户信息
  const globalAvatar = localStorage.getItem("avatarImg");
  const userAvatar = globalAvatar || getDefaultAvatarDataUrl();
  const userName = forumSettings.userNickname || "我";
  const userHandle = forumSettings.userHandle || generateEnglishHandle(userName);
  
  // 获取原帖信息
  const origAvatar = post.authorAvatar || getDefaultAvatarDataUrl();
  const origName = post.authorName || "用户";
  const origHandle = post.handle || generateEnglishHandle(origName);
  const origContent = post.content || "";
  
  // 原帖图片预览
  let origImagesHtml = '';
  if (post.images && post.images.length > 0) {
    origImagesHtml = `
      <div class="forum-quote-preview-images">
        ${post.images.slice(0, 2).map(img => `<img src="${img}" alt="">`).join('')}
        ${post.images.length > 2 ? `<span class="forum-quote-more-images">+${post.images.length - 2}</span>` : ''}
      </div>
    `;
  }
  
  const modal = document.createElement('div');
  modal.id = 'forumQuoteRetweetModal';
  modal.className = 'forum-compose-overlay active';
  modal.innerHTML = `
    <div class="forum-compose-header">
      <button class="forum-compose-cancel" onclick="closeQuoteRetweet()">取消</button>
      <div class="forum-compose-title">引用</div>
      <button class="forum-compose-submit" onclick="submitQuoteRetweet(${postId})">发布</button>
    </div>
    <div class="forum-compose-body forum-quote-body">
      <div class="forum-compose-user-info">
        <div class="forum-compose-avatar"><img src="${userAvatar}" alt=""></div>
        <div class="forum-compose-user-text">
          <div class="forum-compose-name">${escapeForumHtml(userName)}</div>
          <div class="forum-compose-handle">@${escapeForumHtml(userHandle)}</div>
        </div>
      </div>
      <textarea 
        class="forum-compose-textarea forum-quote-textarea" 
        id="forumQuoteTextarea" 
        placeholder="添加评论..."
      ></textarea>
      
      <!-- 引用的原帖卡片 -->
      <div class="forum-quote-preview">
        <div class="forum-quote-preview-header">
          <img class="forum-quote-preview-avatar" src="${origAvatar}" alt="">
          <span class="forum-quote-preview-name">${escapeForumHtml(origName)}</span>
          <span class="forum-quote-preview-handle">@${origHandle}</span>
        </div>
        <div class="forum-quote-preview-content">${escapeForumHtml(origContent)}</div>
        ${origImagesHtml}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 自动聚焦输入框
  setTimeout(() => {
    document.getElementById('forumQuoteTextarea')?.focus();
  }, 100);
}

// 关闭引用转发界面
function closeQuoteRetweet() {
  document.getElementById('forumQuoteRetweetModal')?.remove();
}

// 提交引用转发
async function submitQuoteRetweet(postId) {
  const originalPost = forumPosts.find(p => Number(p.id) === Number(postId));
  if (!originalPost) {
    showToast('帖子不存在');
    return;
  }
  
  const content = document.getElementById('forumQuoteTextarea')?.value?.trim() || '';
  
  // 获取用户信息
  const userName = forumSettings.userNickname || "我";
  const userAvatar = localStorage.getItem("avatarImg") || "";
  const userHandle = forumSettings.userHandle || generateEnglishHandle(userName);
  
  // 创建引用转发帖子
  const retweetPost = {
    id: Date.now(),
    authorType: "user",
    authorId: null,
    authorName: userName,
    authorAvatar: userAvatar,
    handle: userHandle,
    content: content, // 用户的评论
    timestamp: Date.now(),
    likes: 0,
    liked: false,
    retweets: 0,
    views: 0,
    comments: [],
    isRetweet: true,
    originalPostId: originalPost.id,
    originalPost: {
      id: originalPost.id,
      authorName: originalPost.authorName,
      authorAvatar: originalPost.authorAvatar,
      handle: originalPost.handle || generateEnglishHandle(originalPost.authorName),
      content: originalPost.content,
      images: originalPost.images,
      timestamp: originalPost.timestamp,
    }
  };
  
  // 增加原帖的转发数
  originalPost.retweets = (originalPost.retweets || 0) + 1;
  
  // 添加到帖子列表
  forumPosts.unshift(retweetPost);
  await localforage.setItem("forumPosts", forumPosts);
  
  closeQuoteRetweet();
  closeForumPostDetail();
  showToast('转发成功');
  renderForumFeed();
  
  // 自动生成互动数据
  generateInteractionsForNewPost(retweetPost.id);
}

// 保留旧函数名兼容（不再使用选择菜单）
function showRetweetMenu(postId) {
  openQuoteRetweet(postId);
}

// ==================== 1. 弹出选择器 (纯单聊版) ====================
// 移除了群聊列表的生成逻辑，只显示角色列表

function retweetToChat(postId) {
  const post = forumPosts.find(p => Number(p.id) === Number(postId));
  if (!post) return;
  
  // 获取角色列表
  const charList = window.characters || [];
  
  if (charList.length === 0) {
    showToast('未找到任何角色');
    return;
  }
  
  // 生成选项HTML
  const optionsHtml = charList.map(char => `
    <div class="forum-char-option" onclick="sendRetweetToChar('${char.id}', ${postId})">
      <div class="forum-char-avatar">
        ${char.avatar ? `<img src="${char.avatar}" alt="">` : '🤖'}
      </div>
      <div class="forum-char-name">${char.name || '角色'}</div>
    </div>
  `).join('');
  
  // 创建选择器弹窗
  const modal = document.createElement('div');
  modal.className = 'forum-char-picker-modal';
  modal.innerHTML = `
    <div class="forum-char-picker">
      <div class="forum-char-picker-header">
        <span>转发给...</span>
        <button onclick="this.closest('.forum-char-picker-modal').remove()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="forum-char-picker-list">
        ${optionsHtml}
      </div>
    </div>
  `;
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  document.body.appendChild(modal);
}

// ==================== 2. 执行转发 (AI认知增强版) ====================
async function sendRetweetToChar(targetId, postId) {
  // 1. 获取帖子数据
  // 必须转化为数字比较，防止类型不一致导致找不到
  const post = forumPosts.find(p => Number(p.id) === Number(postId));
  
  if (!post) {
    showToast('帖子数据异常');
    return;
  }
  
  // 2. 关闭选择器弹窗 (如果存在)
  const modal = document.querySelector('.forum-char-picker-modal');
  if (modal) modal.remove();
  
  // 3. 从主程序全局列表获取目标角色 (确保能同步到聊天界面)
  const globalChatList = window.chatList || [];
  // ID 转字符串比较，兼容性更好
  const chat = globalChatList.find(c => String(c.id) === String(targetId));
  
  if (!chat) {
    showToast('目标角色不存在，请检查聊天列表');
    return;
  }
  
  // 4. 构建转发卡片数据 (用于显示)
  // 如果 handle 为空，临时生成一个看起来像样的
  const safeHandle = post.handle || generateEnglishHandle(post.authorName);
  
  const retweetCard = {
    type: 'retweet_card', 
    postId: post.id,
    authorName: post.authorName,
    authorAvatar: post.authorAvatar || '', // 允许为空，render函数会处理默认图
    handle: safeHandle,
    content: post.content || '分享图片', // 防止内容为空
    likes: post.likes || 0,
    retweets: post.retweets || 0,
    comments: post.comments?.length || 0,
    views: post.views || 0  // 传入浏览量
  };
  
  // 5. 生成卡片 HTML (这是给用户看的 UI)
  const cardHtml = renderRetweetCard(retweetCard);

  // 6. 生成时间戳
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  // ============================================================
  // ★★★ 核心逻辑：给 AI 注入认知 (Prompt Engineering) ★★★
  // ============================================================
  
  // A. 判断帖子归属 (是谁的帖子？)
  const myName = forumSettings.userNickname || "我";
  let ownershipText = "";
  
  // 这里的判断逻辑是：如果是 user 类型，或者作者名和我的昵称一样，就是“我”的帖子
  if (post.authorType === 'user' || post.authorName === myName) {
      ownershipText = "用户转发了【自己 (User)】发布的帖子";
  } else if (post.authorName === chat.name) {
      ownershipText = `用户转发了【你自己 (${chat.name})】发布的帖子`; // 转发了AI自己的帖子
  } else {
      ownershipText = `用户转发了【${post.authorName}】发布的帖子`; // 转发了路人/第三方的帖子
  }
  
  // B. 提取内容摘要 (防止内容过长，截取前100字)
  let cleanContent = post.content.replace(/<[^>]+>/g, '').trim(); // 去掉HTML标签
  if (cleanContent.length > 100) cleanContent = cleanContent.substring(0, 100) + "...";
  if (!cleanContent) cleanContent = "[分享图片/视频]";
  
  // C. 组合最终的 System Note 给 AI
  const aiInstruction = `[系统通知：${ownershipText}]\n原帖内容：“${cleanContent}”\n(请根据帖子归属和内容进行回应)`;

  // ============================================================

  // 7. 构造消息对象
  const msgObj = {
      id: Date.now(),
      isSelf: true,        // 标记为我发的
      text: cardHtml,      // 界面显示：漂亮的卡片
      time: timeStr,
      timestamp: Date.now(),
      type: 'retweet',     // 类型标记
      
      // ★ 最重要的一行：AI 实际上读到的是这段话 ★
      contentDescription: aiInstruction 
  };
  
  // 8. 存入聊天记录
  if (!chat.messages) chat.messages = [];
  chat.messages.push(msgObj);
  
  // 更新列表预览文字
  chat.msg = '[转发帖子]';
  chat.time = timeStr;
  
  // 9. 保存数据到 IndexedDB (调用主程序函数)
  if (typeof window.saveData === 'function') {
      window.saveData(); 
  }
  
  // 10. 页面跳转逻辑
  // a. 关闭可能的帖子详情弹窗
  closeForumPostDetail(); 
  
  // b. 隐藏论坛全屏页
  const forumPage = document.getElementById('forumPage');
  if (forumPage) forumPage.style.display = 'none';
  
  // c. 确保聊天主页面显示
  const chatApp = document.getElementById('chatAppPage');
  if (chatApp) chatApp.style.display = 'flex';
  
  // d. 打开目标聊天室并滚动到底部
  if (typeof window.openChatRoom === 'function') {
    // 加一点点延时让 DOM 渲染完成
    setTimeout(() => {
        window.openChatRoom(chat.id);
        
        // 强制滚动到底部
        const msgContainer = document.getElementById('roomMessages');
        if (msgContainer) {
            msgContainer.scrollTop = msgContainer.scrollHeight;
        }
    }, 100);
  } else {
    // 兜底提示
    showToast(`已发送给 ${chat.name}`);
  }
}


// 转发到个人主页（旧函数名兼容，重定向到引用转发）
function retweetToProfile(postId) {
  openQuoteRetweet(postId);
}

// 渲染转发卡片 (完美复刻推特底部栏)
function renderRetweetCard(cardData) {
  if (!cardData) return '';
  
  // 头像处理
  let avatarHtml = '';
  if (cardData.authorAvatar && cardData.authorAvatar !== '') {
      avatarHtml = `<img src="${cardData.authorAvatar}" alt="">`;
  } else {
      avatarHtml = `<svg viewBox="0 0 24 24" fill="#ccc"><circle cx="12" cy="8" r="4"/><path d="M12 14c-5 0-9 4-9 9h18c0-5-4-9-9-9z"/></svg>`;
  }
  
  // 数据格式化 (把数字显示得更好看一点)
  const formatNum = (n) => n > 999 ? (n/1000).toFixed(1)+'k' : n;
  
  const comments = formatNum(cardData.comments || 0);
  const retweets = formatNum(cardData.retweets || 0);
  const likes = formatNum(cardData.likes || 0);
  // 浏览量模拟一个比点赞大的数
  const views = formatNum(cardData.views || (cardData.likes * 20 + 50)); 

  return `
    <div class="retweet-card" onclick="event.stopPropagation(); window.openForumPostFromCard(${cardData.postId})">
      <!-- 顶部灰色条 -->
      <div class="retweet-card-label">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 1l4 4-4 4"></path>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
          <path d="M7 23l-4-4 4-4"></path>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
        </svg>
        <span>转发的帖子</span>
      </div>
      
      <div class="retweet-card-body">
        <!-- 作者栏 -->
        <div class="retweet-card-header">
          <div class="retweet-card-avatar">${avatarHtml}</div>
          <div class="retweet-card-author-info">
            <span class="retweet-card-author">${escapeForumHtml(cardData.authorName)}</span>
            <span class="retweet-card-handle">@${cardData.handle}</span>
          </div>
        </div>
        
        <!-- 内容 -->
        <div class="retweet-card-content">${escapeForumHtml(cardData.content)}</div>
        
        <!-- 底部推特风格栏 (Comment, Retweet, Like, View) -->
        <div class="retweet-card-footer">
            
            <!-- 1. 评论 -->
            <div class="retweet-stat-item">
                <svg viewBox="0 0 24 24"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.295c-4.42 0-8.005-3.58-8.005-8.01z"></path></svg>
                <span>${comments}</span>
            </div>

            <!-- 2. 转发 -->
            <div class="retweet-stat-item">
                <svg viewBox="0 0 24 24"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"></path></svg>
                <span>${retweets}</span>
            </div>

            <!-- 3. 喜欢 (空心) -->
            <div class="retweet-stat-item">
                <svg viewBox="0 0 24 24"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path></svg>
                <span>${likes}</span>
            </div>

            <!-- 4. 浏览 (柱状图图标) -->
            <div class="retweet-stat-item">
                <svg viewBox="0 0 24 24"><path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.25 0V0h2v21h-2z"></path></svg>
                <span>${views}</span>
            </div>

        </div>
      </div>
    </div>
  `;
}


// ★★★ 必须搭配这个全局跳转函数一起使用 (适配 script.js 版) ★★★
window.openForumPostFromCard = async function(postId) {
  console.log("[论坛] 尝试从卡片跳转帖子:", postId);
  
  // 1. 调用 script.js 里的打开应用函数，切换到论坛 App
  if (typeof window.openApp === 'function') {
      window.openApp('Page 4'); // 对应 Dock 栏第4个图标（论坛）
  } else {
      // 备用方案：直接操作 DOM
      const overlay = document.getElementById('appOverlay');
      const forumPage = document.getElementById('forumPage');
      if (overlay) overlay.classList.add('active');
      if (forumPage) {
          document.querySelectorAll('.app-page').forEach(p => p.style.display = 'none');
          forumPage.style.display = 'block';
      }
  }
  
  // 2. 确保论坛数据已加载 (防止页面是被强杀后重新打开的)
  if (typeof window.initForumApp === 'function') {
      window.initForumApp();
  }

  // 3. 延时打开详情 (给页面切换一点动画时间)
  setTimeout(() => {
    // 确保把ID转为数字
    if (typeof window.openForumPostDetail === 'function') {
        window.openForumPostDetail(Number(postId));
    }
  }, 200);
};


// [修改] 底部导航切换
function switchForumSection(section) {
  // ★ 如果是私信，直接打开全屏页，不改变底部 Tab 状态
  if (section === 'dm') {
    openDirectMessages();
    return; 
  }

  // 其他 Tab 正常切换高亮和内容
  const items = document.querySelectorAll(".forum-nav-item");
  items.forEach((item) => item.classList.remove("active"));
  
  let activeIndex = 0;
  if (section === 'home') activeIndex = 0;
  else if (section === 'hot') activeIndex = 1;
  // dm 是 2，但在上面已经 return 了，所以不会执行到这里
  else if (section === 'profile') activeIndex = 3;
  
  if (items[activeIndex]) {
    items[activeIndex].classList.add("active");
  }
  
  window.currentForumSection = section;
  
  if (section === 'home') renderForumFeed();
  else if (section === 'hot') renderForumHot();
  else if (section === 'profile') renderForumProfile();
}

// 统一的刷新处理函数
function handleForumRefresh() {
  const currentSection = window.currentForumSection || 'home';
  
  if (currentSection === 'hot') {
    // 如果在搜索结果页面，刷新搜索结果
    if (currentHotView === 'search_results' && currentSearchQuery) {
      refreshSearchResults(currentSearchQuery);
    } else {
      // 刷新热点主页（重新渲染即可，因为热门帖子会根据主页数据更新）
      const refreshBtn = document.querySelector(".forum-refresh-btn");
      if (refreshBtn) refreshBtn.classList.add("spinning");
      
      // 先生成新的主页帖子
      generateForumPosts().then(() => {
        // 完成后重新渲染热点页面
        renderForumHot();
      });
    }
  } else {
    // 主页或其他页面，正常生成帖子
    generateForumPosts();
  }
}

// ==================== 热点页面 ====================

// 当前热点页面状态
let currentHotView = 'main'; // 'main' 或 'search_results'
let currentSearchQuery = ''; // 当前搜索词

function renderForumHot() {
  const feed = document.getElementById("forumFeed");
  if (!feed) return;
  
  currentHotView = 'main';
  
  // 显示顶栏和FAB
  const tabs = document.querySelector('.forum-tabs');
  const fab = document.querySelector('.forum-fab');
  if (tabs) tabs.style.display = 'flex';
  if (fab) fab.style.display = 'flex';
  
  // 恢复safe area padding（从个人主页返回时）
  const forumContainer = document.querySelector('.forum-container');
  if (forumContainer) forumContainer.style.paddingTop = '';
  
  // 隐藏主页的返回按钮、tab和设置按钮，显示热点标题
  const backBtn = document.querySelector('.forum-back-btn');
  const homeTabs = document.querySelectorAll('.forum-home-tab');
  const hotTitle = document.querySelector('.forum-hot-title');
  const settingsBtn = document.querySelector('.forum-settings-btn');
  if (backBtn) backBtn.style.display = 'none';
  homeTabs.forEach(tab => tab.style.display = 'none');
  if (hotTitle) hotTitle.style.display = 'block';
  if (settingsBtn) settingsBtn.style.display = 'none';
  
  // 生成热点话题数据
  const hotTopics = generateHotTopics();
  const trendingPosts = getTrendingPosts();
  
  // 获取世界观相关的热搜关键词
  const worldviewKeywords = extractWorldviewKeywords();
  
  feed.innerHTML = `
    <div class="forum-hot-container">
      <!-- 搜索栏 -->
      <div class="forum-hot-search">
        <div class="forum-hot-search-box" onclick="focusHotSearch()">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#536471" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" id="forumHotSearchInput" placeholder="搜索" 
            onkeydown="handleHotSearchKeydown(event)"
            oninput="handleHotSearchInput(event)">
          <button class="forum-hot-search-btn" onclick="executeHotSearch()" style="display:none;">
            搜索
          </button>
        </div>
      </div>
      
      <!-- 热门话题区域 -->
      <div class="forum-hot-section">
        <div class="forum-hot-section-header">
          <span class="forum-hot-section-title">热门话题</span>
        </div>
        <div class="forum-hot-topics">
          ${hotTopics.map((topic, idx) => `
            <div class="forum-hot-topic-item" onclick="searchForumTopic('${escapeForumHtml(topic.tag)}')">
              <div class="forum-hot-topic-rank">${idx + 1}</div>
              <div class="forum-hot-topic-content">
                <div class="forum-hot-topic-category">${escapeForumHtml(topic.category)}</div>
                <div class="forum-hot-topic-tag">#${escapeForumHtml(topic.tag)}</div>
                <div class="forum-hot-topic-count">${topic.count} 条帖子</div>
              </div>
              <div class="forum-hot-topic-trend ${topic.trend}">
                ${topic.trend === 'up' ? '↑' : topic.trend === 'down' ? '↓' : '—'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- 热门帖子区域 -->
      <div class="forum-hot-section">
        <div class="forum-hot-section-header">
          <span class="forum-hot-section-title">热门帖子</span>
        </div>
        <div class="forum-hot-posts">
          ${trendingPosts.length > 0 
            ? trendingPosts.map(post => renderForumPostItem(post)).join('')
            : '<div class="forum-hot-empty">暂无热门帖子<br><span style="font-size:13px;color:#9ca3af;">点击上方刷新按钮生成内容</span></div>'
          }
        </div>
      </div>
      
      <!-- 猜你想搜 -->
      <div class="forum-hot-section">
        <div class="forum-hot-section-header">
          <span class="forum-hot-section-title">猜你想搜</span>
        </div>
        <div class="forum-hot-keywords">
          ${worldviewKeywords.map(kw => `
            <span class="forum-hot-keyword" onclick="searchForumTopic('${escapeForumHtml(kw)}')">${escapeForumHtml(kw)}</span>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// 聚焦搜索框
function focusHotSearch() {
  const input = document.getElementById('forumHotSearchInput');
  if (input) input.focus();
}

// 处理搜索输入
function handleHotSearchInput(event) {
  const btn = document.querySelector('.forum-hot-search-btn');
  if (btn) {
    btn.style.display = event.target.value.trim() ? 'block' : 'none';
  }
}

// 处理搜索键盘事件
function handleHotSearchKeydown(event) {
  if (event.key === 'Enter') {
    executeHotSearch();
  }
}

// 执行搜索
function executeHotSearch() {
  const input = document.getElementById('forumHotSearchInput');
  const query = input?.value?.trim();
  if (query) {
    searchForumTopic(query);
  }
}

// 搜索/点击话题 - 生成相关帖子
async function searchForumTopic(topic) {
  if (!topic) return;
  
  currentSearchQuery = topic;
  currentHotView = 'search_results';
  
  const feed = document.getElementById("forumFeed");
  if (!feed) return;
  
  // 隐藏顶栏（搜索结果页有自己的header）
  const tabs = document.querySelector('.forum-tabs');
  if (tabs) tabs.style.display = 'none';
  
  // 移除safe area padding（搜索结果header有自己的safe area处理）
  const forumContainer = document.querySelector('.forum-container');
  if (forumContainer) forumContainer.style.paddingTop = '0';
  
  // 显示搜索结果页面（带loading）
  feed.innerHTML = `
    <div class="forum-hot-container">
      <!-- 搜索结果头部 -->
      <div class="forum-search-header">
        <button class="forum-search-back" onclick="renderForumHot()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <div class="forum-search-title">#${escapeForumHtml(topic)}</div>
        <button class="forum-search-refresh" onclick="refreshSearchResults('${escapeForumHtml(topic)}')" title="刷新">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>
      
      <!-- Loading状态 -->
      <div class="forum-search-loading" id="forumSearchLoading">
        <div class="forum-search-spinner"></div>
        <div class="forum-search-loading-text">正在搜索「${escapeForumHtml(topic)}」相关内容...</div>
      </div>
      
      <!-- 搜索结果 -->
      <div class="forum-search-results" id="forumSearchResults"></div>
    </div>
  `;
  
  // 调用API生成相关帖子
  await generateTopicPosts(topic);
}

// 刷新搜索结果
async function refreshSearchResults(topic) {
  const refreshBtn = document.querySelector('.forum-search-refresh');
  if (refreshBtn) refreshBtn.classList.add('spinning');
  
  // 显示loading
  const loading = document.getElementById('forumSearchLoading');
  const results = document.getElementById('forumSearchResults');
  if (loading) loading.style.display = 'flex';
  if (results) results.innerHTML = '';
  
  await generateTopicPosts(topic);
  
  if (refreshBtn) refreshBtn.classList.remove('spinning');
}

// ==================== 修复：热点生成 (原版提示词 + 智能解析) ====================
async function generateTopicPosts(topic) {
  const apiConfig = getActiveApiConfig();
  if (!apiConfig || !apiConfig.url || !apiConfig.key) {
    showSearchError("请先配置API");
    return;
  }
  
  try {
    // 1. 数据准备 (保持原逻辑)
    const worldbookContent = getForumWorldbookContent(`${forumSettings.worldview}\n${topic}`);
    
    const participants = forumSettings.aiParticipants.map((p) => {
      const char = characters.find((c) => String(c.id) === String(p.charId));
      const settings = chatSettings[p.charId] || {};
      return {
        name: p.nickname || settings.charName || char?.name || "角色",
        handle: p.handle || generateEnglishHandle(p.nickname || char?.name || ''),
        identity: p.identity || "",
        fullPersona: getCharacterFullPersona(p),
      };
    });

    const npcs = (forumSettings.npcs || []).map(npc => ({
      name: npc.name,
      handle: npc.handle || generateEnglishHandle(npc.name),
      identity: npc.identity || "",
      persona: npc.persona || "",
    }));

    const relationships = (forumSettings.relationships || []).map(rel => {
      const person1 = getForumPersonName(rel.person1Type, rel.person1Id);
      const person2 = getForumPersonName(rel.person2Type, rel.person2Id);
      return `${person1} 和 ${person2} 的关系：${rel.relationship}${rel.description ? '（' + rel.description + '）' : ''}`;
    });

    // 2. ★★★ System Prompt (完全保持你的原版逻辑) ★★★
    let systemPrompt = `你是一个论坛内容生成器。请根据以下设定生成与「${topic}」相关的论坛帖子。

【世界观】
${forumSettings.worldview || '现代都市'}
${worldbookContent ? '\n【世界书/详细设定】\n' + worldbookContent : ''}

【论坛名称】
${forumSettings.forumName || '广场'}

【搜索话题】
${topic}

【用户信息（仅供参考，不要生成用户的帖子或评论）】
- 昵称：${forumSettings.userNickname || "用户"}
- 身份：${forumSettings.userIdentity || "普通成员"}

【AI角色】可以使用这些角色发帖和评论，必须符合人设！
${participants.length > 0 
  ? participants.map((p, i) => 
      `${i + 1}. ${p.name}（@${p.handle}）\n${p.fullPersona || p.identity || '未设置人设'}`
    ).join("\n\n")
  : "无"}`;

    if (npcs.length > 0) {
      systemPrompt += `

【固定NPC】可以使用这些NPC发帖和评论
${npcs.map((n, i) => 
  `${i + 1}. ${n.name}（@${n.handle}）：${n.identity || '普通网友'}${n.persona ? '，性格：' + n.persona : ''}`
).join("\n")}`;
    }

    if (relationships.length > 0) {
      systemPrompt += `

【人物关系】在帖子互动中体现这些关系
${relationships.join("\n")}`;
    }

    systemPrompt += `

【要求】
1. 生成10-15条与「${topic}」话题相关的论坛帖子
2. 帖子内容必须围绕「${topic}」展开，可以是讨论、分享、吐槽、求助等
3. 帖子作者只能是AI角色、固定NPC或随机路人，绝对不要生成用户的帖子
4. 内容要符合世界观设定，有趣且有互动感
5. 每条帖子必须有5-10条评论
6. 部分帖子可以包含图片，用[图片:图片描述]格式
7. 返回JSON数组格式
8. 禁止使用[爱心][笑哭]等方括号表情格式，必须直接使用emoji如❤️😂😊等`;

    // 3. ★★★ User Prompt (完全保持你的原版逻辑) ★★★
    const userPrompt = `请生成与「${topic}」相关的论坛帖子，返回纯JSON数组（不要markdown代码块）：
[
  {
    "authorType": "ai或npc",
    "authorName": "中文昵称",
    "handle": "英文用户名(不含@符号)",
    "content": "与${topic}相关的帖子内容",
    "likes": 点赞数,
    "retweets": 转发数(0-50),
    "views": 浏览量(100-5000),
    "comments": [
      {
        "tempIdx": 1,
        "authorType": "npc",
        "authorName": "昵称",
        "handle": "英文用户名",
        "content": "纯净评论内容（不要写回复@xxx前缀）",
        "likes": 0,
        "replyTo": null,
        "replyToName": null
      },
      {
        "tempIdx": 2,
        "authorType": "ai",
        "authorName": "昵称",
        "handle": "英文用户名",
        "content": "纯净回复内容（绝对不要在content中写回复@xxx前缀）",
        "likes": 0,
        "replyTo": 1, // 指向被回复的评论的tempIdx
        "replyToName": "被回复者的【中文昵称】" // 必须是中文昵称，绝不能写英文handle
      }
    ]
  }
]
注意：
1. 所有帖子都必须与「${topic}」话题相关！
2. authorType只能是"ai"或"npc"，不要生成"user"
3. 每个帖子必须有10-15条评论！
4. 禁止使用[表情]格式，用emoji❤️😂代替
5. **回复格式规范（极其重要）：** 评论的 \`content\` 中**绝对不能**包含“回复@xxx”或“回复 xxx”等前缀。被回复者的【中文昵称】必须写在 \`replyToName\` 字段里（千万不要写英文handle）。绝对不要生成任何回复用户（楼主）的评论。`;

    // 4. 调用 API
    const response = await fetch(`${apiConfig.url}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiConfig.key}` },
      body: JSON.stringify({
        model: apiConfig.model || "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.9,
      }),
    });

    if (!response.ok) throw new Error(`API请求失败: ${response.status}`);

    const data = await response.json();

    // 拦截空内容/风控
    if (
        (data.usage && data.usage.completion_tokens === 0) || 
        (data.choices && data.choices.length > 0 && data.choices[0].finish_reason === "content_filter")
    ) {
        throw new Error("生成失败：内容被AI模型拦截或为空，请修改提示词后重试。");
    }

    // 拦截无结果
    if (!data.choices || data.choices.length === 0) {
        if (data.error && data.error.message) throw new Error(`API报错: ${data.error.message}`);
        throw new Error("生成失败：API返回无效数据。");
    }

    let content = data.choices[0]?.message?.content || "";

    // 5. ★★★ 核心修复：解析逻辑换成智能提取 ★★★
    // 即使 AI 输出格式乱了，只要包含 {...} 结构，就能抠出来
    
    // 清洗 Markdown
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let posts = [];
    try {
      // 方案A: 标准解析
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        posts = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("无标准数组");
      }
    } catch (parseError) {
      console.warn("[论坛] 标准解析失败，使用智能正则提取...", parseError);
      
      // 方案B: 智能正则提取
      // 这个正则能匹配嵌套对象：{...{...}...}
      const objectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
      const matches = content.match(objectRegex);
      
      if (matches && matches.length > 0) {
        posts = [];
        for (const matchStr of matches) {
          try {
            // 尝试修复常见的双引号未转义问题 (content: "他说"你好"")
            let safeStr = matchStr;
            // 简单的试探性修复
            if (safeStr.includes('"content": "') && safeStr.match(/"content": ".*?".*?"/)) {
                 safeStr = safeStr.replace(/("content"\s*:\s*")([\s\S]*?)("\s*,\s*")/g, (m, p1, p2, p3) => {
                     return p1 + p2.replace(/"/g, "'") + p3;
                 });
            }
            posts.push(JSON.parse(safeStr));
          } catch (e) {
             // 真的坏掉了，跳过这一条
          }
        }
      }
    }

    if (posts.length === 0) {
        throw new Error("无法解析生成内容，请重试");
    }

    // 6. 后续逻辑保持不变...
    const searchPosts = posts.map((p, idx) => {
        const auth = resolveAuthorIdentity(p.authorName);
        
        const tempPost = {
          id: Math.floor(Date.now() + idx * 1000 + Math.random() * 100),
          authorType: auth.type,
          authorId: auth.id,
          authorName: auth.name,
          authorAvatar: auth.avatar,
          handle: p.handle || generateEnglishHandle(auth.name),
          content: p.content || "",
          timestamp: Date.now() - Math.random() * 7200000,
          likes: p.likes || Math.floor(Math.random() * 50),
          liked: false,
          retweets: p.retweets || Math.floor(Math.random() * 30),
          views: p.views || Math.floor(Math.random() * 4900) + 100,
          isSearchResult: true,
          searchTopic: topic,
          comments: []
        };

        tempPost.comments = mapAndResolveComments(p.comments, tempPost);
        return tempPost;
    });

    forumPosts = forumPosts.filter(p => !(p.isSearchResult && p.searchTopic === topic));
    forumPosts = [...searchPosts, ...forumPosts];
    await localforage.setItem("forumPosts", forumPosts);
    
    showSearchResults(searchPosts, topic);

  } catch (e) {
    console.error("[论坛] 搜索生成失败:", e);
    showSearchError("生成失败: " + e.message);
  }
}

// 显示搜索结果
function showSearchResults(posts, topic) {
  const loading = document.getElementById('forumSearchLoading');
  const results = document.getElementById('forumSearchResults');
  
  if (loading) loading.style.display = 'none';
  
  if (results) {
    if (posts.length > 0) {
      results.innerHTML = `
        <div class="forum-search-stats">
          找到 ${posts.length} 条与「${escapeForumHtml(topic)}」相关的帖子
        </div>
        ${posts.map(post => renderForumPostItem(post)).join('')}
      `;
    } else {
      results.innerHTML = `
        <div class="forum-search-empty">
          <div class="forum-search-empty-icon">🔍</div>
          <div class="forum-search-empty-text">没有找到与「${escapeForumHtml(topic)}」相关的内容</div>
          <button class="forum-empty-btn" onclick="refreshSearchResults('${escapeForumHtml(topic)}')">重新搜索</button>
        </div>
      `;
    }
  }
}

// 显示搜索错误
function showSearchError(message) {
  const loading = document.getElementById('forumSearchLoading');
  const results = document.getElementById('forumSearchResults');
  
  if (loading) loading.style.display = 'none';
  
  if (results) {
    results.innerHTML = `
      <div class="forum-search-empty">
        <div class="forum-search-empty-icon"></div>
        <div class="forum-search-empty-text">${escapeForumHtml(message)}</div>
        <button class="forum-empty-btn" onclick="renderForumHot()">返回热点</button>
      </div>
    `;
  }
}

// 生成热门话题
function generateHotTopics() {
  const worldview = forumSettings.worldview || '';
  const forumName = forumSettings.forumName || '广场';
  
  // 基础话题模板
  const baseTopics = [
    { category: '热搜', tag: '今日讨论', count: Math.floor(Math.random() * 500) + 100, trend: 'up' },
    { category: '热搜', tag: '新鲜事', count: Math.floor(Math.random() * 300) + 80, trend: 'up' },
    { category: '娱乐', tag: '日常分享', count: Math.floor(Math.random() * 200) + 50, trend: 'stable' },
  ];
  
  // 根据世界观生成相关话题
  if (worldview) {
    // 提取世界观中的关键词
    const keywords = worldview.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
    const uniqueKeywords = [...new Set(keywords)].slice(0, 5);
    
    uniqueKeywords.forEach((kw, idx) => {
      baseTopics.push({
        category: forumName,
        tag: kw,
        count: Math.floor(Math.random() * 400) + 50,
        trend: ['up', 'stable', 'down'][Math.floor(Math.random() * 3)]
      });
    });
  }
  
  // 根据AI角色生成话题
  forumSettings.aiParticipants.forEach(p => {
    const char = characters?.find(c => String(c.id) === String(p.charId));
    const name = p.nickname || char?.name;
    if (name) {
      baseTopics.push({
        category: '角色',
        tag: name + '相关',
        count: Math.floor(Math.random() * 150) + 30,
        trend: 'up'
      });
    }
  });
  
  // 排序并返回前10个
  return baseTopics
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// 获取热门帖子（按互动量排序）
function getTrendingPosts() {
  if (forumPosts.length === 0) return [];
  
  // 过滤掉搜索结果帖子，只显示主页帖子
  const mainPosts = forumPosts.filter(p => !p.isSearchResult);
  
  // 计算每个帖子的热度分数
  const postsWithScore = mainPosts.map(post => {
    const commentCount = post.comments?.length || 0;
    const likes = post.likes || 0;
    const retweets = post.retweets || 0;
    const views = post.views || 0;
    
    // 热度公式：评论*10 + 点赞*5 + 转发*8 + 浏览*0.1
    const score = commentCount * 10 + likes * 5 + retweets * 8 + views * 0.1;
    
    return { ...post, hotScore: score };
  });
  
  // 按热度排序，取前5条
  return postsWithScore
    .sort((a, b) => b.hotScore - a.hotScore)
    .slice(0, 5);
}

// 提取世界观关键词
function extractWorldviewKeywords() {
  const worldview = forumSettings.worldview || '';
  const userIdentity = forumSettings.userIdentity || '';
  const combined = worldview + ' ' + userIdentity;
  
  // 提取2-4字的中文词汇
  const keywords = combined.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  const uniqueKeywords = [...new Set(keywords)];
  
  // 添加一些通用关键词
  const defaultKeywords = ['日常', '分享', '讨论', '求助', '推荐'];
  
  return [...uniqueKeywords.slice(0, 6), ...defaultKeywords].slice(0, 8);
}

// ==================== 个人主页 ====================

// 当前个人主页选中的tab
let currentProfileTab = 'posts';

function renderForumProfile(tab = 'posts') {
  currentProfileTab = tab;
  const feed = document.getElementById("forumFeed");
  if (!feed) return;
  
  // 【修复点1】优先读取 forumSettings 里的头像，如果没有，再读全局 localStorage，最后用默认
  // 这样即使主程序切换了角色，论坛里的“我”头像也不会变
  const userAvatar = forumSettings.userAvatar || localStorage.getItem("avatarImg") || getDefaultAvatarDataUrl();
  
  const userName = forumSettings.userNickname || "用户";
  const userHandle = forumSettings.userHandle || generateEnglishHandle(userName);
  const userBio = forumSettings.userBio || "";
  const userBanner = forumSettings.userBanner || "";
  const followingStr = forumSettings.userFollowingStr || formatFollowCount(forumSettings.userFollowing || 0);
  const followersStr = forumSettings.userFollowersStr || formatFollowCount(forumSettings.userFollowers || 0);
  const joinDate = forumSettings.userJoinDate || formatJoinDate(Date.now());
  
  // ... (中间获取帖子的逻辑保持不变，省略以节省空间) ...
  // 获取用户发布的帖子
  const userPosts = forumPosts.filter(p => p.authorType === 'user');
  const likedPosts = forumPosts.filter(p => p.liked);
  const repliedPosts = forumPosts.filter(p => p.comments && p.comments.some(c => c.authorType === 'user'));

  let contentHtml = '';
  // ... (Tab切换逻辑保持不变) ...
  if (tab === 'posts') {
      if (userPosts.length > 0) {
        const pinnedPosts = userPosts.filter(p => p.isPinned);
        const regularPosts = userPosts.filter(p => !p.isPinned);
        let postsHtml = '';
        pinnedPosts.forEach(post => {
          postsHtml += `<div class="forum-pinned-indicator"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 4.5C7 3.12 8.12 2 9.5 2h5C15.88 2 17 3.12 17 4.5v5.26L20.12 16H13v5l-1 2-1-2v-5H3.88L7 9.76V4.5z"/></svg><span>置顶</span></div>${renderForumPostItem(post)}`;
        });
        postsHtml += regularPosts.map(post => renderForumPostItem(post)).join("");
        contentHtml = postsHtml;
      } else {
        contentHtml = '<div class="forum-profile-no-posts">还没有发布任何帖子</div>';
      }
  } else if (tab === 'replies') {
    contentHtml = repliedPosts.length > 0 ? repliedPosts.map(post => renderProfileReplyItem(post)).join("") : '<div class="forum-profile-no-posts">还没有回复任何帖子</div>';
  } else if (tab === 'likes') {
    contentHtml = likedPosts.length > 0 ? likedPosts.map(post => renderForumPostItem(post)).join("") : '<div class="forum-profile-no-posts">还没有喜欢任何帖子</div>';
  }
  
  feed.innerHTML = `
    <div class="forum-profile forum-profile-immersive">
      <div class="forum-profile-banner-full" onclick="changeProfileBanner()">
        ${userBanner ? `<img src="${userBanner}" alt="">` : '<div class="forum-profile-banner-placeholder"></div>'}
        <div class="forum-profile-banner-hint">点击更换背景</div>
      </div>
      
      <div class="forum-profile-avatar-row">
        <!-- 【修复点2】确保头像 img 标签有 src -->
        <div class="forum-profile-avatar" onclick="changeProfileAvatar()">
          <img src="${userAvatar}" alt="" style="background:#fff;"> 
          <div class="forum-profile-avatar-hint">更换</div>
        </div>
        <div class="forum-profile-actions-row">
          <!-- 这里删除了原来的 forum-profile-dm-btn 按钮 -->
          <button class="forum-profile-edit-btn" onclick="openProfileEditor()">编辑个人资料</button>
        </div>
      </div>
      
      <div class="forum-profile-info">
        <div class="forum-profile-name">${escapeForumHtml(userName)}</div>
        <div class="forum-profile-handle">${userHandle.startsWith('@') ? userHandle : '@' + userHandle}</div>
        ${userBio ? `<div class="forum-profile-bio">${escapeForumHtml(userBio)}</div>` : ''}
        <div class="forum-profile-meta">
          <span class="forum-profile-join">📅 ${joinDate} 加入</span>
        </div>
        <div class="forum-profile-stats">
          <span class="forum-profile-stat"><strong>${followingStr}</strong> 正在关注</span>
          <span class="forum-profile-stat"><strong>${followersStr}</strong> 关注者</span>
        </div>
      </div>
      
      <div class="forum-profile-tabs">
        <div class="forum-profile-tab ${tab === 'posts' ? 'active' : ''}" onclick="renderForumProfile('posts')">帖子</div>
        <div class="forum-profile-tab ${tab === 'replies' ? 'active' : ''}" onclick="renderForumProfile('replies')">回复</div>
        <div class="forum-profile-tab ${tab === 'likes' ? 'active' : ''}" onclick="renderForumProfile('likes')">喜欢</div>
      </div>
      
      <div class="forum-profile-posts">${contentHtml}</div>
    </div>
  `;
  
  // 隐藏无关元素
  const tabs = document.querySelector('.forum-tabs'); if (tabs) tabs.style.display = 'none';
  const fab = document.querySelector('.forum-fab'); if (fab) fab.style.display = 'none';
  const forumContainer = document.querySelector('.forum-container'); if (forumContainer) forumContainer.style.paddingTop = '0';
}

// 渲染回复过的帖子（显示用户的回复）
function renderProfileReplyItem(post) {
  // 找到用户的评论
  const userComments = post.comments.filter(c => c.authorType === 'user');
  if (userComments.length === 0) return '';
  
  const lastComment = userComments[userComments.length - 1];
  
  // 获取用户头像
  const globalAvatar = localStorage.getItem("avatarImg");
  const userAvatar = globalAvatar || getDefaultAvatarDataUrl();
  const userName = forumSettings.userNickname || "我";
  const userHandle = forumSettings.userHandle || generateEnglishHandle(userName);
  
  // 确定回复的对象
  let replyTargetName = '';
  let replyTargetContent = '';
  let replyTargetAvatar = '';
  
  if (lastComment.replyToName) {
    // 用户回复的是某条评论
    replyTargetName = lastComment.replyToName;
    // 找到被回复的评论
    const targetComment = post.comments.find(c => c.id === lastComment.replyTo);
    if (targetComment) {
      replyTargetContent = targetComment.content?.substring(0, 50) + (targetComment.content?.length > 50 ? '...' : '');
      replyTargetAvatar = targetComment.authorAvatar
        ? `<img src="${targetComment.authorAvatar}" alt="">`
        : getAvatarEmoji(targetComment.authorName);
    }
  } else {
    // 用户回复的是帖子本身
    replyTargetName = post.authorName;
    replyTargetContent = post.content?.substring(0, 50) + (post.content?.length > 50 ? '...' : '');
    replyTargetAvatar = post.authorAvatar
      ? `<img src="${post.authorAvatar}" alt="">`
      : getAvatarEmoji(post.authorName);
  }
  
  const contextText = lastComment.replyToName 
    ? `回复 @${escapeForumHtml(lastComment.replyToName)} 的评论`
    : `回复 @${escapeForumHtml(post.authorName)} 的帖子`;
  
  return `
    <div class="forum-reply-item" onclick="openForumPostDetail(${post.id})">
      <div class="forum-reply-context">
        <span class="forum-reply-context-icon">↩</span>
        ${contextText}
      </div>
      <div class="forum-post">
        <div class="forum-post-left">
          <div class="forum-post-avatar">
            <img src="${userAvatar}" alt="">
          </div>
        </div>
        <div class="forum-post-right">
          <div class="forum-post-header">
            <span class="forum-post-name">${escapeForumHtml(userName)}</span>
            <span class="forum-author-tag user">我</span>
            <div class="forum-post-meta">
              <span>@${userHandle}</span>
              <span>·</span>
              <span>${formatForumTime(lastComment.timestamp)}</span>
            </div>
          </div>
          <div class="forum-post-content">${escapeForumHtml(lastComment.content)}</div>
        </div>
      </div>
      <div class="forum-reply-original">
        <div class="forum-reply-original-avatar">${replyTargetAvatar}</div>
        <div class="forum-reply-original-content">
          <span class="forum-reply-original-name">${escapeForumHtml(replyTargetName)}</span>
          <span class="forum-reply-original-text">${escapeForumHtml(replyTargetContent)}</span>
        </div>
      </div>
    </div>
  `;
}

// ==================== 查看他人主页 ====================

// 当前查看的其他用户信息
let currentViewingUser = null;

// 打开他人主页 (完整版：包含自动关注逻辑)
async function openOtherUserProfile(authorType, authorName, authorId) {
  // 1. 如果是点击了用户自己，跳转到个人资料页
  if (authorType === 'user') {
    switchForumSection('profile');
    return;
  }
  
  const feed = document.getElementById("forumFeed");
  if (!feed) return;
  
  let userInfo = null;
  const targetName = (authorName || '').trim();
  
  // --- 1. 尝试从 AI 参与者中查找 ---
  let participant = null;
  let char = null;
  
  // 1a. 先用 ID 精确查找
  if (authorId) {
    participant = forumSettings.aiParticipants.find(p => String(p.charId) === String(authorId));
    char = characters.find(c => String(c.id) === String(authorId));
  }
  
  // 1b. 如果找不到，用名字精确查找
  if (!participant && !char) {
     participant = forumSettings.aiParticipants.find(p => {
         const nick = (p.nickname || '').trim().toLowerCase();
         const c = characters.find(ch => String(ch.id) === String(p.charId));
         const cName = (c?.name || '').trim().toLowerCase();
         const searchName = targetName.toLowerCase();
         return (nick && searchName === nick) || (cName && searchName === cName);
     });
     
     if (participant) {
         char = characters.find(c => String(c.id) === String(participant.charId));
     }
  }

  // 1c. 甚至如果 participant 没找到，但在 characters 里有这个名字
  if (!participant && !char) {
      char = characters.find(c => c.name === targetName || targetName.includes(c.name));
      // 如果在全局角色里找到了，但在论坛参与者里没找到，我们临时构建一个
      if (char) {
          participant = { 
              charId: char.id, 
              nickname: char.name, 
              avatar: char.avatar 
          };
      }
  }

  if (participant || char) {
    // 确保头像存在
    const finalAvatar = participant?.avatar || char?.avatar || getDefaultAvatarDataUrl();
    
    userInfo = {
      type: 'ai',
      id: participant?.charId || char?.id, // 记录ID
      name: participant?.nickname || char?.name || authorName,
      handle: participant?.handle || generateEnglishHandle(authorName),
      avatar: finalAvatar, 
      banner: participant?.banner || '',
      bio: participant?.bio || (char?.description ? char.description.substring(0, 50) : ''),
      identity: participant?.identity || '',
      fullPersona: getCharacterFullPersona(participant || {charId: char.id}), 
      following: participant?.following || Math.floor(Math.random() * 200),
      followers: participant?.followers || Math.floor(Math.random() * 5000),
      joinDate: participant?.joinDate || '2024年1月',
    };
  } 
  
  // --- 2. 尝试从 NPC 中查找 ---
  if (!userInfo) {
     const npc = (forumSettings.npcs || []).find(n => 
        String(n.id) === String(authorId) || n.name === targetName || targetName.includes(n.name)
     );
     
     if (npc) {
        userInfo = {
            type: 'npc',
            id: npc.id, // 记录ID
            name: npc.name,
            handle: npc.handle || generateEnglishHandle(npc.name),
            avatar: npc.avatar || getDefaultAvatarDataUrl(),
            banner: npc.banner || '',
            bio: npc.bio || '',
            identity: npc.identity || '',
            fullPersona: npc.persona || '', 
            following: npc.following || 0,
            followers: npc.followers || 0,
            joinDate: npc.joinDate || '2025年1月',
        };
     }
  }
  
  // --- 3. 实在找不到，才是路人 ---
  if (!userInfo) {
    userInfo = {
      type: 'random',
      id: authorName, // 路人使用名字作为ID
      name: authorName,
      handle: generateEnglishHandle(authorName),
      avatar: getDefaultAvatarDataUrl(), 
      banner: '',
      bio: '这个用户很神秘，什么都没写。',
      identity: '',
      fullPersona: '普通网友',
      following: Math.floor(Math.random() * 100),
      followers: Math.floor(Math.random() * 20),
      joinDate: formatJoinDate(Date.now()),
    };
  }
  
  // 保存当前正在查看的用户信息
  currentViewingUser = userInfo;
  
  // ============================================================
  // ★★★ 核心新增：自动关注逻辑 ★★★
  // ============================================================
   if (!forumSettings.followedUsers) forumSettings.followedUsers = [];
  
  // 获取目标唯一标识
  const targetId = String(userInfo.id || userInfo.name);
  
  // 检查是否已关注，未关注则添加
  if (!forumSettings.followedUsers.includes(targetId)) {
      // 1. 加入名单
      forumSettings.followedUsers.push(targetId);
      
      // 2. ★★★ 关键修复：同步更新你的“正在关注”数字 ★★★
      // 让显示的数字等于实际关注列表的长度
      forumSettings.userFollowing = forumSettings.followedUsers.length;
      // 格式化一下（比如变成 1.2k 这种格式，虽然刚开始肯定是整数）
      forumSettings.userFollowingStr = formatFollowCount(forumSettings.userFollowing);
      
      // 3. 保存设置
      await localforage.setItem("forumSettings", forumSettings);
      
      // 4. 视觉反馈：给对方涨个粉（仅视觉）
      userInfo.followers = (userInfo.followers || 0) + 1;
      
      showToast(`已自动关注 ${userInfo.name}`);
  }
  // ============================================================
  
  // 隐藏无关元素
  const tabs = document.querySelector('.forum-tabs'); if (tabs) tabs.style.display = 'none';
  const fab = document.querySelector('.forum-fab'); if (fab) fab.style.display = 'none';
  const forumContainer = document.querySelector('.forum-container'); if (forumContainer) forumContainer.style.paddingTop = '0';
  
  const existingPosts = forumPosts.filter(p => 
    p.authorName === userInfo.name && p.authorType !== 'user'
  );
  
  renderOtherUserProfile(userInfo, existingPosts, true);
  
  if (existingPosts.length < 3) {
    await generateUserProfilePosts(userInfo);
  }
}
// 渲染其他用户主页
function renderOtherUserProfile(userInfo, posts, isLoading = false) {
  const feed = document.getElementById("forumFeed");
  if (!feed) return;
  
  const avatarContent = userInfo.avatar 
    ? `<img src="${userInfo.avatar}" alt="">` 
    : getAvatarEmoji(userInfo.name);
  
  const bannerHtml = userInfo.banner
    ? `<img src="${userInfo.banner}" alt="">`
    : '<div class="forum-profile-banner-placeholder"></div>';
  
  // 默认值
  const following = userInfo.following || Math.floor(Math.random() * 500 + 50);
  const followers = userInfo.followers || Math.floor(Math.random() * 2000 + 100);
  const joinDate = userInfo.joinDate || formatJoinDate(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000 * 2);
  
  // 找出置顶帖子
  const pinnedPost = posts.find(p => p.isPinned);
  const regularPosts = posts.filter(p => !p.isPinned);
  
  // 帖子HTML
  let postsHtml = '';
  if (pinnedPost) {
    postsHtml += `
      <div class="forum-pinned-indicator">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M7 4.5C7 3.12 8.12 2 9.5 2h5C15.88 2 17 3.12 17 4.5v5.26L20.12 16H13v5l-1 2-1-2v-5H3.88L7 9.76V4.5z"/>
        </svg>
        <span>置顶</span>
      </div>
      ${renderForumPostItem(pinnedPost)}
    `;
  }
  postsHtml += regularPosts.map(p => renderForumPostItem(p)).join('');
  
  if (isLoading && posts.length === 0) {
    postsHtml = `
      <div class="forum-search-loading">
        <div class="forum-search-spinner"></div>
        <div class="forum-search-loading-text">正在加载主页内容...</div>
      </div>
    `;
  } else if (posts.length === 0) {
    postsHtml = '<div class="forum-profile-no-posts">还没有发布任何帖子</div>';
  }
  
  feed.innerHTML = `
    <div class="forum-profile forum-profile-immersive forum-other-profile">
      <!-- 返回按钮（悬浮） -->
      <button class="forum-other-profile-back" onclick="closeOtherUserProfile()">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
      </button>
      
      <!-- 背景图 -->
      <div class="forum-profile-banner-full">
        ${bannerHtml}
      </div>
      
      <!-- 头像和关注按钮 -->
      <div class="forum-profile-avatar-row">
        <div class="forum-profile-avatar">
          ${avatarContent}
        </div>
        <button class="forum-profile-follow-btn" onclick="showToast('已关注 ${escapeForumHtml(userInfo.name)}')">关注</button>
      </div>
      
      <!-- 用户信息 -->
      <div class="forum-profile-info">
        <div class="forum-profile-name">${escapeForumHtml(userInfo.name)}</div>
        <div class="forum-profile-handle">${userInfo.handle.startsWith('@') ? userInfo.handle : '@' + userInfo.handle}</div>
        ${userInfo.bio ? `<div class="forum-profile-bio">${escapeForumHtml(userInfo.bio)}</div>` : ''}
        <div class="forum-profile-meta">
          <span class="forum-profile-join">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M7 4V3h2v1h6V3h2v1h1.5C19.89 4 21 5.12 21 6.5v12c0 1.38-1.11 2.5-2.5 2.5h-13C4.12 21 3 19.88 3 18.5v-12C3 5.12 4.12 4 5.5 4H7zm0 2H5.5c-.27 0-.5.22-.5.5v12c0 .28.23.5.5.5h13c.28 0 .5-.22.5-.5v-12c0-.28-.22-.5-.5-.5H17v1h-2V6H9v1H7V6zm0 6h2v-2H7v2zm0 4h2v-2H7v2zm4-4h2v-2h-2v2zm0 4h2v-2h-2v2zm4-4h2v-2h-2v2z"/>
            </svg>
            ${joinDate} 加入
          </span>
        </div>
        <div class="forum-profile-stats">
          <span class="forum-profile-stat">
            <strong>${following}</strong> 正在关注
          </span>
          <span class="forum-profile-stat">
            <strong>${followers}</strong> 关注者
          </span>
        </div>
      </div>
      
      <!-- 标签页 -->
      <div class="forum-profile-tabs">
        <div class="forum-profile-tab active">帖子</div>
      </div>
      
      <!-- 内容列表 -->
      <div class="forum-profile-posts">
        ${postsHtml}
      </div>
      
      <!-- 生成更多帖子按钮 -->
      <div class="forum-generate-more-posts">
        <button onclick="generateUserProfilePosts(currentViewingUser)" class="forum-generate-btn">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          生成更多帖子
        </button>
      </div>
    </div>
  `;
}

// 关闭其他用户主页
function closeOtherUserProfile() {
  currentViewingUser = null;
  
  // 恢复顶栏
  const tabs = document.querySelector('.forum-tabs');
  const fab = document.querySelector('.forum-fab');
  if (tabs) tabs.style.display = 'flex';
  if (fab) fab.style.display = 'flex';
  
  // 恢复safe area
  const forumContainer = document.querySelector('.forum-container');
  if (forumContainer) forumContainer.style.paddingTop = '';
  
  renderForumFeed();
}

// 生成用户主页帖子 (修复版：强化人设一致性)
async function generateUserProfilePosts(userInfo) {
  if (!userInfo) return;
  
  const apiConfig = getActiveApiConfig();
  if (!apiConfig || !apiConfig.url || !apiConfig.key) {
    showToast("请先配置API");
    return;
  }
  
  showToast(`正在生成 ${userInfo.name} 的论坛...`);
  
  // 1. 获取完整人设（这是之前缺失的关键）
  const persona = userInfo.fullPersona || userInfo.identity || '普通用户';
  const bioInfo = userInfo.bio || '';
  
  // 2. 获取世界书内容，增加上下文
  const contextText = `${forumSettings.worldview}\n${userInfo.name}\n${persona}`;
  const worldbookContent = getForumWorldbookContent(contextText);
  
  try {
    // ★★★ 核心修复：完全重写提示词，强调角色扮演 ★★★
    const prompt = `你现在正在进行角色扮演（Roleplay）。
请你扮演以下角色，在论坛的个人主页发布 5-8 条新的历史帖子。

【角色信息】
- 名字：${userInfo.name}
- 个人简介：${bioInfo || '无'}
- **核心人设与性格（重要）：**
${persona}

【世界观背景】
${forumSettings.worldview || '现代都市'}
${worldbookContent ? '\n【相关设定/世界书】\n' + worldbookContent : ''}

【发帖要求】
1. **必须严格符合角色的性格、语气和口癖！** 
   - 如果角色是高冷的，不要发“求资源”或“互评身材”这种帖子。
   - 如果角色是羞涩的，不要发过于奔放的内容。
   - 如果角色是反派，内容应该体现其野心或阴暗面。
2. 内容要围绕角色的生活、兴趣、烦恼或对世界观中事件的看法。
3. 也就是“这个角色在这个世界里会发什么朋友圈/推特”。
4. 第一条帖子建议是置顶帖（如自我介绍、重要声明或置顶的日常）。
5. 禁止使用 [表情] 这种格式，请直接使用 emoji (如 😊, 💢, ❤️)。
6. 返回纯 JSON 数组格式。

JSON 格式模板：
[
  {
    "content": "帖子具体内容...",
    "isPinned": true/false (第一条设为true，其他false),
    "likes": 随机整数(根据角色人气),
    "retweets": 随机整数,
    "views": 随机整数
  }
]

请只返回 JSON，不要包含 Markdown 代码块标记或其他文字。`;

    const response = await fetch(`${apiConfig.url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiConfig.key}`,
      },
      body: JSON.stringify({
        model: apiConfig.model || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9, // 稍微降低温度，防止太发散
        max_tokens: parseInt(document.getElementById('apiMaxTokens')?.value) || 2048,
      }),
    });

    if (!response.ok) throw new Error("API请求失败");

    const data = await response.json();
    let content = data.choices[0]?.message?.content || "";

    // 清洗 JSON
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = content.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      const newPosts = JSON.parse(jsonMatch[0]);
      
      newPosts.forEach((postData, idx) => {
        const newPost = {
          id: Date.now() + idx,
          authorType: userInfo.type === 'ai' ? 'ai' : 'npc',
          authorId: userInfo.id || null,
          authorName: userInfo.name,
          authorAvatar: userInfo.avatar || '',
          handle: userInfo.handle,
          content: postData.content,
          // 生成最近7天内的时间，稍微错开
          timestamp: Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000) - (idx * 3600000), 
          likes: postData.likes || Math.floor(Math.random() * 50),
          liked: false,
          retweets: postData.retweets || Math.floor(Math.random() * 10),
          views: postData.views || Math.floor(Math.random() * 500),
          comments: [],
          isPinned: postData.isPinned || false,
          isProfileGenerated: true, // 标记为主页生成的帖子
        };
        
        forumPosts.unshift(newPost);
      });

      await localforage.setItem("forumPosts", forumPosts);
      
      // 重新渲染主页
      const userPosts = forumPosts.filter(p => 
        p.authorName === userInfo.name && p.authorType !== 'user'
      );
      renderOtherUserProfile(userInfo, userPosts, false);
      
      showToast(`已生成 ${newPosts.length} 条动态`);
    }
  } catch (e) {
    console.error("[论坛] 生成用户帖子失败:", e);
    showToast("生成失败: " + e.message);
  }
}
// ==================== 置顶帖子功能 ====================

// 切换帖子置顶状态
async function togglePinPost(postId) {
  const post = forumPosts.find(p => p.id === postId);
  if (!post) return;
  
  // 只能置顶自己的帖子
  if (post.authorType !== 'user') {
    showToast('只能置顶自己的帖子');
    return;
  }
  
  // 如果要置顶，先取消其他置顶
  if (!post.isPinned) {
    forumPosts.forEach(p => {
      if (p.authorType === 'user' && p.isPinned) {
        p.isPinned = false;
      }
    });
  }
  
  post.isPinned = !post.isPinned;
  await localforage.setItem("forumPosts", forumPosts);
  
  showToast(post.isPinned ? '已置顶' : '已取消置顶');
  
  // 如果在个人主页，刷新显示
  if (window.currentForumSection === 'profile') {
    renderForumProfile();
  }
}

// ==================== 粉丝数量动态变化 ====================

// 更新用户粉丝数量
async function updateUserFollowers(action) {
  // 获取当前粉丝数
  let currentFollowers = forumSettings.userFollowers || 0;
  
  // 根据行为计算变化
  let change = 0;
  if (action === 'post') {
    // 发帖：+1到+10，偶尔-1到-3
    change = Math.random() > 0.15 
      ? Math.floor(Math.random() * 10) + 1  // 85%概率涨粉
      : -Math.floor(Math.random() * 3) - 1; // 15%概率掉粉
  } else if (action === 'comment') {
    // 评论：+0到+5，偶尔-1
    change = Math.random() > 0.2
      ? Math.floor(Math.random() * 6)       // 80%概率涨粉
      : -1;                                  // 20%概率掉1个粉
  }
  
  // 确保粉丝数不会变成负数
  currentFollowers = Math.max(0, currentFollowers + change);
  
  // 保存更新
  forumSettings.userFollowers = currentFollowers;
  forumSettings.userFollowersStr = formatFollowCount(currentFollowers);
  await localforage.setItem("forumSettings", forumSettings);
  
  // 如果粉丝变化明显，显示提示
  if (change > 3) {
    showToast(`粉丝 +${change} 🎉`);
  } else if (change < -1) {
    showToast(`粉丝 ${change} 😢`);
  }
}

// ==================== 私信功能 ====================

// 私信数据
let forumDirectMessages = [];

// 初始化私信数据
async function initDirectMessages() {
  forumDirectMessages = await localforage.getItem("forumDirectMessages") || [];
}

// [修改] 打开私信
async function openDirectMessages() {
  await initDirectMessages();
  renderDirectMessagesList();
}

// [重写] 渲染私信列表 (全屏 Overlay 模式)
function renderDirectMessagesList() {
  // 1. 如果已经存在，先移除（防止重复）
  const existing = document.querySelector('.forum-dm-page');
  if (existing) existing.remove();

  // 2. 准备数据 HTML (保持原有逻辑)
  const sortedConversations = [...forumDirectMessages].sort((a, b) => 
    (b.lastMessageTime || 0) - (a.lastMessageTime || 0)
  );

  const conversationsHtml = sortedConversations.length > 0 
    ? sortedConversations.map(conv => {
        const avatarContent = conv.avatar 
          ? `<img src="${conv.avatar}" alt="">` 
          : getAvatarEmoji(conv.name);
        const unreadBadge = conv.unread > 0 
          ? `<span class="forum-dm-unread">${conv.unread}</span>` 
          : '';
        const timeStr = conv.lastMessageTime ? formatForumTime(conv.lastMessageTime) : '';
        
        return `
          <div class="forum-dm-item" onclick="openDirectMessageChat('${conv.id}')">
            <div class="forum-dm-avatar">${avatarContent}</div>
            <div class="forum-dm-content">
              <div class="forum-dm-header">
                <span class="forum-dm-name">${escapeForumHtml(conv.name)}</span>
                <span class="forum-dm-time">${timeStr}</span>
              </div>
              <div class="forum-dm-preview">${escapeForumHtml(conv.lastMessage || '暂无消息')}</div>
            </div>
            ${unreadBadge}
          </div>
        `;
      }).join('')
    : '<div class="forum-dm-empty">暂无私信</div>';

  // 3. 创建全屏容器
  const dmPage = document.createElement('div');
  dmPage.className = 'forum-dm-page';
  dmPage.innerHTML = `
      <div class="forum-dm-header-bar">
        <!-- ★★★ 返回按钮在此 ★★★ -->
        <button class="forum-dm-back" onclick="closeDirectMessages()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        
        <span class="forum-dm-title">私信</span>
        
        <button class="forum-dm-generate" onclick="generateNewDirectMessages()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        </button>
      </div>
      <div class="forum-dm-list">
        ${conversationsHtml}
      </div>
  `;

  // 4. 添加到 body，实现全屏覆盖
  document.body.appendChild(dmPage);
}

// [重写] 关闭私信页面
function closeDirectMessages() {
  const page = document.querySelector('.forum-dm-page');
  if (page) page.remove();
  
  // 同时也要移除可能存在的聊天详情页
  const chatPage = document.querySelector('.forum-dm-chat');
  if (chatPage) chatPage.remove();
}

// ==================== [核心修改] 1. 总控函数：替换掉原来的 generateNewDirectMessages ====================

// [修改] 总控函数：带调试反馈的刷新
async function generateNewDirectMessages() {
  const btn = document.querySelector('.forum-dm-generate');
  
  // 视觉反馈：开始旋转
  if (btn) btn.classList.add('spinning'); 
  showToast("正在接收私信..."); // ★ 新增：提示正在运行

  try {
    const apiConfig = getActiveApiConfig();
    if (!apiConfig || !apiConfig.url || !apiConfig.key) {
      showToast("错误：请先配置API");
      return;
    }

    console.log("[私信] 开始请求 API...");

    // 并行执行：回复旧消息 和 获取新消息 分开处理，互不干扰
    const [repliedCount, newMsgCount] = await Promise.all([
      processPendingRepliesInternal(apiConfig), 
      fetchNewRandomDMsInternal(apiConfig)      
    ]);

    console.log(`[私信] 请求结束。回复: ${repliedCount}, 新增: ${newMsgCount}`);

    // 只要有任何变化，就刷新界面
    if (repliedCount > 0 || newMsgCount > 0) {
      // 按时间倒序排序
      forumDirectMessages.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      await localforage.setItem("forumDirectMessages", forumDirectMessages);
      renderDirectMessagesList();
      showToast(`刷新成功：${newMsgCount}条新私信`);
    } else {
      // ★ 关键：如果是0条，告诉用户为什么
      showToast("📭 暂无新消息 (AI认为现在很安静)");
    }

  } catch (e) {
    console.error("[私信] 刷新严重错误:", e);
    showToast(`❌ 刷新出错: ${e.message}`);
  } finally {
    // 停止旋转
    if (btn) btn.classList.remove('spinning'); 
  }
}

// [三级防抖 + 上下文感知版] 内部生成函数
async function fetchNewRandomDMsInternal(apiConfig) {
  try {
    // ================= 1. 数据收集与上下文构建 =================

    // 1.1 基础信息
    const worldview = forumSettings.worldview || "现代都市";
    const myName = forumSettings.userNickname || "我";
    const myIdentity = forumSettings.userIdentity || "普通用户";
    
    // 1.2 获取用户最近发布的帖子 (最多3条，作为私信的话题来源)
    const myRecentPosts = forumPosts
      .filter(p => p.authorType === 'user')
      .slice(0, 3)
      .map((p, index) => {
          const timeStr = formatForumTime(p.timestamp);
          // 如果帖子有图，标记一下
          const hasImg = (p.images && p.images.length > 0) ? "[包含图片]" : "";
          return `${index + 1}. [${timeStr}发布] ${p.content} ${hasImg}`;
      })
      .join("\n");

    // 1.3 获取已知关系网 (AI角色 + NPC + 定义的关系)
    // 目的：让 AI 优先扮演这些人给你发消息，而不是总是生成陌生人
    let relationshipsContext = "";
    
    // 处理 AI 角色
    const aiChars = forumSettings.aiParticipants.map(p => {
        const char = characters.find(c => String(c.id) === String(p.charId));
        const name = p.nickname || char?.name || "未知角色";
        // 查找有没有特殊关系定义
        const rel = forumSettings.relationships?.find(r => 
            (r.person1Type === 'user' && String(r.person2Id) === String(p.charId)) ||
            (r.person2Type === 'user' && String(r.person1Id) === String(p.charId))
        );
        const relDesc = rel ? `与用户的关系：${rel.relationship} (${rel.description})` : "关系：相识";
        const persona = p.identity || char?.persona || "";
        return `- ${name} (AI角色): ${relDesc}。性格/身份：${persona.substring(0, 50)}...`;
    });

    // 处理 NPC
    const npcChars = (forumSettings.npcs || []).map(n => {
        const rel = forumSettings.relationships?.find(r => 
            (r.person1Type === 'user' && String(r.person2Id) === String(n.id)) ||
            (r.person2Type === 'user' && String(r.person1Id) === String(n.id))
        );
        const relDesc = rel ? `与用户的关系：${rel.relationship}` : "关系：熟人/网友";
        return `- ${n.name} (NPC): ${relDesc}。身份：${n.identity || "普通NPC"}`;
    });

    const knownContacts = [...aiChars, ...npcChars].join("\n");

    // 1.4 准备黑名单 (防止自己给自己发)
    const blacklist = [myName, "User", "user", "用户", "楼主", "系统"];


    // ================= 2. 构造 Prompt =================

    const prompt = `你是一个基于上下文的角色扮演私信生成器。
当前世界观：${worldview}
接收者（用户）：${myName}
接收者身份：${myIdentity}

【用户的最近动态（重要参考）】
${myRecentPosts || "（用户暂时没有发布帖子）"}

【用户的已知关系网】
${knownContacts || "（暂无特定关系人，请生成陌生的粉丝或路人）"}

【任务目标】
生成 2 到 4 条发给 "${myName}" 的私信。
私信来源可以是【已知关系网】中的人，也可以是完全陌生的【路人/粉丝】。

【生成逻辑要求】
1. **基于帖子**：如果用户最近发了帖子，请安排 1-2 个路人或熟人针对帖子内容发表评论（如夸赞图片、反驳观点、单纯吃瓜）。
2. **基于关系**：如果【已知关系网】有人，请安排 1-2 个熟人根据他们与用户的关系发消息（如情侣的问候、死对头的嘲讽、朋友的闲聊）。
3. **基于人设**：不要胡编乱造用户没做过的事。聊天内容必须符合发送者的性格和与用户的关系。
4. **格式**：返回标准 JSON 数组。内容中如果包含引号，**必须使用单引号 ' **。

JSON 模板：
[
  {"senderName": "熟人名字", "content": "嘿，刚看到你发的照片，那个地方是哪里呀？", "type": "known"},
  {"senderName": "路人ID", "content": "楼主好，非常认同你的观点！", "type": "stranger"}
]

【黑名单】: ${JSON.stringify(blacklist)}
禁止扮演用户本人。`;

    console.log("[私信] 正在请求 API (上下文感知版)...");

    const response = await fetch(`${apiConfig.url}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiConfig.key}` },
        body: JSON.stringify({ 
          model: apiConfig.model || "gpt-3.5-turbo", 
          messages: [{ role: "user", content: prompt }], 
          temperature: 0.9, // 保持高创造性
          max_tokens: parseInt(document.getElementById('apiMaxTokens')?.value) || 2048
        })
    });

    if (!response.ok) throw new Error("API请求失败 " + response.status);
    const data = await response.json();
    let content = data.choices[0]?.message?.content || "";
    
    // 预处理
    content = content.replace(/```json/gi, "").replace(/```/g, "").trim();

    let msgs = [];
    
    // ================= 3. 解析策略 (三级防抖) =================

    // 级别1: 标准解析
    try {
        msgs = JSON.parse(content);
    } catch (e1) {
        // 级别2: 对象提取
        const objectMatches = content.match(/\{[\s\S]*?\}/g);
        if (objectMatches) {
            objectMatches.forEach(str => { try { msgs.push(JSON.parse(str)); } catch(e){} });
        }
        
        // 级别3: 暴力扫描 (保底)
        if (msgs.length === 0) {
            const nameReg = /"senderName"\s*:\s*(["'])([\s\S]*?)\1/g;
            const contentReg = /"content"\s*:\s*(["'])([\s\S]*?)\1/g;
            let nameMatch, contentMatch;
            const names = []; const contents = [];
            while ((nameMatch = nameReg.exec(content)) !== null) names.push(nameMatch[2]);
            while ((contentMatch = contentReg.exec(content)) !== null) contents.push(contentMatch[2]);
            const count = Math.min(names.length, contents.length);
            for (let i=0; i<count; i++) msgs.push({senderName: names[i], content: contents[i]});
        }
    }

    // ================= 4. 智能匹配头像与入库 =================
    if (!Array.isArray(msgs)) msgs = [];
    let count = 0;
    
    msgs.forEach(msg => {
        if (!msg || !msg.senderName || !msg.content) return;
        let sName = String(msg.senderName).trim();
        let sContent = String(msg.content).trim();
        
        // 黑名单过滤
        if (sName.includes(myName)) return;
        
        // === 智能匹配头像和ID ===
        // 尝试判断这个人是不是 AI角色 或 NPC，以便关联头像和ID
        let finalAvatar = "";
        let finalId = `npc_dm_${Date.now()}_${Math.random().toString(36).substr(2,5)}`; // 默认ID
        
        // 1. 尝试匹配 AI 角色
        const aiParticipant = forumSettings.aiParticipants.find(p => {
             const c = characters.find(ch => String(ch.id) === String(p.charId));
             const pName = p.nickname || c?.name || "";
             return pName && (sName === pName || sName.includes(pName));
        });

        if (aiParticipant) {
             const c = characters.find(ch => String(ch.id) === String(aiParticipant.charId));
             finalAvatar = aiParticipant.avatar || c?.avatar || "";
             sName = aiParticipant.nickname || c?.name || sName; // 修正名字为标准名
             finalId = `ai_${aiParticipant.charId}`; // 使用特殊前缀ID，方便后续识别
        } 
        // 2. 尝试匹配 NPC
        else {
             const npc = (forumSettings.npcs || []).find(n => n.name && (sName === n.name || sName.includes(n.name)));
             if (npc) {
                 finalAvatar = npc.avatar || "";
                 sName = npc.name;
                 finalId = `npc_${npc.id}`;
             }
        }

        // 检查是否已存在该会话，如果存在则追加，不存在则新建
        let existingConv = forumDirectMessages.find(c => c.name === sName || c.id === finalId);
        
        if (existingConv) {
            // 已存在会话，追加消息
            existingConv.messages.push({
                id: Date.now(),
                sender: 'other',
                content: sContent,
                timestamp: Date.now()
            });
            existingConv.unread = (existingConv.unread || 0) + 1;
            existingConv.lastMessage = sContent;
            existingConv.lastMessageTime = Date.now();
            // 更新头像（如果之前没有）
            if (!existingConv.avatar && finalAvatar) existingConv.avatar = finalAvatar;
        } else {
            // 新会话
            forumDirectMessages.push({
                id: finalId,
                name: sName,
                avatar: finalAvatar, 
                type: finalId.startsWith('ai_') ? 'ai' : 'npc', 
                messages: [{ id: Date.now(), sender: 'other', content: sContent, timestamp: Date.now() }],
                unread: 1,
                lastMessage: sContent,
                lastMessageTime: Date.now(),
            });
        }
        count++;
    });

    return count;

  } catch (e) {
    console.error("[私信] 严重错误:", e);
    return 0;
  }
}
// ==================== [核心修改] 2. 辅助函数：请粘贴到 generateNewDirectMessages 后面 ====================

// [修改] 内部任务A：处理待回复消息 (融入世界观)
async function processPendingRepliesInternal(apiConfig) {
  const pendingConversations = forumDirectMessages.filter(c => {
    const lastMsg = c.messages[c.messages.length - 1];
    return lastMsg && lastMsg.sender === 'user';
  });

  if (pendingConversations.length === 0) return 0;

  // 准备通用世界观数据，避免循环里重复获取
  const worldview = forumSettings.worldview || "现代都市";
  const userIdentity = forumSettings.userIdentity || "普通用户";
  
  // 获取世界书内容 (稍微通用一点的上下文)
  const baseContext = `${worldview}\n${userIdentity}`;
  const worldbookContent = getForumWorldbookContent(baseContext);

  let successCount = 0;

  const replyPromises = pendingConversations.map(async (conversation) => {
    try {
      // 准备对话历史
      const recentMessages = conversation.messages.slice(-6).map(m => 
        `${m.sender === 'user' ? '用户' : conversation.name}：${m.content}`
      ).join('\n');
      
      // ★★★ 融入世界观的 Prompt ★★★
      const prompt = `你正在进行角色扮演。请扮演 "${conversation.name}" 回复用户的私信。

【世界观】
${worldview}
${worldbookContent ? '\n【设定参考】\n' + worldbookContent : ''}

【用户身份】${userIdentity}

【对话历史】
${recentMessages}

要求：
1. 坚守 "${conversation.name}" 的人设（虽然是路人/NPC，也要符合名字暗示的身份）。
2. 回复自然、简短、符合世界观逻辑。
3. 只输出回复内容。`;

      const response = await fetch(`${apiConfig.url}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiConfig.key}` },
        body: JSON.stringify({
          model: apiConfig.model || "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.9,
          max_tokens: 150 
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const reply = data.choices[0]?.message?.content?.trim();
        if (reply) {
          conversation.messages.push({
            id: Date.now() + Math.random(),
            sender: 'other',
            content: reply,
            timestamp: Date.now(),
          });
          conversation.lastMessage = reply;
          conversation.lastMessageTime = Date.now();
          conversation.unread = (conversation.unread || 0) + 1;
          successCount++;
        }
      }
    } catch (e) {
      console.warn(`回复 ${conversation.name} 失败`, e);
    }
  });

  await Promise.all(replyPromises);
  return successCount;
}

// 当前私信会话ID
let currentDMConversationId = null;

// [修改] 打开私信聊天 (修复红点不消失问题)
function openDirectMessageChat(conversationId) {
  const conversation = forumDirectMessages.find(c => c.id === conversationId);
  if (!conversation) return;
  
  currentDMConversationId = conversationId;
  
  // 1. 数据层：标记为已读
  if (conversation.unread > 0) {
    conversation.unread = 0;
    localforage.setItem("forumDirectMessages", forumDirectMessages); // 异步保存
    
    const listItems = document.querySelectorAll('.forum-dm-item');
    listItems.forEach(item => {
      if (item.getAttribute('onclick')?.includes(`'${conversationId}'`)) {
        const badge = item.querySelector('.forum-dm-unread');
        if (badge) {
          badge.style.display = 'none'; // 立即隐藏
          badge.remove(); // 或者直接移除
        }
      }
    });
  }
  
  renderDirectMessageChat(conversation);
}

// [重写] 渲染聊天详情页
function renderDirectMessageChat(conversation) {
  // 移除可能已存在的聊天页
  const existing = document.querySelector('.forum-dm-chat');
  if (existing) existing.remove();

  const avatarContent = conversation.avatar 
    ? `<img src="${conversation.avatar}" alt="">` 
    : getAvatarEmoji(conversation.name);
  
  const messagesHtml = (conversation.messages || []).map(msg => {
    const isMine = msg.sender === 'user';
    return `
      <div class="forum-dm-message ${isMine ? 'mine' : 'other'}">
        ${!isMine ? `<div class="forum-dm-msg-avatar">${avatarContent}</div>` : ''}
        <div class="forum-dm-msg-bubble">${escapeForumHtml(msg.content)}</div>
      </div>
    `;
  }).join('');
  
  const chatPage = document.createElement('div');
  chatPage.className = 'forum-dm-chat';
  
  chatPage.innerHTML = `
      <div class="forum-dm-chat-header">
        <button class="forum-dm-back" onclick="this.closest('.forum-dm-chat').remove()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <div class="forum-dm-chat-user">
          <div class="forum-dm-chat-avatar">${avatarContent}</div>
          <span class="forum-dm-chat-name">${escapeForumHtml(conversation.name)}</span>
        </div>
        <div style="width:36px;"></div>
      </div>
      
      <div class="forum-dm-messages" id="dmMessagesContainer">
        ${messagesHtml || '<div class="forum-dm-empty">开始聊天吧</div>'}
      </div>
      
      <div class="forum-dm-input-area">
        <input type="text" class="forum-dm-input" id="dmInput" placeholder="发送私信..." onkeypress="if(event.key==='Enter')sendDirectMessage()">
        <button class="forum-dm-generate-icon" onclick="generateDMReply()" title="生成回复">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        </button>
        <button class="forum-dm-send" onclick="sendDirectMessage()">发送</button>
      </div>
  `;
  
  document.body.appendChild(chatPage);
  
  // 滚动到底部
  setTimeout(() => {
    const container = document.getElementById('dmMessagesContainer');
    if (container) container.scrollTop = container.scrollHeight;
  }, 50);
}

// 发送私信
async function sendDirectMessage() {
  const input = document.getElementById('dmInput');
  const content = input?.value?.trim();
  if (!content || !currentDMConversationId) return;
  
  const conversation = forumDirectMessages.find(c => c.id === currentDMConversationId);
  if (!conversation) return;
  
  // 添加用户消息
  conversation.messages.push({
    id: Date.now(),
    sender: 'user',
    content: content,
    timestamp: Date.now(),
  });
  
  conversation.lastMessage = content;
  conversation.lastMessageTime = Date.now();
  
  await localforage.setItem("forumDirectMessages", forumDirectMessages);
  
  input.value = '';
  renderDirectMessageChat(conversation);
}

// 生成对方回复
async function generateDMReply() {
  if (!currentDMConversationId) return;
  
  const conversation = forumDirectMessages.find(c => c.id === currentDMConversationId);
  if (!conversation) return;
  
  const apiConfig = getActiveApiConfig();
  if (!apiConfig || !apiConfig.url || !apiConfig.key) {
    showToast("请先配置API");
    return;
  }
  
  showToast("正在生成回复...");
  
  // 获取对方信息（使用完整人设）
  let senderInfo = { name: conversation.name, identity: '', fullPersona: '' };
  
  // 检查是AI还是NPC
  if (conversation.id.startsWith('ai_')) {
    const charId = conversation.id.replace('ai_', '');
    const participant = forumSettings.aiParticipants.find(p => String(p.charId) === charId);
    if (participant) {
      senderInfo.identity = participant.identity || '';
      senderInfo.fullPersona = getCharacterFullPersona(participant); // 使用完整人设
    }
  } else if (conversation.id.startsWith('npc_')) {
    const npcId = conversation.id.replace('npc_', '');
    const npc = (forumSettings.npcs || []).find(n => String(n.id) === npcId);
    if (npc) {
      senderInfo.identity = npc.identity || '';
      senderInfo.fullPersona = npc.persona || '';
    }
  }
  
  // 获取最近的对话
  const recentMessages = conversation.messages.slice(-6).map(m => 
    `${m.sender === 'user' ? forumSettings.userNickname || '用户' : conversation.name}：${m.content}`
  ).join('\n');
  
  // 获取世界书内容
  const contextText = `${forumSettings.worldview}\n${recentMessages}`;
  const worldbookContent = getForumWorldbookContent(contextText);
  
  try {
    const prompt = `你正在扮演 ${conversation.name} 与用户私信聊天。

【世界观】${forumSettings.worldview}
${worldbookContent ? '\n【世界书/详细设定】\n' + worldbookContent : ''}

【${conversation.name}的完整人设】
${senderInfo.fullPersona || senderInfo.identity || '普通用户'}

【用户信息】
- 昵称：${forumSettings.userNickname || '用户'}
- 身份：${forumSettings.userIdentity || '普通用户'}

【最近对话】
${recentMessages}

请以${conversation.name}的身份回复最后一条消息。要求：
1. 必须符合角色的人设和性格特点！
2. 自然、简短
3. 禁止使用[表情]格式，用emoji代替
4. 只输出回复内容`;

    const response = await fetch(`${apiConfig.url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiConfig.key}`,
      },
      body: JSON.stringify({
        model: apiConfig.model || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        max_tokens: parseInt(document.getElementById('apiMaxTokens')?.value) || 2048,
      }),
    });

    if (!response.ok) throw new Error("API请求失败");

    const data = await response.json();
    const reply = data.choices[0]?.message?.content?.trim() || "";
    
    if (reply) {
      conversation.messages.push({
        id: Date.now(),
        sender: 'other',
        content: reply,
        timestamp: Date.now(),
      });
      
      conversation.lastMessage = reply;
      conversation.lastMessageTime = Date.now();
      
      await localforage.setItem("forumDirectMessages", forumDirectMessages);
      renderDirectMessageChat(conversation);
    }
  } catch (e) {
    console.error("[论坛] 生成回复失败:", e);
    showToast("生成失败: " + e.message);
  }
}

// [修改] switchToHome
function switchToHome() {
  // 显示顶栏和FAB
  const tabs = document.querySelector('.forum-tabs');
  const fab = document.querySelector('.forum-fab');
  if (tabs) tabs.style.display = 'flex';
  if (fab) fab.style.display = 'flex';
  
  // [修改点] 更新底部导航 (index 0 是 home)
  document.querySelectorAll(".forum-nav-item").forEach((item, index) => {
    item.classList.toggle("active", index === 0);
  });
  
  window.currentForumSection = 'home'; // 确保状态同步
  renderForumFeed();
}

function formatJoinDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return `${year}年${month}月`;
}

// 更换头像 (已修复 QuotaExceededError 限制)
function changeProfileAvatar() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        // 核心修复：引入安全压缩和写入机制
        const savedAvatar = await saveGlobalAvatar(ev.target.result);
        
        // 同步到论坛设置并保存
        forumSettings.userAvatar = savedAvatar;
        await localforage.setItem("forumSettings", forumSettings);
        
        renderForumProfile();
        showToast('头像已更新');
      };
      reader.readAsDataURL(file);
    }
  };
  input.click();
}

// 更换背景图
function changeProfileBanner() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        forumSettings.userBanner = ev.target.result;
        await localforage.setItem("forumSettings", forumSettings);
        renderForumProfile();
        showToast('背景已更新');
      };
      reader.readAsDataURL(file);
    }
  };
  input.click();
}

// 打开编辑个人资料弹窗
function openProfileEditor() {
  const globalAvatar = localStorage.getItem("avatarImg");
  const userAvatar = globalAvatar || getDefaultAvatarDataUrl();
  const userName = forumSettings.userNickname || "";
  const userHandle = forumSettings.userHandle || "";
  const userBio = forumSettings.userBio || "";
  const userBanner = forumSettings.userBanner || "";
  const userFollowing = forumSettings.userFollowing || 0;
  const userFollowers = forumSettings.userFollowers || 0;
  const userJoinDate = forumSettings.userJoinDate || formatJoinDate(Date.now());
  
  const modal = document.createElement('div');
  modal.id = 'forumProfileEditorModal';
  modal.className = 'forum-modal-overlay';
  modal.innerHTML = `
    <div class="forum-profile-editor">
      <div class="forum-profile-editor-header">
        <button class="forum-profile-editor-close" onclick="closeProfileEditor()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"/>
          </svg>
        </button>
        <span class="forum-profile-editor-title">编辑个人资料</span>
        <button class="forum-profile-editor-save" onclick="saveProfileChanges()">保存</button>
      </div>
      
      <div class="forum-profile-editor-content">
        <!-- 背景图 -->
        <div class="forum-profile-editor-banner" onclick="document.getElementById('profileBannerInput').click()">
          ${userBanner 
            ? `<img src="${userBanner}" alt="">` 
            : '<div class="forum-profile-banner-placeholder"></div>'}
          <div class="forum-profile-editor-banner-overlay">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
              <path d="M9.697 3H11v2h-.697l-2 2H5c-.276 0-.5.224-.5.5v11c0 .276.224.5.5.5h14c.276 0 .5-.224.5-.5V10h2v8.5c0 1.381-1.119 2.5-2.5 2.5H5c-1.381 0-2.5-1.119-2.5-2.5v-11C2.5 6.119 3.619 5 5 5h1.697l2-2zM12 10.5c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5zm0-2c2.485 0 4.5 2.015 4.5 4.5s-2.015 4.5-4.5 4.5-4.5-2.015-4.5-4.5 2.015-4.5 4.5-4.5zM17 2c0 1.657-1.343 3-3 3v1c1.657 0 3 1.343 3 3h1c0-1.657 1.343-3 3-3V5c-1.657 0-3-1.343-3-3h-1z"/>
            </svg>
          </div>
          <input type="file" id="profileBannerInput" accept="image/*" style="display:none" onchange="previewProfileBanner(this)">
        </div>
        
        <!-- 头像 -->
        <div class="forum-profile-editor-avatar" onclick="document.getElementById('profileAvatarInput').click()">
          <img src="${userAvatar}" alt="" id="profileAvatarPreview">
          <div class="forum-profile-editor-avatar-overlay">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
              <path d="M9.697 3H11v2h-.697l-2 2H5c-.276 0-.5.224-.5.5v11c0 .276.224.5.5.5h14c.276 0 .5-.224.5-.5V10h2v8.5c0 1.381-1.119 2.5-2.5 2.5H5c-1.381 0-2.5-1.119-2.5-2.5v-11C2.5 6.119 3.619 5 5 5h1.697l2-2zM12 10.5c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5zm0-2c2.485 0 4.5 2.015 4.5 4.5s-2.015 4.5-4.5 4.5-4.5-2.015-4.5-4.5 2.015-4.5 4.5-4.5z"/>
            </svg>
          </div>
          <input type="file" id="profileAvatarInput" accept="image/*" style="display:none" onchange="previewProfileAvatar(this)">
        </div>
        
        <!-- 表单 -->
        <div class="forum-profile-editor-form">
          <div class="forum-profile-editor-field">
            <label>昵称</label>
            <input type="text" id="profileNameInput" value="${escapeForumHtml(userName)}" placeholder="你的昵称" maxlength="30">
          </div>
          
          <div class="forum-profile-editor-field">
            <label>用户名</label>
            <div class="forum-input-with-prefix" style="background:#fff;border:1px solid #cfd9de;">
              <span class="forum-input-prefix">@</span>
              <input type="text" id="profileHandleInput" value="${escapeForumHtml(userHandle)}" placeholder="your_handle" class="forum-input-handle" style="background:transparent;">
            </div>
          </div>
          
          <div class="forum-profile-editor-field">
            <label>个人简介</label>
            <textarea id="profileBioInput" placeholder="介绍一下你自己" maxlength="160" rows="3">${escapeForumHtml(userBio)}</textarea>
          </div>
          
          <div class="forum-profile-editor-field">
            <label>加入时间</label>
            <input type="text" id="profileJoinDateInput" value="${escapeForumHtml(userJoinDate)}" placeholder="如: 2024年1月">
          </div>
          
          <div class="forum-profile-editor-field-row">
            <div class="forum-profile-editor-field forum-profile-editor-field-half">
              <label>正在关注</label>
              <input type="text" id="profileFollowingInput" value="${formatFollowCount(userFollowing)}" placeholder="如: 32, 1.2K, 5M">
            </div>
            <div class="forum-profile-editor-field forum-profile-editor-field-half">
              <label>关注者</label>
              <input type="text" id="profileFollowersInput" value="${formatFollowCount(userFollowers)}" placeholder="如: 96, 10K, 1M">
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  modal.onclick = (e) => {
    if (e.target === modal) closeProfileEditor();
  };
  document.body.appendChild(modal);
}

function closeProfileEditor() {
  const modal = document.getElementById('forumProfileEditorModal');
  if (modal) modal.remove();
}

function previewProfileAvatar(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = document.getElementById('profileAvatarPreview');
      if (preview) preview.src = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function previewProfileBanner(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const container = input.closest('.forum-profile-editor-banner');
      if (container) {
        const img = container.querySelector('img') || document.createElement('img');
        img.src = e.target.result;
        if (!container.querySelector('img')) {
          container.insertBefore(img, container.firstChild);
          const placeholder = container.querySelector('.forum-profile-banner-placeholder');
          if (placeholder) placeholder.remove();
        }
      }
    };
    reader.readAsDataURL(input.files[0]);
  }
}

// ==================== 修复后的 saveProfileChanges 函数 ====================

async function saveProfileChanges() {
  const name = document.getElementById('profileNameInput')?.value?.trim() || '';
  const handle = document.getElementById('profileHandleInput')?.value?.trim() || '';
  const bio = document.getElementById('profileBioInput')?.value || '';
  const joinDate = document.getElementById('profileJoinDateInput')?.value?.trim() || '';
  
  // 获取图片预览里的数据
  const avatarPreview = document.getElementById('profileAvatarPreview')?.src || '';
  
  // 背景图处理
  const bannerContainer = document.querySelector('.forum-profile-editor-banner img');
  const banner = bannerContainer?.src || '';
  
  const followingStr = document.getElementById('profileFollowingInput')?.value?.trim() || '0';
  const followersStr = document.getElementById('profileFollowersInput')?.value?.trim() || '0';
  
  const following = parseFollowCount(followingStr);
  const followers = parseFollowCount(followersStr);
  
 if (avatarPreview) {
        // 核心修复：压缩并安全写入全局头像 (防 QuotaExceededError)
        const savedAvatar = await saveGlobalAvatar(avatarPreview);
        
        // 1. 保存到论坛专用设置
        forumSettings.userAvatar = savedAvatar; 
        
        console.log("[论坛] 全局头像已安全保存并完成轻量化压缩");
      }
  
  forumSettings.userNickname = name;
  forumSettings.userHandle = handle;
  forumSettings.userBio = bio;
  forumSettings.userJoinDate = joinDate || formatJoinDate(Date.now());
  forumSettings.userFollowing = following;
  forumSettings.userFollowers = followers;
  forumSettings.userFollowingStr = followingStr;
  forumSettings.userFollowersStr = followersStr;
  
  // 背景图保存逻辑优化
  if (banner && !banner.includes('forum-profile-banner-placeholder')) {
    forumSettings.userBanner = banner;
  }
  
  // 存入数据库
  await localforage.setItem("forumSettings", forumSettings);
  
  closeProfileEditor();
  renderForumProfile();
  showToast('个人资料已更新');
}

// 解析关注数（支持K、M、B单位）
function parseFollowCount(str) {
  if (!str) return 0;
  str = str.toString().trim().toUpperCase();
  
  // 如果是纯数字
  if (/^\d+$/.test(str)) {
    return parseInt(str);
  }
  
  // 匹配带单位的数字，如 1.2K, 5M, 1B
  const match = str.match(/^([\d.]+)\s*([KMB])?$/i);
  if (match) {
    let num = parseFloat(match[1]);
    const unit = match[2]?.toUpperCase();
    
    if (unit === 'K') num *= 1000;
    else if (unit === 'M') num *= 1000000;
    else if (unit === 'B') num *= 1000000000;
    
    return Math.round(num);
  }
  
  return 0;
}

// 格式化关注数为带单位的字符串
function formatFollowCount(num) {
  if (!num || num === 0) return '0';
  num = parseInt(num);
  
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  } else if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  } else if (num >= 10000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  } else {
    return num.toString();
  }
}

// ==================== 导出 ====================

// 新增安全头像函数导出
window.compressAvatar = compressAvatar;
window.saveGlobalAvatar = saveGlobalAvatar;

window.initForumApp = initForumApp;
window.renderForumPage = renderForumPage;
window.renderForumFeed = renderForumFeed;
window.openForumPostDetail = openForumPostDetail;
window.closeForumPostDetail = closeForumPostDetail;
window.openForumSettings = openForumSettings;
window.closeForumSettings = closeForumSettings;
window.saveForumSetting = saveForumSetting;
window.openAddForumParticipant = openAddForumParticipant;
window.closeForumParticipantModal = closeForumParticipantModal;
window.selectForumParticipant = selectForumParticipant;
window.confirmAddParticipant = confirmAddParticipant;
window.editForumParticipant = editForumParticipant;
window.previewForumParticipantAvatar = previewForumParticipantAvatar;
window.removeForumParticipant = removeForumParticipant;
window.openAddForumNpc = openAddForumNpc;
window.editForumNpc = editForumNpc;
window.previewForumNpcAvatar = previewForumNpcAvatar;
window.confirmSaveNpc = confirmSaveNpc;
window.removeForumNpc = removeForumNpc;
window.openAddForumRelationship = openAddForumRelationship;
window.editForumRelationship = editForumRelationship;
window.confirmSaveRelationship = confirmSaveRelationship;
window.removeForumRelationship = removeForumRelationship;
window.openForumCompose = openForumCompose;
window.closeForumCompose = closeForumCompose;
window.submitForumPost = submitForumPost;
window.submitForumComment = submitForumComment;
window.replyToForumComment = replyToForumComment;
window.cancelForumReply = cancelForumReply;
window.updateForumCommentInput = updateForumCommentInput;
window.toggleForumPostLike = toggleForumPostLike;
window.toggleForumCommentLike = toggleForumCommentLike;
window.generateForumPosts = generateForumPosts;
window.generateMoreComments = generateMoreComments;
window.generateCommentsForNewPost = generateCommentsForNewPost;
window.generateInteractionsForNewPost = generateInteractionsForNewPost;
window.switchForumTab = switchForumTab;
window.switchForumSection = switchForumSection;
window.switchToHome = switchToHome;
window.renderForumProfile = renderForumProfile;
window.renderProfileReplyItem = renderProfileReplyItem;
window.changeProfileAvatar = changeProfileAvatar;
window.changeProfileBanner = changeProfileBanner;
window.openProfileEditor = openProfileEditor;
window.closeProfileEditor = closeProfileEditor;
window.previewProfileAvatar = previewProfileAvatar;
window.previewProfileBanner = previewProfileBanner;
window.saveProfileChanges = saveProfileChanges;
window.showRetweetMenu = showRetweetMenu;
window.openQuoteRetweet = openQuoteRetweet;
window.closeQuoteRetweet = closeQuoteRetweet;
window.submitQuoteRetweet = submitQuoteRetweet;
window.retweetToChat = retweetToChat;
window.retweetToProfile = retweetToProfile;
window.showForumImageDesc = showForumImageDesc;
window.showForumFullImage = showForumFullImage;
window.sendRetweetToChar = sendRetweetToChar;
window.renderRetweetCard = renderRetweetCard;
window.openForumPostFromCard = openForumPostFromCard;
window.handleComposeImageUpload = handleComposeImageUpload;
window.insertImagePlaceholder = insertImagePlaceholder;
window.renderComposeImages = renderComposeImages;
window.removeComposeImage = removeComposeImage;
window.renderForumComposeUserInfo = renderForumComposeUserInfo;
window.parseFollowCount = parseFollowCount;
window.formatFollowCount = formatFollowCount;
window.renderForumHot = renderForumHot;
window.searchForumTopic = searchForumTopic;
window.focusHotSearch = focusHotSearch;
window.handleHotSearchInput = handleHotSearchInput;
window.handleHotSearchKeydown = handleHotSearchKeydown;
window.executeHotSearch = executeHotSearch;
window.refreshSearchResults = refreshSearchResults;
window.generateTopicPosts = generateTopicPosts;
window.showSearchResults = showSearchResults;
window.showSearchError = showSearchError;
window.handleForumRefresh = handleForumRefresh;
window.renderDetailImages = renderDetailImages;
window.openOtherUserProfile = openOtherUserProfile;
window.renderOtherUserProfile = renderOtherUserProfile;
window.closeOtherUserProfile = closeOtherUserProfile;
window.generateUserProfilePosts = generateUserProfilePosts;
window.togglePinPost = togglePinPost;
window.currentViewingUser = currentViewingUser;
window.previewForumParticipantBanner = previewForumParticipantBanner;
window.previewForumNpcBanner = previewForumNpcBanner;
window.updateUserFollowers = updateUserFollowers;
window.openDirectMessages = openDirectMessages;
window.closeDirectMessages = closeDirectMessages;
window.renderDirectMessagesList = renderDirectMessagesList;
window.generateNewDirectMessages = generateNewDirectMessages;
window.openDirectMessageChat = openDirectMessageChat;
window.renderDirectMessageChat = renderDirectMessageChat;
window.sendDirectMessage = sendDirectMessage;
window.generateDMReply = generateDMReply;
window.getActiveApiConfig = getActiveApiConfig; 
window.showToast = showToast; 
// 世界书绑定相关
window.renderForumWorldbookBindings = renderForumWorldbookBindings;
window.openForumWorldbookSelector = openForumWorldbookSelector;
window.closeForumWorldbookSelector = closeForumWorldbookSelector;
window.addForumWorldbook = addForumWorldbook;
window.removeForumWorldbook = removeForumWorldbook;
window.getForumWorldbookContent = getForumWorldbookContent;
window.getCharacterFullPersona = getCharacterFullPersona;
// 帖子删除相关
window.showPostMoreMenu = showPostMoreMenu;
window.confirmDeletePost = confirmDeletePost;
window.deleteForumPost = deleteForumPost;
window.smartRenderCurrentPage = smartRenderCurrentPage;
// @提及相关
window.handleMentionClick = handleMentionClick;
window.loadSelectedForumPreset = loadSelectedForumPreset;
window.deleteSelectedForumPreset = deleteSelectedForumPreset;
window.toggleForumPresetPanel = toggleForumPresetPanel; // 新增：折叠控制
window.saveNewForumPreset = saveNewForumPreset;         // 新增：新建保存
window.updateCurrentForumPreset = updateCurrentForumPreset;
window.refreshPostComments = refreshPostComments;

// 页面加载时初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initForumApp);
} else {
  initForumApp();
}

// 获取当前激活的 API 配置（已集成中央调度分流）
function getActiveApiConfig() {
  // 1. 优先直接调用主程序的中央分流路由器，传入 'forum' 标识
  if (typeof window.getApiCredentials === 'function') {
    const apiConfig = window.getApiCredentials('forum');
    return {
      url: apiConfig.endpoint,
      key: apiConfig.key,
      model: apiConfig.model || 'gpt-3.5-turbo'
    };
  }

  // 2. 备用兜底（防止主程序 getApiCredentials 未加载时的异常）
  const urlEl = document.getElementById('apiEndpoint');
  const keyEl = document.getElementById('apiKey');
  const modelEl = document.getElementById('apiModel');

  if (urlEl && keyEl) {
    let url = urlEl.value.trim();
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    return {
      url: url,
      key: keyEl.value.trim(),
      model: modelEl ? modelEl.value.trim() : 'gpt-3.5-turbo'
    };
  }

  return null;
}

// 通用提示框 (防止 showToast 未定义导致的报错)
function showToast(message) {
  // 如果主程序 script.js 已经定义了 alert 或其他提示，这里做一个轻量级替代
  // 检查页面上是否已有 toast 容器
  let toast = document.getElementById('forum-toast-container');
  
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'forum-toast-container';
    toast.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.opacity = '1';

  // 2秒后消失
  setTimeout(() => {
    toast.style.opacity = '0';
  }, 2000);
}

// ==================== 新增辅助函数 ====================

// 获取所有“AI参与者”自带的世界书ID列表
// 获取所有“AI参与者”应生效的世界书ID列表（增强版）
function getCharacterBoundWorldbooks() {
  const charBoundIds = new Set();
  const allChats = window.chatList || [];
  const globalWorldbooks = getGlobalWorldbooks();

  // 遍历论坛里的 AI 参与者
  if (forumSettings.aiParticipants && forumSettings.aiParticipants.length > 0) {
    forumSettings.aiParticipants.forEach(participant => {
      const charId = String(participant.charId);
      
      // 1. 检查聊天对象里的 worldBooks 数组 (旧逻辑)
      const chat = allChats.find(c => String(c.id) === charId);
      if (chat && chat.worldBooks && Array.isArray(chat.worldBooks)) {
        chat.worldBooks.forEach(wbRef => {
          let wbId = wbRef;
          // 兼容旧数据(存名字)
          if (typeof wbRef === 'string' && isNaN(wbRef)) {
             const found = globalWorldbooks.find(w => w.name === wbRef);
             if (found) wbId = found.id;
          }
          if (wbId) charBoundIds.add(Number(wbId));
        });
      }

      // 2. ★★★ 新增：检查世界书本身的 boundCharId 属性 ★★★
      // 这就是你要求的“开启角色世界书并绑定给谁”的逻辑
      globalWorldbooks.forEach(wb => {
          if (wb.isCharBook === true && String(wb.boundCharId) === charId) {
              charBoundIds.add(Number(wb.id));
          }
      });
    });
  }
  return Array.from(charBoundIds);
}
// ==================== 核心修复：数据获取工具 ====================

// 安全获取全局世界书列表（解决变量名大小写不一致问题）
function getGlobalWorldbooks() {
  // 1. 尝试直接获取主程序定义的变量 (注意大小写 worldBooks)
  if (typeof window.worldBooks !== 'undefined' && Array.isArray(window.worldBooks)) {
    return window.worldBooks;
  }
  
  // 2. 尝试从全局数据对象 globalData 中获取 (这是最稳的来源)
  if (window.globalData && Array.isArray(window.globalData.worldBooksObj)) {
    return window.globalData.worldBooksObj;
  }
  
  // 3. 尝试全小写 (兼容旧代码)
  if (typeof window.worldbooks !== 'undefined' && Array.isArray(window.worldbooks)) {
    return window.worldbooks;
  }
  
  // 4. 如果都找不到，返回空数组
  return [];
}

// ==================== 论坛预设管理逻辑 (UI升级版) ====================

// 1. 控制折叠面板的展开/收起
function toggleForumPresetPanel() {
  const accordion = document.getElementById('forumPresetAccordion');
  if (accordion) {
    accordion.classList.toggle('active');
  }
}

// 2. 新建保存 (对应红色"新建保存"按钮)
async function saveNewForumPreset() {
  const name = prompt("请输入预设名称（例如：赛博朋克、修仙世界）：");
  if (!name || !name.trim()) return;
  const presetName = name.trim();

  // ★★★ 核心修复：深拷贝当前设置 ★★★
  // 原理：把对象转成字符串再转回来，彻底切断与当前设置的联系
  const settingsSnapshot = JSON.parse(JSON.stringify(forumSettings));

  const newPreset = {
    name: presetName,
    settings: settingsSnapshot
  };

  // 检查是否重名
  const existingIndex = forumPresets.findIndex(p => p.name === presetName);
  
  if (existingIndex >= 0) {
    if (!confirm(`预设 "${presetName}" 已存在，要覆盖它吗？`)) return;
    forumPresets[existingIndex] = newPreset;
  } else {
    forumPresets.push(newPreset);
  }

  // 存入数据库
  await localforage.setItem("forumPresets", forumPresets);
  showToast(`已保存：${presetName}`);

  // 刷新界面
  renderForumSettings();
  
  // 保持面板展开，自动选中刚才保存的项
  setTimeout(() => {
    const accordion = document.getElementById('forumPresetAccordion');
    if(accordion) accordion.classList.add('active'); 
    
    const select = document.getElementById('forumPresetSelect');
    // 如果是覆盖更新，existingIndex有效；如果是新增，选中最后一个
    if(select) select.value = existingIndex >= 0 ? existingIndex : forumPresets.length - 1;
  }, 50);
}

// 3. 覆盖更新 (对应灰色"覆盖更新"按钮)
async function updateCurrentForumPreset() {
  const select = document.getElementById("forumPresetSelect");
  const index = select.value;

  if (index === "" || !forumPresets[index]) {
    showToast("⚠️ 请先在下拉框中选择一个要更新的预设");
    return;
  }

  const targetPreset = forumPresets[index];

  if (!confirm(`确定要用当前的设置覆盖预设 "${targetPreset.name}" 吗？\n注意：预设里的旧数据将无法恢复。`)) return;

  // ★★★ 核心修复：同样使用深拷贝 ★★★
  const settingsSnapshot = JSON.parse(JSON.stringify(forumSettings));
  
  // 更新数组里的数据
  forumPresets[index].settings = settingsSnapshot;

  await localforage.setItem("forumPresets", forumPresets);
  showToast(`预设 "${targetPreset.name}" 已更新`);
}

// 4. 加载预设 (对应下拉框 onchange 事件)
async function loadSelectedForumPreset() {
  const select = document.getElementById("forumPresetSelect");
  const index = select.value;

  // 如果选的是默认提示项"-- 选择已保存的预设 --"，什么都不做
  if (index === "") return;

  const preset = forumPresets[index];
  if (!preset) return;

  if (!confirm(`确定加载预设 "${preset.name}" 吗？\n当前未保存的修改将会丢失！`)) {
    select.value = ""; // 如果取消，重置下拉框
    return;
  }

  // ★★★ 核心修复：加载时也要深拷贝 ★★★
  // 防止加载后，你修改了界面，结果把预设源文件给改了
  forumSettings = JSON.parse(JSON.stringify(preset.settings));

  // 保存为当前正在使用的设置
  await localforage.setItem("forumSettings", forumSettings);
  showToast(`已加载方案：${preset.name}`);

  // 刷新界面显示新数据
  renderForumSettings();

  // 保持面板展开，并保持选中状态
  setTimeout(() => {
    const accordion = document.getElementById('forumPresetAccordion');
    if(accordion) accordion.classList.add('active');
    
    const newSelect = document.getElementById('forumPresetSelect');
    if(newSelect) newSelect.value = index;
  }, 50);
}

// 5. 删除预设 (对应红色"删除"按钮)
async function deleteSelectedForumPreset() {
  const select = document.getElementById("forumPresetSelect");
  const index = select.value;

  if (index === "" || !forumPresets[index]) {
    showToast("⚠️ 请先选择要删除的预设");
    return;
  }

  if (!confirm(`确定要删除预设 "${forumPresets[index].name}" 吗？`)) return;

  // 从数组移除
  forumPresets.splice(index, 1);
  await localforage.setItem("forumPresets", forumPresets);
  showToast("方案已删除");

  // 刷新界面
  renderForumSettings();
  
  // 保持展开
  setTimeout(() => {
    const accordion = document.getElementById('forumPresetAccordion');
    if(accordion) accordion.classList.add('active');
  }, 50);
}

// ========== 点击图标刷新评论 (无旋转动画版) ==========
async function refreshPostComments(postId, btnElement) {
  // 简单的防抖，防止狂点
  if (btnElement.dataset.loading === "true") return;
  btnElement.dataset.loading = "true";

  // 1. 不旋转，只显示提示
  showToast("正在召唤网友评论...");

  try {
    // 2. 调用生成接口
    await generateMoreComments(postId);
  } catch (e) {
    console.error(e);
    showToast("生成评论失败");
  } finally {
    // 3. 解除点击锁定
    btnElement.dataset.loading = "false";
  }
}

// 当点击卡片时触发
window.openForumPostFromCard = function(postId) {
    console.log("跳转帖子ID:", postId);
    
    // 1. 打开论坛APP页面 (对应 script.js 里的 openApp 逻辑)
    // 如果你的 script.js 里定义了 openApp 函数
    if (typeof openApp === 'function') {
        openApp('Page 4'); // Page 4 是论坛
    } else {
        // 强制显示
        document.getElementById('appOverlay').classList.add('active');
        document.getElementById('chatAppPage').style.display = 'none';
        document.getElementById('forumPage').style.display = 'block';
    }

    // 2. 延时进入详情页
    setTimeout(() => {
        if (typeof openForumPostDetail === 'function') {
            openForumPostDetail(Number(postId));
        }
    }, 300);
};

// ==================== [新增] 安全头像压缩与写入机制 (防 QuotaExceededError) ====================

/**
 * 智能头像压缩器（限制最大 150x150，PNG 格式保留透明度，防黑底）
 */
function compressAvatar(base64Str, maxWidth = 150, maxHeight = 150) {
  return new Promise((resolve) => {
    // 安全守卫 1: 如果是网络路径、非 base64、或者是 SVG，直接返回不压缩，防止 CORS 跨域或 SVG 渲染报错
    if (!base64Str || !base64Str.startsWith('data:') || base64Str.includes('image/svg+xml')) {
      resolve(base64Str);
      return;
    }
    
    // 安全守卫 2: 如果图片本来就很小（小于 30KB），没必要压缩，避免不必要的性能损耗
    if (base64Str.length < 30 * 1024) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      // 等比例缩放计算
      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.clearRect(0, 0, width, height); // 保持透明通道，防止 PNG 变黑底
        ctx.drawImage(img, 0, 0, width, height);
        // 使用 image/png 格式，在 150x150 的尺寸下通常只需 10~25KB 左右，且无损透明度
        const compressedData = canvas.toDataURL('image/png');
        resolve(compressedData);
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str); // 加载失败时保底返回原图，不影响流程
    };
    img.src = base64Str;
  });
}

/**
 * 安全保存全局头像至 localStorage
 */
async function saveGlobalAvatar(avatarData) {
  try {
    // 压缩成超小体积
    const compressed = await compressAvatar(avatarData, 150, 150);
    localStorage.setItem("avatarImg", compressed);
    return compressed;
  } catch (e) {
    console.error("[论坛] 保存全局头像失败:", e);
    // 存储空间彻底全满的优雅降级处理
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      showToast("浏览器本地存储空间已满，头像未成功同步，请清理浏览器缓存");
    }
    return avatarData;
  }
}

