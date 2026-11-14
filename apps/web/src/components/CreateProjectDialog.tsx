import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { suggestKey } from '../labels'
import type { ProjectDetail } from '../types'
import { Button, ErrorText, inputClass, Modal } from './ui'

export function CreateProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api<ProjectDetail>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          key: keyTouched ? key : suggestKey(name),
          description: description || undefined,
          startDate: startDate || undefined,
          dueDate: dueDate || undefined,
        }),
      }),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.setQueryData(['project', project.id], project)
      onClose()
      void navigate(`/projects/${project.id}`)
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate()
  }
  const shownKey = keyTouched ? key : suggestKey(name)

  return (
    <Modal open={open} onClose={onClose} title="Yangi loyiha">
      <form onSubmit={submit} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Nomi</span>
          <input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} data-autofocus />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Kalit</span>
          <input
            required
            value={shownKey}
            onChange={(e) => {
              setKeyTouched(true)
              setKey(e.target.value.toUpperCase())
            }}
            pattern="[A-Za-z][A-Za-z0-9]{1,9}"
            className={`${inputClass} font-mono uppercase`}
          />
          <span className="block text-xs text-slate-500">Task raqamlari shu bilan boshlanadi: {shownKey || 'LP'}-1. Keyin o‘zgarmaydi.</span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Tavsif</span>
          <textarea rows={3} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Boshlanishi</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Muddati</span>
            <input type="date" value={dueDate} min={startDate || undefined} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </label>
        </div>
        <ErrorText error={create.error} />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button disabled={create.isPending}>{create.isPending ? 'Yaratilmoqda…' : 'Yaratish'}</Button>
        </div>
      </form>
    </Modal>
  )
}
