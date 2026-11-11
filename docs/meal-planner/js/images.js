import { isLocalImage } from "./catalog.js";

/** Shared for plan cards, recipe search and recipe detail. No third-party image requests. */
export function dishImage(recipe) {
  const figure = document.createElement("figure");
  figure.className = "dish-figure";
  const image = document.createElement("img");
  image.className = "dish-image";
  image.width = 640;
  image.height = 640;
  image.loading = "lazy";
  image.decoding = "async";
  const caption = document.createElement("figcaption");
  caption.className = "image-caption";
  const placeholder = () => {
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
    image.src = new URL(
      "../assets/images/placeholder.svg",
      import.meta.url,
    ).href;
    image.alt = recipe.name + "（料理画像は準備中）";
    caption.textContent = "料理画像は準備中";
  };
  const metadata = recipe.image;
  if (
    metadata?.status === "ready" &&
    isLocalImage(metadata.src) &&
    isLocalImage(metadata.srcSmall)
  ) {
    image.alt = metadata.alt + "（AI生成）";
    image.sizes = "(max-width: 600px) 90vw, (max-width: 900px) 43vw, 320px";
    image.srcset = `${new URL("../" + metadata.srcSmall, import.meta.url).href} 320w, ${new URL("../" + metadata.src, import.meta.url).href} 640w`;
    image.src = new URL("../" + metadata.src, import.meta.url).href;
    caption.textContent = "AI生成の盛り付けイメージ";
    image.addEventListener("error", placeholder, { once: true });
  } else placeholder();
  figure.append(image, caption);
  return figure;
}
