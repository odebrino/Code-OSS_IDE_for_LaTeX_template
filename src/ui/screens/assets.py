from pathlib import Path
import customtkinter as ctk
from tkinter import filedialog

from ui.components.card import create_card
from ui.components.inputs import entry
from ui.components.list_item import SelectableList
from ui.state import AppState
from ui.theme import SPACING, COLORS
from ui import fonts
from .base import BaseStep


class AssetsStep(BaseStep):
    def __init__(self, parent: ctk.CTkFrame, state: AppState):
        super().__init__(parent, state)
        outer, inner = create_card(self.frame, "Imagens", "Organize anexos e legendas")
        outer.pack(fill="both", expand=True)

        ctk.CTkLabel(
            inner,
            text="Imagens anexadas",
            text_color=COLORS["text_primary"],
            font=fonts.font(11, "bold"),
        ).pack(anchor="w", pady=(0, SPACING["pad_small"]))

        list_frame = ctk.CTkFrame(inner, fg_color="transparent")
        list_frame.pack(fill="both", expand=True)

        self.list = SelectableList(list_frame, on_select=self.on_select)
        self.list.pack(fill="both", expand=True)

        actions = ctk.CTkFrame(inner, fg_color="transparent")
        actions.pack(fill="x", pady=SPACING["pad_small"])

        ctk.CTkButton(
            actions,
            text="Adicionar",
            command=self.on_add,
            fg_color=COLORS["panel_soft"],
            hover_color=COLORS["border"],
            text_color=COLORS["text_primary"],
            corner_radius=12,
        ).pack(side="left", padx=(0, SPACING["pad_small"]))

        ctk.CTkButton(
            actions,
            text="Remover",
            command=self.on_remove,
            fg_color=COLORS["panel_soft"],
            hover_color=COLORS["border"],
            text_color=COLORS["text_primary"],
            corner_radius=12,
        ).pack(side="left")

        ctk.CTkLabel(
            inner,
            text="Legenda",
            text_color=COLORS["text_primary"],
            font=fonts.font(11, "bold"),
        ).pack(anchor="w", pady=(SPACING["pad"], SPACING["pad_small"]))

        self.caption_entry = entry(inner)
        self.caption_entry.pack(fill="x")
        self.caption_entry.bind("<KeyRelease>", self.on_caption_change)

    def load_from_state(self) -> None:
        self._refresh_list()
        self.caption_entry.delete(0, "end")

    def apply_to_state(self) -> None:
        pass

    def _refresh_list(self) -> None:
        labels = []
        for item in self.state.assets:
            name = Path(item.get("path", "")).name
            caption = item.get("caption", "")
            labels.append(name if not caption else f"{name} - {caption}")
        self.list.set_items(labels)

    def on_add(self) -> None:
        paths = filedialog.askopenfilenames(
            title="Selecionar imagens",
            filetypes=[("Imagens", "*.png *.jpg *.jpeg *.webp *.bmp")],
        )
        if not paths:
            return
        for path in paths:
            self.state.assets.append({"path": path, "caption": ""})
        self._refresh_list()

    def on_remove(self) -> None:
        idx = self.list.selected_index
        if idx is None:
            return
        if idx < len(self.state.assets):
            self.state.assets.pop(idx)
        self._refresh_list()
        self.caption_entry.delete(0, "end")

    def on_select(self, idx: int) -> None:
        if idx is None:
            return
        if idx < len(self.state.assets):
            self.caption_entry.delete(0, "end")
            self.caption_entry.insert(0, self.state.assets[idx].get("caption", ""))

    def on_caption_change(self, _event=None) -> None:
        idx = self.list.selected_index
        if idx is None:
            return
        if idx < len(self.state.assets):
            self.state.assets[idx]["caption"] = self.caption_entry.get().strip()
            self._refresh_list()
