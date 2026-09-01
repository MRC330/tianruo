/* 通用 UI 工具 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.esc = esc;

  let toastTimer = null;
  window.toast = function (msg, dur) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), dur || 1900);
  };

  window.timeAgo = function (t) {
    const d = Date.now() - t;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + '分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + '小时前';
    if (d < 7 * 86400000) return Math.floor(d / 86400000) + '天前';
    const dt = new Date(t);
    return `${dt.getMonth() + 1}月${dt.getDate()}日`;
  };
  window.hm = function (t) {
    const d = new Date(t);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  window.distText = function (d) {
    if (d == null) return '';
    if (d < 1) return '100m 内';
    if (d < 10) return d.toFixed(1) + 'km';
    return Math.round(d) + 'km';
  };

  /** 居中弹窗 */
  window.modal = function (title, desc, onOk, okText) {
    const box = document.createElement('div');
    box.className = 'modal';
    box.innerHTML = `<div class="modal-mask" data-close></div><div class="modal-box">
      <div class="modal-title">${esc(title)}</div>
      <div class="modal-desc">${desc || ''}</div>
      <button class="btn btn-primary btn-block" data-ok>${esc(okText || '确定')}</button>
      <button class="btn btn-ghost btn-block" data-close>取消</button></div>`;
    document.body.appendChild(box);
    const close = () => box.remove();
    box.querySelector('[data-ok]').onclick = () => { close(); onOk && onOk(); };
    box.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
  };

  /** 底部弹层，html 为内容 */
  window.sheet = function (html, onMount) {
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';
    const s = document.createElement('div');
    s.className = 'sheet';
    s.innerHTML = html;
    document.body.appendChild(mask);
    document.body.appendChild(s);
    const close = () => { mask.remove(); s.remove(); };
    mask.onclick = close;
    onMount && onMount(s, close);
    return close;
  };

  /** 图片预览 */
  window.previewImages = function (urls, index) {
    const box = document.createElement('div');
    box.className = 'modal';
    box.style.zIndex = 300;
    box.innerHTML = `<div class="modal-mask" data-close style="background:#000"></div>
      <div style="position:relative;width:100%;display:flex;align-items:center;justify-content:center">
      <img src="${esc(urls[index || 0])}" style="max-width:100%;max-height:80vh;border-radius:12px"></div>`;
    document.body.appendChild(box);
    box.querySelector('[data-close]').onclick = () => box.remove();
    box.onclick = (e) => { if (e.target.dataset.close !== undefined) box.remove(); };
  };

  /** 服务器设置弹窗 */
  window.openServerSettings = function (onSaved) {
    const m = document.getElementById('serverModal');
    const input = document.getElementById('serverInput');
    input.value = window.TIANRUO_CONFIG.server || '';
    m.classList.remove('hidden');
    document.getElementById('serverSave').onclick = () => {
      const v = input.value.trim();
      if (v) window.TIANRUO_CONFIG.setServer(v);
      else window.TIANRUO_CONFIG.clearServer();
      m.classList.add('hidden');
      toast(v ? '服务器已更新：' + window.TIANRUO_CONFIG.server : '已切换为同源地址');
      onSaved && onSaved();
    };
    m.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => m.classList.add('hidden')));
  };
})();
