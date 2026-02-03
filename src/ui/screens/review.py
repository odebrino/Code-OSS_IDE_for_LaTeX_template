import customtkinter as ctk

from ui.components.card import create_card
from ui.components.inputs import textbox
from ui.state import AppState
from ui.theme import COLORS, SPACING
from ui import fonts
from .base import BaseStep


class ReviewStep(BaseStep):
    def __init__(self, parent: ctk.CTkFrame, state: AppState):
        super().__init__(parent, state)
        outer, inner = create_card(self.frame, "Revisao", "Confira o resumo antes de salvar")
        outer.pack(fill="both", expand=True)

        self.summary = textbox(inner, height=260)
        self.summary.pack(fill="both", expand=True)
        self.summary.configure(state="disabled")

    def load_from_state(self) -> None:
        self.summary.configure(state="normal")
        self.summary.delete("1.0", "end")
        self.summary.insert("1.0", self._build_summary())
        self.summary.configure(state="disabled")

    def apply_to_state(self) -> None:
        pass

    def _build_summary(self) -> str:
        lines = []
        lines.append(f"Titulo: {self.state.basic.get('title', '').strip()}")
        lines.append(f"Tipo: {self.state.basic.get('task_type', '').strip()}")
        lines.append(f"Ano: {self.state.basic.get('year', '').strip()}")
        lines.append(f"Edicao: {self.state.basic.get('edition', '').strip()}")
        lines.append(f"Autores: {self.state.basic.get('authors', '').strip()}")
        lines.append(f"Participantes: {self.state.basic.get('participants', '').strip()}")
        lines.append(f"Tags: {self.state.basic.get('tags', '').strip()}")
        lines.append(f"Categorias: {self.state.basic.get('categories', '').strip()}")
        lines.append("")
        lines.append("Campos do template:")
        for key, val in self.state.fields.items():
            preview = (val[:140] + "...") if len(val) > 140 else val
            lines.append(f"- {key}: {preview}")
        lines.append("")
        lines.append(f"Imagens: {len(self.state.assets)}")
        lines.append("")
        lines.append("Notas (deu certo):")
        lines.append(self.state.notes.get("good", ""))
        lines.append("")
        lines.append("Notas (deu ruim):")
        lines.append(self.state.notes.get("bad", ""))
        return "\n".join(lines)
