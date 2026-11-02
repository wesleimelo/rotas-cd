// Funções compartilhadas pelas páginas do motorista e da coordenação.
(function () {
  'use strict';
  var C = window.RC_CONFIG || {};
  var RC = (window.RC = { cfg: C, TZ: 'America/Sao_Paulo' });
  var TZ = RC.TZ;

  /* ---------- DOM ---------- */
  RC.$ = function (id) { return document.getElementById(id); };
  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(e, x); }); return; }
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  RC.h = function (tag, props) {
    var e = document.createElement(tag);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else if (k === 'value') e.value = v;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  };
  var h = RC.h;

  /* ---------- formatação ---------- */
  RC.fmtKm = function (n) { return Number(n).toLocaleString('pt-BR'); };
  RC.fmtTime = function (iso) { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }); };
  RC.fmtDay = function (iso) { return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TZ }); };
  RC.fmtFull = function (iso) { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }); };
  RC.monthKey = function (iso) { return new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ }).slice(0, 7); };
  RC.monthLabel = function (key) {
    var p = key.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  RC.monthRange = function (key) {
    var p = key.split('-'), y = +p[0], m = +p[1];
    var ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    return { start: y + '-' + pad(m) + '-01T00:00:00-03:00', end: ny + '-' + pad(nm) + '-01T00:00:00-03:00' };
  };
  RC.lastMonths = function (n) {
    var cur = RC.monthKey(new Date().toISOString()).split('-'), y = +cur[0], m = +cur[1], out = [];
    for (var i = 0; i < n; i++) {
      out.push(y + '-' + pad(m));
      m--; if (m === 0) { m = 12; y--; }
    }
    return out;
  };
  RC.parseKm = function (s) {
    var d = String(s || '').replace(/\D/g, '');
    if (!d) return null;
    var n = parseInt(d, 10);
    return n > 9999999 ? null : n;
  };
  RC.normPlate = function (s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };

  /* ---------- peças de tela ---------- */
  RC.toast = function (t) {
    var el = RC.$('toast');
    if (!el) { el = h('div', { id: 'toast', class: 'toast', role: 'status', hidden: true }); document.body.append(el); }
    el.textContent = t; el.hidden = false;
    clearTimeout(RC.toast.t);
    RC.toast.t = setTimeout(function () { el.hidden = true; }, 3200);
  };
  RC.banner = function (t, bad) {
    var b = RC.$('banner');
    if (!b) return;
    if (!t) { b.hidden = true; return; }
    b.textContent = t; b.className = 'banner' + (bad ? ' bad' : ''); b.hidden = false;
  };
  RC.msgBox = function () { return h('div', { class: 'msg', role: 'alert', hidden: true }); };
  RC.setMsg = function (el, t, kind) {
    if (!t) { el.hidden = true; return; }
    el.textContent = t; el.className = 'msg ' + (kind || 'err'); el.hidden = false;
  };
  RC.lbl = function (id, text, input) { return h('div', { class: 'field' }, h('label', { for: id }, text), input); };
  RC.plate = function (p) { return h('span', { class: 'plate' }, h('span', null, p)); };

  /* ---------- escala de rotas ---------- */
  RC.todayISO = function () { return new Date().toLocaleDateString('sv-SE', { timeZone: TZ }); };
  RC.addDays = function (iso, n) { var p = iso.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return d.toISOString().slice(0, 10); };
  RC.weekMonday = function (iso) { var p = iso.split('-'); var dow = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); return RC.addDays(iso, dow === 0 ? -6 : 1 - dow); };
  RC.dayLong = function (iso) {
    var p = iso.split('-');
    var t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' });
    return t.charAt(0).toUpperCase() + t.slice(1).replace('-feira', '') + ' ' + p[2] + '/' + p[1];
  };
  RC.shortDate = function (iso) { var p = iso.split('-'); return p[2] + '/' + p[1]; };
  RC.labelClass = function (label) {
    var t = String(label).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/MANHA/.test(t)) return 'l-blue';
    if (/TARDE/.test(t)) return 'l-gray';
    if (/CAF/.test(t)) return 'l-orange';
    return 'l-green';
  };
  // Cartão de um dia (estilo do cartão da coordenação). entries: linhas da tabela schedule.
  // opts: { me: id do usuário (destaca as dele), showDriver: mostra o nome e o aceite (coordenação),
  //         onRemove: function(entry) mostra o botão de apagar, onAccept: function(entry) botão "Aceitar rota" nas rotas dele }
  // Situação do veículo no quadro: no CD, em atendimento (fora) ou parado no CD durante a rota.
  RC.routeState = function (v) {
    if (!v.route_id) return { label: 'No CD', cls: 'free', away: false, available: true };
    if (v.field_status === 'cd') return { label: 'Parado no CD', cls: 'hold', away: false, available: true };
    return { label: 'Em atendimento', cls: 'run', away: true, available: false };
  };
  RC.kindName = { van: 'Van', caminhao: 'Caminhão', moto: 'Moto' };
  RC.scheduleDay = function (iso, entries, opts) {
    opts = opts || {};
    var list = entries.slice().sort(function (a, b) { return (a.sort - b.sort) || String(a.time_text || '').localeCompare(String(b.time_text || '')) || a.label.localeCompare(b.label); });
    var box = h('div', { class: 'esc-day' }, h('div', { class: 'esc-head' }, RC.dayLong(iso) + (iso === RC.todayISO() ? ' · hoje' : '')));
    if (!list.length) box.append(h('div', { class: 'esc-empty' }, 'Sem rotas escaladas'));
    list.forEach(function (e) {
      var mine = opts.me && e.driver_id === opts.me;
      var kind = RC.kindName[e.kind] ? e.kind : 'van';
      var status = null;
      if (e.driver_id && (opts.showDriver || mine)) {
        status = e.accepted_at
          ? h('span', { class: 'esc-ok' }, '✔ Aceita ' + RC.fmtTime(e.accepted_at))
          : h('span', { class: 'esc-wait' }, 'Aguardando aceite');
      }
      var sub = [];
      if (opts.showDriver && e.driver_name) sub.push(h('span', { class: 'esc-drv' }, e.driver_name));
      if (!opts.showDriver && mine) sub.push(h('span', { class: 'esc-drv' }, 'Sua rota'));
      if (status) sub.push(status);
      if (mine && !e.accepted_at && opts.onAccept) sub.push(h('button', { class: 'esc-accept', type: 'button', onclick: function (ev) { ev.currentTarget.disabled = true; opts.onAccept(e); } }, 'Aceitar rota'));
      box.append(h('div', { class: 'esc-row' + (mine ? ' mine' : '') },
        h('img', { class: 'esc-img', src: 'img/' + kind + '.svg', alt: RC.kindName[kind], width: '84', height: '70' }),
        h('div', { class: 'esc-info' },
          h('div', { class: 'esc-top' },
            h('span', { class: 'esc-label ' + RC.labelClass(e.label) }, e.label),
            e.time_text ? h('span', { class: 'esc-time' }, e.time_text) : null,
            opts.onRemove ? h('button', { class: 'esc-x', type: 'button', 'aria-label': 'Apagar esta rota da escala', onclick: function () { opts.onRemove(e); } }, '×') : null),
          h('div', { class: 'esc-plate' }, e.plate),
          sub.length ? h('div', { class: 'esc-sub' }, sub) : null)
      ));
    });
    return box;
  };
  RC.odo = function (n) {
    var s = String(n), g = [];
    for (var i = s.length; i > 0; i -= 3) g.unshift(s.slice(Math.max(0, i - 3), i));
    var w = h('span', { class: 'odo', role: 'img', 'aria-label': RC.fmtKm(n) + ' km' });
    g.forEach(function (grp, gi) {
      if (gi) w.append(h('i', { class: 'sep', 'aria-hidden': 'true' }));
      grp.split('').forEach(function (ch) { w.append(h('span', { class: 'd', 'aria-hidden': 'true' }, ch)); });
    });
    return w;
  };
  RC.errText = function (e) {
    var m = (e && e.message) || '';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.';
    if (/JWT|expired/i.test(m)) return 'Sua sessão expirou. Entre de novo.';
    if (/banned/i.test(m)) return 'Este acesso está desativado. Fale com a coordenação.';
    if (/Invalid login credentials/i.test(m)) return 'Usuário ou senha incorretos.';
    return m || 'Não foi possível concluir. Tente de novo.';
  };

  /* ---------- Supabase ---------- */
  RC.configured = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && !/SEU-PROJETO|COLE-AQUI/.test(C.SUPABASE_URL + C.SUPABASE_ANON_KEY) && window.supabase);
  RC.sb = RC.configured ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;

  RC.emailFor = function (username) { return String(username).trim().toLowerCase() + '@' + C.LOGIN_DOMAIN; };
  RC.signIn = async function (username, password) {
    var r = await RC.sb.auth.signInWithPassword({ email: RC.emailFor(username), password: password });
    if (r.error) throw r.error;
    return r.data.user;
  };
  RC.loadProfile = async function () {
    var s = await RC.sb.auth.getSession();
    if (!s.data || !s.data.session) return null;
    var r = await RC.sb.from('profiles').select('id,username,full_name,role,active').eq('id', s.data.session.user.id).maybeSingle();
    return r.error ? null : r.data;
  };
  RC.signOut = function () { return RC.sb.auth.signOut(); };

  // Tela de entrada com usuário e senha. opts: { role, onDone(profile) }
  RC.loginView = function (box, opts) {
    var user = h('input', { id: 'loginUser', class: 'input', type: 'text', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', maxlength: '30', placeholder: 'seu.usuario' });
    var pass = h('input', { id: 'loginPass', class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'Senha' });
    var m = RC.msgBox();
    var btn = h('button', { class: 'btn', type: 'submit' }, 'Entrar');
    var form = h('form', {
      class: 'card',
      onsubmit: async function (ev) {
        ev.preventDefault();
        var u = user.value.trim().toLowerCase();
        if (!u || !pass.value) { RC.setMsg(m, 'Digite o usuário e a senha.', 'err'); return; }
        btn.disabled = true; RC.setMsg(m, 'Entrando…', 'warn');
        try {
          await RC.signIn(u, pass.value);
          var p = await RC.loadProfile();
          if (!p || !p.active) { await RC.signOut(); throw new Error('Este acesso está desativado. Fale com a coordenação.'); }
          var allowed = opts.roles || (opts.role ? [opts.role] : null);
          if (allowed && allowed.indexOf(p.role) < 0) { await RC.signOut(); throw new Error(opts.deny || 'Esta área é só para a coordenação.'); }
          opts.onDone(p);
        } catch (e) {
          btn.disabled = false; pass.value = '';
          RC.setMsg(m, RC.errText(e), 'err');
        }
      }
    },
      h('h2', null, 'Entrar'),
      RC.lbl('loginUser', 'Usuário', user),
      RC.lbl('loginPass', 'Senha', pass),
      m, btn
    );
    box.replaceChildren(form);
    user.focus();
  };

  /* ---------- foto do odômetro ---------- */
  // Reduz a foto no celular (cerca de 100 KB) e carimba data e hora no canto.
  // Pede a posição do celular (GPS). Devolve { lat, lng } ou null se negada, indisponível ou demorada.
  RC.getLocation = function () {
    return new Promise(function (res) {
      if (!navigator.geolocation) { res(null); return; }
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; res(null); } }, 12000);
      navigator.geolocation.getCurrentPosition(function (pos) {
        if (done) return; done = true; clearTimeout(timer);
        res({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, function () {
        if (done) return; done = true; clearTimeout(timer); res(null);
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    });
  };
  RC.mapUrl = function (lat, lng) { return 'https://www.google.com/maps?q=' + Number(lat).toFixed(6) + ',' + Number(lng).toFixed(6); };

  RC.compress = function (file, loc, manual) {
    var url = URL.createObjectURL(file);
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('Não consegui abrir a foto. Tire outra.')); };
      img.src = url;
    }).then(function (img) {
      // manual = { at: Date } para foto lançada pela coordenação: mostra o horário informado, sem GPS.
      var stamp = (manual && manual.at ? manual.at : new Date()).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ })
        + (manual ? ' · Lançado pela coordenação' : (loc ? ' · ' + loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5) : ' · sem localização'));
      function attempt(max, q) {
        var s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        var x = c.getContext('2d');
        x.drawImage(img, 0, 0, c.width, c.height);
        var fs = Math.max(14, Math.round(c.width * 0.035));
        x.font = '600 ' + fs + 'px sans-serif';
        var tw = x.measureText(stamp).width;
        if (tw > c.width - fs) { fs = Math.floor(fs * (c.width - fs) / tw); x.font = '600 ' + fs + 'px sans-serif'; tw = x.measureText(stamp).width; }
        x.fillStyle = 'rgba(0,0,0,.62)';
        x.fillRect(0, c.height - fs * 1.7, tw + fs, fs * 1.7);
        x.fillStyle = '#fff';
        x.fillText(stamp, fs / 2, c.height - fs * 0.5);
        return new Promise(function (resolve) { c.toBlob(resolve, 'image/jpeg', q); });
      }
      var sizes = [[960, 0.62], [900, 0.52], [800, 0.45], [700, 0.4], [600, 0.35]];
      return (async function () {
        for (var i = 0; i < sizes.length; i++) {
          var blob = await attempt(sizes[i][0], sizes[i][1]);
          if (blob && blob.size < 400000) return { blob: blob, url: URL.createObjectURL(blob) };
        }
        throw new Error('Não consegui reduzir a foto. Tire outra.');
      })();
    }).then(function (r) { URL.revokeObjectURL(url); return r; }, function (e) { URL.revokeObjectURL(url); throw e; });
  };
  RC.uploadPhoto = async function (uid, kind, blob) {
    var path = uid + '/' + Date.now() + '-' + kind + '.jpg';
    var r = await RC.sb.storage.from(C.BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (r.error) throw r.error;
    return path;
  };
  RC.removePhoto = function (path) { return RC.sb.storage.from(C.BUCKET).remove([path]).catch(function () {}); };
  RC.photoUrl = async function (path) {
    var r = await RC.sb.storage.from(C.BUCKET).createSignedUrl(path, 300);
    if (r.error) throw r.error;
    return r.data.signedUrl;
  };
  RC.showPhoto = async function (path, caption) {
    var lb = h('div', { class: 'lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Foto do odômetro' });
    function close() { lb.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(ev) { if (ev.key === 'Escape') close(); }
    lb.addEventListener('click', function (ev) { if (ev.target === lb) close(); });
    document.addEventListener('keydown', onKey);
    lb.append(h('p', null, 'Carregando foto…'));
    document.body.append(lb);
    try {
      var url = await RC.photoUrl(path);
      lb.replaceChildren(h('img', { src: url, alt: caption }), h('p', null, caption), h('button', { class: 'btn', type: 'button', onclick: close }, 'Fechar'));
    } catch (e) {
      lb.replaceChildren(h('p', null, 'Não foi possível abrir a foto.'), h('button', { class: 'btn', type: 'button', onclick: close }, 'Fechar'));
    }
  };

  /* ---------- planilha ---------- */
  function csvCell(x) { var s = String(x == null ? '' : x); return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  RC.saveCsv = function (name, rows) {
    var csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n');
    var day = new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name + '-' + day + '.csv';
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  };

  RC.showConfigError = function (box) {
    box.replaceChildren(h('div', { class: 'empty' }, 'O sistema ainda não foi configurado. Preencha o arquivo config.js com os dados do Supabase (veja o README).'));
  };
})();
