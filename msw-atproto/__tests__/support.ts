import { cidForRecord, createMockAtprotoRepo } from "../src/index.ts";

import { server } from "./msw/server.ts";

export const DID = "did:plc:mswtest123456789012345";
export const HANDLE = "msw.example.test";
export const PDS = "https://pds.fujocoded.test";
export const COLLECTION = "app.bsky.feed.post";
export const OTHER_COLLECTION = "app.bsky.feed.like";
export const OTHER_CID =
  "bafkreics4felvw3rnpwriv7avyvb3qdfutobmovlrskpbxshlmjkers6b4";

export const expectedRepoCid = (
  rkey: string,
  value: Record<string, unknown>,
): string =>
  cidForRecord({
    repo: DID,
    collection: COLLECTION,
    rkey,
    value,
  });

export const fetchJson = async <Body = unknown>(
  input: string,
  init?: RequestInit,
) => {
  const response = await fetch(input, init);
  return {
    response,
    body: (await response.json()) as Body,
  };
};

export const setupRepo = (
  options: Parameters<typeof createMockAtprotoRepo>[0],
) => {
  const repo = createMockAtprotoRepo(options);
  server.use(...repo.handlers());
  return repo;
};
