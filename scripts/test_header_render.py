
import sys
from pathlib import Path
sys.path.append(".") 

from src.main import compile_pdf, plaintext_to_latex

# Data matching the user's "Cabecario.png" request
data = {
    # Header
    "edition": "40",
    "days_event": "2, 3, 4, 5", # Slightly different to verify dynamic change, or keep match? User said "ex: 40" and "dias".
    "month_event": "ABRIL",
    "year_event": "2025",
    
    
    # Task
    "title": "TAREFA 03", # User wants "copie o resto da tarefa 03" - Title usually CAPS
    "series": "Gincana 2025",
    "intro": "Aqui vai o texto da tarefa...", # Generic, structure is key
    "difficulty": "Médio",
    
    # Cronograma (Placeholders in template now, but vars still needed to avoid error)
    "date_release": "Xx/Xx/Xx",
    "time_release": "Xx:Xx",
    "location_release": "Local...",
    
    "date_compliance": "Xx/Xx/Xx",
    "time_compliance": "Xx:Xx",
    "location_compliance": "Local...",
    
    "evaluation": "Participação...",
    "score": "100",
}

# Read template
template_path = Path("templates/tarefa_03/template.tex")
template = template_path.read_text()

# Replace
replacements = {
    r"\VAR{title}": plaintext_to_latex(data["title"]),
    r"\VAR{series}": plaintext_to_latex(data["series"]),
    r"\VAR{intro}": plaintext_to_latex(data["intro"]),
    r"\VAR{difficulty}": plaintext_to_latex(data["difficulty"]),
    
    # Header
    r"\VAR{edition}": plaintext_to_latex(data["edition"]),
    r"\VAR{days}": plaintext_to_latex(data["days_event"]),
    r"\VAR{month}": plaintext_to_latex(data["month_event"]),
    r"\VAR{year}": plaintext_to_latex(data["year_event"]),

    # Rest
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
print("Compiling Header Test PDF...")
try:
    output_pdf = compile_pdf(final_tex)
    target = Path("teste_header.pdf")
    target.write_bytes(output_pdf.read_bytes())
    print(f"✅ PDF Saved: {target.absolute()}")
except Exception as e:
    print(f"❌ Error: {e}")
