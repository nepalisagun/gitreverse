"use client";

import { Navbar } from "@/components/navbar";
import { HeroKernelPreview } from "@/components/hero-kernel-preview";

export function KernelLabPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF8] text-zinc-900">
      <Navbar />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6">
        <section className="relative">
          <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
          <div className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fafafa] p-6">
            <HeroKernelPreview autoClip="Walk_Loop" />
          </div>
        </section>

        <section className="relative">
          <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
          <div className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fafafa] p-6">
            <HeroKernelPreview
              modelUrl="/api/game-kernel/fixture"
              autoClip="Walk_Loop"
            />
          </div>
        </section>
      </main>
    </div>
  );
}
