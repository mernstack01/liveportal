/** Izoh matnida loyiha a'zolarining @username'larini ajratib ko'rsatadi. */
export function MentionText({ text, usernames }: { text: string; usernames: Set<string> }) {
  const parts = text.split(/(@[A-Za-z0-9_]{5,32})/g)
  return (
    <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
      {parts.map((part, i) =>
        part.startsWith('@') && usernames.has(part.slice(1).toLowerCase()) ? (
          <span key={i} className="rounded bg-sky-50 px-0.5 font-medium text-sky-700">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  )
}
