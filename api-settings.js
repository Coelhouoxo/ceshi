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
        routing: '副 API 适用功能', voice: '语音消息',
        image: '绘图工坊', imageConnection: '服务与参数', imagePrompt: '提示词与画师串',
        imageTags: 'GPT 标签', imageVibe: 'Vibe 素材库', imageRoles: '角色与参考图', imageHistory: '生图历史', time: '时间感知', models: '选择模型'
    };
    const voiceNames = { minimax: 'MiniMax', fish: 'Fish Audio', eleven: 'ElevenLabs' };
    const providerFields = ['MiniVoice', 'MiniEndpoint', 'MiniModel', 'FishEndpoint', 'FishKey', 'FishModel', 'FishVoice',
        'ElevenEndpoint', 'ElevenKey', 'ElevenModel', 'ElevenVoice',
        'GptEndpoint', 'GptKey', 'GptModel', 'GptSize', 'GptQuality',
        'MiniSpeed', 'MiniVolume', 'MiniPitch', 'MiniEmotion', 'MiniLanguage',
        'FishSpeed', 'FishVolume', 'FishTemperature', 'FishTopP', 'FishLatency', 'FishProtocol',
        'ElevenSpeed', 'ElevenStability', 'ElevenSimilarity', 'ElevenStyle', 'ElevenLanguage', 'ElevenBoost', 'ElevenFormat'];
    const fieldDefaults = {
        GptSize: '1024x1024', GptQuality: 'auto', FishLatency: 'normal', FishProtocol: 'auto',
        ElevenFormat: 'mp3_44100_128'
    };
    const voiceFields = {
        minimax: ['Mini', 'https://api.minimax.cn', 'minimaxApiKey'],
        fish: ['Fish', 'https://api.fish.audio', 'iosFishKey'],
        eleven: ['Eleven', 'https://api.elevenlabs.io', 'iosElevenKey']
    };
    let voiceCursor = '';
    let voiceRows = [];
    let voiceRevision = 0;
    let voiceListKind = 'voices';
    let currentView = 'home';
    let modelPicker;

    function suite() {
        return globalData.apiSuite ??= {};
    }

    function profiles() {
        return suite().auxProfiles ??= [];
    }

    function migrateAux() {
        const config = suite();
        if (config.auxMigrated || !Object.hasOwn(globalData, 'secApiEndpoint')) return;
        const id = 'imported-secondary';
        const wasUsed = Object.values(legacySwitches).some(key => globalData[key] === true);
        const { secApiEndpoint: endpoint, secApiKey: key, secApiModel: model } = globalData;
        if (endpoint || key || model || wasUsed) {
            if (!profiles().some(profile => profile.id === id)) {
                profiles().push({
                    id, name: '副 API', endpoint: endpoint || '', key: key || '', model: model || '', enabled: true,
                    temperature: Number(globalData.secApiTemp ?? 1), maxTokens: Number(globalData.secApiMaxTokens) || 2048
                });
            }
        }
        const routes = config.routes ??= {};
        for (const feature of features) {
            if (!routes[feature] || routes[feature] === 'legacy') {
                routes[feature] = globalData[legacySwitches[feature]] === true ? id : 'main';
            }
        }
        config.auxMigrated = true;
    }

    const legacySwitches = {
        chat: 'secUseChat', summary: 'secUseSummary', diary: 'secUseDiary',
        forum: 'secUseForum', check_phone: 'secUseCheckPhone', quiz: 'secUseQuiz'
    };

    function getAuxRoute(feature) {
        migrateAux();
        const routes = suite().routes;
        const id = routes && Object.hasOwn(routes, feature) ? routes[feature] : undefined;
        if (!id || id === 'legacy') return null;
        if (id === 'main') return null;
        const profile = profiles().find(item => item.id === id && item.enabled);
        return profile ? { ...profile, isSecondary: true } : null;
    }

    function voiceProvider(chat) {
        const provider = chat?.ttsProvider || suite().voiceProvider;
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

    function voiceNumber(field, min, max, fallback) {
        const raw = suite()[field];
        return raw != null && raw !== '' && Number.isFinite(Number(raw)) ? Math.min(max, Math.max(min, Number(raw))) : fallback;
    }

    function voiceAddress(provider) {
        const [prefix, fallback] = voiceFields[provider];
        return (suite()[prefix + 'Endpoint'] || fallback).replace(/\/+$/, '').replace(/\/v[12]$/, '');
    }

    async function minimaxSpeech(text, id) {
        const config = suite();
        const key = value('minimaxApiKey');
        if (!key || !id || !text.trim()) return null;
        const base = voiceAddress('minimax');
        const url = new URL(endpoint(base, '/v1/t2a_v2'));
        const group = value('minimaxGroupId');
        if (group) url.searchParams.set('GroupId', group);
        const response = await request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
            body: JSON.stringify({
                model: config.MiniModel || 'speech-2.8-turbo', text, stream: false, output_format: 'hex',
                voice_setting: {
                    voice_id: id, speed: voiceNumber('MiniSpeed', 0.5, 2, 1), vol: voiceNumber('MiniVolume', 0.1, 10, 1),
                    pitch: voiceNumber('MiniPitch', -12, 12, 0), ...(config.MiniEmotion ? { emotion: config.MiniEmotion } : {})
                },
                ...(config.MiniLanguage ? { language_boost: config.MiniLanguage } : {}),
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
        const provider = voiceProvider(chat);
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
            const base = voiceAddress('fish');
            const model = (config.FishModel || 's1').replace(/^fish-audio\//, '');
            const compatible = config.FishProtocol === 'compatible' ||
                (config.FishProtocol !== 'native' && new URL(base).hostname === 'api.fish.audio');
            const options = {
                prosody: { speed: voiceNumber('FishSpeed', 0.5, 2, 1), volume: voiceNumber('FishVolume', -20, 20, 0) },
                temperature: voiceNumber('FishTemperature', 0, 1, 0.7),
                top_p: voiceNumber('FishTopP', 0, 1, 0.7), latency: config.FishLatency || 'normal'
            };
            headers.Authorization = 'Bearer ' + key;
            url = endpoint(base, compatible ? (new URL(base).hostname === 'api.fish.audio' ? '/compat/v1/audio/speech' : '/v1/audio/speech') : '/v1/tts');
            if (compatible) {
                body = { model: 'fish-audio/' + model, input: text, voice: id, response_format: 'mp3', provider: { options: { 'fish-audio': options } } };
            } else {
                headers.model = model;
                body = { text, reference_id: id, format: 'mp3', ...options };
            }
        } else {
            const base = voiceAddress('eleven');
            url = endpoint(base, '/v1/text-to-speech/' + encodeURIComponent(id) + '?output_format=' + encodeURIComponent(config.ElevenFormat || fieldDefaults.ElevenFormat));
            headers['xi-api-key'] = key;
            const model = config.ElevenModel || 'eleven_multilingual_v2';
            const voiceSettings = {};
            for (const [field, parameter, min, max] of [
                ['ElevenSpeed', 'speed', 0.7, 1.2], ['ElevenStability', 'stability', 0, 1],
                ['ElevenSimilarity', 'similarity_boost', 0, 1], ['ElevenStyle', 'style', 0, 1]
            ]) {
                if (config[field] != null && config[field] !== '') voiceSettings[parameter] = voiceNumber(field, min, max, min);
            }
            if (config.ElevenBoost) voiceSettings.use_speaker_boost = config.ElevenBoost === 'on';
            body = { text, model_id: model };
            if (Object.keys(voiceSettings).length) body.voice_settings = voiceSettings;
            if (config.ElevenLanguage && model !== 'eleven_multilingual_v2') body.language_code = config.ElevenLanguage.toLowerCase().split('-')[0];
        }
        const points = Array.from(text);
        const limit = isFish ? 1000 : config.ElevenModel === 'eleven_v3' ? 4500 : 9500;
        const parts = [];
        while (points.length) {
            const candidate = points.slice(0, limit);
            let length = candidate.length;
            if (points.length > limit) {
                const boundary = candidate.findLastIndex(char => /[。！？.!?\n]/.test(char));
                if (boundary > limit / 2) length = boundary + 1;
            }
            parts.push(points.splice(0, length).join(''));
        }
        const clips = [];
        for (const part of parts) {
            body[isFish && Object.hasOwn(body, 'input') ? 'input' : 'text'] = part;
            const response = await request(url, { method: 'POST', headers, body: JSON.stringify(body) }, 60000);
            const audio = await response.blob();
            if (!audio.size || !/^(audio\/|application\/octet-stream)/i.test(audio.type)) throw new Error('服务没有返回音频');
            clips.push(audio);
        }
        return blobToBase64(new Blob(clips, { type: 'audio/mpeg' }));
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
        return provider !== 'off' && MiuWorkshop.ready(provider);
    }

    async function generateImage(chat, description) {
        if (!imageReady()) return '';
        try {
            return await MiuWorkshop.generate(imageProvider(), description, chat);
        } catch (error) {
            console.warn('聊天生图失败', error.message);
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
            const currentRoute = suite().routes?.[feature] || 'main';
            setOptions(select, [['main', '主 API'],
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
        const enabled = profiles().filter(p => p.enabled).length;
        setText('iosSecondarySummary', enabled ? enabled + ' 套已启用' : '未配置');
        setText('iosPresetSummary', currentPreset?.value ? currentPreset.textContent : '未选择');
        setText('iosVoiceSummary', voiceNames[voiceProvider()]);
        setText('iosImageSummary', { off: '关闭', nai: 'NovelAI', gpt: 'GPT Image' }[imageProvider()]);
        setText('iosTimeSummary', { real: '真实时间', custom: '自定义', fuzzy: '模糊感知' }[timeMode()]);
        apiPage.querySelectorAll('[role="switch"]').forEach(button => {
            button.setAttribute('aria-checked', String(button.classList.contains('checked')));
        });
    }

    function filterSettings() {
        const terms = value('iosApiSearch').toLowerCase().split(/\s+/).filter(Boolean);
        let count = 0;
        for (const row of searchRows) {
            row.hidden = !terms.every(term => row.dataset.apiSearch.toLowerCase().includes(term));
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
        if (view.startsWith('image')) MiuWorkshop.enter(view);
        if (view === 'voice') renderSoundPresets();
        for (const section of sections) section.hidden = section.dataset.apiSection !== view;
        setText('iosApiTitle', titles[view]);
        setText('iosApiBackLabel', view === 'home' ? '桌面' : view === 'models' ? titles[modelPicker.from] : view.startsWith('image') && view !== 'image' ? '绘图工坊' : 'API 设置');
        byId('iosApiSearchBar').hidden = view !== 'home';
        scroll.scrollTop = 0;
        refreshSummaries();
        if (view === 'home') filterSettings();
    }

    function refreshMedia() {
        const voice = voiceProvider();
        const image = imageProvider();
        byId('iosVoiceProvider').value = voice;
        byId('iosVoiceScopeRow').hidden = voice !== 'fish';
        byId('iosImageProvider').value = image;
        apiPage.querySelectorAll('[data-voice-panel]').forEach(panel => { panel.hidden = panel.dataset.voicePanel !== voice; });
        apiPage.querySelectorAll('[data-image-panel]').forEach(panel => { panel.hidden = panel.dataset.imagePanel !== image; });
        byId('iosTimeReal').checked = timeMode() === 'real';
        byId('iosTimeAlternatives').hidden = timeMode() === 'real';
        byId('iosTimeMode').value = suite().timeMode || 'fuzzy';
        byId('iosTimeCustom').hidden = byId('iosTimeMode').value !== 'custom';
        byId('iosTimeValue').value = suite().timeValue || '';
    }

    function hydrate() {
        for (const field of providerFields) {
            byId('ios' + field).value = suite()[field] ?? fieldDefaults[field] ?? '';
        }
        MiuWorkshop.hydrate();
        migrateAux();
        refreshMedia();
    }

    function open() {
        byId('iosApiSearch').value = '';
        hydrate();
        renderAuxChoices();
        showAuxProfile(value('iosAuxSelect'));
        showView('home');
    }

    function back() {
        if (currentView === 'home') return false;
        if (currentView === 'models') {
            const from = modelPicker.from;
            modelPicker = undefined;
            showView(from);
        } else {
            showView(currentView.startsWith('image') && currentView !== 'image' ? 'image' : 'home');
            saveData();
        }
        return true;
    }

    const modelFields = {
        main: ['apiEndpoint', 'apiKey', 'apiModel'],
        gpt: ['iosGptEndpoint', 'iosGptKey', 'iosGptModel'],
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
            const base = (value(urlId) || (picker.kind === 'gpt' ? 'https://api.openai.com/v1' : '')).replace(/\/images\/(?:generations|edits)\/?$/, '');
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
            field.dispatchEvent(new Event('change', { bubbles: true }));
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
        resetVoiceList();
        renderSoundPresets();
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
    function soundPresets() {
        return suite().soundPresets ??= [];
    }

    function renderSoundPresets(selected = '') {
        const choices = soundPresets().filter(item => item.provider === voiceProvider());
        setOptions(byId('iosSoundPreset'), [['', '新建预设'], ...choices.map(item => [item.id, item.name])], selected);
        byId('iosSoundName').value = choices.find(item => item.id === selected)?.name || '';
        byId('iosSoundDelete').disabled = !selected;
    }

    byId('iosSoundPreset').onchange = event => {
        const item = soundPresets().find(row => row.id === event.target.value);
        if (item) {
            Object.assign(suite(), item.fields);
            hydrate();
            saveData();
        }
        renderSoundPresets(item?.id);
    };
    byId('iosSoundSave').onclick = async () => {
        const name = value('iosSoundName');
        if (!name) return setText('iosVoiceStatus', '请填写声线预设名称');
        const provider = voiceProvider();
        const prefix = voiceFields[provider][0];
        const fields = Object.fromEntries(providerFields.filter(field => field.startsWith(prefix) &&
            !/(?:Endpoint|Key|Protocol)$/.test(field)).map(field => [field, value('ios' + field)]));
        const id = value('iosSoundPreset') || crypto.randomUUID();
        suite().soundPresets = [...soundPresets().filter(item => item.id !== id), { id, name, provider, fields }];
        await saveData();
        renderSoundPresets(id);
        setText('iosVoiceStatus', '已保存');
    };
    byId('iosSoundDelete').onclick = () => {
        const id = value('iosSoundPreset');
        if (!id || !confirm('删除这套声线预设？')) return;
        suite().soundPresets = soundPresets().filter(item => item.id !== id);
        renderSoundPresets();
        saveData();
    };

    function resetVoiceList() {
        voiceRevision++;
        voiceRows = [];
        voiceCursor = '';
        byId('iosVoiceResultsRow').hidden = true;
        byId('iosVoiceMore').hidden = true;
        setText('iosVoiceListStatus', '');
    }

    async function listVoiceOptions(kind, more = false) {
        const provider = voiceProvider();
        const [, , keyId] = voiceFields[provider];
        const key = value(keyId);
        const query = value('iosVoiceQuery');
        const base = voiceAddress(provider);
        if (!more) resetVoiceList();
        const revision = ++voiceRevision;
        voiceListKind = kind;
        setText('iosVoiceListStatus', '正在获取…');
        try {
            let rows;
            let next = '';
            if (kind === 'models' && provider === 'minimax') {
                rows = ['speech-2.8-turbo', 'speech-2.8-hd', 'speech-2.6-turbo', 'speech-2.6-hd', 'speech-02-turbo', 'speech-02-hd'];
            } else {
                if (!key) throw new Error('请先填写当前服务的密钥');
                const path = kind === 'models' ? (provider === 'fish' && new URL(base).hostname === 'api.fish.audio' ? '/compat/v1/models' : '/v1/models')
                    : { fish: '/model', eleven: '/v2/voices', minimax: '/v1/get_voice' }[provider];
                const url = new URL(endpoint(base, path));
                const headers = provider === 'eleven' ? { 'xi-api-key': key } : { Authorization: 'Bearer ' + key };
                const options = { headers };
                if (kind === 'voices' && provider === 'minimax') {
                    const group = value('minimaxGroupId');
                    if (group) url.searchParams.set('GroupId', group);
                    options.method = 'POST';
                    options.headers['Content-Type'] = 'application/json';
                    options.body = JSON.stringify({ voice_type: 'all' });
                } else if (kind === 'voices') {
                    url.searchParams.set('page_size', '50');
                    if (provider === 'fish') {
                        url.searchParams.set('self', String(value('iosVoiceScope') !== 'public'));
                        url.searchParams.set('page_number', more ? voiceCursor : '1');
                        if (query) url.searchParams.set('title', query);
                    } else {
                        if (query) url.searchParams.set('search', query);
                        if (more) url.searchParams.set('next_page_token', voiceCursor);
                    }
                }
                const data = await (await request(url, options, 25000)).json();
                if (kind === 'models') {
                    rows = (Array.isArray(data) ? data : data.data || data.models || []).filter(row => row?.can_do_text_to_speech !== false);
                } else if (provider === 'minimax') {
                    rows = [...(data.system_voice || []), ...(data.voice_cloning || []), ...(data.voice_generation || [])];
                } else {
                    rows = data.voices || data.items || data.models || data.data?.items || [];
                    if (data.has_more && data.next_page_token) next = data.next_page_token;
                    if (provider === 'fish' && (data.has_more || rows.length === 50 && (Number(voiceCursor || 1) * 50 < (data.total ?? Infinity)))) {
                        next = String(Number(voiceCursor || 1) + 1);
                    }
                }
            }
            if (revision !== voiceRevision) return;
            const mapped = rows.map(row => typeof row === 'string' ? [row, row] : [
                row.voice_id || row.model_id || row._id || row.id, row.voice_name || row.title || row.name
            ]).filter(([id, name]) => id && (kind === 'models' || !query || [id, name].some(v => String(v || '').toLowerCase().includes(query.toLowerCase()))));
            voiceRows = [...new Map([...voiceRows, ...mapped]).entries()];
            voiceCursor = next;
            setOptions(byId('iosVoiceResults'), [['', '请选择'], ...voiceRows.map(([id, name]) => [id, name || id])], '');
            byId('iosVoiceResultsRow').hidden = !voiceRows.length;
            byId('iosVoiceMore').hidden = !voiceCursor;
            setText('iosVoiceListStatus', voiceRows.length ? '找到 ' + voiceRows.length + (kind === 'models' ? ' 个模型' : ' 个音色') : '没有找到匹配的结果');
        } catch (error) {
            if (revision === voiceRevision) setText('iosVoiceListStatus', error.message);
        }
    }

    byId('iosVoiceList').onclick = () => listVoiceOptions('voices');
    byId('iosVoiceMore').onclick = () => listVoiceOptions('voices', true);
    byId('iosVoiceModels').onclick = () => listVoiceOptions('models');
    byId('iosVoiceResults').onchange = event => {
        if (!event.target.value) return;
        const field = byId('ios' + voiceFields[voiceProvider()][0] + (voiceListKind === 'models' ? 'Model' : 'Voice'));
        field.value = event.target.value;
        field.dispatchEvent(new Event('change', { bubbles: true }));
    };
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
    byId('iwGptModels').onclick = () => pickModel('gpt');
    byId('iosAuxFetch').onclick = () => pickModel('aux');
    byId('iosMainModelOpen').addEventListener('click', () => pickModel('main', false));
    byId('iosModelFetch').addEventListener('click', fetchModelsForPicker);
    byId('iosModelApply').addEventListener('click', () => applyModel(value('iosModelManual')));
    byId('iosModelQuery').addEventListener('input', drawModels);

    return { open, back, hydrate, endpoint, request, getAuxRoute, messageVoice, minimaxSpeech, generateImage, imageReady, timeMode, messageTime, timeDescription, escapeHtml };
})();
