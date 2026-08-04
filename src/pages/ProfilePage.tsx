/** 个人中心：加载当前登录用户的生成任务和图片汇总，不请求完整图片列表。 */
import { useEffect, useState } from 'react'
import { createApiUrl, createAuthHeaders } from '../config/api'
import { useAuth } from '../contexts/authStore'
import type {
  GenerationSummary,
  GenerationSummaryErrorResponse,
  GenerationSummaryResponse,
} from '../types/generationApi'

const isGenerationSummaryResponse = (value: unknown): value is GenerationSummaryResponse => {
  if (typeof value !== 'object' || value === null || !('success' in value) || value.success !== true || !('data' in value)) {
    return false
  }

  const { data } = value
  return typeof data === 'object'
    && data !== null
    && 'totalTasks' in data
    && typeof data.totalTasks === 'number'
    && 'succeededTasks' in data
    && typeof data.succeededTasks === 'number'
    && 'failedTasks' in data
    && typeof data.failedTasks === 'number'
    && 'pendingTasks' in data
    && typeof data.pendingTasks === 'number'
    && 'processingTasks' in data
    && typeof data.processingTasks === 'number'
    && 'imageCount' in data
    && typeof data.imageCount === 'number'
}

const getSummaryErrorMessage = (value: unknown, status: number): string => {
  if (
    typeof value === 'object'
    && value !== null
    && 'message' in value
    && typeof value.message === 'string'
  ) {
    return (value as GenerationSummaryErrorResponse).message
  }

  return `无法加载个人数据（HTTP ${status}）`
}

interface StatisticCardProps {
  label: string
  value: number
  tone: 'default' | 'success' | 'danger' | 'accent'
}

function StatisticCard({ label, value, tone }: StatisticCardProps) {
  return (
    <article className={`profile-stat-card is-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

export function ProfilePage() {
  const { user } = useAuth()
  const [summary, setSummary] = useState<GenerationSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadSummary = async () => {
      try {
        const response = await fetch(createApiUrl('/api/generations/summary'), {
          headers: createAuthHeaders(),
          credentials: 'include',
        })
        const data: unknown = await response.json().catch(() => null)
        if (!response.ok || !isGenerationSummaryResponse(data)) {
          throw new Error(getSummaryErrorMessage(data, response.status))
        }

        if (isMounted) {
          setSummary(data.data)
        }
      } catch (cause: unknown) {
        if (isMounted) {
          setError(cause instanceof Error ? cause.message : '无法加载个人数据')
        }
      }
    }

    void loadSummary()
    return () => {
      isMounted = false
    }
  }, [])

  return (
    <main className="profile-page">
      <section className="profile-heading">
        <div>
          <p className="profile-eyebrow">个人中心</p>
          <h2>{user?.displayName ?? '当前用户'}</h2>
          <p>{user?.email ?? '正在读取账号信息'}</p>
        </div>
      </section>

      {error ? (
        <section className="profile-state" role="alert">
          <h3>数据加载失败</h3>
          <p>{error}</p>
        </section>
      ) : !summary ? (
        <section className="profile-state" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <p>正在加载个人数据...</p>
        </section>
      ) : (
        <>
          <section className="profile-stat-grid" aria-label="创作数据概览">
            <StatisticCard label="生成任务" value={summary.totalTasks} tone="default" />
            <StatisticCard label="生成完成" value={summary.succeededTasks} tone="success" />
            <StatisticCard label="生成失败" value={summary.failedTasks} tone="danger" />
            <StatisticCard label="图片作品" value={summary.imageCount} tone="accent" />
          </section>
          <section className="profile-activity-note">
            <h3>任务状态</h3>
            <p>等待处理 {summary.pendingTasks} 个，生成中 {summary.processingTasks} 个。</p>
          </section>
        </>
      )}
    </main>
  )
}
