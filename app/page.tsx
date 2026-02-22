// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/page.tsx — V3.1
// 📌 역할: / 메인 티저 페이지 (1-Viewport: Bridge → Problem/Answer → Stats → Email CTA)
// 📌 API: /api/subscribe (Supabase + Klaviyo 서버사이드) — 변경 없음
// 📌 트래킹: lib/ga4-main.ts (GA4 + Meta Pixel + TikTok + Supabase) — 이벤트 추가
//
// ✅ V2 → V3 변경사항 (Audit V3 기반 전면 개편):
//   1. 구조: 3-Scroll (공감→비교→오퍼) → 1.5-Viewport (선언+CTA → 비교 보조)
//   2. Hero: 질문형 "Ever had..." → 선언형 "Same 30g protein. 7 ingredients."
//   3. 감각 묘사 3줄 삭제 → 숫자 3개 stat row (7 / 30g / 8.5oz)
//   4. Email CTA를 first viewport로 이동
//   5. 가격 ($13.47, $2.99) 전체 삭제 — pre-launch에서 가격 혼란 방지
//   6. "scroll" 텍스트 삭제
//   7. "Cancel anytime" → "No spam. Unsubscribe anytime."
//   8. "by Armored Fresh" → "NYC · Coming March 2026"
//   9. Sticky bar: 가격 제거 → "Join the NYC waitlist"
//  10. Below fold: "Flip your..." → "Why fewer ingredients?" 보조 섹션
//  11. GA4 이벤트 추가: scroll_to_comparison, email_focus (기존), email_submit (기존)
// ═══════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { track } from "@/lib/ga4-main";

