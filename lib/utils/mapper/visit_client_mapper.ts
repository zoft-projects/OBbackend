import config from 'config';
import ms from 'ms';
import { VisitActionEnum, VisitStatusEnum, VisitTypeEnum } from '../../enums';
import {
  ClientFromSystemType,
  ClientType,
  VisitFromSystemType,
  VisitPayloadType,
  ProcuraVisitPayloadType,
  ProcuraVisitFromSystemType,
  VisitDetailPayloadType,
  ClientAddedEntitiesFromSystemType,
  ClientServiceAddressType,
} from '../../types';
import {
  addMinutes,
  extractAddress,
  dateWithoutTZ,
  rtfToTxt,
  sortListByDate,
  differenceInDays,
  findDurationGap,
  differenceInHours,
  combineAddress,
  joinTextsForDesc,
  differenceInMinutes,
  subHours,
  isValidDate,
  formatDate,
  addHours,
  capitalize,
  dateWithTZ,
  subMinutes,
} from '../../utils';

const {
  alternateTimeCalculation,
  futureStatusIfVisitStartBeyondHours,
  futureStatusOnVisitStartBeyond,
  futureStatusOnVisitStartBeyondImmediate,
  disabledStatusIfVisitBeyondHours,
  progressNotesFromLastDays,
  progressNotesAllowedWithinHours,
}: {
  alternateTimeCalculation: boolean;
  futureStatusIfVisitStartBeyondHours: number;
  futureStatusOnVisitStartBeyond: string;
  futureStatusOnVisitStartBeyondImmediate: string;
  disabledStatusIfVisitBeyondHours: number;
  progressNotesFromLastDays: number;
  progressNotesAllowedWithinHours: number;
} = config.get('Features.visits');

const mapClientSystemToClientApiPayload = (
  clientFromSystem: ClientFromSystemType,
  visitFromSystem: VisitFromSystemType,
): ClientType => {
  const mappedClient: Partial<ClientType> = {};

  if (clientFromSystem.peopleSoftId) {
    mappedClient.clientPsId = clientFromSystem.peopleSoftId;
  }

  if (clientFromSystem.clientId) {
    mappedClient.clientId = clientFromSystem.clientId;
  }

  if (clientFromSystem.tenantId) {
    mappedClient.tenantId = clientFromSystem.tenantId;
  }

  if (clientFromSystem.systemType) {
    mappedClient.systemType = clientFromSystem.systemType;
  }

  if (clientFromSystem.firstName) {
    mappedClient.firstName = clientFromSystem.firstName;
  }

  if (clientFromSystem.lastName) {
    mappedClient.lastName = clientFromSystem.lastName;
  }

  if (clientFromSystem.status) {
    mappedClient.status = clientFromSystem.status;
  }

  if (clientFromSystem.phone) {
    mappedClient.phone = clientFromSystem.phone;
  }

  if (clientFromSystem.autoEnrollMBC) {
    mappedClient.enrolledInMbc = clientFromSystem.autoEnrollMBC.toLowerCase() === 'onboarded';
  }

  if (clientFromSystem.timezone) {
    mappedClient.timezone = clientFromSystem.timezone;
  }

  if (clientFromSystem.directionsCurrentHomeForCaregivers) {
    mappedClient.directionDesc = clientFromSystem.directionsCurrentHomeForCaregivers;
  }

  if (Array.isArray(clientFromSystem.risksForCaregivers)) {
    mappedClient.risks = clientFromSystem.risksForCaregivers.map((risk) => ({
      risk: risk.comment,
      riskId: risk.id,
      comment: risk.description,
      intakeUser: risk.reportedIntakeUser,
    }));
  }

  if (clientFromSystem.address) {
    mappedClient.address = `${clientFromSystem.address.streetAddress1}\n${clientFromSystem.address.streetAddress2}`;
    mappedClient.city = clientFromSystem.address.city;
    mappedClient.province = clientFromSystem.address.state;
    mappedClient.postalCode = clientFromSystem.address.postalCode;
    mappedClient.country = clientFromSystem.address.country;
  }

  if (clientFromSystem.birthday) {
    mappedClient.dob = clientFromSystem.birthday;
  }

  if (visitFromSystem && Array.isArray(visitFromSystem.adlChecklist) && visitFromSystem.adlChecklist.length !== 0) {
    mappedClient.carePlans = visitFromSystem.adlChecklist.map((plan) => {
      return {
        carePlanId: plan.activityId,
        carePlan: plan.name,
      };
    });
  } else {
    mappedClient.carePlans = [];
  }

  return mappedClient as ClientType;
};

