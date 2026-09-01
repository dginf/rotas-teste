// ============================================================
// CONFIGURAÇÃO
// ============================================================
const URLS = {
  fato: 'data/fato_indicador_cordeiro.json',
  basicos: 'data/basicos_cordeiro.json',
  valorAdicionado: 'data/valor_adicionado_cordeiro.json',
  municipios: 'data/municipios_cordeiro.json',
  localizacao: 'data/localizacao_cordeiro.json',
  dimIndicador: 'data/dim_indicador.json',
};

const CORES_POLO = ['#1351b4','#009C3B','#b6790a','#c62828','#6b21a8','#0891b2','#be185d','#65a30d','#7c3aed','#ea580c','#0d9488','#9333ea','#4338ca','#15803d','#b91c1c'];

// Indicadores específicos usados em cartões/gráficos fixos
const IND = {
  empresas: 'rais_estab_11', vinculos: 'rais_estab_25', massaSalarial: 'rais_vinc_14',
  laQtd: 'ppm_prod_13', laValor: 'ppm_prod_14', laProporcao: 'ppm_prod_15',
  rebanhoOvinos: 'ppm_reb_3', ovinosTosquiados: 'ppm_ovinos_1', rebanhoTotal: 'ppm_reb_5',
};

let DATA = { fato: [], basicos: [], valorAdicionado: [], municipios: [], localizacao: {}, dimIndicador: [] };
let MUN = {};   // cod_mun -> {polo, sg_uf, estado, des_municipio}
let INDBYID = {}; // id_indicador -> metadados
let FILTROS = { anoIni: null, anoFim: null, uf: '', polo: '', mun: '' };
let charts = {};
let mapInstances = {};

// ============================================================
// UTILITÁRIOS
// ============================================================
const fmtN = v => v == null || isNaN(v) ? '-' : Number(v).toLocaleString('pt-BR', {maximumFractionDigits:1});
const fmtI = v => v == null || isNaN(v) ? '-' : Number(v).toLocaleString('pt-BR', {maximumFractionDigits:0});
const fmtR = v => v == null || isNaN(v) ? '-' : 'R$ ' + Number(v).toLocaleString('pt-BR', {maximumFractionDigits:0});
const fmtPct = v => v == null || isNaN(v) ? '-' : Number(v).toLocaleString('pt-BR', {maximumFractionDigits:1}) + '%';

function fmtAuto(v, formato) {
  if (v == null || isNaN(v)) return '-';
  if (formato === 'Porcentagem') return fmtPct(v);
  if (formato === 'Moeda' || formato === 'Reais') return fmtR(v);
  return fmtN(v);
}

function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
function destroyMap(id) { if (mapInstances[id]) { mapInstances[id].remove(); delete mapInstances[id]; } }

function corPolo(polo, polosOrdenados) {
  const i = polosOrdenados.indexOf(polo);
  return CORES_POLO[i % CORES_POLO.length];
}

// ============================================================
// CARREGAMENTO
// ============================================================
async function carregarDados() {
  try {
    const [fatoRaw, basicosRaw, vaRaw, municipiosRaw, localizacaoRaw, dimRaw] = await Promise.all([
      fetch(URLS.fato).then(r => r.json()),
      fetch(URLS.basicos).then(r => r.json()),
      fetch(URLS.valorAdicionado).then(r => r.json()),
      fetch(URLS.municipios).then(r => r.json()),
      fetch(URLS.localizacao).then(r => r.json()),
      fetch(URLS.dimIndicador).then(r => r.json()),
    ]);

    // Reconstituir arrays de objetos a partir do formato colunar compacto
    DATA.fato = fatoRaw.rows.map(r => ({ ano: r[0], cod_mun: r[1], id_indicador: r[2], valor: r[3], peso: r[4] }));
    DATA.basicos = basicosRaw.rows.map(r => ({ ano: r[0], cod_mun: r[1], pop: r[2], pib: r[3], pib_pc: r[4] }));
    DATA.valorAdicionado = vaRaw.rows.map(r => ({ ano: r[0], cod_mun: r[1], grande_setor: r[2], valor_adicionado: r[3] }));
    DATA.municipios = municipiosRaw;
    DATA.localizacao = localizacaoRaw;
    DATA.dimIndicador = dimRaw;

    municipiosRaw.forEach(m => { MUN[m.cod_mun] = m; });
    dimRaw.forEach(d => { INDBYID[d.id] = d; });

    popularFiltrosGlobais();
    document.getElementById('loading').style.display = 'none';
    renderizarViewAtiva();
  } catch (e) {
    document.getElementById('loading').innerHTML = '<p style="color:red">Erro ao carregar dados. Verifique a conexão e se os arquivos da pasta /data estão presentes.</p>';
    console.error(e);
  }
}

