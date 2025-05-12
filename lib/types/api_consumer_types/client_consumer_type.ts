export type ClientServiceAddressType = {
  streetAddress1: string;
  streetAddress2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  streetAddress: string;
};

// This schema is set from the user-service-sam i.e Client microservice
type ClientFromSystemType = {
  clientId: string;
  tenantId: string;
  systemType: string;
  firstName: string;
  lastName: string;
  peopleSoftId: string;
  branchId: string;
  careManagerId?: string;
  careManagerPsId?: string;
  invoiceLanguage?: string;
  status: string;
  statusInSystem: string;
  contacts?: {
    contactId: string;
    lastName: string;
    firstName: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    phone?: string;
    email?: string;
    relationship?: string;
    autoEnrollMBC: string;
    clientHasProvidedConsent?: boolean;
    isContactFormal?: boolean;
    mobilePhone?: string;
    workPhone?: string;
    homePhone?: string;
    workPhoneExtension?: string;
  }[];
  bio?: string;
  photo?: {
    link?: string;
  };
  autoEnrollMBC: string;
  risksForCaregivers?: {
    id: string;
    description: string;
    reportedIntakeUser?: string;
    reportedByEmployeePsId?: string;
    comment?: string;
  }[];
  languages?: {
    displayName?: string;
  }[];
  diagnosis?: {
    name?: string;
  }[];
  purchasedServices?: {
    serviceId: string;
    serviceName: string;
    availableAdls: string[];
    purchasedAdls: string[];
  }[];
  availableServices?: {
    serviceId: string;
    serviceName: string;
    availableAdls: string[];
    purchasedAdls: string[];
  }[];
  address: {
    streetAddress1: string;
    streetAddress2?: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  directionsCurrentHomeForCaregivers?: string;
  directionsPermanentHomeForCaregivers?: string;
  birthday?: string;
  maritalStatus?: string;
  gender?: string;
  hobbies?: string;
  email: string;
  phone: string;
  mobilePhone?: string;
  workPhone?: string;
  likesDislikes?: string;
  startDate?: string;
  timezone?: string;
  hideInMBC?: boolean;
  createdAt: string;
  updatedAt: string;
  basicInfoLastUpdatedDate?: string;
  attributes?: {
    languages?: string[];
    likes?: {
      name: string;
      comment?: string;
    }[];
    dislikes?: {
      name: string;
      comment?: string;
    }[];
  };
  photoConsent?: {
    granted?: boolean;
    timestamp?: string;
  };
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
    serviceAddress?: ClientServiceAddressType;
    serviceAddressChange?: boolean;
    startDate?: string;
    endDate?: string;
    petList?: string;
  };
  comments?: string;
  isAttendance?: boolean;
  homePhone?: string;
  isRefusal?: boolean;
};

type ClientAddedEntitiesFromSystemType = {
  id: string;
  clientId: string;
  tenantId: string;
  systemType: string;
  peopleSoftId?: string;
  branchId?: string;
  diagnosis?: {
    clientDiagnosisId?: string;
    diagnosisId?: string;
    name?: string;
    reportDate?: string;
    archived?: string;
    diagnosisDate?: string;
    codeType?: string;
    code?: string;
    comments?: string;
  }[];
  allergies?: {
    allergyId?: string;
    allergyType?: string;
    code?: string;
    description?: string;
    degree?: string;
    interventionNotes?: string;
    diagnosisDate?: string;
    functionalDescription?: string;
    furtherEvaluation?: string;
    reportDate?: string;
    functionalCode?: string;
    comments?: string;
  }[];
  medications?: {
    medicationId?: string;
    medicine?: string;
    dosage?: string;
    brandName?: string;
    prescribedDate?: string;
    archived?: string;
  }[];
  nutritions?: {
    nutritionId?: string;
    description?: string;
    recordDate?: string;
    comments?: string;
    archived: boolean;
    type?: string;
    functionalDescriptorCode?: string;
    functionalDescriptorDescription?: string;
    informalSupportDescriptorCode?: string;
    informalSupportDescriptorDescription?: string;
    furtherValuation: boolean;
    historyDate?: string;
    historyOutcome?: string;
    historyCode?: string;
    concersNotify: boolean;
    changeDate?: string;
    changeUser?: string;
  }[];
  equipments?: {
    equipmentPresentId?: string;
    equipmentId?: string;
    missing?: boolean;
    required?: boolean;
    intake?: string;
    changeDate?: string;
    changeUser?: string;
    comments?: string;
    description?: string;
  }[];
  createdAt?: string;
  updatedAt?: string;
};

export { ClientFromSystemType, ClientAddedEntitiesFromSystemType };
