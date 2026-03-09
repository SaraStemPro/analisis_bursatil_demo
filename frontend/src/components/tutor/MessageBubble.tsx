import type { Message } from '../../types'

interface Props {
  message: Message
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
        isUser ? 'bg-emerald-900/50 text-white' : 'bg-slate-800 text-slate-200'
      }`}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-700">
            <p className="text-xs text-slate-400 mb-1">Fuentes:</p>
            {message.sources.map((s, i) => (
              <p key={i} className="text-xs text-slate-500">
                {s.filename}{s.page ? `, p.${s.page}` : ''}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
