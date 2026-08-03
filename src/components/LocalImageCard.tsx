/** IndexedDB 导入素材卡片：保留原始文件信息，提供编辑、下载和受确认保护的删除操作。 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteImportedAsset } from '../services/localArtworkStorage'
import type { ImportedAsset } from '../types/importedAsset'

interface LocalImageCardProps {
  asset: ImportedAsset
  onDeleted: (id: string) => void
}

const formatCreatedAt = (createdAt: string): string =>
  new Date(createdAt).toLocaleString('zh-CN')

const formatSize = (size: number): string =>
  size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`

export function LocalImageCard({ asset, onDeleted }: LocalImageCardProps) {
  const previewUrl = useMemo(() => URL.createObjectURL(asset.blob), [asset.blob])
  const [hasImageError, setHasImageError] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl])

  useEffect(() => {
    if (isConfirming) confirmButtonRef.current?.focus()
  }, [isConfirming])

  const handleDownload = () => {
    const downloadUrl = URL.createObjectURL(asset.blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = asset.originalFileName
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
  }

  const handleDelete = async () => {
    if (isDeleting) return
    setIsDeleting(true)
    setError(null)
    try {
      await deleteImportedAsset(asset.id)
      onDeleted(asset.id)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '删除导入图片失败，请稍后重试')
      setIsDeleting(false)
    }
  }

  return (
    <article className="library-card local-image-card">
      <div className="library-image-wrap">
        <span className="image-kind-label">导入素材</span>
        {hasImageError ? (
          <div className="library-image-placeholder" role="img" aria-label="本地图片加载失败">本地图片加载失败</div>
        ) : (
          <img src={previewUrl} alt={`本地导入图片：${asset.originalFileName}`} onError={() => setHasImageError(true)} />
        )}
      </div>
      <div className="library-card-content">
        <p className="library-prompt">{asset.originalFileName}</p>
        <dl className="library-metadata">
          <div><dt>文件类型</dt><dd>{asset.mimeType}</dd></div>
          <div><dt>文件大小</dt><dd>{formatSize(asset.size)}</dd></div>
          <div><dt>导入时间</dt><dd>{formatCreatedAt(asset.createdAt)}</dd></div>
        </dl>
        <div className="library-card-actions">
          <Link className="image-action-button image-action-link" to={`/editor/imported/${asset.id}`}>进入编辑</Link>
          <button type="button" className="image-action-button" onClick={handleDownload}>下载原图</button>
          <button type="button" className="delete-image-button" disabled={isDeleting} onClick={() => setIsConfirming(true)}>{isDeleting ? '删除中...' : '删除'}</button>
        </div>
        {error && <p className="library-card-error" role="alert">{error}</p>}
      </div>
      {isConfirming && (
        <div className="local-artwork-dialog-backdrop" role="presentation" onMouseDown={() => !isDeleting && setIsConfirming(false)}>
          <section className="local-artwork-dialog" role="dialog" aria-modal="true" aria-labelledby={`delete-imported-asset-${asset.id}`} onMouseDown={(event) => event.stopPropagation()}>
            <h3 id={`delete-imported-asset-${asset.id}`}>删除这张导入图片？</h3>
            <p>删除后将无法恢复。</p>
            <div className="local-artwork-dialog-actions">
              <button type="button" disabled={isDeleting} onClick={() => setIsConfirming(false)}>取消</button>
              <button ref={confirmButtonRef} type="button" className="delete-image-button" disabled={isDeleting} onClick={() => void handleDelete()}>{isDeleting ? '删除中...' : '确认删除'}</button>
            </div>
          </section>
        </div>
      )}
    </article>
  )
}
