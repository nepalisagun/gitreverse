import { notFound } from "next/navigation";
import { Object3dReversePage } from "@/components/object3d-reverse-page";
import {
  isValidObject3dSlug,
  parseObject3dTitle,
} from "@/lib/parse-object3d-input";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ title?: string }>;
};

export default async function Object3dSlugPage({
  params,
  searchParams,
}: PageProps) {
  const { slug: rawSlug } = await params;
  const slug = rawSlug.trim().toLowerCase();
  const { title: rawTitle } = await searchParams;

  if (!isValidObject3dSlug(slug)) {
    notFound();
  }

  const parsed = parseObject3dTitle(rawTitle);
  const title =
    parsed ??
    slug
      .replace(/^obj-/, "Object ")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  return <Object3dReversePage slug={slug} title={title} />;
}
