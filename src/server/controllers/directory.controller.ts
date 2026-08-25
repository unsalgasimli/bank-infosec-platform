import { Request, Response } from 'express';
import { WorkflowTemplateService } from '../services/workflow-template.service.js';
import { config } from '../config/index.js';
import { DepartmentsRepository } from '../db/postgres/departments-repository.js';

/**
 * Single read contract for every assignment picker in the client.
 * The service reloads the durable projection before reading, so the UI never
 * has to invent department, section, or employee records locally.
 */
export class DirectoryController {
  public static async assignmentOptions(req: Request, res: Response): Promise<void> {
    if (config.DB_TYPE === 'postgres') {
      try {
        const options = await DepartmentsRepository.listAssignmentOptions({
          departmentId: typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined,
          sectionId: typeof req.query.sectionId === 'string' ? req.query.sectionId : undefined,
          query: typeof req.query.query === 'string' ? req.query.query : undefined,
          offset: Number.parseInt(String(req.query.offset || '0'), 10),
          limit: Number.parseInt(String(req.query.limit || '100'), 10),
        });
        res.json({ success: true, ...options, teams: [] });
        return;
      } catch (error: any) {
        res.status(500).json({ success: false, error: error?.message || 'Directory assignment options could not be loaded.' });
        return;
      }
    }
    const metadata = WorkflowTemplateService.metadata();
    const offset = Number.parseInt(String(req.query.offset || '0'), 10);
    const limit = Number.parseInt(String(req.query.limit || '100'), 10);
    const page = WorkflowTemplateService.assignmentOptions({
      departmentId: typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined,
      sectionId: typeof req.query.sectionId === 'string' ? req.query.sectionId : undefined,
      query: typeof req.query.query === 'string' ? req.query.query : undefined,
      offset: Number.isFinite(offset) ? offset : 0,
      limit: Number.isFinite(limit) ? limit : 100,
    });

    res.json({
      success: true,
      directory: metadata.directory,
      departments: metadata.departments,
      sections: metadata.sections,
      teams: metadata.teams,
      users: page.users,
      total: page.total,
      nextOffset: page.nextOffset,
    });
  }
}
