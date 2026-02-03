from __future__ import annotations

import abc
import customtkinter as ctk

from ui.state import AppState


class BaseStep(abc.ABC):
    def __init__(self, parent: ctk.CTkFrame, state: AppState):
        self.state = state
        self.frame = ctk.CTkFrame(parent, fg_color="transparent")
        self.frame.place(relx=0, rely=0, relwidth=1, relheight=1)
        self.frame.place_forget()

    def show(self) -> None:
        self.frame.place(relx=0, rely=0, relwidth=1, relheight=1)

    def hide(self) -> None:
        self.frame.place_forget()

    @abc.abstractmethod
    def load_from_state(self) -> None:
        raise NotImplementedError

    @abc.abstractmethod
    def apply_to_state(self) -> None:
        raise NotImplementedError

    def validate(self) -> tuple[bool, str]:
        return True, ""
