#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Envia o resumo diário do Painel Macro por e-mail (Gmail SMTP).

Lê data/painel.json (gerado por fetch_data.py na etapa anterior do workflow)
e monta um e-mail HTML espelhando os cards: Indicadores + Expectativas (Focus)
+ tabela de câmbio dos últimos pregões, com um botão para abrir o painel.

Configuração vem toda de variáveis de ambiente (Secrets do GitHub):
  GMAIL_USER            -> e-mail remetente (a conta do "follow")
  GMAIL_APP_PASSWORD    -> senha de app do Gmail (NÃO a senha normal)
  EMAIL_DESTINATARIOS   -> lista separada por vírgula (vai em CCO/BCC)
  PAINEL_URL            -> (opcional) link do painel para o botão

O e-mail se adapta ao que existir no JSON: se você mudar os indicadores do
painel, o corpo do e-mail acompanha automaticamente.
"""

import json
import os
import smtplib
import sys
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data" / "painel.json"
PAINEL_URL = os.environ.get("PAINEL_URL", "https://mzizzari-spec.github.io/painel-financeiro/")

# paleta (mesma lógica de categoria do painel)
COR = {"juros": "#2e5f9e", "inflacao": "#c26a2c", "cambio": "#2f8f4e", "texto": "#1e2733", "muted": "#6b7688", "borda": "#e7eaf0"}
CAT = {
    "selic_meta": "juros", "cdi": "juros",
    "ipca_mes": "inflacao", "ipca_12m": "inflacao", "igpm_mes": "inflacao", "inpc_mes": "inflacao",
    "dolar": "cambio", "euro": "cambio",
}
UNI = {
    "selic_meta": "% a.a.", "cdi": "% a.a.", "ipca_mes": "%", "ipca_12m": "%",
    "igpm_mes": "%", "inpc_mes": "%", "dolar": "R$", "euro": "R$",
}
FOCUS_CAT = {"ipca": "inflacao", "selic": "juros", "cambio": "cambio", "pib": "juros"}
FOCUS_UNI = {"ipca": "%", "selic": "% a.a.", "cambio": "R$", "pib": "%"}
FOCUS_LABEL = {"ipca": "IPCA", "selic": "Selic", "cambio": "Câmbio", "pib": "PIB"}
DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]


def nf(v, casas):
    if v is None:
        return "—"
    s = f"{v:,.{casas}f}"
    return s.replace(",", "§").replace(".", ",").replace("§", ".")


def ddmm(iso):
    try:
        return datetime.strptime(iso[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
    except Exception:
        return iso or "—"


def card_html(label, valor_txt, unidade, data_txt, cat):
    cor = COR.get(cat, COR["texto"])
    return f"""
    <td style="padding:6px;" valign="top">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid {COR['borda']};border-radius:10px;background:#ffffff;">
        <tr><td style="padding:12px 14px;">
          <div style="font:600 11px Arial,sans-serif;color:{COR['muted']};text-transform:uppercase;letter-spacing:.3px;">{label}</div>
          <div style="font:700 22px Arial,sans-serif;color:{cor};margin:6px 0 2px;">{valor_txt}
            <span style="font:400 12px Arial,sans-serif;color:{COR['muted']};">{unidade}</span></div>
          <div style="font:400 11px Arial,sans-serif;color:{COR['muted']};">{data_txt}</div>
        </td></tr>
      </table>
    </td>"""


def grid(cards, colunas=4):
    """Distribui uma lista de <td> em linhas de tabela (compatível com e-mail)."""
    linhas = ""
    for i in range(0, len(cards), colunas):
        linhas += "<tr>" + "".join(cards[i:i + colunas])
        faltam = colunas - len(cards[i:i + colunas])
        linhas += "<td></td>" * faltam + "</tr>"
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{linhas}</table>'


def montar_html(d):
    ind = d.get("indicadores", {})
    focus = d.get("focus", {})
    atualizado = ddmm(d.get("atualizado_em", "")) 

    # Cards de indicadores (na ordem definida, só o que existir)
    ordem = ["selic_meta", "cdi", "ipca_mes", "ipca_12m", "igpm_mes", "inpc_mes", "dolar", "euro"]
    cards_ind = []
    for k in ordem:
        it = ind.get(k)
        if not it:
            continue
        casas = 4 if k in ("dolar", "euro") else 2
        cards_ind.append(card_html(it["label"], nf(it["valor"], casas), UNI.get(k, ""), ddmm(it.get("data", "")), CAT.get(k, "")))

    # Cards Focus
    cards_focus = []
    for k in ["ipca", "selic", "cambio", "pib"]:
        f = focus.get(k)
        if not f:
            continue
        casas = 2
        cards_focus.append(card_html(FOCUS_LABEL[k], nf(f.get("mediana"), casas), FOCUS_UNI[k], f"ref. {f.get('referencia','')}", FOCUS_CAT[k]))

    # Tabela de câmbio (últimos ~10 pregões)
    usd = ind.get("dolar", {}).get("serie", [])
    eur = {p["data"]: p["valor"] for p in ind.get("euro", {}).get("serie", [])}
    linhas_tab = ""
    for i, p in enumerate(usd[-10:]):
        try:
            dt = datetime.strptime(p["data"][:10], "%Y-%m-%d")
            dia = DIAS[dt.weekday()]
        except Exception:
            dia = ""
        e = eur.get(p["data"])
        linhas_tab += f"""<tr>
          <td style="padding:6px 10px;font:400 12px Arial;color:{COR['texto']};border-bottom:1px solid {COR['borda']};">{ddmm(p['data'])}</td>
          <td style="padding:6px 10px;font:400 12px Arial;color:{COR['muted']};border-bottom:1px solid {COR['borda']};">{dia}</td>
          <td style="padding:6px 10px;font:400 12px Arial;color:{COR['texto']};border-bottom:1px solid {COR['borda']};text-align:right;">{nf(p['valor'],4)}</td>
          <td style="padding:6px 10px;font:400 12px Arial;color:{COR['texto']};border-bottom:1px solid {COR['borda']};text-align:right;">{nf(e,4) if e is not None else '—'}</td>
        </tr>"""

    aviso_amostra = ""
    if d.get("amostra"):
        aviso_amostra = f'<div style="font:600 12px Arial;color:{COR["inflacao"]};margin-bottom:10px;">⚠ Dados de amostra — ainda não houve coleta real.</div>'

    return f"""<!DOCTYPE html>
