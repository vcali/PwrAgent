// Codex wraps the directive in private-use marker characters, which draw as
// empty boxes: one before the name, one before the payload, one after it.
const MARKER = "[\\ue000-\\uf8ff]";

const COMPLETE_CODEX_VISUALIZE_DIRECTIVE = new RegExp(
  `^ {0,3}(?:::|${MARKER})?visualize${MARKER}?(\\{.*\\})${MARKER}?\\s*$`,
);

const INLINE_CODEX_VISUALIZE_DIRECTIVE = new RegExp(
  `${MARKER}visualize${MARKER}?(\\{[^\\ue000-\\uf8ff]*\\})${MARKER}`,
  "g",
);

/**
 * Rewrites Codex's assistant-authored `visualize{"path":"…"}` lines into
 * Markdown links to the named local file, so the transcript draws the file
 * chip that opens the preview instead of the raw directive. Codex emits the
 * line for a tool PwrAgent does not host. Ordinary Markdown, including a
 * literal example inside a code fence, is preserved. A directive whose
 * payload is not an absolute POSIX path is left as written.
 */
export function renderCodexVisualizeDirectives(text: string): string {
  if (!text.includes("visualize{") && !/[\ue000-\uf8ff]/.test(text)) {
    return text;
  }

  const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const output: string[] = [];
  let changed = false;
  let fenceCharacter: "`" | "~" | undefined;
  let fenceLength = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const marker = fence[1] ?? "";
      const markerCharacter = marker[0] as "`" | "~";
      if (!fenceCharacter) {
        fenceCharacter = markerCharacter;
        fenceLength = marker.length;
      } else if (
        markerCharacter === fenceCharacter
        && marker.length >= fenceLength
        && /^[ \t]*$/.test(fence[2] ?? "")
      ) {
        fenceCharacter = undefined;
        fenceLength = 0;
      }
      output.push(line);
      continue;
    }

    if (fenceCharacter) {
      output.push(line);
      continue;
    }

    const link = visualizeDirectiveLink(COMPLETE_CODEX_VISUALIZE_DIRECTIVE.exec(line)?.[1]);
    if (link) {
      // A link line would otherwise join the paragraph on either side.
      if (output.length > 0 && output[output.length - 1]?.trim() !== "") {
        output.push("");
      }
      output.push(link);
      if (index + 1 < lines.length && lines[index + 1]?.trim() !== "") {
        output.push("");
      }
      changed = true;
      continue;
    }

    // A directive still streaming in would flash as raw text.
    if (index === lines.length - 1 && isPartialVisualizeDirective(line)) {
      changed = true;
      while (output.length > 0 && output[output.length - 1]?.trim() === "") {
        output.pop();
      }
      continue;
    }

    // Mid-sentence, only the marked form is unambiguous.
    const inline = line.replace(
      INLINE_CODEX_VISUALIZE_DIRECTIVE,
      (match, payload: string) => visualizeDirectiveLink(payload) ?? match,
    );
    changed ||= inline !== line;
    output.push(inline);
  }

  return changed ? output.join(lineEnding) : text;
}

function visualizeDirectiveLink(payload: string | undefined): string | undefined {
  if (!payload) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const filePath = (parsed as { path?: unknown }).path;
  if (
    typeof filePath !== "string"
    || !filePath.startsWith("/")
    || /[\u0000-\u001f\u007f]/.test(filePath)
  ) {
    return undefined;
  }

  const name = filePath.split("/").filter(Boolean).at(-1);
  if (!name) {
    return undefined;
  }
  const label = name.replace(/[!-/:-@[-`{-~]/g, "\\$&");
  const destination = filePath
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      ))
    .join("/");
  return `[${label}](file://${destination})`;
}

function isPartialVisualizeDirective(line: string): boolean {
  if (COMPLETE_CODEX_VISUALIZE_DIRECTIVE.test(line)) {
    return false;
  }
  const candidate = line.replace(/^ {0,3}/, "");
  if (/^(?:::)?visualize\{/.test(candidate)) {
    return true;
  }
  if (!/^[\ue000-\uf8ff]/.test(candidate)) {
    return false;
  }
  // The opening marker never reaches the operator, even before the name.
  const name = candidate.slice(1);
  return "visualize".startsWith(name) || name.startsWith("visualize");
}
