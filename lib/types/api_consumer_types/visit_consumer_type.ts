import { WellnessStatusQuestionType } from '..';

type VisitFromSystemType = {
  visitId: string;
  tenantId: string;
  systemType: string;
  clientId: string;
  clientPsId: string;
  status: string;
  statusInSystem: string;
  startDateTime: string;
  endDateTime: string;
  scheduledEmployeeIds: string[];
  service?: {
    serviceId: string;
    serviceName: string;
  };
  cvid: string;
  statusReason?: string;
  confirmedByClient?: boolean;
  billable?: boolean;
  payable?: boolean;
  checkInTime?: string;
  checkOutTime?: string;
  adlChecklist?: {
    activityId: string;
    name: string;
    status: string;
    detailedDesc?: string;
    isVisitLevel?: boolean;
    isToA?: boolean;
  }[];
  timezone?: string;
  plannerId?: string;
  visitType: string;
  createdDateTime?: string;
  updatedDateTime?: string;
  wellnessNotes?: string;
  wellnessQuestionAnswers?: WellnessStatusQuestionType[];
  notes?: {
    tenantId: string;
    systemType: string;
    noteId: string;
    clientId: string;
    content?: string;
    clientPsId?: string;
    subject?: string;
    metadata?: {
      systemChangeDate?: Date;
    };
    noteType?: string;
    createdDateTime: Date;
    updatedDateTime: Date;
  }[];
  clientConditionNotes?: {
    tenantId: string;
    systemType: string;
    noteId: string;
    clientId: string;
    content?: string;
    clientPsId?: string;
    subject?: string;
    metadata?: {
      systemChangeDate?: Date;
    };
    noteType?: string;
    createdDateTime: Date;
    updatedDateTime: Date;
  }[];
  toaNotes?: {
    tenantId: string;
    systemType: string;
    noteId: string;
    clientId: string;
    content?: string;
    clientPsId?: string;
    subject?: string;
    metadata?: {
      systemChangeDate?: Date;
    };
    noteType?: string;
    createdDateTime: Date;
    updatedDateTime: Date;
  }[];
  shiftCode?: string;
};

/**
 * @see https://github.com/Bayshore-HealthCare/event-service-sam/blob/43d9adc2cf830bde4ed690071d33e5ef8c930502/lib/models/rest/procura_event_post.ts#L54-L72
 */
type CheckinToSystemType = {
  cvid: string;
  visitId: string;
  tenantId: string;
  systemType: string;
  employeeId: string;
  clientId: string;
  checkinTime: string;
  createdBy: string;

  // Optional fields below
  caregiverEmail?: string;
  clientPsId?: string;
  visitServiceId?: string;
  geo?: {
    latitude: string;
    longitude: string;
  };
  lateReason?: string;
};

/**
 * @see https://github.com/Bayshore-HealthCare/event-service-sam/blob/6ac9913034a6e158dd80958d4611e089db1b1e71/lib/models/rest/procura_event_post.ts#L57
 */
type ResetCheckinPostType = {
  cvid: string;
  visitId: string;
  tenantId: string;
  employeeId: string;
};

/**
 * @see https://github.com/Bayshore-HealthCare/event-service-sam/blob/43d9adc2cf830bde4ed690071d33e5ef8c930502/lib/models/rest/procura_event_post.ts#L74-L105
 */
type CheckoutToSystemType = {
  cvid: string;
  visitId: string;
  tenantId: string;
  systemType: string;
  employeeId: string;
  clientId: string;
  checkoutTime: string;
  createdBy: string;

  // Optional fields below
  caregiverEmail?: string;
  clientPsId?: string;
  visitServiceId?: string;
  wellnessImageUrls?: string[];
  geo?: {
    latitude: string;
    longitude: string;
  };

  // More optional fields below
  wellnessNote?: string;
  noteForWellness?: {
    subject: string;
    content: string;
  };
  wellnessStatusQuestions?: WellnessStatusQuestionType[];
  activities?: {
    activityId: string;
    status: boolean;
    reason?: string;
    isVisitLevel?: boolean;
  }[];
  noteForBranch?: {
    subject: string;
    content: string;
  };
  lateReason?: string;
};

type CreateNoteType = {
  clientId: string;
  employeeId: string;
  createdBy: string;
  tenantId: string;
  visitId: string;
  noteForBranch: {
    noteType: string;
    subject: string;
    content: string;
  };
};

export { VisitFromSystemType, CheckinToSystemType, CheckoutToSystemType, CreateNoteType, ResetCheckinPostType };
