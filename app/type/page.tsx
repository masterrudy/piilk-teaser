// ═══════════════════════════════════════════════════════════
// 📁 app/type/page.tsx — V15 (Power Version: Type Discovery)
// 📌 Hero → Type Reveal → Quick Pick OR Full Quiz → Result
// 📌 API: /api/type-subscribe, /api/type-declarations — 변경 없음
// 📌 Tracking: lib/ga4.ts — 변경 없음
// 📌 Data: lib/quiz-data.ts — 변경 없음
//
// ✅ V14 → V15 변경사항 (디자인만 변경, 인프라 변경 없음):
//   1. Hero: "Everyone reacts differently" → "The shake is done. But something isn't." (선언형)
//   2. Hero: CTA 탭 → 4개 타입 순차 등장 애니메이션
//   3. Quick Pick: 타입 직접 선택 → 풀 퀴즈 스킵 가능 (이탈 방지)
//   4. Result: 공유를 Email CTA 위로 이동 (바이럴 우선)
//   5. Result: 타입별 맞춤 브릿지 문구 (타입→비교 자연 연결)
//   6. Result: V14의 "cause-section" ("It's not you. It's the 15+ ingredients")
//             → 법적 안전 버전으로 변경 (인과 주장 제거)
//   7. "crash" → "off" (법적 안전)
//
// 🔒 변경하지 않은 것들:
//   - import 경로: @/lib/quiz-data, @/lib/ga4 → 동일
//   - API: /api/type-subscribe, /api/type-declarations → 동일
//   - body: { email, afterfeel_type, referred_by, tracking } → 동일
//   - body: { statement_key, visitor_id } → 동일
//   - track.*() 모든 호출: pageView, quizStart, quizStep, quizComplete,
//     typeResult, emailSubmit, emailFocus, shareClick, declarationTap,
//     referralShare → 동일
//   - quiz-data.ts: QUIZ_QUESTIONS, AFTERFEEL_TYPES, DECLARATIONS,
//     calcAfterfeelType, getShareText, SHARE_URL → 변경 없음
//   - 에러 메시지: invalid_email, already_exists → 동일
//   - Referral tiers: 3→credit, 10→25%, 20→free case → 동일
//   - Footer: PIILK™ BY ARMORED FRESH, © 2026 Armoredfresh Inc. → 동일
//   - Image src="/pillk-logo.png" → 동일
//   - Nav: "NYC · March 2026" → 동일
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
// Utils (V14와 100% 동일)
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

// ─────────────────────────────────────────────────────────────
// 타입별 브릿지 문구 (결과→비교 자연 연결, 건강 주장 없음)
// quiz-data.ts의 실제 key 사용: brick, chalk, zombie, gambler
// ─────────────────────────────────────────────────────────────
const TYPE_BRIDGES: Record<AfterfeelType, string> = {
  brick: "Fewer ingredients. Nothing to weigh you down.",
  chalk: "Fewer ingredients. Nothing to coat your mouth.",
  zombie: "Fewer ingredients. Less to process.",
  gambler: "Fewer ingredients. Nothing to worry about.",
};

