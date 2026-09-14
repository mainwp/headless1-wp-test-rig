import { revalidateTag, revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

/**
 * On-demand cache invalidation.
 *
 * This is the piece most headless tutorials leave out, and it is the piece
 * that matters for site-management tooling: without it, a content change
 * pushed through WordPress is invisible to visitors until the ISR window
 * expires. With it, WordPress (or anything else) can force a refresh.
 *
 *   curl -X POST "https://front.example.com/api/revalidate?secret=..." \
 *        -H "Content-Type: application/json" \
 *        -d '{"slug":"hello-world"}'
 *
 * Omit the slug to flush everything.
 */

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const secret =
    req.nextUrl.searchParams.get("secret") ??
    req.headers.get("x-revalidate-secret");

  const expected = process.env.REVALIDATE_SECRET;

  if (!expected) {
    return NextResponse.json(
      { revalidated: false, error: "REVALIDATE_SECRET is not configured" },
      { status: 500 }
    );
  }

  if (secret !== expected) {
    return NextResponse.json(
      { revalidated: false, error: "Invalid secret" },
      { status: 401 }
    );
  }

  let slug: string | undefined;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      slug = typeof body?.slug === "string" ? body.slug : undefined;
    } catch {
      // No body, or not JSON. Fall through to a full flush.
    }
  }
  slug ??= req.nextUrl.searchParams.get("slug") ?? undefined;

  // Next 16 requires a cacheLife profile as the second argument.
  // "max" = expire now, serve stale while the refetch happens.
  if (slug) {
    revalidateTag(`post:${slug}`, "max");
    revalidatePath(`/posts/${slug}`);
  }

  // The listing always changes when any post does.
  revalidateTag("posts", "max");
  revalidateTag("wordpress", "max");
  revalidatePath("/");

  return NextResponse.json({
    revalidated: true,
    scope: slug ? `post:${slug} + listing` : "everything",
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
