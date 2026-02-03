from pathlib import Path
from typing import Callable, Optional

import customtkinter as ctk
import tkinter as tk

from ui.theme import COLORS, RADIUS, SPACING
from ui import fonts


class LeftNav(ctk.CTkFrame):
    def __init__(
        self,
        parent,
        logo_path: Path,
        on_tasks: Callable[[], None],
        on_new_task: Callable[[], None],
        on_gincanas: Callable[[], None],
    ):
        super().__init__(
            parent,
            fg_color=COLORS["panel"],
            corner_radius=0,
            border_width=1,
            border_color=COLORS["border"],
            width=240,
        )
        self.grid_propagate(False)
        self._active: Optional[str] = None

        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=SPACING["pad"], pady=(SPACING["pad"], SPACING["pad_small"]))

        logo_img = None
        if logo_path.exists():
            try:
                logo_img = tk.PhotoImage(file=str(logo_path))
            except tk.TclError:
                logo_img = None

        if logo_img:
            label = ctk.CTkLabel(header, text="", image=logo_img)
            label.image = logo_img
            label.pack(anchor="w")
        else:
            ctk.CTkLabel(
                header,
                text="CO",
                text_color=COLORS["gold"],
                font=fonts.font(22, "bold"),
            ).pack(anchor="w")

        ctk.CTkLabel(
            header,
            text="Diagramador",
            text_color=COLORS["text_primary"],
            font=fonts.font(13, "bold"),
        ).pack(anchor="w")

        ctk.CTkLabel(
            header,
            text="Interface local",
            text_color=COLORS["text_dim"],
            font=fonts.font(10),
        ).pack(anchor="w")

        nav = ctk.CTkFrame(self, fg_color="transparent")
        nav.pack(fill="x", padx=SPACING["pad"], pady=(SPACING["pad"], 0))

        self.btn_tasks = self._nav_button(nav, "Suas tarefas", on_tasks)
        self.btn_tasks.pack(fill="x", pady=(0, SPACING["pad_small"]))

        self.btn_new = self._nav_button(nav, "Diagramar nova tarefa", on_new_task, primary=True)
        self.btn_new.pack(fill="x", pady=(0, SPACING["pad_small"]))

        self.btn_gincanas = self._nav_button(nav, "Gincanas anteriores", on_gincanas)
        self.btn_gincanas.pack(fill="x")

    def _nav_button(self, parent, text: str, command, primary: bool = False) -> ctk.CTkButton:
        if primary:
            fg = COLORS["gold"]
            text_color = COLORS["bg"]
            hover = COLORS["gold_light"]
            border = COLORS["gold_dark"]
        else:
            fg = COLORS["panel_soft"]
            text_color = COLORS["text_primary"]
            hover = COLORS["border"]
            border = COLORS["border"]

        return ctk.CTkButton(
            parent,
            text=text,
            command=command,
            fg_color=fg,
            hover_color=hover,
            text_color=text_color,
            corner_radius=RADIUS["button"],
            border_width=1,
            border_color=border,
            font=fonts.font(11, "bold" if primary else "normal"),
        )

    def set_active(self, key: Optional[str]) -> None:
        self._active = key
        # Optional future: highlight active item