const mapVisitSystemToVisitApiPayload = (
  visits: VisitFromSystemType[],
  clients: ClientFromSystemType[],
  {
    ongoingVisitIds,
    completedVisitIds,
    canDoMultipleCheckin,
    hasShorterCheckinWindow,
  }: {
    ongoingVisitIds: string[];
    completedVisitIds: string[];
    canDoMultipleCheckin: boolean;
    hasShorterCheckinWindow: boolean;
  },
): VisitPayloadType[] => {
  const clientMap = new Map<string, ClientFromSystemType>();
  const translatedVisits: VisitPayloadType[] = [];

  const ongoingVisitIdSet = new Set(ongoingVisitIds);
  const completedVisitIdSet = new Set(completedVisitIds);

  // Timeless visit has start and end time as the same meaning caregiver can visit anytime of that day
  const isTimelessVisit = (startTime: Date, endTime: Date) => {
    return differenceInMinutes(endTime, startTime) === 0;
  };

  clients.forEach((client) => {
    clientMap.set(`${client.clientId}_${client.tenantId}`, client);
  });

  visits.forEach((visit) => {
    if (visit.checkOutTime || completedVisitIdSet.has(visit.visitId)) {
      ongoingVisitIdSet.delete(visit.visitId); // If someone was checked out from system directly
    }
  });

  visits.forEach((visit) => {
    if (!clientMap.has(`${visit.clientId}_${visit.tenantId}`)) {
      return;
    }

    const client = clientMap.get(`${visit.clientId}_${visit.tenantId}`);

    // There are cases where client status is Active but no psId which should be ignored
    // client.status === "" || "Active" are valid
    if (client.status && client.status.toLowerCase() !== 'active') {
      return;
    }

    if (client.isRefusal || client.lastName?.toUpperCase() === 'REFUSAL') {
      return;
    }

    const startDateTime = dateWithoutTZ(new Date(visit.startDateTime), visit.timezone);
    const endDateTime = dateWithoutTZ(new Date(visit.endDateTime), visit.timezone);
    let visitAvailableAfter: string = undefined;

    let actionStatus: VisitActionEnum;
    let isAvailableOffline = true;
    const isCurrentVisitTimeless = isTimelessVisit(new Date(visit.startDateTime), new Date(visit.endDateTime));

    if (visit.checkOutTime || completedVisitIdSet.has(visit.visitId)) {
      actionStatus = VisitActionEnum.Visited;
    }
    if (ongoingVisitIdSet.has(visit.visitId)) {
      actionStatus = VisitActionEnum.Ongoing;
    }

    if (!alternateTimeCalculation && !actionStatus) {
      const visitHoursToStartFromNow = differenceInHours(new Date(visit.startDateTime), new Date(), {
        roundingMethod: 'floor',
      });
      // Visit status becomes available after
      visitAvailableAfter = dateWithoutTZ(
        subHours(new Date(startDateTime), futureStatusIfVisitStartBeyondHours),
        visit.timezone,
      );

      let startTimeThresholdHours = -1 * disabledStatusIfVisitBeyondHours;

      // If the visit is timeless then we double the threshold time for checkin
      if (isCurrentVisitTimeless) {
        startTimeThresholdHours = 2 * startTimeThresholdHours;
      }

      if (visitHoursToStartFromNow < startTimeThresholdHours) {
        actionStatus = VisitActionEnum.Disabled;
        isAvailableOffline = false;

        // Ignore adding disabled and past visit since users cannot do any action to this.
        return;
      } else if (visitHoursToStartFromNow > futureStatusIfVisitStartBeyondHours) {
        actionStatus = VisitActionEnum.Future;
        isAvailableOffline = false;
      } else if (canDoMultipleCheckin || ongoingVisitIdSet.size === 0) {
        actionStatus = VisitActionEnum.Available;
      } else if (ongoingVisitIdSet.size > 0) {
        actionStatus = VisitActionEnum.Disabled;
      }
    }

    if (alternateTimeCalculation && !actionStatus) {
      let thresholdTimeForFutureStatus = addMinutes(new Date(), ms(futureStatusOnVisitStartBeyond) / ms('1m'));
      const thresholdTimeForDisabledStatus = subMinutes(new Date(), disabledStatusIfVisitBeyondHours * 60);

      visitAvailableAfter = dateWithoutTZ(
        subMinutes(new Date(startDateTime), ms(futureStatusOnVisitStartBeyond) / ms('1m')),
        visit.timezone,
      );

      if (isCurrentVisitTimeless) {
        thresholdTimeForFutureStatus = addMinutes(new Date(), (ms(futureStatusOnVisitStartBeyond) / ms('1m')) * 2);
      }

      if (hasShorterCheckinWindow && !isCurrentVisitTimeless) {
        const immediateThresholdTime = ms(futureStatusOnVisitStartBeyondImmediate) / ms('1m');

        thresholdTimeForFutureStatus = addMinutes(new Date(), immediateThresholdTime);
        visitAvailableAfter = dateWithoutTZ(
          subMinutes(new Date(startDateTime), immediateThresholdTime),
          visit.timezone,
        );
      }

      if (new Date(visit.startDateTime) > thresholdTimeForFutureStatus) {
        actionStatus = VisitActionEnum.Future;
        isAvailableOffline = false;
      } else if (new Date(visit.startDateTime) < thresholdTimeForDisabledStatus) {
        actionStatus = VisitActionEnum.Disabled;
        isAvailableOffline = false;

        // Ignore adding disabled and past visit since users cannot do any action to this.
        return;
      } else if (canDoMultipleCheckin || ongoingVisitIdSet.size === 0) {
        actionStatus = VisitActionEnum.Available;
      } else if (ongoingVisitIdSet.size > 0) {
        actionStatus = VisitActionEnum.Disabled;
      }
    }

    translatedVisits.push({
      visitId: visit.visitId,
      cvid: visit.cvid,
      clientId: client.clientId,
      tenantId: client.tenantId,
      visitStartDate: startDateTime,
      visitEndDate: endDateTime,
      visitAvailableAfter,
      clientName: `${client.firstName || ''} ${client.lastName || ''}`,
      clientPhone: client.phone,
      clientHomePhone: client.homePhone,
      clientMobilePhone: client.mobilePhone,
      clientWorkPhone: client.workPhone,
      clientPsId: client.peopleSoftId,
      clientAddress: client.address,
      visitStatus: visit.status,
      clientStatus: client.status,
      serviceId: visit.service?.serviceId ?? '',
      serviceName: visit.service?.serviceName ?? '',
      checkInTime: visit.checkInTime,
      checkOutTime: visit.checkOutTime,
      visitType: isCurrentVisitTimeless ? VisitTypeEnum.Timeless : VisitTypeEnum.Regular,
      actionStatus,
      isAvailableOffline,
      clientAddressFormatted: combineAddress(client.address, true),
    });
  });

  return translatedVisits;
};

