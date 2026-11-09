/**
 * Shared industry math + market helpers.
 * Kept framework-agnostic so it can move into an Alliance Auth Django app later.
 */
(function (global) {
  'use strict';

  const HUBS = {
    jita: { id: 10000002, name: 'Jita' },
    amarr: { id: 10000043, name: 'Amarr' },
    dodixie: { id: 10000032, name: 'Dodixie' },
    rens: { id: 10000030, name: 'Rens' },
    hek: { id: 10000042, name: 'Hek' }
  };

  const STRUCTURE_PRESETS = {
    npc: { label: 'NPC station', mfgMat: 1, mfgTime: 1, rxnMat: 1, rxnTime: 1 },
    raitaru: { label: 'Raitaru', mfgMat: 0.99, mfgTime: 0.85, rxnMat: 1, rxnTime: 1 },
    azbel: { label: 'Azbel', mfgMat: 0.99, mfgTime: 0.85, rxnMat: 1, rxnTime: 1 },
    sotiyo: { label: 'Sotiyo', mfgMat: 0.99, mfgTime: 0.70, rxnMat: 1, rxnTime: 1 },
    athanor: { label: 'Athanor', mfgMat: 1, mfgTime: 1, rxnMat: 1, rxnTime: 0.88 },
    tatara: { label: 'Tatara', mfgMat: 1, mfgTime: 1, rxnMat: 0.99, rxnTime: 0.75 }
  };

  function materialNeeded(baseQty, runs, me, materialMultiplier) {
    const meFactor = 1 - (Math.max(0, Math.min(10, Number(me) || 0)) / 100);
    const mult = Number(materialMultiplier);
    const mod = meFactor * (Number.isFinite(mult) ? mult : 1);
    // CCP: max(runs, ceil(round(base * runs * modifiers, 2)))
    return Math.max(runs, Math.ceil(Number((baseQty * runs * mod).toFixed(2))));
  }

  function jobRuns(outputQty, needed) {
    return Math.ceil(needed / Math.max(1, outputQty));
  }

  function jobTimeHours(baseHours, runs, te, timeMultiplier) {
    const teFactor = 1 - (Math.max(0, Math.min(20, Number(te) || 0)) / 100);
    const mult = Number(timeMultiplier);
    const mod = teFactor * (Number.isFinite(mult) ? mult : 1);
    return runs * baseHours * mod;
  }

  /**
   * @param {object} opts
   * @param {(name:string)=>any} opts.findRecipe
   * @param {number} opts.me
   * @param {number} opts.mfgMatMult
   * @param {number} opts.rxnMatMult
   */
  function resolveRequirements(item, qtyNeeded, opts, visited = new Set()) {
    const key = item.toLowerCase();
    if (visited.has(key)) return { [item]: qtyNeeded };
    visited.add(key);

    const recipe = opts.findRecipe(item);
    if (!recipe) return { [item]: qtyNeeded };

    const runs = jobRuns(recipe.output.qty, qtyNeeded);
    const isReaction = recipe.activity === 'r';
    const me = isReaction ? 0 : opts.me;
    const matMult = isReaction ? opts.rxnMatMult : opts.mfgMatMult;

    const result = {};
    for (const inp of recipe.inputs) {
      const needed = materialNeeded(inp.qty, runs, me, matMult);
      const sub = resolveRequirements(inp.item, needed, opts, new Set(visited));
      for (const [k, v] of Object.entries(sub)) {
        result[k] = (result[k] || 0) + v;
      }
    }
    return result;
  }

  function mergeMaps(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v;
    return out;
  }

  function toMultibuy(lines) {
    // EVE multibuy accepts "Item Name<TAB>Qty" or "Qty Item Name"
    return lines
      .map(({ item, qty }) => `${item}\t${Math.round(qty)}`)
      .join('\n');
  }

  async function fetchAggregates(typeIds, regionId) {
    const unique = [...new Set(typeIds.filter((id) => Number.isFinite(id) && id > 0))];
    const prices = {};
    const chunkSize = 200;
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize);
      const url =
        `https://market.fuzzwork.co.uk/aggregates/?region=${regionId}&types=${chunk.join(',')}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Market fetch failed (${res.status})`);
      const data = await res.json();
      for (const [tid, row] of Object.entries(data)) {
        const buy = Number(row?.buy?.max) || 0;
        const sell = Number(row?.sell?.min) || 0;
        prices[tid] = { buy, sell };
      }
    }
    return prices;
  }

  global.EveIndustryCore = {
    HUBS,
    STRUCTURE_PRESETS,
    materialNeeded,
    jobRuns,
    jobTimeHours,
    resolveRequirements,
    mergeMaps,
    toMultibuy,
    fetchAggregates
  };
})(window);
