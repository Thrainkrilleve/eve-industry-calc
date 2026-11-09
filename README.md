# EVE Online Industry Calculator

Client-side industry planner: SDE reactions + manufacturing, invention/T2, make-vs-buy, hub & **player structure** markets, job fees.

**Live (GitHub Pages):** https://thrainkrilleve.github.io/eve-industry-calc/

## Quick start (players)

1. Open https://thrainkrilleve.github.io/eve-industry-calc/
2. **Login with EVE**
3. Optional: add alliance structure IDs for citadel market prices

Developer SSO setup (Client ID / callback) is hidden from the main UI — see [SETUP-EVE-APP.md](SETUP-EVE-APP.md) and `config.js`. Open `?dev=1` for local overrides.

## Features

- Full CCP SDE recipes (reactions + manufacturing)
- Invention / T2 (decryptors, skills, expected cost, invented ME/TE/runs)
- Selection board (click tree nodes, editable job qty)
- Make vs buy (manual Build/Buy chips + Auto, prices intermediates first)
- ME/TE + structure presets + SCI/SCC/tax job fees
- Region hubs + player structure markets (SSO or manual token)
- Multibuy export
- Multi-character SSO profile
- **Hangar** page: assets/BPs by character → location, runs-possible
- **Queue** page: industry jobs with local + EVE finish times
- Calculator shortfall: materials short + how many runs stock supports

## Files

| File | Role |
|------|------|
| `index.html` | Calculator |
| `queue.html` | Industry job queue |
| `hangar.html` | Character hangar / locations |
| `styles.css` / `app-common.js` | Shared UI + ESI cache |
| `industry-core.js` | Math + market/ESI helpers |
| `auth.js` | EVE SSO PKCE (multi-character) |
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
