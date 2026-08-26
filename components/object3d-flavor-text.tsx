"use client";

import { useEffect, useState } from "react";

const ELLIPSIS_MS = 450;
const FLAVOR_MS = 2400;

const FLAVOR_LINES = [
  "reading the silhouette",
  "guessing depth from the photo",
  "sculpting the mesh",
  "painting textures",
  "cleaning up topology",
  "framing the Three.js camera",
  "wiring orbit controls",
  "writing the reverse prompt",
  "almost done with the 3D object",
] as const;

const ELLIPSIS_FRAMES = ["", ".", "..", "..."] as const;

export function Object3dFlavorText() {
  const [flavorIndex, setFlavorIndex] = useState(0);
  const [ellipsisIndex, setEllipsisIndex] = useState(0);

  useEffect(() => {
    const ellipsisId = window.setInterval(() => {
      setEllipsisIndex((i) => (i + 1) % ELLIPSIS_FRAMES.length);
    }, ELLIPSIS_MS);

    const flavorId = window.setInterval(() => {
      setFlavorIndex((i) => (i + 1) % FLAVOR_LINES.length);
    }, FLAVOR_MS);

    return () => {
      window.clearInterval(ellipsisId);
      window.clearInterval(flavorId);
    };
  }, []);

  const line = FLAVOR_LINES[flavorIndex] ?? FLAVOR_LINES[0];
  const dots = ELLIPSIS_FRAMES[ellipsisIndex] ?? "";

  return (
    <p
      className="min-h-[1.25rem] text-sm text-zinc-600"
      role="status"
      aria-live="polite"
    >
      {line}
      <span className="inline-block min-w-[1.25em] font-mono tabular-nums text-zinc-500">
        {dots}
      </span>
    </p>
  );
}
