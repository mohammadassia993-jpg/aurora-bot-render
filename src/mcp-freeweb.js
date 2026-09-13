// freeweb-mcp embedded as HTTP MCP endpoint (no API keys required)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export async function handleFreewebMCP(request, response, rawBody) {
  try {
    let body = null;
    if (rawBody && rawBody.length) {
      body = JSON.parse(rawBody.toString('utf8'));
    }
    const { registerTools } = await import('freeweb-mcp/dist/tools.js');
    const server = new McpServer({ name: 'freeweb', version: '3.4.0' });
    registerTools(server);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  } catch (err) {
    console.error('freeweb MCP error:', err);
    if (!response.headersSent) {
      try {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: err.message }));
      } catch (e) { /* ignore */ }
    }
  }
}
