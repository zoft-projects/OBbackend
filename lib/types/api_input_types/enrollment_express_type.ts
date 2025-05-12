// The auto enrollment receives data from the IT services

// Hence the naming conventions are different here
type HTTPPostEnrollmentApiInput = {
  employee_id: string;
  firstname?: string;
  lastname?: string;
  email_address: string;
  alternate_email_address?: string;
  status: string;
  phone: string;
  dob?: string;
  hire_date: string;
  job_code: string;
  job_title?: string;
  job_description?: string;
  dept_id?: string;
  dept_name?: string;
  employee_class: string;
  geo_division_name?: string;
  manager_level_name?: string;
  supervisor_id: string;
  supervisor_email: string;
  location_id: string;
  location_description?: string;
  location_city: string;
  location_province: string;
  vendor_exp_date?: string;
  gender?: string;
  address_line1?: string;
  address_line2?: string;
  address_city?: string;
  address_province?: string;
  address_zipcode?: string;
  address_country?: string;
  employee_work_type?: string;
  employee_work_hours?: number;
  employee_work_hours_frequency_unit?: string;
};

export { HTTPPostEnrollmentApiInput };
