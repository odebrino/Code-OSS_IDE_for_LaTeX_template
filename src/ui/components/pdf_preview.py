from __future__ import annotations

from pathlib import Path
from typing import Optional

import customtkinter as ctk
from PIL import Image, ImageOps

from ui import fonts
from ui.theme import COLORS, SPACING


class PdfPreview(ctk.CTkFrame):
    def __init__(self, parent):
        super().__init__(parent, fg_color=COLORS["bg"])
        self._image: Optional[ctk.CTkImage] = None
        self._last_pdf: Optional[Path] = None
        self._resize_job = None

        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=SPACING["pad_x"], pady=(SPACING["pad"], SPACING["pad_small"]))

        ctk.CTkLabel(
            header,
            text="Preview",
            text_color=COLORS["text_primary"],
            font=fonts.font(12, "bold"),
        ).pack(side="left")

        self.status = ctk.CTkLabel(
            header,
            text="Aguardando",
            text_color=COLORS["text_dim"],
            font=fonts.font(10),
        )
        self.status.pack(side="right")

        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=SPACING["pad_x"], pady=(0, SPACING["pad_y"]))

        self.image_label = ctk.CTkLabel(
            body,
            text="Sem preview",
            text_color=COLORS["text_dim"],
            font=fonts.font(12),
        )
        self.image_label.pack(fill="both", expand=True)

        self.bind("<Configure>", self._on_resize)

    def set_status(self, text: str) -> None:
        self.status.configure(text=text)

    def show_message(self, text: str) -> None:
        self.set_status(text)
        self.image_label.configure(text=text, image=None)

    def render_pdf(self, pdf_path: Path) -> None:
        self._last_pdf = pdf_path
        if not pdf_path.exists():
            self.show_message("Preview indisponivel")
            return

        try:
            import fitz  # PyMuPDF
        except Exception:
            self.show_message("Instale PyMuPDF para preview")
            return

        try:
            with fitz.open(str(pdf_path)) as doc:
                if doc.page_count == 0:
                    self.show_message("PDF vazio")
                    return
                page = doc.load_page(0)
                pix = page.get_pixmap(dpi=130)
                mode = "RGBA" if pix.alpha else "RGB"
                image = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
        except Exception as exc:
            self.show_message(f"Erro no preview: {exc}")
            return

        self.update_idletasks()
        max_w = max(1, self.winfo_width() - SPACING["pad_x"] * 2)
        max_h = max(1, self.winfo_height() - SPACING["pad_y"] * 2 - 40)
        image = ImageOps.contain(image, (max_w, max_h), Image.Resampling.LANCZOS)
        self._image = ctk.CTkImage(light_image=image, dark_image=image, size=image.size)
        self.image_label.configure(image=self._image, text="")
        self.set_status("Atualizado")

    def _on_resize(self, _event=None) -> None:
        if not self._last_pdf:
            return
        if self._resize_job:
            self.after_cancel(self._resize_job)
        self._resize_job = self.after(160, self._refresh_after_resize)

    def _refresh_after_resize(self) -> None:
        self._resize_job = None
        if self._last_pdf:
            self.render_pdf(self._last_pdf)
