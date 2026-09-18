const params = new URLSearchParams(location.search);
const key = params.get('key') || localStorage.getItem('teamKey') || '';
if (key) localStorage.setItem('teamKey', key);
const headers = { 'x-team-key': key, 'content-type': 'application/json' };
const errorBox = document.getElementById('error');

function showError(msg) { errorBox.textContent = msg; errorBox.style.display = 'block'; }

async function fetchJson(path, options = {}) {
  const res = await fetch(path, { headers, ...options });
  if (!res.ok) throw new Error(`${res.status}`);
  return await res.json();
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
  };
});

async function loadSystem() {
  try {
    const data = await fetchJson('/api/dashboard');
    const fin = data.finance || {};
    document.getElementById('system-stats').innerHTML = `
      <div class="stat"><span class="label">الحالة</span><span class="value ok">● نشط</span></div>
      <div class="stat"><span class="label">المشاريع</span><span class="value">${(data.projects || []).length}</span></div>
      <div class="stat"><span class="label">الرصيد المكتسب</span><span class="value">${fin.earned || 0} USD</span></div>
      <div class="stat"><span class="label">Pipeline (محتمل)</span><span class="value warn">${fin.pipeline || 0} USD</span></div>
      <div class="stat"><span class="label">مهام مكتملة</span><span class="value">${fin.completedTasks || 0}</span></div>
      <div class="stat"><span class="label">مهام معلقة</span><span class="value">${fin.pendingTasks || 0}</span></div>
    `;
  } catch (e) {
    document.getElementById('system-stats').innerHTML = '<div class="empty">تعذّر التحميل</div>';
  }
}

async function loadAgents() {
  try {
    const data = await fetchJson('/api/team/agents');
    const agents = data.agents || [];
    document.getElementById('agents-list').innerHTML = agents.length
      ? agents.map(a => `<div class="stat"><span class="label">${a.name || a.id}</span><span class="value ${a.status === 'active' ? 'ok' : 'warn'}">${a.status || 'idle'}</span></div>`).join('')
      : '<div class="empty">لا يوجد وكلاء</div>';
  } catch (e) {
    document.getElementById('agents-list').innerHTML = '<div class="empty">تعذّر التحميل</div>';
  }
}

async function loadMessages() {
  try {
    const data = await fetchJson('/api/team/messages');
    const msgs = data.messages || [];
    document.getElementById('messages-list').innerHTML = msgs.length
      ? msgs.slice(0, 30).map(m => `<div class="item"><div class="meta">${m.sender || '?'} → ${m.recipient || 'all'}</div><div class="body">${(m.body || '').slice(0, 300)}</div></div>`).join('')
      : '<div class="empty">لا توجد رسائل</div>';
  } catch (e) {
    document.getElementById('messages-list').innerHTML = '<div class="empty">تعذّر التحميل</div>';
  }
}

async function loadTasks() {
  try {
    const data = await fetchJson('/api/team/tasks');
    const tasks = data.tasks || [];
    document.getElementById('tasks-list').innerHTML = tasks.length
      ? tasks.slice(0, 30).map(t => `<div class="item"><div class="meta">${t.source || ''} • ${t.status || ''}</div><div class="body">${t.title || ''}</div>${t.reward ? `<div class="ok" style="font-size:13px;margin-top:6px">💰 ${t.reward} ${t.currency || ''} (محتمل)</div>` : ''}</div>`).join('')
      : '<div class="empty">لا توجد مهام</div>';
  } catch (e) {
    document.getElementById('tasks-list').innerHTML = '<div class="empty">تعذّر التحميل</div>';
  }
}

async function loadNotifications() {
  try {
    const data = await fetchJson('/api/notifications');
    const notifs = data.notifications || [];
    document.getElementById('notifications-list').innerHTML = notifs.length
      ? notifs.slice(0, 30).map(n => `<div class="item"><div class="meta">${n.kind || ''}</div><div class="body">${n.title || ''}</div><div style="color:#94a3b8;font-size:13px;margin-top:4px">${(n.body || '').slice(0, 200)}</div></div>`).join('')
      : '<div class="empty">لا توجد إشعارات</div>';
  } catch (e) {
    document.getElementById('notifications-list').innerHTML = '<div class="empty">تعذّر التحميل</div>';
  }
}

async function sendMessage() {
  const recipient = document.getElementById('msg-recipient').value;
  const body = document.getElementById('msg-body').value.trim();
  const status = document.getElementById('send-status');
  if (!body) { status.textContent = '⚠️ اكتب رسالة أولاً'; status.style.color = '#fbbf24'; return; }
  status.textContent = 'جاري الإرسال...';
  status.style.color = '#94a3b8';
  try {
    await fetchJson('/api/team/messages', {
      method: 'POST',
      body: JSON.stringify({ sender: 'leader', recipient, body })
    });
    status.textContent = '✅ تم الإرسال إلى الفريق';
    status.style.color = '#4ade80';
    document.getElementById('msg-body').value = '';
    loadMessages();
  } catch (e) {
    status.textContent = '❌ فشل الإرسال: ' + e.message;
    status.style.color = '#f87171';
  }
}

async function loadAll() {
  errorBox.style.display = 'none';
  await Promise.all([loadSystem(), loadAgents(), loadMessages(), loadTasks(), loadNotifications()]);
}

window.loadAll = loadAll;
window.sendMessage = sendMessage;

if (!key) showError('⚠️ أضف ?key=... إلى الرابط لتفعيل لوحة التحكم');
else loadAll();
