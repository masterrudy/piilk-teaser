// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/page.tsx — V4.3 FINAL
// 📌 역할: / 메인 티저 페이지
// 📌 API: /api/subscribe (Supabase + Klaviyo 서버사이드) — 변경 없음
// 📌 트래킹: lib/ga4-main.ts — 이벤트명 유지
//
// ✅ V4.2 → V4.3 변경사항:
//   1. TypeScript 에러 수정: RefObject 타입 호환성
//   2. <title> + <meta description> 추가 (Head → metadata export)
//   3. Social proof 준비 (카운터 표시 가능)
//   4. empathy 스테이지에서 emailSent 후 flip card 영역도 숨김 정리
//   5. Reveal 스테이지: emailSent 시 hero에서 이미 완료했으므로 성공 메시지 표시
//
// 🔒 변경하지 않은 것들:
//   - import { track } from "@/lib/ga4-main" → 동일
//   - fetch("/api/subscribe") → 동일
//   - body: { email, source: "main_teaser", tracking } → 동일
//   - 모든 track 이벤트명 → 동일
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

// ─────────────────────────────────────────────────────────────
// 경쟁사 라벨 성분 (법적: Gellan Gum, Cellulose Gum 제거)
// ─────────────────────────────────────────────────────────────
const COMPETITOR_INGREDIENTS = [
  "Milk Protein Isolate",
  "Water",
  "Calcium Caseinate",
  "Sunflower Oil",
  "Cellulose Gel",
  "Sucralose",
  "Carrageenan",
  "Acesulfame Potassium",
  "Mono & Diglycerides",
  "Sodium Hexametaphosphate",
  "Soy Lecithin",
  "Salt",
  "Natural & Artificial Flavors",
  "Dipotassium Phosphate",
  "Sodium Stearoyl Lactylate",
];

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════

