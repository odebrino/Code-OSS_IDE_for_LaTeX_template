from typing import Callable, Optional

import customtkinter as ctk

from ui.theme import COLORS, RADIUS, SPACING
from ui import fonts


class SelectableList(ctk.CTkFrame):
    def __init__(self, parent, on_select: Callable[[int], None]):
        super().__init__(parent, fg_color="transparent")
        self.on_select = on_select
        self.items = []
        self.selected_index: Optional[int] = None

        self.scroll = ctk.CTkScrollableFrame(
            self,
            fg_color="transparent",
            corner_radius=0,
        )
        self.scroll.pack(fill="both", expand=True)

    def set_items(self, labels: list[str]) -> None:
        for child in self.scroll.winfo_children():
            child.destroy()
        self.items = []
        self.selected_index = None

        for idx, label in enumerate(labels):
            row = _ListRow(self.scroll, label, lambda i=idx: self.select(i))
            row.pack(fill="x", pady=(0, SPACING["pad_small"]))
            self.items.append(row)

    def select(self, index: int) -> None:
        if index < 0 or index >= len(self.items):
            return
        if self.selected_index is not None and self.selected_index < len(self.items):
            self.items[self.selected_index].set_active(False)
        self.selected_index = index
        self.items[index].set_active(True)
        self.on_select(index)

    def clear(self) -> None:
        self.set_items([])


class _ListRow(ctk.CTkFrame):
    def __init__(self, parent, text: str, on_click: Callable[[], None]):
        super().__init__(
            parent,
            fg_color=COLORS["panel_soft"],
            corner_radius=RADIUS["input"],
            border_width=1,
            border_color=COLORS["border"],
        )
        self.on_click = on_click
        self.label = ctk.CTkLabel(
            self,
            text=text,
            text_color=COLORS["text_primary"],
            font=fonts.font(11),
            anchor="w",
        )
        self.label.pack(fill="x", padx=SPACING["pad"], pady=SPACING["pad_small"])
        self.bind("<Button-1>", self._clicked)
        self.label.bind("<Button-1>", self._clicked)

    def _clicked(self, _event=None):
        self.on_click()

    def set_active(self, active: bool) -> None:
        if active:
            self.configure(fg_color=COLORS["gold"], border_color=COLORS["gold_dark"])
            self.label.configure(text_color=COLORS["bg"])
        else:
            self.configure(fg_color=COLORS["panel_soft"], border_color=COLORS["border"])
            self.label.configure(text_color=COLORS["text_primary"])
