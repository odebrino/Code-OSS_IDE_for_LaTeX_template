import customtkinter as ctk

from ui.theme import COLORS, RADIUS, SPACING
from ui import fonts
from ui.animations import animate_color


class Sidebar(ctk.CTkFrame):
    def __init__(
        self,
        parent,
        on_prev,
        on_next,
        on_generate,
        on_save,
        on_history,
        on_open_storage,
        on_new_task,
    ):
        super().__init__(
            parent,
            fg_color=COLORS["panel"],
            corner_radius=RADIUS["card"],
            border_width=1,
            border_color=COLORS["border"],
        )

        ctk.CTkLabel(
            self,
            text="Acoes",
            text_color=COLORS["text_primary"],
            font=fonts.font(12, "bold"),
        ).pack(anchor="w", padx=SPACING["pad"], pady=(SPACING["pad"], SPACING["pad_small"]))

        self.prev_btn = self._button("Anterior", on_prev, kind="secondary")
        self.prev_btn.pack(fill="x", padx=SPACING["pad"], pady=(0, SPACING["pad_small"]))

        self.next_btn = self._button("Proximo", on_next, kind="secondary")
        self.next_btn.pack(fill="x", padx=SPACING["pad"], pady=(0, SPACING["pad_small"]))

        self.generate_btn = self._button("Gerar PDF", on_generate, kind="primary")
        self.generate_btn.pack(fill="x", padx=SPACING["pad"], pady=(SPACING["pad_small"], SPACING["pad_small"]))

        self.save_btn = self._button("Salvar tarefa", on_save, kind="primary")
        self.save_btn.pack(fill="x", padx=SPACING["pad"], pady=(0, SPACING["pad_small"]))

        self.history_btn = self._button("Historico", on_history, kind="secondary")
        self.history_btn.pack(fill="x", padx=SPACING["pad"], pady=(0, SPACING["pad_small"]))

        self.open_storage_btn = self._button("Abrir pasta", on_open_storage, kind="secondary")
        self.open_storage_btn.pack(fill="x", padx=SPACING["pad"], pady=(0, SPACING["pad_small"]))

        self.new_btn = self._button("Nova tarefa", on_new_task, kind="secondary")
        self.new_btn.pack(fill="x", padx=SPACING["pad"], pady=(0, SPACING["pad"]))

        self.template_label = ctk.CTkLabel(
            self,
            text="Template: -",
            text_color=COLORS["text_dim"],
            font=fonts.font(10),
            wraplength=180,
            justify="left",
        )
        self.template_label.pack(anchor="w", padx=SPACING["pad"], pady=(0, SPACING["pad"]))

    def _button(self, text: str, command, kind: str = "primary") -> ctk.CTkButton:
        if kind == "secondary":
            fg = COLORS["panel_soft"]
            text_color = COLORS["text_primary"]
            hover = COLORS["border"]
            border = COLORS["border"]
        else:
            fg = COLORS["gold"]
            text_color = COLORS["bg"]
            hover = COLORS["gold_light"]
            border = COLORS["gold_dark"]

        btn = ctk.CTkButton(
            self,
            text=text,
            command=command,
            fg_color=fg,
            hover_color=hover,
            text_color=text_color,
            corner_radius=RADIUS["button"],
            border_width=1,
            border_color=border,
            font=fonts.font(11, "bold"),
        )
        self._bind_hover(btn, fg, hover)
        return btn

    def _bind_hover(self, button: ctk.CTkButton, from_color: str, to_color: str) -> None:
        def _on_enter(_event=None):
            if button.cget("state") != "disabled":
                animate_color(button, from_color, to_color, duration=120, steps=8)

        def _on_leave(_event=None):
            if button.cget("state") != "disabled":
                animate_color(button, to_color, from_color, duration=120, steps=8)

        button.bind("<Enter>", _on_enter)
        button.bind("<Leave>", _on_leave)

    def set_template_label(self, text: str) -> None:
        self.template_label.configure(text=text)

    def set_nav_state(self, prev_enabled: bool, next_enabled: bool) -> None:
        self.prev_btn.configure(state="normal" if prev_enabled else "disabled")
        self.next_btn.configure(state="normal" if next_enabled else "disabled")

    def set_save_enabled(self, enabled: bool) -> None:
        self.save_btn.configure(state="normal" if enabled else "disabled")
