import { FeatureEnum, ActiveEnum } from '../../enums';

type EnrollmentUpsertOperationType = {
  peopleSoftEmpId: string;
  firstName?: string;
  lastName?: string;
  workEmail: string;
  personalEmail?: string;
  workStatus: string;
  phone: string;
  dob?: Date;
  hireDate: string;
  jobCode: string;
  jobTitle?: string;
  jobDescription?: string;
  deptId?: string;
  deptName?: string;
  employeeClass: string;
  managerPeopleSoftEmpId: string;
  managerEmail: string;
  locationId: string;
  locationDescription?: string;
  locationCity: string;
  locationProvince: string;
  preferences?: { prefName: FeatureEnum; prefValue: ActiveEnum; desc?: string }[];
  vendorExpDate?: string;
  gender?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressCity?: string;
  addressProvince?: string;
  addressZipcode?: string;
  addressCountry?: string;
  employeeWorkType?: string;
  employeeWorkHours?: number;
  employeeWorkHoursFrequencyUnit?: string;
};

export { EnrollmentUpsertOperationType };
