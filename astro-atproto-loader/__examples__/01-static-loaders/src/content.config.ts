import { z } from "astro:content";
import { defineAtProtoCollection } from "@fujocoded/astro-atproto-loader";

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

const badges = defineAtProtoCollection({
  source: {
    repo: "atmosphereconf.org",
    collection: "community.lexicon.badge.definition",
  },
  outputSchema: z.object({
    name: z.string(),
    description: z.string().optional(),
    createdAt: z.string().optional(),
  }),
});

const StreamRecordSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  createdAt: z.string(),
  endedAt: z.string().optional(),
  post: z.object({ uri: z.string(), cid: z.string().optional() }).optional(),
});

const streams = defineAtProtoCollection({
  source: {
    repo: "did:plc:r2vpg2iszskbkegoldmqa322",
    collection: "place.stream.livestream",
    limit: 5,
    parseRecord: (value) => StreamRecordSchema.parse(value),
  },
  transform: async ({ value, rkey }) => {
    const post = value.post?.uri
      ? await fetchBlueskyPost(value.post.uri)
      : undefined;

    return {
      id: rkey,
      data: {
        title: value.title,
        url: value.url,
        createdAt: value.createdAt,
        endedAt: value.endedAt,
        post,
      },
    };
  },
  outputSchema: z.object({
    title: z.string(),
    url: z.string().url(),
    createdAt: z.string(),
    endedAt: z.string().optional(),
    post: z
      .object({
        uri: z.string(),
        text: z.string(),
        authorHandle: z.string().toLowerCase(),
      })
      .optional(),
  }),
});

export const collections = { badges, streams };
