from pathlib import Path

import customtkinter as ctk

from ui.components.mural import MuralView


class HomeView(ctk.CTkFrame):
    def __init__(self, parent, logo_path: Path, storage_root: Path):
        super().__init__(parent, fg_color="transparent")
        mural = MuralView(self, logo_path=logo_path, storage_root=storage_root)
        mural.pack(fill="both", expand=True)
