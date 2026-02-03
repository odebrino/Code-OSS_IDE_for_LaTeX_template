from __future__ import annotations

import threading
from pathlib import Path
import tkinter as tk

import customtkinter as ctk

from core.build import build_pdf_from_fields, get_build_root
from ui import fonts
from ui.components.card import create_card
from ui.components.inputs import entry, textbox
from ui.components.pdf_preview import PdfPreview
from ui.components.split_pane import SplitPane
from ui.theme import COLORS, SPACING


PROJECT_ROOT = Path(__file__).resolve().parents[3]
TEMPLATE_PATH = PROJECT_ROOT / "templates" / "editor" / "template.tex"


class EditorView(ctk.CTkFrame):
    def __init__(self, parent, on_status=None):
        super().__init__(parent, fg_color=COLORS["bg"])
        self._on_status = on_status
        self._preview_job = None
        self._preview_token = 0
        self._preview_pdf = get_build_root() / "preview.pdf"

        self._build_layout()
        self.preview.show_message("Preencha os campos para gerar o PDF")

    def _build_layout(self) -> None:
        split = SplitPane(self, bg_color=COLORS["bg"], divider_color=COLORS["border"])
        split.pack(fill="both", expand=True)

        left = split.left
        right = split.right

        form = ctk.CTkScrollableFrame(left, fg_color="transparent")
        form.pack(fill="both", expand=True, padx=SPACING["pad_x"], pady=SPACING["pad_y"])

        ctk.CTkLabel(
            form,
            text="Nova tarefa",
            text_color=COLORS["text_primary"],
            font=fonts.font(14, "bold"),
        ).pack(anchor="w", pady=(0, SPACING["pad"]))

        self.title_var = tk.StringVar()
        outer, inner = create_card(form, "Titulo", "Defina o titulo da tarefa")
        outer.pack(fill="x", pady=(0, SPACING["pad"]))
        self.title_entry = entry(inner, placeholder="Ex: Feira de Ciencias")
        self.title_entry.configure(textvariable=self.title_var)
        self.title_entry.pack(fill="x")
        self.title_var.trace_add("write", self._on_field_change)

        self.class_var = tk.StringVar()
        outer, inner = create_card(form, "Classificacao", "Informe a classificacao")
        outer.pack(fill="x", pady=(0, SPACING["pad"]))
        self.class_entry = entry(inner, placeholder="Ex: pratica")
        self.class_entry.configure(textvariable=self.class_var)
        self.class_entry.pack(fill="x")
        self.class_var.trace_add("write", self._on_field_change)

        outer, inner = create_card(form, "Texto", "Conteudo principal")
        outer.pack(fill="x", pady=(0, SPACING["pad"]))
        self.text_box = textbox(inner, height=260)
        self.text_box.pack(fill="both", expand=True)
        self.text_box.bind("<<Modified>>", self._on_text_modified)

        outer, inner = create_card(form, "Integrantes", "Lista de integrantes")
        outer.pack(fill="x")
        self.members_box = textbox(inner, height=120)
        self.members_box.pack(fill="both", expand=True)
        self.members_box.bind("<<Modified>>", self._on_text_modified)

        self.preview = PdfPreview(right)
        self.preview.pack(fill="both", expand=True)

    def reset(self) -> None:
        self.title_var.set("")
        self.class_var.set("")
        self.text_box.delete("1.0", "end")
        self.members_box.delete("1.0", "end")
        self.text_box.edit_modified(False)
        self.members_box.edit_modified(False)
        self.preview.show_message("Preencha os campos para gerar o PDF")
        self._notify_status("Nova tarefa")

    def _notify_status(self, text: str) -> None:
        if self._on_status:
            self._on_status(text)

    def _on_field_change(self, *_args) -> None:
        self._schedule_preview()

    def _on_text_modified(self, event) -> None:
        widget = event.widget
        if widget.edit_modified():
            widget.edit_modified(False)
            self._schedule_preview()

    def _schedule_preview(self) -> None:
        if self._preview_job:
            self.after_cancel(self._preview_job)
        self._preview_job = self.after(500, self._trigger_preview)
        self.preview.set_status("Aguardando...")

    def _trigger_preview(self) -> None:
        self._preview_job = None
        fields = self._collect_fields()
        if not any(fields.values()):
            self.preview.show_message("Preencha os campos para gerar o PDF")
            return
        self._preview_token += 1
        token = self._preview_token
        self.preview.set_status("Gerando...")
        self._notify_status("Gerando preview...")

        def worker():
            error = None
            try:
                build_pdf_from_fields(
                    output_pdf=self._preview_pdf,
                    template_path=TEMPLATE_PATH,
                    fields=fields,
                )
            except Exception as exc:
                error = exc
            self.after(0, lambda: self._finish_preview(token, error))

        threading.Thread(target=worker, daemon=True).start()

    def _finish_preview(self, token: int, error: Exception | None) -> None:
        if token != self._preview_token:
            return
        if error:
            self.preview.show_message(str(error))
            self._notify_status("Erro ao gerar preview")
            return
        self.preview.render_pdf(self._preview_pdf)
        self._notify_status("Preview atualizado")

    def _collect_fields(self) -> dict[str, str]:
        return {
            "titulo": self.title_var.get().strip(),
            "classificacao": self.class_var.get().strip(),
            "texto": self.text_box.get("1.0", "end").strip(),
            "integrantes": self.members_box.get("1.0", "end").strip(),
        }
