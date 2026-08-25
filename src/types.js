/**
 * @typedef {Object} Session
 * @property {string} id
 * @property {string} title
 * @property {number} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} Flashcard
 * @property {string} id
 * @property {string} front
 * @property {string} back
 * @property {number} reps
 * @property {number} easiness
 * @property {number} interval
 * @property {string} dueDate
 * @property {string} [updatedAt]
 * @property {boolean} [deleted]
 */

/**
 * @typedef {Object} QuizQuestion
 * @property {string} [id]
 * @property {string} q
 * @property {string[]} options
 * @property {number} a
 * @property {boolean} [deleted]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} StudySet
 * @property {string} sessionId
 * @property {string} title
 * @property {Flashcard[]} cards
 * @property {number|null} [examDate]
 * @property {QuizQuestion[]} [quiz]
 * @property {string} [updatedAt]
 * @property {boolean} [deleted]
 */

/**
 * @typedef {Object} UsageSummary
 * @property {Object} set
 * @property {number} set.used
 * @property {number|null} set.limit
 * @property {Object} coding
 * @property {number} coding.used
 * @property {number|null} coding.limit
 * @property {Object} practice
 * @property {number} practice.used
 * @property {number|null} practice.limit
 * @property {string} plan
 * @property {string} window
 */

/**
 * @typedef {Object} AuthUser
 * @property {string} id
 * @property {string} email
 * @property {string} plan
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Auth
 * @property {AuthUser|null} user
 * @property {string|null} lastSync
 */
