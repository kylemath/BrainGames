#!/usr/bin/env python3
"""
Scan ../games/*.js, parse each file's JSDoc header (@id/@title/@category/
@order/@newGame), pull the first line of the "EEG mappings:" block as
mappingOneLiner, and write ../games/manifest.json.

Header template each game must provide:

    /**
     * @id <ID>
     * @title <TITLE>
     * @category <CATEGORY>
     * @order <N>
     * @newGame <true|false>
     *
     * EEG mappings:
     *   <FIRST_LINE_IS_MAPPING_ONE_LINER>
     *   ...
     */

Output (stable order — by category then @order then filename):

    [
      { "id": "...", "title": "...", "category": "...", "order": 10,
        "file": "games/<file>.js", "newGame": false,
        "mappingOneLiner": "attention -> shot power" },
      ...
    ]

Usage (from anywhere):
    python3 brainGames/tools/build_manifest.py

stdlib-only. Rebuilds the manifest in place.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
BRAIN_GAMES_DIR = TOOLS_DIR.parent
GAMES_DIR = BRAIN_GAMES_DIR / "games"
MANIFEST = GAMES_DIR / "manifest.json"
CATALOGUE = BRAIN_GAMES_DIR / "catalogue.json"

# The sample / smoke file and any hidden files are skipped.
SKIP_FILES = {"__sample.js"}

# Grab the FIRST /** ... */ block. Game header is always at the top of the
# file, so re.search + DOTALL is sufficient.
HEADER_RE = re.compile(r"/\*\*(.*?)\*/", re.DOTALL)
TAG_RE = re.compile(r"^\s*\*\s*@(\w+)\s+(.+?)\s*$", re.MULTILINE)

# Matches a JSDoc content line (stripped of leading `*` padding).
# Within the matched JSDoc body, we find "EEG mappings:" and read the
# next non-blank line.
MAPPING_LABEL_RE = re.compile(r"EEG\s*mappings\s*:", re.IGNORECASE)

DEFAULT_CATEGORY_ORDER = ["Sports", "Calm", "Focus", "Brain Games"]


def _strip_jsdoc_line(line: str) -> str:
    """Strip the leading ` * ` JSDoc padding from a body line."""
    s = line.rstrip()
    # Remove leading whitespace, then optional leading '*' and its trailing space.
    m = re.match(r"^\s*\*\s?", s)
    return s[m.end():] if m else s.lstrip()


def parse_header(text: str) -> dict:
    """Parse tags + mappingOneLiner from the first JSDoc header.

    Returns a dict possibly containing:
      id, title, category, order (int), newGame (bool), mappingOneLiner (str)
    Missing fields are absent from the dict.
    """
    m = HEADER_RE.search(text)
    if not m:
        return {}
    body = m.group(1)

    out: dict = {}
    for tm in TAG_RE.finditer(body):
        key = tm.group(1).strip()
        val = tm.group(2).strip()
        out[key] = val

    # Coerce types on known tags.
    if "order" in out:
        try:
            out["order"] = int(out["order"])
        except ValueError:
            # Leave as string if non-numeric; caller sorts it to the end.
            pass

    if "newGame" in out:
        raw = str(out["newGame"]).strip().lower()
        out["newGame"] = raw in ("true", "1", "yes")

    # Find the mappingOneLiner: the first non-blank JSDoc content line
    # AFTER the "EEG mappings:" label inside the header body.
    lines = body.splitlines()
    mapping_one_liner = ""
    seen_label = False
    for raw_line in lines:
        stripped = _strip_jsdoc_line(raw_line)
        if not seen_label:
            if MAPPING_LABEL_RE.search(stripped):
                seen_label = True
            continue
        # After the label: skip blanks, pick the first real content line.
        if not stripped.strip():
            continue
        # Stop if we've left the mapping block (another @tag or blank-bounded
        # next section with a different label).
        if stripped.lstrip().startswith("@"):
            break
        mapping_one_liner = stripped.strip()
        break

    if mapping_one_liner:
        # Collapse internal whitespace runs so aligned columns in the
        # source (e.g. "alpha      -> ...") render as tidy one-liners.
        mapping_one_liner = re.sub(r"\s+", " ", mapping_one_liner)
        out["mappingOneLiner"] = mapping_one_liner

    return out


def collect_entries() -> list[dict]:
    entries: list[dict] = []
    for js_file in sorted(GAMES_DIR.glob("*.js")):
        if js_file.name in SKIP_FILES:
            continue
        text = js_file.read_text(encoding="utf-8")
        header = parse_header(text)

        ex_id = header.get("id") or js_file.stem
        title = header.get("title") or ex_id
        category = header.get("category") or "Uncategorized"
        order = header.get("order")
        order_val = order if isinstance(order, int) else None
        new_game = bool(header.get("newGame", False))
        mapping_one_liner = header.get("mappingOneLiner", "")

        entries.append({
            "id": ex_id,
            "title": title,
            "category": category,
            "order": order_val,
            "file": f"games/{js_file.name}",
            "newGame": new_game,
            "mappingOneLiner": mapping_one_liner,
        })

    return entries


def sort_entries(entries: list[dict]) -> list[dict]:
    """Sort by (categoryIndex, order or +inf, filename)."""
    categories_seen: list[str] = []
    # Seed with the canonical order.
    for c in DEFAULT_CATEGORY_ORDER:
        if c not in categories_seen:
            categories_seen.append(c)
    # Then append any new categories in first-seen order.
    for e in entries:
        c = e["category"]
        if c not in categories_seen:
            categories_seen.append(c)

    cat_index = {c: i for i, c in enumerate(categories_seen)}

    def key(e):
        return (
            cat_index.get(e["category"], 10**6),
            e["order"] if e["order"] is not None else 10**9,
            e["file"].lower(),
        )

    return sorted(entries, key=key)


def write_manifest(entries: list[dict]) -> None:
    # Keep order=None as the integer 10**9 sentinel? No — preserve null
    # in the file for honesty. Downstream JS can handle null.
    clean = [
        {
            "id": e["id"],
            "title": e["title"],
            "category": e["category"],
            "order": e["order"],
            "file": e["file"],
            "newGame": e["newGame"],
            "mappingOneLiner": e["mappingOneLiner"],
        }
        for e in entries
    ]
    MANIFEST.write_text(
        json.dumps(clean, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    if not GAMES_DIR.is_dir():
        raise SystemExit(f"Games folder not found: {GAMES_DIR}")

    entries = collect_entries()
    if not entries:
        raise SystemExit(f"No .js files in {GAMES_DIR}")

    entries = sort_entries(entries)
    write_manifest(entries)

    print(f"Wrote {MANIFEST}")
    print(f"  {len(entries)} games:")
    for e in entries:
        tag = "NEW" if e["newGame"] else "   "
        order = str(e["order"]) if e["order"] is not None else "?"
        print(f"    [{tag}] {order:>3}  {e['category']:<14} {e['id']:<20}  {e['title']}")


if __name__ == "__main__":
    main()
