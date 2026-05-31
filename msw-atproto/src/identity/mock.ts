import type { DidDocument } from "@atproto/common-web";
import { P256Keypair } from "@atproto/crypto";
import { AtUri } from "@atproto/syntax";
import { http, HttpResponse, type HttpHandler } from "msw";

export type { DidDocument };

export type RepoIdentity = {
  did: string;
  /**
   * PDS URL advertised in the DID document, like `https://pds.fujocoded.test`.
   * Defaults to the package's built-in example PDS URL.
   */
  pds?: string;
  /**
   * Optional handle served from `https://<handle>/.well-known/atproto-did`.
   */
  handle?: string;
};

export type MockPlcOperationFlowConfig = RepoIdentity & {
  /**
   * PLC directory base URL. Defaults to `https://plc.directory`.
   */
  plcDirectoryUrl?: string;
  operation: {
    verificationMethods?: Record<string, string>;
    rotationKeys?: string[];
    alsoKnownAs?: string[];
    services?: Record<string, unknown>;
  };
  /**
   * Signed operation returned by the fake PDS. Defaults to the submitted body
   * with `signed: true`.
   */
  signedOperation?: Record<string, unknown>;
  /**
   * Runs when the client asks the PDS to sign a PLC operation.
   */
  onSign?: (body: Record<string, unknown>) => void;
  /**
   * Runs when the client submits the signed operation to the PLC directory.
   */
  onSubmit?: (body: Record<string, unknown>) => void;
};

export type MockRepoIdentity = Required<Pick<RepoIdentity, "did" | "pds">> &
  Pick<RepoIdentity, "handle"> & {
    handlers(): HttpHandler[];
  } & ReturnType<typeof createMutableRepoIdentity>["controls"];

export type MockPlcOperationFlow = Required<
  Pick<MockPlcOperationFlowConfig, "did" | "pds" | "plcDirectoryUrl">
> & {
  handlers(): HttpHandler[];
};

// `@atproto/identity` insists on a well-formed DID document: signingKey,
// handle, and pds are all required even when callers only care about pds.
const createDidDocument = async ({
  did,
  pds = "https://pds.fujocoded.test",
  handle,
}: RepoIdentity): Promise<DidDocument> => {
  const advertisedHandle = handle ?? `${did.split(":").pop()}.example.test`;
  const keypair = await P256Keypair.create();
  const publicKeyMultibase = keypair.did().slice("did:key:".length);

  return {
    id: did,
    alsoKnownAs: [AtUri.make(advertisedHandle).origin],
    verificationMethod: [
      {
        id: `${did}#atproto`,
        type: "Multikey",
        controller: did,
        publicKeyMultibase,
      },
    ],
    service: [
      {
        id: "#atproto_pds",
        type: "AtprotoPersonalDataServer",
        serviceEndpoint: pds,
      },
    ],
  };
};

const definePlcDidDocumentRoute = (
  did: string,
  resolveDocument: () => DidDocument | Promise<DidDocument>,
): HttpHandler =>
  http.get(`https://plc.directory/${encodeURIComponent(did)}`, async () =>
    HttpResponse.json(await resolveDocument()),
  );

