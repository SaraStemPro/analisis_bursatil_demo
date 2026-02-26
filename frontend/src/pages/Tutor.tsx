import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { tutor } from '../api'
import type { Message } from '../types'
import { Send, FileUp } from 'lucide-react'

export default function Tutor() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: conversations } = useQuery({ queryKey: ['conversations'], queryFn: tutor.conversations })

  const chatMut = useMutation({
    mutationFn: (message: string) => tutor.chat({ message, conversation_id: conversationId ?? undefined }),
    onSuccess: (data) => {
      setConversationId(data.conversation_id)
      setMessages((prev) => [...prev, data.message])
    },
  })

  const uploadMut = useMutation({
    mutationFn: (file: File) => tutor.uploadDocument(file),
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      sources: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    chatMut.mutate(input)
    setInput('')
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadMut.mutate(file)
  }

  const startNewConversation = () => {
    setMessages([])
    setConversationId(null)
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 rounded-lg border border-slate-700 p-4 hidden md:flex flex-col">
        <button onClick={startNewConversation} className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-white font-medium text-sm mb-4">
          Nueva conversación
        </button>

        <div className="flex-1 overflow-y-auto space-y-1">
          {conversations?.map((c) => (
            <button
              key={c.id}
              onClick={() => { setConversationId(c.id); setMessages([]) }}
              className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-slate-800 ${conversationId === c.id ? 'bg-slate-800' : ''}`}
            >
              <p className="truncate text-slate-300">{c.last_message || 'Conversación vacía'}</p>
              <p className="text-xs text-slate-500">{c.message_count} mensajes</p>
            </button>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-700">
          <label className="flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400 cursor-pointer">
            <FileUp size={16} />
            Subir PDF
            <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
          </label>
          {uploadMut.isSuccess && <p className="text-xs text-emerald-400 mt-1">PDF subido correctamente</p>}
          {uploadMut.isError && <p className="text-xs text-red-400 mt-1">Error al subir</p>}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-slate-900 rounded-lg border border-slate-700">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-slate-500">
              <div className="text-center">
                <p className="text-lg">Tutor IA</p>
                <p className="text-sm mt-1">Pregunta lo que quieras sobre los apuntes del curso</p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === 'user' ? 'bg-emerald-900/50 text-white' : 'bg-slate-800 text-slate-200'
              }`}>
                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-700">
                    <p className="text-xs text-slate-400 mb-1">Fuentes:</p>
                    {msg.sources.map((s, i) => (
                      <p key={i} className="text-xs text-slate-500">{s.filename}{s.page ? `, p.${s.page}` : ''}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {chatMut.isPending && (
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Escribe tu pregunta..."
              className="flex-1 px-4 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || chatMut.isPending}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-white"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
