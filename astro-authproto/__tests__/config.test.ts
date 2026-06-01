import { describe, expect, test } from "vitest";

import { createClientMetadata } from "../src/lib/auth.ts";
import { getConfig } from "../src/lib/config.ts";

const parseClientId = (clientId: string | undefined): URL => {
  expect(clientId).toEqual(expect.any(String));
  if (typeof clientId !== "string") {
    throw new Error("Expected client_id to be a string");
  }
  return new URL(clientId);
};

describe("authproto config virtual module", () => {
  test("emits parseable JavaScript for quoted string options", () => {
    const source = getConfig({
      options: {
        applicationName: 'Auth "Proto" Test',
        applicationDomain: 'https://fujocoded.test/"quoted"',
        driver: { name: "memory", options: undefined },
      },
      isDev: false,
    });
    const parseableSource = source
      .replace(/^\s*import .*$/gm, "")
      .replace(/\bexport const\b/g, "const");

    // Compiling the generated source is how we assert it is syntactically valid.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    expect(() => new Function(parseableSource)).not.toThrow();
    expect(source).toContain(
      'export const applicationName = "Auth \\"Proto\\" Test";',
    );
    expect(source).toContain(
      'export const applicationDomain = "https://fujocoded.test/\\"quoted\\"";',
    );
    expect(source).toContain('export const driverName = "memory";');
    expect(source).toContain(
      'export const clientMetadataDomain = process.env.AUTHPROTO_EXTERNAL_DOMAIN ?? "https://fujocoded.test/\\"quoted\\"" ?? "https://fujocoded.test/\\"quoted\\"";',
    );
  });
});

describe("createClientMetadata", () => {
  test("localhost domain stuffs scope and redirect_uri into the client_id URL", () => {
    const metadata = createClientMetadata("http://127.0.0.1:4321");

    expect(metadata).toMatchObject({
      client_id: expect.any(String),
      client_name: "AuthProto Test App",
      client_uri: "http://127.0.0.1:4321/",
      redirect_uris: ["http://127.0.0.1:4321/oauth/callback"],
      jwks_uri: "http://127.0.0.1:4321/jwks.json",
      scope: "atproto transition:generic transition:email",
    });

    const clientId = parseClientId(metadata.client_id);
    expect(clientId.origin).toBe("http://localhost");
    expect(clientId.searchParams.get("scope")).toBe(
      "atproto transition:generic transition:email",
    );
    expect(clientId.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:4321/oauth/callback",
    );
  });

  test("rewrites the literal 'localhost' hostname to 127.0.0.1 per RFC 8252", () => {
    const metadata = createClientMetadata("http://localhost:4321");

    expect(metadata).toMatchObject({
      client_id: expect.any(String),
      client_uri: "http://127.0.0.1:4321/",
      redirect_uris: ["http://127.0.0.1:4321/oauth/callback"],
    });
    expect(
      parseClientId(metadata.client_id).searchParams.get("redirect_uri"),
    ).toBe("http://127.0.0.1:4321/oauth/callback");
  });

  test("non-localhost domain points client_id at /oauth-client-metadata.json", () => {
    const metadata = createClientMetadata("https://fujocoded.test");

    expect(metadata).toMatchObject({
      client_id: "https://fujocoded.test/oauth-client-metadata.json",
      client_uri: "https://fujocoded.test/",
      redirect_uris: ["https://fujocoded.test/oauth/callback"],
      jwks_uri: "https://fujocoded.test/jwks.json",
      scope: "atproto transition:generic transition:email",
    });
  });
});
