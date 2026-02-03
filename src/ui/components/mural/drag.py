from typing import Optional

import customtkinter as ctk


def clamp(value: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(value, max_val))


class DragController:
    def __init__(self, container: ctk.CTkFrame):
        self.container = container
        self.active: Optional[ctk.CTkFrame] = None
        self.offset_x = 0.0
        self.offset_y = 0.0

    def start_drag(self, widget: ctk.CTkFrame, event) -> None:
        self.active = widget
        widget.lift()
        container = self.container
        pointer_x = event.x_root - container.winfo_rootx()
        pointer_y = event.y_root - container.winfo_rooty()
        center_x = widget.winfo_x() + (widget.winfo_width() / 2)
        center_y = widget.winfo_y() + (widget.winfo_height() / 2)
        self.offset_x = pointer_x - center_x
        self.offset_y = pointer_y - center_y

    def drag(self, event) -> None:
        if not self.active:
            return
        container = self.container
        pointer_x = event.x_root - container.winfo_rootx()
        pointer_y = event.y_root - container.winfo_rooty()

        new_x = pointer_x - self.offset_x
        new_y = pointer_y - self.offset_y

        half_w = self.active.winfo_width() / 2
        half_h = self.active.winfo_height() / 2
        max_x = container.winfo_width() - half_w
        max_y = container.winfo_height() - half_h
        new_x = clamp(new_x, half_w, max_x)
        new_y = clamp(new_y, half_h, max_y)

        self.active.place_configure(x=new_x, y=new_y, anchor="center")

    def end_drag(self) -> None:
        self.active = None
