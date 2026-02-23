// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/page.tsx — V4 (Label Journey: Flip It)
// 📌 역할: / 메인 티저 페이지 — 인터랙티브 라벨 발견 여정
// 📌 API: /api/subscribe (Supabase + Klaviyo 서버사이드) — 변경 없음
// 📌 트래킹: lib/ga4-main.ts (GA4 + Meta Pixel + TikTok + Supabase) — 이벤트명 유지
//
// ✅ V3.1 → V4 변경사항 (디자인만 변경, 인프라 변경 없음):
//   1. 구조: 스크롤 reveal → 인터랙티브 3단계 (공감 → Flip → PIILK reveal)
//   2. Hero: 텍스트 + IntersectionObserver → 탭 가능한 Flip 버튼
//   3. Flip 시 성분 15개 카운팅 애니메이션 (하나씩 등장)
//   4. 카운팅 완료 → "What if it only took 7?" CTA → PIILK 비교 화면
//   5. 5초 후 Flip 안 누른 유저용 fallback "or scroll to see ↓"
//   6. 법적: Gellan Gum, Cellulose Gum 태그 삭제, "All for 30g" 삭제
//   7. 모든 track/API 호출, body 구조, 에러 핸들링 100% 유지
//   8. Sticky bar 로직 100% 유지
//   9. 혜택/오퍼: "Get early access · 3 bottles · Free shipping" 유지
//  10. Nav: "NYC · March 2026" 유지
//
// 🔒 변경하지 않은 것들:
//   - import { track } from "@/lib/ga4-main" → 동일
//   - fetch("/api/subscribe") → 동일
//   - body: { email, source: "main_teaser", tracking } → 동일
//   - track.pageView(), track.emailSubmit(), track.emailFocus(),
//     track.scrollDepth(), track.stickyClick() → 동일
//   - Image src="/pillk-logo.png" → 동일
//   - 에러 메시지: invalid_email, already_exists → 동일
//   - Footer: PIILK™ BY ARMORED FRESH, © 2026 Armoredfresh Inc. → 동일
// ═══════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { track } from "@/lib/ga4-main";

