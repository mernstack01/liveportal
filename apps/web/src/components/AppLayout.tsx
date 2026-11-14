import { useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth'
import { roleLabel } from '../labels'
import { useMe } from '../me'
import { Avatar } from './ui'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2.5 py-1.5 text-sm font-medium sm:px-3 ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`

export function AppLayout() {
  const { me, workspace } = useMe()
  const { logout } = useAuth()
  const queryClient = useQueryClient()
  const { pathname } = useLocation()

  const signOut = async () => {
    await logout()
    queryClient.clear() // keyingi odam oldingisining ma'lumotini ko'rmasin
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 sm:gap-4">
          <NavLink to="/" className="hidden font-semibold tracking-tight sm:inline">
            LivePortal
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavLink to="/" className={() => navClass({ isActive: pathname === '/' || pathname.startsWith('/projects/') })}>
              Loyihalar
            </NavLink>
            <NavLink to="/my" className={navClass}>
              <span className="sm:hidden">Tasklarim</span>
              <span className="hidden sm:inline">Mening tasklarim</span>
            </NavLink>
            <NavLink to="/team" className={navClass}>
              Jamoa
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{me.name}</p>
              <p className="text-xs text-slate-500">{roleLabel(workspace?.role)}</p>
            </div>
            <Avatar person={me} />
            <button onClick={() => void signOut()} className="text-sm text-slate-500 hover:text-slate-900">
              Chiqish
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
