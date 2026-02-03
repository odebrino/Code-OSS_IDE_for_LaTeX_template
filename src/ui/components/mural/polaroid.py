from __future__ import annotations

from pathlib import Path
import customtkinter as ctk
from PIL import Image, ImageOps

from ui.theme import COLORS
from .state import PolaroidState
from .drag import DragController
from .assets import FRAME_PATH


DISPLAY_SIZE = (240, 290)
RENDER_SCALE = 2
RENDER_SIZE = (DISPLAY_SIZE[0] * RENDER_SCALE, DISPLAY_SIZE[1] * RENDER_SCALE)
PADDING_RATIO = 0.08


def _compose_polaroid(photo_path: Path, rotation: float = 0.0) -> Image.Image:
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

    final = ImageOps.contain(composite, RENDER_SIZE, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", RENDER_SIZE, (0, 0, 0, 0))
    cx = (RENDER_SIZE[0] - final.width) // 2
    cy = (RENDER_SIZE[1] - final.height) // 2
    canvas.paste(final, (cx, cy), final)
    return canvas


class PolaroidCard(ctk.CTkFrame):
    def __init__(
        self,
        parent,
        state: PolaroidState,
        dragger: DragController,
        on_drop,
        on_drag_start=None,
        on_drag_end=None,
    ):
        super().__init__(
            parent,
            width=DISPLAY_SIZE[0],
            height=DISPLAY_SIZE[1],
            fg_color="transparent",
            bg_color=COLORS["logo_bg"],
        )
        self.pack_propagate(False)
        self.state = state
        self.dragger = dragger
        self.on_drop = on_drop
        self.on_drag_start = on_drag_start
        self.on_drag_end = on_drag_end
        self.image_label = ctk.CTkLabel(
            self,
            text="",
            fg_color="transparent",
            bg_color=COLORS["logo_bg"],
        )
        self.image_label.pack(fill="both", expand=True)

        self._image = None
        self._update_image()

        for widget in (self, self.image_label):
            widget.bind("<Button-1>", self._on_press)
            widget.bind("<B1-Motion>", self._on_drag)
            widget.bind("<ButtonRelease-1>", self._on_release)

    def _update_image(self) -> None:
        if not self.state.photo:
            return
        photo_path = Path(self.state.photo)
        if not photo_path.exists():
            return
        composed = _compose_polaroid(photo_path, rotation=self.state.rotation)
        self._image = ctk.CTkImage(light_image=composed, dark_image=composed, size=DISPLAY_SIZE)
        self.image_label.configure(image=self._image)

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
