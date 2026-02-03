import customtkinter as ctk

from ui.components.card import create_card
from ui.components.inputs import textbox
from ui.state import AppState
from ui.theme import SPACING, COLORS
from ui import fonts
from .base import BaseStep


class NotesStep(BaseStep):
    def __init__(self, parent: ctk.CTkFrame, state: AppState):
        super().__init__(parent, state)
        outer, inner = create_card(self.frame, "Notas", "Registre aprendizados e observacoes")
        outer.pack(fill="both", expand=True)

        ctk.CTkLabel(
            inner,
            text="Deu certo",
            text_color=COLORS["text_primary"],
            font=fonts.font(11, "bold"),
        ).pack(anchor="w", pady=(0, SPACING["pad_small"]))

        self.good_text = textbox(inner, height=140)
        self.good_text.pack(fill="x", pady=(0, SPACING["pad"]))

        ctk.CTkLabel(
            inner,
            text="Deu ruim",
            text_color=COLORS["text_primary"],
            font=fonts.font(11, "bold"),
        ).pack(anchor="w", pady=(0, SPACING["pad_small"]))

        self.bad_text = textbox(inner, height=140)
        self.bad_text.pack(fill="x")

    def load_from_state(self) -> None:
        self.good_text.delete("1.0", "end")
        self.good_text.insert("1.0", self.state.notes.get("good", ""))
        self.bad_text.delete("1.0", "end")
        self.bad_text.insert("1.0", self.state.notes.get("bad", ""))

    def apply_to_state(self) -> None:
        self.state.notes["good"] = self.good_text.get("1.0", "end").strip()
        self.state.notes["bad"] = self.bad_text.get("1.0", "end").strip()
