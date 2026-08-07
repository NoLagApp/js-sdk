import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guards the packaging bug that silently breaks React Native.
 *
 * Metro resolves package exports with the conditions ["react-native",
 * "import"/"require"]. It does NOT understand "browser". Without a
 * "react-native" condition, `import '@nolag/js-sdk'` on React Native resolves
 * to the Node build, which imports `ws` and drags in net/tls/http, and Metro
 * fails to bundle.
 *
 * The nasty part is that older setups using legacy resolverMainFields pick up
 * the top-level "browser" field and work by accident, so this breaks for some
 * users and not others. These assertions are cheap and need no RN toolchain.
 */

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));

/** Minimal conditional-exports resolver: first matching key in insertion order wins. */
function resolveExport(
  entry: unknown,
  conditions: string[]
): string | null {
  if (typeof entry === "string") return entry;
  if (entry === null || typeof entry !== "object") return null;

  for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
    if (key === "default" || conditions.includes(key)) {
      const resolved = resolveExport(value, conditions);
      if (resolved !== null) return resolved;
    }
  }
  return null;
}

/** Conditions Metro applies for a native React Native build. */
const METRO_CONDITIONS = ["react-native", "import"];
/** Conditions a browser bundler (Vite, webpack, Rollup) applies. */
const BROWSER_CONDITIONS = ["browser", "import"];
/** Conditions Node applies for ESM and CJS. */
const NODE_ESM_CONDITIONS = ["node", "import"];
const NODE_CJS_CONDITIONS = ["node", "require"];

describe("package exports map", () => {
  const root = pkg.exports["."];

  it("declares a react-native condition", () => {
    expect(Object.keys(root)).toContain("react-native");
  });

  it("orders react-native ahead of browser, import, require and default", () => {
    // Conditional exports match in key order, so a late react-native key never
    // gets a chance against import/require.
    const keys = Object.keys(root);
    const rn = keys.indexOf("react-native");
    for (const later of ["browser", "import", "require", "default"]) {
      const index = keys.indexOf(later);
      if (index !== -1) expect(rn).toBeLessThan(index);
    }
  });

  it("declares a top-level react-native field for legacy resolverMainFields", () => {
    expect(pkg["react-native"]).toBeTruthy();
  });

  it("resolves each consumer to its own build", () => {
    expect(resolveExport(root, METRO_CONDITIONS)).toBe("./dist/react-native.js");
    expect(resolveExport(root, BROWSER_CONDITIONS)).toBe("./dist/browser.js");
    expect(resolveExport(root, NODE_ESM_CONDITIONS)).toBe("./dist/index.mjs");
    expect(resolveExport(root, NODE_CJS_CONDITIONS)).toBe("./dist/index.cjs");
  });

  it("never resolves React Native to the Node build", () => {
    const resolved = resolveExport(root, METRO_CONDITIONS);
    expect(resolved).not.toBe("./dist/index.mjs");
    expect(resolved).not.toBe("./dist/index.cjs");
  });

  it("ships every file the exports map points at", () => {
    const targets = [
      ...new Set(
        [
          METRO_CONDITIONS,
          BROWSER_CONDITIONS,
          NODE_ESM_CONDITIONS,
          NODE_CJS_CONDITIONS,
        ]
          .map((c) => resolveExport(root, c))
          .filter((t): t is string => t !== null)
      ),
      pkg["react-native"],
      pkg.browser,
      pkg.main,
      pkg.module,
      pkg.types,
    ];

    for (const target of targets) {
      expect(existsSync(join(pkgRoot, target)), `missing ${target}`).toBe(true);
    }
  });
});

describe("react-native build contents", () => {
  const rnBuild = join(pkgRoot, "dist/react-native.js");

  it("does not pull in ws, wrtc or any Node core module", () => {
    const source = readFileSync(rnBuild, "utf8");
    // Metro collects dependencies statically and fails the bundle on anything
    // it cannot resolve, so these break the build, not just runtime.
    //
    // wrtc is the subtle one: it sits inside a try/catch, which Metro only
    // tolerates when `allowOptionalDependencies` is on. @expo/metro-config
    // enables it; bare @react-native/metro-config leaves it false. So a wrtc
    // require here bundles fine on Expo and fails on bare React Native.
    for (const pkg of ["ws", "net", "tls", "http", "wrtc"]) {
      for (const quoted of [`'${pkg}'`, `"${pkg}"`]) {
        expect(source.includes(`require(${quoted})`), `requires ${pkg}`).toBe(false);
        expect(source.includes(`from ${quoted}`), `imports ${pkg}`).toBe(false);
      }
    }
  });

  it("uses the global WebSocket, which React Native provides natively", () => {
    expect(readFileSync(rnBuild, "utf8")).toContain("new WebSocket(url)");
  });

  it("omits the WebRTC module, which needs react-native-webrtc", async () => {
    // Exporting a WebRTCManager that can only throw "install wrtc" on React
    // Native would be worse than not exporting one at all.
    const mod = await import(rnBuild);
    expect(mod.WebRTCManager).toBeUndefined();
  });

  it("exports everything else the browser build does", async () => {
    // The RN entry is hand-written rather than a re-export, so it can drift.
    const [rn, browser] = await Promise.all([
      import(rnBuild),
      import(join(pkgRoot, "dist/browser.js")),
    ]);

    const webrtcExports = ["WebRTCManager"];
    const missing = Object.keys(browser)
      .filter((name) => !webrtcExports.includes(name))
      .filter((name) => !(name in rn));

    expect(missing).toEqual([]);
  });
});
