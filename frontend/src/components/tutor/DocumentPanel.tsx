import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tutor } from '../../api'
import { FileUp, Trash2, FileText, CheckCircle, Clock, AlertCircle, Download } from 'lucide-react'
import { useRef } from 'react'

interface DocumentPanelProps {
  readOnly?: boolean
}

export default function DocumentPanel({ readOnly = false }: DocumentPanelProps) {
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

  const handleDownload = (id: string) => {
    tutor.downloadDocument(id).catch((err) => {
      console.error('Error descargando documento:', err)
      alert('Error al descargar el documento')
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          {readOnly ? 'Material de clase' : 'Documentos'}
        </h3>
        {!readOnly && (
          <label className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer transition-colors">
            <FileUp size={14} />
            Subir PDF
            <input ref={fileRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" />
          </label>
        )}
      </div>

      {!readOnly && uploadMut.isPending && (
        <div className="flex items-center gap-2 text-xs text-amber-400 animate-pulse">
          <Clock size={12} /> Subiendo...
        </div>
      )}
      {!readOnly && uploadMut.isError && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertCircle size={12} /> Error: {(uploadMut.error as Error).message}
        </div>
      )}
      {!readOnly && uploadMut.isSuccess && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle size={12} /> PDF subido correctamente
        </div>
      )}

      <div className="space-y-1 max-h-48 overflow-y-auto">
        {!documents?.length && (
          <p className="text-xs text-gray-400">
            {readOnly ? 'No hay material disponible' : 'No hay documentos subidos'}
          </p>
        )}
        {documents?.map((doc) => (
          <div key={doc.id} className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 transition-colors">
            <FileText size={14} className={doc.processed ? 'text-emerald-500' : 'text-amber-500'} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-700 truncate">{doc.filename}</p>
              {!readOnly && (
                <p className="text-[10px] text-gray-400">
                  {doc.processed ? 'Procesado' : 'Pendiente'}
                </p>
              )}
            </div>
            <button
              onClick={() => handleDownload(doc.id)}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-400 transition-all p-1"
              title="Descargar documento"
            >
              <Download size={12} />
            </button>
            {!readOnly && (
              <button
                onClick={() => deleteMut.mutate(doc.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all p-1"
                title="Eliminar documento"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
