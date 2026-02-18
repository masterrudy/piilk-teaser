// lib/notify.ts
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL!;

interface NotifyParams {
  email: string;
  variant: 'main' | 'type';
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  city?: string | null;
  country?: string | null;
  device?: string | null;
  afterfeelType?: string | null;
  segment?: string | null;
  todayCount: number;
  totalCount: number;
}

export async function sendNotifications(params: NotifyParams) {
  const {
    email, variant, utmSource, utmMedium, utmCampaign,
    city, country, device, afterfeelType, segment,
    todayCount, totalCount,
  } = params;

  const source = utmSource
    ? `${utmSource}/${utmMedium || ''}${utmCampaign ? ` (${utmCampaign})` : ''}`
    : 'Direct';

  const variantLabel = variant === 'type'
    ? `🧠 Quiz Type${afterfeelType ? ` · ${afterfeelType}` : ''}`
    : `🏠 Main Teaser${segment ? ` · Seg ${segment}` : ''}`;

  const location = [city, country].filter(Boolean).join(', ') || 'Unknown';
  const deviceIcon = device === 'mobile' ? '📱' : device === 'desktop' ? '💻' : '❓';

  const slackText = [
    `🎯 *New Signup!*`,
    `📧 ${email}`,
    `${variantLabel}`,
    `🔗 Source: ${source}`,
    `🗺️ ${location} ${deviceIcon}`,
    `──────────────`,
    `Today: *${todayCount}* | Total: *${totalCount}*`,
  ].join('\n');

  // ── Slack ──
  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: slackText }),
  }).catch(() => {});

  // ── Email (Resend) ──
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'PIILK Monitor <monitor@piilk.com>',
      to: [
        'rudy@armoredfresh.com',
        'luna.oh@armoredfresh.com',
        'sara.jo@armoredfresh.com',
        'ben.park@armoredfresh.com',
      ],
      subject: `🎯 New Signup: ${email}`,
      html: `
        <div style="font-family:monospace;padding:24px;background:#0a0a0a;color:#fff;border-radius:12px;max-width:480px">
          <h2 style="color:#4ade80;margin:0 0 16px">🎯 New PIILK Signup!</h2>
          <p style="margin:4px 0">📧 <strong>${email}</strong></p>
          <p style="margin:4px 0">${variantLabel}</p>
          <p style="margin:4px 0">🔗 ${source}</p>
          <p style="margin:4px 0">🗺️ ${location} ${deviceIcon}</p>
          <hr style="border:none;border-top:1px solid #333;margin:16px 0"/>
          <p style="margin:0;color:#888">Today: <strong style="color:#fff">${todayCount}</strong> &nbsp;|&nbsp; Total: <strong style="color:#4ade80">${totalCount}</strong></p>
        </div>
      `,
    }),
  }).catch(() => {});
}
