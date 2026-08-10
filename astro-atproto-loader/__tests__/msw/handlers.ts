import { FAKE_CID } from "@fujocoded/msw-atproto";
import { http, HttpResponse, type HttpHandler } from "msw";

// Don't replace these with msw-atproto's stateful repo mock. That mock manages
// pagination internally, but tests here assert the wire protocol itself: which
// cursor each request carries, how many pages get fetched, what limit is sent.
// Scripting exact pages/cursors locally is the point. Identity mocking has no
// such needs, so it uses @fujocoded/msw-atproto directly.
export type FakeRecord = {
  did: string;
  rkey: string;
  value: Record<string, unknown>;
  cid?: string;
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
      return new HttpResponse(JSON.stringify({ error: "RecordNotFound" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
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
