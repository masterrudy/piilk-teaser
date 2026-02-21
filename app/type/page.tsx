// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/type/page.tsx
// 📌 역할: /type 메인 페이지 (V12 — Final)
// 📌 플로우: Hero → Quiz 3문항 → Result (Share #1 → Email #2 → Referral → Declaration)
// 📌 모든 API 호출은 /api/type-* 경로 사용 (A안 완전 분리)
//
// ✅ V11 → V12 변경사항:
//   1. 히어로 카피 전면 교체
//      - "It's not the protein" → "You've been ignoring it."
//      - 4타입 이모지 미리보기 추가
//      - CTA: "Find my type — 30 sec" → "What's yours? →"
//   2. Result 브릿지 라인 추가: "What if nothing stayed?"
//   3. Share 라벨 개인화: 타입명 포함
//   4. Email 카피 개선: "Your type is real. The fix is coming."
//   5. Declaration 헤더 톤 변경: "Sound familiar? / Tap the ones that hit."
//   6. Referral에 SMS 버튼 추가
//   7. doShare("ig") → doShare("save") 채널명 수정
//
// 🐛 V12 버그 수정:
//   8. fbq 중복 호출 4건 제거 — ga4.ts에서 일괄 관리
//      삭제: QuizStart, QuizComplete, TypeResult, EmailFocus
//      유지: QuizStep (ga4.ts에 없으므로 page.tsx에서 유일하게 호출)
//   9. Referral refShare()에 sms 분기 추가
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
// Utils
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
    device_type: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop",
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

// ─────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────
function calcQuizProgress(qi: number, total: number): number {
  return Math.round(25 + (qi / total) * 50);
}

