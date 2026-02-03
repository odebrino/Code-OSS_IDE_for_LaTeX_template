from typing import Optional, Tuple

import customtkinter as ctk

from ui.theme import COLORS, RADIUS, SPACING
from ui import fonts


def create_card(
    parent: ctk.CTkBaseClass,
    title: str,
    subtitle: Optional[str] = None,
) -> Tuple[ctk.CTkFrame, ctk.CTkFrame]:
    outer = ctk.CTkFrame(parent, fg_color="transparent")
    card = ctk.CTkFrame(
        outer,
        fg_color=COLORS["card"],
        corner_radius=RADIUS["card"],
        border_width=1,
        border_color=COLORS["border"],
    )
    card.pack(fill="both", expand=True)

    header = ctk.CTkFrame(card, fg_color="transparent")
    header.pack(fill="x", padx=SPACING["pad"], pady=(SPACING["pad"], 0))

    ctk.CTkLabel(
        header,
        text=title,
        text_color=COLORS["text_primary"],
        font=fonts.font(13, "bold"),
    ).pack(anchor="w")

    if subtitle:
        ctk.CTkLabel(
            header,
            text=subtitle,
            text_color=COLORS["text_dim"],
            font=fonts.font(11),
        ).pack(anchor="w")

    inner = ctk.CTkFrame(card, fg_color="transparent")
    inner.pack(fill="both", expand=True, padx=SPACING["pad"], pady=SPACING["pad"])

    return outer, inner
