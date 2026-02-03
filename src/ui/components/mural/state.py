from dataclasses import dataclass


@dataclass
class PolaroidState:
    id: str
    x: float
    y: float
    rotation: float = 0.0
    photo: str | None = None
