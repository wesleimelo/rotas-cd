/* Rotas do CD: preenche a planilha de controle de KM da coordenação.
 *
 * A coordenação escolhe o arquivo .xlsx dela (um modelo com uma aba por mês e uma coluna por veículo).
 * Este código procura a aba do mês, acha a coluna de cada veículo pela placa, escreve o KM Início e o
 * KM Final de cada dia e devolve o mesmo arquivo, com formato e fórmulas preservados.
 * Tudo roda no navegador: o arquivo da planilha não é enviado para lugar nenhum.
 */
(function (root) {
  'use strict';

  var EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';

  function isDate(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
  function norm(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function plain(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  // Texto de uma célula (inclui texto formatado e resultado de fórmula).
  function cellText(cell) {
    var v = cell.value;
    if (v == null) return '';
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map(function (t) { return t.text; }).join('');
      if (v.result != null) return String(v.result);
      if (v.text != null) return String(v.text);
      if (isDate(v)) return '';
    }
    return String(v);
  }

  // Data de uma célula da coluna A: devolve { y, m, d } ou null.
  function cellDate(cell) {
    var v = cell.value;
    if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
    if (isDate(v)) return { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate() };
    if (typeof v === 'string') {
      var t = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
      if (t) return { y: +t[3], m: +t[2], d: +t[1] };
    }
    return null;
  }

  // Descobre onde fica o cabeçalho e as linhas dos dias em uma aba. Devolve null se não parecer a planilha.
  function readLayout(ws) {
    var hdr = 0, r;
    for (r = 1; r <= 12; r++) { if (plain(cellText(ws.getCell(r, 1))) === 'DATA') { hdr = r; break; } }
    if (!hdr) return null;
    var rows = {}, firstDate = null, last = 0;
    for (r = hdr + 2; r <= hdr + 40; r++) {
      var d = cellDate(ws.getCell(r, 1));
      if (!d) { if (firstDate) break; else continue; }
      if (!firstDate) firstDate = d;
      rows[d.y * 10000 + d.m * 100 + d.d] = r; last = r;
    }
    if (!firstDate) return null;
    // Colunas dos veículos: célula do cabeçalho com "KM Início" e "KM Final" logo abaixo.
    var cols = [];
    for (var c = 2; c <= 40; c++) {
      var cell = ws.getCell(hdr, c);
      if (cell.isMerged && cell.master && cell.master.address !== cell.address) continue;
      var t = cellText(cell);
      if (!t) continue;
      var s1 = plain(cellText(ws.getCell(hdr + 1, c))), s2 = plain(cellText(ws.getCell(hdr + 1, c + 1)));
      if (s1.indexOf('INICIO') !== -1 && s2.indexOf('FINAL') !== -1) cols.push({ col: c, header: norm(t), title: t.replace(/\s+/g, ' ').trim() });
    }
    return { hdr: hdr, rows: rows, first: firstDate, lastRow: last, cols: cols };
  }

  function dayKey(iso, tz) { return new Date(iso).toLocaleDateString('sv-SE', { timeZone: tz }); }

  /**
   * ExcelJS: biblioteca ExcelJS já carregada.
   * data: ArrayBuffer (ou Buffer) do arquivo .xlsx escolhido.
   * monthKey: 'AAAA-MM'.
   * routes: linhas da tabela routes do mês. vehicles: linhas da tabela vehicles.
   * Devolve { buffer, report }.
   */
  async function fillWorkbook(ExcelJS, data, monthKey, routes, vehicles, tz) {
    tz = tz || 'America/Sao_Paulo';
    var wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data);
    var p = monthKey.split('-'), year = +p[0], month = +p[1];

    var ws = null, layout = null;
    wb.eachSheet(function (sheet) {
      if (ws) return;
      var l = readLayout(sheet);
      if (l && l.first.y === year && l.first.m === month) { ws = sheet; layout = l; }
    });
    if (!ws) {
      var err = new Error('Não achei na planilha a aba do mês ' + String(month).padStart(2, '0') + '/' + year + '. Confira se o arquivo escolhido é o de controle de KM e se a aba desse mês existe.');
      err.code = 'NO_SHEET';
      throw err;
    }

    var report = { sheet: ws.name, cells: 0, overwritten: 0, days: 0, filled: [], noColumn: [], warnings: [] };
    var used = {};
    var byVehicle = {};
    routes.forEach(function (r) {
      if (dayKey(r.start_at, tz).slice(0, 7) !== monthKey) return;
      (byVehicle[r.vehicle_id] = byVehicle[r.vehicle_id] || []).push(r);
    });

    var written = {}; // linha -> colunas escritas, para recalcular o KM Rodado
    vehicles.forEach(function (v) {
      var list = byVehicle[v.id];
      if (!list || !list.length) return;
      var plate = norm(v.plate);
      var label = v.name + ' (' + v.plate + ')';
      var hits = plate.length >= 3 ? layout.cols.filter(function (c) { return c.header.indexOf(plate) !== -1; }) : [];
      if (hits.length === 0) { report.noColumn.push(label); return; }
      if (hits.length > 1) { report.warnings.push('A placa ' + v.plate + ' aparece em mais de uma coluna da planilha. Cadastre a placa completa no sistema (aba Veículos). Esse veículo não foi preenchido.'); return; }
      var col = hits[0];
      if (used[col.col]) { report.warnings.push('Dois veículos do sistema apontam para a mesma coluna (' + col.title + '). Confira as placas na aba Veículos.'); return; }
      used[col.col] = true;

      var days = {};
      list.sort(function (a, b) { return new Date(a.start_at) - new Date(b.start_at); }).forEach(function (r) {
        var k = dayKey(r.start_at, tz);
        (days[k] = days[k] || []).push(r);
      });
      var nDays = 0;
      Object.keys(days).forEach(function (k) {
        var g = days[k], dd = k.split('-');
        var row = layout.rows[+dd[0] * 10000 + +dd[1] * 100 + +dd[2]];
        if (!row) { report.warnings.push('Dia ' + dd[2] + '/' + dd[1] + ' não existe na aba ' + ws.name + '.'); return; }
        var start = g[0].start_km;
        var lastR = g[g.length - 1];
        var end = lastR.status === 'closed' && lastR.end_km != null ? lastR.end_km : null;
        function put(c, val) {
          if (val == null) return;
          var cell = ws.getCell(row, c);
          var old = cell.value;
          var has = old !== null && old !== undefined && old !== '';
          if (has && Number(old) === val) return;
          if (has) report.overwritten++;
          cell.value = val; report.cells++;
          (written[row] = written[row] || {})[c] = true;
        }
        put(col.col, start);
        put(col.col + 1, end);
        nDays++;
      });
      report.days += nDays;
      report.filled.push(label + ': ' + nDays + (nDays === 1 ? ' dia' : ' dias'));
    });

    // Atualiza os resultados guardados das fórmulas (KM Rodado e TOTAL), para quem abrir sem recalcular.
    // Troca só o resultado guardado, mantendo a fórmula (inclusive as "compartilhadas" do Excel).
    function setResult(cell, res) {
      var f = cell.value;
      if (f && typeof f === 'object' && (f.formula || f.sharedFormula)) cell.value = Object.assign({}, f, { result: res });
    }
    function num(c) { var v = c.value; if (v && typeof v === 'object' && v.result !== undefined) v = v.result; return typeof v === 'number' ? v : null; }
    layout.cols.forEach(function (col) {
      if (!used[col.col]) return;
      var sum = 0;
      Object.keys(layout.rows).forEach(function (k) {
        var row = layout.rows[k];
        var a = num(ws.getCell(row, col.col)), b = num(ws.getCell(row, col.col + 1));
        var rc = ws.getCell(row, col.col + 2);
        var res = a != null && b != null ? b - a : '';
        setResult(rc, res);
        if (res !== '') sum += res;
      });
      var tot = ws.getCell(layout.lastRow + 1, col.col + 2), tf = tot.value;
      if (tf && typeof tf === 'object' && /^SUM\(/i.test(tf.formula || '')) setResult(tot, sum);
    });

    wb.calcProperties = Object.assign({}, wb.calcProperties, { fullCalcOnLoad: true });
    var buffer = await wb.xlsx.writeBuffer();
    return { buffer: buffer, report: report };
  }

  /* ---------- navegador ---------- */
  var loading = null;
  function loadExcelJS() {
    if (root.ExcelJS) return Promise.resolve(root.ExcelJS);
    if (!loading) {
      loading = new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = EXCELJS_URL; s.async = true;
        s.onload = function () { root.ExcelJS ? res(root.ExcelJS) : rej(new Error('Não consegui carregar o leitor de planilhas.')); };
        s.onerror = function () { loading = null; rej(new Error('Não consegui carregar o leitor de planilhas. Confira a conexão com a internet.')); };
        document.head.append(s);
      });
    }
    return loading;
  }

  async function fillFromFile(file, monthKey, routes, vehicles, tz) {
    var ExcelJS = await loadExcelJS();
    var data = await file.arrayBuffer();
    try {
      return await fillWorkbook(ExcelJS, data, monthKey, routes, vehicles, tz);
    } catch (e) {
      if (e && e.code === 'NO_SHEET') throw e;
      throw new Error('Não consegui ler esse arquivo. Escolha a planilha de controle de KM em formato .xlsx.');
    }
  }

  function saveBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  // Texto de resumo para mostrar à coordenação depois de preencher.
  function summary(report, monthLabel) {
    var parts = [];
    if (report.cells === 0 && !report.noColumn.length) parts.push('Nada novo para preencher em ' + monthLabel + ': a aba ' + report.sheet + ' já está igual ao sistema (ou não há rotas no mês).');
    else parts.push('Planilha pronta. Aba ' + report.sheet + ': ' + report.cells + (report.cells === 1 ? ' valor preenchido' : ' valores preenchidos') + '.');
    if (report.filled.length) parts.push(report.filled.join('; ') + '.');
    if (report.overwritten) parts.push('Atenção: ' + report.overwritten + (report.overwritten === 1 ? ' valor que já estava' : ' valores que já estavam') + ' na planilha ' + (report.overwritten === 1 ? 'foi trocado' : 'foram trocados') + ' pelo do sistema.');
    if (report.noColumn.length) parts.push('Sem coluna na planilha (a placa não aparece no cabeçalho): ' + report.noColumn.join(', ') + '. Confira a placa na aba Veículos.');
    report.warnings.forEach(function (w) { parts.push(w); });
    return parts.join(' ');
  }

  var api = { fillWorkbook: fillWorkbook, fillFromFile: fillFromFile, readLayout: readLayout, summary: summary, saveBlob: saveBlob };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.RC) { root.RC.fillWorkbook = fillWorkbook; root.RC.fillFromFile = fillFromFile; root.RC.fillSummary = summary; root.RC.saveBlob = saveBlob; }
})(typeof window !== 'undefined' ? window : globalThis);