const mapVisitToPreviousVisitApiPayload = (
  previousVisits: VisitFromSystemType[],
  clients: ClientFromSystemType[],
  userDisplayName: string,
): ProcuraVisitPayloadType[] => {
  const translatedVisits: ProcuraVisitPayloadType[] = [];

  const isTimelessVisit = (startTime: Date, endTime: Date) => {
    return differenceInMinutes(endTime, startTime) === 0;
  };

  const clientMap = new Map<string, ClientFromSystemType>();

  clients.forEach((client) => {
    clientMap.set(`${client.clientId}_${client.tenantId}`, client);
  });

  previousVisits.forEach((visit) => {
    if (visit.visitId && visit.checkInTime && visit.checkOutTime) {
      const [employeeId = ''] = visit.scheduledEmployeeIds;

      const visitStartDate = new Date(visit.startDateTime);
      const visitEndDate = new Date(visit.endDateTime);
      const canAddNotesAfterVisit: boolean = new Date() < addHours(visitStartDate, progressNotesAllowedWithinHours);

      // Logic for isAvailableOffline
      const visitHoursToStartFromNow = differenceInHours(visitStartDate, new Date(), { roundingMethod: 'floor' });
      let isAvailableOffline = true;
      let startTimeThresholdHours = -1 * disabledStatusIfVisitBeyondHours;

      const isCurrentVisitTimeless = isTimelessVisit(visitStartDate, visitEndDate);
      if (isCurrentVisitTimeless) {
        startTimeThresholdHours = 2 * startTimeThresholdHours;
      }

      if (visitHoursToStartFromNow < startTimeThresholdHours) {
        isAvailableOffline = false;
      }

      const mappedClient = clientMap.get(`${visit.clientId}_${visit.tenantId}`);
      const clientName = mappedClient ? [mappedClient.firstName, mappedClient.lastName].join(' ') : '';

      translatedVisits.push({
        visitId: visit.visitId,
        tenantId: visit.tenantId,
        cvid: visit.cvid,
        clientPsId: visit.clientPsId,
        clientId: visit.clientId,
        clientName,
        employeeId,
        visitStatus: VisitStatusEnum.Closed,
        checkinTime: dateWithoutTZ(new Date(visit.checkInTime)), // Timezone is not required
        checkoutTime: dateWithoutTZ(new Date(visit.checkOutTime)), // Timezone is not required
        visitStartDate: dateWithoutTZ(new Date(visit.startDateTime), visit.timezone), // Timezone required as it is converted in the ETL
        visitEndDate: dateWithoutTZ(new Date(visit.endDateTime), visit.timezone), // Timezone required as it is converted in the ETL
        wellnessStatusQuestions: [],
        wellnessNotes: '',
        canAddNotesAfterVisit,
        isAvailableOffline,
        // TODO: Remove irrelevant fields later
        actualVisitDate: visit.checkInTime,
        callVisitId: visit.cvid,
        scheduledDate: visit.startDateTime,
        tenantDbName: visit.tenantId,
        createdDate: new Date(visit.createdDateTime),
        updatedDate: new Date(visit.updatedDateTime),
        createdBy: userDisplayName,
        peopleSoftClientId: visit.clientPsId,
        visitServiceId: visit.service?.serviceId ?? '',
        openVisitDate: dateWithoutTZ(new Date(visit.checkInTime)),
        closedVisitDate: dateWithoutTZ(new Date(visit.checkOutTime)),
      });
    }
  });

  return translatedVisits;
};

