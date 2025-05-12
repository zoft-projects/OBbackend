import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import { FilterQuery, QueryOptions } from 'mongoose';
import { IAppConfig } from '../../config';
import { AudienceEnum, OBPollStatusEnum, PollInteractionStatusEnum, UserLevelEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { featureSummariesService, pollService } from '../../services';
import {
  HttpPOSTCreateOBPoll,
  HttpPOSTCreateOBPollInteraction,
  OBPollInteractionSchemaType,
  OBPollsSchemaType,
  PollInteractionPayloadType,
  OBPollInteractionsSummaryType,
  PollInteractionsSummaryPayloadType,
} from '../../types';
import {
  endOfDay,
  mapDBPollInteractionsSummaryToApiPayload,
  mapDBPollInteractionsToApiPayload,
  mapDBPollToApiPayload,
  mapPollApiRequestToServiceRequest,
  startOfDay,
} from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class PollController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/polls`;
    this.router = express.Router();
    this.router.use(this.basePath, authenticationMiddleware, identityMiddleware);
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
  /**
 * @swagger
 * /basepath:
 *   get:
 *     summary: Get list of polls
 *     description: Retrieve a list of polls based on user role, audience level, filters, and interaction status.
 *     tags: [Polls]
 *     parameters:
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *         description: Number of items to skip (for pagination)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of items to return (default 100)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Enabled, Disabled]
 *         description: Filter by poll status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search text to filter polls
 *       - in: query
 *         name: viewAs
 *         schema:
 *           type: string
 *           enum: [FIELD_STAFF, BRANCH_ADMIN, ADMIN, CONTROLLED_ADMIN, SUPER_ADMIN]
 *         description: View polls as a specific user role
 *       - in: query
 *         name: interaction
 *         schema:
 *           type: string
 *           enum: [Interacted, NonInteracted]
 *         description: Filter polls based on interaction status
 *       - in: query
 *         name: audienceLevel
 *         schema:
 *           type: string
 *           enum: [National, Branch, Division, Province, Individual]
 *         description: Filter polls based on audience level
 *       - in: query
 *         name: sortField
 *         schema:
 *           type: string
 *         description: Field to sort by 
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order (ascending or descending)
 *       - in: query
 *         name: branchIds
 *         schema:
 *           type: string
 *         description: Comma-separated branch IDs to filter polls
 *     responses:
 *       200:
 *         description: List of polls fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                  id:
 *                    type: string
 *                  pollId:
 *                    type: string
 *                  title:
 *                    type: string
 *                  pollType:
 *                    type: string
 *                    enum: [Choice, Feedback]
 *                  audienceLevel:
 *                     type: string
 *                     enum: [National, Branch, Division, Province, Individual]
 *                  branchIds:
 *                     type: array
 *                  createdAt:
 *                     type: string
 *                     format: date-time
 *                  updatedAt:
 *                      type: string
 *                      format: date-time                 
 *       400:
 *         description: Invalid parameters
 *       401:
 *         description: Unauthorized access
 *       500:
 *         description: Internal server error
 */
    this.router.get(
      `${this.basePath}`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.getPolls,
    );

    /**
 * @swagger
 * /basepath/{pollId}:
 *   get:
 *     summary: Retrieve a specific poll by pollId
 *     description: Returns a single poll with its details and interaction status for the requesting user.
 *     tags:
 *       - Polls
 *     parameters:
 *       - in: path
 *         name: pollId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the poll
 *     responses:
 *       200:
 *         description: Successfully retrieved the poll
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pollId:
 *                   type: string
 *                 title:
 *                   type: string
 *                 pollType:
 *                   type: string
 *                   enum: [Choice, Feedback]
 *                 audienceLevel:
 *                   type: string
 *                   enum: [National, Branch, Division, Province, Individual]
 *                 branchIds:
 *                   type: array
 *                   items:
 *                     type: string
 *                 provincialCodes:
 *                   type: array
 *                   items:
 *                     type: string
 *                 status:
 *                   type: string
 *                   enum: [Enabled, Disabled]
 *                 interactionStatus:
 *                   type: string
 *                   enum: [Interacted, NonInteracted]
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid or missing pollId
 *       404:
 *         description: Poll not found or has been deleted
 *       500:
 *         description: Internal server error
 */
    this.router.get(
      `${this.basePath}/:pollId`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.getPollById,
    );

 /**
 * @swagger
 * /basepath:
 *   post:
 *     summary: Create a new poll
 *     description: Allows Branch Admin and Super Admin users to create a new poll.
 *     tags:
 *       - Polls
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Quarterly Feedback Survey"
 *               pollType:
 *                 type: string
 *                 enum: [Choice, Feedback]
 *                 example: "Choice"
 *               audienceLevel:
 *                 type: string
 *                 enum: [National, Branch, Division, Province, Individual]
 *                 example: "Branch"
 *               branchIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["BR001", "BR002"]
 *               divisionIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["DIV001"]
 *               provincialCodes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["PC001"]
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-05-01T00:00:00Z"
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-06-01T00:00:00Z"
 *               createdByUserId:
 *                 type: string
 *                 example: "user123"
 *               createdByUserName:
 *                 type: string
 *                 example: "John Doe"
 *     responses:
 *       200:
 *         description: Poll created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: The created poll object
 *       400:
 *         description: Bad request, invalid input
 *       500:
 *         description: Internal server error
 */
    this.router.post(
      `${this.basePath}`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.createPoll,
    );
    /**
 * @swagger
 * /basepath/{pollId}:
 *   put:
 *     summary: Update an existing poll
 *     description: Allows BRANCH_ADMIN and SUPER_ADMIN users to update details of an existing poll.
 *     tags:
 *       - Polls
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pollId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the poll to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *               properties:
 *                pollId:
 *                  type: string
 *                title:
 *                  type: string
 *                pollType:
 *                  type: string
 *                  enum: [Choice, Feedback]
 *                audienceLevel:
 *                   type: string
 *                   enum: [National, Branch, Division, Province, Individual]
 *                branchIds:
 *                   type: array
 *                   items:
 *                     type: string
 *                divisionIds:
 *                   type: array
 *                   items:
 *                     type: string
 *                provincialCodes:
 *                  type: array
 *                  items:
 *                   type: string
 *                selectionOptions:
 *                   type: array
 *                   items:
 *                    type: string
 *                feedbackComment:
 *                   type: string
 *                numOfStars:
 *                   type: integer
 *                startDate:
 *                   type: string
 *                   format: date-time
 *                endDate:
 *                   type: string
 *                   format: date-time
 *                isDeleted:
 *                   type: boolean
 *                createdByUserId:
 *                   type: string
 *                createdByUserName:
 *                   type: string
 *     responses:
 *       200:
 *         description: Poll updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 pollId:
 *                   type: string
 *                 title:
 *                   type: string
 *                 pollType:
 *                   type: string
 *                   enum: [Choice, Feedback]
 *                 audienceLevel:
 *                   type: string
 *                   enum: [National, Branch, Division, Province, Individual]
 *                 branchIds:
 *                   type: array
 *                   items:
 *                     type: string
 *                 provincialCodes:
 *                    type: array
 *                    items:
 *                     type: string
 *                 createdAt:
 *                    type: string
 *                    format: date-time
 *                 updatedAt:
 *                     type: string
 *                     format: date-time
 *       400:
 *         description: Bad Request - Missing required fields
 *       404:
 *         description: Poll not found
 *       500:
 *         description: Internal server error
 */
    this.router.put(
      `${this.basePath}/:pollId`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.updatePoll,
    );

/**
 * @swagger
 * /basepath/{pollId}:
 *   delete:
 *     summary: Delete an existing poll
 *     description: Deletes a poll by its pollId. Only users with BRANCH_ADMIN or SUPER_ADMIN roles can perform this action.
 *     tags:
 *       - Polls
 *     parameters:
 *       - in: path
 *         name: pollId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the poll to delete
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Poll deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Poll removed successfully for 12345
 *       400:
 *         description: Invalid request (missing pollId or poll does not exist)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unable to remove poll, please provide the mandatory details!
 *       404:
 *         description: Poll not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Cannot remove a poll with pollId: 12345 because it does not exist in the system
 *       500:
 *         description: Internal server error
 */
    this.router.delete(
      `${this.basePath}/:pollId`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.removePoll,
    );

    /**
 * @swagger
 * /basepath/{pollId}/interactions:
 *   post:
 *     summary: Submit interaction for a poll
 *     description: Allows users to interact with a poll by submitting feedback, star ratings, or selection options. 
 *     tags:
 *       - Polls
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pollId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the poll to interact with
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pollId:
 *                 type: string
 *                 description: The ID of the poll being interacted with
 *               pollType:
 *                 type: string
 *                 enum:
 *                   - Choice
 *                   - Feedback
 *                 description: The type of the poll (Choice or Feedback)
 *               selectionOptions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Selection options for the poll (optional, for choice-based polls)
 *               feedbackComment:
 *                 type: string
 *                 description: Comment for feedback-based polls (optional)
 *               numOfStars:
 *                 type: integer
 *                 format: int32
 *                 description: Rating for feedback-based polls (optional, number of stars)
 *               createdUserId:
 *                 type: string
 *                 description: The ID of the user interacting with the poll (optional, for migration purposes)
 *               createdUserName:
 *                 type: string
 *                 description: The name of the user interacting with the poll (optional, for migration purposes)
 *     responses:
 *       200:
 *         description: Poll interaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: string
 *                   example: Poll interaction created successfully for poll id 12345
 *       400:
 *         description: Invalid request (missing or invalid pollId, feedback, or interaction details)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: The requested poll cannot be found or has been deleted
 *       404:
 *         description: Poll not found or has been deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: The requested poll cannot be found or has been deleted
 *       500:
 *         description: Internal server error
 */

    this.router.post(
      `${this.basePath}/:pollId/interactions`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.pollInteraction,
    );
    /**
 * @swagger
 * /basepath/{pollId}/interactions/feedback:
 *   get:
 *     summary: Retrieve feedback interactions for a poll
 *     description: Fetches feedback interactions for a specific poll by its `pollId`. 
 *     tags:
 *       - Polls
 *     parameters:
 *       - in: path
 *         name: pollId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the poll for which feedback interactions are being fetched.
 *       - in: query
 *         name: skip
 *         required: false
 *         schema:
 *           type: string
 *         description: The number of records to skip (for pagination).
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: string
 *         description: The number of records to limit the response to (for pagination).
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: A search term to filter the results.
 *       - in: query
 *         name: sortField
 *         required: false
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: The field by which to sort the results.
 *       - in: query
 *         name: sortOrder
 *         required: false
 *         schema:
 *           type: string
 *           enum:
 *             - asc
 *             - desc
 *           default: desc
 *         description: The order in which to sort the results.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully fetched poll feedback interactions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   pollId:
 *                     type: string
 *                   pollType:
 *                     type: string
 *                     enum: [Choice, Feedback]
 *                   selectionOptions:
 *                     type: array
 *                     items:
 *                       type: string
 *                   feedbackComment:
 *                     type: string
 *                   numOfStars:
 *                     type: integer
 *                   interactedDate:
 *                     type: string
 *                     format: date-time
 *                   interactedUser:
 *                     type: object
 *                     properties:
 *                       employeePsId:
 *                         type: string
 *                       displayName:
 *                         type: string
 *                       userImageLink:
 *                         type: string
 *       400:
 *         description: Invalid request (missing pollId or other parameters)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unable to get poll interactions, please provide the pollId!
 *       404:
 *         description: Poll not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: The requested poll cannot be found or has been deleted
 *       500:
 *         description: Internal server error
 */

    this.router.get(
      `${this.basePath}/:pollId/interactions/feedback`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.getFeedbackPollInteractions,
    );

    /**
 * @swagger
 * /basepath/{pollId}/interactions/choices:
 *   get:
 *     summary: Get a summary of choice poll interactions
 *     description: Retrieves a summary of interactions for a specific poll, including the total number of interactions and the number of votes for each choice.
 *     tags:
 *       - Polls
 *     parameters:
 *       - in: path
 *         name: pollId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the poll for which the interactions summary is to be fetched
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved poll interaction summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pollId:
 *                   type: string
 *                   example: "12345"
 *                 pollTitle:
 *                   type: string
 *                   example: "Poll Title"
 *                 pollType:
 *                   type: string
 *                   example: "Multiple Choice"
 *                 pollPriority:
 *                   type: string
 *                   example: "High"
 *                 totalInteractions:
 *                   type: integer
 *                   example: 150
 *                 pollOptions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       option:
 *                         type: string
 *                         example: "Option 1"
 *                       votes:
 *                         type: integer
 *                         example: 75
 *                       - option: "Option 2"
 *                         votes: 45
 *                       - option: "Option 3"
 *                         votes: 30
 *       400:
 *         description: Invalid request (missing pollId or poll does not exist)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Unable to get poll interactions, please provide the pollId!"
 *       404:
 *         description: Poll not found or deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "The requested poll cannot be found or has been deleted"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */

    this.router.get(
      `${this.basePath}/:pollId/interactions/choices`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.getChoicePollInteractionsSummary,
    );
  }

  private pollInteraction = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getPolls initiated`);

    try {
      const pollInteractionRequest: HttpPOSTCreateOBPollInteraction = request.body;
      let { obUserPsId, displayName } = request.obUserIdentity;

      // TODO : Remove after migration
      if (pollInteractionRequest.createdUserId) {
        obUserPsId = pollInteractionRequest.createdUserId;
      }

      // TODO : Remove after migration
      if (pollInteractionRequest.createdUserName) {
        displayName = pollInteractionRequest.createdUserName;
      }

      const poll: OBPollsSchemaType = await pollService.getPollById(transactionId, pollInteractionRequest.pollId);
      if (!poll || poll?.isDeleted) {
        throw new Error('The requested poll cannot be found or has been deleted');
      }

      const createdInteractionPoll = await pollService.pollInteraction(transactionId, {
        interactedUserPsId: obUserPsId,
        pollId: pollInteractionRequest.pollId,
        pollType: pollInteractionRequest.pollType,
        createdAt: new Date(),
        displayName,
        interactedAt: new Date(),
        feedbackComment: pollInteractionRequest.feedbackComment,
        numOfStars: pollInteractionRequest.numOfStars,
        selectionOptions: pollInteractionRequest.selectionOptions,
      });

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: `Poll interaction created successful for poll id ${createdInteractionPoll}`,
      });

      // Update feature summaries for the day, update metrics table in the background for non-blocking operation
      const start = startOfDay(new Date(poll.createdAt));
      const end = endOfDay(new Date(poll.createdAt));
      logInfo(`[${transactionId}] [CONTROLLER] updatePoll updating feature summaries for the day ${start} - ${end}`);
      await featureSummariesService.addMetricSummaryByDay(transactionId, start, end);
    } catch (pollErr) {
      logError(`[${transactionId}] [CONTROLLER] getPolls FAILED, reason: ${pollErr.message}`);
      next(pollErr);
    }
  };

  private getFeedbackPollInteractions = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getFeedbackPollInteractions initiated`);

    try {
      const {
        skip,
        limit,
        search,
        sortField = 'createdAt',
        sortOrder = 'desc',
      }: {
        skip?: string;
        limit?: string;
        search?: string;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
      } = request.query;

      const { pollId }: { pollId?: string } = request.params;

      if (!pollId) {
        throw new Error('Unable to get poll interactions, please provide the pollId!');
      }

      const poll: OBPollsSchemaType = await pollService.getPollById(transactionId, pollId);

      if (!poll || poll?.isDeleted) {
        throw new Error('The requested poll cannot be found or has been deleted');
      }

      const options: QueryOptions<OBPollsSchemaType> = {
        skip: +skip || 0,
        limit: +limit || 100,
        sortField,
        sortOrder,
        search,
      };

      const pollInteractions: OBPollInteractionSchemaType[] = await pollService.getPollInteractionsByPollId(
        transactionId,
        pollId,
        options,
      );

      const mappedPollInteraction: PollInteractionPayloadType[] = pollInteractions.map((pollInteraction) =>
        mapDBPollInteractionsToApiPayload(pollInteraction),
      );

      response.status(HttpStatusCode.OK).json(mappedPollInteraction);
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] getFeedbackPollInteractions FAILED, reason: ${err.message}`);
      next(err);
    }
  };

  private getChoicePollInteractionsSummary = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getChoicePollInteractionsSummary initiated`);

    try {
      const { pollId }: { pollId?: string } = request.params;

      if (!pollId) {
        throw new Error('Unable to get poll interactions, please provide the pollId!');
      }

      const poll: OBPollsSchemaType = await pollService.getPollById(transactionId, pollId);

      if (!poll || poll?.isDeleted) {
        throw new Error('The requested poll cannot be found or has been deleted');
      }

      const pollInteractionsSummary: OBPollInteractionsSummaryType = await pollService.getChoicePollInteractionsSummary(
        transactionId,
        pollId,
      );

      const mappedPollInteractionSummary: PollInteractionsSummaryPayloadType = mapDBPollInteractionsSummaryToApiPayload(
        {
          title: poll.title,
          priority: poll.priority,
          pollOptions: poll.pollOptions,
          ...pollInteractionsSummary,
        },
      );

      response.status(HttpStatusCode.OK).json(mappedPollInteractionSummary);
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] getChoicePollInteractionsSummary FAILED, reason: ${err.message}`);
      next(err);
    }
  };

  private getPolls = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getPolls initiated`);

    try {
      const {
        skip,
        limit,
        status = OBPollStatusEnum.Enabled,
        search,
        viewAs,
        interaction,
        audienceLevel,
        sortField = 'createdAt',
        sortOrder = 'desc',
        branchIds,
      }: {
        skip?: string;
        limit?: string;
        status?: OBPollStatusEnum;
        search?: string;
        viewAs?: string;
        audienceLevel?: AudienceEnum;
        interaction?: PollInteractionStatusEnum;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
        branchIds?: string;
      } = request.query;

      const {
        obUserPsId: userPsId,
        divisionIds: userDivisionIds,
        provinceCodes: userProvinceCodes,
      } = request.obUserIdentity;

      let userBranchIds = request.obUserIdentity.branchIds;

      if (branchIds && branchIds.split(',') && branchIds.split(',').length) {
        userBranchIds = branchIds.split(',');
      }
      const makeFilter = (): FilterQuery<OBPollsSchemaType> => {
        let filter: FilterQuery<OBPollsSchemaType> = {};

        if (AudienceEnum.Branch.toLowerCase() === audienceLevel?.toLowerCase()) {
          filter = {
            audienceLevel: AudienceEnum.Branch,
          };
          if (!userBranchIds.includes('*')) {
            filter = { ...filter, branchIds: { $in: userBranchIds } };
          }

          return filter;
        }

        if (AudienceEnum.Division.toLowerCase() === audienceLevel?.toLowerCase()) {
          filter = {
            audienceLevel: AudienceEnum.Division,
          };
          if (!userDivisionIds.includes('*')) {
            filter = { ...filter, divisionIds: { $in: userDivisionIds } };
          }

          return filter;
        }

        if (AudienceEnum.Province.toLowerCase() === audienceLevel?.toLowerCase()) {
          filter = {
            audienceLevel: AudienceEnum.Province,
          };
          if (!userProvinceCodes.includes('*')) {
            filter = { ...filter, provincialCodes: { $in: userProvinceCodes } };
          }

          return filter;
        }

        return {
          $or: [
            { audienceLevel: AudienceEnum.National },
            { $or: [{ branchIds: { $in: ['*'].concat(userBranchIds) } }] },
            { divisionIds: { $in: userDivisionIds } },
            { provincialCodes: { $in: userProvinceCodes } },
          ],
        };
      };

      const filters: FilterQuery<OBPollsSchemaType> = makeFilter();
      filters.isDeleted = false;

      if (userBranchIds.includes('*')) {
        if (filters.$or) {
          filters.$or.push({ branchIds: { $ne: [] } });
        } else {
          filters.$or = [{ branchIds: { $ne: [] } }];
        }
      }

      const actualLimit = +limit || 100;
      const skipPage = +skip || 0;

      if (status && status in OBPollStatusEnum) {
        filters.status = status;
      } else {
        filters.status = OBPollStatusEnum.Enabled;
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] getPolls query requested for filters: ${JSON.stringify(
          filters,
        )}, limit: ${actualLimit}`,
      );

      const skipInteractionCheck = viewAs && viewAs.toLowerCase() === UserLevelEnum.ADMIN.toLowerCase();

      const pollData = await pollService.getPolls(
        transactionId,
        {
          ...filters,
        },
        {
          limit: actualLimit,
          skip: skipPage,
          sortField,
          sortOrder,
          search,
        },
        {
          interaction,
          userPsId,
          branchIds: userBranchIds,
          divisionIds: userDivisionIds,
          provincialCodes: userProvinceCodes,
          skipInteractionCheck,
        },
      );

      const mappedPolls = pollData.map((poll) => mapDBPollToApiPayload(poll));

      response.status(HttpStatusCode.OK).json(mappedPolls);
    } catch (pollErr) {
      logError(`[${transactionId}] [CONTROLLER] getPolls FAILED, reason: ${pollErr.message}`);
      next(pollErr);
    }
  };

  private getPollById = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getPollById initiated`);
    try {
      const { pollId }: { pollId?: string } = request.params;
      const { obUserPsId }: { obUserPsId?: string } = request.obUserIdentity;

      if (!pollId) {
        throw new Error('Unable to get poll, please provide the pollId!');
      }

      logInfo(`[${transactionId}] [CONTROLLER] getPollById retrieving poll for pollId: ${pollId}`);

      const poll = await pollService.getPollById(transactionId, pollId);

      if (!poll || poll?.isDeleted) {
        throw new Error('The requested poll cannot be found or has been deleted');
      }

      const pollPayload = mapDBPollToApiPayload(poll);

      logInfo(`[${transactionId}] [CONTROLLER] getPollById retrieved poll: ${JSON.stringify(pollPayload)}`);
      const pollInteraction: OBPollInteractionSchemaType = await pollService.getPollInteractionByPollIdAndUserPsID(
        transactionId,
        pollId,
        obUserPsId,
      );
      if (pollInteraction && !pollInteraction.isDeleted) {
        pollPayload.interactionStatus = PollInteractionStatusEnum.Interacted;
      } else {
        pollPayload.interactionStatus = PollInteractionStatusEnum.NonInteracted;
      }

      response.status(HttpStatusCode.OK).json(pollPayload);
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] getPollById failed, reason: ${getErr.message}`);

      next(getErr);
    }
  };

  private createPoll = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] Create Poll initiated`);

    try {
      const poll: HttpPOSTCreateOBPoll = request.body;
      const { obUserPsId, displayName, accessLvl } = request.obUserIdentity;
      poll.jobLevels = [accessLvl];

      // TODO update after migration
      poll.createdByUserId = poll.createdByUserId ? poll.createdByUserId : obUserPsId;
      poll.createdByUserName = poll.createdByUserName ? poll.createdByUserName : displayName;

      const translatedPoll = mapPollApiRequestToServiceRequest(poll);

      const createdPoll = await pollService.createPoll(transactionId, translatedPoll);

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: createdPoll,
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] createPoll endpoint failed with error: ${err.message}`);

      next(err);
    }
  };

  private updatePoll = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] updatePoll initiated`);

    try {
      const partialPollInfo: HttpPOSTCreateOBPoll = request.body;

      const { obUserPsId, displayName } = request.obUserIdentity;

      const translatedPoll = mapPollApiRequestToServiceRequest(partialPollInfo);

      if (!translatedPoll.pollId) {
        throw new Error('Unable to update poll, please provide the mandatory details!');
      }

      translatedPoll.updatedBy = {
        employeePsId: obUserPsId,
        displayName,
      };

      const updatedPoll = await pollService.updatePoll(transactionId, translatedPoll);

      response.status(HttpStatusCode.OK).json(updatedPoll);

      // Update feature summaries for the day, update metrics table in the background for non-blocking operation
      const start = startOfDay(new Date(updatedPoll.createdAt));
      const end = endOfDay(new Date(updatedPoll.createdAt));
      logInfo(`[${transactionId}] [CONTROLLER] updatePoll updating feature summaries for the day ${start} - ${end}`);
      await featureSummariesService.addMetricSummaryByDay(transactionId, start, end);
    } catch (updateErr) {
      logError(`[${transactionId}] [CONTROLLER] updatePoll FAILED, reason: ${updateErr.message}`);

      next(updateErr);
    }
  };

  private removePoll = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] removePoll initiated`);
    try {
      const { pollId }: { pollId?: string } = request.params;

      if (!pollId) {
        throw new Error('Unable to remove poll, please provide the mandatory details!');
      }

      logInfo(`[${transactionId}] [CONTROLLER] removePoll check poll exists for pollId: ${pollId}`);

      const pollToRemove = await pollService.getPollById(transactionId, pollId);

      if (!pollToRemove) {
        throw new Error(`Cannot remove a poll with pollId: ${pollId} because it does not exist in the system`);
      }

      logInfo(`[${transactionId}] [CONTROLLER] removePoll removing poll: ${JSON.stringify(pollToRemove)}`);

      const removedPollId = await pollService.removePoll(transactionId, pollId);

      logInfo(`[${transactionId}] [CONTROLLER] removePoll SUCCESSFUL pollId: ${removedPollId}`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `Poll removed successfully for ${removedPollId}`,
      });

      // Update feature summaries for the day, update metrics table in the background for non-blocking operation
      await featureSummariesService.deletePollSummary(transactionId, pollId);
      const start = startOfDay(new Date(pollToRemove.createdAt));
      const end = endOfDay(new Date(pollToRemove.createdAt));
      logInfo(`[${transactionId}] [CONTROLLER] updatePoll updating feature summaries for the day ${start} - ${end}`);
      await featureSummariesService.addMetricSummaryByDay(transactionId, start, end);
    } catch (removeErr) {
      logError(`[${transactionId}] [CONTROLLER] removePoll FAILED, reason: ${removeErr.message}`);

      next(removeErr);
    }
  };
}
