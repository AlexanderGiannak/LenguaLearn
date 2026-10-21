import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Spec, Phase 7 "done when": a total beginner and an intermediate learner each go from
// sign-up to first question in under 5 minutes, at sensible levels.

type Seed = { lemmas: { headword: string; senses: { frequencyRank: number }[] }[] };
const seed = JSON.parse(readFileSync("fixtures/content/seed-40.json", "utf8")) as Seed;
const rankOf = new Map(
  seed.lemmas.map((l) => [l.headword, Math.min(...l.senses.map((s) => s.frequencyRank))]),
);

async function signUpThroughForm(page: Page) {
  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(`e2e${Math.random().toString(36).slice(2, 10)}`);
  await page.locator("input[name=password]").fill("learner-password");
  await page.getByLabel("I am 13 or older.").check();
  await page.getByRole("button", { name: "Create account" }).click();
}

async function firstScreen(page: Page) {
  await page.getByRole("link", { name: "Start training" }).click();
  await page.getByRole("button", { name: "Start training" }).click();
  await expect(page.getByRole("region", { name: /New word|Question/ })).toBeVisible();
}

test("a total beginner reaches the first word quickly, at level 1", async ({ page }) => {
  const started = Date.now();
  await signUpThroughForm(page);
  await expect(page.getByRole("heading", { name: "Find your level" })).toBeVisible();
  await page.getByRole("button", { name: "I'm a total beginner" }).click();
  await expect(page.getByText(/^Level 1$/)).toBeVisible();
  await firstScreen(page);
  expect(Date.now() - started).toBeLessThan(5 * 60_000);
});

test("an intermediate learner takes the level check and starts above level 1", async ({ page }) => {
  test.slow();
  const started = Date.now();
  await signUpThroughForm(page);
  await page.getByRole("button", { name: "I know some Spanish" }).click();
  // Knows the real words up to rank 2,000; says no to rarer words and to made-up ones.
  const word = page.locator('p[lang="es"]');
  for (let i = 0; i < 60; i++) {
    if (await page.getByRole("heading", { name: "Your starting level" }).isVisible()) break;
    await expect(word).toBeVisible();
    const text = (await word.textContent())!.trim();
    const rank = rankOf.get(text);
    const before = await page.getByText(/ of \d+$/).textContent();
    await page.keyboard.press(rank !== undefined && rank <= 2000 ? "y" : "n");
    await expect(
      page
        .getByText(/ of \d+$/)
        .or(page.getByRole("heading", { name: "Your starting level" }))
        .first(),
    ).not.toHaveText(before!);
  }
  const level = Number((await page.getByText(/^Level \d+$/).textContent())!.replace("Level ", ""));
  expect(level).toBeGreaterThan(1);
  expect(level).toBeLessThanOrEqual(4);
  await firstScreen(page);
  expect(Date.now() - started).toBeLessThan(5 * 60_000);
});
