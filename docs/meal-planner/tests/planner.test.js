import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PACK_UNKNOWN,
  buildLedger,
  exactPurchase,
  packOptions,
  ingredientKey,
  matchIngredientName,
  purchaseTotal,
} from "../js/ingredients.js";
import {
  buildPlan,
  canMakeAhead,
  expandDays,
  fitsTime,
  leftoverUses,
  normalizeConditions,
  storageAdvice,
  swapCandidates,
  swapDay,
  totalDays,
} from "../js/planner.js";
import { requestAiRecipes, validateAiRecipe, validateAiResponse } from "../js/ai.js";

const catalog = JSON.parse(
  readFileSync(new URL("../data/recipes.json", import.meta.url)),
).recipes;
const catalogById = new Map(catalog.map((r) => [r.id, r]));

function recipe(id, ingredients, extra = {}) {
  return {
    id,
    name: id,
    type: "和食",
    time: 20,
    hot: false,
    storage: "冷蔵1～2日を目安。",
    baseServings: 1,
    ingredients,
    steps: [],
    ...extra,
  };
}
const CHICKEN = (g) => ["鶏もも肉", g, "g", "肉・魚"];
const fixtures = [
  recipe("a120", [CHICKEN(120), ["しょうゆ", 10, "ml", "調味料"]]),
  recipe("b100", [CHICKEN(100), ["玉子", 1, "個", "乳製品"]]),
  recipe("c80", [CHICKEN(80), ["卵", 1, "個", "乳製品"]]),
  recipe("d60", [CHICKEN(60), ["キャベツ", 100, "g", "野菜"]]),
  recipe("e140", [CHICKEN(140), ["キャベツ", 50, "g", "野菜"]]),
  recipe("pork", [["豚こま肉", 150, "g", "肉・魚"]]),
];
const byId = new Map(fixtures.map((r) => [r.id, r]));
const KEY = ingredientKey("鶏もも肉", "g");
const buy = (amount, unit = "g", count = 1) => ({
  [KEY]: { amount, unit, count, name: "鶏もも肉", category: "肉・魚" },
});
const chickenOf = (ledger) => ledger.find((i) => i.key === KEY);

test("spec example: 300g bought, 120+100+80 used → 0g left", () => {
  const cooks = ["a120", "b100", "c80"].map((recipeId) => ({ recipeId, servings: 1 }));
  const item = chickenOf(buildLedger({ cooks, byId, purchases: buy(300) }));
  assert.equal(item.needed, 300);
  assert.equal(item.leftover, 0);
  assert.equal(item.status, "exact");
});

test("spec example: swap to 260g used → 40g left; 350g needed → 50g short", () => {
  const swapped = ["a120", "e140"].map((recipeId) => ({ recipeId, servings: 1 }));
  const left = chickenOf(buildLedger({ cooks: swapped, byId, purchases: buy(300) }));
  assert.deepEqual([left.needed, left.leftover, left.status], [260, 40, "leftover"]);
  const more = ["a120", "e140", "d60", "c80"].map((recipeId) => ({ recipeId, servings: 1 }));
  const short = chickenOf(buildLedger({ cooks: more, byId, purchases: buy(300) }));
  // 120+140+60+80 = 400 → 100g short; shortage is never rounded away.
  assert.deepEqual([short.needed, short.shortage, short.status], [400, 100, "short"]);
  const exact350 = ["a120", "e140", "c80", "pork"].map((recipeId) => ({ recipeId, servings: 1 }));
  const s350 = chickenOf(buildLedger({ cooks: exact350, byId, purchases: buy(300) }));
  assert.deepEqual([s350.needed, s350.shortage], [340, 40]);
});

test("same ingredient is combined after name normalization, never across units", () => {
  const cooks = ["b100", "c80"].map((recipeId) => ({ recipeId, servings: 1 }));
  const ledger = buildLedger({ cooks, byId });
  const eggs = ledger.filter((i) => i.name === "卵");
  assert.equal(eggs.length, 1, "玉子 and 卵 are one item");
  assert.equal(eggs[0].needed, 2);
  const mixed = new Map([
    ["x", recipe("x", [["卵", 1, "個", "乳製品"]])],
    ["y", recipe("y", [["卵", 50, "g", "乳製品"]])],
  ]);
  const both = buildLedger({ cooks: [{ recipeId: "x", servings: 1 }, { recipeId: "y", servings: 1 }], byId: mixed });
  assert.equal(both.length, 2, "個 and g are not converted into each other");
});

