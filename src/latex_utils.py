
def escape_latex_text(s: str) -> str:
    """
    Escapes characters that are special in LaTeX.
    """
    if not s:
        return ""
        
    repl = {
        "\\": r"\textbackslash{}",
        "{": r"\{",
        "}": r"\}",
        "#": r"\#",
        "$": r"\$",
        "%": r"\%",
        "&": r"\&",
        "_": r"\_",
        "^": r"\^{}",
        "~": r"\~{}",
    }
    return "".join(repl.get(ch, ch) for ch in s)


def plaintext_to_latex(text: str) -> str:
    """
    Converts plain text to LaTeX-safe text with paragraph handling.
    - Blank lines -> new paragraph (\par)
    - Single newlines -> space
    """
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()

    paragraphs = []
    buf = []
    for line in text.split("\n"):
        if line.strip() == "":
            if buf:
                paragraphs.append(" ".join(buf).strip())
                buf = []
        else:
            buf.append(line.strip())
    if buf:
        paragraphs.append(" ".join(buf).strip())

    paragraphs = [escape_latex_text(p) for p in paragraphs]
    return "\n\n\\par\n\n".join(paragraphs)
