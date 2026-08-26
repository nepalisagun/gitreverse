import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase";

export const OBJECT3D_ASSETS_BUCKET = "object3d-assets";

export const OBJECT3D_GLB_FILENAME = "object.glb";

function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/** Local: repo data/. Serverless: /tmp only (ephemeral). Persistent store is Supabase. */
function diskDir(slug: string): string {
  const root = isServerlessRuntime()
    ? path.join("/tmp", "object3d-assets")
    : path.join(process.cwd(), "data", "object3d-assets");
  return path.join(root, slug);
}

export function isSafeObject3dAssetFilename(filename: string): boolean {
  return /^(object\.glb|source\.(jpe?g|png|webp))$/i.test(filename);
}

async function writeDiskAsset(
  slug: string,
  filename: string,
  bytes: Buffer
): Promise<void> {
  const dir = diskDir(slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), bytes);
}

export async function writeObject3dAssetFile(
  slug: string,
  filename: string,
  bytes: Buffer,
  contentType: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { error } = await admin.storage
      .from(OBJECT3D_ASSETS_BUCKET)
      .upload(`${slug}/${filename}`, bytes, {
        contentType,
        upsert: true,
      });
    if (error) {
      throw new Error(
        `Failed to upload ${filename} to storage: ${error.message}`
      );
    }
  } else if (isServerlessRuntime()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to store 3D assets on Vercel."
    );
  }

  // Best-effort local/tmp cache for faster re-reads in this process.
  try {
    await writeDiskAsset(slug, filename, bytes);
  } catch (e) {
    if (!admin) {
      throw e instanceof Error ? e : new Error(String(e));
    }
    console.warn(
      `[object3d-assets] disk cache skipped for ${slug}/${filename}:`,
      e instanceof Error ? e.message : e
    );
  }
}

export async function readObject3dAssetFile(
  slug: string,
  filename: string
): Promise<Buffer | null> {
  try {
    return await readFile(path.join(diskDir(slug), filename));
  } catch {
    // fall through to supabase
  }

  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.storage
    .from(OBJECT3D_ASSETS_BUCKET)
    .download(`${slug}/${filename}`);
  if (error || !data) return null;

  const bytes = Buffer.from(await data.arrayBuffer());
  try {
    await writeDiskAsset(slug, filename, bytes);
  } catch {
    // ignore cache warm failures
  }
  return bytes;
}
