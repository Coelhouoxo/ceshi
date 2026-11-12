const MiuWorkshop = (() => {
    const $ = id => document.getElementById(id);
    const store = () => (globalData.apiSuite ??= {}).workshop ??= {};
    const api = () => globalData.apiSuite ??= {};
    const get = id => $(id).value.trim();
    const put = (id, value) => { $(id).value = value ?? ''; };
    const status = (id, value) => { $(id).textContent = value; };
    const uuid = () => crypto.randomUUID();
    const join = parts => parts.filter(Boolean).join(', ');
    const clamp = (value, fallback) => value === '' || value == null || !Number.isFinite(Number(value))
        ? fallback : Math.max(0, Math.min(1, Number(value)));
    const imgPattern = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
    const safeImage = value => imgPattern.test(value || '') || /^https:\/\//i.test(value || '') ? value : '';
    const keyId = { nai: 'naiApiKey', gpt: 'iosGptKey' };
    const naiOptions = [
        'iwNaiEndpoint', 'naiApiKey', 'iwNaiProtocol', 'naiModel', 'naiSize', 'naiSteps',
        'naiCfg', 'naiSampler', 'naiSchedule', 'naiSeed', 'iwNaiInterval'
    ];
    const gptOptions = [
        'iosGptEndpoint', 'iosGptKey', 'iosGptModel', 'iosGptSize', 'iosGptQuality', 'iwGptStyle', 'iwGptFormat'
    ];
    const standalone = [
        'iwNaiEndpoint', 'iwNaiProtocol', 'iwNaiInterval', 'iwNaiCharacter', 'iwGptStyle', 'iwGptFormat',
        'iwGptPositive', 'iwGptNegative', 'iwTestProvider', 'iwTestPrompt'
    ];
    const vibeModels = {
        'nai-diffusion-4-5-full': 'v4-5full', 'nai-diffusion-4-5-curated': 'v4-5curated',
        'nai-diffusion-4-full': 'v4full', 'nai-diffusion-4-curated-preview': 'v4curated',
        'nai-diffusion-3': 'v3', 'nai-diffusion-furry-3': 'v3furry'
    };
    let preview;
    let lastNaiRequest = 0;
    let roleImage = '';
    let cropSource;
    let cropRevision = 0;

    function items(key) {
        return store()[key] ??= [];
    }

    function choices(id, rows, current, empty, category) {
        const select = $(id);
        select.replaceChildren(new Option(empty, ''));
        for (const item of rows) {
            const group = category?.(item);
            let parent = select;
            if (group) {
                parent = Array.from(select.children).find(child => child.label === group);
                if (!parent) {
                    parent = document.createElement('optgroup');
                    parent.label = group;
                    select.append(parent);
                }
            }
            parent.append(new Option(item.name, item.id));
        }
        select.value = current || '';
        if (select.selectedIndex < 0) select.selectedIndex = 0;
    }

    function saveItem(key, item) {
        store()[key] = [...items(key).filter(row => row.id !== item.id), item];
        return saveData();
    }

    function removeItem(key, id) {
        if (!id || !confirm('删除此项目？')) return false;
        store()[key] = items(key).filter(item => item.id !== id);
        saveData();
        return true;
    }

    function jsonDownload(data, filename) {
        const href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        download(href, filename);
        setTimeout(() => URL.revokeObjectURL(href), 1000);
    }

    function download(href, filename) {
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        link.rel = 'noopener noreferrer';
        link.target = '_blank';
        link.click();
    }

    function setImage(id, image) {
        const target = $(id);
        target.hidden = !image;
        if (image) target.src = image;
        else target.removeAttribute('src');
    }

    function ready(provider) {
        return Boolean(keyId[provider] && get(keyId[provider]));
    }

    function compile(provider, description, chat) {
        let text = description || '';
        const positive = [provider === 'nai' ? get('naiDefaultPositive') : get('iwGptPositive')];
        const negative = [provider === 'nai' ? get('naiDefaultNegative') : get('iwGptNegative')];
        const roles = [];
        for (const preset of items('prompts')) {
            if (!preset.enabled || !['both', provider].includes(preset.scope)) continue;
            positive.push(preset.artists, preset.positive);
            negative.push(preset.negative);
        }
        if (provider === 'gpt') {
            for (const tag of [...items('tags')].sort((a, b) => b.name.length - a.name.length)) {
                if (!tag.enabled || !tag.name || !text.includes(tag.name)) continue;
                text = text.replaceAll(tag.name, '');
                positive.push(tag.positive);
                negative.push(tag.negative);
            }
        }
        for (const role of items('roles')) {
            const token = '{{' + role.alias + '}}';
            if (!text.includes(token) && (!chat || String(chat.id) !== role.id)) continue;
            text = text.replaceAll(token, role.prompt || role.alias);
            if (role.prompt && !text.includes(role.prompt)) positive.push(role.prompt);
            if (role.enabled && safeImage(role.image)) roles.push(role);
        }
        if (provider === 'nai') positive.push(get('iwNaiCharacter'));
        return { positive: join([...positive, chat?.visualPrompt, text.replace(/^[,\s]+|[,\s]+$/g, '')]), negative: join(negative), roles };
    }

    function base64(bytes) {
        let text = '';
        for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(text);
    }

    function photoData(bytes) {
        if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78) return 'data:image/png;base64,' + base64(bytes);
        if (bytes[0] === 255 && bytes[1] === 216) return 'data:image/jpeg;base64,' + base64(bytes);
        if (bytes[0] === 82 && bytes[1] === 73 && bytes[8] === 87 && bytes[9] === 69) return 'data:image/webp;base64,' + base64(bytes);
        return '';
    }

    async function unzipImage(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let end = bytes.length - 22; end >= Math.max(0, bytes.length - 65557); end--) {
            if (view.getUint32(end, true) !== 0x06054b50) continue;
            let entry = view.getUint32(end + 16, true);
            const count = view.getUint16(end + 10, true);
            for (let n = 0; n < count && entry + 46 <= bytes.length; n++) {
                if (view.getUint32(entry, true) !== 0x02014b50) break;
                const size = view.getUint32(entry + 20, true);
                const offset = view.getUint32(entry + 42, true);
                const nameLength = view.getUint16(entry + 28, true);
                const name = new TextDecoder().decode(bytes.subarray(entry + 46, entry + 46 + nameLength));
                const method = view.getUint16(entry + 10, true);
                entry += 46 + nameLength + view.getUint16(entry + 30, true) + view.getUint16(entry + 32, true);
                if (!/\.(png|jpe?g|webp)$/i.test(name) || offset + 30 > bytes.length) continue;
                const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
                const packed = bytes.subarray(start, start + size);
                if (method === 0) return photoData(packed);
                if (method === 8) {
                    const decoded = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
                    return photoData(new Uint8Array(await new Response(decoded).arrayBuffer()));
                }
            }
            break;
        }
        return '';
    }

    function jsonImage(value) {
        const candidate = value?.data?.[0] || value?.data || value;
        const image = typeof candidate === 'string' ? candidate :
            candidate?.b64_json || candidate?.image || candidate?.b64 || candidate?.base64 || candidate?.images?.[0];
        if (candidate?.event_type === 'intermediate') return '';
        if (safeImage(image)) return image;
        if (typeof image === 'string' && /^[A-Za-z0-9+/=]+$/.test(image)) {
            return photoData(Uint8Array.from(atob(image), char => char.charCodeAt(0)));
        }
        return safeImage(candidate?.url);
    }

    async function responseImage(response) {
        const type = response.headers.get('content-type') || '';
        let result;
        if (type.includes('json')) result = jsonImage(await response.json());
        else if (type.includes('event-stream')) {
            const events = (await response.text()).split('\n');
            for (const line of events.reverse()) {
                if (!line.startsWith('data:')) continue;
                try { result = jsonImage(JSON.parse(line.slice(5).trim())); }
                catch { result = jsonImage({ image: line.slice(5).trim() }); }
                if (result) break;
            }
        } else {
            const bytes = new Uint8Array(await response.arrayBuffer());
            const text = bytes[0] === 123 || bytes[0] === 91 ? new TextDecoder().decode(bytes) : '';
            result = text ? jsonImage(JSON.parse(text)) : photoData(bytes) || await unzipImage(bytes);
        }
        if (!result) throw new Error('服务没有返回可读取的图片');
        return result;
    }

    function endpoint(base, route) {
        return MiuApi.endpoint(base.replace(/\/+$/, '').replace(/\/(?:images\/(?:generations|edits)|ai\/(?:generate-image(?:-stream)?|encode-vibe))\/?$/i, ''), route);
    }

    function headers(key) {
        return { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
    }

    function naiAddress(route) {
        const base = get('iwNaiEndpoint');
        if (route === '/images/generations' && !base) throw new Error('请填写支持 OpenAI 兼容协议的生图接口地址');
        const url = endpoint(base || 'https://image.novelai.net', route);
        const oldProxy = get('naiProxy');
        if (base || !oldProxy || route === '/images/generations') return url;
        const proxy = oldProxy.replace('https://api.novelai.net', '').trim();
        if (!proxy) return url;
        const relay = new URL(proxy);
        if (!['http:', 'https:'].includes(relay.protocol)) throw new Error('代理地址无效');
        return proxy + (/[?=]$/.test(proxy) ? '' : '?') + encodeURIComponent(url);
    }

    async function referenceRows(model, key) {
        if (!store().vibeEnabled || !store().vibeSelected) return [];
        const library = items('vibes');
        const chosen = library.find(item => item.id === store().vibeSelected);
        if (!chosen) return [];
        const modelKey = vibeModels[model];
        if (!modelKey) throw new Error('当前 NovelAI 模型不支持 Vibe');
        const rows = chosen.images || [chosen];
        const references = [];
        let changed = false;
        for (const item of rows) {
            const info = clamp(item.info, 1);
            const strength = clamp(item.strength, 0.6);
            const matches = item.encodings?.[modelKey] || item.encodings?.[model] || {};
            let encoding = Object.values(matches).find(row =>
                typeof row?.encoding === 'string' && Number(row.params?.information_extracted ?? info) === info
            )?.encoding;
            if (!encoding) {
                if (!imgPattern.test(item.image || '')) throw new Error('素材缺少当前模型的 Vibe 编码和原图');
                encoding = item.image.split(',')[1];
                if (modelKey.startsWith('v4')) {
                    const response = await MiuApi.request(naiAddress('/ai/encode-vibe'), {
                        method: 'POST', headers: headers(key),
                        body: JSON.stringify({ image: encoding, model, information_extracted: info })
                    }, 60000);
                    if ((response.headers.get('content-type') || '').includes('json')) {
                        const data = await response.json();
                        encoding = data.encoding || data.data?.encoding;
                    } else encoding = base64(new Uint8Array(await response.arrayBuffer()));
                    if (!encoding) throw new Error('Vibe 编码为空');
                    item.encodings ??= {};
                    (item.encodings[modelKey] ??= {})[info] = { encoding, params: { information_extracted: info } };
                    changed = true;
                }
            }
            references.push({ encoding, info, strength });
        }
        if (changed) await saveData();
        return references;
    }

    async function novelai(prompt) {
        const key = get('naiApiKey');
        const model = get('naiModel') || 'nai-diffusion-4-5-full';
        const modern = /^nai-diffusion-[45]/.test(model);
        const protocol = get('iwNaiProtocol');
        const [width, height] = (get('naiSize') || '1024x1024').split('x').map(Number);
        const positive = prompt.positive;
        const negative = prompt.negative || 'lowres, bad anatomy, bad hands, watermark, text, worst quality';
        const canUseFace = protocol !== 'openai' && model.startsWith('nai-diffusion-4-5');
        const faces = canUseFace ? prompt.roles : [];
        if (protocol === 'openai' && store().vibeEnabled && store().vibeSelected) {
            throw new Error('Vibe 需要 NovelAI 原生接口');
        }
        if (faces.length > 1) throw new Error('NovelAI 人物参考请一次只绑定一个角色');
        if (faces.length && store().vibeEnabled && store().vibeSelected) {
            throw new Error('NovelAI 人物参考和 Vibe 请择一使用');
        }
        const seed = Number(get('naiSeed'));
        const parameters = {
            width, height, scale: Number(get('naiCfg')) || 5, steps: Math.min(50, Math.max(1, Number(get('naiSteps')) || 28)),
            seed: get('naiSeed') && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : crypto.getRandomValues(new Uint32Array(1))[0],
            sampler: get('naiSampler') || 'k_euler_ancestral', noise_schedule: get('naiSchedule') || 'karras',
            negative_prompt: negative, n_samples: 1, ucPreset: 1, qualityToggle: true
        };
        if (modern) {
            parameters.params_version = model.startsWith('nai-diffusion-5') ? 4 : 3;
            parameters.v4_prompt = { caption: { base_caption: positive, char_captions: prompt.roles.map(role => ({ char_caption: role.prompt || role.alias, centers: [] })) }, use_coords: false, use_order: true };
            parameters.v4_negative_prompt = { caption: { base_caption: negative, char_captions: prompt.roles.map(() => ({ char_caption: '', centers: [] })) }, legacy_uc: false };
        } else {
            parameters.sm = $('naiSmeaToggle').classList.contains('checked');
            parameters.sm_dyn = parameters.sm;
        }
        if (faces.length) {
            parameters.director_reference_images = faces.map(role => role.image.split(',')[1]);
            parameters.director_reference_descriptions = faces.map(() => ({ caption: { base_caption: 'character', char_captions: [] }, legacy_uc: false }));
            parameters.director_reference_information_extracted = faces.map(() => 1);
            parameters.director_reference_strength_values = faces.map(role => clamp(role.strength, 0.65));
            parameters.director_reference_secondary_strength_values = faces.map(role => 1 - clamp(role.fidelity, 0.8));
        }
        const refs = protocol === 'openai' ? [] : await referenceRows(model, key);
        if (refs.length) {
            const total = refs.reduce((sum, ref) => sum + ref.strength, 0);
            const divisor = modern && store().vibeNormalize !== false ? Math.max(total, 1) : 1;
            parameters.reference_image_multiple = refs.map(ref => ref.encoding);
            parameters.reference_information_extracted_multiple = refs.map(ref => ref.info);
            parameters.reference_strength_multiple = refs.map(ref => ref.strength / divisor);
        }
        const gap = Math.min(300, Math.max(0, Number(get('iwNaiInterval')) || 0)) * 1000;
        const start = Math.max(lastNaiRequest + gap, Date.now());
        lastNaiRequest = start;
        if (start > Date.now()) await new Promise(resolve => setTimeout(resolve, start - Date.now()));
        const route = protocol === 'openai' ? '/images/generations' : modern ? '/ai/generate-image-stream' : '/ai/generate-image';
        const body = protocol === 'openai'
            ? { model, prompt: positive, negative_prompt: negative, size: width + 'x' + height, n: 1, response_format: 'b64_json' }
            : { model, input: positive, action: 'generate', parameters };
        const response = await MiuApi.request(naiAddress(route), { method: 'POST', headers: headers(key), body: JSON.stringify(body) }, 180000);
        return responseImage(response);
    }

    async function gpt(prompt) {
        const base = get('iosGptEndpoint') || 'https://api.openai.com/v1';
        const key = get('iosGptKey');
        const model = get('iosGptModel') || 'gpt-image-2';
        const native = /^gpt-image-/i.test(model);
        const body = {
            model, n: 1,
            prompt: [prompt.positive, prompt.negative && 'Avoid these elements or qualities: ' + prompt.negative].filter(Boolean).join('\n\n'),
            size: get('iosGptSize') || '1024x1024',
            quality: get('iosGptQuality') || 'auto'
        };
        if (!native) {
            body.response_format = get('iwGptFormat') || 'b64_json';
            if (model === 'dall-e-3') {
                body.size = ({ '1024x1536': '1024x1792', '1536x1024': '1792x1024' })[body.size] || body.size;
                body.quality = body.quality === 'high' ? 'hd' : 'standard';
                if (get('iwGptStyle')) body.style = get('iwGptStyle');
            } else delete body.quality;
        }
        const route = prompt.roles.length && native ? '/images/edits' : '/images/generations';
        const requestHeaders = headers(key);
        let payload = JSON.stringify(body);
        if (route === '/images/edits') {
            if (prompt.roles.length > 16) throw new Error('一次最多使用 16 张角色参考图');
            const form = new FormData();
            for (const [name, value] of Object.entries(body)) form.append(name, String(value));
            for (const [index, role] of prompt.roles.entries()) {
                const image = await (await fetch(role.image)).blob();
                form.append('image[]', image, 'reference-' + index + (image.type === 'image/jpeg' ? '.jpg' : '.png'));
            }
            delete requestHeaders['Content-Type'];
            payload = form;
        }
        return responseImage(await MiuApi.request(endpoint(base, route), { method: 'POST', headers: requestHeaders, body: payload }, 180000));
    }

    async function generate(provider, description, chat) {
        if (!ready(provider)) throw new Error('请先在服务与参数里填写 API 密钥');
        const prompt = compile(provider, description, chat);
        if (!prompt.positive.trim()) throw new Error('请输入画面描述或正面词');
        return provider === 'nai' ? novelai(prompt) : gpt(prompt);
    }

    const edits = {
        prompts: {
            select: 'iwPromptPreset', status: 'iwPromptStatus', name: 'iwPromptName', empty: '新建预设',
            fields: { artists: 'iwArtists', positive: 'iwPresetPositive', negative: 'iwPresetNegative', scope: 'iwPromptScope' },
            defaults: { scope: 'both' }, enabled: 'iwPromptEnabled', save: 'iwPromptSave', remove: 'iwPromptDelete'
        },
        tags: {
            select: 'iwTagPreset', status: 'iwTagStatus', name: 'iwTagName', empty: '新建标签',
            fields: { category: 'iwTagCategory', positive: 'iwTagPositive', negative: 'iwTagNegative' },
            enabled: 'iwTagEnabled', save: 'iwTagSave', remove: 'iwTagDelete', category: item => item.category || '未分类'
        }
    };

    function editItem(key, id = get(edits[key].select)) {
        const edit = edits[key];
        choices(edit.select, items(key), id, edit.empty, edit.category);
        const item = items(key).find(row => row.id === id);
        put(edit.name, item?.name);
        for (const [field, element] of Object.entries(edit.fields)) put(element, item?.[field] ?? edit.defaults?.[field]);
        $(edit.enabled).checked = item?.enabled !== false;
        $(edit.remove).disabled = !item;
        status(edit.status, '');
    }

    for (const [key, edit] of Object.entries(edits)) {
        $(edit.select).onchange = () => editItem(key);
        $(edit.save).onclick = async () => {
            const item = { id: get(edit.select) || uuid(), name: get(edit.name), enabled: $(edit.enabled).checked };
            if (!item.name) return status(edit.status, '请填写名称');
            for (const [field, element] of Object.entries(edit.fields)) item[field] = get(element);
            await saveItem(key, item);
            editItem(key, item.id);
            status(edit.status, '已保存');
        };
        $(edit.remove).onclick = () => { if (removeItem(key, get(edit.select))) editItem(key, ''); };
    }

    function refreshConnection() {
        const provider = get('iwConnectionProvider');
        document.querySelectorAll('[data-iw-connection]').forEach(panel => { panel.hidden = panel.dataset.iwConnection !== provider; });
        choices('iwConnectionPreset', items('connections').filter(item => item.provider === provider), store().activeConnection?.[provider], '当前配置');
        const preset = items('connections').find(item => item.id === get('iwConnectionPreset'));
        put('iwConnectionName', preset?.name);
        $('iwConnectionDelete').disabled = !preset;
    }

    $('iwConnectionProvider').onchange = refreshConnection;
    $('iwConnectionPreset').onchange = async () => {
        const provider = get('iwConnectionProvider');
        const id = get('iwConnectionPreset');
        (store().activeConnection ??= {})[provider] = id;
        const preset = items('connections').find(item => item.id === id && item.provider === provider);
        for (const field of provider === 'nai' ? naiOptions : gptOptions) {
            if (preset && Object.hasOwn(preset.fields, field)) {
                put(field, preset.fields[field]);
                $(field).dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        if (preset && provider === 'nai' && typeof preset.smea === 'boolean') $('naiSmeaToggle').classList.toggle('checked', preset.smea);
        refreshConnection();
        await saveData();
    };
    $('iwConnectionSave').onclick = async () => {
        const provider = get('iwConnectionProvider');
        const name = get('iwConnectionName');
        if (!name) return status('iwConnectionStatus', '请填写方案名称');
        const id = get('iwConnectionPreset') || uuid();
        const fields = Object.fromEntries((provider === 'nai' ? naiOptions : gptOptions).map(field => [field, get(field)]));
        (store().activeConnection ??= {})[provider] = id;
        await saveItem('connections', { id, provider, name, fields, smea: $('naiSmeaToggle').classList.contains('checked') });
        refreshConnection();
        status('iwConnectionStatus', '已保存');
    };
    $('iwConnectionDelete').onclick = () => {
        if (!removeItem('connections', get('iwConnectionPreset'))) return;
        delete store().activeConnection[get('iwConnectionProvider')];
        refreshConnection();
        saveData();
    };

    $('iwPromptImportButton').onclick = () => $('iwPromptImport').click();
    $('iwPromptExport').onclick = () => jsonDownload({ prompts: items('prompts') }, '绘图提示词.json');
    $('iwPromptImport').onchange = async event => {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            const rows = Array.isArray(data) ? data : data.prompts || data.promptPresets || data.presets || [data];
            const imported = rows.filter(row => typeof row?.name === 'string' && row.name.trim()).map(row => ({
                id: uuid(), name: row.name, scope: ['nai', 'gpt'].includes(row.scope) ? row.scope : 'both',
                artists: String(row.artists || row.artistPrompt || ''),
                positive: join([row.positive || row.positivePrompt, row.characterPrompt]), negative: String(row.negative || row.negativePrompt || ''),
                enabled: row.enabled !== false
            }));
            if (!imported.length) throw new Error('没有找到可导入的提示词预设');
            items('prompts').push(...imported);
            await saveData();
            editItem('prompts', imported[0].id);
            status('iwPromptStatus', '已导入 ' + imported.length + ' 套预设');
        } catch (error) { status('iwPromptStatus', error.message); }
        event.target.value = '';
    };

    function importVibes(data, name) {
        const make = (entry, fallback) => {
            if (!entry || typeof entry !== 'object') return null;
            const raw = entry.image || entry.base64 || '';
            const image = safeImage(raw) || (/^[A-Za-z0-9+/=]+$/.test(raw) ? jsonImage({ image: raw }) : '');
            const encodings = entry.encodings && typeof entry.encodings === 'object' ? entry.encodings : {};
            if (entry.encoding && entry.encodingModel) {
                const key = vibeModels[entry.encodingModel] || entry.encodingModel;
                encodings[key] ??= { original: { encoding: entry.encoding, params: { information_extracted: entry.infoExtracted ?? 1 } } };
            }
            if (!image && !Object.keys(encodings).length) return null;
            return {
                id: uuid(), name: entry.name || fallback, image, encodings,
                thumbnail: safeImage(entry.thumbnail),
                info: clamp(entry.info ?? entry.infoExtracted ?? entry.importInfo?.information_extracted, 1),
                strength: clamp(entry.strength ?? entry.refStrength ?? entry.importInfo?.strength, 0.6)
            };
        };
        if (data?.groups && data.vibeData) {
            return Object.entries(data.groups).map(([group, entry]) => ({
                id: uuid(), name: group, images: (entry.vibes || []).map(row => make({ ...data.vibeData[row.vibeDataId], strength: row.strength }, group)).filter(Boolean)
            })).filter(entry => entry.images.length);
        }
        const rows = Array.isArray(data) ? data : data.vibes || [data];
        return rows.map(entry => entry?.images
            ? { id: uuid(), name: entry.name || name, images: entry.images.map(image => make(image, name)).filter(Boolean) }
            : make(entry, name)).filter(entry => entry && (!entry.images || entry.images.length));
    }

    async function localImage(file) {
        if (file.size > 18 * 1024 * 1024) throw new Error('请选择小于 18 MB 的图片');
        const bitmap = await createImageBitmap(file);
        try {
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const ctx = canvas.getContext('2d');
            const fit = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
            const w = bitmap.width * fit;
            const h = bitmap.height * fit;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
            return canvas.toDataURL('image/jpeg', 0.9);
        } finally { bitmap.close(); }
    }

    function refreshVibe() {
        const current = store().vibeSelected;
        choices('iwVibeSelected', items('vibes'), current, '请选择');
        const row = items('vibes').find(item => item.id === current);
        const member = get('iwVibeMember');
        const images = row?.images || [];
        choices('iwVibeMember', images, member || images[0]?.id, '选择图片');
        if (images.length && !get('iwVibeMember')) put('iwVibeMember', images[0].id);
        $('iwVibeMemberRow').hidden = !images.length;
        const image = images.find(item => item.id === get('iwVibeMember')) || row;
        put('iwVibeName', row?.name);
        put('iwVibeStrength', image?.strength ?? 0.6);
        put('iwVibeInfo', image?.info ?? 1);
        setImage('iwVibeThumb', safeImage(image?.thumbnail || image?.image));
        $('iwVibeEnabled').checked = Boolean(store().vibeEnabled);
        $('iwVibeNormalize').checked = store().vibeNormalize !== false;
        $('iwVibeSave').disabled = $('iwVibeDelete').disabled = !row;
    }
    $('iwVibeSelected').onchange = () => { store().vibeSelected = get('iwVibeSelected'); refreshVibe(); saveData(); };
    $('iwVibeMember').onchange = refreshVibe;
    $('iwVibeEnabled').onchange = event => { store().vibeEnabled = event.target.checked; saveData(); };
    $('iwVibeNormalize').onchange = event => { store().vibeNormalize = event.target.checked; saveData(); };
    $('iwVibeSave').onclick = async () => {
        const item = items('vibes').find(row => row.id === store().vibeSelected);
        if (!item) return;
        item.name = get('iwVibeName') || item.name;
        const image = item.images?.find(row => row.id === get('iwVibeMember')) || item;
        image.info = clamp(get('iwVibeInfo'), 1);
        image.strength = clamp(get('iwVibeStrength'), 0.6);
        await saveData();
        refreshVibe();
        status('iwVibeStatus', '已保存');
    };
    $('iwVibeDelete').onclick = () => {
        if (!removeItem('vibes', store().vibeSelected)) return;
        store().vibeSelected = '';
        refreshVibe();
        saveData();
    };
    $('iwVibeUploadButton').onclick = () => $('iwVibeUpload').click();
    $('iwVibeExport').onclick = () => jsonDownload({ vibes: items('vibes') }, 'Vibe素材库.json');
    $('iwVibeUpload').onchange = async event => {
        const incoming = [];
        try {
            for (const file of event.target.files) {
                if (file.type.startsWith('image/')) {
                    incoming.push({ id: uuid(), name: file.name, image: await localImage(file), strength: 0.6, info: 1 });
                } else incoming.push(...importVibes(JSON.parse(await file.text()), file.name));
            }
            if (!incoming.length) throw new Error('没有找到可用的 Vibe 素材');
            const allImages = incoming.every(item => item.image && !item.images);
            if (allImages && incoming.length > 1) incoming.splice(0, incoming.length, { id: uuid(), name: 'Vibe 分组', images: [...incoming] });
            items('vibes').push(...incoming);
            store().vibeSelected = incoming[0].id;
            store().vibeEnabled = true;
            await saveData();
            refreshVibe();
            status('iwVibeStatus', '已导入');
        } catch (error) { status('iwVibeStatus', error.message); }
        event.target.value = '';
    };

    function refreshRole() {
        closeCrop();
        const id = get('iwRole');
        choices('iwRole', chatList.map(chat => ({ id: String(chat.id), name: chat.name || chat.realName || String(chat.id) })), id, '选择角色');
        const role = items('roles').find(row => row.id === id);
        const chat = chatList.find(row => String(row.id) === id);
        put('iwRoleAlias', role?.alias ?? chat?.name ?? chat?.realName);
        put('iwRolePrompt', role?.prompt ?? chat?.visualPrompt);
        put('iwRoleStrength', role?.strength ?? 0.65);
        put('iwRoleFidelity', role?.fidelity ?? 0.8);
        $('iwRoleEnabled').checked = Boolean(role?.enabled);
        roleImage = safeImage(role?.image);
        setImage('iwRoleThumb', roleImage);
        $('iwRoleSave').disabled = $('iwRoleUploadButton').disabled = !chat;
    }
    $('iwRole').onchange = refreshRole;
    function closeCrop() {
        cropRevision++;
        cropSource?.close();
        cropSource = undefined;
        $('iwRoleCrop').hidden = true;
        $('iwRoleSave').disabled = !get('iwRole');
    }

    function paintCrop(canvas) {
        const source = cropSource;
        if (!source) return;
        const ratio = Math.max(canvas.width / source.width, canvas.height / source.height) * Number(get('iwRoleZoom'));
        const width = source.width * ratio;
        const height = source.height * ratio;
        const left = (canvas.width - width) * Number(get('iwRoleCropX')) / 100;
        const top = (canvas.height - height) * Number(get('iwRoleCropY')) / 100;
        canvas.getContext('2d').drawImage(source, left, top, width, height);
    }

    $('iwRoleUploadButton').onclick = () => $('iwRoleUpload').click();
    $('iwRoleUpload').onchange = async event => {
        const file = event.target.files[0];
        if (!file) return;
        closeCrop();
        const revision = cropRevision;
        try {
            if (file.size > 18 * 1024 * 1024) throw new Error('请选择小于 18 MB 的图片');
            const bitmap = await createImageBitmap(file);
            if (revision !== cropRevision) { bitmap.close(); return; }
            cropSource = bitmap;
            put('iwRoleZoom', '1');
            put('iwRoleCropX', '50');
            put('iwRoleCropY', '50');
            $('iwRoleCrop').hidden = false;
            $('iwRoleSave').disabled = true;
            paintCrop($('iwRoleCropCanvas'));
        } catch (error) { status('iwRoleStatus', error.message); }
        finally { event.target.value = ''; }
    };
    for (const id of ['iwRoleZoom', 'iwRoleCropX', 'iwRoleCropY']) {
        $(id).oninput = () => paintCrop($('iwRoleCropCanvas'));
    }
    $('iwRoleCropApply').onclick = () => {
        if (!cropSource) return;
        const canvas = document.createElement('canvas');
        canvas.width = 832;
        canvas.height = 1216;
        paintCrop(canvas);
        roleImage = canvas.toDataURL('image/png');
        setImage('iwRoleThumb', roleImage);
        $('iwRoleEnabled').checked = true;
        closeCrop();
    };
    $('iwRoleCropCancel').onclick = closeCrop;
    $('iwRoleClear').onclick = () => { closeCrop(); roleImage = ''; setImage('iwRoleThumb', ''); $('iwRoleEnabled').checked = false; };
    $('iwRoleSave').onclick = async () => {
        const id = get('iwRole');
        if (!id || !get('iwRoleAlias')) return status('iwRoleStatus', '请选择角色并填写角色变量');
        await saveItem('roles', {
            id, alias: get('iwRoleAlias'), prompt: get('iwRolePrompt'), enabled: $('iwRoleEnabled').checked,
            strength: clamp(get('iwRoleStrength'), 0.65), fidelity: clamp(get('iwRoleFidelity'), 0.8), image: roleImage
        });
        status('iwRoleStatus', '已保存');
    };

    function showPreview(item) {
        preview = item;
        $('iwPreviewPanel').hidden = !item;
        if (item) {
            setImage('iwPreview', item.image);
            $('iwSavePreview').disabled = items('history').some(row => row.id === item.id);
        }
    }

    function renderHistory() {
        const list = $('iwHistoryList');
        list.replaceChildren();
        for (const row of items('history').slice().reverse()) {
            const button = document.createElement('button');
            button.type = 'button';
            const image = document.createElement('img');
            image.src = row.image;
            image.alt = row.prompt || '生图历史';
            button.append(image);
            button.onclick = () => {
                put('iwTestProvider', row.provider);
                put('iwTestPrompt', row.prompt);
                showPreview(row);
                document.querySelector('[data-api-view="image"]').click();
                $('iwPreview').scrollIntoView({ block: 'nearest' });
            };
            list.append(button);
        }
        status('iwHistoryStatus', list.children.length ? '' : '暂无历史记录');
    }

    function addPromptToken(text) {
        put('iwTestPrompt', join([get('iwTestPrompt'), text]));
        store().iwTestPrompt = get('iwTestPrompt');
        saveData();
    }

    function renderRoleTokens() {
        const root = $('iwQuickRoles');
        const roles = items('roles').filter(role => role.alias);
        root.replaceChildren();
        root.hidden = !roles.length;
        for (const role of roles) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = role.alias;
            button.onclick = () => addPromptToken('{{' + role.alias + '}}');
            root.append(button);
        }
    }

    function renderTags() {
        const root = $('iwQuickTags');
        root.replaceChildren();
        root.hidden = get('iwTestProvider') !== 'gpt';
        const groups = new Map();
        for (const tag of items('tags')) {
            if (!tag.enabled) continue;
            const category = tag.category || '未分类';
            if (!groups.has(category)) groups.set(category, []);
            groups.get(category).push(tag);
        }
        for (const [label, tags] of groups) {
            const section = document.createElement('div');
            section.className = 'ios-api-tag-list';
            const title = document.createElement('span');
            title.textContent = label;
            section.append(title);
            for (const tag of tags) {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = tag.name;
                button.onclick = () => addPromptToken(tag.name);
                section.append(button);
            }
            root.append(section);
        }
    }

    $('iwGenerate').onclick = async event => {
        const button = event.currentTarget;
        const provider = get('iwTestProvider');
        const prompt = get('iwTestPrompt');
        button.disabled = true;
        status('iwStatus', '正在生成…');
        try {
            const image = await generate(provider, prompt);
            showPreview({ id: uuid(), image, provider, prompt });
            status('iwStatus', '');
        } catch (error) { status('iwStatus', error.message); }
        finally { button.disabled = false; }
    };
    $('iwSavePreview').onclick = async () => {
        if (!preview) return;
        store().history = [...items('history').filter(row => row.id !== preview.id).slice(-5), preview];
        await saveData();
        $('iwSavePreview').disabled = true;
        status('iwStatus', '已保存到生图历史');
    };
    $('iwDownload').onclick = () => {
        if (!preview) return;
        const ext = preview.image.match(/^data:image\/(png|jpeg|webp)/)?.[1] || 'png';
        download(preview.image, '绘图-' + preview.id + '.' + ext);
    };

    for (const id of standalone) {
        $(id).addEventListener('change', () => {
            store()[id] = get(id);
            if (id === 'iwTestProvider') renderTags();
            saveData();
        });
    }
    for (const id of [...naiOptions, 'naiDefaultPositive', 'naiDefaultNegative']) {
        $(id).addEventListener('change', () => saveData());
    }

    function enter(view) {
        if (view !== 'imageRoles') closeCrop();
        if (view === 'image') { renderTags(); renderRoleTokens(); }
        if (view === 'imageConnection') refreshConnection();
        if (view === 'imagePrompt') editItem('prompts');
        if (view === 'imageTags') editItem('tags');
        if (view === 'imageVibe') refreshVibe();
        if (view === 'imageRoles') refreshRole();
        if (view === 'imageHistory') renderHistory();
    }

    function hydrate() {
        const defaults = { iwNaiProtocol: 'native', iwTestProvider: 'nai' };
        for (const id of standalone) put(id, store()[id] ?? defaults[id]);
        if (!store().iwTestProvider && api().imageProvider === 'gpt') put('iwTestProvider', 'gpt');
    }

    return { enter, hydrate, ready, generate };
})();