<html><body style="margin:0;background:#f4f6f9;padding:20px 0;">
  <table role="presentation" width="640" align="center" cellpadding="0" cellspacing="0"
         style="background:#ffffff;border:1px solid {COR['borda']};border-radius:12px;overflow:hidden;">
    <tr><td style="padding:22px 24px 8px;">
      <div style="font:700 20px Arial;color:{COR['texto']};">Painel <span style="color:{COR['juros']};">Macro</span></div>
      <div style="font:400 12px Arial;color:{COR['muted']};">Atualizado em {atualizado} · fonte: Banco Central do Brasil</div>
    </td></tr>
    <tr><td style="padding:12px 18px;">
      {aviso_amostra}
      <div style="font:600 11px Arial;color:{COR['muted']};text-transform:uppercase;letter-spacing:.5px;padding:8px 6px 2px;">Indicadores</div>
      {grid(cards_ind)}
      <div style="font:600 11px Arial;color:{COR['muted']};text-transform:uppercase;letter-spacing:.5px;padding:14px 6px 2px;">Expectativas · Focus</div>
      {grid(cards_focus)}
      <div style="font:600 11px Arial;color:{COR['muted']};text-transform:uppercase;letter-spacing:.5px;padding:14px 6px 6px;">Cotações diárias · câmbio</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid {COR['borda']};border-radius:8px;">
        <tr style="background:#f7f8fb;">
          <th style="padding:7px 10px;font:600 11px Arial;color:{COR['muted']};text-align:left;">Data</th>
          <th style="padding:7px 10px;font:600 11px Arial;color:{COR['muted']};text-align:left;">Dia</th>
          <th style="padding:7px 10px;font:600 11px Arial;color:{COR['muted']};text-align:right;">Dólar</th>
          <th style="padding:7px 10px;font:600 11px Arial;color:{COR['muted']};text-align:right;">Euro</th>
        </tr>
        {linhas_tab}
      </table>
    </td></tr>
    <tr><td style="padding:16px 24px 26px;text-align:center;">
      <a href="{PAINEL_URL}" style="display:inline-block;background:{COR['juros']};color:#ffffff;
         font:600 14px Arial;text-decoration:none;padding:12px 26px;border-radius:8px;">Abrir o dashboard completo →</a>
    </td></tr>
    <tr><td style="padding:0 24px 22px;">
      <div style="font:400 11px Arial;color:{COR['muted']};border-top:1px solid {COR['borda']};padding-top:12px;">
        Conteúdo meramente informativo — não constitui recomendação de investimento.</div>
    </td></tr>
  </table>
</body></html>"""


def main():
    user = os.environ.get("GMAIL_USER")
    senha = os.environ.get("GMAIL_APP_PASSWORD")
    destinatarios = [e.strip() for e in os.environ.get("EMAIL_DESTINATARIOS", "").split(",") if e.strip()]

    faltando = [n for n, v in [("GMAIL_USER", user), ("GMAIL_APP_PASSWORD", senha), ("EMAIL_DESTINATARIOS", destinatarios)] if not v]
    if faltando:
        print(f"ERRO: secrets ausentes: {', '.join(faltando)}", file=sys.stderr)
        sys.exit(1)

    if not DATA.exists():
        print("ERRO: data/painel.json não encontrado.", file=sys.stderr)
        sys.exit(1)
    d = json.loads(DATA.read_text(encoding="utf-8"))

    html = montar_html(d)
    hoje = datetime.now().strftime("%d/%m/%Y")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Painel Macro · {hoje}"
    msg["From"] = user
    msg["To"] = user                       # remetente no To; destinatários vão em CCO
    msg["Date"] = formatdate(localtime=True)
    msg.attach(MIMEText("Seu cliente de e-mail não exibe HTML. Abra o painel: " + PAINEL_URL, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP("smtp.gmail.com", 587) as s:
        s.starttls()
        s.login(user, senha)
        # envelope inclui os destinatários (CCO); cabeçalho não os expõe
        s.sendmail(user, [user] + destinatarios, msg.as_string())

    print(f"E-mail enviado para {len(destinatarios)} destinatário(s) em CCO.")


if __name__ == "__main__":
    main()
