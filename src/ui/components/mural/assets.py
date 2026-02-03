from pathlib import Path
from typing import List

from PIL import Image, ImageOps
import customtkinter as ctk

PROJECT_ROOT = Path(__file__).resolve().parents[4]
PLANEJAMENTO_DIR = PROJECT_ROOT / "planejamento"
FRAME_PATH = PLANEJAMENTO_DIR / "pngwing.com.png"


def list_cat_photos() -> List[Path]:
    if not PLANEJAMENTO_DIR.exists():
        return []
    allowed = {".jpg", ".jpeg", ".png"}
    cats = [p for p in PLANEJAMENTO_DIR.glob("CAT*") if p.suffix.lower() in allowed]
    return sorted(cats, key=lambda p: p.name)


def load_frame_icon(size=(26, 32)) -> ctk.CTkImage | None:
    if not FRAME_PATH.exists():
        return None
    frame = Image.open(FRAME_PATH).convert("RGBA")
    frame = ImageOps.contain(frame, size, Image.Resampling.LANCZOS)
    return ctk.CTkImage(light_image=frame, dark_image=frame, size=frame.size)
