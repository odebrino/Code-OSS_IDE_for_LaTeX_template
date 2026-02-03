try:
    import customtkinter  # noqa: F401
except ModuleNotFoundError:
    print(
        "Dependencia ausente: customtkinter.\n"
        "Use o ambiente virtual do projeto:\n"
        "  python3 -m venv .venv\n"
        "  source .venv/bin/activate\n"
        "  pip install -r requirements.txt\n"
        "Depois rode: python src/app.py\n"
        "Ou use: ./run.sh"
    )
    raise SystemExit(1)

from ui.app import App


if __name__ == "__main__":
    App().mainloop()
