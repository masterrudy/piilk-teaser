'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}
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
  /* ─── Scroll/wheel/touch ─── */
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
      const active = document.activeElement;
      if (active && active.classList.contains('email-input')) return;
      if (Math.abs(e.deltaY) < 30) return;
      go(e.deltaY > 0 ? 1 : -1);
    };
    let touchY = 0;
    let touchTarget: EventTarget | null = null;
    const handleTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0].clientY;
      touchTarget = e.target;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      const el = touchTarget as HTMLElement | null;
      if (el && el.closest && el.closest('.email-module')) return;
      const diff = touchY - e.changedTouches[0].clientY;
      if (Math.abs(diff) < 80) return;
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
  useEffect(() => {
    if (phase === 2) trackEvent('phase_2_view');
    if (phase === 3) trackEvent('phase_3_view');
  }, [phase]);
const trackEvent = useCallback((eventName: string, eventData?: Record<string, any>) => {
    const td = trackingData.current;
    // Supabase
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
    // GA4 — variant: "main" 포함
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, {
        variant: 'main',
        ...eventData,
      });
    }
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
        // ✅ Meta Pixel — Lead 전환
        if (typeof window !== 'undefined' && (window as any).fbq) {
          (window as any).fbq('track', 'Lead', {
            content_name: 'piilk_main_teaser',
            content_category: 'teaser_signup',
          });
          (window as any).fbq('track', 'CompleteRegistration', {
            content_name: 'piilk_main_teaser',
            value: 1,
            currency: 'USD',
          });
        }

        // ✅ TikTok Pixel — Lead 전환
        if (typeof window !== 'undefined' && (window as any).ttq) {
          (window as any).ttq.track('SubmitForm', {
            content_name: 'piilk_main_teaser',
          });
          (window as any).ttq.track('CompleteRegistration', {
            content_name: 'piilk_main_teaser',
            value: 1,
            currency: 'USD',
          });
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
  const handleSlideClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.email-module')) return;
    if (target.tagName.toLowerCase() === 'input' || target.tagName.toLowerCase() === 'button') return;
    if (phase < 3) {
      prevPhase.current = phase;
      setPhase(phase + 1);
    }
  };
  const getPhaseClass = (n: number) => {
    if (n === phase) return 'center';
    if (n < phase) return 'above';
    return 'below';
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
        <div className={`slide slide--${getPhaseClass(1)}`} onClick={handleSlideClick} style={{ cursor: phase < 3 ? 'pointer' : 'default' }}>
          <div className="slide-inner">
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
        <div className={`slide slide--${getPhaseClass(2)}`} onClick={handleSlideClick} style={{ cursor: phase < 3 ? 'pointer' : 'default' }}>
          <div className="slide-inner">
            <h1 className="hero-h1">
              PIILK is built for<br />what&apos;s left behind.
            </h1>
            <p className="hero-desc">Heavy after. Film that lingers. You know the moment.</p>
            <p className="hero-proof">30g protein · 7 ingredients · Dairy-free</p>
            <div className="email-wrap">
              <div className="email-module">
                {!isSubmitted ? (
                  <>
                    <div className="email-form-row">
                      <input
                        type="email"
                        className="email-input"
                        value={email}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^a-zA-Z0-9@._+\-]/g, '');
                          setEmail(v);
                        }}
                        onCompositionStart={(e) => e.preventDefault()}
                        onFocus={handleEmailFocus}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit('hero'); }}
                        placeholder="you@email.com"
                        autoComplete="email"
                        inputMode="email"
                        disabled={isSubmitting}
                        style={{ imeMode: 'disabled' } as React.CSSProperties}
                      />
                      <button
                        type="button"
                        className="email-btn"
                        onClick={() => handleSubmit('hero')}
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
              <div className="email-module">
                {!isSubmitted ? (
                  <>
                    <div className="email-form-row">
                      <input
                        type="email"
                        className="email-input"
                        value={email}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^a-zA-Z0-9@._+\-]/g, '');
                          setEmail(v);
                        }}
                        onCompositionStart={(e) => e.preventDefault()}
                        onFocus={handleEmailFocus}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit('cta'); }}
                        placeholder="you@email.com"
                        autoComplete="email"
                        inputMode="email"
                        disabled={isSubmitting}
                        style={{ imeMode: 'disabled' } as React.CSSProperties}
                      />
                      <button
                        type="button"
                        className="email-btn"
                        onClick={() => handleSubmit('cta')}
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
        html, body { margin:0; padding:0; overflow:hidden; height:100%; }
        .piilk-page {
          position: fixed; inset: 0;
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
        .screen-wrap { position:relative; z-index:1; width:100%; height:100%; overflow:hidden; }
        .logo-header {
          position:absolute; top:20px; left:50%; transform:translateX(-50%); z-index:10;
        }
        .logo-img { opacity:0.9; cursor:pointer; transition:opacity 0.3s; }
        .logo-img:hover { opacity:0.6; }
        /* ── Slides ── */
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
        .slide--center { transform: translateY(0); opacity: 1; pointer-events: auto; }
        .slide--above  { transform: translateY(-100vh); opacity: 0; pointer-events: none; }
        .slide--below  { transform: translateY(100vh); opacity: 0; pointer-events: none; }
        .slide-inner { max-width: 680px; width: 100%; }
        .hero-h1 {
          font-family: var(--font);
          font-size: clamp(28px, 7vw, 52px);
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -0.01em;
        }
        .hero-desc { margin-top:16px; font-size:15px; line-height:1.5; color:var(--secondary); }
        .hero-proof { margin-top:10px; font-size:13px; color:var(--muted); letter-spacing:0.02em; }
        .why-title {
          font-family: var(--font);
          font-size: clamp(26px, 6vw, 46px);
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -0.01em;
          margin-bottom: 16px;
        }
        .why-body { font-size:15px; line-height:1.5; color:var(--secondary); }
        .why-body p + p { margin-top:6px; }
        .email-wrap, .cta-wrap {
          margin-top: 32px;
          max-width: 460px;
          margin-left: auto;
          margin-right: auto;
        }
        /* ── Scroll cue ── */
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
          font-size:12px; color:var(--muted); letter-spacing:0.06em; text-transform:uppercase;
        }
        .scroll-cue-bottom .arrow {
          width:16px; height:16px;
          border-right:1.5px solid var(--muted);
          border-bottom:1.5px solid var(--muted);
          transform:rotate(45deg);
          animation:bounce 2s ease-in-out infinite;
        }
        @keyframes bounce {
          0%,100% { transform:rotate(45deg) translateY(0); }
          50%     { transform:rotate(45deg) translateY(5px); }
        }
        /* ── Footer ── */
        .footer-area { margin-top:40px; }
        .footer-brand { font-size:9px; letter-spacing:0.25em; color:var(--muted); text-transform:uppercase; font-weight:500; }
        .footer-sub { font-size:9px; letter-spacing:0.15em; color:var(--muted); margin-top:4px; font-weight:500; }
        /* ── Email ── */
        .email-module { width:100%; }
        .email-form-row { display:flex; flex-direction:column; gap:8px; }
        .email-input {
          width:100%; height:44px; padding:0 14px;
          background:var(--input-bg);
          border:1px solid var(--border);
          border-radius:10px;
          color:#fff;
          font-family:var(--font); font-size:15px;
          outline:none;
          transition:border-color 0.2s;
          backdrop-filter:blur(8px);
          -webkit-backdrop-filter:blur(8px);
        }
        .email-input::placeholder { color:var(--muted); }
        .email-input:focus { border-color:var(--accent); }
        .email-input:disabled { opacity:0.4; cursor:not-allowed; }
        .email-btn {
          width:100%; height:44px;
          background:var(--accent);
          color:#000; border:none;
          border-radius:10px;
          font-family:var(--font); font-size:15px; font-weight:600;
          cursor:pointer;
          transition:background 0.2s, transform 0.1s, box-shadow 0.2s;
          box-shadow:0 0 16px rgba(191,255,0,0.25);
        }
        .email-btn:hover { background:var(--accent-hover); box-shadow:0 0 24px rgba(191,255,0,0.4); }
        .email-btn:active { transform:scale(0.98); }
        .email-btn:disabled { opacity:0.4; cursor:not-allowed; box-shadow:none; }
        .email-trust { margin-top:8px; font-size:11px; color:var(--muted); text-align:center; }
        .email-success { font-size:14px; color:var(--success); font-weight:500; text-align:center; animation:fadeIn 300ms ease forwards; }
        @keyframes fadeIn { from{opacity:0;} to{opacity:1;} }
        /* ── Dots ── */
        .dots {
          position:absolute; right:20px; top:50%; transform:translateY(-50%);
          display:flex; flex-direction:column; gap:12px; z-index:10;
        }
        .dot {
          width:8px; height:8px; border-radius:50%;
          border:1px solid rgba(255,255,255,0.3);
          background:transparent; cursor:pointer; padding:0;
          transition:all 0.3s;
        }
        .dot.active { background:var(--accent); border-color:var(--accent); transform:scale(1.3); }
        .dot:hover { border-color:rgba(255,255,255,0.6); }
        @media (min-width:768px) {
          .email-form-row { flex-direction:row; }
          .email-form-row .email-input { flex:1; min-width:0; }
          .email-form-row .email-btn { width:auto; min-width:160px; flex-shrink:0; }
        }
        /* ── Mobile optimization ── */
        @media (max-width:767px) {
          .slide { padding: 60px 20px 30px; }
          .hero-h1 { font-size: clamp(24px, 8vw, 36px); }
          .hero-desc { font-size: 14px; margin-top: 12px; }
          .hero-proof { font-size: 12px; margin-top: 8px; }
          .why-title { font-size: clamp(22px, 7vw, 32px); }
          .why-body { font-size: 14px; }
          .email-wrap, .cta-wrap { margin-top: 24px; max-width: 320px; padding: 0 16px; }
          .email-input { height: 42px; font-size: 14px; border-radius: 8px; }
          .email-btn { height: 42px; font-size: 14px; border-radius: 8px; }
          .scroll-cue-bottom { bottom: 20px; }
          .logo-header { top: 14px; }
          .logo-img { width: 60px !important; height: auto !important; }
          .dots { right: 12px; }
          .dot { width: 6px; height: 6px; }
        }
      `}</style>
    </main>
  );
}
