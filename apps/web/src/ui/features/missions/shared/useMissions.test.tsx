import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { MissionListQuery } from '../../../../application/ports/MissionRepository.ts'
import { createTestServices } from '../../../../test/renderApp.tsx'
import { AppProviders } from '../../../app/providers/AppProviders.tsx'
import { createQueryClient } from '../../../app/providers/createQueryClient.ts'
import { missionKeys, useMissionList } from './useMissions.ts'

const QUERY: MissionListQuery = { filter: 'all', tags: ['web', 'perf'], repo: null, batchId: null }

describe('useMissionList : clé de cache', () => {
  it('l’ordre des tags ne change pas la clé', () => {
    expect(missionKeys.list(QUERY)).toEqual(missionKeys.list({ ...QUERY, tags: ['perf', 'web'] }))
  })

  it('deux ordres de tags : une seule requête, tags triés', async () => {
    const services = createTestServices()
    const list = vi.spyOn(services.missions, 'list')
    const queryClient = createQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppProviders services={services} queryClient={queryClient}>
        {children}
      </AppProviders>
    )
    const first = renderHook(() => useMissionList(QUERY), { wrapper })
    await waitFor(() => {
      expect(first.result.current.isSuccess).toBe(true)
    })
    const second = renderHook(() => useMissionList({ ...QUERY, tags: ['perf', 'web'] }), {
      wrapper,
    })
    expect(second.result.current.data).toBe(first.result.current.data)
    expect(list).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledWith({ ...QUERY, tags: ['perf', 'web'] })
  })
})
