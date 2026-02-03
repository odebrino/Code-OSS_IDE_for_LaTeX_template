import time
from typing import Callable, Optional, Tuple

import customtkinter as ctk


def ease_out_cubic(t: float) -> float:
    return 1 - pow(1 - t, 3)


def _hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def _rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def animate_color(
    widget,
    from_color: str,
    to_color: str,
    duration: int = 120,
    steps: int = 8,
) -> None:
    if steps <= 0:
        return
    start = _hex_to_rgb(from_color)
    end = _hex_to_rgb(to_color)
    step_time = max(1, duration // steps)

    def step(i: int):
        t = ease_out_cubic(i / steps)
        rgb = (
            int(start[0] + (end[0] - start[0]) * t),
            int(start[1] + (end[1] - start[1]) * t),
            int(start[2] + (end[2] - start[2]) * t),
        )
        try:
            widget.configure(fg_color=_rgb_to_hex(rgb))
        except Exception:
            return
        if i < steps:
            widget.after(step_time, lambda: step(i + 1))

    step(0)


def animate_pulse(
    widget,
    base_size: Tuple[int, int],
    scale: float = 1.08,
    duration: int = 140,
    steps: int = 8,
    corner_radius: Optional[int] = None,
) -> None:
    if steps <= 0:
        return
    base_w, base_h = base_size
    step_time = max(1, duration // steps)

    def step(i: int):
        t = i / steps
        pulse = 1 - abs(2 * t - 1)
        eased = ease_out_cubic(pulse)
        new_w = int(base_w + (base_w * scale - base_w) * eased)
        new_h = int(base_h + (base_h * scale - base_h) * eased)
        try:
            widget.configure(width=new_w, height=new_h)
            if corner_radius is not None:
                widget.configure(corner_radius=int(corner_radius * (new_w / base_w)))
        except Exception:
            return
        if i < steps:
            widget.after(step_time, lambda: step(i + 1))

    step(0)


def animate_slide(
    container: ctk.CTkFrame,
    from_frame: ctk.CTkFrame,
    to_frame: ctk.CTkFrame,
    direction: int = 1,
    duration: int = 180,
    steps: int = 12,
    on_done: Optional[Callable[[], None]] = None,
) -> None:
    if steps <= 0:
        from_frame.place_forget()
        to_frame.place(relx=0, rely=0, relwidth=1, relheight=1)
        if on_done:
            on_done()
        return

    container.update_idletasks()
    width = container.winfo_width() or 1
    step_time = max(1, duration // steps)

    start_x = 0
    offset = width if direction >= 0 else -width

    to_frame.place(relx=0, rely=0, relwidth=1, relheight=1)

    def step(i: int):
        t = ease_out_cubic(i / steps)
        x_from = int(start_x - offset * t)
        x_to = int(start_x + offset * (1 - t))
        from_frame.place(x=x_from, y=0, relheight=1, width=width)
        to_frame.place(x=x_to, y=0, relheight=1, width=width)
        if i < steps:
            container.after(step_time, lambda: step(i + 1))
        else:
            from_frame.place_forget()
            to_frame.place(x=0, y=0, relwidth=1, relheight=1)
            if on_done:
                on_done()

    step(0)
