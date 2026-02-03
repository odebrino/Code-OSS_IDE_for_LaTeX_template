from pathlib import Path

import pytest

from src.core.build import build_pdf, find_tectonic


def test_build_pdf() -> None:
    try:
        find_tectonic()
    except FileNotFoundError:
        pytest.skip("tectonic not installed")

    text = "Teste de diagramação.\n\nLinha 2 com símbolos: % $ _ & #\n\nFim."
    pdf = build_pdf(text, Path("out.pdf"))
    assert pdf.exists()
