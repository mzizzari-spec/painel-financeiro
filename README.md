# Painel Macro · Banco Central do Brasil

Monitor macroeconômico estático (HTML + JS) com **cards**, **gráficos** e **expectativas de mercado**, alimentado automaticamente pelas APIs públicas do Banco Central. Feito para hospedar no **GitHub Pages** com atualização por **GitHub Actions** — sem servidor, sem banco de dados.

Indicadores no v1: Meta Selic, CDI, IPCA (mês e 12 meses), IGP-M, INPC, Dólar e Euro (PTAX) e o boletim **Focus** (IPCA, Selic, Câmbio e PIB).

---

## Como funciona

```
┌─ GitHub Actions (cron, dias úteis) ─┐
│  scripts/fetch_data.py  ── busca ──▶ APIs Bacen (SGS, PTAX, Focus)
│         │                            
│         └── grava ──▶ data/painel.json ── commit/push
└──────────────────────────────────────┘
                       │
         GitHub Pages serve index.html
                       │
   assets/app.js lê painel.json e desenha cards + gráficos
```

O "agente" (`scripts/fetch_data.py`) é o coração da automação: coleta os dados, calcula o IPCA acumulado 12 meses e grava tudo em `data/painel.json`. O front-end apenas lê esse JSON.

---

## Subir no GitHub (passo a passo)

1. Crie um repositório e envie estes arquivos:
   ```bash
   git init
   git add .
   git commit -m "feat: painel macro Bacen"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
   git push -u origin main
   ```
2. **Settings → Pages** → Source: `Deploy from a branch` → branch `main`, pasta `/ (root)` → Save.
3. **Settings → Actions → General** → em *Workflow permissions*, marque **Read and write permissions** (o workflow precisa disso para commitar os dados atualizados).
4. Rode a coleta uma vez à mão: aba **Actions → Atualizar dados do painel → Run workflow**. Isso substitui os dados de amostra pelos dados reais.

Pronto: o painel fica em `https://SEU-USUARIO.github.io/SEU-REPO/`.

> Os números que já vêm no `data/painel.json` são **de amostra** (aparece um selo "dados de amostra" no cabeçalho até a primeira coleta real). Servem só para o painel não abrir vazio.

---

## Rodar localmente

```bash
pip install -r requirements.txt
python scripts/fetch_data.py          # atualiza data/painel.json
python -m http.server 8000            # abre em http://localhost:8000
```

---

## Personalizar

**Visual** — tudo está em variáveis CSS no topo de `assets/style.css` (bloco `:root`). Trocar paleta e tipografia é só mexer ali; nada de caçar cor no meio do código. Para casar com o padrão de outro painel (ex.: o da LME), ajuste essas variáveis.

**Janela dos gráficos** — variável `JANELA_MESES` em `scripts/fetch_data.py` (padrão 24).

**Cadência de atualização** — o cron em `.github/workflows/update-data.yml` (padrão: dias úteis, 11h UTC). Câmbio e juros mudam no dia a dia; IPCA/IGP-M são mensais; Focus é semanal (segunda). Rodar diário cobre todos.

**Adicionar/remover indicadores** — acrescente o código no dicionário `SGS_SERIES` do agente e o item correspondente em `CARDS` (e, se quiser gráfico, em `SGS_COM_GRAFICO` + um `<canvas>` no HTML).

---

## Referência das séries (SGS)

Endpoint: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json`

| Indicador | Código | Observação |
|---|---:|---|
| Meta Selic (% a.a.) | 432 | confirmado |
| Selic efetiva (diária) | 11 | confirmado |
| CDI (diária) | 12 | confirmado |
| IPCA — variação % mês | 433 | confirmado |
| IGP-M — variação % mês | 189 | confirmado |
| INPC — variação % mês | 188 | conferir no localizador SGS |
| IBC-Br (proxy do PIB) | — | conferir código antes de usar |

O acumulado 12 meses do IPCA é **calculado** a partir da série 433 (composição), evitando depender de um código adicional.

**PTAX (câmbio):** `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/` — atenção: datas no formato **mês-dia-ano** (`MM-DD-YYYY`), diferente do SGS.

**Focus:** `https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais` — filtra por `Indicador` e `DataReferencia`.

---

## Aviso

Conteúdo meramente informativo, montado a partir de dados públicos do Banco Central do Brasil. Não constitui recomendação de investimento nem aconselhamento financeiro.
