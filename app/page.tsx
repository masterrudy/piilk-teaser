// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/page.tsx
// 📌 역할: / 메인 티저 페이지 (3-Scroll Empathy → Compare → Offer)
// 📌 플로우: Screen 1 (감각 공감) → Screen 2 (성분 비교) → Screen 3 (이메일 수집)
// 📌 API: /api/subscribe (Supabase + Klaviyo 서버사이드)
//
// ✅ HTML → Next.js 전환사항:
//   1. HTML piilk-main-teaser.html 디자인 100% 재현
//   2. /api/subscribe 서버사이드 Klaviyo 연결 (API key 보안)
//   3. ga4-main.ts 통합 트래킹 (GA4 + Meta Pixel + TikTok Pixel)
//   4. Supabase 내부 대시보드 이벤트 전송
//   5. 세션 관리 (visitor_id + session_id)
//   6. UTM 파라미터 수집
//   7. Sticky bottom CTA bar (50vh scroll 후 표시, Screen 3 + 제출 후 숨김)
//   8. Cashback 문구 제거 완료
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
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════

export default function MainTeaser() {
  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [stickyVisible, setStickyVisible] = useState(false);
  const [stickyHidden, setStickyHidden] = useState(false);
  const [scrollCueVisible, setScrollCueVisible] = useState(true);

  const emailRef = useRef<HTMLInputElement>(null);
  const screen3Ref = useRef<HTMLDivElement>(null);
  const stickyShownRef = useRef(false);
  const emailFocusTracked = useRef(false);

  // ─── Page View Tracking ───
  useEffect(() => {
    track.pageView();
  }, []);

  // ─── Scroll Reveal (IntersectionObserver) ───
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

  // ─── Sticky Bar: hide when Screen 3 visible ───
  useEffect(() => {
    const screen3 = screen3Ref.current;
    if (!screen3) return;

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
      { threshold: 0.2 }
    );
    obs.observe(screen3);
    return () => obs.disconnect();
  }, []);

  // ─── Sticky Bar: show after 50vh scroll + hide scroll cue ───
  useEffect(() => {
    const handleScroll = () => {
      if (
        !stickyShownRef.current &&
        window.scrollY > window.innerHeight * 0.5
      ) {
        stickyShownRef.current = true;
        setStickyVisible(true);
        track.scrollDepth("50vh");
      }
      if (scrollCueVisible && window.scrollY > 100) {
        setScrollCueVisible(false);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [scrollCueVisible]);

  // ─── Email Submit ───
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
        // Sticky bar 숨김
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
  }, []);

  const scrollToOffer = () => {
    screen3Ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      {/* ===== CSS ===== */}
      <style>{mainTeaserCSS}</style>

      {/* ── NAV BAR WITH LOGO ── */}
      <nav className="nav">
        <a className="nav-logo" href="/">
          <Image
            src="/pillk-logo.png"
            alt="PIILK"
            width={72}
            height={28}
            style={{ display: "block" }}
            priority
          />
        </a>
        <span className="nav-right">by Armored Fresh</span>
      </nav>

      <div className="page-content">
        {/* ── SCREEN 1: EMPATHY ── */}
        <section className="section" id="screen1">
          <div className="hero-stat reveal">
            <span className="hero-stat-num">15+</span>
            <span className="hero-stat-label">ingredients in your protein shake</span>
          </div>
          <h1 className="hero-headline reveal" style={{ transitionDelay: "0.1s" }}>
            You don&apos;t know
            <br />
            what you&apos;re drinking.
          </h1>
          <p
            className="hero-sensory reveal"
            style={{ transitionDelay: "0.2s" }}
          >
            That chalky taste. That heavy gut.
            <br />
            That weird feeling after every shake.
            <br />
            <strong className="hero-punchline">That&apos;s not protein. That&apos;s the other 14.</strong>
          </p>
          <div
            className="scroll-cue"
            style={{ opacity: scrollCueVisible ? 0.4 : 0 }}
          >
            <span>scroll</span>
            <div className="arrow" />
          </div>
        </section>

        {/* ── SCREEN 2: FLIP THE BOTTLE ── */}
        <section className="section" id="screen2">
          <p className="compare-prompt reveal">
            Flip your protein shake over.
            <br />
            Count the ingredients.
          </p>
          <div
            className="compare-stats reveal"
            style={{ transitionDelay: "0.15s" }}
          >
            <p className="compare-most">Most have 15+.</p>
            <p className="compare-seven">This one has 7.</p>
          </div>
          <div
            className="compare-details reveal"
            style={{ transitionDelay: "0.3s" }}
          >
            Same 30g protein. Smaller bottle.
            <br />
            No artificial sweeteners. Dairy free.
          </div>
        </section>

        {/* ── SCREEN 3: OFFER ── */}
        <section className="section section--offer" id="screen3" ref={screen3Ref}>
          <div className="offer-box reveal">
            <p className="offer-was">$13.47</p>
            <p className="offer-price">$2.99</p>
            <p className="offer-detail">
              3 packs · Free shipping · No commitment
            </p>
            <div className={`form-area ${emailSent ? "submitted" : ""}`}>
              <div className="email-row">
                <input
                  ref={emailRef}
                  className="email-input"
                  type="email"
                  placeholder="your@email.com"
                  autoComplete="email"
                  inputMode="email"
                  required
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitEmail();
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
                  onClick={submitEmail}
                  disabled={emailLoading}
                >
                  {emailLoading ? "..." : "Try it"}
                </button>
              </div>
              {emailError && (
                <div className="email-error">{emailError}</div>
              )}
              <p className="offer-fine">Cancel anytime. No strings.</p>
              <div className="success-msg show">
                <div className="check">✓</div>
                <p>
                  <strong>You&apos;re in.</strong>
                </p>
                <p>We&apos;ll reach out when it&apos;s ready.</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── STICKY BOTTOM CTA BAR ── */}
      <div
        className={`sticky-bar ${stickyVisible ? "visible" : ""} ${stickyHidden ? "hide" : ""}`}
      >
        <div className="sticky-info">
          <span className="sticky-price">$2.99</span>
          <span className="sticky-detail">3 packs · Free shipping</span>
        </div>
        <button className="sticky-btn" onClick={scrollToOffer}>
          Try it →
        </button>
      </div>

      <footer className="main-footer">
        <Image
          src="/pillk-logo.png"
          alt="PIILK"
          width={64}
          height={24}
          style={{ display: "block", margin: "0 auto 12px", opacity: 0.4 }}
        />
        <div className="footer-brand">PIILK™ BY ARMORED FRESH</div>
        <div className="footer-tagline">RTD High Protein Shake.</div>
        <div className="footer-copy">© 2026 Armoredfresh Inc.</div>
      </footer>
    </>
  );
}

