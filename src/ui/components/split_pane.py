from __future__ import annotations

from typing import Optional

import customtkinter as ctk

from ui.theme import COLORS


class SplitPane(ctk.CTkFrame):
    def __init__(
        self,
        parent,
        divider_width: int = 6,
        min_ratio: float = 0.28,
        max_ratio: float = 0.72,
        bg_color: Optional[str] = None,
        divider_color: Optional[str] = None,
    ):
        self._bg = bg_color or COLORS["bg"]
        super().__init__(parent, fg_color=self._bg)
        self._ratio = 0.5
        self._min_ratio = min_ratio
        self._max_ratio = max_ratio
        self._divider_width = max(2, divider_width)

        self.left = ctk.CTkFrame(self, fg_color=self._bg)
        self.right = ctk.CTkFrame(self, fg_color=self._bg)
        self.divider = ctk.CTkFrame(
            self,
            fg_color=divider_color or COLORS["border"],
            width=self._divider_width,
            cursor="sb_h_double_arrow",
        )

        self._dragging = False
        self._layout()

        self.bind("<Configure>", lambda _event: self._layout())
        self.divider.bind("<ButtonPress-1>", self._start_drag)
        self.divider.bind("<B1-Motion>", self._on_drag)
        self.divider.bind("<ButtonRelease-1>", self._stop_drag)

    def _layout(self) -> None:
        width = max(1, self.winfo_width())
        height = max(1, self.winfo_height())
        left_w = int(width * self._ratio)
        left_w = max(120, min(left_w, width - 120 - self._divider_width))
        right_w = max(1, width - left_w - self._divider_width)

        self.left.place(x=0, y=0, width=left_w, height=height)
        self.divider.place(x=left_w, y=0, width=self._divider_width, height=height)
        self.right.place(x=left_w + self._divider_width, y=0, width=right_w, height=height)

    def _start_drag(self, _event) -> None:
        self._dragging = True

    def _on_drag(self, event) -> None:
        if not self._dragging:
            return
        width = max(1, self.winfo_width())
        local_x = event.x_root - self.winfo_rootx()
        ratio = local_x / width
        ratio = max(self._min_ratio, min(self._max_ratio, ratio))
        self._ratio = ratio
        self._layout()

    def _stop_drag(self, _event) -> None:
        self._dragging = False
