/**
 * The font families installed on this machine, read with the Local Font
 * Access API. Electron grants the `local-fonts` permission without a prompt
 * (the session's permission handler gates only media), so no dependency or
 * native helper is needed to list them.
 *
 * `queryLocalFonts()` took 1.5s with 600 faces installed, so it runs at most
 * once per window and every caller (the terminal's Nerd Font fallback, the
 * Settings font pickers) shares the one result.
 */

type LocalFontData = { family: string };
type LocalFontWindow = Window & {
  queryLocalFonts?: () => Promise<LocalFontData[]>;
};

let query: Promise<readonly string[]> | undefined;

/** Whether this window can list installed fonts at all. A caller that would
 *  only learn "none" asynchronously checks this first and skips the wait. */
export function canQueryLocalFonts(): boolean {
  return typeof (window as LocalFontWindow).queryLocalFonts === "function";
}

/** Unique family names, sorted for a picker. Empty when the API is missing
 *  or the query is denied. */
export function queryLocalFontFamilies(): Promise<readonly string[]> {
  query ??= readLocalFontFamilies();
  return query;
}

async function readLocalFontFamilies(): Promise<readonly string[]> {
  const target = window as LocalFontWindow;
  if (typeof target.queryLocalFonts !== "function") return [];
  try {
    const fonts = await target.queryLocalFonts();
    return [...new Set(fonts.map((font) => font.family))].sort((a, b) =>
      a.localeCompare(b),
    );
  } catch {
    // Denied, or not a secure context.
    return [];
  }
}
