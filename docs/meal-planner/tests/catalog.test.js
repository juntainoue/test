import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { validateCatalog, rangeMatch, filterRecipes } from "../js/catalog.js";
const data = JSON.parse(
  readFileSync(new URL("../data/recipes.json", import.meta.url)),
);
const all = { cuisine: "all", spicy: "all", calorie: "all", protein: "all" };

test("60 existing complete recipes and stable unique IDs", () => {
  assert.equal(validateCatalog(data).recipes.length, 60);
  for (const r of data.recipes) {
    assert.equal(r.nutrition.status, "provisional");
    if (r.image.status === "ready") {
      for (const field of ["src", "srcSmall"])
        assert.ok(existsSync(new URL("../" + r.image[field], import.meta.url)));
    }
  }
});
test("catalog can grow to 100 without changes to application code", () => {
  const expanded = structuredClone(data);
  for (let i = 0; i < 40; i++)
    expanded.recipes.push({
      ...structuredClone(data.recipes[0]),
      id: `fixture_${i}`,
    });
  assert.equal(validateCatalog(expanded).recipes.length, 100);
  assert.equal(filterRecipes(expanded.recipes, all).length, 100);
});
test("calorie and protein boundaries", () => {
  for (const [type, lower, upper] of [
    ["calorie", 400, 600],
    ["protein", 25, 35],
  ]) {
    for (const value of [
      0,
      lower - 0.01,
      lower,
      upper - 0.01,
      upper,
      upper + 1,
    ]) {
      assert.equal(rangeMatch(value, type, "low"), value < lower);
      assert.equal(
        rangeMatch(value, type, "middle"),
        value >= lower && value < upper,
      );
      assert.equal(rangeMatch(value, type, "high"), value >= upper);
      assert.equal(rangeMatch(value, type, "all"), true);
    }
  }
});
test("every filter combination respects every constraint, including zero matches", () => {
  for (const cuisine of ["all", "和食", "中華", "洋食"])
    for (const spicy of ["all", "mild", "hot"])
      for (const calorie of ["all", "low", "middle", "high"])
        for (const protein of ["all", "low", "middle", "high"]) {
          const actual = filterRecipes(data.recipes, {
            cuisine,
            spicy,
            calorie,
            protein,
          });
          const expected = data.recipes.filter(
            (r) =>
              (cuisine === "all" || r.type === cuisine) &&
              (spicy !== "mild" || !r.hot) &&
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
          assert.deepEqual(actual, expected);
        }
});
test("reject duplicate IDs, incomplete recipes, unreviewed images and remote paths", () => {
  for (const mutate of [
    (d) => d.recipes.push(d.recipes[0]),
    (d) => (d.recipes[0].ingredients[0][1] = -1),
    (d) => (d.recipes[0].steps = []),
    (d) =>
      (d.recipes[0].image = {
        status: "ready",
        src: "https://example.com/a.webp",
      }),
  ]) {
    const broken = structuredClone(data);
    mutate(broken);
    assert.throws(() => validateCatalog(broken));
  }
});

test("representative 20 photos have a rights record and fit image budgets", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../data/image-manifest.json", import.meta.url)),
  );
  const ready = data.recipes.filter((r) => r.image.status === "ready");
  assert.equal(ready.length, 20);
  assert.equal(manifest.images.length, 20);
  assert.match(manifest.rights.url, /^https:\/\/openai.com\/policies\//);
  for (const recipe of ready) {
    const entry = manifest.images.find((i) => i.recipeId === recipe.id);
    assert.ok(entry?.originalSha256);
    assert.ok(entry.review.checkedAt);
    assert.equal(entry.assets.length, 2);
    for (const asset of entry.assets) {
      const bytes = readFileSync(new URL("../" + asset.src, import.meta.url));
      assert.equal(bytes.length, asset.bytes);
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
      assert.ok(bytes.length <= (asset.src.includes("-320") ? 60000 : 150000));
    }
  }
});
