/** IndexedDB 编辑作品卡片：运行时创建预览 URL，并在删除或卸载时释放资源。 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteLocalArtwork } from '../services/localArtworkStorage'
import type { LocalArtwork } from '../types/localArtwork'

const sourceLabels = {
  generated: 'AI 生成编辑',
  imported: '本地导入编辑',
} as const

const effectLabels = {
  original: '原图',
  grayscale: '黑白',
  gradient: '灰度渐变',
  rain: '雨滴',
  colorRipple: '色彩涟漪',
} as const

interface LocalArtworkCardProps {
  artwork: LocalArtwork
  onDeleted: (id: string) => void
}

export function LocalArtworkCard({ artwork, onDeleted }: LocalArtworkCardProps) {
  const previewUrl = useMemo(() => URL.createObjectURL(artwork.blob), [artwork.blob])
  const [imageFailed, setImageFailed] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl])

  useEffect(() => {
    if (isConfirming) {
      confirmButtonRef.current?.focus()
    }
  }, [isConfirming])

  const handleDownload = () => {
    const downloadUrl = URL.createObjectURL(artwork.blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${artwork.name}.png`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
  }

  /** 新窗口使用独立 Blob URL，避免卡片预览 URL 在列表刷新或卸载后失效。 */
  const handleOpenInNewWindow = () => {
    const previewWindow = window.open('', '_blank')
    if (!previewWindow) {
      setError('无法打开新窗口，请检查浏览器是否拦截了弹窗')
      return
    }

    const viewUrl = URL.createObjectURL(artwork.blob)
    previewWindow.opener = null
    previewWindow.location.replace(viewUrl)
    window.setTimeout(() => URL.revokeObjectURL(viewUrl), 60_000)
  }

  const handleDelete = async () => {
    if (isDeleting) return

    setIsDeleting(true)
    setError(null)
    try {
      await deleteLocalArtwork(artwork.id)
      onDeleted(artwork.id)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '删除本地作品失败，请稍后重试')
      setIsDeleting(false)
    }
  }

  return (
    <article className="library-card local-artwork-card">
      <div className="library-image-wrap">
        {imageFailed ? (
          <div className="library-image-placeholder">本地作品预览加载失败</div>
        ) : (
          <img src={previewUrl} alt={artwork.name} onError={() => setImageFailed(true)} />
        )}
        <span className="image-kind-label local-artwork-badge">本地作品</span>
      </div>
      <div className="library-card-content">
        <h3 className="local-artwork-name">{artwork.name}</h3>
        <p className="local-artwork-source">{sourceLabels[artwork.sourceType]}</p>
        <dl className="library-metadata local-artwork-metadata">
          <div><dt>效果</dt><dd>{effectLabels[artwork.effectMode]}</dd></div>
          <div><dt>保存时间</dt><dd>{new Date(artwork.createdAt).toLocaleString('zh-CN')}</dd></div>
        </dl>
        <div className="library-card-actions local-artwork-actions">
          <button type="button" className="image-action-button" onClick={handleDownload}>下载</button>
          <button type="button" className="image-action-button" onClick={handleOpenInNewWindow}>新窗口查看</button>
          <Link className="image-action-button image-action-link" to={`/editor/local-artwork-${artwork.id}/0`}>进入编辑</Link>
          <button type="button" className="delete-image-button" onClick={() => setIsConfirming(true)} disabled={isDeleting}>
            {isDeleting ? '删除中...' : '删除'}
          </button>
        </div>
        {error && <p className="library-card-error" role="alert">{error}</p>}
      </div>
      {isConfirming && (
        <div className="local-artwork-dialog-backdrop" role="presentation" onMouseDown={() => !isDeleting && setIsConfirming(false)}>
          <section className="local-artwork-dialog" role="dialog" aria-modal="true" aria-labelledby={`delete-local-artwork-${artwork.id}`} onMouseDown={(event) => event.stopPropagation()}>
            <h3 id={`delete-local-artwork-${artwork.id}`}>删除这张本地作品？</h3>
            <p>删除后将无法恢复。</p>
            <div className="local-artwork-dialog-actions">
              <button type="button" onClick={() => setIsConfirming(false)} disabled={isDeleting}>取消</button>
              <button ref={confirmButtonRef} type="button" className="delete-image-button" onClick={() => void handleDelete()} disabled={isDeleting}>
                {isDeleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </section>
        </div>
      )}
    </article>
  )
}