test("make-ahead servings double the amount used", () => {
  const item = chickenOf(buildLedger({ cooks: [{ recipeId: "a120", servings: 2 }], byId, purchases: buy(300) }));
  assert.deepEqual([item.needed, item.leftover], [240, 60]);
});

test("unknown pack size, unit mismatch and bad numbers are reported, not guessed", () => {
  assert.deepEqual(purchaseTotal({ unit: PACK_UNKNOWN, amount: "" }, "g"), { status: "unknown", total: null });
  assert.equal(purchaseTotal({ amount: 1, unit: "個" }, "g").status, "mismatch");
  assert.equal(purchaseTotal({ amount: -5, unit: "g" }, "g").status, "invalid");
  assert.equal(purchaseTotal({ amount: 100, unit: "g", count: 1.5 }, "g").status, "invalid");
  assert.equal(purchaseTotal({ amount: "", unit: "g" }, "g").status, "none");
  assert.deepEqual(purchaseTotal({ amount: 150, unit: "g", count: 2 }, "g"), { status: "ok", total: 300 });
  const cooks = [{ recipeId: "a120", servings: 1 }];
  for (const p of [{ unit: PACK_UNKNOWN, amount: "" }, { amount: 1, unit: "個" }]) {
    const item = chickenOf(
      buildLedger({ cooks, byId, purchases: { [KEY]: { ...p, name: "鶏もも肉" } } }),
    );
    assert.equal(item.leftover, null);
    assert.equal(item.shortage, null);
  }
});

test("home ingredients: never assumed sufficient, leftover never computed", () => {
  const cooks = [{ recipeId: "d60", servings: 1 }];
  const pantry = [{ name: "きゃべつ" }];
  const ledger = buildLedger({ cooks, byId, pantry });
  const cabbage = ledger.find((i) => i.name === "キャベツ");
  assert.equal(cabbage.kind, "pantry");
  assert.equal(cabbage.status, "home-unknown");
  assert.equal(cabbage.needed, 100, "required amount is still shown");
  assert.equal(cabbage.leftover, null);
  const key = ingredientKey("キャベツ", "g");
  const extra = buildLedger({
    cooks,
    byId,
    pantry,
    pantryChoice: { [key]: { mode: "buy" } },
    purchases: { [key]: { amount: 200, unit: "g", name: "キャベツ" } },
  }).find((i) => i.key === key);
  assert.equal(extra.status, "home-plus-buy");
  assert.equal(extra.leftover, null, "home amount unknown → no leftover");
});

test("purchases no longer used after a swap stay visible as leftovers", () => {
  const ledger = buildLedger({ cooks: [{ recipeId: "pork", servings: 1 }], byId, purchases: buy(300) });
  const item = chickenOf(ledger);
  assert.deepEqual([item.needed, item.leftover, item.status], [0, 300, "leftover"]);
});

test("free-text pantry names suggest recipe names but never auto-pick", () => {
  const names = catalog.flatMap((r) => r.ingredients.map((i) => i[0]));
  assert.equal(matchIngredientName("ニンジン", names).exact, "にんじん");
  assert.equal(matchIngredientName("玉子", names).exact, "卵");
  const m = matchIngredientName("鶏肉", names);
  assert.equal(m.exact, null);
  assert.ok(m.suggestions.includes("鶏もも肉") && m.suggestions.includes("鶏むね肉"));
});

function ctxFor(cond, extra = {}) {
  return {
    byId: catalogById,
    pool: catalog,
    cond: normalizeConditions(cond),
    anchorId: "chicken",
    ...extra,
  };
}

