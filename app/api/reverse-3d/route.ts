import { NextRequest, NextResponse } from "next/server";
import { ensureObject3dReversed } from "@/lib/object3d-reverse-engine";
import { readObject3dReverse } from "@/lib/object3d-reverse-storage";
import {
  OBJECT3D_MAX_IMAGE_BYTES,
  createObject3dSlug,
  isValidObject3dSlug,
  normalizeImageMime,
  parseObject3dTitle,
} from "@/lib/parse-object3d-input";

export const runtime = "nodejs";
export const maxDuration = 300;

const ROUTE_TIMEOUT_MS = process.env.VERCEL ? 280_000 : 15 * 60_000;

function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function parseBody(request: NextRequest): Promise<
  | {
      ok: true;
      slug?: string;
      title?: string | null;
      imageBytes?: Buffer;
      imageMime?: string | null;
      stream: boolean;
      force: boolean;
    }
  | { ok: false; error: string; status: number }
> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("image");
    const title = parseObject3dTitle(String(form.get("title") ?? ""));
    const slugRaw = String(form.get("slug") ?? "").trim().toLowerCase();
    const stream = String(form.get("stream") ?? "") === "true";
    const force = String(form.get("force") ?? "") === "true";

    let imageBytes: Buffer | undefined;
    let imageMime: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > OBJECT3D_MAX_IMAGE_BYTES) {
        return {
          ok: false,
          error: "Image must be 8MB or smaller.",
          status: 400,
        };
      }
      imageMime = normalizeImageMime(file.type);
      if (!imageMime) {
        return {
          ok: false,
          error: "Use a JPG, PNG, or WebP image.",
          status: 400,
        };
      }
      imageBytes = Buffer.from(await file.arrayBuffer());
    }

    return {
      ok: true,
      slug: slugRaw || undefined,
      title,
      imageBytes,
      imageMime,
      stream,
      force,
    };
  }

  let body: {
    slug?: string;
    title?: string;
    imageBase64?: string;
    imageMime?: string;
    stream?: boolean;
    force?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }

  let imageBytes: Buffer | undefined;
  let imageMime = normalizeImageMime(body.imageMime);
  if (body.imageBase64?.trim()) {
    const raw = body.imageBase64.trim().replace(/^data:[^;]+;base64,/, "");
    try {
      imageBytes = Buffer.from(raw, "base64");
    } catch {
      return { ok: false, error: "Invalid imageBase64.", status: 400 };
    }
    if (imageBytes.length > OBJECT3D_MAX_IMAGE_BYTES) {
      return {
        ok: false,
        error: "Image must be 8MB or smaller.",
        status: 400,
      };
    }
    if (!imageMime) imageMime = "image/png";
  }

  return {
    ok: true,
    slug: body.slug?.trim().toLowerCase(),
    title: parseObject3dTitle(body.title),
    imageBytes,
    imageMime,
    stream: body.stream === true,
    force: body.force === true,
  };
}

async function execute(opts: {
  slug?: string;
  title?: string | null;
  imageBytes?: Buffer;
  imageMime?: string | null;
  stream: boolean;
  force: boolean;
}): Promise<NextResponse> {
  const title = opts.title;
  const slug =
    opts.slug && isValidObject3dSlug(opts.slug)
      ? opts.slug
      : createObject3dSlug({ title, imageBytes: opts.imageBytes });

  if (!isValidObject3dSlug(slug)) {
    return NextResponse.json({ error: "Invalid slug." }, { status: 400 });
  }

  if (!opts.imageBytes && !opts.force) {
    const cached = await readObject3dReverse(slug);
    if (!cached && !opts.imageBytes) {
      return NextResponse.json(
        { error: "Upload an image, or provide a cached slug." },
        { status: 400 }
      );
    }
  }

  if (!opts.stream) {
    const result = await ensureObject3dReversed({
      slug,
      title,
      imageBytes: opts.imageBytes,
      imageMime: opts.imageMime,
      force: opts.force,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }
    return NextResponse.json({
      slug: result.slug,
      title: result.title,
      prompt: result.prompt,
      glbUrl: result.glbUrl,
      fromCache: result.fromCache,
    });
  }

  const encoder = new TextEncoder();
  const streamBody = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(encodeSse(event, data)));
      };

      try {
        send("status", { message: "Starting 3D reverse", slug });
        const result = await ensureObject3dReversed({
          slug,
          title,
          imageBytes: opts.imageBytes,
          imageMime: opts.imageMime,
          force: opts.force,
          onStatus: (message) => send("status", { message, slug }),
        });

        if (!result.ok) {
          send("error", { error: result.error });
          controller.close();
          return;
        }

        send("done", {
          slug: result.slug,
          title: result.title,
          prompt: result.prompt,
          glbUrl: result.glbUrl,
          fromCache: result.fromCache,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        send("error", { error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(streamBody, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("__timeout__")), ROUTE_TIMEOUT_MS)
  );

  try {
    return await Promise.race([
      execute({
        slug: parsed.slug,
        title: parsed.title,
        imageBytes: parsed.imageBytes,
        imageMime: parsed.imageMime,
        stream: parsed.stream,
        force: parsed.force,
      }),
      timer,
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "__timeout__") {
      return NextResponse.json(
        { error: "3D reverse timed out. Try again." },
        { status: 504 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
