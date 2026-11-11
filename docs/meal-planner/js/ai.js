/**
 * Client side of AI recipe suggestions.
 *
 * The browser never holds an API key. It calls a backend endpoint (not built
 * yet — see docs/AI_BACKEND_PLAN.md) configured in data/ai-config.json. Every
 * recipe the backend returns is validated here by program rules; an AI's own
 * statement that a recipe is safe is never trusted on its own.
 */
import { CATEGORIES, UNITS, ingredientKey, nameKey } from "./ingredients.js";

export const AI_SCHEMA_VERSION = 1;
const TYPES = ["和食", "洋食", "中華"];
// Upper bounds per serving that catch broken numbers (e.g. 1800g of chicken).
const MAX_AMOUNT = { g: 600, ml: 1000, 個: 6, 本: 4, 玉: 2, 丁: 2, 片: 6, 束: 2, 切: 3, 枚: 30, 缶: 2, 袋: 2 };
const DONENESS = /確認|中まで|中心|完全に|火が通|火を通|固ま/;
const RAW_RISK = [
  { re: /(鶏|豚|ひき肉|挽き肉|レバー).{0,12}(生のまま|生で|レア|半生|ピンク色のまま)/, msg: "鶏肉・豚肉・ひき肉を生や半生で食べる手順があります" },
  { re: /(生のまま|生で|レア|半生).{0,12}(鶏|豚|ひき肉|挽き肉|レバー)/, msg: "鶏肉・豚肉・ひき肉を生や半生で食べる手順があります" },
  { re: /常温で(一晩|半日|放置)/, msg: "加熱後の食品を長時間常温に置く手順があります" },
];

function text(v, max) {
  return typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null;
}

/**
 * Validates one AI recipe. Returns { ok, recipe, errors } — recipe has the same
 * shape as the catalog, with source "ai", nutrition "uncalculated" (AI numbers
 * are discarded) and no image.
 */
export function validateAiRecipe(raw, cond = {}) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["レシピの形式が不正です"] };
  const name = text(raw.name, 40);
  if (!name) errors.push("料理名がありません");
  if (!TYPES.includes(raw.type)) errors.push("ジャンルが不正です");
  const time = Number(raw.time);
  if (!Number.isInteger(time) || time < 5 || time > 120) errors.push("調理時間が不正です");
  else if (cond.maxTime != null && time > cond.maxTime)
    errors.push(`調理時間（約${time}分）が条件の${cond.maxTime}分を超えています`);
  if (typeof raw.hot !== "boolean") errors.push("辛さの指定がありません");
  const ingredients = [];
  if (!Array.isArray(raw.ingredients) || raw.ingredients.length < 2 || raw.ingredients.length > 20)
    errors.push("材料の数が不正です");
  else {
    const keys = new Set();
    for (const ing of raw.ingredients) {
      const n = text(ing?.name, 30);
      const amount = Number(ing?.amount);
      const unit = ing?.unit;
      if (!n) {
        errors.push("名前のない材料があります");
        continue;
      }
      if (!UNITS.includes(unit)) errors.push(`${n}: 単位「${unit}」は扱えません`);
      else if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT[unit])
        errors.push(`${n}: 数量「${ing?.amount}${unit}」が不正です`);
      if (!CATEGORIES.includes(ing?.category)) errors.push(`${n}: 売場カテゴリが不正です`);
      const key = ingredientKey(n, unit);
      if (keys.has(key)) errors.push(`${n}: 材料が重複しています`);
      keys.add(key);
      ingredients.push([n, amount, unit, ing?.category]);
    }
  }
  const steps = Array.isArray(raw.steps) ? raw.steps.map((s) => text(s, 240)) : [];
  if (steps.length < 2 || steps.length > 12 || steps.some((s) => !s)) errors.push("手順が不正です");
  const allSteps = steps.filter(Boolean).join("");
  for (const [n, , , category] of ingredients) {
    if (!allSteps.includes(n) && !nameKey(allSteps).includes(nameKey(n)))
      errors.push(`${n}: 材料が手順に出てきません`);
    if (category === "肉・魚" || n === "卵") {
      if (!DONENESS.test(allSteps)) errors.push("肉・魚・卵の火の通りを確認する手順がありません");
    }
  }
  for (const risk of RAW_RISK) if (risk.re.test(allSteps)) errors.push(risk.msg);
  const unique = [...new Set(errors)];
  if (unique.length) return { ok: false, name: name ?? "（名前なし）", errors: unique };
  const id = "ai_" + hash(name + JSON.stringify(ingredients));
  return {
    ok: true,
    recipe: {
      id,
      source: "ai",
      name,
      type: raw.type,
      time,
      hot: raw.hot,
      kcal: null,
      protein: null,
      baseServings: 1,
      ingredients,
      steps,
      storage: "AI提案のレシピのため、保存の目安は確認されていません。作りたてを食べてください。",
      nutrition: { status: "uncalculated" },
      image: { status: "pending" },
      recipeCheck: { status: "draft", cookTested: false },
    },
  };
}

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return (h >>> 0).toString(36);
}

