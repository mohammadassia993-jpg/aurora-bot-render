// dashboard.js — Chat-first UI with copy, timers, reset pipeline
(function () {
  'use strict';

  var TEAM_KEY = '8cdQ7WY9SvAGxe6SfFPlngj0_UbX6Cr';
  var STORAGE_KEY = 'sg_current_chat';
  var POLL_INTERVAL = 3000;
  var TIMER_INTERVAL = 1000;

  var currentChatId = localStorage.getItem(STORAGE_KEY) || 'team';
  var currentChatTitle = 'غرفة الفريق';
  var lastMessageId = 0;
  var pollTimer = null;
  var timerTicker = null;
  var cachedMessages = [];
  var workingTimer = null;
  var workingStart = 0;
  var waitingForReply = false;
  var sessions = [];
  var attachedFile = null;
  var panelHistoryPushed = false;

  var $area, $body, $sendBtn, $attachBtn, $fileInput, $sidebar, $sidebarOverlay,
      $chatsListInner, $currentTitle, $statusPill, $statusText, $toast,
      $modal, $modalSheet, $panelOverlay, $panelSheet, $attachPreview,
      $attachName, $attachRemove;

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function api(path, opts) {
    opts = opts || {};
    var url = path;
    if (url.indexOf('?') === -1) url += '?key=' + encodeURIComponent(TEAM_KEY);
    else url += '&key=' + encodeURIComponent(TEAM_KEY);
    var o = { cache: 'no-store' };
    if (opts.method) o.method = opts.method;
    if (opts.body) { o.body = opts.body; o.headers = { 'content-type': 'application/json' }; }
    return fetch(url, o).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function showToast(msg, ms) {
    if (!$toast) return;
    $toast.textContent = msg;
    $toast.classList.add('visible');
    setTimeout(function () { $toast.classList.remove('visible'); }, ms || 2000);
  }

  function normalizeTursoMessages(msgs) {
    var out = [];
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      out.push({
        id: m.id,
        sender: m.role || 'unknown',
        body: m.content || '',
        createdAt: m.created_at || '',
        attachmentName: '',
        attachmentPath: '',
        attachmentType: ''
      });
    }
    return out;
  }

  function formatDuration(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    return m + ':' + String(sec).padStart(2, '0');
  }

  function parseTime(iso) {
    if (!iso) return 0;
    var t = String(iso).trim();
    if (t.indexOf('T') === -1 && t.indexOf(' ') !== -1) {
      t = t.replace(' ', 'T') + 'Z';
    }
    var d = new Date(t);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  // ===== Chat rendering with copy button + timer =====
  function renderMessages(msgs) {
    cachedMessages = msgs || [];
    if (!msgs || !msgs.length) {
      $area.innerHTML = '<div class="empty-state"><div class="big">💬</div><div>ابدأ محادثة جديدة مع الفريق</div></div>';
      return;
    }
    var html = '';
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      var sender = m.sender || 'unknown';
      var cls = sender === 'leader' ? 'leader' : (sender === 'aurora' ? 'aurora' : 'other');
      var body = m.body || '';
      var time = (m.createdAt || '').slice(11, 16) || '';
      var attachHtml = '';
      if (m.attachmentName) {
        var url = m.attachmentPath ? m.attachmentPath : '';
        var isImage = (m.attachmentType || '').indexOf('image/') === 0;
        if (isImage && url) {
          attachHtml = '<div class="attachment" style="padding:0;overflow:hidden;"><img src="' + escapeHtml(url) + '" style="max-width:100%;border-radius:8px;display:block;" /></div>';
        } else {
          attachHtml = '<div class="attachment"><a href="' + escapeHtml(url) + '" target="_blank" style="color:#a78bfa;text-decoration:none;">📎 ' + escapeHtml(m.attachmentName) + '</a></div>';
        }
      }

      // ⬇️ العداد الزمني (فقط لرسائل leader)
      var timerHtml = '';
      if (sender === 'leader') {
        var startTs = parseTime(m.createdAt);
        var endTs = null;
        for (var j = i + 1; j < msgs.length; j++) {
          if (msgs[j].sender === 'aurora') {
            endTs = parseTime(msgs[j].createdAt);
            break;
          }
        }
        if (endTs) {
          timerHtml = '<div class="msg-timer" data-start="' + startTs + '" data-end="' + endTs + '">⏱ ' + formatDuration(endTs - startTs) + ' (منتهي)</div>';
        } else if (startTs) {
          timerHtml = '<div class="msg-timer live" data-start="' + startTs + '" data-end="">⏱ <span class="timer-val">0:00</span> <span style="color:#a78bfa;">(يعمل...)</span></div>';
        }
      }

      var displayName = sender === 'leader' ? 'أنت' : sender;
      html += '<div class="msg ' + cls + '">' +
        '<div class="msg-meta"><span>' + escapeHtml(displayName) + '</span><span>' + escapeHtml(time) + '</span></div>' +
        escapeHtml(body) + attachHtml +
        timerHtml +
        '<div class="msg-actions">' +
          '<button class="msg-copy-btn" data-idx="' + i + '" title="نسخ الرسالة">📋 نسخ</button>' +
        '</div>' +
        '</div>';
    }
    $area.innerHTML = html;
    setTimeout(function () { $area.scrollTop = $area.scrollHeight; }, 50);
    bindMessageButtons();
    updateTimers();
  }

  function bindMessageButtons() {
    var btns = $area.querySelectorAll('.msg-copy-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var idx = Number(btn.getAttribute('data-idx'));
          var m = cachedMessages[idx];
          if (!m) return;
          var text = (m.body || '');
          if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(function () { showToast('تم النسخ'); });
          } else {
            var ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); showToast('تم النسخ'); } catch (e) {}
            document.body.removeChild(ta);
          }
        });
      })(btns[i]);
    }
  }

  function updateTimers() {
    var timers = $area.querySelectorAll('.msg-timer.live');
    for (var i = 0; i < timers.length; i++) {
      var el = timers[i];
      var start = Number(el.getAttribute('data-start'));
      var end = Number(el.getAttribute('data-end'));
      var span = el.querySelector('.timer-val');
      if (!span || !start) continue;
      var elapsed = (end || Date.now()) - start;
      span.textContent = formatDuration(elapsed);
    }
  }

  function startTimerTicker() {
    if (timerTicker) clearInterval(timerTicker);
    timerTicker = setInterval(updateTimers, TIMER_INTERVAL);
  }

  function loadMessages() {
    var tursoUrl = '/api/team/history?session=' + encodeURIComponent(currentChatId) + '&limit=500';
    var sqliteUrl = '/api/team/messages?thread=' + encodeURIComponent(currentChatId) + '&limit=500';

    return Promise.all([
      api(tursoUrl).catch(function () { return { messages: [] }; }),
      api(sqliteUrl).catch(function () { return { messages: [] }; })
    ]).then(function (results) {
      var tursoMsgs = normalizeTursoMessages(results[0].messages || []);
      var sqliteMsgs = results[1].messages || [];

      var seen = {};
      var merged = [];
      for (var i = 0; i < sqliteMsgs.length; i++) {
        var s = sqliteMsgs[i];
        seen['sql-' + s.id] = true;
        merged.push(s);
      }
      for (var j = 0; j < tursoMsgs.length; j++) {
        var t = tursoMsgs[j];
        if (!seen['sql-' + t.id]) {
          merged.push(t);
          seen['sql-' + t.id] = true;
        }
      }
      merged.sort(function (a, b) {
        return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      });

      renderMessages(merged);
      if (merged.length) {
        lastMessageId = Number(merged[merged.length - 1].id) || 0;
      } else {
        lastMessageId = 0;
      }
      if (waitingForReply && merged.length > 1) {
        var last = merged[merged.length - 1];
        if (last.sender === 'aurora') {
          stopWorkingIndicator();
        }
      }
      return merged;
    }).catch(function (e) { console.error('load failed', e); });
  }

  function sendMessage() {
    var text = ($body.value || '').trim();
    if (!text && !attachedFile) return;
    $sendBtn.disabled = true;
    var payload = {
      sender: 'leader',
      recipient: 'all',
      body: text || '(مرفق)',
      thread: currentChatId
    };
    if (attachedFile) {
      payload.attachment = { base64: attachedFile.base64, name: attachedFile.name, type: attachedFile.type };
    }
    api('/api/team/messages', { method: 'POST', body: JSON.stringify(payload) })
      .then(function () {
        $body.value = '';
        $body.style.height = 'auto';
        clearAttachment();
        return loadMessages();
      })
      .then(function () {
        startWorkingIndicator();
        waitingForReply = true;
      })
      .catch(function (e) { showToast('فشل: ' + e.message, 3000); })
      .finally(function () { $sendBtn.disabled = false; });
  }

  function startWorkingIndicator() {
    workingStart = Date.now();
    $statusPill.classList.add('visible');
    updateWorkingText();
    if (workingTimer) clearInterval(workingTimer);
    workingTimer = setInterval(updateWorkingText, 1000);
  }

  function stopWorkingIndicator() {
    if (workingTimer) { clearInterval(workingTimer); workingTimer = null; }
    $statusPill.classList.remove('visible');
    waitingForReply = false;
  }

  function updateWorkingText() {
    var elapsed = Date.now() - workingStart;
    $statusText.textContent = 'الفريق يعمل... ' + formatDuration(elapsed);
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      var url = '/api/team/history?session=' + encodeURIComponent(currentChatId) + '&limit=500';
      api(url).then(function (data) {
        var tursoMsgs = normalizeTursoMessages(data.messages || []);
        if (!tursoMsgs.length) return;
        tursoMsgs.sort(function (a, b) {
          return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
        });
        var newLast = Number(tursoMsgs[tursoMsgs.length - 1].id) || 0;
        if (newLast !== lastMessageId) {
          loadMessages().then(function () {
            if (waitingForReply && tursoMsgs.length > 1) {
              var last = tursoMsgs[tursoMsgs.length - 1];
              if (last.sender === 'aurora') stopWorkingIndicator();
            }
          });
        }
      }).catch(function () {});
    }, POLL_INTERVAL);
  }

  function loadSessions() {
    return api('/api/team/sessions').then(function (data) {
      sessions = data.sessions || [];
      renderSessions();
      return sessions;
    }).catch(function () {
      $chatsListInner.innerHTML = '<div class="empty-state">تعذر التحميل</div>';
    });
  }

  function renderSessions() {
    if (!sessions.length) {
      $chatsListInner.innerHTML = '<div class="empty-state">لا محادثات</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      var isActive = s.id === currentChatId;
      html += '<div class="chat-item' + (isActive ? ' active' : '') + '" data-id="' + escapeHtml(s.id) + '">' +
        '<div class="chat-info">' +
          '<div class="chat-title">' + escapeHtml(s.title || s.id) + '</div>' +
          '<div class="chat-sub">' + Number(s.cnt || 0) + ' رسالة · ' + escapeHtml((s.last_at || '').slice(0, 16)) + '</div>' +
        '</div>' +
        '<button class="menu-btn" data-menu="' + escapeHtml(s.id) + '">⋮</button>' +
        '</div>';
    }
    $chatsListInner.innerHTML = html;

    var items = $chatsListInner.querySelectorAll('.chat-item');
    for (var j = 0; j < items.length; j++) {
      (function (el) {
        el.addEventListener('click', function (ev) {
          if (ev.target.closest('.menu-btn')) return;
          openChat(el.getAttribute('data-id'));
        });
      })(items[j]);
    }
    var menus = $chatsListInner.querySelectorAll('.menu-btn');
    for (var k = 0; k < menus.length; k++) {
      (function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          openChatMenu(btn.getAttribute('data-menu'));
        });
      })(menus[k]);
    }
  }

  function openChat(id) {
    currentChatId = id;
    localStorage.setItem(STORAGE_KEY, id);
    var found = null;
    for (var i = 0; i < sessions.length; i++) if (sessions[i].id === id) found = sessions[i];
    currentChatTitle = (found && found.title) || id;
    $currentTitle.textContent = currentChatTitle;
    closeSidebar();
    lastMessageId = 0;
    stopWorkingIndicator();
    $area.innerHTML = '<div class="empty-state"><div class="big">💬</div><div>جاري التحميل...</div></div>';
    loadMessages();
  }

  function openChatMenu(id) {
    showModal([
      { label: '✏️ إعادة تسمية', action: function () { promptRename(id); } },
      { label: '🗑️ حذف', danger: true, action: function () { confirmDelete(id); } },
      { label: 'إلغاء', cancel: true }
    ]);
  }

  function promptRename(id) {
    var current = '';
    for (var i = 0; i < sessions.length; i++) if (sessions[i].id === id) current = sessions[i].title || id;
    showPrompt('إعادة تسمية المحادثة', current, function (newTitle) {
      api('/api/team/sessions/rename', { method: 'POST', body: JSON.stringify({ session_id: id, title: newTitle }) })
        .then(function () {
          showToast('تم التحديث');
          if (id === currentChatId) { currentChatTitle = newTitle; $currentTitle.textContent = newTitle; }
          loadSessions();
        })
        .catch(function (e) { showToast('فشل: ' + e.message, 2500); });
    });
  }

  function confirmDelete(id) {
    showModal([
      { label: 'تأكيد حذف المحادثة نهائياً؟', danger: true, action: function () {
        api('/api/team/sessions/delete', { method: 'POST', body: JSON.stringify({ session_id: id }) })
          .then(function () {
            showToast('تم الحذف');
            if (id === currentChatId) {
              currentChatId = 'team';
              localStorage.setItem(STORAGE_KEY, 'team');
              currentChatTitle = 'غرفة الفريق';
              $currentTitle.textContent = currentChatTitle;
              lastMessageId = 0;
              loadMessages();
            }
            loadSessions();
          })
          .catch(function (e) { showToast('فشل: ' + e.message, 2500); });
      }},
      { label: 'إلغاء', cancel: true }
    ]);
  }

  function createNewChat() {
    api('/api/team/sessions/new', { method: 'POST', body: JSON.stringify({ title: 'محادثة ' + new Date().toLocaleString('ar-EG') }) })
      .then(function (data) {
        currentChatId = data.session_id;
        localStorage.setItem(STORAGE_KEY, currentChatId);
        currentChatTitle = data.title;
        $currentTitle.textContent = currentChatTitle;
        $area.innerHTML = '<div class="empty-state"><div class="big">💬</div><div>محادثة جديدة</div></div>';
        closeSidebar();
        loadSessions();
        setTimeout(function () { $body.focus(); }, 100);
      })
      .catch(function (e) { showToast('فشل: ' + e.message, 2500); });
  }

  function openSidebar() {
    $sidebar.classList.add('open');
    $sidebarOverlay.classList.add('open');
    loadSessions();
  }
  function closeSidebar() {
    $sidebar.classList.remove('open');
    $sidebarOverlay.classList.remove('open');
  }

  function openChatOptions() {
    showModal([
      { label: '📋 نسخ المحادثة', action: copyChat },
      { label: '📤 مشاركة', action: shareChat },
      { label: '🗑️ حذف كل الرسائل', danger: true, action: deleteChatMessages },
      { label: 'إلغاء', cancel: true }
    ]);
  }

  function copyChat() {
    var url = '/api/team/history?session=' + encodeURIComponent(currentChatId) + '&limit=500';
    api(url).then(function (data) {
      var msgs = normalizeTursoMessages(data.messages || []);
      msgs.reverse();
      var text = msgs.map(function (m) {
        return '[' + (m.sender === 'leader' ? 'أنا' : m.sender) + ']: ' + (m.body || '');
      }).join('\n\n');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () { showToast('تم النسخ'); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); showToast('تم النسخ'); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
  }

  function shareChat() {
    var url = location.origin + '/?chat=' + encodeURIComponent(currentChatId);
    if (navigator.share) {
      navigator.share({ title: currentChatTitle, url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { showToast('تم نسخ الرابط'); });
    } else {
      showToast(url, 3000);
    }
  }

  function deleteChatMessages() {
    showModal([
      { label: 'حذف كل رسائل هذه المحادثة؟', danger: true, action: function () {
        api('/api/team/sessions/delete', { method: 'POST', body: JSON.stringify({ session_id: currentChatId }) })
          .then(function () {
            $area.innerHTML = '<div class="empty-state"><div class="big">💬</div><div>تم الحذف</div></div>';
            lastMessageId = 0;
            showToast('تم الحذف');
            loadSessions();
          })
          .catch(function (e) { showToast('فشل: ' + e.message, 2500); });
      }},
      { label: 'إلغاء', cancel: true }
    ]);
  }

  function showModal(items) {
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var cls = 'modal-item' + (it.danger ? ' danger' : '') + (it.cancel ? ' cancel' : '');
      html += '<div class="' + cls + '" data-idx="' + i + '">' + escapeHtml(it.label) + '</div>';
    }
    $modalSheet.innerHTML = html;
    $modal.classList.add('open');
    var nodes = $modalSheet.querySelectorAll('.modal-item');
    for (var j = 0; j < nodes.length; j++) {
      (function (node) {
        node.addEventListener('click', function () {
          closeModal();
          var idx = Number(node.getAttribute('data-idx'));
          var item = items[idx];
          if (item && typeof item.action === 'function') setTimeout(item.action, 100);
        });
      })(nodes[j]);
    }
  }

  function closeModal() { $modal.classList.remove('open'); }

  function showPrompt(title, defaultValue, onOk) {
    $modalSheet.innerHTML =
      '<div style="padding:16px 20px 8px;color:#a78bfa;font-weight:600;">' + escapeHtml(title) + '</div>' +
      '<div class="modal-input-wrap"><input id="prompt-input" value="' + escapeHtml(defaultValue || '') + '" /></div>' +
      '<div class="modal-item" id="prompt-ok" style="color:#34d399;justify-content:center;font-weight:600;">حفظ</div>' +
      '<div class="modal-item cancel" id="prompt-cancel">إلغاء</div>';
    $modal.classList.add('open');
    var input = document.getElementById('prompt-input');
    setTimeout(function () { if (input) { input.focus(); input.select(); } }, 100);
    document.getElementById('prompt-ok').addEventListener('click', function () {
      var v = (input.value || '').trim();
      closeModal();
      if (v) onOk(v);
    });
    document.getElementById('prompt-cancel').addEventListener('click', closeModal);
  }

  function openAttachMenu() {
    showModal([
      { label: '🖼️ الصور', action: function () { openFilePicker('image/*'); } },
      { label: '🎥 الفيديو', action: function () { openFilePicker('video/*'); } },
      { label: '📁 الملفات', action: function () { openFilePicker('*/*'); } },
      { label: 'إلغاء', cancel: true }
    ]);
  }

  function openFilePicker(accept) {
    if (!$fileInput) return;
    $fileInput.setAttribute('accept', accept);
    $fileInput.click();
  }

  function handleFile(ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    var limit = 20 * 1024 * 1024;
    if (f.size > limit) { showToast('الحد الأقصى 20 ميغا', 2500); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      var base64 = String(dataUrl).split(',')[1];
      attachedFile = { base64: base64, name: f.name, type: f.type || 'application/octet-stream' };
      $attachName.textContent = f.name;
      $attachPreview.classList.add('visible');
    };
    reader.readAsDataURL(f);
    ev.target.value = '';
  }

  function clearAttachment() {
    attachedFile = null;
    $attachPreview.classList.remove('visible');
    $attachName.textContent = '';
  }

  function openPanel(tab) {
    closeSidebar();
    if (tab === 'main') { showDashboardPanel(); return; }
    if (tab === 'notifications') { showNotificationsPanel(); return; }
    if (tab === 'wallets') { location.href = '/wallets.html'; return; }
    if (tab === 'ai-usage') { location.href = '/ai-usage'; return; }
    if (tab === 'observability') { location.href = '/observability'; return; }
  }

  function preparePanel() {
    $panelSheet.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #334155;position:sticky;top:0;background:#1e293b;border-radius:16px 16px 0 0;z-index:1;">' +
        '<div style="color:#a78bfa;font-weight:600;font-size:15px;" id="panel-title"></div>' +
        '<button id="panel-close" style="background:none;border:none;color:#94a3b8;font-size:26px;cursor:pointer;padding:0 6px;">×</button>' +
      '</div>' +
      '<div id="panel-content" style="padding:16px;"></div>';
    $panelOverlay.classList.add('open');
    var closeBtn = document.getElementById('panel-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { closePanel(true); });
    if (!panelHistoryPushed) {
      panelHistoryPushed = true;
      try { history.pushState({ panel: true }, ''); } catch (e) {}
    }
  }

  function closePanel(useHistory) {
    $panelOverlay.classList.remove('open');
    if (useHistory && panelHistoryPushed) {
      panelHistoryPushed = false;
      try { history.back(); } catch (e) {}
    }
  }

  function statBox(label, value) {
    return '<div style="padding:12px;background:#0f172a;border-radius:10px;border:1px solid #334155;"><div style="color:#94a3b8;font-size:11px;margin-bottom:4px;">' + escapeHtml(label) + '</div><div style="color:#e0e7ff;font-weight:600;">' + escapeHtml(value) + '</div></div>';
  }

  function showDashboardPanel() {
    preparePanel();
    var t = document.getElementById('panel-title');
    var c = document.getElementById('panel-content');
    if (t) t.textContent = '📊 حالة النظام';
    if (c) c.innerHTML = '<div class="empty-state">جاري التحميل...</div>';

    api('/api/dashboard').then(function (d) {
      var fin = d.finance || {};
      var agents = d.agents || [];
      var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">';
      html += statBox('الحالة', 'نشط');
      html += statBox('الرصيد', 'USD ' + (fin.earned || 0));
      html += statBox('Pipeline', 'USD ' + (fin.pipeline || 0));
      html += statBox('مهام مكتملة', String(fin.completedTasks || 0));
      html += '</div>';
      html += '<button id="reset-pipeline-btn" style="width:100%;padding:10px;background:#7f1d1d;color:#fecaca;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:16px;">🔄 إعادة تعيين Pipeline إلى 0</button>';
      html += '<h3 style="color:#a78bfa;margin-bottom:12px;">👥 الوكلاء</h3>';
      for (var i = 0; i < agents.length; i++) {
        html += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #334155;"><span>' + escapeHtml(agents[i].name) + '</span><span style="color:#34d399;">' + escapeHtml(agents[i].status || 'idle') + '</span></div>';
      }
      if (c) c.innerHTML = html;

      var resetBtn = document.getElementById('reset-pipeline-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          if (!confirm('سيتم تصفير قيمة Pipeline (لن تُحذف أي مهام). متابعة؟')) return;
          api('/api/admin/reset-pipeline', { method: 'POST' })
            .then(function () {
              showToast('تم إعادة التعيين ✅');
              setTimeout(showDashboardPanel, 800);
            })
            .catch(function (e) { showToast('فشل: ' + e.message, 3000); });
        });
      }
    }).catch(function () { if (c) c.innerHTML = '<div class="empty-state">تعذر التحميل</div>'; });
  }

  function showNotificationsPanel() {
    preparePanel();
    var t = document.getElementById('panel-title');
    var c = document.getElementById('panel-content');
    if (t) t.textContent = '🔔 الإشعارات';
    if (c) c.innerHTML = '<div class="empty-state">جاري التحميل...</div>';
    api('/api/notifications').then(function (d) {
      var items = d.notifications || [];
      var html = '';
      if (!items.length) html = '<div class="empty-state">لا إشعارات</div>';
      for (var i = 0; i < items.length && i < 50; i++) {
        var n = items[i];
        html += '<div style="padding:10px;background:#0f172a;border-radius:8px;margin-bottom:8px;"><div style="color:#a78bfa;font-size:11px;">' + escapeHtml(n.kind || '') + '</div><div>' + escapeHtml(n.title || '') + '</div></div>';
      }
      if (c) c.innerHTML = html;
    });
  }

  function init() {
    $area = $('chat-area');
    $body = $('msg-body');
    $sendBtn = $('send-btn');
    $attachBtn = $('attach-btn');
    $fileInput = $('file-input');
    $sidebar = $('sidebar');
    $sidebarOverlay = $('sidebar-overlay');
    $chatsListInner = $('chats-list-inner');
    $currentTitle = $('current-chat-title');
    $statusPill = $('status-pill');
    $statusText = $('status-text');
    $toast = $('toast');
    $modal = $('modal-overlay');
    $modalSheet = $('modal-sheet');
    $panelOverlay = $('panel-overlay');
    $panelSheet = $('panel-sheet');
    $attachPreview = $('attachment-preview');
    $attachName = $('attachment-name');
    $attachRemove = $('attachment-remove');

    var listBtn = $('chats-list-btn');
    if (listBtn) listBtn.addEventListener('click', openSidebar);
    var sideClose = $('sidebar-close');
    if (sideClose) sideClose.addEventListener('click', closeSidebar);
    if ($sidebarOverlay) $sidebarOverlay.addEventListener('click', closeSidebar);
    var newBtn = $('new-chat-btn');
    if (newBtn) newBtn.addEventListener('click', createNewChat);
    var menuBtn = $('chat-menu-btn');
    if (menuBtn) menuBtn.addEventListener('click', openChatOptions);
    if ($sendBtn) $sendBtn.addEventListener('click', sendMessage);
    if ($attachBtn) $attachBtn.addEventListener('click', openAttachMenu);
    if ($fileInput) $fileInput.addEventListener('change', handleFile);
    if ($attachRemove) $attachRemove.addEventListener('click', clearAttachment);

    if ($body) {
      $body.addEventListener('input', function () {
        $body.style.height = 'auto';
        $body.style.height = Math.min($body.scrollHeight, 120) + 'px';
      });
      $body.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          sendMessage();
        }
      });
    }

    var tabs = document.querySelectorAll('#sidebar-tabs .tab');
    for (var i = 0; i < tabs.length; i++) {
      (function (t) {
        t.addEventListener('click', function () { openPanel(t.getAttribute('data-tab')); });
      })(tabs[i]);
    }

    window.addEventListener('popstate', function () {
      if ($panelOverlay && $panelOverlay.classList.contains('open')) {
        panelHistoryPushed = false;
        $panelOverlay.classList.remove('open');
        return;
      }
      if ($sidebar && $sidebar.classList.contains('open')) { closeSidebar(); return; }
      if ($modal && $modal.classList.contains('open')) { closeModal(); return; }
    });

    if ($panelOverlay) {
      $panelOverlay.addEventListener('click', function (ev) {
        if (ev.target === $panelOverlay) closePanel(true);
      });
    }

    $currentTitle.textContent = currentChatTitle;
    loadMessages();
    loadSessions();
    startPolling();
    startTimerTicker();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