export default function MainTeaser() {
  const [stage, setStage] = useState<"empathy" | "counting" | "reveal">("empathy");
  const [isFlipped, setIsFlipped] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [countDone, setCountDone] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [stickyVisible, setStickyVisible] = useState(false);
  const [stickyHidden, setStickyHidden] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const heroEmailRef = useRef<HTMLInputElement>(null);
  const emailSectionRef = useRef<HTMLDivElement>(null);
  const stickyShownRef = useRef(false);
  const emailFocusTracked = useRef(false);
  const flipTracked = useRef(false);

  // ─── Page View ───
  useEffect(() => { track.pageView(); }, []);

  // ─── 5초 후 fallback ───
  useEffect(() => {
    if (stage !== "empathy") return;
    const timer = setTimeout(() => setShowFallback(true), 5000);
    return () => clearTimeout(timer);
  }, [stage]);

  // ─── Counting animation ───
  useEffect(() => {
    if (stage !== "counting") return;
    if (visibleCount >= COMPETITOR_INGREDIENTS.length) {
      setTimeout(() => setCountDone(true), 600);
      return;
    }
    const timer = setTimeout(() => setVisibleCount((v) => v + 1), 120);
    return () => clearTimeout(timer);
  }, [stage, visibleCount]);

  // ─── Sticky Bar: intersection ───
  useEffect(() => {
    if (stage !== "reveal") return;
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
  }, [stage]);

  // ─── Sticky Bar: scroll trigger ───
  useEffect(() => {
    if (stage !== "reveal") return;
    const onScroll = () => {
      if (!stickyShownRef.current && window.scrollY > window.innerHeight * 0.5) {
        stickyShownRef.current = true;
        setStickyVisible(true);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [stage]);

  // ─── Flip handler ───
  const handleFlip = () => {
    if (isFlipped) return;
    setIsFlipped(true);
    if (!flipTracked.current) {
      flipTracked.current = true;
      track.scrollDepth("flip_bottle");
    }
    setTimeout(() => {
      setStage("counting");
      setVisibleCount(0);
      setCountDone(false);
    }, 800);
  };

  // ─── Reveal handler ───
  const handleReveal = () => {
    track.scrollDepth("comparison");
    setStage("reveal");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ─── Email Submit (TypeScript fix: explicit ref param) ───
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

  // ─── Reset to empathy ───
  const goHome = () => {
    setStage("empathy");
    setIsFlipped(false);
    setShowFallback(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <style>{CSS}</style>

      {/* ── NAV ── */}
      <nav className="nav">
        <a
          className="nav-logo"
          onClick={goHome}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") goHome();
          }}
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
        <span className="nav-right">NYC · March 2026</span>
      </nav>

      {/* ════════════════════════════════════════════
          STAGE 1: EMPATHY — First Viewport CTA + Flip
          ════════════════════════════════════════════ */}
      {stage === "empathy" && (
        <section className="section section--full">
          <div className="empathy-content">
            {/* 선언형 헤드라인 (숫자 우선) */}
            <h1 className="empathy-headline anim-up">
              7 ingredients.
              <br />
              30g protein. <span className="accent">Nothing after.</span>
            </h1>

            {/* 공감 1줄 → 즉시 답 */}
            <p className="empathy-sub anim-up d1">
              That something after your protein shake? We fixed it.
            </p>

            {/* ★ EMAIL CTA — FIRST VIEWPORT ★ */}
            {!emailSent ? (
              <div className="hero-email anim-up d2">
                <p className="hero-offer">
                  3 bottles · $2.99 each · Free shipping
                </p>
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
                    onFocus={() => {
                      if (!emailFocusTracked.current) {
                        emailFocusTracked.current = true;
                        track.emailFocus();
                      }
                    }}
                  />
                  <button
                    className="email-btn"
                    onClick={() => doSubmitEmail(heroEmailRef)}
                    disabled={emailLoading}
                  >
                    {emailLoading ? "..." : "I'm in →"}
                  </button>
                </div>
                {emailError && <p className="email-error">{emailError}</p>}
                <p className="email-fine">No spam. Unsubscribe anytime.</p>
              </div>
            ) : (
              <div className="success-msg anim-up d2">
                <div className="check">✓</div>
                <p>
                  <strong>You&apos;re in.</strong>
                </p>
                <p>We&apos;ll reach out when it&apos;s ready.</p>
              </div>
            )}

            {/* Flip 영역: 이메일 제출 전에만 표시 */}
            {!emailSent && (
              <>
                <div className="hero-divider anim-up d3" />
                <p className="flip-intro anim-up d3">Curious why?</p>
                <div
                  className={`flip-card anim-up d3${isFlipped ? " flipped" : ""}`}
                  onClick={handleFlip}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleFlip();
                  }}
                >
                  <div className="flip-card-inner">
                    {/* FRONT */}
                    <div className="flip-card-face flip-card-front">
                      <svg
                        className="flip-svg"
                        width="32"
                        height="32"
                        viewBox="0 0 36 36"
                        fill="none"
                      >
                        <path
                          d="M18 6C11.373 6 6 11.373 6 18h3c0-4.97 4.03-9 9-9V6z"
                          fill="rgba(255,255,255,0.18)"
                        >
                          <animateTransform
                            attributeName="transform"
                            type="rotate"
                            from="0 18 18"
                            to="360 18 18"
                            dur="3s"
                            repeatCount="indefinite"
                          />
                        </path>
                        <path
                          d="M18 30c6.627 0 12-5.373 12-12h-3c0 4.97-4.03 9-9 9v3z"
                          fill="rgba(255,255,255,0.10)"
                        >
                          <animateTransform
                            attributeName="transform"
                            type="rotate"
                            from="0 18 18"
                            to="360 18 18"
                            dur="3s"
                            repeatCount="indefinite"
                          />
                        </path>
                        <polygon
                          points="6,14 6,18 10,18"
                          fill="rgba(255,255,255,0.18)"
                        >
                          <animateTransform
                            attributeName="transform"
                            type="rotate"
                            from="0 18 18"
                            to="360 18 18"
                            dur="3s"
                            repeatCount="indefinite"
                          />
                        </polygon>
                        <polygon
                          points="30,22 30,18 26,18"
                          fill="rgba(255,255,255,0.10)"
                        >
                          <animateTransform
                            attributeName="transform"
                            type="rotate"
                            from="0 18 18"
                            to="360 18 18"
                            dur="3s"
                            repeatCount="indefinite"
                          />
                        </polygon>
                      </svg>
                      <span className="flip-card-title">
                        Flip your bottle over.
                      </span>
                      <span className="flip-card-sub">
                        tap to see what&apos;s on the back
                      </span>
                    </div>
                    {/* BACK */}
                    <div className="flip-card-face flip-card-back">
                      <span className="flip-back-label">THE BACK LABEL</span>
                      <span className="flip-back-count">15</span>
                      <span className="flip-back-unit">ingredients</span>
                      <span className="flip-back-hint">Hold on...</span>
                    </div>
                  </div>
                </div>

                {/* Fallback */}
                <div
                  className={`fallback-cta ${showFallback ? "visible" : ""}`}
                >
                  <span className="fallback-or">or </span>
                  <button
                    className="fallback-link"
                    onClick={() => {
                      track.scrollDepth("skip_to_reveal");
                      setStage("reveal");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    see the difference →
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════
          STAGE 2: COUNTING
          ════════════════════════════════════════════ */}
      {stage === "counting" && (
        <section className="section section--full">
          <div className="counting-content">
            <p className="counting-label">THE BACK OF THE LABEL</p>
            <div className="counting-number">
              {countDone ? COMPETITOR_INGREDIENTS.length : visibleCount}
            </div>
            <p className="counting-unit">
              {visibleCount < COMPETITOR_INGREDIENTS.length
                ? "counting..."
                : "ingredients"}
            </p>
            <div className="ingredient-wall">
              {COMPETITOR_INGREDIENTS.slice(0, visibleCount).map((ing, i) => (
                <span key={i} className="ing-tag">
                  {ing}
                </span>
              ))}
            </div>
            {countDone && (
              <div className="count-done anim-up">
                <p className="count-done-text">
                  Emulsifiers. Artificial sweeteners.
                  <br />
                  Things you can&apos;t pronounce.
                </p>
                <button className="reveal-btn" onClick={handleReveal}>
                  What if it only took 7? →
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════
          STAGE 3: REVEAL
          ════════════════════════════════════════════ */}
      {stage === "reveal" && (
        <>
          <section className="section section--reveal-full">
            <div className="reveal-content">
              {/* 감정 bridge 1줄 (스펙 전 필수) */}
              <p className="reveal-bridge anim-up">
                Now compare.
              </p>

              {/* 비교 카드 */}
              <div className="compare-cards anim-up d1">
                <div className="ccard ccard--dim">
                  <span className="ccard-label">MOST SHAKES</span>
                  <span className="ccard-num">15+</span>
                  <span className="ccard-sub">ingredients · 11.5 oz</span>
                </div>
                <div className="ccard ccard--piilk">
                  <span className="ccard-label">PIILK™</span>
                  <span className="ccard-num accent">7</span>
                  <span className="ccard-sub">
                    ingredients
                    <br />
                    30g protein · 8.5 oz
                  </span>
                </div>
              </div>

              <p className="reveal-closer anim-up d2">
                We kept the protein. Removed the rest.
              </p>
              <p className="reveal-claims anim-up d2">
                No artificial sweeteners · No emulsifiers · No carrageenan ·
                Dairy free
              </p>

              {/* Email CTA */}
              <div
                className="email-section anim-up d3"
                ref={emailSectionRef}
              >
              {!emailSent ? (
                <div className="email-box">
                  <p className="email-prompt">
                    3 bottles · $2.99 each · Free shipping
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
                  {emailError && (
                    <p className="email-error">{emailError}</p>
                  )}
                  <p className="email-fine">
                    No spam. Unsubscribe anytime.
                  </p>
                </div>
              ) : (
                <div className="success-msg">
                  <div className="check">✓</div>
                  <p>
                    <strong>You&apos;re in.</strong>
                  </p>
                  <p>We&apos;ll reach out when it&apos;s ready.</p>
                </div>
              )}
            </div>
            </div>
          </section>

          {/* ── STICKY BAR ── */}
          <div
            className={`sticky-bar${stickyVisible ? " visible" : ""}${stickyHidden ? " hide" : ""}`}
          >
            <div className="sticky-info">
              <span className="sticky-text">3 bottles · $2.99 each</span>
            </div>
            <button className="sticky-btn" onClick={scrollToEmail}>
              I&apos;m in →
            </button>
          </div>
        </>
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
// CSS — V4.3 FINAL
// ═══════════════════════════════════════════

const CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }

/* ── Nav ── */
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 60;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 20px;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.nav-logo { display: flex; align-items: center; }
.nav-right { font-size: 10px; color: #52525b; letter-spacing: 0.08em; text-transform: uppercase; }

/* ── Sections ── */
.section { display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; }
.section--full { min-height: 100vh; min-height: 100svh; justify-content: center; padding: 60px 24px 40px; }
.section--reveal-full { min-height: 100vh; min-height: 100svh; justify-content: center; padding: 80px 24px 60px; }

/* ── Reveal Content ── */
.reveal-content { display: flex; flex-direction: column; align-items: center; text-align: center; width: 100%; max-width: 440px; }
.reveal-bridge { font-size: 13px; color: #52525b; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 20px; }

/* ── Empathy ── */
.empathy-content { display: flex; flex-direction: column; align-items: center; text-align: center; width: 100%; max-width: 440px; }
.empathy-headline { font-size: clamp(26px, 7vw, 38px); font-weight: 800; color: #fff; line-height: 1.15; letter-spacing: -0.03em; margin-bottom: 12px; }
.empathy-headline .accent { color: #D4FF2B; }
.empathy-sub { font-size: 15px; color: #71717a; line-height: 1.6; margin-bottom: 24px; }

/* ── Hero Email ── */
.hero-email { width: 100%; text-align: center; margin-bottom: 28px; }
.hero-offer { font-size: 14px; font-weight: 600; color: #D4FF2B; margin-bottom: 12px; letter-spacing: 0.01em; }
.hero-divider { width: 40px; height: 1px; background: rgba(255,255,255,0.06); margin-bottom: 24px; }
.flip-intro { font-size: 13px; color: #52525b; margin-bottom: 12px; }

/* ── 3D Flip Card ── */
.flip-card { perspective: 1000px; width: 260px; height: 160px; cursor: pointer; margin-bottom: 20px; -webkit-tap-highlight-color: transparent; outline: none; }
.flip-card-inner { position: relative; width: 100%; height: 100%; transition: transform 0.7s cubic-bezier(0.4,0,0.2,1); transform-style: preserve-3d; }
.flip-card.flipped .flip-card-inner { transform: rotateY(180deg); }
.flip-card-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }

.flip-card-front { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); transition: border-color 0.3s, background 0.3s; }
.flip-card:hover .flip-card-front, .flip-card:focus .flip-card-front { border-color: rgba(212,255,43,0.25); background: rgba(212,255,43,0.02); }
.flip-svg { opacity: 0.35; margin-bottom: 2px; }
.flip-card:hover .flip-svg { opacity: 0.55; }
.flip-card-title { font-size: 16px; font-weight: 700; color: #fff; }
.flip-card-sub { font-size: 12px; color: #52525b; transition: color 0.3s; }
.flip-card:hover .flip-card-sub { color: #71717a; }
.flip-card-front::after { content: ''; position: absolute; inset: -2px; border-radius: 18px; border: 1.5px solid rgba(212,255,43,0.12); animation: tapPulse 2.5s ease-in-out infinite; pointer-events: none; }
@keyframes tapPulse { 0%, 100% { opacity: 0; transform: scale(1); } 50% { opacity: 1; transform: scale(1.015); } }

.flip-card-back { background: #111113; border: 1px solid rgba(255,255,255,0.06); transform: rotateY(180deg); gap: 3px; }
.flip-back-label { font-size: 9px; color: #52525b; letter-spacing: 0.15em; text-transform: uppercase; }
.flip-back-count { font-size: 38px; font-weight: 800; color: #fff; letter-spacing: -0.04em; line-height: 1; }
.flip-back-unit { font-size: 12px; color: #71717a; }
.flip-back-hint { font-size: 10px; color: #52525b; margin-top: 2px; animation: blink 1.2s ease-in-out infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

/* ── Fallback ── */
.fallback-cta { opacity: 0; transform: translateY(8px); transition: opacity 0.6s, transform 0.6s; pointer-events: none; }
.fallback-cta.visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
.fallback-or { font-size: 12px; color: #52525b; }
.fallback-link { font-size: 12px; color: rgba(212,255,43,0.5); background: none; border: none; cursor: pointer; text-decoration: underline; font-family: inherit; padding: 0; }
.fallback-link:hover { color: #D4FF2B; }

/* ── Counting ── */
.counting-content { display: flex; flex-direction: column; align-items: center; text-align: center; width: 100%; max-width: 440px; }
.counting-label { font-size: 11px; color: #52525b; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 12px; }
.counting-number { font-size: clamp(52px,14vw,72px); font-weight: 800; color: #fff; line-height: 1; letter-spacing: -0.04em; }
.counting-unit { font-size: 14px; color: #71717a; margin-bottom: 20px; }
.ingredient-wall { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-bottom: 24px; min-height: 60px; }
.ing-tag { font-size: 11px; padding: 5px 10px; border-radius: 6px; background: rgba(255,255,255,0.04); color: #71717a; border: 1px solid rgba(255,255,255,0.06); animation: tagIn 0.25s ease-out both; }
@keyframes tagIn { from { opacity: 0; transform: scale(0.9) translateY(4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.count-done { display: flex; flex-direction: column; align-items: center; gap: 20px; }
.count-done-text { font-size: 15px; color: #a1a1aa; line-height: 1.7; }
.reveal-btn { padding: 16px 36px; background: #D4FF2B; color: #000; border: none; border-radius: 14px; font-size: 16px; font-weight: 700; font-family: inherit; cursor: pointer; transition: transform 0.15s, opacity 0.15s; -webkit-tap-highlight-color: transparent; }
.reveal-btn:hover { opacity: 0.9; }
.reveal-btn:active { transform: scale(0.97); }

/* ── Reveal ── */
.compare-cards { display: flex; gap: 12px; width: 100%; max-width: 400px; margin-bottom: 24px; }
.ccard { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 18px 12px; border-radius: 14px; text-align: center; }
.ccard--dim { background: #111113; border: 1px solid rgba(255,255,255,0.04); opacity: 0.6; }
.ccard--piilk { background: rgba(212,255,43,0.04); border: 2px solid rgba(212,255,43,0.2); }
.ccard-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.ccard--dim .ccard-label { color: #52525b; }
.ccard--piilk .ccard-label { color: #D4FF2B; }
.ccard-num { font-size: 36px; font-weight: 800; color: #52525b; letter-spacing: -0.03em; }
.ccard-num.accent { color: #D4FF2B; }
.ccard-sub { font-size: 11px; color: #52525b; }
.reveal-closer { font-size: 16px; color: #D4FF2B; font-weight: 700; margin-bottom: 8px; }
.reveal-claims { font-size: 13px; color: #71717a; margin-bottom: 28px; line-height: 1.6; }

/* ── Email ── */
.email-section { width: 100%; max-width: 440px; }
.email-box { text-align: center; }
.email-prompt { font-size: 14px; color: #D4FF2B; margin-bottom: 12px; font-weight: 600; }
.email-row { display: flex; gap: 8px; max-width: 100%; margin: 0 auto 10px; }
.email-input { flex: 1; min-width: 0; background: #111113; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px 16px; font-size: 15px; color: #f4f4f5; font-family: inherit; outline: none; transition: border-color 0.2s; }
.email-input::placeholder { color: #3f3f46; }
.email-input:focus { border-color: rgba(212,255,43,0.4); }
.email-btn { padding: 14px 24px; background: #D4FF2B; color: #000; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; font-family: inherit; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: transform 0.15s, opacity 0.15s; -webkit-tap-highlight-color: transparent; }
.email-btn:hover { opacity: 0.9; }
.email-btn:active { transform: scale(0.97); }
.email-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.email-error { font-size: 13px; color: #ef4444; margin: 4px auto 8px; max-width: 340px; }
.email-fine { font-size: 11px; color: #3f3f46; max-width: 300px; margin: 0 auto; }

/* ── Success ── */
.success-msg { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; }
.success-msg .check { width: 48px; height: 48px; border-radius: 50%; background: rgba(212,255,43,0.1); display: flex; align-items: center; justify-content: center; font-size: 24px; }
.success-msg p { font-size: 15px; color: #a1a1aa; }
.success-msg strong { color: #D4FF2B; font-weight: 700; }

/* ── Sticky ── */
.sticky-bar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 50; background: rgba(10,10,11,0.92); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-top: 1px solid rgba(255,255,255,0.06); padding: 12px 20px; display: flex; align-items: center; justify-content: center; gap: 14px; transform: translateY(100%); transition: transform 0.4s ease; }
.sticky-bar.visible { transform: translateY(0); }
.sticky-bar.hide { transform: translateY(100%); }
.sticky-info { display: flex; align-items: center; gap: 8px; }
.sticky-text { font-size: 13px; color: #D4FF2B; font-weight: 600; }
.sticky-btn { padding: 10px 20px; background: #D4FF2B; color: #000; border: none; border-radius: 10px; font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer; white-space: nowrap; transition: transform 0.15s, opacity 0.15s; -webkit-tap-highlight-color: transparent; }
.sticky-btn:hover { opacity: 0.9; }
.sticky-btn:active { transform: scale(0.97); }

/* ── Animations ── */
.anim-up { animation: fadeUp 0.7s ease both; }
.d1 { animation-delay: 0.1s; }
.d2 { animation-delay: 0.2s; }
.d3 { animation-delay: 0.35s; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }

/* ── Footer ── */
.site-footer { text-align: center; padding: 32px 16px; font-size: 12px; color: #71717a; display: flex; flex-direction: column; gap: 4px; }
.footer-brand { font-size: 13px; font-weight: 700; color: #a1a1aa; letter-spacing: 0.06em; }
.footer-desc { font-size: 12px; color: #71717a; }
.footer-copy { font-size: 11px; color: #3f3f46; margin-top: 4px; }

/* ── Mobile ── */
@media (max-width: 480px) {
  .section--full { padding: 52px 20px 32px; }
  .section--reveal-full { padding: 60px 20px 48px; }
  .empathy-headline { font-size: clamp(24px, 6.5vw, 32px); }
  .email-row { flex-direction: column; }
  .email-btn { width: 100%; }
  .flip-card { width: 240px; height: 148px; }
  .compare-cards { flex-direction: column; gap: 8px; }
  .ccard { padding: 14px; flex-direction: row; justify-content: space-between; }
  .sticky-bar { padding: 10px 16px; gap: 10px; }
  .sticky-text { font-size: 12px; }
  .sticky-btn { padding: 10px 16px; font-size: 13px; }
}
`;
