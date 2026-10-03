// عمالقة الصمت — dashboard.js
(function () {
  var TEAM_KEY = '8cdQ7WY9SvAGxe6SfFPlngj0_UbX6Cr';
  var headers = { 'x-team-key': TEAM_KEY, 'content-type': 'application/json' };

  function fetchJson(path, options) {
    options = options || {};
    var opts = { headers: headers };
    for (var k in options) opts[k] = options[k];
    return fetch(path, opts).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function copyText(text, btn) {
    var done = function() {
      var old = btn.textContent;
      btn.textContent = '✅ تم';
      btn.classList.add('copied');
      setTimeout(function() { btn.textContent = old; btn.classList.remove('copied'); }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function() { fallback(text, btn, done); });
    } else { fallback(text, btn, done); }
  }
  function fallback(text, btn, done) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch(e) {}
    document.body.removeChild(ta);
  }

  function renderWalletsPanel() {
    var el = document.getElementById('wallets-content');
    if (!el) return;
    el.innerHTML = ''
      + '<h1 style="color:#a78bfa;font-size:18px;text-align:center;margin-bottom:6px">💼 المحافظ الرقمية</h1>'
      + '<p style="color:#94a3b8;font-size:12px;text-align:center;margin-bottom:16px">استقبال فقط — لا سحب تلقائي</p>'
      + '<div style="display:grid;grid-template-columns:1fr;gap:12px;max-width:640px;margin:0 auto">'
      + '  <div style="background:#1e293b;border-radius:14px;padding:16px;border:2px solid #334155">'
      + '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div><div style="font-size:16px;font-weight:700;color:#e0e7ff">USDT</div><div style="font-size:11px;color:#94a3b8;margin-top:2px">TON Network</div></div><div style="font-size:28px">💎</div></div>'
      + '    <div style="background:#0f172a;border-radius:10px;padding:16px;text-align:center;border:1px solid #334155;margin-bottom:12px"><div style="color:#94a3b8;font-size:11px;margin-bottom:6px">الرصيد الحالي</div><div id="balance-ton" style="color:#34d399;font-size:28px;font-weight:800;font-family:monospace">—</div><div style="color:#a78bfa;font-size:12px;margin-top:4px">USDT</div></div>'
      + '    <div style="background:#0f172a;border-radius:10px;padding:10px;display:flex;gap:8px;align-items:center;border:1px solid #334155"><div id="addr-ton" style="flex:1;font-family:monospace;font-size:11px;color:#cbd5e1;word-break:break-all;direction:ltr;text-align:left">جاري التحميل...</div><button class="copy-btn" data-target="addr-ton" style="background:#312e81;color:#e0e7ff;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer">📋 نسخ</button></div>'
      + '  </div>'
      + '  <div style="background:#1e293b;border-radius:14px;padding:16px;border:2px solid #334155">'
      + '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div><div style="font-size:16px;font-weight:700;color:#e0e7ff">USDC</div><div style="font-size:11px;color:#94a3b8;margin-top:2px">Base Network</div></div><div style="font-size:28px">🔵</div></div>'
      + '    <div style="background:#0f172a;border-radius:10px;padding:16px;text-align:center;border:1px solid #334155;margin-bottom:12px"><div style="color:#94a3b8;font-size:11px;margin-bottom:6px">الرصيد الحالي</div><div id="balance-base" style="color:#34d399;font-size:28px;font-weight:800;font-family:monospace">—</div><div style="color:#a78bfa;font-size:12px;margin-top:4px">USDC</div></div>'
      + '    <div style="background:#0f172a;border-radius:10px;padding:10px;display:flex;gap:8px;align-items:center;border:1px solid #334155"><div id="addr-base" style="flex:1;font-family:monospace;font-size:11px;color:#cbd5e1;word-break:break-all;direction:ltr;text-align:left">جاري التحميل...</div><button class="copy-btn" data-target="addr-base" style="background:#312e81;color:#e0e7ff;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer">📋 نسخ</button></div>'
      + '  </div>'
      + '</div>'
      + '<div style="text-align:center;color:#fbbf24;font-size:12px;margin:14px auto;padding:10px;background:rgba(251,191,36,0.1);border-radius:10px;max-width:640px">⚠️ تأكد من الشبكة الصحيحة قبل الإرسال</div>'
      + '<div style="text-align:center;margin-top:14px"><button id="refresh-wallets" style="background:#1e293b;border:1px solid #334155;color:#a78bfa;padding:10px 20px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600">🔄 تحديث الأرصدة</button> <span id="last-update" style="color:#94a3b8;font-size:12px;margin-right:8px"></span></div>';
    var rb = document.getElementById('refresh-wallets');
    if (rb) rb.addEventListener('click', loadWallets);
    loadWallets();
  }

  function setBalance(id, amount) {
    var el = document.getElementById(id);
    if (!el) return;
    if (amount === null || amount === undefined || amount === '' || isNaN(amount)) el.textContent = '—';
    else el.textContent = Number(amount).toFixed(4);
  }

  function loadWallets() {
    var lastEl = document.getElementById('last-update');
    if (lastEl) lastEl.textContent = '⏳ تحديث...';
    fetch('/api/wallets/balances', { cache: 'no-store', headers: headers })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var ton = null, base = null, list = [];
        if (Array.isArray(data)) list = data;
        else if (data && Array.isArray(data.wallets)) list = data.wallets;
        else if (data && (data.ton || data.base)) { ton = data.ton; base = data.base; }
        list.forEach(function(w) {
          var net = String(w.network || w.chain || w.name || '').toLowerCase();
          if (net.indexOf('ton') >= 0) ton = w;
          if (net.indexOf('base') >= 0) base = w;
        });
        if (ton) {
          var ta = document.getElementById('addr-ton');
          if (ta && (ton.address || ton.addr)) ta.textContent = ton.address || ton.addr;
          setBalance('balance-ton', ton.balance !== undefined ? ton.balance : (ton.amount !== undefined ? ton.amount : ton.usdt));
        }
        if (base) {
          var ba = document.getElementById('addr-base');
          if (ba && (base.address || base.addr)) ba.textContent = base.address || base.addr;
          setBalance('balance-base', base.balance !== undefined ? base.balance : (base.amount !== undefined ? base.amount : base.usdc));
        }
        if (lastEl) lastEl.textContent = 'آخر تحديث: ' + new Date().toLocaleTimeString('ar-EG');
      })
      .catch(function(e) {
        if (lastEl) lastEl.textContent = '❌ ' + e.message;
      });
  }

  function loadTabContent(name) {
    if (name === 'ai-usage') {
      var el = document.getElementById('ai-usage-content');
      if (!el) return;
      el.innerHTML = '<div class="empty">⏳ جاري التحميل...</div>';
      fetch('/ai-usage', { cache: 'no-store', headers: headers })
        .then(function(r) { return r.text(); })
        .then(function(html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          el.innerHTML = doc.body ? doc.body.innerHTML : html;
        })
        .catch(function(e) { el.innerHTML = '<div class="error">فشل: ' + e.message + '</div>'; });
    }
    if (name === 'wallets') {
      renderWalletsPanel();
    }
  }

  function initTabs() {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].onclick = function () {
        var allTabs = document.querySelectorAll('.tab');
        var allPanels = document.querySelectorAll('.panel');
        for (var j = 0; j < allTabs.length; j++) allTabs[j].classList.remove('active');
        for (var k = 0; k < allPanels.length; k++) allPanels[k].classList.remove('active');
        this.classList.add('active');
        var name = this.getAttribute('data-tab');
        var p = document.getElementById('panel-' + name);
        if (p) { p.classList.add('active'); loadTabContent(name); }
      };
    }
  }

  // Copy buttons everywhere (event delegation)
  document.addEventListener('click', function(ev) {
    var btn = ev.target.closest('.copy-btn');
    if (!btn) return;
    var targetId = btn.getAttribute('data-target');
    var target = document.getElementById(targetId);
    if (!target) return;
    var text = target.textContent.trim();
    if (!text || text.indexOf('جاري') === 0 || text === '—') return;
    copyText(text, btn);
  });

  function loadSystem() {
    return fetchJson('/api/dashboard').then(function (data) {
      var fin = data.finance || {};
      var el = document.getElementById('system-stats');
      if (!el) return;
      el.innerHTML =
        '<div class="stat"><span class="label">الحالة</span><span class="value">● نشط</span></div>' +
        '<div class="stat"><span class="label">المشاريع</span><span class="value">' + (data.projects || 0) + '</span></div>' +
        '<div class="stat"><span class="label">الرصيد المكتسب</span><span class="value">USD ' + (fin.earned || 0) + '</span></div>' +
        '<div class="stat"><span class="label">Pipeline</span><span class="value">USD ' + (fin.pipeline || 0) + '</span></div>' +
        '<div class="stat"><span class="label">مهام مكتملة</span><span class="value">' + (data.tasksDone || 0) + '</span></div>' +
        '<div class="stat"><span class="label">مهام معلقة</span><span class="value">' + (data.tasksPending || 0) + '</span></div>';
    }).catch(function (e) {
      var el = document.getElementById('system-stats');
      if (el) el.innerHTML = '<div class="error">' + e.message + '</div>';
    });
  }

  function loadAgents() {
    return fetchJson('/api/dashboard').then(function (data) {
      var el = document.getElementById('agents-list');
      if (!el) return;
      var agents = data.agents || [];
      if (!agents.length) { el.innerHTML = '<div class="empty">لا وكلاء</div>'; return; }
      el.innerHTML = agents.map(function (a) {
        return '<div class="stat"><span class="label">' + (a.name || a.id) + '</span><span class="value">' + (a.status || 'idle') + '</span></div>';
      }).join('');
    }).catch(function () {});
  }

  function loadTasks() {
    return fetchJson('/api/team/tasks').then(function (data) {
      var el = document.getElementById('tasks-list');
      if (!el) return;
      var tasks = data.tasks || [];
      if (!tasks.length) { el.innerHTML = '<div class="empty">لا مهام</div>'; return; }
      el.innerHTML = tasks.slice(0, 30).map(function (t) {
        return '<div class="item"><div class="meta">#' + t.id + ' · ' + (t.status || '') + '</div><div class="body">' + (t.title || '') + '</div></div>';
      }).join('');
    }).catch(function () {});
  }

  function loadNotifications() {
    return fetchJson('/api/notifications').then(function (data) {
      var el = document.getElementById('notifications-list');
      if (!el) return;
      var items = data.notifications || [];
      if (!items.length) { el.innerHTML = '<div class="empty">لا إشعارات</div>'; return; }
      el.innerHTML = items.slice(0, 30).map(function (n) {
        return '<div class="item"><div class="meta">' + (n.kind || '') + '</div><div class="body">' + (n.title || '') + '</div></div>';
      }).join('');
    }).catch(function () {});
  }

  function loadLive() {
    var el = document.getElementById('live-log');
    if (!el || window.__liveInit) return;
    window.__liveInit = true;
    try {
      var src = new EventSource('/api/live');
      src.addEventListener('messages', function (ev) {
        try {
          var data = JSON.parse(ev.data);
          var msgs = (data.messages || []).slice(-20).reverse();
          el.innerHTML = msgs.map(function (m) {
            var color = m.sender === 'leader' ? '#a78bfa' : '#34d399';
            return '<div class="live-item" style="border-right-color:' + color + '"><div class="live-meta" style="color:' + color + '">' + (m.sender || '') + ' · ' + (m.createdAt || '') + '</div><div class="live-body">' + String(m.body || '').slice(0, 500) + '</div></div>';
          }).join('') || '<div class="empty">لا رسائل</div>';
        } catch (e) {}
      });
    } catch (e) {}
  }

  function initSend() {
    var btn = document.getElementById('send-btn');
    if (!btn) return;
    btn.onclick = function () {
      var body = document.getElementById('msg-body').value.trim();
      var recipient = document.getElementById('msg-recipient').value;
      var status = document.getElementById('send-status');
      if (!body) { status.textContent = 'اكتب نصاً'; return; }
      status.textContent = '⏳ إرسال...';
      fetchJson('/api/team/messages', { method: 'POST', body: JSON.stringify({ sender: 'leader', recipient: recipient, body: body, thread: 'team' }) })
        .then(function () {
          status.textContent = '✅ تم الإرسال';
          document.getElementById('msg-body').value = '';
          setTimeout(function () { status.textContent = ''; }, 5000);
        })
        .catch(function (e) { status.textContent = '❌ ' + e.message; });
    };
  }

  function init() {
    initTabs();
    initSend();
    loadSystem();
    loadAgents();
    loadTasks();
    loadNotifications();
    loadLive();
    setInterval(loadSystem, 30000);
    setInterval(loadTasks, 30000);
    setInterval(loadNotifications, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
