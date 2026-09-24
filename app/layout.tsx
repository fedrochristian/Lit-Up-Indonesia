import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lit Up — Nyalakan Rasa Ingin Tahumu",
  description: "Ruang belajar untuk pikiran yang penasaran. Jelajahi materi pilihan, bangun jalur belajarmu, dan terus bertumbuh.",
  icons: { icon: "/brand/litup-logo.jpg", apple: "/brand/litup-logo.jpg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${dmSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
