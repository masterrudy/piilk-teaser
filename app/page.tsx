'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/* ─── 디바이스/브라우저 자동 감지 유틸 ─── */
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

/* ─── Session/Visitor ID 생성 ─── */
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

  // ✅ 자동 수집 데이터
  const trackingData = useRef<Record<string, string>>({});
  const sessionId = useRef('');
  const visitorId = useRef('');
  const leadStartFired = useRef(false);
  const scrollLocked = useRef(false);

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

    // ✅ Track page_view
    trackEvent('page_view');
  }, []);

  /* ─── ✅ Scroll/wheel to advance phase ─── */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleWheel = (e: WheelEvent) => {
      if (scrollLocked.current) return;
      if (e.deltaY > 30 && phase < 3) {
        scrollLocked.current = true;
        setPhase((p) => Math.min(p + 1, 3));
        setTimeout(() => { scrollLocked.current = false; }, 800);
      } else if (e.deltaY < -30 && phase > 1) {
        scrollLocked.current = true;
        setPhase((p) => Math.max(p - 1, 1));
        setTimeout(() => { scrollLocked.current = false; }, 800);
      }
    };

    // Touch support
    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (scrollLocked.current) return;
      const diff = touchStartY - e.changedTouches[0].clientY;
      if (diff > 50 && phase < 3) {
        scrollLocked.current = true;
        setPhase((p) => Math.min(p + 1, 3));
        setTimeout(() => { scrollLocked.current = false; }, 800);
      } else if (diff < -50 && phase > 1) {
        scrollLocked.current = true;
        setPhase((p) => Math.max(p - 1, 1));
        setTimeout(() => { scrollLocked.current = false; }, 800);
      }
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

  /* ─── ✅ Track phase changes ─── */
  useEffect(() => {
    if (phase === 2) trackEvent('phase_2_view');
    if (phase === 3) trackEvent('phase_3_view');
  }, [phase]);

  /* ─── ✅ Event tracking (Supabase) ─── */
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

  /* ─── ✅ Email focus (lead_start) ─── */
  const handleEmailFocus = useCallback(() => {
    if (!leadStartFired.current) {
      leadStartFired.current = true;
      trackEvent('lead_start');
    }
  }, [trackEvent]);

  /* ─── ✅ Email submit ─── */
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
          window.gtag('event', 'generate_lead', {
            method: 'email_signup',
            signup_source: source,
          });
        }

        setIsSubmitted(true);
      } else {
        alert(data.error || 'Something went wrong. Please try again.');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ─── Click to advance ─── */
  const handleAdvance = () => {
    if (phase < 3) setPhase((p) => p + 1);
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

  /* ─── Phase indicator dots ─── */
  const PhaseDots = () => (
    <div className="phase-dots">
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          className={`phase-dot ${phase === n ? 'active' : ''}`}
          onClick={() => setPhase(n)}
          aria-label={`Go to section ${n}`}
        />
      ))}
    </div>
  );

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

      {/* ═══ Fixed Full-screen Content ═══ */}
      <div className="screen-container">

        {/* ── Logo ── */}
        <header className="logo-header">
          <Image
            src="/pillk-logo.png"
            alt="Piilk"
            width={80}
            height={32}
            className="logo-img"
            onClick={() => setPhase(1)}
          />
        </header>

        {/* ── Phase 1 ── */}
        <div className={`phase phase-1 ${phase === 1 ? 'active' : ''}`}>
          <div className="phase-content" onClick={handleAdvance} style={{ cursor: 'pointer' }}>
            <h1 className="hero-h1">
              Ever Had a Drink<br />That Felt Off<br />Right After?
            </h1>
            <div className="scroll-cue">
              <span>Scroll</span>
              <div className="arrow" />
            </div>
          </div>
        </div>

        {/* ── Phase 2 ── */}
        <div className={`phase phase-2 ${phase === 2 ? 'active' : ''}`}>
          <div className="phase-content">
            <h1 className="hero-h1">
              PIILK is built for<br />what&apos;s left behind.
            </h1>
            <p className="hero-desc">Heavy after. Film that lingers. You know the moment.</p>
            <p className="hero-proof">30g protein · 7 ingredients · Dairy-free</p>
            <div className="hero-email-wrap">
              <EmailModule source="hero" />
            </div>
          </div>
        </div>

        {/* ── Phase 3 ── */}
        <div className={`phase phase-3 ${phase === 3 ? 'active' : ''}`}>
          <div className="phase-content">
            <h2 className="why-title">Why we built PIILK</h2>
            <div className="why-body">
              <p>Most shakes obsess over macros.</p>
              <p>We obsessed over what happens after you drink it.</p>
            </div>
            <div className="phase3-cta">
              <p className="cta-hint">Get the invite when access opens.</p>
              <EmailModule source="cta" />
            </div>
            <footer className="piilk-footer">
              <p className="footer-brand">PIILK™ by ARMORED FRESH</p>
              <p className="footer-sub">RTD High Protein Shake.</p>
            </footer>
          </div>
        </div>

        {/* ── Phase dots ── */}
        <PhaseDots />
      </div>

      <style jsx global>{`
        :root {
          --bg:             #000000;
          --text-primary:   #FFFFFF;
          --text-secondary: #CCCCCC;
          --text-muted:     #888888;
          --accent:         #A8BF00;
          --accent-hover:   #C2D91A;
          --border:         #1A1A1A;
          --input-bg:       rgba(17, 17, 17, 0.7);
          --success:        #00FF88;
          --radius:         12px;
          --tap:            52px;
          --font-display:   'DM Sans', system-ui, sans-serif;
          --font-body:      'DM Sans', system-ui, sans-serif;
        }

        html, body {
          margin: 0; padding: 0;
          overflow: hidden;
          height: 100%;
        }
        .piilk-page {
          position: fixed;
          inset: 0;
          background: var(--bg);
          color: var(--text-primary);
          font-family: var(--font-body);
          -webkit-font-smoothing: antialiased;
        }

        /* ── Background ── */
        .hero-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
        }
        .hero-bg-img {
          object-fit: cover;
          transform: scale(1.1);
        }
        .hero-bg-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg,
            rgba(0,0,0,0.15) 0%,
            rgba(0,0,0,0.25) 40%,
            rgba(0,0,0,0.6) 100%
          );
        }

        /* ── Screen container ── */
        .screen-container {
          position: relative;
          z-index: 1;
          width: 100%;
          height: 100%;
        }

        /* ── Logo ── */
        .logo-header {
          position: absolute;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
        }
        .logo-img {
          opacity: 0.9;
          cursor: pointer;
          transition: opacity 0.3s;
        }
        .logo-img:hover { opacity: 0.6; }

        /* ── Phases ── */
        .phase {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 0 24px;
          opacity: 0;
          transform: translateY(30px);
          pointer-events: none;
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .phase.active {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        .phase-content {
          max-width: 680px;
          width: 100%;
        }

        /* ── Phase 2 specific — push content lower ── */
        .phase.phase-2 {
          align-items: flex-end;
          padding-bottom: 12vh;
        }

        /* ── H1 ── */
        .hero-h1 {
          font-family: var(--font-display);
          font-size: clamp(28px, 7vw, 52px);
          font-weight: 700;
          line-height: 1.15;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }
        .hero-desc {
          margin-top: 16px;
          font-size: 15px;
          line-height: 1.5;
          color: var(--text-secondary);
        }
        .hero-proof {
          margin-top: 10px;
          font-size: 13px;
          color: var(--text-muted);
          letter-spacing: 0.02em;
        }
        .hero-email-wrap {
          margin-top: 28px;
          max-width: 460px;
          margin-left: auto;
          margin-right: auto;
          text-align: left;
        }

        /* ── Scroll cue ── */
        .scroll-cue {
          margin-top: 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          opacity: 0.4;
        }
        .scroll-cue span {
          font-size: 12px;
          color: var(--text-muted);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .scroll-cue .arrow {
          width: 16px; height: 16px;
          border-right: 1.5px solid var(--text-muted);
          border-bottom: 1.5px solid var(--text-muted);
          transform: rotate(45deg);
          animation: bounce 2s ease-in-out infinite;
        }
        @keyframes bounce {
          0%, 100% { transform: rotate(45deg) translateY(0); }
          50% { transform: rotate(45deg) translateY(5px); }
        }

        /* ── Phase 3 specific — push content lower ── */
        .phase.phase-3 {
          align-items: flex-end;
          padding-bottom: 8vh;
        }

        /* ── Phase 3 ── */
        .why-title {
          font-family: var(--font-display);
          font-size: clamp(26px, 6vw, 46px);
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 16px;
          line-height: 1.15;
          letter-spacing: -0.01em;
        }
        .why-body {
          font-size: 15px;
          line-height: 1.5;
          color: var(--text-secondary);
        }
        .why-body p + p { margin-top: 6px; }
        .phase3-cta {
          margin-top: 48px;
          max-width: 460px;
          margin-left: auto;
          margin-right: auto;
          text-align: center;
        }
        .cta-hint {
          font-size: 15px;
          color: var(--text-secondary);
          margin-bottom: 16px;
        }
        .piilk-footer {
          margin-top: 40px;
          text-align: center;
        }
        .footer-brand {
          font-size: 9px;
          letter-spacing: 0.25em;
          color: var(--text-muted);
          text-transform: uppercase;
          font-weight: 500;
        }
        .footer-sub {
          font-size: 9px;
          letter-spacing: 0.15em;
          color: var(--text-muted);
          margin-top: 4px;
          font-weight: 500;
        }

        /* ── Email module ── */
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
          color: var(--text-primary);
          font-family: var(--font-body);
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .email-input::placeholder { color: var(--text-muted); }
        .email-input:focus { border-color: var(--accent); }
        .email-input:disabled { opacity: 0.4; cursor: not-allowed; }

        .email-btn {
          width: 100%;
          height: var(--tap);
          background: var(--accent);
          color: var(--bg);
          border: none;
          border-radius: var(--radius);
          font-family: var(--font-body);
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
          color: var(--text-muted);
          text-align: center;
        }
        .email-success {
          margin-top: 10px;
          font-size: 14px;
          color: var(--success);
          font-weight: 500;
          text-align: center;
          animation: fadeIn 300ms ease forwards;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* ── Phase dots ── */
        .phase-dots {
          position: absolute;
          right: 20px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          gap: 12px;
          z-index: 10;
        }
        .phase-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.3);
          background: transparent;
          cursor: pointer;
          padding: 0;
          transition: all 0.3s ease;
        }
        .phase-dot.active {
          background: var(--accent);
          border-color: var(--accent);
          transform: scale(1.3);
        }
        .phase-dot:hover {
          border-color: rgba(255,255,255,0.6);
        }

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
