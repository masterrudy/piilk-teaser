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
    ? ${utmSource}/${utmMedium || ''}${utmCampaign ?  (${utmCampaign}) : ''}
    : 'Direct';
  const variantLabel = variant === 'type'
    ? 🧠 Quiz Type${afterfeelType ?  · ${afterfeelType} : ''}
    : 🏠 Main Teaser${segment ?  · Seg ${segment} : ''};
  const location = [city, country].filter(Boolean).join(', ') || 'Unknown';
  const deviceIcon = device === 'mobile' ? '📱' : device === 'desktop' ? '💻' : '❓';
  const slackText = [
    🎯 *New Signup!*,
    📧 ${email},
    ${variantLabel},
    🔗 Source: ${source},
    🗺️ ${location} ${deviceIcon},
    ──────────────,
    Today: *${todayCount}* | Total: *${totalCount}*,
  ].join('\n');
  // ── Slack ──
  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: slackText }),
  }).catch(() => {});
}
