'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/* ─── Utils ─── */
function getDeviceType(): string {
  if (typeof window === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) return 'mobile';
  return 'desktop';
}

function getUTMParams(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((key) => {
    const val = params.get(key);
    if (val) utm[key] = val;
  });
  return utm;
}

function getOrCreateId(key: string, storage: 'session' | 'local'): string {
  if (typeof window === 'undefined') return '';
  const store = storage === 'session' ? sessionStorage : localStorage;
  let id = store.getItem(key);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    store.setItem(key, id);
  }
  return id;
}

export default function TeaserPage() {
  const [phase, setPhase] = useState(1);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const trackingData = useRef<Record<string, string>>({});
  const sessionId = useRef('');
  const visitorId = useRef('');
  const leadStartFired = useRef(false);
  const scrollLocked = useRef(false);
  const prevPhase = useRef(1);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const utmParams = getUTMParams();
    trackingData.current = {
      device_type: getDeviceType(),
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      referrer: document.referrer || '',
      ...utmParams,
    };
    sessionId.current = getOrCreateId('piilk_session', 'session');
    visitorId.current = getOrCreateId('piilk_visitor', 'local');
    trackEvent('page_view');
  }, []);

  /* ─── Scroll/wheel/touch to change phase ─── */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const go = (dir: 1 | -1) => {
      if (scrollLocked.current) return;
      const next = phase + dir;
      if (next < 1 || next > 3) return;
      scrollLocked.current = true;
      prevPhase.current = phase;
      setPhase(next);
      setTimeout(() => { scrollLocked.current = false; }, 900);
    };

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 30) return;
      go(e.deltaY > 0 ? 1 : -1);
    };

    let touchY = 0;
    const handleTouchStart = (e: TouchEvent) => { touchY = e.touches[0].clientY; };
    const handleTouchEnd = (e: TouchEvent) => {
      const diff = touchY - e.changedTouches[0].clientY;
      if (Math.abs(diff) < 50) return;
      go(diff > 0 ? 1 : -1);
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [phase]);

  /* ─── Track phase views ─── */
  useEffect(() => {
    if (phase === 2) trackEvent('phase_2_view');
    if (phase === 3) trackEvent('phase_3_view');
  }, [phase]);

  /* ─── Event tracking (Supabase) ─── */
  const trackEvent = useCallback((eventName: string, eventData?: Record<string, any>) => {
    const td = trackingData.current;
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: eventName,
        event_data: eventData || null,
        session_id: sessionId.current,
        visitor_id: visitorId.current,
        device_type: td.device_type || null,
        referrer: td.referrer || null,
        utm_source: td.utm_source || null,
        utm_medium: td.utm_medium || null,
        utm_campaign: td.utm_campaign || null,
      }),
    }).catch(() => {});
  }, []);

  const handleEmailFocus = useCallback(() => {
    if (!leadStartFired.current) {
      leadStartFired.current = true;
      trackEvent('lead_start');
    }
  }, [trackEvent]);

  const handleSubmit = async (source: string) => {
    if (!email || !email.includes('@') || !email.includes('.') || isSubmitting || isSubmitted) return;
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          segment: 'direct',
          answers: { sub_reason: '' },
          tracking: trackingData.current,
        }),
      });
      const data = await response.json();
      if (data.success) {
        trackEvent('lead_submit', {
          segment: 'direct',
          sub_reason: '',
          email_domain: email.split('@')[1] || '',
          source,
        });
        if (typeof window !== 'undefined' && window.gtag) {
          window.gtag('event', 'generate_lead', { method: 'email_signup', signup_source: source });
        }
        setIsSubmitted(true);
      } else {
        alert(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ─── Email Module ─── */
  const EmailModule = ({ source }: { source: string }) => (
    <div className="email-module">
      {!isSubmitted ? (
        <>
          <div className="email-form-row">
            <input
              type="email"
              className="email-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={handleEmailFocus}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(source); }}
              placeholder="you@email.com"
              autoComplete="email"
              inputMode="email"
              disabled={isSubmitting}
            />
            <button
              className="email-btn"
              onClick={() => handleSubmit(source)}
              disabled={isSubmitting || !email}
            >
              {isSubmitting ? 'Submitting...' : 'Get early access'}
            </button>
          </div>
          <p className="email-trust">No spam. No purchase. Unsubscribe anytime.</p>
        </>
      ) : (
        <p className="email-success">You&apos;re in. Watch for the first note.</p>
      )}
    </div>
  );

  /* ─── Phase position class ─── */
  const getPhaseClass = (n: number) => {
    if (n === phase) return 'center';      // 현재: 화면 중앙
    if (n < phase) return 'above';         // 지나간: 위로 올라감
    return 'below';                        // 다음: 아래에 대기
  };

  return (
    <main className="piilk-page">
      {/* ═══ Fixed Background ═══ */}
      <div className="hero-bg">
        <Image
          src="/hero-bg.png"
          alt="Background"
          fill
          className="hero-bg-img"
          style={{ objectPosition: 'center 35%' }}
          priority
          sizes="100vw"
        />
        <div className="hero-bg-overlay" />
      </div>

      {/* ═══ Content ═══ */}
      <div className="screen-wrap">

        {/* Logo */}
        <header className="logo-header">
          <Image
            src="/pillk-logo.png"
            alt="Piilk"
            width={80}
            height={32}
            className="logo-img"
            onClick={() => { prevPhase.current = phase; setPhase(1); }}
          />
        </header>

        {/* Phase 1 */}
        <div className={`slide slide--${getPhaseClass(1)}`}>
          <div className="slide-inner" onClick={() => { if (phase < 3) { prevPhase.current = phase; setPhase(phase + 1); } }} style={{ cursor: phase < 3 ? 'pointer' : 'default' }}>
            <h1 className="hero-h1">
              Ever Had a Drink<br />That Felt Off<br />Right After?
            </h1>
          </div>
          <div className="scroll-cue-bottom">
            <span>Scroll</span>
            <div className="arrow" />
          </div>
        </div>

        {/* Phase 2 */}
        <div className={`slide slide--${getPhaseClass(2)}`}>
          <div className="slide-inner">
            <h1 className="hero-h1">
              PIILK is built for<br />what&apos;s left behind.
            </h1>
            <p className="hero-desc">Heavy after. Film that lingers. You know the moment.</p>
            <p className="hero-proof">30g protein · 7 ingredients · Dairy-free</p>
            <div className="email-wrap">
              <EmailModule source="hero" />
            </div>
          </div>
          <div className="scroll-cue-bottom">
            <span>Scroll</span>
            <div className="arrow" />
          </div>
        </div>

        {/* Phase 3 */}
        <div className={`slide slide--${getPhaseClass(3)}`}>
          <div className="slide-inner">
            <h2 className="why-title">Why we built PIILK</h2>
            <div className="why-body">
              <p>Most shakes obsess over macros.</p>
              <p>We obsessed over what happens after you drink it.</p>
            </div>
            <div className="cta-wrap">
              <p className="cta-hint">Get the invite when access opens.</p>
              <EmailModule source="cta" />
            </div>
            <div className="footer-area">
              <p className="footer-brand">PIILK™ by ARMORED FRESH</p>
              <p className="footer-sub">RTD High Protein Shake.</p>
            </div>
          </div>
        </div>

        {/* Dots */}
        <nav className="dots">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              className={`dot ${phase === n ? 'active' : ''}`}
              onClick={() => { prevPhase.current = phase; setPhase(n); }}
              aria-label={`Section ${n}`}
            />
          ))}
        </nav>
      </div>

      <style jsx global>{`
        :root {
          --accent:       #A8BF00;
          --accent-hover: #C2D91A;
          --success:      #00FF88;
          --muted:        #888888;
          --secondary:    #CCCCCC;
          --input-bg:     rgba(17,17,17,0.7);
          --border:       rgba(255,255,255,0.1);
          --radius:       12px;
          --tap:          52px;
          --font:         'DM Sans', system-ui, sans-serif;
        }

        html, body { margin:0; padding:0; overflow:hidden; height:100%; }

        .piilk-page {
          position: fixed; inset: 0;
          background: #000;
          color: #fff;
          font-family: var(--font);
          -webkit-font-smoothing: antialiased;
        }

        /* ── BG ── */
        .hero-bg { position:fixed; inset:0; z-index:0; }
        .hero-bg-img { object-fit:cover; transform:scale(1.1); }
        .hero-bg-overlay {
          position:absolute; inset:0;
          background: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.65) 100%);
        }

        /* ── Screen ── */
        .screen-wrap { position:relative; z-index:1; width:100%; height:100%; overflow:hidden; }

        /* ── Logo ── */
        .logo-header {
          position:absolute; top:20px; left:50%; transform:translateX(-50%); z-index:10;
        }
        .logo-img { opacity:0.9; cursor:pointer; transition:opacity 0.3s; }
        .logo-img:hover { opacity:0.6; }

        /* ══════════════════════════════════════
           SLIDES — vertical carousel
           ══════════════════════════════════════
           center = 현재 보이는 (translateY 0)
           above  = 위로 사라짐 (translateY -100vh)
           below  = 아래에 대기 (translateY +100vh)
        */
        .slide {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 80px 24px 40px;
          transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1),
                      opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1);
          will-change: transform, opacity;
        }

        .slide--center {
          transform: translateY(0);
          opacity: 1;
          pointer-events: auto;
        }
        .slide--above {
          transform: translateY(-100vh);
          opacity: 0;
          pointer-events: none;
        }
        .slide--below {
          transform: translateY(100vh);
          opacity: 0;
          pointer-events: none;
        }

        .slide-inner {
          max-width: 680px;
          width: 100%;
        }

        /* ── Typography ── */
        .hero-h1 {
          font-family: var(--font);
          font-size: clamp(28px, 7vw, 52px);
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -0.01em;
        }
        .hero-desc {
          margin-top: 16px;
          font-size: 15px;
          line-height: 1.5;
          color: var(--secondary);
        }
        .hero-proof {
          margin-top: 10px;
          font-size: 13px;
          color: var(--muted);
          letter-spacing: 0.02em;
        }

        .why-title {
          font-family: var(--font);
          font-size: clamp(26px, 6vw, 46px);
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -0.01em;
          margin-bottom: 16px;
        }
        .why-body {
          font-size: 15px;
          line-height: 1.5;
          color: var(--secondary);
        }
        .why-body p + p { margin-top: 6px; }

        /* ── Email wrap ── */
        .email-wrap, .cta-wrap {
          margin-top: 32px;
          max-width: 460px;
          margin-left: auto;
          margin-right: auto;
        }
        .cta-hint {
          font-size: 15px;
          color: var(--secondary);
          margin-bottom: 16px;
        }

        /* ── Scroll cue — fixed at bottom of slide ── */
        .scroll-cue-bottom {
          position: absolute;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          opacity: 0.4;
        }
        .scroll-cue-bottom span {
          font-size: 12px;
          color: var(--muted);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .scroll-cue-bottom .arrow {
          width: 16px; height: 16px;
          border-right: 1.5px solid var(--muted);
          border-bottom: 1.5px solid var(--muted);
          transform: rotate(45deg);
          animation: bounce 2s ease-in-out infinite;
        }
        @keyframes bounce {
          0%,100% { transform: rotate(45deg) translateY(0); }
          50%     { transform: rotate(45deg) translateY(5px); }
        }

        /* ── Footer ── */
        .footer-area { margin-top: 40px; }
        .footer-brand {
          font-size: 9px; letter-spacing: 0.25em;
          color: var(--muted); text-transform: uppercase; font-weight: 500;
        }
        .footer-sub {
          font-size: 9px; letter-spacing: 0.15em;
          color: var(--muted); margin-top: 4px; font-weight: 500;
        }

        /* ══════════════════════════════════════
           EMAIL MODULE
           ══════════════════════════════════════ */
        .email-module { width: 100%; }
        .email-form-row {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .email-input {
          width: 100%;
          height: var(--tap);
          padding: 14px;
          background: var(--input-bg);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: #fff;
          font-family: var(--font);
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .email-input::placeholder { color: var(--muted); }
        .email-input:focus { border-color: var(--accent); }
        .email-input:disabled { opacity: 0.4; cursor: not-allowed; }

        .email-btn {
          width: 100%;
          height: var(--tap);
          background: var(--accent);
          color: #000;
          border: none;
          border-radius: var(--radius);
          font-family: var(--font);
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s;
        }
        .email-btn:hover { background: var(--accent-hover); }
        .email-btn:active { transform: scale(0.98); }
        .email-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .email-trust {
          margin-top: 10px;
          font-size: 12px;
          color: var(--muted);
          text-align: center;
        }
        .email-success {
          font-size: 14px;
          color: var(--success);
          font-weight: 500;
          text-align: center;
          animation: fadeIn 300ms ease forwards;
        }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

        /* ── Dots ── */
        .dots {
          position: absolute;
          right: 20px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          gap: 12px;
          z-index: 10;
        }
        .dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.3);
          background: transparent;
          cursor: pointer;
          padding: 0;
          transition: all 0.3s;
        }
        .dot.active {
          background: var(--accent);
          border-color: var(--accent);
          transform: scale(1.3);
        }
        .dot:hover { border-color: rgba(255,255,255,0.6); }

        /* ── Desktop ── */
        @media (min-width: 768px) {
          .email-form-row { flex-direction: row; }
          .email-form-row .email-input { flex: 1; min-width: 0; }
          .email-form-row .email-btn { width: auto; min-width: 180px; flex-shrink: 0; }
        }
      `}</style>
    </main>
  );
}
