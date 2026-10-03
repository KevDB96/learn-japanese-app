import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConceptReviewSession } from "./ConceptReviewSession.tsx";

afterEach(cleanup);

describe("concept review interaction", () => {
  it("uses reveal then Again, Hard, Good, Easy without a response field", () => {
    const item = { kind: "review" as const, conceptId: "vocab-neko" as never, cardId: "vocab-neko--vocabulary-meaning", formId: "vocabulary-meaning" };
    render(<ConceptReviewSession item={item} profileId="kevin" onRated={vi.fn()} />);
    expect(screen.getByRole("heading")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    expect(screen.getByRole("status").textContent).toContain("cat");
    expect(["Again", "Hard", "Good", "Easy"].map(name => screen.getByRole("button", { name }).textContent)).toEqual(["Again", "Hard", "Good", "Easy"]);
  });

  it("shows grammar recognition cards from existing examples", () => {
    const item = { kind: "review" as const, conceptId: "grammar-desu-copula" as never, cardId: "grammar-desu-copula--grammar-recognition", formId: "grammar-recognition" };
    render(<ConceptReviewSession item={item} profileId="kevin" onRated={vi.fn()} />);
    expect(screen.getByRole("heading")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Review rating" })).toBeTruthy();
  });
});
