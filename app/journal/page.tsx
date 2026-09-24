import { SparksApp } from "@/components/SparksApp";
import Link from "next/link";

export default function Home() {
  return (
    <div className="journal-shell flex flex-1 flex-col px-4 py-8 sm:px-8 sm:py-10">
      <header className="mx-auto mb-8 w-full max-w-6xl">
        <Link href="/" className="mb-6 inline-block text-sm text-amber-200">← Kembali ke Lit Up</Link>
        <p className="text-xs uppercase tracking-[0.28em] text-amber-300/70">
          Daily constellation
        </p>
        <h1 className="mt-2 font-serif text-4xl text-amber-50 sm:text-5xl">
          Lit Up
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-amber-100/65 sm:text-base">
          Log the small things that made a day glow. Days with sparks light up
          on the grid.
        </p>
      </header>
      <main className="flex-1">
        <SparksApp />
      </main>
    </div>
  );
}
