import { createHash, randomBytes } from "node:crypto";

const SLUG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LEN = 80;
const MAX_TITLE_LEN = 120;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const OBJECT3D_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LEN);
}

export function parseObject3dTitle(
  raw: string | undefined | null
): string | null {
  if (raw == null) return null;
  const title = raw.trim().replace(/\s+/g, " ");
  if (!title || title.length > MAX_TITLE_LEN) return null;
  return title;
}

export function isValidObject3dSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (!s || s.length > MAX_SLUG_LEN) return false;
  return SLUG_SEGMENT.test(s);
}

export function createObject3dSlug(opts: {
  title?: string | null;
  imageBytes?: Buffer;
}): string {
  const fromTitle = opts.title ? titleToSlug(opts.title) : "";
  if (fromTitle && fromTitle.length >= 2 && SLUG_SEGMENT.test(fromTitle)) {
    return fromTitle;
  }
  if (opts.imageBytes && opts.imageBytes.length > 0) {
    const hash = createHash("sha256")
      .update(opts.imageBytes)
      .digest("hex")
      .slice(0, 12);
    return `obj-${hash}`;
  }
  return `obj-${randomBytes(6).toString("hex")}`;
}

export function normalizeImageMime(mime: string | null | undefined): string | null {
  if (!mime) return null;
  const m = mime.trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  if (!ALLOWED_MIME.has(m)) return null;
  return m === "image/jpg" ? "image/jpeg" : m;
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}
