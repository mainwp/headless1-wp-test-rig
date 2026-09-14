import { NextResponse } from "next/server";
import { fetchLog, getSiteInfo, REVALIDATE_SECONDS } from "@/lib/wp";

/**
 * Tells you, in one request, whether the frontend can actually see WordPress
 * and what the last failure was. When the MainWP backend sits behind basic
 * auth, Cloudflare Access or an IP allowlist, the error shows up here rather
 * than as a blank page.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const site = await getSiteInfo();

  return NextResponse.json(
    {
      now: new Date().toISOString(),
      wordpressApiUrl: process.env.WORDPRESS_API_URL ?? null,
      publicFrontendUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
      revalidateSeconds: REVALIDATE_SECONDS,
      revalidateSecretConfigured: Boolean(process.env.REVALIDATE_SECRET),
      liveProbe: {
        reachable: site !== null,
        tookMs: Date.now() - startedAt,
        siteTitle: site?.title ?? null,
        // If WordPress still reports its own URL as the public home, the
        // decoupling is not finished - the mu-plugin is not active, or
        // home_url() was never repointed.
        wordpressReportsHomeAs: site?.url ?? null,
      },
      lastFetch: fetchLog,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
