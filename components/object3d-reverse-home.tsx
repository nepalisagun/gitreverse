"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Object3dFlavorText } from "@/components/object3d-flavor-text";
import { PromptMarkdown } from "@/components/prompt-markdown";
import {
  createObject3dSlug,
  parseObject3dTitle,
} from "@/lib/parse-object3d-input";

export function Object3dReverseHome() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusLine, setStatusLine] = useState("Uploading image…");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  function onPickFile(next: File | null) {
    setError(null);
    setPrompt(null);
    setGlbUrl(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
  }

  async function runReverse(image: File, rawTitle: string) {
    setLoading(true);
    setError(null);
    setPrompt(null);
    setGlbUrl(null);
    setStatusLine("Uploading image…");

    const parsedTitle = parseObject3dTitle(rawTitle);

    try {
      const form = new FormData();
      form.set("image", image);
      form.set("stream", "true");
      if (parsedTitle) form.set("title", parsedTitle);

      const res = await fetch("/api/reverse-3d", {
        method: "POST",
        body: form,
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let resultSlug = parsedTitle
        ? createObject3dSlug({ title: parsedTitle })
        : "";
      let gotPrompt = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        for (;;) {
          const idx = buf.indexOf("\n\n");
          if (idx < 0) break;
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);

          const eventLine = block
            .split("\n")
            .find((l) => l.startsWith("event: "));
          const dataLine = block
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(7).trim();
          const json = JSON.parse(dataLine.slice(5).trim()) as {
            message?: string;
            slug?: string;
            title?: string;
            prompt?: string;
            glbUrl?: string;
            fromCache?: boolean;
            error?: string;
          };

          if (event === "status") {
            if (typeof json.message === "string") setStatusLine(json.message);
            if (typeof json.slug === "string") resultSlug = json.slug;
          }
          if (event === "done" && typeof json.prompt === "string") {
            gotPrompt = true;
            setPrompt(json.prompt);
            if (typeof json.glbUrl === "string") setGlbUrl(json.glbUrl);
            if (typeof json.slug === "string") resultSlug = json.slug;
            if (json.fromCache) setStatusLine("Loaded from cache");
            if (resultSlug) {
              const q = json.title
                ? `?title=${encodeURIComponent(json.title)}`
                : "";
              router.replace(`/3d/${encodeURIComponent(resultSlug)}${q}`, {
                scroll: false,
              });
            }
            window.setTimeout(() => {
              resultsRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }, 50);
          }
          if (event === "error" && typeof json.error === "string") {
            throw new Error(json.error);
          }
        }
      }

      if (!gotPrompt) {
        throw new Error("No prompt returned.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!file) {
      setError("Pick a 2D image first (JPG, PNG, or WebP).");
      return;
    }
    void runReverse(file, title);
  }

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF8] text-zinc-900">
      <Navbar />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-12 px-4 py-12 sm:px-6">
        <div className="flex w-full flex-col items-center gap-6">
          <div className="relative flex w-full flex-col items-center text-center">
            <h1 className="text-5xl font-extrabold tracking-tighter sm:text-6xl lg:text-7xl">
              Reverse a photo
              <br />
              into 3D
            </h1>
            <p className="mt-4 max-w-xl text-lg text-zinc-600">
              Upload a 2D image, get a GLB plus a Cursor-ready Three.js viewer
              prompt for just that object.
            </p>
          </div>

          <div className="flex w-full max-w-2xl flex-col gap-3">
            <div className="relative w-full">
              <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
              <form
                onSubmit={onSubmit}
                className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fff4da] p-6"
              >
                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-900" />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="relative z-10 flex w-full flex-col items-center justify-center gap-2 rounded border-[3px] border-dashed border-zinc-900 bg-white px-4 py-8 text-sm text-zinc-600 transition-colors hover:bg-zinc-50"
                    >
                      {previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrl}
                          alt="Selected source"
                          className="max-h-48 w-auto rounded object-contain"
                        />
                      ) : (
                        <>
                          <span className="font-medium text-zinc-900">
                            Drop or choose a 2D image
                          </span>
                          <span>JPG, PNG, or WebP · up to 8MB</span>
                        </>
                      )}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) =>
                        onPickFile(e.target.files?.[0] ?? null)
                      }
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                    <div className="relative min-w-0 flex-1">
                      <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-900" />
                      <input
                        name="title"
                        autoComplete="off"
                        className="relative z-10 w-full rounded border-[3px] border-zinc-900 bg-white px-4 py-3 text-base text-zinc-900 placeholder-zinc-500 focus:outline-none"
                        placeholder="Optional title (e.g. Red sneakers)"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </div>
                    <div className="group relative w-full shrink-0 sm:w-auto">
                      <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-800" />
                      <button
                        type="submit"
                        disabled={loading}
                        aria-busy={loading}
                        className={`relative z-10 flex w-full items-center justify-center gap-2 rounded border-[3px] border-zinc-900 px-6 py-3 font-medium text-white transition-transform group-hover:-translate-x-px group-hover:-translate-y-px disabled:pointer-events-none sm:min-w-[10rem] ${
                          loading ? "bg-[#b5120e]" : "bg-[#d31611]"
                        }`}
                      >
                        {loading ? "Processing…" : "Get Prompt"}
                      </button>
                    </div>
                  </div>
                </div>

                {loading && !prompt && !error ? (
                  <div className="mt-4">
                    {statusLine.toLowerCase().includes("sculpt") ||
                    statusLine.toLowerCase().includes("writing") ? (
                      <Object3dFlavorText />
                    ) : (
                      <p
                        className="min-h-[1.25rem] text-sm text-zinc-600"
                        role="status"
                        aria-live="polite"
                      >
                        {statusLine}…
                      </p>
                    )}
                  </div>
                ) : null}

                {error ? (
                  <p className="mt-3 text-sm text-red-600" role="alert">
                    {error}
                  </p>
                ) : null}
              </form>
            </div>

          </div>
        </div>

        {prompt ? (
          <div
            ref={resultsRef}
            className="relative w-full max-w-2xl scroll-mt-24"
          >
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
            <section className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fafafa] p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-zinc-700">
                  Reverse engineered prompt
                </h2>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {glbUrl ? (
                    <a
                      href={glbUrl}
                      className="text-xs font-medium text-zinc-600 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-900 hover:decoration-zinc-900"
                    >
                      Download GLB
                    </a>
                  ) : null}
                  <div className="group relative">
                    <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded bg-zinc-900" />
                    <button
                      type="button"
                      onClick={() => void copyPrompt()}
                      className="relative z-10 rounded border-[3px] border-zinc-900 bg-[#ffc480] px-3 py-1.5 text-xs font-medium text-zinc-900 transition-transform group-hover:-translate-x-px group-hover:-translate-y-px"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="max-h-[min(70vh,32rem)] overflow-auto rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-800">
                <PromptMarkdown>{prompt}</PromptMarkdown>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
