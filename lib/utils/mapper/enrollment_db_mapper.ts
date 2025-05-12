import { format } from 'date-fns';
import { ProvincialCodesEnum } from '../../enums';
import {
  EmployeeServiceUpsertOperationType,
  EnrollmentUpsertOperationType,
  HTTPPostEnrollmentApiInput,
  OBProfileUpsertOperationType,
} from '../../types';
import { isValidDate, userPsId } from '../../utils';

const mapApiRequestToOperation = (requestData: HTTPPostEnrollmentApiInput): EnrollmentUpsertOperationType => {
  const hireDate = new Date(requestData.hire_date);
  const hireDateString = isValidDate(hireDate) ? format(hireDate, 'yyyy-MM-dd') : null;

  const mappedEnrollmentData: EnrollmentUpsertOperationType = {
    peopleSoftEmpId: requestData.employee_id,
    workEmail: requestData.email_address,
    workStatus: requestData.status,
    phone: requestData.phone,
    hireDate: hireDateString,
    jobCode: `${parseInt(requestData.job_code, 10)}`,
    employeeClass: requestData.employee_class,
    managerPeopleSoftEmpId: requestData.supervisor_id,
    managerEmail: requestData.supervisor_email,
    locationId: `${parseInt(requestData.location_id, 10)}`,
    locationCity: requestData.location_city,
    locationProvince: requestData.location_province,
  };

  if (requestData.firstname) {
    mappedEnrollmentData.firstName = requestData.firstname;
  }

  if (requestData.lastname) {
    mappedEnrollmentData.lastName = requestData.lastname;
  }

  if (requestData.alternate_email_address) {
    mappedEnrollmentData.personalEmail = requestData.alternate_email_address;
  }

  if (requestData.dob) {
    mappedEnrollmentData.firstName = requestData.firstname;
  }

  if (requestData.job_title) {
    mappedEnrollmentData.jobTitle = requestData.job_title;
  }

  if (requestData.job_description) {
    mappedEnrollmentData.jobDescription = requestData.job_description;
  }

  if (requestData.dept_id) {
    mappedEnrollmentData.deptId = requestData.dept_id;
  }

  if (requestData.location_description) {
    mappedEnrollmentData.locationDescription = requestData.location_description;
  }

  if (requestData.vendor_exp_date) {
    mappedEnrollmentData.vendorExpDate = requestData.vendor_exp_date;
  }

  if (requestData.gender) {
    mappedEnrollmentData.gender = requestData.gender;
  }

  if (requestData.address_line1) {
    mappedEnrollmentData.addressLine1 = requestData.address_line1;
  }

  if (requestData.address_line2) {
    mappedEnrollmentData.addressLine2 = requestData.address_line2;
  }

  if (requestData.address_city) {
    mappedEnrollmentData.addressCity = requestData.address_city;
  }

  if (requestData.address_province) {
    mappedEnrollmentData.addressProvince = requestData.address_province;
  }

  if (requestData.address_zipcode) {
    mappedEnrollmentData.addressZipcode = requestData.address_zipcode;
  }

  if (requestData.address_country) {
    mappedEnrollmentData.addressCountry = requestData.address_country;
  }

  if (requestData.employee_work_type) {
    mappedEnrollmentData.employeeWorkType = requestData.employee_work_type;
  }

  if (requestData.employee_work_hours) {
    mappedEnrollmentData.employeeWorkHours = requestData.employee_work_hours;
  }

  if (requestData.employee_work_hours_frequency_unit) {
    mappedEnrollmentData.employeeWorkHoursFrequencyUnit = requestData.employee_work_hours_frequency_unit;
  }

  return mappedEnrollmentData;
};

