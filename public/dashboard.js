// dashboard.js — robust, self-healing, cache-proof
(function () {
  'use strict';

  var TEAM_KEY = '8cdQ7WY9SvAGxe6SfFPlngj0_UbX6Cr';
  var headers = { 'x-team-key': TEAM_KEY, 'content-type': 'application/json' };
  var log = function (m) { try { console.log('[dash]', m); } catch (e) {} };

  function showError(msg) {
    try {
      var el = document.getElementById('error');
      if (el) { el.textContent = msg; el.style.display = 'block'; }
    } catch (e) {}
    log('ERROR: ' + msg);
  }

  function fetchJson(path, options) {
    options = options || {};
    var opts = { headers: headers };
    for (var k in options) opts[k] = options[k];
    return fetch(path, opts).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ── Tab switching (with panel content loading) ──
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
            log('tab switched: ' + name);
          } catch (e) { showError('Tab error: ' + e.message); }
        };
      })(tabs[i]);
    }
  }

  function loadTabContent(name) {
    if (name === 'team') { loadLive(); }
    if (name === 'tasks') { loadTasks(); }
    if (name === 'notifications') { loadNotifications(); }
    if (name === 'main') { loadSystem(); loadAgents(); }
    if (name === 'wallets') { loadWallets(); }
    if (name === 'ai-usage') { loadAiUsage(); }
    if (name === 'observability') { loadObservability(); }
  }

  // ── System stats ──
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

  // ── Live log (polling — simpler and more reliable than SSE) ──
  var liveTimer = null;
  function loadLive() {
    var el = document.getElementById('live-log');
    if (!el) { log('live-log element missing'); return; }
    log('loading live messages...');
    fetchJson('/api/team/messages?limit=30').then(function (data) {
      var msgs = (data.messages || []).slice().reverse();
      if (!msgs.length) { el.innerHTML = '<div class="empty">لا رسائل بعد</div>'; return; }
      el.innerHTML = msgs.map(function (m) {
        var color = m.sender === 'leader' ? '#a78bfa' : (m.sender === 'aurora' ? '#34d399' : '#60a5fa');
        var body = String(m.body || '').slice(0, 800);
        return '<div class="live-item" style="border-right-color:' + color + '">' +
          '<div class="live-meta" style="color:' + color + '">' + (m.sender || '?') + ' · ' + (m.createdAt || '') + '</div>' +
          '<div class="live-body">' + body + '</div></div>';
      }).join('');
      log('live: ' + msgs.length + ' messages');
    }).catch(function (e) {
      el.innerHTML = '<div class="error">تعذر تحميل الرسائل: ' + e.message + '</div>';
    });
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = setInterval(function () {
      var p = document.getElementById('panel-team');
      if (p && p.classList.contains('active')) loadLive();
    }, 8000);
  }

  // ── Tasks ──
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

  // ── Notifications ──
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

  // ── Wallets ──
  function loadWallets() {
    var el = document.getElementById('wallets-content');
    if (!el) return;
    el.innerHTML = '<div class="empty">⏳ جاري التحميل...</div>';
    Promise.all([
      fetch('/api/wallets/balances', { cache: 'no-store', headers: headers }).then(function (r) { return r.json(); }).catch(function () { return {}; }),
      fetch('/wallets.html', { cache: 'no-store', headers: headers }).then(function (r) { return r.text(); }).catch(function () { return ''; })
    ]).then(function (results) {
      var bal = results[0] || {};
      var html = results[1] || '';
      if (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var grid = doc.querySelector('.wallets-grid');
        if (grid) {
          el.innerHTML = grid.outerHTML;
          // Now inject balances
          var ton = null, base = null;
          if (Array.isArray(bal)) { bal.forEach(function (w) { if (String(w.network || '').toLowerCase().indexOf('ton') >= 0) ton = w; if (String(w.network || '').toLowerCase().indexOf('base') >= 0) base = w; }); }
          else if (bal.wallets) { bal.wallets.forEach(function (w) { if (String(w.network || '').toLowerCase().indexOf('ton') >= 0) ton = w; if (String(w.network || '').toLowerCase().indexOf('base') >= 0) base = w; }); }
          else { ton = bal.ton; base = bal.base; }
          var setBal = function (id, v) { var e = el.querySelector('#' + id); if (e && v !== undefined && v !== null) e.textContent = Number(v).toFixed(4); };
          if (ton) setBal('balance-ton', ton.balance !== undefined ? ton.balance : ton.amount);
          if (base) setBal('balance-base', base.balance !== undefined ? base.balance : base.amount);
        } else {
          el.innerHTML = html;
        }
      } else {
        el.innerHTML = '<div class="error">تعذر تحميل المحافظ</div>';
      }
    });
  }

  // ── AI Usage ──
  function loadAiUsage() {
    var el = document.getElementById('ai-usage-content');
    if (!el) return;
    el.innerHTML = '<div class="empty">⏳ جاري التحميل...</div>';
    fetch('/ai-usage', { cache: 'no-store', headers: headers })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        el.innerHTML = doc.body ? doc.body.innerHTML : html;
      })
      .catch(function (e) { el.innerHTML = '<div class="error">فشل: ' + e.message + '</div>'; });
  }

  // ── Observability ──
  function loadObservability() {
    var el = document.getElementById('observability-content');
    if (!el) return;
    el.innerHTML = '<div class="empty">⏳ جاري التحميل...</div>';
    fetch('/observability', { cache: 'no-store', headers: headers })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        el.innerHTML = doc.body ? doc.body.innerHTML : html;
      })
      .catch(function (e) { el.innerHTML = '<div class="error">فشل: ' + e.message + '</div>'; });
  }

  // ── Send message ──
  function initSend() {
    var btn = document.getElementById('send-btn');
    if (!btn) { log('send-btn missing'); return; }
    btn.onclick = function () {
      var bodyEl = document.getElementById('msg-body');
      var recipientEl = document.getElementById('msg-recipient');
      var status = document.getElementById('send-status');
      if (!bodyEl || !status) return;
      var body = bodyEl.value.trim();
      var recipient = recipientEl ? recipientEl.value : 'all';
      if (!body) { status.textContent = 'اكتب نصاً'; return; }
      status.textContent = '⏳ إرسال...';
      fetchJson('/api/team/messages', {
        method: 'POST',
        body: JSON.stringify({ sender: 'leader', recipient: recipient, body: body, thread: 'team' })
      }).then(function () {
        status.textContent = '✅ تم الإرسال';
        bodyEl.value = '';
        setTimeout(function () { status.textContent = ''; }, 5000);
        setTimeout(loadLive, 3000);
      }).catch(function (e) {
        status.textContent = '❌ ' + e.message;
      });
    };
  }

  function init() {
    log('init start');
    try { initTabs(); } catch (e) { showError('initTabs: ' + e.message); }
    try { initSend(); } catch (e) { showError('initSend: ' + e.message); }
    try { loadSystem(); } catch (e) {}
    try { loadAgents(); } catch (e) {}
    try { loadTasks(); } catch (e) {}
    try { loadNotifications(); } catch (e) {}
    try { loadLive(); } catch (e) { showError('loadLive: ' + e.message); }
    setInterval(function () {
      var p = document.getElementById('panel-main');
      if (p && p.classList.contains('active')) { loadSystem(); }
    }, 30000);
    log('init done');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
