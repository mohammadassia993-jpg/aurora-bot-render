// ═══════════════════════════════════════════════
// عمالقة الصمت — dashboard.js (نسخة تشخيص)
// ═══════════════════════════════════════════════

function setStatus(msg, color) {
  let box = document.getElementById('diag-status');
  if (!box) {
    box = document.createElement('div');
    box.id = 'diag-status';
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:8px;background:#1e293b;color:#e0e7ff;text-align:center;font-size:12px;z-index:9999;border-bottom:2px solid #a78bfa;';
    if (document.body) document.body.prepend(box);
  }
  box.textContent = msg;
  box.style.background = color || '#1e293b';
}

function initDashboard() {
  try {
    setStatus('✅ JS يعمل — جاري التحقق من المفاتيح...', '#065f46');

    const params = new URLSearchParams(location.search);
    const key = params.get('key') || localStorage.getItem('teamKey') || '';
    if (key) localStorage.setItem('teamKey', key);

    if (!key) {
      setStatus('⚠️ لا يوجد مفتاح — أضف ?key=...', '#7c2d12');
      return;
    }

    const headers = { 'x-team-key': key, 'content-type': 'application/json' };
    const errorBox = document.getElementById('error');

    async function fetchJson(path, options = {}) {
      const res = await fetch(path, { headers, ...options });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }

    // ربط التبويبات
    document.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById('panel-' + tab.dataset.tab);
        if (panel) panel.classList.add('active');
      };
    });

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
          <div class="stat"><span class="label">الرصيد المكتسب</span><span class="value">${fin.earned || 0} USD</span></div>
          <div class="stat"><span class="label">Pipeline (محتمل)</span><span class="value warn">${fin.pipeline || 0} USD</span></div>
          <div class="stat"><span class="label">مهام مكتملة</span><span class="value">${fin.completedTasks || 0}</span></div>
          <div class="stat"><span class="label">مهام معلقة</span><span class="value">${fin.pendingTasks || 0}</span></div>
        `;
      } catch (e) {
        const el = document.getElementById('system-stats');
        if (el) el.innerHTML = '<div class="empty">خطأ: ' + e.message + '</div>';
      }
    }

    async function loadAgents() {
      try {
        const data = cachedDashboard || await loadDashboard();
        const agents = data.agents || [];
        const el = document.getElementById('agents-list');
        if (el) el.innerHTML = agents.length
          ? agents.map(a => `<div class="stat"><span class="label">${a.name || a.id}</span><span class="value ${a.status === 'active' ? 'ok' : 'warn'}">${a.status || 'idle'}</span></div>`).join('')
          : '<div class="empty">لا يوجد وكلاء</div>';
      } catch (e) {
        const el = document.getElementById('agents-list');
        if (el) el.innerHTML = '<div class="empty">خطأ: ' + e.message + '</div>';
      }
    }

    async function loadMessages() {
      try {
        const data = cachedDashboard || await loadDashboard();
        const events = data.events || [];
        const chatEvents = events.filter(e => ['leader', 'aurora', 'planner', 'executor', 'reviewer', 'scout'].includes(e.actor));
        const el = document.getElementById('messages-list');
        if (!el) return;
        if (!chatEvents.length) { el.innerHTML = '<div class="empty">لا توجد رسائل بعد</div>'; return; }
        el.innerHTML = chatEvents.slice(0, 40).map(m => `
          <div class="item">
            <div class="meta">${m.actor || '?'} • ${(m.created_at || '').slice(11, 19)}</div>
            <div class="body">${String(m.detail || '').replace(/[*#]/g, '').slice(0, 400)}</div>
          </div>
        `).join('');
      } catch (e) {
        const el = document.getElementById('messages-list');
        if (el) el.innerHTML = '<div class="empty">خطأ: ' + e.message + '</div>';
      }
    }

    async function loadTasks() {
      try {
        const data = await fetchJson('/api/team/tasks').catch(() => ({ tasks: [] }));
        const tasks = data.tasks || [];
        const el = document.getElementById('tasks-list');
        if (!el) return;
        if (!tasks.length) {
          const dash = cachedDashboard || await loadDashboard();
          const metrics = dash?.performance?.metrics?.taskCounts || [];
          el.innerHTML = metrics.map(m => `<div class="stat"><span class="label">${m.status}</span><span class="value">${m.count}</span></div>`).join('')
            || '<div class="empty">لا توجد مهام</div>';
          return;
        }
        el.innerHTML = tasks.slice(0, 30).map(t => `
          <div class="item">
            <div class="meta">${t.source || ''} • ${t.status || ''}</div>
            <div class="body">${t.title || ''}</div>
            ${t.reward ? `<div class="ok" style="font-size:13px;margin-top:6px">💰 ${t.reward} ${t.currency || ''}</div>` : ''}
          </div>
        `).join('');
      } catch (e) {
        const el = document.getElementById('tasks-list');
        if (el) el.innerHTML = '<div class="empty">خطأ: ' + e.message + '</div>';
      }
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
      } catch (e) {
        const el = document.getElementById('notifications-list');
        if (el) el.innerHTML = '<div class="empty">خطأ: ' + e.message + '</div>';
      }
    }

    async function handleSend() {
      const recipientEl = document.getElementById('msg-recipient');
      const bodyEl = document.getElementById('msg-body');
      const status = document.getElementById('send-status');
      if (!recipientEl || !bodyEl || !status) return;
      const body = bodyEl.value.trim();
      if (!body) { status.textContent = '⚠️ اكتب رسالة أولاً'; status.style.color = '#fbbf24'; return; }
      status.textContent = 'جاري الإرسال...';
      status.style.color = '#94a3b8';
      try {
        await fetchJson('/api/team/messages', {
          method: 'POST',
          body: JSON.stringify({ sender: 'leader', recipient: recipientEl.value, body })
        });
        status.textContent = '✅ تم الإرسال — جاري تحديث الردود...';
        status.style.color = '#4ade80';
        bodyEl.value = '';
        cachedDashboard = null;
        setTimeout(async () => {
          await loadDashboard().catch(() => {});
          await loadMessages();
        }, 5000);
      } catch (e) {
        status.textContent = '❌ فشل: ' + e.message;
        status.style.color = '#f87171';
      }
    }

    async function loadAll() {
      setStatus('🔄 جاري تحميل البيانات...', '#1e40af');
      if (errorBox) errorBox.style.display = 'none';
      cachedDashboard = null;
      try {
        await loadDashboard();
        await Promise.all([loadSystem(), loadAgents(), loadMessages(), loadTasks(), loadNotifications()]);
        setStatus('✅ تم تحميل كل البيانات بنجاح', '#065f46');
        setTimeout(() => setStatus('', 'transparent'), 3000);
      } catch (e) {
        setStatus('❌ فشل التحميل: ' + e.message, '#7f1d1d');
      }
    }

    // ⭐ ربط الأزرار — هنا كان الخطأ الرئيسي
    const refreshBtn = document.getElementById('refresh-btn');
    const sendBtn = document.getElementById('send-btn');

    if (refreshBtn) {
      refreshBtn.onclick = loadAll;
      setStatus('✅ زر التحديث جاهز', '#065f46');
    } else {
      setStatus('❌ زر التحديث غير موجود في الصفحة!', '#7f1d1d');
      return;
    }

    if (sendBtn) sendBtn.onclick = handleSend;

    setTimeout(() => setStatus('', 'transparent'), 3000);
    loadAll();
  } catch (err) {
    setStatus('❌ خطأ في JS: ' + err.message, '#7f1d1d');
  }
}

// ⭐ الانتظار حتى تجهز الصفحة بالكامل قبل التشغيل
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}
