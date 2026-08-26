"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Object3dFlavorText } from "@/components/object3d-flavor-text";
import { PromptMarkdown } from "@/components/prompt-markdown";

type Object3dReversePageProps = {
  slug: string;
  title: string;
};

export function Object3dReversePage({
  slug,
  title,
}: Object3dReversePageProps) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusLine, setStatusLine] = useState("Checking if it's cached…");
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPrompt(null);
    setGlbUrl(null);
    setStatusLine("Checking if it's cached…");

    try {
      const res = await fetch("/api/reverse-3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          title,
          stream: true,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = (await res.json()) as {
          prompt?: string;
          glbUrl?: string;
          fromCache?: boolean;
          error?: string;
        };
        if (!res.ok || data.error) {
          throw new Error(data.error ?? `Request failed (${res.status})`);
        }
        if (data.prompt) {
          setPrompt(data.prompt);
          if (data.glbUrl) setGlbUrl(data.glbUrl);
          if (data.fromCache) setStatusLine("Loaded from cache");
        } else {
          throw new Error("No prompt returned.");
        }
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error(`Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

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
            prompt?: string;
            glbUrl?: string;
            fromCache?: boolean;
            error?: string;
          };

          if (event === "status" && typeof json.message === "string") {
            setStatusLine(json.message);
          }
          if (event === "done" && typeof json.prompt === "string") {
            setPrompt(json.prompt);
            if (typeof json.glbUrl === "string") setGlbUrl(json.glbUrl);
            if (json.fromCache) setStatusLine("Loaded from cache");
          }
          if (event === "error" && typeof json.error === "string") {
            throw new Error(json.error);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [slug, title]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  useEffect(() => {
    if (prompt && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [prompt]);

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
        <h1 className="sr-only">{`${title} — reverse-engineered 3D prompt`}</h1>

        <div className="flex w-full max-w-2xl flex-col gap-3">
          <div className="relative w-full">
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
            <div className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fff4da] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-600">3D reverse</p>
                  <p className="text-lg font-semibold text-zinc-900">{title}</p>
                </div>
                <Link
                  href="/3d"
                  className="text-sm font-medium text-zinc-700 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-900"
                >
                  New image
                </Link>
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
                <div
                  className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
                  role="alert"
                >
                  {error}{" "}
                  <Link href="/3d" className="font-medium underline">
                    Upload again
                  </Link>
                </div>
              ) : null}
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
