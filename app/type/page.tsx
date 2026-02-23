// ═══════════════════════════════════════════════════════════
// 📁 app/type/page.tsx — V15.3
// 📌 V15.2 → V15.3 변경사항:
//   1. Hero: 리빌 애니메이션 삭제, Quick Pick 삭제
//      → "Which one am I?" 1탭으로 바로 Quiz 시작
//   2. Quiz → Result 전환: "Finding your type..." 1.5초 서스펜스 추가
//   3. Result 순서 변경:
//      Card → Bridge+학습+Email(통합) → Share → Referral → Declarations
//      (Compare 섹션 학습에 흡수 → 삭제, Proof 섹션 → 삭제)
//   4. Quiz 3번째 문항 이후 "Almost there" 메시지
//   5. phase에 "finding" 추가 (hero → quiz → finding → result)
//
// 🔒 변경하지 않은 것들:
//   - import 경로: @/lib/quiz-data, @/lib/ga4 → 동일
//   - API: /api/type-subscribe, /api/type-declarations → 동일
//   - body 구조 → 동일
//   - track.*() 모든 호출 → 동일
//   - quiz-data.ts → 변경 없음
//   - 에러 메시지 → 동일
//   - Referral tiers → 동일
//   - Footer → 동일
//   - Utils 함수들 → 동일
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
// Utils (V15.2 동일)
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
// 타입별 브릿지 문구 — V15.3 (감정 브릿지 + 학습 통합)
// ─────────────────────────────────────────────────────────────
const TYPE_BRIDGES: Record<
  AfterfeelType,
  { emotion: string; learning: string }
> = {
  brick: {
    emotion: "That heavy feeling has a reason.",
    learning: "8 of them aren\u2019t protein. That\u2019s what you\u2019re feeling.",
  },
  chalk: {
    emotion: "That coated feeling has a reason.",
    learning: "8 of them aren\u2019t protein. That\u2019s what you\u2019re tasting.",
  },
  zombie: {
    emotion: "That drained feeling has a reason.",
    learning: "8 of them aren\u2019t protein. That\u2019s what\u2019s slowing you down.",
  },
  gambler: {
    emotion: "That unpredictable feeling has a reason.",
    learning: "8 of them aren\u2019t protein. That\u2019s the gamble.",
  },
};

