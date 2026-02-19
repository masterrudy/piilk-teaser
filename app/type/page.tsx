// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/type/page.tsx
// 📌 역할: /type 메인 페이지 (V9 Hybrid 전체)
// 📌 플로우: Hero → Quiz 3문항 → Result (Share #1 → Email #2 → Referral → Declaration)
// 📌 모든 API 호출은 /api/type-* 경로 사용 (A안 완전 분리)
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

// ─── Visitor ID ───
function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("piilk_vid");
  if (!id) {
    id = safeUUID();
    localStorage.setItem("piilk_vid", id);
  }
  return id;
}

// ─── URL에서 referral code 추출 ───
function getReferralFromURL(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("ref") || null;
}

// ─── 브라우저 트래킹 데이터 수집 ───
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

// ═══════════════════════════════════════════
// HERO
// ═══════════════════════════════════════════
function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="phase hero-phase">
      <div className="hero-inner">
        <h1 className="h1 anim-up">
          It&apos;s not the protein.
          <br />
          It&apos;s the <em>after.</em>
        </h1>

        <p className="body anim-up d1">
          That heavy feeling after. The film that lingers.
          <br />
          You&apos;ve felt it. You just never had a name for it.
        </p>

        <button className="btn-primary anim-up d2" onClick={onStart}>
          Find my type — 30 sec
        </button>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// QUIZ
