import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AdminLayout } from '../../components/layout/AdminLayout'
import { Button } from '../../components/ui/Button'
import { adminService } from '../../services/admin.service'
import type { AdminUser, AdminUserFilters } from '../../services/admin.service'

// ── Status badge ──────────────────────────────────────────────────────────────

const statusCls = (status: string | undefined) => {
  if (!status || status === 'ACTIVE') return 'text-[#5a9e6e] bg-[#5a9e6e]/10'
  if (status === 'SUSPENDED')         return 'text-[--color-error] bg-[--color-error]/10'
  return 'text-stone-light bg-white/[0.04]'
}

// ── Confirm action modal ───────────────────────────────────────────────────────

const ConfirmActionModal = ({
  action,
  user,
  onConfirm,
  onCancel,
  loading,
}: {
  action:    'suspend' | 'reinstate'
  user:      AdminUser
  onConfirm: () => void
  onCancel:  () => void
  loading:   boolean
}) => {
  const isSuspend = action === 'suspend'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm px-4">
      <div className="bg-ink-soft border border-gold/20 rounded-sm p-7 w-full max-w-md">
        <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-3">
          Confirm {isSuspend ? 'Suspension' : 'Reinstatement'}
        </p>
        <p className="text-parchment-dim text-sm mb-1">
          {isSuspend ? 'Suspend' : 'Reinstate'} user{' '}
          <span className="font-mono text-parchment">{user.email}</span>?
        </p>
        <p className="text-stone-light text-[0.8rem] mb-6">
          {isSuspend
            ? 'The user will lose access to the platform immediately.'
            : 'The user will regain full access to the platform.'}
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 font-body text-sm font-medium uppercase tracking-[0.04em] px-6 py-[0.7rem] rounded-sm transition-colors duration-150 disabled:opacity-50 ${
              isSuspend
                ? 'bg-[--color-error] hover:bg-[--color-error]/80 text-white'
                : 'bg-[#5a9e6e] hover:bg-[#5a9e6e]/80 text-white'
            }`}
          >
            {loading
              ? (isSuspend ? 'Suspending…' : 'Reinstating…')
              : (isSuspend ? 'Suspend User' : 'Reinstate User')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── User row ──────────────────────────────────────────────────────────────────

const UserRow = ({ user, onSuspend, onReinstate, loading }: {
  user:        AdminUser
  onSuspend:   (user: AdminUser) => void
  onReinstate: (user: AdminUser) => void
  loading:     boolean
}) => (
  <tr className="border-b border-gold/8 hover:bg-gold/[0.02] transition-colors">
    <td className="py-3 px-4 text-[0.82rem] text-parchment font-mono">{user.email}</td>
    <td className="py-3 px-4">
      <span className={`text-[0.72rem] font-medium tracking-[0.1em] uppercase px-2 py-0.5 rounded-sm ${statusCls(user.viewerStatus)}`}>
        {user.viewerStatus ?? 'ACTIVE'}
      </span>
    </td>
    <td className="py-3 px-4 text-[0.78rem] text-stone-light">
      {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
    </td>
    <td className="py-3 px-4 text-right">
      {user.viewerStatus === 'SUSPENDED' ? (
        <button
          onClick={() => onReinstate(user)}
          disabled={loading}
          className="text-[0.75rem] font-medium uppercase tracking-[0.06em] text-[#5a9e6e] hover:text-[#5a9e6e]/80 disabled:opacity-40 transition-colors"
        >
          Reinstate
        </button>
      ) : (
        <button
          onClick={() => onSuspend(user)}
          disabled={loading}
          className="text-[0.75rem] font-medium uppercase tracking-[0.06em] text-[--color-error] hover:text-[--color-error]/80 disabled:opacity-40 transition-colors"
        >
          Suspend
        </button>
      )}
    </td>
  </tr>
)

// ── Users page ────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const qc = useQueryClient()
  const [email,  setEmail]  = useState('')
  const [status, setStatus] = useState('')
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [allUsers, setAllUsers] = useState<AdminUser[]>([])
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ action: 'suspend' | 'reinstate'; user: AdminUser } | null>(null)

  const filters: AdminUserFilters = { limit: 20, ...(email && { email }), ...(status && { status }), ...(cursor && { cursor }) }

  const { data: lastPage, isFetching, error } = useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn:  async () => {
      const res = await adminService.listUsers(filters)
      setAllUsers((prev) => cursor ? [...prev, ...res.users] : res.users)
      return res
    },
    staleTime: 0,
  })

  const onSettled = () => {
    setMutatingId(null)
    setConfirming(null)
    setAllUsers([])
    setCursor(undefined)
    void qc.invalidateQueries({ queryKey: ['admin', 'users'] })
  }

  const suspend = useMutation({
    mutationFn: (userId: string) => adminService.suspendUser(userId),
    onMutate:   (id) => setMutatingId(id),
    onSettled,
  })

  const reinstate = useMutation({
    mutationFn: (userId: string) => adminService.reinstateUser(userId),
    onMutate:   (id) => setMutatingId(id),
    onSettled,
  })

  const handleConfirm = () => {
    if (!confirming) return
    if (confirming.action === 'suspend') suspend.mutate(confirming.user.userId)
    else reinstate.mutate(confirming.user.userId)
  }

  const handleSearch = () => {
    setAllUsers([])
    setCursor(undefined)
  }

  const isMutating = suspend.isPending || reinstate.isPending

  return (
    <AdminLayout title="Users">
      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="flex flex-col gap-1">
          <label className="text-[0.68rem] tracking-[0.16em] uppercase text-stone-light">
            Email prefix
          </label>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@…"
            className="bg-ink-soft border border-gold/20 rounded-sm px-3 py-2 text-[0.85rem] text-parchment placeholder:text-stone-light/50 focus:outline-none focus:border-gold/50 w-56"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[0.68rem] tracking-[0.16em] uppercase text-stone-light">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-ink-soft border border-gold/20 rounded-sm px-3 py-2 text-[0.85rem] text-parchment focus:outline-none focus:border-gold/50 appearance-none cursor-pointer"
          >
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>

        <Button variant="ghost" onClick={handleSearch}>
          Search
        </Button>
      </div>

      {error && (
        <p className="text-[--color-error] text-sm mb-4">Failed to load users.</p>
      )}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="bg-ink-soft border border-gold/10 rounded-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gold/10">
              <th className="py-3 px-4 text-left text-[0.68rem] tracking-[0.16em] uppercase text-stone-light font-medium">Email</th>
              <th className="py-3 px-4 text-left text-[0.68rem] tracking-[0.16em] uppercase text-stone-light font-medium">Status</th>
              <th className="py-3 px-4 text-left text-[0.68rem] tracking-[0.16em] uppercase text-stone-light font-medium">Joined</th>
              <th className="py-3 px-4 text-right text-[0.68rem] tracking-[0.16em] uppercase text-stone-light font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map((u) => (
              <UserRow
                key={u.userId}
                user={u}
                onSuspend={(user) => setConfirming({ action: 'suspend', user })}
                onReinstate={(user) => setConfirming({ action: 'reinstate', user })}
                loading={mutatingId === u.userId}
              />
            ))}
            {allUsers.length === 0 && !isFetching && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-stone-light text-sm">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Load more ───────────────────────────────────────────────────────── */}
      {lastPage?.nextCursor && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => setCursor(lastPage.nextCursor ?? undefined)} disabled={isFetching}>
            {isFetching ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}

      {/* ── Confirmation modal ──────────────────────────────────────────────── */}
      {confirming && (
        <ConfirmActionModal
          action={confirming.action}
          user={confirming.user}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(null)}
          loading={isMutating}
        />
      )}
    </AdminLayout>
  )
}
