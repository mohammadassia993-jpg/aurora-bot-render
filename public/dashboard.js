// عمالقة الصمت — dashboard.js (سجل حي من messages)
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

  // Lazy-load content into a panel container (works around iframe restrictions)
  function loadTabContent(name, panelEl) {
    if (name === 'ai-usage') {
      var el = document.getElementById('ai-usage-content');
      if (!el) return;
      el.innerHTML = '<div class="empty">⏳ جاري التحميل...</div>';
      fetch('/ai-usage', { cache: 'no-store', headers: headers })
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var inner = doc.querySelector('.section') ? doc.body.innerHTML : html;
          el.innerHTML = inner;
        })
        .catch(function (e) { el.innerHTML = '<div class="error">فشل التحميل: ' + e.message + '</div>'; });
    }
    if (name === 'wallets') {
      var el2 = document.getElementById('wallets-content');
      if (!el2) return;
      if (el2.dataset.loaded === '1') return;
      el2.innerHTML = '<div class="empty">⏳ جاري التحميل...</div>';
      fetch('/wallets.html', { cache: 'no-store', headers: headers })
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var inner = doc.body ? doc.body.innerHTML : html;
          el2.innerHTML = inner;
          el2.dataset.loaded = '1';
          // Execute inline scripts from fetched HTML
          el2.querySelectorAll('script').forEach(function (oldScript) {
            var newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(function (a) { newScript.setAttribute(a.name, a.value); });
            newScript.textContent = oldScript.textContent;
            oldScript.parentNode.replaceChild(newScript, oldScript);
          });
        })
        .catch(function (e) { el2.innerHTML = '<div class="error">فشل التحميل: ' + e.message + '</div>'; });
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
        if (p) {
          p.classList.add('active');
          loadTabContent(name, p);
        }
      };
    }
  }

  function loadSystem() {
    return fetchJson('/api/dashboard')
      .then(function (data) {
        var fin = data.finance || {};
        var el = document.getElementById('system-stats');
        if (!el) return;
        el.innerHTML =
          '<div class="stat"><span class="label">الحالة</span><span class="value ok">● نشط</span></div>' +
          '<div class="stat"><span class="label">المشاريع</span><span class="value">' + (data.projects || 0) + '</span></div>' +
          '<div class="stat"><span class="label">الرصيد المكتسب</span><span class="value">USD ' + (fin.earned || 0) + '</span></div>' +
          '<div class="stat"><span class="label">Pipeline (محتمل)</span><span class="value">USD ' + (fin.pipeline || 0) + '</span></div>' +
          '<div class="stat"><span class="label">مهام مكتملة</span><span class="value">' + (data.tasksDone || 0) + '</span></div>' +
          '<div class="stat"><span class="label">مهام معلقة</span><span class="value">' + (data.tasksPending || 0) + '</span></div>';
      })
      .catch(function (e) {
        var el = document.getElementById('system-stats');
        if (el) el.innerHTML = '<div class="error">' + e.message + '</div>';
      });
  }

  function loadAgents() {
    return fetchJson('/api/dashboard')
      .then(function (data) {
        var el = document.getElementById('agents-list');
        if (!el) return;
        var agents = data.agents || [];
        if (!agents.length) { el.innerHTML = '<div class="empty">لا وكلاء</div>'; return; }
        el.innerHTML = agents.map(function (a) {
          return '<div class="stat"><span class="label">' + (a.name || a.id) + '</span><span class="value">' + (a.status || 'idle') + '</span></div>';
        }).join('');
      })
      .catch(function () {});
  }

  function loadTasks() {
    return fetchJson('/api/team/tasks')
      .then(function (data) {
        var el = document.getElementById('tasks-list');
        if (!el) return;
        var tasks = data.tasks || [];
        if (!tasks.length) { el.innerHTML = '<div class="empty">لا مهام</div>'; return; }
        el.innerHTML = tasks.slice(0, 30).map(function (t) {
          return '<div class="item"><div class="meta">#' + t.id + ' · ' + (t.status || '') + ' · ' + (t.source || '') + '</div><div class="body">' + (t.title || '') + '</div></div>';
        }).join('');
      })
      .catch(function () {});
  }

  function loadNotifications() {
    return fetchJson('/api/notifications')
      .then(function (data) {
        var el = document.getElementById('notifications-list');
        if (!el) return;
        var items = data.notifications || [];
        if (!items.length) { el.innerHTML = '<div class="empty">لا إشعارات</div>'; return; }
        el.innerHTML = items.slice(0, 30).map(function (n) {
          return '<div class="item"><div class="meta">' + (n.kind || '') + '</div><div class="body">' + (n.title || '') + '</div></div>';
        }).join('');
      })
      .catch(function () {});
  }

  function loadLive() {
    var el = document.getElementById('live-log');
    if (!el) return;
    if (window.__liveInit) return;
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
      if (!body) { status.textContent = 'اكتب نصاً أولاً'; return; }
      status.textContent = '⏳ جاري الإرسال...';
      fetchJson('/api/team/messages', {
        method: 'POST',
        body: JSON.stringify({ sender: 'leader', recipient: recipient, body: body, thread: 'team' })
      }).then(function () {
        status.textContent = '✅ تم الإرسال — الفريق يعالج الآن';
        document.getElementById('msg-body').value = '';
        setTimeout(function () { status.textContent = ''; }, 5000);
      }).catch(function (e) {
        status.textContent = '❌ ' + e.message;
      });
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
