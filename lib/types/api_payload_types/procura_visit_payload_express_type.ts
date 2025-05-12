import { WellnessStatusQuestionType } from '..';

/**
 * @deprecated use VisitPayloadType instead
 */
type ProcuraVisitPayloadType = {
  /**
   * @deprecated will be removed
   */
  actualVisitDate: string;
  /**
   * @deprecated will be removed
   */
  scheduledDate: string;
  /**
   * @deprecated use cvid
   */
  callVisitId: string;
  /**
   * @deprecated use tenantId
   */
  tenantDbName: string;
  /**
   * @deprecated use clientPsId
   */
  peopleSoftClientId: string;
  /**
   * @deprecated will be removed
   */
  createdBy: string;
  /**
   * @deprecated use checkinTime
   */
  openVisitDate: string;
  /**
   * @deprecated use checkoutTime
   */
  closedVisitDate: string;

  visitId: string;
  tenantId: string;
  clientId: string;
  clientPsId: string;
  clientName?: string;
  employeeId: string;
  cvid: string;
  visitStartDate: string;
  visitEndDate: string;
  checkinTime?: string;
  checkoutTime?: string;
  visitStatus: string;
  createdDate: Date;
  updatedDate: Date;
  visitServiceId: string;
  wellnessStatusQuestions: WellnessStatusQuestionType[];
  wellnessNotes: string;
  canAddNotesAfterVisit?: boolean;
  isAvailableOffline?: boolean;
};

export { ProcuraVisitPayloadType };
