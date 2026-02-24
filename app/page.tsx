// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/page.tsx — V5.0
// 📌 역할: / 메인 티저 페이지
// 📌 API: /api/subscribe (Supabase + Klaviyo 서버사이드) — 변경 없음
// 📌 트래킹: lib/ga4-main.ts — 이벤트명 유지
//
// ✅ V4.3 → V5.0 변경사항:
//   1. 구조 변경: 3-stage → 단일 스크롤 페이지
//   2. Flip 인터랙션 + Counting 애니메이션 제거
//   3. 감정 bridge 1줄 추가 (스펙 선언 전)
//   4. 비교 카드(15 vs 7) first viewport으로 이동
//   5. 가격($2.99)은 비교 증거 아래 CTA 직전 배치
//   6. Sticky bar: scroll 50% 이후 표시
//
// 🔒 변경하지 않은 것들:
//   - import { track } from "@/lib/ga4-main" → 동일
//   - fetch("/api/subscribe") → 동일
//   - body: { email, segment: "A", answers: { sub_reason: "direct" }, source: "main_teaser", tracking } → 동일
//   - 모든 track 이벤트명 → 동일 (pageView, emailFocus, emailSubmit, stickyClick, scrollDepth)
//   - Image src="/pillk-logo.png" → 동일
//   - 에러 메시지 → 동일
//   - Footer → 동일
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

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════

export default function MainTeaser() {
  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [stickyVisible, setStickyVisible] = useState(false);
  const [stickyHidden, setStickyHidden] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const emailSectionRef = useRef<HTMLDivElement>(null);
  const stickyShownRef = useRef(false);
  const emailFocusTracked = useRef(false);
  const comparisonTracked = useRef(false);

  // ─── Page View ───
  useEffect(() => { track.pageView(); }, []);

  // ─── iOS 자동 줌 방지 ───
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
    }
  }, []);

  // ─── Scroll tracking: comparison section visibility ───
  useEffect(() => {
    const onScroll = () => {
      // Sticky bar trigger
      if (!stickyShownRef.current && window.scrollY > window.innerHeight * 0.5) {
        stickyShownRef.current = true;
        setStickyVisible(true);
      }
      // Track comparison view
      if (!comparisonTracked.current && window.scrollY > window.innerHeight * 0.3) {
        comparisonTracked.current = true;
        track.scrollDepth("comparison");
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ─── 모바일 키보드 대응 ───
  useEffect(() => {
    const input = document.querySelector(".email-input") as HTMLElement;
    if (!input) return;
    const handleFocus = () => {
      setTimeout(() => {
        input.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 350);
    };
    input.addEventListener("focus", handleFocus);
    return () => input.removeEventListener("focus", handleFocus);
  }, [emailSent]);

  // ─── Sticky Bar: hide when email section visible ───
  useEffect(() => {
    const el = emailSectionRef.current;
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
        return;
      }
      if (!email.includes("@") || !email.includes(".")) {
        setEmailError("Please enter a valid email address.");
        return;
      }

      setEmailLoading(true);
      setEmailError("");

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

        setEmailError(
          data?.error === "invalid_email"
            ? "Please enter a valid email address."
            : data?.error === "already_exists"
              ? "You're already on the list! 🎉"
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

  const scrollToEmail = () => {
    track.stickyClick();
    emailSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <style>{CSS}</style>

      {/* ── NAV ── */}
      <nav className="nav">
        <a
          className="nav-logo"
          href="/"
          style={{ cursor: "pointer" }}
        >
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
          SECTION 1: HERO — 감정 Bridge → 선언 → 비교(증거)
          ════════════════════════════════════════════════════════ */}
      <section className="section section--hero">
        <div className="hero-content">

          {/* ① 감정 bridge — 공감 + 원인 지목 */}
          <p className="emotion-bridge anim-up">
            You know that feeling after a protein shake.
          </p>
          <p className="emotion-cause anim-up d1">
            It&apos;s not the protein. It&apos;s the other 14 ingredients.
          </p>

          {/* ② 선언형 헤드라인 (숫자 우선) */}
          <h1 className="hero-headline anim-up d2">
            <span className="headline-line">7 ingredients.</span>
            <span className="headline-line">30g protein.</span>
            <span className="headline-line accent">Nothing after.</span>
          </h1>

          {/* ③ 비교 카드 — FIRST VIEWPORT */}
          <div className="compare-cards anim-up d3">
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

          {/* ④ 확신 라인 + claims */}
          <p className="hero-closer anim-up d3">
            We kept the protein. Removed the rest.
          </p>
          <p className="hero-claims anim-up d3">
            No artificial sweeteners · No emulsifiers · Dairy free
          </p>

          {/* benefit bridge — 스펙 → 체감 번역 */}
          <p className="hero-benefit anim-up d4">
            Drink it. Forget about it. That&apos;s the point.
          </p>

          {/* 스크롤 화살표 */}
          <div className="scroll-arrow anim-up d4" onClick={scrollToEmail}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M7 10l5 5 5-5" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 2: EMAIL CTA — 가격은 증거 뒤에
          ════════════════════════════════════════════════════════ */}
      <section className="section section--cta" style={{
        backgroundImage: "url(/piilk-hero.png)",
        backgroundSize: "auto 85%",
        backgroundPosition: "center 15%",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}>
        <div className="cta-spacer"></div>
        <div className="cta-scroll">
          <div className="cta-content" ref={emailSectionRef}>
          {!emailSent ? (
            <div className="email-box">
              {/* ⑤ 긴급성 + credit 혜택 */}
              <p className="email-scarcity">
                1,000 spots only.
              </p>
              <p className="email-hook">
                $2.99 credit on us.
              </p>
              <p className="email-offer">
                3 bottles · $2.99 · Free shipping
              </p>
              <p className="email-tagline">
                Pay once. Get $2.99 back toward your next order.
              </p>
              <div className="email-row">
                <input
                  ref={emailRef}
                  className="email-input"
                  type="email"
                  placeholder="your@email.com"
                  autoComplete="email"
                  inputMode="email"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      doSubmitEmail(emailRef);
                    }
                  }}
                  onFocus={() => {
                    if (!emailFocusTracked.current) {
                      emailFocusTracked.current = true;
                      track.emailFocus();
                    }
                  }}
                />
                <button
                  className="email-btn"
                  onClick={() => doSubmitEmail(emailRef)}
                  disabled={emailLoading}
                >
                  {emailLoading ? "..." : "I'm in →"}
                </button>
              </div>
              {emailError && <p className="email-error">{emailError}</p>}
              <p className="email-fine">No spam. Unsubscribe anytime.</p>
            </div>
          ) : (
            <div className="success-msg">
              <div className="check">✓</div>
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
                        title: "PIILK — 7 ingredients. 30g protein. Nothing after.",
                        url,
                      }).catch(() => {});
                    } else {
                      navigator.clipboard.writeText(url);
                      const btn = document.querySelector(".share-btn");
                      if (btn) btn.textContent = "Link copied ✓";
                    }
                  }}
                >
                  Share →
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
          <span className="sticky-text">1,000 spots · $2.99 credit on us</span>
          <button className="sticky-btn" onClick={scrollToEmail}>
            I&apos;m in →
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
        <div className="footer-brand">PIILK™ BY ARMORED FRESH</div>
        <div className="footer-desc">RTD High Protein Shake.</div>
        <div className="footer-copy">© 2026 Armoredfresh Inc.</div>
      </footer>
    </>
  );
}

