import { validateCatalog, searchRecipes } from "./catalog.js";
import { dishImage } from "./images.js";
import { formatStep } from "./catalog.js";
import { mountUsekiri } from "./usekiri.js";

/*
 * The former "おまかせ献立" and its shopping list were removed at the
 * requester's request (2026-11-11). Their saved data (gohan-keikaku-v1) is
 * left untouched in the browser; nothing reads or deletes it.
 */
async function start() {
  const response = await fetch(
    new URL("../data/recipes.json", import.meta.url),
  );
  if (!response.ok) throw new Error("レシピデータを取得できませんでした");
  const { recipes } = validateCatalog(await response.json());
  const byId = new Map(recipes.map((r) => [r.id, r]));
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
  function renderRecipes() {
    const root = $("recipeGrid");
    const matches = searchRecipes(
      recipes,
      { query: $("recipeSearch").value, favoritesOnly: $("favoritesOnly").checked },
      favorites,
    );
    root.replaceChildren();
    for (const r of matches) {
      const box = el("article", undefined, "recipe");
      const on = favorites.has(r.id);
      const favorite = makeBtn(
        on ? "♥" : "♡",
        () => {
          if (favorites.has(r.id)) favorites.delete(r.id);
          else favorites.add(r.id);
          try {
            localStorage.setItem(favoritesKey, JSON.stringify([...favorites]));
          } catch {
            /* kept for this visit only */
          }
          renderRecipes();
        },
        "favorite-button",
      );
      favorite.setAttribute("aria-pressed", String(on));
      favorite.setAttribute(
        "aria-label",
        r.name + (on ? "をお気に入りから解除" : "をお気に入りに保存"),
      );
      const actions = el("div", undefined, "recipe-actions");
      actions.append(makeBtn("作り方", () => detail(r), "secondary"), favorite);
      box.append(dishImage(r), el("h3", r.name), el("p", `約${r.time}分`, "muted small"), actions);
      root.append(box);
    }
    if (!matches.length)
      root.append(el("div", $("favoritesOnly").checked ? "♥はまだありません" : "見つかりません", "empty"));
  }
  function detail(r, servings = 1) {
    $("detailImage").replaceChildren(dishImage(r));
    $("detailTitle").textContent = r.name;
    $("detailMeta").textContent =
      `${r.type}・約${r.time}分` +
      (r.hot ? "・辛口" : "") +
      (r.kcal == null || r.nutrition?.status === "uncalculated"
        ? ""
        : `・約${r.kcal}kcal（目安）`);
    $("detailServings").textContent = servings;
    $("detailIngredients").replaceChildren(
      ...r.ingredients.map(([name, n, u]) =>
        el("li", name + "： " + qty(n * servings, u)),
      ),
    );
    $("detailSteps").replaceChildren(
      ...r.steps.map((x) => el("li", formatStep(x, servings))),
    );
    $("detailCheck").textContent = r.source === "ai" ? "AI提案のレシピです（未確認）。" : "";
    $("detailStorage").textContent = r.storage;
    $("detail").showModal();
  }
  function selectTab(tab) {
    document
      .querySelector(".tabs")
      .scrollIntoView({ block: "start", behavior: "instant" });
    for (const v of ["usekiri", "recipes"])
      $("page-" + v).classList.toggle("hidden", v !== tab);
    document.querySelectorAll("[data-tab]").forEach((b) => {
      let active = b.dataset.tab === tab;
      b.classList.toggle("active", active);
      b.setAttribute("aria-current", active ? "page" : "false");
    });
  }
  $("recipeSearch").addEventListener("input", renderRecipes);
  $("favoritesOnly").addEventListener("change", renderRecipes);
  $("closeDetail").addEventListener("click", () => $("detail").close());
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) =>
      b.addEventListener("click", () => selectTab(b.dataset.tab)),
    );
  renderRecipes();
  mountUsekiri({
    recipes,
    getFavorites: () => favorites,
    detail,
    el,
    makeBtn,
    qty,
    dateLabel,
  });
}
start().catch((error) => {
  console.error(error);
  document.getElementById("ukMessage").textContent =
    "レシピを読み込めませんでした。通信状況を確認して再読み込みしてください。保存済みデータは維持されています。";
  document
    .querySelectorAll("button,select,input")
    .forEach((control) => (control.disabled = true));
});
