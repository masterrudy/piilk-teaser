# PIILK Teaser Site

**Domain:** teaser.piilk.com

티저 캠페인 전용 사이트. 이메일 수집 + 세그먼트 분류 + 대시보드.

## 구조

```
piilk-teaser/
├── app/
│   ├── page.tsx              # 메인 티저 페이지 (루트 /)
│   ├── layout.tsx            # 공통 레이아웃 + GA
│   ├── globals.css           # 글로벌 스타일
│   ├── components/
│   │   └── GoogleAnalytics.tsx
│   ├── dashboard/
│   │   └── page.tsx          # /dashboard
│   └── api/
│       ├── subscribe/
│       │   └── route.ts      # POST /api/subscribe
│       └── dashboard/
│           └── stats/
│               └── route.ts  # GET /api/dashboard/stats
├── public/
│   ├── hero-bg.png
│   ├── pillk-logo.png
│   ├── Piilk_icon.png
│   └── og-image.png
└── ...config files
```

## Vercel 배포

1. GitHub에 푸시
2. Vercel에서 Import
3. Environment Variables 설정:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `KLAVIYO_API_KEY`
   - `KLAVIYO_LIST_ID`
4. Domains에서 `teaser.piilk.com` 연결

## 로컬 개발

```bash
npm install
npm run dev
```

http://localhost:3000 에서 티저 페이지 확인
http://localhost:3000/dashboard 에서 대시보드 확인

## 변경사항 (원본 대비)

- `app/teaser/` 폴더 삭제 → 루트 `app/page.tsx`로 이동
- `middleware.ts` 삭제 (도메인 분기 불필요)
- 이제 `/` 접속 시 바로 티저 페이지 표시