function popularFiltrosGlobais() {
  const anos = [...new Set(DATA.fato.map(r => r.ano))].sort();
  const ufs = [...new Set(DATA.municipios.map(m => m.sg_uf))].sort();
  const polos = [...new Set(DATA.municipios.map(m => m.polo))].sort();
  const muns = [...new Set(DATA.municipios.map(m => m.des_municipio))].sort();

  document.getElementById('f-ano-ini').innerHTML = anos.map(a => `<option>${a}</option>`).join('');
  document.getElementById('f-ano-fim').innerHTML = anos.map(a => `<option>${a}</option>`).join('');
  document.getElementById('f-ano-ini').value = anos[0];
  document.getElementById('f-ano-fim').value = anos[anos.length - 1];
  FILTROS.anoIni = anos[0]; FILTROS.anoFim = anos[anos.length - 1];

  document.getElementById('f-uf').innerHTML = '<option value="">Todos</option>' + ufs.map(u => `<option>${u}</option>`).join('');
  document.getElementById('f-polo').innerHTML = '<option value="">Todos</option>' + polos.map(p => `<option>${p}</option>`).join('');
  document.getElementById('f-mun').innerHTML = '<option value="">Todos</option>' + muns.map(m => `<option>${m}</option>`).join('');
}

function aplicarFiltros() {
  FILTROS.anoIni = document.getElementById('f-ano-ini').value;
  FILTROS.anoFim = document.getElementById('f-ano-fim').value;
  FILTROS.uf = document.getElementById('f-uf').value;
  FILTROS.polo = document.getElementById('f-polo').value;
  FILTROS.mun = document.getElementById('f-mun').value;
  renderizarViewAtiva();
}

function resetFiltros() {
  document.getElementById('f-uf').value = '';
  document.getElementById('f-polo').value = '';
  document.getElementById('f-mun').value = '';
  const anos = [...new Set(DATA.fato.map(r => r.ano))].sort();
  document.getElementById('f-ano-ini').value = anos[0];
  document.getElementById('f-ano-fim').value = anos[anos.length - 1];
  aplicarFiltros();
}

function munPassaFiltro(cod_mun) {
  const m = MUN[cod_mun];
  if (!m) return false;
  if (FILTROS.uf && m.sg_uf !== FILTROS.uf) return false;
  if (FILTROS.polo && m.polo !== FILTROS.polo) return false;
  if (FILTROS.mun && m.des_municipio !== FILTROS.mun) return false;
  return true;
}

function anoPassaFiltro(ano) {
  if (FILTROS.anoIni && ano < +FILTROS.anoIni) return false;
  if (FILTROS.anoFim && ano > +FILTROS.anoFim) return false;
  return true;
}

function filtrarFato(idsIndicador) {
  return DATA.fato.filter(r => {
    if (idsIndicador && !idsIndicador.includes(r.id_indicador)) return false;
    if (!anoPassaFiltro(r.ano)) return false;
    if (!munPassaFiltro(r.cod_mun)) return false;
    return true;
  });
}

function filtrarBasicos() {
  return DATA.basicos.filter(r => anoPassaFiltro(r.ano) && munPassaFiltro(r.cod_mun));
}

function filtrarValorAdicionado() {
  return DATA.valorAdicionado.filter(r => anoPassaFiltro(r.ano) && munPassaFiltro(r.cod_mun));
}

function ultimoAno(rows) {
  const anos = rows.map(r => r.ano);
  return anos.length ? Math.max(...anos) : null;
}

function somaPor(rows, campo, valorCampo = 'valor') {
  const m = {};
  rows.forEach(r => { const k = r[campo] ?? '—'; m[k] = (m[k] || 0) + (parseFloat(r[valorCampo]) || 0); });
  return m;
}

