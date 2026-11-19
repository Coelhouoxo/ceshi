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

    function applyLens(record, width, height, radius) {
        const size = [width, height, radius].join(':');
        if (record.size === size) return true;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return false;
        const pixels = context.createImageData(width, height);
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
                const rim = Math.max(0, Math.min(1, 1 + distance / 5));
                const shift = 114 * rim * rim;
                const offset = (y * width + x) * 4;
                pixels.data[offset] = 128 - shift * Math.sign(ux) * (length ? cx / length : Number(dx > dy));
                pixels.data[offset + 1] = 128 - shift * Math.sign(uy) * (length ? cy / length : Number(dy >= dx));
                pixels.data[offset + 2] = 128;
                pixels.data[offset + 3] = 255;
            }
        }
        context.putImageData(pixels, 0, 0);

        const id = 'ceshi-optic-' + ++nextFilter;
        const filter = svg('filter', {id, filterUnits: 'userSpaceOnUse', x: '-14', y: '-14', width: width + 28, height: height + 28, 'color-interpolation-filters': 'sRGB'});
        filter.append(
            svg('feImage', {href: canvas.toDataURL(), width, height, preserveAspectRatio: 'none', result: 'field'}),
            svg('feGaussianBlur', {in: 'SourceGraphic', stdDeviation: '.45', result: 'sample'}),
            svg('feDisplacementMap', {in: 'sample', in2: 'field', scale: '13', xChannelSelector: 'R', yChannelSelector: 'G'})
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
            if (!applyLens(record, width, height, radius)) continue;
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
