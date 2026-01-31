import os
import sys
import tempfile
import subprocess
import shutil
from pathlib import Path

import tkinter as tk
from tkinter import filedialog, messagebox


# ===== Paths (projeto) =====
PROJECT_ROOT = Path(__file__).resolve().parents[1]  # .../CO
TEMPLATE_PATH = PROJECT_ROOT / "template" / "cabecalho.tex"
PLACEHOLDER = "%%CONTENT%%"


# ===== Tectonic detection (local bin > PATH) =====
def find_tectonic() -> str:
    exe = "tectonic.exe" if sys.platform.startswith("win") else "tectonic"
    local = PROJECT_ROOT / "bin" / exe
    if local.exists():
        return str(local)

    found = shutil.which("tectonic")
    if found:
        return found

    raise FileNotFoundError(
        "tectonic não encontrado. Instale (ex: snap install tectonic) ou coloque em ./bin/tectonic"
    )


# ===== Build dir (robusto com snap) =====
def get_build_root() -> Path:
    """
    Regras:
    - Se o tectonic é do snap: usar ~/snap/tectonic/common/build (snap tem permissão garantida)
    - Senão:
      - Windows/macOS: cache padrão
      - Linux: usar pasta NÃO-oculta no HOME (evita problemas com sandbox do snap)
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


# ===== Text -> LaTeX-safe (texto puro) =====
def escape_latex_text(s: str) -> str:
    repl = {
        "\\": r"\textbackslash{}",
        "{": r"\{",
        "}": r"\}",
        "#": r"\#",
        "$": r"\$",
        "%": r"\%",
        "&": r"\&",
        "_": r"\_",
        "^": r"\^{}",
        "~": r"\~{}",
    }
    return "".join(repl.get(ch, ch) for ch in s)


def plaintext_to_latex(text: str) -> str:
    """
    Regra estável:
    - linha em branco => novo parágrafo
    - quebras de linha dentro do parágrafo viram espaço
    """
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()

    paragraphs = []
    buf = []
    for line in text.split("\n"):
        if line.strip() == "":
            if buf:
                paragraphs.append(" ".join(buf).strip())
                buf = []
        else:
            buf.append(line.strip())
    if buf:
        paragraphs.append(" ".join(buf).strip())

    paragraphs = [escape_latex_text(p) for p in paragraphs]
    return "\n\n\\par\n\n".join(paragraphs)


# ===== Core build =====
def build_pdf(user_text: str, output_pdf: Path) -> Path:
    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Template não encontrado: {TEMPLATE_PATH}")

    template = TEMPLATE_PATH.read_text(encoding="utf-8")

    if PLACEHOLDER not in template:
        raise RuntimeError(f"Seu cabecalho.tex precisa conter o placeholder: {PLACEHOLDER}")

    content = plaintext_to_latex(user_text)
    tex = template.replace(PLACEHOLDER, content)

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
            raise RuntimeError("PDF não foi gerado (doc.pdf não encontrado).")

        output_pdf = Path(output_pdf)
        output_pdf.parent.mkdir(parents=True, exist_ok=True)
        output_pdf.write_bytes(pdf_path.read_bytes())
        return output_pdf


# ===== GUI =====
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Diagramador")
        self.geometry("900x600")

        self.text = tk.Text(self, wrap="word")
        self.text.pack(fill="both", expand=True, padx=10, pady=10)

        bar = tk.Frame(self)
        bar.pack(fill="x", padx=10, pady=(0, 10))

        tk.Button(bar, text="Gerar PDF", command=self.on_build).pack(side="left")

    def on_build(self):
        user_text = self.text.get("1.0", "end").strip()
        if not user_text:
            messagebox.showwarning("Aviso", "Cole algum texto primeiro.")
            return

        out = filedialog.asksaveasfilename(
            defaultextension=".pdf",
            filetypes=[("PDF", "*.pdf")],
            title="Salvar PDF como...",
        )
        if not out:
            return

        try:
            pdf = build_pdf(user_text, Path(out))
            messagebox.showinfo("OK", f"PDF gerado:\n{pdf}")
        except Exception as e:
            messagebox.showerror("Erro", str(e))


if __name__ == "__main__":
    App().mainloop()
