/**
 * UI for the use-up planner (使い切り計画). Separate storage key so the
 * existing plan (gohan-keikaku-v1) and favorites are never touched.
 */
import {
  COUNT_UNITS,
  PACK_UNKNOWN,
  exactPurchase,
  packOptions,
  buildLedger,
  matchIngredientName,
  nameKey,
  round,
  shoppingLines,
} from "./ingredients.js";
import {
  buildPlan,
  canMakeAhead,
  expandDays,
  fitsTime,
  leftoverUses,
  normalizeConditions,
  planWarnings,
  storageAdvice,
  swapCandidates,
} from "./planner.js";
import { requestAiRecipes, validateAiRecipe } from "./ai.js";
import { dishImage } from "./images.js";

export const USEKIRI_KEY = "gohan-keikaku-usekiri-v1";
export const HISTORY_KEY = "gohan-keikaku-history-v1";

export function mountUsekiri({ recipes, getFavorites, detail, el, makeBtn, qty, dateLabel }) {
  const $ = (id) => document.getElementById(id);
  const catalogById = new Map(recipes.map((r) => [r.id, r]));
  let aiRecipes = [];
  let byId = new Map(catalogById);
  let aiEndpoint = null;
  let seed = Date.now() % 100000;

  let state = {
    version: 1,
    cond: normalizeConditions({}),
    anchorId: null,
    pantry: [],
    cooks: [],
    purchases: {},
    pantryChoice: {},
  };
  let history = {};

  function rebuildIndex() {
    byId = new Map(catalogById);
    for (const r of aiRecipes) byId.set(r.id, r);
  }
  function save() {
    try {
      localStorage.setItem(
        USEKIRI_KEY,
        JSON.stringify({ ...state, aiRecipes: aiRecipes.map(toRaw) }),
      );
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      $("ukMessage").textContent = "このブラウザに保存できませんでした。画面を閉じると内容は消えます。";
    }
  }
  function toRaw(r) {
    return {
      name: r.name,
      type: r.type,
      time: r.time,
      hot: r.hot,
      ingredients: r.ingredients.map(([name, amount, unit, category]) => ({ name, amount, unit, category })),
      steps: r.steps,
    };
  }
  function load() {
    try {
      const h = JSON.parse(localStorage.getItem(HISTORY_KEY));
      if (h && typeof h === "object" && !Array.isArray(h))
        for (const [id, v] of Object.entries(h))
          if (Number.isInteger(v?.count) && v.count > 0) history[id] = { count: v.count, last: String(v.last ?? "") };
    } catch {
      /* ignore damaged history */
    }
    try {
      const s = JSON.parse(localStorage.getItem(USEKIRI_KEY));
      if (!s || typeof s !== "object" || s.version !== 1) return;
      // AI recipes are validated again on every load.
      aiRecipes = (Array.isArray(s.aiRecipes) ? s.aiRecipes : [])
        .map((raw) => validateAiRecipe(raw))
        .filter((v) => v.ok)
        .map((v) => v.recipe);
      rebuildIndex();
      state.cond = normalizeConditions(s.cond);
      state.anchorId = byId.has(s.anchorId) ? s.anchorId : null;
      state.pantry = (Array.isArray(s.pantry) ? s.pantry : [])
        .filter((p) => typeof p?.name === "string" && p.name.trim())
        .map((p) => ({ name: p.name.trim().slice(0, 30), use: Boolean(p.use) }));
      const cooks = Array.isArray(s.cooks)
        ? s.cooks.filter((c) => byId.has(c?.recipeId) && [1, 2].includes(c.servings))
        : [];
      state.cooks =
        cooks.length && cooks[0].recipeId === state.anchorId && cooks.reduce((n, c) => n + c.servings, 0) === state.cond.days
          ? cooks.map((c) => ({ recipeId: c.recipeId, servings: c.servings }))
          : [];
      state.purchases = s.purchases && typeof s.purchases === "object" ? s.purchases : {};
      state.pantryChoice = s.pantryChoice && typeof s.pantryChoice === "object" ? s.pantryChoice : {};
    } catch {
      $("ukMessage").textContent = "保存されていた使い切り計画を読み込めなかったため、新しく始めます。";
    }
  }

  const known = () => new Set([...getFavorites(), ...Object.keys(history)]);
  function ctx() {
    const pantryAll = new Set(state.pantry.map((p) => nameKey(p.name)));
    const pantryUse = new Set(state.pantry.filter((p) => p.use).map((p) => nameKey(p.name)));
    return {
      byId,
      pool: [...byId.values()],
      cond: state.cond,
      anchorId: state.anchorId,
      purchases: state.purchases,
      pantryAll,
      pantryUse,
      known: known(),
    };
  }
  function ledger() {
    return buildLedger({
      cooks: state.cooks,
      byId,
      pantry: state.pantry,
      purchases: state.purchases,
      pantryChoice: state.pantryChoice,
    });
  }

  // ---- Step 1: conditions ----
  function syncConditions() {
    $("ukDays").value = String(state.cond.days);
    $("ukTime").value = state.cond.maxTime === null ? "" : String(state.cond.maxTime);
    $("ukFreeze").value = state.cond.freeze ? "yes" : "no";
    $("ukMakeAhead").value = state.cond.makeAhead ? "yes" : "no";
    $("ukRepeat").value = state.cond.repeat ? "yes" : "no";
  }
  function readConditions() {
    state.cond = normalizeConditions({
      days: Number($("ukDays").value),
      maxTime: $("ukTime").value,
      freeze: $("ukFreeze").value === "yes",
      makeAhead: $("ukMakeAhead").value === "yes",
      repeat: $("ukRepeat").value === "yes",
    });
  }

  // ---- Step 2: the dish the user wants to eat ----
  let showAllDishes = false;
  /** A tappable photo card for a dish. */
  function dishCard(r, { selected = false, note = "", onPick, eager = false }) {
    const card = el("button", undefined, "uk-dish-card" + (selected ? " selected" : ""));
    card.type = "button";
    card.setAttribute("aria-pressed", String(selected));
    card.setAttribute("aria-label", `${r.name}（約${r.time}分）${selected ? "・選択中" : ""}`);
    const info = el("span", undefined, "uk-dish-info");
    info.append(el("strong", r.name), el("span", `約${r.time}分${note ? "・" + note : ""}`, "small muted"));
    const figure = dishImage(r);
    if (eager) figure.querySelector("img").loading = "eager";
    card.append(figure, info);
    if (selected) card.append(el("span", "✓", "uk-dish-check"));
    card.addEventListener("click", onPick);
    return card;
  }
  function renderDishList() {
    const root = $("ukDishGrid");
    root.replaceChildren();
    const favorites = getFavorites();
    const rank = (r) =>
      (r.id === state.anchorId ? 8 : 0) +
      (history[r.id] ? 4 : 0) +
      (favorites.has(r.id) ? 2 : 0) +
      (r.image?.status === "ready" ? 1 : 0);
    const list = [...byId.values()]
      .filter((r) => fitsTime(r, state.cond) || r.id === state.anchorId)
      .sort((a, b) => rank(b) - rank(a));
    const shown = showAllDishes ? list : list.slice(0, 12);
    for (const [k, r] of shown.entries())
      root.append(
        dishCard(r, {
          eager: k < 6,
          selected: r.id === state.anchorId,
          note: r.source === "ai" ? "AI提案" : favorites.has(r.id) ? "♥" : "",
          onPick: () => {
            // One tap: the plan is made right away.
            state.anchorId = r.id;
            state.cooks = [];
            if (makePlan()) $("ukPlanCard").scrollIntoView({ block: "start", behavior: "smooth" });
          },
        }),
      );
    if (!list.length)
      root.append(el("p", "条件に合う料理がありません", "small muted"));
    $("ukMoreDishes").hidden = showAllDishes || list.length <= shown.length;
    $("ukMoreDishes").textContent = `もっと見る（${list.length - shown.length}品）`;
  }

  // ---- Step 3: home ingredients (names only) ----
  function knownIngredientNames() {
    return [...byId.values()].flatMap((r) => r.ingredients.map((i) => i[0]));
  }
  function addPantry(name) {
    const clean = name.normalize("NFKC").trim().slice(0, 30);
    if (!clean) return;
    if (state.pantry.some((p) => nameKey(p.name) === nameKey(clean))) {
      $("ukPantrySuggest").textContent = "追加済み";
      return;
    }
    state.pantry.push({ name: clean, use: true });
    $("ukPantryInput").value = "";
    $("ukPantrySuggest").replaceChildren();
    refresh();
  }
  function onPantryAdd() {
    const input = $("ukPantryInput").value;
    if (!input.trim()) return;
    const m = matchIngredientName(input, knownIngredientNames());
    const box = $("ukPantrySuggest");
    box.replaceChildren();
    if (m.exact) return addPantry(m.exact);
    if (m.suggestions.length) {
      box.append(el("span", "これ？ "));
      for (const s of m.suggestions) box.append(makeBtn(s, () => addPantry(s), "ghost uk-chip-btn"));
      box.append(makeBtn(`${input.trim()}のまま`, () => addPantry(input), "ghost uk-chip-btn"));
    } else {
      box.append(
        el("span", "使うレシピがありません "),
        makeBtn("追加する", () => addPantry(input), "ghost uk-chip-btn"),
      );
    }
  }
  function renderPantry() {
    const root = $("ukPantryList");
    root.replaceChildren();
    state.pantry.forEach((p, i) => {
      const li = el("li", undefined, "uk-pantry-item");
      const label = el("label");
      const check = el("input");
      check.type = "checkbox";
      check.checked = p.use;
      check.addEventListener("change", () => {
        p.use = check.checked;
        refresh();
      });
      label.append(check, el("span", ` ${p.name}`));
      li.append(
        label,
        makeBtn("削除", () => {
          state.pantry.splice(i, 1);
          refresh();
        }, "ghost uk-small"),
      );
      root.append(li);
    });
  }

  // ---- Step 4 / 7: plan ----
  function renderPlan() {
    const root = $("ukPlan");
    root.replaceChildren();
    $("ukPlanCard").classList.toggle("hidden", !state.cooks.length);
    $("ukShopCard").classList.toggle("hidden", !state.cooks.length);
    $("ukLeftCard").classList.toggle("hidden", !state.cooks.length);
    $("ukWarnings").replaceChildren(
      ...planWarnings(state.cooks, ctx()).map((w) => el("p", w, "uk-warn")),
    );
    if (!state.cooks.length) return;
    expandDays(state.cooks).forEach((day, i) => {
      const r = byId.get(day.recipeId);
      const cook = state.cooks[day.cookIndex];
      const li = el("li", undefined, "uk-day");
      const head = el("div", undefined, "uk-day-head");
      head.append(el("span", dateLabel(i), "date"), el("strong", r.name));
      const isAnchorDay = day.cookIndex === 0 && !day.fromMakeAhead;
      const actions = el("div", undefined, "actions");
      actions.append(makeBtn("作り方", () => detail(r, day.fromMakeAhead ? 1 : cook.servings), "secondary"));
      if (!isAnchorDay)
        actions.append(
          makeBtn(swapOpen === i ? "やめる" : "交換", () => {
            swapOpen = swapOpen === i ? null : i;
            renderPlan();
          }, "ghost"),
        );
      const body = el("div", undefined, "uk-day-body");
      body.append(head);
      if (cook.servings > 1)
        body.append(el("span", day.fromMakeAhead ? "作り置き" : "2日分作る", "pill"));
      if (r.source === "ai") body.append(el("span", "AI提案・未検証", "pill"));
      body.append(actions);
      li.append(dishImage(r), body);
      if (swapOpen === i) li.append(swapPicker(i));
      root.append(li);
    });
  }
  function makePlan(start = null) {
    readConditions();
    swapOpen = null;
    if (!state.anchorId) {
      $("ukMessage").textContent = "料理を選んでください";
      return false;
    }
    seed = (seed * 48271 + 11) % 2147483647;
    const result = buildPlan(ctx(), { seed, start });
    if (!result.ok) {
      // Conditions are never relaxed silently; the previous plan stays.
      $("ukMessage").textContent = result.message;
      return false;
    }
    $("ukMessage").textContent = "";
    state.cooks = result.cooks;
    save();
    renderAll();
    return true;
  }
  let swapOpen = null;
  /** Photo choices for one day, best fit first. */
  function swapPicker(dayIndex) {
    const box = el("div", undefined, "uk-swap");
    const result = swapCandidates(state.cooks, dayIndex, ctx(), 6);
    if (!result.ok) {
      box.append(el("p", result.message, "small"));
      return box;
    }
    const grid = el("div", undefined, "uk-dish-grid");
    for (const option of result.options) {
      grid.append(
        dishCard(option.recipe, {
          note: "",
          onPick: () => {
            state.cooks = option.cooks;
            swapOpen = null;
            save();
            renderAll();
          },
        }),
      );
    }
    box.append(grid);
    return box;
  }

  // ---- Step 5: shopping list and pack sizes ----
  const STATUS = {
    none: () => "",
    unknown: () => "残りは計算しません",
    mismatch: (i) => `単位が違います（${i.unit}）`,
    invalid: () => "数値を確認",
    exact: () => "ぴったり",
    leftover: (i) => `残り${fmt(i.leftover)}${i.unit}`,
    short: (i) => `${fmt(i.shortage)}${i.unit}不足`,
    "home-unknown": () => "",
    "home-enough": () => "OK",
    "home-plus-buy": (i) => `＋${fmt(i.purchase.total)}${i.unit}`,
    "home-buy-none": () => "",
    "home-buy-unknown": () => "残りは計算しません",
    "home-buy-mismatch": (i) => `単位が違います（${i.unit}）`,
    "home-buy-invalid": () => "数値を確認",
  };

  const fmt = (n) => round(n).toLocaleString("ja-JP", { maximumFractionDigits: 2 });
  function statusText(item) {
    return STATUS[item.status]?.(item) ?? "";
  }
  function statusClass(item) {
    if (item.kind === "staple" && item.status === "none") return "neutral";
    if (item.status === "short") return "bad";
    if (["exact", "home-enough", "home-plus-buy"].includes(item.status)) return "good";
    if (item.status === "leftover") return item.perishable ? "warn" : "neutral";
    return "warn";
  }
  const openExtras = new Set();
  /** Purchase picker: one tap on a size; other amounts and "unknown" are optional. */
  function purchaseInputs(item) {
    const p = state.purchases[item.key];
    const total = item.purchase.status === "ok" ? item.purchase.total : null;
    const wrap = el("div", undefined, "uk-pack");
    const setPurchase = (purchase) => {
      if (purchase) state.purchases[item.key] = { ...purchase, name: item.name, category: item.category };
      else delete state.purchases[item.key];
      save();
      renderShop();
      renderLeftovers();
    };
    const options = packOptions(item);
    let matched = false;
    for (const o of options) {
      const active = total !== null && total === o.amount && !matched;
      if (active) matched = true;
      const chip = makeBtn(
        o.exact ? `ちょうど ${fmt(o.amount)}${item.unit}` : `${fmt(o.amount)}${item.unit}`,
        () => setPurchase(active ? null : { amount: o.amount, unit: item.unit, count: 1 }),
        "uk-chip" + (active ? " active" : "") + (o.exact ? " exact" : ""),
      );
      chip.setAttribute("aria-pressed", String(active));
      wrap.append(chip);
    }
    const unknownActive = p?.unit === PACK_UNKNOWN;
    const unknown = makeBtn(
      "量がわからない",
      () => setPurchase(unknownActive ? null : { amount: "", unit: PACK_UNKNOWN, count: 1 }),
      "uk-chip" + (unknownActive ? " active" : ""),
    );
    unknown.setAttribute("aria-pressed", String(unknownActive));
    // Any other amount (e.g. two packs): typed once, in the recipe's unit.
    const other = el("label", undefined, "uk-other");
    const input = el("input");
    input.type = "number";
    input.min = "0";
    input.step = "any";
    input.inputMode = "decimal";
    input.placeholder = "その他";
    input.setAttribute("aria-label", `${item.name}の買う量（${item.unit}）`);
    if (p && !unknownActive && !matched && p.amount !== "") {
      input.value = total ?? p.amount;
      input.classList.add("active");
    }
    input.addEventListener("change", () => {
      const v = Number(input.value);
      setPurchase(input.value === "" ? null : { amount: Number.isFinite(v) ? v : input.value, unit: item.unit, count: 1 });
    });
    other.append(input, el("span", item.unit, "small muted"));
    // "量がわからない" and typed amounts are tucked behind one button.
    const extraOpen = unknownActive || input.classList.contains("active") || openExtras.has(item.key);
    if (extraOpen) wrap.append(unknown, other);
    else
      wrap.append(
        makeBtn("ほかの量", () => {
          openExtras.add(item.key);
          renderShop();
        }, "uk-chip ghost-chip"),
      );
    return wrap;
  }
  function fillCountItems() {
    for (const item of ledger())
      if (item.kind === "buy" && COUNT_UNITS.has(item.unit) && item.needed > 0 && !state.purchases[item.key])
        state.purchases[item.key] = { amount: exactPurchase(item), unit: item.unit, count: 1, name: item.name, category: item.category };
    save();
    renderShop();
    renderLeftovers();
  }
  function itemName(item) {
    const name = el("div", undefined, "uk-item-name");
    name.append(
      el("strong", item.name),
      el("span", item.needed > 0 ? `${fmt(item.needed)}${item.unit}` : "使わない", "small muted"),
    );
    return name;
  }
  function renderShop() {
    const root = $("ukShop");
    root.replaceChildren();
    if (!state.cooks.length) return;
    const L = ledger();
    const buy = L.filter((i) => i.kind === "buy");
    if (buy.length) {
      const section = el("section", undefined, "uk-shop-group");
      const head = el("div", undefined, "uk-shop-head");
      head.append(el("h3", "買う量をタップ"));
      const countable = buy.filter((i) => COUNT_UNITS.has(i.unit) && i.needed > 0 && !state.purchases[i.key]);
      if (countable.length)
        head.append(makeBtn(`個数の${countable.length}品をまとめて入れる`, fillCountItems, "secondary uk-small"));
      section.append(head);
      // Rows that still need a choice come first.
      const order = (i) => (i.status === "none" ? 0 : 1);
      for (const item of [...buy].sort((a, b) => order(a) - order(b))) {
        const row = el("div", undefined, "uk-item " + statusClass(item));
        row.dataset.key = item.key;
        row.append(itemName(item), purchaseInputs(item), el("span", statusText(item), "uk-status"));
        section.append(row);
      }
      root.append(section);
    }
    const pantry = L.filter((i) => i.kind === "pantry");
    if (pantry.length) {
      const section = el("section", undefined, "uk-shop-group");
      section.append(el("h3", "家にあるもの"));
      for (const item of pantry) {
        const row = el("div", undefined, "uk-item " + statusClass(item));
        row.dataset.key = item.key;
        const modes = el("div", undefined, "uk-pack");
        for (const [v, label] of [["enough", "足りる"], ["buy", "買い足す"]]) {
          const active = item.pantryMode === v;
          const chip = makeBtn(label, () => {
            if (active) delete state.pantryChoice[item.key];
            else state.pantryChoice[item.key] = { mode: v };
            if (v !== "buy" || active) delete state.purchases[item.key];
            save();
            renderShop();
            renderLeftovers();
          }, "uk-chip" + (active ? " active" : ""));
          chip.setAttribute("aria-pressed", String(active));
          modes.append(chip);
        }
        row.append(itemName(item), modes);
        if (item.pantryMode === "buy") row.append(purchaseInputs(item));
        row.append(el("span", statusText(item), "uk-status"));
        section.append(row);
      }
      root.append(section);
    }
    const staple = L.filter((i) => i.kind === "staple" && i.needed > 0);
    if (staple.length) {
      const section = el("section", undefined, "uk-shop-group");
      section.append(
        el("h3", "調味料など（なければ買う）"),
        el("p", staple.map((i) => `${i.name} ${fmt(i.needed)}${i.unit}`).join("、"), "small uk-staples"),
      );
      root.append(section);
    }
  }
  function shopText() {
    return shoppingLines(ledger())
      .map((i) => {
        const p = i.purchase.status === "ok" ? `（購入予定 ${fmt(i.purchase.total)}${i.unit}）` : "";
        const home = i.kind === "pantry" ? "［自宅分を確認］" : "";
        return `□ ${i.name} ${fmt(i.needed)}${i.unit}${p}${home}`;
      })
      .join("\n");
  }

  // ---- Step 6: re-plan with pack sizes ----
  function onReplan() {
    const before = state.cooks.map((c) => c.recipeId + "x" + c.servings).join(",");
    const beforeDays = expandDays(state.cooks).map((d) => d.recipeId);
    const entered = Object.values(state.purchases).filter((p) => p.unit !== PACK_UNKNOWN && p.amount !== "");
    if (!entered.length) {
      $("ukReplanMessage").textContent = "先に量をタップしてください";
      return;
    }
    if (!makePlan(state.cooks)) return;
    const after = state.cooks.map((c) => c.recipeId + "x" + c.servings).join(",");
    const afterDays = expandDays(state.cooks).map((d) => d.recipeId);
    const changed = afterDays.filter((id, i) => id !== beforeDays[i]).length;
    $("ukReplanMessage").textContent =
      before === after
        ? "今の献立がいちばん合っています"
        : `${changed}日分を入れ替えました`;
  }

  // ---- Step 7: leftovers ----
  function renderLeftovers() {
    const root = $("ukLeftovers");
    root.replaceChildren();
    if (!state.cooks.length) return;
    const L = ledger();
    const c = ctx();
    const perishBuy = L.filter((i) => i.perishable && i.kind === "buy");
    const left = perishBuy.filter((i) => i.status === "leftover");
    const short = L.filter((i) => i.status === "short");
    const unknown = perishBuy.filter((i) => ["unknown", "mismatch", "invalid"].includes(i.status));
    const untapped = perishBuy.filter((i) => i.status === "none");
    const unusedPantry = state.pantry.filter(
      (p) => p.use && !L.some((i) => i.needed > 0 && nameKey(i.name) === nameKey(p.name)),
    );
    const section = (cls, title, lines) => {
      const box = el("section", undefined, "uk-left " + cls);
      box.append(el("h3", title), ...lines);
      root.append(box);
    };
    if (short.length)
      section("bad", "足りない", short.map((i) => el("p", `${i.name} ${fmt(i.shortage)}${i.unit}`)));
    if (left.length)
      section(
        "warn",
        "余る",
        left.map((i) => {
          const item = el("div", undefined, "uk-left-item");
          item.append(
            el("strong", `${i.name} ${fmt(i.leftover)}${i.unit}`),
            el("p", (state.cond.freeze ? "冷凍：" : "冷蔵：") + storageAdvice(i, state.cond), "small"),
          );
          const uses = leftoverUses(i, c, state.cooks);
          if (uses.length) item.append(el("p", "使い道：" + uses.map((u) => u.recipe.name).join("、"), "small muted"));
          return item;
        }),
      );
    if (unknown.length)
      section("neutral", "量がわからない", [el("p", unknown.map((i) => i.name).join("、"), "small")]);
    if (unusedPantry.length)
      section("neutral", "使わなかった家の食材", [el("p", unusedPantry.map((p) => p.name).join("、"), "small")]);
    if (!root.children.length)
      root.append(el("p", untapped.length ? "買う量をタップすると計算します" : "余りなし", "info"));
  }

  // ---- AI suggestions (backend not connected yet) ----
  async function onAi() {
    readConditions();
    $("ukAiMessage").textContent = "AIに問い合わせています…";
    $("ukAiRejected").replaceChildren();
    const result = await requestAiRecipes({
      endpoint: aiEndpoint,
      cond: state.cond,
      anchor: byId.get(state.anchorId),
      pantry: state.pantry,
    });
    $("ukAiMessage").textContent = result.message;
    $("ukAiRejected").replaceChildren(
      ...result.rejected.map((r) => el("li", `除外：${r.name} — ${r.errors.join("／")}`)),
    );
    if (result.recipes.length) {
      const ids = new Set(aiRecipes.map((r) => r.id));
      for (const r of result.recipes) if (!ids.has(r.id)) aiRecipes.push(r);
      rebuildIndex();
      save();
      renderAll();
    }
  }

  function renderAll() {
    renderDishList();
    renderPantry();
    renderPlan();
    renderShop();
    renderLeftovers();
  }

  // ---- wiring ----
  // Any change re-plans at once (no extra button to press).
  function refresh() {
    if (state.anchorId) makePlan();
    else {
      save();
      renderAll();
    }
  }
  for (const id of ["ukDays", "ukTime", "ukFreeze", "ukMakeAhead", "ukRepeat"])
    $(id).addEventListener("change", () => {
      readConditions();
      refresh();
    });
  $("ukMoreDishes").addEventListener("click", () => {
    showAllDishes = true;
    renderDishList();
  });
  $("ukPantryAdd").addEventListener("click", onPantryAdd);
  $("ukPantryInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onPantryAdd();
    }
  });
  $("ukRegenerate").addEventListener("click", () => {
    if (makePlan()) $("ukReplanMessage").textContent = "";
  });
  $("ukReplan").addEventListener("click", onReplan);
  $("ukAi").addEventListener("click", onAi);
  $("ukCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shopText());
      $("ukCopy").textContent = "コピーしました";
      setTimeout(() => ($("ukCopy").textContent = "コピー"), 1500);
    } catch {
      alert("コピーできませんでした");
    }
  });

  fetch(new URL("../data/ai-config.json", import.meta.url))
    .then((r) => (r.ok ? r.json() : null))
    .then((cfg) => {
      // Only an https endpoint (or same-origin path) is accepted; no keys live here.
      const ep = cfg?.endpoint;
      if (typeof ep === "string" && (/^https:\/\//.test(ep) || ep.startsWith("/"))) aiEndpoint = ep;
    })
    .catch(() => {});

  load();
  syncConditions();
  renderAll();
  // Exposed for checks in tests: state is plain data.
  return { getState: () => state, canMakeAhead };
}
