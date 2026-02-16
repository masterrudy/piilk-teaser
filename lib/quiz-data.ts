// ═══════════════════════════════════════════
// PIILK V9 Hybrid — 퀴즈 & 콘텐츠 데이터
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

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    question: "What lingers most after a protein shake?",
    options: [
      { icon: "🪨", text: "That heavy feeling that just sits there", group: "brick" },
      { icon: "😶‍🌫️", text: "A film in my mouth that won't leave", group: "chalk" },
      { icon: "😴", text: "Feeling more off than before", group: "zombie" },
      { icon: "💨", text: "Needing a minute alone after", group: "gambler" },
    ],
  },
  {
    question: "Which sounds most like you?",
    options: [
      { icon: "🗣️", text: '"I\'d rather just eat real food"', group: "brick" },
      { icon: "🤐", text: '"You kind of get used to it"', group: "chalk" },
      { icon: "😬", text: '"Not before anything important"', group: "gambler" },
      { icon: "🛌", text: '"This is supposed to help, but…"', group: "zombie" },
    ],
  },
  {
    question: "If protein shakes had an honest tagline:",
    options: [
      { icon: "⚖️", text: '"30g protein + 2 hours of regret"', group: "brick" },
      { icon: "🧱", text: '"Nutrition that coats your whole mouth"', group: "chalk" },
      { icon: "🎭", text: '"Healthy outside. Chaos inside."', group: "gambler" },
      { icon: "🔌", text: '"Recharge your body. Feel nothing."', group: "zombie" },
    ],
  },
];

export const AFTERFEEL_TYPES: Record<
  AfterfeelType,
  { icon: string; name: string; tagline: string }
> = {
  brick:   { icon: "🪨",    name: "Brick Stomach",      tagline: "Heavy in. Regret out." },
  chalk:   { icon: "😶‍🌫️", name: "Chalk Mouth",         tagline: "Coated. Every. Single. Time." },
  zombie:  { icon: "😴",    name: "Post-Shake Zombie",   tagline: "Protein in. Energy out." },
  gambler: { icon: "💨",    name: "30-Min Gambler",       tagline: "Every shake is a gamble." },
};

export const DECLARATIONS = [
  { key: "tolerance", text: "Protein shouldn't require tolerance." },
  { key: "linger",    text: "Nothing should linger after protein." },
  { key: "fault",     text: "After-feel isn't your fault." },
] as const;

// 공유 문구 생성
export function getShareText(typeName: string): string {
  return `I'm a ${typeName}. What's yours?\nFind your type in 30 sec →`;
}

export const SHARE_URL = "https://teaser.piilk.com/type";

// 유형 계산 (Q1 우선 동점 처리)
export function calcAfterfeelType(answers: string[]): AfterfeelType {
  const cnt: Record<string, number> = {};
  answers.forEach((a) => (cnt[a] = (cnt[a] || 0) + 1));
  const sorted = Object.entries(cnt).sort((a, b) => b[1] - a[1]);

  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
    return answers[0] as AfterfeelType; // Q1 priority tie-break
  }
  return sorted[0][0] as AfterfeelType;
}
