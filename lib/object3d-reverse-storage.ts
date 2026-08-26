import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSupabase } from "@/lib/supabase";

export type Object3dReverseMeta = {
  title: string;
  prompt: string;
  updatedAt: string;
  glbFilename: string;
  sourceFilename: string | null;
  metadata: Record<string, unknown> | null;
};

function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function diskMetaPath(slug: string): string {
  const root = isServerlessRuntime()
    ? path.join("/tmp", "object3d-assets")
    : path.join(process.cwd(), "data", "object3d-assets");
  return path.join(root, slug, "meta.json");
}

async function readDiskMeta(slug: string): Promise<Object3dReverseMeta | null> {
  try {
    const raw = await readFile(diskMetaPath(slug), "utf8");
    const parsed = JSON.parse(raw) as {
      title?: string;
      prompt?: string;
      updatedAt?: string;
      glbFilename?: string;
      sourceFilename?: string | null;
      metadata?: Record<string, unknown> | null;
    };
    if (!parsed.title || !parsed.prompt || !parsed.glbFilename) return null;
    return {
      title: parsed.title,
      prompt: parsed.prompt,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      glbFilename: parsed.glbFilename,
      sourceFilename: parsed.sourceFilename ?? null,
      metadata: parsed.metadata ?? null,
    };
  } catch {
    return null;
  }
}

async function writeDiskMeta(
  slug: string,
  meta: Object3dReverseMeta
): Promise<void> {
  const file = diskMetaPath(slug);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(meta, null, 2), "utf8");
}

export async function readObject3dReverse(
  slug: string
): Promise<Object3dReverseMeta | null> {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("object3d_reverse_cache")
      .select(
        "title, prompt, glb_filename, source_filename, cached_at, metadata"
      )
      .eq("slug", slug)
      .maybeSingle();

    if (!error && data?.prompt && data?.title && data?.glb_filename) {
      return {
        title: data.title as string,
        prompt: data.prompt as string,
        updatedAt: data.cached_at as string,
        glbFilename: data.glb_filename as string,
        sourceFilename: (data.source_filename as string | null) ?? null,
        metadata: (data.metadata as Record<string, unknown> | null) ?? null,
      };
    }
  }

  return readDiskMeta(slug);
}

export async function writeObject3dReverse(opts: {
  slug: string;
  title: string;
  prompt: string;
  glbFilename: string;
  sourceFilename?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const meta: Object3dReverseMeta = {
    title: opts.title,
    prompt: opts.prompt,
    updatedAt: new Date().toISOString(),
    glbFilename: opts.glbFilename,
    sourceFilename: opts.sourceFilename ?? null,
    metadata: opts.metadata ?? null,
  };

  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from("object3d_reverse_cache").upsert(
      {
        slug: opts.slug,
        title: opts.title,
        prompt: opts.prompt,
        glb_filename: opts.glbFilename,
        source_filename: opts.sourceFilename ?? null,
        metadata: opts.metadata ?? null,
        cached_at: meta.updatedAt,
      },
      { onConflict: "slug" }
    );

    if (error) {
      throw new Error(`Failed to save 3D reverse cache: ${error.message}`);
    }
  } else if (isServerlessRuntime()) {
    throw new Error(
      "Supabase is required to cache 3D reverses on Vercel. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY."
    );
  }

  try {
    await writeDiskMeta(opts.slug, meta);
  } catch (e) {
    if (!supabase) {
      throw e instanceof Error ? e : new Error(String(e));
    }
    console.warn(
      `[object3d] disk meta skipped for ${opts.slug}:`,
      e instanceof Error ? e.message : e
    );
  }
}

/** Bump usage counter for a cached 3D reverse (cache hits). */
export async function incrementObject3dViews(slug: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.rpc("increment_object3d_views", {
    p_slug: slug,
  });
  if (error) {
    // Fallback if RPC is missing: best-effort read-modify-write.
    const { data } = await supabase
      .from("object3d_reverse_cache")
      .select("views")
      .eq("slug", slug)
      .maybeSingle();
    const next = ((data?.views as number | null) ?? 0) + 1;
    const { error: updateError } = await supabase
      .from("object3d_reverse_cache")
      .update({ views: next })
      .eq("slug", slug);
    if (updateError) {
      console.warn(`[object3d] views increment skipped: ${updateError.message}`);
    }
  }
}
