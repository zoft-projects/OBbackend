import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import { NextFunction } from 'connect';
import express from 'express';
import { FilterQuery } from 'mongoose';
import { IAppConfig } from '../../config';
import {
  HttpStatusCode,
  UserStatusEnum,
  RequestModeEnum,
  AssetEnum,
  UserLevelEnum,
  MultipartUploadPhaseEnum,
  FileGuidelinesEnum,
} from '../../enums';
import { logError, logInfo, getLogger } from '../../log/util';
import {
  identityMiddleware,
  onebayshoreInternalApiMiddleware,
  serviceInternalMiddleware,
  accessControlMiddlewareHOF,
} from '../../middlewares';
import {
  userService,
  locationService,
  onboardUserService,
  chatService,
  jobService,
  cacheService,
  clientService,
  userLocationService,
  chatV2Service,
} from '../../services';
import {
  FileUploadToS3Type,
  HttpPOSTUpsertOBUser,
  OBUserSchemaType,
  UserInfoPayloadType,
  OBBranchDetailedOperationType,
  OBProfileUpsertOperationType,
  MultipartFileCreateToS3Type,
  MultipartFileCompleteToS3Type,
  MultipartCreateFileUploadResponseType,
  FileUploadResponseType,
  MultipartFileAbortToS3Type,
  FileAbortResponseType,
  UserLocationPayloadType,
  HTTPPostUserLocationInputType,
  ClientFromSystemType,
} from '../../types';
import {
  getUniqueStringsFromList,
  mapAccessLevelToName,
  mapDBUsersToApiPayload,
  mapProfileApiRequestToServiceRequest,
  mapFileGuidelinesToApiPayload,
  combineAddress,
  isValidDate,
  startOfDay,
  endOfDay,
  formatDate,
  validateEmail,
  validatePhoneNumber,
  getEffectiveBranchIds,
} from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class UserController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/users`;
    this.router = express.Router();
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    // TODO: This endpoint is for the frontend to directly call. Access is restricted to authorized users, with Super Admins having permission
    this.router.get(
      `${this.basePath}`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.listUsers),
    );

  /**
 * @swagger
 * /basepath/v2:
 *   get:
 *     summary: "Get a list of users"
 *     description: "Fetches a list of users based on  filters like active status, job levels, and branches."
 *     tags:
 *       - Users
 *     security:
 *       - BearerAuth: []  
 *     parameters:
 *       - name: skip
 *         in: query
 *         description: "The number of users to skip for pagination."
 *         required: false
 *         schema:
 *           type: string
 *           example: "0"
 *       - name: limit
 *         in: query
 *         description: "The number of users to return."
 *         required: false
 *         schema:
 *           type: string
 *           example: "100"
 *       - name: activeStatus
 *         in: query
 *         description: "Filter users by their active status."
 *         required: false
 *         schema:
 *           type: string
 *           enum: [active, inactive, suspended]
 *       - name: legacyId
 *         in: query
 *         description: "Filter users by their legacy system ID."
 *         required: false
 *         schema:
 *           type: string
 *       - name: jobLevels
 *         in: query
 *         description: "Comma-separated list of job levels to filter users."
 *         required: false
 *         schema:
 *           type: string
 *           example: "1,2,3"
 *       - name: branchIds
 *         in: query
 *         description: "Comma-separated list of branch IDs to filter users."
 *         required: false
 *         schema:
 *           type: string
 *           example: "branch1,branch2"
 *       - name: sortField
 *         in: query
 *         description: "Field to sort by."
 *         required: false
 *         schema:
 *           type: string
 *       - name: sortOrder
 *         in: query
 *         description: "Order of sorting."
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *       - name: search
 *         in: query
 *         description: "Search query to filter users by name or other fields."
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: "Successfully fetched users"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mappedUsers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       employeePsId:
 *                         type: string
 *                       primaryUserId:
 *                         type: string
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       workEmail:
 *                         type: string
 *                       alternateEmail:
 *                         type: string
 *                       lastLoggedAt:
 *                         type: string
 *       400:
 *         description: "Bad request, invalid query parameters."
 *       401:
 *         description: "Unauthorized, missing or invalid token."
 *       403:
 *         description: "Forbidden"
 *       500:
 *         description: "Internal server error."
 * 
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

    this.router.get(
      `${this.basePath}/v2`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.listUsersV2),
    );

    // TODO: Should remove below endpoint after proper sync feature
    this.router.get(`${this.basePath}/list`, onebayshoreInternalApiMiddleware, this.asyncHandler(this.listUsers));
/**
 * @swagger
 * /basepath/directory:
 *   get:
 *     summary: Retrieve a list of users' directory.
 *     description: Returns a list of users based on access level and filters such as skip, limit, and search query.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: skip
 *         description: Number of users to skip for pagination.
 *         required: false
 *         schema:
 *           type: string
 *           example: '0'
 *       - in: query
 *         name: limit
 *         description: Number of users to return.
 *         required: false
 *         schema:
 *           type: string
 *           example: '100'
 *       - in: query
 *         name: search
 *         description: Search term to filter users by name or other fields.
 *         required: false
 *         schema:
 *           type: string
 *           example: 'John Doe'
 *       - in: query
 *         name: viewAs
 *         description: Option to view users based on the specified role (admin or other).
 *         required: false
 *         schema:
 *           type: string
 *           example: 'ADMIN'
 *     responses:
 *       200:
 *         description: A list of users matching the query parameters.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       employeePsId:
 *                         type: string
 *                         example: 'EMP12345'
 *                       displayName:
 *                         type: string
 *                         example: 'John Doe'
 *                       lastVisitedAt:
 *                         type: string
 *                         format: date-time
 *                         example: '2025-04-28'
 *       400:
 *         description: Invalid query parameters or request format.
 *       401:
 *         description: Unauthorized access.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Internal server error.
 */

    this.router.get(
      `${this.basePath}/directory`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.getUsersDirectory),
    );
/**
 * @swagger
 * /basepath/locations:
 *   get:
 *     summary: Retrieve a user's location data based on dates.
 *     description: This endpoint returns the geo-locations of a user between a specified start and end date, including client details if available.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         description: Search term to find an employee by their PS ID. The search term must start with '000'.
 *         required: true
 *         schema:
 *           type: string
 *           example: '00012345'
 *       - in: query
 *         name: startDate
 *         description: The start date for filtering location data.
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *           example: '2025-04-01'
 *       - in: query
 *         name: endDate
 *         description: The end date for filtering location data. If not provided, `startDate` will be used as the end date.
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *           example: '2025-04-30'
 *     responses:
 *       200:
 *         description: A successful response containing the employee's location data within the specified date range.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 employeeDetail:
 *                   type: object
 *                   properties:
 *                     psId:
 *                       type: string
 *                       example: 'EMP12345'
 *                     displayName:
 *                       type: string
 *                       example: 'John Doe'
 *                     email:
 *                       type: string
 *                       example: 'john.doe@example.com'
 *                     lastLoggedAt:
 *                       type: string
 *                       format: date-time
 *                       example: '2025-04-28'
 *                 geoLocations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       latitude:
 *                         type: string
 *                         example: '12.9716'
 *                       longitude:
 *                         type: string
 *                         example: '77.5946'
 *                       captureType:
 *                         type: string
 *                         example: 'GPS'
 *                       cvid:
 *                         type: string
 *                         example: 'CV123'
 *                       visitId:
 *                         type: string
 *                         example: 'V123'
 *                       tenantId:
 *                         type: string
 *                         example: 'TENANT123'
 *                       deviceTime:
 *                         type: string
 *                         format: date-time
 *                         example: '2025-04-28'
 *                       clientId:
 *                         type: string
 *                         example: 'CLIENT123'
 *                       clientName:
 *                         type: string
 *                         example: 'Client Name'
 *                       clientAddressFormatted:
 *                         type: string
 *                         example: '123 Street, City, Country'
 *       400:
 *         description: Invalid query parameters or request format (e.g., invalid date format, search term missing).
 *       401:
 *         description: Unauthorized access due to missing or invalid authentication.
 *       403:
 *         description: Forbidden access.
 *       500:
 *         description: Internal server error.
 */

    this.router.get(
      `${this.basePath}/locations`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.CONTROLLED_ADMIN]),
      this.asyncHandler(this.getUserLocationsByDates),
    );
/**
 * @swagger
 * /basepath/{employeePsId}:
 *   get:
 *     summary: Retrieve user information by PS ID.
 *     description: This endpoint gets detailed information about an employee using their PS ID, including employee info, branch access, prerequisites, and system details.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeePsId
 *         required: true
 *         description: The PS ID of the employee to retrieve.
 *         schema:
 *           type: string
 *           example: 'EMP12345'
 *       - in: query
 *         name: systems
 *         required: false
 *         description: If 'true', will include detailed system information for the employee.
 *         schema:
 *           type: string
 *           enum:
 *             - true
 *             - false
 *           default: ''
 *     responses:
 *       200:
 *         description: A successful response containing user details including employee information, branch access, prerequisites, and optionally system details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 employeePsId:
 *                   type: string
 *                   example: 'EMP12345'
 *                 primaryUserId:
 *                   type: string
 *                   example: 'U123'
 *                 legacyCmsId:
 *                   type: string
 *                   example: 'CMS123'
 *                 legacyDynamoId:
 *                   type: string
 *                   example: 'DYN123'
 *                 firstName:
 *                   type: string
 *                   example: 'John'
 *                 lastName:
 *                   type: string
 *                   example: 'Doe'
 *                 workEmail:
 *                   type: string
 *                   example: 'john.doe@example.com'
 *                 alternateEmail:
 *                   type: string
 *                   example: 'john.alternate@example.com'
 *                 lastLoggedAt:
 *                   type: string
 *                   format: date-time
 *                   example: '2025-04-28T14:48:00Z'
 *                 branches:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       branchId:
 *                         type: string
 *                         example: 'BRANCH123'
 *                       branchName:
 *                         type: string
 *                         example: 'Main Branch'
 *                       divisionIds:
 *                         type: array
 *                         items:
 *                           type: string
 *                           example: 'DIV123'
 *                       divisions:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             divisionId:
 *                               type: string
 *                               example: 'DIV123'
 *                             divisionName:
 *                               type: string
 *                               example: 'Sales Division'
 *       400:
 *         description: Invalid request, such as missing or incorrect PS ID or query parameters.
 *       401:
 *         description: Unauthorized access due to missing or invalid authentication.
 *       403:
 *         description: Forbidden access, user does not have sufficient permissions to view this information.
 *       404:
 *         description: Employee not found by the provided PS ID.
 *       500:
 *         description: Internal server error.
 */

    this.router.get(
      `${this.basePath}/:employeePsId`,
      onebayshoreInternalApiMiddleware,
      this.asyncHandler(this.findUserByPsId),
    );

    // TODO: This endpoint is for the frontend to directly call. Access is restricted to authorized users, with Super Admins having permission
    this.router.get(
      `${this.basePath}/:employeePsId/find`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.findUserByPsId),
    );

    this.router.get(
      `${this.basePath}/:employeePsId/file/status`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.getFileStatus),
    );

    this.router.get(
      `${this.basePath}/:employeePsId/file/guidelines`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.getFileGuidelines),
    );
/**
 * @swagger
 * /v2:
 *   post:
 *     summary: Create or update multiple user profiles.
 *     description: This endpoint allows the creation  of multiple user profiles in the system. .
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               required:
 *                 - psId
 *                 - workEmail
 *                 - activeStatus
 *                 - branchIds
 *               properties:
 *                 psId:
 *                   type: string
 *                   example: 'EMP12345'
 *                 displayName:
 *                   type: string
 *                   example: 'John Doe'
 *                 workEmail:
 *                   type: string
 *                   example: 'john.doe@example.com'
 *                 activeStatus:
 *                   type: string
 *                   example: 'ACTIVE'
 *                 isActivated:
 *                   type: string
 *                   example: 'true'
 *                 branchIds:
 *                   type: array
 *                   items:
 *                     type: string
 *                     example: 'BRANCH123'
 *                 overriddenAccessJobId:
 *                   type: string
 *                   example: 'JOB123'
 *                 overriddenAccessJobLevel:
 *                   type: integer
 *                   example: 2
 *                 consents:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       consentType:
 *                         type: string
 *                         example: 'DATA_PROCESSING'
 *                       consentDate:
 *                         type: string
 *                         format: date-time
 *                         example: '2025-04-28'
 *     responses:
 *       200:
 *         description: A successful response containing the result of user creation or updating, including lists of successful and failed `psId`s.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 partialSuccess:
 *                   type: boolean
 *                   example: false
 *                 data:
 *                   type: object
 *                   properties:
 *                     successfulPsIds:
 *                       type: array
 *                       items:
 *                         type: string
 *                         example: 'EMP12345'
 *                     failedPsIds:
 *                       type: array
 *                       items:
 *                         type: string
 *                         example: 'EMP67890'
 *       400:
 *         description: Invalid request body, such as missing mandatory fields or incorrect data format.
 *       401:
 *         description: Unauthorized access due to missing or invalid authentication.
 *       403:
 *         description: Forbidden access.
 *       500:
 *         description: Internal server error.
 */

    this.router.post(`${this.basePath}`, onebayshoreInternalApiMiddleware, this.asyncHandler(this.createUsers));

    this.router.post(
      `${this.basePath}/locations`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.createUserLocation),
    );

    this.router.post(
      `${this.basePath}/:employeePsId/file`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.uploadFile),
    );

    this.router.post(
      `${this.basePath}/:employeePsId/reset`,
      serviceInternalMiddleware,
      this.asyncHandler(this.resetUser),
    );
/**
 * @swagger
 * /basepath/{employeePsId}:
 *   put:
 *     summary: Update OB User Profile
 *     description: Updates an OB user's profile by their psId. Only SUPER_ADMIN, ADMIN, or the user themselves can perform the update.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeePsId
 *         required: true
 *         description: The psId of the user to be updated
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       description: Updated user details
 *       content:
 *         application/json:
 *           schema:
 *             $ref: HttpPOSTUpsertOBUser'
 *     responses:
 *       200:
 *         description: Successfully updated user
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
 *                   example: Updated user: EMP1234
 *       400:
 *         description: Invalid input or missing data
 *       401:
 *         description: Unauthorized - login required
 *       403:
 *         description: Forbidden - insufficient access rights
 *       500:
 *         description: Server error
 */

    this.router.put(
      `${this.basePath}/:employeePsId`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.updateUser),
    );
/**
 * @swagger
 * /basepath/{employeePsId}:
 *   delete:
 *     summary: Remove OB User
 *     description: Deletes an OB user from the system based on their psId. Internal API access only.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeePsId
 *         required: true
 *         description: The psId of the user to be removed
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully removed user
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
 *                   example: User removed successfully for EMP1234
 *       204:
 *         description: User does not exist in the system
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Cannot remove user who does not exist in the system
 *       400:
 *         description: Invalid psId provided
 *       500:
 *         description: Server error
 */

    this.router.delete(
      `${this.basePath}/:employeePsId`,
      onebayshoreInternalApiMiddleware,
      this.asyncHandler(this.removeUser),
    );

    this.router.delete(
      `${this.basePath}/:employeePsId/file`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.removeFile),
    );
  }

  private findUserByPsId = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    const { employeePsId } = request.params;
    const { systems = '' } = request.query;

    logInfo(`[${transactionId}] [CONTROLLER] findUserByPsId initiated`);

    try {
      const [obUserInfo, employeeInfo, prerequisites, procuraUserDetails] = await Promise.all([
        userService.getObUsersByPsId(transactionId, employeePsId),
        userService.getEmployeePSFromEmployeeService(transactionId, employeePsId),
        onboardUserService.getAllPrerequisites(transactionId),
        systems === 'true' ? userService.getMultipleProcuraDetailFromEmployeeService(transactionId, employeePsId) : [],
      ]);

      let branches: OBBranchDetailedOperationType[] = [];

      if (obUserInfo.branchAccess.canAccessAll) {
        branches = await locationService.getAllBranchesWithDivisions(transactionId);
      } else {
        branches = await Promise.all(
          getUniqueStringsFromList(
            obUserInfo.branchAccess.selectedBranchIds,
            obUserInfo.branchAccess.overriddenBranchIds,
          ).map((branchId) => locationService.getBranchDetailsById(transactionId, branchId)),
        );
      }

      const userPayload: UserInfoPayloadType = mapDBUsersToApiPayload(obUserInfo, {
        vendors: {
          employeeInfo,
          employeeSystemDetails: procuraUserDetails,
        },
        dependencies: {
          prerequisites,
          branches,
          chatV2Groups: [],
          interactedNotificationIds: [],
        },
      });

      response.status(HttpStatusCode.OK).json(userPayload);
    } catch (findErr) {
      logError(
        `[${transactionId}] [CONTROLLER] findUserByPsId FAILED for psId: ${employeePsId}, reason: ${findErr.message}`,
      );

      next(findErr);
    }
  };

  private createUsers = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] createUsers initiated`);

    try {
      const users: HttpPOSTUpsertOBUser[] = request.body;
      const mappedUsers: OBProfileUpsertOperationType[] = [];

      if (!Array.isArray(users) || users.length === 0) {
        throw new Error(
          'No valid user profiles to create or update users. Provide list of valid users to create/update',
        );
      }

      users.forEach((user) => {
        try {
          const translatedUserprofile = mapProfileApiRequestToServiceRequest(user);
          if (!translatedUserprofile.psId) {
            throw new Error('Missing primary mandatory field');
          }

          mappedUsers.push(translatedUserprofile);
        } catch (mappingErr) {
          logError(`[${transactionId}] [CONTROLLER] createUsers skipping record, reason: ${mappingErr.message}`);
        }
      });

      if (mappedUsers.length === 0) {
        throw new Error(
          'No valid user profiles to create or update users. Provide list of valid users to create/update',
        );
      }

      const { successfulPsIds, failedPsIds } = await userService.createOrUpdateMultipleObUsers(
        transactionId,
        mappedUsers,
      );

      logInfo(
        `[${transactionId}] [CONTROLLER] createUsers SUCCESSFUL, result: ${JSON.stringify({
          successfulPsIds,
          failedPsIds,
        })}`,
      );

      /**
       * @deprecated
       * TODO: Remove after new Chat vendor enablement
       */
      for (const user of mappedUsers) {
        await Promise.allSettled(
          user.branchIds.map((branchId) => chatService.syncChatGroupForBranch(transactionId, branchId)),
        );
      }

      response.status(HttpStatusCode.OK).json({
        success: successfulPsIds.length > 0,
        partialSuccess: failedPsIds.length > 0 && successfulPsIds.length > 0,
        data: {
          successfulPsIds,
          failedPsIds,
        },
      });
    } catch (createErr) {
      logError(`[${transactionId}] [CONTROLLER] createUsers FAILED, reason: ${createErr.message}`);

      next(createErr);
    }
  };

  private updateUser = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    const { accessLvl, obUserPsId } = request.obUserIdentity;
    const partialUserInfo: HttpPOSTUpsertOBUser = request.body;

    logInfo(
      `[${transactionId}] [CONTROLLER] updateUser initiated for psId: ${partialUserInfo.psId} by adminPsId: ${obUserPsId}`,
    );

    try {
      const accessLevelName = mapAccessLevelToName(accessLvl);

      const hasAccess =
        [UserLevelEnum.SUPER_ADMIN, UserLevelEnum.ADMIN].includes(accessLevelName) ||
        partialUserInfo.psId === obUserPsId;

      if (!hasAccess) {
        throw new Error("You don't have the required access level or ownership to perform this action.");
      }

      if (partialUserInfo?.recoveryEmail && !validateEmail(partialUserInfo.recoveryEmail)) {
        throw new Error('Invalid email address format');
      }

      if (partialUserInfo?.recoveryPhone && !validatePhoneNumber(partialUserInfo.recoveryPhone)) {
        partialUserInfo.recoveryPhone = partialUserInfo.recoveryPhone.replace(/\D/g, '');

        if (!partialUserInfo.recoveryPhone) {
          throw new Error('Invalid phone number format. Please provide a valid phone number');
        }
      }

      if (!partialUserInfo.psId) {
        throw new Error('No identifier to update');
      }

      // TODO Uncomment below code after the migrations are complete
      // if (request.obUserIdentity.obUserPsId !== partialUserInfo.psId) {
      //   throw new Error('Cannot update unmatched user profile');
      // }

      if (partialUserInfo.overriddenAccessJobId) {
        const jobDetails = await jobService.getJobById(transactionId, partialUserInfo.overriddenAccessJobId);
        partialUserInfo.overriddenAccessJobLevel = jobDetails.jobLevel;
      }

      const initiatedBy = RequestModeEnum.User;

      const translatedUserprofile = mapProfileApiRequestToServiceRequest({
        ...partialUserInfo,
        // TODO Uncomment below code after the migrations are complete
        // psId: request.obUserIdentity.obUserPsId,
      });

      const updatedPsId = await userService.updateUserByPsId(transactionId, { ...translatedUserprofile, initiatedBy });

      logInfo(`[${transactionId}] [CONTROLLER] updateUser SUCCESSFUL for psId: ${request.obUserIdentity.obUserPsId}`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `Updated user: ${updatedPsId}`,
      });

      const updatedProfile = await userService.getObUsersByPsId(transactionId, updatedPsId);

      const {
        branchAccess: { overriddenBranchIds, selectedBranchIds },
      } = updatedProfile;

      const userUniqueBranchIds = getUniqueStringsFromList(overriddenBranchIds, selectedBranchIds);
      const currentBranchIds = getEffectiveBranchIds(overriddenBranchIds, selectedBranchIds);

      logInfo(
        `[${transactionId}] [CONTROLLER] updateUser syncing chat user access for branches, ${currentBranchIds.join(
          ',',
        )}`,
      );

      await Promise.allSettled(
        currentBranchIds.map((branchId) => chatV2Service.syncChatUserAccessForBranch(transactionId, branchId)),
      );

      await Promise.allSettled(
        currentBranchIds.map((branchId) =>
          chatV2Service.syncBranchChatAbility(transactionId, partialUserInfo.psId, branchId),
        ),
      );
      logInfo(
        `[${transactionId}] [CONTROLLER] updateUser syncing chat direct message group for psId: ${partialUserInfo.psId}`,
      );

      /**
       * @deprecated
       * TODO: Remove after new Chat vendor enablement
       */
      await Promise.allSettled(
        userUniqueBranchIds.map((branchId) => chatService.syncChatGroupForBranch(transactionId, branchId)),
      );
    } catch (updateErr) {
      logError(
        `[${transactionId}] [CONTROLLER] updateUser FAILED for psId: ${partialUserInfo.psId}, reason: ${updateErr.message}`,
      );

      next(updateErr);
    }
  };

  private removeUser = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] removeUser initiated`);

    try {
      const { employeePsId } = request.params;

      if (!employeePsId || employeePsId === 'UNKNOWN_PSID') {
        throw new Error('Unable to remove the user from the system');
      }

      logInfo(`[${transactionId}] [CONTROLLER] removeUser check user exists for psId: ${employeePsId}`);

      const [userToRemove] = await userService.getObUsersByPsIds(transactionId, [employeePsId]);

      if (!userToRemove) {
        response.status(HttpStatusCode.NO_CONTENT).json({
          success: false,
          message: 'Cannot remove user who does not exist in the system',
        });

        return;
      }

      logInfo(`[${transactionId}] [CONTROLLER] removeUser removing user: ${JSON.stringify(userToRemove)}`);

      const removedPsId = await userService.removeUserFromSystem(transactionId, employeePsId);

      logInfo(`[${transactionId}] [CONTROLLER] removeUser SUCCESSFUL psId: ${removedPsId}`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `User removed successfully for ${removedPsId}`,
      });
    } catch (removeErr) {
      logError(`[${transactionId}] [CONTROLLER] removeUser FAILED, reason: ${removeErr.message}`);

      next(removeErr);
    }
  };

  private listUsers = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] listUsers initiated`);

    try {
      const {
        skip,
        limit,
        activeStatus,
        sortField,
        sortOrder,
        search,
        legacyId,
        jobLevels: jobLevelsCsv,
        branchIds: branchIdsCsv,
      }: {
        activeStatus?: UserStatusEnum;
        limit?: string;
        skip?: string;
        legacyId?: string;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
        search?: string;
        jobLevels?: string;
        branchIds?: string;
      } = request.query;

      const filters: FilterQuery<OBUserSchemaType> = {};

      const actualLimit = +limit || 100;
      const skipPage = +skip || 0;

      const [prerequisites, branches] = await Promise.all([
        onboardUserService.getAllPrerequisites(transactionId),
        locationService.getAllBranchesWithDivisions(transactionId),
      ]);

      if (activeStatus && activeStatus in UserStatusEnum) {
        filters.activeStatus = activeStatus;
      }

      if (legacyId) {
        filters['legacySystems.legacySystemId'] = legacyId;
      }

      if (jobLevelsCsv?.length > 0) {
        const jobLevels = jobLevelsCsv.split(',').map((jobLevel) => parseInt(jobLevel, 10));
        filters['job.level'] = {
          $in: jobLevels,
        };
      }

      if (branchIdsCsv?.length > 0) {
        const branchIds = branchIdsCsv.split(',');
        filters['branchAccess.selectedBranchIds'] = { $in: branchIds };
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] listUsers query requested for filters: ${JSON.stringify(
          filters,
        )}, limit: ${actualLimit}`,
      );

      const users = await userService.getObUsersByFilter(
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
      );

      const mappedUsers: UserInfoPayloadType[] = users.map((user) =>
        mapDBUsersToApiPayload(user, {
          vendors: {},
          dependencies: {
            branches,
            prerequisites,
            chatV2Groups: [],
            interactedNotificationIds: [],
          },
        }),
      );

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: mappedUsers,
      });
    } catch (listErr) {
      logError(`[${transactionId}] [CONTROLLER] listUsers FAILED, reason: ${listErr.message}`);

      next(listErr);
    }
  };

  private listUsersV2 = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] [CONTROLLER] listUsers initiated`);

    try {
      const {
        skip = '0',
        limit = '100',
        activeStatus,
        sortField,
        sortOrder,
        search,
        legacyId,
        jobLevels: jobLevelsCsv,
        branchIds: branchIdsCsv,
      }: {
        activeStatus?: UserStatusEnum;
        limit?: string;
        skip?: string;
        legacyId?: string;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
        search?: string;
        jobLevels?: string;
        branchIds?: string;
      } = request.query;

      const actualLimit = parseInt(limit, 10);
      const skipPage = parseInt(skip, 10);

      // Fetch only if needed to reduce unnecessary API calls
      const prerequisitesPromise = onboardUserService.getAllPrerequisites(transactionId);
      const branchesPromise = locationService.getAllBranchesWithDivisionsV2(transactionId);

      const filters: FilterQuery<OBUserSchemaType> = {};

      // Apply filters only if necessary
      if (activeStatus && UserStatusEnum[activeStatus]) {
        filters.activeStatus = activeStatus;
      }
      if (legacyId) {
        filters['legacySystems.legacySystemId'] = legacyId;
      }
      if (jobLevelsCsv) {
        filters['job.level'] = { $in: jobLevelsCsv.split(',').map(Number) };
      }
      if (branchIdsCsv) {
        filters['branchAccess.selectedBranchIds'] = { $in: branchIdsCsv.split(',') };
      }

      logInfo(`[${transactionId}] [CONTROLLER] listUsers query requested with limit: ${actualLimit}`);

      // Fetch users
      const usersPromise = userService.getObUsersByFilterV2(transactionId, filters, {
        limit: actualLimit,
        skip: skipPage,
        sortField,
        sortOrder,
        search,
      });

      // Await all promises simultaneously
      const [prerequisites, branches, users] = await Promise.all([prerequisitesPromise, branchesPromise, usersPromise]);

      const dependencies = { branches, prerequisites, chatGroups: [], chatV2Groups: [], interactedNotificationIds: [] };

      // Process user mapping in parallel if needed
      const mappedUsers: UserInfoPayloadType[] = await Promise.all(
        users.map((user) => mapDBUsersToApiPayload(user, { vendors: {}, dependencies })),
      );

      response.status(HttpStatusCode.OK).json({ mappedUsers });
    } catch (listErr) {
      logError(`[${transactionId}] [CONTROLLER] listUsers FAILED, reason: ${listErr.message}`);
      next(listErr);
    }
  };

  private getUsersDirectory = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getUsersDirectory initiated`);

    try {
      const { skip, limit, search, viewAs }: { limit?: string; skip?: string; search?: string; viewAs?: string } =
        request.query;

      const filters: FilterQuery<OBUserSchemaType> = {};

      const actualLimit = +limit || 100;
      const skipPage = +skip || 0;

      const { obUserPsId, accessLvl, branchIds = [] } = request.obUserIdentity;

      const accessLevelName = mapAccessLevelToName(accessLvl);

      if (accessLevelName === UserLevelEnum.FIELD_STAFF || accessLevelName === UserLevelEnum.BRANCH_ADMIN) {
        filters['job.level'] = { $gte: 1, $lte: 5 };
        filters['branchAccess.selectedBranchIds'] = { $in: branchIds };
      } else {
        const minJobLevel = viewAs && viewAs.toLowerCase() === UserLevelEnum.ADMIN.toLowerCase() ? 1 : 2;
        filters['job.level'] = { $gte: minJobLevel, $lte: 9 };
      }

      // User himself should not be in the recognition list
      filters.employeePsId = { $ne: obUserPsId };

      logInfo(
        `[${transactionId}] [CONTROLLER] getUsersDirectory query requested for filters: ${JSON.stringify(
          filters,
        )}, limit: ${actualLimit}`,
      );

      const users = await userService.getObUsersByFilter(
        transactionId,
        {
          ...filters,
        },
        {
          limit: actualLimit,
          skip: skipPage,
          sortField: 'lastVisitedAt',
          sortOrder: 'desc',
          search,
        },
      );

      // TODO: Return users' profileImage in response once image moderation is done
      const mappedUsers = users.map(({ employeePsId, displayName, lastVisitedAt }) => {
        return { employeePsId, displayName, lastVisitedAt };
      });

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: mappedUsers,
      });
    } catch (fetchErr) {
      logError(`[${transactionId}] [CONTROLLER] getUsersDirectory FAILED, reason: ${fetchErr.message}`);

      next(fetchErr);
    }
  };

  private uploadFile = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] uploadFile initiated`);

    try {
      let { obUserPsId } = request.obUserIdentity;
      let { phone, alternateEmail } = request.employeePingIdentity;
      const { branchIds, displayName, email } = request.obUserIdentity;
      const parsedQuery: { shouldOverride?: string; phase?: string } = request.query;
      const shouldOverride: boolean = parsedQuery?.shouldOverride === 'true';
      const { multipart = 'false' }: { multipart?: string } = request.query;
      const { employeePsId } = request.params;

      // todo : Remove this after migration is complete
      if (shouldOverride) {
        obUserPsId = employeePsId;
      }

      const [obUserInfo, employeeInfo] = await Promise.all([
        userService.getObUsersByPsId(transactionId, obUserPsId),
        userService.getEmployeePSFromEmployeeService(transactionId, obUserPsId),
      ]);

      if (employeeInfo?.alternateEmail && !alternateEmail) {
        alternateEmail = employeeInfo.alternateEmail;
      }

      if (employeeInfo?.phoneNumber && !phone) {
        phone = employeeInfo.phoneNumber;
      }

      if (obUserInfo?.tempProfile?.recoveryEmail) {
        alternateEmail = obUserInfo.tempProfile.recoveryEmail;
      }

      if (obUserInfo?.tempProfile?.recoveryPhone) {
        phone = obUserInfo.tempProfile.recoveryPhone;
      }

      if (multipart === 'true') {
        const uploadFile: MultipartFileCreateToS3Type | MultipartFileCompleteToS3Type | MultipartFileAbortToS3Type =
          request.body;
        const phase = parsedQuery?.phase as MultipartUploadPhaseEnum;

        const uploadedFile: MultipartCreateFileUploadResponseType | FileUploadResponseType | FileAbortResponseType =
          await userService.uploadMultiPartFileByPsId(transactionId, obUserPsId, uploadFile, phase);

        let responsePayload: {
          success: boolean;
          data: {
            fileName: string;
            uploadId?: string;
            signedUrlsForUpload?: string[];
            url?: string;
            toBeCompressed?: boolean;
          };
        };

        switch (phase) {
          case MultipartUploadPhaseEnum.create: {
            const createdResponse = uploadedFile as MultipartCreateFileUploadResponseType;
            responsePayload = {
              success: createdResponse.success,
              data: {
                fileName: createdResponse.data.fileName,
                uploadId: createdResponse.data.uploadId,
                signedUrlsForUpload: createdResponse.data.signedUrls,
              },
            };
            break;
          }
          case MultipartUploadPhaseEnum.complete: {
            const completedResponse = uploadedFile as FileUploadResponseType;
            responsePayload = {
              success: completedResponse.success,
              data: {
                fileName: completedResponse.data.fileName,
                url: completedResponse.data.url,
                toBeCompressed: completedResponse.data.submittedForCompression,
              },
            };
            break;
          }
          case MultipartUploadPhaseEnum.abort: {
            const abortedResponse = uploadedFile as FileAbortResponseType;
            responsePayload = {
              success: abortedResponse.success,
              data: {
                fileName: abortedResponse.data.fileName,
              },
            };
          }
        }
        response.status(HttpStatusCode.OK).json(responsePayload);

        return;
      }

      const uploadFile: FileUploadToS3Type = request.body;
      const uploadedFile = await userService.uploadFileByPsId(transactionId, obUserPsId, uploadFile, {
        branchIds,
        displayName,
        email,
        phone,
        alternateEmail,
      });

      logInfo(`[${transactionId}] [CONTROLLER] uploadFile SUCCESSFUL, result: ${obUserPsId}`);

      response.status(HttpStatusCode.OK).json({
        success: uploadedFile.success,
        data: { fileName: uploadedFile.data.fileName, url: uploadedFile.data.url },
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] uploadFile FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  private removeFile = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] removeFile initiated`);

    try {
      const { fileName }: { fileName?: string } = request.query;
      const { obUserPsId } = request.obUserIdentity;
      const fileType: AssetEnum = request.query.type as AssetEnum;

      logInfo(
        `[${transactionId}] [CONTROLLER] removeFile check user exists for psId: ${obUserPsId}, fileName: ${fileName} and fileType:${fileType}`,
      );

      const removedFile = await userService.removeFileByPsId(transactionId, obUserPsId, {
        fileName,
        fileType,
      });

      logInfo(`[${transactionId}] [CONTROLLER] removeFile SUCCESSFUL psId: ${JSON.stringify(removedFile)}`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `File removed successfully for ${fileName}`,
      });
    } catch (removeErr) {
      logError(`[${transactionId}] [CONTROLLER] removeFile FAILED, reason: ${removeErr.message}`);

      next(removeErr);
    }
  };

  private getFileStatus = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getFileCompressionStatus initiated`);

    try {
      const { obUserPsId } = request.obUserIdentity;

      if (request.query.type === 'ProfileVideo') {
        logInfo(`[${transactionId}] [CONTROLLER] getFileCompressionStatus for psId: ${obUserPsId}`);

        const statusResponse = await userService.getFileCompressionStatusByPsId(transactionId, obUserPsId);

        logInfo(
          `[${transactionId}] [CONTROLLER] getFileCompressionStatus SUCCESSFUL psId: ${JSON.stringify(statusResponse)}`,
        );
        response.status(HttpStatusCode.OK).json({
          fileStatus: statusResponse.compressionStatus,
        });
      }
    } catch (statusErr) {
      logError(`[${transactionId}] [CONTROLLER] getFileCompressionStatus FAILED, reason: ${statusErr.message}`);

      next(statusErr);
    }
  };

  private resetUser = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] resetUser initiated`);

    try {
      const employeePsId = request.params.employeePsId;

      await cacheService.remove(transactionId, {
        serviceName: 'employeeService',
        identifier: employeePsId,
      });

      response.status(HttpStatusCode.OK).json({
        psId: employeePsId,
      });
    } catch (resetErr) {
      logError(`[${transactionId}] [CONTROLLER] resetUser FAILED, reason: ${resetErr.message}`);

      next(resetErr);
    }
  };

  private getFileGuidelines = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getFileGuidelines initiated`);

    try {
      const employeePsId = request.params?.employeePsId;
      const type = request.query.type as FileGuidelinesEnum;

      const { displayName, jobId } = request.obUserIdentity;

      const job = await jobService.getJobById(transactionId, jobId);

      const guidelines = await userService.getFileGuidelines(transactionId, {
        psId: employeePsId,
        type,
        displayName,
        jobTitle: job?.jobTitle ?? '',
      });

      response.status(HttpStatusCode.OK).json(mapFileGuidelinesToApiPayload(guidelines));
    } catch (resetErr) {
      logError(`[${transactionId}] [CONTROLLER] getFileGuidelines FAILED, reason: ${resetErr.message}`);

      next(resetErr);
    }
  };

  private getUserLocationsByDates = async (
    request: express.Request,
    response: express.Response<UserLocationPayloadType>,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    const { accessLvl } = request.obUserIdentity;

    logInfo(`[${transactionId}] [CONTROLLER] [getUserLocationsByDates] location by dates initiated`);

    try {
      const accessLevelName = mapAccessLevelToName(accessLvl);

      if (![UserLevelEnum.CONTROLLED_ADMIN, UserLevelEnum.BRANCH_ADMIN].includes(accessLevelName)) {
        throw new Error('You must be a admin to perform this operation.');
      }

      const {
        search,
        startDate: startDateStr,
        endDate: endDateStr,
      }: {
        search?: string;
        startDate?: string;
        endDate?: string;
      } = request.query;

      // TODO Extend to support the username or email or psId
      if (!search?.trim() || !search.startsWith('000') || !isValidDate(new Date(startDateStr))) {
        throw new Error('Provide a valid search key and a date');
      }

      const startDateDay = startOfDay(new Date(startDateStr));
      const endDateDay = endOfDay(new Date(endDateStr || startDateStr));

      logInfo(
        `[${transactionId}] [CONTROLLER] [getUserLocationsByDates] Query requested for searchKey: ${search}, startDate: ${startDateStr}, endDate: ${endDateStr}`,
      );

      const employee = await userService.getObUsersByPsId(transactionId, search);

      if (!employee) {
        throw new Error(`Employee with search criteria ${search} doesn't exist in DB`);
      }

      const userLocationsPayload: UserLocationPayloadType = {
        employeeDetail: {
          psId: employee.employeePsId,
          displayName: employee.displayName,
          email: employee.workEmail,
          lastLoggedAt: employee.lastLoggedAt ? formatDate(new Date(employee.lastLoggedAt), 'yyyy-MM-dd h:mm a') : '',
        },
        geoLocations: [],
      };

      const geoLocations = await userLocationService.getLocationsByDates(transactionId, employee.employeePsId, {
        startDate: startDateDay,
        endDate: endDateDay,
      });

      const uniqueClients: { clientId: string; tenantId: string }[] = [];

      for (const geoLocation of geoLocations) {
        if (geoLocation.clientId && geoLocation.tenantId) {
          uniqueClients.push({ clientId: geoLocation.clientId, tenantId: geoLocation.tenantId });
        }
      }

      const clientsArray: ClientFromSystemType[] =
        uniqueClients.length > 0
          ? await clientService.getClientDetailByClientAndTenantIds(transactionId, uniqueClients)
          : [];

      const clientIdMap = new Map<string, ClientFromSystemType>();
      clientsArray.forEach((client) => {
        clientIdMap.set(client.clientId, client);
      });

      for (const geoLocation of geoLocations) {
        const clientDetails: {
          clientId?: string;
          clientName?: string;
          clientAddressFormatted?: string;
          clientLatitude?: string;
          clientLongitude?: string;
        } = {};

        if (geoLocation.clientId) {
          const client = clientIdMap.get(geoLocation.clientId);

          if (client) {
            clientDetails.clientId = client.clientId;
            clientDetails.clientName = `${client.firstName || ''} ${client.lastName || ''}`;
            clientDetails.clientAddressFormatted = combineAddress(client.address, true);
          }
        }

        userLocationsPayload.geoLocations.push({
          latitude: geoLocation.latitude,
          longitude: geoLocation.longitude,
          captureType: geoLocation.captureType,
          cvid: geoLocation.cvid,
          visitId: geoLocation.visitId,
          tenantId: geoLocation.tenantId,
          deviceTime: new Date(geoLocation.deviceTime).toISOString(),
          ...clientDetails,
        });
      }

      response.status(HttpStatusCode.OK).json(userLocationsPayload);
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] [getUserLocationsByDates] FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  private createUserLocation = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] createUserLocation initiated`);

    try {
      const { obUserPsId } = request.obUserIdentity;

      const userLocations: HTTPPostUserLocationInputType[] = request.body;

      for (const userLocation of userLocations) {
        await userLocationService.registerLocation(transactionId, {
          ...userLocation,
          userPsId: obUserPsId,
        });
      }

      logInfo(`[${transactionId}] [CONTROLLER] createUserLocation COMPLETED`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: 'Your userLocation has been received successfully. Thank you for reaching out!',
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] userLocation endpoint failed with error: ${err.message}`);

      next(err);
    }
  };
}
