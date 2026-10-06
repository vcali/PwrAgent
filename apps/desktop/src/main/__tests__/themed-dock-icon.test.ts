import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DESKTOP_DARK_THEMES, DESKTOP_LIGHT_THEMES } from "@pwragent/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  setIcon: vi.fn(),
  isPackaged: false,
  createFromPath: vi.fn((file: string) => ({ file, isEmpty: () => false })),
  createEmpty: vi.fn(() => ({ file: "<empty>", isEmpty: () => true })),
  shouldUseDarkColors: true,
  themeListeners: [] as Array<() => void>,
}));

const osMocks = vi.hoisted(() => ({ release: "25.6.0" }));

vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  release: () => osMocks.release,
}));

vi.mock("electron", () => ({
  app: {
    dock: { setIcon: electronMocks.setIcon },
    get isPackaged() {
      return electronMocks.isPackaged;
    },
    getAppPath: () => "/app",
  },
  nativeImage: {
    createFromPath: electronMocks.createFromPath,
    createEmpty: electronMocks.createEmpty,
  },
  nativeTheme: {
    get shouldUseDarkColors() {
      return electronMocks.shouldUseDarkColors;
    },
    on: (_event: string, listener: () => void) => {
      electronMocks.themeListeners.push(listener);
    },
  },
}));

import {
  dockIconTheme,
  drawsLiquidGlassIcons,
  resetThemedDockIconForTests,
  syncThemedDockIcon,
  themedDockIconFile,
  type ThemedDockIconAppearance,
} from "../themed-dock-icon";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(testDir, "../../../build/dock-icons");
const originalPlatform = process.platform;
// Electron types `resourcesPath` as always set; under vitest it is absent.
const originalResourcesPath = Object.getOwnPropertyDescriptor(process, "resourcesPath");

function appearance(
  overrides: Partial<ThemedDockIconAppearance>,
): ThemedDockIconAppearance {
  return {
    theme: "system",
    darkTheme: "tangerine-dark",
    lightTheme: "tangerine-light",
    themedDockIcon: true,
    ...overrides,
  };
}

function appliedFiles(): string[] {
  return electronMocks.setIcon.mock.calls.map(([icon]) => (icon as { file: string }).file);
}

