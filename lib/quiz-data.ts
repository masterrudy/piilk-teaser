// ═══════════════════════════════════════════
// 📁 lib/quiz-data.ts — V13 (변경 없음)
// PIILK Quiz & Content Data
//
// ✅ V14 참고: 이 파일은 변경 없음.
//    quiz-data의 타입, 질문, 선택지, 계산 로직은 그대로 유지.
//    Hero에서 AFTERFEEL_TYPES를 직접 렌더링하므로 export 유지.
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
// Q1 = 물리적 감각 (방금 일어난 일)
// Q2 = 진짜 해본 말 (자기 인식)
// Q3 = honest tagline (유머 + 공유)
// ─────────────────────────────────────────────────────────────
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    question: "You just finished a protein shake. What happens next?",
    options: [
      { icon: "🪨", text: "Feels like I swallowed a brick", group: "brick" },
      { icon: "😶‍🌫️", text: "Why is my mouth still coated", group: "chalk" },
      { icon: "😴", text: "Honestly? I feel worse than before", group: "zombie" },
      { icon: "💨", text: "I need a minute alone after that", group: "gambler" },
    ],
  },
  {
    question: "Be honest. Which one have you said?",
    options: [
      { icon: "🗣️", text: '"I\'d rather just eat real food"', group: "brick" },
      { icon: "🤐", text: '"You kind of get used to it"', group: "chalk" },
      { icon: "😬", text: '"Not before anything important"', group: "gambler" },
      { icon: "🛌", text: '"I keep buying them and never finishing them"', group: "zombie" },
    ],
  },
  {
    question: "If protein shakes had an honest tagline:",
    options: [
      { icon: "⚖️", text: '"30g protein + 2 hours of regret"', group: "brick" },
      { icon: "🧱", text: '"Nutrition that coats your whole mouth"', group: "chalk" },
      { icon: "🎭", text: '"Healthy outside. Chaos inside."', group: "gambler" },
      { icon: "🔌", text: '"Tastes like someone gave up halfway through the recipe"', group: "zombie" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// 4 After-feel Types
// ─────────────────────────────────────────────────────────────
export const AFTERFEEL_TYPES: Record<
  AfterfeelType,
  { icon: string; name: string; tagline: string }
> = {
  brick:   { icon: "🪨",    name: "Brick Stomach",      tagline: "Heavy in. Regret out." },
  chalk:   { icon: "😶‍🌫️", name: "Chalk Mouth",         tagline: "Coated. Every. Single. Time." },
  zombie:  { icon: "😴",    name: "Post-Shake Zombie",   tagline: "Was that supposed to help? Because it didn't." },
  gambler: { icon: "💨",    name: "The Gambler",          tagline: "Every shake is a gamble." },
};

// ─────────────────────────────────────────────────────────────
// Declarations (공감 투표)
// ─────────────────────────────────────────────────────────────
export const DECLARATIONS = [
  { key: "pretended",  text: "I've told someone a protein shake \"wasn't that bad.\" It was." },
  { key: "googled",    text: "I've Googled \"why does my protein shake taste like chalk.\"" },
  { key: "deserve",    text: "I've spent $50+/month on something I don't even enjoy." },
  { key: "given_up",   text: "I've quit protein shakes entirely because of the taste." },
] as const;

// ─────────────────────────────────────────────────────────────
// Share text
// ─────────────────────────────────────────────────────────────
export function getShareText(typeName: string): string {
  return `I'm a ${typeName} lol. What's yours?\nFind out in 30 sec →`;
}

export const SHARE_URL = "https://teaser.piilk.com/type";

// ─────────────────────────────────────────────────────────────
// Type calculation — tie → Q3 (last answer) wins
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
