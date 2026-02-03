from __future__ import annotations

import random
import uuid
from pathlib import Path
from typing import Dict, List

import customtkinter as ctk
from PIL import Image, ImageOps

from ui.theme import COLORS
from ui.animations import animate_color, animate_pulse
from ui.components.mural.drag import DragController
from ui.components.mural.polaroid import PolaroidCard
from ui.components.mural.state import PolaroidState
from ui.components.mural.storage import load_state, save_state, copy_photo
from ui.components.mural.assets import list_cat_photos


class MuralView(ctk.CTkFrame):
    def __init__(self, parent, logo_path: Path, storage_root: Path):
        super().__init__(parent, fg_color=COLORS["logo_bg"])
        self.storage_root = storage_root
        self.positions_path = self.storage_root / "mural_positions.json"
        self.photos_dir = self.storage_root / "mural" / "photos"
        self._logo_source = None
        self._logo_image = None
        self._logo_label = None
        self._resize_job = None
        self._logo_relx = 0.74
        self._logo_rely = 0.5

        self.canvas = ctk.CTkFrame(self, fg_color=COLORS["logo_bg"])
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<Configure>", self._on_canvas_resize)

        self.dragger = DragController(self.canvas)
        self._cards: Dict[str, PolaroidCard] = {}
        self._dragging = False

        self._render_logo(logo_path)

        self._items, self._next_index = load_state(self.positions_path)
        self._cat_photos = list_cat_photos()
        if not self._items:
            self._next_index = 0
        else:
            if self._next_index < len(self._items):
                self._next_index = len(self._items)
        if self._next_index > len(self._cat_photos):
            self._next_index = len(self._cat_photos)
        self._button_size = 54
        self._button_radius = 27
        self._button_font = ("Segoe UI Emoji", 18)
        self._render_saved()
        self._add_button()
        self._button_base_color = COLORS["polaroid"]
        self._button_trash_color = COLORS["danger"]

    def _render_logo(self, logo_path: Path) -> None:
        if logo_path.exists():
            try:
                self._logo_source = Image.open(logo_path).convert("RGBA")
            except Exception:
                self._logo_source = None

        self._logo_label = ctk.CTkLabel(self.canvas, text="", fg_color="transparent")
        self._logo_label.place(relx=self._logo_relx, rely=self._logo_rely, anchor="center")

        if not self._logo_source:
            self._logo_label.configure(
                text="CO",
                text_color=COLORS["text_primary"],
                font=("Segoe UI", 28, "bold"),
            )
        else:
            self._update_logo()
        self._logo_label.lower()

    def _update_logo(self) -> None:
        if not self._logo_source or not self._logo_label:
            return
        width = self.canvas.winfo_width() or 1
        height = self.canvas.winfo_height() or 1
        target = int(min(width, height) * 0.34)
        target = max(140, min(target, 420))
        logo_img = ImageOps.contain(self._logo_source, (target, target), Image.Resampling.LANCZOS)
        self._logo_image = ctk.CTkImage(light_image=logo_img, dark_image=logo_img, size=logo_img.size)
        self._logo_label.configure(image=self._logo_image, text="")

    def _render_saved(self) -> None:
        if not self._items:
            return
        self.canvas.update_idletasks()
        width = self.canvas.winfo_width() or 1
        height = self.canvas.winfo_height() or 1

        for state in self._items:
            if not state.photo:
                continue
            if state.photo and not Path(state.photo).is_absolute():
                state.photo = str(self.storage_root / state.photo)
            if not state.photo or not Path(state.photo).exists():
                continue
            card = PolaroidCard(
                self.canvas,
                state,
                self.dragger,
                self._on_drop,
                on_drag_start=self._on_drag_start,
                on_drag_end=self._on_drag_end,
            )
            self._cards[state.id] = card
            x = state.x * width
            y = state.y * height
            card.place(x=x, y=y, anchor="center")

    def _add_button(self) -> None:
        self.add_button = ctk.CTkButton(
            self.canvas,
            text="🖼️",
            width=self._button_size,
            height=self._button_size,
            fg_color=COLORS["polaroid"],
            hover_color=COLORS["polaroid_border"],
            text_color=COLORS["bg"],
            corner_radius=self._button_radius,
            border_width=1,
            border_color=COLORS["polaroid_border"],
            font=self._button_font,
            command=self._on_add_click,
        )
        self.add_button.place(relx=0.94, rely=0.88, anchor="center")
        self._update_add_button()

    def _next_cat(self) -> Path | None:
        if not self._cat_photos:
            return None
        if self._next_index >= len(self._cat_photos):
            return None
        idx = self._next_index
        self._next_index += 1
        return self._cat_photos[idx]

    def _on_add_click(self) -> None:
        if self._dragging:
            return
        if not self._cat_photos or self._next_index >= len(self._cat_photos):
            self._update_add_button()
            return
        self.add_polaroid()

    def add_polaroid(self) -> None:
        photo = self._next_cat()
        if not photo:
            self._update_add_button()
            return

        self.canvas.update_idletasks()
        width = self.canvas.winfo_width() or 1
        height = self.canvas.winfo_height() or 1

        pid = f"p{uuid.uuid4().hex[:8]}"
        dest = copy_photo(photo, self.photos_dir, f"{pid}{photo.suffix}")

        state = PolaroidState(
            id=pid,
            x=0.5,
            y=0.5,
            rotation=random.uniform(-4, 4),
            photo=str(dest),
        )
        card = PolaroidCard(
            self.canvas,
            state,
            self.dragger,
            self._on_drop,
            on_drag_start=self._on_drag_start,
            on_drag_end=self._on_drag_end,
        )
        self._cards[state.id] = card
        card.place(x=width / 2, y=height / 2, anchor="center")

        self._persist()
        self._update_add_button()

    def _on_drop(self, card: PolaroidCard) -> None:
        if self._is_over_trash(card):
            self._delete_card(card)
            return

        self.canvas.update_idletasks()
        width = self.canvas.winfo_width() or 1
        height = self.canvas.winfo_height() or 1
        info = card.place_info()
        x = float(info.get("x", 0)) / width
        y = float(info.get("y", 0)) / height
        card.state.x = x
        card.state.y = y
        self._persist()

    def _persist(self) -> None:
        items: List[PolaroidState] = []
        for c in self._cards.values():
            state = c.state
            if state.photo:
                try:
                    rel = str(Path(state.photo).relative_to(self.storage_root))
                except Exception:
                    rel = state.photo
                state = PolaroidState(
                    id=state.id,
                    x=state.x,
                    y=state.y,
                    rotation=state.rotation,
                    photo=rel,
                )
            items.append(state)
        save_state(self.positions_path, items, self._next_index)

    def _update_add_button(self) -> None:
        if not self._cat_photos or self._next_index >= len(self._cat_photos):
            self.add_button.configure(state="disabled")
        else:
            self.add_button.configure(state="normal")

    def _on_drag_start(self, _card: PolaroidCard) -> None:
        self._dragging = True
        self.add_button.configure(state="normal")
        animate_pulse(self.add_button, (self._button_size, self._button_size), corner_radius=self._button_radius)
        animate_color(self.add_button, self._button_base_color, self._button_trash_color, duration=140, steps=8)
        self.add_button.configure(text="🗑️", image=None, fg_color=COLORS["danger"], hover_color=COLORS["danger_hover"])

    def _on_drag_end(self, _card: PolaroidCard) -> None:
        self._dragging = False
        animate_color(self.add_button, self._button_trash_color, self._button_base_color, duration=140, steps=8)
        self.add_button.configure(text="🖼️", image=None, fg_color=COLORS["polaroid"], hover_color=COLORS["polaroid_border"])
        self.add_button.configure(width=self._button_size, height=self._button_size, corner_radius=self._button_radius)
        self._update_add_button()

    def _on_canvas_resize(self, _event=None) -> None:
        if self._resize_job:
            self.after_cancel(self._resize_job)
        self._resize_job = self.after(40, self._apply_layout)

    def _apply_layout(self) -> None:
        self._resize_job = None
        if self._dragging:
            return
        self._update_logo()
        if self._logo_label:
            self._logo_label.place_configure(relx=self._logo_relx, rely=self._logo_rely)
        width = self.canvas.winfo_width() or 1
        height = self.canvas.winfo_height() or 1
        for card in self._cards.values():
            card.place(x=card.state.x * width, y=card.state.y * height, anchor="center")

    def _is_over_trash(self, card: PolaroidCard) -> bool:
        bx = self.add_button.winfo_x()
        by = self.add_button.winfo_y()
        bw = self.add_button.winfo_width()
        bh = self.add_button.winfo_height()
        cx = card.winfo_x() + (card.winfo_width() / 2)
        cy = card.winfo_y() + (card.winfo_height() / 2)
        return bx <= cx <= (bx + bw) and by <= cy <= (by + bh)

    def _delete_card(self, card: PolaroidCard) -> None:
        if card.state.id in self._cards:
            self._cards.pop(card.state.id)
        card.destroy()
        self._persist()
