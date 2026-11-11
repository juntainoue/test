import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(
  await readFile(resolve(root, "data/recipes.json")),
).recipes;
const byName = new Map(catalog.map((r) => [r.name, r]));
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
// Serve under the real Pages subpath, not just at /.
const server = createServer(async (req, res) => {
  try {
    if (!req.url.startsWith("/test/meal-planner/")) {
      res.writeHead(404).end();
      return;
    }
    const name =
      decodeURIComponent(
        req.url.split("?")[0].slice("/test/meal-planner/".length),
      ) || "index.html";
    const path = resolve(root, name);
    if (!path.startsWith(root)) throw new Error("Invalid path");
    res.setHeader(
      "Content-Type",
      mime[extname(path)] || "application/octet-stream",
    );
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const url = `http://127.0.0.1:${server.address().port}/test/meal-planner/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [];
let checks = 0;
const check = (value, message) => {
  assert.ok(value, message);
  checks++;
};
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.locator("#planGrid .meal").first().waitFor();
  check(
    (await page.locator("#planGrid .meal").count()) === 7,
    "initial seven days",
  );
  const original = await page.locator("#planGrid h3").allTextContents();
  await page
    .locator("#planGrid .meal")
    .first()
    .getByRole("button", { name: "別の料理に" })
    .click();
  check(
    (await page.locator("#planGrid h3").first().textContent()) !== original[0],
    "swap changes day",
  );
  for (const calorie of ["all", "low", "middle", "high"])
    for (const protein of ["all", "low", "middle", "high"]) {
      const previous = await page.locator("#planGrid h3").allTextContents();
      await page.selectOption("#calorie", calorie);
      await page.selectOption("#protein", protein);
      await page.click("#generate");
      const match = catalog.filter(
        (r) =>
          (calorie === "all" ||
            (calorie === "low"
              ? r.kcal < 400
              : calorie === "middle"
                ? r.kcal >= 400 && r.kcal < 600
                : r.kcal >= 600)) &&
          (protein === "all" ||
            (protein === "low"
              ? r.protein < 25
              : protein === "middle"
                ? r.protein >= 25 && r.protein < 35
                : r.protein >= 35)),
      );
      const names = await page.locator("#planGrid h3").allTextContents();
      if (match.length) {
        check(
          names.length === 7 &&
            names.every((n) => match.some((r) => r.name === n)),
          `UI filters ${calorie}/${protein}`,
        );
      } else {
        check(
          (await page.locator("#filterMessage").textContent()).includes(
            "一致する料理がありません",
          ),
          "no match visible",
        );
        assert.deepEqual(names, previous);
        checks++;
      }
    }
  await page.selectOption("#calorie", "all");
  await page.selectOption("#protein", "all");
  await page.selectOption("#cuisine", "中華");
  await page.selectOption("#spicy", "mild");
  await page.click("#generate");
  check(
    (await page.locator("#planGrid h3").allTextContents()).every(
      (n) => byName.get(n).type === "中華" && !byName.get(n).hot,
    ),
    "cuisine and mild",
  );
  await page.selectOption("#cuisine", "all");
  await page.selectOption("#spicy", "all");
  await page.selectOption("#days", "3");
  await page.click("#generate");
  check((await page.locator("#planGrid .meal").count()) === 3, "three days");
  for (const servings of ["1", "2", "3", "4"]) {
    await page.selectOption("#servings", servings);
    const names = await page.locator("#planGrid h3").allTextContents();
    const first = byName.get(names[0]);
    await page
      .locator("#planGrid .meal")
      .first()
      .getByRole("button", { name: "レシピを見る" })
      .click();
    check(
      (await page.locator("#detailServings").textContent()) === servings,
      "detail servings",
    );
    const [name, amount, unit] = first.ingredients[0];
    check(
      (
        await page.locator("#detailIngredients li").first().textContent()
      ).includes(
        `${name}： ${Math.round(amount * Number(servings) * 100) / 100}${unit}`,
      ),
      "scaled detail ingredients",
    );
    await page.click("#closeDetail");
    await page.click("[data-tab=shop]");
    const expected = new Map();
    for (const n of names)
      for (const [name, a, u] of byName.get(n).ingredients) {
        const k = name + "|" + u;
        expected.set(k, (expected.get(k) || 0) + a * Number(servings));
      }
    const rows = await page.locator(".shopping-row").all();
    check(rows.length === expected.size, "combined shopping count");
    for (const row of rows) {
      const item = await row.locator(".item").textContent();
      const quantity = await row.locator(".qty").textContent();
      check(
        [...expected].some(
          ([k, a]) =>
            k.split("|")[0] === item &&
            quantity ===
              (Math.round(a * 100) / 100).toLocaleString("ja-JP", {
                maximumFractionDigits: 2,
              }) +
                k.split("|")[1],
        ),
        "combined quantity",
      );
    }
    await page.click("[data-tab=plan]");
  }
  await page.click("[data-tab=shop]");
  await page.locator(".shopping-row input").first().check();
  await page.reload();
  await page.locator("#planGrid .meal").first().waitFor();
  await page.click("[data-tab=shop]");
  check(
    await page.locator(".shopping-row input").first().isChecked(),
    "persist shopping",
  );
  await page.click("#copyShop");
  check(
    (await page.evaluate(() => navigator.clipboard.readText())).includes("【"),
    "copy shopping list",
  );
  await page.click("#resetChecks");
  check(
    (await page.locator(".shopping-row.done").count()) === 0,
    "reset checks",
  );
  await page.click("[data-tab=recipes]");
  check(
    (await page.locator("#recipeGrid .recipe").count()) === 60,
    "60 recipe cards",
  );
  await page.fill("#recipeSearch", "麻婆豆腐");
  check(
    (await page.locator("#recipeGrid .recipe").count()) === 1,
    "name search",
  );
  await page.locator("#recipeGrid img").first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("#recipeGrid img")].every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  );
  check(true, "image loads");
  await page.fill("#recipeSearch", "存在しない料理xyz");
  check(
    (await page.locator("#recipeGrid .empty").count()) === 1,
    "empty search",
  );
  await page.fill("#recipeSearch", "");
  for (const recipe of catalog.filter((r) => r.image.status === "ready")) {
    await page.fill("#recipeSearch", recipe.name);
    const photo = page.locator("#recipeGrid img").first();
    await photo.scrollIntoViewIfNeeded();
    await photo.evaluate((img) => img.decode());
    check(
      await photo.evaluate(
        (img) => img.naturalWidth >= 320 && img.src.endsWith(".webp"),
      ),
      `ready photo loads: ${recipe.id}`,
    );
  }
  await page.fill("#recipeSearch", "豆腐");
  check(
    (await page.locator("#recipeGrid .recipe").count()) > 1,
    "ingredient search",
  );
  await page.fill("#recipeSearch", "");
  await page.evaluate(() => scrollTo(0, 0));
  await mkdir(resolve(root, "test-results"), { recursive: true });
  await page.screenshot({
    path: resolve(root, "test-results/desktop.png"),
    fullPage: false,
  });
  for (const width of [320, 375, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `no horizontal overflow ${width}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: resolve(root, "test-results/mobile.png"),
    fullPage: false,
  });
  await page.click("[data-tab=plan]");
  page.once("dialog", (dialog) => dialog.accept());
  await page.click("#clearPlan");
  check((await page.locator("#planGrid .meal").count()) === 0, "clear plan");
  // Broken images fall back once; no recurring error loop.
  await page.route("**/assets/images/*.webp", (route) => route.abort());
  await page.reload();
  await page.locator("#planGrid .meal").first().waitFor();
  await page.click("[data-tab=recipes]");
  await page.fill("#recipeSearch", "麻婆豆腐");
  await page.locator("#recipeGrid img").scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    document.querySelector("#recipeGrid img").src.endsWith("placeholder.svg"),
  );
  check(
    (await page.locator("#recipeGrid figcaption").textContent()).includes(
      "準備中",
    ),
    "image failure fallback",
  );
  // Corrupt local storage recovers; existing v1 plans and IDs remain usable.
  await page.evaluate(() => localStorage.setItem("gohan-keikaku-v1", "{bad"));
  await page.reload();
  await page.locator("#planGrid .meal").first().waitFor();
  check(
    (await page.locator("#planGrid .meal").count()) === 7,
    "corrupt storage recovery",
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "gohan-keikaku-v1",
      JSON.stringify({
        days: 3,
        servings: 2,
        plan: ["mapo", "ginger", "chicken"],
        checked: { "豆腐|g": true },
        cuisine: "all",
        spicy: "all",
        calorie: "all",
        protein: "all",
      }),
    ),
  );
  await page.reload();
  await page.locator("#planGrid .meal").first().waitFor();
  assert.deepEqual(await page.locator("#planGrid h3").allTextContents(), [
    "四川風麻婆豆腐",
    "豚の生姜焼き",
    "鶏の照り焼き",
  ]);
  checks++;
  check(
    (await page.locator("#servings").inputValue()) === "2",
    "v1 settings retained",
  );
  await page.route("**/data/recipes.json", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#generate").disabled,
  );
  check(
    (await page.locator("#filterMessage").textContent()).includes(
      "読み込めませんでした",
    ),
    "catalog failure visible",
  );
  check(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("gohan-keikaku-v1")).plan[0] === "mapo",
    ),
    "catalog failure preserves saved data",
  );
  assert.deepEqual(errors, []);
  checks++;
  console.log(
    `Browser checks passed: ${checks}; desktop and mobile screenshots in test-results/`,
  );
} finally {
  await browser.close();
  await new Promise((ok) => server.close(ok));
}
