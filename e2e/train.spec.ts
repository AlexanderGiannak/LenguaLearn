import { expect, test, type Page } from "@playwright/test";
import { signUpLearner } from "./helpers";

// Training as a freshly signed-up independent learner, one per test.

test.beforeEach(async ({ page }) => {
  await signUpLearner(page);
});

/** Moves through whatever screen is showing. Returns which kind it was. */
async function step(page: Page, opts: { wrong?: boolean } = {}): Promise<string> {
  const intro = page.getByRole("region", { name: "New word" });
  const question = page.getByRole("region", { name: "Question" });
  const feedback = page.getByRole("region", { name: "Feedback" });
  const summary = page.getByRole("region", { name: "Session summary" });
  await expect(intro.or(question).or(feedback).or(summary).first()).toBeVisible();
  if (await summary.isVisible()) return "summary";

  // Each action waits for its screen to go away, so the next step never acts on a stale one.
  if (await intro.isVisible()) {
    await intro.getByRole("button", { name: /Got it/ }).click();
    await expect(intro).toBeHidden();
    return "intro";
  }
  if (await question.isVisible()) {
    if (opts.wrong) {
      await question.getByRole("button", { name: /I don't know/ }).click();
    } else if (await page.locator("#answer").isVisible()) {
      await page.locator("#answer").fill("algo");
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("1");
    }
    await expect(feedback).toBeVisible({ timeout: 15_000 });
    return "question";
  }
  await expect(feedback.getByRole("button", { name: "Continue", exact: true })).toBeEnabled({
    timeout: 5000,
  });
  await page.keyboard.press("Enter");
  await expect(feedback).toBeHidden();
  return "feedback";
}

test("a session from the first new word to the summary", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${e.message}\n${e.stack}`));

  await page.goto("/train");
  await page.getByRole("button", { name: "Start training" }).click();
  await expect(page.getByRole("progressbar", { name: "Session time" })).toBeVisible();

  // The first word in teaching order is new, so the session opens with its word page
  // (or, for a cognate, a guess-first question).
  const seen = new Set<string>();
  let answered = 0;
  while (answered < 6) {
    const kind = await step(page);
    seen.add(kind);
    if (kind === "question") answered += 1;
  }
  expect(seen).toEqual(new Set(["intro", "question", "feedback"]));
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);

  await page.getByRole("button", { name: "End session" }).click();
  const summary = page.getByRole("region", { name: "Session summary" });
  await expect(summary.getByRole("heading", { name: "Session complete" })).toBeVisible();
  await expect(summary.getByText("Questions")).toBeVisible();
  await expect(summary.locator('[lang="es"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("a wrong answer shows the word and must be read for 3 seconds", async ({ page }) => {
  await page.goto("/train");
  await page.getByRole("button", { name: "Start training" }).click();
  while ((await step(page, { wrong: true })) !== "question") {
    // walk past the first word page
  }
  const feedback = page.getByRole("region", { name: "Feedback" });
  await expect(feedback.getByText("Not quite.")).toBeVisible();
  await expect(feedback.getByRole("button", { name: /Continue in/ })).toBeDisabled();
  await expect(feedback.getByRole("button", { name: "Continue", exact: true })).toBeEnabled({
    timeout: 5000,
  });
});

test("works by keyboard: 1 picks, Enter continues", async ({ page }) => {
  await page.goto("/train");
  await page.getByRole("button", { name: "Start training" }).focus();
  await page.keyboard.press("Enter");
  const intro = page.getByRole("region", { name: "New word" });
  const question = page.getByRole("region", { name: "Question" });
  await expect(intro.or(question).first()).toBeVisible();
  if (await intro.isVisible()) await page.keyboard.press("1");
  await expect(question).toBeVisible();
  if (await page.locator("#answer").isVisible()) {
    await page.locator("#answer").fill("algo");
    await page.keyboard.press("Enter");
  } else {
    await page.keyboard.press("1");
  }
  await expect(page.getByRole("region", { name: "Feedback" })).toBeVisible();
});

test("an answer sent while offline is kept and retried", async ({ page }) => {
  await page.goto("/train");
  await page.getByRole("button", { name: "Start training" }).click();
  while ((await step(page)) !== "intro") {
    // reach a new word page
  }
  await expect(page.getByRole("region", { name: "Question" })).toBeVisible();

  let dropped = 0;
  await page.route("**/api/train/answer", async (route) => {
    if (dropped < 2) {
      dropped += 1;
      return route.abort("internetdisconnected");
    }
    return route.continue();
  });
  await page.keyboard.press("1");
  if (await page.locator("#answer").isVisible()) {
    await page.locator("#answer").fill("algo");
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("status")).toContainText("Reconnecting");
  await expect(page.getByRole("region", { name: "Feedback" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(dropped).toBe(2);
});

test("a whole timed session runs until time is up, then shows the summary", async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/train?minutes=1");
  await page.getByRole("button", { name: "Start training" }).click();
  const summary = page.getByRole("region", { name: "Session summary" });
  for (let i = 0; i < 400 && !(await summary.isVisible()); i++) {
    // Alternate right and wrong-ish answers to exercise both feedback screens.
    await step(page, { wrong: i % 7 === 3 });
    if (await summary.isVisible()) break;
  }
  await expect(summary.getByRole("heading", { name: "Session complete" })).toBeVisible();
  await expect(summary.getByText("Active minutes")).toBeVisible();
  expect(errors).toEqual([]);
});
