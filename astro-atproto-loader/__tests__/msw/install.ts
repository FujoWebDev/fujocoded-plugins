import { createMockRepoIdentity } from "@fujocoded/msw-atproto";

import { server } from "./server.ts";
import { mockGetRecord, mockListRecords, type FakeRecord } from "./handlers.ts";

export const PDS = "https://pds.example.test";

type ScriptedRecord = Omit<FakeRecord, "did">;

type ScriptedRepoConfig = {
  did: string;
  handle?: string;
  pds?: string;
  collection: string;
};

// Composes identity resolution + scripted listRecords pages; the loader is
// configured with the handle when one exists, so that's what arrives as ?repo=.
export const installScriptedRepo = ({
  did,
  handle,
  pds = PDS,
  collection,
  pages,
  onCall,
}: ScriptedRepoConfig & {
  pages: ScriptedRecord[][];
  onCall?: (cursor: string | null) => void;
}) => {
  server.use(
    ...createMockRepoIdentity({ did, pds, handle }).handlers(),
    mockListRecords({
      pds,
      repo: handle ?? did,
      collection,
      onCall,
      pages: pages.map((page) => page.map((record) => ({ did, ...record }))),
    }),
  );
};

export const installScriptedRecord = ({
  did,
  handle,
  pds = PDS,
  collection,
  record,
}: ScriptedRepoConfig & { record: ScriptedRecord }) => {
  server.use(
    ...createMockRepoIdentity({ did, pds, handle }).handlers(),
    mockGetRecord({
      pds,
      repo: handle ?? did,
      collection,
      record: { did, ...record },
    }),
  );
};
