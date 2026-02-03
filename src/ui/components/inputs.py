import customtkinter as ctk

from ui.theme import COLORS, RADIUS
from ui import fonts


def entry(parent, placeholder: str = "") -> ctk.CTkEntry:
    return ctk.CTkEntry(
        parent,
        placeholder_text=placeholder,
        fg_color=COLORS["editor"],
        border_color=COLORS["border"],
        corner_radius=RADIUS["input"],
        text_color=COLORS["text_primary"],
        font=fonts.font(11),
    )


def textbox(parent, height: int = 160) -> ctk.CTkTextbox:
    return ctk.CTkTextbox(
        parent,
        height=height,
        fg_color=COLORS["editor"],
        border_color=COLORS["border"],
        corner_radius=RADIUS["input"],
        text_color=COLORS["text_primary"],
        font=fonts.font(11),
    )
