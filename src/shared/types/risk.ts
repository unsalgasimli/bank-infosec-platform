import { RiskRating } from './ticket.js';

export type RiskTreatment = 'MITIGATE' | 'ACCEPT' | 'AVOID' | 'TRANSFER';

export interface RiskRegisterItem {
  id: string;
  riskCode: string; // e.g. RISK-2026-0042
  title: string;
  description: string;
  ownerId: string;
  ownerName?: string;
  departmentId: string;
  affectedApplicationIds: string[];
  affectedAssetIds: string[];
  
  // 5x5 Likelihood x Impact (1 to 5). likelihood/impact remain legacy aliases.
  likelihood: number; // 1 (Rare) - 5 (Almost Certain)
  impact: number;     // 1 (Insignificant) - 5 (Catastrophic)
  inherentLikelihood: number;
  inherentImpact: number;
  inherentScore: number; // 1 - 25
  inherentRating: RiskRating;
  
  existingControls: string;
  residualLikelihood: number;
  residualImpact: number;
  residualScore: number;
  residualRating: RiskRating;
  /** Never inferred: the record must explain why verified controls change risk. */
  residualRiskRationale: string;
  residualRiskCalculatedAt: string;
  residualRiskCalculatedBy: string;
  
  treatmentStrategy: RiskTreatment;
  treatmentPlan: string;
  treatmentDeadline: string;
  
  status: 'IDENTIFIED' | 'UNDER_REVIEW' | 'TREATMENT_IN_PROGRESS' | 'ACCEPTED' | 'MITIGATED' | 'CLOSED';
  linkedTicketIds: string[];
  createdAt: string;
  updatedAt: string;
}
