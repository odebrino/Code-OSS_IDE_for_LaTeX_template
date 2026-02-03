from dataclasses import dataclass


@dataclass
class PolaroidState:
    id: str
    x: float
    y: float
    rotation: float = 0.0
    scale: float = 1.0
    photo: str | None = None
    caption: str = ""
    z_index: int = 0
