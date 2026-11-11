import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateCatalog, formatStep } from "../js/catalog.js";
const data = JSON.parse(
  readFileSync(new URL("../data/recipes.json", import.meta.url)),
);

// Short names used in steps for ingredients listed with a longer name.
const aliases = {
  豚ひき肉: "ひき肉",
  合いびき肉: "ひき肉",
  鶏ひき肉: "ひき肉",
  豚こま肉: "豚肉",
  豚バラ肉: "豚肉",
  豚ロース肉: "豚肉",
  鶏もも肉: "鶏肉",
  鶏むね肉: "鶏肉",
  牛こま肉: "牛肉",
  生鮭: "鮭",
  むきえび: "えび",
  木綿豆腐: "豆腐",
  たけのこ水煮: "たけのこ",
  カレールウ: "ルウ",
  ツナ缶: "ツナ",
  かつおたたき: "かつお",
  餃子の皮: "皮",
  シュウマイの皮: "皮",
  米: "ごはん",
};
const oldGenericSteps = [
  "食材を食べやすい大きさに切る。",
  "火の通りにくい食材から炒める",
  "必要な食材を軽く炒め",
  "主な食材を調味料とともに十分に加熱する",
  "具材を切って炒め、ソースを作る",
  "必要に応じて薄切りにする",
];
// Processed or raw-by-design items that need no doneness check in steps.
const noDonenessCheck = new Set(["ベーコン", "ツナ缶"]);

test("every recipe step mentions each listed ingredient", () => {
  for (const r of data.recipes) {
    const text = r.steps.join("");
    for (const [name] of r.ingredients)
      assert.ok(
        text.includes(name) || (aliases[name] && text.includes(aliases[name])),
        `${r.id}: ${name} is not used in the steps`,
      );
  }
});

test("ingredients are listed once and steps are recipe-specific", () => {
  for (const r of data.recipes) {
    const keys = r.ingredients.map(([name, , unit]) => name + "|" + unit);
    assert.equal(new Set(keys).size, keys.length, `${r.id}: duplicate`);
    assert.ok(r.steps.length >= 3, `${r.id}: too few steps`);
    assert.ok(r.steps.join("").includes("分"), `${r.id}: no heating time`);
    for (const phrase of oldGenericSteps)
      assert.ok(
        !r.steps.some((s) => s.includes(phrase)),
        `${r.id}: generic step "${phrase}"`,
      );
  }
});

test("meat, fish and egg dishes say how to confirm they are cooked", () => {
  const words = ["確認", "完全に", "中まで", "火を通", "火が通", "固まる"];
  for (const r of data.recipes) {
    const text = r.steps.join("");
    const needsCheck = r.ingredients.some(
      ([name, , , category]) =>
        (category === "肉・魚" && !noDonenessCheck.has(name)) || name === "卵",
    );
    if (!needsCheck) continue;
    if (r.id === "katsuo") {
      assert.ok(text.includes("生食用"), "raw fish must be sashimi grade");
      continue;
    }
    const softEggWarning =
      text.includes("半熟仕上げ") && text.includes("作りたて");
    assert.ok(
      words.some((w) => text.includes(w)) || softEggWarning,
      `${r.id}: no doneness check`,
    );
  }
});

test("step water amounts scale with servings like the ingredients", () => {
  assert.equal(formatStep("水{{150|ml}}を加える。", 1), "水150mlを加える。");
  assert.equal(formatStep("水{{150|ml}}を加える。", 4), "水600mlを加える。");
  assert.equal(formatStep("塩{{0.5|g}}と水{{70|ml}}", 3), "塩1.5gと水210ml");
  assert.equal(formatStep("中火で5分煮る。", 4), "中火で5分煮る。");
  for (const r of data.recipes)
    for (const s of r.steps)
      assert.ok(!/[{}]/.test(formatStep(s, 2)), `${r.id}: broken token`);
});

test("malformed step quantities and review records are rejected", () => {
  const broken = structuredClone(data);
  broken.recipes[0].steps[0] = "水{{abc|ml}}を加える。";
  assert.throws(() => validateCatalog(broken), /Invalid step quantity/);
  const unreviewed = structuredClone(data);
  unreviewed.recipes[0].recipeCheck = { status: "verified" };
  assert.throws(() => validateCatalog(unreviewed), /Invalid recipe check/);
});

test("all 60 recipes are desk-reviewed only, not cook-tested", () => {
  for (const r of data.recipes)
    assert.deepEqual(
      [r.recipeCheck.status, r.recipeCheck.cookTested],
      ["desk-reviewed", false],
      r.id,
    );
});
