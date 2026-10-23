import { expect, test } from "@playwright/test";

// The demo site's one-click entry (DEMO_SITE=1, set in CI and in local .env.local).

test("a visitor tries the app as a learner in one click", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/^Demo site:/)).toBeVisible();
  const learner = page.getByRole("button", { name: "Try as a learner" });
  await expect(learner).toBeDisabled();
  await page.getByLabel("I am 13 or older.").check();
  await learner.click();
  await expect(page.getByRole("heading", { name: "Find your level" })).toBeVisible();
});

test("a visitor tries the app as a teacher and lands on a class with a week of data", async ({
  page,
}) => {
  // With an empty pool the class is built on the spot: 25 students through a simulated week.
  test.setTimeout(180_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Try as a teacher" }).click();
  await expect(page).toHaveURL(/\/teacher$/, { timeout: 150_000 });
  await expect(page.getByRole("link", { name: /Demo class.*25 of 25 joined/ })).toBeVisible();
  await page.getByRole("link", { name: /Demo class/ }).click();
  await expect(page).toHaveURL(/\/teacher\/class\/[^/]+$/);
  // A header row plus one row per student.
  await expect(page.getByRole("table", { name: "Students" }).getByRole("row")).toHaveCount(26);
});

test("teacher sign-up on the demo site points to the teacher demo", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "I'm a teacher" }).click();
  await expect(page.getByRole("status")).toContainText("can't send email yet");
  await expect(page.getByRole("link", { name: "Try as a teacher" })).toHaveAttribute("href", "/");
});
