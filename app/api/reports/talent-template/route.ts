import { NextResponse } from "next/server";
import { buildNeutralTalentAnswers, talentQuestionNumbers } from "@/lib/reports/principlesyouQuestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const question_numbers = talentQuestionNumbers();
  return NextResponse.json({
    count: question_numbers.length,
    question_numbers,
    neutral_answers: buildNeutralTalentAnswers(),
  });
}
