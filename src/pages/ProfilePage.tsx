/** 个人中心：加载当前登录用户的生成任务和图片汇总，不请求完整图片列表。 */
import { useEffect, useState } from 'react'
import { createApiUrl, createAuthHeaders } from '../config/api'
import { useAuth } from '../contexts/authStore'
import type { ActivityListResponse, UserActivity } from '../types/activity'
import type {
  GenerationSummary,
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
    return value.message
  }

  return `无法加载个人数据（HTTP ${status}）`
}

const isActivityListResponse = (value: unknown): value is ActivityListResponse =>
  typeof value === 'object'
  && value !== null
  && 'success' in value
  && value.success === true
  && 'data' in value
  && typeof value.data === 'object'
  && value.data !== null
  && 'items' in value.data
  && Array.isArray(value.data.items)

const activityText: Record<UserActivity['action'], string> = {
  generation_created: '创建了图片生成任务',
  image_edited_saved: '保存了编辑作品',
  image_deleted: '删除了一张图片',
  generation_deleted: '删除了失败任务',
}

const formatActivityTime = (value: string): string => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '时间未知'
    : date.toLocaleString('zh-CN', { hour12: false })
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
  const [activities, setActivities] = useState<UserActivity[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadSummary = async () => {
      try {
        const [summaryResponse, activityResponse] = await Promise.all([
          fetch(createApiUrl('/api/generations/summary'), {
            headers: createAuthHeaders(),
            credentials: 'include',
          }),
          fetch(createApiUrl('/api/activity-logs'), {
            headers: createAuthHeaders(),
            credentials: 'include',
          }),
        ])
        const summaryData: unknown = await summaryResponse.json().catch(() => null)
        const activityData: unknown = await activityResponse.json().catch(() => null)
        if (!summaryResponse.ok || !isGenerationSummaryResponse(summaryData)) {
          throw new Error(getSummaryErrorMessage(summaryData, summaryResponse.status))
        }
        if (!activityResponse.ok || !isActivityListResponse(activityData)) {
          throw new Error(getSummaryErrorMessage(activityData, activityResponse.status))
        }

        if (isMounted) {
          setSummary(summaryData.data)
          setActivities(activityData.data.items)
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
      ) : !summary || !activities ? (
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
          <section className="profile-activity-list" aria-labelledby="recent-activities-heading">
            <div className="profile-activity-list-heading">
              <div>
                <p className="profile-eyebrow">最近活动</p>
                <h3 id="recent-activities-heading">创作操作记录</h3>
              </div>
              <span>最近 8 条</span>
            </div>
            {activities.length === 0 ? (
              <p className="profile-activity-empty">还没有操作记录，创建第一条生成任务后会显示在这里。</p>
            ) : (
              <ol>
                {activities.map((activity) => (
                  <li key={activity.id}>
                    <div>
                      <strong>{activityText[activity.action]}</strong>
                      {activity.resourceLabel && <span>{activity.resourceLabel}</span>}
                    </div>
                    <time dateTime={activity.createdAt}>{formatActivityTime(activity.createdAt)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </main>
  )
}
