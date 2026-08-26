import { NextRequest, NextResponse } from "next/server";
import { isValidGameSlug } from "@/lib/parse-game-input";
import { readHeroAssetManifest } from "@/lib/game-asset-storage";
import { gameAssetFileUrl } from "@/lib/site-url";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    ...extra,
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { slug: rawSlug } = await context.params;
  const slug = rawSlug.trim().toLowerCase();
  if (!isValidGameSlug(slug)) {
    return NextResponse.json({ error: "Invalid slug." }, { status: 400 });
  }

  const manifest = await readHeroAssetManifest(slug);
  if (!manifest?.assets.length) {
    return NextResponse.json(
      { error: "No generated hero assets for this spec." },
      {
        status: 404,
        headers: corsHeaders(),
      }
    );
  }

  return NextResponse.json(
    {
      slug,
      assets: manifest.assets.map((asset) => ({
        ...asset,
        url: gameAssetFileUrl(slug, asset.filename),
      })),
    },
    {
      headers: corsHeaders({
        "Cache-Control": "public, max-age=60, s-maxage=60",
      }),
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders({
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }),
  });
}
