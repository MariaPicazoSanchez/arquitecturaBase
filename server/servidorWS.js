function ServidorWS() {
  let srv = this;

  this.enviarAlRemitente = function(socket, mensaje, datos) {
    socket.emit(mensaje, datos);
  };

  this.enviarATodosMenosRemitente = function(socket, mensaje, datos) {
    socket.broadcast.emit(mensaje, datos);
  };

  this.enviarGlobal = function(io, mensaje, datos) {
    io.emit(mensaje, datos);
  };

  this.lanzarServidor = function(io, sistema) {
    io.on("connection", function(socket) {
      console.log("Capa WS activa");

      // Enviar lista inicial de partidas disponibles
      socket.on("obtenerListaPartidas", function() {
        let lista = sistema.obtenerPartidasDisponibles();
        srv.enviarAlRemitente(socket, "listaPartidas", lista);
      });
      // dispara una vez al conectar
      socket.emit("listaPartidas", sistema.obtenerPartidasDisponibles());

      // === crearPartida ===
      socket.on("crearPartida", function(datos) {
        let codigo = sistema.crearPartida(datos.email);

        if (codigo !== -1) {
          socket.join(codigo); // sala de socket.io
        }

        srv.enviarAlRemitente(socket, "partidaCreada", { codigo: codigo });

        let lista = sistema.obtenerPartidasDisponibles();
        srv.enviarGlobal(io, "listaPartidas", lista);
      });

      // === unirAPartida ===
      socket.on("unirAPartida", function(datos) {
        let codigo = sistema.unirAPartida(datos.email, datos.codigo);

        if (codigo !== -1) {
          socket.join(codigo);
        }

        srv.enviarAlRemitente(socket, "unidoAPartida", { codigo: codigo });

        let lista = sistema.obtenerPartidasDisponibles();
        srv.enviarGlobal(io, "listaPartidas", lista);
      });

      // === continuarPartida ===
      socket.on("continuarPartida", function(datos) {
        // Marca la partida como "en curso" en tu sistema
        let codigo = sistema.continuarPartida(datos.email, datos.codigo);

        if (codigo !== -1) {
          // Aseguramos que este socket está en la sala
          socket.join(codigo);

          // 🔴 Enviar a TODOS los jugadores de la sala que la partida empieza
          io.to(codigo).emit("partidaContinuada", {
            codigo: codigo,
            juego: datos.juego || "uno"
          });

          // 🔴 Actualizar la lista para TODO el mundo
          // (si sistema.obtenerPartidasDisponibles ya filtra las "en curso",
          //   desaparecerá del listado como quieres)
          let lista = sistema.obtenerPartidasDisponibles();
          srv.enviarGlobal(io, "listaPartidas", lista);
        } else {
          // No se pudo continuar la partida (no es el propietario, código inválido, etc.)
          srv.enviarAlRemitente(socket, "partidaContinuada", { codigo: -1 });
        }
      });

      // === eliminarPartida ===
      socket.on("eliminarPartida", function(datos) {
        let codigo = sistema.eliminarPartida(datos.email, datos.codigo);

        srv.enviarAlRemitente(socket, "partidaEliminada", { codigo: codigo });

        let lista = sistema.obtenerPartidasDisponibles();
        srv.enviarGlobal(io, "listaPartidas", lista);
      });
    });
  };
}

module.exports.ServidorWS = ServidorWS;
