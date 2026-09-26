// عمالقة الصمت — لوحة التحكم
(function () {
  function setStatus(msg, color) {
    var box = document.getElementById('diag-status');
    if (!box) {
      box = document.createElement('div');
      box.id = 'diag-status';
      box.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:6px;background:#1e293b;color:#e0e7ff;text-align:center;font-size:12px;z-index:9999;';
      if (document.body) document.body.prepend(box);
    }
    box.textContent = msg || '';
    box.style.background = color || 'transparent';
    box.style.display = msg ? 'block' : 'none';
  }

  function init() {
    var params = new URLSearchParams(location.search);
    var key = params.get('key') || localStorage.getItem('teamKey') || '';
    if (key) localStorage.setItem('teamKey', key);
    if (!key) { setStatus('⚠️ أضف ?key=... إلى الرابط', '#7c2d12'); return; }

    var headers = { 'x-team-key': key, 'content-type': 'application/json' };
    var errorBox = document.getElementById('error');

    function fetchJson(path, options) {
      options = options || {};
      var opts = { headers: headers };
      for (var k in options) opts[k] = options[k];
      return fetch(path, opts).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }

    // ═══ التبويبات ═══
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
        if (p) p.classList.add('active');
      };
    }

    var cachedDashboard = null;

    function loadDashboard() {
      return fetchJson('/api/dashboard').then(function (d) { cachedDashboard = d; return d; });
    }

    function loadSystem() {
      return (cachedDashboard ? Promise.resolve(cachedDashboard) : loadDashboard())
        .then(function (data) {
          var fin = data.finance || {};
          var el = document.getElementById('system-stats');
          if (!el) return;
          el.innerHTML =
            '<div class="stat"><span class="label">الحالة</span><span class="value ok">● نشط</span></div>' +
            '<div class="stat"><span class="label">المشاريع</span><span class="value">' + ((data.projects || []).length) + '</span></div>' +
            '<div class="stat"><span class="label">الرصيد المكتسب</span><span class="value">USD ' + (fin.earned || 0) + '</span></div>' +
            '<div class="stat"><span class="label">Pipeline (محتمل)</span><span class="value">USD ' + (fin.pipeline || 0) + '</span></div>' +
            '<div class="stat"><span class="label">مهام مكتملة</span><span class="value">' + (fin.completed || 0) + '</span></div>' +
            '<div class="stat"><span class="label">مهام معلقة</span><span class="value">' + (fin.pending || 0) + '</span></div>';
        })
        .catch(function (e) {
          if (errorBox) { errorBox.style.display = 'block'; errorBox.textContent = 'فشل تحميل الحالة: ' + e.message; }
        });
    }

    function loadAgents() {
      return fetchJson('/api/team/agents').catch(function () { return { agents: [] }; })
        .then(function (data) {
          var agents = data.agents || [];
          var el = document.getElementById('agents-list');
          if (!el) return;
          if (!agents.length) { el.innerHTML = '<div class="empty">لا وكلاء</div>'; return; }
          var html = '';
          for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            html += '<div class="stat"><span class="label">' + (a.name || a.id || '?') + '</span><span class="value">' + (a.status || 'idle') + '</span></div>';
          }
          el.innerHTML = html;
        });
    }

    function loadTasks() {
      return fetchJson('/api/team/tasks').catch(function () { return { tasks: [] }; })
        .then(function (data) {
          var list = data.tasks || [];
          var el = document.getElementById('tasks-list');
          if (!el) return;
          if (!list.length) { el.innerHTML = '<div class="empty">لا مهام</div>'; return; }
          var html = '';
          var max = Math.min(list.length, 30);
          for (var i = 0; i < max; i++) {
            var t = list[i];
            html += '<div class="item">';
            html += '<div class="meta">' + (t.source || '') + ' • ' + (t.status || '') + '</div>';
            html += '<div class="body">' + (t.title || '') + '</div>';
            html += '</div>';
          }
          el.innerHTML = html;
        });
    }

    function loadNotifications() {
      return fetchJson('/api/notifications').catch(function () { return { notifications: [] }; })
        .then(function (data) {
          var list = data.notifications || [];
          var el = document.getElementById('notifications-list');
          if (!el) return;
          if (!list.length) { el.innerHTML = '<div class="empty">لا توجد إشعارات</div>'; return; }
          var html = '';
          var max = Math.min(list.length, 30);
          for (var i = 0; i < max; i++) {
            var n = list[i];
            html += '<div class="item"><div class="meta">' + (n.kind || '') + '</div><div class="body">' + (n.title || '') + '</div></div>';
          }
          el.innerHTML = html;
        });
    }

    function loadLiveLog() {
      return (cachedDashboard ? Promise.resolve(cachedDashboard) : loadDashboard())
        .then(function (data) {
          var events = (data.events || []).filter(function (e) {
            return ['leader', 'aurora', 'planner', 'executor', 'reviewer', 'scout', 'ai', 'system', 'watchdog'].indexOf(e.actor) !== -1;
          });
          var el = document.getElementById('live-log');
          if (!el) return;
          if (!events.length) { el.innerHTML = '<div class="empty">لا توجد أحداث بعد</div>'; return; }
          var html = '';
          var max = Math.min(events.length, 60);
          for (var i = 0; i < max; i++) {
            var m = events[i];
            var time = (m.created_at || '').slice(11, 19);
            var actor = m.actor || '?';
            var detail = String(m.detail || '').replace(/[*#]/g, '').slice(0, 300);
            var color = actor === 'leader' ? '#a78bfa' : (actor === 'aurora' ? '#60a5fa' : '#34d399');
            html += '<div class="live-item"><div class="live-meta" style="color:' + color + '">' + actor + ' • ' + time + '</div><div class="live-body">' + detail + '</div></div>';
          }
          el.innerHTML = html;
        });
    }

    function handleSend() {
      var recipientEl = document.getElementById('msg-recipient');
      var bodyEl = document.getElementById('msg-body');
      var status = document.getElementById('send-status');
      if (!recipientEl || !bodyEl || !status) return;
      var body = bodyEl.value.trim();
      if (!body) { status.textContent = '⚠️ اكتب رسالة أولاً'; status.style.color = '#fbbf24'; return; }
      status.textContent = '⏳ جاري الإرسال...';
      status.style.color = '#94a3b8';
      fetchJson('/api/team/messages', {
        method: 'POST',
        body: JSON.stringify({ sender: 'leader', recipient: recipientEl.value || 'all', thread: 'team', body: body })
      }).then(function () {
        status.textContent = '✅ تم الإرسال';
        status.style.color = '#4ade80';
        bodyEl.value = '';
        setTimeout(loadLiveLog, 2000);
      }).catch(function (e) {
        status.textContent = '❌ فشل: ' + e.message;
        status.style.color = '#f87171';
      });
    }

    loadSystem();
    loadAgents();
    loadTasks();
    loadNotifications();
    loadLiveLog();

    setInterval(loadSystem, 30000);
    setInterval(loadAgents, 30000);
    setInterval(loadLiveLog, 15000);
    setInterval(loadTasks, 30000);

    var sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.onclick = handleSend;

    var refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.onclick = function () {
      loadSystem(); loadAgents(); loadTasks(); loadLiveLog(); loadNotifications();
    };

    setStatus('', '');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