/** Validates a whole backend response. */
export function validateAiResponse(json, cond) {
  if (!json || json.schemaVersion !== AI_SCHEMA_VERSION || !Array.isArray(json.recipes))
    return { ok: false, recipes: [], rejected: [], message: "AIの応答形式が不正なため、提案を使えませんでした。" };
  const recipes = [];
  const rejected = [];
  for (const raw of json.recipes.slice(0, 10)) {
    const v = validateAiRecipe(raw, cond);
    if (v.ok) recipes.push(v.recipe);
    else rejected.push({ name: v.name ?? "（名前なし）", errors: v.errors });
  }
  return { ok: true, recipes, rejected };
}

/**
 * Asks the backend for new recipe ideas. Every failure becomes a message for
 * the user; nothing is retried silently and no fallback data is invented.
 */
export async function requestAiRecipes({ endpoint, cond, anchor, pantry, timeoutMs = 30000, fetchImpl = fetch }) {
  if (!endpoint)
    return {
      status: "not-configured",
      message: "AIによる新しい料理の提案は、まだ接続していません（安全なサーバー側の準備と費用の承認が必要です）。登録済みの料理から提案しています。",
      recipes: [],
      rejected: [],
    };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaVersion: AI_SCHEMA_VERSION,
        conditions: cond,
        anchor: anchor ? { name: anchor.name, ingredients: anchor.ingredients.map((i) => i[0]) } : null,
        pantry: pantry.map((p) => p.name),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    return {
      status: error?.name === "AbortError" ? "timeout" : "network",
      message:
        error?.name === "AbortError"
          ? "AIの応答に時間がかかりすぎたため中止しました。時間をおいて再度お試しください。"
          : "AIに接続できませんでした。通信状況を確認してください。",
      recipes: [],
      rejected: [],
    };
  }
  clearTimeout(timer);
  if (response.status === 429)
    return { status: "limit", message: "AIの利用上限に達しました。時間をおいて再度お試しください。", recipes: [], rejected: [] };
  if (!response.ok)
    return { status: "error", message: `AIの提案を取得できませんでした（エラー ${response.status}）。`, recipes: [], rejected: [] };
  let json;
  try {
    json = await response.json();
  } catch {
    return { status: "invalid", message: "AIの応答を読み取れませんでした。", recipes: [], rejected: [] };
  }
  const v = validateAiResponse(json, cond);
  if (!v.ok) return { status: "invalid", message: v.message, recipes: [], rejected: [] };
  return {
    status: "ok",
    message: v.recipes.length
      ? `AIの提案のうち${v.recipes.length}品が自動チェックを通過しました（人による確認・試作は未実施）。`
      : "AIの提案はすべて自動チェックで除外されました。",
    recipes: v.recipes,
    rejected: v.rejected,
  };
}
