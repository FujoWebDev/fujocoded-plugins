// A single Astro live collection, `sharedReposts`, that lists
// Bluesky posts every account in our list has reposted.
//
// How it works:
//   1. The loader reads `app.bsky.feed.repost` from three repos.
//   2. `parseRecord` runs each raw record through a Zod schema so malformed
//      records are dropped and survivors are typed.
//   3. `groupBy` keys each repost by the URI of the post it points at, so
//      records pointing at the same post end up in one group.
//   4. `transform` keeps groups whose size matches `sources.length` (the
//      post was reposted by everyone), then uses `fetchRecord` to hydrate
//      the original post and every participant's profile before returning
//      the entry. URLs (CDN, profile, post) are baked in here so the page
//      doesn't have to refetch them and can put them straight into the markup.
//   5. The final schema is what `getLiveCollection("sharedReposts")` resolves to
//      on the page side, after Zod validates the transform's output.
import { z } from "astro:content";
import { AtUri } from "@atproto/syntax";
import { defineAtProtoLiveCollection } from "@fujocoded/astro-atproto-loader";

// Set up validation for schemas via zod
const BlobRefSchema = z
  .object({
    ref: z.unknown(),
    mimeType: z.string(),
  })
  .transform((blob) => ({
    cid: blob.ref == null ? undefined : String(blob.ref),
    mimeType: blob.mimeType,
  }));

const RepostSchema = z.object({
  subject: z.object({ uri: z.string(), cid: z.string() }),
  createdAt: z.string(),
});

const ProfileSchema = z.object({
  displayName: z.string().optional(),
  avatar: BlobRefSchema.optional(),
});

const ImagesEmbedSchema = z.object({
  $type: z.literal("app.bsky.embed.images"),
  images: z.array(
    z.object({ image: BlobRefSchema, alt: z.string().optional() }),
  ),
});

const PostSchema = z.object({
  text: z.string(),
  embed: z.unknown().optional(),
});

// Pull the first image off a post, if it has one. Bluesky posts can
// carry up to four; we keep this small.
function getFirstPostImage(embed: unknown) {
  const parsed = ImagesEmbedSchema.safeParse(embed);
  return parsed.success ? parsed.data.images[0] : undefined;
}

// Bluesky's public image CDN. It accepts any blob by DID and CID and
// returns a resized JPEG keyed by variant ("avatar", "feed_thumbnail", …).
// No auth needed for public records.
function getBskyCdnUrl({
  variant,
  did,
  cid,
}: {
  variant: string;
  did: string;
  cid: string;
}) {
  return `https://cdn.bsky.app/img/${variant}/plain/${did}/${cid}@jpeg`;
}

function getProfileAtUri({ did }: { did: string }) {
  return `at://${did}/app.bsky.actor.profile/self`;
}

function getProfileBlueskyUrl({ didOrHandle }: { didOrHandle: string }) {
  return `https://bsky.app/profile/${didOrHandle}`;
}

function getPostBlueskyUrl({ uri }: { uri: string }) {
  const parsed = new AtUri(uri);
  return `https://bsky.app/profile/${parsed.host}/post/${parsed.rkey}`;
}

