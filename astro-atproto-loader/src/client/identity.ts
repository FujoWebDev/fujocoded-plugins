import { AtpBaseClient } from "@atproto/api";
import type { DidString } from "@atproto/syntax";

import type { AtProtoCache } from "../cache/index.ts";
import type { AtProtoRecordRepo } from "../types.ts";

const getDid = async (
  repo: string,
  caches: AtProtoCache,
): Promise<DidString> => {
  if (repo.startsWith("did:")) {
    return repo as DidString;
  }

  const did = await caches.resolver.handle.resolve(repo);
  if (!did) {
    throw new Error(`Could not resolve a DID for ${repo}`);
  }

  return did as DidString;
};

const getIdentity = (
  repo: string,
  caches: AtProtoCache,
): Promise<AtProtoRecordRepo> =>
  caches.identity.get(repo, async () => {
    const did = await getDid(repo, caches);
    const atprotoData = await caches.resolver.did.resolveAtprotoData(did);
    if (!atprotoData?.pds) {
      throw new Error(`Could not resolve a PDS for ${repo}`);
    }
    return { did, pds: atprotoData.pds };
  });

export const getPds = async (
  repo: string,
  caches: AtProtoCache,
): Promise<string> => (await getIdentity(repo, caches)).pds;

export const getClient = async (
  repo: string,
  caches: AtProtoCache,
): Promise<AtpBaseClient> =>
  new AtpBaseClient((await getIdentity(repo, caches)).pds);
