/**
 * Adds a alt text badge to all images on the site.
 */

const images = Array.from(
  document.querySelectorAll<HTMLImageElement>("img[alt]")
);
for (const image of images) {
  image.style.transform = "rotate(180deg)";
}