// `defineAtProtoLiveCollection` registers a server-rendered collection. The
// loader runs on every request the page makes, with its own stale-while-
// revalidate cache in front. Consecutive requests within `cacheTtl` reuse
// the same snapshot, and a background refresh kicks in past the TTL.
//
// If you don't know what this means, don't worry about it.
const sharedReposts = defineAtProtoLiveCollection({
  // `sources: [...]` reads and parses the collection from each repo before
  // grouping. If a record doesn't parse, it is dropped.
  sources: [
    {
      repo: "fujocoded.bsky.social",
      collection: "app.bsky.feed.repost",
      parseRecord: (value: unknown) => RepostSchema.parse(value),
    },
    {
      repo: "fujoweb.dev",
      collection: "app.bsky.feed.repost",
      parseRecord: (value: unknown) => RepostSchema.parse(value),
    },
    {
      repo: "bobaboard.bsky.social",
      collection: "app.bsky.feed.repost",
      parseRecord: (value: unknown) => RepostSchema.parse(value),
    },
  ],
  // groupBy assigns a key to every record. Records that share a key
  // get passed to one `transform` call together, in `sources[]` declaration
  // order. Here the key is the URI of the post being reposted.
  groupBy: ({ value }) => value.subject.uri,
  transform: async ({
    // the string we returned from groupBy
    key,
    // every record from any source that returned this key
    records,
    // record hydrator, with shared cache
    fetchRecord,
  }) => {
    // Only ship posts that everyone in the list reposted. Returning null
    // or undefined drops the entry from the final collection.
    if (records.length < 3) return null;

    // AT-URIs are `at://<repo>/<collection>/<rkey>`, so the host is the
    // DID of whoever wrote the original post.
    const authorDid = new AtUri(key).host;

    // Hydrate the post, the author's profile, and every reposter's
    // profile in parallel. fetchRecord coalesces same-URI requests within
    // one load, so duplicate lookups across groups hit the network once.
    const [post, authorProfile] = await Promise.all([
      fetchRecord({
        atUri: key,
        parse: (value: unknown) => PostSchema.parse(value),
      }),
      fetchRecord({
        atUri: getProfileAtUri({ did: authorDid }),
        parse: (value: unknown) => ProfileSchema.parse(value),
      }),
    ]);
    if (!post) return null;

    // Hydrate each reposter's profile. `record.repo.did` is the resolved
    // DID; `record.repo.handle` is set when the source config gave us a
    // handle (true for all three of ours), so we use it for `@handle`-style
    // display and fall back to the DID otherwise.
    const repostedBy = await Promise.all(
      records.map(async (record) => {
        const profile = await fetchRecord({
          atUri: getProfileAtUri({ did: record.repo.did }),
          parse: (value: unknown) => ProfileSchema.parse(value),
        });
        const avatarCid = profile?.avatar?.cid;
        const displayHandle = record.repo.handle ?? record.repo.did;
        return {
          did: record.repo.did,
          handle: displayHandle,
          displayName: profile?.displayName ?? displayHandle,
          avatarUrl: avatarCid
            ? getBskyCdnUrl({
                variant: "avatar",
                did: record.repo.did,
                cid: avatarCid,
              })
            : "",
          profileUrl: getProfileBlueskyUrl({ didOrHandle: displayHandle }),
        };
      }),
    );

    const firstImage = getFirstPostImage(post.embed);
    const imageCid = firstImage?.image.cid;
    const authorAvatarCid = authorProfile?.avatar?.cid;

    return {
      id: key,
      data: {
        uri: key,
        postUrl: getPostBlueskyUrl({ uri: key }),
        text: post.text,
        imageUrl: imageCid
          ? getBskyCdnUrl({
              variant: "feed_thumbnail",
              did: authorDid,
              cid: imageCid,
            })
          : undefined,
        imageAlt: firstImage?.alt,
        author: {
          did: authorDid,
          displayName: authorProfile?.displayName ?? authorDid,
          avatarUrl: authorAvatarCid
            ? getBskyCdnUrl({
                variant: "avatar",
                did: authorDid,
                cid: authorAvatarCid,
              })
            : "",
          profileUrl: getProfileBlueskyUrl({ didOrHandle: authorDid }),
        },
        repostedBy,
      },
    };
  },
  outputSchema: z.object({
    uri: z.string(),
    postUrl: z.string(),
    text: z.string(),
    imageUrl: z.string().optional(),
    imageAlt: z.string().optional(),
    author: z.object({
      did: z.string(),
      displayName: z.string(),
      avatarUrl: z.string(),
      profileUrl: z.string(),
    }),
    repostedBy: z.array(
      z.object({
        did: z.string(),
        handle: z.string(),
        displayName: z.string(),
        avatarUrl: z.string(),
        profileUrl: z.string(),
      }),
    ),
  }),
});

export const collections = { sharedReposts };
