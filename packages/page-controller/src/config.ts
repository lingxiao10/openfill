/**
 * PageController configuration constants.
 * Adjust these values to tune the agent's interaction behavior.
 */

/**
 * Fixed delay in seconds between a click and re-parsing the DOM.
 * Gives the page time to start reacting before we scan for new element indices.
 * @default 0.5
 */
export const PRE_PARSE_DELAY = 0.3

/**
 * Fixed delay in seconds after DOM re-parsing is complete, before the next action.
 * Gives the page extra time to fully settle after indices are assigned.
 * @default 2
 */
export const POST_PARSE_DELAY = 0.1

/**
 * Delay in seconds between each keystroke when simulating character-by-character typing.
 * Higher values feel more human-like; lower values speed up automation.
 * @default 0.05
 */
export const TYPING_DELAY = 0.05
