/*
 * claude-visual-feedback — injected overlay (project-agnostic)
 *
 * Armed by ?comment=1 but HIDDEN until summoned with 3 quick taps anywhere.
 * Liquid-Glass UI of individual circular buttons. Tap an element → a compact
 * sheet (info-left · text · ✓-inside, tiny close above) lets you comment, retarget
 * to a parent/child element, and target ::before/::after. Notes POST to
 * /__vf/comments for Claude to read.
 */
(function () {
  if (window.__vfLoaded) return;
  window.__vfLoaded = true;

  var PENDING = [];
  var picking = false;
  var uiVisible = false;
  var stack = [];      // elementsFromPoint result for the last tap (innermost → outermost)
  var stackIdx = 0;
  var current = null;  // currently targeted element
  var pseudo = '';     // '', '::before', '::after'

  // ---------- icons (SF-style stroke) ----------
  function svg(inner, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) +
      '" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  var IC = {
    pick: svg('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="2.1"/>'),
    send: svg('<path d="M12 19V6M6 12l6-6 6 6"/>'),
    trash: svg('<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l.9 12a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-12"/>', 20),
    close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    check: svg('<path d="M5 12l5 5 9-11"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.6h.01"/>'),
    bubble: svg('<path d="M5 5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H10l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>')
  };

  // ---------- selector + text ----------
  function cssEscape(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  }
  function selectorFor(el) {
    if (!(el instanceof Element)) return '';
    if (el.id) {
      var byId = '#' + cssEscape(el.id);
      try { if (document.querySelectorAll(byId).length === 1) return byId; } catch (e) {}
    }
    var parts = [], node = el;
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 6) {
      var part = node.tagName.toLowerCase();
      if (node.id) { parts.unshift('#' + cssEscape(node.id)); break; }
      var cls = (node.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)
        .filter(function (c) { return !/^vf-/.test(c); }).slice(0, 2);
      if (cls.length) part += '.' + cls.map(cssEscape).join('.');
      var parent = node.parentNode;
      if (parent) {
        var sibs = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
        if (sibs.length > 1) part += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = node.parentNode;
    }
    return parts.join(' > ');
  }
  function shortText(el) {
    var t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    return t.length > 80 ? t.slice(0, 80) + '…' : t;
  }
  function pseudoList(el) {
    var out = [];
    ['::before', '::after'].forEach(function (p) {
      var cs = getComputedStyle(el, p);
      if (!cs) return;
      var content = cs.content;
      var hasContent = content && content !== 'none' && content !== 'normal';
      var bg = cs.backgroundImage && cs.backgroundImage !== 'none';
      var bgc = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      if (hasContent || bg || bgc) out.push(p);
    });
    return out;
  }

  // ---------- styles (Liquid Glass) ----------
  // Liquid-Glass: low-opacity tint + heavy blur+saturation so content behind shows
  // through frosted; top sheen gradient + bright inset edge for the specular look.
  var GLASS = 'background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.04) 36%,rgba(255,255,255,.01)),rgba(16,24,40,.30);' +
    '-webkit-backdrop-filter:blur(32px) saturate(200%) brightness(1.08);backdrop-filter:blur(32px) saturate(200%) brightness(1.08);' +
    'border:1px solid rgba(255,255,255,.28);' +
    'box-shadow:0 12px 40px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.55),inset 0 -12px 28px rgba(255,255,255,.05);';
  var style = document.createElement('style');
  style.textContent = [
    '.vf-glass{' + GLASS + 'color:#f3f6ff}',
    /* toolbar: individual circles; close pinned right */
    '.vf-bar{position:fixed;z-index:2147483646;left:0;right:0;bottom:0;transform:translateY(120%);opacity:0;',
    'display:flex;align-items:center;gap:12px;padding:8px 14px calc(12px + env(safe-area-inset-bottom));background:transparent;',
    'transition:transform .24s cubic-bezier(.2,.8,.2,1),opacity .2s;pointer-events:none}',
    '.vf-bar.show{opacity:1;transform:translateY(0);pointer-events:auto}',
    '.vf-hidebtn{margin-left:auto}',
    '.vf-ib{position:relative;width:50px;height:50px;display:grid;place-items:center;border:0;flex:0 0 auto;color:#f3f6ff;',
    'border-radius:999px;cursor:pointer;-webkit-tap-highlight-color:transparent;' + GLASS + 'transition:background .15s,transform .1s}',
    '.vf-ib:active{transform:scale(.93)}',
    /* active = brighter frosted glass (neutral, not a brand color) */
    '.vf-ib.on{background:rgba(255,255,255,.26);border-color:rgba(255,255,255,.5);box-shadow:0 8px 24px rgba(0,0,0,.4),inset 0 0 0 1px rgba(255,255,255,.4)}',
    '.vf-ib[hidden]{display:none}',
    '.vf-countonly{font:700 18px/1 system-ui,sans-serif;color:#f3f6ff}',
    /* selection highlight — absolute (document coords) so it scrolls WITH the page (no jitter) */
    /* neutral selection: white edge + dark contrast ring so it reads on any background */
    '.vf-hl{position:absolute;z-index:2147483645;pointer-events:none;border-radius:8px;border:2px solid rgba(255,255,255,.95);',
    'background:rgba(255,255,255,.10);box-shadow:0 0 0 2px rgba(0,0,0,.45),0 0 22px rgba(255,255,255,.35);display:none}',
    /* sheet */
    '.vf-sheet{position:fixed;z-index:2147483647;left:10px;right:10px;bottom:10px;border-radius:22px;padding:10px 12px;',
    'transform:translateY(140%);transition:transform .26s cubic-bezier(.2,.8,.2,1),bottom .18s ease;',
    'font:14px/1.45 system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto}',
    '.vf-sheet.show{transform:translateY(0)}',
    '.vf-mini{width:30px;height:30px}.vf-mini svg{width:15px;height:15px}',
    /* sheet close floats ABOVE the sheet, outside the box */
    '.vf-sheet > .vf-cancel{position:absolute;top:-48px;right:2px;width:38px;height:38px}',
    '.vf-sheet > .vf-cancel svg{width:18px;height:18px}',
    '.vf-inputrow{display:flex;align-items:center;gap:8px}',
    '.vf-info{width:44px;height:44px}',
    '.vf-inputwrap{position:relative;flex:1;min-width:0}',
    /* 16px font-size prevents iOS Safari auto-zoom on focus */
    '.vf-inputwrap textarea{width:100%;box-sizing:border-box;min-height:48px;max-height:140px;background:rgba(255,255,255,.06);',
    'color:#f3f6ff;border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:13px 54px 13px 14px;',
    'font:16px/1.35 system-ui,-apple-system,sans-serif;resize:none;outline:none}',
    '.vf-inputwrap textarea:focus{border-color:rgba(255,255,255,.45)}',
    /* check = bare icon, no circle/background */
    '.vf-inbox{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:42px;height:42px;background:transparent;border:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;color:#fff}',
    '.vf-inbox svg{width:26px;height:26px}',
    '.vf-details{margin-top:12px}',
    '.vf-step{display:flex;align-items:center;gap:10px}',
    '.vf-stepbtn{font:600 12px/1 system-ui;padding:9px 14px;border-radius:999px;color:#f3f6ff;cursor:pointer;',
    'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16)}',
    '.vf-stepbtn:disabled{opacity:.35;cursor:default}',
    '.vf-stepn{font:600 12px/1 system-ui;color:rgba(243,246,255,.8);min-width:44px;text-align:center}',
    '.vf-chips{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}',
    '.vf-chip{font:600 12px/1 system-ui;padding:8px 13px;border-radius:999px;cursor:pointer;color:#f3f6ff;',
    'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14)}',
    '.vf-chip.on{background:rgba(255,255,255,.26);border-color:rgba(255,255,255,.5)}',
    '.vf-sel{font:600 11px/1.4 ui-monospace,SFMono-Regular,monospace;color:rgba(255,255,255,.7);word-break:break-all;margin-top:10px}',
    '.vf-hint{color:rgba(243,246,255,.5);font-size:11px;margin-top:8px}',
    /* comments list */
    '.vf-hdr{display:flex;align-items:center;gap:10px;margin-bottom:10px}',
    '.vf-list{max-height:46vh;overflow:auto;-webkit-overflow-scrolling:touch}',
    '.vf-li{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-top:1px solid rgba(255,255,255,.10)}',
    '.vf-li:first-child{border-top:0}',
    '.vf-num{flex:0 0 22px;height:22px;border-radius:999px;background:rgba(255,255,255,.12);text-align:center;font:600 11px/22px system-ui;color:#f3f6ff}',
    '.vf-li .vf-meta{flex:1;min-width:0}.vf-li .vf-note{font-size:13px;color:#f3f6ff;margin-bottom:2px}',
    '.vf-li .vf-note.empty{color:rgba(243,246,255,.4);font-style:italic}',
    '.vf-li .vf-mono{font:11px/1.3 ui-monospace,monospace;color:rgba(255,255,255,.55);word-break:break-all}',
    '.vf-step .vf-ib{width:32px;height:32px}',
    '.vf-toast{position:fixed;z-index:2147483647;left:50%;bottom:86px;transform:translateX(-50%);',
    'padding:9px 16px;border-radius:999px;font:600 13px/1 system-ui;opacity:0;transition:opacity .2s}',
    '.vf-toast.on{opacity:1}'
  ].join('');
  document.head.appendChild(style);

  // ---------- elements ----------
  var hl = document.createElement('div'); hl.className = 'vf-hl'; document.body.appendChild(hl);
  var toast = document.createElement('div'); toast.className = 'vf-toast vf-glass'; document.body.appendChild(toast);
  function showToast(m) { toast.textContent = m; toast.classList.add('on'); setTimeout(function () { toast.classList.remove('on'); }, 1700); }

  var bar = document.createElement('div'); bar.className = 'vf-bar';
  bar.innerHTML =
    '<button class="vf-ib vf-pick" title="Pick element">' + IC.pick + '</button>' +
    '<button class="vf-ib vf-pagebtn" title="Comment on the whole page">' + IC.bubble + '</button>' +
    '<button class="vf-ib vf-listbtn" title="Comments" hidden><span class="vf-countonly">0</span></button>' +
    '<button class="vf-ib vf-send" title="Send to Claude" hidden>' + IC.send + '</button>' +
    '<button class="vf-ib vf-hidebtn" title="Hide">' + IC.close + '</button>';
  document.body.appendChild(bar);
  var pickBtn = bar.querySelector('.vf-pick');
  var pageBtn = bar.querySelector('.vf-pagebtn');
  var listBtn = bar.querySelector('.vf-listbtn');
  var sendBtn = bar.querySelector('.vf-send');
  var hideBtn = bar.querySelector('.vf-hidebtn');
  var countEl = bar.querySelector('.vf-countonly');

  function inOverlay(el) {
    return el && el.closest && (el.closest('.vf-bar') || el.closest('.vf-sheet') || el.closest('.vf-toast') || el.classList.contains('vf-hl'));
  }
  function updateToolbar() {
    var has = PENDING.length > 0;
    countEl.textContent = String(PENDING.length);
    listBtn.hidden = !has;
    sendBtn.hidden = !has;
  }
  function showUI(on) {
    uiVisible = on; bar.classList.toggle('show', on);
    if (on) {
      requestAnimationFrame(function () { document.body.style.paddingBottom = (bar.offsetHeight + 8) + 'px'; });
    } else {
      document.body.style.paddingBottom = '';
      setPicking(false); closeSheet();
    }
  }

  // ---------- triple-tap to summon (only while hidden) ----------
  var taps = [];
  document.addEventListener('pointerdown', function () {
    if (uiVisible || picking) return;
    var now = Date.now();
    taps.push(now); taps = taps.filter(function (t) { return now - t < 700; });
    if (taps.length >= 3) { taps = []; showUI(true); }
  }, true);

  // ---------- highlight ----------
  function highlight(el) {
    if (!el || !el.getBoundingClientRect) { hl.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    var sx = window.pageXOffset || 0, sy = window.pageYOffset || 0;
    hl.style.display = 'block';
    hl.style.left = (r.left + sx) + 'px'; hl.style.top = (r.top + sy) + 'px';
    hl.style.width = r.width + 'px'; hl.style.height = r.height + 'px';
  }
  function clearHighlight() { hl.style.display = 'none'; }

  // Scroll the selected element into the visible band above the sheet/keyboard.
  function scrollTargetIntoView() {
    if (!current || !current.getBoundingClientRect) return;
    var vv = window.visualViewport;
    var viewH = vv ? vv.height : window.innerHeight;
    var sheetH = sheet ? sheet.offsetHeight : 0;
    var visibleBottom = viewH - sheetH - 16;
    var r = current.getBoundingClientRect();
    var targetTop = Math.max(16, visibleBottom * 0.35);
    var delta = r.top - targetTop;
    if (Math.abs(delta) > 6) window.scrollBy(0, delta);
    highlight(current);
  }

  // ---------- picking ----------
  function setPicking(on) {
    picking = on; pickBtn.classList.toggle('on', on);
    if (!on && !sheet) clearHighlight();
  }
  document.addEventListener('mousemove', function (e) {
    if (!picking) return;
    if (inOverlay(e.target)) return;
    highlight(e.target);
  }, true);
  document.addEventListener('click', function (e) {
    if (!picking) return;
    if (inOverlay(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    var list = (document.elementsFromPoint(e.clientX, e.clientY) || []).filter(function (el) {
      return !inOverlay(el) && el !== document.documentElement;
    });
    stack = list.length ? list : [e.target];
    stackIdx = 0; pseudo = '';
    setCurrent(); openSheet();
  }, true);

  function setCurrent() { current = stack[stackIdx]; highlight(current); }

  // ---------- comment sheet ----------
  var sheet = null;
  function closeSheet() {
    if (sheet) { sheet.remove(); sheet = null; }
    clearHighlight();
    if (uiVisible) bar.classList.add('show');
  }
  function openSheet(pageMode) {
    closeSheet();
    setPicking(false);
    bar.classList.remove('show');
    sheet = document.createElement('div'); sheet.className = 'vf-sheet vf-glass';
    sheet.innerHTML =
      '<button class="vf-ib vf-cancel" title="Close">' + IC.close + '</button>' +
      '<div class="vf-inputrow">' +
        (pageMode ? '' : '<button class="vf-ib vf-info" title="Details">' + IC.info + '</button>') +
        '<div class="vf-inputwrap">' +
          '<textarea rows="1" autocorrect="off" autocapitalize="sentences" spellcheck="false" placeholder="' + (pageMode ? 'Comment on the whole page…' : 'Comment…') + '"></textarea>' +
          '<button class="vf-ib vf-add vf-inbox" title="Add comment">' + IC.check + '</button>' +
        '</div>' +
      '</div>' +
      (pageMode ? '' :
        '<div class="vf-details" hidden>' +
          '<div class="vf-step">' +
            '<button class="vf-stepbtn vf-prev">Parent</button>' +
            '<span class="vf-stepn">1 / 1</span>' +
            '<button class="vf-stepbtn vf-next">Child</button>' +
          '</div>' +
          '<div class="vf-chips"></div>' +
          '<div class="vf-sel"></div>' +
          '<div class="vf-hint">Parent / Child retargets to a containing or inner element.</div>' +
        '</div>');
    document.body.appendChild(sheet);
    requestAnimationFrame(function () { sheet.classList.add('show'); });
    positionSheet();

    sheet.querySelector('.vf-cancel').onclick = closeSheet;
    sheet.querySelector('.vf-add').onclick = pageMode ? addPage : addCurrent;
    if (pageMode) {
      clearHighlight();
    } else {
      sheet.querySelector('.vf-prev').onclick = function () { if (stackIdx < stack.length - 1) { stackIdx++; pseudo = ''; setCurrent(); refreshSheet(); } };
      sheet.querySelector('.vf-next').onclick = function () { if (stackIdx > 0) { stackIdx--; pseudo = ''; setCurrent(); refreshSheet(); } };
      sheet.querySelector('.vf-info').onclick = function () {
        var d = sheet.querySelector('.vf-details');
        d.hidden = !d.hidden;
        sheet.querySelector('.vf-info').classList.toggle('on', !d.hidden);
      };
      refreshSheet();
      highlight(current);
      setTimeout(scrollTargetIntoView, 120);
      setTimeout(scrollTargetIntoView, 420);
    }
    sheet.querySelector('textarea').focus();
  }
  function refreshSheet() {
    if (!sheet) return;
    sheet.querySelector('.vf-sel').textContent =
      selectorFor(current) + (pseudo || '') + (shortText(current) ? '  ·  “' + shortText(current) + '”' : '');
    sheet.querySelector('.vf-stepn').textContent = (stackIdx + 1) + ' / ' + stack.length;
    sheet.querySelector('.vf-prev').disabled = stackIdx >= stack.length - 1; // no more parents
    sheet.querySelector('.vf-next').disabled = stackIdx <= 0;                // no more children
    var chips = sheet.querySelector('.vf-chips');
    var pl = pseudoList(current);
    if (!pl.length) { chips.innerHTML = ''; chips.style.display = 'none'; }
    else {
      chips.style.display = 'flex';
      var opts = ['element'].concat(pl);
      chips.innerHTML = opts.map(function (o) {
        var val = o === 'element' ? '' : o;
        return '<button class="vf-chip' + (pseudo === val ? ' on' : '') + '" data-v="' + val + '">' + o + '</button>';
      }).join('');
      Array.prototype.forEach.call(chips.querySelectorAll('.vf-chip'), function (c) {
        c.onclick = function () { pseudo = c.getAttribute('data-v'); refreshSheet(); };
      });
    }
    highlight(current);
  }
  function addCurrent() {
    var r = current.getBoundingClientRect();
    PENDING.push({
      scope: 'element',
      selector: selectorFor(current) + (pseudo || ''),
      pseudo: pseudo || null,
      tag: current.tagName.toLowerCase(),
      text: shortText(current),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
      url: location.pathname + location.search,
      ts: new Date().toISOString(),
      note: sheet.querySelector('textarea').value.trim()
    });
    updateToolbar(); closeSheet(); showToast('Added (' + PENDING.length + ')');
  }
  // Whole-page comment (no element) — flagged scope:'page' so Claude knows it's
  // about the entire screen and pairs it with a full-page screenshot.
  function addPage() {
    PENDING.push({
      scope: 'page',
      selector: '(entire page)',
      pseudo: null,
      tag: 'page',
      text: '',
      rect: { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight },
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
      url: location.pathname + location.search,
      ts: new Date().toISOString(),
      note: sheet.querySelector('textarea').value.trim()
    });
    updateToolbar(); closeSheet(); showToast('Page comment added (' + PENDING.length + ')');
  }

  // keep the sheet just above the keyboard, and the target visible
  function positionSheet() {
    if (!sheet) return;
    var vv = window.visualViewport;
    if (!vv) return;
    var kb = window.innerHeight - vv.height - vv.offsetTop;
    sheet.style.bottom = Math.max(10, kb + 10) + 'px';
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () { positionSheet(); scrollTargetIntoView(); });
    window.visualViewport.addEventListener('scroll', positionSheet);
  }

  // ---------- comments list (with delete + send) ----------
  function openList() {
    closeSheet(); setPicking(false);
    bar.classList.remove('show');
    sheet = document.createElement('div'); sheet.className = 'vf-sheet vf-glass';
    if (!PENDING.length) {
      sheet.innerHTML = '<div class="vf-hdr"><strong style="font:600 14px/1 system-ui">No comments yet</strong>' +
        '<span style="margin-left:auto"><button class="vf-ib vf-mini vf-closelist" title="Close">' + IC.close + '</button></span></div>';
      document.body.appendChild(sheet); requestAnimationFrame(function () { sheet.classList.add('show'); });
      sheet.querySelector('.vf-closelist').onclick = closeSheet; return;
    }
    var rows = PENDING.map(function (c, i) {
      return '<div class="vf-li"><span class="vf-num">' + (i + 1) + '</span><div class="vf-meta">' +
        '<div class="vf-note' + (c.note ? '' : ' empty') + '">' + (c.note ? escapeHtml(c.note) : '(no note)') + '</div>' +
        '<div class="vf-mono">' + escapeHtml(c.selector) + '</div></div>' +
        '<button class="vf-ib vf-mini vf-del" data-i="' + i + '" title="Remove">' + IC.trash + '</button></div>';
    }).join('');
    sheet.innerHTML = '<div class="vf-hdr"><strong style="font:600 14px/1 system-ui">Comments (' + PENDING.length + ')</strong>' +
      '<span style="margin-left:auto;display:flex;gap:8px">' +
      '<button class="vf-ib vf-mini vf-sendlist" title="Send to Claude">' + IC.send + '</button>' +
      '<button class="vf-ib vf-mini vf-closelist" title="Close">' + IC.close + '</button></span></div>' +
      '<div class="vf-list">' + rows + '</div>';
    document.body.appendChild(sheet); requestAnimationFrame(function () { sheet.classList.add('show'); });
    sheet.querySelector('.vf-closelist').onclick = closeSheet;
    sheet.querySelector('.vf-sendlist').onclick = doSend;
    Array.prototype.forEach.call(sheet.querySelectorAll('.vf-del'), function (b) {
      b.onclick = function () { PENDING.splice(parseInt(b.getAttribute('data-i'), 10), 1); updateToolbar(); openList(); };
    });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- toolbar wiring ----------
  function doSend() {
    if (!PENDING.length) { showToast('Nothing to send'); return; }
    var n = PENDING.length;
    fetch('/__vf/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(PENDING) })
      .then(function (r) { return r.json(); })
      .then(function () { showToast('Sent ' + n + ' to Claude'); PENDING = []; updateToolbar(); closeSheet(); })
      .catch(function () { showToast('Send failed — dev server running?'); });
  }
  pickBtn.onclick = function () { closeSheet(); setPicking(!picking); };
  pageBtn.onclick = function () { setPicking(false); openSheet(true); };
  listBtn.onclick = openList;
  hideBtn.onclick = function () { showUI(false); };
  sendBtn.onclick = doSend;

  // (no scroll listener needed — the highlight uses document coords and scrolls with the page)
  updateToolbar();
  console.log('[claude-visual-feedback] armed — triple-tap anywhere to summon');
})();
