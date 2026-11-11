/**
 * Use-up planner: builds a dinner plan that starts from a chosen dish, reuses
 * perishable ingredients, and re-plans against the pack sizes the user buys.
 *
 * All quantities come from buildLedger (program calculation). Text from an AI
 * never decides whether something is used up.
 */
import { buildLedger, nameKey, round } from "./ingredients.js";

export const MAX_DAYS = 7;
export const TIME_OPTIONS = [15, 20, 30, 45];

export const DEFAULT_CONDITIONS = {
  days: 3,
  maxTime: null,
  freeze: true,
  makeAhead: false,
  repeat: false,
};

export function normalizeConditions(raw = {}) {
  const days = Number(raw.days);
  const maxTime = raw.maxTime === null || raw.maxTime === "" ? null : Number(raw.maxTime);
  return {
    days: Number.isInteger(days) && days >= 1 && days <= MAX_DAYS ? days : DEFAULT_CONDITIONS.days,
    maxTime: TIME_OPTIONS.includes(maxTime) ? maxTime : null,
    freeze: raw.freeze === undefined ? DEFAULT_CONDITIONS.freeze : Boolean(raw.freeze),
    makeAhead: Boolean(raw.makeAhead),
    repeat: Boolean(raw.repeat),
  };
}

export function fitsTime(recipe, cond) {
  return cond.maxTime === null || recipe.time <= cond.maxTime;
}

// Storage notes that mean "eat it fresh" — such dishes are never made ahead.
const EAT_FRESH = /作りたて|当日中|作り置きはしない|速やかに食べ|翌日中/;

/** A dish may be cooked for two days only if its storage note allows it. */
export function canMakeAhead(recipe) {
  return recipe.source !== "ai" && !EAT_FRESH.test(recipe.storage ?? "");
}

/** cooks → one entry per day. The second day of a make-ahead cook is a leftover day. */
export function expandDays(cooks) {
  const days = [];
  cooks.forEach((cook, cookIndex) => {
    for (let k = 0; k < cook.servings; k++)
      days.push({ cookIndex, recipeId: cook.recipeId, fromMakeAhead: k > 0 });
  });
  return days;
}

export function totalDays(cooks) {
  return cooks.reduce((n, c) => n + c.servings, 0);
}

