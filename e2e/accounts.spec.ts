import { expect, test } from "@playwright/test";
import { signUpTeacher } from "./helpers";

test("training needs an account", async ({ page }) => {
  await page.goto("/train");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Ftrain|\/sign-in\?next=\/train/);
});

test("class student pages never offer Google sign-in", async ({ page }) => {
  for (const path of ["/join", "/student"]) {
    await page.goto(path);
    await expect(page.getByText(/google/i)).toHaveCount(0);
  }
});

test("a teacher creates a class and a student joins with a seat code", async ({
  page,
  browser,
}) => {
  await signUpTeacher(page);
  await page.goto("/teacher");
  await page.getByLabel("Class name").fill("Spanish 2");
  await page.getByLabel("Seats").fill("3");
  await page.getByRole("button", { name: "Create class" }).click();
  await expect(page.getByRole("heading", { name: "Spanish 2" })).toBeVisible();
  const firstCode = (await page.locator("td .font-mono").first().textContent())!.trim();
  expect(firstCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  // A student on another device, with no account.
  const student = await browser.newContext();
  const s = await student.newPage();
  await s.goto("/join");
  await s.getByLabel("Code from your teacher").fill(firstCode.toLowerCase());
  await s.getByRole("button", { name: "Continue" }).click();
  await expect(s.getByText("Spanish 2")).toBeVisible();
  await s.getByLabel("Choose a password").fill("student-password");
  await s.getByLabel("Type it again").fill("student-password");
  await s.getByRole("button", { name: "Join" }).click();
  const handle = (await s.locator("p.font-mono").textContent())!.trim();
  expect(handle).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
  await s.getByRole("button", { name: "Start training" }).click();
  // New class students find their level first (the teacher hasn't set one).
  await expect(s.getByRole("heading", { name: "Find your level" })).toBeVisible();
  await student.close();

  // The teacher now sees the handle in place of the code.
  await page.reload();
  await expect(page.getByText(handle)).toBeVisible();
});

test("name labels never leave the browser", async ({ page }) => {
  await signUpTeacher(page);
  const res = await page.request.post("/api/teacher/classes", {
    data: { name: "Labels", seats: 3 },
    headers: { origin: "http://localhost:3000" },
  });
  const { id } = (await res.json()) as { id: string };

  // Watch every request the page makes from here on.
  const sent: string[] = [];
  page.on("request", (req) => {
    sent.push(req.url(), JSON.stringify(req.headers()), req.postData() ?? "");
  });

  await page.goto(`/teacher/class/${id}/seats`);
  await expect(
    page.getByText("Names stay on this computer. LenguaLearn never receives them."),
  ).toBeVisible();
  const labels = ["Zyxwvut Qmarklabel", "Pélagie Ñandúlabel", "Xoregos Labelcheck"];
  for (const [i, label] of labels.entries()) {
    await page.getByLabel(`Name for seat ${i + 1}`).fill(label);
  }
  // Do things that talk to the server while labels are on the page.
  await page.getByRole("button", { name: "Add a seat" }).click();
  await expect(page.getByLabel("Name for seat 4")).toBeVisible();
  await page.getByRole("button", { name: "New code" }).first().click();
  await page.reload();
  await expect(page.getByLabel("Name for seat 1")).toHaveValue(labels[0]!);

  // Export works, and contains the labels.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export names" }).click();
  const file = await (await download).path();
  const exported = await import("node:fs").then((fs) => fs.readFileSync(file!, "utf8"));
  expect(exported).toContain(labels[1]);

  // The dashboard and grade pages show the labels too, still from this browser only.
  await page.goto(`/teacher/class/${id}`);
  await expect(page.getByText(labels[0]!)).toBeVisible();
  await page.goto(`/teacher/class/${id}/grades`);
  await page.goto(`/teacher/class/${id}/settings`);

  const all = sent.join("\n");
  for (const label of labels) {
    expect(all).not.toContain(label);
    expect(all).not.toContain(encodeURIComponent(label));
  }
  expect(sent.length).toBeGreaterThan(3);
});
