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
 *         description: Number of items to skip for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of items to return 
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
 *         description: Branch IDs to filter polls
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
 *                     items:
 *                       type: string
 *                  provincialCodes:
 *                     type: array
 *                      items:
 *                        type: string
 *                      enum:
 *                         - AB
 *                         - BC
 *                         - MB
 *                         - NB
 *                         - NL
 *                         - NT
 *                         - NS
 *                         - NU
 *                         - ON
 *                         - PE
 *                         - QC
 *                         - SK
 *                         - YT
 *                         - ALL
 *                   divisionIds:
 *                     type: array
 *                     items:
 *                       type: string
 *                   accessLevelNames:
 *                     type: array
 *                     items:
 *                       type: string
 *                       enum: [SUPER_ADMIN, ADMIN, CONTROLLED_ADMIN, BRANCH_ADMIN, FIELD_STAFF]
 *                   pollOptions:
 *                     type: array
 *                     items:
 *                       type: string
 *                   legacyCmsId:
 *                     type: string
 *                   status:
 *                     type: string
 *                     enum: [Enabled, Disabled]
 *                   priority:
 *                     type: string
 *                     enum: [Low, Medium, High, Highest]
 *                   validFrom:
 *                     type: string
 *                     format: date-time
 *                   expiresAt:
 *                     type: string
 *                     format: date-time
 *                   isDeleted:
 *                     type: boolean
 *                  createdBy:
 *                     type: object
 *                     properties:
 *                       employeePsId:
 *                         type: string
 *                       displayName:
 *                         type: string
 *                       userImageLink:
 *                         type: string
 *                  updatedBy:
 *                     type: object
 *                     properties:
 *                       employeePsId:
 *                         type: string
 *                       displayName:
 *                         type: string
 *                       userImageLink:
 *                         type: string
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


