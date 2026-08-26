import { object3dAssetFileUrl } from "@/lib/site-url";

const GLB_BLOCK_RE =
  /\n*Download this GLB into public\/models\/object\.glb[\s\S]*$/i;

export function stripObject3dGlbInstructions(prompt: string): string {
  return prompt.replace(GLB_BLOCK_RE, "").trimEnd();
}

export function appendObject3dGlbInstructions(
  prompt: string,
  slug: string,
  filename = "object.glb"
): string {
  const stripped = stripObject3dGlbInstructions(prompt);
  const url = object3dAssetFileUrl(slug, filename);
  const block = `Download this GLB into public/models/object.glb and load it with Three.js GLTFLoader. Do not replace it with a box or placeholder mesh.\n${url}`;
  if (stripped.includes(url)) return stripped;
  return `${stripped}\n\n${block}`;
}
