import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostBySlug, getPosts, REVALIDATE_SECONDS } from "@/lib/wp";

export const revalidate = 60;

// Pre-render the posts that exist at build time; anything else is rendered
// on first request and then cached (that's `dynamicParams`, on by default).
export async function generateStaticParams() {
  const posts = await getPosts(50);
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function PostPage({
  params,
}: PageProps<"/posts/[slug]">) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/"
        className="text-sm text-black/50 underline-offset-4 hover:underline dark:text-white/50"
      >
        ← All posts
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">
        {post.title}
      </h1>
      <p className="mt-2 text-xs text-black/40 dark:text-white/40">
        published {new Date(post.date).toLocaleString()} · modified{" "}
        {new Date(post.modified).toLocaleString()}
      </p>

      <article
        className="prose mt-8 max-w-none dark:prose-invert [&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:my-4"
        dangerouslySetInnerHTML={{ __html: post.content }}
      />

      <footer className="mt-16 border-t border-black/10 pt-6 text-xs text-black/40 dark:border-white/15 dark:text-white/40">
        Page rendered at {new Date().toISOString()} · revalidate every{" "}
        {REVALIDATE_SECONDS}s
      </footer>
    </main>
  );
}
