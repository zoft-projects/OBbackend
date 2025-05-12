import { VisitActionEnum, VisitTypeEnum } from '../../enums';

type ClientRiskType = {
  riskId: string;
  risk: string;
  comment?: string;
  intakeUser?: string;
};

type CarePlanType = {
  carePlanId: string;
  carePlan: string;
  carePlanStatus?: string;
  description?: string;
};

// TODO: Assess below type and clean up
type ClientType = {
  clientId: string;
  tenantId: string;
  systemType: string;
  firstName: string;
  lastName: string;
  clientPsId: string;
  status: string;
  phone?: string;
  enrolledInMbc?: boolean;
  timezone?: string;
  risks?: ClientRiskType[];
  dob?: string;
  directionDesc?: string;
  address: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
  carePlans: CarePlanType[];
};

type VisitPayloadType = {
  visitId: string;
  cvid: string;
  visitStartDate: string;
  visitEndDate: string;
  visitAvailableAfter?: string;
  clientPsId: string;
  clientId: string;
  tenantId: string;
  clientName: string;
  /**
   * @deprecated use clientMobilePhone/clientHomePhone/clientWorkPhone instead
   */
  clientPhone: string;
  clientMobilePhone?: string;
  clientHomePhone?: string;
  clientWorkPhone?: string;
  clientAddress: {
    streetAddress1: string;
    streetAddress2?: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  clientAddressFormatted: string;
  visitStatus: string;
  clientStatus: string;
  serviceId: string;
  serviceName: string;
  visitType: VisitTypeEnum;
  checkInTime?: string;
  checkOutTime?: string;
  actionStatus: VisitActionEnum;
  isAvailableOffline?: boolean;
};

type VisitDetailPayloadType = {
  visitId: string;
  tenantId: string;
  employeeId: string;
  // Shift details
  visit: {
    cvid: string;
    visitId: string;
    tenantId: string;
    visitStartDate: string;
    visitEndDate: string;
    visitDuration?: string;
    availableActionStatus: VisitActionEnum;
    visitServiceId?: string;
    checkinTime?: string;
    checkoutTime?: string;
    /**
     * @deprecated use canCancel instead
     */
    canCancelUntil?: string;
    canCancel?: boolean;
  };
  // Client details
  client: {
    clientId: string;
    clientPsId: string;
    clientName: string;
    /**
     * @deprecated use clientMobilePhone instead
     */
    clientPhone?: string;
    clientHomePhone?: string;
    clientWorkPhone?: string;
    clientMobilePhone?: string;
    clientStatus: string;
    clientAddress: {
      address: string;
      city: string;
      province: string;
      postalCode: string;
      country: string;
    };
    clientAddressFormatted: string;
    clientPhotoCaptureConsented?: boolean;
    allowProgressNoteEntry?: boolean;
    directionNotes?: string;
    /** @deprecated use contacts from outside */
    contacts?: {
      contactId: string;
      contact: string;
      contactDescription: string;
      lastName: string;
      firstName: string;
      phone?: string;
      relationship?: string;
    }[];
  };
  // Informal contacts
  contacts?: {
    contactId: string;
    contact: string;
    contactDescription?: string;
  }[];
  // Risks and Hazards
  risks: {
    riskId: string;
    risk: string;
    riskDetails?: string;
    intakeUser?: string;
  }[];
  // Care plan activities
  careplans: {
    careplanId: string;
    careplan: string;
    careplanDetails?: string;
    careplanStatus: string;
    highlight?: boolean;
  }[];
  // Progress notes
  progressNotes: {
    noteId: string;
    note: string;
    noteDate: Date;
    highlight?: boolean;
  }[];
  canAddNotesAfterVisit?: boolean;
  // Transfer of Authorities
  transferOfAuthorities: {
    noteId: string;
    note: string;
    noteDate: Date;
  }[];
  // Diagnoses
  diagnoses: {
    diagnosisId: string;
    diagnosis: string;
    diagnosisDescription: string;
  }[];
  // Allergies
  allergies: {
    allergyId: string;
    allergy: string;
    allergyDescription: string;
  }[];
  // Allergies
  nutritions: {
    nutritionId: string;
    nutrition: string;
    nutritionDescription: string;
  }[];
  // Equipments
  equipments: {
    equipmentId: string;
    equipment: string;
    equipmentDescription: string;
  }[];
  // Comments
  comments: {
    commentId: string;
    comment: string;
    commentDescription: string;
  }[];
  // Medications
  medications: {
    medicationId: string;
    medication: string;
    medicationDescription: string;
  }[];
  // Likes & Dislikes
  likesDislikes: {
    likeDislikeId: string;
    likeDislike: string;
    likeDislikeType: string;
    likeDislikeDescription?: string;
  }[];
  // Languages
  languages: {
    languageId: string;
    language: string;
    languageDescription?: string;
  }[];
  // Client Service Preferences
  servicePreferences?: {
    serviceOnStatHoliday?: boolean;
    pcgGenderPreference?: string;
    serviceVisitAvailability?: string;
    interaction?: string[];
    lastUpdatedDate?: string;
    spokenLanguage?: string;
    ageBracketForCaregiver?: string;
    petInHome?: boolean;
    allowSmoking?: boolean;
    allowPerfumes?: boolean;
    serviceAddress?: {
      streetAddress1: string;
      streetAddress2?: string;
      city: string;
      state: string;
      country: string;
      postalCode: string;
      streetAddress: string;
    };
    serviceAddressChange?: boolean;
    startDate?: string;
    endDate?: string;
    petList?: string;
  };
};

type VisitEmployeeAggregatedPayload = {
  employeeDetail: {
    employeeId: string;
    tenantId: string;
    employeePsId: string;
    employeeName: string;
    employeeEmail: string;
    employeeTimezone: string;
  };
  visits: VisitPayloadType[];
  isAlayacareVariant?: boolean;
  lastVisitDate?: string; // TODO: deprecate slowly
  nextStartDate?: string;
};

export { ClientType, VisitEmployeeAggregatedPayload, VisitPayloadType, VisitDetailPayloadType };
