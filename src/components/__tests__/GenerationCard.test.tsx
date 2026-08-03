import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { GenerationCard } from '../GenerationCard'
import type { GenerationTask } from '../../types/generationApi'

const failedTask: GenerationTask = {
  taskId: 'failed-task',
  status: 'failed',
  request: {
    prompt: '失败任务的参数',
    aspectRatio: '4:3',
    count: 2,
    style: 'anime',
  },
  createdAt: '2026-07-30T00:00:00.000Z',
}

function CreateState() {
  const location = useLocation()
  return <output>{JSON.stringify(location.state)}</output>
}

describe('GenerationCard reusable parameters', () => {
  it('lets a failed task navigate to create with its request in route state', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/library']}>
        <Routes>
          <Route path="/library" element={<GenerationCard task={failedTask} onDeleted={() => undefined} />} />
          <Route path="/create" element={<CreateState />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '复用参数' }))

    expect(screen.getByText(/失败任务的参数/)).toBeInTheDocument()
    expect(screen.getByText(/"style":"anime"/)).toBeInTheDocument()
  })
})
