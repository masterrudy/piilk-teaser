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

          {/* ① 감정 bridge — 광고 hook 연결 */}
          <p className="emotion-bridge anim-up">
            You know that feeling after a protein shake.
          </p>

          {/* ② 선언형 헤드라인 (숫자 우선) */}
          <h1 className="hero-headline anim-up d1">
            <span className="headline-line">7 ingredients.</span>
            <span className="headline-line">30g protein.</span>
            <span className="headline-line accent">Nothing after.</span>
          </h1>

          {/* ③ 비교 카드 — FIRST VIEWPORT */}
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

          {/* ④ 확신 라인 + claims */}
          <p className="hero-closer anim-up d3">
            We kept the protein. Removed the rest.
          </p>
          <p className="hero-claims anim-up d3">
            No artificial sweeteners · No emulsifiers · No carrageenan · Dairy free
          </p>

          {/* benefit bridge — 스펙 → 체감 번역 */}
          <p className="hero-benefit anim-up d3">
            Drink it. Forget about it. That&apos;s the point.
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 2: EMAIL CTA — 가격은 증거 뒤에
          ════════════════════════════════════════════════════════ */}
      <section className="section section--cta">
        <div className="cta-content" ref={emailSectionRef}>
          {!emailSent ? (
            <div className="email-box">
              {/* ⑤ 가격 — 비교 증거 다음에 배치 = "이게 이 가격에?" */}
              <p className="email-offer">
                3 bottles · $2.99 each · Free shipping
              </p>
              <p className="email-tagline">
                Launching NYC · March 2026
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
              <p><strong>You&apos;re in.</strong></p>
              <p>We&apos;ll reach out when it&apos;s ready.</p>
            </div>
          )}
        </div>
      </section>

      {/* ── STICKY BAR ── */}
      {!emailSent && (
        <div
          className={`sticky-bar${stickyVisible ? " visible" : ""}${stickyHidden ? " hide" : ""}`}
        >
          <span className="sticky-text">3 bottles · $2.99 each · Free shipping</span>
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
.section { display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; }

/* HERO: 감정→선언→비교 */
.section--hero {
  min-height: 100vh; min-height: 100svh;
  justify-content: flex-end;
  padding: 60px 24px 48px;
}
.hero-content {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; width: 100%; max-width: 440px;
}

/* ① 감정 bridge */
.emotion-bridge {
  font-size: 15px; color: #71717a; line-height: 1.6;
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
  border: 1px solid rgba(255,255,255,0.04);
  opacity: 0.6;
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
  color: #52525b; letter-spacing: -0.03em;
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
  margin-bottom: 16px;
}

/* benefit bridge */
.hero-benefit {
  font-size: 15px; color: #a1a1aa; line-height: 1.6;
  font-style: italic;
  margin-bottom: 0;
}

/* ── CTA Section ── */
.section--cta {
  padding: 16px 24px 60px;
}
.cta-content {
  width: 100%; max-width: 440px;
  display: flex; flex-direction: column; align-items: center;
  text-align: center;
}

/* Email box */
.email-box { width: 100%; text-align: center; }
.email-offer {
  font-size: 15px; font-weight: 700; color: #D4FF2B;
  margin-bottom: 4px; letter-spacing: 0.01em;
}
.email-tagline {
  font-size: 12px; color: #52525b; margin-bottom: 16px;
  letter-spacing: 0.04em; text-transform: uppercase;
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
  align-items: center; gap: 8px; padding: 16px;
}
.success-msg .check {
  width: 48px; height: 48px; border-radius: 50%;
  background: rgba(212,255,43,0.1);
  display: flex; align-items: center; justify-content: center;
  font-size: 24px;
}
.success-msg p { font-size: 15px; color: #a1a1aa; }
.success-msg strong { color: #D4FF2B; font-weight: 700; }

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

/* ── Mobile ── */
@media (max-width: 480px) {
  .section--hero {
    padding: 48px 20px 32px;
    min-height: 100vh; min-height: 100svh;
  }
  .hero-content { max-width: 100%; }
  .emotion-bridge { font-size: 13px; margin-bottom: 12px; }
  .hero-headline {
    font-size: clamp(22px, 6.2vw, 28px);
    margin-bottom: 12px; line-height: 1.25;
  }
  .compare-cards { flex-direction: column; gap: 8px; }
  .ccard {
    padding: 12px 14px; flex-direction: row;
    justify-content: space-between; align-items: center;
  }
  .ccard-num { font-size: 28px; }
  .ccard-label { font-size: 9px; }
  .ccard-sub { font-size: 10px; }
  .hero-closer { font-size: 14px; }
  .hero-claims { font-size: 11px; }
  .hero-benefit { font-size: 13px; }
  .section--cta { padding: 16px 20px 32px; }
  .cta-content { max-width: 100%; }
  .email-offer { font-size: 13px; }
  .email-tagline { font-size: 10px; margin-bottom: 12px; }
  .email-row { gap: 6px; }
  .email-input { padding: 11px 12px; font-size: 13px; border-radius: 10px; }
  .email-btn { padding: 11px 18px; font-size: 13px; border-radius: 10px; }
  .email-fine { font-size: 10px; margin-top: 2px; }
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
