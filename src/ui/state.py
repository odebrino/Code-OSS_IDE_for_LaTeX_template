from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from storage import TemplateModel


@dataclass
class AppState:
    storage_root: Path
    globals_map: Dict[str, str] = field(default_factory=dict)

    templates: List[TemplateModel] = field(default_factory=list)
    template_model: Optional[TemplateModel] = None
    template_tex_path: Optional[Path] = None

    basic: Dict[str, str] = field(default_factory=lambda: {
        "title": "",
        "task_type": "pratica",
        "year": "",
        "edition": "",
        "authors": "",
        "participants": "",
        "tags": "",
        "categories": "",
    })

    fields: Dict[str, str] = field(default_factory=dict)
    assets: List[Dict[str, str]] = field(default_factory=list)
    notes: Dict[str, str] = field(default_factory=lambda: {"good": "", "bad": ""})

    last_pdf_path: Optional[Path] = None
