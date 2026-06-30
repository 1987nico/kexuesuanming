import { NextResponse } from "next/server";
import {
  buildNeutralTalentAnswers,
  talentQuestionNumbers,
  talentQuestionsForClient,
  talentScaleLabels,
} from "@/lib/reports/principlesyouQuestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const question_numbers = talentQuestionNumbers();
  return NextResponse.json({
    count: question_numbers.length,
    question_numbers,
    questions: talentQuestionsForClient(),
    labels: talentScaleLabels(),
    neutral_answers: buildNeutralTalentAnswers(),
  });
}
