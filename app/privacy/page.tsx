// ═══════════════════════════════════════════════════════════
// 📁 파일 위치: app/privacy/page.tsx
// 📌 역할: Privacy Policy 페이지
// ═══════════════════════════════════════════════════════════

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — PIILK",
  description: "Privacy Policy for PIILK by Armored Fresh Inc.",
};

export default function PrivacyPolicy() {
  return (
    <>
      <style>{CSS}</style>
      <div className="privacy-wrap">
        <a href="/" className="back-link">← Back</a>

        <h1 className="privacy-title">Privacy Policy</h1>
        <p className="privacy-meta">Armored Fresh Inc. · Last updated: March 2026</p>

        <section className="privacy-section">
          <h2>1. What We Collect</h2>
          <p>
            When you sign up for the PIILK waitlist, we collect your email address.
            We also automatically collect basic technical data including your IP address,
            browser language, timezone, device type, and the URL that referred you to our site
            (including any UTM parameters from ads).
          </p>
        </section>

        <section className="privacy-section">
          <h2>2. How We Use It</h2>
          <p>
            We use your email address to send you launch updates, pre-launch offers, and
            marketing communications about PIILK products. We use technical data to
            understand how people find and use our site so we can improve it.
          </p>
        </section>

        <section className="privacy-section">
          <h2>3. Third Parties</h2>
          <p>
            We use the following third-party services to operate our waitlist and
            communications:
          </p>
          <ul>
            <li><strong>Supabase</strong> — secure database storage of subscriber data</li>
            <li><strong>Klaviyo</strong> — email marketing platform</li>
            <li><strong>Google Analytics</strong> — website analytics</li>
            <li><strong>Meta (Facebook)</strong> — advertising and conversion tracking</li>
            <li><strong>TikTok</strong> — advertising and conversion tracking</li>
          </ul>
          <p>
            We do not sell your personal information to any third party.
          </p>
        </section>

        <section className="privacy-section">
          <h2>4. Unsubscribe</h2>
          <p>
            You can unsubscribe from marketing emails at any time by clicking the
            unsubscribe link at the bottom of any email we send you. We will process
            your request promptly.
          </p>
        </section>

        <section className="privacy-section">
          <h2>5. California Residents (CCPA)</h2>
          <p>
            If you are a California resident, you have the right to request access to,
            correction of, or deletion of your personal information. To exercise these
            rights, contact us at the email below. We do not sell personal information
            as defined under the CCPA.
          </p>
        </section>

        <section className="privacy-section">
          <h2>6. Data Retention</h2>
          <p>
            We retain your data for as long as necessary to operate our waitlist and
            communicate about our product launch. You may request deletion at any time.
          </p>
        </section>

        <section className="privacy-section">
          <h2>7. Contact</h2>
          <p>
            For any privacy-related requests or questions, please contact us at:<br />
            <a href="mailto:piilk@armoredfresh.com" className="privacy-email">piilk@armoredfresh.com</a><br />
            Armored Fresh Inc., 154 W 14th Street, 2nd Floor, New York, NY 10011
          </p>
        </section>
      </div>
    </>
  );
}

const CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #000; color: #a1a1aa;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.7;
}
.privacy-wrap {
  max-width: 640px; margin: 0 auto;
  padding: 60px 24px 80px;
}
.back-link {
  display: inline-block; margin-bottom: 40px;
  font-size: 13px; color: #52525b; text-decoration: none;
  transition: color 0.15s;
}
.back-link:hover { color: #a1a1aa; }
.privacy-title {
  font-size: 28px; font-weight: 800; color: #f4f4f5;
  letter-spacing: -0.03em; margin-bottom: 8px;
}
.privacy-meta {
  font-size: 12px; color: #3f3f46; margin-bottom: 48px;
}
.privacy-section {
  margin-bottom: 36px;
}
.privacy-section h2 {
  font-size: 14px; font-weight: 700; color: #f4f4f5;
  letter-spacing: 0.04em; text-transform: uppercase;
  margin-bottom: 10px;
}
.privacy-section p {
  font-size: 14px; color: #71717a; line-height: 1.75;
  margin-bottom: 10px;
}
.privacy-section ul {
  list-style: none; padding: 0;
  margin: 10px 0;
}
.privacy-section ul li {
  font-size: 14px; color: #71717a;
  padding: 4px 0 4px 16px;
  position: relative;
}
.privacy-section ul li::before {
  content: "·";
  position: absolute; left: 0;
  color: #D4FF2B;
}
.privacy-email {
  color: #D4FF2B; text-decoration: none;
}
.privacy-email:hover { text-decoration: underline; }
`;
