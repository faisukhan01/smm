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
  title: "SMM — AI Social Media Manager",
  description:
    "Your AI-powered social media team. Create, schedule and publish content across Facebook, Instagram and Pinterest.",
  keywords: ["social media manager", "AI content", "scheduler", "Facebook", "Instagram", "Pinterest"],
  authors: [{ name: "SMM" }],
  openGraph: {
    title: "SMM — AI Social Media Manager",
    description: "Create, schedule and publish content across your connected platforms with AI.",
    siteName: "SMM",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
