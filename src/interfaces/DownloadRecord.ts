import MediaType from '../enums/MediaType';

/** 一次已完成的下载记录 */
export interface DownloadRecord {
  /** Twitter 媒体 ID（唯一主键） */
  mediaId: string;
  /** 所属推文 ID */
  postId: string;
  /** 推文作者 ID */
  userId: string;
  /** 推文用户名 */
  userScreenName: string;
  /** 实际文件名 */
  fileName: string;
  /** 完整路径 */
  filePath: string;
  /** 文件大小 */
  fileSize: number;
  /** 下载完成时间戳 */
  downloadedAt: number;
  /** 媒体类型 */
  mediaType: MediaType;
  /** 下载来源 */
  source: 'post' | 'like' | 'bookmark' | 'media';
}

/** 下载统计 */
export interface DownloadStats {
  totalCount: number;
  totalSize: number;
  byUser: Record<string, number>;
  byType: Record<MediaType, number>;
  bySource: Record<string, number>;
}
