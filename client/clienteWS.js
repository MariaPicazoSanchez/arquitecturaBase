function ClienteWS() {
    this.socket = null;
    this.email = null;
    this.codigo = null;
    this.gameType = null;

    this._ensureEmail = function(){
        if (window.$ && $.cookie){
            const emailCookie = $.cookie("email");
            const nickCookie = $.cookie("nick");
            // Identificador interno para WS: email (nunca se muestra en UI).
            // Compatibilidad: si solo existe cookie "nick" y parece email, usarla como legacy.
            this.email =
              (emailCookie && String(emailCookie).trim()) ||
              ((nickCookie && String(nickCookie).includes("@")) ? String(nickCookie).trim() : "") ||
              this.email;
        }
        return this.email;
    };

    this.pedirListaPartidas = function(){
        if (this.socket){
            this.socket.emit("obtenerListaPartidas", {
                juego: this.gameType
            });
        }
    };

    this.ini = function () {
        let ws = this;
        const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_URL) ? window.APP_CONFIG.SERVER_URL : undefined;
        this.socket = io(serverUrl);

        this.lanzarServidorWS();

        this.socket.on("connect", function(){
            ws._ensureEmail();
            ws.pedirListaPartidas();
            if (window.cw && typeof cw.renderContinueGamesBar === "function") {
                cw.renderContinueGamesBar();
            }
            setTimeout(() => ws.pedirListaPartidas(), 100); // asegurar recepción tras registrar handlers
        });
    };

    this.lanzarServidorWS = function() {
      let ws = this;

      this.socket.on("listaPartidas", function(lista){
        // Evitar logs con datos sensibles (emails). Si hace falta debug, usar solo counts.
        // console.log("Lista de partidas recibida:", Array.isArray(lista) ? lista.length : 0);
        if (window.cw && cw.pintarPartidas){
            cw.pintarPartidas(lista);
        }
        try { window._ultimaListaPartidas = lista; } catch(e){}
      });

      this.socket.on("partidaCreada", function(datos){
          console.log("Partida creada:", datos.codigo);
          if (!datos || !datos.codigo || datos.codigo === -1){
              if (window.cw && cw.mostrarAviso){
                  cw.mostrarAviso("No se pudo crear la partida.", "error");
              }
              return;
          }
          ws.codigo = datos.codigo;
          ws.pedirListaPartidas();
      });

      this.socket.on("unidoAPartida", function(datos){
          console.log("Unido a partida:", datos.codigo);
          if (!datos || !datos.codigo || datos.codigo === -1){
              const reason = datos && datos.reason;
              const message = (datos && datos.message) || (
                  reason === "FULL" ? "La partida está llena." :
                  reason === "BOT_MATCH" ? "Esta partida es de 1 jugador (vs bot)." :
                  reason === "STARTED" ? "La partida ya ha empezado." :
                  reason === "NOT_FOUND" ? "La partida no existe." :
                  "No se pudo unir a la partida."
              );
              if (window.cw && cw.mostrarAviso){
                  cw.mostrarAviso(message, "error");
              }
              ws.pedirListaPartidas();
              return;
          }
          ws.codigo = datos.codigo;
          ws.pedirListaPartidas();
      });

    this.socket.on("partidaContinuada", function(datos){
        console.log("Continuando partida:", datos);

        ws.codigo = datos.codigo;

        if (!datos.codigo || datos.codigo === -1){
            console.warn("No se pudo continuar la partida (código inválido).");
            const message = (datos && datos.message) || "No se pudo iniciar la partida.";
            if (window.cw && cw.mostrarAviso){
                cw.mostrarAviso(message, "error");
            }
            return;
        }

        // Preferimos el juego que nos manda el servidor
        const juego =
            datos.juego ||
            (window.cw && cw.juegoActual) ||
            "uno";

        // Persist active game ONLY for multiplayer (never for bots)
        try {
            const normalizedRaw = String(juego || "uno").trim().toLowerCase();
            const normalized = normalizedRaw === "checkers" ? "damas" : normalizedRaw;
            const isBotGame = !!datos.isBotGame;
            const key =
                normalized === "uno" ? "activeGame:UNO" :
                normalized === "damas" ? "activeGame:DAMAS" :
                null;

            if (key) {
                if (isBotGame) {
                    localStorage.removeItem(key);
                } else {
                    localStorage.setItem(key, JSON.stringify({ gameId: String(datos.codigo), ts: Date.now() }));
                }
            }
        } catch(e) {}
        if (window.cw && typeof cw.renderContinueGamesBar === "function") {
            cw.renderContinueGamesBar();
        }

        if (window.cw && typeof cw.mostrarJuegoEnApp === "function") {
            cw.mostrarJuegoEnApp(juego, datos.codigo);
        } else {
            if (juego === "uno") {
                window.location.href = "/uno?codigo=" + encodeURIComponent(datos.codigo);
            } else if (juego === "4raya") {
                window.location.href = "/4raya?codigo=" + encodeURIComponent(datos.codigo);
            } else if (juego === "damas" || juego === "checkers") {
                window.location.href = "/damas?codigo=" + encodeURIComponent(datos.codigo);
            } else {
                console.warn("Partida continuada para juego:", juego,
                            "pero aún no tiene interfaz asociada.");
            }
        }
    });

    this.socket.on("partidaEliminada", function(datos){
          console.log("Partida eliminada:", datos.codigo);
          ws.pedirListaPartidas();
      });
    };

  // === Metodos que llama la interfaz / consola ===

  this.crearPartida = function(){
    if (!this._ensureEmail()){
        console.warn("No hay email en ws, no se puede crear partida.");
        return;
    }
    const maxPlayers = arguments[0];
    const opts = arguments[1] && typeof arguments[1] === "object" ? arguments[1] : {};
    const modeRaw = opts.mode;
    const mode = String(modeRaw || "").trim().toUpperCase();
    const vsBot = mode === "PVBOT" || !!opts.vsBot;
    const nickCookieRaw =
      (window.$ && $.cookie && $.cookie("nick")) ? String($.cookie("nick")).trim() : "";
    const nickCookie = nickCookieRaw && !nickCookieRaw.includes("@") ? nickCookieRaw : "";
    this.socket.emit("crearPartida", { 
        email: this.email,
        nick: nickCookie || undefined,
        juego: this.gameType,
        maxPlayers: maxPlayers,
        vsBot: vsBot,
        mode: vsBot ? "PVBOT" : "PVP",
    });
  };

  this.continuarPartida = function(codigo){
      if (!this._ensureEmail()){
          console.warn("No hay email en ws, no se puede continuar partida.");
          return;
      }
      this.socket.emit("continuarPartida", { 
        email: this.email,
        codigo: codigo,
        juego: this.gameType
      });
  };

  this.unirAPartida = function(codigo, ack){
      if (!this._ensureEmail()){
          console.warn("No hay email en ws, no se puede unir a partida.");
          return;
      }
      const nickCookieRaw =
        (window.$ && $.cookie && $.cookie("nick")) ? String($.cookie("nick")).trim() : "";
      const nickCookie = nickCookieRaw && !nickCookieRaw.includes("@") ? nickCookieRaw : "";
      this.socket.emit("unirAPartida", {
        email: this.email,
        nick: nickCookie || undefined,
        codigo: codigo,
        juego: this.gameType
      }, typeof ack === "function" ? ack : undefined);
  };

  this.eliminarPartida = function(codigo, ack){
      if (!this._ensureEmail()){
          console.warn("No hay email en ws, no se puede eliminar partida.");
          return;
      }
      this.socket.emit("eliminarPartida", {
        email: this.email,
        codigo: codigo,
        juego: this.gameType
      }, typeof ack === "function" ? ack : undefined);
  };

  this.ini();
}
