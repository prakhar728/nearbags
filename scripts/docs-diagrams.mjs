// Draws every ```mermaid block in docs/*.md to docs/diagrams/<page>-<n>.svg in the app's colours, so /docs can show
// them without shipping a diagram library to the browser. GitHub draws the same blocks from the Markdown itself.
// Run after changing a diagram: pnpm docs:diagrams (uses npx @mermaid-js/mermaid-cli, which downloads a browser once).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DOCS = path.join(import.meta.dirname, "..", "docs");
const OUT = path.join(DOCS, "diagrams");
const config = {
  theme: "base",
  themeVariables: {
    background: "transparent",
    fontFamily: "ui-monospace, monospace",
    fontSize: "13px",
    primaryColor: "#161616",
    primaryTextColor: "#ededed",
    primaryBorderColor: "#3a3a3a",
    secondaryColor: "#121212",
    tertiaryColor: "#121212",
    lineColor: "#8a8a8a",
    textColor: "#ededed",
    edgeLabelBackground: "#0a0a0a",
    actorBkg: "#161616",
    actorBorder: "#3a3a3a",
    actorTextColor: "#ededed",
    actorLineColor: "#333333",
    signalColor: "#8a8a8a",
    signalTextColor: "#ededed",
    labelBoxBkgColor: "#161616",
    labelBoxBorderColor: "#3a3a3a",
    labelTextColor: "#ededed",
    loopTextColor: "#e8ff59",
    noteBkgColor: "#161616",
    noteTextColor: "#ededed",
    noteBorderColor: "#3a3a3a",
  },
};

const tmp = mkdtempSync(path.join(tmpdir(), "docs-diagrams-"));
writeFileSync(path.join(tmp, "config.json"), JSON.stringify(config));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const file of readdirSync(DOCS).filter((f) => f.endsWith(".md"))) {
  const page = file.replace(/\.md$/, "");
  const blocks = [...readFileSync(path.join(DOCS, file), "utf8").matchAll(/^```mermaid\n([\s\S]*?)^```/gm)].map((m) => m[1]);
  blocks.forEach((src, i) => {
    const input = path.join(tmp, `${page}-${i + 1}.mmd`);
    const output = path.join(OUT, `${page}-${i + 1}.svg`);
    writeFileSync(input, src);
    execFileSync("npx", ["--yes", "@mermaid-js/mermaid-cli", "-q", "-i", input, "-o", output, "-c", path.join(tmp, "config.json"), "-b", "transparent", "--svgId", `d-${page}-${i + 1}`], { stdio: "inherit" });
    console.log(path.relative(process.cwd(), output));
  });
}
rmSync(tmp, { recursive: true, force: true });
