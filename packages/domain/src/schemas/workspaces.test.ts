/** Alignement des schémas des Workspaces sur les types du domaine, et des fixtures sur les schémas. */
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { z } from 'zod'

import { WORKSPACE_FIXTURES } from '../fixtures/workspaces.ts'
import type { WORKSPACE_RULE_VIOLATIONS, WorkspaceRuleViolation } from '../shared/errors.ts'
import type {
  CheckWriteResult,
  Claim,
  EntryPage,
  JoinResult,
  ParticipantView,
  SessionRef,
  Workspace,
  WorkspaceDetail,
  WorkspaceEntry,
  WorkspaceList,
  WorkspaceSummary,
} from '../workspaces/types.ts'
import type {
  CheckWriteResultSchema,
  EntryPageSchema,
  JoinResultSchema,
  ParticipantSchema,
  SessionRefSchema,
  WorkspaceDetailSchema,
  WorkspaceListSchema,
  WorkspaceSummarySchema,
} from './workspaces.ts'
import { ClaimSchema, WorkspaceEntrySchema, WorkspaceSchema } from './workspaces.ts'

describe('schémas des workspaces', () => {
  it('acceptent les types du domaine (typecheck)', () => {
    expectTypeOf<SessionRef>().toExtend<z.input<typeof SessionRefSchema>>()
    expectTypeOf<Workspace>().toExtend<z.input<typeof WorkspaceSchema>>()
    expectTypeOf<WorkspaceEntry>().toExtend<z.input<typeof WorkspaceEntrySchema>>()
    expectTypeOf<Claim>().toExtend<z.input<typeof ClaimSchema>>()
    expectTypeOf<ParticipantView>().toExtend<z.input<typeof ParticipantSchema>>()
    expectTypeOf<WorkspaceSummary>().toExtend<z.input<typeof WorkspaceSummarySchema>>()
    expectTypeOf<WorkspaceList>().toExtend<z.input<typeof WorkspaceListSchema>>()
    expectTypeOf<WorkspaceDetail>().toExtend<z.input<typeof WorkspaceDetailSchema>>()
    expectTypeOf<EntryPage>().toExtend<z.input<typeof EntryPageSchema>>()
    expectTypeOf<JoinResult>().toExtend<z.input<typeof JoinResultSchema>>()
    expectTypeOf<CheckWriteResult>().toExtend<z.input<typeof CheckWriteResultSchema>>()
    expectTypeOf<
      (typeof WORKSPACE_RULE_VIOLATIONS)[number]
    >().toEqualTypeOf<WorkspaceRuleViolation>()
  })

  it('valident les fixtures', () => {
    for (const fixture of WORKSPACE_FIXTURES) {
      expect(WorkspaceSchema.safeParse(fixture.workspace).success, fixture.workspace.slug).toBe(
        true,
      )
      for (const entry of fixture.entries) {
        expect(WorkspaceEntrySchema.safeParse(entry).success, `#${entry.seq}`).toBe(true)
      }
      for (const claim of fixture.claims) expect(ClaimSchema.safeParse(claim).success).toBe(true)
    }
  })

  it('numérotent les entrées de chaque fixture sans trou à partir de 1', () => {
    for (const { entries } of WORKSPACE_FIXTURES) {
      expect(entries.map((entry) => entry.seq)).toEqual(entries.map((_, index) => index + 1))
    }
  })

  it('reprennent la maquette 26 : 48 entrées, #47 décision, #42 avec un secret masqué', () => {
    const [migration] = WORKSPACE_FIXTURES
    expect(migration?.entries).toHaveLength(48)
    expect(migration?.entries[46]?.kind).toBe('decision')
    expect(migration?.entries[41]?.redactions).toBe(1)
  })
})
