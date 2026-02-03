
from pathlib import Path

import pytest

from src.core.build import build_pdf_from_fields, find_tectonic

def test_render() -> None:
    try:
        find_tectonic()
    except FileNotFoundError:
        pytest.skip("tectonic not installed")

    data = {
        "title": "Tarefa 03",
        "series": "Gincana 2025",
        "intro": "Descrição da atividade de doação de carinho...",
        "date_release": "23/03/2020",
        "time_release": "Às 10h05min",
        "location_release": "GEAT",
        "date_compliance": "02/04/2020",
        "time_compliance": "Às 10h30min",
        "location_compliance": "Q.G. da C.O.",
        "evaluation": "Participação integral",
        "score": "100",
    }

    template_path = Path("templates/tarefa_03/template.tex")
    output_pdf = build_pdf_from_fields(
        output_pdf=Path("tarefa_03_test.pdf"),
        template_path=template_path,
        fields={
            "title": data["title"],
            "series": data["series"],
            "intro": data["intro"],
            "date_release": data["date_release"],
            "time_release": data["time_release"],
            "location_release": data["location_release"],
            "date_compliance": data["date_compliance"],
            "time_compliance": data["time_compliance"],
            "location_compliance": data["location_compliance"],
            "evaluation": data["evaluation"],
            "score": data["score"],
        },
    )
    assert output_pdf.exists()
