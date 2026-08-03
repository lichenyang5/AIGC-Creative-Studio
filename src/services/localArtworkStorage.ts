/** IndexedDB 数据访问层：持久化 Blob 与元数据，不持久化 Object URL 或 Base64。 */
import type { LocalArtwork } from '../types/localArtwork'
import type { ImportedAsset } from '../types/importedAsset'

const DATABASE_NAME = 'aigc-creative-studio'
const DATABASE_VERSION = 2
const ARTWORK_STORE_NAME = 'local-artworks'
const IMPORTED_ASSET_STORE_NAME = 'imported-assets'

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器不支持 IndexedDB'))
      return
    }

    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    } catch (error: unknown) {
      reject(new Error(`本地数据库打开失败：${getErrorMessage(error, '未知错误')}`))
      return
    }

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(ARTWORK_STORE_NAME)) {
        database.createObjectStore(ARTWORK_STORE_NAME, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(IMPORTED_ASSET_STORE_NAME)) {
        database.createObjectStore(IMPORTED_ASSET_STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onerror = () => {
      reject(new Error(`本地数据库打开失败：${getErrorMessage(request.error, '未知错误')}`))
    }
    request.onblocked = () => {
      reject(new Error('本地数据库被其他页面占用，请关闭其他页面后重试'))
    }
    request.onsuccess = () => resolve(request.result)
  })

const withStore = <Result>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<Result>,
  failureMessage: string,
): Promise<Result> =>
  new Promise((resolve, reject) => {
    void openDatabase()
      .then((database) => {
        let transaction: IDBTransaction
        let request: IDBRequest<Result>

        try {
          transaction = database.transaction(storeName, mode)
          request = action(transaction.objectStore(storeName))
        } catch (error: unknown) {
          database.close()
          reject(new Error(`${failureMessage}：${getErrorMessage(error, '未知错误')}`))
          return
        }

        request.onerror = () => {
          reject(new Error(`${failureMessage}：${getErrorMessage(request.error, '未知错误')}`))
        }
        transaction.onerror = () => {
          reject(new Error(`${failureMessage}：${getErrorMessage(transaction.error, '未知错误')}`))
        }
        transaction.onabort = () => {
          reject(new Error(`${failureMessage}：事务已中止`))
        }
        transaction.oncomplete = () => {
          database.close()
          resolve(request.result)
        }
      })
      .catch(reject)
  })

export const saveLocalArtwork = (artwork: LocalArtwork): Promise<void> =>
  withStore(ARTWORK_STORE_NAME, 'readwrite', (store) => store.put(artwork), '本地作品保存失败').then(() => undefined)

export const getLocalArtworks = async (): Promise<LocalArtwork[]> => {
  const artworks = await withStore<LocalArtwork[]>(
    ARTWORK_STORE_NAME,
    'readonly',
    (store) => store.getAll(),
    '本地作品读取失败',
  )

  return [...artworks].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  )
}

export const getLocalArtwork = (id: string): Promise<LocalArtwork | undefined> =>
  withStore<LocalArtwork | undefined>(
    ARTWORK_STORE_NAME,
    'readonly',
    (store) => store.get(id),
    '本地作品读取失败',
  )

export const deleteLocalArtwork = (id: string): Promise<void> =>
  withStore(ARTWORK_STORE_NAME, 'readwrite', (store) => store.delete(id), '本地作品删除失败').then(() => undefined)

export const saveImportedAsset = (asset: ImportedAsset): Promise<void> =>
  withStore(IMPORTED_ASSET_STORE_NAME, 'readwrite', (store) => store.put(asset), '导入图片保存失败').then(() => undefined)

export const getImportedAssets = async (): Promise<ImportedAsset[]> => {
  const assets = await withStore<ImportedAsset[]>(
    IMPORTED_ASSET_STORE_NAME,
    'readonly',
    (store) => store.getAll(),
    '导入图片读取失败',
  )

  return [...assets].sort(
    (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  )
}

export const getImportedAsset = (id: string): Promise<ImportedAsset | undefined> =>
  withStore<ImportedAsset | undefined>(
    IMPORTED_ASSET_STORE_NAME,
    'readonly',
    (store) => store.get(id),
    '导入图片读取失败',
  )

export const deleteImportedAsset = (id: string): Promise<void> =>
  withStore(IMPORTED_ASSET_STORE_NAME, 'readwrite', (store) => store.delete(id), '导入图片删除失败').then(() => undefined)

export const localArtworkStorageConfig = {
  DATABASE_NAME,
  DATABASE_VERSION,
  ARTWORK_STORE_NAME,
  IMPORTED_ASSET_STORE_NAME,
} as const
