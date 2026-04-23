import { defineLiveCollection, z } from "astro:content";
import { atProtoLiveLoader } from "@fujocoded/astro-atproto-loader";

interface BlueskyPost {
  uri: string;
  text: string;
  authorHandle: string;
}

const fetchBlueskyPost = async (
  uri: string,
): Promise<BlueskyPost | undefined> => {
  const res = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`,
  );
  if (!res.ok) return undefined;

  const body = (await res.json()) as {
    posts?: Array<{
      record?: { text?: string };
      author?: { handle?: string };
    }>;
  };
  const [first] = body.posts ?? [];
  if (!first) return undefined;

  return {
    uri,
    text: first.record?.text ?? "",
    authorHandle: first.author?.handle ?? "",
  };
};

const badges = defineLiveCollection({
  loader: atProtoLiveLoader({
    source: {
      repo: "atmosphereconf.org",
      collection: "community.lexicon.badge.definition",
    },
  }),
  schema: z.object({
    name: z.string(),
    description: z.string().optional(),
    createdAt: z.string().optional(),
  }),
});

const streams = defineLiveCollection({
  loader: atProtoLiveLoader({
    source: {
      repo: "did:plc:r2vpg2iszskbkegoldmqa322",
      collection: "place.stream.livestream",
      limit: 5,
    },
    transform: async ({ value, rkey }) => {
      const raw = value as {
        post?: { uri?: string; cid?: string };
      } & Record<string, unknown>;

      const post = raw.post?.uri
        ? await fetchBlueskyPost(raw.post.uri)
        : undefined;

      return {
        id: rkey,
        data: { ...raw, post },
      };
    },
  }),
  schema: z.object({
    title: z.string(),
    url: z.string().url(),
    createdAt: z.coerce.date(),
    endedAt: z.coerce.date().optional(),
    post: z
      .object({
        uri: z.string(),
        text: z.string(),
        // We can use zod transform to normalize data here
        authorHandle: z.string().toLowerCase(),
      })
      .optional(),
  }),
});

export const collections = { badges, streams };