// ============================================================
// NAVEGAÇÃO ENTRE VIEWS
// ============================================================
function renderizarViewAtiva() {
  const view = document.querySelector('.view.active').id.replace('view-', '');
  const renderers = {
    'apresentacao': renderApresentacao,
    'pib-populacao': renderPibPopulacao,
    'pib-per-capita': renderPibPerCapita,
    'valor-adicionado': renderValorAdicionado,
    'indicadores-socioeconomicos': () => renderExplorerIndicadores('view-indicadores-socioeconomicos', d => d.eixo === 'Social' || d.eixo === 'Demográfico'),
    'producao-la': renderProducaoLa,
    'ovinos': renderOvinos,
    'indicadores-cordeiros': () => renderExplorerIndicadores('view-indicadores-cordeiros', d => /ovino|lã|rebanho|tosqui|cordeiro|pecu/i.test(d.nome || '')),
    'trabalho': renderTrabalho,
    'indicadores-mercado-trabalho': () => renderExplorerIndicadores('view-indicadores-mercado-trabalho', d => (d.id || '').startsWith('rais_')),
    'indicadores-ambientais': () => renderExplorerIndicadores('view-indicadores-ambientais', d => d.eixo === 'Ambiental'),
  };
  if (renderers[view]) renderers[view]();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('nav.topnav a').forEach(a => {
    a.addEventListener('click', () => {
      document.querySelectorAll('nav.topnav a').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      document.getElementById('view-' + a.dataset.view).classList.add('active');
      renderizarViewAtiva();
    });
  });
  ['f-ano-ini','f-ano-fim','f-uf','f-polo','f-mun'].forEach(id => {
    document.getElementById(id).addEventListener('change', aplicarFiltros);
  });
  document.getElementById('btn-reset').addEventListener('click', resetFiltros);
  carregarDados();
});

// ============================================================
// APRESENTAÇÃO
// ============================================================
function renderApresentacao() {
  const basicos = filtrarBasicos();
  const ano = ultimoAno(basicos);
  const doAno = basicos.filter(r => r.ano === ano);
  renderMapaGenerico('map-apresentacao', doAno, r => r.pib_pc, 'PIB per capita', v => fmtR(v));
}

// ============================================================
// PIB & POPULAÇÃO
// ============================================================
function renderPibPopulacao() {
  const rows = filtrarBasicos();
  const ano = ultimoAno(rows);
  const doAno = rows.filter(r => r.ano === ano);
  const pibTotal = doAno.reduce((s, r) => s + (r.pib || 0), 0);
  const popTotal = doAno.reduce((s, r) => s + (r.pop || 0), 0);
  const pibPcMedio = popTotal ? pibTotal / popTotal : 0;

  document.getElementById('kpi-pib-pop').innerHTML = `
    <div class="kpi"><div class="kl">PIB Total da Rota (${ano})</div><div class="kv">${fmtR(pibTotal)}</div></div>
    <div class="kpi" style="border-left-color:var(--secondary)"><div class="kl">População Total (${ano})</div><div class="kv" style="color:var(--secondary)">${fmtI(popTotal)}</div></div>
    <div class="kpi" style="border-left-color:var(--amber)"><div class="kl">PIB Per Capita Médio (${ano})</div><div class="kv" style="color:var(--amber)">${fmtR(pibPcMedio)}</div></div>
  `;

  // PIB por Ano e Polo
  const polos = [...new Set(rows.map(r => MUN[r.cod_mun]?.polo).filter(Boolean))].sort();
  const anos = [...new Set(rows.map(r => r.ano))].sort();
  const byPoloAno = {};
  rows.forEach(r => {
    const polo = MUN[r.cod_mun]?.polo; if (!polo) return;
    byPoloAno[polo] = byPoloAno[polo] || {};
    byPoloAno[polo][r.ano] = (byPoloAno[polo][r.ano] || 0) + (r.pib || 0);
  });
  destroyChart('chart-pib-polo');
  charts['chart-pib-polo'] = new Chart(document.getElementById('chart-pib-polo').getContext('2d'), {
    type: 'bar',
    data: { labels: anos, datasets: polos.map(p => ({ label: p, data: anos.map(a => byPoloAno[p]?.[a] || 0), backgroundColor: corPolo(p, polos) })) },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}}, scales:{x:{stacked:true},y:{stacked:true,ticks:{callback:v=>'R$'+(v/1e6).toFixed(0)+'M'}}} }
  });

  // População por Ano e Polo (área empilhada -> usamos bar empilhada como equivalente)
  const byPoloAnoPop = {};
  rows.forEach(r => {
    const polo = MUN[r.cod_mun]?.polo; if (!polo) return;
    byPoloAnoPop[polo] = byPoloAnoPop[polo] || {};
    byPoloAnoPop[polo][r.ano] = (byPoloAnoPop[polo][r.ano] || 0) + (r.pop || 0);
  });
  destroyChart('chart-pop-polo');
  charts['chart-pop-polo'] = new Chart(document.getElementById('chart-pop-polo').getContext('2d'), {
    type: 'line',
    data: { labels: anos, datasets: polos.map(p => ({ label: p, data: anos.map(a => byPoloAnoPop[p]?.[a] || 0), borderColor: corPolo(p, polos), backgroundColor: corPolo(p,polos)+'55', fill:true, tension:.25 })) },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}}, scales:{y:{stacked:true,ticks:{callback:v=>fmtI(v)}}} }
  });

  // Composição média do PIB por Estado (substitui treemap por doughnut)
  const byUf = {};
  doAno.forEach(r => { const uf = MUN[r.cod_mun]?.sg_uf || '—'; byUf[uf] = (byUf[uf]||0) + (r.pib||0); });
  const ufs = Object.keys(byUf).sort((a,b)=>byUf[b]-byUf[a]);
  destroyChart('chart-pib-uf');
  charts['chart-pib-uf'] = new Chart(document.getElementById('chart-pib-uf').getContext('2d'), {
    type: 'doughnut',
    data: { labels: ufs, datasets: [{ data: ufs.map(u=>byUf[u]), backgroundColor: ufs.map((u,i)=>CORES_POLO[i%CORES_POLO.length]) }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}} }
  });
}

