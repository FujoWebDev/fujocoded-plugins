export type DnsPromisesModule = typeof import("node:dns/promises");
export type ImportActualDnsPromises = () => Promise<DnsPromisesModule>;

/**
 * `_atproto.<handle>` is the only DNS query `@atproto/identity` makes for
 * handle resolution. Failing just that query (rather than every DNS call)
 * keeps real DNS available for everything else the test process might do.
 */
const ATPROTO_HANDLE_TXT_PREFIX = "_atproto.";

const handleLookupEnodata = () =>
  Object.assign(new Error("ENODATA (atproto handle lookup stub)"), {
    code: "ENODATA",
  });

export type CreateDnsStubOptions = {
  /**
   * Low-level hook deciding whether a given `_atproto.<handle>` TXT query
   * should be failed with `ENODATA` or forwarded to real DNS. Receives just
   * the handle, with the `_atproto.` prefix already stripped. Defaults to
   * intercepting every `_atproto.*` query.
   *
   * Use `createIdentityPassthrough` instead when one test mixes fake accounts
   * with real handles. It pairs the DNS bypass with the matching
   * `.well-known/atproto-did` HTTP passthrough under one predicate, so a handle
   * cannot end up half real and half fake.
   */
  shouldInterceptHandle?: (handle: string) => boolean;
};

/**
 * Returns a partial `node:dns/promises` mock that fails the
 * `_atproto.<handle>` TXT lookup for handles your predicate selects, and
 * passes every other DNS call through to the real module.
 * `@atproto/identity` checks DNS before falling back to the HTTP
 * `.well-known/atproto-did` path, so failing that single query is enough to
 * route handle resolution onto HTTP where MSW can intercept it. Most Vitest
 * suites should use `createDnsMock(importActual)` instead.
 *
 * Default behavior intercepts every `_atproto.*` query. See
 * `CreateDnsStubOptions.shouldInterceptHandle` for narrowing the scope when
 * a test mixes fake accounts with real handles.
 */
export const createDnsStub = (
  actual: DnsPromisesModule,
  { shouldInterceptHandle = () => true }: CreateDnsStubOptions = {},
) => {
  const normalizeHostname = (hostname: string): string =>
    hostname.endsWith(".")
      ? hostname.slice(0, -1).toLowerCase()
      : hostname.toLowerCase();

  const handleToIntercept = (hostname: string): string | null => {
    const normalizedHostname = normalizeHostname(hostname);
    if (!normalizedHostname.startsWith(ATPROTO_HANDLE_TXT_PREFIX)) return null;
    const handle = normalizedHostname.slice(ATPROTO_HANDLE_TXT_PREFIX.length);
    return shouldInterceptHandle(handle) ? handle : null;
  };

  const resolveTxtWith = (
    actualResolveTxt: (...args: unknown[]) => Promise<string[][]>,
  ) => {
    return (hostname: string, ...rest: unknown[]) => {
      if (handleToIntercept(hostname) !== null) {
        return Promise.reject(handleLookupEnodata());
      }
      return actualResolveTxt(hostname, ...rest);
    };
  };

  const resolveTxt = resolveTxtWith(
    actual.resolveTxt as (...args: unknown[]) => Promise<string[][]>,
  ) as DnsPromisesModule["resolveTxt"];

  // Compose instead of extending: `Resolver.resolveTxt` is typed as a property
  // in `@types/node` for `dns/promises`, which makes `class extends` reject the
  // override. Constructing the real Resolver and patching the one method keeps
  // every other surface (`cancel`, `setServers`, `getServers`, ...) intact.
  const StubResolver = function StubResolver(
    options?: ConstructorParameters<typeof actual.Resolver>[0],
  ) {
    const resolver = new actual.Resolver(options);
    const original = resolver.resolveTxt.bind(resolver) as (
      ...args: unknown[]
    ) => Promise<string[][]>;
    resolver.resolveTxt = resolveTxtWith(
      original,
    ) as typeof resolver.resolveTxt;
    return resolver;
  } as unknown as typeof actual.Resolver;

  const actualDefault =
    (actual as { default?: DnsPromisesModule }).default ?? actual;

  return {
    ...actual,
    resolveTxt,
    Resolver: StubResolver,
    default: {
      ...actualDefault,
      resolveTxt,
      Resolver: StubResolver,
    },
  };
};

/**
 * Vitest-friendly DNS factory that intercepts every `_atproto.<handle>` query.
 * Use `createIdentityPassthrough` instead when a test mixes fake accounts with
 * real handles that should hit real DNS and real HTTP.
 *
 * ```ts
 * vi.mock("node:dns/promises", async (importActual) => {
 *   const { createDnsMock } = await import("@fujocoded/msw-atproto");
 *   return createDnsMock(importActual);
 * });
 * ```
 */
export const createDnsMock = async (importActual: ImportActualDnsPromises) =>
  createDnsStub(await importActual());
