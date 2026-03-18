import { useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import type { Message } from '../../types'
import MessageBubble from './MessageBubble'

interface Props {
  messages: Message[]
  isLoading: boolean
  isSending: boolean
  onSend: (message: string) => void
}

export default function ChatArea({ messages, isLoading, isSending, onSend }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = () => {
    const value = inputRef.current?.value.trim()
    if (!value) return
    onSend(value)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-900 rounded-lg border border-slate-700">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center h-full text-slate-500">
            <p className="text-sm animate-pulse">Cargando mensajes...</p>
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-slate-500">
            <div className="text-center">
              <p className="text-lg font-medium">Tutor IA</p>
              <p className="text-sm mt-1">Pregunta lo que quieras sobre los apuntes del curso</p>
              <p className="text-xs mt-3 text-slate-600">Sube un PDF con el material y haz preguntas sobre el</p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isSending && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-lg px-4 py-2">
              <p className="text-sm text-slate-400 animate-pulse">Pensando...</p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
            placeholder="Escribe tu pregunta..."
            className="flex-1 px-4 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 text-sm"
          />
          <button
            onClick={handleSubmit}
            disabled={isSending}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-white transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
