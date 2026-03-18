import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tutor } from '../../api'
import { Plus, Trash2, MessageSquare } from 'lucide-react'

interface Props {
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}

export default function ConversationSidebar({ activeId, onSelect, onNew }: Props) {
  const queryClient = useQueryClient()
  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: tutor.conversations,
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => tutor.deleteConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  return (
    <div className="flex flex-col h-full">
      <button
        onClick={onNew}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded text-gray-900 font-medium text-sm mb-4 transition-colors"
      >
        <Plus size={16} /> Nueva conversacion
      </button>

      <div className="flex-1 overflow-y-auto space-y-1">
        {!conversations?.length && (
          <p className="text-xs text-gray-400 text-center mt-4">Sin conversaciones</p>
        )}
        {conversations?.map((c) => (
          <div
            key={c.id}
            className={`group flex items-start gap-2 px-3 py-2 rounded cursor-pointer hover:bg-gray-100 transition-colors ${
              activeId === c.id ? 'bg-gray-100' : ''
            }`}
            onClick={() => onSelect(c.id)}
          >
            <MessageSquare size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm text-gray-700">
                {c.last_message || 'Conversacion vacia'}
              </p>
              <p className="text-xs text-gray-400">{c.message_count} mensajes</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); deleteMut.mutate(c.id) }}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all p-1"
              title="Eliminar conversacion"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
