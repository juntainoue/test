import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname } from "node:path";
import { formatStep } from "../js/catalog.js";
import { canMakeAhead } from "../js/planner.js";
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
// The app opens on the use-up planner; dish photos appear once data loads.
const openPlanTab = async (page) => {
  await page.locator(".uk-dish-card").first().waitFor();
};
const pickDish = async (page, name) => {
  const card = page.locator("#ukDishGrid .uk-dish-card", { hasText: name });
  if (!(await card.count()) && (await page.locator("#ukMoreDishes").isVisible()))
    await page.click("#ukMoreDishes");
  await card.first().click();
};
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await openPlanTab(page);
  check(
    (await page.locator("[data-tab]").count()) === 2,
    "only planner and recipe tabs remain",
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
  // Browse filters are independent of meal-plan settings and favorites survive reload.
  await page.click("[data-tab=recipes]");
  await page.click("#resetRecipeFilters");
  await page.check("#favoritesOnly");
  check(
    (await page.locator("#recipeGrid .empty").textContent()).includes(
      "お気に入りはまだありません",
    ),
    "empty favorites guidance",
  );
  await page.uncheck("#favoritesOnly");
  await page.fill("#recipeSearch", "麻婆豆腐");
  await page
    .getByRole("button", {
      name: "四川風麻婆豆腐をお気に入りに保存",
      exact: true,
    })
    .click();
  check(
    (await page
      .getByRole("button", {
        name: "四川風麻婆豆腐をお気に入りから解除",
        exact: true,
      })
      .getAttribute("aria-pressed")) === "true",
    "favorite button accessible state",
  );
  await page.reload();
  await openPlanTab(page);
  await page.click("[data-tab=recipes]");
  await page.check("#favoritesOnly");
  check(
    (await page.locator("#recipeGrid .recipe").count()) === 1,
    "favorite persists",
  );
  check(
    (await page.locator("#recipeGrid h3").textContent()) === "四川風麻婆豆腐",
    "correct favorite restored",
  );
  await page
    .getByRole("button", {
      name: "四川風麻婆豆腐をお気に入りから解除",
      exact: true,
    })
    .click();
  check(
    (await page.locator("#recipeGrid .recipe").count()) === 0,
    "remove favorite updates filtered results",
  );
  await page.click("#resetRecipeFilters");
  await page.selectOption("#recipeCuisine", "和食");
  await page.selectOption("#recipeTime", "20");
  const filtered = await page.locator("#recipeGrid h3").allTextContents();
  check(
    filtered.length > 0 &&
      filtered.every(
        (n) => byName.get(n).type === "和食" && byName.get(n).time <= 20,
      ),
    "catalog cuisine and time",
  );
  check(
    (await page.locator("#recipeResults").textContent()).includes(
      String(filtered.length),
    ),
    "search result count",
  );
  await page.selectOption("#recipeSort", "time");
  const times = (await page.locator("#recipeGrid h3").allTextContents()).map(
    (n) => byName.get(n).time,
  );
  check(
    times.every((time, i) => i === 0 || times[i - 1] <= time),
    "catalog time sort",
  );
  await page.click("#resetRecipeFilters");
  check(
    (await page.locator("#recipeGrid .recipe").count()) === 60,
    "clear all catalog filters",
  );
  await page.locator(".hero-link").click();
  check(
    await page.locator("#page-usekiri").isVisible(),
    "hero link opens the use-up planner",
  );
  // Broken images fall back once; no recurring error loop.
  await page.route("**/assets/images/*.webp", (route) => route.abort());
  await page.reload();
  await openPlanTab(page);
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
  // ---- 使い切り計画 (use-up planner) ----
  {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.click("[data-tab=usekiri]");
    const v1Before = await page.evaluate(() => localStorage.getItem("gohan-keikaku-v1"));
    check(await page.locator("#ukPlanCard").isHidden(), "planner: no plan before start");
    check(
      (await page.locator("#ukMakePlan").isDisabled()) &&
        (await page.locator("#ukMakeHint").isVisible()),
      "planner: plan button waits for a dish photo to be chosen",
    );
    check(
      (await page.locator("#ukDishGrid .uk-dish-card img").count()) >= 12,
      "planner: dishes are shown as photo cards",
    );
    await pickDish(page, "鶏の照り焼き");
    check(
      !(await page.locator("#ukMakePlan").isDisabled()) &&
        (await page.locator('#ukDishGrid .uk-dish-card[aria-pressed="true"]').textContent()).includes("鶏の照り焼き"),
      "planner: chosen photo is marked and the button is enabled",
    );
    check(
      (await page.locator("#ukAnchor").textContent()).includes("鶏の照り焼き"),
      "planner: wanted dish selected",
    );
    const dayNames = () => page.locator("#ukPlan .uk-day strong").allTextContents();
    for (let days = 1; days <= 7; days++) {
      await page.selectOption("#ukDays", String(days));
      await page.click("#ukMakePlan");
      const names = await dayNames();
      check(names.length === days && names[0] === "鶏の照り焼き", `planner: ${days} days, dish fixed on day 1`);
      check(new Set(names).size === names.length, `planner: no repeats for ${days} days`);
    }
    await page.selectOption("#ukDays", "4");
    // Home ingredients: names only; a near match is suggested, never auto-picked.
    await page.fill("#ukPantryInput", "きゃべつ");
    await page.click("#ukPantryAdd");
    await page.fill("#ukPantryInput", "鶏肉");
    await page.press("#ukPantryInput", "Enter");
    check(
      (await page.locator("#ukPantrySuggest").textContent()).includes("鶏もも肉"),
      "planner: pantry name suggestions",
    );
    check((await page.locator("#ukPantryList li").count()) === 1, "planner: suggestion not auto-added");
    await page.click("#ukMakePlan");
    const cabbage = page.locator('.uk-item[data-key="きゃべつ|g"]');
    check((await cabbage.count()) === 1, "planner: home ingredient used in plan");
    check(
      (await cabbage.locator(".uk-status").textContent()).includes("未確認") &&
        (await cabbage.locator('input[type="number"]').count()) === 0,
      "planner: home stock not assumed sufficient",
    );
    await cabbage.locator("select").selectOption("buy");
    await cabbage.locator('input[type="number"]').first().fill("200");
    await cabbage.locator('input[type="number"]').first().dispatchEvent("change");
    check(
      (await cabbage.locator(".uk-status").textContent()).includes("残りは計算しません"),
      "planner: home + extra purchase has no computed leftover",
    );
    // Pack sizes: shortage / leftover / exact / mismatch / unknown.
    const chicken = page.locator('.uk-item[data-key="鶏もも肉|g"]');
    const setPack = async (amount, unit = "g") => {
      await chicken.locator("select").selectOption(unit);
      await chicken.locator('input[type="number"]').first().fill(String(amount));
      await chicken.locator('input[type="number"]').first().dispatchEvent("change");
      return chicken.locator(".uk-status").textContent();
    };
    const needed = Number(
      (await chicken.locator(".uk-item-name span").textContent()).match(/必要 ([\d,.]+)g/)[1].replace(/,/g, ""),
    );
    check((await setPack(needed - 30)).includes("30g不足"), "planner: shortage shown");
    check(
      (await page.locator("#ukLeftovers").textContent()).includes("足りない食材"),
      "planner: shortage in summary",
    );
    check((await setPack(needed + 40)).includes("残り40g"), "planner: leftover shown");
    check(
      (await page.locator("#ukLeftovers").textContent()).includes(`鶏もも肉：残り40g`),
      "planner: leftover in summary with amount",
    );
    check((await setPack(needed)).includes("使い切り（残り0g）"), "planner: exact use");
    check((await setPack(1, "個")).includes("単位が違う"), "planner: unit mismatch not converted");
    await chicken.locator("select").selectOption("パック（量不明）");
    check(
      (await chicken.locator(".uk-status").textContent()).includes("量が不明") &&
        (await page.locator("#ukLeftovers").textContent()).includes("残りを計算できていない"),
      "planner: unknown pack size not guessed",
    );
    await setPack(300);
    await page.click("#ukReplan");
    check(
      /入れ替えました|いちばん合っています/.test(await page.locator("#ukReplanMessage").textContent()),
      "planner: re-plan message",
    );
    const afterReplan = await dayNames();
    check(afterReplan[0] === "鶏の照り焼き" && afterReplan.length === 4, "planner: re-plan keeps dish and days");
    check(
      !(await page.locator('.uk-item[data-key="鶏もも肉|g"] .uk-status').textContent()).includes("不足"),
      "planner: re-plan removes the shortage",
    );
    // Swap one day; the rest stays and quantities are recalculated.
    const beforeSwap = await dayNames();
    const neededBefore = await page.locator('.uk-item[data-key="鶏もも肉|g"] .uk-item-name span').textContent();
    await page.locator("#ukPlan .uk-day").nth(1).getByRole("button", { name: "この日だけ交換" }).click();
    check(
      (await page.locator("#ukPlan .uk-swap .uk-dish-card img").count()) >= 2,
      "planner: swap shows photo choices",
    );
    await page.locator("#ukPlan .uk-swap .uk-dish-card").first().click();
    const afterSwap = await dayNames();
    check(
      afterSwap[1] !== beforeSwap[1] && afterSwap.filter((_, i) => i !== 1).join() === beforeSwap.filter((_, i) => i !== 1).join(),
      "planner: swap changes only that day",
    );
    const usesSwapped = byName.get(afterSwap[1]).ingredients.some((i) => i[0] === "鶏もも肉");
    const usedBefore = byName.get(beforeSwap[1]).ingredients.some((i) => i[0] === "鶏もも肉");
    if (usesSwapped || usedBefore)
      check(
        (await page.locator('.uk-item[data-key="鶏もも肉|g"] .uk-item-name span').textContent()) !== neededBefore,
        "planner: swap recalculates quantities",
      );
    check(
      (await page.locator("#ukPlan .uk-day").first().getByRole("button", { name: "この日だけ交換" }).count()) === 0,
      "planner: chosen dish is fixed (no swap button on day 1)",
    );
    await page.click("#ukRegenerate");
    check((await dayNames())[0] === "鶏の照り焼き", "planner: regenerate keeps chosen dish");
    // Cooking history: "作った" marks a dish as familiar.
    await page.locator("#ukPlan .uk-day").first().getByRole("button", { name: "作った" }).click();
    check(
      (await page.locator("#ukPlan .uk-day").first().textContent()).includes("定番（作った記録1回）"),
      "planner: cooking history recorded",
    );
    check(
      (await page.locator("#ukPlan .uk-day").nth(1).textContent()).includes("調理記録なし"),
      "planner: other dishes are 'no record', not 'never cooked'",
    );
    await page.click("#ukCopy");
    check(
      (await page.evaluate(() => navigator.clipboard.readText())).includes("鶏もも肉"),
      "planner: copy shopping list",
    );
    // Saved separately; the existing plan data is untouched.
    const planNow = await dayNames();
    await page.reload();
    await page.locator("#ukPlan .uk-day").first().waitFor();
    check((await dayNames()).join() === planNow.join(), "planner: plan persists after reload");
    check(
      (await page.locator('.uk-item[data-key="鶏もも肉|g"] input[type="number"]').first().inputValue()) === "300",
      "planner: pack size persists",
    );
    check(
      (await page.evaluate(() => localStorage.getItem("gohan-keikaku-v1"))) === v1Before,
      "planner: existing v1 data untouched",
    );
    // Time limit and make-ahead conditions.
    await page.selectOption("#ukTime", "15");
    await page.selectOption("#ukDays", "5");
    await page.click("#ukMakePlan");
    const timed = await dayNames();
    check(
      timed.slice(1).every((n) => byName.get(n).time <= 15),
      "planner: time limit respected",
    );
    check(
      (await page.locator("#ukWarnings").textContent()).includes("調理時間の条件"),
      "planner: chosen dish over time limit is warned",
    );
    await page.selectOption("#ukTime", "");
    await page.selectOption("#ukDays", "7");
    await page.selectOption("#ukMakeAhead", "yes");
    await page.click("#ukMakePlan");
    const days7 = page.locator("#ukPlan .uk-day");
    check((await days7.count()) === 7, "planner: 7 days with make-ahead");
    for (let i = 0; i < 7; i++) {
      const text = await days7.nth(i).textContent();
      if (text.includes("2日分まとめて作る")) {
        const name = await days7.nth(i).locator("strong").textContent();
        check(canMakeAhead(byName.get(name)), `planner: make-ahead allowed for ${name}`);
        await days7.nth(i).getByRole("button", { name: "レシピ" }).click();
        const steps = await page.locator("#detailSteps li").allTextContents();
        check(
          (await page.locator("#detailServings").textContent()) === "2" &&
            steps.every((t, k) => t === formatStep(byName.get(name).steps[k], 2)),
          "planner: make-ahead recipe shows 2 servings with scaled water",
        );
        await page.click("#closeDetail");
        check(
          (await days7.nth(i + 1).textContent()).includes("前日の作り置き"),
          "planner: next day eats the made-ahead dish",
        );
      }
    }
    await page.selectOption("#ukMakeAhead", "no");
    await page.selectOption("#ukDays", "3");
    await page.click("#ukMakePlan");
    // Freeze setting changes the storage advice.
    await page.selectOption("#ukFreeze", "no");
    await setPack(2000);
    const advice = await page.locator("#ukLeftovers").textContent();
    check(advice.includes("冷蔵で使う場合") && !advice.includes("冷凍する場合"), "planner: no freezing advice when freezing is off");
    await page.selectOption("#ukFreeze", "yes");
    check(
      (await page.locator("#ukLeftovers").textContent()).includes("冷凍する場合"),
      "planner: freezing advice when allowed",
    );
    // Phones: no horizontal overflow on the planner.
    for (const width of [320, 375, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      check(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `planner: no horizontal overflow ${width}`,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#ukShopCard").scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(root, "test-results/usekiri-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 1000 });

    // AI: not connected by default; failures and invalid output are shown.
    await page.click("#ukAi");
    await page.waitForFunction(() => document.querySelector("#ukAiMessage").textContent.includes("接続していません"));
    check(true, "planner: AI not configured message");
    const good = {
      name: "鶏むね肉とキャベツのレモン蒸し",
      type: "和食",
      time: 20,
      hot: false,
      kcal: 999,
      ingredients: [
        { name: "鶏むね肉", amount: 150, unit: "g", category: "肉・魚" },
        { name: "キャベツ", amount: 120, unit: "g", category: "野菜" },
      ],
      steps: [
        "鶏むね肉をそぎ切りにし、キャベツはざく切りにする。",
        "キャベツと鶏むね肉を重ねて水50mlを加え、ふたをして弱めの中火で8分蒸し、中まで白くなったことを確認する。",
      ],
    };
    const bad = { ...good, name: "生焼けチキン", steps: ["鶏むね肉とキャベツを切って器に盛る。", "そのまま食べる。"] };
    let aiResponse = { status: 429, body: "{}" };
    await page.route("**/data/ai-config.json", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ endpoint: "/test/meal-planner/mock-ai" }) }),
    );
    await page.route("**/mock-ai", (route) =>
      route.fulfill({ status: aiResponse.status, contentType: "application/json", body: aiResponse.body }),
    );
    await page.reload();
    await page.locator("#ukPlan .uk-day").first().waitFor();
    await page.waitForTimeout(200);
    const askAi = async () => {
      await page.evaluate(() => (document.querySelector("#ukAiMessage").textContent = ""));
      await page.click("#ukAi");
      await page.waitForFunction(() => {
        const t = document.querySelector("#ukAiMessage").textContent;
        return t && !t.includes("問い合わせています");
      });
      return page.locator("#ukAiMessage").textContent();
    };
    check((await askAi()).includes("上限"), "planner: AI limit shown");
    aiResponse = { status: 502, body: "{}" };
    check((await askAi()).includes("エラー 502"), "planner: AI server error shown");
    aiResponse = { status: 200, body: "<html>" };
    check((await askAi()).includes("読み取れません"), "planner: AI unreadable response shown");
    aiResponse = { status: 200, body: JSON.stringify({ schemaVersion: 1, recipes: [good, bad] }) };
    check((await askAi()).includes("1品が自動チェックを通過"), "planner: valid AI recipe accepted");
    check(
      (await page.locator("#ukAiRejected").textContent()).includes("生焼けチキン"),
      "planner: unsafe AI recipe rejected with reason",
    );
    await pickDish(page, "レモン蒸し");
    await page.click("#ukMakePlan");
    await page.locator("#ukPlan .uk-day").first().getByRole("button", { name: "レシピ" }).click();
    check(
      (await page.locator("#detailMeta").textContent()).includes("栄養値は未計算") &&
        !(await page.locator("#detailMeta").textContent()).includes("999"),
      "planner: AI nutrition not shown",
    );
    check(
      (await page.locator("#detailImage figcaption").textContent()).includes("準備中"),
      "planner: AI recipe has no borrowed photo",
    );
    await page.click("#closeDetail");
    check(
      (await page.locator("#ukPlan .uk-day").first().textContent()).includes("AI提案・未検証"),
      "planner: AI recipe labelled",
    );
    await page.unroute("**/data/ai-config.json");
    await page.unroute("**/mock-ai");
  }
  // Damaged planner data recovers; the old v1 plan data is kept untouched.
  await page.evaluate(() => {
    localStorage.setItem("gohan-keikaku-usekiri-v1", "{bad");
    localStorage.setItem(
      "gohan-keikaku-v1",
      JSON.stringify({ days: 3, servings: 2, plan: ["mapo", "ginger", "chicken"], checked: {} }),
    );
  });
  await page.reload();
  await openPlanTab(page);
  check(
    (await page.locator("#ukPlan .uk-day").count()) === 0 &&
      (await page.locator("#ukMakePlan").isDisabled()),
    "damaged planner data starts fresh",
  );
  check(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("gohan-keikaku-v1")).plan[0] === "mapo",
    ),
    "old v1 plan data is not deleted",
  );
  await page.route("**/data/recipes.json", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#ukMakePlan").disabled && document.querySelector("#recipeSearch").disabled,
  );
  check(
    (await page.locator("#ukMessage").textContent()).includes(
      "読み込めませんでした",
    ),
    "catalog failure visible on the first tab",
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
