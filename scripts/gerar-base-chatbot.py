"""Gera a base de conhecimento do assistente de dúvidas (chatbot/base.json).

Lê os PDFs da pasta "Trilhas" (o conteúdo de cada trilha e de cada módulo),
limpa o texto e divide em trechos curtos. O servidor (chatbot.js) busca nesses
trechos para responder as dúvidas dos alunos.

- Os PDFs da subpasta "Questões" NÃO entram: eles trazem o gabarito, e o
  assistente não deve entregar as respostas dos exercícios.
- Só precisa rodar de novo quando o conteúdo das trilhas mudar.

Uso (na pasta do projeto):
    pip install pymupdf
    python scripts/gerar-base-chatbot.py "C:/caminho/para/Trilhas"

Depois é só fazer o deploy: o servidor lê chatbot/base.json ao iniciar.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import pymupdf  # pip install pymupdf

TAM_TRECHO = 900      # caracteres por trecho (aprox.)
SOBREPOSICAO = 200    # repete um pedaço do trecho anterior, para não cortar ideias
SECOES = ("Descrição da trilha", "Apresentação da trilha", "Conclusão da trilha",
          "Apresentação", "Conteúdo", "Conclusão", "Exemplo", "Dica", "Resumo")

PROJETO = Path(__file__).resolve().parent.parent
SAIDA = PROJETO / "chatbot" / "base.json"


def sem_acento(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def limpar(texto):
    texto = texto.replace("\xa0", " ").replace("\u2022", " ").replace("\uf0b7", " ")
    texto = re.sub(r"(?im)^\s*p[aá]gina\s+\d+\s*$", " ", texto)
    texto = re.sub(r"(?im)^\s*\d{1,3}\s*$", " ", texto)       # número de página solto
    texto = re.sub(r"-\n(?=[a-zà-ú])", "", texto)               # palavra quebrada no fim da linha
    return texto


def separar_secoes(texto):
    """Divide o texto do módulo em [(seção, texto)], usando os títulos do PDF."""
    padrao = re.compile(r"(?m)^\s*(" + "|".join(re.escape(s) for s in SECOES) + r")\s*$")
    partes, ultimo, secao = [], 0, "Introdução"
    for m in padrao.finditer(texto):
        antes = texto[ultimo:m.start()]
        if antes.strip():
            partes.append((secao, antes))
        secao, ultimo = m.group(1), m.end()
    resto = texto[ultimo:]
    if resto.strip():
        partes.append((secao, resto))
    return partes


def dividir(texto):
    texto = re.sub(r"\s+", " ", texto).strip()
    trechos, inicio, n = [], 0, len(texto)
    while inicio < n:
        fim = min(inicio + TAM_TRECHO, n)
        if fim < n:
            janela = texto[inicio:fim]
            corte = max(janela.rfind(". "), janela.rfind("? "), janela.rfind("! "))
            if corte < TAM_TRECHO * 0.5:
                corte = janela.rfind(" ")
            if corte > TAM_TRECHO * 0.4:
                fim = inicio + corte + 1
        trecho = texto[inicio:fim].strip()
        if len(trecho) > 60:
            trechos.append(trecho)
        if fim >= n:
            break
        inicio = max(fim - SOBREPOSICAO, inicio + 1)
        # recomeça no início de uma palavra
        espaco = texto.find(" ", inicio)
        if 0 <= espaco - inicio < 30:
            inicio = espaco + 1
    return trechos


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    pasta = Path(sys.argv[1])
    if not pasta.is_dir():
        sys.exit(f"Pasta não encontrada: {pasta}")

    pdfs = sorted(
        p for p in pasta.rglob("*.pdf")
        if "questoes" not in sem_acento(str(p.relative_to(pasta)))
    )

    trechos = []
    for pdf in pdfs:
        relativo = pdf.relative_to(pasta)
        if len(relativo.parts) == 1:          # "Trilha 1 - Aprendiz de Moeda.pdf"
            trilha = pdf.stem
            modulo = "Visão geral da trilha"
            titulo = trilha.split(" - ", 1)[-1]
        else:                                  # "Trilha 1 - .../Módulo 4 - Poder de compra.pdf"
            trilha = relativo.parts[0]
            modulo = pdf.stem
            titulo = modulo.split(" - ", 1)[-1]

        doc = pymupdf.open(pdf)
        texto = limpar("\n".join(pagina.get_text() for pagina in doc))
        # a 1ª linha costuma repetir o nome do módulo/trilha
        texto = re.sub(r"^\s*" + re.escape(pdf.stem) + r"\s*\n", "", texto)

        antes = len(trechos)
        for secao, parte in separar_secoes(texto):
            for t in dividir(parte):
                trechos.append({
                    "trilha": trilha,
                    "modulo": modulo,
                    "titulo": titulo,
                    "secao": secao,
                    "texto": t,
                })
        print(f"{len(trechos) - antes:3} trechos  {relativo}")

    SAIDA.parent.mkdir(exist_ok=True)
    SAIDA.write_text(
        json.dumps({"versao": 1, "trechos": trechos}, ensure_ascii=False, indent=0),
        encoding="utf-8",
    )
    print(f"\n{len(trechos)} trechos de {len(pdfs)} PDFs -> {SAIDA}")


if __name__ == "__main__":
    main()
