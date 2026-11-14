import { roleLabel } from './labels'
import { useRoles } from './queries'

/** Rol kaliti → bazadagi nomi ("developer" → "Dasturchi", yaratilgan rollar ham). */
export function useRoleTitle(): (name: string | null | undefined) => string {
  const roles = useRoles()
  const titles = new Map(roles.data?.roles.map((r) => [r.name, r.title]) ?? [])
  return (name) => (name ? (titles.get(name) ?? roleLabel(name)) : '—')
}
