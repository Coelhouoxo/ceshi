'use strict';
(() => {
    let activeFace;
    let request = 0;
    const faces = new Map();
    const status = (text, error = false) => {
        const node = document.getElementById('fontLoadStatus');
        node.hidden = !text; node.textContent = text; node.classList.toggle('font-error',error);
    };
    const toDataURL = blob => new Promise((resolve,reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
    });
    async function download(source, depth = 0) {
        if (depth > 2) throw new Error('字体样式表中没有可用的字体文件');
        let response;
        try { response = await fetch(source, {signal:AbortSignal.timeout(30000)}); }
        catch { throw new Error('无法读取链接，请检查网络、跨域权限，或下载字体后从文件导入'); }
        if (!response.ok) throw new Error(`字体链接返回 ${response.status}，请使用可直接下载的链接`);
        const blob = await response.blob();
        if (/text\/css/.test(blob.type) || /\.css(?:[?#]|$)/i.test(source)) {
            const css = await blob.text();
            const urls = [...css.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)].map(match => match[1]);
            if (!urls.length) throw new Error('样式表中没有字体地址');
            // Keep all unicode subsets together, rather than dropping Chinese glyphs.
            const fontRules = [...css.matchAll(/@font-face\s*\{([^}]+)\}/gi)];
            if (fontRules.length > 1) {
                const parts = [];
                for (const rule of fontRules) {
                    const url = rule[1].match(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/)?.[1];
                    if (!url) continue;
                    parts.push({src:await download(new URL(url,response.url || source).href,depth+1), range:rule[1].match(/unicode-range\s*:\s*([^;]+)/i)?.[1]});
                }
                return {parts};
            }
            return download(new URL(urls[0],response.url || source).href,depth+1);
        }
        if (/text\/html/.test(blob.type)) throw new Error('这个链接是网页，请填写字体文件的直接链接');
        return toDataURL(blob);
    }
    async function prepare(source) {
        let value = source;
        if (source.startsWith('fontbundle:')) value = JSON.parse(source.slice(11));
        else if (!source.startsWith('data:')) value = await download(source);
        const stored = typeof value === 'string' ? value : 'fontbundle:' + JSON.stringify(value);
        if (faces.has(stored)) return {stored,...faces.get(stored)};
        const family = 'UserFont_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
        const parts = typeof value === 'string' ? [{src:value}] : value.parts;
        const loaded = await Promise.all(parts.map(async part => {
            const binary = await (await fetch(part.src)).arrayBuffer();
            const face = new FontFace(family,binary,part.range ? {unicodeRange:part.range} : {});
            try { return await face.load(); } catch { throw new Error('浏览器无法解析此字体，请使用 TTF、OTF、WOFF 或 WOFF2 文件'); }
        }));
        const result = {family,loaded}; faces.set(stored,result); return {stored,...result};
    }
    function installFont(family) {
        let style = document.getElementById('global-font-style');
        if (!style) { style = document.createElement('style'); style.id = 'global-font-style'; document.head.append(style); }
        style.textContent = `:root{--app-user-font:"${family}"}body,button,input,textarea,select,div,span,p,h1,h2,h3,label,a{font-family:"${family}",-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif!important}`;
        document.body.style.removeProperty('font-family');
        activeFace = family;
    }
    window.applyGlobalFont = async (name,source) => {
        const ticket = ++request;
        status('正在加载字体…');
        try {
            const result = await prepare(source);
            if (ticket !== request) return false;
            result.loaded.forEach(face => document.fonts.add(face));
            installFont(result.family);
            currentFontUrl = result.stored;
            await saveData();
            status('字体已应用，并保存在此设备');
            renderFontSchemes();
            return true;
        } catch (error) { if (ticket === request) status(error.message || '字体加载失败，请重试',true); return false; }
    };
    window.setFontByLink = () => {
        const source = document.getElementById('fontSourceUrl').value.trim();
        if (!source) { status('请先输入字体链接',true); return; }
        let url;
        try { url = new URL(source); if (!['https:','http:'].includes(url.protocol)) throw new Error(); }
        catch { status('请输入完整的 http 或 https 字体链接',true); return; }
        return applyGlobalFont('LinkFont',url.href);
    };
    window.handleFontFile = async input => {
        const file = input.files?.[0]; if (!file) return;
        try { await applyGlobalFont('LocalFont',await toDataURL(file)); }
        catch { status('文件读取失败，请重新选择',true); }
        input.value = '';
    };
    window.resetDefaultFont = () => {
        ++request;
        document.getElementById('global-font-style')?.remove();
        document.body.style.removeProperty('font-family');
        currentFontUrl = ''; activeFace = null; saveData(); renderFontSchemes(); status('已恢复系统字体');
    };
    window.saveFontScheme = () => {
        const input = document.getElementById('fontSchemeName');
        if (!input.value.trim()) { status('请填写方案名称',true); return; }
        if (!currentFontUrl) { status('请先应用一款字体',true); return; }
        savedFonts.push({id:'Font_'+Date.now(),name:input.value.trim(),src:currentFontUrl});
        saveData(); input.value = ''; renderFontSchemes(); status('字体方案已保存');
    };
    window.renderFontSchemes = () => {
        const list = document.getElementById('fontSchemeList'); list.replaceChildren();
        if (!savedFonts.length) { const empty = document.createElement('p'); empty.className='ios-font-empty'; empty.textContent='暂无保存的字体'; list.append(empty); }
        savedFonts.forEach((scheme,index) => {
            const row = document.createElement('div'); row.className='ios-font-scheme';
            const apply = document.createElement('button'); apply.type='button'; apply.textContent=scheme.name; apply.onclick=()=>applyGlobalFont(scheme.id,scheme.src);
            const remove = document.createElement('button'); remove.type='button'; remove.textContent='删除'; remove.setAttribute('aria-label','删除字体 '+scheme.name);
            remove.onclick=()=>{savedFonts.splice(index,1);saveData();renderFontSchemes();};
            row.append(apply,remove); list.append(row);
        });
    };
    // The chat is rendered in a shadow root and needs the selected family too.
    const syncChatFont = () => {
        const root = document.querySelector('ceshi-kiss-view')?.shadowRoot;
        if (!root) return;
        let style = root.getElementById('user-font-bridge');
        if (!style) {style=document.createElement('style');style.id='user-font-bridge';root.append(style);}
        style.textContent = activeFace ? `:host,.message-wrapper,.message-content,.text-content,textarea,button,.name,.photo-description{font-family:"${activeFace}",-apple-system,sans-serif!important}` : '';
    };
    new MutationObserver(syncChatFont).observe(document.getElementById('chatRoom'),{childList:true});
    new MutationObserver(syncChatFont).observe(document.head,{childList:true,subtree:true,characterData:true});
})();
