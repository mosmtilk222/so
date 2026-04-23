import React, { useReducer, useEffect } from 'react';
import './Programa6.css';

const TAMANO_BUFFER = 18;
const TICK_MS = 900;

const generarDatoAleatorio = () => {
  const caracteres = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#!@%';
  return caracteres.charAt(Math.floor(Math.random() * caracteres.length));
};

const randomEntre = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const nuevoAgenteDormido = () => ({
  estado: 'Dormido',
  itemsRestantes: 0,
  sleepTicks: randomEntre(2, 6)
});

const initialState = {
  buffer: Array(TAMANO_BUFFER).fill(null),
  punteroP: 0,
  punteroC: 0,
  productor: nuevoAgenteDormido(),
  consumidor: nuevoAgenteDormido(),
  lockHolder: null,
  logs: ["Presiona 'Enter' para iniciar y 'Esc' para terminar."],
  totalItems: 0,
  corriendo: false,
  finalizado: false
};

const convertirADormido = (agente) => ({
  ...agente,
  estado: 'Dormido',
  itemsRestantes: 0,
  sleepTicks: randomEntre(2, 6)
});

const avanzarSueño = (agente, nombre, logs) => {
  if (agente.estado !== 'Dormido') return agente;
  const siguiente = agente.sleepTicks - 1;
  if (siguiente <= 0) {
    logs.push(`${nombre} despierta e intenta entrar al buffer.`);
    return { ...agente, estado: 'Intentando', sleepTicks: 0 };
  }
  return { ...agente, sleepTicks: siguiente };
};

const procesarIntento = (state, actor, logs) => {
  if (state.lockHolder) return;

  if (actor === 'productor') {
    if (state.productor.estado !== 'Intentando') return;
    const espaciosDisponibles = TAMANO_BUFFER - state.totalItems;
    if (espaciosDisponibles <= 0) {
      logs.push('Productor intenta entrar, pero el buffer esta lleno. Se duerme.');
      state.productor = convertirADormido(state.productor);
      return;
    }
    const lote = randomEntre(3, 6);
    state.productor = { ...state.productor, estado: 'Trabajando', itemsRestantes: lote };
    state.lockHolder = 'productor';
    logs.push(`Productor entra al buffer y producira ${lote} elementos.`);
    return;
  }

  if (state.consumidor.estado !== 'Intentando') return;
  if (state.totalItems <= 0) {
    logs.push('Consumidor intenta entrar, pero el buffer esta vacio. Se duerme.');
    state.consumidor = convertirADormido(state.consumidor);
    return;
  }
  const lote = randomEntre(3, 6);
  state.consumidor = { ...state.consumidor, estado: 'Trabajando', itemsRestantes: lote };
  state.lockHolder = 'consumidor';
  logs.push(`Consumidor entra al buffer y consumira hasta ${lote} elementos.`);
};

function reducer(state, action) {
  switch (action.type) {
    case 'INICIAR':
      return {
        ...state,
        corriendo: true,
        finalizado: false,
        logs: ['Simulacion iniciada. Productor y consumidor en su ciclo de sueno/trabajo.']
      };

    case 'STOP':
      return { ...state, corriendo: false, finalizado: true, logs: ['Simulacion detenida por tecla ESC.'] };

    case 'TICK': {
      if (!state.corriendo || state.finalizado) return state;

      const newState = {
        ...state,
        buffer: [...state.buffer],
        productor: { ...state.productor },
        consumidor: { ...state.consumidor }
      };
      const newLogs = [];

      if (newState.lockHolder === 'productor' && newState.productor.estado === 'Trabajando') {
        if (newState.totalItems < TAMANO_BUFFER && newState.productor.itemsRestantes > 0) {
          const casilla = newState.punteroP + 1;
          const valor = generarDatoAleatorio();
          newState.buffer[newState.punteroP] = valor;
          newState.punteroP = (newState.punteroP + 1) % TAMANO_BUFFER;
          newState.totalItems += 1;
          newState.productor.itemsRestantes -= 1;
          newLogs.push(`Productor coloca "${valor}" en casilla ${casilla}.`);
        }

        const sinEspacio = newState.totalItems >= TAMANO_BUFFER;
        if (newState.productor.itemsRestantes <= 0 || sinEspacio) {
          if (sinEspacio && newState.productor.itemsRestantes > 0) {
            newLogs.push('Productor se detiene: buffer lleno.');
          } else {
            newLogs.push('Productor termina su tanda y vuelve a dormir.');
          }
          newState.productor = convertirADormido(newState.productor);
          newState.lockHolder = null;
        }
      } else if (newState.lockHolder === 'consumidor' && newState.consumidor.estado === 'Trabajando') {
        if (newState.totalItems > 0 && newState.consumidor.itemsRestantes > 0) {
          const casilla = newState.punteroC + 1;
          const valor = newState.buffer[newState.punteroC];
          newState.buffer[newState.punteroC] = null;
          newState.punteroC = (newState.punteroC + 1) % TAMANO_BUFFER;
          newState.totalItems -= 1;
          newState.consumidor.itemsRestantes -= 1;
          newLogs.push(`Consumidor retira "${valor ?? '-'}" de casilla ${casilla}.`);
        }

        const sinProducto = newState.totalItems <= 0;
        if (newState.consumidor.itemsRestantes <= 0 || sinProducto) {
          if (sinProducto && newState.consumidor.itemsRestantes > 0) {
            newLogs.push('Consumidor se detiene: buffer vacio.');
          } else {
            newLogs.push('Consumidor termina su tanda y vuelve a dormir.');
          }
          newState.consumidor = convertirADormido(newState.consumidor);
          newState.lockHolder = null;
        }
      } else {
        newState.productor = avanzarSueño(newState.productor, 'Productor', newLogs);
        newState.consumidor = avanzarSueño(newState.consumidor, 'Consumidor', newLogs);

        const ambosIntentan = newState.productor.estado === 'Intentando' && newState.consumidor.estado === 'Intentando';
        if (ambosIntentan) {
          const primero = Math.random() < 0.5 ? 'productor' : 'consumidor';
          const segundo = primero === 'productor' ? 'consumidor' : 'productor';
          newLogs.push(
            primero === 'productor'
              ? 'Ambos intentan entrar; Productor obtiene el turno primero.'
              : 'Ambos intentan entrar; Consumidor obtiene el turno primero.'
          );
          procesarIntento(newState, primero, newLogs);
          if (!newState.lockHolder) {
            procesarIntento(newState, segundo, newLogs);
          }
        } else {
          procesarIntento(newState, 'productor', newLogs);
          if (!newState.lockHolder) {
            procesarIntento(newState, 'consumidor', newLogs);
          }
        }
      }

      if (newLogs.length === 0) {
        newLogs.push(
          newState.lockHolder
            ? `${newState.lockHolder === 'productor' ? 'Productor' : 'Consumidor'} trabajando.`
            : 'Ambos dormidos o esperando su turno.'
        );
      }

      newState.logs = [...newLogs, ...state.logs].slice(0, 14);
      return newState;
    }
    default:
      return state;
  }
}

