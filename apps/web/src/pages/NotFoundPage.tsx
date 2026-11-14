import { Link } from 'react-router'

export function NotFoundPage({ message = 'Sahifa topilmadi' }: { message?: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-lg font-medium">{message}</p>
      <p className="mt-1 text-sm text-slate-500">Havola eskirgan yoki sizda bu sahifaga ruxsat yo‘q.</p>
      <Link to="/" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
        Loyihalarga qaytish
      </Link>
    </main>
  )
}
