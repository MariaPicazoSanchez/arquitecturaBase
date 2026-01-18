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

    const normalizeGameKey = (raw) => {
        const k = String(raw || "uno").trim().toLowerCase();
        if (k === "checkers") return "damas";
        return k || "uno";
    };

    const getMyNick = () => {
        try {
            const nickCookie = window.$ && $.cookie ? String($.cookie("nick") || "").trim() : "";
            if (nickCookie && !nickCookie.includes("@")) {
                return nickCookie;
            }
        } catch (e) {}
        return "";
    };

    const persistResumeMatch = ({ matchCode, gameKey, ownerNick }) => {
        if (!window.resumeManager || !matchCode || !gameKey) return;
        const entry = {
            roomId: String(matchCode).trim(),
            gameKey: normalizeGameKey(gameKey),
            ownerNick: String(ownerNick || "").trim(),
            joinedNick: getMyNick(),
            timestamp: Date.now(),
        };
        window.resumeManager.save(entry);
    };

    const clearResumeMatch = () => {
        if (!window.resumeManager) return;
        window.resumeManager.clear();
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
        if (window.cw && cw.pintarPartidas){
            cw.pintarPartidas(lista);
        }
        try { window._ultimaListaPartidas = lista; } catch(e){}
      });

      this.socket.on("partidaCreada", function(datos){
          logger.debug("Partida creada:", datos.codigo);
          if (!datos || !datos.codigo || datos.codigo === -1){
              if (window.cw && cw.mostrarAviso){
                  cw.mostrarAviso("No se pudo crear la partida.", "error");
              }
              return;
          }
          // No guardar “continuar” al crear: solo se muestra cuando la partida está iniciada
          // y el usuario se ha desconectado/recargado.
          if (window.cw && typeof cw.renderContinueGamesBar === "function") {
              cw.renderContinueGamesBar();
          }
          ws.codigo = datos.codigo;
          ws.pedirListaPartidas();
      });

      this.socket.on("unidoAPartida", function(datos){
          logger.debug("Unido a partida:", datos.codigo);
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
          // No guardar “continuar” al unirse: solo se muestra cuando la partida está iniciada
          // y el usuario se ha desconectado/recargado.
          if (window.cw && typeof cw.renderContinueGamesBar === "function") {
              cw.renderContinueGamesBar();
          }
          ws.codigo = datos.codigo;
          ws.pedirListaPartidas();
      });

    this.socket.on("partidaContinuada", function(datos){
        logger.debug("Continuando partida:", datos);

        ws.codigo = datos.codigo;

        if (!datos.codigo || datos.codigo === -1){
            logger.warn("No se pudo continuar la partida (código inválido).");
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
            const creatorNick = (datos && typeof datos.creatorNick === "string") ? String(datos.creatorNick).trim() : "";
            const ownerNick =
                creatorNick ||
                (datos && typeof datos.propietario === "string" ? String(datos.propietario).trim() : "");
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

            // No persistimos “continuar” aquí: el lobby se basa en `resume:list` del servidor.
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
                logger.warn("Partida continuada para juego:", juego,
                            "pero aún no tiene interfaz asociada.");
            }
        }
    });

      this.socket.on("partidaEliminada", function(datos){
          logger.debug("Partida eliminada:", datos.codigo);
          ws.pedirListaPartidas();
      });

      const prettyGameName = (gameKey) => {
        const k = String(gameKey || "").trim().toLowerCase();
        if (k === "uno") return "Última Carta";
        if (k === "4raya") return "4 en raya";
        if (k === "damas" || k === "checkers") return "Damas";
        return k || "juego";
      };

      const getActiveMatchCode = () => {
        try {
          const entry = window.resumeManager ? window.resumeManager.get() : null;
          return entry && entry.roomId ? String(entry.roomId).trim() : "";
        } catch (e) {
          return "";
        }
      };

      const getMyNick = () => {
        try {
          const raw =
            (window.$ && $.cookie && $.cookie("nick")) ? String($.cookie("nick")).trim() : "";
          if (!raw) return "";
          return raw.includes("@") ? "" : raw;
        } catch (e) {
          return "";
        }
      };

      const shouldShowMatchToast = (matchCode) => {
        const code = String(matchCode || "").trim();
        if (!code) return false;
        const current = String((window.ws && ws.codigo) || "").trim();
        const active = getActiveMatchCode();
        return code === current || code === active;
      };

      const seenSystemEventIds = new Set();
      const shouldRenderLobbyToasts = () => {
        try {
          // Only show system toasts in the lobby (not inside the embedded game).
          if (window.cw && (cw._activeCodigo || cw._activeGameType)) return false;
          const $zona = window.$ ? $("#zona-juego") : null;
          if ($zona && $zona.length && $zona.is(":visible")) return false;
        } catch (e) {}
        return true;
      };
      const dedupeEvent = (payload) => {
        const id = payload && payload.eventId ? String(payload.eventId).trim() : "";
        if (!id) return false;
        if (seenSystemEventIds.has(id)) return true;
        seenSystemEventIds.add(id);
        // best-effort pruning
        if (seenSystemEventIds.size > 250) {
          let n = 0;
          for (const v of seenSystemEventIds) {
            seenSystemEventIds.delete(v);
            if ((n += 1) >= 100) break;
          }
        }
        return false;
      };

      this.socket.on("match:player_left", function(payload){
        if (!shouldRenderLobbyToasts()) return;
        if (dedupeEvent(payload)) return;
        const nick = payload && payload.playerNick ? String(payload.playerNick).trim() : "";
        const codigo = payload && payload.matchCode ? String(payload.matchCode).trim() : "";
        const juego = payload && payload.gameKey ? prettyGameName(payload.gameKey) : "";
        if (!nick || !codigo) return;
        if (!shouldShowMatchToast(codigo)) return;
        const myNick = getMyNick();
        if (myNick && nick.toLowerCase() === myNick.toLowerCase()) return;
        const msg = `${nick} ha salido de la partida ${codigo}${juego ? ` (${juego})` : ""}`;
        if (window.appToast && typeof window.appToast.show === "function") {
          window.appToast.show(msg, { variant: "warning" });
        }
      });

      this.socket.on("match:player_disconnected", function(payload){
        if (!shouldRenderLobbyToasts()) return;
        if (dedupeEvent(payload)) return;
        const nick = payload && payload.playerNick ? String(payload.playerNick).trim() : "";
        const codigo = payload && payload.matchCode ? String(payload.matchCode).trim() : "";
        const juego = payload && payload.gameKey ? prettyGameName(payload.gameKey) : "";
        if (!nick || !codigo) return;
        if (!shouldShowMatchToast(codigo)) return;
        const myNick = getMyNick();
        if (myNick && nick.toLowerCase() === myNick.toLowerCase()) return;
        const msg = `${nick} se ha desconectado de la partida ${codigo}${juego ? ` (${juego})` : ""}`;
        if (window.appToast && typeof window.appToast.show === "function") {
          window.appToast.show(msg, { variant: "info" });
        }
      });

      this.socket.on("match:ended", function(payload){
        const codigo = payload && payload.matchCode ? String(payload.matchCode).trim() : "";
        if (!codigo) return;
        if (!shouldShowMatchToast(codigo)) return;
        try {
          const saved = getActiveMatchCode();
          if (saved && saved === codigo) clearResumeMatch();
        } catch (e) {}
        try {
          if (window.cw && typeof cw.renderContinueGamesBar === "function") cw.renderContinueGamesBar();
        } catch (e) {}
      });
    };

  // === Metodos que llama la interfaz / consola ===

  this.crearPartida = function(){
    if (!this._ensureEmail()){
        logger.warn("No hay email en ws, no se puede crear partida.");
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
        isBotMatch: vsBot,
        mode: vsBot ? "PVBOT" : "PVP",
        matchMode: vsBot ? "bot" : "pvp",
    });
  };

  this.continuarPartida = function(codigo){
      if (!this._ensureEmail()){
          logger.warn("No hay email en ws, no se puede continuar partida.");
          return;
      }
      const juego = String(this.gameType || "").trim().toLowerCase();
      if (juego === "4raya" || juego === "damas" || juego === "checkers") {
          const uidCookieRaw =
              (window.$ && $.cookie && $.cookie("uid")) ? String($.cookie("uid")).trim() : "";
          const uidCookie = uidCookieRaw ? uidCookieRaw.toLowerCase() : "";
          this.socket.emit("match:start", {
              matchCode: String(codigo),
              email: this.email,
              userId: uidCookie || undefined,
          });
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
          logger.warn("No hay email en ws, no se puede unir a partida.");
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
          logger.warn("No hay email en ws, no se puede eliminar partida.");
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
