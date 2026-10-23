import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "LenguaLearn" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/sign-up");
});

test("health check reports the database as ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(await res.json()).toEqual({ status: "ok" });
});

test("the public pages show their graphs without sideways scrolling", async ({ page }) => {
  for (const path of ["/", "/how-it-works", "/for-teachers", "/about"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("figure").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto("/how-it-works");
  await expect(page.getByRole("img", { name: /Predicted recall of one word/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /A level check of 40 questions/ })).toBeVisible();
});
