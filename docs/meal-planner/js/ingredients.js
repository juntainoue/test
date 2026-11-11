/**
 * Ingredient names, units and the quantity ledger for the use-up planner.
 *
 * Rules (docs/REQUIREMENTS.md §5):
 * - Names are normalized before totals are combined.
 * - Quantities are combined only when the unit is identical. g / ml / 個 / 丁 /
 *   玉 etc. are never converted into each other.
 * - A pack whose amount is unknown is never assumed to be any weight.
 * - Home (pantry) stock has no amount, so leftovers are never computed for it.
 */

/** Categories that should be used up within the plan. */
export const PERISHABLE_CATEGORIES = new Set(["肉・魚", "野菜", "豆腐", "乳製品"]);
/** Seasonings and staples: listed for shopping but not required to be used up. */
export const STAPLE_CATEGORIES = new Set(["調味料", "主食"]);
export const CATEGORIES = [...PERISHABLE_CATEGORIES, ...STAPLE_CATEGORIES];

/** Units a recipe may use. Purchases may additionally use PACK_UNKNOWN. */
export const UNITS = ["g", "ml", "個", "本", "玉", "丁", "片", "束", "切", "枚", "缶", "袋"];
export const PACK_UNKNOWN = "パック（量不明）";

// Common alternative spellings → the spelling used in recipes.
const ALIASES = {
  たまご: "卵",
  玉子: "卵",
  鶏卵: "卵",
  ねぎ: "長ねぎ",
  葱: "長ねぎ",
  白ねぎ: "長ねぎ",
  人参: "にんじん",
  玉葱: "玉ねぎ",
  たまねぎ: "玉ねぎ",
  じゃが芋: "じゃがいも",
  馬鈴薯: "じゃがいも",
  生姜: "しょうが",
  大蒜: "にんにく",
  茄子: "なす",
  胡瓜: "きゅうり",
  醤油: "しょうゆ",
  味噌: "みそ",
  ご飯: "米",
  ごはん: "米",
};

/** NFKC, no spaces, katakana folded to hiragana. Used only for comparison. */
export function fold(text) {
  return String(text)
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase();
}

const FOLDED_ALIASES = new Map(
  Object.entries(ALIASES).map(([from, to]) => [fold(from), to]),
);

/** Display name after alias resolution (keeps the recipe's spelling). */
export function canonicalName(name) {
  const plain = String(name).normalize("NFKC").trim().replace(/\s+/g, "");
  return FOLDED_ALIASES.get(fold(plain)) ?? plain;
}

/** Identity of an ingredient for totals: normalized name + exact unit. */
export function ingredientKey(name, unit) {
  return fold(canonicalName(name)) + "|" + unit;
}

export function nameKey(name) {
  return fold(canonicalName(name));
}

/**
 * Match free text typed by the user (pantry) to recipe ingredient names.
 * Exact = same normalized name. Suggestions = names that contain the input's
 * characters in order (e.g. 「鶏肉」→ 鶏もも肉 / 鶏むね肉). Never auto-picks a
 * suggestion: the user chooses.
 */
export function matchIngredientName(input, knownNames) {
  const target = nameKey(input);
  if (!target) return { exact: null, suggestions: [] };
  const unique = [...new Set(knownNames)];
  const exact = unique.find((n) => nameKey(n) === target) ?? null;
  if (exact) return { exact, suggestions: [] };
  const chars = [...target];
  const suggestions = unique.filter((n) => {
    const k = nameKey(n);
    let i = 0;
    for (const c of k) if (c === chars[i]) i++;
    return i === chars.length;
  });
  return { exact: null, suggestions: suggestions.slice(0, 6) };
}

/**
 * Purchase entered by the user: amount per pack, unit, number of packs.
 * Returns { status, total } where status is one of
 *   "none"     nothing entered
 *   "unknown"  pack size unknown (no total; never guessed)
 *   "mismatch" unit differs from the recipe unit (no conversion)
 *   "invalid"  amount/count not a positive number
 *   "ok"       total = amount × count in the recipe unit
 */
export function purchaseTotal(purchase, unit) {
  if (!purchase) return { status: "none", total: null };
  if (purchase.unit === PACK_UNKNOWN) return { status: "unknown", total: null };
  if (purchase.amount === undefined || purchase.amount === null || purchase.amount === "")
    return { status: "none", total: null };
  const amount = Number(purchase.amount);
  const count =
    purchase.count === undefined || purchase.count === "" ? 1 : Number(purchase.count);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(count) || count < 1)
    return { status: "invalid", total: null };
  if (purchase.unit !== unit) return { status: "mismatch", total: null };
  return { status: "ok", total: round(amount * count) };
}

export function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Totals what the plan uses, then compares it with purchases and pantry.
 *
 * @param cooks   [{ recipeId, servings }] — each cooking session
 * @param byId    Map recipeId → recipe ([name, amount, unit, category] per baseServings 1)
 * @param pantry  [{ name }] — home stock, names only
 * @param purchases { [key]: { amount, unit, count } }
 * @param pantryChoice { [key]: { mode: "unknown"|"enough"|"buy", extra } }
 * @returns items sorted for display, each with status and computed numbers.
 */
