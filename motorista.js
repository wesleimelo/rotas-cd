// Página do motorista: entrar, iniciar e finalizar rota, ver as próprias rotas.
(function () {
  'use strict';
  var RC = window.RC, h = RC.h, $ = RC.$;
  var profile = null, board = [];
  var view = { tab: 'v', vehicleId: null, sig: '' };
  var draft = { km: '', photo: null, loc: null, ack: null, notes: '' };
  var busy = false, pollT = null;

  function resetDraft() {
    if (draft.photo && draft.photo.url) URL.revokeObjectURL(draft.photo.url);
    draft = { km: '', photo: null, loc: null, ack: null, notes: '' };
  }

  /* ---------- início e saída ---------- */
  function showLogin() {
    clearInterval(pollT);
    $('who').hidden = true; $('tabs').hidden = true; RC.banner('');
    RC.loginView($('view'), { roles: ['driver', 'coord'], deny: 'Esta área é só para motoristas. Use o endereço da coordenação.', onDone: function (p) { profile = p; start(); } });
  }

  function start() {
    $('who').hidden = false; $('tabs').hidden = false;
    $('who').replaceChildren(h('div', { class: 'whoin' },
      h('div', { class: 'nm' }, h('span', { class: 'lbl' }, 'Motorista'), h('strong', null, profile.full_name)),
      h('button', { class: 'btn ghost', type: 'button', onclick: function () { RC.signOut(); } }, 'Sair')
    ));
    view = { tab: 'v', vehicleId: null, sig: '' };
    resetDraft();
    loadBoard(true);
    clearInterval(pollT);
    pollT = setInterval(function () { if (!document.hidden && profile && view.tab === 'v') loadBoard(false); }, 30000);
  }

  function setTab(t) {
    view.tab = t; view.vehicleId = null; view.sig = '';
    resetDraft();
    ['V', 'E', 'R', 'M'].forEach(function (k) { $('tab' + k).setAttribute('aria-current', k.toLowerCase() === t ? 'page' : 'false'); });
    if (t === 'm') renderMine(); else if (t === 'e') renderSchedule(); else if (t === 'r') renderFleetSummary(); else loadBoard(true);
  }
  function openVehicle(id) { view.vehicleId = id; view.sig = ''; resetDraft(); render(true); window.scrollTo(0, 0); }

  /* ---------- quadro ---------- */
  async function loadBoard(force) {
    var r = await RC.sb.rpc('vehicle_board');
    if (r.error) {
      if (/permission|JWT/i.test(r.error.message)) { RC.signOut(); return; }
      RC.banner(RC.errText(r.error), true); return;
    }
    RC.banner('');
    board = r.data || [];
    try {
      var sr = await RC.sb.from('schedule').select('*').eq('day', RC.todayISO()).eq('driver_id', profile.id);
      pendingAccept = (sr.data || []).filter(function (e) { return !e.accepted_at; }).length;
    } catch (e) { pendingAccept = 0; }
    render(force);
  }
  function render(force) {
    $('tabV').setAttribute('aria-current', view.tab === 'v' ? 'page' : 'false');
    $('tabM').setAttribute('aria-current', view.tab === 'm' ? 'page' : 'false');
    $('tabE').setAttribute('aria-current', view.tab === 'e' ? 'page' : 'false');
    if (view.tab !== 'v') return;
    if (view.vehicleId) {
      var v = findVehicle(view.vehicleId);
      var sig = view.vehicleId + '|' + (v && v.route_id ? v.route_id : '-');
      if (force || sig !== view.sig) { view.sig = sig; renderDetail(); }
      return;
    }
    renderBoard();
  }
  function findVehicle(id) {
    for (var i = 0; i < board.length; i++) if (board[i].id === id) return board[i];
    return null;
  }
  var pendingAccept = 0;
  function renderBoard() {
    var box = $('view'); box.replaceChildren();
    if (!board.length) {
      box.append(h('div', { class: 'empty' }, 'Nenhum veículo disponível. Fale com a coordenação.'));
      return;
    }
    var away = board.filter(function (v) { return RC.routeState(v).away; }).length;
    var grid = h('div', { class: 'board' });
    board.forEach(function (v) {
      var open = !!v.route_id;
      var st = RC.routeState(v);
      var meta = open
        ? 'Saiu ' + RC.fmtTime(v.start_at) + ' · ' + v.driver_name + ' · km ' + RC.fmtKm(v.start_km)
        : (v.last_km != null ? 'Último km: ' + RC.fmtKm(v.last_km) : 'Sem rotas registradas');
      grid.append(h('button', { class: 'vcard', type: 'button', onclick: function () { openVehicle(v.id); } },
        h('div', { class: 'row' }, RC.plate(v.plate), h('span', { class: 'pill ' + st.cls }, st.label)),
        h('div', { class: 'vname' }, v.name),
        h('div', { class: 'vmeta' }, meta)
      ));
    });
    box.append(h('div', { class: 'list' },
      pendingAccept ? h('div', { class: 'card' },
        h('strong', null, 'Você tem ' + pendingAccept + (pendingAccept === 1 ? ' rota' : ' rotas') + ' hoje para aceitar'),
        h('button', { class: 'btn', type: 'button', onclick: function () { setTab('e'); } }, 'Ver escala e aceitar')) : null,
      h('div', { class: 'sum' }, h('span', null, away + ' em atendimento'), h('span', null, '·'), h('span', null, (board.length - away) + ' no CD')),
      grid
    ));
  }

  /* ---------- um veículo ---------- */
  function renderDetail() {
    var box = $('view'); box.replaceChildren();
    var v = findVehicle(view.vehicleId);
    if (!v) { view.vehicleId = null; renderBoard(); return; }
    var open = !!v.route_id;
    box.append(h('div', { class: 'list' },
      h('button', { class: 'back', type: 'button', onclick: function () { setTab('v'); } }, '← Veículos'),
      h('section', { class: 'panel' },
        h('div', { class: 'vhead' }, RC.plate(v.plate), h('div', { class: 'vname' }, v.name), h('span', { class: 'pill ' + RC.routeState(v).cls }, RC.routeState(v).label)),
        open && canFinish(v) ? statusBlock(v) : null,
        open ? (canFinish(v) ? finishForm(v) : lockedInfo(v)) : startForm(v)
      )
    ));
  }
  // Botões de situação durante a rota: em atendimento (fora do CD) ou parado no CD.
  function statusBlock(v) {
    var box = h('div', { class: 'statusbox' });
    var msg = RC.msgBox();
    function paint() {
      var cur = v.field_status === 'cd' ? 'cd' : 'atendimento';
      box.replaceChildren(
        h('span', { class: 'lbl' }, 'Situação agora'),
        h('div', { class: 'seg' },
          h('button', { class: 'segbtn', type: 'button', 'aria-pressed': String(cur === 'atendimento'), onclick: function () { set('atendimento'); } }, 'Em atendimento (fora do CD)'),
          h('button', { class: 'segbtn', type: 'button', 'aria-pressed': String(cur === 'cd'), onclick: function () { set('cd'); } }, 'Parado no CD')),
        msg);
    }
    async function set(st) {
      if ((v.field_status || 'atendimento') === st) return;
      var r = await RC.sb.rpc('set_route_status', { p_route: v.route_id, p_status: st });
      if (r.error) { RC.setMsg(msg, RC.errText(r.error), 'err'); return; }
      v.field_status = st; v.status_at = r.data && r.data.status_at;
      RC.toast(st === 'cd' ? 'Marcado: parado no CD' : 'Marcado: em atendimento');
      var pill = document.querySelector('.vhead .pill'), rs = RC.routeState(v);
      if (pill) { pill.className = 'pill ' + rs.cls; pill.textContent = rs.label; }
      paint();
    }
    paint();
    return box;
  }
  // Só quem iniciou a rota (ou a coordenação) finaliza.
  function canFinish(v) { return v.driver_id === profile.id || profile.role === 'coord'; }
  function lockedInfo(v) {
    return h('div', { class: 'info' },
      h('div', { class: 'line' }, h('span', { class: 'lbl' }, 'Em rota'), h('strong', null, v.driver_name)),
      h('div', { class: 'hint' }, 'Saiu ' + RC.fmtDay(v.start_at) + ' às ' + RC.fmtTime(v.start_at) + '. Só ' + v.driver_name + ' ou a coordenação pode finalizar esta rota. Se ela ficou aberta por engano, fale com a coordenação.')
    );
  }
  function photoPicker(inputId, label, onMsg) {
    var prev = h('img', { class: 'preview', alt: 'Foto do odômetro', hidden: true });
    var btn = h('label', { class: 'photobtn', for: inputId }, '📷 ' + label);
    var inp = h('input', { id: inputId, type: 'file', accept: 'image/*', capture: 'environment' });
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      onMsg('Obtendo a localização e preparando a foto…', 'warn');
      RC.getLocation().then(function (loc) {
        return RC.compress(f, loc).then(function (p) {
          if (draft.photo && draft.photo.url) URL.revokeObjectURL(draft.photo.url);
          draft.photo = p; draft.loc = loc; draft.ack = null;
          prev.src = p.url; prev.hidden = false; btn.textContent = '📷 Trocar foto';
          if (loc) onMsg('');
          else onMsg('Não consegui a localização. Ative o GPS e permita a localização para este site, depois tire a foto de novo. Se não conseguir, pode continuar sem ela.', 'warn');
        });
      }).catch(function (e) { onMsg(RC.errText(e), 'err'); });
    });
    if (draft.photo) { prev.src = draft.photo.url; prev.hidden = false; btn.textContent = '📷 Trocar foto'; }
    return h('div', { class: 'photo' }, inp, btn, prev);
  }
  function kmField(id, label, hintText, onInput) {
    var inp = h('input', { id: id, class: 'input km', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '000.000', value: draft.km });
    inp.addEventListener('input', function () {
      var n = RC.parseKm(inp.value);
      inp.value = n != null ? RC.fmtKm(n) : '';
      draft.km = inp.value; draft.ack = null;
      if (onInput) onInput(n);
    });
    return h('div', { class: 'field' }, h('label', { for: id }, label), inp, hintText ? h('div', { class: 'hint' }, hintText) : null);
  }

  function startForm(v) {
    var m = RC.msgBox();
    var btn = h('button', { class: 'btn', type: 'button' }, 'Iniciar rota');
    btn.addEventListener('click', function () { startRoute(v, m, btn); });
    var kmf = kmField('kmIn', 'Km inicial (como está no painel)',
      v.last_km != null ? 'Último km registrado: ' + RC.fmtKm(v.last_km) : 'Digite só os números.',
      function () { btn.textContent = 'Iniciar rota'; RC.setMsg(m, ''); });
    return h('div', { class: 'list' }, kmf, photoPicker('photoIn', 'Foto do odômetro', function (t, k) { RC.setMsg(m, t, k); }), m, btn);
  }
  async function startRoute(v, m, btn) {
    if (busy) return;
    var km = RC.parseKm(draft.km);
    if (km == null) { RC.setMsg(m, 'Digite o km inicial com números.', 'err'); $('kmIn').focus(); return; }
    if (!draft.photo) { RC.setMsg(m, 'Tire a foto do odômetro para iniciar.', 'err'); return; }
    if (v.last_km != null && km < v.last_km && draft.ack !== 'low') {
      draft.ack = 'low';
      RC.setMsg(m, 'O km digitado (' + RC.fmtKm(km) + ') é menor que o último registrado (' + RC.fmtKm(v.last_km) + '). Confira o painel.', 'warn');
      btn.textContent = 'Confirmar mesmo assim'; return;
    }
    busy = true; btn.disabled = true; RC.setMsg(m, 'Salvando…', 'warn');
    var path = null;
    try {
      path = await RC.uploadPhoto(profile.id, 'inicio', draft.photo.blob);
      var r = await RC.sb.rpc('start_route', { p_vehicle: v.id, p_km: km, p_photo: path, p_lat: draft.loc ? draft.loc.lat : null, p_lng: draft.loc ? draft.loc.lng : null });
      if (r.error) throw r.error;
      RC.toast('Rota iniciada às ' + RC.fmtTime(r.data.start_at));
      busy = false; setTab('v');
    } catch (e) {
      busy = false; btn.disabled = false;
      if (path) RC.removePhoto(path);
      RC.setMsg(m, RC.errText(e), 'err');
      loadBoard(false);
    }
  }

  function finishForm(v) {
    var m = RC.msgBox();
    var dist = h('div', { class: 'dist hint' });
    var btn = h('button', { class: 'btn', type: 'button' }, 'Finalizar rota');
    btn.addEventListener('click', function () { finishRoute(v, m, btn); });
    function upd(n) {
      btn.textContent = 'Finalizar rota'; RC.setMsg(m, '');
      if (n == null) { dist.textContent = ''; return; }
      var d = n - v.start_km;
      dist.textContent = d >= 0 ? 'Percorrido: ' + RC.fmtKm(d) + ' km' : 'O km final é menor que o inicial.';
    }
    var kmf = kmField('kmOut', 'Km final (como está no painel)', '', upd);
    upd(RC.parseKm(draft.km));
    var notes = h('textarea', { id: 'notes', class: 'input', rows: '2', maxlength: '200', placeholder: 'Ex.: pneu furado, atraso no cliente…', value: draft.notes });
    notes.addEventListener('input', function () { draft.notes = notes.value; });
    var info = h('div', { class: 'info' },
      h('div', { class: 'line' }, h('span', { class: 'lbl' }, 'Km inicial'), RC.odo(v.start_km)),
      h('div', { class: 'hint' }, 'Rota de ' + v.driver_name + ', iniciada ' + RC.fmtDay(v.start_at) + ' às ' + RC.fmtTime(v.start_at) + '.'),
      v.driver_id === profile.id
        ? h('div', { class: 'photos' }, h('button', { class: 'btn ghost', type: 'button', onclick: function () { RC.showPhoto(v.start_photo, 'Odômetro na saída'); } }, 'Ver foto da saída'))
        : null
    );
    return h('div', { class: 'list' },
      info, kmf, dist,
      photoPicker('photoOut', 'Foto do odômetro', function (t, k) { RC.setMsg(m, t, k); }),
      RC.lbl('notes', 'Observações (opcional)', notes),
      m, btn,
      v.driver_id === profile.id ? cancelBlock(v) : null
    );
  }
  async function finishRoute(v, m, btn) {
    if (busy) return;
    var km = RC.parseKm(draft.km);
    if (km == null) { RC.setMsg(m, 'Digite o km final com números.', 'err'); $('kmOut').focus(); return; }
    if (km < v.start_km) { RC.setMsg(m, 'O km final não pode ser menor que o inicial (' + RC.fmtKm(v.start_km) + ').', 'err'); $('kmOut').focus(); return; }
    if (!draft.photo) { RC.setMsg(m, 'Tire a foto do odômetro para finalizar.', 'err'); return; }
    var d = km - v.start_km;
    if (d > 1500 && draft.ack !== 'far') {
      draft.ack = 'far';
      RC.setMsg(m, 'Isso dá ' + RC.fmtKm(d) + ' km em uma rota. Confira o km final no painel.', 'warn');
      btn.textContent = 'Confirmar mesmo assim'; return;
    }
    busy = true; btn.disabled = true; RC.setMsg(m, 'Salvando…', 'warn');
    var path = null;
    try {
      path = await RC.uploadPhoto(profile.id, 'fim', draft.photo.blob);
      var r = await RC.sb.rpc('finish_route', { p_route: v.route_id, p_km: km, p_photo: path, p_notes: (draft.notes || '').trim() || null, p_lat: draft.loc ? draft.loc.lat : null, p_lng: draft.loc ? draft.loc.lng : null });
      if (r.error) throw r.error;
      RC.toast('Rota finalizada: ' + RC.fmtKm(d) + ' km');
      busy = false; setTab('v');
    } catch (e) {
      busy = false; btn.disabled = false;
      if (path) RC.removePhoto(path);
      RC.setMsg(m, RC.errText(e), 'err');
      loadBoard(false);
    }
  }
  function cancelBlock(v) {
    var holder = h('div');
    function showLink() {
      holder.replaceChildren(h('button', { class: 'link', type: 'button', onclick: showConfirm }, 'Errei o início: cancelar esta rota'));
    }
    function showConfirm() {
      holder.replaceChildren(h('div', { class: 'confirm' },
        h('div', null, 'Cancelar esta rota? Os dados do início serão apagados e o veículo volta para “No CD”.'),
        h('div', { class: 'acts' },
          h('button', {
            class: 'btn danger', type: 'button', onclick: async function () {
              if (busy) return; busy = true;
              var r = await RC.sb.rpc('cancel_route', { p_route: v.route_id });
              busy = false;
              if (r.error) { RC.toast(RC.errText(r.error)); return; }
              RC.removePhoto(v.start_photo);
              RC.toast('Rota cancelada'); setTab('v');
            }
          }, 'Sim, cancelar'),
          h('button', { class: 'btn ghost', type: 'button', onclick: showLink }, 'Voltar')
        )
      ));
    }
    showLink();
    return holder;
  }

  /* ---------- minhas rotas ---------- */
  async function renderMine() {
    $('tabV').setAttribute('aria-current', 'false');
    $('tabE').setAttribute('aria-current', 'false');
    $('tabM').setAttribute('aria-current', 'page');
    var box = $('view');
    box.replaceChildren(h('div', { class: 'empty' }, 'Carregando…'));
    var r = await RC.sb.from('routes').select('*').eq('driver_id', profile.id).order('start_at', { ascending: false }).limit(40);
    if (view.tab !== 'm') return;
    if (r.error) { box.replaceChildren(h('div', { class: 'empty' }, RC.errText(r.error))); return; }
    var list = r.data || [];
    var closed = list.filter(function (x) { return x.status === 'closed'; });
    var total = closed.reduce(function (a, x) { return a + x.km_driven; }, 0);
    var wrap = h('div', { class: 'list' });
    wrap.append(h('div', { class: 'tot' }, h('span', { class: 'hint' }, 'Últimas ' + closed.length + ' rotas finalizadas'), h('b', null, RC.fmtKm(total) + ' km')));
    if (!list.length) wrap.append(h('div', { class: 'empty' }, 'Você ainda não registrou nenhuma rota.'));
    list.forEach(function (x) {
      var open = x.status === 'open';
      wrap.append(h('div', { class: 'rrow' },
        h('div', { class: 'row' }, h('div', { class: 'row start' }, RC.plate(x.plate), h('strong', null, x.vehicle_name)), h('span', { class: 'pill ' + (open ? 'run' : 'free') }, open ? 'Em rota' : 'Finalizada')),
        h('div', { class: 'hint' }, RC.fmtDay(x.start_at) + ' · saída ' + RC.fmtTime(x.start_at) + (open ? '' : ' · chegada ' + RC.fmtTime(x.end_at))),
        h('div', { class: 'kms' }, h('span', null, RC.fmtKm(x.start_km)), open ? null : [h('span', null, '→'), h('span', null, RC.fmtKm(x.end_km)), h('span', { class: 'big' }, '= ' + RC.fmtKm(x.km_driven) + ' km')]),
        x.notes ? h('div', { class: 'hint' }, 'Obs.: ' + x.notes) : null
      ));
    });
    box.replaceChildren(wrap);
  }

  /* ---------- resumo da frota ---------- */
  var sumMonth = null;
  async function renderFleetSummary() {
    $('tabV').setAttribute('aria-current', 'false');
    var box = $('view');
    if (!sumMonth) sumMonth = RC.lastMonths(1)[0];
    box.replaceChildren(h('div', { class: 'empty' }, 'Carregando…'));
    try {
      var r = await RC.sb.rpc('fleet_summary', { p_month: sumMonth });
      if (view.tab !== 'r') return;
      if (r.error) throw r.error;
      var rows = (r.data || []).map(function (x) { return { plate: x.plate, name: x.vname, n: x.n_routes, km: Number(x.total_km) }; });
      var total = rows.reduce(function (a, x) { return a + x.km; }, 0);
      var count = rows.reduce(function (a, x) { return a + x.n; }, 0);
      var sel = h('select', { id: 'fMonth', class: 'input' });
      RC.lastMonths(12).forEach(function (k) { sel.append(h('option', { value: k }, RC.monthLabel(k))); });
      sel.value = sumMonth;
      sel.addEventListener('change', function () { sumMonth = sel.value; renderFleetSummary(); });
      var wrap = h('div', { class: 'list' });
      wrap.append(h('div', { class: 'tools' }, RC.lbl('fMonth', 'Mês', sel)));
      wrap.append(h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Km rodados'), h('b', null, RC.fmtKm(total))),
        h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Rotas'), h('b', null, String(count))),
        h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Média por rota'), h('b', null, count ? RC.fmtKm(Math.round(total / count)) : '0'))));
      if (!rows.length) wrap.append(h('div', { class: 'empty' }, 'Nenhuma rota finalizada neste mês.'));
      else {
        wrap.append(h('h2', null, 'Por veículo'));
        var max = rows.reduce(function (a, x) { return Math.max(a, x.km); }, 1);
        rows.forEach(function (x) {
          var bar = h('div', { class: 'bar' }, h('i'));
          bar.firstChild.style.width = Math.max(2, Math.round(x.km / max * 100)) + '%';
          wrap.append(h('div', { class: 'srow' },
            h('div', { class: 'nm' }, RC.plate(x.plate), h('strong', null, x.name)),
            h('div', { class: 'val' }, RC.fmtKm(x.km) + ' km · ' + x.n + (x.n === 1 ? ' rota' : ' rotas')),
            bar));
        });
      }
      box.replaceChildren(wrap);
    } catch (e) { if (view.tab === 'r') box.replaceChildren(h('div', { class: 'empty' }, RC.errText(e))); }
  }

  /* ---------- escala ---------- */
  async function renderSchedule() {
    $('tabV').setAttribute('aria-current', 'false');
    $('tabM').setAttribute('aria-current', 'false');
    $('tabE').setAttribute('aria-current', 'page');
    var box = $('view');
    box.replaceChildren(h('div', { class: 'empty' }, 'Carregando…'));
    try {
    var today = RC.todayISO();
    var r = await RC.sb.from('schedule').select('*').gte('day', today).lte('day', RC.addDays(today, 13)).order('day').order('sort');
    if (view.tab !== 'e') return;
    if (r.error) { box.replaceChildren(h('div', { class: 'empty' }, RC.errText(r.error))); return; }
    var rows = r.data || [];
    var wrap = h('div', { class: 'list' });
    var days = {};
    rows.forEach(function (e) { (days[e.day] = days[e.day] || []).push(e); });
    var mineToday = (days[today] || []).filter(function (e) { return e.driver_id === profile.id; }).length;
    if (mineToday) wrap.append(h('div', { class: 'hint' }, 'Você tem ' + mineToday + (mineToday === 1 ? ' rota' : ' rotas') + ' hoje. Toque em "Aceitar rota" para confirmar.'));
    var opts = {
      me: profile.id,
      onAccept: async function (e) {
        var ar = await RC.sb.rpc('accept_schedule', { p_id: e.id });
        if (ar.error) { RC.toast(RC.errText(ar.error)); renderSchedule(); return; }
        RC.toast('Rota aceita'); renderSchedule();
      }
    };
    wrap.append(RC.scheduleDay(today, days[today] || [], opts));
    Object.keys(days).filter(function (d) { return d !== today; }).sort().forEach(function (d) { wrap.append(RC.scheduleDay(d, days[d], opts)); });
    if (!rows.length) wrap.append(h('div', { class: 'empty' }, 'A coordenação ainda não montou a escala dos próximos dias.'));
    box.replaceChildren(wrap);
    } catch (e) { if (view.tab === 'e') box.replaceChildren(h('div', { class: 'empty' }, RC.errText(e))); }
  }

  /* ---------- começo ---------- */
  $('tabV').addEventListener('click', function () { setTab('v'); });
  $('tabM').addEventListener('click', function () { setTab('m'); });
  $('tabE').addEventListener('click', function () { setTab('e'); });
  $('tabR').addEventListener('click', function () { setTab('r'); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && profile && view.tab === 'v') loadBoard(false); });

  async function init() {
    if (!RC.configured) { RC.showConfigError($('view')); return; }
    RC.sb.auth.onAuthStateChange(function (ev) {
      if (ev === 'SIGNED_OUT' && profile) { profile = null; showLogin(); }
    });
    var p = await RC.loadProfile();
    if (p && p.active && (p.role === 'driver' || p.role === 'coord')) { profile = p; start(); return; }
    if (p) await RC.signOut();
    showLogin();
  }
  init();
})();
