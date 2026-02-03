from __future__ import annotations

from pathlib import Path
from typing import Callable, Dict, Tuple

import customtkinter as ctk
from PIL import Image, ImageOps
from tkinter import simpledialog

from ui.theme import COLORS
from .state import PolaroidState
from .drag import DragController
from .assets import FRAME_PATH


PADDING_RATIO = 0.08
_IMAGE_CACHE: Dict[Tuple[str, float, float, int, int], Image.Image] = {}
_CACHE_LIMIT = 80


def _compose_polaroid(
    photo_path: Path,
    rotation: float = 0.0,
    scale: float = 1.0,
    display_size: Tuple[int, int] = (240, 290),
) -> Image.Image:
    key = (str(photo_path), round(rotation, 2), round(scale, 3), display_size[0], display_size[1])
    cached = _IMAGE_CACHE.get(key)
    if cached:
        return cached

    if FRAME_PATH.exists():
        frame = Image.open(FRAME_PATH).convert("RGBA")
    else:
        frame = Image.new("RGBA", (1046, 1266), (255, 255, 255, 255))

    photo = Image.open(photo_path).convert("RGBA")
    inner_w = int(frame.width * 0.78)
    inner_h = int(frame.height * 0.62)
    photo = ImageOps.fit(photo, (inner_w, inner_h), Image.Resampling.LANCZOS)

    offset_x = (frame.width - inner_w) // 2
    offset_y = int(frame.height * 0.12)
    composite = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    composite.paste(photo, (offset_x, offset_y))
    composite.alpha_composite(frame)

    pad = max(2, int(frame.width * PADDING_RATIO))
    padded = Image.new("RGBA", (frame.width + pad * 2, frame.height + pad * 2), (0, 0, 0, 0))
    padded.paste(composite, (pad, pad), composite)
    composite = padded

    if rotation:
        composite = composite.rotate(
            rotation, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=(0, 0, 0, 0)
        )

    render_size = (max(2, int(display_size[0] * 2 * scale)), max(2, int(display_size[1] * 2 * scale)))
    final = ImageOps.contain(composite, render_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", render_size, (0, 0, 0, 0))
    cx = (render_size[0] - final.width) // 2
    cy = (render_size[1] - final.height) // 2
    canvas.paste(final, (cx, cy), final)
    if len(_IMAGE_CACHE) >= _CACHE_LIMIT:
        _IMAGE_CACHE.pop(next(iter(_IMAGE_CACHE)))
    _IMAGE_CACHE[key] = canvas
    return canvas


class PolaroidCard(ctk.CTkFrame):
    def __init__(
        self,
        parent,
        state: PolaroidState,
        dragger: DragController,
        on_drop,
        on_delete: Callable[["PolaroidCard"], None] | None = None,
        on_caption: Callable[["PolaroidCard", str], None] | None = None,
        on_drag_start=None,
        on_drag_end=None,
        display_size: Tuple[int, int] = (240, 290),
    ):
        super().__init__(
            parent,
            width=display_size[0],
            height=display_size[1],
            fg_color="transparent",
            bg_color=COLORS["logo_bg"],
        )
        self.pack_propagate(False)
        self.state = state
        self.dragger = dragger
        self.on_drop = on_drop
        self.on_delete = on_delete
        self.on_caption = on_caption
        self.on_drag_start = on_drag_start
        self.on_drag_end = on_drag_end
        self.display_size = display_size
        self.image_label = ctk.CTkLabel(
            self,
            text="",
            fg_color="transparent",
            bg_color=COLORS["logo_bg"],
        )
        self.image_label.pack(fill="both", expand=True)

        self.caption_label = ctk.CTkLabel(
            self,
            text=self.state.caption or "",
            text_color=COLORS["text_muted"],
            font=("Segoe UI", 11),
            fg_color="transparent",
            bg_color=COLORS["logo_bg"],
        )
        self.caption_label.place(relx=0.5, rely=0.92, anchor="center")

        self.delete_button = ctk.CTkButton(
            self,
            text="✕",
            width=24,
            height=24,
            fg_color=COLORS["danger"],
            hover_color=COLORS["danger_hover"],
            text_color=COLORS["text_primary"],
            corner_radius=12,
            command=self._on_delete,
        )
        self.delete_button.place(relx=0.86, rely=0.12, anchor="center")
        self.delete_button.lower()

        self._image = None
        self._update_image()

        for widget in (self, self.image_label):
            widget.bind("<Button-1>", self._on_press)
            widget.bind("<B1-Motion>", self._on_drag)
            widget.bind("<ButtonRelease-1>", self._on_release)
            widget.bind("<Double-Button-1>", self._on_edit_caption)
            widget.bind("<Enter>", self._on_hover)
            widget.bind("<Leave>", self._on_hover_end)

        for widget in (self.caption_label, self.delete_button):
            widget.bind("<Enter>", self._on_hover)
            widget.bind("<Leave>", self._on_hover_end)

    def set_display_size(self, size: Tuple[int, int]) -> None:
        self.display_size = size
        self.configure(width=size[0], height=size[1])
        self._update_image()

    def _update_image(self) -> None:
        if not self.state.photo:
            return
        photo_path = Path(self.state.photo)
        if not photo_path.exists():
            return
        composed = _compose_polaroid(
            photo_path,
            rotation=self.state.rotation,
            scale=self.state.scale,
            display_size=self.display_size,
        )
        self._image = ctk.CTkImage(light_image=composed, dark_image=composed, size=self.display_size)
        self.image_label.configure(image=self._image)
        self.caption_label.configure(text=self.state.caption or "")

    def _on_press(self, event):
        self.dragger.start_drag(self, event)
        if self.on_drag_start:
            self.on_drag_start(self)

    def _on_drag(self, event):
        self.dragger.drag(event)

    def _on_release(self, _event=None):
        self.dragger.end_drag()
        self.on_drop(self)
        if self.on_drag_end:
            self.on_drag_end(self)

    def _on_delete(self) -> None:
        if self.on_delete:
            self.on_delete(self)

    def _on_edit_caption(self, _event=None) -> None:
        new_caption = simpledialog.askstring("Legenda", "Digite a legenda da foto:", initialvalue=self.state.caption)
        if new_caption is None:
            return
        self.state.caption = new_caption.strip()
        self.caption_label.configure(text=self.state.caption)
        if self.on_caption:
            self.on_caption(self, self.state.caption)

    def _on_hover(self, _event=None) -> None:
        self.delete_button.lift()

    def _on_hover_end(self, _event=None) -> None:
        self.delete_button.lower()
