import { useState, useEffect, useRef } from 'react'
import './App.css'

function evaluarOperacion(operacion) {
  try {
    const result = eval(operacion)
    return Number.isInteger(result) ? result : Math.round(result * 100) / 100
  } catch {
    return 'Error'
  }
}

function App() {
  const [lote, setLote] = useState([])
  const [lotesPendientes, setLotesPendientes] = useState([])
  const [procesoActual, setProcesoActual] = useState(null)
  const [procesosTerminados, setProcesosTerminados] = useState([])
  const stateRef = useRef({ lote, lotesPendientes, procesoActual })

  useEffect(() => {
    stateRef.current = { lote, lotesPendientes, procesoActual }
  }, [lote, lotesPendientes, procesoActual])

  useEffect(() => {
    const id = setInterval(() => {
      const { lote: loteActual, lotesPendientes: pendientes, procesoActual: proc } = stateRef.current
      if (proc) {
        const tt = proc.tt + 1
        const tr = proc.tme - tt
        if (tt >= proc.tme) {
          setProcesosTerminados(prev => [...prev, {
            id: proc.id,
            nombre: proc.nombre,
            operacion: proc.operacion,
            resultado: evaluarOperacion(proc.operacion),
            numeroLote: proc.numeroLote
          }])
          setProcesoActual(null)
        } else {
          setProcesoActual(prev => prev ? { ...prev, tt, tr } : null)
        }
      } else if (loteActual.length > 0) {
        const [first, ...resto] = loteActual
        setProcesoActual({
          ...first,
          tt: 0,
          tr: first.tme,
        })
        setLote(resto)
      } else if (pendientes.length > 0) {
        setLote(pendientes[0])
        setLotesPendientes(prev => prev.slice(1))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  function inicializarApp() {
    const signos = ['+', '-', '*', '/']
    const cantidadLotes = 3
    const operacionesPorLote = 5
    const grupoLotes = Array.from({ length: cantidadLotes }, (_, idxLote) => {
      const numeroLote = idxLote + 1
      return Array.from({ length: operacionesPorLote }, (_, i) => {
        const id = idxLote * operacionesPorLote + i + 1
        const numero1 = Math.floor(Math.random() * 10) + 1
        const numero2 = Math.floor(Math.random() * 10) + 1
        const signo = signos[Math.floor(Math.random() * signos.length)]
        return {
          id,
          nombre: `Operación ${id}`,
          operacion: `${numero1} ${signo} ${numero2}`,
          tme: Math.floor(Math.random() * 10) + 1,
          numeroLote
        }
      })
    })
    setLote(grupoLotes[0])
    setLotesPendientes(grupoLotes.slice(1))
    setProcesoActual(null)
    setProcesosTerminados([])
  }

  return (
    <div className="app">
      <header className="app-header">
        <h3>Lotes pendientes: {lotesPendientes.length}</h3>
        <button type="button" className="btn-initialize" onClick={inicializarApp}>
          Inicializar
        </button>
      </header>
      <div className="app-container">
      <div className="section section-left">
        <h2>Lote actual</h2>
        <table className="table table-lote">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>TME</th>
            </tr>
          </thead>
          <tbody>
            {lote.map((proc) => (
              <tr key={proc.id}>
                <td>{proc.id}</td>
                <td>{proc.nombre}</td>
                <td>{proc.tme}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section section-middle">
        <h2>Proceso en ejecución</h2>
        <table className="table table-vertical">
          <tbody>
            <tr>
              <th>Nombre</th>
              <td>{procesoActual?.nombre ?? '—'}</td>
            </tr>
            <tr>
              <th>Opeación</th>
              <td>{procesoActual?.operacion ?? '—'}</td>
            </tr>
            <tr>
              <th>Tiempo medio de ejecución</th>
              <td>{procesoActual?.tme ?? '—'}</td>
            </tr>
            <tr>
              <th>ID</th>
              <td>{procesoActual?.id ?? '—'}</td>
            </tr>
            <tr>
              <th>Tiempo transcurrido</th>
              <td>{procesoActual?.tt ?? '—'}</td>
            </tr>
            <tr>
              <th>Tiempo restante</th>
              <td>{procesoActual?.tr ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="section section-right">
        <h2>Procesos terminados</h2>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Operación</th>
              <th>Resultado</th>
              <th>Número de lote</th>
            </tr>
          </thead>
          <tbody>
            {procesosTerminados.map((proc) => (
              <tr key={proc.id}>
                <td>{proc.id}</td>
                <td>{proc.operacion}</td>
                <td>{proc.resultado}</td>
                <td>{proc.numeroLote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  )
}

export default App