// ═══════════════════════════════════════════
// HERO — V12
// ═══════════════════════════════════════════
function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="phase hero-phase">
      <div className="hero-inner">
        <h1 className="h1 anim-up">
          You&apos;ve been ignoring it.
        </h1>

        <p className="body anim-up d1">
          That chalk taste. That heavy gut.
          <br />
          That film you can&apos;t explain.
          <br />
          After every protein shake — something stays.
        </p>

        <div className="hero-types anim-up d2">
          <span className="hero-type-icon">🪨</span>
          <span className="hero-type-icon">😶‍🌫️</span>
          <span className="hero-type-icon">😴</span>
          <span className="hero-type-icon">💨</span>
        </div>

        <p className="body-sm anim-up d2">
          4 types. Everyone has one.
        </p>

        <button className="btn-primary anim-up d3" onClick={onStart}>
          What&apos;s yours? →
        </button>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// QUIZ
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
    // fbq QuizStep은 ga4.ts v3에서 일괄 호출

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
      // 🐛 FIX: fbq QuizComplete 제거 — ga4.ts quizComplete() 내부에서 호출됨
      onComplete(result);
    }, 300);
  };

  const pickedAnswer = answers[answers.length - 1];

  return (
    <section className="phase quiz-phase">
      <div className="wrap">
        <div className="quiz-dots">
          {QUIZ_QUESTIONS.map((_, i) => (
            <div key={i} className={`qdot ${i < qi ? "done" : i === qi ? "now" : ""}`} />
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
              style={{ animation: `up .35s cubic-bezier(.16,1,.3,1) ${j * 0.04}s both` }}
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
// RESULT — V12
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
    // 🐛 FIX: fbq TypeResult 제거 — ga4.ts typeResult() 내부에서 호출됨

    fetch("/api/type-declarations")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.declarations) return;
        const counts: Record<string, number> = {};
        data.declarations.forEach((d: { statement_key: string; vote_count: number }) => {
          counts[d.statement_key] = d.vote_count;
        });
        setDeclCounts(counts);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Share (#1) ───
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

      // save / link: clipboard copy
      const ok = await safeCopy(fullUrl);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    },
    [t.name, type]
  );

  // ─── Email (#2) ───
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
        // fbq Lead + CompleteRegistration + ttq 모두 ga4.ts emailSubmit() 내부에서 처리
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
        body: JSON.stringify({ statement_key: key, visitor_id: getVisitorId() }),
      });
      const data = await res.json();
      if (data?.success) {
        setDeclCounts((prev) => ({ ...prev, [key]: data.vote_count }));
      }
    } catch {
      // optimistic UI
    }
  };

  // ─── Referral Share ───
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
      window.open(`sms:?&body=${encodeURIComponent(txt + " " + refUrl)}`);
      return;
    }

    // copy
    const ok = await safeCopy(refUrl);
    if (ok) {
      setRefCopied(true);
      setTimeout(() => setRefCopied(false), 1800);
    }
  };

  return (
    <section className="phase result-phase">
      <div className="result-wrap">
        {/* CARD */}
        <div className="card">
          <div className="card-inner">
            <div className="label">Your after-feel type</div>
            <div className="type-icon">{t.icon}</div>
            <div className="type-name">{t.name}</div>
            <div className="type-tagline">{t.tagline}</div>
            <div className="card-foot">PIILK™ by Armored Fresh</div>
          </div>
        </div>

        {/* V12: 브릿지 라인 — 불편함 → 해결책 연결 */}
        <div className="bridge-line">
          What if nothing stayed?
        </div>

        {/* SHARE = #1 CTA */}
        <div className="share-zone">
          {/* V12: 타입명 포함 개인화 */}
          <div className="share-label">
            &ldquo;I&apos;m a {t.name}.&rdquo; — share your result
          </div>

          <div className="share-grid">
            {/* 🐛 FIX: "ig" → "save" — 실제 동작은 clipboard copy */}
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
            <span className="copy-label">{copied ? "Copied!" : "Copy link"}</span>
          </div>
        </div>

        <div className="sep" />

        {/* EMAIL = #2 CTA */}
        <div className="email-section">
          {!emailSent ? (
            <div>
              <div className="email-hook">
                <div className="email-hook-head">Your type is real. The fix is coming.</div>
                <div className="email-hook-sub">
                  The protein shake with nothing after.
                  <br />
                  Something unlocks when you join.
                </div>
              </div>

              <div className="email-row">
                <input
                  ref={emailRef}
                  type="email"
                  className="email-input"
                  placeholder="your@email.com"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitEmail();
                  }}
                  onFocus={() => {
                    if (!emailFocusTracked.current) {
                      emailFocusTracked.current = true;
                      track.emailFocus(type);
                      // 🐛 FIX: fbq EmailFocus 제거 — ga4.ts emailFocus() 내부에서 호출됨
                    }
                  }}
                />
                <button className="email-btn" onClick={submitEmail} disabled={emailLoading}>
                  {emailLoading ? "..." : "Join the list →"}
                </button>
              </div>

              {emailError && <div className="email-error">{emailError}</div>}

              <div className="email-note">No spam, ever.</div>
            </div>
          ) : (
            <div className="email-ok anim-up">
              <div className="email-ok-icon">✓</div>
              <div className="email-ok-head">You&apos;re on the list.</div>

              <div className="offer-reveal anim-up">
                <div className="offer-reveal-label">🎁 Member offer — unlocked for you</div>
                <div className="offer-reveal-price">$2.99</div>
                <div className="offer-reveal-desc">3 bottles · Free shipping · Usually $13.47</div>
                <div className="offer-reveal-fine">
                  Love it? We&apos;ll credit your $2.99 on your first order of 6+.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* REFERRAL — V12: SMS 버튼 추가 */}
        {emailSent && (
          <div className="referral anim-up">
            <div className="ref-rank">#{queuePosition.toLocaleString()}</div>
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
              <button className="ref-btn primary" onClick={() => refShare("x")}>
                Share on 𝕏
              </button>
              <button className="ref-btn primary" onClick={() => refShare("sms")}>
                💬 Text a friend
              </button>
              <button className="ref-btn ghost" onClick={() => refShare("copy")}>
                {refCopied ? "Copied!" : "Copy your link"}
              </button>
            </div>
          </div>
        )}

        {/* PROOF */}
        {emailSent && (
          <div className="proof-mini anim-up">
            <span className="ptag">30g protein</span>
            <span className="ptag">7 ingredients</span>
            <span className="ptag">Dairy-free</span>
            <span className="ptag">Nothing after.</span>
          </div>
        )}

        <div className="sep" />

        {/* DECLARATIONS */}
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
                  if (e.key === "Enter" || e.key === " ") voteDeclaration(d.key);
                }}
              >
                <span className="decl-text">{d.text}</span>
                <span className="decl-count">{(declCounts[d.key] || 0).toLocaleString()} ✊</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// MAIN PAGE
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
    // 🐛 FIX: fbq QuizStart 제거 — ga4.ts quizStart() 내부에서 호출됨
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
        <span className="nav-right">by Armored Fresh</span>
      </nav>

      <div className="progress-bar" style={{ width: `${progress}%` }} />

      {phase === "hero" && <Hero onStart={startQuiz} />}
      {phase === "quiz" && (
        <Quiz onComplete={handleQuizComplete} onProgressUpdate={handleProgressUpdate} />
      )}
      {phase === "result" && <Result type={resultType} />}

      <footer className="footer">
        <div>PIILK™ by Armored Fresh</div>
        <div>© 2026 Armoredfresh Inc.</div>
      </footer>
    </>
  );
}
