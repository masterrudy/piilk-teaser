// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/page.tsx — V6.2
// 📌 역할: / 메인 티저 페이지
// 📌 API: /api/subscribe (Supabase + Klaviyo 서버사이드) — 변경 없음
// 📌 트래킹: lib/ga4-main.ts — 이벤트명 유지
//
// ✅ V6.1 → V6.2 변경사항 (CSS ONLY):
//   1. product-claims 색상 밝게 (#71717a → #a1a1aa)
//   2. product-benefit 색상 밝게 (#a1a1aa → #d4d4d8)
//   3. compare-cards margin-bottom 넓힘 (20px → 28px, 모바일 14px → 22px)
//   4. hero-email .email-row margin 넓힘 (6px → 12px)
//   5. hero-incentive margin-top 넓힘 (6px → 10px)
//   6. 모바일 hero-content margin-top (-10vh → -12vh)
//
// 🔒 변경하지 않은 것들:
//   - JSX 구조 전체 → 동일
//   - import { track } from "@/lib/ga4-main" → 동일
//   - fetch("/api/subscribe") → 동일
//   - body 파라미터 → 동일
//   - 모든 track 이벤트명 → 동일
//   - Image src → 동일
//   - ConsentText 컴포넌트 → 동일
//   - emailInfo state → 동일
//   - Footer (주소 포함) → 동일
// ═══════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { track } from "@/lib/ga4-main";

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────

function getTrackingData() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    device_type: /Mobile|Android|iPhone/i.test(navigator.userAgent)
      ? "mobile"
      : "desktop",
    language: navigator.language || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    referrer: document.referrer || null,
    utm_source: params.get("utm_source") || null,
    utm_medium: params.get("utm_medium") || null,
    utm_campaign: params.get("utm_campaign") || null,
  };
}

// ─── 공통 동의 문구 컴포넌트 (모듈 레벨) ───
function ConsentText() {
  return (
    <p className="consent-text">
      By signing up, you agree to receive marketing emails from PIILK.{" "}
      <a href="/privacy" className="consent-link">Privacy Policy</a>
    </p>
  );
}

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════

