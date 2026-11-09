#!/usr/bin/env python3
"""Build compact client-side industry data from CCP SDE JSONL."""

from __future__ import annotations

import json
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SDE_DIR = ROOT / "sde" / "extracted"
OUT_JS = ROOT / "eve-industry-data.js"
OUT_META = ROOT / "eve-industry-meta.json"


def en_name(obj: dict) -> str:
    name = obj.get("name")
    if isinstance(name, dict):
        return name.get("en") or next(iter(name.values()), "")
    return str(name or "")


def load_jsonl(path: Path):
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def main() -> None:
    if not (SDE_DIR / "blueprints.jsonl").exists():
        raise SystemExit(f"Missing SDE extract at {SDE_DIR}")

    groups = {
        row["_key"]: {
            "name": en_name(row),
            "categoryID": row.get("categoryID"),
            "published": bool(row.get("published")),
        }
        for row in load_jsonl(SDE_DIR / "groups.jsonl")
    }
    categories = {
        row["_key"]: en_name(row)
        for row in load_jsonl(SDE_DIR / "categories.jsonl")
    }

    recipes = []
    needed_types: set[int] = set()
    activity_counts = Counter()

    for bp in load_jsonl(SDE_DIR / "blueprints.jsonl"):
        activities = bp.get("activities") or {}
        for activity_name, short in (("reaction", "r"), ("manufacturing", "m")):
            act = activities.get(activity_name)
            if not act:
                continue
            products = act.get("products") or []
            materials = act.get("materials") or []
            if not products or not materials:
                continue
            time_s = int(act.get("time") or 0)
            for product in products:
                p_id = int(product["typeID"])
                p_qty = int(product["quantity"])
                mats = [[int(m["typeID"]), int(m["quantity"])] for m in materials]
                needed_types.add(p_id)
                needed_types.update(tid for tid, _ in mats)
                recipes.append(
                    {
                        "p": p_id,
                        "q": p_qty,
                        "a": short,
                        "t": time_s,
                        "m": mats,
                        "bp": int(bp.get("blueprintTypeID") or bp["_key"]),
                    }
                )
                activity_counts[activity_name] += 1

    # Load only referenced published type names + group/category.
    types = {}
    for row in load_jsonl(SDE_DIR / "types.jsonl"):
        tid = row["_key"]
        if tid not in needed_types:
            continue
        types[tid] = {
            "n": en_name(row),
            "g": row.get("groupID"),
            "pub": bool(row.get("published")),
        }

    # Attach group/category onto recipes for filtering.
    for recipe in recipes:
        info = types.get(recipe["p"], {})
        gid = info.get("g")
        recipe["g"] = gid
        recipe["c"] = groups.get(gid, {}).get("categoryID") if gid is not None else None

    # Prefer published product recipes when duplicates exist for same product.
    by_product: dict[int, list] = {}
    for recipe in recipes:
        by_product.setdefault(recipe["p"], []).append(recipe)

    deduped = []
    for pid, opts in by_product.items():
        published = [r for r in opts if types.get(pid, {}).get("pub")]
        chosen = published or opts
        # Prefer reaction over manufacturing when both somehow exist for same product.
        chosen.sort(key=lambda r: (0 if r["a"] == "r" else 1, r["bp"]))
        # Keep all distinct activity variants if materials differ (rare), else first.
        seen = set()
        for r in chosen:
            key = (r["a"], tuple((a, b) for a, b in r["m"]), r["q"], r["t"])
            if key in seen:
                continue
            seen.add(key)
            deduped.append(r)

    # Anything used as an input that is never a recipe product is a true base.
    products = {r["p"] for r in deduped}
    inputs = {tid for r in deduped for tid, _ in r["m"]}
    base_ids = sorted(inputs - products)

    names = {str(tid): types[tid]["n"] for tid in sorted(types) if tid in types and types[tid]["n"]}
    group_names = {
        str(gid): groups[gid]["name"]
        for gid in sorted({r["g"] for r in deduped if r.get("g") is not None})
        if gid in groups
    }
    category_names = {
        str(cid): categories[cid]
        for cid in sorted({r["c"] for r in deduped if r.get("c") is not None})
        if cid in categories
    }

    payload = {
        "source": "CCP EVE Online Static Data Export (JSONL)",
        "recipeCount": len(deduped),
        "reactions": activity_counts["reaction"],
        "manufacturing": activity_counts["manufacturing"],
        "typeCount": len(names),
        "baseMaterialCount": len(base_ids),
        "names": names,
        "groups": group_names,
        "categories": category_names,
        "baseIds": base_ids,
        "recipes": deduped,
    }

    OUT_JS.write_text(
        "window.EVE_INDUSTRY_SDE = "
        + json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        + ";\n",
        encoding="utf-8",
    )
    OUT_META.write_text(
        json.dumps(
            {
                "recipeCount": payload["recipeCount"],
                "reactions": payload["reactions"],
                "manufacturing": payload["manufacturing"],
                "typeCount": payload["typeCount"],
                "baseMaterialCount": payload["baseMaterialCount"],
                "jsBytes": OUT_JS.stat().st_size,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    # Spot-check the three corrected reaction formulas.
    name_to_id = {v: int(k) for k, v in names.items()}
    checks = {
        "Ceramic Powder": {"Hydrogen Fuel Block", "Evaporite Deposits", "Silicates"},
        "Carbon Polymers": {"Helium Fuel Block", "Hydrocarbons", "Silicates"},
        "Crystallite Alloy": {"Helium Fuel Block", "Cobalt", "Cadmium"},
        "Titanium Chromide": {"Oxygen Fuel Block", "Titanium", "Chromium"},
    }
    print(json.dumps(json.loads(OUT_META.read_text(encoding="utf-8")), indent=2))
    for product, expected in checks.items():
        pid = name_to_id.get(product)
        recipe = next((r for r in deduped if r["p"] == pid and r["a"] == "r"), None)
        if not recipe:
            print(f"MISSING {product}")
            continue
        got = {names[str(tid)] for tid, _ in recipe["m"]}
        ok = expected <= got
        print(f"{'OK' if ok else 'BAD'} {product}: {sorted(got)}")


if __name__ == "__main__":
    main()
