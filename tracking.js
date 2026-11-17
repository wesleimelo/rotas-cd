// Gravação da localização do veículo enquanto a rota do motorista está aberta.
//  - No app Android (Capacitor): usa o plugin BackgroundGeolocation, que continua com a tela apagada.
//  - No navegador: usa a geolocalização do site e mantém a tela ligada (só funciona com o app aberto).
// Grava no máximo 1 ponto por minuto. Se ficar sem internet, guarda e envia depois.
(function () {
  'use strict';
  var RC = window.RC, h = RC.h;
  var INTERVAL_MS = 60000;          // um ponto por minuto
  var MAX_BUFFER = 500;             // limite de pontos guardados sem internet
  var T = { routeId: null, watcher: null, webId: null, wake: null, buf: [], lastAt: 0, sending: false, state: 'off', asked: false };

  function native() {
    var C = window.Capacitor;
    return !!(C && C.isNativePlatform && C.isNativePlatform() && C.registerPlugin);
  }
  var bg = null;
  function plugin() { if (!bg && native()) bg = window.Capacitor.registerPlugin('BackgroundGeolocation'); return bg; }

  function store(key, val) {
    try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* sem armazenamento: segue sem */ }
    return null;
  }

  /* ---------- indicador na tela ---------- */
  function setState(s, msg) {
    T.state = s;
    var el = document.getElementById('trk');
    if (!el) return;
    if (s === 'off') { el.hidden = true; el.replaceChildren(); return; }
    el.hidden = false;
    el.className = 'trk ' + s;
    el.replaceChildren(h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', null, msg));
  }

  /* ---------- envio ---------- */
  async function flush() {
    if (T.sending || !T.routeId || !T.buf.length) return;
    T.sending = true;
    var batch = T.buf.slice(0, 100), id = T.routeId;
    try {
      var r = await RC.sb.rpc('log_points', { p_route: id, p_points: batch });
      if (r.error) throw r.error;
      T.buf = T.buf.slice(batch.length);
      store('rc_trk_' + id, T.buf.length ? T.buf : null);
      if (T.state === 'warn') setState('on', 'Localização ativa durante a rota');
    } catch (e) {
      var msg = (e && e.message) || '';
      if (/não encontrada|Aceite|sem acesso/i.test(msg)) { T.buf = []; store('rc_trk_' + id, null); }   // não adianta repetir
      else setState('warn', 'Sem internet: a localização será enviada quando voltar');
    }
    T.sending = false;
    if (T.buf.length >= 100 && !document.hidden) flush();
  }

  function onPoint(lat, lng, acc, spd, atMs) {
    if (!T.routeId) return;
    var at = atMs || Date.now();
    if (at - T.lastAt < INTERVAL_MS - 2000) return;
    T.lastAt = at;
    T.buf.push({ lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc: acc == null ? null : Math.round(acc), spd: spd == null ? null : +(+spd).toFixed(1), at: new Date(at).toISOString() });
    if (T.buf.length > MAX_BUFFER) T.buf = T.buf.slice(-MAX_BUFFER);
    store('rc_trk_' + T.routeId, T.buf);
    flush();
  }

  /* ---------- motores ---------- */
  async function startNative() {
    var P = plugin();
    try {
      T.watcher = await P.addWatcher({
        backgroundTitle: 'Rotas do CD',
        backgroundMessage: 'Rota em andamento: localização ativa',
        requestPermissions: true,
        stale: false,
        distanceFilter: 20
      }, function (loc, err) {
        if (err) {
          if (err.code === 'NOT_AUTHORIZED') {
            setState('err', 'Permita a localização para este app nas configurações do celular');
            if (!T.asked) {
              T.asked = true;
              if (window.confirm('Para registrar a rota, o app precisa da permissão de localização (se aparecer, escolha "Permitir o tempo todo"). Abrir as configurações agora?')) P.openSettings();
            }
          } else setState('warn', 'Não consegui obter a localização');
          return;
        }
        if (T.state !== 'on') setState('on', 'Localização ativa durante a rota');
        onPoint(loc.latitude, loc.longitude, loc.accuracy, loc.speed, loc.time);
      });
    } catch (e) { setState('err', 'Não consegui ligar a localização'); }
  }

  async function holdScreen() {
    try {
      if ('wakeLock' in navigator && !document.hidden) T.wake = await navigator.wakeLock.request('screen');
    } catch (e) { T.wake = null; }
  }
  function startWeb() {
    if (!navigator.geolocation) { setState('err', 'Este aparelho não permite localização'); return; }
    setState('on', 'Localização ativa (mantenha o app aberto e a tela ligada)');
    T.webId = navigator.geolocation.watchPosition(function (pos) {
      onPoint(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.coords.speed, pos.timestamp);
    }, function (err) {
      setState('err', err && err.code === 1 ? 'Permita a localização no navegador para registrar a rota' : 'Não consegui obter a localização');
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
    holdScreen();
  }

  function stop() {
    var id = T.routeId;
    if (T.watcher != null && plugin()) { try { plugin().removeWatcher({ id: T.watcher }); } catch (e) { /* já parado */ } }
    if (T.webId != null && navigator.geolocation) navigator.geolocation.clearWatch(T.webId);
    if (T.wake && T.wake.release) { try { T.wake.release(); } catch (e) { /* ok */ } }
    T.watcher = null; T.webId = null; T.wake = null;
    var pending = T.buf.length, rid = id;
    // última tentativa de envio do que sobrou (a rota já pode estar finalizada: o servidor aceita pontos anteriores ao fim)
    if (pending && rid) { flush().then(function () { if (!T.buf.length) store('rc_trk_' + rid, null); }); }
    T.routeId = null; T.lastAt = 0;
    setState('off');
  }

  /* ---------- aviso de localização (aceite do motorista) ---------- */
  function askConsent() {
    return new Promise(function (resolve) {
      var box = h('div', { class: 'lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Aviso de localização' });
      function done(v) { box.remove(); resolve(v); }
      box.append(h('div', { class: 'consent' },
        h('h2', null, 'Localização durante a rota'),
        h('p', null, 'Enquanto a sua rota estiver iniciada, o sistema registra a posição do veículo para a coordenação acompanhar o trajeto.'),
        h('ul', null,
          h('li', null, 'A localização só é registrada entre o início e a finalização da rota.'),
          h('li', null, 'Fora da rota, nada é registrado.'),
          h('li', null, 'Quem vê: a coordenação. Os pontos são apagados depois de 30 dias.')
        ),
        h('div', { class: 'acts' },
          h('button', { class: 'btn', type: 'button', onclick: function () { done(true); } }, 'Entendi e aceito'),
          h('button', { class: 'btn ghost', type: 'button', onclick: function () { done(false); } }, 'Agora não')
        )
      ));
      document.body.append(box);
    });
  }
  async function ensureConsent() {
    var r = await RC.sb.rpc('my_location_consent');
    if (!r.error && r.data) return true;
    if (r.error) return false;
    var ok = await askConsent();
    if (!ok) return false;
    var a = await RC.sb.rpc('accept_location_consent');
    return !a.error;
  }

  /* ---------- ponto de entrada: chamado a cada atualização do quadro ---------- */
  // board: resultado de vehicle_board; me: perfil do motorista.
  async function sync(board, me) {
    var mine = null;
    (board || []).forEach(function (v) { if (v.route_id && v.driver_id === me.id) mine = v; });
    if (!mine) { if (T.routeId) stop(); return; }
    if (T.routeId === mine.route_id) return;          // já gravando esta rota
    if (T.routeId) stop();
    if (T.starting) return;
    T.starting = true;
    try {
      if (!(await ensureConsent())) { setState('off'); return; }
      T.routeId = mine.route_id;
      T.buf = store('rc_trk_' + mine.route_id) || [];
      T.lastAt = 0;
      setState('on', native() ? 'Localização ativa durante a rota' : 'Localização ativa (mantenha o app aberto e a tela ligada)');
      if (native()) await startNative(); else startWeb();
      flush();
    } finally { T.starting = false; }
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && T.routeId) { if (!native() && !T.wake) holdScreen(); flush(); }
  });
  window.addEventListener('online', function () { flush(); });

  RC.track = { sync: sync, stop: stop, isNative: native };
})();
