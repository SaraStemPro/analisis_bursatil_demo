import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { lesson, type StudentLessonResponse } from '../api'
import { RefreshCw, ChevronDown, ChevronRight, Download } from 'lucide-react'

const LESSON_ID = 'leccion3'

type Bucket = {
  retos: { id: string; hecho: boolean; respuesta: string }[]
  quizzes: { id: string; opcion: number | null }[]
  checks: { id: string; marcado: boolean }[]
  cuaderno: string
}

function bucketize(data: Record<string, unknown>): Bucket {
  const retosMap: Record<string, { hecho: boolean; respuesta: string }> = {}
  const quizzes: { id: string; opcion: number | null }[] = []
  const checks: { id: string; marcado: boolean }[] = []
  let cuaderno = ''

  for (const [k, v] of Object.entries(data || {})) {
    if (k.startsWith('reto:')) {
      const id = k.slice(5)
      retosMap[id] = retosMap[id] || { hecho: false, respuesta: '' }
      retosMap[id].respuesta = String(v ?? '')
    } else if (k.startsWith('reto-hecho:')) {
      const id = k.slice(11)
      retosMap[id] = retosMap[id] || { hecho: false, respuesta: '' }
      retosMap[id].hecho = Boolean(v)
    } else if (k.startsWith('quiz:')) {
      const opcion = typeof v === 'number' ? v : null
      quizzes.push({ id: k.slice(5), opcion })
    } else if (k.startsWith('check:')) {
      checks.push({ id: k.slice(6), marcado: Boolean(v) })
    } else if (k === 'cuaderno:sesion3' || k.startsWith('cuaderno:')) {
      cuaderno = String(v ?? '')
    }
  }

  const retos = Object.entries(retosMap)
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => a.id.localeCompare(b.id))

  return {
    retos,
    quizzes: quizzes.sort((a, b) => a.id.localeCompare(b.id)),
    checks: checks.sort((a, b) => a.id.localeCompare(b.id)),
    cuaderno,
  }
}

function progress(b: Bucket) {
  const retosHechos = b.retos.filter(r => r.hecho).length
  const retosConRespuesta = b.retos.filter(r => r.respuesta.trim().length > 0).length
  const quizzesContestados = b.quizzes.filter(q => q.opcion !== null).length
  const checksMarcados = b.checks.filter(c => c.marcado).length
  return { retosHechos, retosConRespuesta, quizzesContestados, checksMarcados }
}