// ═══════════════════════════════════════════
// HERO — V15 (선언형 + 타입 리빌 애니메이션 + Quick Pick)
// ═══════════════════════════════════════════
function Hero({
  onStart,
  onQuickPick,
}: {
  onStart: () => void;
  onQuickPick: (type: AfterfeelType) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [revealIdx, setRevealIdx] = useState(-1);
  const [showPick, setShowPick] = useState(false);

  const typeEntries = Object.entries(AFTERFEEL_TYPES) as [
    AfterfeelType,
    (typeof AFTERFEEL_TYPES)[AfterfeelType],
  ][];

  // 리빌 애니메이션: 하나씩 등장 후 Quick Pick 활성화
  useEffect(() => {
    if (!revealed) return;
    if (revealIdx >= typeEntries.length - 1) {
      const t = setTimeout(() => setShowPick(true), 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRevealIdx((r) => r + 1), 400);
    return () => clearTimeout(t);
  }, [revealed, revealIdx, typeEntries.length]);

  const handleDiscover = () => {
    setRevealed(true);
    setRevealIdx(-1);
    setTimeout(() => setRevealIdx(0), 200);
  };

  // ── 초기 Hero (리빌 전) ──
  if (!revealed) {
    return (
      <section className="phase hero-phase">
        <div className="hero-inner">
          <h1 className="h1 anim-up">
            The shake is done.
            <br />
            <span className="accent">But something isn&apos;t.</span>
          </h1>

          <p className="body anim-up d1">
            That &ldquo;something&rdquo; is different for everyone.
            <br />
            Some feel it. Some taste it. Some just feel… off.
          </p>

          {/* 타입 미리보기: 2x2 그리드 (V14 구조 유지) */}
          <div className="hero-type-grid anim-up d2">
            {typeEntries.map(([key, t]) => (
              <div className="hero-type-card" key={key}>
                <span className="hero-type-emoji">{t.icon}</span>
                <span className="hero-type-name">{t.name}</span>
              </div>
            ))}
          </div>

          <p className="body-sm anim-up d2">
            We found <strong className="accent">4 types</strong>. Everyone
            has one.
          </p>

          <button
            className="btn-primary anim-up d3"
            onClick={handleDiscover}
          >
            Which one am I? — 30 sec
          </button>
        </div>
      </section>
    );
  }

  // ── 리빌 + Quick Pick ──
  return (
    <section className="phase hero-phase">
      <div className="hero-inner">
        <p className="reveal-label anim-up">THE 4 AFTER-FEEL TYPES</p>

        <div className="type-reveal-list">
          {typeEntries.map(([key, t], i) => (
            <button
              key={key}
              className={`type-reveal-card${i <= revealIdx ? " show" : ""}${showPick ? " pickable" : ""}`}
              onClick={() => {
                if (!showPick) return;
                track.quizComplete(key);
                onQuickPick(key);
              }}
              disabled={!showPick}
            >
              <span className="trc-emoji">{t.icon}</span>
              <div className="trc-info">
                <span
                  className="trc-name"
                  style={{ color: i <= revealIdx ? "#fff" : "#333" }}
                >
                  {t.name}
                </span>
                <span className="trc-tagline">{t.tagline}</span>
              </div>
              {showPick && <span className="trc-arrow">→</span>}
            </button>
          ))}
        </div>

        {showPick && (
          <div className="pick-prompt anim-up">
            <p className="pick-title">Which one are you?</p>
            <p className="pick-sub">Tap the one that feels closest</p>
            <div className="pick-or">
              <span>Not sure? </span>
              <button className="pick-quiz-link" onClick={onStart}>
                Take the full quiz — 30 sec
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// QUIZ (V14 로직 100% 유지)
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
// RESULT — V15
// (V14 대비 변경: 공유 위로, 브릿지 추가, cause-section 법적 안전 버전)
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
    track.typeResult(type);

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

  // ─── Share (V14와 동일) ───
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

  // ─── Email Submit (V14와 100% 동일) ───
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
        track.emailSubmit(type);
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
  };

  // ─── Declaration Vote (V14와 100% 동일) ───
  const voteDeclaration = async (key: string) => {
    if (votedDecls.has(key)) return;
    track.declarationTap(key);
    setDeclCounts((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    setVotedDecls((prev) => new Set(prev).add(key));

    try {
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
      /* optimistic UI */
    }
  };

  // ─── Referral Share (V14와 100% 동일) ───
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

  return (
    <section className="phase result-phase">
      <div className="result-wrap">
        {/* ── 1. TYPE CARD (V14 구조 유지) ── */}
        <div className="card">
          <div className="card-inner">
            <div className="label">Your after-feel type</div>
            <div className="type-icon">{t.icon}</div>
            <div className="type-name">{t.name}</div>
            <div className="type-tagline">{t.tagline}</div>
            <div className="card-foot">PIILK™ by Armored Fresh</div>
          </div>
        </div>

        {/* ── 2. SHARE (V15: Email 위로 이동 — 바이럴 우선) ── */}
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

        {/* ── 3. TYPE BRIDGE + COMPARISON (V15 신규: 법적 안전) ── */}
        <div className="compare-section anim-up">
          <div className="bridge-text">{TYPE_BRIDGES[type]}</div>
          <div className="compare-rows">
            <div className="compare-row-item dim">
              <span className="compare-row-label">Most shakes</span>
              <span className="compare-row-val">
                15+ ingredients · 11.5 oz
              </span>
            </div>
            <div className="compare-row-item bright">
              <span className="compare-row-label">PIILK™</span>
              <span className="compare-row-val">
                7 ingredients · 8.5 oz · same 30g
              </span>
            </div>
          </div>
          <div className="compare-sub">
            No artificial sweeteners. No emulsifiers.
            <br />
            No carrageenan. Dairy free.
          </div>
        </div>

        {/* ── 4. EMAIL CTA (V14 오퍼 유지: "Get early access") ── */}
        <div className="email-section">
          {!emailSent ? (
            <div className="email-card">
              <div className="email-prompt-type">
                Get early access · 3 bottles · Free shipping
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
                      track.emailFocus(type);
                    }
                  }}
                />
                <button
                  className="email-btn"
                  onClick={submitEmail}
                  disabled={emailLoading}
                >
                  {emailLoading ? "..." : "Get my PIILK →"}
                </button>
              </div>

              {emailError && (
                <div className="email-error">{emailError}</div>
              )}

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

        {/* ── 5. REFERRAL — 이메일 제출 후에만 (V14와 동일 구조 + 혜택) ── */}
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
                <span className="ref-tier-reward">
                  25% off first order
                </span>
              </div>
              <div className="ref-tier">
                <span>20 friends join</span>
                <span className="ref-tier-reward">
                  Free 18-pack case
                </span>
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

        {/* ── 6. PROOF (V14와 동일) ── */}
        {emailSent && (
          <div className="proof-mini anim-up">
            <span className="ptag">30g protein</span>
            <span className="ptag">7 ingredients</span>
            <span className="ptag">Dairy-free</span>
            <span className="ptag">No after-feel.</span>
          </div>
        )}

        <div className="sep" />

        {/* ── 7. DECLARATIONS (V14와 100% 동일) ── */}
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
// MAIN PAGE (V14 구조 유지 + Quick Pick 추가)
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
    setProgress(25);
  };

  // V15 신규: Quick Pick → 퀴즈 스킵
  const handleQuickPick = (type: AfterfeelType) => {
    setResultType(type);
    setPhase("result");
    setProgress(100);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      {/* ── NAV (V14와 동일) ── */}
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

      {phase === "hero" && (
        <Hero onStart={startQuiz} onQuickPick={handleQuickPick} />
      )}
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
