import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { renderCodexVisualizeDirectives } from "../codex-visualize-directives";

// The link the transcript turns into a file chip: `[label](file://…)`.
const LINK_LINE = /^\[((?:\\.|[^\]\\])*)\]\(file:\/\/([^()\s]+)\)$/;

function linkedPath(line: string): string | undefined {
  const destination = LINK_LINE.exec(line)?.[2];
  return destination === undefined ? undefined : decodeURIComponent(destination);
}

const pathSegment = fc
  .string({ minLength: 1, maxLength: 12, unit: "grapheme" })
  .filter((segment) =>
    !/[\u0000-\u001f\u007f/]/.test(segment)
    && !/[\ud800-\udfff]/.test(segment.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ""))
    && segment !== "."
    && segment !== "..");
const absolutePath = fc
  .array(pathSegment, { minLength: 1, maxLength: 5 })
  .map((segments) => `/${segments.join("/")}`);
const proseLine = fc
  .string({ maxLength: 30 })
  .filter((line) => !/[\r\n`~]/.test(line) && !line.includes("visualize"));

describe("Codex visualize directives", () => {
  it("links the exact line Codex wrote to the file it names", () => {
    const path =
      "/Users/vpereira/.pwragent/profiles/dev/projects/2026-11-10-08612d/ctr_audit/ctr-sources.html";
    expect(renderCodexVisualizeDirectives(`visualize{"path":"${path}"}`)).toBe(
      `[ctr\\-sources\\.html](file://${path})`,
    );
  });

  it("replaces every directive with a link that decodes to its path, and keeps every other line", () => {
    fc.assert(fc.property(
      fc.array(fc.oneof(proseLine, absolutePath.map((path) => ({ path }))), { maxLength: 8 }),
      fc.boolean(),
      fc.constantFrom("\n", "\r\n"),
      (entries, prefixed, lineEnding) => {
        const text = entries
          .map((entry) =>
            typeof entry === "string"
              ? entry
              : `${prefixed ? "::" : ""}visualize${JSON.stringify(entry)}`)
          .join(lineEnding);
        const rendered = renderCodexVisualizeDirectives(text);
        const lines = rendered.split(/\r?\n/);

        expect(rendered).not.toMatch(/visualize\{/);
        expect(lines.flatMap((line) => linkedPath(line) ?? []))
          .toEqual(entries.flatMap((entry) => typeof entry === "string" ? [] : [entry.path]));
        // Prose survives in order; only blank separators are added.
        const prose = entries.filter((entry): entry is string =>
          typeof entry === "string" && entry.trim() !== "" && linkedPath(entry) === undefined);
        expect(lines.filter((line) => line.trim() !== "" && linkedPath(line) === undefined))
          .toEqual(prose);
        // A link is never glued to a neighbouring paragraph.
        lines.forEach((line, index) => {
          if (linkedPath(line) === undefined || entries.some((entry) => entry === line)) return;
          expect((lines[index - 1] ?? "").trim()).toBe("");
          expect((lines[index + 1] ?? "").trim()).toBe("");
        });
      },
    ));
  });

  it("returns text without a directive unchanged", () => {
    fc.assert(fc.property(fc.array(proseLine, { maxLength: 8 }), (lines) => {
      const text = lines.join("\n");
      expect(renderCodexVisualizeDirectives(text)).toBe(text);
    }));
  });

  it("leaves a directive inside a code fence as written", () => {
    fc.assert(fc.property(absolutePath, fc.constantFrom("```", "~~~~"), (path, fence) => {
      const text = ["Example:", fence, `visualize${JSON.stringify({ path })}`, fence].join("\n");
      expect(renderCodexVisualizeDirectives(text)).toBe(text);
    }));
  });

  it("leaves a payload that names no absolute path as written", () => {
    for (const line of [
      'visualize{"path":"relative/file.html"}',
      'visualize{"path":42}',
      "visualize{not json}",
      'visualize{"file":"/tmp/a.html"}',
      'I will visualize{"path":"/tmp/a.html"}',
    ]) {
      expect(renderCodexVisualizeDirectives(`Before\n${line}\nAfter`)).toBe(`Before\n${line}\nAfter`);
    }
  });

  it("hides a directive that is still streaming in", () => {
    const complete = 'visualize{"path":"/tmp/chart.html"}';
    for (let length = "visualize{".length; length < complete.length; length += 1) {
      expect(renderCodexVisualizeDirectives(`Here it is.\n\n${complete.slice(0, length)}`))
        .toBe("Here it is.");
    }
  });
});