export default function MainTeaser() {
  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailInfo, setEmailInfo] = useState("");
  const [stickyVisible, setStickyVisible] = useState(false);
  const [stickyHidden, setStickyHidden] = useState(false);

  const heroEmailRef = useRef<HTMLInputElement>(null);
  const ctaEmailRef = useRef<HTMLInputElement>(null);
  const ctaSectionRef = useRef<HTMLDivElement>(null);
  const stickyShownRef = useRef(false);
  const emailFocusTracked = useRef(false);
  const comparisonTracked = useRef(false);

  // ─── Page View ───
  useEffect(() => { track.pageView(); }, []);

  // ─── Scroll tracking ───
  useEffect(() => {
    const onScroll = () => {
      if (!stickyShownRef.current && window.scrollY > window.innerHeight * 0.5) {
        stickyShownRef.current = true;
        setStickyVisible(true);
      }
      if (!comparisonTracked.current && window.scrollY > window.innerHeight * 0.15) {
        comparisonTracked.current = true;
        track.scrollDepth("comparison");
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ─── Sticky Bar: hide when CTA section visible ───
  useEffect(() => {
    const el = ctaSectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setStickyVisible(false);
            setStickyHidden(true);
          } else if (stickyShownRef.current) {
            setStickyVisible(true);
            setStickyHidden(false);
          }
        });
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ─── Email Submit ───
  const doSubmitEmail = useCallback(
    async (targetRef: React.RefObject<HTMLInputElement | null>) => {
      const raw = targetRef.current?.value ?? "";
      const email = raw.trim();

      if (!email) {
        setEmailError("Please enter your email.");
        setEmailInfo("");
        return;
      }
      if (!email.includes("@") || !email.includes(".")) {
        setEmailError("Please enter a valid email address.");
        setEmailInfo("");
        return;
      }

      setEmailLoading(true);
      setEmailError("");
      setEmailInfo("");

      try {
        const res = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            segment: "A",
            answers: { sub_reason: "direct" },
            source: "main_teaser",
            tracking: getTrackingData(),
          }),
        });

        const data = await res.json();

        if (data?.success) {
          setEmailSent(true);
          track.emailSubmit();
          setStickyVisible(false);
          setStickyHidden(true);
          return;
        }

        if (data?.error === "already_exists") {
          setEmailInfo("You're already on the list! 🎉");
          return;
        }

        setEmailError(
          data?.error === "invalid_email"
            ? "Please enter a valid email address."
            : "Something went wrong. Please try again."
        );
      } catch {
        setEmailError("Connection error. Please try again.");
      } finally {
        setEmailLoading(false);
      }
    },
    []
  );

  const scrollToCta = () => {
    track.stickyClick();
    ctaSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleEmailFocus = () => {
    if (!emailFocusTracked.current) {
      emailFocusTracked.current = true;
      track.emailFocus();
    }
  };

  return (
    <>
      <style>{CSS}</style>

      {/* ── NAV ── */}
      <nav className="nav">
        <a className="nav-logo" href="/" style={{ cursor: "pointer" }}>
          <Image
            src="/pillk-logo.png"
            alt="PIILK"
            width={64}
            height={24}
            style={{ display: "block" }}
            priority
          />
        </a>
        <span className="nav-right">NYC · MARCH 2026</span>
      </nav>

      {/* ════════════════════════════════════════════════════════
          SECTION 1: HERO — 원인 → 선언 → 비교 → CTA (ALL IN FIRST VP)
          ════════════════════════════════════════════════════════ */}
      <section className="section section--hero">
        <div className="hero-content">

          {/* ① 원인 지목 1줄 */}
          <p className="emotion-cause anim-up">
            It&apos;s not the protein. It&apos;s the other 14 ingredients.
          </p>

          {/* ② 선언형 헤드라인 */}
          <h1 className="hero-headline anim-up d1">
            <span className="headline-line">7 ingredients.</span>
            <span className="headline-line">30g protein.</span>
            <span className="headline-line accent">Nothing after.</span>
          </h1>

          {/* ③ 비교 카드 */}
          <div className="compare-cards anim-up d2">
            <div className="ccard ccard--them">
              <span className="ccard-label">MOST SHAKES</span>
              <span className="ccard-num">15+</span>
              <span className="ccard-sub">ingredients · 11.5 oz</span>
            </div>
            <div className="ccard ccard--piilk">
              <span className="ccard-label">PIILK™</span>
              <span className="ccard-num accent">7</span>
              <span className="ccard-sub">ingredients<br />30g protein · 8.5 oz</span>
            </div>
          </div>

          {/* ④ 이메일 CTA — FIRST VIEWPORT */}
          {!emailSent ? (
            <div className="hero-email anim-up d3">
              <div className="email-row">
                <input
                  ref={heroEmailRef}
                  className="email-input"
                  type="email"
                  placeholder="your@email.com"
                  autoComplete="email"
                  inputMode="email"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      doSubmitEmail(heroEmailRef);
                    }
                  }}
                  onFocus={handleEmailFocus}
                />
                <button
                  className="email-btn"
                  onClick={() => doSubmitEmail(heroEmailRef)}
                  disabled={emailLoading}
                >
                  {emailLoading ? "..." : "I\u2019m in \u2192"}
                </button>
              </div>
              {emailError && <p className="email-error">{emailError}</p>}
              {emailInfo && <p className="email-info">{emailInfo}</p>}
              <p className="hero-incentive">
                First 1,000 &middot; $2.99 credit &middot; Free shipping
              </p>
              <ConsentText />
            </div>
          ) : (
            <div className="hero-success anim-up d3">
              <p className="success-inline">
                &#10003; You&apos;re in. We&apos;ll email you before launch.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 2: 제품사진 배경 + 확신 + CTA 반복
          ════════════════════════════════════════════════════════ */}
      <section
        className="section section--product"
        style={{
          backgroundImage: "url(/piilk-hero.png)",
          backgroundSize: "auto 85%",
          backgroundPosition: "center 15%",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
        }}
      >
        <div className="product-spacer"></div>
        <div className="product-scroll">
          <div className="product-content" ref={ctaSectionRef}>
            <p className="product-closer">
              We kept the protein. Removed the rest.
            </p>
            <p className="product-claims">
              No artificial sweeteners &middot; No emulsifiers &middot; Dairy free
            </p>
            <p className="product-benefit">
              Drink it. Forget about it. That&apos;s the point.
            </p>

            {!emailSent ? (
              <div className="email-box">
                <p className="email-scarcity">1,000 spots only.</p>
                <p className="email-hook">$2.99 credit on us.</p>
                <p className="email-offer">
                  3 bottles &middot; $2.99 &middot; Free shipping
                </p>
                <p className="email-tagline">
                  Pay once. Get $2.99 back toward your next order.
                </p>
                <div className="email-row">
                  <input
                    ref={ctaEmailRef}
                    className="email-input"
                    type="email"
                    placeholder="your@email.com"
                    autoComplete="email"
                    inputMode="email"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        doSubmitEmail(ctaEmailRef);
                      }
                    }}
                    onFocus={handleEmailFocus}
                  />
                  <button
                    className="email-btn"
                    onClick={() => doSubmitEmail(ctaEmailRef)}
                    disabled={emailLoading}
                  >
                    {emailLoading ? "..." : "I\u2019m in \u2192"}
                  </button>
                </div>
                {emailError && <p className="email-error">{emailError}</p>}
                {emailInfo && <p className="email-info">{emailInfo}</p>}
                <ConsentText />
              </div>
            ) : (
              <div className="success-msg">
                <div className="check">&#10003;</div>
                <p className="success-title">You&apos;re one of the first 1,000.</p>
                <p className="success-credit">Your $2.99 credit is locked in.</p>
                <p className="success-sub">We&apos;ll email you before launch day.</p>
                <div className="success-share">
                  <p className="success-share-text">Know someone who&apos;d want in?</p>
                  <button
                    className="share-btn"
                    onClick={() => {
                      const url = window.location.origin;
                      if (navigator.share) {
                        navigator.share({
                          title: "PIILK \u2014 7 ingredients. 30g protein. Nothing after.",
                          url,
                        }).catch(() => {});
                      } else {
                        navigator.clipboard.writeText(url);
                        const btn = document.querySelector(".share-btn");
                        if (btn) btn.textContent = "Link copied \u2713";
                      }
                    }}
                  >
                    Share &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── STICKY BAR ── */}
      {!emailSent && (
        <div
          className={`sticky-bar${stickyVisible ? " visible" : ""}${stickyHidden ? " hide" : ""}`}
        >
          <span className="sticky-text">1,000 spots &middot; $2.99 credit on us</span>
          <button className="sticky-btn" onClick={scrollToCta}>
            I&apos;m in &rarr;
          </button>
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer className="site-footer">
        <div className="footer-logo">
          <Image
            src="/pillk-logo.png"
            alt="PIILK"
            width={60}
            height={24}
            style={{
              display: "block",
              margin: "0 auto 8px",
              opacity: 0.5,
            }}
          />
        </div>
        <div className="footer-brand">PIILK&trade; BY ARMORED FRESH</div>
        <div className="footer-desc">RTD High Protein Shake.</div>
        <div className="footer-copy">&copy; 2026 Armoredfresh Inc.</div>
        <div className="footer-copy">
          Armored Fresh Inc. · 228 Park Ave S, PMB 93918, New York, NY 10003
        </div>
      </footer>
    </>
  );
}