export default function Programa6() {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') dispatch({ type: 'STOP' });
      if (e.key === 'Enter' && !state.corriendo) dispatch({ type: 'INICIAR' });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.corriendo]);

  useEffect(() => {
    let interval;
    if (state.corriendo && !state.finalizado) {
      interval = setInterval(() => dispatch({ type: 'TICK' }), TICK_MS);
    }
    return () => clearInterval(interval);
  }, [state.corriendo, state.finalizado]);

  return (
    <div className="p6-container">
      <header>
        <h2>Programa 6 - Productor / Consumidor</h2>
        {state.finalizado && <h3 className="finalizado">SIMULACION FINALIZADA</h3>}
        <p className="status-line">
          Buffer: <strong>{state.totalItems}</strong> / {TAMANO_BUFFER} elementos | Seccion critica:{' '}
          <strong>{state.lockHolder ? (state.lockHolder === 'productor' ? 'Productor' : 'Consumidor') : 'Libre'}</strong>
        </p>
      </header>

      <div className="buffer-grid">
        {state.buffer.map((item, i) => {
          let className = 'box';
          if (item) className += " has-item";
          if (state.punteroP === i) className += ' p-here';
          if (state.punteroC === i) className += ' c-here';

          return (
            <div key={i} className={className}>
              <span className="num">{i + 1}</span>
              <div className="slot-value">{item || '-'}</div>
              <div className="slot-tags">
                {state.punteroP === i && 'P'}
                {state.punteroC === i && 'C'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="status-cards">
        <div className="card productor-card">
          <h3>Productor</h3>
          <span className={`badge ${state.productor.estado.toLowerCase().split(' ')[0]}`}>
            {state.productor.estado}
          </span>
          <p>Casilla actual: {state.punteroP + 1}</p>
          <p>Items por colocar: {state.productor.itemsRestantes}</p>
          <p>Ticks para despertar: {state.productor.estado === 'Dormido' ? state.productor.sleepTicks : '-'}</p>
        </div>

        <div className="card consumidor-card">
          <h3>Consumidor</h3>
          <span className={`badge ${state.consumidor.estado.toLowerCase().split(' ')[0]}`}>
            {state.consumidor.estado}
          </span>
          <p>Casilla actual: {state.punteroC + 1}</p>
          <p>Items por retirar: {state.consumidor.itemsRestantes}</p>
          <p>Ticks para despertar: {state.consumidor.estado === 'Dormido' ? state.consumidor.sleepTicks : '-'}</p>
        </div>
      </div>

      <div className="log-area">
        {state.logs.map((log, idx) => (
          <div key={idx}> {`> ${log}`} </div>
        ))}
      </div>

      <footer className="footer-note">
        Enter: iniciar simulacion | ESC: detener | Buffer circular de 18 casillas | lotes de 3 a 6.
      </footer>
    </div>
  );
}