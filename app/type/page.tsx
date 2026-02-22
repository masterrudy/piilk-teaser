// ═══════════════════════════════════════════════════════════
// 📁 app/type/page.tsx — V14 (Audit V3 기반 전면 개편)
// 📌 Hero → Quiz 3문항 → Result (Compare → Email → Share → Referral → Declaration)
// 📌 API: /api/type-subscribe, /api/type-declarations — 변경 없음
// 📌 Tracking: lib/ga4.ts — 변경 없음
//
// ✅ V13.1 → V14 변경사항 (Audit V3 기반):
//   1. Hero: 질문형 "What happens..." → 선언형 "Everyone reacts differently"
//   2. Hero: 감각 묘사 3줄 삭제
//   3. Hero: 이모지만 → 2x2 그리드 (이모지 + 타입 이름 동시 노출)
//   4. Hero CTA: "What's yours? →" → "Find my type — takes 30 sec"
//   5. Result: 비교 섹션을 Email CTA 위에 삽입 (V-Next에서 미구현된 부분)
//   6. Result: 가격 ($13.47, $2.99) 삭제 — pre-launch 혼란 방지
//   7. Result: Email CTA 문구: "Save your result + get NYC launch access"
//   8. Nav: "by Armored Fresh" → "NYC · March 2026"
// ═══════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  QUIZ_QUESTIONS,
  AFTERFEEL_TYPES,
  DECLARATIONS,
  SHARE_URL,
  getShareText,
  calcAfterfeelType,
  type AfterfeelType,
} from "@/lib/quiz-data";
import { track } from "@/lib/ga4";

// ─────────────────────────────────────────────────────────────
// Utils (기존 100% 유지)
// ─────────────────────────────────────────────────────────────

function safeUUID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("piilk_vid");
  if (!id) {
    id = safeUUID();
    localStorage.setItem("piilk_vid", id);
  }
  return id;
}

function getReferralFromURL(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("ref") || null;
}

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

async function safeCopy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    el.style.top = "-9999px";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function calcQuizProgress(qi: number, total: number): number {
  return Math.round(25 + (qi / total) * 50);
}

// ═══════════════════════════════════════════
// HERO — V14 (선언형 + 타입명 노출 + 시간 CTA)
// ═══════════════════════════════════════════
function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="phase hero-phase">
      <div className="hero-inner">
        {/* V14: 질문 → 선언 */}
        <h1 className="h1 anim-up">
          Everyone reacts differently
          <br />
          to protein shakes.
        </h1>

        <p className="body anim-up d1">
          We found 4 types. Which one are you?
        </p>

        {/* V14: 이모지만 → 2x2 그리드 + 타입 이름 */}
        <div className="hero-type-grid anim-up d2">
          {(Object.entries(AFTERFEEL_TYPES) as [AfterfeelType, typeof AFTERFEEL_TYPES[AfterfeelType]][]).map(
            ([key, t]) => (
              <div className="hero-type-card" key={key}>
                <span className="hero-type-emoji">{t.icon}</span>
                <span className="hero-type-name">{t.name}</span>
              </div>
            )
          )}
        </div>

        {/* V14: CTA에 시간 명시 */}
        <button className="btn-primary anim-up d3" onClick={onStart}>
          Find my type — takes 30 sec
        </button>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// QUIZ (기존 로직 100% 유지 — UI만 미세 조정)
