import { DependencyEdgeType } from './blueprints.js';

export interface GanttDependency {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  type: DependencyEdgeType;
  lagDays?: number;
}

export interface GanttTaskSchedule {
  id: string;
  ticketKey: string;
  title: string;
  startDate: string;
  endDate: string;
  progressPercent: number;
  isMilestone: boolean;
  isCriticalPath: boolean;
  dependencies: string[];
  statusCategory: string;
  technicalSeverity: string;
}

export interface GanttScheduleResponse {
  tasks: GanttTaskSchedule[];
  dependencies: GanttDependency[];
  criticalPathTaskIds: string[];
}