// ============================================================
// PIB PER CAPITA
// ============================================================
function renderPibPerCapita() {
  const rows = filtrarBasicos();
  const ano = ultimoAno(rows);
  const doAno = rows.filter(r => r.ano === ano);
  renderMapaGenerico('map-pib-pc', doAno, r => r.pib_pc, 'PIB per capita', v => fmtR(v));

  const polos = [...new Set(rows.map(r => MUN[r.cod_mun]?.polo).filter(Boolean))].sort();
  const anos = [...new Set(rows.map(r => r.ano))].sort();
  const byPoloAno = {}, cntPoloAno = {};
  rows.forEach(r => {
    const polo = MUN[r.cod_mun]?.polo; if (!polo) return;
    byPoloAno[polo] = byPoloAno[polo] || {}; cntPoloAno[polo] = cntPoloAno[polo] || {};
    byPoloAno[polo][r.ano] = (byPoloAno[polo][r.ano] || 0) + (r.pib_pc || 0);
    cntPoloAno[polo][r.ano] = (cntPoloAno[polo][r.ano] || 0) + 1;
  });
  destroyChart('chart-pibpc-polo');
  charts['chart-pibpc-polo'] = new Chart(document.getElementById('chart-pibpc-polo').getContext('2d'), {
    type: 'bar',
    data: { labels: anos, datasets: polos.map(p => ({ label: p, data: anos.map(a => (byPoloAno[p]?.[a]||0)/(cntPoloAno[p]?.[a]||1)), backgroundColor: corPolo(p, polos) })) },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}}, scales:{y:{ticks:{callback:v=>fmtR(v)}}} }
  });

  // tabela
  const tbl = document.getElementById('tbl-pib-pc');
  const linhas = doAno.map(r => ({ mun: MUN[r.cod_mun]?.des_municipio, polo: MUN[r.cod_mun]?.polo, pop: r.pop, pib: r.pib, pib_pc: r.pib_pc }))
    .sort((a,b) => b.pib_pc - a.pib_pc);
  tbl.querySelector('thead').innerHTML = `<tr><th>Município</th><th>Polo</th><th class="num">População</th><th class="num">PIB</th><th class="num">PIB per capita</th></tr>`;
  tbl.querySelector('tbody').innerHTML = linhas.map(l => `<tr><td>${l.mun}</td><td>${l.polo}</td><td class="num">${fmtI(l.pop)}</td><td class="num">${fmtR(l.pib)}</td><td class="num">${fmtR(l.pib_pc)}</td></tr>`).join('');
}

