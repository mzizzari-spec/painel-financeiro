#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Agente de coleta do Painel Macro.

Busca dados públicos do Banco Central do Brasil e grava em data/painel.json,
no formato que o front-end (assets/app.js) espera.

Fontes:
  - SGS  (Sistema Gerenciador de Séries Temporais)  -> juros e inflação
  - PTAX (Olinda)                                    -> câmbio (dólar, euro)
  - Expectativas de Mercado / Focus (Olinda)         -> projeções

O script é resiliente: se uma fonte falhar, mantém o valor anterior do JSON
e segue com as demais, para o painel nunca ficar totalmente vazio.

Executado automaticamente pelo GitHub Actions (.github/workflows/update-data.yml),
mas também roda localmente:  python scripts/fetch_data.py
"""

import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

# --------------------------------------------------------------------------
# Configuração
# --------------------------------------------------------------------------
JANELA_MESES = 24                       # janela histórica dos gráficos
OUT = Path(__file__).resolve().parents[1] / "data" / "painel.json"
TIMEOUT = 30
HOJE = datetime.now(timezone.utc)

# Séries do SGS: código -> (chave interna, rótulo)
SGS_SERIES = {
    432: ("selic_meta", "Meta Selic"),
    12:  ("cdi",        "CDI"),
    433: ("ipca_mes",   "IPCA (mês)"),
    189: ("igpm_mes",   "IGP-M (mês)"),
    188: ("inpc_mes",   "INPC (mês)"),
}
# Quais séries também alimentam gráfico (guardam histórico completo)
SGS_COM_GRAFICO = {432, 433}

# Focus: rótulo do indicador na API -> chave interna
FOCUS_INDICADORES = {
    "IPCA":      "ipca",
    "Selic":     "selic",
    "Câmbio":    "cambio",
    "PIB Total": "pib",
}

HEADERS = {"User-Agent": "painel-macro-bacen/1.0 (github actions)"}


def ddmmaaaa(dt):
    return dt.strftime("%d/%m/%Y")


def mmddaaaa(dt):
    # PTAX usa mês-dia-ano
    return dt.strftime("%m-%d-%Y")


# --------------------------------------------------------------------------
# SGS
# --------------------------------------------------------------------------
def fetch_sgs_serie(codigo, inicio, fim):
    url = (
        f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados"
        f"?formato=json&dataInicial={ddmmaaaa(inicio)}&dataFinal={ddmmaaaa(fim)}"
    )
    r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    dados = r.json()  # [{"data":"dd/MM/aaaa","valor":"x,xx"}, ...]
    pontos = []
    for d in dados:
        try:
            valor = float(str(d["valor"]).replace(",", "."))
        except (ValueError, KeyError):
            continue
        dia, mes, ano = d["data"].split("/")
        pontos.append({"data": f"{ano}-{mes}-{dia}", "valor": valor})
    return pontos


def calcular_ipca_12m(serie_ipca):
    """Acumulado 12 meses a partir da variação mensal (composição)."""
    if len(serie_ipca) < 12:
        return None
    ultimos12 = serie_ipca[-12:]
    fator = 1.0
    for p in ultimos12:
        fator *= (1 + p["valor"] / 100)
    return round((fator - 1) * 100, 2)


# --------------------------------------------------------------------------
# PTAX (câmbio)
# --------------------------------------------------------------------------
def fetch_ptax(moeda, inicio, fim):
    """Cotações de fechamento (venda) de uma moeda no período."""
    base = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo"
    args = f"(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)"
    params = {
        "@moeda": f"'{moeda}'",
        "@dataInicial": f"'{mmddaaaa(inicio)}'",
        "@dataFinalCotacao": f"'{mmddaaaa(fim)}'",
        "$format": "json",
        "$select": "cotacaoVenda,dataHoraCotacao,tipoBoletim",
    }
    r = requests.get(base + args, params=params, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    valores = r.json().get("value", [])
    pontos = []
    for v in valores:
        if v.get("tipoBoletim") != "Fechamento":
            continue
        dh = v.get("dataHoraCotacao", "")[:10]  # aaaa-mm-dd
        pontos.append({"data": dh, "valor": round(float(v["cotacaoVenda"]), 4)})
    pontos.sort(key=lambda p: p["data"])
    return pontos


# --------------------------------------------------------------------------
# Focus / Expectativas
# --------------------------------------------------------------------------
def fetch_focus(indicador, ano_ref):
    base = ("https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/"
            "odata/ExpectativasMercadoAnuais")
    params = {
        "$filter": f"Indicador eq '{indicador}' and DataReferencia eq '{ano_ref}'",
        "$orderby": "Data desc",
        "$top": "1",
        "$format": "json",
        "$select": "Indicador,DataReferencia,Data,Mediana",
    }
    r = requests.get(base, params=params, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    val = r.json().get("value", [])
    if not val:
        return None
    item = val[0]
    return {
        "referencia": str(item.get("DataReferencia")),
        "data": item.get("Data"),
        "mediana": round(float(item["Mediana"]), 4) if item.get("Mediana") is not None else None,
    }


# --------------------------------------------------------------------------
# Montagem
# --------------------------------------------------------------------------
def carregar_anterior():
    if OUT.exists():
        try:
            return json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"indicadores": {}, "focus": {}}


def main():
    inicio = HOJE - timedelta(days=int(JANELA_MESES * 30.5))
    anterior = carregar_anterior()
    indicadores = anterior.get("indicadores", {})
    focus = anterior.get("focus", {})
    falhas = []

    # ---- SGS ----
    serie_ipca_completa = None
    for codigo, (chave, rotulo) in SGS_SERIES.items():
        try:
            serie = fetch_sgs_serie(codigo, inicio, HOJE)
            if not serie:
                raise ValueError("série vazia")
            ultimo = serie[-1]
            anterior_val = serie[-2]["valor"] if len(serie) > 1 else None
            variacao = (round(ultimo["valor"] - anterior_val, 4)
                        if anterior_val is not None else None)
            entrada = {
                "label": rotulo,
                "valor": ultimo["valor"],
                "data": ultimo["data"],
                "variacao": variacao,
            }
            if codigo in SGS_COM_GRAFICO:
                entrada["serie"] = serie
            indicadores[chave] = entrada
            if codigo == 433:
                serie_ipca_completa = serie
            print(f"[SGS {codigo}] {rotulo}: {ultimo['valor']} ({ultimo['data']})")
        except Exception as e:  # noqa: BLE001
            falhas.append(f"SGS {codigo} ({rotulo}): {e}")

    # ---- IPCA 12 meses (calculado) ----
    if serie_ipca_completa:
        acum = calcular_ipca_12m(serie_ipca_completa)
        if acum is not None:
            indicadores["ipca_12m"] = {
                "label": "IPCA (12m)",
                "valor": acum,
                "data": serie_ipca_completa[-1]["data"],
                "variacao": None,
            }
            print(f"[calc] IPCA 12m: {acum}")

    # ---- PTAX ----
    for moeda, chave, rotulo in [("USD", "dolar", "Dólar"), ("EUR", "euro", "Euro")]:
        try:
            serie = fetch_ptax(moeda, inicio, HOJE)
            if not serie:
                raise ValueError("sem cotações")
            ultimo = serie[-1]
            anterior_val = serie[-2]["valor"] if len(serie) > 1 else None
            variacao = (round(ultimo["valor"] - anterior_val, 4)
                        if anterior_val is not None else None)
            entrada = {
                "label": rotulo,
                "valor": ultimo["valor"],
                "data": ultimo["data"],
                "variacao": variacao,
            }
            entrada["serie"] = serie  # dólar e euro alimentam gráfico e tabela diária
            indicadores[chave] = entrada
            print(f"[PTAX {moeda}] {rotulo}: {ultimo['valor']} ({ultimo['data']})")
        except Exception as e:  # noqa: BLE001
            falhas.append(f"PTAX {moeda}: {e}")

    # ---- Focus ----
    ano_ref = str(HOJE.year)
    for indicador_api, chave in FOCUS_INDICADORES.items():
        try:
            f = fetch_focus(indicador_api, ano_ref)
            if f:
                focus[chave] = f
                print(f"[Focus] {indicador_api} {ano_ref}: mediana {f['mediana']}")
        except Exception as e:  # noqa: BLE001
            falhas.append(f"Focus {indicador_api}: {e}")

    saida = {
        "atualizado_em": HOJE.isoformat(timespec="seconds"),
        "fonte": "Banco Central do Brasil",
        "janela_meses": JANELA_MESES,
        "amostra": False,
        "indicadores": indicadores,
        "focus": focus,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(saida, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nGravado: {OUT}")

    if falhas:
        print("\nAvisos (fontes que falharam nesta execução):", file=sys.stderr)
        for f in falhas:
            print(f"  - {f}", file=sys.stderr)
        # Não derruba o job: mantém o painel com os dados que deram certo.

    # Falha total só se nada foi coletado.
    if not indicadores:
        print("ERRO: nenhum indicador coletado.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
