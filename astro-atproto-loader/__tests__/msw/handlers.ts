import { P256Keypair } from "@atproto/crypto";
import { http, HttpResponse, type HttpHandler } from "msw";

// Valid CIDv1 that passes `multiformats/cid`'s `CID.parse`. The lexicon
// validator rejects responses that lack a parseable cid, so every fake
// record we serve needs one.
export const FAKE_CID =
  "bafyreidfayvfuwqa7qlnopdjiqrxzs6blmoeu4rujcjtnci5beludirz2a";

// `@atproto/identity` insists on a well-formed DID document — signingKey +
// handle + pds all required — even though the loader only cares about pds.
// Generate one real P-256 multibase key at module load and reuse it.
const keypair = await P256Keypair.create();
const SIGNING_KEY_MULTIBASE = keypair.did().slice("did:key:".length);

export type FakeRecord = {
  did: string;
  rkey: string;
  value: Record<string, unknown>;
  cid?: string;
};

export type RepoIdentity = {
  did: string;
  pds: string;
  handle?: string;
};

export const mockRepoIdentity = ({
  did,
  pds,
  handle,
}: RepoIdentity): HttpHandler[] => {
  const advertisedHandle = handle ?? `${did.split(":").pop()}.example.test`;

  const handlers: HttpHandler[] = [
    http.get(`https://plc.directory/${encodeURIComponent(did)}`, () =>
      HttpResponse.json({
        id: did,
        alsoKnownAs: [`at://${advertisedHandle}`],
        verificationMethod: [
          {
            id: `${did}#atproto`,
            type: "Multikey",
            controller: did,
            publicKeyMultibase: SIGNING_KEY_MULTIBASE,
          },
        ],
        service: [
          {
            id: "#atproto_pds",
            type: "AtprotoPersonalDataServer",
            serviceEndpoint: pds,
          },
        ],
      }),
    ),
  ];

  if (handle) {
    handlers.push(
      http.get(`https://${handle}/.well-known/atproto-did`, () =>
        HttpResponse.text(did),
      ),
    );
  }

  return handlers;
};

export type MockListRecordsConfig = {
  pds: string;
  repo: string;
  collection: string;
  pages: FakeRecord[][];
  onCall?: (cursor: string | null) => void;
};

export const mockListRecords = ({
  pds,
  repo,
  collection,
  pages,
  onCall,
}: MockListRecordsConfig): HttpHandler =>
  http.get(`${pds}/xrpc/com.atproto.repo.listRecords`, ({ request }) => {
    const url = new URL(request.url);
    const queryRepo = url.searchParams.get("repo");
    const queryCollection = url.searchParams.get("collection");

    if (queryRepo !== repo || queryCollection !== collection) {
      return new HttpResponse(
        JSON.stringify({
          error: "InvalidRequest",
          message: `No fake records registered for repo=${queryRepo} collection=${queryCollection}`,
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }

    const cursor = url.searchParams.get("cursor");
    onCall?.(cursor);
    const pageIndex = cursor ? Number.parseInt(cursor, 10) : 0;
    const page = pages[pageIndex] ?? [];
    const hasNext = pageIndex + 1 < pages.length;

    return HttpResponse.json({
      records: page.map((record) => ({
        uri: `at://${record.did}/${collection}/${record.rkey}`,
        cid: record.cid ?? FAKE_CID,
        value: record.value,
      })),
      cursor: hasNext ? String(pageIndex + 1) : undefined,
    });
  });

export type MockGetRecordConfig = {
  pds: string;
  repo: string;
  collection: string;
  record: FakeRecord;
};

export const mockGetRecord = ({
  pds,
  repo,
  collection,
  record,
}: MockGetRecordConfig): HttpHandler =>
  http.get(`${pds}/xrpc/com.atproto.repo.getRecord`, ({ request }) => {
    const url = new URL(request.url);
    if (
      url.searchParams.get("repo") !== repo ||
      url.searchParams.get("collection") !== collection ||
      url.searchParams.get("rkey") !== record.rkey
    ) {
      return new HttpResponse(
        JSON.stringify({ error: "RecordNotFound" }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    return HttpResponse.json({
      uri: `at://${record.did}/${collection}/${record.rkey}`,
      cid: record.cid,
      value: record.value,
    });
  });

export const failingGetRecord = (pds: string): HttpHandler =>
  http.get(`${pds}/xrpc/com.atproto.repo.getRecord`, () =>
    HttpResponse.error(),
  );
