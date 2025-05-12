import { FilterQuery } from 'mongoose';
import { logInfo, logWarn, logError, logDebug } from '../../log/util';
import { OBJobModel } from '../../models';
import { OBJobSchemaType, OBJobOperationType } from '../../types';
import { mapJobOperationToDbRecord } from '../../utils';

const getJobById = async (transactionId: string, jobId: string): Promise<OBJobSchemaType | null> => {
  logInfo(`[${transactionId}] [SERVICE] getJobById - Getting job by jobId: ${jobId}`);

  try {
    const jobDbRecord = await OBJobModel.findOne({ jobId });

    if (jobDbRecord) {
      const job = jobDbRecord.toJSON();

      return job;
    }

    logWarn(`[${transactionId}] [SERVICE] getJobById - No job found for jobId: ${jobId}`);

    return null;
  } catch (getErr) {
    logError(`[${transactionId}] [SERVICE] getJobById - FAILED for jobId: ${jobId}, reason: ${getErr.message}`);

    throw getErr;
  }
};

const getJobByCode = async (transactionId: string, jobCode: string): Promise<OBJobSchemaType | null> => {
  logInfo(`[${transactionId}] [SERVICE] getJobByCode - Getting job by jobCode: ${jobCode}`);

  try {
    const jobDbRecord = await OBJobModel.findOne({ jobCode });

    if (jobDbRecord) {
      const job = jobDbRecord.toJSON();

      return job;
    }

    logWarn(`[${transactionId}] [SERVICE] getJobByCode - No job found for jobCode: ${jobCode}`);

    return null;
  } catch (getErr) {
    logError(`[${transactionId}] [SERVICE] getJobByCode - FAILED for jobCode: ${jobCode}, reason: ${getErr.message}`);

    throw getErr;
  }
};

const getAllJobs = async (
  transactionId: string,
  filters?: FilterQuery<OBJobSchemaType>,
): Promise<OBJobSchemaType[]> => {
  logInfo(`[${transactionId}] [SERVICE] getAllJobs - Getting all jobs`);

  try {
    const jobsDbRecords = await OBJobModel.find({ ...filters });

    const jobs = jobsDbRecords.map((jobDbRecord) => jobDbRecord.toJSON());

    logInfo(`[${transactionId}] [SERVICE] getAllJobs - SUCCESSFULLY retrieved: ${jobs.length} jobs`);

    return jobs;
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] getAllJobs - FAILED, reason: ${listErr.message}`);

    throw listErr;
  }
};

const createJob = async (transactionId: string, job: OBJobSchemaType): Promise<string> => {
  logInfo(`[${transactionId}] [SERVICE] createJob - creating job for jobId: ${job.jobId}`);

  try {
    const newJob = new OBJobModel(job);

    const createdJob = await newJob.save();

    logInfo(`[${transactionId}] [SERVICE] createJob - SUCCESSFUL for jobId: ${job.jobId}`);

    return createdJob.jobId;
  } catch (createErr) {
    logError(`[${transactionId}] [SERVICE] createJob - FAILED for jobCode: ${job.jobId}, reason: ${createErr.message}`);
    logDebug(`[${transactionId}] [SERVICE] createJob - FAILED details, provided: ${JSON.stringify(job)}`);

    throw createErr;
  }
};

const updateJob = async (transactionId: string, jobPartialFields: Partial<OBJobSchemaType>): Promise<string> => {
  logInfo(`[${transactionId}] [SERVICE] updateJob - updating job for jobId: ${jobPartialFields.jobId}`);

  try {
    if (!jobPartialFields.jobId) {
      throw new Error('Missing mandatory field jobId for update');
    }

    const updatedJob = await OBJobModel.findOneAndUpdate(
      {
        jobId: jobPartialFields.jobId,
      },
      {
        ...jobPartialFields,
        updatedAt: new Date(),
      },
      {
        new: true,
      },
    );

    logInfo(`[${transactionId}] [SERVICE] updateJob - SUCCESSFUL for jobId: ${updatedJob.jobId}`);

    return updatedJob.jobId;
  } catch (updateErr) {
    logError(
      `[${transactionId}] [SERVICE] updateJob - FAILED for jobId: ${jobPartialFields.jobId}, reason: ${updateErr.message}`,
    );
    logDebug(`[${transactionId}] [SERVICE] updateJob - FAILED details, provided: ${JSON.stringify(jobPartialFields)}`);

    throw updateErr;
  }
};

const createOrUpdateJob = async (transactionId: string, jobData: Partial<OBJobOperationType>): Promise<string> => {
  logInfo(`[${transactionId}] [SERVICE] createOrUpdateJob - initiated for jobId: ${jobData.jobId}`);

  try {
    const job = mapJobOperationToDbRecord(jobData);

    const prevJobRecord = await getJobById(transactionId, job.jobId);

    if (prevJobRecord) {
      logInfo(
        `[${transactionId}] [SERVICE] createOrUpdateJob - Previous job found for jobId: ${job.jobId}, updating...`,
      );

      if (
        (job.jobCode && prevJobRecord.jobCode !== job.jobCode) ||
        (job.jobLevel && prevJobRecord.jobLevel !== job.jobLevel) ||
        (job.jobTitle && prevJobRecord.jobTitle !== job.jobTitle) ||
        (job.jobStatus && prevJobRecord.jobStatus !== job.jobStatus)
      ) {
        const updatedJobId = await updateJob(transactionId, job);

        logInfo(`[${transactionId}] [SERVICE] createOrUpdateJob - SUCCESSFUL update for jobId: ${job.jobId}`);

        return updatedJobId;
      }

      logInfo(`[${transactionId}] [SERVICE] createOrUpdateJob - SKIPPED update for jobId: ${job.jobId}, no changes!`);

      return job.jobId;
    }

    logInfo(`[${transactionId}] [SERVICE] createOrUpdateJob - No previous job for jobId: ${job.jobId}, creating...`);

    const createdJobId = await createJob(transactionId, job as OBJobSchemaType);

    logInfo(`[${transactionId}] [SERVICE] createOrUpdateJob - SUCCESSFUL creation for jobId: ${job.jobId}`);

    return createdJobId;
  } catch (upsertErr) {
    logError(`[${transactionId}] [SERVICE] createOrUpdateJob - FAILED for jobId: ${jobData.jobId}`);

    throw upsertErr;
  }
};

export { createOrUpdateJob, createJob, updateJob, getJobById, getJobByCode, getAllJobs };
