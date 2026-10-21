import { expect, test } from "@playwright/test";
import { signUpLearner } from "./helpers";

// Spec, Phase 6: the idle pause and the one-active-tab rule, in the browser. The flag rules
// themselves are tested on the server (lib/integrity/*.test.ts).

test.beforeEach(async ({ page }) => {
  await signUpLearner(page);
});

test("after 2 minutes with no input the session pauses, and paused time does not count", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/train");
  await page.getByRole("button", { name: "Start training" }).click();
  await expect(page.getByRole("region", { name: /New word|Question/ })).toBeVisible();

  await page.clock.fastForward("02:05");
  const dialog = page.getByRole("dialog", { name: "Still there?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Paused time doesn't count");

  // Time while paused never counts toward the session.
  await page.clock.fastForward("10:00");
  // Keys go to the dialog: Enter resumes and does not answer or continue underneath.
  await page.keyboard.press("1");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  const bar = page.getByRole("progressbar", { name: "Session time" });
  expect(Number(await bar.getAttribute("aria-valuenow"))).toBeLessThan(10);
});

test("starting in a second tab pauses the first", async ({ page, context }) => {
  await page.goto("/train");
  await page.getByRole("button", { name: "Start training" }).click();
  await expect(page.getByRole("progressbar", { name: "Session time" })).toBeVisible();

  const second = await context.newPage();
  await second.goto("/train");
  await second.getByRole("button", { name: "Start training" }).click();
  await expect(second.getByRole("progressbar", { name: "Session time" })).toBeVisible();

  const paused = page.getByRole("dialog", { name: "Paused" });
  await expect(paused).toBeVisible();
  await expect(paused).toContainText("another tab");

  // Continuing in the first tab starts a fresh session there and pauses the second.
  await paused.getByRole("button", { name: "Start a new session here" }).click();
  await expect(paused).toBeHidden();
  await expect(second.getByRole("dialog", { name: "Paused" })).toBeVisible();
});
