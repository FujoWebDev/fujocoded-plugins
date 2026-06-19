import { defineConfig, devices } from "@playwright/test";
import { env } from "node:process";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const browser = devices["Desktop Chrome"];
const host = "127.0.0.1";

const astroExamples = [
  { version: 5, port: 4325 },
  { version: 6, port: 4326 },
  { version: 7, port: 4327 },
] as const;

const exampleUrl = (port: number) => `http://${host}:${port}`;
const exampleName = (version: number) => `astro-${version}`;

export default defineConfig({
  testDir: "./__tests__/e2e",
  fullyParallel: false,
  forbidOnly: !!env.CI,
  retries: env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  projects: astroExamples.map(({ version, port }) => ({
    name: `${exampleName(version)}-native`,
    use: {
      ...browser,
      baseURL: exampleUrl(port),
      javaScriptEnabled: false,
    },
  })),
  webServer: astroExamples.map(({ version, port }) => ({
    command: `npm --prefix __examples__/${exampleName(version)} run dev -- --host ${host} --port ${port}`,
    cwd: packageRoot,
    url: exampleUrl(port),
    reuseExistingServer: !env.CI,
  })),
});
