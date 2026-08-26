import { NextRequest, NextResponse } from "next/server";
import {
  isSafeObject3dAssetFilename,
  readObject3dAssetFile,
} from "@/lib/object3d-asset-storage";
import { isValidObject3dSlug } from "@/lib/parse-object3d-input";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string; file: string }> };

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    ...extra,
  };
}

function contentTypeFor(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { slug: rawSlug, file: rawFile } = await context.params;
  const slug = rawSlug.trim().toLowerCase();
  const filename = rawFile.trim();

  if (!isValidObject3dSlug(slug) || !isSafeObject3dAssetFilename(filename)) {
    return NextResponse.json({ error: "Invalid asset path." }, { status: 400 });
  }

  const bytes = await readObject3dAssetFile(slug, filename);
  if (!bytes) {
    return NextResponse.json(
      { error: "Asset not found. Run 3D reverse first." },
      { status: 404, headers: corsHeaders() }
    );
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: corsHeaders({
      "Content-Type": contentTypeFor(filename),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    }),
  });
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
