// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/page.tsx
// 📌 역할: / 메인 티저 페이지 (3-Scroll: Empathy → Compare → Offer)
// 📌 API: /api/subscribe (Supabase + Klaviyo 서버사이드)
// 📌 트래킹: lib/ga4-main.ts (GA4 + Meta Pixel + TikTok + Supabase)
//
// ✅ 최종 변경사항 (기존 HTML 대비):
//   1. Screen 1 카피: "Ever had a protein drink that felt off right after?"
//   2. Lime (#D4FF2B) 컬러: 버튼, 가격, 핵심 숫자, border
//   3. Sticky bottom CTA bar 추가 (50vh 후 표시, Screen 3 + 제출 후 숨김)
//   4. Cashback 문구 포함 ("Love it? $2.99 back on your first 6-pack.")
//   5. /api/subscribe 서버사이드 연결 (Klaviyo API key 보안)
//   6. ga4-main.ts 통합 트래킹 (GA4+Meta+TikTok+Supabase)
//   7. Enter key 제출 지원
//   8. 100svh fallback (100vh)
// ═══════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  const [scrollCueVisible, setScrollCueVisible] = useState(true);

  const emailRef = useRef<HTMLInputElement>(null);
  const screen3Ref = useRef<HTMLElement>(null);
  const stickyShownRef = useRef(false);
  const emailFocusTracked = useRef(false);

  // ─── Page View ───
  useEffect(() => {
    track.pageView();
  }, []);

  // ─── Scroll Reveal ───
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

  // ─── Sticky Bar: Screen 3 감지 ───
  useEffect(() => {
    const el = screen3Ref.current;
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
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ─── Sticky Bar: 50vh 스크롤 후 표시 + scroll cue 숨김 ───
  useEffect(() => {
    const onScroll = () => {
      if (!stickyShownRef.current && window.scrollY > window.innerHeight * 0.5) {
        stickyShownRef.current = true;
        setStickyVisible(true);
        track.scrollDepth("50vh");
      }
      if (scrollCueVisible && window.scrollY > 100) {
        setScrollCueVisible(false);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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
    track.stickyClick();
    screen3Ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <style>{CSS}</style>

      {/* ── SCREEN 1: EMPATHY ── */}
      <section className="section" id="screen1">
        <h1 className="hero-headline reveal">
          Ever had a protein drink
          <br />
          that felt off right after?
        </h1>
        <p className="hero-sensory reveal" style={{ transitionDelay: "0.15s" }}>
          That chalky taste. That heavy gut feeling.
          <br />
          Something off you can&apos;t quite name.
        </p>
        <p className="hero-confirm reveal" style={{ transitionDelay: "0.3s" }}>
          You&apos;re not imagining it.
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
        <div className="compare-stats reveal" style={{ transitionDelay: "0.15s" }}>
          <p className="compare-most">Most have 15+.</p>
          <p className="compare-seven">This one has 7.</p>
        </div>
        <div className="compare-details reveal" style={{ transitionDelay: "0.3s" }}>
          Same 30g protein. Smaller bottle.
          <br />
          No artificial sweeteners. Dairy free.
        </div>
      </section>

      {/* ── SCREEN 3: OFFER ── */}
      <section
        className="section section--offer"
        id="screen3"
        ref={screen3Ref}
      >
        <div className="offer-box reveal">
          <p className="offer-was">$13.47</p>
          <p className="offer-price">$2.99</p>
          <p className="offer-detail">3 packs · Free shipping · No commitment</p>
          <p className="offer-cashback">Love it? $2.99 back on your first 6-pack.</p>

          {!emailSent ? (
            <div className="form-area">
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
              {emailError && <p className="email-error">{emailError}</p>}
              <p className="offer-fine">Cancel anytime. No strings.</p>
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

      {/* ── STICKY BOTTOM CTA BAR ── */}
      <div
        className={`sticky-bar${stickyVisible ? " visible" : ""}${stickyHidden ? " hide" : ""}`}
      >
        <div className="sticky-info">
          <span className="sticky-price">$2.99</span>
          <span className="sticky-detail">3 packs · Free shipping</span>
        </div>
        <button className="sticky-btn" onClick={scrollToOffer}>
          Try it →
        </button>
      </div>

      {/* ── FOOTER ── */}
      <footer className="site-footer">
        <div className="footer-brand">PIILK™ BY ARMORED FRESH</div>
        <div className="footer-desc">RTD High Protein Shake.</div>
        <div className="footer-copy">© 2026 Armoredfresh Inc.</div>
      </footer>
    </>
  );
}

// ═══════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════

const CSS = `
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

/* ── Screen 1: Empathy ── */
.hero-headline {
  font-size: clamp(26px, 7vw, 42px);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: #fff;
  margin-bottom: 24px;
}
.hero-sensory {
  font-size: clamp(15px, 4vw, 18px);
  color: #a1a1aa;
  line-height: 1.7;
  max-width: 340px;
  margin-bottom: 28px;
}
.hero-confirm {
  font-size: clamp(16px, 4.2vw, 20px);
  font-weight: 600;
  color: #fff;
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
  color: #71717a;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.scroll-cue .arrow {
  width: 20px; height: 20px;
  border-right: 1.5px solid #71717a;
  border-bottom: 1.5px solid #71717a;
  transform: rotate(45deg);
  animation: bounce 2s infinite;
}
@keyframes bounce {
  0%, 100% { transform: rotate(45deg) translateY(0); }
  50% { transform: rotate(45deg) translateY(6px); }
}

/* ── Screen 2: Compare ── */
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
  color: #a1a1aa;
  margin-bottom: 8px;
}
.compare-seven {
  font-size: clamp(32px, 9vw, 52px);
  font-weight: 800;
  color: #D4FF2B;
  letter-spacing: -0.03em;
  line-height: 1.1;
}
.compare-details {
  font-size: clamp(14px, 3.6vw, 16px);
  color: #a1a1aa;
  line-height: 1.8;
}

/* ── Screen 3: Offer ── */
.offer-box {
  width: 100%;
  max-width: 380px;
  background: #111113;
  border: 1px solid rgba(212,255,43,0.15);
  border-radius: 16px;
  padding: 32px 24px 28px;
  text-align: center;
  margin: 0 auto 20px;
}
.offer-was {
  font-size: 14px;
  color: #71717a;
  text-decoration: line-through;
  margin-bottom: 4px;
}
.offer-price {
  font-size: clamp(36px, 10vw, 52px);
  font-weight: 800;
  color: #D4FF2B;
  letter-spacing: -0.03em;
  line-height: 1;
  margin-bottom: 6px;
}
.offer-detail {
  font-size: 15px;
  color: #a1a1aa;
  margin-bottom: 4px;
}
.offer-cashback {
  font-size: 13px;
  color: #71717a;
  margin-bottom: 24px;
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
  background: #0a0a0b;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 15px;
  color: #f4f4f5;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.email-input::placeholder { color: #3f3f46; }
.email-input:focus { border-color: rgba(212,255,43,0.3); }

.email-btn {
  padding: 14px 20px;
  background: #D4FF2B;
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
  color: #3f3f46;
  max-width: 300px;
  margin: 0 auto;
}

/* Success */
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

/* ── Sticky Bottom CTA Bar ── */
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
  align-items: baseline;
  gap: 8px;
}
.sticky-price {
  font-size: 20px;
  font-weight: 800;
  color: #D4FF2B;
  letter-spacing: -0.02em;
}
.sticky-detail {
  font-size: 12px;
  color: #71717a;
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

/* ── Fade-in ── */
.reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.7s ease, transform 0.7s ease;
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}

/* ── Footer ── */
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
  .sticky-bar { padding: 10px 16px; gap: 10px; }
  .sticky-price { font-size: 18px; }
  .sticky-detail { font-size: 11px; }
  .sticky-btn { padding: 10px 16px; font-size: 13px; }
}
`;
