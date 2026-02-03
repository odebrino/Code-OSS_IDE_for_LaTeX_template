
from pathlib import Path

import pytest

from src.core.build import build_pdf_from_fields, find_tectonic

def test_header_render() -> None:
    try:
        find_tectonic()
    except FileNotFoundError:
        pytest.skip("tectonic not installed")

    data = {
        "edition": "40",
        "days_event": "2, 3, 4, 5",
        "month_event": "ABRIL",
        "year_event": "2025",
        "title": "TAREFA 03",
        "series": "Gincana 2025",
        "intro": "Aqui vai o texto da tarefa...",
        "difficulty": "Médio",
        "date_release": "Xx/Xx/Xx",
        "time_release": "Xx:Xx",
        "location_release": "Local...",
        "date_compliance": "Xx/Xx/Xx",
        "time_compliance": "Xx:Xx",
        "location_compliance": "Local...",
        "evaluation": "Participação...",
        "score": "100",
    }

    template_path = Path("templates/tarefa_03/template.tex")
    output_pdf = build_pdf_from_fields(
        output_pdf=Path("teste_header.pdf"),
        template_path=template_path,
        fields={
            "title": data["title"],
            "series": data["series"],
            "intro": data["intro"],
            "difficulty": data["difficulty"],
            "edition": data["edition"],
            "days": data["days_event"],
            "month": data["month_event"],
            "year": data["year_event"],
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
