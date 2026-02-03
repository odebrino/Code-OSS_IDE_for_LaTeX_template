from pathlib import Path
from typing import Optional

import tkinter.font as tkfont
import customtkinter as ctk

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FONTS_DIR = PROJECT_ROOT / "assets" / "fonts"

MANROPE_FILES = [
    FONTS_DIR / "Manrope-Regular.ttf",
    FONTS_DIR / "Manrope-SemiBold.ttf",
    FONTS_DIR / "Manrope-Bold.ttf",
]

_FONT_FAMILY: Optional[str] = None


def load_fonts(root) -> str:
    global _FONT_FAMILY
    for font_path in MANROPE_FILES:
        if font_path.exists():
            try:
                ctk.FontManager.load_font(str(font_path))
            except Exception:
                pass

    families = set(tkfont.families(root))
    if "Manrope" in families:
        _FONT_FAMILY = "Manrope"
    elif "Segoe UI" in families:
        _FONT_FAMILY = "Segoe UI"
    else:
        _FONT_FAMILY = "Helvetica"
    return _FONT_FAMILY


def font(size: int, weight: str = "normal") -> ctk.CTkFont:
    family = _FONT_FAMILY or "Segoe UI"
    return ctk.CTkFont(family=family, size=size, weight=weight)
