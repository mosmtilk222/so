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
  const stateRef = useRef({ lote, lotesPendientes, procesoActual, pausado })
  const [tiempoGlobal, setTiempoGlobal] = useState(0)
  const [pausado, setPausado] = useState(false)


  useEffect(() => {
    stateRef.current = { lote, lotesPendientes, procesoActual, pausado }
  }, [lote, lotesPendientes, procesoActual, pausado])

  useEffect(() => {
    const id = setInterval(() => {
      const { lote: loteActual, lotesPendientes: pendientes, procesoActual: proc, pausado } = stateRef.current

      if (pausado){
        return
      } 

      if (proc) {
        setTiempoGlobal(prev => prev + 1)
        const tt = proc.tt + 1
        const tr = proc.tme - tt
        if (tt >= proc.tme) {
          setProcesosTerminados(prev => [...prev, {
            id: proc.id,
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
          tt: first.tt ?? 0,
          tr: first.tme - (first.tt ?? 0)
        })
        setLote(resto)
      } else if (pendientes.length > 0) {
        setLote(pendientes[0])
        setLotesPendientes(prev => prev.slice(1))
      }else {
        setPausado(true)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    function handleKeyDown(e) {
      const key = e.key.toLowerCase()

      if (key === 'p'){
        setPausado(true)
      } 
      if (key === 'c'){
        setPausado(false)
      } 
      if (key === 'i') {
        if (procesoActual) {
          setLote(prev => [...prev, procesoActual])
          setProcesoActual(null)
        }
      }
      if (key === 'e') {
        if (procesoActual) {
          setProcesosTerminados(prev => [...prev, {
            id: procesoActual.id,
            operacion: procesoActual.operacion,
            resultado: 'ERROR',
            numeroLote: procesoActual.numeroLote
          }])
          setProcesoActual(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [procesoActual])

  function inicializarApp() {
    const cantidadTrabajos = parseInt(prompt("Digite la cantidad de procesos: (5p/lote)"))

    if (!cantidadTrabajos || cantidadTrabajos <= 0){
      return
    } 

    const signos = ['+', '-', '*', '/', '%', '**']
    const tamañoLote = 5
    const grupoLotes = []

    for (let i = 0; i < cantidadTrabajos; i += tamañoLote) {
      const loteActual = []
      for (let j = 0; j < tamañoLote && i + j < cantidadTrabajos; j++) {
        const id = i + j + 1
        let numero1 = Math.floor(Math.random() * 10) + 1
        let numero2 = Math.floor(Math.random() * 10) + 1
        const signo = signos[Math.floor(Math.random() * signos.length)]

        if ((signo === '/' || signo === '%') && numero2 === 0) numero2 = 1
        loteActual.push({
          id,
          operacion: `${numero1} ${signo} ${numero2}`,
          tme: Math.floor(Math.random() * 15) + 6,
          numeroLote: grupoLotes.length + 1,
          tt: 0
        })
      }
      grupoLotes.push(loteActual)
    }
    setLote(grupoLotes[0] || [])
    setLotesPendientes(grupoLotes.slice(1))
    setProcesoActual(null)
    setProcesosTerminados([])
    setTiempoGlobal(0)
    setPausado(false)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h3>Lotes pendientes: {lotesPendientes.length}</h3>
        <h3>Estado: {pausado ? "PAUSADO" : "EJECUTANDO"}</h3>
        <button className="btn-initialize" onClick={inicializarApp}>
          Inicializar
        </button>
      </header>
      <div className="app-container">
        <div className="section section-left">
          <h2>Lote actual</h2>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>TME</th>
                <th>TT</th>
              </tr>
            </thead>
            <tbody>
              {lote.map(proc => (
                <tr key={proc.id}>
                  <td>{proc.id}</td>
                  <td>{proc.tme}</td>
                  <td>{proc.tt ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="section section-middle">
          <h2>Proceso en ejecución</h2>
          <table className="table table-vertical">
            <tbody>
              <tr><th>ID</th><td>{procesoActual?.id ?? '—'}</td></tr>
              <tr><th>Operación</th><td>{procesoActual?.operacion ?? '—'}</td></tr>
              <tr><th>TME</th><td>{procesoActual?.tme ?? '—'}</td></tr>
              <tr><th>TT</th><td>{procesoActual?.tt ?? '—'}</td></tr>
              <tr><th>TR</th><td>{procesoActual?.tr ?? '—'}</td></tr>
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
              </tr>
            </thead>
            <tbody>
              {procesosTerminados.map(proc => (
                <tr key={proc.id}>
                  <td>{proc.id}</td>
                  <td>{proc.operacion}</td>
                  <td>{proc.resultado}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Contador global: {tiempoGlobal}s</h3>
        </div>
      </div>
    </div>
  )
}
export default App
