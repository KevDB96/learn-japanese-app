import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConceptReviewSession } from "./ConceptReviewSession.tsx";

const base = { kind: "review" as const, conceptId: "vocab-neko" as never, cardId: "vocab-neko--vocabulary-production", formId: "vocabulary-production" };
afterEach(cleanup);

describe("concept review interaction", () => {
  it("starts with strict production recall and reveals feedback only after checking", () => {
    render(<ConceptReviewSession item={base} profileId="kevin" onRated={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "cat" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Guided choices" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "neko" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByRole("status").textContent).toContain("Answer: 猫");
  });

  it("offers multiple choice only when the learner asks for guidance", () => {
    render(<ConceptReviewSession item={base} profileId="kevin" onRated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Show choices" }));
    expect(screen.getByRole("group", { name: "Guided choices" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Recall without choices" }));
    expect(screen.queryByRole("group", { name: "Guided choices" })).toBeNull();
    expect(screen.getByLabelText("Answer")).toBeTruthy();
  });

  it("uses the authored grammar cloze in scheduled review and offers SRS ratings after an attempt", () => {
    const cloze = { kind: "review" as const, conceptId: "grammar-desu-copula" as never, cardId: "grammar-desu-copula--grammar-desu-copula-cloze", formId: "grammar-cloze" };
    render(<ConceptReviewSession item={cloze} profileId="kevin" onRated={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Missing text" }), { target: { value: "ます" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByRole("status").textContent).toContain("です completes a polite noun sentence.");
    expect(screen.getByRole("group", { name: "Review rating" })).toBeTruthy();
  });
});
