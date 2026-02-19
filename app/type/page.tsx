// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/type/page.tsx
// 📌 역할: /type 메인 페이지 (V10 Fixed)
// 📌 플로우: Hero → Quiz 3문항 → Result (Share #1 → Email #2 → Referral → Declaration)
// 📌 모든 API 호출은 /api/type-* 경로 사용 (A안 완전 분리)
//
// ✅ 수정사항 (V9 → V10):
//   1. useEffect dependency [] 로 변경 (불필요한 declarations re-fetch 방지)
//   2. Progress bar 퀴즈 단계별 업데이트 (10% → 30% → 60% → 90% → 100%)
//   3. Clipboard HTTPS fallback 추가 (HTTP 환경에서도 복사 작동)
//   4. 이메일 에러 메시지 분리 ("입력하세요" vs "형식이 틀렸어요")
//   5. safeUUID() — crypto.randomUUID 미지원 환경 fallback
//   6. GA4 quiz_start 재시작 시에도 track (hasStarted ref 제거)
//   7. answers[qi] → answers[answers.length-1] 참조 안전성 개선
//   8. Meta Pixel fbq() 연동 — QuizStart / QuizStep / QuizComplete / Lead / CompleteRegistration
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

// ✅ FIX 5: crypto.randomUUID 미지원 브라우저 fallback
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

// ✅ FIX 3: Clipboard HTTPS fallback
async function safeCopy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // HTTP 또는 구형 브라우저 fallback
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

// ✅ Meta Pixel safe helper — fbq 미로드 시 조용히 무시
function fbq(event: string, name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { fbq?: (...args: unknown[]) => void };
  if (typeof w.fbq === "function") {
    w.fbq(event, name, params);
  }
}

// ─────────────────────────────────────────────────────────────
// Progress 단계 계산
// Hero=0, Quiz q1=25, q2=50, q3=75, Result=100
// ─────────────────────────────────────────────────────────────
function calcQuizProgress(qi: number, total: number): number {
  // 퀴즈 진행 중: 25% ~ 75% 구간에 균등 배치
  return Math.round(25 + (qi / total) * 50);
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

  // ✅ FIX 2: 퀴즈 단계별 progress 업데이트
  useEffect(() => {
    onProgressUpdate(calcQuizProgress(qi, total));
  }, [qi, total, onProgressUpdate]);

  const pick = (group: string) => {
    if (picked) return;
    setPicked(true);

    track.quizStep(qi + 1, group);
    // ✅ Meta Pixel: 퀴즈 단계별 이벤트
    fbq("trackCustom", "QuizStep", { step: qi + 1, answer: group });

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
      // ✅ Meta Pixel: 퀴즈 완료
      fbq("trackCustom", "QuizComplete", { afterfeel_type: result });
      onComplete(result);
    }, 300);
  };

  // ✅ FIX 7: answers[qi] → pickedAnswer로 안전하게 참조
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

  // ✅ FIX 1: dependency [] — type은 바뀌지 않으므로 한 번만 fetch
  useEffect(() => {
    referredBy.current = getReferralFromURL();
    track.typeResult(type);
    // ✅ Meta Pixel: 결과 페이지 진입
    fbq("trackCustom", "TypeResult", { afterfeel_type: type });

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

      // ig / link: safeCopy fallback 적용
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

    // ✅ FIX 4: 에러 메시지 구분
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
        // ga4.ts의 emailSubmit 내부에서 fbq Lead + CompleteRegistration 이미 호출됨
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
      // optimistic UI 그대로 유지
    }
  };

  // ─── Referral Share (이메일 후) ───
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

    // ✅ FIX 3 적용: safeCopy
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
              {/* 오퍼 없음 — 이메일은 무료 얼리액세스로만 제시 */}
              <div className="email-hook">
                <div className="email-hook-head">Be first to try it.</div>
                <div className="email-hook-sub">Early access · First 1,000 members only</div>
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
                      fbq("trackCustom", "EmailFocus", { afterfeel_type: type });
                    }
                  }}
                />
                <button className="email-btn" onClick={submitEmail} disabled={emailLoading}>
                  {emailLoading ? "..." : "Get early access →"}
                </button>
              </div>

              {emailError && <div className="email-error">{emailError}</div>}

              <div className="email-note">Launching Mid-March · No spam, ever.</div>
            </div>
          ) : (
            <div className="email-ok anim-up">
              <div className="email-ok-icon">✓</div>
              <div className="email-ok-head">You&apos;re on the list.</div>

              {/* 오퍼는 이메일 제출 후 보상으로 공개 */}
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

        {/* REFERRAL (이메일 후) */}
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
              <button className="ref-btn ghost" onClick={() => refShare("copy")}>
                {refCopied ? "Copied!" : "Copy your link"}
              </button>
            </div>
          </div>
        )}

        {/* PROOF (이메일 후) */}
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

  // ✅ FIX 6: hasStarted ref 제거 — 재시작 시에도 quizStart track 허용
  // (의도적으로 재시작할 때도 측정이 필요함)

  const handleProgressUpdate = useCallback((p: number) => {
    setProgress(p);
  }, []);

  const startQuiz = () => {
    track.quizStart();
    // ✅ Meta Pixel: 퀴즈 시작
    fbq("trackCustom", "QuizStart");
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
