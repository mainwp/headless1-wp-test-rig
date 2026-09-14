import Link from "next/link";
import { getPosts, getSiteInfo, REVALIDATE_SECONDS } from "@/lib/wp";

export const revalidate = 60;

export default async function Home() {
  const [site, posts] = await Promise.all([getSiteInfo(), getPosts()]);
  const renderedAt = new Date().toISOString();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <header className="mb-12 border-b border-black/10 pb-8 dark:border-white/15">
        <p className="mb-2 text-xs uppercase tracking-widest text-black/40 dark:text-white/40">
          Headless frontend
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {site?.title ?? "WordPress is not reachable"}
        </h1>
        {site?.description ? (
          <p className="mt-2 text-black/60 dark:text-white/60">
            {site.description}
          </p>
        ) : null}
      </header>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-6 text-sm">
          <p className="font-medium">No posts came back.</p>
          <p className="mt-2 text-black/60 dark:text-white/60">
            Either WORDPRESS_API_URL is unset or wrong, WPGraphQL is not
            installed, or the WordPress backend is behind auth. Check{" "}
            <Link className="underline" href="/api/debug">
              /api/debug
            </Link>{" "}
            for the exact error.
          </p>
        </div>
      ) : (
        <ul className="space-y-8">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/posts/${post.slug}`}
                className="text-xl font-medium underline-offset-4 hover:underline"
              >
                {post.title}
              </Link>
              <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                modified {new Date(post.modified).toLocaleString()}
              </p>
              <div
                className="mt-2 text-black/70 dark:text-white/70"
                dangerouslySetInnerHTML={{ __html: post.excerpt }}
              />
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-16 border-t border-black/10 pt-6 text-xs text-black/40 dark:border-white/15 dark:text-white/40">
        <p>
          Page rendered at {renderedAt} · revalidate every {REVALIDATE_SECONDS}s
        </p>
        <p className="mt-1">
          If this timestamp is old, you are looking at a cached build. That gap
          is the thing worth measuring.
        </p>
      </footer>
    </main>
  );
}
