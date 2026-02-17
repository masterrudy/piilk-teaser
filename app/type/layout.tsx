// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/type/layout.tsx
// 📌 역할: /type 전용 레이아웃
// 📌 OG 태그 + Twitter Card + Google Fonts 로드
// ═══════════════════════════════════════════════════════════
// app/type/layout.tsx
import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "The After-feel Project | PIILK™",
  description: "Find your after-feel type. 30 seconds.",
  openGraph: {
    title: "I'm a Brick Stomach. What's yours?",
    description: "Find your after-feel type in 30 seconds.",
    url: "https://teaser.piilk.com/type",
    siteName: "PIILK™ by Armored Fresh",
    images: [
      {
        url: "https://teaser.piilk.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "PIILK - The After-feel Project",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "I'm a Brick Stomach. What's yours?",
    description: "Find your after-feel type in 30 seconds.",
    images: ["https://teaser.piilk.com/og-image.png"],
  },
};

export default function TypeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
