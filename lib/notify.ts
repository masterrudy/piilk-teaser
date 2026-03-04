// api/subscribe route에서 todayCount 계산 부분을 아래로 교체

// ❌ 기존 (잘못된 방식)
const { count: todayCount } = await supabase
  .from('piilk_subscribers')
  .select('*', { count: 'exact', head: true })
  .gte('created_at', new Date().toISOString().split('T')[0])  // UTC 자정 기준 → 오류

// ✅ 수정 (NYC 자정 기준)
const nowNYC = new Date(
  new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
);
const todayNYCStart = new Date(
  nowNYC.getFullYear(),
  nowNYC.getMonth(),
  nowNYC.getDate(),
  0, 0, 0, 0
);
const tomorrowNYCStart = new Date(todayNYCStart);
tomorrowNYCStart.setDate(tomorrowNYCStart.getDate() + 1);

// NYC 로컬 시간을 UTC ISO로 변환
const toUTC = (localDate: Date) => {
  const utcMs = localDate.getTime() + (localDate.getTimezoneOffset() * 60000);
  // toLocaleString으로 만들어진 Date는 이미 로컬이므로 직접 UTC offset 적용
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) === 
    localDate.toLocaleString('en-US', { timeZone: 'America/New_York' })
      ? localDate
      : localDate
  );
};

// 더 안전한 방법: Intl로 NYC 오프셋 직접 계산
const getNYCMidnightUTC = (offsetDays = 0): string => {
  const now = new Date();
  const nycStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const nycDate = new Date(nycStr);
  nycDate.setHours(0, 0, 0, 0);
  nycDate.setDate(nycDate.getDate() + offsetDays);
  // NYC → UTC 역산
  const utcOffset = now.getTime() - new Date(nycStr).getTime();
  return new Date(nycDate.getTime() + utcOffset).toISOString();
};

const { count: todayCount } = await supabase
  .from('piilk_subscribers')
  .select('*', { count: 'exact', head: true })
  .gte('created_at', getNYCMidnightUTC(0))
  .lt('created_at',  getNYCMidnightUTC(1))
  .neq('variant', 'type');
