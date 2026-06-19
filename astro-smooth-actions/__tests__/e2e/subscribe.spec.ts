import { expect, test, type Locator } from "@playwright/test";

const pagePath = "/";

const fillSubscribeForm = async (
  form: Locator,
  email: string,
  handle: string,
) => {
  await form.getByRole("textbox", { name: "Email" }).fill(email);
  await form.getByRole("textbox", { name: "Handle" }).fill(handle);
};

const submitSubscribeForm = async (form: Locator) => {
  await form.getByRole("button", { name: "Subscribe" }).click();
};

test.describe("subscribe form", () => {
  test("submits valid native form data once", async ({ page }) => {
    await page.goto(pagePath);

    const form = page.getByRole("form", { name: "Primary subscribe" });
    await fillSubscribeForm(form, "bobatan@fujocoded.com", "bobatan");
    await submitSubscribeForm(form);

    await expect(page).toHaveURL(pagePath);
    await expect(
      page.getByText("Confirmed for bobatan@fujocoded.com as bobatan."),
    ).toBeVisible();
    await expect(
      page.getByText("Restored form: primary-subscribe"),
    ).toBeVisible();
    await expect(
      page.getByText("Restored form: secondary-subscribe"),
    ).toBeHidden();
    await expect(page.getByText("Restored form: unsubscribe")).toBeHidden();

    await page.reload();

    await expect(
      page.getByText("Confirmed for bobatan@fujocoded.com as bobatan."),
    ).toBeHidden();
    await expect(
      page.getByText("Restored form: primary-subscribe"),
    ).toBeHidden();
  });

  test("redirects server action errors back to the page", async ({ page }) => {
    await page.goto(pagePath);

    const form = page.getByRole("form", { name: "Primary subscribe" });
    await fillSubscribeForm(form, "blocked@blocked.test", "blocked");
    await submitSubscribeForm(form);

    await expect(page).toHaveURL(pagePath);
    await expect(
      page.getByText("This domain is temporarily blocked."),
    ).toBeVisible();
    await expect(
      page.getByText("Restored form: primary-subscribe"),
    ).toBeVisible();
  });

  test("replaces a first-form error with a second-form success", async ({
    page,
  }) => {
    await page.goto(pagePath);

    const primaryForm = page.getByRole("form", { name: "Primary subscribe" });
    await fillSubscribeForm(primaryForm, "blocked@blocked.test", "blocked");
    await submitSubscribeForm(primaryForm);

    await expect(
      page.getByText("This domain is temporarily blocked."),
    ).toBeVisible();
    await expect(
      page.getByText("Restored form: primary-subscribe"),
    ).toBeVisible();

    const secondaryForm = page.getByRole("form", {
      name: "Secondary subscribe",
    });
    await fillSubscribeForm(
      secondaryForm,
      "itscypher@fujocoded.com",
      "itscypher",
    );
    await submitSubscribeForm(secondaryForm);

    await expect(page).toHaveURL(pagePath);
    await expect(
      page.getByText("Confirmed for itscypher@fujocoded.com as itscypher."),
    ).toBeVisible();
    await expect(
      page.getByText("Restored form: secondary-subscribe"),
    ).toBeVisible();
    await expect(
      page.getByText("This domain is temporarily blocked."),
    ).toBeHidden();
    await expect(
      page.getByText("Restored form: primary-subscribe"),
    ).toBeHidden();
  });

  test("keeps different action results separate on the same page", async ({
    page,
  }) => {
    await page.goto(pagePath);

    const form = page.getByRole("form", { name: "Unsubscribe" });
    await form
      .getByRole("textbox", { name: "Email" })
      .fill("bobatan@fujocoded.com");
    await form.getByRole("button", { name: "Unsubscribe" }).click();

    await expect(page).toHaveURL(pagePath);
    await expect(
      page.getByText("Unsubscribed bobatan@fujocoded.com."),
    ).toBeVisible();
    await expect(page.getByText("Restored form: unsubscribe")).toBeVisible();
    await expect(page.getByText(/Confirmed for .* as .*\./)).toBeHidden();
    await expect(
      page.getByText("Restored form: primary-subscribe"),
    ).toBeHidden();
    await expect(
      page.getByText("Restored form: secondary-subscribe"),
    ).toBeHidden();
  });

  test("keeps same-server action results isolated between browser contexts", async ({
    browser,
    baseURL,
  }) => {
    const firstContext = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
    });
    const secondContext = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
    });

    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();

    try {
      await Promise.all([firstPage.goto(pagePath), secondPage.goto(pagePath)]);

      const firstForm = firstPage.getByRole("form", {
        name: "Primary subscribe",
      });
      const secondForm = secondPage.getByRole("form", {
        name: "Secondary subscribe",
      });

      await fillSubscribeForm(firstForm, "bobatan@fujocoded.com", "bobatan");
      await fillSubscribeForm(
        secondForm,
        "itscypher@fujocoded.com",
        "itscypher",
      );
      await Promise.all([
        submitSubscribeForm(firstForm),
        submitSubscribeForm(secondForm),
      ]);

      await expect(firstPage).toHaveURL(pagePath);
      await expect(secondPage).toHaveURL(pagePath);

      await expect(
        firstPage.getByText("Confirmed for bobatan@fujocoded.com as bobatan."),
      ).toBeVisible();
      await expect(
        firstPage.getByText("Restored form: primary-subscribe"),
      ).toBeVisible();
      await expect(
        firstPage.getByText(
          "Confirmed for itscypher@fujocoded.com as itscypher.",
        ),
      ).toBeHidden();

      await expect(
        secondPage.getByText(
          "Confirmed for itscypher@fujocoded.com as itscypher.",
        ),
      ).toBeVisible();
      await expect(
        secondPage.getByText("Restored form: secondary-subscribe"),
      ).toBeVisible();
      await expect(
        secondPage.getByText("This domain is temporarily blocked."),
      ).toBeHidden();
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });
});
