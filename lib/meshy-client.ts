const MESHY_BASE = "https://api.meshy.ai/openapi";

export function getMeshyApiKey(): string | null {
  const key = process.env.MESHY_API_KEY?.trim();
  return key || null;
}

type MeshyCreateResponse = { result?: string };
type MeshyTask = {
  id?: string;
  status?: string;
  progress?: number;
  task_error?: { message?: string } | string | null;
  model_urls?: { glb?: string };
  result?: {
    rigged_character_glb_url?: string;
    basic_animations?: {
      walking_glb_url?: string;
    };
  };
};

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function taskErrorMessage(task: MeshyTask): string {
  const err = task.task_error;
  if (!err) return "";
  if (typeof err === "string") return err;
  return err.message ?? "";
}

async function meshyJson<T>(
  url: string,
  init: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const res = await fetch(url, init);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : `Meshy HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status };
  }
  return { ok: true, data: data as T };
}

function remainingMs(deadlineAt?: number, fallback = 180_000): number {
  if (!deadlineAt) return fallback;
  return Math.max(0, deadlineAt - Date.now());
}

async function pollTask(opts: {
  url: string;
  apiKey: string;
  timeoutMs: number;
  onProgress?: (progress: number, status: string) => void;
}): Promise<{ ok: true; task: MeshyTask } | { ok: false; error: string }> {
  if (opts.timeoutMs <= 0) {
    return { ok: false, error: "Meshy task timed out" };
  }
  const started = Date.now();
  while (Date.now() - started < opts.timeoutMs) {
    const got = await meshyJson<MeshyTask>(opts.url, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
    });
    if (!got.ok) return got;
    const status = got.data.status ?? "UNKNOWN";
    opts.onProgress?.(got.data.progress ?? 0, status);
    if (status === "SUCCEEDED") return { ok: true, task: got.data };
    if (status === "FAILED" || status === "CANCELED") {
      return {
        ok: false,
        error: taskErrorMessage(got.data) || `Meshy task ${status.toLowerCase()}`,
      };
    }
    await new Promise((r) => setTimeout(r, 8000));
  }
  return { ok: false, error: "Meshy task timed out" };
}

export async function downloadBinary(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download Meshy asset (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function generateTexturedGlb(opts: {
  apiKey: string;
  prompt: string;
  poseMode?: "a-pose" | "t-pose" | "";
  timeoutMs?: number;
  deadlineAt?: number;
  onStatus?: (message: string) => void;
}): Promise<
  | { ok: true; glb: Buffer; refineTaskId: string | null }
  | { ok: false; error: string }
> {
  opts.onStatus?.("Sculpting hero mesh");
  const preview = await meshyJson<MeshyCreateResponse>(
    `${MESHY_BASE}/v2/text-to-3d`,
    {
      method: "POST",
      headers: authHeaders(opts.apiKey),
      body: JSON.stringify({
        mode: "preview",
        prompt: opts.prompt,
        pose_mode: opts.poseMode ?? "",
        should_remesh: true,
        target_polycount: 30000,
        target_formats: ["glb"],
        ai_model: "latest",
      }),
    }
  );
  if (!preview.ok || !preview.data.result) {
    return { ok: false, error: preview.ok ? "Meshy preview missing id" : preview.error };
  }

  const previewDone = await pollTask({
    url: `${MESHY_BASE}/v2/text-to-3d/${preview.data.result}`,
    apiKey: opts.apiKey,
    timeoutMs: remainingMs(opts.deadlineAt, opts.timeoutMs ?? 180_000),
    onProgress: (p, s) => opts.onStatus?.(`Sculpting hero mesh (${p}% ${s})`),
  });
  if (!previewDone.ok) return previewDone;

  const previewGlbUrl = previewDone.task.model_urls?.glb;

  opts.onStatus?.("Painting hero textures");
  const refine = await meshyJson<MeshyCreateResponse>(
    `${MESHY_BASE}/v2/text-to-3d`,
    {
      method: "POST",
      headers: authHeaders(opts.apiKey),
      body: JSON.stringify({
        mode: "refine",
        preview_task_id: preview.data.result,
        enable_pbr: true,
        texture_resolution: "2k",
        target_formats: ["glb"],
        ai_model: "latest",
      }),
    }
  );
  if (!refine.ok || !refine.data.result) {
    if (previewGlbUrl) {
      return {
        ok: true,
        glb: await downloadBinary(previewGlbUrl),
        refineTaskId: null,
      };
    }
    return { ok: false, error: refine.ok ? "Meshy refine missing id" : refine.error };
  }

  const refineDone = await pollTask({
    url: `${MESHY_BASE}/v2/text-to-3d/${refine.data.result}`,
    apiKey: opts.apiKey,
    timeoutMs: remainingMs(opts.deadlineAt, opts.timeoutMs ?? 180_000),
    onProgress: (p, s) => opts.onStatus?.(`Painting hero textures (${p}% ${s})`),
  });
  if (!refineDone.ok) {
    if (previewGlbUrl) {
      return {
        ok: true,
        glb: await downloadBinary(previewGlbUrl),
        refineTaskId: null,
      };
    }
    return refineDone;
  }

  const glbUrl = refineDone.task.model_urls?.glb ?? previewGlbUrl;
  if (!glbUrl) return { ok: false, error: "Meshy refine produced no GLB" };

  return {
    ok: true,
    glb: await downloadBinary(glbUrl),
    refineTaskId: refine.data.result,
  };
}

export async function rigHumanoidWalk(opts: {
  apiKey: string;
  refineTaskId: string;
  timeoutMs?: number;
  deadlineAt?: number;
  onStatus?: (message: string) => void;
}): Promise<{ ok: true; glb: Buffer } | { ok: false; error: string }> {
  opts.onStatus?.("Rigging walk cycle");
  const created = await meshyJson<MeshyCreateResponse>(`${MESHY_BASE}/v1/rigging`, {
    method: "POST",
    headers: authHeaders(opts.apiKey),
    body: JSON.stringify({
      input_task_id: opts.refineTaskId,
      height_meters: 1.78,
    }),
  });
  if (!created.ok || !created.data.result) {
    return { ok: false, error: created.ok ? "Meshy rig missing id" : created.error };
  }

  const done = await pollTask({
    url: `${MESHY_BASE}/v1/rigging/${created.data.result}`,
    apiKey: opts.apiKey,
    timeoutMs: remainingMs(opts.deadlineAt, opts.timeoutMs ?? 180_000),
    onProgress: (p, s) => opts.onStatus?.(`Rigging walk cycle (${p}% ${s})`),
  });
  if (!done.ok) return done;

  const walkUrl = done.task.result?.basic_animations?.walking_glb_url;
  const riggedUrl = done.task.result?.rigged_character_glb_url;
  const url = walkUrl || riggedUrl;
  if (!url) return { ok: false, error: "Meshy rig produced no GLB" };

  return { ok: true, glb: await downloadBinary(url) };
}

/** Build a data-URL Meshy accepts for image_url (jpg/png/webp). */
export function imageBytesToDataUrl(
  bytes: Buffer,
  mimeType: string
): string {
  const mime = mimeType.toLowerCase();
  const safe =
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    mime === "image/png" ||
    mime === "image/webp"
      ? mime === "image/jpg"
        ? "image/jpeg"
        : mime
      : "image/png";
  return `data:${safe};base64,${bytes.toString("base64")}`;
}

/**
 * Image → textured GLB via Meshy Image-to-3D.
 * `imageUrl` may be a public https URL or a data:image/...;base64,... URL.
 */
export async function generateGlbFromImage(opts: {
  apiKey: string;
  imageUrl: string;
  timeoutMs?: number;
  deadlineAt?: number;
  onStatus?: (message: string) => void;
}): Promise<{ ok: true; glb: Buffer; taskId: string } | { ok: false; error: string }> {
  opts.onStatus?.("Sculpting 3D from image");
  const created = await meshyJson<MeshyCreateResponse>(
    `${MESHY_BASE}/v1/image-to-3d`,
    {
      method: "POST",
      headers: authHeaders(opts.apiKey),
      body: JSON.stringify({
        image_url: opts.imageUrl,
        should_texture: true,
        enable_pbr: true,
        should_remesh: true,
        target_polycount: 30000,
        target_formats: ["glb"],
        ai_model: "latest",
      }),
    }
  );
  if (!created.ok || !created.data.result) {
    return {
      ok: false,
      error: created.ok ? "Meshy image-to-3d missing id" : created.error,
    };
  }

  const done = await pollTask({
    url: `${MESHY_BASE}/v1/image-to-3d/${created.data.result}`,
    apiKey: opts.apiKey,
    timeoutMs: remainingMs(opts.deadlineAt, opts.timeoutMs ?? 240_000),
    onProgress: (p, s) =>
      opts.onStatus?.(`Sculpting 3D from image (${p}% ${s})`),
  });
  if (!done.ok) return done;

  const glbUrl = done.task.model_urls?.glb;
  if (!glbUrl) return { ok: false, error: "Meshy produced no GLB" };

  return {
    ok: true,
    glb: await downloadBinary(glbUrl),
    taskId: created.data.result,
  };
}
