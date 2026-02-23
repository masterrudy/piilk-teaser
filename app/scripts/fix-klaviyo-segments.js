#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
// 📁 scripts/fix-klaviyo-segments.js
// 📌 역할: Klaviyo Main Teaser 리스트에서 segment 없는 프로필 찾아서
//          segment: "A", sub_reason: "direct" 로 일괄 업데이트
// 📌 사용법: KLAVIYO_API_KEY=pk_xxx node scripts/fix-klaviyo-segments.js
// ═══════════════════════════════════════════════════════════

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY || process.env.KLAVIYO_PRIVATE_KEY;
const LIST_ID = 'Xzi3yL'; // PIILK Waitlist - Teaser V1

if (!KLAVIYO_API_KEY) {
  console.error('❌ KLAVIYO_API_KEY 환경변수가 필요합니다.');
  console.error('   사용법: KLAVIYO_API_KEY=pk_xxx node scripts/fix-klaviyo-segments.js');
  process.exit(1);
}

const HEADERS = {
  'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'revision': '2024-02-15',
};

// ── Step 1: 리스트에서 전체 프로필 가져오기 ──
async function fetchAllListProfiles() {
  const allProfiles = [];
  let url = `https://a.klaviyo.com/api/lists/${LIST_ID}/profiles/?page[size]=100`;
  let page = 0;

  while (url && page < 20) {
    console.log(`  📄 Fetching page ${page + 1}...`);
    const res = await fetch(url, { headers: HEADERS });
    
    if (!res.ok) {
      console.error(`  ❌ API error: ${res.status} ${res.statusText}`);
      break;
    }
    
    const json = await res.json();
    allProfiles.push(...(json.data || []));
    url = json.links?.next || null;
    page++;
  }

  return allProfiles;
}

// ── Step 2: segment 없는 프로필 찾기 ──
function findMissingSegment(profiles) {
  return profiles.filter(p => {
    const props = p.attributes?.properties || {};
    const segment = props.segment;
    // segment가 없거나 빈 문자열인 프로필
    return !segment || segment === '';
  });
}

// ── Step 3: 프로필 업데이트 ──
async function updateProfile(profileId, email) {
  const res = await fetch(`https://a.klaviyo.com/api/profiles/${profileId}/`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({
      data: {
        type: 'profile',
        id: profileId,
        attributes: {
          properties: {
            segment: 'A',
            sub_reason: 'direct',
            source: 'piilk_teaser',
          },
        },
      },
    }),
  });

  if (res.ok) {
    console.log(`  ✅ Updated: ${email} → segment: A, sub_reason: direct`);
    return true;
  } else {
    const errText = await res.text();
    console.error(`  ❌ Failed: ${email} — ${res.status} ${errText.slice(0, 200)}`);
    return false;
  }
}

// ── Main ──
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('🔧 Klaviyo Segment Fix — PIILK Main Teaser');
  console.log('═══════════════════════════════════════════');
  console.log(`📋 List ID: ${LIST_ID}`);
  console.log('');

  // Step 1: 전체 프로필
  console.log('📥 Step 1: Fetching all profiles from list...');
  const allProfiles = await fetchAllListProfiles();
  console.log(`  → Total profiles in list: ${allProfiles.length}`);
  console.log('');

  // Step 2: segment 없는 프로필 찾기
  console.log('🔍 Step 2: Finding profiles without segment...');
  const missing = findMissingSegment(allProfiles);
  console.log(`  → Profiles without segment: ${missing.length}`);
  
  if (missing.length === 0) {
    console.log('');
    console.log('✨ All profiles already have segment! Nothing to update.');
    return;
  }

  console.log('');
  console.log('📋 Profiles to update:');
  missing.forEach((p, i) => {
    const email = p.attributes?.email || 'unknown';
    const props = p.attributes?.properties || {};
    console.log(`  ${i + 1}. ${email} (current props: segment=${props.segment || 'NONE'}, sub_reason=${props.sub_reason || 'NONE'})`);
  });
  console.log('');

  // Step 3: 업데이트
  console.log('🚀 Step 3: Updating profiles...');
  let success = 0;
  let failed = 0;

  for (const profile of missing) {
    const email = profile.attributes?.email || 'unknown';
    const ok = await updateProfile(profile.id, email);
    if (ok) success++;
    else failed++;

    // Rate limiting: 100ms between requests
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`✅ Done! Updated: ${success}, Failed: ${failed}`);
  console.log('═══════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
