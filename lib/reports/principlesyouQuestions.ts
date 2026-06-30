import data from "@/zhichang-canmou/src/lib/principlesyou/data.json";

const DATA = data as any;

export function talentQuestionNumbers(): number[] {
  return (DATA.questions || []).map((question: { number: number }) => question.number);
}

export function buildNeutralTalentAnswers() {
  const answers: Record<number, number> = {};
  for (const number of talentQuestionNumbers()) {
    answers[number] = 4;
  }
  return answers;
}
