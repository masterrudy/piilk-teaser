'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

/* ─── EmailForm ─── */
interface EmailFormProps {
  email: string;
  isSubmitted: boolean;
  isSubmitting: boolean;
  source: string;
  onEmailChange: (v: string) => void;
  onFocus: () => void;
  onSubmit: (source: string) => void;
}
function EmailForm({
  email, isSubmitted, isSubmitting, source,
  onEmailChange, onFocus, onSubmit,
}: EmailFormProps) {
  if (isSubmitted) {
    return <p className="email-success">You&apos;re in. Watch for the first note.</p>;
  }
  return (
    <div className="email-module">
      <div className="email-form-row">
        <input
          type="email"
          className="email-input"
          value={email}
          onChange={(e) => onEmailChange(e.target.value.replace(/[^a-zA-Z0-9@._+\-]/g, ''))}
          onCompositionStart={(e) => e.preventDefault()}
          onFocus={onFocus}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(source); }}
          placeholder="you@email.com"
          autoComplete="email"
          inputMode="email"
          disabled={isSubmitting}
          style={{ imeMode: 'disabled' } as React.CSSProperties}
        />
        <button
          type="button"
          className="email-btn"
          onClick={() => onSubmit(source)}
          disabled={isSubmitting || !email}
        >
          {isSubmitting ? 'Submitting...' : 'Get Early Access →'}
        </button>
      </div>
      <p className="email-trust">No purchase required · No spam · Unsubscribe anytime</p>
    </div>
  );
}

/* ─── Helpers ─── */
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

/* ─── Spot Counter (simulated social proof) ─── */
function useSpotCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    // Base count: grows ~8/day from launch date (Jan 21)
    const launchDate = new Date('2026-01-21').getTime();
    const now = Date.now();
    const daysSinceLaunch = Math.floor((now - launchDate) / (1000 * 60 * 60 * 24));
    const base = Math.min(Math.floor(daysSinceLaunch * 8.3 + 47), 940);
    setCount(base);
  }, []);
  return count;
}

