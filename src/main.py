import os
import sys
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .latex_utils import plaintext_to_latex

app = FastAPI()

# Allow CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servindo arquivos estáticos (CSS, JS)
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Rota para a página principal
@app.get("/")
async def read_index():
    return FileResponse(STATIC_DIR / "index.html")

# ===== Paths =====
PROJECT_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_PATH = PROJECT_ROOT / "templates" / "tarefa_03" / "template.tex"

# ===== Models =====
class TaskData(BaseModel):
    title: str
    difficulty: str
    intro: str
    series: str
    task_type: str
    
    # Header fields
    edition: Optional[str] = "40"
    days_event: Optional[str] = "6, 7, 8, 9"
    month_event: Optional[str] = "ABRIL"
    year_event: Optional[str] = "2025"

    # Cronograma fields
    date_release: Optional[str] = ""
    time_release: Optional[str] = ""
    location_release: Optional[str] = ""
    date_compliance: Optional[str] = ""
    time_compliance: Optional[str] = ""
    location_compliance: Optional[str] = ""
    # Avaliação
    evaluation: Optional[str] = ""
    score: Optional[str] = ""
    num_students: Optional[str] = "" # Keeping for legacy, or mapping Integrantes to this?
    members: Optional[str] = ""      # New field requested: "Integrantes"

# ===== Tectonic & Build Logic =====
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

    raise FileNotFoundError("tectonic executable not found. Please install it.")

def get_build_root() -> Path:
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

def compile_pdf(tex_content: str) -> Path:
    build_root = get_build_root()
    tectonic = find_tectonic()
    
    with tempfile.TemporaryDirectory(dir=str(build_root)) as td:
        td = Path(td)
        tex_path = td / "doc.tex"
        tex_path.write_text(tex_content, encoding="utf-8")
        
        cmd = [tectonic, "doc.tex"]
        
        p = subprocess.run(
            cmd,
            cwd=str(td),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        
        if p.returncode != 0:
            print(p.stdout)
            print(p.stderr)
            raise RuntimeError(f"LaTeX Compilation Failed: {p.stderr}")
            
        pdf_path = td / "doc.pdf"
        if not pdf_path.exists():
            raise RuntimeError("PDF was not generated.")
            
        output_path = build_root / "latest_output.pdf"
        output_path.write_bytes(pdf_path.read_bytes())
        return output_path


@app.post("/generate")
async def generate_pdf(data: TaskData):
    if not TEMPLATE_PATH.exists():
        raise HTTPException(status_code=500, detail="Template file not found.")
        
    template_content = TEMPLATE_PATH.read_text(encoding="utf-8")
    
    replacements = {
        r"\VAR{title}": plaintext_to_latex(data.title),
        r"\VAR{intro}": plaintext_to_latex(data.intro),
        r"\VAR{difficulty}": plaintext_to_latex(data.difficulty),
        r"\VAR{series}": plaintext_to_latex(data.series),
        
        # Header Fields
        r"\VAR{edition}": plaintext_to_latex(data.edition),
        r"\VAR{days}": plaintext_to_latex(data.days_event),
        r"\VAR{month}": plaintext_to_latex(data.month_event),
        r"\VAR{year}": plaintext_to_latex(data.year_event),
        
        # New fields
        r"\VAR{date_release}": plaintext_to_latex(data.date_release),
        r"\VAR{time_release}": plaintext_to_latex(data.time_release),
        r"\VAR{location_release}": plaintext_to_latex(data.location_release),
        
        r"\VAR{date_compliance}": plaintext_to_latex(data.date_compliance),
        r"\VAR{time_compliance}": plaintext_to_latex(data.time_compliance),
        r"\VAR{location_compliance}": plaintext_to_latex(data.location_compliance),
        
        r"\VAR{evaluation}": plaintext_to_latex(data.evaluation),
        r"\VAR{score}": plaintext_to_latex(data.score),
        r"\VAR{members}": plaintext_to_latex(data.members),
    }
    
    final_tex = template_content
    for key, val in replacements.items():
        final_tex = final_tex.replace(key, val)
        
    try:
        pdf_path = compile_pdf(final_tex)
        return FileResponse(
            pdf_path, 
            media_type="application/pdf", 
            filename="tarefa.pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok"}

# ===== Template Storage =====
TEMPLATE_CONFIG_PATH = PROJECT_ROOT / "data" / "template_config.json"

class TemplateConfig(BaseModel):
    name: str = "Modelo Padrão"
    edition: str = "40"
    days: str = "2, 3, 4, 5 DE ABRIL DE 2025"
    sponsors: str = ""

@app.get("/api/template")
async def get_template():
    """Load saved template configuration"""
    if TEMPLATE_CONFIG_PATH.exists():
        import json
        data = json.loads(TEMPLATE_CONFIG_PATH.read_text(encoding="utf-8"))
        return data
    return TemplateConfig().model_dump()

@app.post("/api/template")
async def save_template(config: TemplateConfig):
    """Save template configuration"""
    import json
    TEMPLATE_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    TEMPLATE_CONFIG_PATH.write_text(
        json.dumps(config.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    return {"status": "saved", "data": config.model_dump()}
