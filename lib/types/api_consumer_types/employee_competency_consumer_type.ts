type EmployeeCompetencyCreateType = {
  competencyId: string;
  status: string;
  photo?: string;
  acquiredDate: string;
  expiryDate?: string;
  additionalInfo?: {
    immunization?: {
      dosesInfo?: string;
      dateOfLatestImmunization?: string;
    };
    skillsAndCertifications?: {
      validationComment?: string;
    };
  };
};

type EmployeeCompetencyFilterType = {
  lastCursorId?: string;
  limit: number;
  employeePsId: string;
};

type EmployeeCompetencyConsumerType = {
  employeePsId: string;
  competencyId: string;
  status: string;
  photo?: {
    link?: string;
    fileName?: string;
  };
  acquiredDate: string;
  expiryDate?: string;
  additionalInfo?: {
    immunization?: {
      dosesInfo?: string;
      dateOfLatestImmunization?: string;
    };
    skillsAndCertifications?: {
      validationComment?: string;
    };
  };
  competency?: {
    competencyId: string;
    title: {
      title: string;
      lang: string;
    }[];
    status: string;
    isCertificationRequired: boolean;
    isExperienceBased: boolean;
    needVerificationByBranch: boolean;
    jobRoles: string[];
    competencyType: string;
    competencyCategoryId: string;
    competencyCategoryTitle: {
      title: string;
      lang: string;
    }[];
  };
};

export { EmployeeCompetencyConsumerType, EmployeeCompetencyFilterType, EmployeeCompetencyCreateType };