function exportCsv(students: StudentLessonResponse[]) {
  const header = ['alumno', 'email', 'última_actualización', 'tipo', 'id', 'valor']
  const rows: string[][] = [header]
  for (const s of students) {
    for (const [k, v] of Object.entries(s.data || {})) {
      let tipo = 'otro'
      let id = k
      if (k.startsWith('reto:')) { tipo = 'reto_respuesta'; id = k.slice(5) }
      else if (k.startsWith('reto-hecho:')) { tipo = 'reto_hecho'; id = k.slice(11) }
      else if (k.startsWith('quiz:')) { tipo = 'quiz'; id = k.slice(5) }
      else if (k.startsWith('check:')) { tipo = 'checkpoint'; id = k.slice(6) }
      else if (k.startsWith('cuaderno:')) { tipo = 'cuaderno'; id = k.slice(9) }
      const valor = typeof v === 'string' ? v : JSON.stringify(v)
      rows.push([
        s.user_name,
        s.user_email,
        s.updated_at ?? '',
        tipo,
        id,
        valor,
      ])
    }
  }
  const csv = rows
    .map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `respuestas-${LESSON_ID}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function AdminClase() {
  const { data: students, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ['admin-clase', LESSON_ID],
    queryFn: () => lesson.listAll(LESSON_ID),
    refetchInterval: 30_000,
  })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const buckets = useMemo(() => {
    const m = new Map<string, Bucket>()
    students?.forEach(s => m.set(s.user_id, bucketize(s.data)))
    return m
  }, [students])

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (isLoading) return <div className="text-slate-400 text-center py-12">Cargando respuestas…</div>
  if (error) return <div className="text-red-400 text-center py-12">Error: {String((error as Error).message)}</div>

  const total = students?.length ?? 0
  const conActividad = students?.filter(s => Object.keys(s.data || {}).length > 0).length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Respuestas de la clase interactiva</h1>
          <p className="text-slate-400 text-sm mt-1">
            {total} alumnos · {conActividad} con actividad registrada
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => students && exportCsv(students)}
            disabled={!students || students.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm disabled:opacity-50"
          >
            <Download size={14} />
            Exportar CSV
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {(students ?? []).map(s => {
          const b = buckets.get(s.user_id)
          if (!b) return null
          const p = progress(b)
          const isOpen = expanded.has(s.user_id)
          const hasActivity = Object.keys(s.data || {}).length > 0
          return (
            <div key={s.user_id} className="bg-slate-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggle(s.user_id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-750 text-left"
              >
                {isOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{s.user_name}</div>
                  <div className="text-slate-400 text-xs truncate">{s.user_email}</div>
                </div>
                {!hasActivity && (
                  <span className="text-xs text-slate-500 italic">sin respuestas todavía</span>
                )}
                {hasActivity && (
                  <div className="flex gap-3 text-xs text-slate-400 flex-shrink-0">
                    <span>Retos: <span className="text-white font-medium">{p.retosConRespuesta}/{b.retos.length || '—'}</span></span>
                    <span>Quizzes: <span className="text-white font-medium">{p.quizzesContestados}/{b.quizzes.length || '—'}</span></span>
                    <span>Checks: <span className="text-white font-medium">{p.checksMarcados}/{b.checks.length || '—'}</span></span>
                  </div>
                )}
                <div className="text-xs text-slate-500 flex-shrink-0 w-32 text-right">
                  {s.updated_at ? new Date(s.updated_at).toLocaleString('es-ES') : '—'}
                </div>
              </button>

              {isOpen && hasActivity && (
                <div className="border-t border-slate-700 p-4 space-y-5 bg-slate-900/40">
                  {b.cuaderno && (
                    <section>
                      <h3 className="text-sm font-semibold text-amber-300 mb-2">Cuaderno de sesión</h3>
                      <pre className="whitespace-pre-wrap text-sm text-slate-200 bg-slate-950/60 p-3 rounded border border-slate-700 font-sans">
                        {b.cuaderno}
                      </pre>
                    </section>
                  )}

                  {b.retos.length > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold text-emerald-300 mb-2">Retos</h3>
                      <div className="space-y-2">
                        {b.retos.map(r => (
                          <div key={r.id} className="bg-slate-950/60 border border-slate-700 rounded p-3">
                            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                              <span className="font-mono text-slate-300">Reto {r.id}</span>
                              <span className={r.hecho ? 'text-emerald-400' : 'text-slate-500'}>
                                {r.hecho ? '✓ marcado como hecho' : '· no marcado'}
                              </span>
                            </div>
                            {r.respuesta.trim() ? (
                              <pre className="whitespace-pre-wrap text-sm text-slate-200 font-sans">{r.respuesta}</pre>
                            ) : (
                              <div className="text-xs text-slate-500 italic">Sin respuesta escrita</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {b.quizzes.length > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold text-sky-300 mb-2">Quizzes</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {b.quizzes.map(q => (
                          <div key={q.id} className="bg-slate-950/60 border border-slate-700 rounded p-2 text-sm">
                            <div className="font-mono text-xs text-slate-400">{q.id}</div>
                            <div className="text-slate-200">
                              {q.opcion === null ? <span className="italic text-slate-500">sin contestar</span> : <>opción <strong>{q.opcion}</strong></>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {b.checks.length > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold text-fuchsia-300 mb-2">Checkpoints</h3>
                      <div className="flex flex-wrap gap-2">
                        {b.checks.map(c => (
                          <span
                            key={c.id}
                            className={
                              'px-2 py-1 rounded text-xs font-mono ' +
                              (c.marcado
                                ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700'
                                : 'bg-slate-800 text-slate-500 border border-slate-700')
                            }
                          >
                            {c.marcado ? '✓' : '·'} {c.id}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
