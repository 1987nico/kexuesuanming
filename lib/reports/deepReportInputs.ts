export interface DeepDirectionExpansion {
  name: string;
  rationale: string;
  value_fit: string;
  excluded_value_guardrail?: string;
}

export interface SensoryScore {
  direction: string;
  score: number;
  round?: string;
  reason?: string;
  body_signal?: string;
}

export interface MarketEvidence {
  direction: string;
  opportunity_score?: number;
  pest: {
    political: string[];
    economic: string[];
    social: string[];
    technological: string[];
  };
  five_forces: {
    rivalry: string[];
    new_entrants: string[];
    substitutes: string[];
    supplier_power: string[];
    buyer_power: string[];
  };
  external_facts: Array<{
    source: string;
    finding: string;
  }>;
}

export interface VRINScore {
  direction: string;
  value: number;
  rarity: number;
  imitability: number;
  non_substitutability: number;
  overall_score?: number;
  evidence: string[];
  blind_spot?: string;
}

export interface PremortemScenario {
  direction: string;
  failure_story: string;
  likely_causes: string[];
  early_signals: string[];
  stop_loss_line: string;
  countermeasures: string[];
}

export interface DeepReportInputs {
  direction_expansion?: DeepDirectionExpansion[];
  sensory_scores?: SensoryScore[];
  market_evidence?: MarketEvidence[];
  vrin_scores?: VRINScore[];
  premortem?: PremortemScenario[];
}
