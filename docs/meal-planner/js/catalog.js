/** All quantities and provisional nutrition values are for baseServings (currently 1). */
export function rangeMatch(value, type, range) {
  if (range === "all") return true;
  const [lower, upper] = type === "calorie" ? [400, 600] : [25, 35];
  return range === "low"
    ? value < lower
    : range === "middle"
      ? value >= lower && value < upper
      : value >= upper;
}

export function filterRecipes(recipes, settings) {
  return recipes.filter(
    (recipe) =>
      (settings.cuisine === "all" || recipe.type === settings.cuisine) &&
      (settings.spicy !== "mild" || !recipe.hot) &&
      rangeMatch(recipe.kcal, "calorie", settings.calorie) &&
      rangeMatch(recipe.protein, "protein", settings.protein),
  );
}

/** Fail clearly on corrupt/unsupported catalogs; do not overwrite saved plans. */
export function validateCatalog(data) {
  if (
    data.schemaVersion !== 1 ||
    !Array.isArray(data.recipes) ||
    !data.recipes.length
  )
    throw new Error("Unsupported or empty recipe catalog");
  const ids = new Set();
  for (const recipe of data.recipes) {
    if (!/^[a-z][a-z0-9_]*$/.test(recipe.id) || ids.has(recipe.id))
      throw new Error("Invalid/duplicate recipe id");
    ids.add(recipe.id);
    for (const field of ["name", "type", "storage"])
      if (typeof recipe[field] !== "string" || !recipe[field].trim())
        throw new Error(`Missing ${field}: ${recipe.id}`);
    if (
      recipe.baseServings !== 1 ||
      typeof recipe.hot !== "boolean" ||
      ![recipe.time, recipe.kcal, recipe.protein].every(
        (n) => Number.isFinite(n) && n >= 0,
      )
    )
      throw new Error(`Invalid recipe values: ${recipe.id}`);
    if (
      !Array.isArray(recipe.ingredients) ||
      !recipe.ingredients.length ||
      recipe.ingredients.some(
        (item) =>
          !Array.isArray(item) ||
          item.length !== 4 ||
          ![item[0], item[2], item[3]].every(
            (s) => typeof s === "string" && s.trim(),
          ) ||
          !Number.isFinite(item[1]) ||
          item[1] <= 0,
      )
    )
      throw new Error(`Invalid ingredients: ${recipe.id}`);
    if (
      !Array.isArray(recipe.steps) ||
      !recipe.steps.length ||
      !recipe.steps.every((step) => typeof step === "string" && step.trim())
    )
      throw new Error(`Invalid steps: ${recipe.id}`);
    if (recipe.nutrition?.status !== "provisional")
      throw new Error(
        "Verified nutrition requires a future validated calculation schema",
      );
    if (!recipe.image || !["pending", "ready"].includes(recipe.image.status))
      throw new Error(`Invalid image: ${recipe.id}`);
    if (
      recipe.image.status === "ready" &&
      (!recipe.image.source ||
        !recipe.image.rights ||
        !recipe.image.reviewedAt ||
        !isLocalImage(recipe.image.src) ||
        !isLocalImage(recipe.image.srcSmall))
    )
      throw new Error(`Unreviewed image: ${recipe.id}`);
  }
  return data;
}

export function isLocalImage(path) {
  return (
    typeof path === "string" &&
    /^assets\/images\/[a-z0-9_-]+(?:-320)?\.webp$/.test(path)
  );
}

/** Independent catalog browsing; does not modify meal-plan conditions. */
export function searchRecipes(
  recipes,
  {
    query = "",
    cuisine = "all",
    maxTime = "all",
    sort = "default",
    favoritesOnly = false,
  },
  favorites = new Set(),
) {
  const words = query
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const matches = recipes.filter((recipe) => {
    const text = [
      recipe.name,
      recipe.type,
      ...recipe.ingredients.map((i) => i[0]),
    ]
      .join(" ")
      .normalize("NFKC")
      .toLocaleLowerCase("ja");
    return (
      words.every((word) => text.includes(word)) &&
      (cuisine === "all" || recipe.type === cuisine) &&
      (maxTime === "all" || recipe.time <= Number(maxTime)) &&
      (!favoritesOnly || favorites.has(recipe.id))
    );
  });
  if (sort === "time") matches.sort((a, b) => a.time - b.time);
  if (sort === "protein") matches.sort((a, b) => b.protein - a.protein);
  return matches;
}