describe("themed dock icon", () => {
  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    electronMocks.isPackaged = false;
    electronMocks.setIcon.mockClear();
    electronMocks.shouldUseDarkColors = true;
    electronMocks.themeListeners.length = 0;
    osMocks.release = "25.6.0";
    resetThemedDockIconForTests();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    if (originalResourcesPath) {
      Object.defineProperty(process, "resourcesPath", originalResourcesPath);
    } else {
      Reflect.deleteProperty(process, "resourcesPath");
    }
  });

  it("ships a flat and a glass icon for every dark theme but Tangerine", () => {
    for (const liquidGlass of [false, true]) {
      for (const theme of DESKTOP_DARK_THEMES) {
        const file = themedDockIconFile(theme, true, liquidGlass);
        if (theme === "tangerine-dark") {
          expect(file).toBeNull();
        } else {
          expect(existsSync(path.join(iconsDir, file ?? "")), `${theme} ${file}`).toBe(true);
        }
      }
    }
    expect(themedDockIconFile("blue-dark", true, true)).toBe(path.join("glass", "blue-dark.png"));
    expect(themedDockIconFile("blue-dark", true, false)).toBe("blue-dark.png");
  });

  it("draws Liquid Glass icons from macOS 26 (Darwin 25)", () => {
    expect(drawsLiquidGlassIcons("24.6.0")).toBe(false);
    expect(drawsLiquidGlassIcons("25.0.0")).toBe(true);
    expect(drawsLiquidGlassIcons("26.1.0")).toBe(true);
  });

  it("shows the flat icon before macOS 26", () => {
    osMocks.release = "24.6.0";
    syncThemedDockIcon(appearance({ darkTheme: "blue-dark" }));
    expect(appliedFiles()).toEqual([path.join("/app", "build/dock-icons", "blue-dark.png")]);
  });

  it("follows the dark theme in dark mode, and leaves the app icon alone until it changes", () => {
    syncThemedDockIcon(appearance({ darkTheme: "tangerine-dark" }));
    expect(electronMocks.setIcon).not.toHaveBeenCalled();

    syncThemedDockIcon(appearance({ darkTheme: "blue-dark" }));
    syncThemedDockIcon(appearance({ darkTheme: "blue-dark" }));
    expect(appliedFiles()).toEqual([path.join("/app", "build/dock-icons", "glass", "blue-dark.png")]);

    // Back to the app's own icon: the padded development icon here.
    syncThemedDockIcon(appearance({ darkTheme: "tangerine-dark" }));
    expect(appliedFiles().at(-1)).toBe(path.join("/app", "build/icon-macos.png"));
  });

  it("restores the bundle icon in a packaged app when the operator opts out", () => {
    electronMocks.isPackaged = true;
    Object.defineProperty(process, "resourcesPath", {
      value: "/Applications/PwrAgent.app/Contents/Resources",
      configurable: true,
    });
    syncThemedDockIcon(appearance({ darkTheme: "solarized-dark" }));
    expect(appliedFiles().at(-1)).toBe(
      path.join("/Applications/PwrAgent.app/Contents/Resources", "dock-icons", "glass", "solarized-dark.png"),
    );

    syncThemedDockIcon(appearance({ darkTheme: "solarized-dark", themedDockIcon: false }));
    expect(appliedFiles().at(-1)).toBe("<empty>");
  });

  it("maps every light theme to its family's icon", () => {
    for (const lightTheme of DESKTOP_LIGHT_THEMES) {
      const theme = dockIconTheme({ theme: "light", darkTheme: "phosphor-dark", lightTheme }, true);
      expect(theme, lightTheme).not.toBe("phosphor-dark");
      expect(DESKTOP_DARK_THEMES).toContain(theme);
    }
    expect(dockIconTheme({ theme: "light", darkTheme: "phosphor-dark", lightTheme: "blue-light" }, true))
      .toBe("blue-dark");
    expect(dockIconTheme({ theme: "dark", darkTheme: "phosphor-dark", lightTheme: "blue-light" }, false))
      .toBe("phosphor-dark");
    expect(dockIconTheme({ theme: "system", darkTheme: "phosphor-dark", lightTheme: "blue-light" }, false))
      .toBe("blue-dark");
    expect(dockIconTheme({ theme: "system", darkTheme: "phosphor-dark", lightTheme: "blue-light" }, true))
      .toBe("phosphor-dark");
  });

  it("follows the light theme in light mode", () => {
    // Tangerine dark, Blue light, on light: the blue icon, not Tangerine's.
    syncThemedDockIcon(appearance({ theme: "light", lightTheme: "blue-light" }));
    expect(appliedFiles()).toEqual([path.join("/app", "build/dock-icons", "glass", "blue-dark.png")]);

    syncThemedDockIcon(appearance({ theme: "dark", lightTheme: "blue-light" }));
    expect(appliedFiles().at(-1)).toBe(path.join("/app", "build/icon-macos.png"));
  });

  it("re-syncs when the OS appearance changes under the system theme", () => {
    electronMocks.shouldUseDarkColors = false;
    syncThemedDockIcon(appearance({ darkTheme: "solarized-dark", lightTheme: "blue-light" }));
    expect(appliedFiles()).toEqual([path.join("/app", "build/dock-icons", "glass", "blue-dark.png")]);

    electronMocks.shouldUseDarkColors = true;
    for (const listener of electronMocks.themeListeners) listener();
    expect(appliedFiles().at(-1)).toBe(path.join("/app", "build/dock-icons", "glass", "solarized-dark.png"));
    expect(electronMocks.themeListeners).toHaveLength(1);
  });

  it("does nothing off macOS", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    syncThemedDockIcon(appearance({ darkTheme: "blue-dark" }));
    expect(electronMocks.setIcon).not.toHaveBeenCalled();
  });
});
