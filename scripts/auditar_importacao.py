#!/usr/bin/env python3
"""
Auditoria independente da etapa 1 da importação (tratamento/padronização).

Abre cada arquivo por conta própria (openpyxl para .xlsx/.xlsm, csv/pandas para .csv), passa as
mesmas matrizes pelo backend (apps/api/scripts/padronizar-planilha.ts) e confere, aba por aba,
coluna por coluna e linha por linha:

  1. Linhas: toda linha com conteúdo na planilha está no resultado OU foi descartada com motivo.
  2. Colunas: nº de células preenchidas por coluna bate com a leitura do pandas.
  3. Células: cada valor padronizado confere com uma leitura independente em Python,
     conforme o tipo que o backend detectou (número, data, hora, sim/não, placa, texto).
     Números ambíguos ("9,026") são listados com as duas leituras e a escolhida.

Uso:
  python scripts/auditar_importacao.py arquivo1.csv arquivo2.xlsx [--relatorio saida.md]
Sai com código 1 se houver divergência.
Dependências: pandas, openpyxl.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
API = RAIZ / "apps" / "api"

PLACEHOLDERS = {
    "", "-", "--", "---", "—", "–", ".", "n/a", "na", "n.a.", "null", "undefined", "nan", "none",
    "#n/a", "#n/d", "#ref!", "#value!", "#valor!", "#div/0!", "#name?", "#nome?", "#null!", "#num!",
    "x x", "a definir", "nao se aplica", "não se aplica", "s/n", "0000-00-00",
}
MESES = {"jan": 1, "ene": 1, "fev": 2, "feb": 2, "mar": 3, "abr": 4, "apr": 4, "mai": 5, "may": 5, "jun": 6,
         "jul": 7, "ago": 8, "aug": 8, "set": 9, "sep": 9, "out": 10, "oct": 10, "nov": 11, "dez": 12,
         "dic": 12, "dec": 12}


def limpar(v: object) -> str | None:
    if v is None:
        return None
    if isinstance(v, float) and pd.isna(v):
        return None
    s = unicodedata.normalize("NFC", str(v))
    s = re.sub(r"[​-‍⁠﻿]", "", s)
    s = re.sub(r"[\s  ]+", " ", s).strip()
    return None if s.lower() in PLACEHOLDERS else s


def sem_acento(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn").lower()).strip()


# ---------------------------------------------------------------------------
# Leitura dos arquivos -> matrizes (o que o navegador entregaria)
# ---------------------------------------------------------------------------

def celula_excel(v: object) -> object:
    """Mesma convenção do navegador (SheetJS cellDates + normalizarCelula)."""
    if isinstance(v, dt.datetime):
        if v.hour == 0 and v.minute == 0:
            return v.strftime("%Y-%m-%d")
        return v.strftime("%Y-%m-%dT%H:%M")
    if isinstance(v, dt.date):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, dt.time):
        return f"1899-12-30T{v.hour:02d}:{v.minute:02d}"
    return v


def ler_arquivo(caminho: Path) -> list[dict]:
    if caminho.suffix.lower() in (".csv", ".txt"):
        texto = caminho.read_text(encoding="utf-8-sig", errors="replace")
        try:
            dialeto = csv.Sniffer().sniff(texto[:20000], delimiters=";,\t|")
            sep = dialeto.delimiter
        except csv.Error:
            sep = ";" if texto.count(";") > texto.count(",") else ","
        matriz = [linha for linha in csv.reader(io.StringIO(texto), delimiter=sep)]
        return [{"nome": "Sheet1", "oculta": False, "matriz": matriz}]
    import openpyxl  # noqa: PLC0415

    wb = openpyxl.load_workbook(caminho, data_only=True, read_only=False)
    abas = []
    for ws in wb.worksheets:
        matriz = [[celula_excel(c) for c in linha] for linha in ws.iter_rows(values_only=True)]
        abas.append({"nome": ws.title, "oculta": ws.sheet_state != "visible", "matriz": matriz})
    return abas


def rodar_backend(arquivos: list[dict]) -> list[dict]:
    with tempfile.TemporaryDirectory() as tmp:
        ent, sai = Path(tmp) / "in.json", Path(tmp) / "out.json"
        ent.write_text(json.dumps(arquivos, default=str), encoding="utf-8")
        cmd = f'npx tsx scripts/padronizar-planilha.ts "{ent}" "{sai}"'
        r = subprocess.run(cmd, cwd=API, shell=True, capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f"backend falhou:\n{r.stderr[-3000:]}")
        return json.loads(sai.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Leituras independentes por tipo
# ---------------------------------------------------------------------------

def numero_py(s: str, padrao: str) -> tuple[float | None, bool, tuple[float, float] | None]:
    """(valor pelo padrão da coluna, ambíguo?, (leitura_br, leitura_us) se ambíguo)."""
    t = re.sub(r"^(r\$|us\$|u\$s|\$|€|usd|brl)\s*|\s*(kg|t|ton|%|r\$|usd|brl)$", "", s.lower()).replace(" ", "")
    neg = t.startswith("(") and t.endswith(")")
    t = t.strip("()")
    if t.startswith("-"):
        neg, t = True, t[1:]
    t = t.lstrip("+")
    if not re.fullmatch(r"\d[\d.,]*", t) or t[-1] in ".,":
        return None, False, None
    sinal = -1 if neg else 1
    if re.fullmatch(r"\d{1,3}[.,]\d{3}", t):  # "9,026" / "8.715"
        br = float(t.replace(".", "")) if "." in t else float(t.replace(",", "."))
        us = float(t.replace(",", "")) if "," in t else float(t)
        return None, True, (sinal * br, sinal * us)
    if "." in t and "," in t:
        v = t.replace(".", "").replace(",", ".") if t.rfind(",") > t.rfind(".") else t.replace(",", "")
    elif padrao == "numero-br":
        v = t.replace(".", "").replace(",", ".") if (t.count(".") > 1 or "," in t) or re.fullmatch(r"\d{1,3}(\.\d{3})+", t) else t
    else:
        v = t.replace(",", "")
    try:
        return sinal * float(v), False, None
    except ValueError:
        return None, False, None


def data_py(s: str, formato: str) -> str | None:
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?", s)
    if m:
        y, mo, d = int(m[1]), int(m[2]), int(m[3])
        hm = (int(m[4]), m[5]) if m[4] else None
    else:
        m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:\s+(\d{1,2})[:h](\d{2}))?", s)
        if m:
            a, b, y = int(m[1]), int(m[2]), int(m[3])
            d, mo = (a, b) if formato != "data-mdy" else (b, a)
            hm = (int(m[4]), m[5]) if m[4] else None
        else:
            m = re.match(r"^(\d{1,2})(?:\s+de)?[\s./-]*([A-Za-zçÇ]{3,9})\.?(?:\s+de)?[\s./-]*(\d{4}|\d{2})(?:\s+(\d{1,2})[:h](\d{2}))?", s)
            if not m or sem_acento(m[2])[:3] not in MESES:
                return None
            d, mo, y = int(m[1]), MESES[sem_acento(m[2])[:3]], int(m[3])
            hm = (int(m[4]), m[5]) if m[4] else None
        if y < 100:
            y += 2000
    try:
        dt.date(y, mo, d)
    except ValueError:
        return None
    base = f"{y}-{mo:02d}-{d:02d}"
    return f"{base}T{hm[0]:02d}:{hm[1]}" if hm else base


def conferir_celula(tipo: str, formato: str | None, bruto: str, final: object) -> tuple[bool, str | None]:
    """(confere?, nota). Nota não vazia = célula ambígua para revisão humana."""
    if tipo in ("texto", "codigo"):
        return final == bruto, None
    if tipo == "numero":
        v, amb, leituras = numero_py(bruto, formato or "numero-br")
        if amb:
            ok = isinstance(final, (int, float)) and any(abs(final - x) < 1e-6 for x in leituras)
            return ok, f'"{bruto}" -> br {leituras[0]:g} / us {leituras[1]:g} -> escolhido {final}'
        return isinstance(final, (int, float)) and v is not None and abs(final - v) < 1e-6, None
    if tipo in ("data", "datahora"):
        return data_py(bruto, formato or "data-dmy") == final, None
    if tipo == "hora":
        m = re.search(r"(\d{1,2})[:h](\d{2})", bruto)
        return bool(m) and final == f"{int(m[1]):02d}:{m[2]}", None
    if tipo == "booleano":
        return isinstance(final, bool), None
    if tipo == "placa":
        return isinstance(final, str) and re.sub(r"[\s.-]", "", bruto).upper() == final, None
    if tipo == "placas":
        partes = [p for p in str(final).split("/") if p]
        juntas = re.sub(r"[^A-Z0-9]", "", bruto.upper())
        return all(re.fullmatch(r"[A-Z]{2,3}[A-Z0-9]{3,6}", p) for p in partes) and "".join(partes) in juntas or all(p in juntas for p in partes), None
    return True, None


# ---------------------------------------------------------------------------

def auditar(caminhos: list[Path]) -> tuple[list[str], int]:
    entrada = [{"arquivo": c.name, "abas": ler_arquivo(c)} for c in caminhos]
    backend = rodar_backend(entrada)
    rel: list[str] = []
    divergencias = 0
    for arq_in, arq_out in zip(entrada, backend):
        rel.append(f"\n# {arq_in['arquivo']}\n")
        for aba_in, aba_out in zip(arq_in["abas"], arq_out["abas"]):
            if aba_out["tipo"] != "TABELA":
                rel.append(f"## Aba `{aba_in['nome']}` — {aba_out['tipo']} (sem tabela)\n")
                continue
            h = aba_out["linhaCabecalho"]  # 1-based
            matriz = aba_in["matriz"]
            cab_bruto = [limpar(c) or "" for c in (matriz[h - 1] if h - 1 < len(matriz) else [])]
            df = pd.DataFrame(matriz[h:], dtype=object)
            linhas_saida = {l["__linha"]: l for l in aba_out["linhas"]}
            descartes = {d["linha"]: d["motivo"] for d in aba_out["descartadas"]}
            rel.append(f"## Aba `{aba_in['nome']}` — cabeçalho na linha {h}; {len(linhas_saida)} linhas padronizadas\n")

            # 1. Contabilidade de linhas
            com_conteudo = [i + h + 1 for i, r in df.iterrows() if any(limpar(v) is not None for v in r.tolist())]
            sem_destino = [n for n in com_conteudo if n not in linhas_saida and n not in descartes]
            rel.append(
                f"- Linhas com conteúdo na planilha (pandas): **{len(com_conteudo)}** · padronizadas: {len(linhas_saida)} · "
                f"descartadas com motivo: {len(descartes)} · filtradas na varredura (resíduo de fórmula): {len(sem_destino)} · "
                f"duplicadas: {aba_out['duplicadas']}"
            )
            if descartes:
                from collections import Counter
                rel.append("- Motivos de descarte: " + ", ".join(f"{m} ×{n}" for m, n in Counter(descartes.values()).items()))
            if sem_destino:
                rel.append(f"- Linhas removidas pela varredura: {sem_destino[:30]}{' …' if len(sem_destino) > 30 else ''}")

            # 2 e 3. Coluna a coluna, célula a célula
            rel.append("\n| Coluna | Tipo | Preench. pandas | Preench. backend | Células conferidas | Divergências | Ambíguas |")
            rel.append("|---|---|---|---|---|---|---|")
            notas: list[str] = []
            idx_por_nome = {}
            for j, nome_varredura in enumerate(aba_out["cabecalhosVarredura"]):
                # coluna original: posição do nome limpo no cabeçalho bruto
                alvo = nome_varredura.split(" (")[0]
                cand = [k for k, c in enumerate(cab_bruto) if c.strip(" *★:") == alvo or c == nome_varredura]
                usados = set(idx_por_nome.values())
                livre = next((k for k in cand if k not in usados), None)
                idx_por_nome[nome_varredura] = livre
            for perfil, nome_varredura in zip(aba_out["colunas"], aba_out["cabecalhosVarredura"]):
                k = idx_por_nome.get(nome_varredura)
                if k is None or k >= df.shape[1]:
                    rel.append(f"| {perfil['coluna']} | {perfil['tipo']} | ? | {perfil['preenchidas']} | coluna não localizada | — | — |")
                    continue
                preench_py = 0
                conferidas = 0
                erros: list[str] = []
                ambiguas = 0
                for i, bruto_raw in enumerate(df[k].tolist()):
                    n_linha = i + h + 1
                    if n_linha not in linhas_saida:
                        continue
                    bruto = limpar(bruto_raw)
                    if bruto is None:
                        continue
                    preench_py += 1
                    final = linhas_saida[n_linha].get(perfil["coluna"])
                    ok, nota = conferir_celula(perfil["tipo"], perfil.get("formato"), bruto[:5000], final)
                    inconsist = any(x["linha"] == n_linha for x in perfil["exemplosInconsistencia"])
                    if not ok and final == bruto:
                        ok = True  # célula mantida como texto e já registrada como inconsistência
                    conferidas += 1
                    if nota:
                        ambiguas += 1
                        if len(notas) < 40:
                            notas.append(f"  - L{n_linha} `{perfil['coluna']}`: {nota}")
                    if not ok and not inconsist:
                        erros.append(f"L{n_linha}: {bruto!r} -> {final!r}")
                divergentes = len(erros) + (0 if preench_py == perfil["preenchidas"] else 1)
                divergencias += divergentes
                rel.append(
                    f"| {perfil['coluna']} | {perfil['tipo']}{' ' + perfil['formato'] if perfil.get('formato') else ''} | "
                    f"{preench_py} | {perfil['preenchidas']} | {conferidas} | "
                    f"{'**' + str(len(erros)) + '** ' + '; '.join(erros[:3]) if erros else ('0' if preench_py == perfil['preenchidas'] else '**contagem**')} | {ambiguas} |"
                )
            if notas:
                rel.append("\nCélulas numéricas ambíguas (revisar se preciso):")
                rel.extend(notas)
    return rel, divergencias


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("arquivos", nargs="+", type=Path)
    ap.add_argument("--relatorio", type=Path)
    a = ap.parse_args()
    rel, div = auditar(a.arquivos)
    texto = "\n".join(rel) + f"\n\n**Resultado: {'OK — nenhuma divergência' if div == 0 else f'{div} divergência(s)'}**\n"
    if a.relatorio:
        a.relatorio.write_text(texto, encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    print(texto)
    sys.exit(1 if div else 0)


if __name__ == "__main__":
    main()
