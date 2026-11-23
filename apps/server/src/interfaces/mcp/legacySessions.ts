/**
 * Sessions du protocole 2025 (Streamable HTTP avec `Mcp-Session-Id`) : nécessaires pour pousser
 * `notifications/resources/list_changed` sur le flux GET d'une session ouverte. Les clients
 * 2026-07-28 passent par `createMcpHandler` (flux `subscriptions/listen`), voir `mountMcp.ts`.
 */
import { randomUUID } from 'node:crypto'

import {
  isInitializeRequest,
  WebStandardStreamableHTTPServerTransport,
  type AuthInfo,
  type McpServer,
} from '@modelcontextprotocol/server'

import type { Logger } from '../../application/ports/Logger.ts'
import type { UserId, Viewer } from '../../application/viewer.ts'

/** Garde-fou mémoire : au-delà, une nouvelle session est refusée (503). */
export const MAX_LEGACY_SESSIONS = 500

const SESSION_HEADER = 'mcp-session-id'

interface Session {
  readonly server: McpServer
  readonly transport: WebStandardStreamableHTTPServerTransport
  /** Une session n'est utilisable que par l'utilisateur qui l'a ouverte. */
  readonly userId: UserId
}

function jsonRpcError(status: number, code: number, message: string): Response {
  return Response.json({ jsonrpc: '2.0', error: { code, message }, id: null }, { status })
}

async function isInitialize(request: Request): Promise<boolean> {
  if (request.method !== 'POST') return false
  try {
    const body: unknown = await request.clone().json()
    return isInitializeRequest(body)
  } catch {
    return false
  }
}

export class LegacySessions {
  private readonly sessions = new Map<string, Session>()

  constructor(
    private readonly createServer: (viewer: Viewer) => McpServer,
    private readonly logger: Logger,
  ) {}

  get size(): number {
    return this.sessions.size
  }

  async handle(request: Request, viewer: Viewer, authInfo: AuthInfo): Promise<Response> {
    const sessionId = request.headers.get(SESSION_HEADER)
    if (sessionId !== null) {
      const session = this.sessions.get(sessionId)
      // Session inconnue, ou d'un autre utilisateur : indistinguables (404, comme le prévoit la spec).
      if (session?.userId !== viewer.userId) return jsonRpcError(404, -32001, 'Session not found')
      return session.transport.handleRequest(request, { authInfo })
    }
    if (!(await isInitialize(request)))
      return jsonRpcError(400, -32000, 'Bad Request: no valid session ID provided')
    if (this.sessions.size >= MAX_LEGACY_SESSIONS)
      return jsonRpcError(503, -32000, 'Too many MCP sessions')
    return this.open(request, viewer, authInfo)
  }

  /** Pousse `notifications/resources/list_changed` à toutes les sessions ouvertes. */
  notifyResourcesChanged(): void {
    for (const session of this.sessions.values()) session.server.sendResourceListChanged()
  }

  async closeAll(): Promise<void> {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.all(sessions.map((session) => session.transport.close()))
  }

  private async open(request: Request, viewer: Viewer, authInfo: AuthInfo): Promise<Response> {
    const server = this.createServer(viewer)
    const transport: WebStandardStreamableHTTPServerTransport =
      new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          this.sessions.set(id, { server, transport, userId: viewer.userId })
          this.logger.info('mcp.session_opened', {
            user: viewer.userId,
            sessions: this.sessions.size,
          })
        },
        onsessionclosed: (id) => {
          this.sessions.delete(id)
        },
      })
    transport.onclose = () => {
      if (transport.sessionId !== undefined) this.sessions.delete(transport.sessionId)
    }
    await server.connect(transport)
    return transport.handleRequest(request, { authInfo })
  }
}
