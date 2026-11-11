import { filterRecipes, validateCatalog, searchRecipes } from "./catalog.js";
import { dishImage } from "./images.js";
import { formatStep } from "./catalog.js";

async function start() {
  const response = await fetch(
    new URL("../data/recipes.json", import.meta.url),
  );
  if (!response.ok) throw new Error("レシピデータを取得できませんでした");
  const { recipes } = validateCatalog(await response.json());
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const key = "gohan-keikaku-v1";
  const $ = (id) => document.getElementById(id);
  const favoritesKey = "gohan-keikaku-favorites-v1";
  let favorites = new Set();
  try {
    const stored = JSON.parse(localStorage.getItem(favoritesKey));
    if (Array.isArray(stored))
      favorites = new Set(stored.filter((id) => byId.has(id)));
  } catch {
    /* A damaged favorites list must not block meal plans. */
  }
  let state = {
    days: 7,
    servings: 1,
    cuisine: "all",
    spicy: "all",
    calorie: "all",
    protein: "all",
    plan: [],
    checked: {},
  };
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn("保存できませんでした", e);
    }
  }
  function load() {
    try {
      let s = JSON.parse(localStorage.getItem(key));
      if (s && typeof s === "object") {
        state.days = [3, 7].includes(s.days) ? s.days : 7;
        state.servings = [1, 2, 3, 4].includes(s.servings) ? s.servings : 1;
        state.cuisine = ["all", "和食", "中華", "洋食"].includes(s.cuisine)
          ? s.cuisine
          : "all";
        state.spicy = ["all", "mild", "hot"].includes(s.spicy)
          ? s.spicy
          : "all";
        state.calorie = ["all", "low", "middle", "high"].includes(s.calorie)
          ? s.calorie
          : "all";
        state.protein = ["all", "low", "middle", "high"].includes(s.protein)
          ? s.protein
          : "all";
        state.plan = Array.isArray(s.plan)
          ? s.plan.filter((id) => byId.has(id)).slice(0, 7)
          : [];
        state.checked =
          s.checked &&
          typeof s.checked === "object" &&
          !Array.isArray(s.checked)
            ? s.checked
            : {};
      }
    } catch (e) {
      console.warn("保存データを読み込めませんでした", e);
    }
  }
  function el(tag, text, cls) {
    let n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function makeBtn(text, fn, cls) {
    let b = el("button", text, "btn " + (cls || ""));
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }
  function dateLabel(i) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(d);
  }
  function num(n) {
    return Math.round(n * 100) / 100;
  }
  function qty(n, u) {
    return num(n).toLocaleString("ja-JP", { maximumFractionDigits: 2 }) + u;
  }
  function syncSettings() {
    $("days").value = state.days;
    $("servings").value = state.servings;
    $("cuisine").value = state.cuisine;
    $("spicy").value = state.spicy;
    $("calorie").value = state.calorie;
    $("protein").value = state.protein;
  }

  function nutrientBadges(r) {
    let row = el("div", undefined, "nutrition");
    row.title = "食品成分表による検証前の暫定値";
    row.append(
      el("span", "暫定 約" + r.kcal + " kcal", "nutri"),
      el("span", "たんぱく質 約" + r.protein + " g", "nutri"),
    );
    return row;
  }
  function matchingRecipes() {
    return filterRecipes(recipes, state);
  }

  function generate() {
    let pool = matchingRecipes().slice();
    if (!pool.length) {
      $("filterMessage").textContent =
        "条件に一致する料理がありません。カロリー・たんぱく質・ジャンルの指定を緩めてください。";
      return false;
    }
    $("filterMessage").textContent =
      "条件に一致した" +
      pool.length +
      "種類から献立を提案しました。栄養値は1人分の暫定概算です。";
    for (let i = pool.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    if (state.spicy === "hot")
      pool.sort((a, b) => Number(b.hot) - Number(a.hot));
    state.plan = Array.from(
      { length: state.days },
      (_, i) => pool[i % pool.length].id,
    );
    state.checked = {};
    save();
    renderAll();
    return true;
  }
  function changeDay(index) {
    let current = state.plan[index],
      pool = matchingRecipes().filter((r) => r.id !== current);
    if (!pool.length) {
      $("filterMessage").textContent =
        "条件内で交換できる別の料理がありません。条件を緩めてください。";
      return;
    }
    const unused = pool.filter((r) => !state.plan.includes(r.id));
    const chosen = (unused.length ? unused : pool)[
      Math.floor(Math.random() * (unused.length ? unused : pool).length)
    ];
    state.plan[index] = chosen.id;
    state.checked = {};
    save();
    renderAll();
  }
  function mealIngredients() {
    let grouped = new Map();
    state.plan.forEach((id) => {
      let r = byId.get(id);
      if (!r) return;
      r.ingredients.forEach(([name, amount, unit, category]) => {
        let key = name + "|" + unit;
        let v = grouped.get(key) || { name, unit, category, amount: 0 };
        v.amount += amount * state.servings;
        grouped.set(key, v);
      });
    });
    return [...grouped.values()].sort(
      (a, b) =>
        a.category.localeCompare(b.category, "ja") ||
        a.name.localeCompare(b.name, "ja"),
    );
  }
  function listKey(item) {
    return item.name + "|" + item.unit;
  }
  function renderPlan() {
    let root = $("planGrid");
    root.replaceChildren();
    state.plan.forEach((id, i) => {
      const r = byId.get(id);
      if (!r) return;
      let box = el("article", undefined, "meal");
      box.append(
        dishImage(r),
        el("div", dateLabel(i), "date"),
        el("h3", r.name),
        el(
          "p",
          r.type + " ・ 約" + r.time + "分" + (r.hot ? " ・ 辛口" : ""),
          "tags",
        ),
        nutrientBadges(r),
      );
      let acts = el("div", undefined, "actions");
      acts.append(
        makeBtn("レシピを見る", () => detail(r), "secondary"),
        makeBtn("別の料理に", () => changeDay(i), "ghost"),
      );
      box.append(acts);
      root.append(box);
    });
    $("planStats").replaceChildren(
      ...[
        ["献立", state.plan.length + "日"],
        ["人数", state.servings + "人"],
        ["買い物品目", mealIngredients().length + "品"],
      ].map(([k, v]) => {
        let p = el("div", undefined, "stat");
        p.append(el("strong", v), el("span", k));
        return p;
      }),
    );
    if (!state.plan.length)
      root.append(el("div", "献立を提案するとここに表示されます。", "empty"));
  }
  function renderShop() {
    const items = mealIngredients(),
      grouped = new Map();
    for (const v of items) {
      if (!grouped.has(v.category)) grouped.set(v.category, []);
      grouped.get(v.category).push(v);
    }
    let total = items.length,
      done = items.filter((x) => state.checked[listKey(x)]).length;
    $("shopStats").replaceChildren(
      ...[
        ["品目数", total + "品"],
        ["チェック済み", done + "品"],
        ["残り", total - done + "品"],
      ].map(([k, v]) => {
        let p = el("div", undefined, "stat");
        p.append(el("strong", v), el("span", k));
        return p;
      }),
    );
    let root = $("shopping");
    root.replaceChildren();
    if (!items.length) {
      root.append(el("div", "先に献立を作成してください。", "empty"));
      return;
    }
    for (const [cat, arr] of grouped) {
      let group = el("section", undefined, "shopping-group");
      group.append(el("h3", cat));
      for (const item of arr) {
        let row = el(
          "label",
          undefined,
          "shopping-row" + (state.checked[listKey(item)] ? " done" : ""),
        );
        let check = el("input");
        check.type = "checkbox";
        check.checked = Boolean(state.checked[listKey(item)]);
        check.addEventListener("change", () => {
          state.checked[listKey(item)] = check.checked;
          save();
          renderShop();
        });
        row.append(
          check,
          el("span", item.name, "item"),
          el("span", qty(item.amount, item.unit), "qty"),
        );
        group.append(row);
      }
      root.append(group);
    }
  }
  function renderRecipes() {
    const root = $("recipeGrid");
    const matches = searchRecipes(
      recipes,
      {
        query: $("recipeSearch").value,
        cuisine: $("recipeCuisine").value,
        maxTime: $("recipeTime").value,
        sort: $("recipeSort").value,
        favoritesOnly: $("favoritesOnly").checked,
      },
      favorites,
    );
    root.replaceChildren();
    $("recipeResults").textContent =
      `${matches.length}品のレシピ${$("favoritesOnly").checked ? " · お気に入り" : ""}`;
    for (const r of matches) {
      const box = el("article", undefined, "recipe");
      const favorite = makeBtn(
        favorites.has(r.id) ? "♥ 保存済み" : "♡ お気に入り",
        () => {
          if (favorites.has(r.id)) favorites.delete(r.id);
          else favorites.add(r.id);
          try {
            localStorage.setItem(favoritesKey, JSON.stringify([...favorites]));
            $("favoriteMessage").textContent =
              "お気に入りはこのブラウザに保存されます。";
          } catch {
            $("favoriteMessage").textContent =
              "このブラウザに保存できませんでした。今回の画面内でのみ保持されます。";
          }
          renderRecipes();
        },
        "favorite-button",
      );
      favorite.setAttribute("aria-pressed", String(favorites.has(r.id)));
      favorite.setAttribute(
        "aria-label",
        r.name +
          (favorites.has(r.id) ? "をお気に入りから解除" : "をお気に入りに保存"),
      );
      const actions = el("div", undefined, "recipe-actions");
      actions.append(
        makeBtn("材料と作り方", () => detail(r), "secondary"),
        favorite,
      );
      box.append(
        dishImage(r),
        el(
          "span",
          r.type + " ・ 約" + r.time + "分" + (r.hot ? " ・ 辛口" : ""),
          "pill",
        ),
        el("h3", r.name),
        nutrientBadges(r),
        el(
          "p",
          r.ingredients
            .slice(0, 4)
            .map((x) => x[0])
            .join("・"),
          "muted small",
        ),
        actions,
      );
      root.append(box);
    }
    if (!matches.length)
      root.append(
        el(
          "div",
          $("favoritesOnly").checked && !favorites.size
            ? "お気に入りはまだありません。料理カードの「♡ お気に入り」から保存できます。"
            : "該当するレシピがありません。検索語や条件を変えてみてください。",
          "empty",
        ),
      );
  }
  function detail(r) {
    $("detailImage").replaceChildren(dishImage(r));
    $("detailTitle").textContent = r.name;
    $("detailMeta").textContent =
      r.type +
      " / 約" +
      r.time +
      "分 / 約" +
      r.kcal +
      "kcal・たんぱく質 約" +
      r.protein +
      "g（1人分・未検証の暫定概算）" +
      (r.hot ? " / 辛口" : "");
    $("detailServings").textContent = state.servings;
    $("detailIngredients").replaceChildren(
      ...r.ingredients.map(([name, n, u]) =>
        el("li", name + "： " + qty(n * state.servings, u)),
      ),
    );
    $("detailSteps").replaceChildren(
      ...r.steps.map((x) => el("li", formatStep(x, state.servings))),
    );
    $("detailCheck").textContent =
      r.recipeCheck?.status === "desk-reviewed" && !r.recipeCheck.cookTested
        ? "手順は分量・加熱の記載を机上で確認済みです（試作による検証は未実施）。"
        : "手順は簡易版です。";
    $("detailStorage").textContent = r.storage;
    $("detail").showModal();
  }
  function renderAll() {
    renderPlan();
    renderShop();
    renderRecipes();
  }
  function selectTab(tab) {
    document
      .querySelector(".tabs")
      .scrollIntoView({ block: "start", behavior: "instant" });
    for (const v of ["plan", "shop", "recipes"])
      $("page-" + v).classList.toggle("hidden", v !== tab);
    document.querySelectorAll("[data-tab]").forEach((b) => {
      let active = b.dataset.tab === tab;
      b.classList.toggle("active", active);
      b.setAttribute("aria-current", active ? "page" : "false");
    });
  }
  function shopText() {
    let groups = new Map();
    for (const v of mealIngredients()) {
      if (!groups.has(v.category)) groups.set(v.category, []);
      groups.get(v.category).push(v);
    }
    return [...groups]
      .map(
        ([cat, arr]) =>
          "【" +
          cat +
          "】\n" +
          arr
            .map(
              (x) =>
                (state.checked[listKey(x)] ? "☑ " : "□ ") +
                x.name +
                " " +
                qty(x.amount, x.unit),
            )
            .join("\n"),
      )
      .join("\n\n");
  }
  $("generate").addEventListener("click", () => {
    state.days = Number($("days").value);
    state.servings = Number($("servings").value);
    state.cuisine = $("cuisine").value;
    state.spicy = $("spicy").value;
    state.calorie = $("calorie").value;
    state.protein = $("protein").value;
    generate();
  });
  $("servings").addEventListener("change", () => {
    state.servings = Number($("servings").value);
    state.checked = {};
    save();
    renderAll();
  });
  $("days").addEventListener("change", () => {
    state.days = Number($("days").value);
    state.plan = state.plan.slice(0, state.days);
    if (state.plan.length < state.days) generate();
    else {
      state.checked = {};
      save();
      renderAll();
    }
  });
  for (const id of ["cuisine", "spicy", "calorie", "protein"])
    $(id).addEventListener("change", () => {
      state[id] = $(id).value;
      save();
    });
  $("clearPlan").addEventListener("click", () => {
    if (confirm("献立と買い物チェックを初期化しますか？")) {
      state.plan = [];
      state.checked = {};
      save();
      renderAll();
    }
  });
  $("recipeSearch").addEventListener("input", renderRecipes);
  for (const id of [
    "recipeCuisine",
    "recipeTime",
    "recipeSort",
    "favoritesOnly",
  ])
    $(id).addEventListener("change", renderRecipes);
  $("resetRecipeFilters").addEventListener("click", () => {
    $("recipeSearch").value = "";
    $("recipeCuisine").value = "all";
    $("recipeTime").value = "all";
    $("recipeSort").value = "default";
    $("favoritesOnly").checked = false;
    renderRecipes();
  });
  document
    .querySelector(".hero-link")
    .addEventListener("click", () => selectTab("plan"));
  $("resetChecks").addEventListener("click", () => {
    state.checked = {};
    save();
    renderShop();
  });
  $("copyShop").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shopText());
      $("copyShop").textContent = "コピーしました";
      setTimeout(() => ($("copyShop").textContent = "リストをコピー"), 1500);
    } catch {
      alert("コピーできませんでした。ブラウザの権限を確認してください。");
    }
  });
  $("closeDetail").addEventListener("click", () => $("detail").close());
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) =>
      b.addEventListener("click", () => selectTab(b.dataset.tab)),
    );
  $("recipeCount").textContent = recipes.length;
  $("catalogCount").textContent = recipes.length;
  load();
  syncSettings();
  if (!state.plan.length) generate();
  else renderAll();
}
start().catch((error) => {
  console.error(error);
  document.getElementById("filterMessage").textContent =
    "レシピを読み込めませんでした。通信状況を確認して再読み込みしてください。保存済みデータは維持されています。";
  document
    .querySelectorAll("button,select,input")
    .forEach((control) => (control.disabled = true));
});
