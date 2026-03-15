import re
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from ..models.models import Staff

RANK_TOKENS = {
    "CMDT", "COMMANDANT", "COMMANDER", "CAPT", "CAPTAIN", "MAJ", "MAJOR",
    "LT", "LIEUTENANT", "COL", "COLONEL", "JG", "DR", "MR", "MRS", "MS",
    "NO", "NUMBER",
}


def _name_tokens(name: str) -> list[str]:
    return [token.upper() for token in re.findall(r"[A-Za-z0-9]+", name)]


def _tail_letter(token: str) -> Optional[str]:
    for index in range(len(token) - 1, -1, -1):
        char = token[index]
        if char in "AEIOU":
            continue
        if char == "H" and index > 0:
            continue
        return char
    return token[-1] if token else None


def _base_abbreviation(name: str) -> str:
    tokens = _name_tokens(name)
    if not tokens:
        return "STF"

    alpha_tokens = [token for token in tokens if token.isalpha() and token not in RANK_TOKENS and len(token) > 1]
    if len(alpha_tokens) >= 2:
        source_tokens = alpha_tokens[-2:]
    elif alpha_tokens:
        source_tokens = alpha_tokens
    else:
        source_tokens = tokens[:3]

    if len(source_tokens) == 1 and source_tokens[0].isalpha() and 2 <= len(source_tokens[0]) <= 4:
        return source_tokens[0]

    initials = "".join(token[0] for token in source_tokens[:3])
    base = initials

    if len(base) < 3:
        tail = _tail_letter(source_tokens[-1])
        if tail and tail not in base:
            base += tail

    if len(base) < 3:
        for token in source_tokens:
            for char in token[1:]:
                if char not in base:
                    base += char
                if len(base) >= 3:
                    break
            if len(base) >= 3:
                break

    if len(base) < 3:
        base = (base + "STF")[:3]

    return base[:6]


def generate_unique_abbreviation(name: str, existing: Iterable[str]) -> str:
    used = {abbr.upper() for abbr in existing if abbr}
    base = _base_abbreviation(name)
    if base not in used:
        return base

    for index in range(2, 1000):
        suffix = str(index)
        candidate = f"{base[: max(1, 6 - len(suffix))]}{suffix}"
        if candidate not in used:
            return candidate

    raise ValueError("Could not generate a unique abbreviation.")


def sync_staff_abbreviations(db: Session):
    staff_rows = db.query(Staff).order_by(Staff.id).all()
    used: list[str] = []
    changed = False

    for staff in staff_rows:
        existing = [abbr for abbr in used]
        desired = generate_unique_abbreviation(staff.name, existing)

        if staff.abbreviation != desired:
            staff.abbreviation = desired
            changed = True

        used.append(desired)

    if changed:
        db.commit()
