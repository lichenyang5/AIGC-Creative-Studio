import { describe, expect, it, vi } from 'vitest'

vi.mock('../database/database.js', () => ({
  getDatabasePool: vi.fn(),
  queryDatabase: vi.fn(),
}))

import { queryDatabase } from '../database/database.js'
import { failInterruptedProcessingTasks } from '../repositories/postgresGenerationRepository.js'

describe('interrupted generation task recovery', () => {
  it('marks only processing tasks as failed with a safe restart reason', async () => {
    const queryDatabaseMock = vi.mocked(queryDatabase)
    queryDatabaseMock.mockResolvedValue({ rowCount: 2 } as never)

    await expect(failInterruptedProcessingTasks()).resolves.toBe(2)

    expect(queryDatabaseMock).toHaveBeenCalledWith(
      expect.stringContaining('WHERE status = $4'),
      [
        'failed',
        'SERVER_RESTARTED',
        'Image generation was interrupted because the server restarted. Please try again.',
        'processing',
      ],
    )
  })
})
