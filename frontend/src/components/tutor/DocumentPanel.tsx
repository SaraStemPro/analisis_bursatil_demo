import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tutor } from '../../api'
import { FileUp, Trash2, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { useRef } from 'react'

export default function DocumentPanel() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: documents } = useQuery({
    queryKey: ['tutor-documents'],
    queryFn: tutor.documents,
  })

  const uploadMut = useMutation({
    mutationFn: (file: File) => tutor.uploadDocument(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tutor-documents'] })
      if (fileRef.current) fileRef.current.value = ''
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => tutor.deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tutor-documents'] })
    },
  })

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadMut.mutate(file)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">Documentos</h3>
        <label className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer transition-colors">
          <FileUp size={14} />
          Subir PDF
          <input ref={fileRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" />
        </label>
      </div>

      {uploadMut.isPending && (
        <div className="flex items-center gap-2 text-xs text-amber-400 animate-pulse">
          <Clock size={12} /> Subiendo...
        </div>
      )}
      {uploadMut.isError && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertCircle size={12} /> Error: {(uploadMut.error as Error).message}
        </div>
      )}
      {uploadMut.isSuccess && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle size={12} /> PDF subido correctamente
        </div>
      )}

      <div className="space-y-1 max-h-48 overflow-y-auto">
        {!documents?.length && (
          <p className="text-xs text-slate-500">No hay documentos subidos</p>
        )}
        {documents?.map((doc) => (
          <div key={doc.id} className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 transition-colors">
            <FileText size={14} className={doc.processed ? 'text-emerald-500' : 'text-amber-500'} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-300 truncate">{doc.filename}</p>
              <p className="text-[10px] text-slate-500">
                {doc.processed ? 'Procesado' : 'Pendiente'}
              </p>
            </div>
            <button
              onClick={() => deleteMut.mutate(doc.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-1"
              title="Eliminar documento"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