const mapPSRecordToEmployeeOperation = (
  employeePeopleSoftData: EnrollmentUpsertOperationType,
): EmployeeServiceUpsertOperationType => {
  const {
    peopleSoftEmpId,
    firstName,
    lastName,
    workEmail,
    personalEmail,
    workStatus,
    phone: phoneNumber,
    dob: dobValue,
    hireDate: hireDateValue,
    deptId,
    deptName,
    jobCode,
    jobTitle,
    employeeClass: employeeClassInSystem,
    managerEmail: managerEmailInSystem,
    locationId: locationIdInSystem,
    locationCity,
    locationProvince,
    vendorExpDate,
    gender,
    addressLine1,
    addressLine2,
    addressCity,
    addressProvince,
    addressZipcode,
    addressCountry,
    employeeWorkType,
    employeeWorkHours,
    employeeWorkHoursFrequencyUnit,
  } = employeePeopleSoftData;

  const dob = dobValue && isValidDate(new Date(dobValue)) ? new Date(dobValue).toISOString() : null;
  const hireDate = hireDateValue && isValidDate(new Date(hireDateValue)) ? new Date(hireDateValue).toISOString() : null;

  const mappedEmployeeData: EmployeeServiceUpsertOperationType = {
    employeePsId: userPsId(peopleSoftEmpId),
    firstName,
    lastName,
    email: workEmail.toLowerCase().trim(),
    alternateEmail: personalEmail?.toLowerCase().trim(),
    workStatus: workStatus.toUpperCase(),
    phoneNumber,
    dob,
    hireDate,
    jobCodeInSystem: jobCode,
    jobTitleInSystem: jobTitle ?? '',
    deptId,
    deptName,
    employeeClassInSystem,
    managerEmailInSystem,
    locationIdInSystem,
    locationCity,
    locationProvince,
    languages: ['ENGLISH'],
    vendorExpDate,
    gender,
    addressLine1,
    addressLine2,
    addressCity,
    addressProvince,
    addressZipcode,
    addressCountry,
    employeeWorkType,
    employeeWorkHours,
    employeeWorkHoursFrequencyUnit,
  };

  return mappedEmployeeData;
};

const mapEmployeePSRecordToOB = (
  employeePeopleSoftData: EnrollmentUpsertOperationType,
  additionalDetails: {
    branchDetail: {
      branchId: string;
      province: string;
    };
    jobDetail: {
      jobLevel: number;
    };
  },
): OBProfileUpsertOperationType => {
  const { branchDetail } = additionalDetails;
  const { jobDetail } = additionalDetails;

  const mappedEmployeeData: OBProfileUpsertOperationType = {
    psId: employeePeopleSoftData.peopleSoftEmpId,
    displayName: `${employeePeopleSoftData.firstName} ${employeePeopleSoftData.lastName}`,
    workEmail: employeePeopleSoftData.workEmail,
    activeStatus: employeePeopleSoftData.workStatus,
    branchIds: [branchDetail.branchId],
    job: {
      jobId: employeePeopleSoftData.jobCode,
      code: employeePeopleSoftData.jobTitle,
      title: employeePeopleSoftData.jobDescription || employeePeopleSoftData.jobTitle,
      level: jobDetail.jobLevel,
    },
    isActivated: 'false',
    preferences: employeePeopleSoftData.preferences,
  };

  if (employeePeopleSoftData.personalEmail) {
    mappedEmployeeData.tempProfile = {};
    mappedEmployeeData.tempProfile.recoveryEmail = employeePeopleSoftData.personalEmail;
  }
  if (employeePeopleSoftData.phone) {
    mappedEmployeeData.tempProfile = mappedEmployeeData.tempProfile ?? {};
    mappedEmployeeData.tempProfile.recoveryPhone = employeePeopleSoftData.phone;
  }

  if (employeePeopleSoftData.locationProvince) {
    const province = employeePeopleSoftData.locationProvince.toUpperCase() as ProvincialCodesEnum;
    mappedEmployeeData.provincialCodes = [province];
  } else {
    const province = branchDetail.province as ProvincialCodesEnum;
    mappedEmployeeData.provincialCodes = [province];
  }

  return mappedEmployeeData;
};

export { mapApiRequestToOperation, mapPSRecordToEmployeeOperation, mapEmployeePSRecordToOB };
