/**
 * Adds a alt text badge to all images on a page.
 */

const addBadgeToImage = (image: HTMLElement) => {
  const button = document.createElement("button");
  button.type = "button";
  button.innerText = "alt";
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    showAltTextPopup(image);
  });

  image.insertAdjacentElement("afterend", button);
};

const showAltTextPopup = (image: HTMLElement) => {
  const dialog = document.createElement("dialog");
  dialog.innerText = image.getAttribute("alt")!;
  image.insertAdjacentElement("afterend", dialog);
  dialog.open = true;

  const controller = new AbortController();
  const signal = controller.signal;

  // Event listener for clicks outside the dialog
  document.addEventListener(
    "click",
    (event: Event) => {
      // Check if the dialog is open and the click target is outside the dialog
      if (dialog.open && !dialog.contains(event.target as HTMLElement)) {
        dialog.open = false;
      }
    },
    { signal }
  );
  dialog.addEventListener(
    "close",
    () => {
      dialog.remove();
      controller.abort();
    },
    { signal }
  );
};

const images = Array.from(
  document.querySelectorAll<HTMLImageElement>(`img[alt]:not(img[alt=""])`)
);
for (const image of images) {
  addBadgeToImage(image);
}

// For later:
//   image.addEventListener("mouseenter", () => {
//   });
