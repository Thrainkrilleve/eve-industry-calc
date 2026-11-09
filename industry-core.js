/**
 * Shared industry math + market helpers.
 * Framework-agnostic for a future Alliance Auth Django app.
 */
(function (global) {
  'use strict';

  const HUBS = {
    jita: { id: 10000002, name: 'Jita', systemId: 30000142 },
    amarr: { id: 10000043, name: 'Amarr', systemId: 30002187 },
    dodixie: { id: 10000032, name: 'Dodixie', systemId: 30002659 },
    rens: { id: 10000030, name: 'Rens', systemId: 30002510 },
    hek: { id: 10000042, name: 'Hek', systemId: 30002053 }
  };

  const STRUCTURE_PRESETS = {
    npc: {
      label: 'NPC station',
      mfgMat: 1, mfgTime: 1, rxnMat: 1, rxnTime: 1,
      roleBonus: 0, facilityTax: 0.0025
    },
    raitaru: {
      label: 'Raitaru',
      mfgMat: 0.99, mfgTime: 0.85, rxnMat: 1, rxnTime: 1,
      roleBonus: 0.03, facilityTax: 0.01
    },
    azbel: {
      label: 'Azbel',
      mfgMat: 0.99, mfgTime: 0.85, rxnMat: 1, rxnTime: 1,
      roleBonus: 0.03, facilityTax: 0.01
    },
    sotiyo: {
      label: 'Sotiyo',
      mfgMat: 0.99, mfgTime: 0.70, rxnMat: 1, rxnTime: 1,
      roleBonus: 0.03, facilityTax: 0.01
    },
    athanor: {
      label: 'Athanor',
      mfgMat: 1, mfgTime: 1, rxnMat: 1, rxnTime: 0.88,
      roleBonus: 0, facilityTax: 0.01
    },
    tatara: {
      label: 'Tatara',
      mfgMat: 1, mfgTime: 1, rxnMat: 0.99, rxnTime: 0.75,
      roleBonus: 0.03, facilityTax: 0.01
    }
  };

  function materialNeeded(baseQty, runs, me, materialMultiplier) {
    const meFactor = 1 - (Math.max(0, Math.min(10, Number(me) || 0)) / 100);
    const mult = Number(materialMultiplier);
    const mod = meFactor * (Number.isFinite(mult) ? mult : 1);
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
   * Estimated Item Value for job install fees (base quantities × adjusted price × runs).
   * ME does not reduce EIV.
   */
  function estimateEIV(recipe, runs, adjustedPrices, nameToTypeId) {
    if (!recipe) return 0;
    let eiv = 0;
    for (const inp of recipe.inputs) {
      const tid = nameToTypeId.get(inp.item.toLowerCase());
      const adj = tid != null ? Number(adjustedPrices[tid]) || 0 : 0;
      eiv += inp.qty * adj * runs;
    }
    return eiv;
  }

  /**
   * Job install fee from EIV.
   * gross = floor(EIV * SCI * (1 - roleBonus))
   * tax   = floor(EIV * (facilityTax + SCC))
   */
  function jobInstallFee(eiv, feeOpts) {
    const sci = Number(feeOpts.sci) || 0;
    const role = Math.max(0, Math.min(0.5, Number(feeOpts.roleBonus) || 0));
    const facilityTax = Math.max(0, Number(feeOpts.facilityTax) || 0);
    const scc = Math.max(0, Number(feeOpts.scc) || 0);
    const gross = Math.floor(eiv * sci * (1 - role));
    const tax = Math.floor(eiv * (facilityTax + scc));
    return { eiv, gross, tax, total: gross + tax };
  }

  function mergeMaps(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v;
    return out;
  }

  /**
   * @param {object} opts
   * @param {(name:string)=>any} opts.findRecipe
   * @param {(name:string)=>('build'|'buy')} [opts.modeFor]
   * @param {number} opts.me
   * @param {number} opts.mfgMatMult
   * @param {number} opts.rxnMatMult
   */
  function resolveRequirements(item, qtyNeeded, opts, visited = new Set()) {
    const key = item.toLowerCase();
    if (visited.has(key)) return { [item]: qtyNeeded };
    visited.add(key);

    const recipe = opts.findRecipe(item);
    const mode = opts.modeFor ? opts.modeFor(item) : 'build';
    if (!recipe || mode === 'buy') return { [item]: qtyNeeded };

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

  /**
   * Sum install fees for every Build job in the expansion tree.
   */
  function sumJobFees(item, qtyNeeded, opts, visited = new Set()) {
    const key = item.toLowerCase();
    if (visited.has(key)) return { total: 0, jobs: [] };
    visited.add(key);

    const recipe = opts.findRecipe(item);
    const mode = opts.modeFor ? opts.modeFor(item) : 'build';
    if (!recipe || mode === 'buy') return { total: 0, jobs: [] };

    const runs = jobRuns(recipe.output.qty, qtyNeeded);
    const isReaction = recipe.activity === 'r';
    const me = isReaction ? 0 : opts.me;
    const matMult = isReaction ? opts.rxnMatMult : opts.mfgMatMult;
    const sci = isReaction ? opts.rxnSci : opts.mfgSci;
    const eiv = estimateEIV(recipe, runs, opts.adjustedPrices || {}, opts.nameToTypeId || new Map());
    const fee = jobInstallFee(eiv, {
      sci,
      roleBonus: opts.roleBonus,
      facilityTax: opts.facilityTax,
      scc: opts.scc
    });

    let total = fee.total;
    const jobs = [{ item, qty: qtyNeeded, runs, activity: recipe.activity, ...fee }];

    for (const inp of recipe.inputs) {
      const needed = materialNeeded(inp.qty, runs, me, matMult);
      const sub = sumJobFees(inp.item, needed, opts, new Set(visited));
      total += sub.total;
      jobs.push(...sub.jobs);
    }
    return { total, jobs };
  }

  /**
   * Bottom-up make-vs-buy suggestions. Returns Map-like object { [itemLower]: 'build'|'buy' }.
   * Root is always build.
   */
  function optimizeMakeVsBuy(rootItem, rootQty, opts) {
    /** Only craftable intermediates appear here as build|buy. Raw mats are never listed. */
    const modes = {};
    const memo = new Map();
    const missingPrices = new Set();

    function priceOf(name, qty) {
      const p = opts.unitPrice(name);
      if (p == null || !(p > 0)) {
        missingPrices.add(name);
        return null;
      }
      return p * qty;
    }

    function costBuild(item, qty) {
      const recipe = opts.findRecipe(item);
      if (!recipe) {
        const buy = priceOf(item, qty);
        return { cost: buy == null ? Infinity : buy, mode: 'buy' };
      }

      const runs = jobRuns(recipe.output.qty, qty);
      const isReaction = recipe.activity === 'r';
      const me = isReaction ? 0 : opts.me;
      const matMult = isReaction ? opts.rxnMatMult : opts.mfgMatMult;
      const sci = isReaction ? opts.rxnSci : opts.mfgSci;

      let matCost = 0;
      for (const inp of recipe.inputs) {
        const needed = materialNeeded(inp.qty, runs, me, matMult);
        const sub = decide(inp.item, needed);
        matCost += sub.cost;
      }

      const eiv = estimateEIV(recipe, runs, opts.adjustedPrices || {}, opts.nameToTypeId || new Map());
      const fee = jobInstallFee(eiv, {
        sci,
        roleBonus: opts.roleBonus,
        facilityTax: opts.facilityTax,
        scc: opts.scc
      }).total;

      return { cost: matCost + fee, mode: 'build' };
    }

    function decide(item, qty) {
      const key = item.toLowerCase() + '|' + qty;
      if (memo.has(key)) return memo.get(key);

      const recipe = opts.findRecipe(item);
      const buy = priceOf(item, qty);

      // Raw / uncraftable: always "buy" for costing, but don't record a mode toggle.
      if (!recipe) {
        const res = { cost: buy == null ? Infinity : buy, mode: 'buy' };
        memo.set(key, res);
        return res;
      }

      const built = costBuild(item, qty);
      let res = built;
      // Prefer buy when market price is known and <= full build cost (incl. fees).
      if (buy != null && Number.isFinite(built.cost) && buy <= built.cost) {
        res = { cost: buy, mode: 'buy' };
      } else if (buy != null && !Number.isFinite(built.cost)) {
        // Build chain has missing prices; if we can buy the intermediate, do that.
        res = { cost: buy, mode: 'buy' };
      }
      modes[item.toLowerCase()] = res.mode;
      memo.set(key, res);
      return res;
    }

    const recipe = opts.findRecipe(rootItem);
    if (!recipe) {
      return { modes, missingPrices: [...missingPrices], buyCount: 0, buildCount: 0 };
    }

    const runs = jobRuns(recipe.output.qty, rootQty);
    const isReaction = recipe.activity === 'r';
    const me = isReaction ? 0 : opts.me;
    const matMult = isReaction ? opts.rxnMatMult : opts.mfgMatMult;
    for (const inp of recipe.inputs) {
      const needed = materialNeeded(inp.qty, runs, me, matMult);
      decide(inp.item, needed);
    }
    modes[rootItem.toLowerCase()] = 'build';

    let buyCount = 0;
    let buildCount = 0;
    for (const [k, v] of Object.entries(modes)) {
      if (k === rootItem.toLowerCase()) continue;
      if (v === 'buy') buyCount += 1;
      else buildCount += 1;
    }
    return { modes, missingPrices: [...missingPrices], buyCount, buildCount };
  }

  function toMultibuy(lines) {
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

  async function fetchAdjustedPrices() {
    const res = await fetch('https://esi.evetech.net/latest/markets/prices/?datasource=tranquility');
    if (!res.ok) throw new Error(`Adjusted prices failed (${res.status})`);
    const data = await res.json();
    const map = {};
    for (const row of data) {
      if (row.type_id != null) map[row.type_id] = Number(row.adjusted_price) || 0;
    }
    return map;
  }

  async function fetchSystemCostIndices(systemId) {
    const res = await fetch('https://esi.evetech.net/latest/industry/systems/?datasource=tranquility');
    if (!res.ok) throw new Error(`Industry systems failed (${res.status})`);
    const data = await res.json();
    const row = data.find((s) => s.solar_system_id === Number(systemId));
    if (!row) throw new Error(`System ${systemId} not found in ESI industry systems`);
    const out = { manufacturing: 0, reaction: 0 };
    for (const idx of row.cost_indices || []) {
      if (idx.activity === 'manufacturing') out.manufacturing = Number(idx.cost_index) || 0;
      if (idx.activity === 'reaction') out.reaction = Number(idx.cost_index) || 0;
    }
    return out;
  }

  /**
   * Invention chance:
   * base × (1 + (sci1 + sci2)/30 + encryption/40) × decryptorProbabilityMultiplier
   * Skills: pass levels for the invention's required skills; encryption is detected by name.
   */
  function inventionChance(baseChance, skillLevels, decryptorMult) {
    const base = Number(baseChance) || 0;
    const sci = (Number(skillLevels.science1) || 0) + (Number(skillLevels.science2) || 0);
    const enc = Number(skillLevels.encryption) || 0;
    const mult = Number(decryptorMult);
    const dMult = Number.isFinite(mult) && mult > 0 ? mult : 1;
    const chance = base * (1 + sci / 30 + enc / 40) * dMult;
    return Math.max(0, Math.min(1, chance));
  }

  function inventedBpcStats(baseRuns, decryptor) {
    const d = decryptor || { me: 0, te: 0, runs: 0 };
    return {
      me: Math.max(0, 2 + (Number(d.me) || 0)),
      te: Math.max(0, 4 + (Number(d.te) || 0)),
      runs: Math.max(1, (Number(baseRuns) || 1) + (Number(d.runs) || 0))
    };
  }

  /**
   * Expected invention cost for N successful BPCs (or enough runs to cover manufactureRuns).
   */
  function inventionExpectation(opts) {
    const chance = inventionChance(opts.baseChance, opts.skillLevels, opts.decryptorMult);
    const bpc = inventedBpcStats(opts.baseRuns, opts.decryptor);
    const manufactureRuns = Math.max(1, Number(opts.manufactureRuns) || 1);
    const bpcsNeeded = Math.ceil(manufactureRuns / bpc.runs);
    const expectedJobs = chance > 0 ? bpcsNeeded / chance : Infinity;
    return {
      chance,
      bpc,
      bpcsNeeded,
      expectedJobs,
      materialsPerJob: opts.materials || [],
      expectedMaterials: (opts.materials || []).map((m) => ({
        item: m.item,
        qty: m.qty * expectedJobs
      })),
      decryptorPerJob: opts.decryptorItem || null,
      expectedDecryptors: opts.decryptorItem ? expectedJobs : 0
    };
  }

  function classifyInventionSkills(skills, typeNameFn) {
    // skills: [[typeId, reqLevel], ...]
    const classified = { encryption: null, science: [] };
    for (const [tid, level] of skills || []) {
      const name = typeNameFn(tid) || '';
      const row = { id: tid, name, req: level };
      if (/encryption/i.test(name)) classified.encryption = row;
      else classified.science.push(row);
    }
    while (classified.science.length < 2) {
      classified.science.push({ id: 0, name: 'Science skill', req: 1 });
    }
    if (!classified.encryption) {
      classified.encryption = { id: 0, name: 'Encryption Methods', req: 1 };
    }
    return classified;
  }

  /**
   * Fetch all pages of structure market orders (requires ESI bearer token with
   * esi-markets.structure_markets.v1 and docking access).
   */
  async function fetchStructureOrders(structureId, accessToken) {
    if (!accessToken) throw new Error('ESI access token required for structure markets');
    const sid = Number(structureId);
    if (!Number.isFinite(sid) || sid <= 0) throw new Error('Invalid structure ID');

    const headers = { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' };
    const firstUrl = `https://esi.evetech.net/latest/markets/structures/${sid}/?datasource=tranquility&page=1`;
    const first = await fetch(firstUrl, { headers });
    if (first.status === 401 || first.status === 403) {
      throw new Error('Structure market forbidden — check token scope and docking access');
    }
    if (!first.ok) throw new Error(`Structure market failed (${first.status})`);
    const pages = Number(first.headers.get('X-Pages') || first.headers.get('x-pages') || 1);
    let orders = await first.json();
    for (let page = 2; page <= pages; page += 1) {
      const res = await fetch(
        `https://esi.evetech.net/latest/markets/structures/${sid}/?datasource=tranquility&page=${page}`,
        { headers }
      );
      if (!res.ok) throw new Error(`Structure market page ${page} failed (${res.status})`);
      const chunk = await res.json();
      orders = orders.concat(chunk);
    }
    return orders;
  }

  /** Aggregate structure orders into { typeId: { buy, sell } } for requested types (or all). */
  function aggregateStructureOrders(orders, typeIdFilter) {
    const want = typeIdFilter && typeIdFilter.length
      ? new Set(typeIdFilter.map(Number))
      : null;
    const buyMax = {};
    const sellMin = {};
    for (const o of orders || []) {
      const tid = Number(o.type_id);
      if (want && !want.has(tid)) continue;
      const price = Number(o.price) || 0;
      if (!price) continue;
      if (o.is_buy_order) {
        buyMax[tid] = Math.max(buyMax[tid] || 0, price);
      } else {
        sellMin[tid] = sellMin[tid] == null ? price : Math.min(sellMin[tid], price);
      }
    }
    const prices = {};
    const ids = new Set([...Object.keys(buyMax), ...Object.keys(sellMin)].map(Number));
    for (const tid of ids) {
      prices[tid] = { buy: buyMax[tid] || 0, sell: sellMin[tid] || 0 };
    }
    return prices;
  }

  async function fetchStructureAggregates(structureId, accessToken, typeIds) {
    const orders = await fetchStructureOrders(structureId, accessToken);
    return aggregateStructureOrders(orders, typeIds);
  }

  /** Optional: resolve structure name if token has universe.read_structures. */
  async function fetchStructureName(structureId, accessToken) {
    if (!accessToken) return null;
    const res = await fetch(
      `https://esi.evetech.net/latest/universe/structures/${Number(structureId)}/?datasource=tranquility`,
      { headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.name || null;
  }

  global.EveIndustryCore = {
    HUBS,
    STRUCTURE_PRESETS,
    materialNeeded,
    jobRuns,
    jobTimeHours,
    estimateEIV,
    jobInstallFee,
    resolveRequirements,
    sumJobFees,
    optimizeMakeVsBuy,
    mergeMaps,
    toMultibuy,
    fetchAggregates,
    fetchAdjustedPrices,
    fetchSystemCostIndices,
    inventionChance,
    inventedBpcStats,
    inventionExpectation,
    classifyInventionSkills,
    fetchStructureOrders,
    aggregateStructureOrders,
    fetchStructureAggregates,
    fetchStructureName
  };
})(window);
