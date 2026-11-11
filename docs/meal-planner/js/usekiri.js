/**
 * UI for the use-up planner (使い切り計画). Separate storage key so the
 * existing plan (gohan-keikaku-v1) and favorites are never touched.
 */
import {
  PACK_UNKNOWN,
  UNITS,
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
    const anchor = byId.get(state.anchorId);
    $("ukAnchor").hidden = !anchor;
    $("ukAnchor").textContent = anchor
      ? `選んだ料理：${anchor.name}（約${anchor.time}分）。1日目に固定して、ほかの日を組み立てます。`
      : "";
    $("ukMakePlan").disabled = !anchor;
    $("ukMakeHint").hidden = Boolean(anchor);
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
            state.anchorId = r.id;
            state.cooks = [];
            save();
            renderAll();
            $("ukMessage").textContent = `「${r.name}」を選びました。「仮の献立をつくる」を押してください。`;
            $("ukMakePlan").scrollIntoView({ block: "center", behavior: "smooth" });
          },
        }),
      );
    if (!list.length)
      root.append(el("p", "調理時間の条件に合う料理がありません。条件を変えてください。", "small muted"));
    $("ukMoreDishes").hidden = showAllDishes || list.length <= shown.length;
    $("ukMoreDishes").textContent = `もっと見る（ほか${list.length - shown.length}品）`;
  }

  // ---- Step 3: home ingredients (names only) ----
  function knownIngredientNames() {
    return [...byId.values()].flatMap((r) => r.ingredients.map((i) => i[0]));
  }
  function addPantry(name) {
    const clean = name.normalize("NFKC").trim().slice(0, 30);
    if (!clean) return;
    if (state.pantry.some((p) => nameKey(p.name) === nameKey(clean))) {
      $("ukPantrySuggest").textContent = `「${clean}」はすでに追加しています。`;
      return;
    }
    state.pantry.push({ name: clean, use: true });
    $("ukPantryInput").value = "";
    save();
    renderAll();
  }
  function onPantryAdd() {
    const input = $("ukPantryInput").value;
    if (!input.trim()) return;
    const m = matchIngredientName(input, knownIngredientNames());
    const box = $("ukPantrySuggest");
    box.replaceChildren();
    if (m.exact) return addPantry(m.exact);
    if (m.suggestions.length) {
      box.append(el("span", `「${input.trim()}」はレシピの材料名と一致しません。近い材料：`));
      for (const s of m.suggestions) box.append(makeBtn(s, () => addPantry(s), "ghost uk-chip-btn"));
      box.append(makeBtn(`「${input.trim()}」のまま追加`, () => addPantry(input), "ghost uk-chip-btn"));
    } else {
      box.append(
        el("span", `「${input.trim()}」を使うレシピは登録されていません。`),
        makeBtn("それでも追加", () => addPantry(input), "ghost uk-chip-btn"),
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
        save();
        renderAll();
      });
      label.append(check, el("span", ` ${p.name}を今回使う`));
      li.append(
        label,
        makeBtn("削除", () => {
          state.pantry.splice(i, 1);
          save();
          renderAll();
        }, "ghost uk-small"),
      );
      root.append(li);
    });
  }

  // ---- Step 4 / 7: plan ----
  function recipeTag(r) {
    if (r.source === "ai") return "AI提案・未検証";
    const k = known();
    if (!k.size) return null;
    if (history[r.id]) return `定番（作った記録${history[r.id].count}回）`;
    if (getFavorites().has(r.id)) return "お気に入り";
    return "調理記録なし";
  }
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
    const L = ledger();
    expandDays(state.cooks).forEach((day, i) => {
      const r = byId.get(day.recipeId);
      const cook = state.cooks[day.cookIndex];
      const li = el("li", undefined, "uk-day");
      const head = el("div", undefined, "uk-day-head");
      head.append(el("span", `${i + 1}日目・${dateLabel(i)}`, "date"), el("strong", r.name));
      const tags = el("div", undefined, "uk-tags");
      if (day.cookIndex === 0 && !day.fromMakeAhead) tags.append(el("span", "最初に選んだ料理", "pill"));
      if (cook.servings > 1)
        tags.append(el("span", day.fromMakeAhead ? "前日の作り置きを食べる" : "2日分まとめて作る", "pill"));
      const tag = recipeTag(r);
      if (tag) tags.append(el("span", tag, "pill"));
      tags.append(el("span", `約${r.time}分`, "pill"));
      // Which perishables this day shares with other days.
      const shared = L.filter(
        (it) =>
          it.perishable &&
          new Set(it.uses.map((u) => u.cookIndex)).size > 1 &&
          it.uses.some((u) => u.cookIndex === day.cookIndex),
      ).map((it) => it.name);
      const isAnchorDay = day.cookIndex === 0 && !day.fromMakeAhead;
      const actions = el("div", undefined, "actions");
      actions.append(makeBtn("レシピ", () => detail(r, day.fromMakeAhead ? 1 : cook.servings), "secondary"));
      if (!isAnchorDay)
        actions.append(
          makeBtn(swapOpen === i ? "交換をやめる" : "この日だけ交換", () => {
            swapOpen = swapOpen === i ? null : i;
            renderPlan();
          }, "ghost"),
        );
      if (!day.fromMakeAhead)
        actions.append(
          makeBtn(history[r.id] && history[r.id].last === today() ? "作った ✓" : "作った", () => {
            const h = history[r.id] ?? { count: 0, last: "" };
            if (h.last !== today()) history[r.id] = { count: h.count + 1, last: today() };
            save();
            renderAll();
          }, "ghost"),
        );
      const body = el("div", undefined, "uk-day-body");
      body.append(
        head,
        tags,
        el("p", shared.length ? `使い回す食材：${shared.join("・")}` : "ほかの日と共通の傷みやすい食材はありません", "small muted"),
        actions,
      );
      li.append(dishImage(r), body);
      if (swapOpen === i) li.append(swapPicker(i));
      root.append(li);
    });
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function makePlan(start = null) {
    readConditions();
    swapOpen = null;
    if (!state.anchorId) {
      $("ukMessage").textContent = "先に、食べたい料理の写真を1つ選んでください。";
      return false;
    }
    seed = (seed * 48271 + 11) % 2147483647;
    const result = buildPlan(ctx(), { seed, start });
    if (!result.ok) {
      // Conditions are never relaxed silently; the previous plan stays.
      $("ukMessage").textContent = result.message + (state.cooks.length ? "（前の献立はそのまま残しています）" : "");
      return false;
    }
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
    box.append(el("p", "写真から選んでください（先頭ほど、買う食材を使い回しやすい料理です）。写真はAI生成の盛り付けイメージです。", "small muted"));
    const grid = el("div", undefined, "uk-dish-grid");
    for (const option of result.options) {
      const others = option.cooks.filter((_, k) => k !== option.cooks.findIndex((c) => c.recipeId === option.recipe.id));
      const otherIngredients = new Set(
        others.flatMap((c) => byId.get(c.recipeId).ingredients.filter((x) => x[3] !== "調味料" && x[3] !== "主食").map((x) => nameKey(x[0]))),
      );
      const reuse = option.recipe.ingredients
        .filter((x) => x[3] !== "調味料" && x[3] !== "主食" && otherIngredients.has(nameKey(x[0])))
        .map((x) => x[0]);
      grid.append(
        dishCard(option.recipe, {
          note: reuse.length ? `${reuse.slice(0, 2).join("・")}を使い回し` : "",
          onPick: () => {
            state.cooks = option.cooks;
            swapOpen = null;
            $("ukMessage").textContent = `${dayIndex + 1}日目を「${option.recipe.name}」に交換しました。買い物リストと残量を計算し直しました。`;
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
    none: () => "購入量を入力してください",
    unknown: () => "パックの量が不明のため、残りは計算していません",
    mismatch: (i) => `単位が違うため計算できません（${i.unit}で入力してください）`,
    invalid: () => "購入量の数値を確認してください",
    exact: (i) => `使い切り（残り0${i.unit}）`,
    leftover: (i) => `残り${fmt(i.leftover)}${i.unit}`,
    short: (i) => `${fmt(i.shortage)}${i.unit}不足`,
    "home-unknown": () => "自宅にある（量は未確認）。足りるか選んでください",
    "home-enough": () => "自宅分を使う（量が未入力のため残りは計算しません）",
    "home-plus-buy": (i) => `自宅分＋${fmt(i.purchase.total)}${i.unit}を購入（自宅分の量が未入力のため残りは計算しません）`,
    "home-buy-none": () => "買い足す量を入力してください",
    "home-buy-unknown": () => "パックの量が不明です",
    "home-buy-mismatch": (i) => `単位が違うため計算できません（${i.unit}で入力してください）`,
    "home-buy-invalid": () => "購入量の数値を確認してください",
  };
  const fmt = (n) => round(n).toLocaleString("ja-JP", { maximumFractionDigits: 2 });
  function statusText(item) {
    if (item.kind === "staple" && item.status === "none") return "使い切りは求めません（必要量の目安）";
    return STATUS[item.status]?.(item) ?? "";
  }
  function statusClass(item) {
    if (item.kind === "staple" && item.status === "none") return "neutral";
    if (item.status === "short") return "bad";
    if (["exact", "home-enough", "home-plus-buy"].includes(item.status)) return "good";
    if (item.status === "leftover") return item.perishable ? "warn" : "neutral";
    return "warn";
  }
  function purchaseInputs(item) {
    const p = state.purchases[item.key] ?? {};
    const wrap = el("div", undefined, "uk-pack");
    const amount = el("input");
    amount.type = "number";
    amount.min = "0";
    amount.step = "any";
    amount.inputMode = "decimal";
    amount.value = p.amount ?? "";
    amount.setAttribute("aria-label", `${item.name}の1パックの量`);
    const unit = el("select");
    for (const u of [item.unit, ...UNITS.filter((x) => x !== item.unit), PACK_UNKNOWN]) {
      const o = el("option", u);
      o.value = u;
      unit.append(o);
    }
    unit.value = p.unit ?? item.unit;
    unit.setAttribute("aria-label", `${item.name}の単位`);
    const count = el("input");
    count.type = "number";
    count.min = "1";
    count.step = "1";
    count.value = p.count ?? 1;
    count.setAttribute("aria-label", `${item.name}のパック数`);
    const update = () => {
      state.purchases[item.key] = {
        amount: amount.value,
        unit: unit.value,
        count: count.value,
        name: item.name,
        category: item.category,
      };
      if (amount.value === "" && unit.value !== PACK_UNKNOWN) delete state.purchases[item.key];
      amount.disabled = unit.value === PACK_UNKNOWN;
      save();
      // Update this row and the leftover summary only, so keyboard focus stays.
      const fresh = ledger().find((x) => x.key === item.key);
      const row = wrap.closest(".uk-item");
      if (fresh && row) {
        row.className = "uk-item " + statusClass(fresh);
        row.querySelector(".uk-status").textContent = statusText(fresh);
      }
      renderLeftovers();
    };
    amount.addEventListener("change", update);
    unit.addEventListener("change", update);
    count.addEventListener("change", update);
    amount.disabled = unit.value === PACK_UNKNOWN;
    wrap.append(amount, unit, el("span", "×", "small muted"), count, el("span", "パック", "small muted"));
    return wrap;
  }
  function renderShop() {
    const root = $("ukShop");
    root.replaceChildren();
    if (!state.cooks.length) return;
    const L = ledger();
    const groups = [
      ["buy", "買う食材（傷みやすいものは使い切りを目指します）"],
      ["pantry", "自宅にある食材（量は未確認）"],
      ["staple", "調味料・主食（使い切りは求めません）"],
    ];
    for (const [kind, title] of groups) {
      const items = L.filter((i) => i.kind === kind);
      if (!items.length) continue;
      const section = el("section", undefined, "uk-shop-group");
      section.append(el("h3", title));
      for (const item of items) {
        const row = el("div", undefined, "uk-item " + statusClass(item));
        row.dataset.key = item.key;
        const name = el("div", undefined, "uk-item-name");
        name.append(el("strong", item.name));
        const uses = item.uses
          .map((u) => `${byId.get(u.recipeId).name} ${fmt(u.amount)}${item.unit}`)
          .join("＋");
        name.append(
          el(
            "span",
            item.needed > 0
              ? `必要 ${fmt(item.needed)}${item.unit}（${uses}）`
              : "今の献立では使いません（購入済みの分）",
            "small muted",
          ),
        );
        row.append(name);
        if (kind === "pantry") {
          const mode = el("select");
          for (const [v, label] of [
            ["unknown", "足りるか未確認"],
            ["enough", "自宅分で足りる"],
            ["buy", "足りないので買い足す"],
          ]) {
            const o = el("option", label);
            o.value = v;
            mode.append(o);
          }
          mode.value = item.pantryMode;
          mode.setAttribute("aria-label", `${item.name}が自宅分で足りるか`);
          mode.addEventListener("change", () => {
            state.pantryChoice[item.key] = { mode: mode.value };
            if (mode.value !== "buy") delete state.purchases[item.key];
            save();
            renderAll();
          });
          row.append(mode);
          if (item.pantryMode === "buy") row.append(purchaseInputs(item));
        } else row.append(purchaseInputs(item));
        row.append(el("span", statusText(item), "uk-status"));
        section.append(row);
      }
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
      $("ukReplanMessage").textContent = "先に、買うパックの量を1つ以上入力してください。";
      return;
    }
    if (!makePlan(state.cooks)) return;
    const after = state.cooks.map((c) => c.recipeId + "x" + c.servings).join(",");
    const afterDays = expandDays(state.cooks).map((d) => d.recipeId);
    const changed = afterDays.filter((id, i) => id !== beforeDays[i]).length;
    $("ukReplanMessage").textContent =
      before === after
        ? "今の献立が、入力した購入量にいちばん合っています（献立は変わっていません）。残りと不足は下で確認できます。"
        : `入力した購入量に合わせて、${changed}日分の料理を入れ替えました。買い物リストの必要量と残りも計算し直しています。`;
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
    const unknown = perishBuy.filter((i) => ["none", "unknown", "mismatch", "invalid"].includes(i.status));
    const homeUsed = L.filter((i) => i.kind === "pantry" && i.needed > 0);
    const unusedPantry = state.pantry.filter(
      (p) => p.use && !L.some((i) => i.needed > 0 && nameKey(i.name) === nameKey(p.name)),
    );
    if (short.length) {
      const box = el("section", undefined, "uk-left bad");
      box.append(el("h3", "足りない食材"));
      for (const i of short)
        box.append(el("p", `${i.name}：${fmt(i.shortage)}${i.unit}不足（必要${fmt(i.needed)}${i.unit}、購入${fmt(i.purchase.total)}${i.unit}）。購入量を増やすか、「パック量に合わせて組み直す」を押してください。`));
      root.append(box);
    }
    if (left.length) {
      const box = el("section", undefined, "uk-left warn");
      box.append(el("h3", "期間内に使い切れない食材"));
      for (const i of left) {
        const item = el("div", undefined, "uk-left-item");
        item.append(el("strong", `${i.name}：残り${fmt(i.leftover)}${i.unit}`));
        item.append(el("p", (state.cond.freeze ? "冷凍する場合：" : "冷蔵で使う場合：") + storageAdvice(i, state.cond), "small"));
        const uses = leftoverUses(i, c, state.cooks);
        if (uses.length)
          item.append(el("p", "この残りで作れる料理の例：" + uses.map((u) => `${u.recipe.name}（${fmt(u.amount)}${i.unit}使用）`).join("、"), "small muted"));
        box.append(item);
      }
      root.append(box);
    }
    if (unknown.length) {
      const box = el("section", undefined, "uk-left neutral");
      box.append(el("h3", "残りを計算できていない食材"));
      box.append(el("p", unknown.map((i) => `${i.name}（${STATUS[i.status](i)}）`).join("、"), "small"));
      root.append(box);
    }
    if (homeUsed.length || unusedPantry.length) {
      const box = el("section", undefined, "uk-left neutral");
      box.append(el("h3", "自宅の食材"));
      if (homeUsed.length)
        box.append(el("p", `${homeUsed.map((i) => i.name).join("・")}は自宅の量が未入力のため、残りは計算していません。必要量（買い物リストに表示）と比べて確認してください。`, "small"));
      if (unusedPantry.length)
        box.append(el("p", `今回の献立では使い道が見つかりませんでした：${unusedPantry.map((p) => p.name).join("・")}`, "small"));
      root.append(box);
    }
    if (!short.length && !left.length && !unknown.length && perishBuy.length)
      root.append(el("p", "入力した購入量の範囲では、傷みやすい食材の残りは0です。", "info"));
    root.append(el("p", "保存の案は一般的な目安です。食材の状態・購入時の表示を確認してください。保存できる日数はこのアプリでは判断していません。", "small muted"));
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
  for (const id of ["ukDays", "ukTime", "ukFreeze", "ukMakeAhead", "ukRepeat"])
    $(id).addEventListener("change", () => {
      readConditions();
      const daysChanged = state.cooks.length && expandDays(state.cooks).length !== state.cond.days;
      if (daysChanged) state.cooks = [];
      save();
      renderAll();
      if (state.anchorId && !fitsTime(byId.get(state.anchorId), state.cond))
        $("ukMessage").textContent = "選んだ料理は調理時間の条件を超えています。そのまま使う場合は献立に注意が表示されます。";
      else if (daysChanged) $("ukMessage").textContent = "日数を変えたため、献立をもう一度つくってください。";
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
  $("ukMakePlan").addEventListener("click", () => {
    if (makePlan()) {
      $("ukMessage").textContent = "仮の献立をつくりました。買い物リストで買うパックの量を入力すると、残りを計算して組み直せます。";
      $("ukReplanMessage").textContent = "";
      $("ukPlanCard").scrollIntoView({ block: "start", behavior: "smooth" });
    }
  });
  $("ukRegenerate").addEventListener("click", () => {
    if (makePlan()) {
      $("ukMessage").textContent = "最初の料理を残して、献立全体を作り直しました。";
      $("ukReplanMessage").textContent = "";
    }
  });
  $("ukReplan").addEventListener("click", onReplan);
  $("ukAi").addEventListener("click", onAi);
  $("ukCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shopText());
      $("ukCopy").textContent = "コピーしました";
      setTimeout(() => ($("ukCopy").textContent = "リストをコピー"), 1500);
    } catch {
      alert("コピーできませんでした。ブラウザの権限を確認してください。");
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
