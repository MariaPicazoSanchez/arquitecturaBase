import { io } from "socket.io-client";

export function createUnoSocket({ codigo, email, onState, onError }) {
  // Conexión al mismo host donde corre tu server
  const socket = io("/", { withCredentials: true });

  socket.on("connect", () => {
    console.log("[UNO] conectado al WS", socket.id);

    // Registrarnos en la partida y juego UNO
    socket.emit("uno:suscribirse", { codigo, email });
  });

  // El servidor enviará el estado completo del UNO aquí
  socket.on("uno:estado", (estado) => {
    console.log("[UNO] estado recibido:", estado);
    onState?.(estado);
  });

  socket.on("connect_error", (err) => {
    console.error("[UNO] error de conexión:", err);
    onError?.(err);
  });

  function sendAction(action) {
    socket.emit("uno:accion", { codigo, email, action });
  }

  function disconnect() {
    socket.disconnect();
  }

  return { socket, sendAction, disconnect };
}
