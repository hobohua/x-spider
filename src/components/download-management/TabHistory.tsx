/* eslint-disable react/prop-types */
import React, { useMemo, useState } from 'react';
import { Table, Tag, Button, Space, Tooltip, Statistic, Card, Row, Col, Empty } from 'antd';
import {
  ClearOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  GithubOutlined,
  DownloadOutlined,
  HeartOutlined,
  BookOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useDownloadHistoryStore } from '../../stores/download-history';
import { DownloadRecord } from '../../interfaces/DownloadRecord';
import MediaType from '../../enums/MediaType';

const mediaTypeIcon = (type: MediaType) => {
  switch (type) {
    case MediaType.Photo:
      return <PictureOutlined />;
    case MediaType.Video:
      return <VideoCameraOutlined />;
    case MediaType.Gif:
      return <GithubOutlined />;
    default:
      return <FileTextOutlined />;
  }
};

const mediaTypeColor = (type: MediaType) => {
  switch (type) {
    case MediaType.Photo:
      return 'blue';
    case MediaType.Video:
      return 'red';
    case MediaType.Gif:
      return 'purple';
    default:
      return 'default';
  }
};

const sourceLabel: Record<string, { text: string; icon: React.ReactNode }> = {
  post: { text: '帖子', icon: <DownloadOutlined /> },
  like: { text: '点赞', icon: <HeartOutlined /> },
  bookmark: { text: '收藏', icon: <BookOutlined /> },
  media: { text: '媒体', icon: <PictureOutlined /> },
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

export const TabHistory: React.FC = () => {
  const {
    records,
    clearHistory,
    getAllRecords,
    getStats,
    getTotalCount,
  } = useDownloadHistoryStore();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const allRecords = useMemo(() => getAllRecords(), [records]);
  const stats = useMemo(() => getStats(), [records]);
  const totalCount = useMemo(() => getTotalCount(), [records]);

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <Empty description="暂无下载历史">
          <p className="text-gray-400 text-sm mt-2">
            下载完成后的媒体会自动记录到这里，方便去重和查看。
          </p>
        </Empty>
      </div>
    );
  }

  const columns = [
    {
      title: '媒体 ID',
      dataIndex: 'mediaId',
      key: 'mediaId',
      width: 100,
      ellipsis: true,
      render: (id: string) => (
        <Tooltip title={id}>
          <span className="font-mono text-xs">{id.slice(0, 12)}...</span>
        </Tooltip>
      ),
    },
    {
      title: '用户',
      dataIndex: 'userScreenName',
      key: 'userScreenName',
      width: 120,
      render: (name: string) => <span>@{name}</span>,
    },
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
    },
    {
      title: '类型',
      dataIndex: 'mediaType',
      key: 'mediaType',
      width: 80,
      render: (type: MediaType) => (
        <Tag icon={mediaTypeIcon(type)} color={mediaTypeColor(type)}>
          {type === MediaType.Photo ? '图片' : type === MediaType.Video ? '视频' : 'GIF'}
        </Tag>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 80,
      render: (source: string) => {
        const s = sourceLabel[source] || { text: source, icon: null };
        return (
          <Tag>
            {s.icon}
            <span className="ml-1">{s.text}</span>
          </Tag>
        );
      },
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 100,
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '下载时间',
      dataIndex: 'downloadedAt',
      key: 'downloadedAt',
      width: 160,
      render: (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm:ss'),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 统计卡片 */}
      <Row gutter={16} className="mb-4 shrink-0">
        <Col span={6}>
          <Card size="small">
            <Statistic title="总计下载" value={stats.totalCount} suffix="个文件" />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="总大小"
              value={formatFileSize(stats.totalSize)}
              valueStyle={{ fontSize: '18px' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="图片 / 视频 / GIF"
              value={`${stats.byType[MediaType.Photo] || 0} / ${stats.byType[MediaType.Video] || 0} / ${stats.byType[MediaType.Gif] || 0}`}
              valueStyle={{ fontSize: '14px' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="涉及用户"
              value={Object.keys(stats.byUser).length}
              suffix="人"
            />
          </Card>
        </Col>
      </Row>

      {/* 操作栏 */}
      <div className="mb-2 shrink-0">
        <Space>
          {selectedRowKeys.length > 0 && (
            <span className="text-sm text-gray-500">
              已选 {selectedRowKeys.length} 项
            </span>
          )}
          <Button
            danger
            icon={<ClearOutlined />}
            size="small"
            onClick={() => {
              clearHistory();
              setSelectedRowKeys([]);
            }}
          >
            清空全部历史
          </Button>
        </Space>
      </div>

      {/* 表格 */}
      <div className="grow overflow-auto">
        <Table<DownloadRecord>
          rowKey="mediaId"
          dataSource={allRecords}
          columns={columns}
          size="small"
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ y: 'calc(100vh - 380px)' }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
        />
      </div>
    </div>
  );
};
