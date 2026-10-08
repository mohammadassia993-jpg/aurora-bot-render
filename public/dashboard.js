// dashboard.js — bulletproof, escape-safe, cache-proof, with clickable stats
(function () {
  'use strict';

  var TEAM_KEY = '8cdQ7WY9SvAGxe6SfFPlngj0_UbX6Cr';
  var headers = { 'x-team-key': TEAM_KEY, 'content-type': 'application/json' };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fetchJson(path, options) {
    options = options || {};
    var opts = { headers: headers, cache: 'no-store' };
    for (var k in options) opts[k] = options[k];
    return fetch(path, opts).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ============ Modal ============
  function openModal(title, html) {
    var o = document.getElementById('modal-overlay');
    var t = document.getElementById('modal-title');
    var b = document.getElementById('modal-body');
    if (!o || !t || !b) return;
    t.textContent = title;
    b.innerHTML = html;
    o.classList.add('open');
  }
  function closeModal() {
    var o = document.getElementById('modal-overlay');
    if (o) o.classList.remove('open');
  }
  function initModal() {
    var c = document.getElementById('modal-close');
    var o = document.getElementById('modal-overlay');
    if (c) c.onclick = closeModal;
    if (o) o.onclick = function (ev) { if (ev.target === o) closeModal(); };
  }

  // ============ Detail handlers ============
  window.__showProjects = function () {
    var d = window.__lastDashboard || {};
    var list = Array.isArray(d.projects) ? d.projects : [];
    if (!list.length) { openModal('المشاريع', '<div class="empty">لا مشاريع</div>'); return; }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      html += '<div class="item">' +
        '<div class="meta">' + escapeHtml(p.source || '?') + (p.owner ? ' · ' + escapeHtml(p.owner) : '') + '</div>' +
        '<div class="body">الإجمالي: ' + Number(p.total || 0) + ' · مكتمل: ' + Number(p.completed || 0) + '</div>' +
        '</div>';
    }
    openModal('📁 المشاريع (' + list.length + ')', html);
  };

  window.__showTasks = function (filter) {
    var title = filter === 'pending' ? '⏳ المهام المعلقة' : '✅ المهام المكتملة';
    openModal(title, '<div class="empty">جاري التحميل...</div>');
    fetchJson('/api/team/tasks').then(function (data) {
      var tasks = data.tasks || [];
      var pendingStates = ['discovered', 'planned', 'drafted', 'needs_revision'];
      var doneStates = ['submitted', 'delivered', 'paid'];
      var wanted = filter === 'pending' ? pendingStates : doneStates;
      var filtered = tasks.filter(function (t) { return wanted.indexOf(String(t.status)) >= 0; });
      if (!filtered.length) { openModal(title, '<div class="empty">لا مهام</div>'); return; }
      var html = filtered.map(function (t) {
        return '<div class="item"><div class="meta">#' + escapeHtml(t.id) + ' · ' + escapeHtml(t.status || '') + '</div>' +
               '<div class="body">' + escapeHtml(t.title || '(بدون عنوان)') + '</div></div>';
      }).join('');
      openModal(title + ' (' + filtered.length + ')', html);
    }).catch(function (e) {
      openModal(title, '<div class="error">تعذر التحميل: ' + escapeHtml(e.message) + '</div>');
    });
  };

  // ============ Tabs ============
  function initTabs() {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      (function (tab) {
        tab.onclick = function () {
          try {
            var allTabs = document.querySelectorAll('.tab');
            var allPanels = document.querySelectorAll('.panel');
            for (var j = 0; j < allTabs.length; j++) allTabs[j].classList.remove('active');
            for (var k = 0; k < allPanels.length; k++) allPanels[k].classList.remove('active');
            tab.classList.add('active');
            var name = tab.getAttribute('data-tab');
            var p = document.getElementById('panel-' + name);
            if (p) p.classList.add('active');
            loadTabContent(name);
          } catch (e) { /* silent */ }
        };
      })(tabs[i]);
    }
  }

  function loadTabContent(name) {
    try {
      if (name === 'team') loadLive();
      if (name === 'tasks') loadTasks();
      if (name === 'notifications') loadNotifications();
      if (name === 'main') { loadSystem(); loadAgents(); }
      if (name === 'wallets') loadWallets();
      if (name === 'ai-usage') loadAiUsage();
      if (name === 'observability') loadObservability();
    } catch (e) { /* silent */ }
  }

  function loadSystem() {
    return fetchJson('/api/dashboard').then(function (data) {
      window.__lastDashboard = data; // نحفظ للاستخدام في Modal
      var fin = data.finance || {};
      var el = document.getElementById('system-stats');
      if (!el) return;

      var projectsList = Array.isArray(data.projects) ? data.projects : [];
      var totalProjects = 0;
      for (var i = 0; i < projectsList.length; i++) {
        totalProjects += Number(projectsList[i].total || 0);
      }
      var tasksDone = (fin.completedTasks != null ? fin.completedTasks : 0);
      var tasksPending = (fin.pendingTasks != null ? fin.pendingTasks : 0);

      el.innerHTML =
        '<div class="stat"><span class="label">الحالة</span><span class="value">نشط</span></div>' +
        '<div class="stat clickable" onclick="window.__showProjects()"><span class="label">المشاريع</span><span class="value">' + totalProjects + '</span></div>' +
        '<div class="stat"><span class="label">الرصيد</span><span class="value">USD ' + (fin.earned || 0) + '</span></div>' +
        '<div class="stat"><span class="label">Pipeline</span><span class="value">USD ' + (fin.pipeline || 0) + '</span></div>' +
        '<div class="stat clickable" onclick="window.__showTasks(\'done\')"><span class="label">مهام مكتملة</span><span class="value">' + tasksDone + '</span></div>' +
        '<div class="stat clickable" onclick="window.__showTasks(\'pending\')"><span class="label">مهام معلقة</span><span class="value">' + tasksPending + '</span></div>';
    }).catch(function (e) {
      var el = document.getElementById('system-stats');
      if (el) el.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
    });
  }

  function loadAgents() {
    return fetchJson('/api/dashboard').then(function (data) {
      var el = document.getElementById('agents-list');
      if (!el) return;
      var agents = data.agents || [];
      if (!agents.length) { el.innerHTML = '<div class="empty">لا وكلاء</div>'; return; }
      el.innerHTML = agents.map(function (a) {
        return '<div class="stat"><span class="label">' + escapeHtml(a.name || a.id) + '</span><span class="value">' + escapeHtml(a.status || 'idle') + '</span></div>';
      }).join('');
    }).catch(function () {});
  }

  var liveTimer = null;
  function loadLive() {
    var el = document.getElementById('live-log');
    if (!el) return;
    fetchJson('/api/team/messages?limit=30').then(function (data) {
      var msgs = (data.messages || []).slice().reverse();
      if (!msgs.length) { el.innerHTML = '<div class="empty">لا رسائل بعد</div>'; return; }
      var out = [];
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i];
        var color = m.sender === 'leader' ? '#a78bfa' : (m.sender === 'aurora' ? '#34d399' : '#60a5fa');
        var body = escapeHtml(String(m.body || '').slice(0, 800));
        out.push('<div class="live-item" style="border-right-color:' + color + '">' +
          '<div class="live-meta" style="color:' + color + '">' + escapeHtml(m.sender || '?') + ' · ' + escapeHtml(m.createdAt || '') + '</div>' +
          '<div class="live-body">' + body + '</div></div>');
      }
      el.innerHTML = out.join('');
    }).catch(function (e) {
      el.innerHTML = '<div class="error">تعذر التحميل: ' + escapeHtml(e.message) + '</div>';
    });
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = setInterval(function () {
      try {
        var p = document.getElementById('panel-team');
        if (p && p.classList.contains('active')) loadLive();
      } catch (e) {}
    }, 8000);
  }

  function loadTasks() {
    return fetchJson('/api/team/tasks').then(function (data) {
      var el = document.getElementById('tasks-list');
      if (!el) return;
      var tasks = data.tasks || [];
      if (!tasks.length) { el.innerHTML = '<div class="empty">لا مهام</div>'; return; }
      el.innerHTML = tasks.slice(0, 30).map(function (t) {
        return '<div class="item"><div class="meta">#' + escapeHtml(t.id) + ' · ' + escapeHtml(t.status) + '</div><div class="body">' + escapeHtml(t.title || '') + '</div></div>';
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
        return '<div class="item"><div class="meta">' + escapeHtml(n.kind || '') + '</div><div class="body">' + escapeHtml(n.title || '') + '</div></div>';
      }).join('');
    }).catch(function () {});
  }

  function loadWallets() {
    var el = document.getElementById('wallets-content');
    if (!el) return;
    el.innerHTML = '<div class="empty">جاري التحميل...</div>';
    fetch('/api/wallets/balances', { cache: 'no-store', headers: headers })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var ton = null, base = null, list = [];
        if (Array.isArray(data)) list = data;
        else if (data && data.wallets) list = data.wallets;
        for (var i = 0; i < list.length; i++) {
          var net = String(list[i].network || list[i].chain || '').toLowerCase();
          if (net.indexOf('ton') >= 0) ton = list[i];
          if (net.indexOf('base') >= 0) base = list[i];
        }
        var html = '<div style="text-align:center;padding:20px"><h3>المحافظ</h3>';
        if (ton) { html += '<p>USDT/TON: ' + (ton.balance || ton.amount || '—') + '</p>'; }
        if (base) { html += '<p>USDC/Base: ' + (base.balance || base.amount || '—') + '</p>'; }
        if (!ton && !base) html += '<p>لا محافظ</p>';
        html += '</div>';
        el.innerHTML = html;
      })
      .catch(function (e) { el.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>'; });
  }

  function loadAiUsage() {
    var el = document.getElementById('ai-usage-content');
    if (!el) return;
    el.innerHTML = '<div class="empty">جاري التحميل...</div>';
    fetch('/ai-usage', { cache: 'no-store', headers: headers })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        el.innerHTML = doc.body ? doc.body.innerHTML : html;
      })
      .catch(function (e) { el.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>'; });
  }

  function loadObservability() {
    var el = document.getElementById('observability-content');
    if (!el) return;
    el.innerHTML = '<div class="empty">جاري التحميل...</div>';
    fetch('/observability', { cache: 'no-store', headers: headers })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        el.innerHTML = doc.body ? doc.body.innerHTML : html;
      })
      .catch(function (e) { el.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>'; });
  }

  function initSend() {
    var btn = document.getElementById('send-btn');
    if (!btn) return;
    btn.onclick = function () {
      try {
        var bodyEl = document.getElementById('msg-body');
        var recipientEl = document.getElementById('msg-recipient');
        var status = document.getElementById('send-status');
        if (!bodyEl || !status) return;
        var body = bodyEl.value.trim();
        var recipient = recipientEl ? recipientEl.value : 'all';
        if (!body) { status.textContent = 'اكتب نصاً'; return; }
        status.textContent = 'جاري الإرسال...';
        fetchJson('/api/team/messages', {
          method: 'POST',
          body: JSON.stringify({ sender: 'leader', recipient: recipient, body: body, thread: 'team' })
        }).then(function () {
          status.textContent = 'تم الإرسال';
          bodyEl.value = '';
          setTimeout(function () { status.textContent = ''; }, 5000);
          setTimeout(loadLive, 2000);
        }).catch(function (e) { status.textContent = 'فشل: ' + escapeHtml(e.message); });
      } catch (e) { /* silent */ }
    };
  }

  function init() {
    try { initModal(); } catch (e) {}
    try { initTabs(); } catch (e) {}
    try { initSend(); } catch (e) {}
    try { loadSystem(); } catch (e) {}
    try { loadAgents(); } catch (e) {}
    try { loadTasks(); } catch (e) {}
    try { loadNotifications(); } catch (e) {}
    try { loadLive(); } catch (e) {}
    setInterval(function () {
      try {
        var p = document.getElementById('panel-main');
        if (p && p.classList.contains('active')) loadSystem();
      } catch (e) {}
    }, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
