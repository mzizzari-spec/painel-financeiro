/* =========================================================
   PAINEL MACRO — app.js
   Lê ./data/painel.json (gerado por scripts/fetch_data.py) e monta
   cards, expectativas Focus, gráficos e a tabela de cotações diárias.
   Visual alinhado ao painel LME (tema claro).
   ========================================================= */

const NF = (min, max) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });
const FMT = {
  pct:  (v) => (v == null ? "—" : NF(2, 2).format(v)),
  brl:  (v) => (v == null ? "—" : NF(4, 4).format(v)),
  brl2: (v) => (v == null ? "—" : NF(2, 2).format(v)),
  sign: (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${NF(2, 2).format(v)}%`),
  data: (iso) => { const d = new Date(iso); return isNaN(d) ? (iso || "—") : d.toLocaleDateString("pt-BR"); },
  dataHora: (iso) => { const d = new Date(iso); return isNaN(d) ? (iso || "—") : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); },
};
const DIAS = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

// categoria (cor) e formato de cada card
const CARDS = [
  { key: "selic_meta", unidade: "% a.a.", fmt: "pct",  cat: "juros" },
  { key: "cdi",        unidade: "% a.a.", fmt: "pct",  cat: "juros" },
  { key: "ipca_mes",   unidade: "%",      fmt: "pct",  cat: "inflacao" },
  { key: "ipca_12m",   unidade: "%",      fmt: "pct",  cat: "inflacao" },
  { key: "igpm_mes",   unidade: "%",      fmt: "pct",  cat: "inflacao" },
  { key: "inpc_mes",   unidade: "%",      fmt: "pct",  cat: "inflacao" },
  { key: "dolar",      unidade: "R$",     fmt: "brl",  cat: "cambio" },
  { key: "euro",       unidade: "R$",     fmt: "brl",  cat: "cambio" },
];
const FOCUS = [
  { key: "ipca",   label: "IPCA",   unidade: "%",      cat: "inflacao", fmt: "pct" },
  { key: "selic",  label: "Selic",  unidade: "% a.a.", cat: "juros",    fmt: "pct" },
  { key: "cambio", label: "Câmbio", unidade: "R$",     cat: "cambio",   fmt: "brl2" },
  { key: "pib",    label: "PIB",    unidade: "%",      cat: "juros",    fmt: "pct" },
];
const chartRefs = {};

async function init() {
  let data;
  try {
    const res = await fetch("./data/painel.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    document.getElementById("cards").innerHTML =
      `<div class="card"><div class="card__label">Sem dados</div>
       <p class="card__date">data/painel.json ainda não existe. Rode o workflow em Actions para a primeira coleta.</p></div>`;
    console.error(err); return;
  }
  renderHeader(data);
  renderCards(data);
  renderFocus(data);
  renderCharts(data);
  renderTable(data);
}

function renderHeader(data) {
  document.getElementById("updatedAt").textContent = `Atualizado em ${FMT.dataHora(data.atualizado_em)}`;
  document.getElementById("footerStamp").textContent = `Última coleta: ${FMT.dataHora(data.atualizado_em)} · fonte: ${data.fonte || "Banco Central do Brasil"}`;
  if (data.amostra) document.getElementById("sampleBadge").hidden = false;
}

const dCls = (v) => (v == null || v === 0 ? "flat" : v > 0 ? "up" : "down");

function renderCards(data) {
  const ind = data.indicadores || {};
  document.getElementById("cards").innerHTML = CARDS.map(({ key, unidade, fmt, cat }) => {
    const it = ind[key]; if (!it) return "";
    const delta = it.variacao == null ? `<span class="delta flat">—</span>`
      : `<span class="delta ${dCls(it.variacao)}">${FMT.sign(it.variacao)}</span>`;
    return `<article class="card card--${cat}">
      <div class="card__label">${it.label}</div>
      <div class="card__value">${FMT[fmt](it.valor)} <span class="card__unit">${unidade}</span></div>
      <div class="card__foot"><span class="card__date">${FMT.data(it.data)}</span>${delta}</div>
    </article>`;
  }).join("");
}

function renderFocus(data) {
  const focus = data.focus || {};
  const ref = Object.values(focus).find((f) => f && f.referencia);
  document.getElementById("focusRef").textContent = ref ? `(mediana · fim de ${ref.referencia})` : "";
  document.getElementById("focus").innerHTML = FOCUS.map(({ key, label, unidade, cat, fmt }) => {
    const f = focus[key]; if (!f) return "";
    return `<article class="card card--${cat}">
      <div class="card__label">${label}</div>
      <div class="card__value">${FMT[fmt](f.mediana)} <span class="card__unit">${unidade}</span></div>
      <div class="card__foot"><span class="card__date">atualizado ${FMT.data(f.data)}</span></div>
    </article>`;
  }).join("");
}

/* ---------- Gráficos ---------- */
const AX = { grid: "rgba(30,40,55,.07)", tick: "#6b7688", font: "'Inter', sans-serif" };
function baseOptions(extra = {}) {
  return {
    responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: "#1e2733", padding: 10, cornerRadius: 6, titleFont: { family: AX.font }, bodyFont: { family: AX.font } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: AX.tick, font: { family: AX.font, size: 10 }, maxTicksLimit: 8 } },
      y: { grid: { color: AX.grid }, border: { display: false }, ticks: { color: AX.tick, font: { family: AX.font, size: 10 } } },
    },
    ...extra,
  };
}
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function hexA(hex, a) {
  const h = hex.replace("#", ""); const n = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  return `rgba(${parseInt(n.slice(0,2),16)}, ${parseInt(n.slice(2,4),16)}, ${parseInt(n.slice(4,6),16)}, ${a})`;
}
const labels = (s) => (s || []).map((p) => FMT.data(p.data));
const vals = (s) => (s || []).map((p) => p.valor);

function renderCharts(data) {
  const ind = data.indicadores || {};
  const cambio = cssVar("--cat-cambio"), juros = cssVar("--cat-juros"), inflacao = cssVar("--cat-inflacao");

  // Câmbio: dólar + euro (linhas com marcadores + legenda HTML)
  if (ind.dolar?.serie) {
    const ctx = document.getElementById("chartCambio");
    chartRefs.cambio?.destroy();
    const ds = [{ label: "Dólar", data: vals(ind.dolar.serie), borderColor: cambio, backgroundColor: cambio, pointBackgroundColor: cambio }];
    if (ind.euro?.serie) ds.push({ label: "Euro", data: vals(ind.euro.serie), borderColor: juros, backgroundColor: juros, pointBackgroundColor: juros });
    ds.forEach(d => Object.assign(d, { borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .25 }));
    chartRefs.cambio = new Chart(ctx, {
      type: "line",
      data: { labels: labels(ind.dolar.serie), datasets: ds },
      options: baseOptions({ plugins: { legend: { display: true, position: "top", align: "end", labels: { usePointStyle: true, boxWidth: 6, color: AX.tick, font: { family: AX.font, size: 11 } } } } }),
    });
  }
  // Selic (degraus)
  if (ind.selic_meta?.serie) {
    const ctx = document.getElementById("chartSelic");
    chartRefs.selic?.destroy();
    chartRefs.selic = new Chart(ctx, {
      type: "line",
      data: { labels: labels(ind.selic_meta.serie), datasets: [{ data: vals(ind.selic_meta.serie), borderColor: juros, backgroundColor: hexA(juros, .1), borderWidth: 2, pointRadius: 0, stepped: "before", fill: true }] },
      options: baseOptions(),
    });
  }
  // IPCA (barras)
  if (ind.ipca_mes?.serie) {
    const ctx = document.getElementById("chartIpca");
    chartRefs.ipca?.destroy();
    const v = vals(ind.ipca_mes.serie);
    chartRefs.ipca = new Chart(ctx, {
      type: "bar",
      data: { labels: labels(ind.ipca_mes.serie), datasets: [{ data: v, backgroundColor: v.map(x => x < 0 ? hexA(cssVar("--down"), .85) : hexA(inflacao, .85)), borderRadius: 3 }] },
      options: baseOptions(),
    });
  }
}

/* ---------- Tabela de cotações diárias ---------- */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() * 100 + Math.ceil(((t - y0) / 864e5 + 1) / 7);
}
function varCell(v) {
  if (v == null) return `<td class="v-flat">—</td>`;
  const cls = v > 0 ? "v-up" : v < 0 ? "v-down" : "v-flat";
  return `<td class="${cls}">${FMT.sign(v)}</td>`;
}
function renderTable(data) {
  const ind = data.indicadores || {};
  const usd = ind.dolar?.serie || [], eur = ind.euro?.serie || [];
  if (!usd.length) { document.getElementById("quotesBody").innerHTML = `<tr><td class="l" colspan="7">Sem série de câmbio.</td></tr>`; return; }
  const eurMap = Object.fromEntries(eur.map(p => [p.data, p.valor]));
  const rows = usd.slice(-22);   // ~1 mês de pregões, como no painel LME
  let html = "", weekBuf = [], curWeek = null;

  const flushAvg = () => {
    if (!weekBuf.length) return;
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const du = avg(weekBuf.map(r => r.usd));
    const de = weekBuf.filter(r => r.eur != null).map(r => r.eur);
    html += `<tr class="avg"><td class="l">Média semana</td><td class="l"></td><td class="l"></td>
      <td>${FMT.brl(du)}</td><td class="v-flat">—</td>
      <td>${de.length ? FMT.brl(avg(de)) : "—"}</td><td class="v-flat">—</td></tr>`;
    weekBuf = [];
  };

  rows.forEach((p, i) => {
    const d = new Date(p.data);
    const wk = isoWeek(d);
    if (curWeek !== null && wk !== curWeek) flushAvg();
    curWeek = wk;
    const prev = rows[i - 1];
    const vUsd = prev ? ((p.valor - prev.valor) / prev.valor) * 100 : null;
    const eVal = eurMap[p.data] ?? null;
    const ePrev = prev ? (eurMap[prev.data] ?? null) : null;
    const vEur = (eVal != null && ePrev) ? ((eVal - ePrev) / ePrev) * 100 : null;
    weekBuf.push({ usd: p.valor, eur: eVal });
    html += `<tr>
      <td class="l">${FMT.data(p.data)}</td>
      <td class="l">${DIAS[d.getDay()]}</td>
      <td class="l"><span class="pill">REAL</span></td>
      <td>${FMT.brl(p.valor)}</td>${varCell(vUsd)}
      <td>${eVal != null ? FMT.brl(eVal) : "—"}</td>${varCell(vEur)}
    </tr>`;
  });
  flushAvg();
  document.getElementById("quotesBody").innerHTML = html;
}

document.addEventListener("DOMContentLoaded", init);
