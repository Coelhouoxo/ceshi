'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const room = document.getElementById('chatRoom');
    const history = document.getElementById('roomMessages');
    const reduced = matchMedia('(prefers-reduced-transparency: reduce)');
    if (!room || !history || !window.requestAnimationFrame) return;

    const lenses = [...room.querySelectorAll('.conversation-header .conversation-glass, #newRoomFooter .conversation-glass')];
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = (name, attributes = {}) => {
        const element = document.createElementNS(namespace, name);
        for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
        return element;
    };
    const definitions = svg('svg', {width: '0', height: '0', 'aria-hidden': 'true'});
    definitions.classList.add('chat-optic-filters');
    const defs = svg('defs');
    definitions.append(defs);
    room.append(definitions);

    const records = new Map();
    let frame = 0;
    let nextFilter = 0;

    function applyLens(record, width, height, radius, material) {
        const size = [width, height, radius, material.strength].join(':');
        if (record.size === size) return true;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return false;
        const pixels = context.createImageData(width, height);
        const gloss = context.createImageData(width, height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const ux = x + .5 - width / 2;
                const uy = y + .5 - height / 2;
                const dx = Math.abs(ux) + radius - width / 2;
                const dy = Math.abs(uy) + radius - height / 2;
                const cx = Math.max(dx, 0);
                const cy = Math.max(dy, 0);
                const length = Math.hypot(cx, cy);
                const distance = length + Math.min(Math.max(dx, dy), 0) - radius;
                const nx = Math.sign(ux) * (length ? cx / length : Number(dx > dy));
                const ny = Math.sign(uy) * (length ? cy / length : Number(dy >= dx));
                const t = Math.max(0, Math.min(1, 1 + distance / material.edge));
                const shift = 114 * t * t * (3 - 2 * t);
                const offset = (y * width + x) * 4;
                pixels.data[offset] = 128 - shift * nx;
                pixels.data[offset + 1] = 128 - shift * ny;
                pixels.data[offset + 2] = 128;
                pixels.data[offset + 3] = 255;
                if (distance <= 0 && distance >= -5) {
                    const light = -.4 * nx - .92 * ny;
                    const rim = Math.max(0, 1 - Math.abs(distance + .75) / 1.2);
                    const lip = Math.max(0, 1 - Math.abs(distance + 2.5) / 2.1);
                    const shine = rim * (.12 + .67 * Math.max(0, light) ** 3);
                    const shade = lip * .20 * Math.max(0, -light) ** 2;
                    gloss.data[offset] = gloss.data[offset + 1] = gloss.data[offset + 2] = shine >= shade ? 255 : 25;
                    gloss.data[offset + 3] = 255 * Math.max(shine, shade);
                }
            }
        }
        context.putImageData(pixels, 0, 0);

        const displacement = canvas.toDataURL();
        context.putImageData(gloss, 0, 0);
        record.pane.style.setProperty('--optic-glint', 'url("' + canvas.toDataURL() + '")');
        const id = 'ceshi-optic-' + ++nextFilter;
        const filter = svg('filter', {id, filterUnits: 'userSpaceOnUse', x: '-14', y: '-14', width: width + 28, height: height + 28, 'color-interpolation-filters': 'sRGB'});
        filter.append(
            svg('feImage', {href: displacement, width, height, preserveAspectRatio: 'none', result: 'field'}),
            svg('feGaussianBlur', {in: 'SourceGraphic', stdDeviation: material.blur, result: 'sample'}),
            svg('feDisplacementMap', {in: 'sample', in2: 'field', scale: material.strength, xChannelSelector: 'R', yChannelSelector: 'G', result: 'refracted'}),
            svg('feColorMatrix', {in: 'refracted', type: 'saturate', values: material.saturation})
        );
        record.filter?.remove();
        defs.append(filter);
        record.filter = filter;
        record.size = size;
        record.sample.style.filter = 'url(#' + id + ')';
        return true;
    }

    function createRecord(target) {
        const pane = document.createElement('span');
        const sample = document.createElement('span');
        const wall = document.createElement('span');
        pane.className = 'chat-optic';
        pane.setAttribute('aria-hidden', 'true');
        pane.inert = true;
        sample.className = 'chat-optic-sample';
        wall.className = 'chat-optic-wall';
        sample.append(wall);
        pane.append(sample);
        target.prepend(pane);
        const record = {pane, sample, wall, copies: new Map()};
        records.set(target, record);
        return record;
    }

    function update() {
        frame = 0;
        if (!room.classList.contains('active') || reduced.matches) return;
        const bounds = room.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const background = getComputedStyle(room).backgroundImage;
        const rows = Array.from(history.children, node => [node, node.getBoundingClientRect()]);
        for (const target of lenses) {
            const box = target.getBoundingClientRect();
            const width = target.offsetWidth;
            const height = target.offsetHeight;
            if (width < 8 || height < 8) continue;
            const record = records.get(target) || createRecord(target);
            const corner = getComputedStyle(target).borderTopLeftRadius;
            const radius = Math.min(width / 2, height / 2, corner.includes('%') ? Infinity : parseFloat(corner) || 20);
            const material = target.classList.contains('conversation-field')
                ? {edge: 3.1, strength: 13, blur: .65, saturation: 1.14}
                : target.classList.contains('conversation-name')
                    ? {edge: 3.2, strength: 14, blur: .6, saturation: 1.16}
                    : {edge: 2.6, strength: 11, blur: .45, saturation: 1.12};
            if (!applyLens(record, width, height, radius, material)) continue;
            const sx = width / box.width;
            const sy = height / box.height;
            const wall = record.wall.style;
            wall.left = (bounds.left - box.left) * sx + 'px';
            wall.top = (bounds.top - box.top) * sy + 'px';
            wall.width = bounds.width * sx + 'px';
            wall.height = bounds.height * sy + 'px';
            if (record.background !== background) {
                wall.backgroundImage = background;
                record.background = background;
            }
            const visible = new Set();
            for (const [row, area] of rows) {
                if (area.bottom < box.top - 12 || area.top > box.bottom + 12) continue;
                visible.add(row);
                let copy = record.copies.get(row);
                if (!copy) {
                    copy = row.cloneNode(true);
                    copy.classList.add('chat-optic-row');
                    copy.querySelectorAll('script, style, iframe, video, audio, object, embed').forEach(node => node.remove());
                    for (const element of [copy, ...copy.querySelectorAll('*')]) {
                        for (const attribute of Array.from(element.attributes)) {
                            if (attribute.name === 'id' || attribute.name.startsWith('on')) element.removeAttribute(attribute.name);
                        }
                    }
                    record.sample.append(copy);
                    record.copies.set(row, copy);
                }
                copy.style.setProperty('--bubble-paint', getComputedStyle(row.querySelector('.conversation-text') || row).getPropertyValue('--bubble-paint'));
                Object.assign(copy.style, {left: (area.left - box.left) * sx + 'px', top: (area.top - box.top) * sy + 'px', width: area.width * sx + 'px'});
            }
            for (const [row, copy] of record.copies) {
                if (visible.has(row)) continue;
                copy.remove();
                record.copies.delete(row);
            }
            target.setAttribute('data-refraction', '');
        }
    }

    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    new MutationObserver(schedule).observe(room, {attributes: true, attributeFilter: ['style', 'class', 'data-tone']});
    new MutationObserver(() => {
        for (const record of records.values()) {
            for (const copy of record.copies.values()) copy.remove();
            record.copies.clear();
        }
        schedule();
    }).observe(history, {childList: true, subtree: true, characterData: true});
    history.addEventListener('scroll', schedule, {passive: true});
    history.addEventListener('load', schedule, true);
    window.addEventListener('resize', schedule, {passive: true});
    window.visualViewport?.addEventListener('resize', schedule, {passive: true});
    reduced.addEventListener?.('change', schedule);
    if (typeof ResizeObserver === 'function') {
        const resize = new ResizeObserver(schedule);
        for (const target of lenses) resize.observe(target);
    }
    schedule();
});
