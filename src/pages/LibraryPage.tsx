import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GenerationCard } from '../components/GenerationCard'
import { createApiUrl } from '../config/api'
import {
  type GenerationListErrorResponse,
  type GenerationListResponse,
  type GenerationTask,
} from '../types/generationApi'

export function LibraryPage() {
  const [tasks, setTasks] = useState<GenerationTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    const loadTasks = async () => {
      try {
        const response = await fetch(
          createApiUrl('/api/generations?status=succeeded&limit=20&offset=0'),
        )
        const data = (await response.json()) as
          | GenerationListResponse
          | GenerationListErrorResponse

        if (!response.ok || !data.success) {
          throw new Error('message' in data ? data.message : '加载生成库失败')
        }

        if (isActive) {
          setTasks(data.data.items)
        }
      } catch {
        if (isActive) {
          setLoadError('加载生成库失败，请稍后重试')
        }
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadTasks()

    return () => {
      isActive = false
    }
  }, [])

  const imageCards = tasks.flatMap((task) =>
    (task.result?.images ?? []).map((image, imageIndex) => ({
      task,
      image,
      imageIndex,
    })),
  )

  return (
    <main className="library-page">
        <div className="library-heading">
          <div>
            <h2>生成库</h2>
            <p>查看已完成的图片创作作品</p>
          </div>
          <Link className="library-create-link" to="/create">
            开始创作
          </Link>
        </div>

        {isLoading ? (
          <div className="library-state" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            <p>正在加载生成作品...</p>
          </div>
        ) : loadError ? (
          <div className="library-state library-error" role="alert">
            <p>{loadError}</p>
          </div>
        ) : imageCards.length === 0 ? (
          <div className="library-state library-empty">
            <div className="placeholder-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none">
                <rect x="8" y="10" width="32" height="28" rx="4" stroke="currentColor" strokeWidth="2.5" />
                <circle cx="18" cy="20" r="3" fill="currentColor" />
                <path d="M11.5 34l8.5-8 5.5 5 4.5-4 6.5 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3>还没有生成作品，去创作第一张图片吧</h3>
            <Link className="library-create-link" to="/create">
              开始创作
            </Link>
          </div>
        ) : (
          <section className="library-grid" aria-label="已生成的图片">
            {imageCards.map(({ task, image, imageIndex }) => (
              <GenerationCard
                key={`${task.taskId}-${imageIndex}`}
                task={task}
                image={image}
                imageIndex={imageIndex}
              />
            ))}
          </section>
        )}
    </main>
  )
}
