import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from core.build import build_pdf_from_fields
from storage import TaskModel, save_task
from ui.state import AppState


def _slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-")
    return value.lower()


def _split_list(value: str) -> List[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


def validate_required(state: AppState) -> Tuple[bool, str]:
    title = state.basic.get("title", "").strip()
    if not title:
        return False, "Titulo e obrigatorio."

    if state.template_model:
        for field in state.template_model.fields:
            if not field.get("required"):
                continue
            field_id = field.get("id")
            if field_id and not state.fields.get(field_id, "").strip():
                return False, f"Preencha: {field.get('label', field_id)}"

    return True, ""


def build_task_model(state: AppState) -> TaskModel:
    title = state.basic.get("title", "").strip()
    task_type = state.basic.get("task_type", "").strip() or "pratica"
    year_raw = state.basic.get("year", "").strip() or str(datetime.now().year)
    edition = state.basic.get("edition", "").strip()

    try:
        year = int(year_raw)
    except ValueError:
        year = datetime.now().year

    authors = _split_list(state.basic.get("authors", ""))
    participants = _split_list(state.basic.get("participants", ""))
    tags = _split_list(state.basic.get("tags", ""))
    categories = _split_list(state.basic.get("categories", ""))

    notes_good = state.notes.get("good", "")
    notes_bad = state.notes.get("bad", "")

    template_id = state.template_model.id if state.template_model else "plain"
    template_version = state.template_model.version if state.template_model else "1"

    base = _slugify(title) or "tarefa"
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    task_id = f"{year}-{base}-{ts}"

    task = TaskModel(
        id=task_id,
        title=title,
        year=year,
        edition=edition,
        task_type=task_type,
        intro=state.fields.get("intro", ""),
        objective=state.fields.get("objective", ""),
        instructions=state.fields.get("instructions", ""),
        authors=authors,
        participants=participants,
        tags=tags,
        categories=categories,
        notes_good=notes_good,
        notes_bad=notes_bad,
        template_id=template_id,
        template_version=template_version,
        fields=state.fields,
    )
    return task


def generate_pdf(state: AppState, output_path: Path) -> Path:
    template_path = state.template_tex_path
    if not template_path:
        raise FileNotFoundError("Template nao encontrado.")

    fields = dict(state.fields)
    fields.setdefault("title", state.basic.get("title", ""))
    fields.setdefault("task_type", state.basic.get("task_type", ""))
    fields.setdefault("year", state.basic.get("year", ""))
    fields.setdefault("edition", state.basic.get("edition", ""))

    attachments = [(Path(a["path"]), a.get("caption", "")) for a in state.assets]

    pdf = build_pdf_from_fields(
        output_pdf=output_path,
        template_path=template_path,
        fields=fields,
        attachments=attachments,
        globals_map=state.globals_map,
    )
    return pdf


def save_task_from_state(state: AppState) -> Path:
    if not state.last_pdf_path or not state.last_pdf_path.exists():
        raise RuntimeError("PDF nao encontrado. Gere o PDF antes de salvar.")

    task = build_task_model(state)
    assets_payload = [
        {"path": a["path"], "caption": a.get("caption", "")}
        for a in state.assets
    ]

    task_dir = save_task(task, pdf_path=state.last_pdf_path, assets=assets_payload, root=state.storage_root)
    return task_dir
