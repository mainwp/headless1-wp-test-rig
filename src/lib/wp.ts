/**
 * Minimal WPGraphQL client.
 *
 * Everything the frontend knows about WordPress goes through this file.
 * No Faust, no Apollo, no codegen - so when something looks wrong you can
 * see exactly which HTTP request produced it.
 */

const endpoint = process.env.WORDPRESS_API_URL;

/** How long a cached page stays fresh before Next re-fetches it, in seconds. */
export const REVALIDATE_SECONDS = Number(
  process.env.NEXT_PUBLIC_REVALIDATE_SECONDS ?? 60
);

export type WPPostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  modified: string;
};

export type WPPost = WPPostSummary & {
  content: string;
};

export type WPSiteInfo = {
  title: string;
  description: string;
  url: string;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

/**
 * Tracks the last successful and last failed fetch so /api/debug can show
 * whether the frontend is actually talking to WordPress. This is in-memory
 * and per-instance - fine for a test rig, meaningless in production.
 */
export const fetchLog = {
  lastSuccessAt: null as string | null,
  lastErrorAt: null as string | null,
  lastError: null as string | null,
};

async function wpQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
  tags: string[] = ["wordpress"]
): Promise<T | null> {
  if (!endpoint) {
    fetchLog.lastErrorAt = new Date().toISOString();
    fetchLog.lastError = "WORDPRESS_API_URL is not set";
    return null;
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      // ISR: cache the response, refresh it at most every REVALIDATE_SECONDS,
      // and allow /api/revalidate to bust it on demand via the tag.
      next: { revalidate: REVALIDATE_SECONDS, tags },
    });

    if (!res.ok) {
      throw new Error(`WPGraphQL responded ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as GraphQLResponse<T>;

    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join("; "));
    }

    fetchLog.lastSuccessAt = new Date().toISOString();
    fetchLog.lastError = null;
    return json.data ?? null;
  } catch (err) {
    // Never throw. A test rig that hard-crashes when WordPress is behind
    // basic auth or an IP allowlist tells you less than one that renders
    // an empty page and logs why.
    fetchLog.lastErrorAt = new Date().toISOString();
    fetchLog.lastError = err instanceof Error ? err.message : String(err);
    console.error("[wp] query failed:", fetchLog.lastError);
    return null;
  }
}

export async function getSiteInfo(): Promise<WPSiteInfo | null> {
  const data = await wpQuery<{ generalSettings: WPSiteInfo }>(`
    query SiteInfo {
      generalSettings {
        title
        description
        url
      }
    }
  `);
  return data?.generalSettings ?? null;
}

export async function getPosts(first = 20): Promise<WPPostSummary[]> {
  const data = await wpQuery<{ posts: { nodes: WPPostSummary[] } }>(
    `
    query Posts($first: Int!) {
      posts(first: $first, where: { status: PUBLISH }) {
        nodes {
          id
          slug
          title
          excerpt
          date
          modified
        }
      }
    }
  `,
    { first },
    ["wordpress", "posts"]
  );
  return data?.posts?.nodes ?? [];
}

export async function getPostBySlug(slug: string): Promise<WPPost | null> {
  const data = await wpQuery<{ post: WPPost | null }>(
    `
    query PostBySlug($slug: ID!) {
      post(id: $slug, idType: SLUG) {
        id
        slug
        title
        excerpt
        content
        date
        modified
      }
    }
  `,
    { slug },
    ["wordpress", "posts", `post:${slug}`]
  );
  return data?.post ?? null;
}
