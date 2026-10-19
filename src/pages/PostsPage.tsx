import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deletePost, getFeedback, getPosts, updateFeedbackStatus, updatePostStatus } from '@/lib/firestoreApi'
import { useAuth } from '@/hooks/useAuth'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Flag, MessageSquare } from 'lucide-react'
import type { PostItem } from '@/types/models'

function StatusBadge({ status }: { status?: string }) {
  if (status === 'approved') return <span className="badge badge-approved"><span className="badge-dot" />Approved</span>
  if (status === 'rejected') return <span className="badge badge-rejected"><span className="badge-dot" />Removed</span>
  if (status === 'flagged') return <span className="badge badge-flagged"><span className="badge-dot" />Flagged</span>
  return <span className="badge badge-pending"><span className="badge-dot" />Pending</span>
}

export function PostsPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { data: posts = [], isLoading, isError, error } = useQuery({ queryKey: ['posts'], queryFn: getPosts })
  const { data: feedback = [] } = useQuery({ queryKey: ['feedback'], queryFn: getFeedback })
  const [preview, setPreview] = useState<PostItem | null>(null)
  const [activeTab, setActiveTab] = useState<'reported' | 'all'>('reported')

  const pendingReportsByPost = useMemo(() => {
    const map = new Map<string, string[]>()
    feedback
      .filter((f) => f.type === 'report' && f.status === 'pending' && f.postId)
      .forEach((f) => {
        const arr = map.get(f.postId!) ?? []
        arr.push(f.reason ?? f.message ?? '')
        map.set(f.postId!, arr)
      })
    return map
  }, [feedback])

  const reportedPosts = useMemo(() => {
    const pendingPostIds = new Set(pendingReportsByPost.keys())
    return posts.filter((p) => pendingPostIds.has(p.id))
  }, [posts, pendingReportsByPost])

  const list = activeTab === 'reported' ? reportedPosts : posts

  const postIds = useMemo(() => new Set(posts.map((p) => p.id)), [posts])

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['posts'] })
    await qc.invalidateQueries({ queryKey: ['feedback'] })
  }

  const removePost = useMutation({
    mutationFn: async ({ postId, feedbackIds }: { postId: string; feedbackIds: string[] }) => {
      if (feedbackIds.length > 0) {
        await Promise.all(feedbackIds.map((id) => updateFeedbackStatus(id, 'dismissed')))
      }
      await deletePost(postId)
    },
    onSuccess: refresh,
  })
  const dismissReport = useMutation({
    mutationFn: async ({ postId, feedbackIds }: { postId: string; feedbackIds: string[] }) => {
      await updatePostStatus(postId, 'approved', user?.uid ?? '')
      await Promise.all(feedbackIds.map((id) => updateFeedbackStatus(id, 'dismissed')))
    },
    onSuccess: refresh,
  })

  const pendingReportCount = feedback.filter(
    (f) =>
      f.type === 'report' &&
      f.status === 'pending' &&
      Boolean(f.postId) &&
      postIds.has(f.postId!),
  ).length

  return (
    <div style={{ display: 'grid', gap: 20 }} className="stagger">
      <div className="page-head">
        <div>
          <div className="page-head-title">Post Moderation</div>
          <div className="page-head-subtitle">Review community posts, reports, and content visibility</div>
        </div>
        {pendingReportCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--danger-soft)', border: '1px solid rgba(224,92,106,0.2)', borderRadius: 10 }}>
            <Flag size={14} color="var(--danger)" />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--danger)' }}>
              {pendingReportCount} pending report{pendingReportCount > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      <div className="toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'reported' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('reported')}
          >
            Reported ({reportedPosts.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('all')}
          >
            All Posts ({posts.length})
          </button>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {list.length} post{list.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isLoading ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Author</th>
                <th>Category</th>
                <th>Content</th>
                {activeTab === 'all' ? <th>Status</th> : null}
                <th>Reports</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: activeTab === 'all' ? 6 : 5 }).map((_, j) => <td key={j}><div className="skeleton" /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : isError ? (
        <div className="state-banner error">
          Failed to load posts. {(error as Error | undefined)?.message ?? 'Check permissions.'}
        </div>
      ) : !list.length ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-icon"><MessageSquare size={22} /></div>
            <div className="empty-title">{activeTab === 'reported' ? 'No reported posts' : 'No posts found'}</div>
            <div className="empty-sub">
              {activeTab === 'reported'
                ? 'There are no posts with pending reports right now'
                : 'There are no current posts to display'}
            </div>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Author</th>
                <th>Category</th>
                <th>Content Preview</th>
                {activeTab === 'all' ? <th>Status</th> : null}
                <th>Reports</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const reasons = pendingReportsByPost.get(p.id) ?? []
                const pendingReports = feedback.filter(
                  (f) => f.type === 'report' && f.postId === p.id && f.status === 'pending',
                )
                return (
                  <tr key={p.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{p.userName || p.userEmail || 'Anonymous'}</span>
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 5, fontSize: '0.73rem', fontWeight: 700,
                        background: 'var(--accent-soft)', color: 'var(--accent)',
                      }}>
                        {p.category}
                      </span>
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.content.slice(0, 90)}{p.content.length > 90 ? '...' : ''}
                      </span>
                    </td>
                    {activeTab === 'all' ? (
                      <td>
                        <StatusBadge status={p.moderationStatus} />
                      </td>
                    ) : null}
                    <td>
                      {reasons.length > 0 ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 600 }}>
                          <Flag size={12} />{reasons.length} report{reasons.length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                      )}
                    </td>
                    <td>
                      <div className="action-group">
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => setPreview(p)}
                        >
                          View
                        </button>

                        {activeTab === 'reported' && reasons.length > 0 ? (
                          <>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => {
                                if (confirm('Remove this reported post?')) {
                                  removePost.mutate({
                                    postId: p.id,
                                    feedbackIds: pendingReports.map((f) => f.id),
                                  })
                                }
                              }}
                            >
                              Remove
                            </button>
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => dismissReport.mutate({ postId: p.id, feedbackIds: pendingReports.map((f) => f.id) })}
                            >
                              Dismiss
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Post Details</DialogTitle></DialogHeader>
          {preview && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0 14px', borderBottom: '1px solid var(--border-soft)', marginBottom: 4 }}>
                <span style={{ fontWeight: 700 }}>{preview.userName || preview.userEmail || 'Anonymous'}</span>
                <StatusBadge status={preview.moderationStatus} />
              </div>
              {[
                ['Category', preview.category],
                ['Content', preview.content],
                ['Images', (preview.images ?? []).join(', ') || 'No images attached'],
              ].map(([label, value]) => (
                <div key={String(label)} className="dialog-field">
                  <span className="dialog-field-label">{label}</span>
                  <span className="dialog-field-value">{value}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
