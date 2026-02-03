from pathlib import Path
from typing import List, Optional

from storage import TemplateModel, list_templates, load_template


def load_templates(storage_root: Path) -> List[TemplateModel]:
    return list_templates(root=storage_root)


def set_template(storage_root: Path, template_id: str) -> Optional[tuple[TemplateModel, Path]]:
    model = load_template(template_id, root=storage_root)
    if not model:
        return None
    tex_path = storage_root / "templates" / template_id / "template.tex"
    return model, tex_path
