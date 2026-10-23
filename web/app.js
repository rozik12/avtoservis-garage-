(function () {
  'use strict';

  var LANGS = ['ru', 'uz', 'en'];
  var state = { lang: 'ru', catalog: null, business: null, category: null, dates: [], slotsDate: null };

  var $ = function (id) { return document.getElementById(id); };
  var t = function (key) { return window.I18N[state.lang][key]; };
  var fmt = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };

  function loadLang() {
    var saved = null;
    try { saved = localStorage.getItem('lang'); } catch (e) { /* storage may be blocked */ }
    if (LANGS.indexOf(saved) >= 0) return saved;
    var nav = (navigator.language || 'ru').slice(0, 2).toLowerCase();
    return LANGS.indexOf(nav) >= 0 ? nav : 'ru';
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function duration(min) {
    return min >= 60 ? (min / 60).toFixed(min % 60 ? 1 : 0).replace('.0', '') + ' ' + t('hour') : min + ' ' + t('min');
  }

  /* ---------- static text ---------- */
  function applyStatic() {
    var dict = window.I18N[state.lang];
    document.documentElement.lang = state.lang;
    document.title = dict.metaTitle;
    document.querySelector('meta[name="description"]').setAttribute('content', dict.metaDesc);
    document.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = dict[n.getAttribute('data-i18n')]; });
    document.querySelectorAll('[data-lang]').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-lang') === state.lang); });

    var why = $('whyGrid'); why.textContent = '';
    dict.why.forEach(function (w) {
      var tile = el('div', 'tile');
      tile.appendChild(el('div', 'tile__icon', w[0]));
      tile.appendChild(el('h3', null, w[1]));
      tile.appendChild(el('p', null, w[2]));
      why.appendChild(tile);
    });

    var how = $('howGrid'); how.textContent = '';
    dict.how.forEach(function (h) {
      var tile = el('div', 'tile');
      tile.appendChild(el('div', 'tile__icon', h[0]));
      tile.appendChild(el('h3', null, h[1]));
      tile.appendChild(el('p', null, h[2]));
      how.appendChild(tile);
    });

    var faq = $('faqList'); faq.textContent = '';
    dict.faq.forEach(function (q) {
      var d = el('details');
      d.appendChild(el('summary', null, q[0]));
      d.appendChild(el('p', null, q[1]));
      faq.appendChild(d);
    });
  }

  /* ---------- catalog ---------- */
  function renderTabs() {
    var tabs = $('tabs'); tabs.textContent = '';
    state.catalog.categories.forEach(function (c) {
      var b = el('button', 'tab' + (c.id === state.category ? ' is-active' : ''), c.icon + ' ' + c.name[state.lang]);
      b.type = 'button';
      b.addEventListener('click', function () { state.category = c.id; renderTabs(); renderCards(); });
      tabs.appendChild(b);
    });
  }

  function renderCards() {
    var cards = $('cards'); cards.textContent = '';
    state.catalog.services.filter(function (s) { return s.category === state.category; }).forEach(function (s) {
      var card = el('article', 'card');
      card.appendChild(el('h3', null, s.name[state.lang]));
      card.appendChild(el('p', null, s.desc[state.lang]));
      var meta = el('div', 'card__meta');
      meta.appendChild(el('span', 'card__price', t('from') + ' ' + fmt(s.priceFrom) + ' ' + t('sum')));
      meta.appendChild(el('span', 'card__time', '⏱ ' + duration(s.minutes)));
      card.appendChild(meta);
      var btn = el('button', 'btn btn--ghost btn--sm', t('book'));
      btn.type = 'button';
      btn.addEventListener('click', function () {
        $('fService').value = s.id;
        $('book').scrollIntoView();
        $('fService').focus({ preventScroll: true });
      });
      card.appendChild(btn);
      cards.appendChild(card);
    });
  }

  function renderServiceSelect() {
    var sel = $('fService'), prev = sel.value;
    sel.textContent = '';
    sel.appendChild(new Option(t('choose'), ''));
    state.catalog.categories.forEach(function (c) {
      var g = document.createElement('optgroup');
      g.label = c.name[state.lang];
      state.catalog.services.filter(function (s) { return s.category === c.id; }).forEach(function (s) {
        g.appendChild(new Option(s.name[state.lang], s.id));
      });
      sel.appendChild(g);
    });
    sel.value = prev;
  }

  /* ---------- dates & slots ---------- */
  function dateLabel(iso) {
    var d = new Date(iso + 'T12:00:00');
    var locale = state.lang === 'uz' ? 'uz-UZ' : state.lang === 'en' ? 'en-GB' : 'ru-RU';
    return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long' });
  }

  function renderDates() {
    var sel = $('fDate'), prev = sel.value;
    sel.textContent = '';
    sel.appendChild(new Option(t('choose'), ''));
    state.dates.forEach(function (d) { sel.appendChild(new Option(dateLabel(d), d)); });
    sel.value = prev;
  }

  function loadSlots(date) {
    var sel = $('fTime');
    sel.textContent = '';
    if (!date) { sel.appendChild(new Option(t('choose'), '')); return Promise.resolve(); }
    sel.appendChild(new Option(t('loadingSlots'), ''));
    state.slotsDate = date;
    return fetch('/api/slots?date=' + encodeURIComponent(date))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (state.slotsDate !== date) return; // a newer request replaced this one
        sel.textContent = '';
        if (!data.slots || !data.slots.length) { sel.appendChild(new Option(t('noSlots'), '')); return; }
        sel.appendChild(new Option(t('choose'), ''));
        data.slots.forEach(function (s) { sel.appendChild(new Option(s, s)); });
      })
      .catch(function () { sel.textContent = ''; sel.appendChild(new Option(t('errors').server_error, '')); });
  }

  /* ---------- contacts ---------- */
  function renderContacts() {
    var b = state.business;
    $('cAddress').textContent = b.address[state.lang];
    $('cHours').textContent = b.hours[state.lang];
    var phones = $('cPhones'); phones.textContent = '';
    b.phones.forEach(function (p, i) {
      var a = el('a', null, b.phonesDisplay[i]);
      a.href = 'tel:' + p;
      phones.appendChild(a);
      phones.appendChild(document.createElement('br'));
    });
    $('map').src = 'https://www.google.com/maps?q=' + encodeURIComponent(b.mapQuery) + '&output=embed';

    var socials = $('socials'); socials.textContent = '';
    if (b.telegram) { var tg = el('a', 'btn btn--ghost btn--sm', 'Telegram'); tg.href = 'https://t.me/' + b.telegram; tg.target = '_blank'; tg.rel = 'noopener'; socials.appendChild(tg); }
    if (b.instagram) { var ig = el('a', 'btn btn--ghost btn--sm', 'Instagram'); ig.href = 'https://instagram.com/' + b.instagram; ig.target = '_blank'; ig.rel = 'noopener'; socials.appendChild(ig); }

    if (b.botUsername) {
      $('botLink').href = 'https://t.me/' + b.botUsername;
      $('botBox').hidden = false;
    }
  }

  /* ---------- form ---------- */
  function showError(code) {
    var box = $('formError');
    box.textContent = window.I18N[state.lang].errors[code] || window.I18N[state.lang].errors.server_error;
    box.hidden = false;
  }

  function onSubmit(e) {
    e.preventDefault();
    var form = e.target, btn = $('submitBtn');
    $('formError').hidden = true;
    $('formOk').hidden = true;

    var payload = {};
    new FormData(form).forEach(function (v, k) { payload[k] = v; });
    payload.lang = state.lang;

    if (!payload.serviceId) return showError('bad_service');
    if (!payload.date) return showError('bad_date');
    if (!payload.time) return showError('bad_time');
    if (String(payload.name).trim().length < 2) return showError('bad_name');
    if (String(payload.phone).replace(/\D/g, '').length < 9) return showError('bad_phone');

    btn.disabled = true;
    btn.textContent = t('sending');
    fetch('/api/booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) { showError(res.data.error); return loadSlots(payload.date); }
        $('okId').textContent = '#' + res.data.id;
        $('formOk').hidden = false;
        form.reset();
        return loadSlots('');
      })
      .catch(function () { showError('server_error'); })
      .then(function () { btn.disabled = false; btn.textContent = t('send'); });
  }

  /* ---------- logo ---------- */
  function tryLogo() {
    var img = new Image();
    img.alt = 'Garage Detailing';
    img.onload = function () { var box = $('brandLogo'); box.textContent = ''; box.appendChild(img); box.style.background = 'transparent'; };
    img.src = 'logo.png';
  }

  /* ---------- init ---------- */
  function setLang(lang) {
    state.lang = lang;
    try { localStorage.setItem('lang', lang); } catch (e) { /* ignore */ }
    applyStatic();
    if (state.catalog) { renderTabs(); renderCards(); renderServiceSelect(); renderDates(); loadSlots($('fDate').value); }
    if (state.business) renderContacts();
  }

  function init() {
    state.lang = loadLang();
    $('year').textContent = new Date().getFullYear();
    applyStatic();

    document.querySelectorAll('[data-lang]').forEach(function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
    });
    $('burger').addEventListener('click', function () {
      var open = $('nav').classList.toggle('is-open');
      $('burger').setAttribute('aria-expanded', String(open));
    });
    $('nav').addEventListener('click', function () { $('nav').classList.remove('is-open'); });
    $('fDate').addEventListener('change', function (e) { loadSlots(e.target.value); });
    $('bookForm').addEventListener('submit', onSubmit);
    tryLogo();

    Promise.all([
      fetch('services.json').then(function (r) { return r.json(); }),
      fetch('business.json').then(function (r) { return r.json(); }),
      fetch('/api/slots').then(function (r) { return r.json(); }).catch(function () { return { dates: [] }; }),
    ]).then(function (res) {
      state.catalog = res[0];
      state.business = res[1];
      state.dates = res[2].dates || [];
      state.category = state.catalog.categories[0].id;
      renderTabs(); renderCards(); renderServiceSelect(); renderDates(); loadSlots(''); renderContacts();
    });
  }

  init();
})();
