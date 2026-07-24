import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as R from 'ramda';
import { DownloadRecord, DownloadStats } from '../interfaces/DownloadRecord';
import MediaType from '../enums/MediaType';
import { createTauriFileStorage } from './persist/tauri-file-storage';

export interface DownloadHistoryStore {
  /** mediaId -> DownloadRecord 的映射 */
  records: Record<string, DownloadRecord>;

  /** 添加一条下载记录 */
  addRecord: (record: DownloadRecord) => void;

  /** 批量添加下载记录 */
  addRecords: (records: DownloadRecord[]) => void;

  /** 检查 mediaId 是否已下载过 */
  hasMedia: (mediaId: string) => boolean;

  /** 按用户 ID 查询下载记录 */
  getRecordsByUser: (userId: string) => DownloadRecord[];

  /** 按来源查询 */
  getRecordsBySource: (source: string) => DownloadRecord[];

  /** 获取统计数据 */
  getStats: () => DownloadStats;

  /** 获取所有记录（按时间倒序） */
  getAllRecords: () => DownloadRecord[];

  /** 获取记录总数 */
  getTotalCount: () => number;

  /** 清空全部历史 */
  clearHistory: () => void;
}

export const useDownloadHistoryStore = create(
  persist<DownloadHistoryStore>(
    (set, get) => ({
      records: {},

      addRecord: (record) => {
        set({
          records: {
            ...get().records,
            [record.mediaId]: record,
          },
        });
      },

      addRecords: (records) => {
        const merged = { ...get().records };
        for (const r of records) {
          merged[r.mediaId] = r;
        }
        set({ records: merged });
      },

      hasMedia: (mediaId) => {
        return mediaId in get().records;
      },

      getRecordsByUser: (userId) => {
        return R.pipe(
          R.values,
          R.filter<DownloadRecord>((r) => r.userId === userId),
          R.sortBy(R.prop('downloadedAt')),
        )(get().records);
      },

      getRecordsBySource: (source) => {
        return R.pipe(
          R.values,
          R.filter<DownloadRecord>((r) => r.source === source),
          R.sortBy(R.prop('downloadedAt')),
        )(get().records);
      },

      getStats: () => {
        const allRecords = R.values(get().records);
        const totalCount = allRecords.length;
        const totalSize = R.sum(allRecords.map((r) => r.fileSize));

        const byUser: Record<string, number> = {};
        const byType: Record<string, number> = {};
        const bySource: Record<string, number> = {};

        for (const r of allRecords) {
          byUser[r.userScreenName] = (byUser[r.userScreenName] || 0) + 1;
          byType[r.mediaType] = (byType[r.mediaType] || 0) + 1;
          bySource[r.source] = (bySource[r.source] || 0) + 1;
        }

        return {
          totalCount,
          totalSize,
          byUser,
          byType: byType as Record<MediaType, number>,
          bySource,
        };
      },

      getAllRecords: () => {
        return (Object.values(get().records) as DownloadRecord[])
          .sort((a, b) => b.downloadedAt - a.downloadedAt);
      },

      getTotalCount: () => R.values(get().records).length,

      clearHistory: () => set({ records: {} }),
    }),
    {
      name: 'download-history',
      storage: createTauriFileStorage(),
      version: 1,
    },
  ),
);
