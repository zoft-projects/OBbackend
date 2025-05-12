import { VisitStatusEnum } from '../../enums';

type WellnessStatusQuestionType = {
  question: string;
  answer: string;
};

type HttpPostVisitCheckInCheckOut = {
  cvid: string;
  callId?: string;
  clientId: string;
  employeeId: string;
  checkinDatetime?: string;
  checkoutDatetime?: string;
  eventScheduleDate: string;
  status: VisitStatusEnum;
  tenantId?: string;
  dbTenantName: string;
  mileage?: string;
  createdBy: string;
  visitId?: string;
  peopleSoftClientId?: string;
  visitServiceId?: string;
  wellnessNotes?: string;
  wellnessStatusQuestions?: WellnessStatusQuestionType[];
  geo?: {
    latitude: string;
    longitude: string;
  };
  activities?: {
    activityId: string;
    status: boolean;
    reason?: string;
  }[];
  clinicalNote?: {
    subject: string;
    content: string;
  };
};

type HttpPostCheckinType = {
  cvid: string;
  visitId: string;
  tenantId: string;
  deviceTime: string;
  geo?: {
    latitude: string;
    longitude: string;
  };
  progressNoteSubject?: string;
  progressNote?: string;
  lateReason?: string;
};

type HttpPostCheckoutType = {
  cvid: string;
  visitId: string;
  tenantId: string;
  deviceTime: string;
  mileage?: string;
  wellnessNotes?: string;
  wellnessStatusQuestions?: WellnessStatusQuestionType[];
  wellnessImageUrls?: string[];
  geo?: {
    latitude: string;
    longitude: string;
  };
  activities?: {
    careplanId: string;
    isCompleted: boolean;
    reason?: string;
  }[];
  progressNoteSubject?: string;
  progressNote?: string;
  lateReason?: string;
};

export { HttpPostVisitCheckInCheckOut, WellnessStatusQuestionType, HttpPostCheckinType, HttpPostCheckoutType };
