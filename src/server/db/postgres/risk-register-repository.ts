import { v4 as uuidv4 } from 'uuid';
import type { BankUser } from '../../../shared/types/auth.js';
import type { RiskRegisterItem } from '../../../shared/types/risk.js';
import { pgClient } from './client.js';

type Row = Record<string, any>;
const securityReaders = (actor: BankUser) => actor.roles.some((role) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'APPSEC_ANALYST', 'GRC_ANALYST', 'AUDITOR'].includes(role));
const rating = (score: number) => score >= 16 ? 'CRITICAL' : score >= 10 ? 'HIGH' : score >= 5 ? 'MEDIUM' : 'LOW';
const scoreByRating: Record<string, number> = { LOW: 1, MEDIUM: 6, HIGH: 12, CRITICAL: 20 };
const parse = (value: unknown) => {
  if (!value) return {};
  if (typeof value === 'string') { try { return JSON.parse(value) as Row; } catch { return {}; } }
  return typeof value === 'object' ? value as Row : {};
};

/** PostgreSQL-authoritative Risk Register access used by both generic GRC and Threat Model links. */
export class RiskRegisterRepository {
  static map(row: Row): RiskRegisterItem {
    const payload = parse(row.source_payload);
    const inherentScore = Number(payload.inherentScore || scoreByRating[String(row.inherent_risk)] || 9);
    const residualScore = Number(payload.residualScore || scoreByRating[String(row.residual_risk)] || inherentScore);
    const inherentLikelihood = Number(payload.inherentLikelihood || Math.max(1, Math.min(5, Math.ceil(Math.sqrt(inherentScore)))));
    const inherentImpact = Number(payload.inherentImpact || Math.max(1, Math.min(5, Math.ceil(inherentScore / inherentLikelihood))));
    const residualLikelihood = Number(payload.residualLikelihood || Math.max(1, Math.min(5, Math.ceil(Math.sqrt(residualScore)))));
    const residualImpact = Number(payload.residualImpact || Math.max(1, Math.min(5, Math.ceil(residualScore / residualLikelihood))));
    return {
      id: row.id, riskCode: row.risk_id, title: row.title, description: row.description, ownerId: row.risk_owner_id || '', ownerName: payload.ownerName,
      departmentId: payload.departmentId || '', affectedApplicationIds: Array.isArray(payload.affectedApplicationIds) ? payload.affectedApplicationIds : [], affectedAssetIds: Array.isArray(payload.affectedAssetIds) ? payload.affectedAssetIds : [],
      likelihood: inherentLikelihood, impact: inherentImpact, inherentLikelihood, inherentImpact, inherentScore, inherentRating: rating(inherentScore), existingControls: payload.existingControls || '',
      residualLikelihood, residualImpact, residualScore, residualRating: rating(residualScore), residualRiskRationale: payload.residualRiskRationale || 'Risk Register record; see linked Threat Model evidence where applicable.',
      residualRiskCalculatedAt: payload.residualRiskCalculatedAt || row.updated_at?.toISOString?.() || row.updated_at, residualRiskCalculatedBy: payload.residualRiskCalculatedBy || row.risk_owner_id || '',
      treatmentStrategy: payload.treatmentStrategy || 'MITIGATE', treatmentPlan: row.mitigation_plan || '', treatmentDeadline: String(row.review_date?.toISOString?.() || row.review_date || '').slice(0, 10),
      status: ({ OPEN: 'IDENTIFIED', CLOSED: 'CLOSED' } as Record<string, RiskRegisterItem['status']>)[row.status] || row.status || 'IDENTIFIED', linkedTicketIds: Array.isArray(payload.linkedTicketIds) ? payload.linkedTicketIds : [],
      createdAt: row.created_at?.toISOString?.() || row.created_at, updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
    };
  }

  static async list(actor: BankUser): Promise<RiskRegisterItem[]> {
    const result = await pgClient.query<Row>(`SELECT * FROM risk_register_items
      WHERE $1::boolean OR risk_owner_id=$2 OR COALESCE(source_payload->>'departmentId','')=$3
      ORDER BY updated_at DESC`, [securityReaders(actor), actor.id, actor.departmentId || '']);
    return result.rows.map(this.map);
  }

  static async create(input: Omit<RiskRegisterItem, 'id' | 'riskCode' | 'createdAt' | 'updatedAt'>, actor: BankUser): Promise<RiskRegisterItem> {
    return pgClient.transaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('bank-risk-register-code'))`);
      const year = new Date().getUTCFullYear();
      const sequence = await client.query<{ next: number }>(`SELECT count(*)::int + 1 AS next FROM risk_register_items WHERE risk_id LIKE $1`, [`RISK-${year}-%`]);
      const riskCode = `RISK-${year}-${String(sequence.rows[0]?.next || 1).padStart(4, '0')}`;
      const riskId = `risk-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
      const sourcePayload = {
        ownerName: input.ownerName, departmentId: input.departmentId, affectedApplicationIds: input.affectedApplicationIds, affectedAssetIds: input.affectedAssetIds,
        inherentLikelihood: input.inherentLikelihood, inherentImpact: input.inherentImpact, inherentScore: input.inherentScore, existingControls: input.existingControls,
        residualLikelihood: input.residualLikelihood, residualImpact: input.residualImpact, residualScore: input.residualScore, residualRiskRationale: input.residualRiskRationale,
        residualRiskCalculatedAt: input.residualRiskCalculatedAt, residualRiskCalculatedBy: input.residualRiskCalculatedBy, treatmentStrategy: input.treatmentStrategy, linkedTicketIds: input.linkedTicketIds,
      };
      const inserted = await client.query<Row>(`INSERT INTO risk_register_items(id,risk_id,title,description,category,inherent_risk,residual_risk,status,risk_owner_id,mitigation_plan,review_date,source_payload)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING *`, [riskId, riskCode, input.title, input.description, 'OPERATIONAL_RISK', input.inherentRating, input.residualRating, input.status, input.ownerId, input.treatmentPlan, input.treatmentDeadline, JSON.stringify(sourcePayload)]);
      return this.map(inserted.rows[0]);
    });
  }
}
