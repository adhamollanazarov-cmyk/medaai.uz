(() => {
  const tg = window.Telegram?.WebApp;
  if (tg) { tg.ready(); tg.expand(); }

  const params = new URLSearchParams(location.search);
  const state = {
    lang: params.get('lang') || tg?.initDataUnsafe?.user?.language_code?.startsWith('uz') ? 'uz' : (params.get('lang') === 'uz' ? 'uz' : 'ru'),
    tab: 'find',
    screen: 'input',
    text: '',
    match: null,
    doctor: null,
    slot: null,
    appointment: null,
    // AI consultation tab: full transcript is kept client-side and posted back
    // each turn, so the API stays stateless.
    chat: { messages: [], busy: false, result: null },
    chatEnabled: false,
  };
  if (params.get('lang') === 'ru') state.lang = 'ru';

  const user = tg?.initDataUnsafe?.user || null;
  const tgId = user?.id || getDemoId();
  const fullName = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : '';

  const view = document.getElementById('view');
  const T = () => window.I18N[state.lang];

  function getDemoId() {
    try {
      let id = localStorage.getItem('meda_demo_id');
      if (!id) { id = 'demo-' + Math.random().toString(36).slice(2, 9); localStorage.setItem('meda_demo_id', id); }
      return id;
    } catch { return 'demo-anon'; }
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('api'), { status: res.status, data });
    return data;
  }

  // ---------- formatting ----------
  const money = (n) => new Intl.NumberFormat(state.lang === 'uz' ? 'uz-UZ' : 'ru-RU').format(n);
  const initials = (name) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarColor = (name) => {
    const colors = ['#2b7cff', '#17b978', '#f5a623', '#e5484d', '#8b5cf6', '#0ea5e9', '#ec4899'];
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return colors[h % colors.length];
  };
  const dayLabel = (iso) => new Date(iso).toLocaleDateString(state.lang === 'uz' ? 'uz-UZ' : 'ru-RU',
    { weekday: 'long', day: 'numeric', month: 'long' });
  const timeLabel = (iso) => new Date(iso).toLocaleTimeString(state.lang === 'uz' ? 'uz-UZ' : 'ru-RU',
    { hour: '2-digit', minute: '2-digit' });
  const dateTimeLabel = (iso) => new Date(iso).toLocaleString(state.lang === 'uz' ? 'uz-UZ' : 'ru-RU',
    { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  function haptic(type = 'light') { try { tg?.HapticFeedback?.impactOccurred(type); } catch {} }
  function toast(msg) { try { tg?.showAlert(msg); } catch { alert(msg); } }

  // ---------- doctor card ----------
  function doctorCardHTML(d) {
    const t = T();
    return `<div class="card">
      <div class="doctor">
        <div class="avatar" style="background:${avatarColor(d.name)}">${initials(d.name)}</div>
        <div class="info">
          <div class="name">${d.name}</div>
          <div class="meta">${d.specialtyName} · ${d.experienceYears} ${t.years} · <span class="rating">★ ${d.rating}</span></div>
          <div class="clinic">🏥 ${d.clinic.name}</div>
        </div>
      </div>
      <div class="row">
        <div>
          <div class="price">${t.from ? t.from + ' ' : ''}${money(d.priceUZS)} ${t.sum}</div>
          ${d.nextSlot ? `<div class="next">${t.nextSlot}: ${dateTimeLabel(d.nextSlot)}</div>` : `<div class="muted">${t.noSlots}</div>`}
        </div>
        <button class="btn" style="width:auto;padding:11px 18px" data-book="${d.id}" ${d.nextSlot ? '' : 'disabled'}>${t.book}</button>
      </div>
    </div>`;
  }

  // ---------- screens ----------
  function renderInput() {
    const t = T();
    view.innerHTML = `
      <h1>${t.greeting}</h1>
      <p class="subtitle">${t.subtitle}</p>
      <textarea id="symptoms" placeholder="${t.placeholder}">${escapeHtml(state.text)}</textarea>
      <div class="chips">${t.quick.map((q) => `<div class="chip" data-chip="${escapeAttr(q)}">${q}</div>`).join('')}</div>
      <button class="btn" id="analyze">${t.analyze}</button>`;

    const ta = document.getElementById('symptoms');
    ta.addEventListener('input', () => { state.text = ta.value; });
    view.querySelectorAll('[data-chip]').forEach((el) =>
      el.addEventListener('click', () => { ta.value = el.dataset.chip; state.text = el.dataset.chip; haptic(); }));
    document.getElementById('analyze').addEventListener('click', analyze);
  }

  async function analyze() {
    const t = T();
    if (!state.text.trim()) { toast(t.placeholder); return; }
    const btn = document.getElementById('analyze');
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${t.analyzing}`;
    try {
      state.match = await api('/api/match', { method: 'POST', body: { text: state.text, lang: state.lang, tgId } });
      state.screen = 'match';
      render();
    } catch (e) {
      toast(t.errGeneric);
      btn.disabled = false; btn.textContent = t.analyze;
    }
  }

  function renderMatch() {
    const t = T(); const m = state.match;
    const pct = Math.round((m.confidence || 0) * 100);
    const alts = (m.alternatives || []).map((a) => a.name).join(', ');
    view.innerHTML = `
      <button class="btn ghost" id="back" style="text-align:left;padding:6px 0">← ${t.back}</button>
      <div class="section-title">${t.recommended}</div>
      <div class="card reco">
        <div class="spec">${m.name}</div>
        <div class="reason">${escapeHtml(m.reason || '')}</div>
        <div class="conf">${pct}% ${t.confidence}</div>
        <div class="conf-bar"><i style="width:${pct}%"></i></div>
        ${alts ? `<div class="reason" style="margin-top:10px">${t.alsoConsider}: ${alts}</div>` : ''}
      </div>
      <div class="section-title">${t.doctorsTitle}</div>
      <div id="doclist">${(m.doctors || []).length ? m.doctors.map(doctorCardHTML).join('') : `<div class="card muted">${t.noDoctors}</div>`}</div>`;

    document.getElementById('back').addEventListener('click', () => { state.screen = 'input'; render(); });
    bindBookButtons(m.doctors || []);
  }

  function bindBookButtons(doctors) {
    view.querySelectorAll('[data-book]').forEach((btn) =>
      btn.addEventListener('click', () => {
        state.doctor = doctors.find((d) => String(d.id) === btn.dataset.book);
        state.slot = null;
        state.screen = 'slots';
        haptic();
        render();
      }));
  }

  async function renderSlots() {
    const t = T(); const d = state.doctor;
    view.innerHTML = `
      <button class="btn ghost" id="back" style="text-align:left;padding:6px 0">← ${t.back}</button>
      <div class="card">
        <div class="doctor">
          <div class="avatar" style="background:${avatarColor(d.name)}">${initials(d.name)}</div>
          <div class="info">
            <div class="name">${d.name}</div>
            <div class="meta">${d.specialtyName} · <span class="rating">★ ${d.rating}</span></div>
            <div class="clinic">🏥 ${d.clinic.name}</div>
          </div>
        </div>
      </div>
      <div class="section-title">${t.chooseTime}</div>
      <div id="slotwrap" class="muted">…</div>`;
    document.getElementById('back').addEventListener('click', () => { state.screen = 'match'; render(); });

    try {
      const slots = await api(`/api/doctors/${d.id}/slots`);
      const wrap = document.getElementById('slotwrap');
      if (!slots.length) { wrap.textContent = t.noSlots; return; }
      const byDay = {};
      slots.forEach((s) => { const k = s.datetime.slice(0, 10); (byDay[k] ||= []).push(s); });
      wrap.className = '';
      wrap.innerHTML = Object.entries(byDay).map(([k, arr]) => `
        <div class="day-title">${dayLabel(arr[0].datetime)}</div>
        <div class="slots">${arr.map((s) => `<div class="slot" data-slot="${s.id}" data-iso="${s.datetime}">${timeLabel(s.datetime)}</div>`).join('')}</div>
      `).join('');
      wrap.querySelectorAll('[data-slot]').forEach((el) =>
        el.addEventListener('click', () => {
          state.slot = { id: Number(el.dataset.slot), datetime: el.dataset.iso };
          state.screen = 'booking';
          haptic('medium');
          render();
        }));
    } catch { document.getElementById('slotwrap').textContent = t.errGeneric; }
  }

  function renderBooking() {
    const t = T(); const d = state.doctor; const s = state.slot;
    view.innerHTML = `
      <button class="btn ghost" id="back" style="text-align:left;padding:6px 0">← ${t.back}</button>
      <div class="section-title">${t.booking}</div>
      <div class="card">
        <div class="name" style="font-weight:700">${d.name}</div>
        <div class="meta muted">${d.specialtyName} · 🏥 ${d.clinic.name}</div>
        <div class="row"><span class="next">🗓 ${dateTimeLabel(s.datetime)}</span><span class="price">${money(d.priceUZS)} ${t.sum}</span></div>
      </div>
      <label>${t.yourName}</label>
      <input type="text" id="name" value="${escapeAttr(fullName)}" placeholder="${t.yourName}" />
      <label>${t.phone}</label>
      <input type="tel" id="phone" placeholder="${t.phoneHint}" value="+998 " />
      <label>${t.symptomsLabel}</label>
      <input type="text" id="sym" value="${escapeAttr(state.text)}" />
      <div style="height:14px"></div>
      <button class="btn" id="confirm">${t.confirm}</button>`;
    document.getElementById('back').addEventListener('click', () => { state.screen = 'slots'; render(); });
    document.getElementById('confirm').addEventListener('click', confirmBooking);
  }

  async function confirmBooking() {
    const t = T();
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const sym = document.getElementById('sym').value.trim();
    if (phone.replace(/\D/g, '').length < 9) { toast(t.errPhone); return; }
    const btn = document.getElementById('confirm');
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try {
      const r = await api('/api/appointments', { method: 'POST', body: {
        doctorId: state.doctor.id, slotId: state.slot.id, tgId, name, phone, symptoms: sym, lang: state.lang, matchEventId: state.match && state.match.matchEventId,
      }});
      state.appointment = r.appointment;
      state.screen = 'success';
      haptic('heavy');
      render();
    } catch (e) {
      toast(e.status === 409 ? t.slotTaken : t.errGeneric);
      btn.disabled = false; btn.textContent = t.confirm;
    }
  }

  function renderSuccess() {
    const t = T();
    view.innerHTML = `
      <div class="success">
        <div class="big">✅</div>
        <h2>${t.booked}</h2>
        <p>${t.bookedText}</p>
      </div>
      <button class="btn secondary" id="tomine">${t.tabMine}</button>
      <div style="height:10px"></div>
      <button class="btn ghost" id="home">${t.close}</button>`;
    document.getElementById('tomine').addEventListener('click', () => { switchTab('mine'); });
    document.getElementById('home').addEventListener('click', () => { resetFind(); switchTab('find'); });
  }

  async function renderMine() {
    const t = T();
    view.innerHTML = `<h1>${t.tabMine}</h1><div id="mylist" class="muted">…</div>`;
    try {
      const list = await api(`/api/appointments?tgId=${encodeURIComponent(tgId)}&lang=${state.lang}`);
      const el = document.getElementById('mylist');
      if (!list.length) { el.textContent = t.myEmpty; return; }
      el.className = '';
      el.innerHTML = list.map((a) => {
        const statusKey = { confirmed: 'statusConfirmed', cancelled: 'statusCancelled', completed: 'statusCompleted', no_show: 'statusNoShow' }[a.status] || 'statusConfirmed';
        const canCancel = a.status === 'confirmed' && new Date(a.datetime) > new Date();
        return `<div class="card">
          <div class="row" style="margin-top:0">
            <span class="badge ${a.status}">${t[statusKey]}</span>
            <span class="price">${money(a.priceUZS)} ${t.sum}</span>
          </div>
          <div class="name" style="font-weight:700;margin-top:8px">${a.doctor}</div>
          <div class="muted">${a.specialtyName} · 🏥 ${a.clinic.name}</div>
          <div class="next" style="margin-top:6px">🗓 ${dateTimeLabel(a.datetime)}</div>
          ${canCancel ? `<div style="margin-top:8px"><button class="btn danger" style="text-align:left;padding:4px 0" data-cancel="${a.id}">${t.cancel}</button></div>` : ''}
        </div>`;
      }).join('');
      el.querySelectorAll('[data-cancel]').forEach((b) =>
        b.addEventListener('click', () => cancelAppt(b.dataset.cancel)));
    } catch { document.getElementById('mylist').textContent = t.errGeneric; }
  }

  function cancelAppt(id) {
    const t = T();
    const go = async () => {
      try { await api(`/api/appointments/${id}/cancel`, { method: 'POST', body: {} }); renderMine(); }
      catch { toast(t.errGeneric); }
    };
    if (tg?.showConfirm) tg.showConfirm(t.cancelConfirm, (ok) => ok && go());
    else if (confirm(t.cancelConfirm)) go();
  }

  // ---------- AI consultation ----------
  function renderChat() {
    const t = T(); const c = state.chat;
    const bubbles = c.messages.map((m) => `
      <div class="bubble ${m.role}">${escapeHtml(m.content).replace(/\n/g, '<br>')}</div>`).join('');
    const docs = c.result && c.result.doctors && c.result.doctors.length
      ? `<div class="section-title">${t.chatResult}: ${c.result.name}</div>
         <div id="chatdocs">${c.result.doctors.map(doctorCardHTML).join('')}</div>`
      : '';

    view.innerHTML = `
      <h1>${t.chatTitle}</h1>
      <p class="subtitle">${c.messages.length ? t.chatDisclaimer : t.chatIntro}</p>
      <div class="chat-log" id="chatlog">
        ${bubbles}
        ${c.busy ? `<div class="bubble assistant muted"><span class="spinner"></span> ${t.chatThinking}</div>` : ''}
      </div>
      ${docs}
      ${c.result ? `<button class="btn ghost" id="chatrestart">${t.chatRestart}</button>` : `
      <div class="chat-input">
        <textarea id="chatmsg" rows="2" placeholder="${t.chatPlaceholder}" ${c.busy ? 'disabled' : ''}></textarea>
        <button class="btn" id="chatsend" ${c.busy ? 'disabled' : ''}>${t.chatSend}</button>
      </div>`}`;

    const log = document.getElementById('chatlog');
    if (log) log.scrollTop = log.scrollHeight;

    const restart = document.getElementById('chatrestart');
    if (restart) restart.addEventListener('click', () => {
      state.chat = { messages: [], busy: false, result: null };
      haptic(); renderChat();
    });

    const send = document.getElementById('chatsend');
    const box = document.getElementById('chatmsg');
    if (send && box) {
      send.addEventListener('click', () => sendChat(box.value));
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(box.value); }
      });
      if (!c.busy) box.focus();
    }

    // Booking from the chat reuses the existing slots → booking flow: we just
    // seed the "find" tab with the chat's recommendation and jump into it.
    if (c.result) {
      view.querySelectorAll('[data-book]').forEach((btn) =>
        btn.addEventListener('click', () => {
          state.match = c.result;
          state.doctor = c.result.doctors.find((d) => String(d.id) === btn.dataset.book);
          state.text = c.messages.find((m) => m.role === 'user')?.content || state.text;
          state.slot = null;
          state.screen = 'slots';
          haptic();
          switchTab('find');
        }));
    }
  }

  async function sendChat(raw) {
    const t = T();
    const text = String(raw || '').trim();
    if (!text || state.chat.busy) return;
    state.chat.messages.push({ role: 'user', content: text });
    state.chat.busy = true;
    haptic();
    renderChat();
    try {
      const r = await api('/api/chat', { method: 'POST', body: {
        history: state.chat.messages, lang: state.lang, tgId,
      }});
      state.chat.busy = false;
      if (r.reply) state.chat.messages.push({ role: 'assistant', content: r.reply });
      if (r.done && r.specialty) { state.chat.result = r; haptic('medium'); }
    } catch {
      state.chat.busy = false;
      toast(t.errGeneric);
    }
    renderChat();
  }

  // ---------- shell ----------
  function resetFind() { state.screen = 'input'; state.match = null; state.doctor = null; state.slot = null; }

  function render() {
    if (state.tab === 'mine') return renderMine();
    if (state.tab === 'chat') return renderChat();
    switch (state.screen) {
      case 'match': return renderMatch();
      case 'slots': return renderSlots();
      case 'booking': return renderBooking();
      case 'success': return renderSuccess();
      default: return renderInput();
    }
  }

  function switchTab(tab) {
    state.tab = tab;
    document.getElementById('tab-find').classList.toggle('active', tab === 'find');
    document.getElementById('tab-chat').classList.toggle('active', tab === 'chat');
    document.getElementById('tab-mine').classList.toggle('active', tab === 'mine');
    render();
  }

  function applyLang() {
    const t = T();
    document.documentElement.lang = state.lang;
    document.querySelector('.tl-find').textContent = t.tabFind;
    document.querySelector('.tl-chat').textContent = t.tabChat;
    document.querySelector('.tl-mine').textContent = t.tabMine;
    document.getElementById('lng-ru').classList.toggle('active', state.lang === 'ru');
    document.getElementById('lng-uz').classList.toggle('active', state.lang === 'uz');
  }

  function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

  // ---------- init ----------
  document.querySelectorAll('.lang-toggle button').forEach((b) =>
    b.addEventListener('click', () => { state.lang = b.dataset.lang; applyLang(); render(); }));
  document.getElementById('tab-find').addEventListener('click', () => { if (state.tab !== 'find') switchTab('find'); });
  document.getElementById('tab-chat').addEventListener('click', () => { if (state.tab !== 'chat') switchTab('chat'); });
  document.getElementById('tab-mine').addEventListener('click', () => switchTab('mine'));

  // The chat tab needs an LLM key to be useful — ask the API and reveal it only
  // if one is configured. Rule-based /api/match keeps working either way.
  api('/api/chat/status')
    .then((s) => { state.chatEnabled = !!s.llm; if (s.llm) document.getElementById('tab-chat').hidden = false; })
    .catch(() => {});

  applyLang();
  switchTab('find');
})();
