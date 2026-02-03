from pathlib import Path
from typing import Dict

import customtkinter as ctk


PROJECT_ROOT = Path(__file__).resolve().parents[2]
THEME_PATH = PROJECT_ROOT / "assets" / "theme" / "ctk_gold.json"

COLORS: Dict[str, str] = {
    "bg": "#0B0D12",
    "logo_bg": "#0A0D16",
    "panel": "#111621",
    "panel_soft": "#161D2A",
    "card": "#0F141D",
    "editor": "#0E1320",
    "border": "#1E2A3A",
    "gold": "#B98A2D",
    "gold_dark": "#8C6420",
    "gold_light": "#D5B05A",
    "text_primary": "#F4F6FA",
    "text_muted": "#B9C1D0",
    "text_dim": "#8B95A7",
    "polaroid": "#F5F4F1",
    "polaroid_border": "#E6E2D9",
    "shadow": "#07090E",
    "polaroid_lift": "#FFFFFF",
    "danger": "#8E1B1B",
    "danger_hover": "#B3261E",
}

RADIUS = {
    "card": 14,
    "button": 14,
    "input": 12,
    "pill": 18,
}

MOTION = {
    "duration_fast": 120,
    "duration_normal": 180,
    "steps": 12,
}

SPACING = {
    "pad": 16,
    "pad_small": 10,
    "pad_large": 24,
    "pad_x": 28,
    "pad_y": 22,
}


def apply_theme() -> None:
    ctk.set_appearance_mode("dark")
    if THEME_PATH.exists():
        try:
            ctk.set_default_color_theme(str(THEME_PATH))
            return
        except Exception:
            pass
    ctk.set_default_color_theme("dark-blue")
