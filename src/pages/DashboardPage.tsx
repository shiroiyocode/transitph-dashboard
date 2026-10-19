import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { getDashboardStats, subscribeDashboardStats } from '@/lib/firestoreApi'
import {
  Activity, CheckCircle, TrendingDown, TrendingUp, Users, XCircle,
} from 'lucide-react'
import type { DashboardActivitySeverity, DashboardActivityType, DashboardStats } from '@/types/models'

const buildCards = (data: any) => [
  { label: 'Total Users',     value: data.totalUsers,      icon: Users,       bg: 'rgba(46,124,246,0.10)', color: '#2E7CF6' },
  { label: 'Active Users',    value: data.activeUsers,     icon: Activity,    bg: 'rgba(62,201,122,0.10)', color: '#3EC97A' },
  { label: 'Restricted Users', value: data.restrictedUsers, icon: XCircle,     bg: 'rgba(255,181,71,0.16)', color: '#C17C00' },
  { label: 'Banned Users',    value: data.bannedUsers,     icon: XCircle,     bg: 'rgba(224,92,106,0.10)', color: '#E05C6A' },
  { label: 'Pending Routes',  value: data.routes.pending,  icon: TrendingDown, bg: 'rgba(255,181,71,0.12)', color: '#FFB547' },
  { label: 'Approved Routes', value: data.routes.approved, icon: CheckCircle, bg: 'rgba(62,201,122,0.10)', color: '#3EC97A' },
  { label: 'Rejected Routes', value: data.routes.rejected, icon: TrendingUp,  bg: 'rgba(224,92,106,0.10)', color: '#E05C6A' },
]

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid #E8F0FC', borderRadius: 10,
      padding: '8px 14px', boxShadow: '0 8px 24px rgba(15,29,53,0.09)', fontSize: '0.82rem',
    }}>
      <div style={{ color: '#7A92B2', marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: 700, color: '#2E7CF6' }}>{payload[0].value}</div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, bg, color }: {
  label: string; value: number; icon: React.ElementType;
  bg: string; color: string
}) {
  return (
    <div
      style={{
        background: '#fff', border: '1px solid #E8F0FC', borderRadius: 16,
        padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: '0 1px 3px rgba(15,29,53,0.06)',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = '0 4px 14px rgba(15,29,53,0.10)'
        el.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = '0 1px 3px rgba(15,29,53,0.06)'
        el.style.transform = 'translateY(0)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{
          fontSize: '0.72rem', fontWeight: 700, color: '#7A92B2',
          textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.3,
        }}>
          {label}
        </span>
        <div style={{
          width: 36, height: 36, minWidth: 36, borderRadius: 10,
          background: bg, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={17} color={color} />
        </div>
      </div>
      <div style={{
        fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.04em',
        color: '#0F1D35', lineHeight: 1,
      }}>
        {value ?? 0}
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E8F0FC', borderRadius: 16,
      padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
      boxShadow: '0 1px 3px rgba(15,29,53,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ width: 88, height: 10 }} />
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
      </div>
      <div className="skeleton" style={{ width: 60, height: 30 }} />
    </div>
  )
}

function ChartCard({ title, subtitle, children }: {
  title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E8F0FC', borderRadius: 16,
      padding: 20, boxShadow: '0 1px 3px rgba(15,29,53,0.06)',
    }}>
      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0F1D35', marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: '0.76rem', color: '#7A92B2', marginBottom: 18 }}>{subtitle}</div>
      {children}
    </div>
  )
}