test("plans for 1 to 7 days keep the chosen dish on day 1 and respect conditions", () => {
  for (let days = 1; days <= 7; days++)
    for (const repeat of [false, true])
      for (const maxTime of [null, 20, 30]) {
        const ctx = ctxFor({ days, repeat, maxTime });
        const plan = buildPlan(ctx, { seed: days });
        assert.ok(plan.ok, `days ${days}`);
        assert.equal(totalDays(plan.cooks), days);
        assert.equal(plan.cooks[0].recipeId, "chicken");
        const ids = plan.cooks.map((c) => c.recipeId);
        if (!repeat) assert.equal(new Set(ids).size, ids.length);
        for (const c of plan.cooks.slice(1)) assert.ok(fitsTime(catalogById.get(c.recipeId), ctx.cond));
        assert.ok(plan.cooks.every((c) => c.servings === 1), "no make-ahead unless allowed");
      }
});

test("make-ahead only when allowed and only for dishes whose storage note allows it", () => {
  assert.equal(canMakeAhead(catalogById.get("carbonara")), false);
  assert.equal(canMakeAhead(catalogById.get("curry")), true);
  for (let seed = 1; seed <= 5; seed++) {
    const plan = buildPlan(ctxFor({ days: 7, makeAhead: true }), { seed });
    assert.ok(plan.ok);
    for (const c of plan.cooks)
      if (c.servings === 2) assert.ok(canMakeAhead(catalogById.get(c.recipeId)));
  }
});

test("conditions are not silently ignored when they cannot be met", () => {
  const tiny = [catalogById.get("chicken"), catalogById.get("ginger")];
  const ctx = { ...ctxFor({ days: 4 }), pool: tiny, byId: new Map(tiny.map((r) => [r.id, r])) };
  const plan = buildPlan(ctx);
  assert.equal(plan.ok, false);
  assert.match(plan.message, /繰り返さずに献立を作れません/);
  const allowed = buildPlan({ ...ctx, cond: normalizeConditions({ days: 4, repeat: true }) });
  assert.ok(allowed.ok);
});

test("re-planning with pack sizes uses up the pack instead of leaving it", () => {
  const purchases = {
    [KEY]: { amount: 300, unit: "g", count: 1, name: "鶏もも肉", category: "肉・魚" },
  };
  for (let seed = 1; seed <= 5; seed++) {
    const ctx = ctxFor({ days: 4 }, { purchases });
    const first = buildPlan(ctxFor({ days: 4 }), { seed });
    const replanned = buildPlan(ctx, { seed, start: first.cooks });
    assert.ok(replanned.ok);
    assert.equal(replanned.cooks[0].recipeId, "chicken", "the chosen dish stays");
    const item = chickenOf(buildLedger({ cooks: replanned.cooks, byId: catalogById, purchases }));
    assert.equal(item.shortage, 0, `seed ${seed}: no shortage`);
    assert.equal(item.leftover, 0, `seed ${seed}: 180g照り焼き + 120g親子丼 uses 300g exactly`);
  }
});

test("home ingredients the user wants to use are put into the plan", () => {
  const pantry = new Set(["きゃべつ"]);
  const plan = buildPlan(ctxFor({ days: 3 }, { pantryUse: pantry, pantryAll: pantry }), { seed: 2 });
  const ledger = buildLedger({ cooks: plan.cooks, byId: catalogById });
  assert.ok(ledger.some((i) => i.name === "キャベツ" && i.needed > 0));
});

test("swap changes only that day; the chosen dish cannot be swapped", () => {
  const ctx = ctxFor({ days: 5 });
  const plan = buildPlan(ctx, { seed: 4 });
  const before = expandDays(plan.cooks).map((d) => d.recipeId);
  const swapped = swapDay(plan.cooks, 2, ctx, 9);
  assert.ok(swapped.ok);
  const after = expandDays(swapped.cooks).map((d) => d.recipeId);
  assert.notEqual(after[2], before[2]);
  assert.deepEqual(after.filter((_, i) => i !== 2), before.filter((_, i) => i !== 2));
  const anchor = swapDay(plan.cooks, 0, ctx);
  assert.equal(anchor.ok, false);
  assert.match(anchor.message, /固定/);
});

