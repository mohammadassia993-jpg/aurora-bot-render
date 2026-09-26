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
  const response = await fetch('/api/wallets/balances');
  const wallets = await response.json();
  const walletElements = wallets.map(wallet => {
    return `
      <div class="card">
        <h2>${wallet.name}</h2>
        <div class="stat">
          <span class="label">العنوان</span>
          <span class="value">${wallet.address}</span>
          <button class="btn-copy" onclick="copyAddress('${wallet.address}')">نسخ</button>
        </div>
        <div class="stat">
          <span class="label">الرصيد</span>
          <span class="value">${wallet.balance}</span>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('wallets').innerHTML = walletElements;

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
          <div class="stat"><span class="label">مهام Queue</span><span class="value">${data.metrics?.taskCounts?.map(t=>t.status+':'+t.count).join(' | ') || '-'}</span></div>
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
      } catch (e) { /* ignore */ }
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
        el.innerHTML = tasks.slice(0, 50).map(t => `
          <div class="item">
            <div class="meta">${t.source || ''} • ${t.status || ''}</div>
            <div class="body">${t.title || ''}</div>
            ${t.reward ? `<div class="ok" style="font-size:13px;margin-top:6px">💰 ${t.reward} ${t.currency || ''}</div>` : ''}
            <button class="btn-exec" onclick="executeTask(${t.id})">▶️ تنفيذ</button>
          </div>
        `).join('');
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
        const chatEvents = events.filter(e => ['leader', 'aurora', 'planner', 'executor', 'reviewer', 'scout', 'ai', 'executor', 'system', 'watchdog'].includes(e.actor));
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
      status.textContent = 'جاري الإرسال...'; status.style.color = '#94a3b8';
      try {
        await fetchJson('/api/team/messages', {
          method: 'POST',
          body: JSON.stringify({ sender: 'leader', recipient: recipientEl.value, body })
        });
        status.textContent = '✅ تم الإرسال — الفريق يعمل الآن';
        status.style.color = '#4ade80';
        bodyEl.value = '';
        cachedDashboard = null;
        // تحديث تلقائي بعد 5 ثوان
        setTimeout(async () => {
          cachedDashboard = null;
          await loadDashboard().catch(() => {});
          await Promise.all([loadLiveLog(), loadSystem(), loadAgents(), loadTasks()]);
        }, 5000);
      } catch (e) {
        status.textContent = '❌ فشل: ' + e.message;
        status.style.color = '#f87171';
      }
    }

    // ═══ تنفيذ مهمة الآن (Heartbeat) ═══
    async function runHeartbeatNow() {
      const btn = document.getElementById('exec-now-btn');
      if (btn) { btn.textContent = '⏳ جاري التنفيذ...'; btn.disabled = true; }
      try {
        const res = await fetchJson('/heartbeat', { method: 'POST' }).catch(() => fetchJson('/heartbeat'));
        setStatus('✅ تم تنفيذ: ' + (res.description || 'مهمة') + ' → ' + (res.result || ''), '#065f46');
        setTimeout(() => setStatus('', 'transparent'), 5000);
        cachedDashboard = null;
        await loadDashboard().catch(() => {});
        await Promise.all([loadLiveLog(), loadSystem(), loadTasks()]);
      } catch (e) {
        setStatus('❌ فشل التنفيذ: ' + e.message, '#7f1d1d');
      } finally {
        if (btn) { btn.textContent = '▶️ تنفيذ مهمة الآن'; btn.disabled = false; }
      }
    }

    // ═══ تنفيذ مهمة معيّنة ═══
    window.executeTask = async function(taskId) {
      setStatus('⏳ تنفيذ المهمة #' + taskId + '...', '#1e40af');
      try {
        await fetchJson('/tasks/' + taskId + '/execute', { method: 'POST' });
        setStatus('✅ تم تنفيذ المهمة #' + taskId, '#065f46');
        setTimeout(() => setStatus('', 'transparent'), 3000);
        cachedDashboard = null;
        await loadDashboard().catch(() => {});
        await Promise.all([loadLiveLog(), loadTasks()]);
      } catch (e) {
        setStatus('❌ فشل: ' + e.message, '#7f1d1d');
      }
    };

    // ═══ تحميل الكل ═══
    async function loadAll() {
      setStatus('🔄 جاري التحميل...', '#1e40af');
      if (errorBox) errorBox.style.display = 'none';
      cachedDashboard = null;
      try {
        await loadDashboard();
        await Promise.all([loadSystem(), loadAgents(), loadTasks(), loadNotifications(), loadLiveLog()]);
        setStatus('✅ تم تحميل كل البيانات', '#065f46');
        setTimeout(() => setStatus('', 'transparent'), 2500);
      } catch (e) {
        setStatus('❌ فشل التحميل: ' + e.message, '#7f1d1d');
      }
    }

    // ═══ ربط الأزرار ═══
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.onclick = loadAll;

    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.onclick = handleSend;

    const execNowBtn = document.getElementById('exec-now-btn');
    if (execNowBtn) execNowBtn.onclick = runHeartbeatNow;

    // ═══ تحديث تلقائي كل 8 ثوان ═══
    setInterval(async () => {
      cachedDashboard = null;
      await loadDashboard().catch(() => {});
      await Promise.all([loadLiveLog(), loadSystem(), loadAgents(), loadTasks()]);
    }, 8000);

    loadAll();
  } catch (err) {
    setStatus('❌ خطأ: ' + err.message, '#7f1d1d');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}
