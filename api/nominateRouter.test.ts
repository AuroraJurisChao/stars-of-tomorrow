import { describe, expect, it } from "vitest";
import { submittedRevision } from "./nominateRouter";

const cards = [
  { id: 22, recipientId: 8, reason: "  认真负责 ✨  ", anonymous: false },
  { id: 7, recipientId: 3, reason: "主动协作", anonymous: true },
];

describe("submittedRevision", () => {
  it("is deterministic across card order", () => {
    expect(submittedRevision(cards)).toMatch(/^[a-f0-9]{64}$/);
    expect(submittedRevision(cards)).toBe(submittedRevision([...cards].reverse()));
  });

  it("changes when a stable card ID changes", () => {
    expect(submittedRevision(cards)).not.toBe(submittedRevision(cards.map((card, index) => index === 0 ? { ...card, id: 23 } : card)));
  });

  it("changes when a recipient changes", () => {
    expect(submittedRevision(cards)).not.toBe(submittedRevision(cards.map((card, index) => index === 0 ? { ...card, recipientId: 9 } : card)));
  });

  it("changes when body text or Unicode whitespace changes", () => {
    expect(submittedRevision(cards)).not.toBe(submittedRevision(cards.map((card, index) => index === 0 ? { ...card, reason: card.reason.trim() } : card)));
  });

  it("changes when per-card anonymity changes", () => {
    expect(submittedRevision(cards)).not.toBe(submittedRevision(cards.map((card, index) => index === 1 ? { ...card, anonymous: false } : card)));
  });
});