// ============================================================
// VALOR ADICIONADO
// ============================================================
function renderValorAdicionado() {
  const rows = filtrarValorAdicionado();
  const ano = ultimoAno(rows);
  const doAno = rows.filter(r => r.ano === ano);
  const total = doAno.reduce((s,r)=>s+(r.valor_adicionado||0),0);
  const agro = doAno.filter(r => r.grande_setor === 'Agropecuária').reduce((s,r)=>s+(r.valor_adicionado||0),0);

  document.getElementById('kpi-valor-adicionado').innerHTML = `
    <div class="kpi"><div class="kl">Valor Adicionado Total (${ano})</div><div class="kv">${fmtR(total)}</div></div>
    <div class="kpi" style="border-left-color:var(--secondary)"><div class="kl">Valor Adicionado — Agropecuária (${ano})</div><div class="kv" style="color:var(--secondary)">${fmtR(agro)}</div></div>
  `;

  const polos = [...new Set(rows.map(r => MUN[r.cod_mun]?.polo).filter(Boolean))].sort();
  const anos = [...new Set(rows.map(r => r.ano))].sort();
  const byPoloAno = {};
  rows.forEach(r => {
    const polo = MUN[r.cod_mun]?.polo; if (!polo) return;
    byPoloAno[polo] = byPoloAno[polo] || {};
    byPoloAno[polo][r.ano] = (byPoloAno[polo][r.ano] || 0) + (r.valor_adicionado || 0);
  });
  destroyChart('chart-va-polo');
  charts['chart-va-polo'] = new Chart(document.getElementById('chart-va-polo').getContext('2d'), {
    type: 'bar',
    data: { labels: anos, datasets: polos.map(p => ({ label: p, data: anos.map(a => byPoloAno[p]?.[a] || 0), backgroundColor: corPolo(p, polos) })) },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}}, scales:{y:{ticks:{callback:v=>'R$'+(v/1e6).toFixed(0)+'M'}}} }
  });

  const bySetor = {};
  doAno.forEach(r => { bySetor[r.grande_setor] = (bySetor[r.grande_setor]||0) + (r.valor_adicionado||0); });
  const setores = Object.keys(bySetor).sort((a,b)=>bySetor[b]-bySetor[a]);
  destroyChart('chart-va-setor');
  charts['chart-va-setor'] = new Chart(document.getElementById('chart-va-setor').getContext('2d'), {
    type: 'doughnut',
    data: { labels: setores, datasets: [{ data: setores.map(s=>bySetor[s]), backgroundColor: setores.map((s,i)=>CORES_POLO[i%CORES_POLO.length]) }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}} }
  });

  const tbl = document.getElementById('tbl-va');
  const byMunSetor = {};
  doAno.forEach(r => {
    const k = r.cod_mun;
    byMunSetor[k] = byMunSetor[k] || { mun: MUN[k]?.des_municipio, polo: MUN[k]?.polo, setores: {}, total: 0 };
    byMunSetor[k].setores[r.grande_setor] = (byMunSetor[k].setores[r.grande_setor]||0) + r.valor_adicionado;
    byMunSetor[k].total += r.valor_adicionado;
  });
  const linhas = Object.values(byMunSetor).sort((a,b)=>b.total-a.total);
  tbl.querySelector('thead').innerHTML = `<tr><th>Município</th><th>Polo</th>${setores.map(s=>`<th class="num">${s}</th>`).join('')}<th class="num">Total</th></tr>`;
  tbl.querySelector('tbody').innerHTML = linhas.map(l => `<tr><td>${l.mun}</td><td>${l.polo}</td>${setores.map(s=>`<td class="num">${fmtR(l.setores[s]||0)}</td>`).join('')}<td class="num">${fmtR(l.total)}</td></tr>`).join('');
}

// ============================================================
// PRODUÇÃO DE LÃ
// ============================================================
function renderProducaoLa() {
  const rows = filtrarFato([IND.laQtd, IND.laValor, IND.laProporcao]);
  const ano = ultimoAno(rows);
  const doAno = rows.filter(r => r.ano === ano);
  const qtd = doAno.filter(r=>r.id_indicador===IND.laQtd).reduce((s,r)=>s+(r.valor||0),0);
  const val = doAno.filter(r=>r.id_indicador===IND.laValor).reduce((s,r)=>s+(r.valor||0),0);
  const propRows = doAno.filter(r=>r.id_indicador===IND.laProporcao);
  const prop = propRows.length ? propRows.reduce((s,r)=>s+(r.valor||0),0)/propRows.length : 0;

  document.getElementById('kpi-la').innerHTML = `
    <div class="kpi"><div class="kl">Produção de Lã — Kg (${ano})</div><div class="kv">${fmtI(qtd)}</div></div>
    <div class="kpi" style="border-left-color:var(--secondary)"><div class="kl">Valor da Produção — R$1.000 (${ano})</div><div class="kv" style="color:var(--secondary)">${fmtR(val)}</div></div>
    <div class="kpi" style="border-left-color:var(--amber)"><div class="kl">% da Produção Animal (${ano})</div><div class="kv" style="color:var(--amber)">${fmtPct(prop)}</div></div>
  `;

  const valRows = filtrarFato([IND.laValor]);
  const polos = [...new Set(valRows.map(r => MUN[r.cod_mun]?.polo).filter(Boolean))].sort();
  const anos = [...new Set(valRows.map(r => r.ano))].sort();
  const byPoloAno = {};
  valRows.forEach(r => { const polo = MUN[r.cod_mun]?.polo; if(!polo) return; byPoloAno[polo]=byPoloAno[polo]||{}; byPoloAno[polo][r.ano]=(byPoloAno[polo][r.ano]||0)+(r.valor||0); });
  destroyChart('chart-la-polo');
  charts['chart-la-polo'] = new Chart(document.getElementById('chart-la-polo').getContext('2d'), {
    type: 'bar',
    data: { labels: anos, datasets: polos.map(p => ({ label: p, data: anos.map(a => byPoloAno[p]?.[a] || 0), backgroundColor: corPolo(p, polos) })) },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}} }
  });

  const byUf = {};
  doAno.filter(r=>r.id_indicador===IND.laValor).forEach(r => { const uf = MUN[r.cod_mun]?.sg_uf||'—'; byUf[uf]=(byUf[uf]||0)+(r.valor||0); });
  const ufsRank = Object.keys(byUf).sort((a,b)=>byUf[b]-byUf[a]);
  destroyChart('chart-la-uf');
  charts['chart-la-uf'] = new Chart(document.getElementById('chart-la-uf').getContext('2d'), {
    type: 'bar',
    data: { labels: ufsRank, datasets: [{ data: ufsRank.map(u=>byUf[u]), backgroundColor: 'var(--primary)'.trim() ? '#1351b4' : '#1351b4' }] },
    options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
  });

  renderMapaGenerico('map-la', doAno.filter(r=>r.id_indicador===IND.laValor), r => r.valor, 'Valor da produção de lã', v => fmtR(v));
}

