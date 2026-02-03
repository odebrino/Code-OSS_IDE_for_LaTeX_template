from datetime import datetime
from pathlib import Path

import customtkinter as ctk
from tkinter import filedialog, messagebox

from storage import ensure_storage_layout, load_globals
from ui import fonts
from ui.components.sidebar import Sidebar
from ui.components.stepper import Stepper
from ui.components.nav import LeftNav
from ui.controllers import task_controller, template_controller
from ui.screens import BasicStep, ContentStep, AssetsStep, NotesStep, ReviewStep, HomeView, EditorView
from ui.state import AppState
from ui.theme import COLORS, SPACING, apply_theme
from ui.animations import animate_slide
from ui.utils import open_path
from ui.windows.history import HistoryWindow


PROJECT_ROOT = Path(__file__).resolve().parents[2]
LOGO_PATH = PROJECT_ROOT / "assets" / "logo_2025.png"


class App(ctk.CTk):
    def __init__(self):
        apply_theme()
        super().__init__()
        self.title("CO Diagramador")
        self.geometry("1120x760")
        self.minsize(1020, 680)
        self.configure(fg_color=COLORS["bg"])

        fonts.load_fonts(self)

        storage_root = ensure_storage_layout()
        globals_map = load_globals(storage_root)
        self.app_state = AppState(storage_root=storage_root, globals_map=globals_map)

        self.app_state.templates = template_controller.load_templates(storage_root)
        if not self.app_state.templates:
            self.app_state.templates = template_controller.load_templates(storage_root)

        self.current_step = 0
        self.steps = []
        self._animating = False

        self._build_layout()
        self._init_templates()
        self.show_home()

    def _build_layout(self) -> None:
        main = ctk.CTkFrame(self, fg_color="transparent")
        main.pack(fill="both", expand=True)

        self.left_nav = LeftNav(
            main,
            logo_path=LOGO_PATH,
            on_tasks=self.on_tasks,
            on_new_task=self.show_editor,
            on_gincanas=self.on_gincanas,
        )
        self.left_nav.pack(side="left", fill="y")

        body = ctk.CTkFrame(main, fg_color="transparent")
        body.pack(side="left", fill="both", expand=True, padx=SPACING["pad_x"], pady=SPACING["pad_y"])

        self.page_container = ctk.CTkFrame(body, fg_color=COLORS["logo_bg"])
        self.page_container.pack(fill="both", expand=True)

        self.home_view = HomeView(self.page_container, LOGO_PATH, self.app_state.storage_root)
        self.home_view.pack(fill="both", expand=True)

        self.editor_view = EditorView(self.page_container, on_status=self.set_status)

        self.wizard_view = ctk.CTkFrame(self.page_container, fg_color="transparent")

        content = ctk.CTkFrame(self.wizard_view, fg_color="transparent")
        content.pack(side="left", fill="both", expand=True)

        self.stepper = Stepper(content, ["Dados", "Conteudo", "Imagens", "Notas", "Revisao"])
        self.stepper.pack(fill="x", pady=(0, SPACING["pad"]))

        self.step_container = ctk.CTkFrame(content, fg_color="transparent")
        self.step_container.pack(fill="both", expand=True)

        self.basic_step = BasicStep(
            self.step_container,
            self.app_state,
            template_ids=[t.id for t in self.app_state.templates] or ["plain"],
            on_template_change=self.on_template_change,
        )
        self.content_step = ContentStep(self.step_container, self.app_state)
        self.assets_step = AssetsStep(self.step_container, self.app_state)
        self.notes_step = NotesStep(self.step_container, self.app_state)
        self.review_step = ReviewStep(self.step_container, self.app_state)

        self.steps = [
            self.basic_step,
            self.content_step,
            self.assets_step,
            self.notes_step,
            self.review_step,
        ]

        # Ensure first step is visible before any animation
        self.steps[0].show()

        self.sidebar = Sidebar(
            self.wizard_view,
            on_prev=self.on_prev,
            on_next=self.on_next,
            on_generate=self.on_generate,
            on_save=self.on_save,
            on_history=self.on_history,
            on_open_storage=self.on_open_storage,
            on_new_task=self.on_new_task,
        )
        self.sidebar.pack(side="right", fill="y", padx=(SPACING["pad"], 0))

        status = ctk.CTkFrame(self, fg_color=COLORS["panel"], corner_radius=0)
        status.pack(fill="x", side="bottom")
        self.status_label = ctk.CTkLabel(
            status,
            text="Pronto",
            text_color=COLORS["text_dim"],
            font=fonts.font(10),
        )
        self.status_label.pack(anchor="w", padx=SPACING["pad_x"], pady=SPACING["pad_small"])

    def _init_templates(self) -> None:
        template_ids = [t.id for t in self.app_state.templates] or ["plain"]
        self.basic_step.set_templates(template_ids)

        default_id = template_ids[0]
        self.set_template(default_id)
        self.basic_step.set_template(default_id)

    def set_template(self, template_id: str) -> None:
        result = template_controller.set_template(self.app_state.storage_root, template_id)
        if not result:
            messagebox.showerror("Erro", f"Template nao encontrado: {template_id}")
            return
        model, tex_path = result
        self.app_state.template_model = model
        self.app_state.template_tex_path = tex_path
        self.sidebar.set_template_label(f"Template: {model.id} v{model.version}")
        self.app_state.fields = {}
        self.content_step.rebuild_fields()
        self.content_step.load_from_state()

    def on_template_change(self, template_id: str) -> None:
        self.set_template(template_id)
        self.set_status("Template atualizado")

    def show_step(self, index: int) -> None:
        if index < 0 or index >= len(self.steps):
            return
        if self._animating or index == self.current_step:
            return
        direction = 1 if index > self.current_step else -1
        from_step = self.steps[self.current_step]
        to_step = self.steps[index]
        to_step.load_from_state()

        self._animating = True

        def done():
            self._animating = False

        animate_slide(
            self.step_container,
            from_step.frame,
            to_step.frame,
            direction=direction,
            duration=180,
            steps=12,
            on_done=done,
        )
        self.current_step = index
        self.stepper.set_active(self.current_step)
        self.sidebar.set_nav_state(
            prev_enabled=self.current_step > 0,
            next_enabled=self.current_step < len(self.steps) - 1,
        )
        self.sidebar.set_save_enabled(self.app_state.last_pdf_path is not None)

    def apply_current(self) -> None:
        self.steps[self.current_step].apply_to_state()

    def on_prev(self) -> None:
        self.apply_current()
        self.show_step(self.current_step - 1)

    def on_next(self) -> None:
        self.apply_current()
        self.show_step(self.current_step + 1)

    def on_generate(self) -> None:
        self.apply_current()
        valid, msg = task_controller.validate_required(self.app_state)
        if not valid:
            messagebox.showwarning("Aviso", msg)
            return

        out = filedialog.asksaveasfilename(
            defaultextension=".pdf",
            filetypes=[("PDF", "*.pdf")],
            title="Salvar PDF como...",
        )
        if not out:
            return

        self.set_status("Gerando PDF...")
        try:
            pdf = task_controller.generate_pdf(self.app_state, Path(out))
            self.app_state.last_pdf_path = pdf
            self.sidebar.set_save_enabled(True)
            self.set_status(f"PDF salvo em {pdf}")
            messagebox.showinfo("OK", f"PDF gerado:\n{pdf}")
        except Exception as exc:
            self.set_status("Erro ao gerar PDF")
            messagebox.showerror("Erro", str(exc))

    def on_save(self) -> None:
        try:
            task_dir = task_controller.save_task_from_state(self.app_state)
            self.set_status(f"Tarefa salva em {task_dir}")
            messagebox.showinfo("OK", f"Tarefa salva em:\n{task_dir}")
        except Exception as exc:
            self.set_status("Erro ao salvar tarefa")
            messagebox.showerror("Erro", str(exc))

    def on_history(self) -> None:
        HistoryWindow(self, self.app_state.storage_root, self.load_task)

    def on_open_storage(self) -> None:
        open_path(self.app_state.storage_root)

    def on_new_task(self) -> None:
        self.app_state.basic.update(
            {
                "title": "",
                "task_type": "pratica",
                "year": str(datetime.now().year),
                "edition": "",
                "authors": "",
                "participants": "",
                "tags": "",
                "categories": "",
            }
        )
        self.app_state.fields = {}
        self.app_state.assets = []
        self.app_state.notes = {"good": "", "bad": ""}
        self.app_state.last_pdf_path = None
        self.sidebar.set_save_enabled(False)
        self.basic_step.load_from_state()
        self.content_step.rebuild_fields()
        self.content_step.load_from_state()
        self.assets_step.load_from_state()
        self.notes_step.load_from_state()
        self.review_step.load_from_state()
        self.show_step(0)
        self.set_status("Nova tarefa")

    def load_task(self, task, task_dir: Path) -> None:
        self.app_state.basic.update(
            {
                "title": task.title,
                "task_type": task.task_type,
                "year": str(task.year),
                "edition": task.edition,
                "authors": ", ".join(task.authors),
                "participants": ", ".join(task.participants),
                "tags": ", ".join(task.tags),
                "categories": ", ".join(task.categories),
            }
        )

        if task.template_id:
            self.set_template(task.template_id)
            self.basic_step.set_template(task.template_id)

        self.app_state.fields = dict(task.fields)
        self.app_state.assets = []
        for asset in task.assets:
            rel = asset.get("file")
            caption = asset.get("caption", "")
            if rel:
                self.app_state.assets.append({"path": str(task_dir / rel), "caption": caption})

        self.app_state.notes = {"good": task.notes_good, "bad": task.notes_bad}

        pdf_path = task_dir / "output.pdf"
        self.app_state.last_pdf_path = pdf_path if pdf_path.exists() else None
        self.sidebar.set_save_enabled(self.app_state.last_pdf_path is not None)

        self.basic_step.load_from_state()
        self.content_step.rebuild_fields()
        self.content_step.load_from_state()
        self.assets_step.load_from_state()
        self.notes_step.load_from_state()
        self.review_step.load_from_state()

        self.show_step(0)
        self.set_status("Tarefa carregada")

    def set_status(self, text: str) -> None:
        self.status_label.configure(text=text)

    def show_home(self) -> None:
        self.wizard_view.pack_forget()
        self.editor_view.pack_forget()
        self.page_container.configure(fg_color=COLORS["logo_bg"])
        self.home_view.pack(fill="both", expand=True)
        self.left_nav.set_active(None)
        self.set_status("Bem-vindo")

    def show_wizard(self) -> None:
        self.home_view.pack_forget()
        self.editor_view.pack_forget()
        self.page_container.configure(fg_color="transparent")
        self.wizard_view.pack(fill="both", expand=True)
        self.left_nav.set_active("new")
        self.show_step(0)

    def show_editor(self) -> None:
        self.home_view.pack_forget()
        self.wizard_view.pack_forget()
        self.page_container.configure(fg_color=COLORS["bg"])
        self.editor_view.pack(fill="both", expand=True)
        self.editor_view.reset()
        self.left_nav.set_active("new")
        self.set_status("Nova tarefa")

    def on_tasks(self) -> None:
        self.left_nav.set_active("tasks")
        HistoryWindow(self, self.app_state.storage_root, self.load_task)

    def on_gincanas(self) -> None:
        self.left_nav.set_active("gincanas")
        HistoryWindow(self, self.app_state.storage_root, self.load_task)
