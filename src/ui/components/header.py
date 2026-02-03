from pathlib import Path

import customtkinter as ctk
import tkinter as tk

from ui.theme import COLORS, SPACING
from ui import fonts


def create_header(parent: ctk.CTk, logo_path: Path) -> ctk.CTkFrame:
    header = ctk.CTkFrame(parent, fg_color=COLORS["panel"], corner_radius=0)
    header.pack(fill="x")

    inner = ctk.CTkFrame(header, fg_color="transparent")
    inner.pack(fill="x", padx=SPACING["pad_x"], pady=SPACING["pad_y"])

    logo_img = None
    if logo_path.exists():
        try:
            logo_img = tk.PhotoImage(file=str(logo_path))
        except tk.TclError:
            logo_img = None

    if logo_img:
        label = ctk.CTkLabel(inner, text="", image=logo_img)
        label.image = logo_img
        label.pack(side="left", padx=(0, SPACING["pad"]))
    else:
        ctk.CTkLabel(
            inner,
            text="CO",
            text_color=COLORS["gold"],
            font=fonts.font(22, "bold"),
        ).pack(side="left", padx=(0, SPACING["pad"]))

    title_block = ctk.CTkFrame(inner, fg_color="transparent")
    title_block.pack(side="left")

    ctk.CTkLabel(
        title_block,
        text="CO Diagramador",
        text_color=COLORS["text_primary"],
        font=fonts.font(22, "bold"),
    ).pack(anchor="w")

    ctk.CTkLabel(
        title_block,
        text="Geracao de PDF local com padrao oficial",
        text_color=COLORS["text_dim"],
        font=fonts.font(11),
    ).pack(anchor="w")

    accent = ctk.CTkFrame(parent, fg_color=COLORS["gold"], height=2, corner_radius=0)
    accent.pack(fill="x")

    return header
