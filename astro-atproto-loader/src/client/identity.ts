import { AtpBaseClient } from "@atproto/api";
import { IdResolver } from "@atproto/identity";
import type { DidString } from "@atproto/syntax";

const identityResolver = new IdResolver({});

// Cache the in-flight promise (not just the resolved client) so concurrent
// callers for the same repo share one identity lookup — that is, one round
// of resolving the handle to a DID and then resolving the DID to its PDS.
// If the lookup rejects, the entry is evicted so the next caller retries
// instead of being stuck with a permanently failed result.
const clientCache = new Map<string, Promise<AtpBaseClient>>();

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

const resolvePdsClient = async (repo: string): Promise<AtpBaseClient> => {
  const did = await getDid(repo);
  const atprotoData = await identityResolver.did.resolveAtprotoData(did);
  const pds = atprotoData?.pds;
  if (!pds) {
    throw new Error(`Could not resolve a PDS for ${repo}`);
  }
  return new AtpBaseClient(pds);
};

export const getClient = async (repo: string): Promise<AtpBaseClient> => {
  let clientPromise = clientCache.get(repo);

  if (!clientPromise) {
    clientPromise = resolvePdsClient(repo);
    clientCache.set(repo, clientPromise);
  }

  try {
    return await clientPromise;
  } catch (error) {
    clientCache.delete(repo);
    throw error;
  }
};