const mapVisitAndClientApiPayload = (
  employeeId: string,
  {
    visit,
    client,
    clientAdditionalDetails,
    previousVisitWriteEntry,
  }: {
    visit: VisitFromSystemType;
    client: ClientFromSystemType;
    clientAdditionalDetails?: ClientAddedEntitiesFromSystemType;
    previousVisitWriteEntry?: ProcuraVisitFromSystemType;
  },
): VisitDetailPayloadType => {
  const startDateTime = dateWithoutTZ(new Date(visit.startDateTime), visit.timezone ?? client.timezone);
  const endDateTime = dateWithoutTZ(new Date(visit.endDateTime), visit.timezone ?? client.timezone);

  const visitDuration = findDurationGap(new Date(visit.startDateTime), new Date(visit.endDateTime));

  const visitStartDate = new Date(visit.startDateTime);
  const canAddNotesAfterVisit: boolean = new Date() < addHours(visitStartDate, progressNotesAllowedWithinHours);

  let actionStatus: VisitActionEnum = VisitActionEnum.Unknown;
  let canCancel: boolean = undefined;
  // TODO Remove below field later
  let canCancelUntil: string = undefined;

  if (visit.checkOutTime) {
    actionStatus = VisitActionEnum.Visited;
  }

  if (
    (visit.checkInTime && !visit.checkOutTime) ||
    (!visit.checkInTime && previousVisitWriteEntry?.visitStatus === VisitStatusEnum.Open)
  ) {
    actionStatus = VisitActionEnum.Unknown;

    const visitCheckinTime = new Date(
      visit.checkInTime
        ? dateWithTZ(new Date(visit.checkInTime), visit.timezone ?? client.timezone) // convert checkInTime from local time to utc
        : previousVisitWriteEntry?.openVisitDate, // openVisitDate is already in utc
    );
    // TODO Move 15 to config value
    if (visitCheckinTime > new Date(visit.startDateTime) && differenceInMinutes(new Date(), visitCheckinTime) < 15) {
      canCancel = true;
      canCancelUntil = dateWithoutTZ(addMinutes(visitCheckinTime, 15), visit.timezone ?? client.timezone);
    } else if (differenceInMinutes(new Date(), new Date(visit.startDateTime)) < 15) {
      canCancel = true;
      canCancelUntil = dateWithoutTZ(addMinutes(new Date(visit.startDateTime), 15), visit.timezone ?? client.timezone);
    }
  }

  const combinedLikesDislikes: VisitDetailPayloadType['likesDislikes'] = [];
  (client.attributes?.likes ?? []).forEach((clientLike, idx) => {
    combinedLikesDislikes.push({
      likeDislikeId: `_${idx}`,
      likeDislike: clientLike.name,
      likeDislikeType: 'Like',
      likeDislikeDescription: clientLike.comment,
    });
  });
  (client.attributes?.dislikes ?? []).forEach((clientDislike, idx) => {
    combinedLikesDislikes.push({
      likeDislikeId: `_${idx}`,
      likeDislike: clientDislike.name,
      likeDislikeType: 'Dislike',
      likeDislikeDescription: clientDislike.comment,
    });
  });

  const languagesSpoken: VisitDetailPayloadType['languages'] = [];

  (client.attributes?.languages ?? []).forEach((language, idx) => {
    languagesSpoken.push({
      languageId: `_${idx}`,
      language,
    });
  });

  const servicePreferences: Partial<ClientFromSystemType['servicePreferences']> = {};
  if (client.servicePreferences) {
    if (client.servicePreferences.serviceOnStatHoliday) {
      servicePreferences.serviceOnStatHoliday = client.servicePreferences.serviceOnStatHoliday;
    }

    if (client.servicePreferences.pcgGenderPreference) {
      servicePreferences.pcgGenderPreference = client.servicePreferences.pcgGenderPreference;
    }

    if (client.servicePreferences.serviceVisitAvailability) {
      servicePreferences.serviceVisitAvailability = client.servicePreferences.serviceVisitAvailability;
    }

    if (client.servicePreferences.interaction) {
      servicePreferences.interaction = client.servicePreferences.interaction;
    }

    if (client.servicePreferences.spokenLanguage) {
      servicePreferences.spokenLanguage = client.servicePreferences.spokenLanguage;
    }

    if (client.servicePreferences.ageBracketForCaregiver) {
      servicePreferences.ageBracketForCaregiver = client.servicePreferences.ageBracketForCaregiver;
    }

    if (client.servicePreferences.petInHome) {
      servicePreferences.petInHome = client.servicePreferences.petInHome;
    }

    if (client.servicePreferences.allowSmoking) {
      servicePreferences.allowSmoking = client.servicePreferences.allowSmoking;
    }

    if (client.servicePreferences.allowPerfumes) {
      servicePreferences.allowPerfumes = client.servicePreferences.allowPerfumes;
    }

    if (client.servicePreferences.serviceAddress) {
      servicePreferences.serviceAddress = {} as ClientServiceAddressType;
      servicePreferences.serviceAddress.streetAddress1 = client.servicePreferences.serviceAddress.streetAddress1 ?? '';
      servicePreferences.serviceAddress.streetAddress2 = client.servicePreferences.serviceAddress.streetAddress2 ?? '';
      servicePreferences.serviceAddress.city = client.servicePreferences.serviceAddress.city ?? '';
      servicePreferences.serviceAddress.state = client.servicePreferences.serviceAddress.state ?? '';
      servicePreferences.serviceAddress.country = client.servicePreferences.serviceAddress.country ?? '';
      servicePreferences.serviceAddress.postalCode = client.servicePreferences.serviceAddress.postalCode ?? '';
      servicePreferences.serviceAddress.streetAddress = client.servicePreferences.serviceAddress.streetAddress ?? '';
    }

    if (client.servicePreferences.serviceAddressChange) {
      servicePreferences.serviceAddressChange = client.servicePreferences.serviceAddressChange;
    }

    if (client.servicePreferences.startDate) {
      servicePreferences.startDate = client.servicePreferences.startDate;
    }

    if (client.servicePreferences.endDate) {
      servicePreferences.endDate = client.servicePreferences.endDate;
    }

    if (client.servicePreferences.petList) {
      servicePreferences.petList = client.servicePreferences.petList;
    }
  }

  const clientContacts: VisitDetailPayloadType['contacts'] = [];

  const uniqueContactIdSet = new Set<string>();
  (client.contacts ?? []).forEach((contact) => {
    if (contact.isContactFormal && uniqueContactIdSet.has(contact.contactId)) {
      return;
    }

    if (contact.isContactFormal) {
      clientContacts.push({
        contactId: contact.contactId,
        contact: `${contact.firstName} ${contact.lastName}`,
        contactDescription: joinTextsForDesc([contact.relationship ?? '', '(Formal)']),
      });

      uniqueContactIdSet.add(contact.contactId);

      return;
    }

    if (contact.mobilePhone) {
      clientContacts.push({
        contactId: `${contact.contactId}-mobile`,
        contact: `${contact.firstName} ${contact.lastName}`,
        contactDescription: joinTextsForDesc([contact.relationship ?? '', contact.mobilePhone, '(Mobile) (Informal)']),
      });

      uniqueContactIdSet.add(`${contact.contactId}-mobile`);
    }
    if (contact.homePhone) {
      clientContacts.push({
        contactId: `${contact.contactId}-home`,
        contact: `${contact.firstName} ${contact.lastName}`,
        contactDescription: joinTextsForDesc([contact.relationship ?? '', contact.homePhone, '(Home) (Informal)']),
      });

      uniqueContactIdSet.add(`${contact.contactId}-home`);
    }
    if (contact.workPhone) {
      clientContacts.push({
        contactId: `${contact.contactId}-work`,
        contact: `${contact.firstName} ${contact.lastName}`,
        contactDescription: joinTextsForDesc([contact.relationship ?? '', contact.workPhone, '(Work) (Informal)']),
      });

      uniqueContactIdSet.add(`${contact.contactId}-work`);
    }
  });

  const checkinTime = visit.checkInTime
    ? dateWithTZ(new Date(visit.checkInTime), visit.timezone ?? client.timezone)
    : undefined;
  const checkoutTime = visit.checkOutTime
    ? dateWithTZ(new Date(visit.checkOutTime), visit.timezone ?? client.timezone)
    : undefined;

  const mappedPayload: VisitDetailPayloadType = {
    employeeId,
    visitId: visit.visitId,
    tenantId: visit.tenantId,

    // Visit details
    visit: {
      cvid: visit.cvid,
      visitId: visit.visitId,
      tenantId: visit.tenantId,
      availableActionStatus: actionStatus,
      visitServiceId: visit.service?.serviceId ?? '',
      visitStartDate: startDateTime,
      visitEndDate: endDateTime,
      visitDuration,
      checkinTime,
      checkoutTime,
      canCancel,
      canCancelUntil,
    },

    // Client details
    client: {
      clientId: client.clientId,
      clientName: `${client.firstName || ''} ${client.lastName || ''}`,
      clientPsId: client.peopleSoftId,
      clientPhone: client.phone,
      clientHomePhone: client.homePhone,
      clientWorkPhone: client.workPhone,
      clientMobilePhone: client.mobilePhone,
      clientStatus: client.status,
      clientAddress: extractAddress(client.address),
      clientAddressFormatted: combineAddress(client.address),
      clientPhotoCaptureConsented: client.photoConsent?.granted ?? false,
      directionNotes:
        (client.directionsCurrentHomeForCaregivers || '') +
        (visit.shiftCode?.trim() ? `\nSHIFT CODE: ${visit.shiftCode.trim()}` : ''),
      allowProgressNoteEntry: true,
      /**
       * @deprecated use contacts from the outer scope
       */
      contacts: [],
    },

    // Formal/Informal contacts
    contacts: clientContacts,

    // Risks and hazards details
    risks: (client.risksForCaregivers ?? []).map((risk) => ({
      riskId: risk.id,
      risk: risk.description,
      riskDetails: risk.comment,
      intakeUser: risk.reportedIntakeUser,
    })),

    // Careplan activities details
    careplans: (visit.adlChecklist ?? []).map((carePlanActivity) => ({
      careplanId: carePlanActivity.activityId,
      careplan: carePlanActivity.isToA ? `TOA: ${carePlanActivity.name}` : carePlanActivity.name,
      careplanStatus: carePlanActivity.status,
      careplanDetails: carePlanActivity.detailedDesc,
      highlight: Boolean(carePlanActivity.isToA),
    })),

    // Progress notes (Client condition notes from Procura) sorted desc by noteDate
    progressNotes: sortListByDate<VisitDetailPayloadType['progressNotes'][0]>(
      (visit.clientConditionNotes ?? visit.notes ?? [])
        .filter(
          (clientNote) =>
            Math.abs(
              differenceInDays(
                new Date(clientNote.metadata?.systemChangeDate ?? clientNote.createdDateTime),
                new Date(),
              ),
            ) < progressNotesFromLastDays,
        )
        .map((clientNote) => ({
          noteId: clientNote.noteId,
          note: rtfToTxt(clientNote.content),
          noteDate: new Date(clientNote.metadata?.systemChangeDate ?? clientNote.createdDateTime),
          highlight: false, // If required
        })),
      'noteDate',
      // TODO Move this to config
    ).slice(0, 10),
    canAddNotesAfterVisit,

    // Transfer of Authorities
    transferOfAuthorities: (visit.toaNotes ?? []).map((toaNote) => ({
      noteId: toaNote.noteId,
      note: joinTextsForDesc([toaNote.subject, rtfToTxt(toaNote.content)], '\n'),
      noteDate: new Date(toaNote.metadata?.systemChangeDate ?? toaNote.createdDateTime),
    })),

    // Allergies
    allergies: (clientAdditionalDetails?.allergies ?? []).map((allergy) => ({
      allergyId: allergy.allergyId,
      allergy: joinTextsForDesc([allergy.description]),
      allergyDescription: joinTextsForDesc([
        capitalize(allergy.degree ?? ''),
        capitalize(allergy.allergyType ?? ''),
        allergy.interventionNotes,
      ]),
    })),

    // Diagnoses
    diagnoses: (clientAdditionalDetails?.diagnosis ?? []).map((diagnosis) => ({
      diagnosisId: diagnosis.diagnosisId,
      diagnosis: `${diagnosis.name}`,
      diagnosisDescription: joinTextsForDesc([
        isValidDate(new Date(diagnosis.reportDate)) ? `(Report date) ${formatDate(diagnosis.reportDate)}` : '',
        isValidDate(new Date(diagnosis.diagnosisDate)) ? `(Diagnosis date) ${formatDate(diagnosis.diagnosisDate)}` : '',
        diagnosis.comments,
      ]),
    })),

    // Medications
    medications: (clientAdditionalDetails?.medications ?? []).map((medication) => ({
      medicationId: medication.medicationId,
      medication: capitalize(medication.medicine ?? ''),
      medicationDescription: joinTextsForDesc([
        medication.dosage,
        isValidDate(new Date(medication.prescribedDate)) ? formatDate(medication.prescribedDate) : '',
      ]),
    })),

    // Nutritions
    nutritions: (clientAdditionalDetails?.nutritions ?? []).map((nutrition) => ({
      nutritionId: nutrition.nutritionId,
      nutrition: nutrition.description,
      nutritionDescription: joinTextsForDesc([nutrition.type, nutrition.comments]),
    })),

    // Likes & Dislikes
    likesDislikes: combinedLikesDislikes,

    // Languages
    languages: languagesSpoken,

    // Equipments
    equipments: (clientAdditionalDetails?.equipments ?? []).map((equipment) => ({
      equipmentId: equipment.equipmentId,
      equipment: joinTextsForDesc([equipment.description]),
      equipmentDescription: joinTextsForDesc([equipment.comments]),
    })),

    // Comments
    comments: client.comments
      ? [
          {
            commentId: 'clientComment',
            comment: '',
            commentDescription: client.comments,
          },
        ]
      : [],
    servicePreferences,
  };

  // For ui purpose, show most recent 10 notes as default
  if (mappedPayload.progressNotes.length > 10) {
    mappedPayload.progressNotes = mappedPayload.progressNotes.slice(0, 10);
  }

  return mappedPayload;
};

export {
  mapClientSystemToClientApiPayload,
  mapVisitToPreviousVisitApiPayload,
  mapVisitAndClientApiPayload,
  mapVisitSystemToVisitApiPayload,
};