/**
 * @swagger
 * /basepath/{pollId}:
 *   get:
 *     summary: Retrieve a specific poll by pollId
 *     description: Returns a specific poll by its ID along with the user's interaction status.
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
 *                      enum:
 *                         - AB
 *                         - BC
 *                         - MB
 *                         - NB
 *                         - NL
 *                         - NT
 *                         - NS
 *                         - NU
 *                         - ON
 *                         - PE
 *                         - QC
 *                         - SK
 *                         - YT
 *                         - ALL
 *                   divisionIds:
 *                     type: array
 *                     items:
 *                       type: string
 *                   accessLevelNames:
 *                     type: array
 *                     items:
 *                       type: string
 *                       enum: [SUPER_ADMIN, ADMIN, CONTROLLED_ADMIN, BRANCH_ADMIN, FIELD_STAFF]
 *                   pollOptions:
 *                     type: array
 *                     items:
 *                       type: string
 *                   legacyCmsId:
 *                     type: string
 *                   status:
 *                     type: string
 *                     enum: [Enabled, Disabled]
 *                   priority:
 *                     type: string
 *                     enum: [Low, Medium, High, Highest]
 *                   validFrom:
 *                     type: string
 *                     format: date-time
 *                   expiresAt:
 *                     type: string
 *                     format: date-time
 *                   isDeleted:
 *                     type: boolean
 *                  createdBy:
 *                     type: object
 *                     properties:
 *                       employeePsId:
 *                         type: string
 *                       displayName:
 *                         type: string
 *                       userImageLink:
 *                         type: string
 *                  updatedBy:
 *                     type: object
 *                     properties:
 *                       employeePsId:
 *                         type: string
 *                       displayName:
 *                         type: string
 *                       userImageLink:
 *                         type: string
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
 *               pollType:
 *                 type: string
 *                 enum: [Choice, Feedback]
 *               audienceLevel:
 *                 type: string
 *                 enum: [National, Branch, Division, Province, Individual]
 *               branchIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               divisionIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               provincialCodes:
 *                 type: array
 *                 items:
 *                   type: string
  *                  enum:
 *                       - AB
 *                       - BC
 *                       - MB
 *                       - NB
 *                       - NL
 *                       - NT
 *                       - NS
 *                       - NU
 *                       - ON
 *                       - PE
 *                       - QC
 *                       - SK
 *                       - YT
 *                       - ALL
 *               lobLevels:
 *                 type: array
 *                 items:
 *                  type: integer
 *               accessLevelNames:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [SUPER_ADMIN, ADMIN, CONTROLLED_ADMIN, BRANCH_ADMIN, FIELD_STAFF]
 *               legacyCmsId:
 *                 type: string
 *               pollOptions:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *                 enum: [Enabled, Disabled]
 *               priority:
 *                 type: string
 *                 enum: [Low, Medium, High, Highest]
 *               validFrom:
 *                 type: string
 *                 format: date-time
 *               expiresInDays:
 *                 type: integer
 *               createdByUserId:
 *                 type: string
 *               createdByUserName:
 *                 type: string
 *               createdAt:
 *                 type: string
 *                 format: date-time
 *               updatedAt:
 *                 type: string
 *                 format: date-time
 *            required:
 *              - title
 *              - pollType
 *              - audienceLevel
 *              - jobLevels
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
 *             properties:
 *               title:
 *                 type: string
 *               pollType:
 *                 type: string
 *                 enum: [Choice, Feedback]
 *               audienceLevel:
 *                 type: string
 *                 enum: [National, Branch, Division, Province, Individual]
 *               branchIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               divisionIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               provincialCodes:
 *                 type: array
 *                 items:
 *                   type: string
  *                  enum:
 *                       - AB
 *                       - BC
 *                       - MB
 *                       - NB
 *                       - NL
 *                       - NT
 *                       - NS
 *                       - NU
 *                       - ON
 *                       - PE
 *                       - QC
 *                       - SK
 *                       - YT
 *                       - ALL
 *               lobLevels:
 *                 type: array
 *                 items:
 *                  type: integer
 *               accessLevelNames:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [SUPER_ADMIN, ADMIN, CONTROLLED_ADMIN, BRANCH_ADMIN, FIELD_STAFF]
 *               legacyCmsId:
 *                 type: string
 *               pollOptions:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *                 enum: [Enabled, Disabled]
 *               priority:
 *                 type: string
 *                 enum: [Low, Medium, High, Highest]
 *               validFrom:
 *                 type: string
 *                 format: date-time
 *               expiresInDays:
 *                 type: integer
 *               createdByUserId:
 *                 type: string
 *               createdByUserName:
 *                 type: string
 *               createdAt:
 *                 type: string
 *                 format: date-time
 *               updatedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Poll updated successfully
 *         content:
 *           application/json:
 *            schema:
 *              type: object
 *              properties:
 *               title:
 *                 type: string
 *               pollType:
 *                 type: string
 *                 enum: [Choice, Feedback]
 *               audienceLevel:
 *                 type: string
 *                 enum: [National, Branch, Division, Province, Individual]
 *               branchIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               divisionIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               provincialCodes:
 *                 type: array
 *                 items:
 *                   type: string
 *                  enum:
 *                       - AB
 *                       - BC
 *                       - MB
 *                       - NB
 *                       - NL
 *                       - NT
 *                       - NS
 *                       - NU
 *                       - ON
 *                       - PE
 *                       - QC
 *                       - SK
 *                       - YT
 *                       - ALL
 *               lobLevels:
 *                 type: array
 *                 items:
 *                  type: integer
 *               accessLevelNames:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [SUPER_ADMIN, ADMIN, CONTROLLED_ADMIN, BRANCH_ADMIN, FIELD_STAFF]
 *               legacyCmsId:
 *                 type: string
 *               pollOptions:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *                 enum: [Enabled, Disabled]
 *               priority:
 *                 type: string
 *                 enum: [Low, Medium, High, Highest]
 *               validFrom:
 *                 type: string
 *                 format: date-time
 *               expiresInDays:
 *                 type: integer
 *               createdByUserId:
 *                 type: string
 *               createdByUserName:
 *                 type: string
 *               createdAt:
 *                 type: string
 *                 format: date-time
 *               updatedAt:
 *                 type: string
 *                 format: date-time
 *       400:
 *         description: Bad Request - Missing required fields
 *       404:
 *         description: Poll not found
 *       500:
 *         description: Internal server error
 */


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
 *       401:
 *         description: Unauthorized access
 *       500:
 *         description: Internal server error
 */


    /**
 * @swagger
 * /basepath/{pollId}/interactions:
 *   post:
 *     summary: Submit a poll interaction
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
 *                 description: The type of the poll
 *               selectionOptions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Selection options for the poll 
 *               feedbackComment:
 *                 type: string
 *                 description: Comment for feedback-based polls 
 *               numOfStars:
 *                 type: integer
 *                 description: Number of stars given in a poll
 *               createdUserId:
 *                 type: string
 *                 description: The ID of the user who submitted the interaction
 *               createdUserName:
 *                 type: string
 *                 description: The name of the user who submitted the interaction
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
 *       404:
 *         description: Poll not found
 *       500:
 *         description: Internal server error
 */

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
 *                 pollTitle:
 *                   type: string
 *                 pollType:
 *                   type: string
 *                   enum: [choice,feedback]
 *                 pollPriority:
 *                   type: string
 *                   enum: [low,medium,high,highest]
 *                 totalInteractions:
 *                   type: integer
 *                   description: Total number of user's interaction
 *                 pollOptions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       option:
 *                         type: string
 *                         dexcription: The poll option
 *                       votes:
 *                         type: integer
 *                         description: The no of votes for the options
 *       400:
 *         description: Invalid request (missing pollId or poll does not exist)
 *       404:
 *         description: Poll not found or deleted
 *       500:
 *         description: Internal server error
 */

