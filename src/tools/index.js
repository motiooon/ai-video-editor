import { tools as sessionTools }    from './session.js';
import { tools as prepareTools }    from './prepare.js';
import { tools as transcribeTools } from './transcribe.js';
import { tools as annotateTools }   from './annotate.js';
import { tools as timelineTools }   from './timeline.js';
import { tools as reviewTools }     from './review.js';
import { tools as exportTools }     from './export.js';

const ALL_TOOLS = [
  ...sessionTools,
  ...prepareTools,
  ...transcribeTools,
  ...annotateTools,
  ...timelineTools,
  ...reviewTools,
  ...exportTools,
];

// Schemas only — safe to serialise and send to Claude or an MCP client
export const TOOL_DEFS = ALL_TOOLS.map(({ name, description, input_schema }) => ({
  name,
  description,
  input_schema,
}));

// Re-export session helpers for agent.js
export { getSession } from './session.js';
export const { fn: startSession } = sessionTools.find((t) => t.name === 'start_session');
export const { fn: endSession }   = sessionTools.find((t) => t.name === 'end_session');

const DISPATCH = Object.fromEntries(ALL_TOOLS.map((t) => [t.name, t.fn]));

export async function invoke(name, input, opts = {}) {
  const fn = DISPATCH[name];
  if (!fn) throw new Error(`Unknown tool: ${name}`);
  return fn(input, opts);
}
