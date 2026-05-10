import { useReducer, useEffect } from 'react'
import './Programa7.css'

// ─── Constantes ───────────────────────────────────────────────────────────────

const MEMORIA_TOTAL = 240
const TAMANO_MARCO = 5
const TOTAL_MARCOS = 48              // 240 / 5
const MARCOS_SO = 4                  // marcos 44–47 ocupados por el S.O.
const PRIMER_MARCO_SO = TOTAL_MARCOS - MARCOS_SO  // 44
const MARCOS_DISPONIBLES = TOTAL_MARCOS - MARCOS_SO  // 44 marcos para procesos

const TIEMPO_BLOQUEO = 8
const RANDOM_MIN = 6
const RANDOM_MAX = 30

// ─── Helpers ──────────────────────────────────────────────────────────────────

const randEntre = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

function evaluarOperacion(operacion) {
  try {
    // eslint-disable-next-line no-eval
    const r = eval(operacion)
    if (!isFinite(r) || isNaN(r)) return 'Error'
    return Number.isInteger(r) ? r : Math.round(r * 100) / 100
  } catch {
    return 'Error'
  }
}

function generarOperacion() {
  const signos = ['+', '-', '*', '/']
  const a = randEntre(RANDOM_MIN, RANDOM_MAX)
  let b = randEntre(RANDOM_MIN, RANDOM_MAX)
  const s = signos[Math.floor(Math.random() * signos.length)]
  if (s === '/') b = Math.max(1, b)
  const op = `${a} ${s} ${b}`
  if (evaluarOperacion(op) === 'Error') return generarOperacion()
  return op
}

function crearProceso(id) {
  const tamano = randEntre(RANDOM_MIN, RANDOM_MAX)
  const numPaginas = Math.ceil(tamano / TAMANO_MARCO)
  const bytesUltimaPagina = tamano % TAMANO_MARCO === 0 ? TAMANO_MARCO : tamano % TAMANO_MARCO
  return {
    id,
    operacion: generarOperacion(),
    tme: randEntre(RANDOM_MIN, RANDOM_MAX),
    tamano,
    numPaginas,
    bytesUltimaPagina,
    tablaPaginas: [],            // array de índices de marco (uno por página)
    tiempoLlegada: 0,
    tiempoInicioEjecucion: null,
    tiempoFinalizacion: null,
    tiempoEnBloqueado: 0,
    tiempoEspera: 0,
    tiempoRespuesta: null,
    tt: 0,                        // tiempo en CPU
    tiempoServicio: 0,
    tiempoEnQuantum: 0,
  }
}

// ─── Inicialización de marcos ─────────────────────────────────────────────────
// Cada marco: null (libre), 'SO', o { pid, pageIdx, bytes }

function inicializarMarcos() {
  const marcos = Array(TOTAL_MARCOS).fill(null)
  for (let i = PRIMER_MARCO_SO; i < TOTAL_MARCOS; i++) marcos[i] = 'SO'
  return marcos
}

function marcosLibres(marcos) {
  let n = 0
  for (let i = 0; i < PRIMER_MARCO_SO; i++) if (marcos[i] == null) n++
  return n
}

function indicesLibres(marcos) {
  const out = []
  for (let i = 0; i < PRIMER_MARCO_SO; i++) if (marcos[i] == null) out.push(i)
  return out
}

function asignarMarcos(marcos, proceso) {
  const libres = indicesLibres(marcos)
  if (libres.length < proceso.numPaginas) return null
  const nuevosMarcos = [...marcos]
  const tablaPaginas = []
  for (let i = 0; i < proceso.numPaginas; i++) {
    const idx = libres[i]
    const bytes = i === proceso.numPaginas - 1 ? proceso.bytesUltimaPagina : TAMANO_MARCO
    nuevosMarcos[idx] = { pid: proceso.id, pageIdx: i, bytes }
    tablaPaginas.push(idx)
  }
  return { marcos: nuevosMarcos, tablaPaginas }
}

function liberarMarcos(marcos, pid) {
  return marcos.map(m => (m && m !== 'SO' && m.pid === pid ? null : m))
}

// ─── Estado inicial ───────────────────────────────────────────────────────────

