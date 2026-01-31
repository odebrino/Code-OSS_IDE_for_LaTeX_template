
import sys
from pathlib import Path
sys.path.append(".") # Add root to path

from backend.main import compile_pdf, plaintext_to_latex

# Data from Tarefa 03 (extracted from requirements)
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

# Read template
template_path = Path("template/tarefas/cabecalho/cabecalho.tex")
template = template_path.read_text()

# Replace
replacements = {
    r"\VAR{title}": plaintext_to_latex(data["title"]),
    r"\VAR{series}": plaintext_to_latex(data["series"]),
    r"\VAR{intro}": plaintext_to_latex(data["intro"]),
    r"\VAR{date_release}": plaintext_to_latex(data["date_release"]),
    r"\VAR{time_release}": plaintext_to_latex(data["time_release"]),
    r"\VAR{location_release}": plaintext_to_latex(data["location_release"]),
    r"\VAR{date_compliance}": plaintext_to_latex(data["date_compliance"]),
    r"\VAR{time_compliance}": plaintext_to_latex(data["time_compliance"]),
    r"\VAR{location_compliance}": plaintext_to_latex(data["location_compliance"]),
    r"\VAR{evaluation}": plaintext_to_latex(data["evaluation"]),
    r"\VAR{score}": plaintext_to_latex(data["score"]),
}

final_tex = template
for k, v in replacements.items():
    final_tex = final_tex.replace(k, v)

# Compile
print("Compiling PDF...")
try:
    output_pdf = compile_pdf(final_tex)
    print(f"✅ PDF Generated: {output_pdf}")
    
    # Copy to a visible name
    target = Path("tarefa_03_test.pdf")
    target.write_bytes(output_pdf.read_bytes())
    print(f"👉 Saved as: {target.absolute()}")
except Exception as e:
    print(f"❌ Error: {e}")
