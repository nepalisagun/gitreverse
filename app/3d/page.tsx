import type { Metadata } from "next";
import { Object3dReverseHome } from "@/components/object3d-reverse-home";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  title: "3D Reverse — GitReverse",
  description:
    "Reverse engineer a 2D photo into a 3D GLB and a Cursor-ready Three.js viewer prompt.",
  alternates: { canonical: "https://gitreverse.com/3d" },
  openGraph: {
    title: "3D Reverse — GitReverse",
    description:
      "Reverse engineer a 2D photo into a 3D GLB and a Cursor-ready Three.js viewer prompt.",
    url: "https://gitreverse.com/3d",
  },
  twitter: {
    title: "3D Reverse — GitReverse",
    description:
      "Reverse engineer a 2D photo into a 3D GLB and a Cursor-ready Three.js viewer prompt.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "3D Reverse — GitReverse",
  url: "https://gitreverse.com/3d",
  description:
    "Reverse engineer a 2D photo into a 3D GLB and a Cursor-ready Three.js viewer prompt.",
  isPartOf: {
    "@type": "WebSite",
    name: "GitReverse",
    url: "https://gitreverse.com",
  },
};

export default function Object3dPage() {
  return (
    <>
      <JsonLd data={jsonLd} />
      <Object3dReverseHome />
    </>
  );
}
