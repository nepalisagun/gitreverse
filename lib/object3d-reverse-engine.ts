import { callQuickLlm, resolveLlmTarget } from "@/lib/quick-llm";
import {
  generateGlbFromImage,
  getMeshyApiKey,
  imageBytesToDataUrl,
} from "@/lib/meshy-client";
import { appendObject3dGlbInstructions } from "@/lib/object3d-prompt-utils";
import { OBJECT3D_REVERSE_SYSTEM_PROMPT } from "@/lib/object3d-reverse-system-prompt";
import {
  incrementObject3dViews,
  readObject3dReverse,
  writeObject3dReverse,
} from "@/lib/object3d-reverse-storage";
import {
  OBJECT3D_GLB_FILENAME,
  readObject3dAssetFile,
  writeObject3dAssetFile,
} from "@/lib/object3d-asset-storage";
import {
  createObject3dSlug,
  extensionForMime,
  normalizeImageMime,
  parseObject3dTitle,
} from "@/lib/parse-object3d-input";

export type Object3dReverseResult =
  | {
      ok: true;
      slug: string;
      title: string;
      prompt: string;
      glbUrl: string;
      fromCache: boolean;
    }
  | { ok: false; error: string; status: number };

function fallbackPrompt(title: string): string {
  return `Build me a small local Three.js app that shows only this object: ${title}. Load public/models/object.glb with GLTFLoader, center it in the frame, add soft lighting, and give me orbit controls so I can spin and inspect it easily. Keep the page minimal, no game UI, just a clean dark viewer that runs with npm run dev.`;
}

export async function ensureObject3dReversed(opts: {
  slug?: string;
  title?: string | null;
  imageBytes?: Buffer;
  imageMime?: string | null;
  onStatus?: (message: string) => void;
  force?: boolean;
}): Promise<Object3dReverseResult> {
  const onStatus = opts.onStatus;
  const title =
    parseObject3dTitle(opts.title) ??
    (opts.slug ? opts.slug.replace(/^obj-/, "Object ") : null) ??
    "3D object";

  let slug =
    opts.slug?.trim().toLowerCase() ||
    createObject3dSlug({ title, imageBytes: opts.imageBytes });

  if (!opts.force) {
    const cached = await readObject3dReverse(slug);
    if (cached) {
      const prompt = appendObject3dGlbInstructions(
        cached.prompt,
        slug,
        cached.glbFilename
      );
      if (prompt !== cached.prompt) {
        void writeObject3dReverse({
          slug,
          title: cached.title,
          prompt,
          glbFilename: cached.glbFilename,
          sourceFilename: cached.sourceFilename,
          metadata: cached.metadata,
        }).catch((e) => {
          console.warn(
            `[reverse-3d] failed to heal glb link for ${slug}:`,
            e instanceof Error ? e.message : e
          );
        });
      }
      void incrementObject3dViews(slug).catch((e) => {
        console.warn(
          `[reverse-3d] views increment failed for ${slug}:`,
          e instanceof Error ? e.message : e
        );
      });
      return {
        ok: true,
        slug,
        title: cached.title,
        prompt,
        glbUrl: `/api/3d-assets/${encodeURIComponent(slug)}/${encodeURIComponent(cached.glbFilename)}`,
        fromCache: true,
      };
    }
  }

  const apiKey = getMeshyApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error: "MESHY_API_KEY is not configured.",
      status: 500,
    };
  }

  let imageBytes = opts.imageBytes;
  let imageMime = normalizeImageMime(opts.imageMime);

  if (!imageBytes) {
    // Re-run from stored source image when force=true or cache miss with slug only.
    const candidates = ["source.jpg", "source.jpeg", "source.png", "source.webp"];
    for (const name of candidates) {
      const bytes = await readObject3dAssetFile(slug, name);
      if (bytes) {
        imageBytes = bytes;
        imageMime =
          name.endsWith(".png")
            ? "image/png"
            : name.endsWith(".webp")
              ? "image/webp"
              : "image/jpeg";
        break;
      }
    }
  }

  if (!imageBytes || !imageMime) {
    return {
      ok: false,
      error: "An image is required for the first 3D reverse.",
      status: 400,
    };
  }

  const sourceFilename = `source.${extensionForMime(imageMime)}`;
  onStatus?.("Saving source image");
  try {
    await writeObject3dAssetFile(slug, sourceFilename, imageBytes, imageMime);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed to save image: ${msg}`, status: 500 };
  }

  const meshyBudgetMs = process.env.VERCEL ? 240_000 : 12 * 60_000;
  const sculpt = await generateGlbFromImage({
    apiKey,
    imageUrl: imageBytesToDataUrl(imageBytes, imageMime),
    deadlineAt: Date.now() + meshyBudgetMs,
    onStatus,
  });
  if (!sculpt.ok) {
    return { ok: false, error: sculpt.error, status: 502 };
  }

  onStatus?.("Saving GLB");
  try {
    await writeObject3dAssetFile(
      slug,
      OBJECT3D_GLB_FILENAME,
      sculpt.glb,
      "model/gltf-binary"
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed to save GLB: ${msg}`, status: 500 };
  }

  onStatus?.("Writing reverse prompt");
  const llm = resolveLlmTarget();
  let promptBody: string;
  if ("error" in llm) {
    promptBody = fallbackPrompt(title);
  } else {
    const promptResult = await callQuickLlm(
      llm,
      OBJECT3D_REVERSE_SYSTEM_PROMPT,
      `Title: ${title}\nSubject: a single object reverse engineered from a photo into a GLB for local Three.js viewing.`,
      1024
    );
    promptBody = promptResult.ok ? promptResult.text : fallbackPrompt(title);
  }

  const finalPrompt = appendObject3dGlbInstructions(
    promptBody,
    slug,
    OBJECT3D_GLB_FILENAME
  );

  try {
    await writeObject3dReverse({
      slug,
      title,
      prompt: finalPrompt,
      glbFilename: OBJECT3D_GLB_FILENAME,
      sourceFilename,
      metadata: { meshyTaskId: sculpt.taskId },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Failed to save cache: ${msg}`,
      status: 500,
    };
  }

  void incrementObject3dViews(slug).catch((e) => {
    console.warn(
      `[reverse-3d] views increment failed for ${slug}:`,
      e instanceof Error ? e.message : e
    );
  });

  return {
    ok: true,
    slug,
    title,
    prompt: finalPrompt,
    glbUrl: `/api/3d-assets/${encodeURIComponent(slug)}/${encodeURIComponent(OBJECT3D_GLB_FILENAME)}`,
    fromCache: false,
  };
}