// ═══════════════════════════════════════════
// HERO — V15.3 (간소화: 1탭 → 바로 Quiz)
// ═══════════════════════════════════════════
function Hero({ onStart }: { onStart: () => void }) {
  const typeEntries = Object.entries(AFTERFEEL_TYPES) as [
    AfterfeelType,
    (typeof AFTERFEEL_TYPES)[AfterfeelType],
  ][];

  return (
    <section className="phase hero-phase">
      <div className="hero-inner">
        <h1 className="h1 anim-up">
          The shake is done.{" "}
          <span className="accent">But something isn&apos;t.</span>
        </h1>

        <p className="body anim-up d1">
          That &ldquo;something&rdquo; is different for everyone.
          <br />
          Some feel it. Some taste it. Some just feel… off.
        </p>

        {/* 2×2 타입 그리드 */}
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

        <button className="btn-primary anim-up d3" onClick={onStart}>
          Which one am I? — 30 sec
        </button>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// QUIZ — V15.3 ("Almost there" 메시지 추가)
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
  const isAlmostDone = qi >= total - 1;

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
          {isAlmostDone && (
            <span style={{ marginLeft: 8, opacity: 0.6 }}>
              — last one
            </span>
          )}
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
// FINDING — V15.3 신규 (서스펜스 로딩)
// ═══════════════════════════════════════════
function Finding({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // 0→100 in 1.5s (50ms intervals)
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 100 / 30; // 30 steps × 50ms = 1.5s
      });
    }, 50);

    const done = setTimeout(onDone, 1600);

    return () => {
      clearInterval(interval);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <section className="phase finding-phase">
      <div className="finding-inner">
        <div className="finding-text">Finding your after-feel type...</div>
        <div className="finding-bar-track">
          <div
            className="finding-bar-fill"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// RESULT — V15.3 (Card → Bridge+학습+Email → Share → Referral → Declarations)
// ═══════════════════════════════════════════
function Result({ type }: { type: AfterfeelType }) {
  const t = AFTERFEEL_TYPES[type];
  const bridge = TYPE_BRIDGES[type];

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
          },
        );
        setDeclCounts(counts);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Share ───
  const doShare = useCallback(
    async (channel: string) => {
      track.shareClick(channel, type);
      const txt = getShareText(t.name);
      const fullUrl = `${txt} ${SHARE_URL}`;

      if (channel === "x") {
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(txt)}&url=${encodeURIComponent(SHARE_URL)}`,
          "_blank",
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
    [t.name, type],
  );

  // ─── Email Submit ───
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
            ? "You\u2019re already on the list! \uD83C\uDF89"
            : "Something went wrong. Please try again.",
      );
    } catch {
      setEmailError("Connection error. Please try again.");
    } finally {
      setEmailLoading(false);
    }
  };

  // ─── Declaration Vote ───
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

  // ─── Referral Share ───
  const refShare = async (channel: string) => {
    track.referralShare(channel);
    const refUrl = `${SHARE_URL}?ref=${referralCode}`;
    const txt = `I'm #${queuePosition.toLocaleString()} on the PIILK\u2122 list. Something better is coming:`;

    if (channel === "x") {
      window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(txt)}&url=${encodeURIComponent(refUrl)}`,
        "_blank",
      );
      return;
    }
    if (channel === "sms") {
      window.open(
        `sms:?&body=${encodeURIComponent(txt + " " + refUrl)}`,
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
        {/* 1. TYPE CARD */}
        <div className="card">
          <div className="card-inner">
            <div className="label">Your after-feel type</div>
            <div className="type-icon">{t.icon}</div>
            <div className="type-name">{t.name}</div>
            <div className="type-tagline">{t.tagline}</div>
            <div className="card-foot">PIILK™ by Armored Fresh</div>
          </div>
        </div>

        {/* 2. BRIDGE + LEARNING + EMAIL (통합 흐름) */}
        <div className="learn-email-section anim-up">
          {/* 감정 브릿지 */}
          <div className="bridge-emotion">{bridge.emotion}</div>

          {/* 학습 */}
          <div className="learn-block">
            <div className="learn-stat">
              <span className="learn-num">15</span>
              <span className="learn-label">ingredients in most shakes</span>
            </div>
            <div className="learn-insight">{bridge.learning}</div>
            <div className="learn-answer">
              <span className="learn-num accent">7</span>
              <span className="learn-label">
                ingredients in PIILK. Same 30g protein.
              </span>
            </div>
            <div className="learn-compliance">
              No artificial sweeteners. No emulsifiers.
              <br />
              No carrageenan. Dairy free.
            </div>
          </div>

          {/* Email CTA */}
          {!emailSent ? (
            <div className="email-card">
              <div className="email-prompt-type">
                3 bottles · $2.99 each · Free shipping
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

        {/* 3. SHARE (Email 아래) */}
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

        {/* 4. REFERRAL */}
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

        <div className="sep" />

        {/* 5. DECLARATIONS */}
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
// MAIN PAGE — V15.3 (finding phase 추가)
// ═══════════════════════════════════════════
export default function TeaserType() {
  const [phase, setPhase] = useState<
    "hero" | "quiz" | "finding" | "result"
  >("hero");
  const [resultType, setResultType] = useState<AfterfeelType>("brick");
  const [progress, setProgress] = useState(0);
  const pendingType = useRef<AfterfeelType>("brick");

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

  const handleQuizComplete = (type: AfterfeelType) => {
    pendingType.current = type;
    setPhase("finding");
    setProgress(85);
  };

  const handleFindingDone = useCallback(() => {
    setResultType(pendingType.current);
    setPhase("result");
    setProgress(100);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const goHome = () => {
    setPhase("hero");
    setProgress(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      {/* ── NAV (Main과 통일) ── */}
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
      {phase === "finding" && <Finding onDone={handleFindingDone} />}
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