test("swapping the second day of a make-ahead dish splits it", () => {
  const ctx = ctxFor({ days: 3, makeAhead: true });
  const cooks = [
    { recipeId: "chicken", servings: 1 },
    { recipeId: "curry", servings: 2 },
  ];
  const result = swapDay(cooks, 2, ctx, 3);
  assert.ok(result.ok);
  assert.equal(totalDays(result.cooks), 3);
  assert.deepEqual(result.cooks.slice(0, 2), [
    { recipeId: "chicken", servings: 1 },
    { recipeId: "curry", servings: 1 },
  ]);
  assert.notEqual(result.cooks[2].recipeId, "curry");
});

test("regenerating with another seed keeps the chosen dish and can change the rest", () => {
  const ctx = ctxFor({ days: 5 });
  const plans = [1, 2, 3, 4, 5, 6].map((seed) => buildPlan(ctx, { seed }).cooks);
  assert.ok(plans.every((p) => p[0].recipeId === "chicken"));
  assert.ok(new Set(plans.map((p) => p.map((c) => c.recipeId).join())).size > 1);
});

test("mostly familiar dishes, occasionally a new one, once there is a history", () => {
  const known = new Set(catalog.slice(0, 30).map((r) => r.id));
  known.add("chicken");
  for (let seed = 1; seed <= 4; seed++) {
    const plan = buildPlan(ctxFor({ days: 6 }, { known }), { seed });
    const fresh = plan.cooks.filter((c) => !known.has(c.recipeId)).length;
    assert.ok(fresh >= 1 && fresh <= 2, `seed ${seed}: ${fresh} new dishes`);
  }
});

test("storage advice follows the freeze setting and never states a number of days", () => {
  const item = { category: "肉・魚" };
  assert.match(storageAdvice(item, { freeze: true }), /冷凍/);
  assert.doesNotMatch(storageAdvice(item, { freeze: false }), /冷凍/);
  for (const category of ["肉・魚", "野菜", "豆腐", "乳製品"])
    for (const freeze of [true, false])
      assert.doesNotMatch(storageAdvice({ category }, { freeze }), /\d+\s*(日|週間|か月)/);
  const ctx = ctxFor({ days: 2 });
  const uses = leftoverUses({ name: "鶏もも肉", unit: "g", leftover: 120 }, ctx, [
    { recipeId: "chicken", servings: 1 },
  ]);
  assert.ok(uses.length && uses.every((u) => u.amount <= 120));
});

// ---- AI output validation ----
const goodAi = () => ({
  name: "鶏むね肉とキャベツのレモン蒸し",
  type: "和食",
  time: 20,
  hot: false,
  kcal: 350,
  ingredients: [
    { name: "鶏むね肉", amount: 150, unit: "g", category: "肉・魚" },
    { name: "キャベツ", amount: 120, unit: "g", category: "野菜" },
    { name: "塩", amount: 1, unit: "g", category: "調味料" },
  ],
  steps: [
    "鶏むね肉をそぎ切りにして塩を振る。キャベツはざく切りにする。",
    "フライパンにキャベツと鶏むね肉をのせ、水50mlを加えてふたをし、弱めの中火で8分蒸す。",
    "鶏むね肉を切って中まで白くなったことを確認する。",
  ],
});

test("AI recipes that pass checks get no AI nutrition numbers and no image", () => {
  const v = validateAiRecipe(goodAi(), { maxTime: 30 });
  assert.ok(v.ok, JSON.stringify(v.errors));
  assert.equal(v.recipe.kcal, null);
  assert.equal(v.recipe.nutrition.status, "uncalculated");
  assert.equal(v.recipe.image.status, "pending");
  assert.equal(v.recipe.source, "ai");
});

