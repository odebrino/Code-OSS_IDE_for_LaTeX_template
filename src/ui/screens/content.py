from typing import Dict

import customtkinter as ctk

from ui.components.card import create_card
from ui.components.inputs import entry, textbox
from ui.state import AppState
from ui.theme import SPACING, COLORS
from ui import fonts
from .base import BaseStep


class ContentStep(BaseStep):
    def __init__(self, parent: ctk.CTkFrame, state: AppState):
        super().__init__(parent, state)
        outer, inner = create_card(
            self.frame,
            "Conteudo",
            "Preencha os campos especificos do template selecionado",
        )
        outer.pack(fill="both", expand=True)

        self.container = ctk.CTkFrame(inner, fg_color="transparent")
        self.container.pack(fill="both", expand=True)
        self.widgets: Dict[str, Dict] = {}

    def rebuild_fields(self) -> None:
        for child in self.container.winfo_children():
            child.destroy()
        self.widgets = {}

        if not self.state.template_model:
            return

        for idx, field in enumerate(self.state.template_model.fields):
            field_id = field.get("id", f"field_{idx}")
            label = field.get("label", field_id)
            ftype = field.get("type", "text")
            required = field.get("required", False)

            label_text = f"{label} *" if required else label
            ctk.CTkLabel(
                self.container,
                text=label_text,
                text_color=COLORS["text_primary"],
                font=fonts.font(11, "bold"),
            ).pack(anchor="w", pady=(0, SPACING["pad_small"]))

            if ftype == "multiline":
                widget = textbox(self.container, height=180)
                widget.pack(fill="both", expand=True, pady=(0, SPACING["pad"]))
                self.widgets[field_id] = {"type": "multiline", "widget": widget}
            elif ftype == "select":
                options = field.get("options", []) or []
                combo = ctk.CTkComboBox(self.container, values=options)
                combo.pack(fill="x", pady=(0, SPACING["pad"]))
                self.widgets[field_id] = {"type": "select", "widget": combo}
            else:
                widget = entry(self.container)
                widget.pack(fill="x", pady=(0, SPACING["pad"]))
                self.widgets[field_id] = {"type": "text", "widget": widget}

    def load_from_state(self) -> None:
        for field_id, info in self.widgets.items():
            value = self.state.fields.get(field_id, "")
            if info["type"] == "multiline":
                info["widget"].delete("1.0", "end")
                info["widget"].insert("1.0", value)
            elif info["type"] == "select":
                info["widget"].set(value)
            else:
                info["widget"].delete(0, "end")
                info["widget"].insert(0, value)

    def apply_to_state(self) -> None:
        for field_id, info in self.widgets.items():
            if info["type"] == "multiline":
                self.state.fields[field_id] = info["widget"].get("1.0", "end").strip()
            elif info["type"] == "select":
                self.state.fields[field_id] = info["widget"].get().strip()
            else:
                self.state.fields[field_id] = info["widget"].get().strip()
