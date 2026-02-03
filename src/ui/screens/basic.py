from datetime import datetime
from typing import Callable, Dict, List

import customtkinter as ctk

from ui.components.card import create_card
from ui.components.inputs import entry
from ui.state import AppState
from ui.theme import SPACING, COLORS
from ui import fonts
from .base import BaseStep


class BasicStep(BaseStep):
    def __init__(
        self,
        parent: ctk.CTkFrame,
        state: AppState,
        template_ids: List[str],
        on_template_change: Callable[[str], None],
    ):
        super().__init__(parent, state)
        self.on_template_change = on_template_change
        self.entries: Dict[str, ctk.CTkEntry] = {}

        outer, inner = create_card(
            self.frame, "Dados basicos", "Defina as informacoes principais da tarefa"
        )
        outer.pack(fill="both", expand=True)

        grid = ctk.CTkFrame(inner, fg_color="transparent")
        grid.pack(fill="x")
        grid.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(
            grid,
            text="Template",
            text_color=COLORS["text_primary"],
            font=fonts.font(11, "bold"),
        ).grid(row=0, column=0, sticky="w", pady=SPACING["pad_small"])

        self.template_combo = ctk.CTkComboBox(
            grid,
            values=template_ids,
            command=self._on_template_select,
        )
        self.template_combo.grid(
            row=0,
            column=1,
            sticky="ew",
            padx=(SPACING["pad"], 0),
            pady=SPACING["pad_small"],
        )

        self._add_entry(grid, "Titulo", "title", 1)
        self._add_entry(grid, "Tipo", "task_type", 2, default="pratica")
        self._add_entry(grid, "Ano", "year", 3, default=str(datetime.now().year))
        self._add_entry(grid, "Edicao", "edition", 4)
        self._add_entry(grid, "Autores (separar por virgula)", "authors", 5)
        self._add_entry(grid, "Participantes", "participants", 6)
        self._add_entry(grid, "Tags", "tags", 7)
        self._add_entry(grid, "Categorias", "categories", 8)

    def _add_entry(self, parent, label: str, key: str, row: int, default: str = "") -> None:
        ctk.CTkLabel(
            parent,
            text=label,
            text_color=COLORS["text_primary"],
            font=fonts.font(11, "bold"),
        ).grid(row=row, column=0, sticky="w", pady=SPACING["pad_small"])
        ent = entry(parent)
        ent.grid(
            row=row,
            column=1,
            sticky="ew",
            padx=(SPACING["pad"], 0),
            pady=SPACING["pad_small"],
        )
        if default:
            ent.insert(0, default)
        self.entries[key] = ent

    def _on_template_select(self, value: str) -> None:
        if value:
            self.on_template_change(value)

    def load_from_state(self) -> None:
        for key, ent in self.entries.items():
            ent.delete(0, "end")
            ent.insert(0, self.state.basic.get(key, ""))

        current_template = self.state.template_model.id if self.state.template_model else ""
        if current_template:
            self.template_combo.set(current_template)

    def apply_to_state(self) -> None:
        for key, ent in self.entries.items():
            self.state.basic[key] = ent.get().strip()

    def set_templates(self, template_ids: List[str]) -> None:
        self.template_combo.configure(values=template_ids)

    def set_template(self, template_id: str) -> None:
        self.template_combo.set(template_id)
