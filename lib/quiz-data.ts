// ═══════════════════════════════════════════
// 📁 파일 위치: lib/quiz-data.ts
// PIILK V12 — 퀴즈 & 콘텐츠 데이터
// ═══════════════════════════════════════════
//
// ✅ V11 → V12 변경사항:
//   1. Q1 질문: "What lingers most" → "You just finished a protein shake. What happens next?"
//   2. Q2 질문: "Which sounds most like you?" → "Be honest. Which one have you said?"
//   3. Q3 zombie 선택지: "Feel nothing" → "Technically nutrition. Emotionally nothing."
//      (PIILK "Nothing after" USP와 충돌 방지)
//   4. zombie 태그라인: "Protein in. Energy out." → "Supposed to help. Didn't."
//      (brick의 "Heavy in. Regret out."과 구조 중복 제거)
//   5. gambler 이름: "30-Min Gambler" → "The Gambler" (단순화)
//   6. 동점 로직: Q1 우선 → Q3(마지막 답변) 우선
//      (Q3가 가장 재미있고 숙고된 선택이므로 유저의 "최종 판단" 반영)
//   7. Declaration 전면 교체: 캠페인 선언문 → 공감 투표 톤
//      (퀴즈 유머와 톤 일치, "들켰다" 느낌으로 참여 유도)
//   8. Declaration 3개 → 4개로 확장
//
// ⚠️ 배포 주의: Declaration key 변경됨
//   OLD: "tolerance", "linger", "fault"
//   NEW: "pretended", "googled", "deserve", "given_up"
//   → DB에 새 key 시드 INSERT 필요. 기존 key 데이터는 자연 소멸 처리.
// ═══════════════════════════════════════════

export type AfterfeelType = "brick" | "chalk" | "zombie" | "gambler";

export interface QuizOption {
  icon: string;
  text: string;
  group: AfterfeelType;
}

export interface QuizQuestion {
  question: string;
  options: QuizOption[];
}

// ─────────────────────────────────────────────────────────────
// 퀴즈 3문항
// 설계 원칙:
//   Q1 = 물리적 감각 (체험형 상황 제시)
//   Q2 = 심리적 반응 (자기 인식 — 실제 말해본 적 있는 문장)
//   Q3 = 유머 + 공유욕구 (honest tagline — 가장 재미있는 질문)
// ─────────────────────────────────────────────────────────────
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    // Q1: 물리적 감각 — 상황 속에 유저를 놓는다
    question: "You just finished a protein shake. What happens next?",
    options: [
      { icon: "🪨", text: "That heavy feeling that just sits there", group: "brick" },
      { icon: "😶‍🌫️", text: "A film in my mouth that won't leave", group: "chalk" },
      { icon: "😴", text: "Feeling more off than before", group: "zombie" },
      { icon: "💨", text: "Needing a minute alone after", group: "gambler" },
    ],
  },
  {
    // Q2: 심리적 반응 — 자기 발견 ("Be honest" = NYC 톤)
    question: "Be honest. Which one have you said?",
    options: [
      { icon: "🗣️", text: '"I\'d rather just eat real food"', group: "brick" },
      { icon: "🤐", text: '"You kind of get used to it"', group: "chalk" },
      { icon: "😬", text: '"Not before anything important"', group: "gambler" },
      { icon: "🛌", text: '"This is supposed to help, but…"', group: "zombie" },
    ],
  },
  {
    // Q3: 유머 — 공유 욕구 극대화
    question: "If protein shakes had an honest tagline:",
    options: [
      { icon: "⚖️", text: '"30g protein + 2 hours of regret"', group: "brick" },
      { icon: "🧱", text: '"Nutrition that coats your whole mouth"', group: "chalk" },
      { icon: "🎭", text: '"Healthy outside. Chaos inside."', group: "gambler" },
      { icon: "🔌", text: '"Technically nutrition. Emotionally nothing."', group: "zombie" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// 4가지 After-feel 타입
// ─────────────────────────────────────────────────────────────
export const AFTERFEEL_TYPES: Record<
  AfterfeelType,
  { icon: string; name: string; tagline: string }
> = {
  brick:   { icon: "🪨",    name: "Brick Stomach",      tagline: "Heavy in. Regret out." },
  chalk:   { icon: "😶‍🌫️", name: "Chalk Mouth",         tagline: "Coated. Every. Single. Time." },
  zombie:  { icon: "😴",    name: "Post-Shake Zombie",   tagline: "Supposed to help. Didn't." },
  gambler: { icon: "💨",    name: "The Gambler",          tagline: "Every shake is a gamble." },
};

// ─────────────────────────────────────────────────────────────
// Declaration (공감 투표)
// ─────────────────────────────────────────────────────────────
export const DECLARATIONS = [
  { key: "pretended",  text: "I've pretended a protein shake tasted fine." },
  { key: "googled",    text: "I've Googled 'why does my protein shake taste like chalk.'" },
  { key: "deserve",    text: "I deserve better than 'you get used to it.'" },
  { key: "given_up",   text: "I've given up on protein shakes before." },
] as const;

// ─────────────────────────────────────────────────────────────
// 공유 문구 생성
// ─────────────────────────────────────────────────────────────
export function getShareText(typeName: string): string {
  return `I'm a ${typeName}. What's yours?\nFind your type in 30 sec →`;
}

export const SHARE_URL = "https://teaser.piilk.com/type";

// ─────────────────────────────────────────────────────────────
// 유형 계산
// 동점 시 Q3(마지막 답변) 우선
// ─────────────────────────────────────────────────────────────
export function calcAfterfeelType(answers: string[]): AfterfeelType {
  const cnt: Record<string, number> = {};
  answers.forEach((a) => (cnt[a] = (cnt[a] || 0) + 1));

  const sorted = Object.entries(cnt).sort((a, b) => b[1] - a[1]);

  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
    return answers[answers.length - 1] as AfterfeelType;
  }

  return sorted[0][0] as AfterfeelType;
}
