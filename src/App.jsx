import { useReducer, useEffect } from 'react'
import './App.css'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function evaluarOperacion(operacion) {
  try {
    // eslint-disable-next-line no-eval
    const result = eval(operacion)
    if (!isFinite(result) || isNaN(result)) return 'Error'
    return Number.isInteger(result) ? result : Math.round(result * 100) / 100
  } catch {
    return 'Error'
  }
}

function generarOperacion() {
  const signos = ['+', '-', '*', '/']
  const num1 = Math.floor(Math.random() * 10) + 1
  let num2 = Math.floor(Math.random() * 10) + 1
  const signo = signos[Math.floor(Math.random() * signos.length)]
  if (signo === '/') num2 = Math.max(1, num2)
  const op = `${num1} ${signo} ${num2}`
  const res = evaluarOperacion(op)
  if (res === 'Error') return generarOperacion()
  return op
}

function crearProceso(id) {
  return {
    id,
    operacion: generarOperacion(),
    tme: Math.floor(Math.random() * 15) + 6, // entre 6 y 20
    tiempoLlegada: 0,
    tiempoInicioEjecucion: null,
    tiempoFinalizacion: null,
    tiempoEnBloqueado: 0,
    tiempoEnBloqueadoTotal: 0,
    tiempoEspera: 0,
    tiempoRespuesta: null,
    tt: 0,                  // tiempo acumulado en CPU
    tiempoServicio: 0,
    tiempoEnQuantum: 0,     // tiempo transcurrido en el quantum actual
  }
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_MEMORIA = 5
const TIEMPO_BLOQUEO = 8

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
  mostrarBCP: false,
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {

    case 'INIT': {
      const { procesos, quantum } = action
      const enMemoria = procesos.slice(0, MAX_MEMORIA)
      const primero = enMemoria[0] ?? null
      const resto = enMemoria.slice(1)

      return {
        ...initialState,
        iniciado: true,
        quantum,
        procesoEjecucion: primero
          ? {
            ...primero,
            tiempoLlegada: 0,
            tiempoInicioEjecucion: 0,
            tiempoRespuesta: 0,
            tiempoEnQuantum: 0,
          }
          : null,
        colaListos: resto.map(p => ({ ...p, tiempoLlegada: 0 })),
        colaNew: procesos.slice(MAX_MEMORIA),
      }
    }

    case 'TICK': {
      if (!state.iniciado || state.pausado || state.finalizado) return state

      const t = state.tiempoGlobal
      const quantum = state.quantum
      let { colaNew, colaListos, procesoEjecucion, colaBloqueados, procesosTerminados } = state

      // --- 1. Proceso en Ejecución (Round-Robin) ---
      if (procesoEjecucion) {
        const tt = procesoEjecucion.tt + 1
        const tiempoEnQuantum = procesoEjecucion.tiempoEnQuantum + 1

        if (tt >= procesoEjecucion.tme) {
          // Proceso terminó normalmente
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
              terminadoPorError: false,
              resultado: evaluarOperacion(procesoEjecucion.operacion),
              tiempoRetorno,
              tiempoRespuesta:
                (procesoEjecucion.tiempoInicioEjecucion ?? t) - procesoEjecucion.tiempoLlegada,
            },
          ]
          procesoEjecucion = null

        } else if (tiempoEnQuantum >= quantum) {
          // Quantum agotado → preemptar (Round-Robin)
          colaListos = [
            ...colaListos,
            {
              ...procesoEjecucion,
              tt,
              tiempoServicio: tt,
              tiempoEnQuantum: 0,
            },
          ]
          procesoEjecucion = null

        } else {
          procesoEjecucion = {
            ...procesoEjecucion,
            tt,
            tiempoEnQuantum,
            tiempoServicio: tt,
          }
        }
      }

      // --- 2. Cola de Bloqueados ---
      const stillBlocked = []
      const unblocked = []
      for (const p of colaBloqueados) {
        const bt = p.tiempoEnBloqueado + 1
        if (bt >= TIEMPO_BLOQUEO) {
          unblocked.push({ ...p, tiempoEnBloqueado: 0, tiempoServicio: p.tt })
        } else {
          stillBlocked.push({ ...p, tiempoEnBloqueado: bt })
        }
      }
      colaBloqueados = stillBlocked
      colaListos = [...colaListos, ...unblocked]

      // --- 3. Cola de Listos: incrementar espera ---
      colaListos = colaListos.map(p => ({ ...p, tiempoEspera: p.tiempoEspera + 1 }))

      // --- 4. Admitir nuevos procesos si hay espacio en memoria ---
      let inMem = colaListos.length + (procesoEjecucion ? 1 : 0) + colaBloqueados.length
      while (inMem < MAX_MEMORIA && colaNew.length > 0) {
        const [first, ...rest] = colaNew
        colaListos = [...colaListos, { ...first, tiempoLlegada: t + 1, tiempoServicio: 0 }]
        colaNew = rest
        inMem++
      }

      // --- 5. Despachar siguiente proceso si CPU libre (Round-Robin: FIFO de la cola) ---
      if (!procesoEjecucion && colaListos.length > 0) {
        const [first, ...rest] = colaListos
        const inicio = first.tiempoInicioEjecucion ?? (t + 1)
        procesoEjecucion = {
          ...first,
          tiempoEnQuantum: 0,
          tiempoInicioEjecucion: inicio,
          tiempoRespuesta:
            first.tiempoRespuesta ?? (inicio - first.tiempoLlegada),
        }
        colaListos = rest
      }

      // --- 6. Verificar fin de simulación ---
      const totalActivo =
        colaNew.length +
        colaListos.length +
        (procesoEjecucion ? 1 : 0) +
        colaBloqueados.length
      const finalizado = totalActivo === 0

      return {
        ...state,
        tiempoGlobal: t + 1,
        colaNew,
        colaListos,
        procesoEjecucion,
        colaBloqueados,
        procesosTerminados,
        finalizado,
      }
    }

    case 'PAUSE':
      return { ...state, pausado: true }

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
      const tiempoFinalizacion = state.tiempoGlobal + 1
      const tiempoRetorno = tiempoFinalizacion - p.tiempoLlegada
      const tiempoServicio = p.tt
      const tiempoEspera = tiempoRetorno - tiempoServicio
      return {
        ...state,
        procesoEjecucion: null,
        procesosTerminados: [
          ...state.procesosTerminados,
          {
            ...p,
            tiempoFinalizacion,
            tiempoServicio,
            tiempoEspera,
            terminadoPorError: true,
            resultado: 'ERROR',
            tiempoRetorno,
            tiempoRespuesta: (p.tiempoInicioEjecucion ?? state.tiempoGlobal) - p.tiempoLlegada,
          },
        ],
      }
    }

    case 'NEW_PROCESS': {
      if (state.finalizado) return state
      const nuevo = crearProceso(
        state.colaNew.length +
        state.colaListos.length +
        state.colaBloqueados.length +
        state.procesosTerminados.length +
        (state.procesoEjecucion ? 1 : 0) + 1
      )
      let colaNew = [...state.colaNew]
      let colaListos = [...state.colaListos]
      const inMem =
        colaListos.length + (state.procesoEjecucion ? 1 : 0) + state.colaBloqueados.length
      if (inMem < MAX_MEMORIA) {
        colaListos.push({ ...nuevo, tiempoLlegada: state.tiempoGlobal, tiempoServicio: 0 })
      } else {
        colaNew.push(nuevo)
      }
      return { ...state, colaNew, colaListos }
    }

    case 'SHOW_BCP':
      if (state.finalizado) return state
      return { ...state, pausado: true, mostrarBCP: true }

    case 'CONTINUE':
      return { ...state, pausado: false, mostrarBCP: false }

    default:
      return state
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const {
    iniciado, finalizado, pausado, tiempoGlobal, quantum,
    colaNew, colaListos, procesoEjecucion, colaBloqueados, procesosTerminados,
    mostrarBCP,
  } = state

  const todosProcesos = [
    ...colaNew.map(p => ({ ...p, estado: 'NUEVO' })),
    ...colaListos.map(p => ({ ...p, estado: 'LISTO' })),
    ...(procesoEjecucion ? [{ ...procesoEjecucion, estado: 'EJECUTANDO' }] : []),
    ...colaBloqueados.map(p => ({ ...p, estado: 'BLOQUEADO' })),
    ...procesosTerminados.map(p => ({ ...p, estado: 'TERMINADO' })),
  ]

  const obtenerEspera = p => {
    if (p.tiempoFinalizacion != null) {
      return p.tiempoFinalizacion - p.tiempoLlegada - p.tiempoServicio
    }
    if (p.estado === 'NUEVO') return 0
    return tiempoGlobal - p.tiempoLlegada - (p.tt ?? 0)
  }

  // Reloj global
  useEffect(() => {
    if (!iniciado || pausado || finalizado) return
    const id = setInterval(() => dispatch({ type: 'TICK' }), 1000)
    return () => clearInterval(id)
  }, [iniciado, pausado, finalizado])

  // Teclas de control
  useEffect(() => {
    const onKey = e => {
      const key = e.key.toLowerCase()
      if (pausado) {
        if (key === 'c') dispatch({ type: 'CONTINUE' })
        if (key === 'b') dispatch({ type: 'SHOW_BCP' })
        return
      }
      if (finalizado) return
      switch (key) {
        case 'p': dispatch({ type: 'PAUSE' }); break
        case 'c': dispatch({ type: 'CONTINUE' }); break
        case 'i': dispatch({ type: 'INTERRUPT' }); break
        case 'e': dispatch({ type: 'ERROR' }); break
        case 'n': dispatch({ type: 'NEW_PROCESS' }); break
        case 'b': dispatch({ type: 'SHOW_BCP' }); break
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

  const estadoLabel = !iniciado
    ? 'NO INICIADO'
    : finalizado
      ? 'FINALIZADO'
      : pausado
        ? 'PAUSADO'
        : 'EJECUTANDO'

  const estadoClass = estadoLabel.toLowerCase().replace(' ', '-')

  // ── Vista BCP ──────────────────────────────────────────────────────────────
  if (mostrarBCP) {
    const getEstadoLabel = p => {
      if (p.estado === 'NUEVO') return 'NUEVO'
      if (p.estado === 'TERMINADO')
        return p.terminadoPorError ? 'TERMINADO (ERROR)' : 'TERMINADO (NORMAL)'
      if (p.estado === 'BLOQUEADO')
        return `BLOQUEADO (${p.tiempoEnBloqueado}/${TIEMPO_BLOQUEO})`
      return p.estado
    }

    return (
      <div className="bcp-container">
        <h2>Tabla de Procesos (BCP) — Reloj: {tiempoGlobal}s | Quantum: {quantum}</h2>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Estado</th>
              <th>Operación</th>
              <th>Resultado</th>
              <th>Llegada</th>
              <th>Finalización</th>
              <th>Retorno</th>
              <th>Espera</th>
              <th>Servicio (CPU)</th>
              <th>Restante</th>
              <th>Respuesta</th>
            </tr>
          </thead>
          <tbody>
            {todosProcesos.map(p => {
              const servicioActual = p.tt ?? 0
              const retorno = p.estado === 'TERMINADO'
                ? p.tiempoRetorno
                : p.estado !== 'NUEVO'
                  ? tiempoGlobal - p.tiempoLlegada
                  : '—'
              return (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{getEstadoLabel(p)}</td>
                  <td>{p.estado !== 'NUEVO' ? p.operacion : '—'}</td>
                  <td>{p.estado === 'TERMINADO' ? p.resultado : '—'}</td>
                  <td>{p.estado !== 'NUEVO' ? p.tiempoLlegada : '—'}</td>
                  <td>{p.tiempoFinalizacion ?? '—'}</td>
                  <td>{retorno}</td>
                  <td>{p.estado !== 'NUEVO' ? obtenerEspera(p) : '—'}</td>
                  <td>{p.estado !== 'NUEVO' ? servicioActual : '—'}</td>
                  <td>{p.estado === 'TERMINADO' ? '—' : (p.tme - servicioActual)}</td>
                  <td>{p.tiempoRespuesta ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="bcp-hint">Presiona C para continuar</p>
      </div>
    )
  }

  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-group">
          <div className="header-item">
            <span className="label">Procesos Nuevos</span>
            <span className="value">{colaNew.length}</span>
          </div>
          <div className="header-item">
            <span className="label">Quantum</span>
            <span className="value quantum-val">{quantum}</span>
          </div>
          <div className="header-item">
            <span className="label">Estado</span>
            <span className={`value estado ${estadoClass}`}>{estadoLabel}</span>
          </div>
          <div className="header-item">
            <span className="label">Reloj</span>
            <span className="value reloj">{tiempoGlobal}s</span>
          </div>
        </div>

        <button className="btn-init" onClick={inicializar}>
          {iniciado ? 'Reiniciar' : 'Inicializar'}
        </button>

        <div className="key-legend">
          <kbd>P</kbd><span>Pausa</span>
          <kbd>C</kbd><span>Continuar</span>
          <kbd>I</kbd><span>Interrupción E/S</span>
          <kbd>E</kbd><span>Error</span>
          <kbd>N</kbd><span>Nuevo</span>
          <kbd>B</kbd><span>BCP</span>
        </div>
      </header>

      {/* ── Vista final ── */}
      {finalizado ? (
        <div className="final-container">
          <h2 className="final-title">Simulación Finalizada — Tabla de Procesos</h2>
          <p className="final-subtitle">Quantum: {quantum} | Tiempo total: {tiempoGlobal}s</p>
          <div className="table-scroll">
            <table className="table table-final">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Operación</th>
                  <th>Resultado</th>
                  <th>T. Llegada</th>
                  <th>T. Finalización</th>
                  <th>T. Retorno</th>
                  <th>T. Respuesta</th>
                  <th>T. Espera</th>
                  <th>T. Servicio</th>
                  <th>Fin</th>
                </tr>
              </thead>
              <tbody>
                {procesosTerminados.map(p => (
                  <tr key={p.id} className={p.terminadoPorError ? 'row-error' : 'row-ok'}>
                    <td>{p.id}</td>
                    <td>{p.operacion}</td>
                    <td className={p.terminadoPorError ? 'text-error' : 'text-ok'}>{p.resultado}</td>
                    <td>{p.tiempoLlegada}</td>
                    <td>{p.tiempoFinalizacion}</td>
                    <td>{p.tiempoRetorno}</td>
                    <td>{p.tiempoRespuesta}</td>
                    <td>{obtenerEspera(p)}</td>
                    <td>{p.tiempoServicio}</td>
                    <td className={p.terminadoPorError ? 'text-error' : 'text-ok'}>
                      {p.terminadoPorError ? 'ERROR' : 'NORMAL'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn-init" style={{ marginTop: '1.5rem' }} onClick={inicializar}>
            Nueva Simulación
          </button>
        </div>

      ) : (

        /* ── Vista de simulación ── */
        <div className="app-container">

          {/* Cola de Listos */}
          <div className="section">
            <h2>Cola de Listos (Round-Robin)</h2>
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  <th>ID</th>
                  <th>TME</th>
                  <th>T. Transcurrido</th>
                  <th>T. Restante</th>
                </tr>
              </thead>
              <tbody>
                {colaListos.length === 0
                  ? <tr><td colSpan={5} className="empty-cell">vacía</td></tr>
                  : colaListos.map((p, idx) => (
                    <tr key={p.id} className={idx === 0 ? 'row-next' : ''}>
                      <td className="carousel-arrow">{idx === 0 ? '▶' : ''}</td>
                      <td>{p.id}</td>
                      <td>{p.tme}</td>
                      <td>{p.tt}</td>
                      <td>{p.tme - p.tt}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
            {colaListos.length > 0 && (
              <p className="carousel-label">▶ próximo en ejecutar</p>
            )}
          </div>

          {/* Proceso en Ejecución */}
          <div className="section section-exec">
            <h2>Proceso en Ejecución</h2>
            {procesoEjecucion ? (
              <>
                <table className="table table-vertical">
                  <tbody>
                    <tr><th>ID</th><td>{procesoEjecucion.id}</td></tr>
                    <tr><th>Operación</th><td>{procesoEjecucion.operacion}</td></tr>
                    <tr><th>TME</th><td>{procesoEjecucion.tme}</td></tr>
                    <tr><th>T. Transcurrido (CPU)</th><td>{procesoEjecucion.tt}</td></tr>
                    <tr><th>T. Restante</th><td>{procesoEjecucion.tme - procesoEjecucion.tt}</td></tr>
                    <tr><th>T. Espera acum.</th><td>{procesoEjecucion.tiempoEspera}</td></tr>
                    <tr><th>T. Llegada</th><td>{procesoEjecucion.tiempoLlegada}</td></tr>
                    <tr><th>1ª Ejecución</th><td>{procesoEjecucion.tiempoInicioEjecucion ?? '—'}</td></tr>
                  </tbody>
                </table>
                {/* Barra de Quantum */}
                <div className="quantum-box">
                  <div className="quantum-header">
                    <span>Quantum</span>
                    <span className="quantum-counter">
                      {procesoEjecucion.tiempoEnQuantum} / {quantum}
                    </span>
                  </div>
                  <div className="quantum-bar-bg">
                    <div
                      className="quantum-bar-fill"
                      style={{
                        width: `${Math.min(
                          (procesoEjecucion.tiempoEnQuantum / quantum) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="empty-label">— CPU libre —</p>
            )}
          </div>

          {/* Cola de Bloqueados */}
          <div className="section section-blocked">
            <h2>Cola de Bloqueados</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>T. en Bloqueado</th>
                </tr>
              </thead>
              <tbody>
                {colaBloqueados.length === 0
                  ? <tr><td colSpan={2} className="empty-cell">vacía</td></tr>
                  : colaBloqueados.map(p => (
                    <tr key={p.id}>
                      <td>{p.id}</td>
                      <td>
                        <span className="blocked-timer">
                          {p.tiempoEnBloqueado} / {TIEMPO_BLOQUEO}
                        </span>
                        <div className="blocked-bar-bg">
                          <div
                            className="blocked-bar-fill"
                            style={{ width: `${(p.tiempoEnBloqueado / TIEMPO_BLOQUEO) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          {/* Procesos Terminados */}
          <div className="section">
            <h2>Procesos Terminados</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Operación</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {procesosTerminados.length === 0
                  ? <tr><td colSpan={3} className="empty-cell">ninguno</td></tr>
                  : procesosTerminados.map(p => (
                    <tr key={p.id} className={p.terminadoPorError ? 'row-error' : ''}>
                      <td>{p.id}</td>
                      <td>{p.operacion}</td>
                      <td className={p.terminadoPorError ? 'text-error' : 'text-ok'}>
                        {p.resultado}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

        </div>
      )}
    </div>
  )
}
