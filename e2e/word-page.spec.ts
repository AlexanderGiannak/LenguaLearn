import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// TEST FIXTURE: Spanish words below come from fixtures/content/seed-40.json.

const seed = readFileSync("fixtures/content/seed-40.json", "utf8");
const auth = { authorization: `Bearer ${process.env.ADMIN_API_TOKEN}` };

// Re-importing the unchanged seed changes nothing and returns every row's ID by key.
let ids: Map<string, number>;
async function senseIds(request: APIRequestContext) {
  if (!ids) {
    const res = await request.post("/api/admin/import", { data: seed, headers: auth });
    expect(res.ok()).toBe(true);
    const { rows } = (await res.json()) as { rows: { table: string; key?: string; id: number }[] };
    ids = new Map(rows.filter((r) => r.table === "sense").map((r) => [r.key!, r.id]));
  }
  return ids;
}

async function openWord(page: Page, key: string) {
  const id = (await senseIds(page.request)).get(key);
  expect(id, `seeded sense ${key}`).toBeDefined();
  const res = await page.goto(`/word/${id}`);
  expect(res?.status()).toBe(200);
}

async function openMore(page: Page) {
  await page.getByText("More about this word").click();
}

test("intro screen: headword with article, picture, gloss, examples, audio", async ({ page }) => {
  await openWord(page, "casa#noun#1");

  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("la casa");
  await expect(heading).toHaveAttribute("lang", "es");
  await expect(page.getByText("feminine noun · Level 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play pronunciation of casa" })).toBeVisible();

  const meaning = page.getByRole("region", { name: "Meaning" });
  await expect(meaning.getByRole("img", { name: /small house with a red roof/ })).toBeVisible();
  await expect(meaning.getByText("house, home")).toBeVisible();
  await expect(meaning.getByText("A building where a person or family lives.")).toBeVisible();

  const examples = page.getByRole("region", { name: "Examples" }).getByRole("listitem");
  await expect(examples).toHaveCount(2);
  await expect(examples.first().locator("mark")).toHaveText("casa");
  await expect(examples.first().locator('p[lang="es"]')).toHaveText(
    "Mi casa tiene un jardín pequeño.",
  );
  await expect(examples.first().getByText("My house has a small garden.")).toBeVisible();
});

test("audio falls back to the browser's Spanish voice when there is no recording", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const spoken: { text: string; lang: string }[] = [];
    (window as unknown as { spoken: typeof spoken }).spoken = spoken;
    window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
      spoken.push({ text: u.text, lang: u.lang });
    };
  });
  await openWord(page, "casa#noun#1");
  await page.getByRole("button", { name: "Play pronunciation of casa" }).click();
  const spoken = await page.evaluate(() => (window as unknown as { spoken: unknown[] }).spoken);
  expect(spoken).toEqual([{ text: "la casa", lang: expect.stringMatching(/^es/) }]);
});

test("nouns take an overridden article and common-gender nouns show both", async ({ page }) => {
  await openWord(page, "agua#noun#1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("el agua");
  await openWord(page, "estudiante#noun#1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("el/la estudiante");
  await expect(page.getByText("masculine or feminine noun")).toBeVisible();
});

test("adjectives show an irregular feminine form", async ({ page }) => {
  await openWord(page, "español#adjective#1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("español / española");
});

test("memory hook", async ({ page }) => {
  await openWord(page, "dinero#noun#1");
  await expect(page.getByRole("heading", { name: "Memory hook" })).toBeVisible();
  await openWord(page, "aprovechar#verb#1");
  await expect(page.getByRole("heading", { name: "Word origin" })).toBeVisible();
  await expect(page.getByText(/Latin profectus/)).toBeVisible();
});

test("cognate notes", async ({ page }) => {
  await openWord(page, "estudiante#noun#1");
  await openMore(page);
  await expect(page.getByText("Looks like English: student")).toBeVisible();

  await openWord(page, "librería#noun#1");
  await openMore(page);
  await expect(page.getByRole("region", { name: "False friend" })).toContainText(
    "librería does not mean “library”",
  );
});

test("word family chips link to words in the bank", async ({ page }) => {
  await openWord(page, "grande#adjective#1");
  await openMore(page);
  const family = page.getByRole("region", { name: "Word family" });
  await expect(family.getByText("grandeza")).toBeVisible(); // not in the bank: plain chip
  await family.getByRole("link", { name: "pequeño" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("pequeño");
});

test("word ingredients", async ({ page }) => {
  await openWord(page, "inolvidable#adjective#1");
  await openMore(page);
  const parts = page.getByRole("region", { name: "Word ingredients" }).getByRole("listitem");
  await expect(parts).toHaveText(["in-not", "olvidforget (olvidar)", "-ableable to be"]);
});

test("usage notes: register, plural, key forms, phrases, confusables", async ({ page }) => {
  await openWord(page, "platicar#verb#1");
  await openMore(page);
  const usage = page.getByRole("region", { name: "Usage notes" });
  await expect(usage).toContainText("Regional: Mexico and Central America");
  await expect(usage).toContainText("Key forms: platiqué");

  await openWord(page, "lápiz#noun#1");
  await openMore(page);
  await expect(page.getByRole("region", { name: "Usage notes" })).toContainText("Plural: lápices");

  await openWord(page, "realizar#verb#1");
  await openMore(page);
  const notes = page.getByRole("region", { name: "Usage notes" });
  await expect(notes).toContainText("Common phrases: realizar un sueño");
  await notes.getByRole("link", { name: "darse cuenta" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("darse cuenta");
});

test("content that is not live is not found", async ({ page, request }) => {
  const res = await request.post("/api/admin/import", {
    headers: auth,
    data: {
      fixture: true,
      lemmas: [
        {
          key: "borrador#noun",
          headword: "borrador",
          partOfSpeech: "noun",
          gender: "m",
          frequencyRank: 5000,
          status: "draft",
          senses: [
            {
              key: "borrador#noun#1",
              gloss: "draft, eraser",
              definition: "A first version of a text, or a tool for erasing.",
              frequencyRank: 5000,
              register: "neutral",
              cognate: "none",
              concreteness: "abstract",
              status: "draft",
            },
          ],
        },
      ],
    },
  });
  expect(res.ok()).toBe(true);
  const { rows } = (await res.json()) as { rows: { table: string; id: number }[] };
  const draftId = rows.find((r) => r.table === "sense")!.id;

  // The production build streams the page shell first, so the status can be 200; what
  // matters is that the word is not shown and search engines are told not to index it.
  for (const path of [`/word/${draftId}`, "/word/2147483647", "/word/not-a-number"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByText("borrador")).toHaveCount(0);
    await expect(page.locator('meta[name="robots"][content="noindex"]')).not.toHaveCount(0);
  }
});