// ═══════════════════════════════════════════
// CSS — V5.0
// ═══════════════════════════════════════════

const CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }

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
.section { display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; overflow: hidden; z-index: 1; background: #000; }

/* HERO: 감정→선언→비교 */
.section--hero {
  min-height: 100vh; min-height: 100svh;
  justify-content: center;
  padding: 60px 24px 60px;
}
.hero-content {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; width: 100%; max-width: 440px;
}

/* ① 감정 bridge */
.emotion-bridge {
  font-size: 15px; color: #71717a; line-height: 1.6;
  margin-bottom: 6px;
}
.emotion-cause {
  font-size: 15px; color: #D4FF2B; line-height: 1.6;
  font-weight: 600;
  margin-bottom: 20px;
}

/* ② 헤드라인 */
.hero-headline {
  font-size: clamp(26px, 7vw, 38px); font-weight: 800;
  color: #fff; line-height: 1.2; letter-spacing: -0.03em;
  margin-bottom: 24px;
}
.hero-headline .accent { color: #D4FF2B; }
.headline-line { display: block; }

/* ③ 비교 카드 */
.compare-cards {
  display: flex; gap: 12px; width: 100%; max-width: 400px;
  margin-bottom: 20px;
}
.ccard {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; gap: 4px; padding: 18px 12px;
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
  font-size: 36px; font-weight: 800;
  color: #71717a; letter-spacing: -0.03em;
}
.ccard-num.accent { color: #D4FF2B; }
.ccard-sub { font-size: 11px; color: #52525b; }

/* ④ 확신 */
.hero-closer {
  font-size: 16px; color: #D4FF2B; font-weight: 700;
  margin-bottom: 8px;
}
.hero-claims {
  font-size: 13px; color: #71717a; line-height: 1.6;
  margin-bottom: 24px;
}

/* benefit bridge */
.hero-benefit {
  font-size: 15px; color: #a1a1aa; line-height: 1.6;
  font-style: italic;
  margin-bottom: 0;
}

/* scroll arrow - 화면 하단 고정, 고급 fade pulse */
.scroll-arrow {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  cursor: pointer;
  animation: arrowPulse 2.4s ease-in-out infinite;
  -webkit-tap-highlight-color: transparent;
}
@keyframes arrowPulse {
  0% { opacity: 0; transform: translateX(-50%) translateY(-4px); }
  30% { opacity: 0.6; transform: translateX(-50%) translateY(0); }
  50% { opacity: 0.6; transform: translateX(-50%) translateY(4px); }
  70% { opacity: 0.3; transform: translateX(-50%) translateY(6px); }
  100% { opacity: 0; transform: translateX(-50%) translateY(8px); }
}

/* ── CTA Section ── */
.section--cta {
  position: relative;
  padding: 0;
  background: transparent;
  overflow: visible;
}
.cta-spacer {
  height: 100vh; height: 100svh;
}
.cta-scroll {
  position: relative;
  z-index: 1;
  padding: 60px 24px 160px;
  min-height: 100vh; min-height: 100svh;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center;
}
.cta-content {
  width: 100%; max-width: 440px;
  display: flex; flex-direction: column; align-items: center;
  text-align: center;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px;
  padding: 36px 28px;
}
.cta-bg, .cta-product { display: none; }

/* Email box */
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
  border-radius: 12px; padding: 14px 16px;
  font-size: 15px; color: #f4f4f5;
  font-family: inherit; outline: none;
  transition: border-color 0.2s;
}
.email-input::placeholder { color: #3f3f46; }
.email-input:focus { border-color: rgba(212,255,43,0.4); }
.email-btn {
  padding: 14px 24px; background: #D4FF2B; color: #000;
  border: none; border-radius: 12px; font-size: 15px;
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
.email-fine {
  font-size: 11px; color: #3f3f46;
  max-width: 300px; margin: 0 auto;
}

/* Success */
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
.success-title {
  font-size: 17px; color: #fff; font-weight: 700;
}
.success-credit {
  font-size: 14px; color: #D4FF2B; font-weight: 600;
}
.success-sub {
  font-size: 13px; color: #71717a;
  margin-bottom: 8px;
}
.success-share {
  display: flex; flex-direction: column; align-items: center;
  gap: 8px; margin-top: 12px;
  padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
  width: 100%;
}
.success-share-text {
  font-size: 13px; color: #a1a1aa;
}
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
.d4 { animation-delay: 0.5s; }
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Footer ── */
.site-footer {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 0;
  text-align: center; padding: 24px 16px; font-size: 12px;
  color: #71717a; display: flex; flex-direction: column; gap: 4px;
  align-items: center;
}
.footer-brand {
  font-size: 13px; font-weight: 700; color: #a1a1aa;
  letter-spacing: 0.06em;
}
.footer-desc { font-size: 12px; color: #71717a; }
.footer-copy { font-size: 11px; color: #3f3f46; margin-top: 4px; }

/* ── Mobile ── */
@media (max-width: 480px) {
  .section--hero {
    padding: 48px 20px 48px;
    min-height: 100vh; min-height: 100svh;
  }
  .hero-content { max-width: 100%; }
  .emotion-bridge { font-size: 13px; margin-bottom: 4px; }
  .emotion-cause { font-size: 13px; margin-bottom: 12px; }
  .hero-headline {
    font-size: clamp(22px, 6.2vw, 28px);
    margin-bottom: 20px; line-height: 1.25;
  }
  .compare-cards { flex-direction: row; gap: 10px; }
  .ccard {
    padding: 14px 12px; flex-direction: column;
    align-items: center; text-align: center;
  }
  .ccard-num { font-size: 32px; }
  .ccard-label { font-size: 10px; }
  .ccard-sub { font-size: 11px; }
  .hero-closer { font-size: 14px; }
  .hero-claims { font-size: 12px; }
  .hero-benefit { font-size: 13px; margin-bottom: 0; }
  .scroll-arrow { bottom: 20px; }
  .scroll-arrow svg { width: 28px; height: 28px; }
  .section--cta { background-attachment: scroll !important; background-size: auto 70% !important; background-position: center 10% !important; }
  .cta-spacer { height: 65vh; height: 65svh; }
  .cta-scroll { padding: 40px 16px 80px; }
  .cta-content { max-width: 100%; padding: 28px 20px; border-radius: 16px; }
  .email-scarcity { font-size: 16px; }
  .email-hook { font-size: 14px; }
  .email-offer { font-size: 12px; }
  .email-tagline { font-size: 12px; margin-bottom: 14px; }
  .email-row { gap: 6px; }
  .email-input { padding: 11px 12px; font-size: 16px; border-radius: 10px; }
  .email-btn { padding: 11px 18px; font-size: 13px; border-radius: 10px; }
  .email-fine { font-size: 11px; margin-top: 2px; }
  .email-error { font-size: 11px; }
  .sticky-bar { padding: 10px 16px; gap: 10px; }
  .sticky-text { font-size: 12px; }
  .sticky-btn { padding: 10px 16px; font-size: 13px; }
  .site-footer { padding: 20px 16px; }
  .footer-brand { font-size: 11px; }
  .footer-desc { font-size: 10px; }
  .footer-copy { font-size: 10px; }
}
`;
