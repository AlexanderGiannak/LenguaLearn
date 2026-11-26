import { describe, expect, it } from "vitest";
import { reportTextAllowed, scrubPersonalDetails } from "./report-reasons";

describe("scrubPersonalDetails", () => {
  it.each([
    ["write to me at sam.lee@example.com please", "write to me at [removed] please"],
    ["see https://example.com/x and www.example.org", "see [removed] and [removed]"],
    ["my site is example.com", "my site is [removed]"],
    ["text 555-123-4567 or (555) 123 4567", "text [removed] or [removed]"],
    ["follow @samlee99", "follow [removed]"],
  ])("removes contact details: %s", (input, out) => {
    expect(scrubPersonalDetails(input)).toBe(out);
  });

  it("keeps ordinary report text, numbers included", () => {
    const text = "Option 3 is also right. Level 12, 2 answers, 1.5 seconds e.g. word";
    expect(scrubPersonalDetails(text)).toBe(text);
  });
});

it("lets only accounts that aren't class seats add text", () => {
  expect(reportTextAllowed("student")).toBe(false);
  expect(reportTextAllowed("learner")).toBe(true);
  expect(reportTextAllowed("teacher")).toBe(true);
});
