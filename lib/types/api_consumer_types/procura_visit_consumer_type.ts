import { WellnessStatusQuestionType } from '..';
import { VisitStatusEnum } from '../../enums';

/**
 * @deprecated use VisitFromSystemType in the future
 */
type ProcuraVisitFromSystemType = {
  employeeId: string;
  clientId: string;
  visitId?: string;
  peopleSoftClientId?: string;
  visitServiceId?: string;
  callVisitId: string;
  visitStatus: VisitStatusEnum;
  scheduledDate: string;
  openVisitDate?: string;
  closedVisitDate?: string;
  actualVisitDate?: string;
  tenantDbName: string;
  wellnessNotes?: string;
  wellnessStatusQuestions?: WellnessStatusQuestionType[];
  createdDate: string;
  updatedDate: string;
  createdBy: string;
};

export { ProcuraVisitFromSystemType };