const initialState = {
  iniciado: false,
  finalizado: false,
  pausado: false,
  tiempoGlobal: 0,
  quantum: 3,
  colaNew: [],
  colaListos: [],
  procesoEjecucion: null,
  colaBloqueados: [],
  procesosTerminados: [],
  marcos: inicializarMarcos(),
  mostrarBCP: false,
  mostrarTablaPaginas: false,
}

// Admite tantos procesos de colaNew a colaListos como quepan en memoria.
function admitirNuevos(colaNew, colaListos, marcos, tNow) {
  let pendientes = colaNew
  let listos = colaListos
  let m = marcos
  while (pendientes.length > 0) {
    const candidato = pendientes[0]
    const res = asignarMarcos(m, candidato)
    if (!res) break
    m = res.marcos
    listos = [
      ...listos,
      {
        ...candidato,
        tablaPaginas: res.tablaPaginas,
        tiempoLlegada: tNow,
        tiempoServicio: 0,
      },
    ]
    pendientes = pendientes.slice(1)
  }
  return { colaNew: pendientes, colaListos: listos, marcos: m }
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {

    case 'INIT': {
      const { procesos, quantum } = action
      let marcos = inicializarMarcos()
      let colaListos = []
      const colaNew = [...procesos]

      const admitido = admitirNuevos(colaNew, colaListos, marcos, 0)
      colaListos = admitido.colaListos
      marcos = admitido.marcos
      const restante = admitido.colaNew

      let procesoEjecucion = null
      if (colaListos.length > 0) {
        const [first, ...rest] = colaListos
        procesoEjecucion = {
          ...first,
          tiempoInicioEjecucion: 0,
          tiempoRespuesta: 0,
          tiempoEnQuantum: 0,
        }
        colaListos = rest
      }

      return {
        ...initialState,
        iniciado: true,
        quantum,
        colaNew: restante,
        colaListos,
        procesoEjecucion,
        marcos,
      }
    }

    case 'TICK': {
      if (!state.iniciado || state.pausado || state.finalizado) return state

      const t = state.tiempoGlobal
      const quantum = state.quantum
      let { colaNew, colaListos, procesoEjecucion, colaBloqueados, procesosTerminados, marcos } = state

      // 1) Proceso en ejecución
      if (procesoEjecucion) {
        const tt = procesoEjecucion.tt + 1
        const tiempoEnQuantum = procesoEjecucion.tiempoEnQuantum + 1

        if (tt >= procesoEjecucion.tme) {
          // Terminó normalmente → libera memoria
          marcos = liberarMarcos(marcos, procesoEjecucion.id)
          const tiempoFinalizacion = t + 1
          const tiempoRetorno = tiempoFinalizacion - procesoEjecucion.tiempoLlegada
          const tiempoServicio = procesoEjecucion.tme
          const tiempoEspera = tiempoRetorno - tiempoServicio
          procesosTerminados = [
            ...procesosTerminados,
            {
              ...procesoEjecucion,
              tt,
              tiempoFinalizacion,
              tiempoServicio,
              tiempoEspera,
              tiempoRetorno,
              terminadoPorError: false,
              resultado: evaluarOperacion(procesoEjecucion.operacion),
              tiempoRespuesta:
                (procesoEjecucion.tiempoInicioEjecucion ?? t) - procesoEjecucion.tiempoLlegada,
            },
          ]
          procesoEjecucion = null
        } else if (tiempoEnQuantum >= quantum) {
          // Quantum agotado → al final de listos
          colaListos = [
            ...colaListos,
            { ...procesoEjecucion, tt, tiempoServicio: tt, tiempoEnQuantum: 0 },
          ]
          procesoEjecucion = null
        } else {
          procesoEjecucion = { ...procesoEjecucion, tt, tiempoEnQuantum, tiempoServicio: tt }
        }
      }

      // 2) Cola de bloqueados
      const aunBloqueados = []
      const desbloqueados = []
      for (const p of colaBloqueados) {
        const bt = p.tiempoEnBloqueado + 1
        if (bt >= TIEMPO_BLOQUEO) {
          desbloqueados.push({ ...p, tiempoEnBloqueado: 0, tiempoServicio: p.tt })
        } else {
          aunBloqueados.push({ ...p, tiempoEnBloqueado: bt })
        }
      }
      colaBloqueados = aunBloqueados
      colaListos = [...colaListos, ...desbloqueados]

      // 3) Espera en cola de listos
      colaListos = colaListos.map(p => ({ ...p, tiempoEspera: p.tiempoEspera + 1 }))

      // 4) Planificador a largo plazo: admitir desde Nuevos si hay marcos libres
      const admitido = admitirNuevos(colaNew, colaListos, marcos, t + 1)
      colaNew = admitido.colaNew
      colaListos = admitido.colaListos
      marcos = admitido.marcos

      // 5) Despachar siguiente proceso (FIFO)
      if (!procesoEjecucion && colaListos.length > 0) {
        const [first, ...rest] = colaListos
        const inicio = first.tiempoInicioEjecucion ?? (t + 1)
        procesoEjecucion = {
          ...first,
          tiempoEnQuantum: 0,
          tiempoInicioEjecucion: inicio,
          tiempoRespuesta: first.tiempoRespuesta ?? (inicio - first.tiempoLlegada),
        }
        colaListos = rest
      }

      // 6) Finalización
      const totalActivo =
        colaNew.length + colaListos.length + (procesoEjecucion ? 1 : 0) + colaBloqueados.length
      const finalizado = totalActivo === 0

      return {
        ...state,
        tiempoGlobal: t + 1,
        colaNew,
        colaListos,
        procesoEjecucion,
        colaBloqueados,
        procesosTerminados,
        marcos,
        finalizado,
      }
    }

    case 'PAUSE':
      return { ...state, pausado: true }

    case 'CONTINUE':
      return { ...state, pausado: false, mostrarBCP: false, mostrarTablaPaginas: false }

    case 'INTERRUPT': {
      if (!state.procesoEjecucion) return state
      return {
        ...state,
        procesoEjecucion: null,
        colaBloqueados: [
          ...state.colaBloqueados,
          {
            ...state.procesoEjecucion,
            tiempoEnBloqueado: 0,
            tiempoServicio: state.procesoEjecucion.tt,
          },
        ],
      }
    }

    case 'ERROR': {
      if (!state.procesoEjecucion) return state
      const p = state.procesoEjecucion
      const marcos = liberarMarcos(state.marcos, p.id)
      const tiempoFinalizacion = state.tiempoGlobal + 1
      const tiempoRetorno = tiempoFinalizacion - p.tiempoLlegada
      const tiempoServicio = p.tt
      const tiempoEspera = tiempoRetorno - tiempoServicio
      return {
        ...state,
        procesoEjecucion: null,
        marcos,
        procesosTerminados: [
          ...state.procesosTerminados,
          {
            ...p,
            tiempoFinalizacion,
            tiempoServicio,
            tiempoEspera,
            tiempoRetorno,
            terminadoPorError: true,
            resultado: 'ERROR',
            tiempoRespuesta:
              (p.tiempoInicioEjecucion ?? state.tiempoGlobal) - p.tiempoLlegada,
          },
        ],
      }
    }

    case 'NEW_PROCESS': {
      if (state.finalizado) return state
      const nuevoId =
        state.colaNew.length +
        state.colaListos.length +
        state.colaBloqueados.length +
        state.procesosTerminados.length +
        (state.procesoEjecucion ? 1 : 0) +
        1
      const nuevo = crearProceso(nuevoId)
      return { ...state, colaNew: [...state.colaNew, nuevo] }
    }

    case 'SHOW_BCP':
      if (state.finalizado) return state
      return { ...state, pausado: true, mostrarBCP: true, mostrarTablaPaginas: false }

    case 'SHOW_PAGINAS':
      if (state.finalizado) return state
      return { ...state, pausado: true, mostrarTablaPaginas: true, mostrarBCP: false }

    default:
      return state
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Programa7() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const {
    iniciado, finalizado, pausado, tiempoGlobal, quantum,
    colaNew, colaListos, procesoEjecucion, colaBloqueados, procesosTerminados,
    marcos, mostrarBCP, mostrarTablaPaginas,
  } = state

  // Reloj
  useEffect(() => {
    if (!iniciado || pausado || finalizado) return
    const id = setInterval(() => dispatch({ type: 'TICK' }), 1000)
    return () => clearInterval(id)
  }, [iniciado, pausado, finalizado])

  // Teclas
  useEffect(() => {
    const onKey = e => {
      const k = e.key.toLowerCase()
      if (pausado) {
        if (k === 'c') dispatch({ type: 'CONTINUE' })
        if (k === 'b') dispatch({ type: 'SHOW_BCP' })
        if (k === 't') dispatch({ type: 'SHOW_PAGINAS' })
        return
      }
      if (finalizado) return
      switch (k) {
        case 'p': dispatch({ type: 'PAUSE' }); break
        case 'c': dispatch({ type: 'CONTINUE' }); break
        case 'e': dispatch({ type: 'INTERRUPT' }); break
        case 'w': dispatch({ type: 'ERROR' }); break
        case 'n': dispatch({ type: 'NEW_PROCESS' }); break
        case 'b': dispatch({ type: 'SHOW_BCP' }); break
        case 't': dispatch({ type: 'SHOW_PAGINAS' }); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pausado, finalizado])

  function inicializar() {
    const inputN = prompt('Ingrese el número de procesos inicial:')
    const n = parseInt(inputN)
    if (!n || n <= 0 || isNaN(n)) return
    const inputQ = prompt('Ingrese el valor del Quantum:')
    const q = parseInt(inputQ)
    if (!q || q <= 0 || isNaN(q)) return
    const procesos = Array.from({ length: n }, (_, i) => crearProceso(i + 1))
    dispatch({ type: 'INIT', procesos, quantum: q })
  }

  // Determina el estado actual de un proceso (para colorear marcos)
  const estadoPorPid = {}
  for (const p of colaListos) estadoPorPid[p.id] = 'LISTO'
  for (const p of colaBloqueados) estadoPorPid[p.id] = 'BLOQUEADO'
  if (procesoEjecucion) estadoPorPid[procesoEjecucion.id] = 'EJECUCION'

  const estadoLabel = !iniciado
    ? 'NO INICIADO'
    : finalizado
      ? 'FINALIZADO'
      : pausado
        ? 'PAUSADO'
        : 'EJECUTANDO'
  const estadoClass = estadoLabel.toLowerCase().replace(' ', '-')

  // Procesos en memoria (para tabla de páginas / BCP)
  const procesosEnMemoria = [
    ...(procesoEjecucion ? [procesoEjecucion] : []),
    ...colaListos,
    ...colaBloqueados,
  ]

  // ── Vista BCP ────────────────────────────────────────────────────────────
  if (mostrarBCP) {
    const todos = [
      ...colaNew.map(p => ({ ...p, estado: 'NUEVO' })),
      ...colaListos.map(p => ({ ...p, estado: 'LISTO' })),
      ...(procesoEjecucion ? [{ ...procesoEjecucion, estado: 'EJECUCION' }] : []),
      ...colaBloqueados.map(p => ({ ...p, estado: 'BLOQUEADO' })),
      ...procesosTerminados.map(p => ({ ...p, estado: 'TERMINADO' })),
    ]
    return (
      <div className="p7-bcp">
        <h2>BCP — Reloj: {tiempoGlobal}s | Quantum: {quantum}</h2>
        <div className="p7-table-scroll">
          <table className="p7-table">
            <thead>
              <tr>
                <th>ID</th><th>Estado</th><th>Operación</th><th>Resultado</th>
                <th>Tamaño</th><th>Páginas</th><th>TME</th>
                <th>Llegada</th><th>Fin</th><th>Retorno</th>
                <th>Espera</th><th>Servicio</th><th>Restante</th><th>Respuesta</th>
              </tr>
            </thead>
            <tbody>
              {todos.map(p => {
                const servicio = p.tt ?? 0
                const retorno = p.estado === 'TERMINADO'
                  ? p.tiempoRetorno
                  : p.estado !== 'NUEVO'
                    ? tiempoGlobal - p.tiempoLlegada
                    : '—'
                return (
                  <tr key={p.id} className={p.terminadoPorError ? 'p7-row-error' : ''}>
                    <td>{p.id}</td>
                    <td>{p.estado === 'TERMINADO'
                      ? (p.terminadoPorError ? 'TERMINADO (ERROR)' : 'TERMINADO')
                      : p.estado === 'BLOQUEADO'
                        ? `BLOQUEADO (${p.tiempoEnBloqueado}/${TIEMPO_BLOQUEO})`
                        : p.estado}</td>
                    <td>{p.operacion}</td>
                    <td className={p.terminadoPorError ? 'p7-text-error' : ''}>
                      {p.estado === 'TERMINADO' ? p.resultado : '—'}
                    </td>
                    <td>{p.tamano}</td>
                    <td>{p.numPaginas}</td>
                    <td>{p.tme}</td>
                    <td>{p.estado !== 'NUEVO' ? p.tiempoLlegada : '—'}</td>
                    <td>{p.tiempoFinalizacion ?? '—'}</td>
                    <td>{retorno}</td>
                    <td>{p.tiempoEspera ?? '—'}</td>
                    <td>{servicio}</td>
                    <td>{p.estado === 'TERMINADO' ? '—' : p.tme - servicio}</td>
                    <td>{p.tiempoRespuesta ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="p7-hint">Presiona <kbd>C</kbd> para continuar</p>
      </div>
    )
  }

  // ── Vista Tabla de Páginas ──────────────────────────────────────────────
  if (mostrarTablaPaginas) {
    const libres = []
    for (let i = 0; i < PRIMER_MARCO_SO; i++) if (marcos[i] == null) libres.push(i)
    return (
      <div className="p7-paginas">
        <h2>Tabla de Páginas — Reloj: {tiempoGlobal}s</h2>
        <div className="p7-paginas-grid">
          {procesosEnMemoria.length === 0 && (
            <p className="p7-empty">No hay procesos en memoria.</p>
          )}
          {procesosEnMemoria.map(p => (
            <div key={p.id} className="p7-paginas-card">
              <h3>Proceso {p.id} <span className="p7-tag">{estadoPorPid[p.id]}</span></h3>
              <p className="p7-paginas-meta">
                Tamaño: {p.tamano} &middot; Páginas: {p.numPaginas} &middot; Última pág.: {p.bytesUltimaPagina}/5
              </p>
              <table className="p7-table p7-table-compact">
                <thead>
                  <tr><th>Página</th><th>Marco</th><th>Bytes usados</th></tr>
                </thead>
                <tbody>
                  {p.tablaPaginas.map((m, i) => (
                    <tr key={i}>
                      <td>{i}</td>
                      <td>{m}</td>
                      <td>{i === p.numPaginas - 1 ? p.bytesUltimaPagina : TAMANO_MARCO}/5</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="p7-paginas-libres">
          <h3>Marcos libres ({libres.length})</h3>
          <p>{libres.length === 0 ? '— ninguno —' : libres.join(', ')}</p>
          <p className="p7-paginas-libres-meta">
            S.O. ocupa marcos {PRIMER_MARCO_SO}–{TOTAL_MARCOS - 1}.
          </p>
        </div>
        <p className="p7-hint">Presiona <kbd>C</kbd> para continuar</p>
      </div>
    )
  }

  // Próximo candidato a admitir
  const proximoNuevo = colaNew[0]

  return (
    <div className="p7-app">

      {/* Header */}
      <header className="p7-header">
        <div className="p7-header-group">
          <div className="p7-header-item">
            <span className="p7-label">Reloj</span>
            <span className="p7-value">{tiempoGlobal}s</span>
          </div>
          <div className="p7-header-item">
            <span className="p7-label">Quantum</span>
            <span className="p7-value">{quantum}</span>
          </div>
          <div className="p7-header-item">
            <span className="p7-label">Estado</span>
            <span className={`p7-value p7-estado ${estadoClass}`}>{estadoLabel}</span>
          </div>
          <div className="p7-header-item">
            <span className="p7-label">Marcos libres</span>
            <span className="p7-value">{marcosLibres(marcos)}/{MARCOS_DISPONIBLES}</span>
          </div>
        </div>

        <button className="p7-btn-init" onClick={inicializar}>
          {iniciado ? 'Reiniciar' : 'Inicializar'}
        </button>

        <div className="p7-key-legend">
          <kbd>P</kbd><span>Pausa</span>
          <kbd>C</kbd><span>Continuar</span>
          <kbd>E</kbd><span>E/S</span>
          <kbd>W</kbd><span>Error</span>
          <kbd>N</kbd><span>Nuevo</span>
          <kbd>B</kbd><span>BCP</span>
          <kbd>T</kbd><span>Tabla Páginas</span>
        </div>
      </header>

      {finalizado ? (
        <div className="p7-final">
          <h2>Simulación Finalizada</h2>
          <p>Quantum: {quantum} | Tiempo total: {tiempoGlobal}s</p>
          <div className="p7-table-scroll">
            <table className="p7-table">
              <thead>
                <tr>
                  <th>ID</th><th>Operación</th><th>Resultado</th>
                  <th>Tamaño</th><th>Páginas</th>
                  <th>Llegada</th><th>Fin</th><th>Retorno</th>
                  <th>Respuesta</th><th>Espera</th><th>Servicio</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {procesosTerminados.map(p => (
                  <tr key={p.id} className={p.terminadoPorError ? 'p7-row-error' : ''}>
                    <td>{p.id}</td>
                    <td>{p.operacion}</td>
                    <td className={p.terminadoPorError ? 'p7-text-error' : ''}>{p.resultado}</td>
                    <td>{p.tamano}</td>
                    <td>{p.numPaginas}</td>
                    <td>{p.tiempoLlegada}</td>
                    <td>{p.tiempoFinalizacion}</td>
                    <td>{p.tiempoRetorno}</td>
                    <td>{p.tiempoRespuesta}</td>
                    <td>{p.tiempoEspera}</td>
                    <td>{p.tiempoServicio}</td>
                    <td>{p.terminadoPorError ? 'ERROR' : 'NORMAL'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="p7-btn-init" onClick={inicializar}>Nueva Simulación</button>
        </div>
      ) : (

        <div className="p7-main">

          {/* Memoria — marcos */}
          <section className="p7-section p7-memoria-section">
            <h2>Memoria ({MEMORIA_TOTAL} bytes — {TOTAL_MARCOS} marcos × {TAMANO_MARCO})</h2>
            <div className="p7-marcos-grid">
              {marcos.map((m, i) => {
                let cls = 'p7-marco'
                let fill = 0
                let pid = null
                if (m === 'SO') {
                  cls += ' p7-marco-so'
                  fill = 100
                } else if (m == null) {
                  cls += ' p7-marco-libre'
                } else {
                  pid = m.pid
                  fill = (m.bytes / TAMANO_MARCO) * 100
                  const est = estadoPorPid[m.pid]
                  if (est === 'EJECUCION') cls += ' p7-marco-exec'
                  else if (est === 'BLOQUEADO') cls += ' p7-marco-bloq'
                  else cls += ' p7-marco-listo'
                }
                return (
                  <div key={i} className={cls} title={
                    m === 'SO' ? `Marco ${i} — S.O.`
                      : m == null ? `Marco ${i} — libre`
                        : `Marco ${i} — P${m.pid} pág.${m.pageIdx} (${m.bytes}/5)`
                  }>
                    <div className="p7-marco-num">{i}</div>
                    <div className="p7-marco-fill-bg">
                      <div className="p7-marco-fill" style={{ width: `${fill}%` }}>
                        {pid != null && <span className="p7-marco-pid">P{pid}</span>}
                        {m === 'SO' && <span className="p7-marco-pid">SO</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="p7-leyenda">
              <span className="p7-leg-box p7-marco-libre"></span>Libre
              <span className="p7-leg-box p7-marco-so"></span>S.O.
              <span className="p7-leg-box p7-marco-listo"></span>Listo
              <span className="p7-leg-box p7-marco-bloq"></span>Bloqueado
              <span className="p7-leg-box p7-marco-exec"></span>En ejecución
            </div>
          </section>

          {/* Lateral */}
          <aside className="p7-side">

            <div className="p7-section">
              <h3>Cola de Nuevos: {colaNew.length}</h3>
              {proximoNuevo ? (
                <p className="p7-next-info">
                  Próximo: <strong>P{proximoNuevo.id}</strong> &middot;
                  Tamaño <strong>{proximoNuevo.tamano}</strong> &middot;
                  Necesita <strong>{proximoNuevo.numPaginas}</strong> marcos
                </p>
              ) : <p className="p7-empty">— vacía —</p>}
            </div>

            <div className="p7-section p7-section-exec">
              <h3>Proceso en Ejecución</h3>
              {procesoEjecucion ? (
                <>
                  <table className="p7-table p7-table-vertical">
                    <tbody>
                      <tr><th>ID</th><td>P{procesoEjecucion.id}</td></tr>
                      <tr><th>Operación</th><td>{procesoEjecucion.operacion}</td></tr>
                      <tr><th>Tamaño</th><td>{procesoEjecucion.tamano}</td></tr>
                      <tr><th>Páginas</th><td>{procesoEjecucion.numPaginas}</td></tr>
                      <tr><th>TME</th><td>{procesoEjecucion.tme}</td></tr>
                      <tr><th>T. CPU</th><td>{procesoEjecucion.tt}</td></tr>
                      <tr><th>T. Restante</th><td>{procesoEjecucion.tme - procesoEjecucion.tt}</td></tr>
                      <tr><th>Marcos asignados</th><td>{procesoEjecucion.tablaPaginas.join(', ')}</td></tr>
                    </tbody>
                  </table>
                  <div className="p7-quantum-box">
                    <div className="p7-quantum-header">
                      <span>Quantum</span>
                      <span>{procesoEjecucion.tiempoEnQuantum} / {quantum}</span>
                    </div>
                    <div className="p7-quantum-bar-bg">
                      <div className="p7-quantum-bar-fill"
                        style={{ width: `${Math.min((procesoEjecucion.tiempoEnQuantum / quantum) * 100, 100)}%` }} />
                    </div>
                  </div>
                </>
              ) : <p className="p7-empty">— CPU libre —</p>}
            </div>

            <div className="p7-section">
              <h3>Cola de Listos</h3>
              <table className="p7-table">
                <thead>
                  <tr><th>ID</th><th>Tam.</th><th>Pág.</th><th>TME</th><th>CPU</th></tr>
                </thead>
                <tbody>
                  {colaListos.length === 0
                    ? <tr><td colSpan={5} className="p7-empty">vacía</td></tr>
                    : colaListos.map((p, idx) => (
                      <tr key={p.id} className={idx === 0 ? 'p7-row-next' : ''}>
                        <td>P{p.id}</td>
                        <td>{p.tamano}</td>
                        <td>{p.numPaginas}</td>
                        <td>{p.tme}</td>
                        <td>{p.tt}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="p7-section">
              <h3>Cola de Bloqueados</h3>
              <table className="p7-table">
                <thead><tr><th>ID</th><th>T. Bloq.</th></tr></thead>
                <tbody>
                  {colaBloqueados.length === 0
                    ? <tr><td colSpan={2} className="p7-empty">vacía</td></tr>
                    : colaBloqueados.map(p => (
                      <tr key={p.id}>
                        <td>P{p.id}</td>
                        <td>{p.tiempoEnBloqueado}/{TIEMPO_BLOQUEO}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="p7-section">
              <h3>Terminados ({procesosTerminados.length})</h3>
              <table className="p7-table">
                <thead><tr><th>ID</th><th>Op</th><th>Res</th></tr></thead>
                <tbody>
                  {procesosTerminados.length === 0
                    ? <tr><td colSpan={3} className="p7-empty">ninguno</td></tr>
                    : procesosTerminados.map(p => (
                      <tr key={p.id} className={p.terminadoPorError ? 'p7-row-error' : ''}>
                        <td>P{p.id}</td>
                        <td>{p.operacion}</td>
                        <td className={p.terminadoPorError ? 'p7-text-error' : ''}>{p.resultado}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

          </aside>
        </div>
      )}
    </div>
  )
}
