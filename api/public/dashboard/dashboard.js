(() => {
  const L = {
    ru: {
      hdrSub: 'кабинет клиники', logout: 'Выйти',
      lTitle: 'Вход в кабинет', lSub: 'Введите код доступа клиники', lCode: 'Код доступа',
      lClinic: 'Клиника', login: 'Войти', badToken: 'Неверный код доступа',
      statToday: 'Сегодня', statConfirmed: 'Подтверждено', statDone: 'Завершено',
      statNoShow: 'Неявка', statCancelled: 'Отменено', statDoctors: 'Врачей',
      appts: 'Записи', slotsTitle: 'Добавить приёмное время', addSlot: 'Добавить слот',
      doctors: 'Врачи', slotAdded: 'Слот добавлен ✓', slotErr: 'Укажите врача и время',
      colTime: 'Время', colPatient: 'Пациент', colPhone: 'Телефон', colDoctor: 'Врач',
      colReason: 'Причина', colStatus: 'Статус', colActions: 'Действия',
      colName: 'Врач', colSpec: 'Специальность', colExp: 'Опыт', colPrice: 'Цена', colFree: 'Свободно',
      done: 'Пришёл', noShow: 'Неявка', cancel: 'Отменить', empty: 'Записей пока нет',
      confirmed: 'Подтверждена', cancelled: 'Отменена', completed: 'Завершена', no_show: 'Неявка',
      years: 'лет', sum: 'сум', slots: 'слотов',
    },
    uz: {
      hdrSub: 'klinika kabineti', logout: 'Chiqish',
      lTitle: 'Kabinetga kirish', lSub: 'Klinika kirish kodini kiriting', lCode: 'Kirish kodi',
      lClinic: 'Klinika', login: 'Kirish', badToken: 'Kod notoʻgʻri',
      statToday: 'Bugun', statConfirmed: 'Tasdiqlangan', statDone: 'Yakunlangan',
      statNoShow: 'Kelmadi', statCancelled: 'Bekor qilingan', statDoctors: 'Shifokorlar',
      appts: 'Yozuvlar', slotsTitle: 'Qabul vaqtini qoʻshish', addSlot: 'Vaqt qoʻshish',
      doctors: 'Shifokorlar', slotAdded: 'Vaqt qoʻshildi ✓', slotErr: 'Shifokor va vaqtni tanlang',
      colTime: 'Vaqt', colPatient: 'Bemor', colPhone: 'Telefon', colDoctor: 'Shifokor',
      colReason: 'Sabab', colStatus: 'Holat', colActions: 'Amallar',
      colName: 'Shifokor', colSpec: 'Mutaxassislik', colExp: 'Tajriba', colPrice: 'Narx', colFree: 'Boʻsh',
      done: 'Keldi', noShow: 'Kelmadi', cancel: 'Bekor', empty: 'Hozircha yozuvlar yoʻq',
      confirmed: 'Tasdiqlangan', cancelled: 'Bekor qilingan', completed: 'Yakunlangan', no_show: 'Kelmadi',
      years: 'yil', sum: 'soʻm', slots: 'vaqt',
    },
  };

  const S = { lang: 'ru', token: '', clinicId: null };
  const $ = (id) => document.getElementById(id);
  const t = () => L[S.lang];

  async function api(path, opts = {}) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `/api/clinic/${path}${sep}token=${encodeURIComponent(S.token)}&lang=${S.lang}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts, body: opts.body ? JSON.stringify({ ...opts.body, token: S.token }) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('api'), { status: res.status, data });
    return data;
  }

  const money = (n) => new Intl.NumberFormat(S.lang === 'uz' ? 'uz-UZ' : 'ru-RU').format(n);
  const dt = (iso) => new Date(iso).toLocaleString(S.lang === 'uz' ? 'uz-UZ' : 'ru-RU',
    { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  // ---------- login ----------
  async function loadLoginClinics() {
    const sel = $('login-clinic');
    try {
      // Temporarily use entered token to fetch clinic list
      S.token = $('token').value.trim();
      const clinics = await api('clinics');
      sel.innerHTML = clinics.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
      return true;
    } catch { return false; }
  }

  async function doLogin() {
    S.token = $('token').value.trim();
    const ok = await loadLoginClinics();
    if (!ok) { $('login-err').textContent = t().badToken; return; }
    S.clinicId = Number($('login-clinic').value);
    enterDashboard();
  }

  function enterDashboard() {
    $('login').classList.add('hidden');
    $('dash').classList.remove('hidden');
    $('logout').classList.remove('hidden');
    $('clinic-select').classList.remove('hidden');
    refresh();
  }

  function logout() {
    S.token = ''; S.clinicId = null;
    $('dash').classList.add('hidden');
    $('logout').classList.add('hidden');
    $('clinic-select').classList.add('hidden');
    $('login').classList.remove('hidden');
    $('login-err').textContent = '';
  }

  // ---------- render ----------
  async function refresh() {
    await Promise.all([loadClinicSwitcher(), loadStats(), loadAppointments(), loadDoctors()]);
  }

  async function loadClinicSwitcher() {
    try {
      const clinics = await api('clinics');
      const sel = $('clinic-select');
      sel.innerHTML = clinics.map((c) => `<option value="${c.id}" ${c.id === S.clinicId ? 'selected' : ''}>${c.name}</option>`).join('');
    } catch {}
  }

  async function loadStats() {
    const s = await api(`summary?clinicId=${S.clinicId}`);
    const T = t();
    $('stats').innerHTML = `
      <div class="stat today"><div class="n">${s.today}</div><div class="l">${T.statToday}</div></div>
      <div class="stat"><div class="n">${s.confirmed}</div><div class="l">${T.statConfirmed}</div></div>
      <div class="stat done"><div class="n">${s.completed}</div><div class="l">${T.statDone}</div></div>
      <div class="stat noshow"><div class="n">${s.noShow}</div><div class="l">${T.statNoShow}</div></div>
      <div class="stat"><div class="n">${s.cancelled}</div><div class="l">${T.statCancelled}</div></div>
      <div class="stat"><div class="n">${s.doctors}</div><div class="l">${T.statDoctors}</div></div>`;
  }

  async function loadAppointments() {
    const T = t();
    $('appts-head').innerHTML = [T.colTime, T.colPatient, T.colPhone, T.colDoctor, T.colReason, T.colStatus, T.colActions]
      .map((h) => `<th>${h}</th>`).join('');
    const list = await api(`appointments?clinicId=${S.clinicId}`);
    const body = $('appts-body');
    if (!list.length) { body.innerHTML = `<tr><td colspan="7" class="muted">${T.empty}</td></tr>`; return; }
    body.innerHTML = list.map((a) => {
      const past = new Date(a.datetime) < new Date();
      const canAct = a.status === 'confirmed';
      const acts = canAct ? `<div class="actions">
        <button class="btn ok sm" data-status="completed" data-id="${a.id}">${T.done}</button>
        <button class="btn warn sm" data-status="no_show" data-id="${a.id}">${T.noShow}</button>
        <button class="btn danger sm" data-status="cancelled" data-id="${a.id}">${T.cancel}</button>
      </div>` : '<span class="muted">—</span>';
      return `<tr>
        <td>${dt(a.datetime)}</td>
        <td>${esc(a.patientName) || '—'}</td>
        <td>${esc(a.phone) || '—'}</td>
        <td>${esc(a.doctor)}<div class="muted" style="font-size:12px">${a.specialtyName}</div></td>
        <td class="muted">${esc(a.symptoms) || '—'}</td>
        <td><span class="badge ${a.status}">${T[a.status] || a.status}</span></td>
        <td>${acts}</td>
      </tr>`;
    }).join('');
    body.querySelectorAll('[data-status]').forEach((b) =>
      b.addEventListener('click', async () => {
        await api(`appointments/${b.dataset.id}/status`, { method: 'POST', body: { status: b.dataset.status } });
        await Promise.all([loadStats(), loadAppointments()]);
      }));
  }

  async function loadDoctors() {
    const T = t();
    $('doc-head').innerHTML = [T.colName, T.colSpec, T.colExp, T.colPrice, T.colFree].map((h) => `<th>${h}</th>`).join('');
    const docs = await api(`doctors?clinicId=${S.clinicId}`);
    $('doc-body').innerHTML = docs.map((d) => `<tr>
      <td>${esc(d.name)} <span class="muted">★ ${d.rating}</span></td>
      <td>${d.specialtyName}</td>
      <td>${d.experienceYears} ${T.years}</td>
      <td>${money(d.priceUZS)} ${T.sum}</td>
      <td>${d.freeSlots} ${T.slots}</td>
    </tr>`).join('');
    $('slot-doctor').innerHTML = docs.map((d) => `<option value="${d.id}">${esc(d.name)} — ${d.specialtyName}</option>`).join('');
  }

  async function addSlot() {
    const doctorId = Number($('slot-doctor').value);
    const dtv = $('slot-dt').value;
    const msg = $('slot-msg');
    if (!doctorId || !dtv) { msg.textContent = t().slotErr; return; }
    try {
      await api('slots', { method: 'POST', body: { doctorId, datetime: new Date(dtv).toISOString() } });
      msg.textContent = t().slotAdded;
      $('slot-dt').value = '';
      await Promise.all([loadDoctors(), loadStats()]);
      setTimeout(() => (msg.textContent = ''), 2500);
    } catch { msg.textContent = t().slotErr; }
  }

  function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function applyLang() {
    const T = t();
    document.documentElement.lang = S.lang;
    $('hdr-sub').textContent = T.hdrSub; $('logout').textContent = T.logout;
    $('l-title').textContent = T.lTitle; $('l-sub').textContent = T.lSub;
    $('l-code-label').textContent = T.lCode; $('l-clinic-label').textContent = T.lClinic;
    $('login-btn').textContent = T.login;
    $('t-appts').textContent = T.appts; $('t-slots').textContent = T.slotsTitle;
    $('add-slot').textContent = T.addSlot; $('t-doctors').textContent = T.doctors;
    document.querySelectorAll('.lang-toggle button').forEach((b) => b.classList.toggle('active', b.dataset.lang === S.lang));
  }

  // ---------- init ----------
  document.querySelectorAll('.lang-toggle button').forEach((b) =>
    b.addEventListener('click', () => { S.lang = b.dataset.lang; applyLang(); if (S.clinicId) refresh(); }));
  $('login-btn').addEventListener('click', doLogin);
  $('token').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  $('logout').addEventListener('click', logout);
  $('clinic-select').addEventListener('change', (e) => { S.clinicId = Number(e.target.value); refresh(); });
  $('add-slot').addEventListener('click', addSlot);

  applyLang();
  $('token').value = 'clinic-demo-2026';
})();
