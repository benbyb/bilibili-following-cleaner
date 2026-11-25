(function (root) {
  'use strict';
  function imageUrl(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    try {
      const url = new URL(text);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? text : null;
    } catch { return null; }
  }
  function pixelKey(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function normalizePixels(image) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, 32, 32);
    return pixelKey(ctx.getImageData(0, 0, 32, 32).data);
  }
  function readImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'no-referrer';
      const timer = setTimeout(() => { image.src = ''; reject(new Error('头像读取超时')); }, 10000);
      image.onerror = () => { clearTimeout(timer); reject(new Error('头像不可读取或未允许跨域读取')); };
      image.onload = () => {
        clearTimeout(timer);
        try { resolve(normalizePixels(image)); } catch { reject(new Error('浏览器不允许读取该头像像素')); }
      };
      image.src = source;
    });
  }
  function mount(parent, getRows, onConfirmed) {
    function element(tag, text) {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      return node;
    }
    const section = element('section');
    section.className = 'avatar-review';
    const title = element('h3', '按头像筛选后人工复核');
    const note = element('p', '相同头像不代表同一人或违规账号。URL 模式仅匹配完全相同的地址；文件模式比较缩放至 32×32 的像素，不能识别近似图片。');
    const url = element('input');
    url.type = 'url'; url.placeholder = '粘贴参考头像完整 URL（保留查询参数）';
    url.setAttribute('aria-label', '参考头像 URL');
    const file = element('input'); file.type = 'file'; file.accept = 'image/*';
    file.setAttribute('aria-label', '参考头像图片');
    const urlButton = element('button', '按完整 URL 匹配');
    const fileButton = element('button', '按图片像素匹配');
    const status = element('p'); status.setAttribute('role', 'status');
    const list = element('div');
    const confirm = element('button', '确认已复核的勾选账号'); confirm.disabled = true;
    [urlButton, fileButton, confirm].forEach(button => { button.type = 'button'; });
    section.append(title, note, url, urlButton, file, fileButton, status, list, confirm);
    parent.append(section);
    let generation = 0, matches = [], selected = new Set(), busy = false;
    const cache = new Map();
    function reset() {
      generation += 1; matches = []; selected.clear(); list.replaceChildren(); confirm.disabled = true;
      return generation;
    }
    function fingerprint(source) {
      if (!cache.has(source)) cache.set(source, readImage(source));
      return cache.get(source);
    }
    function render() {
      list.replaceChildren();
      matches.forEach((row, index) => {
        const label = element('label'); label.style.display = 'block';
        const check = element('input'); check.type = 'checkbox';
        check.onchange = () => { check.checked ? selected.add(index) : selected.delete(index); confirm.disabled = busy || !selected.size; };
        const name = element('span', ` ${row.name || '未命名'} · ${row.id} `);
        label.append(check, name);
        const avatar = imageUrl(row.avatarUrl);
        if (avatar) {
          const image = element('img'); image.src = avatar; image.alt = '账号头像';
          image.width = image.height = 40; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
          label.append(image);
        }
        const profile = imageUrl(row.profileUrl);
        if (profile) {
          const link = element('a', '打开主页核对'); link.href = profile; link.target = '_blank'; link.rel = 'noopener noreferrer'; label.append(link);
        }
        list.append(label);
      });
    }
    async function scan(mode) {
      if (busy) return;
      const ticket = reset();
      try {
        const rows = Array.from(await getRows());
        if (ticket !== generation) return;
        let reference;
        if (mode === 'url') {
          reference = imageUrl(url.value);
          if (!reference) throw new Error('请输入有效的 HTTP(S) 头像 URL');
        } else {
          const chosen = file.files[0];
          if (!chosen || !chosen.type.startsWith('image/') || chosen.size > 10 * 1024 * 1024) throw new Error('请选择不超过 10 MB 的图片');
          const local = URL.createObjectURL(chosen);
          try { reference = await readImage(local); } finally { URL.revokeObjectURL(local); }
        }
        let unreadable = 0;
        const found = [], seen = new Set();
        for (let i = 0; i < rows.length; i++) {
          if (ticket !== generation) return;
          const row = rows[i];
          if (row.id == null || seen.has(String(row.id))) continue;
          seen.add(String(row.id));
          const source = imageUrl(row.avatarUrl);
          if (!source) { unreadable++; continue; }
          status.textContent = `正在比较 ${i + 1}/${rows.length}`;
          if (mode === 'url') { if (source === reference) found.push({ ...row }); }
          else {
            try { if (await fingerprint(source) === reference) found.push({ ...row }); }
            catch { unreadable++; }
          }
        }
        if (ticket !== generation) return;
        matches = found; render();
        status.textContent = `找到 ${matches.length} 个匹配账号，默认未勾选。${unreadable} 个头像缺失或不可读取，未判为匹配。`;
      } catch (error) { if (ticket === generation) status.textContent = error.message; }
    }
    url.oninput = file.onchange = () => { reset(); status.textContent = '参考已更改，请重新匹配。'; };
    urlButton.onclick = () => scan('url'); fileButton.onclick = () => scan('file');
    confirm.onclick = async () => {
      if (busy || !selected.size) return;
      const reviewed = [...selected].map(index => ({ ...matches[index] }));
      busy = true; confirm.disabled = true; url.disabled = file.disabled = urlButton.disabled = fileButton.disabled = true;
      try {
        await onConfirmed(reviewed);
        reset(); status.textContent = `已提交 ${reviewed.length} 个复核账号。`;
      } catch (error) { status.textContent = `提交失败：${error.message || '未知错误'}`; }
      finally {
        busy = false; url.disabled = file.disabled = urlButton.disabled = fileButton.disabled = false;
        confirm.disabled = !selected.size;
      }
    };
    return { refresh: reset, destroy() { reset(); cache.clear(); section.remove(); } };
  }
  const api = { mount, imageUrl, pixelKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AvatarReview = api;
})(globalThis);
