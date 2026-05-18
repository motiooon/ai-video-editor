#!/usr/bin/env node
/**
 * AI Clipper MCP Server
 *
 * Exposes all AI Clipper tools over the MCP stdio transport so any MCP client
 * (Claude Code, Claude Desktop, another agent) can orchestrate media editing.
 *
 * Add to your Claude config:
 *   {
 *     "mcpServers": {
 *       "ai-clipper": {
 *         "command": "node",
 *         "args": ["/absolute/path/to/src/mcp/server.js"]
 *       }
 *     }
 *   }
 *
 * Workflow the client should follow:
 *   start_session → prepare_file → transcribe → get_transcript →
 *   mark_removed  → build_timeline → open_review → export → end_session
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { TOOL_DEFS, invoke } from '../tools/index.js';

const mcp = new McpServer({ name: 'ai-clipper', version: '1.0.0' });

// McpServer's tool API requires Zod schemas, but our tools use raw JSON Schema
// (Claude API format). Register handlers directly on the underlying Server so
// we keep proper inputSchema definitions without adding a Zod dependency.
const server = mcp.server;
server.registerCapabilities({ tools: {} });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    const result = await invoke(name, args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await mcp.connect(transport);
console.error('AI Clipper MCP server ready (stdio)');
