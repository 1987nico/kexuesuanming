import data from "@/lib/reports/principlesyou-data/data.json";
import zh from "@/lib/reports/principlesyou-data/zh.json";

const DATA = data as any;
const ZH = zh as any;

export interface TalentQuestionForClient {
  number: number;
  order: number;
  text: string;
}

export function talentQuestionNumbers(): number[] {
  return (DATA.questions || []).map((question: { number: number }) => question.number);
}

export function talentQuestionsForClient(): TalentQuestionForClient[] {
  return (DATA.questions || []).map((question: { number: number; order: number; text: string }) => ({
    number: question.number,
    order: question.order,
    text: ZH.questions?.[question.number] || question.text,
  }));
}

export function talentScaleLabels(): string[] {
  return ZH.labels || DATA.labels || ["1", "2", "3", "4", "5", "6", "7"];
}

export function buildNeutralTalentAnswers() {
  const answers: Record<number, number> = {};
  for (const number of talentQuestionNumbers()) {
    answers[number] = 4;
  }
  return answers;
}