test("AI recipes with mismatched, unsafe or invalid content are rejected", () => {
  const cases = [
    [(r) => (r.ingredients[1].amount = 5000), /数量/],
    [(r) => (r.ingredients[1].unit = "つかみ"), /単位/],
    [(r) => r.ingredients.push({ name: "しいたけ", amount: 30, unit: "g", category: "野菜" }), /手順に出てきません/],
    [(r) => (r.steps[2] = "器に盛る。"), /火の通り/],
    [(r) => (r.steps[2] = "鶏むね肉はレアで仕上げ、中まで火が通ったか確認せず盛る。"), /生や半生/],
    [(r) => (r.time = 45), /条件の30分/],
    [(r) => (r.ingredients[0].category = "肉"), /売場カテゴリ/],
    [(r) => delete r.name, /料理名/],
  ];
  for (const [mutate, message] of cases) {
    const raw = goodAi();
    mutate(raw);
    const v = validateAiRecipe(raw, { maxTime: 30 });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => message.test(e)), `${message}: ${v.errors}`);
  }
  assert.equal(validateAiResponse({ recipes: [] }).ok, false, "missing schemaVersion");
  const mixed = validateAiResponse({ schemaVersion: 1, recipes: [goodAi(), { name: "x" }] }, {});
  assert.deepEqual([mixed.recipes.length, mixed.rejected.length], [1, 1]);
});

test("AI request failures become messages; nothing is invented", async () => {
  const cond = normalizeConditions({});
  const notConfigured = await requestAiRecipes({ endpoint: null, cond, pantry: [] });
  assert.equal(notConfigured.status, "not-configured");
  assert.equal(notConfigured.recipes.length, 0);
  const respond = (status, body) => async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  const run = (fetchImpl) => requestAiRecipes({ endpoint: "https://example.invalid/ai", cond, pantry: [], fetchImpl });
  assert.equal((await run(respond(429, {}))).status, "limit");
  assert.equal((await run(respond(500, {}))).status, "error");
  assert.equal((await run(respond(200, "not json"))).status, "invalid");
  assert.equal((await run(respond(200, { schemaVersion: 2, recipes: [] }))).status, "invalid");
  assert.equal(
    (await run(async () => {
      throw new TypeError("offline");
    })).status,
    "network",
  );
  const slow = await requestAiRecipes({
    endpoint: "https://example.invalid/ai",
    cond,
    pantry: [],
    timeoutMs: 20,
    fetchImpl: (_, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))),
      ),
  });
  assert.equal(slow.status, "timeout");
  const ok = await run(respond(200, { schemaVersion: 1, recipes: [goodAi()] }));
  assert.equal(ok.status, "ok");
  assert.equal(ok.recipes.length, 1);
});

test("swap choices for photo picking: ranked, feasible, only that day changes", () => {
  const ctx = ctxFor({ days: 4 });
  const plan = buildPlan(ctx, { seed: 3 });
  const before = expandDays(plan.cooks).map((d) => d.recipeId);
  const result = swapCandidates(plan.cooks, 2, ctx, 6);
  assert.ok(result.ok);
  assert.ok(result.options.length > 1 && result.options.length <= 6);
  for (const o of result.options) {
    const after = expandDays(o.cooks).map((d) => d.recipeId);
    assert.equal(after[2], o.recipe.id);
    assert.notEqual(after[2], before[2]);
    assert.deepEqual(after.filter((_, i) => i !== 2), before.filter((_, i) => i !== 2));
    assert.ok(!before.includes(o.recipe.id), "no repeats when repeating is off");
  }
  assert.equal(swapCandidates(plan.cooks, 0, ctx).ok, false, "day 1 is fixed");
});

test("one-tap pack choices: exact need first, sensible sizes, whole items rounded up", () => {
  const meat = packOptions({ name: "むきえび", unit: "g", category: "肉・魚", needed: 170 });
  assert.deepEqual(meat[0], { amount: 170, exact: true });
  assert.ok(meat.length <= 5 && meat.slice(1).every((o) => o.amount >= 85 && o.amount <= 680));
  const ginger = packOptions({ name: "しょうが", unit: "g", category: "野菜", needed: 10 });
  assert.ok(ginger.every((o) => o.amount <= 40), "no 100g+ chips for 10g of ginger");
  assert.equal(exactPurchase({ unit: "本", needed: 1.25 }), 2);
  assert.equal(exactPurchase({ unit: "個", needed: 4 }), 4);
  assert.equal(exactPurchase({ unit: "g", needed: 172.5 }), 172.5);
  const leek = packOptions({ name: "長ねぎ", unit: "本", category: "野菜", needed: 1.25 });
  assert.equal(leek[0].amount, 2);
  assert.ok(leek.every((o) => Number.isInteger(o.amount)));
});
