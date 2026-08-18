export interface TeamWorkloadMember {
  userId: string;
  name: string;
  title: string;
  avatar: string;
  role: string;
  maxWeeklyHours: number;
  allocatedWeeklyHours: number;
  utilizationPercent: number;
  isOverAllocated: boolean;
  assignedTicketIds: string[];
}

export interface WorkloadResponse {
  selectedWeek: string;
  totalTeamCapacityHours: number;
  totalAllocatedHours: number;
  overallUtilizationPercent: number;
  members: TeamWorkloadMember[];
}
