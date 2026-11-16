import { useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth'
import { useMe } from '../me'
import { useRoles } from '../queries'
import { useRoleTitle } from '../roles'
import { OnboardingProvider } from '../onboarding/OnboardingProvider'
import { useOnboarding } from '../onboarding/state'
import { Avatar } from './ui'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium sm:px-3 ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`

/** "?" — joriy sahifa yo'riqnomasini qayta ochadi. */
function HelpButton() {
  const { replay, hasPageTour } = useOnboarding()
  return (
    <button
      data-tour="help"
      onClick={replay}
      disabled={!hasPageTour}
      aria-label="Yo‘riqnoma"
      title="Shu sahifa bo‘yicha yo‘riqnoma"
      className="flex size-8 items-center justify-center rounded-full text-sm font-semibold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
    >
      ?
    </button>
  )
}

export function AppLayout() {
  const { me, workspace, can } = useMe()
  const { logout } = useAuth()
  const queryClient = useQueryClient()
  const { pathname } = useLocation()
  const roleLabel = useRoleTitle()
  const canManageRoles = useRoles().data?.canManage ?? false

  const signOut = async () => {
    await logout()
    queryClient.clear() // keyingi odam oldingisining ma'lumotini ko'rmasin
  }

  return (
    <OnboardingProvider initialSeen={me.onboarding ?? []}>
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2.5 sm:flex-nowrap sm:gap-4">
          <NavLink to="/" className="font-semibold tracking-tight">
            LivePortal
          </NavLink>
          {/* Telefonda menyu ikkinchi qatorda, sig'masa yonga suriladi */}
          <nav className="order-last -mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
            <NavLink data-tour="nav-projects" to="/" className={() => navClass({ isActive: pathname === '/' || pathname.startsWith('/projects/') })}>
              Loyihalar
            </NavLink>
            {/* Mijozda (team.view yo'q) faqat loyihalar: tasklar va jamoa xodimlar uchun */}
            {can('team.view') && (
              <NavLink data-tour="nav-my" to="/my" className={navClass}>
                <span className="sm:hidden">Tasklarim</span>
                <span className="hidden sm:inline">Mening tasklarim</span>
              </NavLink>
            )}
            {can('dashboard.view_all') && (
              <NavLink data-tour="nav-dashboard" to="/dashboard" className={navClass}>
                Dashboard
              </NavLink>
            )}
            {can('team.view') && (
              <NavLink data-tour="nav-team" to="/team" className={navClass}>
                Jamoa
              </NavLink>
            )}
            {canManageRoles && (
              <NavLink data-tour="nav-roles" to="/roles" className={navClass}>
                Rollar
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{me.name}</p>
              <p className="text-xs text-slate-500">{roleLabel(workspace?.role)}</p>
            </div>
            <HelpButton />
            <Avatar person={me} />
            <button onClick={() => void signOut()} className="text-sm text-slate-500 hover:text-slate-900">
              Chiqish
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
    </OnboardingProvider>
  )
}
