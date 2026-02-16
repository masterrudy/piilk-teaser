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
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [heroSwapped, setHeroSwapped] = useState(false);

  // ✅ 자동 수집 데이터 (한 번만 캡처)
  const trackingData = useRef<Record<string, string>>({});
  const sessionId = useRef('');
  const visitorId = useRef('');
  const leadStartFired = useRef(false);
  const scrollMilestones = useRef<Record<number, boolean>>({ 25: false, 50: false, 75: false });

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

  /* ─── ✅ Hero scroll swap ─── */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScroll = () => {
      const heroZone = document.getElementById('heroZone');
      if (!heroZone) return;

      const rect = heroZone.getBoundingClientRect();
      const zoneH = heroZone.offsetHeight - window.innerHeight;
      const scrolled = -rect.top;
      const progress = Math.max(0, Math.min(1, scrolled / zoneH));

      if (progress > 0.3 && !heroSwapped) {
        setHeroSwapped(true);
      } else if (progress <= 0.2 && heroSwapped) {
        setHeroSwapped(false);
      }

      // ✅ Scroll depth tracking
      const totalScroll = document.body.scrollHeight - window.innerHeight;
      const scrollPct = totalScroll > 0 ? (window.scrollY / totalScroll) * 100 : 0;
      const st = scrollMilestones.current;
      if (scrollPct >= 25 && !st[25]) { trackEvent('scroll_25'); st[25] = true; }
      if (scrollPct >= 50 && !st[50]) { trackEvent('scroll_50'); st[50] = true; }
      if (scrollPct >= 75 && !st[75]) { trackEvent('scroll_75'); st[75] = true; }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [heroSwapped]);

  /* ─── ✅ Scroll reveal observer ─── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  /* ─── ✅ Event tracking function (Supabase) ─── */
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
    }).catch(() => {}); // fire-and-forget
  }, []);

  /* ─── ✅ Email focus handler (lead_start) ─── */
  const handleEmailFocus = useCallback(() => {
    if (!leadStartFired.current) {
      leadStartFired.current = true;
      trackEvent('lead_start');
    }
  }, [trackEvent]);

  /* ─── ✅ Email submit handler ─── */
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
        // ✅ Supabase: track lead_submit
        trackEvent('lead_submit', {
          segment: 'direct',
          sub_reason: '',
          email_domain: email.split('@')[1] || '',
          source,
        });

        // ✅ Google Analytics: generate_lead
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

  /* ─── Email Module (재사용) ─── */
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

      {/* ═══ HERO SCROLL ZONE ═══ */}
      <div className="hero-scroll-zone" id="heroZone">
        <div className="hero-sticky">
          <div className="hero-text-wrap">

            {/* ── Logo ── */}
            <div className="hero-logo">
              <Image
                src="/pillk-logo.png"
                alt="Piilk"
                width={80}
                height={32}
                className="logo-img"
              />
            </div>

            {/* ── Phase 1: Opening question ── */}
            <div className={`hero-phase phase-1 ${heroSwapped ? 'out' : ''}`}>
              <h1 className="hero-h1">
                Ever Had a Drink<br />That Felt Off Right After?
              </h1>
              <div className={`hero-scroll-cue ${heroSwapped ? 'hidden' : ''}`}>
                <span>Scroll</span>
                <div className="arrow" />
              </div>
            </div>

            {/* ── Phase 2: Brand answer + email ── */}
            <div className={`hero-phase phase-2 ${heroSwapped ? 'in' : ''}`}>
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
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="content-sections">
        {/* ── WHY ── */}
        <section className="why-section">
          <div className="why-inner reveal">
            <h2>Why we built PIILK</h2>
            <div className="why-body">
              <p>Most shakes obsess over macros.</p>
              <p>We obsessed over what happens after you drink it.</p>
            </div>
          </div>
        </section>

        {/* ── Second CTA ── */}
        <section className="cta2-section">
          <div className="cta2-inner reveal">
            <p className="cta2-hint">Get the invite when access opens.</p>
            <EmailModule source="cta" />
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="piilk-footer">
          <p className="footer-brand">PIILK™ by ARMORED FRESH</p>
          <p className="footer-sub">RTD High Protein Shake.</p>
        </footer>
      </div>

      <style jsx global>{`
        /* ══════════════════════════════════════
           CSS VARIABLES — NEON DARK SYSTEM
           ══════════════════════════════════════ */
        :root {
          --bg:             #000000;
          --text-primary:   #FFFFFF;
          --text-secondary: #CCCCCC;
          --text-muted:     #888888;
          --accent:         #D4FF00;
          --accent-hover:   #E5FF33;
          --border:         #1A1A1A;
          --input-bg:       #111111;
          --success:        #00FF88;

          --max-w: 640px;
          --px: 24px;
          --radius: 12px;
          --tap: 52px;

          --font-display: 'DM Sans', system-ui, sans-serif;
          --font-body:    'DM Sans', system-ui, sans-serif;
        }

        /* ══════════════════════════════════════
           BASE
           ══════════════════════════════════════ */
        .piilk-page {
          background: var(--bg);
          color: var(--text-primary);
          font-family: var(--font-body);
          line-height: 1.4;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        /* ══════════════════════════════════════
           FIXED BACKGROUND IMAGE
           ══════════════════════════════════════ */
        .hero-bg {
          position: fixed;
          top: 0; left: 0;
          width: 100%; height: 100vh;
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
            rgba(0, 0, 0, 0.1) 0%,
            rgba(0, 0, 0, 0.2) 40%,
            rgba(0, 0, 0, 0.55) 100%
          );
        }

        /* ══════════════════════════════════════
           HERO SCROLL ZONE
           ══════════════════════════════════════ */
        .hero-scroll-zone {
          position: relative;
          z-index: 1;
          height: 200vh;
        }
        .hero-sticky {
          position: sticky;
          top: 0;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 0 var(--px);
        }
        .hero-text-wrap {
          max-width: 680px;
          position: relative;
          width: 100%;
        }

        /* ── Logo ── */
        .hero-logo {
          position: absolute;
          top: -120px;
          left: 50%;
          transform: translateX(-50%);
        }
        .logo-img {
          opacity: 0.9;
          transition: opacity 0.3s ease;
        }
        .logo-img:hover {
          opacity: 0.6;
        }

        /* ── Hero phases ── */
        .hero-phase {
          transition: opacity 0.5s ease, transform 0.5s ease;
        }
        .phase-1 {
          opacity: 1;
          transform: translateY(0);
        }
        .phase-1.out {
          opacity: 0;
          transform: translateY(-20px);
        }
        .phase-2 {
          position: absolute;
          top: 0; left: 0; right: 0;
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.5s ease 0.15s, transform 0.5s ease 0.15s;
        }
        .phase-2.in {
          opacity: 1;
          transform: translateY(0);
        }

        .hero-h1 {
          font-family: var(--font-display);
          font-size: clamp(30px, 7vw, 52px);
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
          margin-top: 24px;
          width: 100%;
          max-width: 420px;
          margin-left: auto;
          margin-right: auto;
          text-align: left;
        }

        /* ── Scroll cue ── */
        .hero-scroll-cue {
          margin-top: 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          opacity: 0.4;
          transition: opacity 0.3s ease;
        }
        .hero-scroll-cue.hidden { opacity: 0; }
        .hero-scroll-cue span {
          font-size: 12px;
          color: var(--text-muted);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .hero-scroll-cue .arrow {
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

        /* ══════════════════════════════════════
           CONTENT SECTIONS
           ══════════════════════════════════════ */
        .content-sections {
          position: relative;
          z-index: 2;
        }

        /* ── Email Module ── */
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
        }
        .email-success {
          margin-top: 10px;
          font-size: 14px;
          color: var(--success);
          font-weight: 500;
          animation: fadeIn 150ms ease forwards;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* ── WHY Section ── */
        .why-section {
          padding: 100px var(--px) 80px;
          background: var(--bg);
        }
        .why-inner {
          max-width: var(--max-w);
          margin: 0 auto;
          text-align: center;
        }
        .why-section h2 {
          font-family: var(--font-display);
          font-size: clamp(30px, 7vw, 52px);
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

        /* ── Second CTA ── */
        .cta2-section {
          padding: 80px var(--px) 100px;
          background: var(--bg);
        }
        .cta2-inner {
          max-width: var(--max-w);
          margin: 0 auto;
          text-align: center;
        }
        .cta2-hint {
          font-size: 15px;
          color: var(--text-secondary);
          margin-bottom: 20px;
          line-height: 1.5;
        }

        /* ── Footer ── */
        .piilk-footer {
          padding: 40px var(--px) 60px;
          background: var(--bg);
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

        /* ── Scroll reveal ── */
        .reveal {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .reveal.visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── Desktop ── */
        @media (min-width: 768px) {
          .why-section { padding: 120px 48px 100px; }
          .cta2-section { padding: 100px 48px 120px; }
          .email-form-row { flex-direction: row; }
          .email-form-row .email-input { flex: 1; min-width: 0; }
          .email-form-row .email-btn { width: auto; min-width: 180px; flex-shrink: 0; }
        }
      `}</style>
    </main>
  );
}
