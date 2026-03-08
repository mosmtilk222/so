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
  if (signo === '/') num2 = Math.max(1, num2) // evitar división por cero
  const op = `${num1} ${signo} ${num2}`
  const res = evaluarOperacion(op)
  if (res === 'Error') return generarOperacion() // reintento si hay error
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
    tiempoEnBloqueado: 0,         // contador del ciclo bloqueado actual
    tiempoEnBloqueadoTotal: 0,    // acumulado total en bloqueado
    tiempoEspera: 0,              // acumulado en cola de listos
    tt: 0,                        // tiempo acumulado en CPU
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
  colaNew: [],
  colaListos: [],
  procesoEjecucion: null,
  colaBloqueados: [],
  procesosTerminados: [],
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {

    case 'INIT': {
      const { procesos } = action
      return {
        ...initialState,
        iniciado: true,
        colaListos: procesos.slice(0, MAX_MEMORIA),
        colaNew: procesos.slice(MAX_MEMORIA),
      }
    }

    case 'TICK': {
      if (!state.iniciado || state.pausado || state.finalizado) return state

      const t = state.tiempoGlobal + 1
      let { colaNew, colaListos, procesoEjecucion, colaBloqueados, procesosTerminados } = state

      // 1. Avanzar proceso en ejecución
      if (procesoEjecucion) {
        const tt = procesoEjecucion.tt + 1
        if (tt >= procesoEjecucion.tme) {
          // Terminó normalmente
          const p = {
            ...procesoEjecucion,
            tt,
            tiempoFinalizacion: t,
            tiempoServicio: procesoEjecucion.tme,
            terminadoPorError: false,
            resultado: evaluarOperacion(procesoEjecucion.operacion),
            tiempoRetorno: t - procesoEjecucion.tiempoLlegada,
            tiempoRespuesta: procesoEjecucion.tiempoInicioEjecucion - procesoEjecucion.tiempoLlegada,
          }
          procesosTerminados = [...procesosTerminados, p]
          procesoEjecucion = null
        } else {
          procesoEjecucion = { ...procesoEjecucion, tt }
        }
      }

      // 2. Avanzar cola de bloqueados
      const stillBlocked = []
      const unblocked = []
      for (const p of colaBloqueados) {
        const bt = p.tiempoEnBloqueado + 1
        if (bt >= TIEMPO_BLOQUEO) {
          unblocked.push({
            ...p,
            tiempoEnBloqueado: 0,
            tiempoEnBloqueadoTotal: p.tiempoEnBloqueadoTotal + bt,
          })
        } else {
          stillBlocked.push({ ...p, tiempoEnBloqueado: bt })
        }
      }
      colaBloqueados = stillBlocked
      colaListos = [...colaListos, ...unblocked] // al final de la cola (FCFS)

      // 3. Acumular tiempo de espera en cola de listos
      colaListos = colaListos.map(p => ({ ...p, tiempoEspera: p.tiempoEspera + 1 }))

      // 4. Admitir nuevos procesos si hay espacio en memoria
      // Su hora de llegada es el momento en que entran (cuando se libera un lugar)
      let inMem = colaListos.length + (procesoEjecucion ? 1 : 0) + colaBloqueados.length
      while (inMem < MAX_MEMORIA && colaNew.length > 0) {
        const [first, ...rest] = colaNew
        colaListos = [...colaListos, { ...first, tiempoLlegada: t }]
        colaNew = rest
        inMem++
      }

      // 5. Tomar el siguiente proceso de listos si CPU libre (FCFS)
      if (!procesoEjecucion && colaListos.length > 0) {
        const [first, ...rest] = colaListos
        procesoEjecucion = {
          ...first,
          tiempoInicioEjecucion: first.tiempoInicioEjecucion ?? t,
        }
        colaListos = rest
      }

      // 6. Verificar si la simulación terminó
      const totalActivo =
        colaNew.length + colaListos.length + (procesoEjecucion ? 1 : 0) + colaBloqueados.length
      const finalizado = totalActivo === 0

      return {
        ...state,
        tiempoGlobal: t,
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

    case 'CONTINUE':
      return { ...state, pausado: false }

    case 'INTERRUPT': {
      if (!state.procesoEjecucion) return state
      return {
        ...state,
        procesoEjecucion: null,
        colaBloqueados: [
          ...state.colaBloqueados,
          { ...state.procesoEjecucion, tiempoEnBloqueado: 0 },
        ],
      }
    }

    case 'ERROR': {
      if (!state.procesoEjecucion) return state
      const p = state.procesoEjecucion
      const terminado = {
        ...p,
        tiempoFinalizacion: state.tiempoGlobal,
        tiempoServicio: p.tt,
        terminadoPorError: true,
        resultado: 'ERROR',
        tiempoRetorno: state.tiempoGlobal - p.tiempoLlegada,
        tiempoRespuesta: (p.tiempoInicioEjecucion ?? state.tiempoGlobal) - p.tiempoLlegada,
      }
      return {
        ...state,
        procesoEjecucion: null,
        procesosTerminados: [...state.procesosTerminados, terminado],
      }
    }

    default:
      return state
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const {
    iniciado, finalizado, pausado, tiempoGlobal,
    colaNew, colaListos, procesoEjecucion, colaBloqueados, procesosTerminados,
  } = state

  // Reloj global
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: 'TICK' }), 1000)
    return () => clearInterval(id)
  }, [])

  // Teclas de control
  useEffect(() => {
    const onKey = e => {
      const key = e.key.toLowerCase()
      // En pausa solo se permite continuar
      if (pausado) {
        if (key === 'c') dispatch({ type: 'CONTINUE' })
        return
      }
      switch (key) {
        case 'p': dispatch({ type: 'PAUSE' }); break
        case 'c': dispatch({ type: 'CONTINUE' }); break
        case 'i': dispatch({ type: 'INTERRUPT' }); break
        case 'e': dispatch({ type: 'ERROR' }); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pausado])

  function inicializar() {
    const input = prompt('Ingrese el número de procesos a simular:')
    const n = parseInt(input)
    if (!n || n <= 0 || isNaN(n)) return
    const procesos = Array.from({ length: n }, (_, i) => crearProceso(i + 1))
    dispatch({ type: 'INIT', procesos })
  }

  const estadoLabel = !iniciado
    ? 'NO INICIADO'
    : finalizado
    ? 'FINALIZADO'
    : pausado
    ? 'PAUSADO'
    : 'EJECUTANDO'

  const estadoClass = estadoLabel.toLowerCase().replace(' ', '-')

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
        </div>
      </header>

      {/* ── Vista final ── */}
      {finalizado ? (
        <div className="final-container">
          <h2 className="final-title">Simulación Finalizada — Resumen de Procesos</h2>
          <div className="table-scroll">
            <table className="table table-final">
              <thead>
                <tr>
                  <th>N°</th>
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
                    <td>{p.tiempoEspera}</td>
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
            <h2>Cola de Listos</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>TME</th>
                  <th>T. Transcurrido</th>
                </tr>
              </thead>
              <tbody>
                {colaListos.length === 0
                  ? <tr><td colSpan={3} className="empty-cell">vacía</td></tr>
                  : colaListos.map(p => (
                    <tr key={p.id}>
                      <td>{p.id}</td>
                      <td>{p.tme}</td>
                      <td>{p.tt}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          {/* Proceso en Ejecución */}
          <div className="section section-exec">
            <h2>Proceso en Ejecución</h2>
            {procesoEjecucion ? (
              <table className="table table-vertical">
                <tbody>
                  <tr><th>ID</th><td>{procesoEjecucion.id}</td></tr>
                  <tr><th>Operación</th><td>{procesoEjecucion.operacion}</td></tr>
                  <tr><th>TME</th><td>{procesoEjecucion.tme}</td></tr>
                  <tr><th>Tiempo Ejecutado</th><td>{procesoEjecucion.tt}</td></tr>
                  <tr><th>Tiempo Restante</th><td>{procesoEjecucion.tme - procesoEjecucion.tt}</td></tr>
                  <tr><th>T. Espera acum.</th><td>{procesoEjecucion.tiempoEspera}</td></tr>
                  <tr><th>T. Llegada</th><td>{procesoEjecucion.tiempoLlegada}</td></tr>
                  <tr><th>1ª Ejecución</th><td>{procesoEjecucion.tiempoInicioEjecucion ?? '—'}</td></tr>
                </tbody>
              </table>
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
                      <td>{p.tiempoEnBloqueado} / {TIEMPO_BLOQUEO}</td>
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