// ═══════════════════════════════════════════
// CSS (Inline — mirrors piilk-main-teaser.html exactly)
// ═══════════════════════════════════════════

const mainTeaserCSS = `
/* ===== NAV BAR ===== */
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: transparent;
}
.nav-logo {
  cursor: pointer;
  text-decoration: none;
}
.nav-right {
  font-size: 11px;
  color: var(--t3);
  letter-spacing: 0.04em;
}

/* ===== SECTIONS ===== */
.section {
  min-height: 100vh;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 60px 24px;
  text-align: center;
  position: relative;
}
.section--offer {
  min-height: auto;
  padding: 48px 24px 120px;
}

/* ===== SCREEN 1: IMPACT HERO ===== */
.hero-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24px;
}
.hero-stat-num {
  font-size: clamp(56px, 16vw, 88px);
  font-weight: 900;
  color: var(--lime);
  letter-spacing: -0.04em;
  line-height: 1;
}
.hero-stat-label {
  font-size: clamp(12px, 3.2vw, 14px);
  color: var(--t3);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-top: 6px;
}

.hero-headline {
  font-size: clamp(26px, 7vw, 42px);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: #fff;
  margin-bottom: 20px;
}

.hero-sensory {
  font-size: clamp(15px, 4vw, 18px);
  color: var(--t2);
  line-height: 1.8;
  max-width: 340px;
  margin-bottom: 0;
}
.hero-punchline {
  display: block;
  color: #fff;
  font-weight: 600;
  margin-top: 12px;
  font-size: clamp(16px, 4.2vw, 20px);
}

.scroll-cue {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: opacity 0.5s;
}
.scroll-cue span {
  font-size: 11px;
  color: var(--t3);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.scroll-cue .arrow {
  width: 20px;
  height: 20px;
  border-right: 1.5px solid var(--t3);
  border-bottom: 1.5px solid var(--t3);
  transform: rotate(45deg);
  animation: bounce 2s infinite;
}
@keyframes bounce {
  0%, 100% { transform: rotate(45deg) translateY(0); }
  50% { transform: rotate(45deg) translateY(6px); }
}

/* ===== SCREEN 2: FLIP THE BOTTLE ===== */
.compare-prompt {
  font-size: clamp(18px, 5vw, 26px);
  font-weight: 600;
  color: #fff;
  line-height: 1.3;
  margin-bottom: 32px;
}
.compare-stats { margin-bottom: 28px; }
.compare-most {
  font-size: clamp(14px, 3.8vw, 17px);
  color: var(--t2);
  margin-bottom: 8px;
}
.compare-seven {
  font-size: clamp(32px, 9vw, 52px);
  font-weight: 800;
  color: var(--lime);
  letter-spacing: -0.03em;
  line-height: 1.1;
}
.compare-details {
  font-size: clamp(14px, 3.6vw, 16px);
  color: var(--t2);
  line-height: 1.8;
}

/* ===== SCREEN 3: OFFER ===== */
.offer-box {
  width: 100%;
  max-width: 380px;
  background: var(--card);
  border: 1px solid rgba(212,255,43,0.15);
  border-radius: 16px;
  padding: 32px 24px 28px;
  text-align: center;
  margin: 0 auto 20px;
}
.offer-was {
  font-size: 14px;
  color: var(--t3);
  text-decoration: line-through;
  margin-bottom: 4px;
}
.offer-price {
  font-size: clamp(36px, 10vw, 52px);
  font-weight: 800;
  color: var(--lime);
  letter-spacing: -0.03em;
  line-height: 1;
  margin-bottom: 6px;
}
.offer-detail {
  font-size: 15px;
  color: var(--t2);
  margin-bottom: 20px;
}

/* Email form */
.email-row {
  display: flex;
  gap: 8px;
  max-width: 340px;
  margin: 0 auto 12px;
}
.email-input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 15px;
  color: var(--t1);
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.email-input::placeholder { color: var(--t4); }
.email-input:focus { border-color: rgba(212,255,43,0.3); }

.email-btn {
  padding: 14px 20px;
  background: var(--lime);
  color: #000;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
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

.offer-fine {
  font-size: 12px;
  color: var(--t4);
  max-width: 300px;
  margin: 0 auto;
}

/* ===== SUCCESS STATE ===== */
.success-msg {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
}
.success-msg.show { display: flex; }
.success-msg .check {
  width: 48px; height: 48px;
  border-radius: 50%;
  background: rgba(212,255,43,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
.success-msg p {
  font-size: 15px;
  color: var(--t2);
}
.success-msg strong {
  color: var(--lime);
  font-weight: 700;
}

.form-area .success-msg { display: none; }
.form-area.submitted .email-row { display: none; }
.form-area.submitted .offer-fine { display: none; }
.form-area.submitted .email-error { display: none; }
.form-area.submitted .success-msg { display: flex; }

/* ===== STICKY BOTTOM CTA BAR ===== */
.sticky-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
  background: rgba(10,10,11,0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid var(--border);
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  transform: translateY(100%);
  transition: transform 0.4s ease;
}
.sticky-bar.visible {
  transform: translateY(0);
}
.sticky-bar.hide {
  transform: translateY(100%);
}
.sticky-info {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.sticky-price {
  font-size: 20px;
  font-weight: 800;
  color: var(--lime);
  letter-spacing: -0.02em;
}
.sticky-detail {
  font-size: 12px;
  color: var(--t3);
}
.sticky-btn {
  padding: 10px 20px;
  background: var(--lime);
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

/* ===== FADE-IN ANIMATION ===== */
.reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.7s ease, transform 0.7s ease;
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}

/* ===== FOOTER ===== */
.main-footer {
  text-align: center;
  padding: 48px 16px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.footer-brand {
  font-size: 13px;
  font-weight: 500;
  color: var(--t3);
  letter-spacing: 0.12em;
  margin-bottom: 4px;
}
.footer-tagline {
  font-size: 13px;
  color: var(--t3);
  margin-bottom: 16px;
}
.footer-copy {
  font-size: 11px;
  color: var(--t4);
}

/* ===== PAGE CONTENT ===== */
.page-content {
  position: relative;
  z-index: 1;
}

/* ===== MOBILE ===== */
@media (max-width: 480px) {
  .sticky-bar { padding: 10px 16px; gap: 10px; }
  .sticky-price { font-size: 18px; }
  .sticky-detail { font-size: 11px; }
  .sticky-btn { padding: 10px 16px; font-size: 13px; }
}
`;