// ═══════════════════════════════════════════
function Quiz({
  onComplete,
  onProgressUpdate,
}: {
  onComplete: (type: AfterfeelType) => void;
  onProgressUpdate: (progress: number) => void;
}) {
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [picked, setPicked] = useState(false);

  const q = QUIZ_QUESTIONS[qi];
  const total = QUIZ_QUESTIONS.length;

  useEffect(() => {
    onProgressUpdate(calcQuizProgress(qi, total));
  }, [qi, total, onProgressUpdate]);

  const pick = (group: string) => {
    if (picked) return;
    setPicked(true);

    // ✅ 기존 track 호출 유지
    track.quizStep(qi + 1, group);

    const next = [...answers, group];
    setAnswers(next);

    setTimeout(() => {
      const isLast = qi + 1 >= total;

      if (!isLast) {
        setQi(qi + 1);
        setPicked(false);
        return;
      }

      // ✅ 기존 calcAfterfeelType 호출 유지
      const result = calcAfterfeelType(next);
      track.quizComplete(result);
      onComplete(result);
    }, 300);
  };

  const pickedAnswer = answers[answers.length - 1];

  return (
    <section className="phase quiz-phase">
      <div className="wrap">
        <div className="quiz-dots">
          {QUIZ_QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`qdot ${i < qi ? "done" : i === qi ? "now" : ""}`}
            />
          ))}
        </div>

        <div className="caption" style={{ marginBottom: 8 }}>
          {qi + 1} of {total}
        </div>

        <h2 className="h2 quiz-q">{q.question}</h2>

        <div className="quiz-opts">
          {q.options.map((o, j) => (
            <div
              key={`${qi}-${j}`}
              className={`qo ${picked && pickedAnswer === o.group ? "pk" : ""}`}
              onClick={() => pick(o.group)}
              style={{
                animation: `up .35s cubic-bezier(.16,1,.3,1) ${j * 0.04}s both`,
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") pick(o.group);
              }}
            >
              <span className="qo-icon">{o.icon}</span>
              <span>{o.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// RESULT — V14 (비교 섹션 추가, 가격 삭제)
// ═══════════════════════════════════════════
function Result({ type }: { type: AfterfeelType }) {
  const t = AFTERFEEL_TYPES[type];

  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [queuePosition, setQueuePosition] = useState(0);

  const [declCounts, setDeclCounts] = useState<Record<string, number>>({});
  const [votedDecls, setVotedDecls] = useState<Set<string>>(new Set());

  const [copied, setCopied] = useState(false);
  const [refCopied, setRefCopied] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const referredBy = useRef<string | null>(null);
  const emailFocusTracked = useRef(false);

  useEffect(() => {
    referredBy.current = getReferralFromURL();
    // ✅ 기존 track.typeResult 호출 유지
    track.typeResult(type);

    // ✅ 기존 declarations API 호출 유지
    fetch("/api/type-declarations")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.declarations) return;
        const counts: Record<string, number> = {};
        data.declarations.forEach(
          (d: { statement_key: string; vote_count: number }) => {
            counts[d.statement_key] = d.vote_count;
          }
        );
        setDeclCounts(counts);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Share (기존 100% 유지) ───
  const doShare = useCallback(
    async (channel: string) => {
      track.shareClick(channel, type);
      const txt = getShareText(t.name);
      const fullUrl = `${txt} ${SHARE_URL}`;

      if (channel === "x") {
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(txt)}&url=${encodeURIComponent(SHARE_URL)}`,
          "_blank"
        );
        return;
      }

      if (channel === "sms") {
        window.open(`sms:?&body=${encodeURIComponent(fullUrl)}`);
        return;
      }

      const ok = await safeCopy(fullUrl);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    },
    [t.name, type]
  );

  // ─── Email Submit (API 경로 + body 구조 100% 유지) ───
  const submitEmail = async () => {
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
      // ✅ API 경로 유지: /api/type-subscribe
      // ✅ body 구조 유지: { email, afterfeel_type, referred_by, tracking }
      const res = await fetch("/api/type-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          afterfeel_type: type,
          referred_by: referredBy.current,
          tracking: getTrackingData(),
        }),
      });

      const data = await res.json();

      if (data?.success) {
        setReferralCode(data.referral_code);
        setQueuePosition(data.queue_position);
        setEmailSent(true);
        // ✅ 기존 track.emailSubmit 호출 유지
        track.emailSubmit(type);
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
  };

  // ─── Declaration Vote (기존 100% 유지) ───
  const voteDeclaration = async (key: string) => {
    if (votedDecls.has(key)) return;

    track.declarationTap(key);

    setDeclCounts((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    setVotedDecls((prev) => new Set(prev).add(key));

    try {
      // ✅ API 경로 유지: /api/type-declarations
      const res = await fetch("/api/type-declarations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement_key: key,
          visitor_id: getVisitorId(),
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setDeclCounts((prev) => ({ ...prev, [key]: data.vote_count }));
      }
    } catch {
      // optimistic UI
    }
  };

  // ─── Referral Share (기존 100% 유지) ───
  const refShare = async (channel: string) => {
    track.referralShare(channel);
    const refUrl = `${SHARE_URL}?ref=${referralCode}`;
    const txt = `I'm #${queuePosition.toLocaleString()} on the PIILK™ list. Something better is coming:`;

    if (channel === "x") {
      window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(txt)}&url=${encodeURIComponent(refUrl)}`,
        "_blank"
      );
      return;
    }

    if (channel === "sms") {
      window.open(
        `sms:?&body=${encodeURIComponent(txt + " " + refUrl)}`
      );
      return;
    }

    const ok = await safeCopy(refUrl);
    if (ok) {
      setRefCopied(true);
      setTimeout(() => setRefCopied(false), 1800);
    }
  };

  // ═════════════════════════════════════════
  // RESULT JSX — V14
  // ═════════════════════════════════════════
  return (
    <section className="phase result-phase">
      <div className="result-wrap">
        {/* ── 1. TYPE CARD (기존 구조 유지) ── */}
        <div className="card">
          <div className="card-inner">
            <div className="label">Your after-feel type</div>
            <div className="type-icon">{t.icon}</div>
            <div className="type-name">{t.name}</div>
            <div className="type-tagline">{t.tagline}</div>
            <div className="card-foot">PIILK™ by Armored Fresh</div>
          </div>
        </div>

        {/* ── 2. COMPARISON SECTION (V14 신규 — Audit V3 핵심 추가) ── */}
        <div className="compare-section">
          <div className="compare-title">What makes PIILK different</div>
          <div className="compare-rows">
            <div className="compare-row-item dim">
              <span className="compare-row-label">Your shake</span>
              <span className="compare-row-val">15+ ingredients · 11.5 oz</span>
            </div>
            <div className="compare-row-item bright">
              <span className="compare-row-label">PIILK™</span>
              <span className="compare-row-val">
                7 ingredients · 8.5 oz · same 30g
              </span>
            </div>
          </div>
          <div className="compare-sub">
            Same protein. Smaller bottle. No artificial sweeteners.
          </div>
        </div>

        {/* ── 3. EMAIL — V14: 가격 삭제, "Save result" CTA ── */}
        <div className="email-section">
          {!emailSent ? (
            <div className="email-card">
              <div className="email-prompt-type">
                Save your result + get NYC launch access
              </div>

              <div className="email-row">
                <input
                  ref={emailRef}
                  type="email"
                  className="email-input"
                  placeholder="your@email.com"
                  autoComplete="email"
                  inputMode="email"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitEmail();
                  }}
                  onFocus={() => {
                    if (!emailFocusTracked.current) {
                      emailFocusTracked.current = true;
                      // ✅ 기존 track.emailFocus 호출 유지
                      track.emailFocus(type);
                    }
                  }}
                />
                <button
                  className="email-btn"
                  onClick={submitEmail}
                  disabled={emailLoading}
                >
                  {emailLoading ? "..." : "Save & join →"}
                </button>
              </div>

              {emailError && <div className="email-error">{emailError}</div>}

              <div className="email-note">
                No spam. Unsubscribe anytime.
              </div>
            </div>
          ) : (
            <div className="email-ok anim-up">
              <div className="email-ok-icon">✓</div>
              <div className="email-ok-head">You&apos;re in.</div>
              <div className="email-ok-sub">
                We&apos;ll reach out when it&apos;s ready.
              </div>
            </div>
          )}
        </div>

        {/* ── 4. SHARE — 이메일 제출 후에만 표시 (기존 유지) ── */}
        {emailSent && (
          <div className="share-zone anim-up">
            <div className="share-label">
              &ldquo;I&apos;m a {t.name}.&rdquo; — tell a friend
            </div>

            <div className="share-grid">
              <button className="share-btn" onClick={() => doShare("save")}>
                📋 Save link
              </button>
              <button className="share-btn" onClick={() => doShare("sms")}>
                💬 Text
              </button>
              <button className="share-btn" onClick={() => doShare("x")}>
                𝕏 Post
              </button>
            </div>

            <div
              className="copy-row"
              onClick={() => doShare("link")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") doShare("link");
              }}
            >
              <span>teaser.piilk.com/type</span>
              <span className="copy-label">
                {copied ? "Copied!" : "Copy link"}
              </span>
            </div>
          </div>
        )}

        {/* ── 5. REFERRAL — 이메일 제출 후에만 표시 (기존 유지) ── */}
        {emailSent && (
          <div className="referral anim-up">
            <div className="ref-rank">
              #{queuePosition.toLocaleString()}
            </div>
            <div className="ref-rank-label">Your spot in line</div>

            <div className="ref-card">
              <div className="ref-card-title">Skip the line ⚡</div>
              <div className="ref-tier">
                <span>3 friends join</span>
                <span className="ref-tier-reward">+$2.99 credit</span>
              </div>
              <div className="ref-tier">
                <span>10 friends join</span>
                <span className="ref-tier-reward">25% off first order</span>
              </div>
              <div className="ref-tier">
                <span>20 friends join</span>
                <span className="ref-tier-reward">Free 18-pack case</span>
              </div>
            </div>

            <div className="ref-btns">
              <button
                className="ref-btn primary"
                onClick={() => refShare("x")}
              >
                Share on 𝕏
              </button>
              <button
                className="ref-btn primary"
                onClick={() => refShare("sms")}
              >
                💬 Text a friend
              </button>
              <button
                className="ref-btn ghost"
                onClick={() => refShare("copy")}
              >
                {refCopied ? "Copied!" : "Copy your link"}
              </button>
            </div>
          </div>
        )}

        {/* ── 6. PROOF (기존 유지) ── */}
        {emailSent && (
          <div className="proof-mini anim-up">
            <span className="ptag">30g protein</span>
            <span className="ptag">7 ingredients</span>
            <span className="ptag">Dairy-free</span>
            <span className="ptag">No after-feel.</span>
          </div>
        )}

        <div className="sep" />

        {/* ── 7. DECLARATIONS (기존 100% 유지) ── */}
        <div className="declarations">
          <div className="decl-header">
            <div className="label" style={{ marginBottom: 8 }}>
              Sound familiar?
            </div>
            <div className="h3">Tap the ones that hit.</div>
          </div>

          <div className="decl-list">
            {DECLARATIONS.map((d) => (
              <div
                key={d.key}
                className={`decl-item ${votedDecls.has(d.key) ? "voted" : ""}`}
                onClick={() => voteDeclaration(d.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    voteDeclaration(d.key);
                }}
              >
                <span className="decl-text">{d.text}</span>
                <span className="decl-count">
                  {(declCounts[d.key] || 0).toLocaleString()} ✊
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// MAIN PAGE (구조 기존 유지)
// ═══════════════════════════════════════════
export default function TeaserType() {
  const [phase, setPhase] = useState<"hero" | "quiz" | "result">("hero");
  const [resultType, setResultType] = useState<AfterfeelType>("brick");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    track.pageView();
  }, []);

  const handleProgressUpdate = useCallback((p: number) => {
    setProgress(p);
  }, []);

  const startQuiz = () => {
    track.quizStart();
    setPhase("quiz");
  };

  const handleQuizComplete = (type: AfterfeelType) => {
    setResultType(type);
    setPhase("result");
    setProgress(100);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goHome = () => {
    setPhase("hero");
    setProgress(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      {/* ── NAV (V14: "by Armored Fresh" → "NYC · March 2026") ── */}
      <nav className="nav">
        <a
          className="nav-logo"
          onClick={goHome}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") goHome();
          }}
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

      <div className="progress-bar" style={{ width: `${progress}%` }} />

      {phase === "hero" && <Hero onStart={startQuiz} />}
      {phase === "quiz" && (
        <Quiz
          onComplete={handleQuizComplete}
          onProgressUpdate={handleProgressUpdate}
        />
      )}
      {phase === "result" && <Result type={resultType} />}

      <footer className="footer">
        <Image
          src="/pillk-logo.png"
          alt="PIILK"
          width={64}
          height={24}
          style={{
            display: "block",
            margin: "0 auto 12px",
            opacity: 0.4,
          }}
        />
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#71717a",
            letterSpacing: "0.12em",
            marginBottom: 4,
          }}
        >
          PIILK™ BY ARMORED FRESH
        </div>
        <div style={{ fontSize: 13, color: "#71717a", marginBottom: 16 }}>
          RTD High Protein Shake.
        </div>
        <div>© 2026 Armoredfresh Inc.</div>
      </footer>
    </>
  );
}
