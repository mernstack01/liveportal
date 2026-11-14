import { useAuth, type Me } from './auth'

/** Kirgan foydalanuvchi va uning workspace ruxsatlari (MVP: bitta workspace). */
export function useMe(): { me: Me; workspace: Me['workspaces'][number] | undefined; can: (permission: string) => boolean } {
  const { state } = useAuth()
  if (state.status !== 'authenticated') throw new Error('useMe faqat kirgan foydalanuvchi uchun')
  const workspace = state.me.workspaces[0]
  return { me: state.me, workspace, can: (p) => workspace?.permissions.includes(p) ?? false }
}
