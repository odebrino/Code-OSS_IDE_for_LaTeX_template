import customtkinter as ctk

from ui.theme import COLORS, RADIUS, SPACING
from ui import fonts


class Stepper(ctk.CTkFrame):
    def __init__(self, parent, steps: list[str]):
        super().__init__(parent, fg_color="transparent")
        self.steps = steps
        self.labels: list[ctk.CTkLabel] = []

        for name in steps:
            lbl = ctk.CTkLabel(
                self,
                text=name,
                text_color=COLORS["text_muted"],
                fg_color=COLORS["panel_soft"],
                corner_radius=RADIUS["pill"],
                padx=SPACING["pad"],
                pady=SPACING["pad_small"],
                font=fonts.font(11, "bold"),
            )
            lbl.pack(side="left", padx=(0, SPACING["pad_small"]))
            self.labels.append(lbl)

        self.counter = ctk.CTkLabel(
            self,
            text="",
            text_color=COLORS["text_dim"],
            font=fonts.font(10),
        )
        self.counter.pack(side="right")

    def set_active(self, index: int) -> None:
        for i, lbl in enumerate(self.labels):
            if i == index:
                lbl.configure(fg_color=COLORS["gold"], text_color=COLORS["bg"])
            else:
                lbl.configure(fg_color=COLORS["panel_soft"], text_color=COLORS["text_muted"])
        self.counter.configure(text=f"Etapa {index + 1} de {len(self.labels)}")
