#!/usr/bin/env python3
"""Build compact client-side industry data from CCP SDE JSONL."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SDE_DIR = ROOT / "sde" / "extracted"
OUT_JS = ROOT / "eve-industry-data.js"
OUT_META = ROOT / "eve-industry-meta.json"

DECRYPTOR_GROUP = 1304
ATTR_P = 1112  # inventionPropabilityMultiplier
ATTR_ME = 1113  # inventionMEModifier
ATTR_TE = 1114  # inventionTEModifier
ATTR_RUNS = 1124  # inventionMaxRunModifier


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
    inventions = []
    needed_types: set[int] = set()
    activity_counts = Counter()
    bp_to_product: dict[int, int] = {}

    for bp in load_jsonl(SDE_DIR / "blueprints.jsonl"):
        activities = bp.get("activities") or {}
        bp_id = int(bp.get("blueprintTypeID") or bp["_key"])
        needed_types.add(bp_id)

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
                        "bp": bp_id,
                    }
                )
                activity_counts[activity_name] += 1
                if short == "m" and bp_id not in bp_to_product:
                    bp_to_product[bp_id] = p_id

        inv = activities.get("invention")
        if inv and inv.get("products") and inv.get("materials"):
            mats = [[int(m["typeID"]), int(m["quantity"])] for m in inv["materials"]]
            skills = [
                [int(s["typeID"]), int(s["level"])]
                for s in (inv.get("skills") or [])
            ]
            needed_types.update(tid for tid, _ in mats)
            needed_types.update(tid for tid, _ in skills)
            for product in inv["products"]:
                out_bp = int(product["typeID"])
                needed_types.add(out_bp)
                inventions.append(
                    {
                        "src": bp_id,
                        "out": out_bp,
                        "chance": float(product.get("probability") or 0),
                        "q": int(product.get("quantity") or 1),
                        "t": int(inv.get("time") or 0),
                        "m": mats,
                        "skills": skills,
                    }
                )
                activity_counts["invention"] += 1

    # Decryptor dogma (group 1304).
    decryptor_ids: set[int] = set()
    type_meta_raw = {}
    for row in load_jsonl(SDE_DIR / "types.jsonl"):
        tid = row["_key"]
        gid = row.get("groupID")
        type_meta_raw[tid] = {
            "n": en_name(row),
            "g": gid,
            "pub": bool(row.get("published")),
        }
        if gid == DECRYPTOR_GROUP and row.get("published"):
            decryptor_ids.add(tid)
            needed_types.add(tid)

    dogma_by_type: dict[int, dict[int, float]] = {}
    for row in load_jsonl(SDE_DIR / "typeDogma.jsonl"):
        tid = row["_key"]
        if tid not in decryptor_ids:
            continue
        attrs = {}
        for a in row.get("dogmaAttributes") or []:
            attrs[int(a["attributeID"])] = float(a.get("value") or 0)
        dogma_by_type[tid] = attrs

    decryptors = []
    for tid in sorted(decryptor_ids):
        attrs = dogma_by_type.get(tid, {})
        decryptors.append(
            {
                "id": tid,
                "n": type_meta_raw[tid]["n"],
                "p": attrs.get(ATTR_P, 1.0),
                "me": int(attrs.get(ATTR_ME, 0)),
                "te": int(attrs.get(ATTR_TE, 0)),
                "runs": int(attrs.get(ATTR_RUNS, 0)),
            }
        )

    # Load only referenced type names + group/category.
    types = {
        tid: type_meta_raw[tid]
        for tid in needed_types
        if tid in type_meta_raw
    }

    for recipe in recipes:
        info = types.get(recipe["p"], {})
        gid = info.get("g")
        recipe["g"] = gid
        recipe["c"] = groups.get(gid, {}).get("categoryID") if gid is not None else None

    by_product: dict[int, list] = {}
    for recipe in recipes:
        by_product.setdefault(recipe["p"], []).append(recipe)

    deduped = []
    for pid, opts in by_product.items():
        published = [r for r in opts if types.get(pid, {}).get("pub")]
        chosen = published or opts
        chosen.sort(key=lambda r: (0 if r["a"] == "r" else 1, r["bp"]))
        seen = set()
        for r in chosen:
            key = (r["a"], tuple((a, b) for a, b in r["m"]), r["q"], r["t"])
            if key in seen:
                continue
            seen.add(key)
            deduped.append(r)

    products = {r["p"] for r in deduped}
    inputs = {tid for r in deduped for tid, _ in r["m"]}
    base_ids = sorted(inputs - products)

    # Invention index: invented blueprint -> manufactured item (+ ship/rig flag for runs).
    inv_links = []
    for inv in inventions:
        out_bp = inv["out"]
        product_id = bp_to_product.get(out_bp)
        if not product_id:
            continue
        info = types.get(product_id, {})
        gid = info.get("g")
        cid = groups.get(gid, {}).get("categoryID") if gid is not None else None
        gname = groups.get(gid, {}).get("name") or ""
        # Ships (cat 6) and rigs get 1 base run; everything else 10.
        base_runs = 1 if cid == 6 or "Rig" in gname else 10
        inv_links.append(
            {
                **inv,
                "item": product_id,
                "baseRuns": base_runs,
                "g": gid,
                "c": cid,
            }
        )

    names = {
        str(tid): types[tid]["n"]
        for tid in sorted(types)
        if tid in types and types[tid]["n"]
    }
    group_names = {
        str(gid): groups[gid]["name"]
        for gid in sorted(
            {r["g"] for r in deduped if r.get("g") is not None}
            | {i["g"] for i in inv_links if i.get("g") is not None}
        )
        if gid in groups
    }
    category_names = {
        str(cid): categories[cid]
        for cid in sorted(
            {r["c"] for r in deduped if r.get("c") is not None}
            | {i["c"] for i in inv_links if i.get("c") is not None}
        )
        if cid in categories
    }

    payload = {
        "source": "CCP EVE Online Static Data Export (JSONL)",
        "recipeCount": len(deduped),
        "reactions": activity_counts["reaction"],
        "manufacturing": activity_counts["manufacturing"],
        "inventionCount": len(inv_links),
        "decryptorCount": len(decryptors),
        "typeCount": len(names),
        "baseMaterialCount": len(base_ids),
        "names": names,
        "groups": group_names,
        "categories": category_names,
        "baseIds": base_ids,
        "recipes": deduped,
        "inventions": inv_links,
        "decryptors": decryptors,
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
                "inventionCount": payload["inventionCount"],
                "decryptorCount": payload["decryptorCount"],
                "typeCount": payload["typeCount"],
                "baseMaterialCount": payload["baseMaterialCount"],
                "jsBytes": OUT_JS.stat().st_size,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

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
        print(f"{'OK' if expected <= got else 'BAD'} {product}: {sorted(got)}")

    hawk = name_to_id.get("Hawk")
    hawk_inv = [i for i in inv_links if i["item"] == hawk]
    print(f"Hawk invention paths: {len(hawk_inv)} decryptors: {len(decryptors)}")
    if hawk_inv:
        print(" sample", hawk_inv[0])


if __name__ == "__main__":
    main()