// ============================================================
// OVINOS
// ============================================================
function renderOvinos() {
  const rows = filtrarFato([IND.rebanhoOvinos, IND.ovinosTosquiados, IND.rebanhoTotal]);
  const ano = ultimoAno(rows);
  const doAno = rows.filter(r => r.ano === ano);
  const rebanho = doAno.filter(r=>r.id_indicador===IND.rebanhoOvinos).reduce((s,r)=>s+(r.valor||0),0);
  const tosquiados = doAno.filter(r=>r.id_indicador===IND.ovinosTosquiados).reduce((s,r)=>s+(r.valor||0),0);
  const total = doAno.filter(r=>r.id_indicador===IND.rebanhoTotal).reduce((s,r)=>s+(r.valor||0),0);

  document.getElementById('kpi-ovinos').innerHTML = `
    <div class="kpi"><div class="kl">Rebanho de Ovinos — Cabeças (${ano})</div><div class="kv">${fmtI(rebanho)}</div></div>
    <div class="kpi" style="border-left-color:var(--secondary)"><div class="kl">Ovinos Tosquiados — Cabeças (${ano})</div><div class="kv" style="color:var(--secondary)">${fmtI(tosquiados)}</div></div>
    <div class="kpi" style="border-left-color:var(--amber)"><div class="kl">Rebanho Total — Cabeças (${ano})</div><div class="kv" style="color:var(--amber)">${fmtI(total)}</div></div>
  `;

  const rebRows = filtrarFato([IND.rebanhoOvinos]);
  const polos = [...new Set(rebRows.map(r => MUN[r.cod_mun]?.polo).filter(Boolean))].sort();
  const anos = [...new Set(rebRows.map(r => r.ano))].sort();
  const byPoloAno = {};
  rebRows.forEach(r => { const polo = MUN[r.cod_mun]?.polo; if(!polo) return; byPoloAno[polo]=byPoloAno[polo]||{}; byPoloAno[polo][r.ano]=(byPoloAno[polo][r.ano]||0)+(r.valor||0); });
  destroyChart('chart-ovinos-polo');
  charts['chart-ovinos-polo'] = new Chart(document.getElementById('chart-ovinos-polo').getContext('2d'), {
    type: 'bar',
    data: { labels: anos, datasets: polos.map(p => ({ label: p, data: anos.map(a => byPoloAno[p]?.[a] || 0), backgroundColor: corPolo(p, polos) })) },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}} }
  });

  const byUf = {};
  doAno.filter(r=>r.id_indicador===IND.rebanhoOvinos).forEach(r => { const uf = MUN[r.cod_mun]?.sg_uf||'—'; byUf[uf]=(byUf[uf]||0)+(r.valor||0); });
  const ufsRank = Object.keys(byUf).sort((a,b)=>byUf[b]-byUf[a]);
  destroyChart('chart-ovinos-uf');
  charts['chart-ovinos-uf'] = new Chart(document.getElementById('chart-ovinos-uf').getContext('2d'), {
    type: 'bar',
    data: { labels: ufsRank, datasets: [{ data: ufsRank.map(u=>byUf[u]), backgroundColor: '#009C3B' }] },
    options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
  });

  renderMapaGenerico('map-ovinos', doAno.filter(r=>r.id_indicador===IND.rebanhoOvinos), r => r.valor, 'Rebanho de ovinos', v => fmtI(v));
}

