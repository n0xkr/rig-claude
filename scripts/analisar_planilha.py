#!/usr/bin/env python3
"""
Analisa TODAS as abas de uma planilha (.xlsx/.xlsm/.csv) e descobre, por aba:
  - layout: TABELA | CHAVE_VALOR | TEXTO | VAZIA
  - linha do cabeçalho (ignora títulos/linhas em branco acima)
  - nomes de colunas limpos (sem ★/*), tipo inferido, % de preenchimento, valores distintos
  - linhas realmente preenchidas (descarta "linhas-fantasma" de fórmulas que só devolvem vazio/0)
  - sugestão de destino de importação no sistema (viagens | veiculos | manutencoes_veiculo)

É o mesmo algoritmo de packages/shared/src/planilhaScan.ts (usado pela tela de importação),
para conferir uma planilha fora do sistema ou gerar um relatório completo.

Uso:
  python scripts/analisar_planilha.py planilha.xlsx
  python scripts/analisar_planilha.py planilha.xlsx --json saida.json
  python scripts/analisar_planilha.py planilha.xlsx --buscar placa --buscar "fronteira"
  python scripts/analisar_planilha.py planilha.xlsx --aba FOLLOWUP --linhas 5

Dependência: pip install openpyxl
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

MAX_LINHAS_PARA_CABECALHO = 40
LIMITE_CATEGORICA = 15
LIMITE_LINHAS_IMPORTACAO = 5000
RESIDUOS = {"", "-", "—", "0", "n/a", "false", "sem dados", "sem viagem", "#n/a", "#ref!", "#value!", "#div/0!"}

REGEX_DATA = re.compile(r"^(\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?|\d{1,2}/\d{1,2}/\d{2,4}( \d{1,2}:\d{2})?)$")
REGEX_NUMERO = re.compile(r"^-?\d{1,3}([.,]\d{3})*([.,]\d+)?$|^-?\d+([.,]\d+)?$")
BOOLEANOS = {"sim", "nao", "não", "yes", "no", "true", "false", "s", "n", "x"}

# Campos do sistema por destino (espelho de IMPORT_TARGET_FIELDS em packages/shared).
CAMPOS: dict[str, list[tuple[str, str, bool]]] = {
    "veiculos": [
        ("placa", "Placa", True), ("tipo", "Tipo do veículo", False), ("marca", "Marca", False),
        ("modelo", "Modelo", False), ("ano_fabricacao", "Ano de fabricação", False),
        ("capacidade_kg", "Capacidade (kg)", False), ("frota_propria", "Frota própria", False),
        ("status_operacional", "Status operacional", False), ("motorista_atual", "Motorista atual", False),
        ("km_atual", "Quilometragem atual", False), ("nivel_combustivel", "Nível de combustível (%)", False),
        ("localizacao_atual", "Localização atual", False), ("ultima_manutencao_data", "Última manutenção", False),
        ("proxima_manutencao_data", "Próxima manutenção", False),
        ("observacoes_acompanhamento", "Observações", False),
    ],
    "viagens": [
        ("placa_cavalo", "Placa do cavalo", True), ("numero_crt", "Número do CRT", False),
        ("numero_mic_dta", "Número MIC/DTA", False), ("origem", "Origem", True), ("destino", "Destino", True),
        ("pais_destino", "País destino", False), ("peso_kg", "Peso (kg)", False),
        ("valor_frete", "Valor do frete", False), ("observacoes", "Observações", False),
    ],
    "manutencoes_veiculo": [
        ("placa", "Placa do veículo", True), ("tipo", "Tipo de manutenção", True),
        ("data_manutencao", "Data da manutenção", True), ("km_veiculo", "KM do veículo", False),
        ("custo", "Custo", True), ("descricao", "Descrição", False),
        ("proxima_manutencao_data", "Próxima manutenção (data)", False),
        ("proxima_manutencao_km", "Próxima manutenção (km)", False), ("observacoes", "Observações", False),
    ],
}

SINONIMOS: dict[str, list[str]] = {
    "placa": ["placa", "veiculo", "cavalo", "plate", "placa do veiculo", "placa cavalo"],
    "placa_cavalo": ["placa", "placa cavalo", "placa do cavalo", "cavalo", "veiculo"],
    "tipo": ["tipo", "tipo veiculo", "tipo de veiculo", "tipo unidade", "categoria"],
    "marca": ["marca", "fabricante"], "modelo": ["modelo"],
    "ano_fabricacao": ["ano", "ano fabricacao", "ano de fabricacao"],
    "capacidade_kg": ["capacidade", "capacidade kg", "carga maxima"],
    "frota_propria": ["frota propria", "propria"],
    "status_operacional": ["status", "situacao", "estado"],
    "motorista_atual": ["motorista", "condutor", "motorista atual", "nome do motorista"],
    "km_atual": ["km", "quilometragem", "odometro", "km atual", "mileage"],
    "nivel_combustivel": ["combustivel", "nivel combustivel", "tanque", "fuel"],
    "localizacao_atual": ["localizacao", "local", "posicao", "localizacao atual"],
    "ultima_manutencao_data": ["ultima manutencao", "manutencao anterior", "last maintenance"],
    "proxima_manutencao_data": ["proxima manutencao", "next maintenance", "prox manutencao"],
    "observacoes_acompanhamento": ["observacoes", "obs", "notas", "observacao"],
    "origem": ["origem", "saida", "partida"], "destino": ["destino", "chegada", "entrega"],
    "numero_crt": ["crt", "numero crt", "n crt", "crt n", "crt nº"],
    "numero_mic_dta": ["mic", "dta", "mic dta", "numero mic dta", "mic dta n"],
    "pais_destino": ["pais", "pais destino"], "peso_kg": ["peso", "peso kg"],
    "valor_frete": ["frete", "valor frete", "valor do frete"],
    "observacoes": ["observacoes", "obs", "notas", "observacao"],
    "data_manutencao": ["data", "data manutencao", "data da manutencao"],
    "km_veiculo": ["km", "km veiculo", "quilometragem"], "custo": ["custo", "valor", "preco"],
    "descricao": ["descricao", "servico", "detalhe"],
    "proxima_manutencao_km": ["proxima manutencao km", "prox km"],
}


# --------------------------------------------------------------------------- utilitários

def sem_acento(t: str) -> str:
    t = unicodedata.normalize("NFD", str(t))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def normalizar_celula(v: Any) -> Any:
    if isinstance(v, dt.datetime):
        return v.strftime("%Y-%m-%d") if (v.hour, v.minute, v.second) == (0, 0, 0) else v.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(v, dt.date):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, dt.time):
        return "1899-12-30" if v == dt.time(0, 0) else v.strftime("%H:%M:%S")
    if isinstance(v, str):
        t = v.strip()
        return None if t == "" else t
    if isinstance(v, float) and v != v:
        return None
    return v


def tipo_do_valor(v: Any) -> str:
    if isinstance(v, bool):
        return "booleano"
    if isinstance(v, (int, float)):
        return "numero"
    s = str(v).strip()
    if REGEX_DATA.match(s):
        return "data"
    if REGEX_NUMERO.match(s):
        return "numero"
    if s.lower() in BOOLEANOS:
        return "booleano"
    return "texto"


def celula_de_rotulo(v: Any) -> bool:
    n = normalizar_celula(v)
    return isinstance(n, str) and len(n) <= 80 and tipo_do_valor(n) == "texto"


def limpar_cabecalho(v: Any) -> str:
    s = re.sub(r"[\r\n\t]+", " ", str(v if v is not None else ""))
    s = re.sub(r"^[\s★☆*•·#>\-–—]+", "", s)
    s = re.sub(r"[\s*]+$", "", s)
    return re.sub(r"\s{2,}", " ", s).strip()


def letra_coluna(i: int) -> str:
    s = ""
    n = i
    while True:
        s = chr(65 + n % 26) + s
        n = n // 26 - 1
        if n < 0:
            return s


def vazia(v: Any) -> bool:
    return normalizar_celula(v) is None


# --------------------------------------------------------------------------- leitura

def ler_matrizes(caminho: Path) -> list[dict[str, Any]]:
    ext = caminho.suffix.lower()
    if ext in (".csv", ".txt"):
        with open(caminho, newline="", encoding="utf-8-sig", errors="replace") as f:
            amostra = f.read(4096)
            f.seek(0)
            try:
                dialeto = csv.Sniffer().sniff(amostra, delimiters=",;\t|")
            except csv.Error:
                dialeto = csv.excel
            return [{"nome": caminho.stem, "oculta": False, "matriz": [list(r) for r in csv.reader(f, dialeto)]}]
    if ext in (".xlsx", ".xlsm", ".xltx", ".xltm"):
        try:
            import openpyxl
        except ImportError:
            sys.exit("Instale a dependência:  pip install openpyxl")
        # read_only + data_only: rápido e devolve o valor calculado (cache) das fórmulas.
        wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
        abas = []
        for ws in wb.worksheets:
            abas.append({
                "nome": ws.title,
                "oculta": ws.sheet_state != "visible",
                "matriz": [list(r) for r in ws.iter_rows(values_only=True)],
            })
        return abas
    if ext == ".xls":
        try:
            import pandas as pd
            folhas = pd.read_excel(caminho, sheet_name=None, header=None, engine="xlrd")
        except Exception as e:  # noqa: BLE001
            sys.exit(f"Para .xls instale 'pip install pandas xlrd' (ou salve como .xlsx). Detalhe: {e}")
        return [{"nome": n, "oculta": False, "matriz": df.astype(object).where(df.notna(), None).values.tolist()}
                for n, df in folhas.items()]
    sys.exit(f"Formato não suportado: {ext} (use .xlsx, .xlsm, .xls ou .csv)")


# --------------------------------------------------------------------------- análise de aba

def achar_cabecalho(matriz: list[list[Any]]) -> int | None:
    melhor: tuple[int, float] | None = None
    for r in range(min(len(matriz), MAX_LINHAS_PARA_CABECALHO)):
        linha = matriz[r]
        preenchidas = [c for c in linha if not vazia(c)]
        if len(preenchidas) < 2:
            continue
        rotulos = [c for c in linha if celula_de_rotulo(c)]
        if len(rotulos) / len(preenchidas) < 0.8:
            continue
        nomes = [limpar_cabecalho(c).lower() for c in rotulos]
        if len(set(nomes)) / len(nomes) < 0.7:
            continue
        abaixo = 0
        for k in range(r + 1, min(len(matriz), r + 6)):
            if sum(1 for c in matriz[k] if not vazia(c)) >= max(2, int(len(preenchidas) * 0.3)):
                abaixo += 1
        pontos = len(rotulos) * (1 + abaixo / 5)
        if melhor is None or pontos > melhor[1] * 1.15:
            melhor = (r, pontos)
    return melhor[0] if melhor else None


def perfilar_coluna(nome: str, indice: int, valores: list[Any], total: int) -> dict[str, Any]:
    preench = [v for v in valores if v is not None]
    if not preench:
        return {"nome": nome, "indice": indice, "tipo": "vazio", "preenchimento": 0.0, "distintos": 0, "exemplos": []}
    tipos = {tipo_do_valor(v) for v in preench}
    tipo = next(iter(tipos)) if len(tipos) == 1 else "misto"
    distintos = list(dict.fromkeys(str(v) for v in preench))
    perfil: dict[str, Any] = {
        "nome": nome, "indice": indice, "tipo": tipo,
        "preenchimento": round(len(preench) / total, 4) if total else 0.0,
        "distintos": len(distintos),
        "exemplos": [d if len(d) <= 60 else d[:57] + "..." for d in distintos[:4]],
    }
    if tipo == "texto" and len(distintos) <= LIMITE_CATEGORICA and len(preench) >= len(distintos) * 2:
        perfil["valoresDistintos"] = sorted(distintos)
    return perfil


def filtrar_fantasmas(candidatas: list[tuple[int, list[Any]]], n_cols: int) -> list[tuple[int, list[Any]]]:
    """Descarta linhas-modelo pré-formatadas: só têm resíduo de fórmula (0, N/A, '-', 00:00) ou
    valores constantes em quase todas as linhas."""
    if not candidatas:
        return candidatas

    def residuo(v: Any) -> bool:
        return v is None or str(v).strip().lower() in RESIDUOS or str(v).startswith("1899-12-")

    constante = []
    for c in range(n_cols):
        cont = Counter(str(v[c]) for _, v in candidatas if v[c] is not None)
        preench = sum(cont.values())
        topo = max(cont.values(), default=0)
        constante.append(len(candidatas) >= 20 and preench > 0 and topo / len(candidatas) >= 0.9)
    return [(ln, v) for ln, v in candidatas if any(not residuo(x) and not constante[c] for c, x in enumerate(v))]


def analisar_aba(bruta: dict[str, Any]) -> dict[str, Any]:
    matriz = bruta["matriz"]
    aba: dict[str, Any] = {
        "nome": bruta["nome"], "oculta": bruta["oculta"], "tipo": "VAZIA", "linhaCabecalho": None,
        "cabecalhos": [], "colunas": [], "linhas": [], "linhasDescartadas": 0, "observacoes": [],
    }
    if bruta["oculta"]:
        aba["observacoes"].append("Aba oculta no Excel.")
    if not any(not vazia(c) for l in matriz for c in l):
        aba["observacoes"].append("Aba sem nenhum dado.")
        return aba

    cab = achar_cabecalho(matriz)
    if cab is None:
        uteis = [[normalizar_celula(c) for c in l if not vazia(c)] for l in matriz]
        uteis = [u for u in uteis if u]
        largura = max(len(u) for u in uteis)
        pares = [u for u in uteis if len(u) >= 2]
        if largura <= 3 and len(pares) >= 2:
            aba["tipo"] = "CHAVE_VALOR"
            aba["pares"] = [{"chave": str(u[0]), "valor": u[1] if len(u) == 2 else u[1:]} for u in pares]
            aba["observacoes"].append(f"{len(pares)} pares rótulo → valor (indicadores/parâmetros).")
        else:
            aba["tipo"] = "TEXTO"
            aba["texto"] = "\n".join(" | ".join(str(c) for c in u) for u in uteis)
            aba["observacoes"].append("Aba de texto/instruções — sem estrutura de tabela.")
        return aba

    linha_cab = matriz[cab]
    resto = matriz[cab + 1:]
    largura = max([len(linha_cab)] + [len(l) for l in resto])
    get = lambda l, c: l[c] if c < len(l) else None  # noqa: E731
    indices = [c for c in range(largura)
               if not vazia(get(linha_cab, c)) or any(not vazia(get(l, c)) for l in resto)]

    usados: Counter[str] = Counter()
    cabecalhos = []
    for c in indices:
        nome = limpar_cabecalho(get(linha_cab, c)) or f"Coluna {letra_coluna(c)}"
        usados[nome.lower()] += 1
        cabecalhos.append(nome if usados[nome.lower()] == 1 else f"{nome} ({usados[nome.lower()]})")

    candidatas = []
    for r, l in enumerate(resto, start=cab + 2):
        valores = [normalizar_celula(get(l, c)) for c in indices]
        if any(v is not None for v in valores):
            candidatas.append((r, valores))
    reais = filtrar_fantasmas(candidatas, len(indices))
    descartadas = len(resto) - len(reais)

    aba["tipo"] = "TABELA" if reais else "VAZIA"
    aba["linhaCabecalho"] = cab + 1
    aba["cabecalhos"] = cabecalhos
    aba["linhas"] = [{**dict(zip(cabecalhos, v)), "__linha": ln} for ln, v in reais]
    aba["colunas"] = [perfilar_coluna(h, indices[i], [v[i] for _, v in reais], len(reais))
                      for i, h in enumerate(cabecalhos)]
    aba["linhasDescartadas"] = descartadas
    obs = aba["observacoes"]
    if cab > 0:
        obs.append(f"Cabeçalho na linha {cab + 1} (linhas acima ignoradas).")
    if len(candidatas) - len(reais) > 0:
        obs.append(f"{len(candidatas) - len(reais)} linha(s) só com resíduo de fórmula foram ignoradas.")
    if len(reais) > LIMITE_LINHAS_IMPORTACAO:
        obs.append(f"{len(reais)} linhas; a importação aceita até {LIMITE_LINHAS_IMPORTACAO} por lote.")
    n_vazias = sum(1 for c in aba["colunas"] if c["tipo"] == "vazio")
    if n_vazias:
        obs.append(f"{n_vazias} coluna(s) sem nenhum valor.")
    if not reais:
        obs.append("Tabela com cabeçalho, mas sem linhas de dados.")
    return aba


# --------------------------------------------------------------------------- destino sugerido

DICA_NOME_ABA = {
    "viagens": ["viagem", "viagens", "followup", "follow up"],
    "veiculos": ["veiculo", "veiculos", "frota"],
    "manutencoes_veiculo": ["manutencao", "manutencoes"],
}
MINIMO_CAMPOS_FORTES = 6


def mapear_por_nome(alvo: str, cabecalhos: list[str]) -> tuple[dict[str, str | None], set[str]]:
    """Fase 1: igualdade de nome/sinônimo ("fortes"). Fase 2: 'contém' só para o que sobrou."""
    campos = CAMPOS[alvo]
    usados: set[str] = set()
    fortes: set[str] = set()
    mapa: dict[str, str | None] = {c: None for c in cabecalhos}

    def nomes(key: str, label: str) -> list[str]:
        return [key.replace("_", " "), sem_acento(label), *SINONIMOS.get(key, [])]

    for col in cabecalhos:
        c = sem_acento(col)
        for key, label, _ in campos:
            if key not in usados and c in nomes(key, label):
                usados.add(key)
                fortes.add(key)
                mapa[col] = key
                break
    for col in cabecalhos:
        if mapa[col]:
            continue
        c = sem_acento(col)
        if len(c) < 3:
            continue
        melhor: tuple[str, int] | None = None
        for key, _, _ in campos:
            if key in usados:
                continue
            for n in SINONIMOS.get(key, []):
                if len(n) >= 4 and (n in c or c in n) and (melhor is None or len(n) > melhor[1]):
                    melhor = (key, len(n))
        if melhor:
            usados.add(melhor[0])
            mapa[col] = melhor[0]
    return mapa, fortes


def sugerir_alvo(cabecalhos: list[str], nome_aba: str = "") -> dict[str, Any] | None:
    """Destino só se todos os obrigatórios casarem por nome exato E (>=6 campos exatos OU o nome da
    aba indicar o destino). Caso contrário a aba é de referência (motoristas, rastreadores, listas…)."""
    nome = sem_acento(nome_aba)
    melhor = None
    for alvo, campos in CAMPOS.items():
        mapa, fortes = mapear_por_nome(alvo, cabecalhos)
        obrig = [k for k, _, req in campos if req]
        dica = any(d in nome for d in DICA_NOME_ABA[alvo])
        if not (all(k in fortes for k in obrig) and (len(fortes) >= MINIMO_CAMPOS_FORTES or dica)):
            continue
        pontos = len(fortes) + (10 if dica else 0)
        if melhor is None or pontos > melhor["pontos"]:
            melhor = {"target": alvo, "pontos": pontos, "mapeamento": {c: k for c, k in mapa.items() if k}}
    return melhor


# --------------------------------------------------------------------------- busca e relatório

def buscar(abas: list[dict[str, Any]], termo: str, limite: int = 40) -> list[str]:
    alvo = sem_acento(termo)
    achados: list[str] = []
    for a in abas:
        if alvo in sem_acento(a["nome"]):
            achados.append(f"[aba] {a['nome']}")
        for h in a["cabecalhos"]:
            if alvo in sem_acento(h):
                achados.append(f"[coluna] {a['nome']} › {h}")
        for p in a.get("pares", []):
            if alvo in sem_acento(f"{p['chave']} {p['valor']}"):
                achados.append(f"[chave] {a['nome']} › {p['chave']} = {p['valor']}")
        for l in a["linhas"]:
            for h in a["cabecalhos"]:
                v = l.get(h)
                if v is not None and alvo in sem_acento(v):
                    achados.append(f"[célula] {a['nome']} linha {l['__linha']} › {h} = {v}")
            if len(achados) >= limite:
                return achados[:limite]
    return achados[:limite]


def imprimir_relatorio(abas: list[dict[str, Any]], detalhe: str | None, n_linhas: int) -> None:
    print(f"\n{'ABA':<20} {'TIPO':<12} {'CAB.':>5} {'LINHAS':>7} {'COLS':>5}  DESTINO SUGERIDO")
    print("-" * 78)
    for a in abas:
        s = sugerir_alvo(a["cabecalhos"], a["nome"]) if a["tipo"] == "TABELA" else None
        print(f"{a['nome']:<20} {a['tipo']:<12} {a['linhaCabecalho'] or '-':>5} {len(a['linhas']):>7} "
              f"{len(a['cabecalhos']):>5}  {s['target'] if s else '— (referência)'}"
              f"{'  [oculta]' if a['oculta'] else ''}")
    for a in abas:
        if detalhe and a["nome"].lower() != detalhe.lower():
            continue
        if not detalhe and a["tipo"] != "TABELA":
            continue
        print(f"\n=== {a['nome']} — {a['tipo']} ===")
        for o in a["observacoes"]:
            print(f"  • {o}")
        s = sugerir_alvo(a["cabecalhos"], a["nome"]) if a["tipo"] == "TABELA" else None
        if s:
            print(f"  → destino: {s['target']}  mapeamento: {s['mapeamento']}")
        if a["tipo"] == "CHAVE_VALOR":
            for p in a["pares"][:n_linhas * 4]:
                print(f"    {p['chave']}: {p['valor']}")
        for c in a["colunas"][: (None if detalhe else 12)]:
            extra = f"  valores={c['valoresDistintos']}" if c.get("valoresDistintos") else ""
            print(f"    {c['nome'][:38]:<38} {c['tipo']:<9} {c['preenchimento']*100:5.1f}%  "
                  f"{c['distintos']:>4} distintos  ex: {c['exemplos'][:2]}{extra}")
        if not detalhe and len(a["colunas"]) > 12:
            print(f"    ... +{len(a['colunas']) - 12} colunas (use --aba \"{a['nome']}\" para todas)")
        for l in a["linhas"][:n_linhas]:
            print("    ›", {k: v for k, v in l.items() if v is not None and k != "__linha"})


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Analisa todas as abas de uma planilha.")
    ap.add_argument("arquivo")
    ap.add_argument("--json", help="grava o resultado completo (perfil + linhas) neste arquivo")
    ap.add_argument("--aba", help="detalha somente esta aba (todas as colunas)")
    ap.add_argument("--linhas", type=int, default=2, help="linhas de exemplo por aba (padrão 2)")
    ap.add_argument("--buscar", action="append", default=[], help="procura termo em abas/colunas/células (repetível)")
    args = ap.parse_args()

    caminho = Path(args.arquivo)
    if not caminho.exists():
        sys.exit(f"Arquivo não encontrado: {caminho}")
    abas = [analisar_aba(b) for b in ler_matrizes(caminho)]

    tabelas = [a for a in abas if a["tipo"] == "TABELA"]
    print(f"Arquivo: {caminho.name} — {len(abas)} aba(s), {len(tabelas)} tabela(s), "
          f"{sum(len(a['linhas']) for a in abas)} linhas de dados, "
          f"{sum(len(a['cabecalhos']) for a in abas)} colunas")
    imprimir_relatorio(abas, args.aba, args.linhas)

    for termo in args.buscar:
        print(f"\n--- busca: {termo!r} ---")
        for x in buscar(abas, termo) or ["(nada encontrado)"]:
            print(" ", x)

    if args.json:
        Path(args.json).write_text(json.dumps(abas, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
        print(f"\nJSON completo gravado em {args.json}")


if __name__ == "__main__":
    main()
