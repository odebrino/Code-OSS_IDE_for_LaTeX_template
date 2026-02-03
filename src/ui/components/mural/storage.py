import json
import shutil
from pathlib import Path
from typing import List, Tuple

from .state import PolaroidState


def load_state(path: Path) -> Tuple[List[PolaroidState], int]:
    if not path.exists():
        return [], 0
    data = json.loads(path.read_text(encoding="utf-8"))
    items = []
    for item in data.get("items", []):
        try:
            photo = item.get("photo")
            if not photo:
                continue
            items.append(
                PolaroidState(
                    id=str(item.get("id")),
                    x=float(item.get("x", 0.5)),
                    y=float(item.get("y", 0.5)),
                    rotation=float(item.get("rotation", 0.0)),
                    scale=float(item.get("scale", 1.0)),
                    photo=photo,
                    caption=str(item.get("caption", "")),
                    z_index=int(item.get("z_index", 0)),
                )
            )
        except Exception:
            continue
    next_index = int(data.get("next_index", len(items)))
    return items, next_index


def save_state(path: Path, items: List[PolaroidState], next_index: int) -> None:
    payload = {
        "version": 1,
        "items": [
            {
                "id": item.id,
                "x": item.x,
                "y": item.y,
                "rotation": item.rotation,
                "scale": item.scale,
                "photo": item.photo,
                "caption": item.caption,
                "z_index": item.z_index,
            }
            for item in items
        ],
        "next_index": next_index,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def copy_photo(src: Path, dest_dir: Path, dest_name: str) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / dest_name
    shutil.copy2(src, dest_path)
    return dest_path