// ============================================================
// TRABALHO
// ============================================================
function renderTrabalho() {
  const rows = filtrarFato([IND.empresas, IND.vinculos, IND.massaSalarial]);
  const ano = ultimoAno(rows);
  const doAno = rows.filter(r => r.ano === ano);
  const empresas = doAno.filter(r=>r.id_indicador===IND.empresas).reduce((s,r)=>s+(r.valor||0),0);
  const vinculos = doAno.filter(r=>r.id_indicador===IND.vinculos).reduce((s,r)=>s+(r.valor||0),0);
  const massa = doAno.filter(r=>r.id_indicador===IND.massaSalarial).reduce((s,r)=>s+(r.valor||0),0);

  document.getElementById('kpi-trabalho').innerHTML = `
    <div class="kpi"><div class="kl">Empresas Ativas (${ano})</div><div class="kv">${fmtI(empresas)}</div></div>
    <div class="kpi" style="border-left-color:var(--secondary)"><div class="kl">Vínculos Ativos (${ano})</div><div class="kv" style="color:var(--secondary)">${fmtI(vinculos)}</div></div>
    <div class="kpi" style="border-left-color:var(--amber)"><div class="kl">Massa Salarial (${ano})</div><div class="kv" style="color:var(--amber)">${fmtR(massa)}</div></div>
  `;

  const vincRows = filtrarFato([IND.vinculos]);
  const polos = [...new Set(vincRows.map(r => MUN[r.cod_mun]?.polo).filter(Boolean))].sort();
  const anos = [...new Set(vincRows.map(r => r.ano))].sort();
  const byPoloAno = {};
  vincRows.forEach(r => { const polo = MUN[r.cod_mun]?.polo; if(!polo) return; byPoloAno[polo]=byPoloAno[polo]||{}; byPoloAno[polo][r.ano]=(byPoloAno[polo][r.ano]||0)+(r.valor||0); });
  destroyChart('chart-vinc-polo');
  charts['chart-vinc-polo'] = new Chart(document.getElementById('chart-vinc-polo').getContext('2d'), {
    type: 'bar',
    data: { labels: anos, datasets: polos.map(p => ({ label: p, data: anos.map(a => byPoloAno[p]?.[a] || 0), backgroundColor: corPolo(p, polos) })) },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}} }
  });

  const massaRows = filtrarFato([IND.massaSalarial]);
  const byPoloAnoM = {};
  massaRows.forEach(r => { const polo = MUN[r.cod_mun]?.polo; if(!polo) return; byPoloAnoM[polo]=byPoloAnoM[polo]||{}; byPoloAnoM[polo][r.ano]=(byPoloAnoM[polo][r.ano]||0)+(r.valor||0); });
  destroyChart('chart-massa-polo');
  charts['chart-massa-polo'] = new Chart(document.getElementById('chart-massa-polo').getContext('2d'), {
    type: 'bar',
    data: { labels: anos, datasets: polos.map(p => ({ label: p, data: anos.map(a => byPoloAnoM[p]?.[a] || 0), backgroundColor: corPolo(p, polos) })) },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}}, scales:{y:{ticks:{callback:v=>'R$'+(v/1e6).toFixed(1)+'M'}}} }
  });

  const byUf = {};
  massaRows.filter(r=>r.ano===ano).forEach(r => { const uf = MUN[r.cod_mun]?.sg_uf||'—'; byUf[uf]=(byUf[uf]||0)+(r.valor||0); });
  const ufsRank = Object.keys(byUf).sort((a,b)=>byUf[b]-byUf[a]);
  destroyChart('chart-massa-uf');
  charts['chart-massa-uf'] = new Chart(document.getElementById('chart-massa-uf').getContext('2d'), {
    type: 'bar',
    data: { labels: ufsRank, datasets: [{ data: ufsRank.map(u=>byUf[u]), backgroundColor: '#b6790a' }] },
    options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{callback:v=>'R$'+(v/1e6).toFixed(0)+'M'}}} }
  });

  renderMapaGenerico('map-trabalho', doAno.filter(r=>r.id_indicador===IND.massaSalarial), r => r.valor, 'Massa salarial', v => fmtR(v));
}