export const createMutableRepoIdentity = ({
  did,
  pds = "https://pds.fujocoded.test",
  handle,
}: RepoIdentity) => {
  const initialDidDocument = createDidDocument({ did, pds, handle });
  let didDocument = initialDidDocument.then((document) =>
    structuredClone(document),
  );
  let handleDid = did;

  return {
    handlers: (): HttpHandler[] => {
      const handlers: HttpHandler[] = [
        definePlcDidDocumentRoute(did, () => didDocument),
      ];

      if (handle) {
        handlers.push(
          http.get(`https://${handle}/.well-known/atproto-did`, () =>
            HttpResponse.text(handleDid),
          ),
        );
      }

      return handlers;
    },
    controls: {
      plcNotFound: (): HttpHandler =>
        http.get(`https://plc.directory/${encodeURIComponent(did)}`, () =>
          HttpResponse.json(
            { error: "NotFound", message: "DID not found" },
            { status: 404 },
          ),
        ),
      didDocument: (document: DidDocument): HttpHandler =>
        http.get(`https://plc.directory/${encodeURIComponent(did)}`, () =>
          HttpResponse.json(document),
        ),
      wellKnownNotFound: (): HttpHandler => {
        if (!handle) {
          throw new Error("wellKnownNotFound requires a repo handle");
        }
        return http.get(`https://${handle}/.well-known/atproto-did`, () =>
          HttpResponse.text("Not found", { status: 404 }),
        );
      },
      handleResolvesTo: (otherDid: string): HttpHandler => {
        if (!handle) {
          throw new Error("handleResolvesTo requires a repo handle");
        }
        return http.get(`https://${handle}/.well-known/atproto-did`, () =>
          HttpResponse.text(otherDid),
        );
      },
      setDidDocument(document: DidDocument) {
        didDocument = Promise.resolve(structuredClone(document));
      },
      updateDidDocument(update: (document: DidDocument) => DidDocument) {
        didDocument = didDocument.then((document) =>
          structuredClone(update(structuredClone(document))),
        );
      },
      setVerificationMethod(name: string, didKeyOrMultibase: string) {
        didDocument = didDocument.then((document) => {
          const next = structuredClone(document);
          const methods = Array.isArray(next.verificationMethod)
            ? next.verificationMethod
            : [];
          const id = `${did}#${name}`;
          const existing = methods.find((method) => method.id === id);
          const publicKeyMultibase = didKeyOrMultibase.startsWith("did:key:")
            ? didKeyOrMultibase.slice("did:key:".length)
            : didKeyOrMultibase;

          if (existing) {
            existing.publicKeyMultibase = publicKeyMultibase;
            next.verificationMethod = methods;
            return next;
          }

          next.verificationMethod = [
            ...methods,
            { id, type: "Multikey", controller: did, publicKeyMultibase },
          ];
          return next;
        });
      },
      setHandleDid(nextDid: string) {
        if (!handle) {
          throw new Error(`setHandleDid requires a repo handle`);
        }
        handleDid = nextDid;
      },
      reset() {
        didDocument = initialDidDocument.then((document) =>
          structuredClone(document),
        );
        handleDid = did;
      },
    },
  };
};

/**
 * Builds one fake ATproto identity for tests that only need DID or handle
 * lookup.
 *
 * Use `createMockAtprotoRepo` when the test also reads or writes records. That
 * helper includes these identity handlers, the PDS handlers, and the same
 * identity controls for changing behavior mid-test.
 */
export const createMockRepoIdentity = ({
  did,
  pds = "https://pds.fujocoded.test",
  handle,
}: RepoIdentity): MockRepoIdentity => {
  const identity = createMutableRepoIdentity({ did, pds, handle });

  return {
    did,
    pds,
    handle,
    handlers: identity.handlers,
    ...identity.controls,
  };
};

export const useMockRepoIdentity = (
  server: { use(...handlers: HttpHandler[]): void },
  config: RepoIdentity,
): MockRepoIdentity => {
  const identity = createMockRepoIdentity(config);
  server.use(...identity.handlers());
  return identity;
};

/**
 * Builds the fake flow used when code asks a PDS to update a DID document.
 *
 * The flow runs in order:
 *
 * 1. The PDS reads the previous op from the PLC audit log
 * 2. The PDS signs the proposed op
 * 3. The signed op is submitted back to the PLC directory
 *
 * `onSign` and `onSubmit` fire so the test can assert on each payload.
 * `signedOperation` lets the test choose the value the fake PDS returns from
 * step 2. When omitted, the fake echoes the submitted body with
 * `signed: true` stamped on.
 */
export const createMockPlcOperationFlow = ({
  did,
  pds = "https://pds.fujocoded.test",
  plcDirectoryUrl = "https://plc.directory",
  operation,
  signedOperation,
  onSign,
  onSubmit,
}: MockPlcOperationFlowConfig): MockPlcOperationFlow => ({
  did,
  pds,
  plcDirectoryUrl,
  handlers: () => [
    http.get(
      ({ request }) => request.url === `${plcDirectoryUrl}/${did}/log/audit`,
      () => HttpResponse.json([{ operation }]),
    ),
    http.post(
      `${pds}/xrpc/com.atproto.identity.signPlcOperation`,
      async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        onSign?.(body);

        return HttpResponse.json({
          operation: signedOperation ?? { ...body, signed: true },
        });
      },
    ),
    http.post(
      ({ request }) => request.url === `${plcDirectoryUrl}/${did}`,
      async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        onSubmit?.(body);

        return HttpResponse.json({});
      },
    ),
  ],
});

export const useMockPlcOperationFlow = (
  server: { use(...handlers: HttpHandler[]): void },
  config: MockPlcOperationFlowConfig,
): MockPlcOperationFlow => {
  const flow = createMockPlcOperationFlow(config);
  server.use(...flow.handlers());
  return flow;
};
