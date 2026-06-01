import { createMockRepoIdentity } from "@fujocoded/msw-atproto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import {
  TEST_ACCOUNT_AUTH_SERVER,
  TEST_ACCOUNT_DID,
  TEST_ACCOUNT_HANDLE,
  TEST_ACCOUNT_PDS,
} from "./auth-fixtures.ts";

// MSW handlers that fake the AT Protocol OAuth login flow. Before a real
// login can redirect the user, the client needs to:
//   1. resolve the account's handle to its DID, then the DID to its PDS
//   2. ask the PDS which auth server protects it
//   3. read that auth server's metadata
//   4. push the authorization request to the auth server
// We fake every step so the OAuth route tests never hit the network.

// Form body of every Pushed Authorization Request the login route sends.
// Tests read this to assert on the scopes and parameters that went out.
// Call resetParRequests() between tests so one test's requests don't leak
// into the next.
export const parRequests: URLSearchParams[] = [];

export const resetParRequests = () => {
  parRequests.length = 0;
};

export const server = setupServer(
  // Step 1: resolve the test account's handle to its DID, and the DID to its PDS.
  ...createMockRepoIdentity({
    did: TEST_ACCOUNT_DID,
    handle: TEST_ACCOUNT_HANDLE,
    pds: TEST_ACCOUNT_PDS,
  }).handlers(),

  // Step 2: the PDS points the client at the auth server that guards it.
  http.get(`${TEST_ACCOUNT_PDS}/.well-known/oauth-protected-resource`, () => {
    return HttpResponse.json({
      resource: TEST_ACCOUNT_PDS,
      authorization_servers: [TEST_ACCOUNT_AUTH_SERVER],
    });
  }),

  // Step 3: the auth server's metadata. Every endpoint and capability the
  // login flow reads before building its request. require_pushed_authorization_requests
  // is true, so the client must use the PAR endpoint below.
  http.get(
    `${TEST_ACCOUNT_AUTH_SERVER}/.well-known/oauth-authorization-server`,
    () => {
      return HttpResponse.json({
        issuer: TEST_ACCOUNT_AUTH_SERVER,
        authorization_endpoint: `${TEST_ACCOUNT_AUTH_SERVER}/oauth/authorize`,
        token_endpoint: `${TEST_ACCOUNT_AUTH_SERVER}/oauth/token`,
        pushed_authorization_request_endpoint: `${TEST_ACCOUNT_AUTH_SERVER}/oauth/par`,
        protected_resources: [TEST_ACCOUNT_PDS],
        scopes_supported: ["atproto"],
        response_types_supported: ["code"],
        response_modes_supported: ["query"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        dpop_signing_alg_values_supported: ["ES256"],
        client_id_metadata_document_supported: true,
        require_pushed_authorization_requests: true,
      });
    },
  ),

  // Step 4: the Pushed Authorization Request endpoint. The login route posts
  // its authorization parameters here. We record each request body for tests
  // to inspect, then hand back a request_uri the client puts in its redirect.
  http.post(`${TEST_ACCOUNT_AUTH_SERVER}/oauth/par`, async ({ request }) => {
    parRequests.push(new URLSearchParams(await request.text()));

    return HttpResponse.json({
      request_uri: "urn:ietf:params:oauth:request_uri:test-request",
      expires_in: 60,
    });
  }),
);