// ─────────────────────────────────────────────────────────────
// Utils (기존 유지)
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
  const compareSectionRef = useRef<HTMLElement>(null);
  const stickyShownRef = useRef(false);
  const emailFocusTracked = useRef(false);
  const comparisonTracked = useRef(false);

  // ─── Page View (기존 유지) ───
  useEffect(() => {
    track.pageView();
  }, []);

  // ─── Scroll Reveal (기존 유지) ───
  useEffect(() => {
    const reveals = document.querySelectorAll(".reveal");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    reveals.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // ─── Comparison Section 진입 트래킹 (신규) ───
  useEffect(() => {
    const el = compareSectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !comparisonTracked.current) {
            comparisonTracked.current = true;
            track.scrollDepth("comparison");
          }
        });
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ─── Sticky Bar: email section 벗어나면 표시 ───
  useEffect(() => {
    const el = emailSectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            // email section이 보이면 sticky 숨김
            setStickyVisible(false);
            setStickyHidden(true);
          } else if (stickyShownRef.current) {
            // email section이 안 보이면 sticky 표시
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

  // ─── Sticky Bar: 스크롤 후 표시 ───
  useEffect(() => {
    const onScroll = () => {
      if (!stickyShownRef.current && window.scrollY > window.innerHeight * 0.8) {
        stickyShownRef.current = true;
        setStickyVisible(true);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ─── Email Submit (API 경로 + body 구조 100% 유지) ───
  const submitEmail = useCallback(async () => {
    const raw = emailRef.current?.value ?? "";
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
      // ✅ API 경로 유지: /api/subscribe
      // ✅ body 구조 유지: { email, source, tracking }
      // ✅ Supabase + Klaviyo 서버사이드 처리 유지
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
        // ✅ 기존 track.emailSubmit() 호출 유지
        track.emailSubmit();
        setStickyVisible(false);
        setStickyHidden(true);
        return;
      }

      // ✅ 기존 에러 핸들링 유지
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
  }, []);

  const scrollToEmail = () => {
    track.stickyClick();
    emailSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <style>{CSS}</style>

      {/* ── NAV (V3: "by Armored Fresh" → "NYC · March 2026") ── */}
      <nav className="nav">
        <a
          className="nav-logo"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ")
              window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          style={{ cursor: "pointer" }}
        >
          <Image
            src="/pillk-logo.png"
            alt="PIILK"
            width={72}
            height={28}
            style={{ display: "block" }}
            priority
          />
        </a>
        <span className="nav-right">NYC · March 2026</span>
      </nav>

      {/* ══════════════════════════════════════════════════════
          SCREEN 1: FIRST VIEWPORT — 공감 1줄 → 답 즉시 → Email CTA
          V3.1: 공감 bridge + 선언 + 이메일 first viewport
          ══════════════════════════════════════════════════════ */}
      <section className="section section--hero" id="screen1">
        {/* ── Empathy Bridge: 광고 → 랜딩 연결 1줄 ── */}
        <p className="hero-bridge reveal">You felt it. Here&apos;s why.</p>

        {/* ── Problem → Answer: 즉시 전환 ── */}
        <h1 className="hero-headline reveal" style={{ transitionDelay: "0.08s" }}>
          Your shake has 15+ ingredients.
          <br />
          <span className="hero-accent">PIILK has 7.</span>
          <br />
          <span className="hero-sub-line">Same 30g protein.</span>
        </h1>

        {/* ── Stat Row: 숫자 3개 ── */}
        <div className="stat-row reveal" style={{ transitionDelay: "0.12s" }}>
          <div className="stat">
            <div className="stat-num accent">7</div>
            <div className="stat-label">ingredients</div>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <div className="stat-num">30g</div>
            <div className="stat-label">protein</div>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <div className="stat-num accent">8.5<span className="stat-unit">oz</span></div>
            <div className="stat-label">smaller bottle</div>
          </div>
        </div>

        {/* ── Clean Tags ── */}
        <div className="clean-tags reveal" style={{ transitionDelay: "0.2s" }}>
          <span className="ctag">No artificial sweeteners</span>
          <span className="ctag-dot">·</span>
          <span className="ctag">No carrageenan</span>
          <span className="ctag-dot">·</span>
          <span className="ctag">Dairy free</span>
        </div>

        {/* ── Email CTA (First Viewport) ── */}
        <div
          className="email-section reveal"
          style={{ transitionDelay: "0.3s" }}
          ref={emailSectionRef}
        >
          {!emailSent ? (
            <div className="email-box">
              <p className="email-prompt">
                Get early access · 3 bottles · Free shipping
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
                      submitEmail();
                    }
                  }}
                  onFocus={() => {
                    if (!emailFocusTracked.current) {
                      emailFocusTracked.current = true;
                      // ✅ 기존 track.emailFocus() 호출 유지
                      track.emailFocus();
                    }
                  }}
                />
                <button
                  className="email-btn"
                  onClick={submitEmail}
                  disabled={emailLoading}
                >
                  {emailLoading ? "..." : "I'm in →"}
                </button>
              </div>
              {emailError && <p className="email-error">{emailError}</p>}
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
      </section>

      {/* ══════════════════════════════════════════════════════
          BELOW FOLD: 보조 비교 섹션
          V3: "Flip your protein shake" → "Why fewer ingredients?"
          스크롤한 사람 = 추가 정보 필요 = 비교 데이터 제공
          ══════════════════════════════════════════════════════ */}
      <section
        className="section section--compare"
        id="screen2"
        ref={compareSectionRef}
      >
        <p className="compare-lead reveal">Why fewer ingredients?</p>

        <div className="compare-block reveal" style={{ transitionDelay: "0.1s" }}>
          <div className="compare-item">
            <span className="compare-label dim">Most protein shakes</span>
            <span className="compare-val dim">15+ ingredients · 11.5 oz</span>
          </div>
          <div className="compare-item highlight">
            <span className="compare-label">PIILK™</span>
            <span className="compare-val">7 ingredients · 8.5 oz · 30g protein</span>
          </div>
        </div>

        <p className="compare-body reveal" style={{ transitionDelay: "0.2s" }}>
          We kept the protein and removed what you don&apos;t need.
          <br />
          No artificial sweeteners. No carrageenan. No preservatives.
          <br />
          35% less liquid. Same protein.
        </p>

        <button
          className="compare-cta reveal"
          style={{ transitionDelay: "0.3s" }}
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          ↑ Join the waitlist
        </button>
      </section>

      {/* ── STICKY BOTTOM CTA BAR (V3: 가격 삭제, waitlist 유도) ── */}
      <div
        className={`sticky-bar${stickyVisible ? " visible" : ""}${stickyHidden ? " hide" : ""}`}
      >
        <div className="sticky-info">
          <span className="sticky-text">Join the NYC waitlist</span>
        </div>
        <button className="sticky-btn" onClick={scrollToEmail}>
          I&apos;m in →
        </button>
      </div>

      {/* ── FOOTER (기존 유지) ── */}
      <footer className="site-footer">
        <div className="footer-logo">
          <Image
            src="/pillk-logo.png"
            alt="PIILK"
            width={60}
            height={24}
            style={{ display: "block", margin: "0 auto 8px", opacity: 0.5 }}
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
// CSS — V3
// ═══════════════════════════════════════════

const CSS = `
/* ── Reset ── */
* { margin: 0; padding: 0; box-sizing: border-box; }

/* ── Nav (기존 구조 유지) ── */
.nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.nav-logo {
  display: flex;
  align-items: center;
}
.nav-right {
  font-size: 11px;
  color: #71717a;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ===== SECTIONS ===== */
.section {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 80px 24px 60px;
  text-align: center;
  position: relative;
}

/* ── Screen 1: Hero (V3.1 — 1 viewport, content upper-center) ── */
.section--hero {
  min-height: 100vh;
  min-height: 100svh;
  padding-top: 80px;
  padding-bottom: 40px;
  gap: 0;
  justify-content: center;
  /* 콘텐츠를 시각적 중앙보다 약간 위로 — 데스크톱에서 상단 공백 방지 */
  padding-top: 12vh;
  padding-bottom: 8vh;
}

@media (min-width: 768px) {
  .section--hero {
    /* 데스크톱: 더 위로 올림 */
    justify-content: flex-start;
    padding-top: 18vh;
  }
}

.hero-headline {
  font-size: clamp(22px, 6vw, 36px);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: #fff;
  margin-bottom: 24px;
}
.hero-accent {
  color: #D4FF2B;
}
.hero-bridge {
  font-size: 15px;
  color: #a1a1aa;
  margin-bottom: 16px;
  letter-spacing: 0.01em;
}
.hero-sub-line {
  font-size: clamp(16px, 4vw, 22px);
  font-weight: 500;
  color: #a1a1aa;
}

/* ── Stat Row ── */
.stat-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-bottom: 20px;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.stat-num {
  font-size: clamp(32px, 8vw, 48px);
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.03em;
  line-height: 1;
}
.stat-num.accent {
  color: #D4FF2B;
}
.stat-unit {
  font-size: 0.5em;
  font-weight: 600;
}
.stat-label {
  font-size: 12px;
  color: #71717a;
  letter-spacing: 0.04em;
}
.stat-divider {
  width: 1px;
  height: 40px;
  background: rgba(255,255,255,0.08);
}

/* ── Clean Tags ── */
.clean-tags {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 32px;
}
.ctag {
  font-size: 13px;
  color: #a1a1aa;
}
.ctag-dot {
  font-size: 13px;
  color: #3f3f46;
}

/* ── Email Section (First Viewport) ── */
.email-section {
  width: 100%;
  max-width: 440px;
}
.email-box {
  text-align: center;
}
.email-prompt {
  font-size: 14px;
  color: #a1a1aa;
  margin-bottom: 14px;
  font-weight: 500;
}

.email-row {
  display: flex;
  gap: 8px;
  max-width: 100%;
  margin: 0 auto 10px;
}
.email-input {
  flex: 1;
  min-width: 0;
  background: #111113;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 15px;
  color: #f4f4f5;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.email-input::placeholder { color: #3f3f46; }
.email-input:focus { border-color: rgba(212,255,43,0.4); }

.email-btn {
  padding: 14px 24px;
  background: #D4FF2B;
  color: #000;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: transform 0.15s, opacity 0.15s;
}
.email-btn:hover { opacity: 0.9; }
.email-btn:active { transform: scale(0.97); }
.email-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.email-error {
  font-size: 13px;
  color: #ef4444;
  margin: 4px auto 8px;
  max-width: 340px;
}
.email-fine {
  font-size: 12px;
  color: #3f3f46;
  max-width: 300px;
  margin: 0 auto;
}

/* ── Success (기존 스타일 유지) ── */
.success-msg {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
}
.success-msg .check {
  width: 48px; height: 48px;
  border-radius: 50%;
  background: rgba(212,255,43,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
.success-msg p { font-size: 15px; color: #a1a1aa; }
.success-msg strong { color: #D4FF2B; font-weight: 700; }

/* ── Screen 2: Compare (Below Fold — 보조 섹션) ── */
.section--compare {
  min-height: auto;
  padding: 48px 24px 64px;
  border-top: 1px solid rgba(255,255,255,0.04);
}

.compare-lead {
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 600;
  color: #fff;
  margin-bottom: 28px;
}

.compare-block {
  width: 100%;
  max-width: 420px;
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.compare-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-radius: 10px;
  background: #111113;
  border: 1px solid rgba(255,255,255,0.04);
}
.compare-item.highlight {
  border-color: rgba(212,255,43,0.2);
  background: rgba(212,255,43,0.04);
}
.compare-label {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}
.compare-label.dim {
  color: #71717a;
  font-weight: 400;
}
.compare-val {
  font-size: 12px;
  color: #D4FF2B;
  font-weight: 500;
}
.compare-val.dim {
  color: #52525b;
}

.compare-body {
  font-size: 14px;
  color: #71717a;
  line-height: 1.8;
  max-width: 380px;
  margin-bottom: 28px;
}

.compare-cta {
  background: none;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  padding: 12px 24px;
  color: #a1a1aa;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.compare-cta:hover {
  border-color: rgba(212,255,43,0.3);
  color: #D4FF2B;
}

/* ── Sticky Bottom CTA Bar (V3: 가격 삭제) ── */
.sticky-bar {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 50;
  background: rgba(10,10,11,0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid rgba(255,255,255,0.06);
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  transform: translateY(100%);
  transition: transform 0.4s ease;
}
.sticky-bar.visible { transform: translateY(0); }
.sticky-bar.hide { transform: translateY(100%); }

.sticky-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sticky-text {
  font-size: 14px;
  color: #a1a1aa;
  font-weight: 500;
}
.sticky-btn {
  padding: 10px 20px;
  background: #D4FF2B;
  color: #000;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.15s, opacity 0.15s;
}
.sticky-btn:hover { opacity: 0.9; }
.sticky-btn:active { transform: scale(0.97); }

/* ── Fade-in (기존 유지) ── */
.reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.7s ease, transform 0.7s ease;
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}

/* ── Footer (기존 유지) ── */
.site-footer {
  text-align: center;
  padding: 32px 16px;
  font-size: 12px;
  color: #71717a;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.footer-brand {
  font-size: 13px;
  font-weight: 700;
  color: #a1a1aa;
  letter-spacing: 0.06em;
}
.footer-desc {
  font-size: 12px;
  color: #71717a;
}
.footer-copy {
  font-size: 11px;
  color: #3f3f46;
  margin-top: 4px;
}

/* ── Mobile ── */
@media (max-width: 480px) {
  .section--hero {
    padding-top: 72px;
    padding-bottom: 32px;
  }
  .stat-row {
    gap: 14px;
  }
  .stat-num {
    font-size: clamp(28px, 7vw, 36px);
  }
  .stat-divider {
    height: 32px;
  }
  .clean-tags {
    gap: 4px;
  }
  .ctag {
    font-size: 12px;
  }
  .email-row {
    flex-direction: column;
  }
  .email-btn {
    width: 100%;
  }
  .sticky-bar {
    padding: 10px 16px;
    gap: 10px;
  }
  .sticky-text {
    font-size: 13px;
  }
  .sticky-btn {
    padding: 10px 16px;
    font-size: 13px;
  }
}
`;