// ═══════════════════════════════════════════
function Quiz({ onComplete }: { onComplete: (type: AfterfeelType) => void }) {
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [picked, setPicked] = useState(false);

  const q = QUIZ_QUESTIONS[qi];

  const pick = (group: string) => {
    if (picked) return;
    setPicked(true);

    track.quizStep(qi + 1, group);

    const next = [...answers, group];
    setAnswers(next);

    setTimeout(() => {
      const isLast = qi + 1 >= QUIZ_QUESTIONS.length;

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

  return (
    <section className="phase quiz-phase">
      <div className="wrap">
        <div className="quiz-dots">
          {QUIZ_QUESTIONS.map((_, i) => (
            <div key={i} className={`qdot ${i < qi ? "done" : i === qi ? "now" : ""}`} />
          ))}
        </div>

        <div className="caption" style={{ marginBottom: 8 }}>
          {qi + 1} of {QUIZ_QUESTIONS.length}
        </div>

        <h2 className="h2 quiz-q">{q.question}</h2>

        <div className="quiz-opts">
          {q.options.map((o, j) => (
            <div
              key={`${qi}-${j}`}
              className={`qo ${picked && answers[qi] === o.group ? "pk" : ""}`}
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
// RESULT
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
        data.declarations.forEach((d: { statement_key: string; vote_count: number }) => {
          counts[d.statement_key] = d.vote_count;
        });
        setDeclCounts(counts);
      })
      .catch(() => {});
  }, [type]);

  // ─── Share (#1) ───
  const doShare = useCallback(
    (channel: string) => {
      track.shareClick(channel, type);
      const txt = getShareText(t.name);

      if (channel === "x") {
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(txt)}&url=${encodeURIComponent(
            SHARE_URL
          )}`,
          "_blank"
        );
        return;
      }

      if (channel === "sms") {
        window.open(`sms:?&body=${encodeURIComponent(`${txt} ${SHARE_URL}`)}`);
        return;
      }

      // ig/link: 링크 복사로 통일
      navigator.clipboard?.writeText(`${txt} ${SHARE_URL}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    },
    [t.name, type]
  );

  // ─── Email (#2) ───
  const submitEmail = async () => {
    const email = emailRef.current?.value.trim();

    if (!email || !email.includes("@") || !email.includes(".")) {
      setEmailError("Please enter a valid email.");
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
          ? "Please enter a valid email."
          : "Something went wrong. Try again."
      );
    } catch {
      setEmailError("Connection error. Try again.");
    } finally {
      setEmailLoading(false);
    }
  };

  // ─── Declaration Vote ───
  const voteDeclaration = async (key: string) => {
    if (votedDecls.has(key)) return;

    track.declarationTap(key);

    // optimistic UI
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
      // optimistic already applied
    }
  };

  // ─── Referral Share (Email 후) ───
  const refShare = (channel: string) => {
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

    navigator.clipboard?.writeText(refUrl);
    setRefCopied(true);
    setTimeout(() => setRefCopied(false), 1800);
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

        {/* SHARE = #1 CTA */}
        <div className="share-zone">
          <div className="share-label">Tell them what you are</div>

          <div className="share-grid">
            <button className="share-btn" onClick={() => doShare("ig")}>
              📋 Save link
            </button>
            <button className="share-btn" onClick={() => doShare("sms")}>
              💬 Text
            </button>
            <button className="share-btn" onClick={() => doShare("x")}>
              𝕏 Post
            </button>
          </div>

          <div className="copy-row" onClick={() => doShare("link")} role="button" tabIndex={0}>
            <span>teaser.piilk.com/type</span>
            <span className="copy-label">{copied ? "Copied!" : "Copy link"}</span>
          </div>
        </div>

        <div className="sep" />

        {/* EMAIL = #2 CTA */}
        <div className="email-section">
          {!emailSent ? (
            <div>
              {/* 오퍼 먼저 노출 */}
              <div className="offer-box" aria-label="Offer">
           <p className="offer-main">
  <strong className="offer-price">$2.99</strong>
  <span className="offer-main-text"> for 3 bottles, shipping included.</span>
</p>
<p className="offer-sub">
  <span className="offer-value">Usually $13.47 in value.</span>
  <span className="offer-credit">
    We&apos;ll credit your $2.99 on your first 6+ order.
  </span>
</p>
<p className="offer-hook">Ready to try zero after-feel?</p>

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
                    }
                  }}
                />

                <button className="email-btn" onClick={submitEmail} disabled={emailLoading}>
                  {emailLoading ? "..." : "Get early access"}
                </button>
              </div>

              {emailError && <div className="email-error">{emailError}</div>}

              <div className="email-note">Launching Mid-March · First 1,000 members only</div>
            </div>
          ) : (
            <div className="email-ok anim-up">
              <div className="email-ok-icon">✓</div>
              <div className="email-ok-head">You&apos;re on the list.</div>

              <div className="offer-confirm">
                <strong>$2.99.</strong> Three bottles. Free shipping.
                <br />
                <span>Usually $13.47 in value. Targeting mid-March.</span>
                <br />
                <span style={{ fontSize: 11, color: "#666", marginTop: 4, display: "block" }}>
                  Love it? We&apos;ll credit your $2.99 on your first order of 6+.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* REFERRAL (이메일 후) */}
        {emailSent && (
          <div className="referral anim-up">
            <div className="ref-rank">#{queuePosition.toLocaleString()}</div>
            <div className="ref-rank-label">Your spot in line</div>

            <div className="ref-card">
              <div className="ref-card-title">Skip the line ⚡</div>
              <div className="ref-tier">
                <span>3 friends join</span>
                <span className="ref-tier-reward">$2.99 크레딧 추가</span>
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
              <button className="ref-btn ghost" onClick={() => refShare("copy")}>
                {refCopied ? "Copied!" : "Copy your link"}
              </button>
            </div>
          </div>
        )}

        {/* PROOF (이메일 후 = BOF) */}
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
              Do you agree?
            </div>
            <div className="h3">Tap the ones that feel true.</div>
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

  const hasStarted = useRef(false);

  const startQuiz = () => {
    if (!hasStarted.current) {
      track.quizStart();
      hasStarted.current = true;
    }
    setPhase("quiz");
    setProgress(10);
  };

  const handleQuizComplete = (type: AfterfeelType) => {
    setResultType(type);
    setPhase("result");
    setProgress(100);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goHome = () => {
    hasStarted.current = false;
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
      {phase === "quiz" && <Quiz onComplete={handleQuizComplete} />}
      {phase === "result" && <Result type={resultType} />}

      <footer className="footer">
        <div>PIILK™ by Armored Fresh</div>
        <div>© 2026 Armoredfresh Inc.</div>
      </footer>
    </>
  );
}
