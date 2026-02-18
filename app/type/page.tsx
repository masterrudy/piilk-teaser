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

// ─── Visitor ID ───
function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("piilk_vid");
  if (!id) {
    id = crypto.randomUUID();
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
          We call it <strong>after-feel</strong> — everyone has a type.
        </p>
        <button className="btn-primary anim-up d2" onClick={onStart}>
          Find your type
        </button>
        <div className="caption anim-up d3">30 seconds</div>
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

  function pick(group: string) {
    if (picked) return;
    setPicked(true);

    // ✅ FIX: 퀴즈 단계별 이탈 추적 (어느 문항에서 떠나는지 파악)
    track.quizStep(qi + 1, group);

    const next = [...answers, group];
    setAnswers(next);

    setTimeout(() => {
      if (qi + 1 < QUIZ_QUESTIONS.length) {
        setQi(qi + 1);
        setPicked(false);
      } else {
        const result = calcAfterfeelType(next);
        track.quizComplete(result);
        onComplete(result);
      }
    }, 300);
  }

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

  // ✅ FIX: 이메일 focus 중복 방지용 ref
  const emailFocusTracked = useRef(false);

  useEffect(() => {
    referredBy.current = getReferralFromURL();
    track.typeResult(type);

    // Declaration 카운트 로드
    fetch("/api/type-declarations")
      .then((r) => r.json())
      .then((data) => {
        if (data.declarations) {
          const counts: Record<string, number> = {};
          data.declarations.forEach(
            (d: { statement_key: string; vote_count: number }) => {
              counts[d.statement_key] = d.vote_count;
            }
          );
          setDeclCounts(counts);
        }
      })
      .catch(() => {});
  }, [type]);

  // ─── Share ───
  const doShare = useCallback(
    (channel: string) => {
      track.shareClick(channel, type);
      const txt = getShareText(t.name);

      switch (channel) {
        case "x":
          window.open(
            `https://twitter.com/intent/tweet?text=${encodeURIComponent(txt)}&url=${encodeURIComponent(SHARE_URL)}`,
            "_blank"
          );
          break;
        case "ig":
          // TODO: html2canvas → PNG for IG Stories
          alert("Production: html2canvas → saves card as PNG for IG Stories.");
          break;
        case "sms":
          window.open(`sms:?&body=${encodeURIComponent(txt + " " + SHARE_URL)}`);
          break;
        case "link":
          navigator.clipboard?.writeText(txt + " " + SHARE_URL);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
          break;
      }
    },
    [t.name, type]
  );

  // ─── Email ───
  async function submitEmail() {
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

      if (data.success) {
        setReferralCode(data.referral_code);
        setQueuePosition(data.queue_position);
        setEmailSent(true);
        track.emailSubmit(type);
      } else {
        setEmailError(
          data.error === "invalid_email"
            ? "Please enter a valid email."
            : "Something went wrong. Try again."
        );
      }
    } catch {
      setEmailError("Connection error. Try again.");
    } finally {
      setEmailLoading(false);
    }
  }

  // ─── Declaration Vote ───
  async function voteDeclaration(key: string) {
    if (votedDecls.has(key)) return;
    track.declarationTap(key);

    // Optimistic update
    setDeclCounts((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    setVotedDecls((prev) => new Set(prev).add(key));

    try {
      const res = await fetch("/api/type-declarations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement_key: key, visitor_id: getVisitorId() }),
      });
      const data = await res.json();
      if (data.success) {
        setDeclCounts((prev) => ({ ...prev, [key]: data.vote_count }));
      }
    } catch {
      // Optimistic already applied
    }
  }

  // ─── Referral Share ───
  function refShare(channel: string) {
    track.referralShare(channel);
    const refUrl = `${SHARE_URL}?ref=${referralCode}`;
    const txt = `I'm #${queuePosition.toLocaleString()} on the PIILK™ list. Something better is coming:`;

    if (channel === "x") {
      window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(txt)}&url=${encodeURIComponent(refUrl)}`,
        "_blank"
      );
    } else {
      navigator.clipboard?.writeText(refUrl);
      setRefCopied(true);
      setTimeout(() => setRefCopied(false), 1800);
    }
  }

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
            <button className="share-btn" onClick={() => doShare("ig")}>📸 Story</button>
            <button className="share-btn" onClick={() => doShare("sms")}>💬 Text</button>
            <button className="share-btn" onClick={() => doShare("x")}>𝕏 Post</button>
          </div>
          <div className="copy-row" onClick={() => doShare("link")}>
            <span>teaser.piilk.com/type</span>
            <span className="copy-label">{copied ? "Copied!" : "Copy link"}</span>
          </div>
        </div>

        <div className="sep" />

        {/* EMAIL = #2 CTA */}
        <div className="email-section">
          {!emailSent ? (
            <div>
              <div className="email-bridge">
                PIILK™ — a protein shake designed to leave nothing behind.
                <br />
                <strong>Want to try zero after-feel?</strong>
              </div>
              <div className="email-row">
                <input
                  ref={emailRef}
                  type="email"
                  className="email-input"
                  placeholder="your@email.com"
                  onKeyDown={(e) => e.key === "Enter" && submitEmail()}
                  // ✅ FIX: 이메일 입력창 최초 클릭 시 1회만 추적
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
              <div className="email-note">Shipping nationwide. We&apos;ll let you know first.</div>
            </div>
          ) : (
            <div className="email-ok anim-up">
              <div className="email-ok-icon">✓</div>
              <div className="email-ok-head">You&apos;re on the list.</div>
              <div className="email-ok-sub">We&apos;ll email you when it&apos;s your turn.</div>
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
              <div className="ref-tier"><span>5 friends join</span><span className="ref-tier-reward">Free 7-day trial upgrade</span></div>
              <div className="ref-tier"><span>15 friends join</span><span className="ref-tier-reward">25% off your first case</span></div>
              <div className="ref-tier"><span>30 friends join</span><span className="ref-tier-reward">Free 18-pack case</span></div>
            </div>
            <div className="ref-btns">
              <button className="ref-btn primary" onClick={() => refShare("x")}>Share on 𝕏</button>
              <button className="ref-btn ghost" onClick={() => refShare("copy")}>{refCopied ? "Copied!" : "Copy your link"}</button>
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
            <div className="label" style={{ marginBottom: 8 }}>Do you agree?</div>
            <div className="h3">Tap the ones that feel true.</div>
          </div>
          <div className="decl-list">
            {DECLARATIONS.map((d) => (
              <div
                key={d.key}
                className={`decl-item ${votedDecls.has(d.key) ? "voted" : ""}`}
                onClick={() => voteDeclaration(d.key)}
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

  // ✅ FIX: quizStart 중복 발화 방지 (goHome → 재시작 시 114% 이슈 해결)
  const hasStarted = useRef(false);

  function startQuiz() {
    if (!hasStarted.current) {
      track.quizStart();
      hasStarted.current = true;
    }
    setPhase("quiz");
    setProgress(10);
  }

  function handleQuizComplete(type: AfterfeelType) {
    setResultType(type);
    setPhase("result");
    setProgress(100);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goHome() {
    // ✅ FIX: 홈으로 돌아갈 때 hasStarted 리셋 (재시작 시 정상 추적)
    hasStarted.current = false;
    setPhase("hero");
    setProgress(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <nav className="nav">
        <a className="nav-logo" onClick={goHome}>
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
