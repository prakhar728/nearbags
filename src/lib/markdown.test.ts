import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref } from "./markdown";

describe("markdown", () => {
  it("keeps only web and mail links", () => {
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("/relative")).toBeNull();
  });

  it("renders unsafe links as text", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ t: "text", v: "x)" }]);
    expect(parseInline("[click](javascript:void)")).toEqual([{ t: "text", v: "click" }]);
  });

  it("drops images to their alt text", () => {
    expect(parseInline("see ![chart](https://x.com/a.png) here")).toEqual([{ t: "text", v: "see chart here" }]);
  });

  it("parses links, bold, italic, code", () => {
    expect(parseInline("**big** *small* `x` [a](https://a.com)")).toEqual([
      { t: "strong", c: [{ t: "text", v: "big" }] },
      { t: "text", v: " " },
      { t: "em", c: [{ t: "text", v: "small" }] },
      { t: "text", v: " " },
      { t: "code", v: "x" },
      { t: "text", v: " " },
      { t: "link", href: "https://a.com/", c: [{ t: "text", v: "a" }] },
    ]);
  });

  it("treats raw HTML as text", () => {
    const b = parseMarkdown("<script>alert(1)</script>");
    expect(b).toEqual([{ type: "p", inl: [{ t: "text", v: "<script>alert(1)</script>" }] }]);
  });

  it("parses blocks", () => {
    const b = parseMarkdown("# Title\n\nline one\nline two\n\n- a\n- b\n\n1. x\n2. y\n\n> quoted");
    expect(b.map((x) => x.type)).toEqual(["h", "p", "ul", "ol", "quote"]);
    expect(b[1]).toEqual({ type: "p", inl: [{ t: "text", v: "line one line two" }] });
  });
});
