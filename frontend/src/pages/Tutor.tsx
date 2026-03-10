import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tutor } from '../api'
import type { Message } from '../types'
import { useAuthStore } from '../context/auth-store'
import ConversationSidebar from '../components/tutor/ConversationSidebar'
import ChatArea from '../components/tutor/ChatArea'
import DocumentPanel from '../components/tutor/DocumentPanel'

export default function Tutor() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isProfessor = user?.role === 'professor' || user?.role === 'admin'
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)

  const chatMut = useMutation({
    mutationFn: (message: string) => tutor.chat({ message, conversation_id: conversationId ?? undefined }),
    onSuccess: (data) => {
      setConversationId(data.conversation_id)
      setMessages((prev) => [...prev, data.message])
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  const handleSend = useCallback((text: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      sources: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    chatMut.mutate(text)
  }, [chatMut])

  const handleSelectConversation = useCallback(async (id: string) => {
    if (id === conversationId) return
    setConversationId(id)
    setMessages([])
    setIsLoadingMessages(true)
    try {
      const data = await tutor.conversationMessages(id)
      setMessages(data.messages)
    } catch {
      // If loading fails, keep empty and let user send new messages
    } finally {
      setIsLoadingMessages(false)
    }
  }, [conversationId])

  const handleNewConversation = useCallback(() => {
    setMessages([])
    setConversationId(null)
  }, [])

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 rounded-lg border border-slate-700 p-4 hidden md:flex flex-col">
        <ConversationSidebar
          activeId={conversationId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
        />

        <div className="mt-4 pt-4 border-t border-slate-700">
          <DocumentPanel readOnly={!isProfessor} />
        </div>
      </div>

      {/* Chat */}
      <ChatArea
        messages={messages}
        isLoading={isLoadingMessages}
        isSending={chatMut.isPending}
        onSend={handleSend}
      />
    </div>
  )
}
