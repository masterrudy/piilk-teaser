// ═══════════════════════════════════════════════════════════
// 📁 app/type/layout.tsx
// 📌 퀴즈 페이지 전용 레이아웃 + OG 메타데이터
// 📌 폰트 로딩 (기존 head.tsx 역할 통합)
// ═══════════════════════════════════════════════════════════

import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "What\u2019s your after-feel type? | PIILK\u2122",
  description: "Find your after-feel type in 30 seconds. 4 types. Everyone has one.",
  openGraph: {
    title: "What\u2019s your after-feel type? | PIILK\u2122",
    description: "Find your after-feel type in 30 seconds. 4 types. Everyone has one.",
    url: "https://teaser.piilk.com/type",
    siteName: "PIILK",
    type: "website",
    images: [
      {
        url: "https://teaser.piilk.com/og-image-v2.png",
        width: 1200,
        height: 630,
        alt: "PIILK After-feel Type Quiz",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "What\u2019s your after-feel type? | PIILK\u2122",
    description: "Find your after-feel type in 30 seconds. 4 types. Everyone has one.",
    images: ["https://teaser.piilk.com/og-image-v2.png"],
  },
};

export default function TypeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
