// ═══════════════════════════════════════════════════════════
// عمالقة الصمت — لوحة التحكم (الإصدار الكامل v3)
// ═══════════════════════════════════════════════════════════

function setStatus(msg, color) {
  let box = document.getElementById('diag-status');
  if (!box) {
    box = document.createElement('div');
    box.id = 'diag-status';
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:6px;background:#1e293b;color:#e0e7ff;text-align:center;font-size:12px;z-index:9999;';
    if (document.body) document.body.prepend(box);
  }
  box.textContent = msg;
  box.style.background = color || 'transparent';
  box.style.display = msg ? 'block' : 'none';
}

function initDashboard() {
  try {
    const params = new URLSearchParams(location.search);
    const key = params.get('key') || localStorage.getItem('teamKey') || '';
    if (key) localStorage.setItem('teamKey', key);
    if (!key) { setStatus('⚠️ أضف ?key=... إلى الرابط', '#7c2d12'); return; }

    const headers = { 'x-team-key': key, 'content-type': 'application/json' };
    const errorBox = document.getElementById('error');

    async function fetchJson(path, options = {}) {
      const res = await fetch(path, { headers, ...options });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }

    // ═══ التبويبات ═══
    document.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById('panel-' + tab.dataset.tab);
        if (panel) panel.classList.add('active');
      };
    });

    // ═══ الحالة ═══
    let cachedDashboard = null;

    async function loadDashboard() {
      cachedDashboard = await fetchJson('/api/dashboard');
      return cachedDashboard;
    }

    async function loadSystem() {
      try {
        const data = cachedDashboard || await loadDashboard();
        const fin = data.finance || {};
        const el = document.getElementById('system-stats');
        if (el) el.innerHTML = `
          <div class="stat"><span class="label">الحالة</span><span class="value ok">● نشط</span></div>
          <div class="stat"><span class="label">المشاريع</span><span class="value">${(data.projects || []).length}</span></div>
          <div class="stat"><span class="label">الرصيد المكتسب</span><span class="value">USD ${fin.earned || 0}</span></div>
          <div class="stat"><span class="label">Pipeline (محتمل)</span><span class="value">USD ${fin.pipeline || 0}</span></div>
          <div class="stat"><span class="label">مهام مكتملة</span><span class="value">${fin.completed || 0}</span></div>
          <div class="stat"><span class="label">مهام معلقة</span><span class="value">${fin.pending || 0}</span></div>
          <div class="stat"><span class="label">مهام Queue</span><span class="value">${fin.queued || '-'}</span></div>
        `;
      } catch (e) {
        if (errorBox) { errorBox.style.display = 'block'; errorBox.textContent = 'فشل تحميل الحالة: ' + e.message; }
      }
    }

    async function loadAgents() {
      try {
        const data = await fetchJson('/api/team/agents').catch(() => ({ agents: [] }));
        const agents = data.agents || [];
        const el = document.getElementById('agents-list');
        if (!el) return;
        el.innerHTML = agents.length
          ? agents.map(a => `<div class="stat"><span class="label">${a.name || a.id}</span><span class="value">${a.status || 'idle'}</span></div>`).join('')
          : '<div class="empty">لا وكلاء</div>';
      } catch (e) { /* ignore */ }
    }

    async function loadTasks() {
      try {
        const data = await fetchJson('/api/team/tasks').catch(() => ({ tasks: [] }));
        const tasks = data.tasks || [];
        const el = document.getElementById('tasks-list');
        if (!el) return;
        el.innerHTML = tasks.length
          ? tasks.slice(0, 30).map(t => `
          <div class="item">
            <div class="meta">${t.source || ''} • ${t.status || ''}</div>
            <div class="body">${t.title || ''}</div>
            ${t.reward ? `<div class="ok" style="font-size:13px;margin-top:6px">💰 ${t.reward} ${t.currency || ''}</div>` : ''}
            <button class="btn-exec" onclick="executeTask(${t.id})">▶️ تنفيذ</button>
          </div>
        `).join('')
          : '<div class="empty">لا مهام</div>';
      } catch (e) { /* ignore */ }
    }

    async function loadNotifications() {
      try {
        const data = await fetchJson('/api/notifications').catch(() => ({ notifications: [] }));
        const notifs = data.notifications || [];
        const el = document.getElementById('notifications-list');
        if (!el) return;
        el.innerHTML = notifs.length
          ? notifs.slice(0, 30).map(n => `<div class="item"><div class="meta">${n.kind || ''}</div><div class="body">${n.title || ''}</div></div>`).join('')
          : '<div class="empty">لا توجد إشعارات</div>';
      } catch (e) { /* ignore */ }
    }

    // ═══ السجل الحي ═══
    async function loadLiveLog() {
      try {
        const data = cachedDashboard || await loadDashboard();
        const events = data.events || [];
        const chatEvents = events.filter(e => ['leader', 'aurora', 'planner', 'executor', 'reviewer', 'scout', 'ai', 'system', 'watchdog'].includes(e.actor));
        const el = document.getElementById('live-log');
        if (!el) return;
        if (!chatEvents.length) { el.innerHTML = '<div class="empty">لا توجد أحداث بعد</div>'; return; }
        el.innerHTML = chatEvents.slice(0, 60).map(m => {
          const time = (m.created_at || '').slice(11, 19);
          const actor = m.actor || '?';
          const detail = String(m.detail || '').replace(/[*#]/g, '').slice(0, 300);
          const color = actor === 'leader' ? '#a78bfa' : (actor === 'aurora' ? '#60a5fa' : '#34d399');
          return `<div class="live-item">
            <div class="live-meta" style="color:${color}">${actor} • ${time}</div>
            <div class="live-body">${detail}</div>
          </div>`;
        }).join('');
      } catch (e) { /* ignore */ }
    }

    // ═══ إرسال رسالة ═══
    async function handleSend() {
      const recipientEl = document.getElementById('msg-recipient');
      const bodyEl = document.getElementById('msg-body');
      const status = document.getElementById('send-status');
      if (!recipientEl || !bodyEl || !status) return;
      const body = bodyEl.value.trim();
      if (!body) { status.textContent = '⚠️ اكتب رسالة أولاً'; status.style.color = '#fbbf24'; return; }
      status.textContent = '⏳ جاري الإرسال...';
      status.style.color = '#94a3b8';
      try {
        await fetchJson('/api/team/messages', {
          method: 'POST',
          body: JSON.stringify({
            sender: 'leader',
            recipient: recipientEl.value || 'all',
            thread: 'team',
            body: body
          })
        });
        status.textContent = '✅ تم الإرسال';
        status.style.color = '#4ade80';
        bodyEl.value = '';
        setTimeout(loadLiveLog, 2000);
      } catch (e) {
        status.textContent = '❌ فشل: ' + e.message;
        status.style.color = '#f87171';
      }
    }

    window.executeTask = async function(taskId) {
      try { await fetchJson('/tasks/' + taskId + '/execute', { method: 'POST' }); setTimeout(loadTasks, 1500); }
      catch (e) { alert('فشل: ' + e.message); }
    };

    // ═══ التهيئة ═══
    loadSystem();
    loadAgents();
    loadTasks();
    loadNotifications();
    loadLiveLog();

    setInterval(loadSystem, 30000);
    setInterval(loadAgents, 30000);
    setInterval(loadLiveLog, 15000);
    setInterval(loadTasks, 30000);

    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.onclick = handleSend;

    const execBtn = document.getElementById('exec-now-btn');
    if (execBtn) execBtn.onclick = () => { setStatus('⏳ تنفيذ مهمة...', '#312e81'); setTimeout(() => setStatus('', ''), 3000); };

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.onclick = () => { loadSystem(); loadAgents(); loadTasks(); loadLiveLog(); loadNotifications(); };

    setStatus('', '');
  } catch (e) {
    setStatus('❌ خطأ: ' + e.message, '#7f1d1d');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}