// ═══════════════════════════════════════════
// CSS — V6.2
// ═══════════════════════════════════════════

const CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { background: #000; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

/* ── Nav ── */
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 60;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 20px;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.nav-logo { display: flex; align-items: center; text-decoration: none; }
.nav-right { font-size: 10px; color: #52525b; letter-spacing: 0.08em; text-transform: uppercase; }

/* ── Sections ── */
.section { display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; overflow: hidden; }

/* ════════════════════════════════════════════
   HERO — ALL IN FIRST VIEWPORT
   ════════════════════════════════════════════ */
.section--hero {
  min-height: 100vh; min-height: 100svh;
  justify-content: center;
  padding: 52px 24px 32px;
}
.hero-content {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; width: 100%; max-width: 440px;
  margin-top: -8vh;
}

.emotion-cause {
  font-size: 15px; color: #D4FF2B; line-height: 1.6;
  font-weight: 600;
  margin-bottom: 16px;
}

.hero-headline {
  font-size: clamp(26px, 7vw, 38px); font-weight: 800;
  color: #fff; line-height: 1.2; letter-spacing: -0.03em;
  margin-bottom: 20px;
}
.hero-headline .accent { color: #D4FF2B; }
.headline-line { display: block; }

/* V6.2: margin-bottom 20px → 28px */
.compare-cards {
  display: flex; gap: 12px; width: 100%; max-width: 400px;
  margin-bottom: 28px;
}
.ccard {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; gap: 4px; padding: 16px 12px;
  border-radius: 14px; text-align: center;
}
.ccard--them {
  background: #111113;
  border: 1px solid rgba(255,255,255,0.06);
  opacity: 0.75;
}
.ccard--piilk {
  background: rgba(212,255,43,0.04);
  border: 2px solid rgba(212,255,43,0.2);
}
.ccard-label {
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase;
}
.ccard--them .ccard-label { color: #52525b; }
.ccard--piilk .ccard-label { color: #D4FF2B; }
.ccard-num {
  font-size: 34px; font-weight: 800;
  color: #71717a; letter-spacing: -0.03em;
}
.ccard-num.accent { color: #D4FF2B; }
.ccard-sub { font-size: 11px; color: #52525b; }

/* V6.2: email-row margin 6px → 12px, incentive margin-top 6px → 10px */
.hero-email { width: 100%; }
.hero-email .email-row { margin: 0 auto 12px; }
.hero-incentive {
  font-size: 12px; color: #71717a;
  margin-top: 10px;
}
.hero-success { width: 100%; }
.success-inline {
  font-size: 15px; color: #D4FF2B; font-weight: 600;
  padding: 12px 0;
}

.consent-text {
  font-size: 11px; color: #3f3f46; line-height: 1.5;
  margin-top: 8px; text-align: center;
}
.consent-link {
  color: #52525b; text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s;
}
.consent-link:hover { color: #71717a; }

/* ════════════════════════════════════════════
   PRODUCT SECTION
   ════════════════════════════════════════════ */
.section--product {
  position: relative;
  padding: 0;
}
.product-spacer {
  height: 100vh; height: 100svh;
}
.product-scroll {
  position: relative;
  z-index: 1;
  background: linear-gradient(
    to bottom,
    rgba(0,0,0,0) 0%,
    rgba(0,0,0,0.8) 15%,
    rgba(0,0,0,1) 30%,
    rgba(0,0,0,1) 100%
  );
  padding: 60px 24px 48px;
  display: flex; flex-direction: column; align-items: center;
}
.product-content {
  width: 100%; max-width: 440px;
  display: flex; flex-direction: column; align-items: center;
  text-align: center;
}

.product-closer {
  font-size: 16px; color: #D4FF2B; font-weight: 700;
  margin-bottom: 8px;
}
/* V6.2: #71717a → #a1a1aa */
.product-claims {
  font-size: 13px; color: #a1a1aa; line-height: 1.6;
  margin-bottom: 8px;
}
/* V6.2: #a1a1aa → #d4d4d8 */
.product-benefit {
  font-size: 15px; color: #d4d4d8; line-height: 1.6;
  font-style: italic;
  margin-bottom: 32px;
}

/* ── Shared Email Styles ── */
.email-box { width: 100%; text-align: center; }
.email-scarcity {
  font-size: 18px; font-weight: 800; color: #fff;
  margin-bottom: 4px; letter-spacing: -0.02em;
}
.email-hook {
  font-size: 16px; font-weight: 700; color: #D4FF2B;
  margin-bottom: 12px;
}
.email-offer {
  font-size: 14px; font-weight: 600; color: #a1a1aa;
  margin-bottom: 4px; letter-spacing: 0.01em;
}
.email-tagline {
  font-size: 12px; color: #71717a; margin-bottom: 18px;
  font-style: italic;
}
.email-row {
  display: flex; gap: 8px; max-width: 100%;
  margin: 0 auto 10px;
}
.email-input {
  flex: 1; min-width: 0; background: #111113;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; padding: 11px 14px;
  font-size: 14px; color: #f4f4f5;
  font-family: inherit; outline: none;
  transition: border-color 0.2s;
}
.email-input::placeholder { color: #3f3f46; }
.email-input:focus { border-color: rgba(212,255,43,0.4); }
.email-btn {
  padding: 11px 20px; background: #D4FF2B; color: #000;
  border: none; border-radius: 10px; font-size: 14px;
  font-weight: 700; font-family: inherit; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
  transition: transform 0.15s, opacity 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.email-btn:hover { opacity: 0.9; }
.email-btn:active { transform: scale(0.97); }
.email-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.email-error {
  font-size: 13px; color: #ef4444;
  margin: 4px auto 8px; max-width: 340px;
}
.email-info {
  font-size: 13px; color: #D4FF2B;
  margin: 4px auto 8px; max-width: 340px;
}

/* ── Success ── */
.success-msg {
  display: flex; flex-direction: column;
  align-items: center; gap: 6px; padding: 16px;
}
.success-msg .check {
  width: 48px; height: 48px; border-radius: 50%;
  background: rgba(212,255,43,0.1);
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; margin-bottom: 4px;
}
.success-title { font-size: 17px; color: #fff; font-weight: 700; }
.success-credit { font-size: 14px; color: #D4FF2B; font-weight: 600; }
.success-sub { font-size: 13px; color: #71717a; margin-bottom: 8px; }
.success-share {
  display: flex; flex-direction: column; align-items: center;
  gap: 8px; margin-top: 12px;
  padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
  width: 100%;
}
.success-share-text { font-size: 13px; color: #a1a1aa; }
.share-btn {
  padding: 10px 28px; background: transparent;
  color: #D4FF2B; border: 1px solid rgba(212,255,43,0.3);
  border-radius: 10px; font-size: 14px;
  font-weight: 600; font-family: inherit; cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
  -webkit-tap-highlight-color: transparent;
}
.share-btn:hover {
  background: rgba(212,255,43,0.06);
  border-color: rgba(212,255,43,0.5);
}

/* ── Sticky ── */
.sticky-bar {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 50;
  background: rgba(10,10,11,0.92);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid rgba(255,255,255,0.06);
  padding: 12px 20px;
  display: flex; align-items: center; justify-content: center; gap: 14px;
  transform: translateY(100%); transition: transform 0.4s ease;
}
.sticky-bar.visible { transform: translateY(0); }
.sticky-bar.hide { transform: translateY(100%); }
.sticky-text { font-size: 13px; color: #D4FF2B; font-weight: 600; }
.sticky-btn {
  padding: 10px 20px; background: #D4FF2B; color: #000;
  border: none; border-radius: 10px; font-size: 14px;
  font-weight: 700; font-family: inherit; cursor: pointer;
  white-space: nowrap;
  transition: transform 0.15s, opacity 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.sticky-btn:hover { opacity: 0.9; }
.sticky-btn:active { transform: scale(0.97); }

/* ── Animations ── */
.anim-up { animation: fadeUp 0.7s ease both; }
.d1 { animation-delay: 0.1s; }
.d2 { animation-delay: 0.2s; }
.d3 { animation-delay: 0.35s; }
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Footer ── */
.site-footer {
  text-align: center; padding: 32px 16px; font-size: 12px;
  color: #71717a; display: flex; flex-direction: column; gap: 4px;
}
.footer-brand {
  font-size: 13px; font-weight: 700; color: #a1a1aa;
  letter-spacing: 0.06em;
}
.footer-desc { font-size: 12px; color: #71717a; }
.footer-copy { font-size: 11px; color: #3f3f46; margin-top: 4px; }

/* ════════════════════════════════════════════
   MOBILE — V6.2: 간격 + 위치 조정
   ════════════════════════════════════════════ */
@media (max-width: 480px) {
  .section--hero {
    padding: 44px 20px 24px;
    min-height: 100vh; min-height: 100svh;
  }
  /* V6.2: -10vh → -12vh */
  .hero-content { max-width: 100%; margin-top: -12vh; }
  .emotion-cause { font-size: 13px; margin-bottom: 10px; }
  .hero-headline {
    font-size: clamp(22px, 6.2vw, 28px);
    margin-bottom: 14px; line-height: 1.25;
  }
  /* V6.2: margin-bottom 14px → 22px */
  .compare-cards { flex-direction: row; gap: 10px; margin-bottom: 22px; }
  .ccard { padding: 12px 10px; }
  .ccard-num { font-size: 30px; }
  .ccard-label { font-size: 9px; }
  .ccard-sub { font-size: 10px; }
  .hero-email .email-row { gap: 6px; }
  .hero-email .email-input { padding: 10px 12px; font-size: 16px; border-radius: 10px; }
  .hero-email .email-btn { padding: 10px 16px; font-size: 13px; border-radius: 10px; }
  /* V6.2: margin-top 5px → 8px */
  .hero-incentive { font-size: 11px; margin-top: 8px; }
  .consent-text { font-size: 10px; margin-top: 6px; }
  .email-row { gap: 6px; }
  .email-input { padding: 10px 12px; font-size: 16px; border-radius: 10px; }
  .email-btn { padding: 10px 16px; font-size: 13px; border-radius: 10px; }

  .section--product {
    background-attachment: scroll !important;
    background-size: auto 70% !important;
    background-position: center 10% !important;
  }
  .product-spacer { height: 75vh; height: 75svh; }
  .product-scroll { padding: 40px 20px 36px; }
  .product-content { max-width: 100%; }
  .product-closer { font-size: 14px; }
  .product-claims { font-size: 12px; }
  .product-benefit { font-size: 13px; margin-bottom: 24px; }
  .email-scarcity { font-size: 16px; }
  .email-hook { font-size: 14px; }
  .email-offer { font-size: 12px; }
  .email-tagline { font-size: 12px; margin-bottom: 14px; }
  .email-error { font-size: 11px; }
  .email-info { font-size: 11px; }
  .sticky-bar { padding: 10px 16px; gap: 10px; }
  .sticky-text { font-size: 12px; }
  .sticky-btn { padding: 10px 16px; font-size: 13px; }
  .site-footer { padding: 20px 16px; }
  .footer-brand { font-size: 11px; }
  .footer-desc { font-size: 10px; }
  .footer-copy { font-size: 10px; }
}

/* ── Small height devices ── */
@media (max-height: 680px) and (max-width: 480px) {
  .section--hero { padding-top: 40px; padding-bottom: 20px; }
  .hero-content { margin-top: -4vh; }
  .emotion-cause { font-size: 12px; margin-bottom: 6px; }
  .hero-headline {
    font-size: clamp(20px, 5.5vw, 24px);
    margin-bottom: 10px;
  }
  .compare-cards { margin-bottom: 14px; }
  .ccard { padding: 10px 8px; }
  .ccard-num { font-size: 26px; }
  .hero-email .email-input { padding: 10px 12px; }
  .hero-email .email-btn { padding: 10px 14px; font-size: 12px; }
}
`;
