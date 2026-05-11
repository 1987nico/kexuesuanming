/**
 * 快速打分（分享给他人）— 类型定义
 *
 * 跟主流程 runs/step3_scores 完全解耦：受邀人不用做问卷、不用走 Step 1/2，
 * 进来一个链接、填个名字、对 30 张卡片打分即可。
 */

export interface QuickEvidence {
  label: string;
  url?: string;
}

export interface QuickItem {
  idx: number;
  category: string;
  title: string;
  oneLiner: string;
  dayInLife: string;
  workContent: string;
  workMethods: string;
  evidence: QuickEvidence[];
}

export interface QuickRespondent {
  id: string;
  panel_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface QuickScore {
  respondent_id: string;
  opp_idx: number;
  score: number;
  reason?: string;
  scored_at: string;
}

export interface QuickPanelAggregate {
  respondents: QuickRespondent[];
  scores: QuickScore[];
}
