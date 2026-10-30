// Página da coordenação: painel, histórico, resumo do mês, motoristas e veículos.
(function () {
  'use strict';
  var RC = window.RC, h = RC.h, $ = RC.$, sb = RC.sb;
  var profile = null;
  var view = { tab: 'p' };
  var flt = { month: '', vehicle: 'all', driver: 'all' };
  var cache = { month: '', routes: [] };
  var vehicles = [], people = [];
  var pollT = null;
  var TABS = ['P', 'E', 'H', 'R', 'M', 'V'];

  /* ---------- entrada e navegação ---------- */
  function showLogin() {
    clearInterval(pollT);
    $('who').hidden = true; $('tabs').hidden = true; RC.banner('');
    RC.loginView($('view'), { role: 'coord', onDone: function (p) { profile = p; start(); } });
  }
  function start() {
    $('who').hidden = false; $('tabs').hidden = false;
    $('who').replaceChildren(h('div', { class: 'whoin' },
      h('div', { class: 'nm' }, h('span', { class: 'lbl' }, 'Coordenação'), h('strong', null, profile.full_name)),
      h('button', { class: 'btn ghost', type: 'button', onclick: function () { RC.signOut(); } }, 'Sair')
    ));
    flt = { month: RC.lastMonths(1)[0], vehicle: 'all', driver: 'all' };
    setTab('p');
    clearInterval(pollT);
    pollT = setInterval(function () { if (!document.hidden && profile && view.tab === 'p' && !$('view').querySelector('details[open]')) renderPanel(); }, 30000);
  }
  function setTab(t) {
    view.tab = t;
    TABS.forEach(function (k) { $('tab' + k).setAttribute('aria-current', k.toLowerCase() === t ? 'page' : 'false'); });
    RC.banner('');
    ({ p: renderPanel, e: renderSchedule, h: function () { return renderHistory(true); }, r: renderSummary, m: renderPeople, v: renderVehicles })[t]();
  }
  function loading() { $('view').replaceChildren(h('div', { class: 'empty' }, 'Carregando…')); }
  function fail(e) { if (/permission|JWT/i.test((e && e.message) || '')) { RC.signOut(); return; } $('view').replaceChildren(h('div', { class: 'empty' }, RC.errText(e))); }

  /* ---------- dados ---------- */
  async function loadRoutes(month) {
    var rg = RC.monthRange(month);
    var r = await sb.from('routes').select('*').gte('start_at', rg.start).lt('start_at', rg.end).order('start_at', { ascending: false }).limit(2000);
    if (r.error) throw r.error;
    return r.data || [];
  }
  async function loadVehicles() {
    var r = await sb.from('vehicles').select('*').order('name');
    if (r.error) throw r.error;
    vehicles = r.data || [];
  }
  async function loadPeople() {
    var r = await sb.from('profiles').select('*').order('full_name');
    if (r.error) throw r.error;
    people = r.data || [];
  }
  async function manage(body) {
    var r = await sb.functions.invoke('manage-users', { body: body });
    if (r.error) {
      var msg = 'Não foi possível concluir. Tente de novo.';
      try { var j = await r.error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* mantém a mensagem padrão */ }
      throw new Error(msg);
    }
    if (r.data && r.data.error) throw new Error(r.data.error);
    return r.data;
  }
  function sum(rows) { return rows.reduce(function (a, x) { return a + (x.km_driven || 0); }, 0); }

  /* ---------- painel ---------- */
  // Lançamento manual: a coordenação sobe a foto e o km que o motorista mandou por fora do app.
  function nowLocalInput() {
    var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }
  function manualForm(v) {
    var open = !!v.route_id;
    var id = v.vehicle_id || v.id;
    var m = RC.msgBox();
    var drv = null;
    if (!open) {
      drv = h('select', { id: 'md_' + id, class: 'input' }, h('option', { value: '' }, 'Escolha o motorista'));
      people.filter(function (x) { return x.role === 'driver' && x.active; }).forEach(function (x) { drv.append(h('option', { value: x.id }, x.full_name)); });
    }
    var km = h('input', { id: 'mk_' + id, class: 'input', type: 'text', inputmode: 'numeric', placeholder: 'Km do odômetro' });
    var at = h('input', { id: 'ma_' + id, class: 'input', type: 'datetime-local', value: nowLocalInput() });
    var file = h('input', { id: 'mf_' + id, class: 'input', type: 'file', accept: 'image/*' });
    var nt = open ? h('input', { id: 'mn_' + id, class: 'input', type: 'text', maxlength: '200' }) : null;
    var send = h('button', { class: 'btn small', type: 'button' }, open ? 'Lançar fechamento' : 'Lançar início');
    send.addEventListener('click', async function () {
      var k = RC.parseKm(km.value), f = file.files && file.files[0], when = at.value ? new Date(at.value) : null;
      if (!open && !drv.value) { RC.setMsg(m, 'Escolha o motorista.', 'err'); return; }
      if (k == null) { RC.setMsg(m, 'Digite o km só com números.', 'err'); return; }
      if (!when || isNaN(when)) { RC.setMsg(m, 'Informe a data e a hora.', 'err'); return; }
      if (!f) { RC.setMsg(m, 'Escolha a foto do odômetro.', 'err'); return; }
      send.disabled = true; RC.setMsg(m, 'Enviando…', 'warn');
      var path = null;
      try {
        var ph = await RC.compress(f, null, { at: when });
        path = await RC.uploadPhoto(profile.id, open ? 'fim' : 'inicio', ph.blob);
        var r = open
          ? await sb.rpc('coord_finish_route', { p_route: v.route_id, p_km: k, p_photo: path, p_notes: nt.value.trim() || null, p_at: when.toISOString() })
          : await sb.rpc('coord_start_route', { p_vehicle: id, p_driver: drv.value, p_km: k, p_photo: path, p_at: when.toISOString() });
        if (r.error) throw r.error;
        RC.toast(open ? 'Fechamento lançado' : 'Início lançado');
        renderPanel();
      } catch (e) {
        if (path) RC.removePhoto(path);
        RC.setMsg(m, RC.errText(e), 'err'); send.disabled = false;
      }
    });
    return h('details', { class: 'item' },
      h('summary', null, open ? 'Lançar fechamento manual' : 'Lançar início manual'),
      h('div', { class: 'body' },
        drv ? RC.lbl('md_' + id, 'Motorista', drv) : null,
        RC.lbl('mk_' + id, open ? 'Km final' : 'Km inicial', km),
        RC.lbl('ma_' + id, open ? 'Data e hora da chegada' : 'Data e hora da saída', at),
        RC.lbl('mf_' + id, 'Foto do odômetro', file),
        nt ? RC.lbl('mn_' + id, 'Observações', nt) : null,
        m,
        h('div', { class: 'acts' }, send),
        h('div', { class: 'hint' }, 'Use quando o motorista não conseguir usar o app e mandar a foto e o km por outro meio. O registro fica marcado como lançado pela coordenação.')
      ));
  }

  async function renderPanel() {
    if (view.tab !== 'p') return;
    try {
      var results = await Promise.all([sb.rpc('vehicle_board'), loadRoutes(RC.lastMonths(1)[0]), loadPeople(), sb.from('schedule').select('*').eq('day', RC.todayISO()).order('sort')]);
      if (view.tab !== 'p') return;
      if (results[0].error) throw results[0].error;
      var board = results[0].data || [], rows = results[1];
      var todaySched = (results[3] && !results[3].error && results[3].data) || [];
      var withDriver = todaySched.filter(function (e) { return e.driver_id; });
      var acceptedN = withDriver.filter(function (e) { return e.accepted_at; }).length;
      var today = new Date().toLocaleDateString('sv-SE', { timeZone: RC.TZ });
      var todayRows = rows.filter(function (x) { return new Date(x.start_at).toLocaleDateString('sv-SE', { timeZone: RC.TZ }) === today; });
      var running = board.filter(function (v) { return v.route_id; }).length;
      var grid = h('div', { class: 'board' });
      board.forEach(function (v) {
        var open = !!v.route_id;
        var meta = open ? 'Saiu ' + RC.fmtTime(v.start_at) + ' · ' + v.driver_name + ' · km ' + RC.fmtKm(v.start_km)
          : (v.last_km != null ? 'Último km: ' + RC.fmtKm(v.last_km) : 'Sem rotas registradas');
        grid.append(h('div', { class: 'vcard' },
          h('div', { class: 'row' }, RC.plate(v.plate), h('span', { class: 'pill ' + (open ? 'run' : 'free') }, open ? 'Em rota' : 'No CD')),
          h('div', { class: 'vname' }, v.name),
          h('div', { class: 'vmeta' }, meta),
          open ? h('button', { class: 'btn ghost', type: 'button', onclick: function () { RC.showPhoto(v.start_photo, 'Odômetro na saída · ' + v.plate); } }, 'Foto da saída') : null,
          manualForm(v)
        ));
      });
      $('view').replaceChildren(h('div', { class: 'list' },
        h('div', { class: 'stats' },
          h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Em rota agora'), h('b', null, String(running))),
          h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Rotas hoje'), h('b', null, String(todayRows.length))),
          h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Km no mês'), h('b', null, RC.fmtKm(sum(rows))))
        ),
        todaySched.length ? h('div', { class: 'list' },
          h('h2', null, 'Escala de hoje' + (withDriver.length ? ' · ' + acceptedN + ' de ' + withDriver.length + ' aceitas' : '')),
          RC.scheduleDay(RC.todayISO(), todaySched, { showDriver: true })) : null,
        board.length ? grid : h('div', { class: 'empty' }, 'Nenhum veículo ativo. Cadastre na aba Veículos.')
      ));
    } catch (e) { fail(e); }
  }


  /* ---------- escala ---------- */
  var schedWeek = null;
  var LABELS = ['ALMOX MANHÃ', 'ALMOX TARDE', 'CAF'];
  async function renderSchedule() {
    if (view.tab !== 'e') return;
    if (!schedWeek) schedWeek = RC.weekMonday(RC.todayISO());
    try {
      var from = schedWeek, to = RC.addDays(schedWeek, 6);
      var res = await Promise.all([
        sb.from('schedule').select('*').gte('day', from).lte('day', to).order('sort'),
        sb.from('vehicles').select('*').eq('active', true).order('name'),
        loadPeople()
      ]);
      if (view.tab !== 'e') return;
      if (res[0].error) throw res[0].error;
      if (res[1].error) throw res[1].error;
      var entries = res[0].data || [], vs = res[1].data || [];
      var drivers = people.filter(function (x) { return x.role === 'driver' && x.active; });
      var msg = RC.msgBox();
      var dl = h('datalist', { id: 'escLabels' });
      var seen = {};
      LABELS.concat(entries.map(function (e) { return e.label; })).forEach(function (l) { if (!seen[l]) { seen[l] = 1; dl.append(h('option', { value: l })); } });

      var nav = h('div', { class: 'weeknav' },
        h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Semana anterior', onclick: function () { schedWeek = RC.addDays(schedWeek, -7); renderSchedule(); } }, '‹'),
        h('b', null, 'Semana ' + RC.shortDate(from) + ' a ' + RC.shortDate(RC.addDays(from, 5))),
        h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Próxima semana', onclick: function () { schedWeek = RC.addDays(schedWeek, 7); renderSchedule(); } }, '›')
      );
      var copyBtn = h('button', {
        class: 'btn ghost', type: 'button', onclick: async function () {
          if (entries.length) { RC.setMsg(msg, 'Esta semana já tem rotas. Apague as rotas antes de copiar a semana anterior.', 'err'); return; }
          copyBtn.disabled = true;
          try {
            var pr = await sb.from('schedule').select('*').gte('day', RC.addDays(from, -7)).lte('day', RC.addDays(from, -1));
            if (pr.error) throw pr.error;
            if (!(pr.data || []).length) { RC.setMsg(msg, 'A semana anterior não tem rotas para copiar.', 'warn'); copyBtn.disabled = false; return; }
            var rows = pr.data.map(function (e) {
              var v = vs.filter(function (x) { return x.id === e.vehicle_id; })[0];
              var d = drivers.filter(function (x) { return x.id === e.driver_id; })[0];
              return { day: RC.addDays(e.day, 7), label: e.label, time_text: e.time_text, vehicle_id: v ? v.id : null, plate: v ? v.plate : e.plate, kind: v ? v.kind : e.kind, driver_id: d ? d.id : null, driver_name: d ? d.full_name : null, sort: e.sort };
            });
            var ins = await sb.from('schedule').insert(rows);
            if (ins.error) throw ins.error;
            RC.toast('Semana copiada'); renderSchedule();
          } catch (e) { RC.setMsg(msg, RC.errText(e), 'err'); copyBtn.disabled = false; }
        }
      }, 'Copiar a semana anterior');

      var wrap = h('div', { class: 'list' }, nav, h('div', null, copyBtn), msg, dl,
        h('div', { class: 'hint' }, 'Monte a escala de cada dia. Os motoristas veem na aba Escala do app. Dica: use "Copiar a semana anterior" e ajuste só o que mudou.'));
      for (var i = 0; i < 6; i++) wrap.append(dayBlock(RC.addDays(from, i)));
      $('view').replaceChildren(wrap);
      $('view').style.display = ''; 

      function dayBlock(iso) {
        var dayEntries = entries.filter(function (e) { return e.day === iso; });
        var card = RC.scheduleDay(iso, dayEntries, {
          showDriver: true,
          onRemove: async function (e) {
            var r = await sb.from('schedule').delete().eq('id', e.id);
            if (r.error) { RC.toast(RC.errText(r.error)); return; }
            RC.toast('Rota removida da escala'); renderSchedule();
          }
        });
        var id = iso.replace(/-/g, '');
        var m = RC.msgBox();
        var lab = h('input', { id: 'el_' + id, class: 'input', type: 'text', maxlength: '30', list: 'escLabels', placeholder: 'Ex.: ALMOX MANHÃ, CAF' });
        var tm = h('input', { id: 'et_' + id, class: 'input', type: 'text', maxlength: '12', placeholder: 'Ex.: 11H (opcional)' });
        var vsel = h('select', { id: 'ev_' + id, class: 'input' }, h('option', { value: '' }, 'Escolha o veículo'));
        vs.forEach(function (v) { vsel.append(h('option', { value: v.id }, v.plate + ' · ' + v.name)); });
        var dsel = h('select', { id: 'ed_' + id, class: 'input' }, h('option', { value: '' }, 'Sem motorista definido'));
        drivers.forEach(function (d) { dsel.append(h('option', { value: d.id }, d.full_name)); });
        var add = h('button', { class: 'btn small', type: 'button' }, 'Adicionar à escala');
        add.addEventListener('click', async function () {
          var label = lab.value.trim().toUpperCase();
          if (!label) { RC.setMsg(m, 'Escreva o destino ou turno (ex.: CAF).', 'err'); return; }
          var v = vs.filter(function (x) { return x.id === vsel.value; })[0];
          if (!v) { RC.setMsg(m, 'Escolha o veículo.', 'err'); return; }
          var d = drivers.filter(function (x) { return x.id === dsel.value; })[0];
          add.disabled = true;
          var r = await sb.from('schedule').insert({ day: iso, label: label, time_text: tm.value.trim().toUpperCase() || null, vehicle_id: v.id, plate: v.plate, kind: v.kind, driver_id: d ? d.id : null, driver_name: d ? d.full_name : null, sort: dayEntries.length });
          if (r.error) { RC.setMsg(m, RC.errText(r.error), 'err'); add.disabled = false; return; }
          RC.toast('Adicionado à escala'); renderSchedule();
        });
        card.append(h('details', { class: 'esc-add' },
          h('summary', null, '+ Adicionar rota neste dia'),
          h('div', { class: 'body' },
            RC.lbl('el_' + id, 'Destino ou turno', lab),
            RC.lbl('et_' + id, 'Horário', tm),
            RC.lbl('ev_' + id, 'Veículo', vsel),
            RC.lbl('ed_' + id, 'Motorista', dsel),
            m, h('div', { class: 'acts' }, add))
        ));
        return card;
      }
    } catch (e) { fail(e); }
  }

  /* ---------- histórico ---------- */
  function monthSelect(onChange) {
    var sel = h('select', { id: 'fMonth', class: 'input' });
    RC.lastMonths(12).forEach(function (k) { sel.append(h('option', { value: k }, RC.monthLabel(k))); });
    sel.value = flt.month;
    sel.addEventListener('change', function () { flt.month = sel.value; onChange(); });
    return RC.lbl('fMonth', 'Mês', sel);
  }
  async function renderHistory(reload) {
    if (view.tab !== 'h') return;
    try {
      if (reload || cache.month !== flt.month) { loading(); await loadVehicles(); cache = { month: flt.month, routes: await loadRoutes(flt.month) }; }
      if (view.tab !== 'h') return;
      var rows = cache.routes.filter(function (x) {
        return (flt.vehicle === 'all' || x.vehicle_id === flt.vehicle) && (flt.driver === 'all' || x.driver_id === flt.driver);
      });
      var vSel = h('select', { id: 'fVeh', class: 'input' }, h('option', { value: 'all' }, 'Todos'));
      vehicles.forEach(function (v) { vSel.append(h('option', { value: v.id }, v.name + ' · ' + v.plate)); });
      vSel.value = flt.vehicle;
      vSel.addEventListener('change', function () { flt.vehicle = vSel.value; renderHistory(false); });
      var names = {};
      cache.routes.forEach(function (x) { names[x.driver_id] = x.driver_name; });
      var dSel = h('select', { id: 'fDrv', class: 'input' }, h('option', { value: 'all' }, 'Todos'));
      Object.keys(names).sort(function (a, b) { return names[a].localeCompare(names[b], 'pt-BR'); }).forEach(function (id) { dSel.append(h('option', { value: id }, names[id])); });
      dSel.value = names[flt.driver] ? flt.driver : 'all';
      dSel.addEventListener('change', function () { flt.driver = dSel.value; renderHistory(false); });
      var tools = h('div', { class: 'tools' },
        monthSelect(function () { renderHistory(false); }),
        RC.lbl('fVeh', 'Veículo', vSel),
        RC.lbl('fDrv', 'Motorista', dSel)
      );
      var closed = rows.filter(function (x) { return x.status === 'closed'; });
      var wrap = h('div', { class: 'list' });
      wrap.append(h('div', { class: 'tot' }, h('span', { class: 'hint' }, closed.length + ' rotas finalizadas'), h('b', null, RC.fmtKm(sum(rows)) + ' km')));
      if (rows.length) {
        wrap.append(h('div', null, h('button', {
          class: 'btn ghost', type: 'button', onclick: function () {
            var out = [['Data', 'Placa', 'Veículo', 'Motorista', 'Saída', 'Chegada', 'Km inicial', 'Km final', 'Km rodado', 'Situação', 'Observações', 'Local da saída', 'Local da chegada']];
            rows.slice().reverse().forEach(function (x) {
              out.push([RC.fmtFull(x.start_at), x.plate, x.vehicle_name, x.driver_name, RC.fmtTime(x.start_at), x.end_at ? RC.fmtTime(x.end_at) : '', x.start_km, x.end_km == null ? '' : x.end_km, x.km_driven == null ? '' : x.km_driven, x.status === 'open' ? 'Em rota' : 'Finalizada', x.notes || '', x.start_lat == null ? '' : RC.mapUrl(x.start_lat, x.start_lng), x.end_lat == null ? '' : RC.mapUrl(x.end_lat, x.end_lng)]);
            });
            RC.saveCsv('rotas-cd-' + flt.month, out);
          }
        }, 'Baixar planilha (CSV)')));
        wrap.append(xlsxBlock());
      } else {
        wrap.append(h('div', { class: 'empty' }, 'Nenhuma rota neste filtro.'));
      }
      rows.forEach(function (x) { wrap.append(routeRow(x)); });
      $('view').replaceChildren(tools, wrap);
      $('view').style.display = 'flex'; $('view').style.flexDirection = 'column'; $('view').style.gap = '16px';
    } catch (e) { fail(e); }
  }
  // Preenche a planilha de controle de KM da coordenação (um arquivo .xlsx escolhido no computador).
  function xlsxBlock() {
    var xm = RC.msgBox();
    var inp = h('input', { id: 'xlsxIn', type: 'file', accept: '.xlsx', hidden: true });
    var btn = h('button', { class: 'btn ghost', type: 'button', onclick: function () { inp.click(); } }, 'Preencher minha planilha de controle (.xlsx)');
    inp.addEventListener('change', async function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      btn.disabled = true; RC.setMsg(xm, 'Preenchendo a planilha de ' + RC.monthLabel(flt.month) + '…', 'warn');
      try {
        var fresh = await loadRoutes(flt.month);
        var out = await RC.fillFromFile(f, flt.month, fresh, vehicles, RC.TZ);
        var name = f.name.replace(/\.xlsx$/i, '') + '-' + flt.month + '.xlsx';
        RC.saveBlob(new Blob([out.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
        RC.setMsg(xm, RC.fillSummary(out.report, RC.monthLabel(flt.month)), out.report.noColumn.length || out.report.warnings.length || out.report.overwritten ? 'warn' : 'ok');
      } catch (e) { RC.setMsg(xm, RC.errText(e), 'err'); }
      btn.disabled = false;
    });
    return h('div', { class: 'list' }, btn, inp,
      h('div', { class: 'hint' }, 'Escolha o arquivo da sua planilha (a de controle de KM da frota). O sistema preenche o KM Início e o KM Final de cada dia do mês selecionado e devolve o arquivo no mesmo formato. A planilha não sai do seu computador.'),
      xm);
  }
  function routeRow(x) {
    var open = x.status === 'open';
    var m = RC.msgBox();
    var sk = h('input', { id: 'sk_' + x.id, class: 'input', type: 'text', inputmode: 'numeric', value: String(x.start_km) });
    var ek = open ? null : h('input', { id: 'ek_' + x.id, class: 'input', type: 'text', inputmode: 'numeric', value: String(x.end_km) });
    var nt = h('input', { id: 'nt_' + x.id, class: 'input', type: 'text', maxlength: '200', value: x.notes || '' });
    var del = h('div');
    function showDel() { del.replaceChildren(h('button', { class: 'link', type: 'button', onclick: confirmDel }, 'Excluir esta rota')); }
    function confirmDel() {
      del.replaceChildren(h('div', { class: 'confirm' },
        h('div', null, 'Excluir esta rota e as fotos dela? Isso não pode ser desfeito.'),
        h('div', { class: 'acts' },
          h('button', {
            class: 'btn danger', type: 'button', onclick: async function () {
              var r = await sb.from('routes').delete().eq('id', x.id);
              if (r.error) { RC.toast(RC.errText(r.error)); return; }
              var paths = [x.start_photo, x.end_photo].filter(Boolean);
              if (paths.length) sb.storage.from(RC.cfg.BUCKET).remove(paths).catch(function () {});
              RC.toast('Rota excluída'); renderHistory(true);
            }
          }, 'Sim, excluir'),
          h('button', { class: 'btn ghost', type: 'button', onclick: showDel }, 'Voltar')
        )));
    }
    showDel();
    var details = h('details', { class: 'item' },
      h('summary', null, 'Corrigir km ou observação'),
      h('div', { class: 'body' },
        RC.lbl('sk_' + x.id, 'Km inicial', sk),
        ek ? RC.lbl('ek_' + x.id, 'Km final', ek) : null,
        RC.lbl('nt_' + x.id, 'Observações', nt),
        m,
        h('div', { class: 'acts' }, h('button', {
          class: 'btn small', type: 'button', onclick: async function () {
            var s = RC.parseKm(sk.value), e = ek ? RC.parseKm(ek.value) : null;
            if (s == null || (ek && e == null)) { RC.setMsg(m, 'Digite os km só com números.', 'err'); return; }
            if (ek && e < s) { RC.setMsg(m, 'O km final não pode ser menor que o inicial.', 'err'); return; }
            var upd = { start_km: s, notes: nt.value.trim() || null };
            if (ek) upd.end_km = e;
            var r = await sb.from('routes').update(upd).eq('id', x.id);
            if (r.error) { RC.setMsg(m, RC.errText(r.error), 'err'); return; }
            RC.toast('Rota corrigida'); renderHistory(true);
          }
        }, 'Salvar correção')),
        del
      )
    );
    return h('div', { class: 'rrow' },
      h('div', { class: 'row' }, h('div', { class: 'row start' }, RC.plate(x.plate), h('strong', null, x.vehicle_name)), h('span', { class: 'pill ' + (open ? 'run' : 'free') }, open ? 'Em rota' : 'Finalizada')),
      h('div', { class: 'hint' }, RC.fmtDay(x.start_at) + ' · ' + x.driver_name + ' · saída ' + RC.fmtTime(x.start_at) + (open ? '' : ' · chegada ' + RC.fmtTime(x.end_at))),
      h('div', { class: 'kms' }, h('span', null, RC.fmtKm(x.start_km)), open ? null : [h('span', null, '→'), h('span', null, RC.fmtKm(x.end_km)), h('span', { class: 'big' }, '= ' + RC.fmtKm(x.km_driven) + ' km')]),
      x.notes ? h('div', { class: 'hint' }, 'Obs.: ' + x.notes) : null,
      (x.start_by || x.end_by) ? h('div', { class: 'hint' }, 'Lançado pela coordenação' + (x.start_by && x.end_by ? ' (saída e chegada)' : x.start_by ? ' (saída)' : ' (chegada)')) : null,
      h('div', { class: 'photos' },
        x.start_photo ? h('button', { class: 'btn ghost', type: 'button', onclick: function () { RC.showPhoto(x.start_photo, 'Saída · ' + x.plate + ' · km ' + RC.fmtKm(x.start_km)); } }, 'Foto da saída') : null,
        x.end_photo ? h('button', { class: 'btn ghost', type: 'button', onclick: function () { RC.showPhoto(x.end_photo, 'Chegada · ' + x.plate + ' · km ' + RC.fmtKm(x.end_km)); } }, 'Foto da chegada') : null,
        x.start_lat != null ? h('a', { class: 'btn ghost', href: RC.mapUrl(x.start_lat, x.start_lng), target: '_blank', rel: 'noopener' }, 'Mapa da saída') : null,
        x.end_lat != null ? h('a', { class: 'btn ghost', href: RC.mapUrl(x.end_lat, x.end_lng), target: '_blank', rel: 'noopener' }, 'Mapa da chegada') : null,
        x.start_lat == null && x.end_lat == null ? h('span', { class: 'hint' }, 'Sem localização') : null
      ),
      details
    );
  }

  /* ---------- resumo do mês ---------- */
  async function renderSummary() {
    if (view.tab !== 'r') return;
    try {
      loading();
      var rows = await loadRoutes(flt.month);
      if (view.tab !== 'r') return;
      var done = rows.filter(function (x) { return x.status === 'closed'; });
      var byV = {}, byD = {};
      done.forEach(function (x) {
        var a = byV[x.vehicle_id] || (byV[x.vehicle_id] = { plate: x.plate, name: x.vehicle_name, n: 0, km: 0 }); a.n++; a.km += x.km_driven;
        var b = byD[x.driver_id] || (byD[x.driver_id] = { name: x.driver_name, n: 0, km: 0 }); b.n++; b.km += x.km_driven;
      });
      function toList(o) { return Object.keys(o).map(function (k) { return o[k]; }).sort(function (a, b) { return b.km - a.km; }); }
      var vRows = toList(byV), dRows = toList(byD), total = sum(done);
      var tools = h('div', { class: 'tools' }, monthSelect(renderSummary));
      if (done.length) {
        tools.append(h('button', {
          class: 'btn ghost', type: 'button', onclick: function () {
            var out = [['Mês', 'Placa', 'Veículo', 'Rotas', 'Km rodados']];
            vRows.forEach(function (x) { out.push([RC.monthLabel(flt.month), x.plate, x.name, x.n, x.km]); });
            out.push([RC.monthLabel(flt.month), 'TOTAL', '', done.length, total]);
            RC.saveCsv('resumo-' + flt.month, out);
          }
        }, 'Baixar resumo (CSV)'));
      }
      var wrap = h('div', { class: 'list' });
      wrap.append(h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Km rodados'), h('b', null, RC.fmtKm(total))),
        h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Rotas'), h('b', null, String(done.length))),
        h('div', { class: 'stat' }, h('span', { class: 'lbl' }, 'Média por rota'), h('b', null, done.length ? RC.fmtKm(Math.round(total / done.length)) : '0'))
      ));
      if (!done.length) wrap.append(h('div', { class: 'empty' }, 'Nenhuma rota finalizada neste mês.'));
      function section(title, list, withPlate) {
        var max = list.reduce(function (a, x) { return Math.max(a, x.km); }, 1);
        wrap.append(h('h2', null, title));
        list.forEach(function (x) {
          var bar = h('div', { class: 'bar' }, h('i'));
          bar.firstChild.style.width = Math.max(2, Math.round(x.km / max * 100)) + '%';
          wrap.append(h('div', { class: 'srow' },
            h('div', { class: 'nm' }, withPlate ? RC.plate(x.plate) : null, h('strong', null, x.name)),
            h('div', { class: 'val' }, RC.fmtKm(x.km) + ' km · ' + x.n + (x.n === 1 ? ' rota' : ' rotas')),
            bar));
        });
      }
      if (done.length) { section('Por veículo', vRows, true); section('Por motorista', dRows, false); }
      $('view').replaceChildren(tools, wrap);
      $('view').style.display = 'flex'; $('view').style.flexDirection = 'column'; $('view').style.gap = '16px';
    } catch (e) { fail(e); }
  }

  /* ---------- motoristas ---------- */
  async function renderPeople() {
    if (view.tab !== 'm') return;
    try {
      loading(); await Promise.all([loadPeople(), loadVehicles()]);
      if (view.tab !== 'm') return;
      var vname = {}; vehicles.forEach(function (v) { vname[v.id] = v.name + ' · ' + v.plate; });
      function vehicleSelect(id, current) {
        var sel = h('select', { id: id, class: 'input' }, h('option', { value: '' }, 'Todos os veículos (sem restrição)'));
        vehicles.filter(function (v) { return v.active || v.id === current; }).forEach(function (v) { sel.append(h('option', { value: v.id }, vname[v.id] + (v.active ? '' : ' (inativo)'))); });
        sel.value = current || '';
        return sel;
      }
      var wrap = h('div', { class: 'list' });
      wrap.append(h('h2', null, 'Novo motorista'));
      var fm = RC.msgBox();
      var fn = h('input', { id: 'newFull', class: 'input', type: 'text', maxlength: '60', placeholder: 'Ex.: João Pedro da Silva', autocomplete: 'off' });
      var fu = h('input', { id: 'newUser', class: 'input', type: 'text', maxlength: '30', placeholder: 'joao.pedro', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
      var fp = h('input', { id: 'newPass', class: 'input', type: 'text', maxlength: '72', placeholder: 'Mínimo 6 caracteres', autocomplete: 'off' });
      var fv = vehicleSelect('newVeh', '');
      var fb = h('button', { class: 'btn', type: 'submit' }, 'Cadastrar motorista');
      wrap.append(h('form', {
        class: 'card', onsubmit: async function (ev) {
          ev.preventDefault();
          fb.disabled = true; RC.setMsg(fm, 'Cadastrando…', 'warn');
          try {
            var made = await manage({ action: 'create_driver', full_name: fn.value, username: fu.value, password: fp.value });
            if (fv.value && made && made.id) {
              var av = await sb.rpc('assign_vehicle', { p_user: made.id, p_vehicle: fv.value });
              if (av.error) { RC.toast('Motorista cadastrado, mas o veículo não foi definido. Defina na lista abaixo.'); renderPeople(); return; }
            }
            RC.toast('Motorista cadastrado'); renderPeople();
          } catch (e) { fb.disabled = false; RC.setMsg(fm, RC.errText(e), 'err'); }
        }
      },
        h('div', { class: 'hint' }, 'O motorista entra com o usuário e a senha abaixo. Anote a senha para entregar a ele: ela não pode ser consultada depois, só redefinida.'),
        RC.lbl('newFull', 'Nome completo', fn),
        h('div', { class: 'two' }, RC.lbl('newUser', 'Usuário', fu), RC.lbl('newPass', 'Senha', fp)),
        RC.lbl('newVeh', 'Veículo do motorista', fv),
        h('div', { class: 'hint' }, 'O motorista só vê e só inicia rota nesse veículo. Deixe “Todos” para um motorista que reveza entre os veículos.'),
        fm, fb));
      wrap.append(h('h2', null, 'Acessos'));
      people.forEach(function (p) {
        var m = RC.msgBox();
        var np = h('input', { id: 'pw_' + p.id, class: 'input', type: 'text', maxlength: '72', placeholder: 'Nova senha (mínimo 6 caracteres)', autocomplete: 'off' });
        var me = p.id === profile.id;
        var vs = p.role === 'coord' ? null : vehicleSelect('veh_' + p.id, p.vehicle_id);
        wrap.append(h('details', { class: 'item' },
          h('summary', null, h('span', null, p.full_name), h('span', { class: 'hint' }, '@' + p.username),
            p.role === 'coord' ? h('span', { class: 'pill free' }, 'Coordenação') : h('span', { class: 'hint' }, p.vehicle_id && vname[p.vehicle_id] ? vname[p.vehicle_id] : 'Todos os veículos'),
            h('span', { class: 'pill ' + (p.active ? 'free' : 'off') }, p.active ? 'Ativo' : 'Inativo')),
          h('div', { class: 'body' },
            p.role === 'coord' ? null : [
              RC.lbl('veh_' + p.id, 'Veículo do motorista', vs),
              h('div', { class: 'acts' }, h('button', {
                class: 'btn small', type: 'button', onclick: async function () {
                  var r = await sb.rpc('assign_vehicle', { p_user: p.id, p_vehicle: vs.value || null });
                  if (r.error) { RC.setMsg(m, RC.errText(r.error), 'err'); return; }
                  RC.toast('Veículo salvo'); renderPeople();
                }
              }, 'Salvar veículo'))
            ],
            RC.lbl('pw_' + p.id, 'Redefinir senha', np), m,
            h('div', { class: 'acts' },
              h('button', {
                class: 'btn small', type: 'button', onclick: async function () {
                  try { await manage({ action: 'reset_password', user_id: p.id, password: np.value }); np.value = ''; RC.setMsg(m, 'Senha redefinida.', 'ok'); }
                  catch (e) { RC.setMsg(m, RC.errText(e), 'err'); }
                }
              }, 'Salvar nova senha'),
              me ? null : h('button', {
                class: 'btn ghost', type: 'button', onclick: async function () {
                  try { await manage({ action: 'set_active', user_id: p.id, active: !p.active }); RC.toast(p.active ? 'Acesso desativado' : 'Acesso reativado'); renderPeople(); }
                  catch (e) { RC.setMsg(m, RC.errText(e), 'err'); }
                }
              }, p.active ? 'Desativar acesso' : 'Reativar acesso')
            ))));
      });
      $('view').replaceChildren(wrap);
    } catch (e) { fail(e); }
  }

  /* ---------- veículos ---------- */

  function kindSelect(id, cur) {
    var k = h('select', { id: id, class: 'input' });
    [['van', 'Van'], ['caminhao', 'Caminhão'], ['moto', 'Moto']].forEach(function (o) { k.append(h('option', { value: o[0] }, o[1])); });
    k.value = cur || 'van';
    return k;
  }
  async function renderVehicles() {
    if (view.tab !== 'v') return;
    try {
      loading(); await loadVehicles();
      if (view.tab !== 'v') return;
      var wrap = h('div', { class: 'list' });
      wrap.append(h('h2', null, 'Novo veículo'));
      var vm = RC.msgBox();
      var vp = h('input', { id: 'newPlate', class: 'input', type: 'text', maxlength: '7', placeholder: 'ABC1D23', autocapitalize: 'characters', autocomplete: 'off' });
      var vk = kindSelect('newKind', 'van');
      var vn = h('input', { id: 'newName', class: 'input', type: 'text', maxlength: '30', placeholder: 'Ex.: Van 1', autocomplete: 'off' });
      wrap.append(h('form', {
        class: 'card', onsubmit: async function (ev) {
          ev.preventDefault();
          var pl = RC.normPlate(vp.value), nm = vn.value.trim();
          if (pl.length < 3) { RC.setMsg(vm, 'Informe a placa (pelo menos 3 caracteres).', 'err'); return; }
          if (!nm) { RC.setMsg(vm, 'Informe o nome do veículo.', 'err'); return; }
          var r = await sb.from('vehicles').insert({ plate: pl, name: nm, kind: vk.value });
          if (r.error) { RC.setMsg(vm, /duplicate|unique/i.test(r.error.message) ? 'Essa placa já está cadastrada.' : RC.errText(r.error), 'err'); return; }
          RC.toast('Veículo cadastrado'); renderVehicles();
        }
      }, RC.lbl('newPlate', 'Placa', vp), RC.lbl('newName', 'Nome do veículo', vn), RC.lbl('newKind', 'Tipo (define a imagem na escala)', vk), vm, h('button', { class: 'btn', type: 'submit' }, 'Cadastrar veículo')));
      wrap.append(h('h2', null, 'Veículos cadastrados'));
      vehicles.forEach(function (v) {
        var m = RC.msgBox();
        var ep = h('input', { id: 'ep_' + v.id, class: 'input', type: 'text', maxlength: '7', value: v.plate, autocapitalize: 'characters', autocomplete: 'off' });
        var ek = kindSelect('ek_' + v.id, v.kind);
        var en = h('input', { id: 'en_' + v.id, class: 'input', type: 'text', maxlength: '30', value: v.name, autocomplete: 'off' });
        wrap.append(h('details', { class: 'item' },
          h('summary', null, RC.plate(v.plate), h('span', null, v.name), h('span', { class: 'pill ' + (v.active ? 'free' : 'off') }, v.active ? 'Ativo' : 'Inativo')),
          h('div', { class: 'body' },
            RC.lbl('ep_' + v.id, 'Placa', ep), RC.lbl('en_' + v.id, 'Nome', en), RC.lbl('ek_' + v.id, 'Tipo', ek), m,
            h('div', { class: 'acts' },
              h('button', {
                class: 'btn small', type: 'button', onclick: async function () {
                  var pl = RC.normPlate(ep.value), nm = en.value.trim();
                  if (pl.length < 3 || !nm) { RC.setMsg(m, 'Informe a placa e o nome.', 'err'); return; }
                  var r = await sb.from('vehicles').update({ plate: pl, name: nm, kind: ek.value }).eq('id', v.id);
                  if (r.error) { RC.setMsg(m, /duplicate|unique/i.test(r.error.message) ? 'Essa placa já está cadastrada.' : RC.errText(r.error), 'err'); return; }
                  RC.toast('Veículo atualizado'); renderVehicles();
                }
              }, 'Salvar'),
              h('button', {
                class: 'btn ghost', type: 'button', onclick: async function () {
                  var r = await sb.from('vehicles').update({ active: !v.active }).eq('id', v.id);
                  if (r.error) { RC.setMsg(m, RC.errText(r.error), 'err'); return; }
                  RC.toast(v.active ? 'Veículo desativado' : 'Veículo reativado'); renderVehicles();
                }
              }, v.active ? 'Desativar' : 'Reativar')
            ))));
      });
      $('view').replaceChildren(wrap);
    } catch (e) { fail(e); }
  }

  /* ---------- começo ---------- */
  TABS.forEach(function (k) { $('tab' + k).addEventListener('click', function () { if (profile) setTab(k.toLowerCase()); }); });
  async function init() {
    if (!RC.configured) { RC.showConfigError($('view')); return; }
    sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT' && profile) { profile = null; showLogin(); } });
    var p = await RC.loadProfile();
    if (p && p.active && p.role === 'coord') { profile = p; start(); return; }
    if (p) await RC.signOut();
    showLogin();
  }
  init();
})();
