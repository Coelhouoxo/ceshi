const MiuApi = (() => {
    const byId = id => document.getElementById(id);
    const value = id => byId(id).value.trim();
    const apiPage = byId('apiSettingsPage');
    const scroll = apiPage.querySelector('.ios-api-scroll');
    const sections = [...apiPage.querySelectorAll('[data-api-section]')];
    const searchRows = [...apiPage.querySelectorAll('[data-api-section="home"] [data-api-search]')];
    const features = ['chat', 'summary', 'diary', 'forum', 'check_phone', 'quiz'];
    const titles = {
        home: 'API 设置', main: '主 API', secondary: '副 API', presets: '配置方案',
        routing: '副 API 适用功能', activity: '活动设置', voice: '语音消息',
        image: '生图配置', time: '时间感知', models: '选择模型'
    };
    const voiceNames = { minimax: 'MiniMax', fish: 'Fish Audio', eleven: 'ElevenLabs' };
    const providerFields = ['MiniVoice', 'MiniEndpoint', 'MiniModel', 'FishEndpoint', 'FishKey', 'FishModel', 'FishVoice',
        'ElevenEndpoint', 'ElevenKey', 'ElevenModel', 'ElevenVoice',
        'GptEndpoint', 'GptKey', 'GptModel', 'GptSize', 'GptQuality'];
    let currentView = 'home';
    let modelPicker;

    function suite() {
        return globalData.apiSuite ??= {};
    }

    function profiles() {
        return suite().auxProfiles ??= [];
    }

    function getAuxRoute(feature) {
        const routes = suite().routes;
        const id = routes && Object.hasOwn(routes, feature) ? routes[feature] : undefined;
        if (!id || id === 'legacy') return undefined;
        if (id === 'main') return null;
        const profile = profiles().find(item => item.id === id && item.enabled);
        return profile ? { ...profile, isSecondary: true } : null;
    }

    function voiceProvider() {
        const provider = suite().voiceProvider;
        return Object.hasOwn(voiceNames, provider) ? provider : 'minimax';
    }

    function imageProvider() {
        return suite().imageProvider || (globalData.naiEnabled ? 'nai' : 'off');
    }

    function timeMode() {
        const config = suite();
        if (config.timeReal !== false) return 'real';
        if (config.timeMode === 'custom' && Number.isFinite(new Date(config.timeValue || '').getTime())) {
            return 'custom';
        }
        return 'fuzzy';
    }

    function clockDate(now = new Date()) {
        if (timeMode() !== 'custom') return now;
        return new Date(suite().timeValue);
    }

    function formatClock(date, zone, locale, options) {
        try {
            return new Intl.DateTimeFormat(locale, { ...options, timeZone: zone || undefined }).format(date);
        } catch (error) {
            if (!(error instanceof RangeError)) throw error;
            return new Intl.DateTimeFormat(locale, options).format(date);
        }
    }

    function messageTime(timestamp) {
        const date = new Date(timestamp);
        if (!Number.isFinite(date.getTime())) return '';
        return formatClock(date, '', 'zh-CN', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        });
    }

    function escapeHtml(value) {
        const escaped = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return String(value).replace(/[&<>"']/g, character => escaped[character]);
    }

    function timeDescription(chat, side = 'char') {
        const mode = timeMode();
        const date = clockDate();
        const zone = mode === 'custom' ? '' : chat?.[side + 'Timezone'];
        if (mode === 'fuzzy') {
            const hour = Number(formatClock(date, zone, 'en-GB', { hour: 'numeric', hourCycle: 'h23' }));
            const period = hour < 6 ? '凌晨' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 18 ? '下午' : '晚上';
            return period + '（只感知时段）';
        }
        return formatClock(date, zone, 'zh-CN', {
            year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        });
    }

    function endpoint(base, path) {
        const url = new URL(base);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) {
            throw new Error('请填写有效的 HTTP(S) 接口地址');
        }
        if (['api520.pro', 'api521.pro'].some(host => url.hostname === host || url.hostname.endsWith('.' + host))) {
            throw new Error('该接口域名已被小手机禁用');
        }
        return url.href.replace(/\/+$/, '') + path;
    }

    async function request(url, options, timeout) {
        let response;
        try {
            response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout), redirect: 'error' });
        } catch (error) {
            if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('接口请求超时');
            throw new Error('连接失败，请检查接口地址及浏览器跨域支持');
        }
        if (!response.ok) throw new Error('接口返回 HTTP ' + response.status);
        return response;
    }

    async function minimaxSpeech(text, id) {
        const config = suite();
        const key = value('minimaxApiKey');
        if (!key || !id || !text.trim()) return null;
        const base = (config.MiniEndpoint || 'https://api.minimax.cn').replace(/\/+$/, '').replace(/\/v1$/, '');
        const url = new URL(endpoint(base, '/v1/t2a_v2'));
        const group = value('minimaxGroupId');
        if (group) url.searchParams.set('GroupId', group);
        const response = await request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
            body: JSON.stringify({
                model: config.MiniModel || 'speech-2.8-turbo', text, stream: false, output_format: 'hex',
                voice_setting: { voice_id: id, speed: 1, vol: 1, pitch: 0 },
                audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 }
            })
        }, 60000);
        const result = await response.json();
        const hex = result.data?.audio;
        if (result.base_resp?.status_code || !hex || !/^(?:[\da-f]{2})+$/i.test(hex)) {
            throw new Error('MiniMax 未返回可播放的音频');
        }
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        return blobToBase64(new Blob([bytes], { type: 'audio/mpeg' }));
    }

    async function speech(text, chat = {}) {
        const config = suite();
        const provider = voiceProvider();
        if (provider === 'minimax') {
            const id = chat.minimaxVoiceId || config.MiniVoice;
            return id ? minimaxSpeech(text, id) : null;
        }
        const isFish = provider === 'fish';
        const prefix = isFish ? 'Fish' : 'Eleven';
        const id = (isFish ? chat.fishVoiceId : chat.elevenVoiceId) || config[prefix + 'Voice'];
        const key = config[prefix + 'Key'];
        if (!id || !key || !text.trim()) return null;
        const headers = { 'Content-Type': 'application/json', Accept: 'audio/mpeg' };
        let body;
        let url;
        if (isFish) {
            const base = (config.FishEndpoint || 'https://api.fish.audio').replace(/\/+$/, '').replace(/\/v1$/, '');
            url = endpoint(base, '/v1/tts');
            headers.Authorization = 'Bearer ' + key;
            headers.model = config.FishModel || 's1';
            body = { text, reference_id: id, format: 'mp3' };
        } else {
            const base = (config.ElevenEndpoint || 'https://api.elevenlabs.io').replace(/\/+$/, '').replace(/\/v1$/, '');
            url = endpoint(base, '/v1/text-to-speech/' + encodeURIComponent(id) + '?output_format=mp3_44100_128');
            headers['xi-api-key'] = key;
            body = { text, model_id: config.ElevenModel || 'eleven_multilingual_v2' };
        }
        const response = await request(url, { method: 'POST', headers, body: JSON.stringify(body) }, 60000);
        const audio = await response.blob();
        if (!audio.size || !/^(audio\/|application\/octet-stream)/i.test(audio.type)) {
            throw new Error('服务没有返回音频');
        }
        return blobToBase64(audio.type.startsWith('audio/') ? audio : new Blob([audio], { type: 'audio/mpeg' }));
    }

    async function messageVoice(text, chat) {
        try {
            return await speech(text, chat);
        } catch (error) {
            console.warn('语音消息生成失败', error.message);
            return null;
        }
    }

    function imageReady() {
        const provider = imageProvider();
        if (provider === 'nai') return Boolean(globalData.naiApiKey);
        if (provider === 'gpt') return Boolean(suite().GptKey);
        return false;
    }

    async function generateImage(chat, description) {
        if (imageProvider() === 'nai') return fetchNovelAIImage(chat, description);
        const config = suite();
        if (imageProvider() !== 'gpt' || !config.GptKey) return '';
        const body = {
            model: config.GptModel || 'gpt-image-2',
            prompt: [chat.visualPrompt, description].filter(Boolean).join('\n'),
            size: config.GptSize || '1024x1024',
            quality: config.GptQuality || 'auto',
            n: 1
        };
        try {
            const url = endpoint(config.GptEndpoint || 'https://api.openai.com/v1', '/images/generations');
            const response = await request(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.GptKey },
                body: JSON.stringify(body)
            }, 180000);
            const image = (await response.json()).data?.[0];
            if (image?.b64_json && /^[A-Za-z0-9+/=]+$/.test(image.b64_json)) return 'data:image/png;base64,' + image.b64_json;
            if (image?.url) {
                const imageUrl = new URL(image.url);
                if (imageUrl.protocol === 'https:') return imageUrl.href;
            }
            throw new Error('服务没有返回图片');
        } catch (error) {
            console.warn('GPT 生图失败', error.message);
            return '';
        }
    }

    function setText(id, text) {
        byId(id).textContent = text;
    }

    function setOptions(select, rows, current) {
        select.replaceChildren(...rows.map(([id, label]) => new Option(label, id)));
        select.value = current;
    }

    function renderAuxChoices() {
        const list = profiles();
        const chooser = byId('iosAuxSelect');
        const current = chooser.value;
        setOptions(chooser, [['', '新建方案'], ...list.map(p => [p.id, p.name + (p.enabled ? '' : '（已停用）')])], current);
        for (const feature of features) {
            const select = byId('iosRoute-' + feature);
            const currentRoute = suite().routes?.[feature] || 'legacy';
            setOptions(select, [['legacy', '沿用原设置'], ['main', '主 API'],
                ...list.map(p => [p.id, p.name + (p.enabled ? '' : '（已停用）')])], currentRoute);
            if (select.selectedIndex < 0) select.value = 'main';
        }
    }

    function showAuxProfile(id) {
        const p = profiles().find(item => item.id === id);
        byId('iosAuxName').value = p?.name || '';
        byId('iosAuxEndpoint').value = p?.endpoint || '';
        byId('iosAuxKey').value = p?.key || '';
        byId('iosAuxModel').value = p?.model || '';
        byId('iosAuxTemp').value = p?.temperature ?? 1;
        byId('iosAuxTokens').value = p?.maxTokens ?? 2048;
        byId('iosAuxEnabled').checked = p?.enabled ?? true;
        byId('iosAuxDelete').disabled = !p;
        setText('iosAuxStatus', '');
    }

    function saveAuxProfile() {
        const id = value('iosAuxSelect') || crypto.randomUUID();
        const profile = {
            id, name: value('iosAuxName'), endpoint: value('iosAuxEndpoint').replace(/\/+$/, ''),
            key: value('iosAuxKey'), model: value('iosAuxModel'), enabled: byId('iosAuxEnabled').checked,
            temperature: byId('iosAuxTemp').valueAsNumber, maxTokens: byId('iosAuxTokens').valueAsNumber
        };
        try {
            if (!profile.name || !profile.model) throw new Error('请填写方案名称和模型');
            endpoint(profile.endpoint, '/models');
            if (!(profile.temperature >= 0 && profile.temperature <= 2) || !Number.isInteger(profile.maxTokens) || profile.maxTokens < 1) {
                throw new Error('请检查温度和最大 Tokens');
            }
        } catch (error) {
            setText('iosAuxStatus', error.message);
            return;
        }
        suite().auxProfiles = [...profiles().filter(item => item.id !== id), profile];
        renderAuxChoices();
        byId('iosAuxSelect').value = id;
        showAuxProfile(id);
        saveData();
        setText('iosAuxStatus', '已保存');
    }

    function deleteAuxProfile() {
        const id = value('iosAuxSelect');
        if (!id || !confirm('删除这套副 API 方案？')) return;
        suite().auxProfiles = profiles().filter(item => item.id !== id);
        for (const feature of features) {
            if (suite().routes?.[feature] === id) suite().routes[feature] = 'main';
        }
        renderAuxChoices();
        byId('iosAuxSelect').value = '';
        showAuxProfile('');
        saveData();
    }

    function refreshSummaries() {
        const currentPreset = byId('apiPresetSelect').selectedOptions[0];
        setText('iosPrimarySummary', value('apiModel') || (value('apiEndpoint') ? '待选模型' : '未配置'));
        setText('iosMainModelOpen', value('apiModel') || '选择模型');
        setText('iosLegacyModelOpen', value('secApiModel') || '选择模型');
        const enabled = profiles().filter(p => p.enabled).length;
        setText('iosSecondarySummary', enabled ? enabled + ' 套已启用' : value('secApiModel') || '未配置');
        setText('iosPresetSummary', currentPreset?.value ? currentPreset.textContent : '未选择');
        setText('iosVoiceSummary', voiceNames[voiceProvider()]);
        setText('iosImageSummary', { off: '关闭', nai: 'NovelAI', gpt: 'GPT Image' }[imageProvider()]);
        setText('iosTimeSummary', { real: '真实时间', custom: '自定义', fuzzy: '模糊感知' }[timeMode()]);
        const activity = byId('autoActivityToggle').classList.contains('checked');
        apiPage.querySelector('[data-api-view="activity"]').hidden = !activity;
        apiPage.querySelectorAll('[role="switch"]').forEach(button => {
            button.setAttribute('aria-checked', String(button.classList.contains('checked')));
        });
    }

    function filterSettings() {
        const terms = value('iosApiSearch').toLowerCase().split(/\s+/).filter(Boolean);
        let count = 0;
        for (const row of searchRows) {
            const available = row.dataset.apiView !== 'activity' || byId('autoActivityToggle').classList.contains('checked');
            row.hidden = !available || !terms.every(term => row.dataset.apiSearch.toLowerCase().includes(term));
            if (!row.hidden) count++;
        }
        byId('iosApiNoResults').hidden = count > 0;
        for (const group of apiPage.querySelectorAll('[data-api-section="home"] .ios-api-group')) {
            group.hidden = !group.querySelector('.ios-api-row:not([hidden])');
        }
    }

    function showView(view) {
        if (!Object.hasOwn(titles, view)) return;
        currentView = view;
        for (const section of sections) section.hidden = section.dataset.apiSection !== view;
        setText('iosApiTitle', titles[view]);
        setText('iosApiBackLabel', view === 'home' ? '桌面' : view === 'models' ? titles[modelPicker.from] : 'API 设置');
        byId('iosApiSearchBar').hidden = view !== 'home';
        scroll.scrollTop = 0;
        refreshSummaries();
        if (view === 'home') filterSettings();
    }

    function refreshMedia() {
        const voice = voiceProvider();
        const image = imageProvider();
        byId('iosVoiceProvider').value = voice;
        byId('iosImageProvider').value = image;
        apiPage.querySelectorAll('[data-voice-panel]').forEach(panel => { panel.hidden = panel.dataset.voicePanel !== voice; });
        apiPage.querySelectorAll('[data-image-panel]').forEach(panel => { panel.hidden = panel.dataset.imagePanel !== image; });
        byId('iosTimeReal').checked = timeMode() === 'real';
        byId('iosTimeAlternatives').hidden = timeMode() === 'real';
        byId('iosTimeMode').value = suite().timeMode || 'fuzzy';
        byId('iosTimeCustom').hidden = byId('iosTimeMode').value !== 'custom';
        byId('iosTimeValue').value = suite().timeValue || '';
    }

    function open() {
        byId('iosApiSearch').value = '';
        for (const field of providerFields) {
            const input = byId('ios' + field);
            input.value = suite()[field] ?? (field === 'GptSize' ? '1024x1024' : field === 'GptQuality' ? 'auto' : '');
        }
        renderAuxChoices();
        showAuxProfile(value('iosAuxSelect'));
        refreshMedia();
        showView('home');
    }

    function back() {
        if (currentView === 'home') return false;
        if (currentView === 'models') {
            const from = modelPicker.from;
            modelPicker = undefined;
            showView(from);
        } else {
            showView('home');
            saveData();
        }
        return true;
    }

    const modelFields = {
        main: ['apiEndpoint', 'apiKey', 'apiModel'],
        legacy: ['secApiEndpoint', 'secApiKey', 'secApiModel'],
        aux: ['iosAuxEndpoint', 'iosAuxKey', 'iosAuxModel']
    };

    function pickModel(kind, fetchNow = true) {
        modelPicker = { kind, from: currentView, models: [], revision: 0 };
        byId('iosModelQuery').value = '';
        byId('iosModelManual').value = value(modelFields[kind][2]);
        setText('iosModelStatus', '');
        showView('models');
        drawModels();
        if (fetchNow) fetchModelsForPicker();
    }

    function drawModels() {
        const results = byId('iosModelResults');
        results.replaceChildren();
        const query = value('iosModelQuery').toLowerCase();
        const matched = modelPicker.models.filter(model => model.toLowerCase().includes(query));
        for (const model of matched.slice(0, 100)) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ios-api-action';
            button.textContent = model;
            button.addEventListener('click', () => applyModel(model));
            results.append(button);
        }
        if (modelPicker.models.length) setText('iosModelStatus', matched.length ? matched.length + ' 个模型' : '没有匹配的模型');
    }

    async function fetchModelsForPicker() {
        const picker = modelPicker;
        const revision = ++picker.revision;
        const [urlId, keyId] = modelFields[picker.kind];
        setText('iosModelStatus', '正在拉取模型…');
        try {
            const base = value(urlId);
            if (!base) throw new Error('请先填写接口地址，或手动填写模型');
            const headers = value(keyId) ? { Authorization: 'Bearer ' + value(keyId) } : {};
            const response = await request(endpoint(base, '/models'), { headers }, 25000);
            const data = await response.json();
            if (modelPicker !== picker || picker.revision !== revision) return;
            const rows = Array.isArray(data) ? data : data.data ?? data.models;
            picker.models = [...new Set((Array.isArray(rows) ? rows : [])
                .map(item => typeof item === 'string' ? item : item?.id || item?.name)
                .filter(item => typeof item === 'string' && item.trim()))].sort((a,b) => a.localeCompare(b));
            drawModels();
            if (!picker.models.length) setText('iosModelStatus', '接口未返回模型，可手动填写');
        } catch (error) {
            if (modelPicker === picker && picker.revision === revision) setText('iosModelStatus', error.message);
        }
    }

    function applyModel(model) {
        if (!model) return;
        const picker = modelPicker;
        const field = byId(modelFields[picker.kind][2]);
        if (field.tagName === 'SELECT') {
            const selected = field.value;
            const options = [...new Set([...picker.models, ...Array.from(field.options, option => option.value), selected, model].filter(Boolean))];
            setOptions(field, options.map(id => [id,id]), model);
            saveData();
        } else {
            field.value = model;
        }
        back();
    }

    byId('iosApiBack').addEventListener('click', () => { if (!back()) closeApiSettings(); });
    byId('iosApiSearch').addEventListener('input', filterSettings);
    apiPage.addEventListener('click', event => {
        const row = event.target.closest('[data-api-view]');
        if (row) showView(row.dataset.apiView);
        if (event.target.closest('[role="switch"]')) refreshSummaries();
    });
    byId('iosAuxSelect').addEventListener('change', event => showAuxProfile(event.target.value));
    byId('iosAuxSave').addEventListener('click', saveAuxProfile);
    byId('iosAuxDelete').addEventListener('click', deleteAuxProfile);
    for (const feature of features) {
        byId('iosRoute-' + feature).addEventListener('change', event => {
            (suite().routes ??= {})[feature] = event.target.value;
            saveData();
        });
    }
    for (const field of providerFields) {
        byId('ios' + field).addEventListener('change', event => {
            suite()[field] = event.target.value.trim();
            saveData();
        });
    }
    byId('iosVoiceProvider').addEventListener('change', event => {
        suite().voiceProvider = event.target.value;
        refreshMedia();
        saveData();
    });
    byId('iosImageProvider').addEventListener('change', event => {
        suite().imageProvider = event.target.value;
        byId('naiToggle').classList.toggle('checked', event.target.value === 'nai');
        refreshMedia();
        saveData();
    });
    byId('iosTimeReal').addEventListener('change', event => {
        suite().timeReal = event.target.checked;
        refreshMedia();
        saveData();
    });
    byId('iosTimeMode').addEventListener('change', event => {
        const config = suite();
        config.timeMode = event.target.value;
        if (config.timeMode === 'custom' && !config.timeValue) {
            const now = new Date();
            config.timeValue = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }
        refreshMedia();
        saveData();
    });
    byId('iosTimeValue').addEventListener('change', event => {
        suite().timeValue = event.target.value;
        saveData();
    });
    byId('iosVoiceTest').addEventListener('click', async event => {
        const button = event.currentTarget;
        const audio = byId('iosVoicePreview');
        audio.pause();
        audio.hidden = true;
        button.disabled = true;
        setText('iosVoiceStatus', '正在生成试听…');
        try {
            const text = value('iosVoiceSample');
            if (!text) throw new Error('请填写试听文字');
            const src = await speech(text);
            if (!src) throw new Error('请填写密钥与默认音色 ID，并检查服务配置');
            audio.src = src;
            audio.hidden = false;
            setText('iosVoiceStatus', '');
        } catch (error) {
            setText('iosVoiceStatus', error.message);
        } finally {
            button.disabled = false;
        }
    });
    apiPage.querySelector('[onclick="fetchModels()"]').onclick = () => pickModel('main');
    byId('secModelFetchBtn').onclick = () => pickModel('legacy');
    byId('iosAuxFetch').onclick = () => pickModel('aux');
    byId('iosMainModelOpen').addEventListener('click', () => pickModel('main', false));
    byId('iosLegacyModelOpen').addEventListener('click', () => pickModel('legacy', false));
    byId('iosModelFetch').addEventListener('click', fetchModelsForPicker);
    byId('iosModelApply').addEventListener('click', () => applyModel(value('iosModelManual')));
    byId('iosModelQuery').addEventListener('input', drawModels);

    return { open, back, getAuxRoute, messageVoice, minimaxSpeech, generateImage, imageReady, timeMode, messageTime, timeDescription, escapeHtml };
})();
