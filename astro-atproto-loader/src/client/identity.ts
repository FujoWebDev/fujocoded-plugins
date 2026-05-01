import { AtpBaseClient } from "@atproto/api";
import { IdResolver } from "@atproto/identity";
import type { DidString } from "@atproto/syntax";

const identityResolver = new IdResolver({});

// Cache the in-flight identity lookup, keyed by the caller-provided repo
// string. Each lookup resolves the handle to a DID, then the DID to a PDS.
// Failed lookups are evicted so the next caller retries instead of reusing
// the rejected promise.
type AtprotoIdentity = { did: DidString; pds: string };
const identityCache = new Map<string, Promise<AtprotoIdentity>>();

export const getDid = async (repo: string): Promise<DidString> => {
  if (repo.startsWith("did:")) {
    return repo as DidString;
  }

  const did = await identityResolver.handle.resolve(repo);
  if (!did) {
    throw new Error(`Could not resolve a DID for ${repo}`);
  }

  return did as DidString;
};

const getIdentity = (repo: string): Promise<AtprotoIdentity> => {
  const cached = identityCache.get(repo);
  if (cached) {
    return cached;
  }

  const request = (async () => {
    const did = await getDid(repo);
    const atprotoData = await identityResolver.did.resolveAtprotoData(did);
    if (!atprotoData?.pds) {
      throw new Error(`Could not resolve a PDS for ${repo}`);
    }
    return { did, pds: atprotoData.pds };
  })();

  identityCache.set(repo, request);
  request.catch(() => {
    // Kick out failed lookups so retries don't reuse the rejected promise.
    if (identityCache.get(repo) === request) {
      identityCache.delete(repo);
    }
  });

  return request;
};

export const getPds = async (repo: string): Promise<string> =>
  (await getIdentity(repo)).pds;

export const getClient = async (repo: string): Promise<AtpBaseClient> =>
  new AtpBaseClient((await getIdentity(repo)).pds);
