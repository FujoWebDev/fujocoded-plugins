import { beforeEach, describe, expect, test, vi } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

vi.mock("node:fs/promises", () => ({
  rm: vi.fn(async () => {}),
}));

import { rm } from "node:fs/promises";
import { passRoutePatternsToMiddleware } from "../index.ts";
import { removeDevOnlyStaticFiles } from "../static-files.ts";

const VIRTUAL_ID = "\0fujocoded:dev-only-routes";

// Minimal route fixtures. The real Astro types carry dozens of
// fields we never touch here, so we build the few the file-removal path reads.
const prerenderedRoute = (route: string, distURL: URL | URL[]) => ({
  route,
  prerender: true,
  distURL,
});

const makeLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

const insideDist = (...segments: string[]) =>
  pathToFileURL(resolve(process.cwd(), "dist", ...segments));

const removeFilesForRoutes = async (
  routes: ReturnType<typeof prerenderedRoute>[],
  routePatterns: (string | RegExp)[],
  opts: { dryRun?: boolean } = {},
) =>
  removeDevOnlyStaticFiles({
    routes,
    routePatterns,
    logger: makeLogger(),
    ...opts,
  });

const loadVirtualModule = (patterns: (string | RegExp)[], id = VIRTUAL_ID) =>
  passRoutePatternsToMiddleware(patterns).load?.(id);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("passRoutePatternsToMiddleware virtual module", () => {
  test("emits string patterns as escaped JSON literals", () => {
    expect(loadVirtualModule(["/secret"])).toBe(
      'export const excludedPatterns = ["/secret"];',
    );
  });

  test("escapes quotes in route strings instead of breaking the literal", () => {
    // Before the fix this used `"${route}"`, so a quote in the route produced
    // invalid JS (and a string-escape footgun). JSON.stringify escapes it.
    expect(loadVirtualModule(['/he said "hi"'])).toBe(
      'export const excludedPatterns = ["/he said \\"hi\\""];',
    );
  });

  test("passes regex patterns through as regex literals", () => {
    expect(loadVirtualModule([/^\/admin/])).toBe(
      "export const excludedPatterns = [/^\\/admin/];",
    );
  });

  test("ignores ids other than the virtual module", () => {
    expect(loadVirtualModule(["/secret"], "some/other/id")).toBe(undefined);
  });
});

describe("astro:build:done file removal", () => {
  test("removes prerendered dev-only files inside the build dir", async () => {
    const distURL = insideDist("secret", "index.html");
    await removeFilesForRoutes(
      [prerenderedRoute("/secret", distURL)],
      ["/secret"],
    );
    expect(rm).toHaveBeenCalledTimes(1);
    expect(rm).toHaveBeenCalledWith(distURL);
  });

  test("removes every file when distURL is an array (Astro 5)", async () => {
    const a = insideDist("secret", "index.html");
    const b = insideDist("secret", "data.json");
    await removeFilesForRoutes(
      [prerenderedRoute("/secret", [a, b])],
      ["/secret"],
    );
    expect(rm).toHaveBeenCalledTimes(2);
    expect(rm).toHaveBeenCalledWith(a);
    expect(rm).toHaveBeenCalledWith(b);
  });

  test("refuses to remove a file:// path that escapes the project dir", async () => {
    // Regression: with `path.toString()` the "file://" scheme made resolve()
    // treat the path as relative, prefix it with cwd, and pass the guard —
    // a path-escape bypass on a `rm`. fileURLToPath gives /etc/passwd, which
    // is correctly rejected.
    const evil = new URL("file:///etc/passwd");
    await expect(
      removeFilesForRoutes([prerenderedRoute("/secret", evil)], ["/secret"]),
    ).rejects.toThrow(/dangerous path/);
    expect(rm).not.toHaveBeenCalled();
  });

  test("refuses to remove project files outside the build dir", async () => {
    const outsideDist = pathToFileURL(resolve(process.cwd(), "package.json"));
    await expect(
      removeFilesForRoutes(
        [prerenderedRoute("/secret", outsideDist)],
        ["/secret"],
      ),
    ).rejects.toThrow(/dangerous path/);
    expect(rm).not.toHaveBeenCalled();
  });

  test("does not remove anything on a dry run", async () => {
    const distURL = insideDist("secret", "index.html");
    await removeFilesForRoutes(
      [prerenderedRoute("/secret", distURL)],
      ["/secret"],
      {
        dryRun: true,
      },
    );
    expect(rm).not.toHaveBeenCalled();
  });

  test("ignores routes that are not prerendered or do not match a pattern", async () => {
    const distURL = insideDist("keep", "index.html");
    await removeFilesForRoutes(
      [
        { route: "/secret", prerender: false, distURL },
        prerenderedRoute("/other", distURL),
      ],
      ["/secret"],
    );
    expect(rm).not.toHaveBeenCalled();
  });
});