/* ─── Main Page ─── */
export default function TeaserPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const trackingData = useRef<Record<string, string>>({});
  const sessionId = useRef('');
  const visitorId = useRef('');
  const leadStartFired = useRef(false);
  const spotCount = useSpotCount();

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trackEvent = useCallback((eventName: string, eventData?: Record<string, unknown>) => {
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
    const w = window as unknown as { gtag?: (...a: unknown[]) => void };
    if (typeof window !== 'undefined' && w.gtag) {
      w.gtag('event', eventName, { variant: 'main', ...eventData });
    }
  }, []);

  const handleEmailFocus = useCallback(() => {
    if (!leadStartFired.current) {
      leadStartFired.current = true;
      trackEvent('lead_start');
    }
  }, [trackEvent]);

  const handleSubmit = useCallback(async (source: string) => {
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
        const w = window as unknown as {
          gtag?: (...a: unknown[]) => void;
          fbq?: (...a: unknown[]) => void;
          ttq?: { track: (...a: unknown[]) => void };
        };
        if (typeof window !== 'undefined') {
          if (w.gtag) {
            w.gtag('event', 'generate_lead', { method: 'email_signup', signup_source: source });
          }
          if (w.fbq) {
            w.fbq('track', 'Lead', { content_name: 'piilk_main_teaser', content_category: 'teaser_signup' });
            w.fbq('track', 'CompleteRegistration', { content_name: 'piilk_main_teaser', value: 1, currency: 'USD' });
          }
          if (w.ttq) {
            w.ttq.track('SubmitForm', { content_name: 'piilk_main_teaser' });
            w.ttq.track('CompleteRegistration', { content_name: 'piilk_main_teaser', value: 1, currency: 'USD' });
          }
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
  }, [email, isSubmitting, isSubmitted, trackEvent]);

  // Track "learn more" scroll
  useEffect(() => {
    if (showMore) trackEvent('section_why_view');
  }, [showMore, trackEvent]);

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

      <div className="page-scroll">
        {/* ═══ HERO SECTION — Everything above the fold ═══ */}
        <section className="hero-section">
          {/* Logo */}
          <header className="logo-header">
            <Image
              src="/pillk-logo.png"
              alt="Piilk"
              width={80}
              height={32}
              className="logo-img"
            />
          </header>

          <div className="hero-content">
            {/* Launch Badge */}
            <p className="launch-badge">Launching Mid-March in NYC</p>

            {/* ✅ CHANGED: Value-prop headline replaces question */}
            <h1 className="hero-h1">
              30g Protein.<br />
              Nothing After. Period.
            </h1>

            <p className="hero-desc">
              No film. No aftertaste. No regret.<br />
              The clean protein shake you&apos;ve been waiting for.
            </p>

            <p className="hero-proof">Dairy-free · 7 ingredients · No artificial sweeteners</p>

            {/* ✅ CHANGED: $2.99 offer box — immediately visible */}
            {!isSubmitted && (
              <div className="offer-box">
                <div className="offer-price-row">
                  <span className="offer-price">$2.99</span>
                  <span className="offer-detail">3 bottles · Free shipping</span>
                </div>
                <p className="offer-sub">
                  Worth $13.47 — Love it? $2.99 back on your first 6-pack.
                </p>
              </div>
            )}

            {/* ✅ Submitted confirmation */}
            {isSubmitted && (
              <div className="offer-box offer-confirmed">
                <div className="offer-price-row">
                  <span className="offer-price">$2.99</span>
                  <span className="offer-detail">3 bottles · Free shipping</span>
                </div>
                <p className="offer-sub">
                  You&apos;re locked in. We&apos;ll reach out before launch.
                </p>
              </div>
            )}

            {/* ✅ CHANGED: Email form immediately in hero */}
            <div className="email-wrap">
              <EmailForm
                email={email}
                isSubmitted={isSubmitted}
                isSubmitting={isSubmitting}
                source="hero"
                onEmailChange={setEmail}
                onFocus={handleEmailFocus}
                onSubmit={handleSubmit}
              />
            </div>

            {/* ✅ NEW: Live spot counter */}
            {!isSubmitted && spotCount > 0 && (
              <p className="spot-counter">
                <span className="spot-dot" />
                {spotCount.toLocaleString()} / 1,000 early access spots claimed
              </p>
            )}
          </div>

          {/* ✅ CHANGED: "Learn more" replaces mandatory scroll */}
          {!isSubmitted && (
            <button
              className="learn-more-cue"
              onClick={() => {
                setShowMore(true);
                setTimeout(() => {
                  document.getElementById('why-section')?.scrollIntoView({ behavior: 'smooth' });
                }, 50);
              }}
            >
              <span>Learn more</span>
              <div className="arrow" />
            </button>
          )}
        </section>

        {/* ═══ SECTION 2 — Optional "Why" (below fold) ═══ */}
        {showMore && (
          <section className="why-section" id="why-section">
            <div className="why-inner">
              <h2 className="why-title">Why we built PIILK</h2>
              <div className="why-body">
                <p>Most shakes obsess over macros.</p>
                <p>We obsessed over what happens <em>after</em> you drink it.</p>
              </div>
              <p className="why-sub">Launching Mid-March. Your sample is on us.</p>

              {/* Second CTA */}
              <div className="cta-wrap">
                <EmailForm
                  email={email}
                  isSubmitted={isSubmitted}
                  isSubmitting={isSubmitting}
                  source="cta"
                  onEmailChange={setEmail}
                  onFocus={handleEmailFocus}
                  onSubmit={handleSubmit}
                />
              </div>

              <div className="footer-area">
                <p className="footer-brand">PIILK™ by ARMORED FRESH</p>
                <p className="footer-sub">RTD High Protein Shake.</p>
              </div>
            </div>
          </section>
        )}
      </div>

      <style jsx global>{`
        :root {
          --accent:       #BFFF00;
          --accent-hover: #D4FF33;
          --success:      #00FF88;
          --muted:        #888888;
          --secondary:    #CCCCCC;
          --input-bg:     rgba(17,17,17,0.7);
          --border:       rgba(255,255,255,0.1);
          --radius:       12px;
          --tap:          52px;
          --font:         'DM Sans', system-ui, sans-serif;
        }
        html, body { margin:0; padding:0; height:100%; }
        
        /* ── Page: normal scroll, no snap ── */
        .piilk-page {
          position: relative;
          min-height: 100vh;
          background: #000;
          color: #fff;
          font-family: var(--font);
          -webkit-font-smoothing: antialiased;
        }
        .hero-bg { position:fixed; inset:0; z-index:0; }
        .hero-bg-img { object-fit:cover; transform:scale(1.1); }
        .hero-bg-overlay {
          position:absolute; inset:0;
          background: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.65) 100%);
        }
        .page-scroll {
          position: relative;
          z-index: 1;
        }

        /* ── Hero Section: full viewport ── */
        .hero-section {
          position: relative;
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 24px 60px;
          text-align: center;
        }
        .logo-header {
          position: absolute;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
        }
        .logo-img { opacity: 0.9; }

        /* ── Hero Content ── */
        .hero-content {
          max-width: 520px;
          width: 100%;
          animation: heroFadeIn 0.6s ease-out;
        }
        @keyframes heroFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Launch Badge ── */
        .launch-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--accent);
          border: 1px solid rgba(191,255,0,0.3);
          border-radius: 20px;
          padding: 4px 14px;
          margin-bottom: 20px;
        }

        /* ── Headline ── */
        .hero-h1 {
          font-family: var(--font);
          font-size: clamp(30px, 7vw, 52px);
          font-weight: 700;
          line-height: 1.12;
          letter-spacing: -0.02em;
          margin-bottom: 14px;
        }
        .hero-desc {
          font-size: 15px;
          line-height: 1.6;
          color: var(--secondary);
          margin-bottom: 6px;
        }
        .hero-proof {
          font-size: 12px;
          color: var(--muted);
          letter-spacing: 0.04em;
        }

        /* ── Offer Box ── */
        .offer-box {
          margin: 20px auto 0;
          max-width: 420px;
          background: rgba(191,255,0,0.06);
          border: 1px solid rgba(191,255,0,0.2);
          border-radius: 12px;
          padding: 16px 20px;
        }
        .offer-confirmed {
          background: rgba(191,255,0,0.1);
          animation: fadeIn 400ms ease forwards;
        }
        .offer-price-row {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 10px;
          margin-bottom: 6px;
        }
        .offer-price {
          font-size: 28px;
          font-weight: 800;
          color: var(--accent);
          letter-spacing: -0.02em;
        }
        .offer-detail {
          font-size: 14px;
          color: var(--secondary);
          font-weight: 500;
        }
        .offer-sub {
          font-size: 12px;
          color: var(--muted);
          margin: 0;
          line-height: 1.5;
        }

        /* ── Spot Counter ── */
        .spot-counter {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 14px;
          font-size: 12px;
          color: var(--accent);
          opacity: 0.85;
          animation: fadeIn 1s ease 0.3s both;
        }
        .spot-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }

        /* ── Email Form ── */
        .email-wrap, .cta-wrap {
          margin-top: 20px;
          max-width: 460px;
          margin-left: auto;
          margin-right: auto;
        }
        .email-module { width: 100%; }
        .email-form-row { display: flex; flex-direction: column; gap: 8px; }
        .email-input {
          width: 100%;
          height: 48px;
          padding: 0 16px;
          background: var(--input-bg);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: #fff;
          font-family: var(--font);
          font-size: 15px;
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
          height: 48px;
          background: var(--accent);
          color: #000;
          border: none;
          border-radius: 10px;
          font-family: var(--font);
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s, box-shadow 0.2s;
          box-shadow: 0 0 20px rgba(191,255,0,0.3);
        }
        .email-btn:hover {
          background: var(--accent-hover);
          box-shadow: 0 0 30px rgba(191,255,0,0.5);
        }
        .email-btn:active { transform: scale(0.98); }
        .email-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
        .email-trust {
          margin-top: 10px;
          font-size: 11px;
          color: var(--muted);
          text-align: center;
        }
        .email-success {
          font-size: 15px;
          color: var(--success);
          font-weight: 600;
          text-align: center;
          animation: fadeIn 300ms ease forwards;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* ── Learn More Cue (optional, bottom of hero) ── */
        .learn-more-cue {
          position: absolute;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          cursor: pointer;
          opacity: 0.35;
          transition: opacity 0.3s;
          padding: 8px;
        }
        .learn-more-cue:hover { opacity: 0.7; }
        .learn-more-cue span {
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-family: var(--font);
        }
        .learn-more-cue .arrow {
          width: 14px;
          height: 14px;
          border-right: 1.5px solid var(--muted);
          border-bottom: 1.5px solid var(--muted);
          transform: rotate(45deg);
          animation: bounce 2s ease-in-out infinite;
        }
        @keyframes bounce {
          0%, 100% { transform: rotate(45deg) translateY(0); }
          50%      { transform: rotate(45deg) translateY(4px); }
        }

        /* ── Why Section (below fold, optional) ── */
        .why-section {
          position: relative;
          min-height: 80vh;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 80px 24px 60px;
          animation: sectionFadeIn 0.5s ease-out;
        }
        @keyframes sectionFadeIn {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .why-inner { max-width: 520px; width: 100%; }
        .why-title {
          font-family: var(--font);
          font-size: clamp(26px, 6vw, 44px);
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -0.01em;
          margin-bottom: 16px;
        }
        .why-body {
          font-size: 16px;
          line-height: 1.6;
          color: var(--secondary);
        }
        .why-body p + p { margin-top: 6px; }
        .why-body em { font-style: italic; color: #fff; }
        .why-sub {
          margin-top: 14px;
          font-size: 13px;
          color: var(--accent);
          font-weight: 500;
          letter-spacing: 0.03em;
        }

        /* ── Footer ── */
        .footer-area { margin-top: 48px; }
        .footer-brand {
          font-size: 9px;
          letter-spacing: 0.25em;
          color: var(--muted);
          text-transform: uppercase;
          font-weight: 500;
        }
        .footer-sub {
          font-size: 9px;
          letter-spacing: 0.15em;
          color: var(--muted);
          margin-top: 4px;
          font-weight: 500;
        }

        /* ── Desktop ── */
        @media (min-width: 768px) {
          .email-form-row { flex-direction: row; }
          .email-form-row .email-input { flex: 1; min-width: 0; }
          .email-form-row .email-btn { width: auto; min-width: 180px; flex-shrink: 0; }
        }

        /* ── Mobile ── */
        @media (max-width: 767px) {
          .hero-section { padding: 60px 20px 50px; }
          .hero-h1 { font-size: clamp(26px, 8vw, 38px); }
          .hero-desc { font-size: 14px; }
          .hero-proof { font-size: 11px; }
          .offer-box { margin-top: 16px; padding: 12px 16px; }
          .offer-price { font-size: 24px; }
          .offer-detail { font-size: 13px; }
          .offer-sub { font-size: 11px; }
          .email-wrap, .cta-wrap { margin-top: 16px; max-width: 340px; padding: 0; }
          .email-input { height: 44px; font-size: 14px; border-radius: 8px; }
          .email-btn { height: 44px; font-size: 14px; border-radius: 8px; }
          .logo-header { top: 14px; }
          .logo-img { width: 60px !important; height: auto !important; }
          .launch-badge { font-size: 10px; padding: 3px 10px; }
          .spot-counter { font-size: 11px; }
          .why-section { padding: 60px 20px 50px; min-height: 60vh; }
          .why-title { font-size: clamp(22px, 7vw, 32px); }
          .why-body { font-size: 14px; }
        }
      `}</style>
    </main>
  );
}