export function DashboardPage() {
  const { data: initialData, isLoading, error } = useQuery({ queryKey: ['dashboard-stats'], queryFn: getDashboardStats })
  const [liveData, setLiveData] = useState<DashboardStats | undefined>(undefined)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [isLiveConnected, setIsLiveConnected] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeDashboardStats(
      (stats) => {
        setLiveData(stats)
        setStreamError(null)
        setIsLiveConnected(true)
      },
      (err) => {
        setStreamError(err.message)
        setIsLiveConnected(false)
      },
    )

    return unsubscribe
  }, [])

  const data = liveData ?? initialData

  const getTypeLabel = (type: DashboardActivityType) => {
    if (type === 'signup') return 'Signup'
    if (type === 'route') return 'Route'
    if (type === 'post') return 'Post'
    return 'Report'
  }

  const getSeverityColors = (severity: DashboardActivitySeverity) => {
    if (severity === 'critical') {
      return { dot: '#E05C6A', pillBg: 'rgba(224,92,106,0.10)', pillText: '#B63C4A' }
    }
    if (severity === 'warning') {
      return { dot: '#FFB547', pillBg: 'rgba(255,181,71,0.15)', pillText: '#A36A07' }
    }
    return { dot: '#2E7CF6', pillBg: 'rgba(46,124,246,0.10)', pillText: '#1E63C7' }
  }

  if (isLoading && !data) {
    return (
      <div style={{ display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skeleton" style={{ width: 110, height: 22 }} />
          <div className="skeleton" style={{ width: 260, height: 13 }} />
        </div>
        <div className="grid-stats">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #E8F0FC', borderRadius: 16, padding: 20 }}>
              <div className="skeleton" style={{ width: 130, height: 15, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: 200, height: 11, marginBottom: 18 }} />
              <div className="skeleton" style={{ height: 220, borderRadius: 10 }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if ((error && !data) || !data) {
    return (
      <div className="state-banner error">
        Could not load dashboard data. {(error as Error | undefined)?.message ?? 'Check Firestore permissions.'}
      </div>
    )
  }

  const cards = buildCards(data)

  return (
    <div style={{ display: 'grid', gap: 20 }} className="stagger">

      <div className="page-head">
        <div>
          <div className="page-head-title">Dashboard</div>
          <div className="page-head-subtitle">Platform-wide summary and growth metrics</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 999,
            border: isLiveConnected ? '1px solid rgba(62,201,122,0.35)' : '1px solid rgba(255,181,71,0.35)',
            background: isLiveConnected ? 'rgba(62,201,122,0.10)' : 'rgba(255,181,71,0.12)',
            color: isLiveConnected ? '#2F8D5B' : '#A36A07',
            fontSize: '0.74rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}>
            <span style={{
              width: 7,
              height: 7,
              minWidth: 7,
              borderRadius: '50%',
              background: isLiveConnected ? '#3EC97A' : '#FFB547',
            }} />
            {isLiveConnected ? 'Live' : 'Live reconnecting'}
          </span>
          {streamError && (
            <span style={{ fontSize: '0.72rem', color: '#A36A07' }}>
              {streamError}
            </span>
          )}
        </div>
      </div>

      <div className="grid-stats">
        {cards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
        <ChartCard title="User Growth" subtitle="Registered users over time">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.userGrowth} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8F0FC" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#A8BFDA' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#A8BFDA' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone" dataKey="count" stroke="#2E7CF6" strokeWidth={2.5}
                dot={{ r: 3, fill: '#2E7CF6', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#2E7CF6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Routes Contributed" subtitle="New routes submitted per week">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.routesPerWeek} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8F0FC" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#A8BFDA' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#A8BFDA' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" fill="#2E7CF6" radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{
        background: '#fff', border: '1px solid #E8F0FC', borderRadius: 16,
        padding: 20, boxShadow: '0 1px 3px rgba(15,29,53,0.06)',
      }}>
        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0F1D35', marginBottom: 16 }}>
          Recent Activity
        </div>
        {data.recentActivity.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 0', color: '#A8BFDA', fontSize: '0.82rem' }}>
            No recent activity to display
          </div>
        ) : (
          data.recentActivity.map((item, idx) => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0',
              borderBottom: idx < data.recentActivity.length - 1 ? '1px solid #E8F0FC' : 'none',
            }}>
              <div style={{
                width: 8,
                height: 8,
                minWidth: 8,
                borderRadius: '50%',
                background: getSeverityColors(item.severity).dot,
                marginTop: 5,
                flexShrink: 0,
              }} />
              <div style={{ display: 'grid', gap: 4, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: getSeverityColors(item.severity).pillBg,
                    color: getSeverityColors(item.severity).pillText,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                  }}>
                    {getTypeLabel(item.type)}
                  </span>
                  {item.severity !== 'info' && (
                    <span style={{ fontSize: '0.69rem', color: getSeverityColors(item.severity).pillText, fontWeight: 700 }}>
                      {item.severity.toUpperCase()}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.83rem', color: '#0F1D35', lineHeight: 1.5 }}>
                  {item.description}
                </span>
              </div>
              <span style={{ fontSize: '0.74rem', color: '#A8BFDA', whiteSpace: 'nowrap', marginTop: 1 }}>
                {item.time}
              </span>
            </div>
          ))
        )}
      </div>

    </div>
  )
}