/** Deterministic random numbers so tests and "作り直す" are reproducible per seed. */
export function seededRandom(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lower is better. Weighs (in this order of importance):
 *  - hard conditions (repeat not allowed, time) — effectively forbidden
 *  - shortage / leftover against entered pack sizes (perishables only)
 *  - using the home ingredients the user asked to use
 *  - reusing perishables across dishes, with a small cost per extra item
 *    (extra items are allowed: fewer items is not the only goal)
 *  - mostly familiar dishes with an occasional new one (only when history exists)
 *  - small random noise so "作り直す" gives a different plan
 */
export function scorePlan(cooks, ctx) {
  const { byId, cond, purchases = {}, pantryUse = new Set(), pantryAll = new Set(), known = new Set(), noise } = ctx;
  let score = 0;
  const ids = cooks.map((c) => c.recipeId);
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  for (const n of counts.values())
    if (n > 1) score += cond.repeat ? 4 * (n - 1) : 1000 * (n - 1);
  cooks.forEach((c, i) => {
    const r = byId.get(c.recipeId);
    if (i > 0 && !fitsTime(r, cond)) score += 1000;
    if (c.servings > 1 && (!cond.makeAhead || !canMakeAhead(r))) score += 1000;
    if (noise) score += 0.8 * (noise.get(c.recipeId) ?? 0);
  });
  const anyPurchase = Object.keys(purchases).length > 0;
  const ledger = buildLedger({ cooks, byId, purchases });
  for (const item of ledger) {
    if (!item.perishable) continue;
    const home = pantryAll.has(nameKey(item.name));
    if (home) {
      if (pantryUse.has(nameKey(item.name)) && item.needed > 0) score -= 1;
      continue;
    }
    if (item.needed > 0) {
      score += 1;
      score -= 1.5 * (new Set(item.uses.map((u) => u.cookIndex)).size - 1);
    }
    if (item.purchase.status === "ok") {
      const total = item.purchase.total;
      score += (25 * item.leftover) / total;
      if (item.shortage > 0) score += 5 + (25 * item.shortage) / total;
    } else if (anyPurchase && item.purchase.status === "none" && item.needed > 0) {
      score += 2; // needs another purchase not on the list yet
    }
  }
  for (const key of pantryUse) {
    const used = ledger.some((i) => i.needed > 0 && nameKey(i.name) === key);
    if (!used) score += 6;
  }
  if (known.size) {
    const fresh = cooks.filter((c) => !known.has(c.recipeId)).length;
    const days = totalDays(cooks);
    const maxNew = Math.max(1, Math.floor(days / 3));
    score += 2 * Math.max(0, fresh - maxNew);
    if (days >= 3 && fresh === 0) score += 1;
  }
  return score;
}

function candidatePool(ctx) {
  return ctx.pool.filter((r) => fitsTime(r, ctx.cond));
}

function withNoise(ctx, seed) {
  const rnd = seededRandom(seed);
  const noise = new Map();
  for (const r of ctx.pool) noise.set(r.id, rnd());
  return { ...ctx, noise };
}

/** Improves a plan by trying replacements, make-ahead merges and splits. */
function improve(start, ctx, fixedAnchor) {
  let cooks = start.map((c) => ({ ...c }));
  let best = scorePlan(cooks, ctx);
  const pool = candidatePool(ctx);
  const tryPlan = (candidate) => {
    const s = scorePlan(candidate, ctx);
    if (s < best - 1e-9) {
      cooks = candidate;
      best = s;
      return true;
    }
    return false;
  };
  for (let pass = 0; pass < 30; pass++) {
    let improved = false;
    for (let j = 0; j < cooks.length && !improved; j++) {
      const anchorLocked = fixedAnchor && j === 0;
      if (!anchorLocked)
        for (const r of pool) {
          if (r.id === cooks[j].recipeId) continue;
          const next = cooks.map((c) => ({ ...c }));
          next[j].recipeId = r.id;
          if (tryPlan(next)) {
            improved = true;
            break;
          }
        }
      if (improved) break;
      if (ctx.cond.makeAhead && j + 1 < cooks.length && cooks[j].servings === 1 && cooks[j + 1].servings === 1) {
        const next = cooks.map((c) => ({ ...c }));
        next[j].servings = 2;
        next.splice(j + 1, 1);
        if (tryPlan(next)) improved = true;
      }
      if (!improved && cooks[j].servings === 2)
        for (const r of pool) {
          const next = cooks.map((c) => ({ ...c }));
          next[j].servings = 1;
          next.splice(j + 1, 0, { recipeId: r.id, servings: 1 });
          if (tryPlan(next)) {
            improved = true;
            break;
          }
        }
    }
    if (!improved) break;
  }
  return { cooks, score: best };
}

function feasibility(cooks, ctx) {
  const problems = [];
  if (totalDays(cooks) !== ctx.cond.days) problems.push("days");
  if (!ctx.cond.repeat) {
    const ids = cooks.map((c) => c.recipeId);
    if (new Set(ids).size !== ids.length) problems.push("repeat");
  }
  cooks.forEach((c, i) => {
    const r = ctx.byId.get(c.recipeId);
    if (i > 0 && !fitsTime(r, ctx.cond)) problems.push("time");
    if (c.servings > 1 && (!ctx.cond.makeAhead || !canMakeAhead(r))) problems.push("makeAhead");
  });
  return problems;
}

const CANNOT_PLAN = {
  repeat: "条件に合う料理が日数分そろわないため、同じ料理を繰り返さずに献立を作れません。日数を減らすか、「同じ料理の繰り返し」または調理時間の条件を見直してください。",
  time: "調理時間の条件に合う料理が足りません。時間の条件を見直してください。",
  days: "指定した日数分の献立を作れませんでした。",
  makeAhead: "作り置きできない料理が作り置きになりました。",
};

/**
 * Builds (or re-plans) a plan. The anchor dish stays on day 1 and is never
 * replaced. Conditions are never silently dropped: if they cannot be met the
 * result is { ok: false, message } and the caller keeps the previous plan.
 *
 * ctx: { byId, pool, cond, anchorId, purchases?, pantryUse?, pantryAll?, known? }
 * options: { seed, start } — start: existing cooks to improve (パック量で組み直す)
 */
export function buildPlan(ctx, { seed = 1, start = null } = {}) {
  const anchor = ctx.byId.get(ctx.anchorId);
  if (!anchor) return { ok: false, message: "最初に食べたい料理を選んでください。" };
  const c = withNoise(ctx, seed);
  const candidates = [];
  if (start && start[0]?.recipeId === ctx.anchorId && totalDays(start) === ctx.cond.days)
    candidates.push(improve(start, c, true));
  // Fresh greedy builds escape local optima (e.g. two days must change together
  // to use a 300g pack exactly). A few seeds; best score wins.
  let lastFailure = null;
  for (let k = 0; k < 3; k++) {
    const ck = k === 0 ? c : withNoise(ctx, seed * 31 + k);
    const greedy = greedyPlan(anchor, ck);
    if (!greedy.ok) {
      lastFailure = greedy;
      continue;
    }
    candidates.push(improve(greedy.cooks, ck, true));
  }
  const valid = candidates
    .map((r) => ({ ...r, score: scorePlan(r.cooks, c) }))
    .filter((r) => !feasibility(r.cooks, ctx).length)
    .sort((a, b) => a.score - b.score);
  if (!valid.length) {
    if (lastFailure) return lastFailure;
    const problems = candidates.length ? feasibility(candidates[0].cooks, ctx) : ["days"];
    return { ok: false, message: CANNOT_PLAN[problems[0]] };
  }
  return { ok: true, cooks: valid[0].cooks, score: valid[0].score };
}

function greedyPlan(anchor, c) {
  const cooks = [{ recipeId: anchor.id, servings: 1 }];
  const pool = candidatePool(c);
  while (totalDays(cooks) < c.cond.days) {
    const used = new Set(cooks.map((x) => x.recipeId));
    const options = pool.filter((r) => c.cond.repeat || !used.has(r.id));
    if (!options.length) {
      // Cover the remaining days by making something ahead before giving up.
      const last = cooks[cooks.length - 1];
      if (c.cond.makeAhead && last.servings === 1 && canMakeAhead(c.byId.get(last.recipeId))) {
        last.servings = 2;
        continue;
      }
      return { ok: false, message: CANNOT_PLAN.repeat };
    }
    let bestR = null;
    let bestS = Infinity;
    for (const r of options) {
      const s = scorePlan([...cooks, { recipeId: r.id, servings: 1 }], c);
      if (s < bestS) {
        bestS = s;
        bestR = r;
      }
    }
    cooks.push({ recipeId: bestR.id, servings: 1 });
  }
  return { ok: true, cooks };
}

/**
 * Alternatives for one day, best first, each with the resulting plan.
 * Only that day changes. The anchor's own day cannot be swapped here
 * (change it in Step 2). Swapping the second day of a make-ahead dish splits
 * it into two cookings. Returns { ok, options: [{ recipe, cooks }], message }.
 */
export function swapCandidates(cooks, dayIndex, ctx, limit = 6) {
  const days = expandDays(cooks);
  const day = days[dayIndex];
  if (!day) return { ok: false, options: [], message: "その日の献立が見つかりません。" };
  if (day.cookIndex === 0 && !day.fromMakeAhead)
    return {
      ok: false,
      options: [],
      message: "最初に選んだ料理は固定しています。変更する場合は、上の「食べたい料理」で選び直してください。",
    };
  const base = cooks.map((c) => ({ ...c }));
  let target = day.cookIndex;
  if (day.fromMakeAhead) {
    base[target].servings -= 1;
    base.splice(target + 1, 0, { recipeId: base[target].recipeId, servings: 1 });
    target += 1;
  }
  const current = cooks[day.cookIndex].recipeId;
  const scored = [];
  for (const r of candidatePool(ctx)) {
    if (r.id === current) continue;
    const next = base.map((c) => ({ ...c }));
    next[target].recipeId = r.id;
    if (feasibility(next, ctx).length) continue;
    scored.push({ recipe: r, cooks: next, score: scorePlan(next, ctx) });
  }
  if (!scored.length)
    return {
      ok: false,
      options: [],
      message: "条件内で交換できる別の料理がありません。条件を見直すか、献立全体を作り直してください。",
    };
  scored.sort((a, b) => a.score - b.score);
  return { ok: true, options: scored.slice(0, limit) };
}

/** Picks one of the three best alternatives for a day (used by tests / quick swap). */
export function swapDay(cooks, dayIndex, ctx, seed = 1) {
  const result = swapCandidates(cooks, dayIndex, ctx, 3);
  if (!result.ok) return { ok: false, message: result.message };
  const pick = result.options[Math.floor(seededRandom(seed)() * result.options.length)];
  return { ok: true, cooks: pick.cooks };
}

/** Problems to show next to a plan (never hidden). */
export function planWarnings(cooks, ctx) {
  const warnings = [];
  const anchor = ctx.byId.get(cooks[0]?.recipeId);
  if (anchor && !fitsTime(anchor, ctx.cond))
    warnings.push(`最初に選んだ「${anchor.name}」は約${anchor.time}分で、調理時間の条件（${ctx.cond.maxTime}分以内）を超えています。`);
  return warnings;
}

const ADVICE = {
  "肉・魚": {
    freeze:
      "1回分ずつ小分けにしてラップで包み、冷凍用の袋に入れて冷凍する。解凍は冷蔵庫で行い、再冷凍せず中心まで加熱して使う。保存できる期間は鮮度や冷凍庫の状態で変わるため、購入時の表示と状態を確認する。",
    fridge:
      "冷蔵で保存し、パックに表示された期限内に十分に加熱して使う。期限内に使えない場合は、次回の購入量を減らすか、下の候補の料理で使う。",
  },
  野菜: {
    freeze:
      "切ってから冷凍できる野菜もあるが、食感が変わりやすく、生で食べる用途には向かないことがある。加熱料理に使う。",
    fridge:
      "乾燥しないよう袋に入れて冷蔵する（常温が向く野菜もある）。傷みや変色がないか確認して使う。",
  },
  豆腐: {
    freeze:
      "冷凍すると食感が大きく変わる（すが入ったような食感）。煮物など加熱料理に使う。",
    fridge: "開封後は冷蔵し、早めに加熱調理して使う。表示の期限を確認する。",
  },
  乳製品: {
    freeze:
      "卵は殻のままの冷凍に向かず、牛乳は冷凍で分離しやすい。チーズ・バターは小分けして冷凍できるものがある。商品の表示を確認する。",
    fridge: "冷蔵で保存し、表示の期限内に使う。",
  },
};

/** Storage idea for a leftover. Never states a safe number of days. */
export function storageAdvice(item, cond) {
  const a = ADVICE[item.category];
  if (!a) return "商品の表示に従って保存する。";
  return cond.freeze ? a.freeze : a.fridge;
}

/** Dishes (not already planned) that this leftover amount alone can cover for one serving. */
export function leftoverUses(item, ctx, cooks, limit = 3) {
  if (!(item.leftover > 0)) return [];
  const planned = new Set(cooks.map((c) => c.recipeId));
  return candidatePool(ctx)
    .filter((r) => !planned.has(r.id))
    .map((r) => {
      const ing = r.ingredients.find(
        ([name, , unit]) => nameKey(name) === nameKey(item.name) && unit === item.unit,
      );
      return ing ? { recipe: r, amount: round(ing[1]) } : null;
    })
    .filter((x) => x && x.amount <= item.leftover)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}