// ============================================================
// PÁGINAS "EXPLORADOR DE INDICADORES" (genérico, reaproveitado em 4 abas)
// ============================================================
function renderExplorerIndicadores(viewId, filtroEixo) {
  const view = document.getElementById(viewId);
  const selectId = viewId + '-select';
  let select = document.getElementById(selectId);

  const indicadoresDisponiveis = DATA.dimIndicador.filter(filtroEixo).sort((a,b) => (a.nome||'').localeCompare(b.nome||''));

  if (!select) return; // segurança: HTML precisa ter o select correspondente

  if (select.options.length <= 1) {
    select.innerHTML = indicadoresDisponiveis.map(d => `<option value="${d.id}">${d.nome}</option>`).join('');
    select.addEventListener('change', () => renderExplorerIndicadores(viewId, filtroEixo));
  }

  const idSelecionado = select.value || (indicadoresDisponiveis[0] && indicadoresDisponiveis[0].id);
  if (!idSelecionado) { view.querySelector('.explorer-body').innerHTML = '<p class="desc">Nenhum indicador disponível nesta categoria.</p>'; return; }
  select.value = idSelecionado;

  const meta = INDBYID[idSelecionado] || {};
  view.querySelector('.explorer-info').innerHTML = `
    <b>${meta.nome || idSelecionado}</b><br>
    ${meta.descricao || ''}<br>
    <span style="color:var(--ink-soft)">Fonte: ${meta.fonte || '—'}</span>
  `;

  const rows = filtrarFato([idSelecionado]);
  const anos = [...new Set(rows.map(r => r.ano))].sort();
  // Top 6 municípios por valor no último ano, pra não poluir o gráfico
  const ano = ultimoAno(rows);
  const topMuns = [...new Set(rows.filter(r=>r.ano===ano).sort((a,b)=>b.valor-a.valor).slice(0,6).map(r=>r.cod_mun))];
  const byMunAno = {};
  rows.forEach(r => { if(!topMuns.includes(r.cod_mun)) return; const nome = MUN[r.cod_mun]?.des_municipio; byMunAno[nome]=byMunAno[nome]||{}; byMunAno[nome][r.ano]=r.valor; });
  const munNomes = Object.keys(byMunAno);

  const chartId = viewId + '-chart';
  destroyChart(chartId);
  const canvas = view.querySelector('.explorer-canvas');
  charts[chartId] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: anos, datasets: munNomes.map((m,i) => ({ label: m, data: anos.map(a => byMunAno[m][a] ?? null), borderColor: CORES_POLO[i%CORES_POLO.length], backgroundColor: 'transparent', tension:.25, spanGaps:true })) },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}}, scales:{y:{ticks:{callback:v=>fmtAuto(v, meta.formato)}}} }
  });

  // Tabela detalhamento (linhas do último ano, todos os municípios filtrados)
  const tbl = view.querySelector('.explorer-table');
  const linhas = rows.filter(r=>r.ano===ano).map(r => ({ mun: MUN[r.cod_mun]?.des_municipio, polo: MUN[r.cod_mun]?.polo, valor: r.valor })).sort((a,b)=>b.valor-a.valor);
  tbl.querySelector('thead').innerHTML = `<tr><th>Município</th><th>Polo</th><th class="num">Valor (${ano})</th></tr>`;
  tbl.querySelector('tbody').innerHTML = linhas.map(l => `<tr><td>${l.mun}</td><td>${l.polo}</td><td class="num">${fmtAuto(l.valor, meta.formato)}</td></tr>`).join('');
}

// ============================================================
// MAPA GENÉRICO (Leaflet, marcadores proporcionais)
// ============================================================
function renderMapaGenerico(elId, rows, getValor, label, fmt) {
  destroyMap(elId);
  const el = document.getElementById(elId);
  if (!el) return;
  const map = L.map(elId, { zoomControl: true }).setView([-10, -42], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18 }).addTo(map);
  mapInstances[elId] = map;

  const valores = rows.map(r => getValor(r)).filter(v => v != null && !isNaN(v));
  const max = valores.length ? Math.max(...valores) : 1;
  const min = valores.length ? Math.min(...valores) : 0;

  rows.forEach(r => {
    const loc = DATA.localizacao[String(r.cod_mun)];
    if (!loc) return;
    const v = getValor(r);
    if (v == null || isNaN(v)) return;
    const raio = 4 + 16 * ((v - min) / ((max - min) || 1));
    const mun = MUN[r.cod_mun];
    L.circleMarker([loc[0], loc[1]], {
      radius: raio, color: '#1351b4', weight: 1, fillColor: '#1351b4', fillOpacity: 0.55,
    }).bindTooltip(`<strong>${mun?.des_municipio || r.cod_mun}</strong><br>${mun?.polo || ''}<br>${label}: ${fmt(v)}`, { sticky: true }).addTo(map);
  });
}
