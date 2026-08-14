import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "مفاتيح الثروة",
  description: "الكتاب التفاعلي الكامل — قراءة وتمارين وتقدّم محفوظ على جهازك.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "مفاتيح الثروة",
    statusBarStyle: "black-translucent",
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
