import type { BankUser } from '../../shared/types/auth.js';
import type { PreflightResult, WorkflowVersion } from '../../shared/types/orchestration.js';
import { validateWorkflowPreflight } from '../../shared/utils/workflow-preflight.js';
import { db } from '../db/database.js';

export class WorkflowPreflightService {
  public static validate(version: WorkflowVersion, actor?: BankUser): PreflightResult {
    return validateWorkflowPreflight(version, {
      actor,
      departments: db.data.departments,
      sections: db.data.departmentSections,
      users: db.data.users,
      teams: db.data.teams,
      connectorDefinitions: db.data.connectorDefinitions,
      workflowDefinitions: db.data.workflowDefinitions,
      workflowVersions: db.data.workflowVersions,
    });
  }
}
