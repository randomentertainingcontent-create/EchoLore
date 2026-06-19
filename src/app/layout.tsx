import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EchoLore — BYOK AI Roleplay with RAG Memory",
  description:
    "Create custom worlds, become anyone, and let an AI Game Master remember everything. " +
    "EchoLore is an open-source, BYOK roleplay client powered by RAG memory and a dynamic lorebook.",
  keywords: [
    "EchoLore", "AI roleplay", "BYOK", "RAG", "Vercel AI SDK",
    "Supabase", "pgvector", "Next.js", "open-source",
  ],
  authors: [{ name: "EchoLore" }],
  openGraph: {
    title: "EchoLore — BYOK AI Roleplay with RAG Memory",
    description:
      "Create custom worlds, become anyone, and let an AI Game Master remember everything.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EchoLore — BYOK AI Roleplay",
    description:
      "Open-source BYOK AI roleplay with RAG memory and a dynamic lorebook.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
