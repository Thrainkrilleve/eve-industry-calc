# EVE Online Industry Calculator

Client-side industry planner: SDE reactions + manufacturing, invention/T2, make-vs-buy, hub & **player structure** markets, job fees.

**Live (GitHub Pages):** https://thrainkrilleve.github.io/eve-industry-calc/

## Quick start

1. Open the Pages URL (or `index.html` locally)
2. Create an EVE SSO app — see [SETUP-EVE-APP.md](SETUP-EVE-APP.md)
3. Paste Client ID → **Login with EVE**
4. Optional: add alliance structure IDs for citadel market prices

## Features

- Full CCP SDE recipes (reactions + manufacturing)
- Invention / T2 (decryptors, skills, expected cost, invented ME/TE/runs)
- Selection board (click tree nodes, editable job qty)
- Make vs buy (manual Build/Buy chips + Auto, prices intermediates first)
- ME/TE + structure presets + SCI/SCC/tax job fees
- Region hubs + player structure markets (SSO or manual token)
- Multibuy export

## Files

| File | Role |
|------|------|
| `index.html` | UI |
| `industry-core.js` | Math + market/ESI helpers |
| `auth.js` | EVE SSO PKCE |
| `eve-industry-data.js` | Compact SDE payload |
| `build_sde_data.py` | Rebuild SDE JS |
| `SETUP-EVE-APP.md` | How to register the EVE app |

## Rebuild SDE data

```powershell
Invoke-WebRequest -Uri "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip" -OutFile "sde\sde-latest-jsonl.zip"
Expand-Archive -Path "sde\sde-latest-jsonl.zip" -DestinationPath "sde\extracted" -Force
python build_sde_data.py
```

## Roadmap / remaining

- [ ] Invention job install fees (copy/invention SCI) more precisely
- [ ] T3 reverse engineering
- [ ] System picker for SCI (beyond hub defaults)
- [ ] Alliance Auth Django packaging (corp/alliance ACL, shared structures)
- [ ] Character blueprints / assets via ESI for real ME/TE + stock
- [ ] Shareable build URLs
