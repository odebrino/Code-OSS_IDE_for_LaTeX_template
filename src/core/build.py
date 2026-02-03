import os
import sys
import tempfile
import subprocess
import shutil
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from .latex_utils import plaintext_to_latex

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TEMPLATE = PROJECT_ROOT / "templates" / "plain" / "template.tex"
PLACEHOLDER = "%%CONTENT%%"
ATTACHMENTS_PLACEHOLDER = "%%ATTACHMENTS%%"


def find_tectonic() -> str:
    exe = "tectonic.exe" if sys.platform.startswith("win") else "tectonic"
    local = PROJECT_ROOT / "bin" / exe
    if local.exists():
        return str(local)

    found = shutil.which("tectonic")
    if found:
        return found

    snap_bin = Path("/snap/bin/tectonic")
    if snap_bin.exists():
        return str(snap_bin)

    raise FileNotFoundError(
        "tectonic nao encontrado. Instale (ex: snap install tectonic) ou coloque em ./bin/tectonic"
    )


def get_build_root() -> Path:
    """
    Regras:
    - Se o tectonic e do snap: usar ~/snap/tectonic/common/build
    - Senao:
      - Windows/macOS: cache padrao
      - Linux: usar pasta nao-oculta no HOME
    """
    tect = find_tectonic()

    if sys.platform.startswith("linux"):
        snap_common = Path.home() / "snap" / "tectonic" / "common"
        if "snap" in tect or snap_common.exists():
            root = snap_common / "build"
        else:
            root = Path.home() / "co-diagramador-build"
    elif sys.platform == "darwin":
        root = Path.home() / "Library" / "Caches" / "co-diagramador" / "build"
    else:  # Windows
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        root = base / "co-diagramador" / "build"

    root.mkdir(parents=True, exist_ok=True)
    return root


def render_template(user_text: str, template_path: Optional[Path] = None) -> str:
    template_path = template_path or DEFAULT_TEMPLATE

    if not template_path.exists():
        raise FileNotFoundError(f"Template nao encontrado: {template_path}")

    template = template_path.read_text(encoding="utf-8")
    if PLACEHOLDER not in template:
        raise RuntimeError(f"Template precisa conter o placeholder: {PLACEHOLDER}")

    content = plaintext_to_latex(user_text)
    return template.replace(PLACEHOLDER, content)


def _render_attachments_block(attachments: List[Tuple[str, str]]) -> str:
    if not attachments:
        return ""
    parts = ["\\par\\vspace{0.3cm}"]
    for filename, caption in attachments:
        cap = plaintext_to_latex(caption or "")
        parts.append("\\begin{center}")
        parts.append(f"\\includegraphics[width=0.9\\linewidth]{{{filename}}}")
        parts.append("\\end{center}")
        if cap:
            parts.append(f"\\textit{{{cap}}}\\\\")
        parts.append("\\vspace{0.3cm}")
    return "\n".join(parts)


def render_template_fields(
    template_path: Path,
    fields: Dict[str, str],
    attachments: Optional[List[Tuple[str, str]]] = None,
    globals_map: Optional[Dict[str, str]] = None,
) -> str:
    if not template_path.exists():
        raise FileNotFoundError(f"Template nao encontrado: {template_path}")

    template = template_path.read_text(encoding="utf-8")

    mapping = {}
    for key, val in (fields or {}).items():
        mapping[key] = plaintext_to_latex(val or "")
    for key, val in (globals_map or {}).items():
        if key not in mapping:
            mapping[key] = plaintext_to_latex(val or "")

    for key, val in mapping.items():
        template = template.replace(f"\\VAR{{{key}}}", val)

    if PLACEHOLDER in template:
        template = template.replace(PLACEHOLDER, mapping.get("content", ""))

    attachments_block = _render_attachments_block(attachments or [])
    if ATTACHMENTS_PLACEHOLDER in template:
        template = template.replace(ATTACHMENTS_PLACEHOLDER, attachments_block)
    elif attachments_block:
        template = template + "\n" + attachments_block

    return template


def build_pdf(user_text: str, output_pdf: Path, template_path: Optional[Path] = None) -> Path:
    tex = render_template(user_text, template_path=template_path)

    build_root = get_build_root()

    with tempfile.TemporaryDirectory(dir=str(build_root)) as td:
        td = Path(td)

        tex_path = td / "doc.tex"
        tex_path.write_text(tex, encoding="utf-8")

        tectonic = find_tectonic()

        p = subprocess.run(
            [tectonic, "doc.tex"],
            cwd=str(td),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        if p.returncode != 0:
            log = (p.stderr or p.stdout or "").strip()
            tail = log[-5000:] if log else "Erro desconhecido ao compilar com tectonic."
            raise RuntimeError(tail)

        pdf_path = td / "doc.pdf"
        if not pdf_path.exists():
            raise RuntimeError("PDF nao foi gerado (doc.pdf nao encontrado).")

        output_pdf = Path(output_pdf)
        output_pdf.parent.mkdir(parents=True, exist_ok=True)
        output_pdf.write_bytes(pdf_path.read_bytes())
        return output_pdf


def build_pdf_from_fields(
    output_pdf: Path,
    template_path: Path,
    fields: Dict[str, str],
    attachments: Optional[Iterable[Tuple[Path, str]]] = None,
    globals_map: Optional[Dict[str, str]] = None,
) -> Path:
    build_root = get_build_root()

    with tempfile.TemporaryDirectory(dir=str(build_root)) as td:
        td = Path(td)

        copied: List[Tuple[str, str]] = []
        for idx, item in enumerate(attachments or []):
            src, caption = item
            src = Path(src)
            if not src.exists():
                continue
            name = f"asset_{idx}{src.suffix}"
            shutil.copy2(src, td / name)
            copied.append((name, caption))

        tex = render_template_fields(
            template_path=template_path,
            fields=fields,
            attachments=copied,
            globals_map=globals_map,
        )

        tex_path = td / "doc.tex"
        tex_path.write_text(tex, encoding="utf-8")

        tectonic = find_tectonic()
        p = subprocess.run(
            [tectonic, "doc.tex"],
            cwd=str(td),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        if p.returncode != 0:
            log = (p.stderr or p.stdout or "").strip()
            tail = log[-5000:] if log else "Erro desconhecido ao compilar com tectonic."
            raise RuntimeError(tail)

        pdf_path = td / "doc.pdf"
        if not pdf_path.exists():
            raise RuntimeError("PDF nao foi gerado (doc.pdf nao encontrado).")

        output_pdf = Path(output_pdf)
        output_pdf.parent.mkdir(parents=True, exist_ok=True)
        output_pdf.write_bytes(pdf_path.read_bytes())
        return output_pdf