export function buildLedger({ cooks, byId, pantry = [], purchases = {}, pantryChoice = {} }) {
  const pantryNames = new Set(pantry.map((p) => nameKey(p.name)));
  const items = new Map();
  cooks.forEach((cook, cookIndex) => {
    const recipe = byId.get(cook.recipeId);
    if (!recipe) return;
    for (const [name, amount, unit, category] of recipe.ingredients) {
      const key = ingredientKey(name, unit);
      let item = items.get(key);
      if (!item) {
        item = { key, name: canonicalName(name), unit, category, needed: 0, uses: [] };
        items.set(key, item);
      }
      const used = round(amount * cook.servings);
      item.needed = round(item.needed + used);
      item.uses.push({ cookIndex, recipeId: recipe.id, amount: used });
    }
  });
  // Purchases that no dish uses any more (e.g. after a swap) stay visible.
  for (const [key, purchase] of Object.entries(purchases)) {
    if (items.has(key) || !purchase?.name) continue;
    const [, unit] = key.split("|");
    items.set(key, {
      key,
      name: purchase.name,
      unit,
      category: purchase.category ?? "その他",
      needed: 0,
      uses: [],
    });
  }
  const result = [];
  for (const item of items.values()) {
    item.perishable = PERISHABLE_CATEGORIES.has(item.category);
    item.atHome = pantryNames.has(nameKey(item.name));
    item.kind = item.atHome ? "pantry" : STAPLE_CATEGORIES.has(item.category) ? "staple" : "buy";
    const p = purchaseTotal(purchases[item.key], item.unit);
    item.purchase = p;
    if (item.kind === "pantry") {
      const choice = pantryChoice[item.key]?.mode ?? "unknown";
      item.pantryMode = choice;
      // Home stock amount is unknown: never compute leftover/shortage from it.
      item.leftover = null;
      item.shortage = null;
      item.status =
        choice === "enough"
          ? "home-enough"
          : choice === "buy"
            ? p.status === "ok"
              ? "home-plus-buy"
              : "home-buy-" + p.status
            : "home-unknown";
    } else if (p.status === "ok") {
      const diff = round(p.total - item.needed);
      item.leftover = diff >= 0 ? diff : 0;
      item.shortage = diff < 0 ? -diff : 0;
      item.status = diff < 0 ? "short" : diff === 0 ? "exact" : "leftover";
    } else {
      item.leftover = null;
      item.shortage = null;
      item.status = p.status; // none | unknown | mismatch | invalid
    }
    result.push(item);
  }
  const order = (i) => CATEGORIES.indexOf(i.category) + 1 || 99;
  return result.sort(
    (a, b) => order(a) - order(b) || a.name.localeCompare(b.name, "ja"),
  );
}

/** Items still to be bought (for the copyable list). Pantry "enough" is excluded. */
export function shoppingLines(ledger) {
  return ledger.filter(
    (i) => i.needed > 0 && !(i.kind === "pantry" && i.pantryMode === "enough"),
  );
}

/** Units counted as whole items in a shop (you cannot buy 0.05 of a leek). */
export const COUNT_UNITS = new Set(["個", "本", "片", "束", "切", "枚", "玉", "丁", "缶", "袋"]);

// Common sizes shown as one-tap choices. These are only suggestions the user
// picks from; nothing is assumed until the user taps one.
const COMMON_SIZES = {
  "肉・魚|g": [100, 150, 200, 250, 300, 400, 500],
  "野菜|g": [100, 150, 200, 300, 500],
  "豆腐|g": [150, 200, 300, 350, 400],
  "乳製品|g": [50, 100, 200],
  "ml": [200, 500, 1000],
};

/** The amount to buy when buying "just what is needed". Count units round up. */
export function exactPurchase(item) {
  return COUNT_UNITS.has(item.unit) ? Math.ceil(item.needed - 1e-9) : round(item.needed);
}

/**
 * One-tap purchase choices for a shopping row, in the item's own unit.
 * First the exact need, then up to 4 common sizes closest to the need.
 */
export function packOptions(item, limit = 4) {
  const exact = exactPurchase(item);
  const sizes = COUNT_UNITS.has(item.unit)
    ? [1, 2, 3, 4, 6, 10]
    : (COMMON_SIZES[`${item.category}|${item.unit}`] ?? COMMON_SIZES[item.unit] ?? [100, 200, 300, 500]);
  // Only sizes in a sensible range around the need (no 300g chips for 10g of ginger).
  const near = sizes
    .filter((s) => s !== exact && s >= item.needed * 0.5 && s <= Math.max(item.needed * 4, 2))
    .sort((a, b) => Math.abs(a - item.needed) - Math.abs(b - item.needed))
    .slice(0, limit)
    .sort((a, b) => a - b);
  return [{ amount: exact, exact: true }, ...near.map((amount) => ({ amount, exact: false }))];
}