// ─────────────────────────────────────────────────────────────
// Utils (기존 V3.1과 동일)
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
  // ─── Stage: empathy → counting → reveal ───
  const [stage, setStage] = useState<"empathy" | "counting" | "reveal">(
    "empathy"
  );
  const [visibleCount, setVisibleCount] = useState(0);
  const [countDone, setCountDone] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  // ─── Email state (기존 V3.1과 동일) ───
  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [stickyVisible, setStickyVisible] = useState(false);
  const [stickyHidden, setStickyHidden] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const emailSectionRef = useRef<HTMLDivElement>(null);
  const stickyShownRef = useRef(false);
  const emailFocusTracked = useRef(false);
  const flipTracked = useRef(false);

  // ─── Page View (기존 V3.1과 동일) ───
  useEffect(() => {
    track.pageView();
  }, []);

  // ─── 5초 후 fallback 표시 (Flip 안 누르는 유저 구제) ───
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
    const timer = setTimeout(
      () => setVisibleCount((v) => v + 1),
      120
    );
    return () => clearTimeout(timer);
  }, [stage, visibleCount]);

  // ─── Sticky Bar: email section 벗어나면 표시 (기존 V3.1 로직 동일) ───
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

  // ─── Sticky Bar: 스크롤 후 표시 (기존 V3.1 로직 동일) ───
  useEffect(() => {
    if (stage !== "reveal") return;
    const onScroll = () => {
      if (
        !stickyShownRef.current &&
        window.scrollY > window.innerHeight * 0.5
      ) {
        stickyShownRef.current = true;
        setStickyVisible(true);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [stage]);

  // ─── Flip handler ───
  const handleFlip = () => {
    if (!flipTracked.current) {
      flipTracked.current = true;
      // 기존 track.scrollDepth 재활용: "flip_bottle" 이벤트
      track.scrollDepth("flip_bottle");
    }
    setStage("counting");
    setVisibleCount(0);
    setCountDone(false);
  };

  // ─── "What if 7?" → Reveal handler ───
  const handleReveal = () => {
    // 기존 track.scrollDepth 재활용: "comparison" 이벤트 (V3.1과 동일 이벤트명)
    track.scrollDepth("comparison");
    setStage("reveal");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ─── Email Submit (API 경로 + body 구조 + 에러 핸들링 100% V3.1 동일) ───
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

  const scrollToEmail = () => {
    track.stickyClick();
    emailSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <style>{CSS}</style>

      {/* ── NAV (V3.1과 동일) ── */}
      <nav className="nav">
        <a
          className="nav-logo"
          onClick={() => {
            setStage("empathy");
            setShowFallback(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setStage("empathy");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
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

      {/* ════════════════════════════════════════════
          STAGE 1: EMPATHY — "You felt it" + Flip button
          ════════════════════════════════════════════ */}
      {stage === "empathy" && (
        <section className="section section--full">
          <div className="empathy-content">
            <p className="empathy-badge anim-up">PIILK™</p>

            <h1 className="empathy-headline anim-up d1">You felt it.</h1>

            <p className="empathy-sub anim-up d2">
              That something after your protein shake.
              <br />
              You&apos;re not alone.
            </p>

            {/* THE FLIP BUTTON */}
            <button className="flip-btn anim-up d3" onClick={handleFlip}>
              <span className="flip-icon">🔄</span>
              <span className="flip-text">Flip your bottle over.</span>
              <span className="flip-hint">
                tap to see what&apos;s on the back
              </span>
            </button>

            {/* Fallback: 5초 후 표시 — Flip 안 누르는 유저 구제 */}
            <div
              className={`fallback-cta ${showFallback ? "visible" : ""}`}
            >
              <span className="fallback-or">or just </span>
              <button
                className="fallback-link"
                onClick={() => {
                  track.scrollDepth("skip_to_reveal");
                  setStage("reveal");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                get early access →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════
          STAGE 2: COUNTING — 성분 하나씩 등장 + 카운터
          ════════════════════════════════════════════ */}
      {stage === "counting" && (
        <section className="section section--full">
          <div className="counting-content">
            <p className="counting-label">THE BACK OF THE LABEL</p>

            <div className="counting-number">
              {countDone
                ? COMPETITOR_INGREDIENTS.length
                : visibleCount}
            </div>
            <p className="counting-unit">
              {visibleCount < COMPETITOR_INGREDIENTS.length
                ? "counting..."
                : "ingredients"}
            </p>

            {/* 성분 태그 월 — 전부 중립 회색 (법적: 색상 구분 없음) */}
            <div className="ingredient-wall">
              {COMPETITOR_INGREDIENTS.slice(0, visibleCount).map(
                (ing, i) => (
                  <span key={i} className="ing-tag">
                    {ing}
                  </span>
                )
              )}
            </div>

            {/* 카운팅 완료 후 */}
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
          STAGE 3: REVEAL — PIILK 비교 + Email CTA
          ════════════════════════════════════════════ */}
      {stage === "reveal" && (
        <>
          <section className="section section--reveal">
            {/* 비교 카드 */}
            <div className="compare-cards anim-up">
              <div className="ccard ccard--dim">
                <span className="ccard-label">MOST SHAKES</span>
                <span className="ccard-num">15+</span>
                <span className="ccard-sub">ingredients · 11.5 oz</span>
              </div>
              <div className="ccard ccard--piilk">
                <span className="ccard-label">PIILK™</span>
                <span className="ccard-num accent">7</span>
                <span className="ccard-sub">ingredients · 8.5 oz</span>
              </div>
            </div>

            <h2 className="reveal-headline anim-up d1">
              Same 30g protein.
            </h2>
            <p className="reveal-sub anim-up d1">
              No artificial sweeteners. No emulsifiers.
              <br />
              No carrageenan. Dairy free.
            </p>

            {/* Stat Row (V3.1과 동일 구조) */}
            <div className="stat-row anim-up d2">
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
                <div className="stat-num accent">
                  8.5<span className="stat-unit">oz</span>
                </div>
                <div className="stat-label">smaller bottle</div>
              </div>
            </div>

            <p className="reveal-closer anim-up d2">
              We kept the protein. Removed the rest.
            </p>

            {/* Email CTA (V3.1 오퍼 동일: "Get early access · 3 bottles · Free shipping") */}
            <div className="email-section anim-up d3" ref={emailSectionRef}>
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
          </section>

          {/* ── STICKY BOTTOM CTA BAR (V3.1과 동일) ── */}
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
        </>
      )}

      {/* ── FOOTER (V3.1과 동일) ── */}
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
// CSS — V4
// ═══════════════════════════════════════════

const CSS = `
/* ── Reset ── */
* { margin: 0; padding: 0; box-sizing: border-box; }

/* ── Nav (V3.1 동일) ── */
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
.nav-logo { display: flex; align-items: center; }
.nav-right {
  font-size: 11px;
  color: #71717a;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ═════ SECTIONS ═════ */
.section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
}
.section--full {
  min-height: 100vh;
  min-height: 100svh;
  justify-content: center;
  padding: 80px 24px 40px;
}
.section--reveal {
  padding: 100px 24px 60px;
  gap: 0;
}

/* ═════ STAGE 1: EMPATHY ═════ */
.empathy-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.empathy-badge {
  font-size: 12px;
  color: #D4FF2B;
  letter-spacing: 0.15em;
  font-weight: 600;
  margin-bottom: 24px;
}
.empathy-headline {
  font-size: clamp(30px, 8vw, 44px);
  font-weight: 800;
  color: #fff;
  line-height: 1.1;
  letter-spacing: -0.03em;
  margin-bottom: 16px;
}
.empathy-sub {
  font-size: 16px;
  color: #71717a;
  line-height: 1.6;
  margin-bottom: 36px;
}

/* ── Flip Button ── */
.flip-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 2px solid rgba(255,255,255,0.1);
  border-radius: 18px;
  padding: 24px 32px;
  cursor: pointer;
  transition: all 0.3s;
  margin-bottom: 24px;
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}
.flip-btn:hover, .flip-btn:active {
  border-color: #D4FF2B;
  background: rgba(212,255,43,0.04);
}
.flip-icon {
  font-size: 32px;
  display: inline-block;
  animation: spinPause 4s ease-in-out infinite;
}
@keyframes spinPause {
  0% { transform: rotate(0deg); }
  15% { transform: rotate(360deg); }
  100% { transform: rotate(360deg); }
}
.flip-text {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}
.flip-hint {
  font-size: 13px;
  color: #71717a;
}

/* ── Fallback CTA (5초 후 fade in) ── */
.fallback-cta {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.6s, transform 0.6s;
  pointer-events: none;
}
.fallback-cta.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.fallback-or {
  font-size: 12px;
  color: #52525b;
}
.fallback-link {
  font-size: 12px;
  color: rgba(212,255,43,0.5);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  font-family: inherit;
  padding: 0;
}
.fallback-link:hover { color: #D4FF2B; }

/* ═════ STAGE 2: COUNTING ═════ */
.counting-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  max-width: 440px;
}
.counting-label {
  font-size: 12px;
  color: #52525b;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  margin-bottom: 12px;
}
.counting-number {
  font-size: clamp(52px, 14vw, 72px);
  font-weight: 800;
  color: #fff;
  line-height: 1;
  letter-spacing: -0.04em;
}
.counting-unit {
  font-size: 14px;
  color: #71717a;
  margin-bottom: 20px;
}

/* ── Ingredient Wall ── */
.ingredient-wall {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-bottom: 24px;
  min-height: 60px;
}
.ing-tag {
  font-size: 11px;
  padding: 5px 10px;
  border-radius: 6px;
  background: rgba(255,255,255,0.04);
  color: #71717a;
  border: 1px solid rgba(255,255,255,0.06);
  animation: tagIn 0.25s ease-out both;
}
@keyframes tagIn {
  from { opacity: 0; transform: scale(0.9) translateY(4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* ── Count Done ── */
.count-done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.count-done-text {
  font-size: 15px;
  color: #a1a1aa;
  line-height: 1.7;
}

/* ── Reveal Button ── */
.reveal-btn {
  padding: 16px 36px;
  background: #D4FF2B;
  color: #000;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.reveal-btn:hover { opacity: 0.9; }
.reveal-btn:active { transform: scale(0.97); }

/* ═════ STAGE 3: REVEAL ═════ */
.compare-cards {
  display: flex;
  gap: 12px;
  width: 100%;
  max-width: 400px;
  margin-bottom: 28px;
}
.ccard {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 18px 12px;
  border-radius: 14px;
  text-align: center;
}
.ccard--dim {
  background: #111113;
  border: 1px solid rgba(255,255,255,0.04);
  opacity: 0.6;
}
.ccard--piilk {
  background: rgba(212,255,43,0.04);
  border: 2px solid rgba(212,255,43,0.2);
}
.ccard-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.ccard--dim .ccard-label { color: #52525b; }
.ccard--piilk .ccard-label { color: #D4FF2B; }
.ccard-num {
  font-size: 36px;
  font-weight: 800;
  color: #52525b;
  letter-spacing: -0.03em;
}
.ccard-num.accent { color: #D4FF2B; }
.ccard-sub { font-size: 11px; color: #52525b; }

.reveal-headline {
  font-size: clamp(22px, 6vw, 30px);
  font-weight: 800;
  color: #fff;
  margin-bottom: 10px;
  letter-spacing: -0.02em;
}
.reveal-sub {
  font-size: 14px;
  color: #a1a1aa;
  line-height: 1.7;
  margin-bottom: 24px;
}

/* ── Stat Row (V3.1 동일) ── */
.stat-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-bottom: 20px;
}
.stat { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.stat-num {
  font-size: clamp(32px, 8vw, 48px);
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.03em;
  line-height: 1;
}
.stat-num.accent { color: #D4FF2B; }
.stat-unit { font-size: 0.5em; font-weight: 600; }
.stat-label { font-size: 12px; color: #71717a; letter-spacing: 0.04em; }
.stat-divider { width: 1px; height: 40px; background: rgba(255,255,255,0.08); }

.reveal-closer {
  font-size: 15px;
  color: #D4FF2B;
  font-weight: 600;
  margin-bottom: 32px;
}

/* ── Email Section (V3.1 동일) ── */
.email-section { width: 100%; max-width: 440px; }
.email-box { text-align: center; }
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
  -webkit-tap-highlight-color: transparent;
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

/* ── Success (V3.1 동일) ── */
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

/* ── Sticky Bar (V3.1 동일) ── */
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
.sticky-info { display: flex; align-items: center; gap: 8px; }
.sticky-text { font-size: 14px; color: #a1a1aa; font-weight: 500; }
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
  -webkit-tap-highlight-color: transparent;
}
.sticky-btn:hover { opacity: 0.9; }
.sticky-btn:active { transform: scale(0.97); }

/* ── Animations ── */
.anim-up {
  animation: fadeUp 0.7s ease both;
}
.d1 { animation-delay: 0.1s; }
.d2 { animation-delay: 0.2s; }
.d3 { animation-delay: 0.3s; }
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Footer (V3.1 동일) ── */
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
.footer-desc { font-size: 12px; color: #71717a; }
.footer-copy { font-size: 11px; color: #3f3f46; margin-top: 4px; }

/* ── Mobile (V3.1 동일 + 추가) ── */
@media (max-width: 480px) {
  .section--full { padding: 72px 20px 32px; }
  .section--reveal { padding: 80px 20px 48px; }
  .stat-row { gap: 14px; }
  .stat-num { font-size: clamp(28px, 7vw, 36px); }
  .stat-divider { height: 32px; }
  .email-row { flex-direction: column; }
  .email-btn { width: 100%; }
  .flip-btn { padding: 20px 24px; }
  .compare-cards { flex-direction: column; gap: 8px; }
  .ccard { padding: 14px; flex-direction: row; justify-content: space-between; }
  .sticky-bar { padding: 10px 16px; gap: 10px; }
  .sticky-text { font-size: 13px; }
  .sticky-btn { padding: 10px 16px; font-size: 13px; }
}
`;
