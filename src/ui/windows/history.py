from pathlib import Path
from typing import List, Optional

import customtkinter as ctk

from storage import TaskModel, list_tasks, verify_manifest
from ui.theme import COLORS, SPACING, RADIUS
from ui import fonts
from ui.utils import open_path
from ui.components.list_item import SelectableList


class HistoryWindow(ctk.CTkToplevel):
    def __init__(self, master: ctk.CTk, storage_root: Path, on_load):
        super().__init__(master)
        self.title("Historico")
        self.geometry("960x640")
        self.configure(fg_color=COLORS["bg"])

        self.storage_root = storage_root
        self.on_load = on_load
        self.tasks = list_tasks(root=self.storage_root)
        self.filtered: List[TaskModel] = []

        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=SPACING["pad_x"], pady=SPACING["pad"])

        ctk.CTkLabel(
            header,
            text="Buscar",
            text_color=COLORS["text_primary"],
            font=fonts.font(11, "bold"),
        ).pack(side="left")

        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", self.refresh)

        self.search_entry = ctk.CTkEntry(
            header,
            textvariable=self.search_var,
            placeholder_text="Digite para filtrar",
        )
        self.search_entry.pack(side="left", fill="x", expand=True, padx=SPACING["pad_small"])

        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=SPACING["pad_x"], pady=SPACING["pad"])

        left_card = ctk.CTkFrame(
            body,
            fg_color=COLORS["card"],
            corner_radius=RADIUS["card"],
            border_width=1,
            border_color=COLORS["border"],
        )
        left_card.pack(side="left", fill="both", expand=True)

        self.list = SelectableList(left_card, on_select=self.on_select)
        self.list.pack(fill="both", expand=True, padx=SPACING["pad"], pady=SPACING["pad"])

        right_card = ctk.CTkFrame(
            body,
            fg_color=COLORS["card"],
            corner_radius=RADIUS["card"],
            border_width=1,
            border_color=COLORS["border"],
        )
        right_card.pack(side="right", fill="both", expand=True, padx=(SPACING["pad"], 0))

        ctk.CTkLabel(
            right_card,
            text="Detalhes",
            text_color=COLORS["text_primary"],
            font=fonts.font(11, "bold"),
        ).pack(anchor="w", padx=SPACING["pad"], pady=(SPACING["pad"], 0))

        self.detail = tk.Text(
            right_card,
            bg=COLORS["editor"],
            fg=COLORS["text_primary"],
            relief="flat",
            height=18,
            highlightthickness=1,
            highlightbackground=COLORS["border"],
        )
        self.detail.pack(fill="both", expand=True, padx=SPACING["pad"], pady=SPACING["pad"])
        self.detail.configure(state="disabled")

        actions = ctk.CTkFrame(right_card, fg_color="transparent")
        actions.pack(fill="x", padx=SPACING["pad"], pady=(0, SPACING["pad"]))

        ctk.CTkButton(
            actions,
            text="Abrir PDF",
            command=self.on_open_pdf,
            fg_color=COLORS["gold"],
            hover_color=COLORS["gold_light"],
            text_color=COLORS["bg"],
            corner_radius=RADIUS["button"],
        ).pack(side="left", padx=(0, SPACING["pad_small"]))

        ctk.CTkButton(
            actions,
            text="Carregar",
            command=self.on_load_task,
            fg_color=COLORS["panel_soft"],
            hover_color=COLORS["border"],
            text_color=COLORS["text_primary"],
            corner_radius=RADIUS["button"],
        ).pack(side="left")

        self.refresh()

    def refresh(self, *_args) -> None:
        query = self.search_var.get().strip().lower()
        self.filtered = []
        labels = []
        for task in self.tasks:
            hay = " ".join([task.title] + task.tags + task.categories).lower()
            if query and query not in hay:
                continue
            self.filtered.append(task)
            label = f"{task.year} - {task.title} [{task.task_type}]"
            labels.append(label)
        self.list.set_items(labels)

    def on_select(self, idx: int) -> None:
        if idx is None or idx >= len(self.filtered):
            return
        task = self.filtered[idx]
        task_dir = self.storage_root / "tasks" / str(task.year) / task.id
        ok = verify_manifest(task_dir)
        status = "OK" if ok else "ALTERADO"

        lines = [
            f"Titulo: {task.title}",
            f"Tipo: {task.task_type}",
            f"Ano: {task.year}",
            f"Edicao: {task.edition}",
            f"Tags: {', '.join(task.tags)}",
            f"Categorias: {', '.join(task.categories)}",
            f"Template: {task.template_id} v{task.template_version}",
            f"Integridade: {status}",
            "",
            "Notas (deu certo):",
            task.notes_good,
            "",
            "Notas (deu ruim):",
            task.notes_bad,
        ]

        self.detail.configure(state="normal")
        self.detail.delete("1.0", "end")
        self.detail.insert("1.0", "\n".join(lines))
        self.detail.configure(state="disabled")

    def _get_selected_task(self) -> Optional[TaskModel]:
        idx = self.list.selected_index
        if idx is None or idx >= len(self.filtered):
            return None
        return self.filtered[idx]

    def on_open_pdf(self) -> None:
        task = self._get_selected_task()
        if not task:
            return
        task_dir = self.storage_root / "tasks" / str(task.year) / task.id
        pdf_path = task_dir / "output.pdf"
        if pdf_path.exists():
            open_path(pdf_path)

    def on_load_task(self) -> None:
        task = self._get_selected_task()
        if not task:
            return
        task_dir = self.storage_root / "tasks" / str(task.year) / task.id
        self.on_load(task, task_dir)
        self.destroy()
