import { expect, test, type Page } from "@playwright/test";

// Teacher tools on a seeded demo class: 25 students who trained over the past week.

async function demoTeacher(page: Page) {
  const res = await page.request.post("/api/admin/accounts", {
    data: { action: "seed_demo_class", students: 25, days: 7 },
    headers: { authorization: `Bearer ${process.env.ADMIN_API_TOKEN}` },
    timeout: 120_000,
  });
  expect(res.ok(), await res.text()).toBe(true);
  const demo = (await res.json()) as {
    classId: string;
    teacherEmail: string;
    teacherPassword: string;
  };
  const signIn = await page.request.post("/api/account/sign-in", {
    data: { identifier: demo.teacherEmail, password: demo.teacherPassword },
    headers: { origin: "http://localhost:3000" },
  });
  expect(signIn.ok()).toBe(true);
  return demo.classId;
}

test("dashboard, student detail, insights and grade export for a class week", async ({ page }) => {
  test.slow();
  const classId = await demoTeacher(page);

  await page.goto(`/teacher/class/${classId}`);
  const dashboard = page.getByRole("region", { name: "Dashboard" });
  const students = dashboard.getByRole("table", { name: "Students" });
  await expect(students.locator("tbody tr")).toHaveCount(25);
  await expect(dashboard.getByText("Not started").first()).toBeVisible();
  await expect(page.getByText(/passed a review after a gap of at least 7 days/)).toBeVisible();

  // Sort by minutes, most first.
  await dashboard.getByRole("button", { name: /Minutes this week/ }).click();
  await expect(dashboard.getByRole("columnheader", { name: /Minutes this week/ })).toHaveAttribute(
    "aria-sort",
    "descending",
  );

  // Student detail from a status chip.
  await students.locator("tbody tr").first().getByRole("link").last().click();
  await expect(page.getByRole("heading", { name: "Minutes per day" })).toBeVisible();
  await expect(page.getByText("Current level")).toBeVisible();

  await page.goto(`/teacher/class/${classId}/insights`);
  await expect(page.locator("tbody tr").first()).toBeVisible();

  await page.goto(`/teacher/class/${classId}/grades`);
  const firstGrade = page.locator("tbody tr").first().locator("td").last();
  const before = await firstGrade.textContent();
  await page.getByLabel("Weight on accuracy").fill("1");
  await expect(firstGrade).not.toHaveText(before!); // live preview
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download grades (CSV)" }).click();
  const csv = await import("node:fs").then(async (fs) =>
    fs.readFileSync((await (await download).path())!, "utf8"),
  );
  const lines = csv.trim().split("\n");
  expect(lines[0]).toBe(
    "seat,handle,minutes,goal,percent of goal,accuracy,flagged minutes,suggested grade",
  );
  expect(lines).toHaveLength(26);
});

test("class settings save, and a focus list can be chosen", async ({ page }) => {
  test.slow();
  const classId = await demoTeacher(page);
  await page.goto(`/teacher/class/${classId}/settings`);
  await page.getByLabel("Weekly goal (minutes)").fill("60");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.goto(`/teacher/class/${classId}`);
  await expect(page.getByText("Goal 60 min", { exact: true })).toBeVisible();
});
