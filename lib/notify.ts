// lib/notify.ts
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL!;
const NOTIFY_EMAILS = [
  'rudy@armoredfresh.com',
  'luna.oh@armoredfresh.com',
  'sara.jo@armoredfresh.com',
  'ben.park@armoredfresh.com',
];

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

  const text = [
    `🎯 *New Signup!*`,
    `📧 ${email}`,
    `${variantLabel}`,
    `🔗 ${source}`,
    `🗺️ ${location} ${deviceIcon}`,
    `──────────────`,
    `Today: *${todayCount}* | Total: *${totalCount}*`,
  ].join('\n');

  // Slack
  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch(() => {});

  // Email (Resend)
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'PIILK Monitor <monitor@piilk.com>',
        to: NOTIFY_EMAILS,
        subject: `🎯 New Signup: ${email}`,
        html: `
          <div style="font-family:monospace;padding:20px;background:#000;color:#fff;border-radius:8px">
            <h2 style="color:#4ade80">🎯 New PIILK Signup!</h2>
            <p>📧 <strong>${email}</strong></p>
            <p>${variantLabel}</p>
            <p>🔗 ${source}</p>
            <p>🗺️ ${location} ${deviceIcon}</p>
            <hr style="border-color:#333"/>
            <p>Today: <strong>${todayCount}</strong> | Total: <strong>${totalCount}</strong></p>
          </div>
        `,
      }),
    }).catch(() => {});
  }
}
