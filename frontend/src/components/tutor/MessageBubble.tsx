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
          <div className="mt-3 pt-2 border-t border-slate-700">
            <p className="text-xs font-semibold text-cyan-400 mb-2">Basado en tu material de clase:</p>
            {message.sources.map((s, i) => (
              <div key={i} className="flex items-start gap-2 mb-1">
                <span className="text-cyan-500 text-xs mt-0.5">&#128196;</span>
                <p className="text-xs text-slate-300">
                  <span className="font-medium">{s.filename}</span>
                  {s.page ? <span className="text-slate-400"> — pag. {s.page}</span> : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
