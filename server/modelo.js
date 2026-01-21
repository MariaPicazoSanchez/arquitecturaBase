const bcrypt = require("bcrypt");
const correo = require("./email.js");
const datos = require("./cad.js");
const crypto = require("node:crypto");
const logger = require("./logger");

const looksLikeEmail = (value) => {
  const t = String(value || "").trim();
  return !!t && t.includes("@");
};

const fallbackPublicNick = (email) => {
  // Fallback p\u00fablico: nunca usar email ni c\u00f3digos/hash visibles.
  // Asigna un "Invitado N" estable por email durante la vida del proceso.
  const e = String(email || "").trim().toLowerCase();
  if (!fallbackPublicNick._byEmail) fallbackPublicNick._byEmail = new Map();
  if (!fallbackPublicNick._seq) fallbackPublicNick._seq = 0;

  if (e) {
    const existing = fallbackPublicNick._byEmail.get(e);
    if (existing) return existing;
  }

  const nick = `Invitado ${++fallbackPublicNick._seq}`;
  if (e) fallbackPublicNick._byEmail.set(e, nick);
  return nick;
};

function Sistema() {
  this.usuarios = {};
  this.usuariosLocales = {};
  this.partidas = {};

  const BOT_PLAYER = Object.freeze({
    id: "BOT",
    email: "bot@local",
    nick: "Bot",
    isBot: true,
  });

  const normalizarEmail = function(email){
    return (email || "").trim().toLowerCase();
  };

  const sha256Hex = function(value) {
    return crypto.createHash("sha256").update(String(value || "")).digest("hex");
  };

  const timingSafeEqualHex = function(aHex, bHex) {
    try {
      const a = Buffer.from(String(aHex || ""), "hex");
      const b = Buffer.from(String(bHex || ""), "hex");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (e) {
      return false;
    }
  };

  const normalizarMaxPlayers = function(maxPlayers, fallback = 2) {
    const n = Number(maxPlayers);
    if (!Number.isFinite(n)) return fallback;
    const v = Math.trunc(n);
    if (v < 2 || v > 8) return fallback;
    return v;
  };

  const obtenerMaxPlayers = function(partida) {
    if (!partida) return 2;
    if (typeof partida.maxPlayers === "number") return partida.maxPlayers;
    if (typeof partida.maxJug === "number") return partida.maxJug;
    return 2;
  };

  const recalcularEstadoPartida = function(partida) {
    if (!partida) return;

    if (typeof partida.maxPlayers !== "number") {
      partida.maxPlayers = obtenerMaxPlayers(partida);
    }
    // Compatibilidad: el frontend actual usa `maxJug`
    partida.maxJug = partida.maxPlayers;

    partida.playersCount = Array.isArray(partida.jugadores)
      ? partida.jugadores.length
      : 0;

    if (partida.estado && partida.estado !== "pendiente") {
      partida.status = "STARTED";
      return;
    }
    const maxPlayers = obtenerMaxPlayers(partida);
    partida.status = partida.playersCount >= maxPlayers ? "FULL" : "OPEN";
  };


  this.cad = new datos.CAD();

  this._obtenerOcrearUsuarioEnMemoria = function(email, nick) {
    const e = normalizarEmail(email);
    if (!e) {
      return null;
    }
    if (!this.usuarios[e]) {
      // Si no se proporciona nick, usar fallback seguro (nunca email).
      const nickFinal = (nick && String(nick).trim()) || fallbackPublicNick(e);
      this.usuarios[e] = new Usuario(e, nickFinal);
      
      // Si no se proporcionó nick, intentar buscarlo en BD de forma asíncrona
      if (!nick) {
        this.cad.buscarUsuario({ email: e }, (usr) => {
          if (usr && usr.nick && this.usuarios[e]) {
            this.usuarios[e].nick = usr.nick;
          }
        });
      }
    } else {
      // Si llega un nick v\u00e1lido (no email), actualizar para que el lobby muestre siempre el nombre correcto.
      const n = (nick && String(nick).trim()) || "";
      if (n && !looksLikeEmail(n)) {
        this.usuarios[e].nick = n;
      }
    }
    return this.usuarios[e];
  };

  const runningJasmine = Array.isArray(process.argv) && process.argv.some(a => String(a).includes("jasmine-node"));
  const disableAutoConnect = process.env.DISABLE_MONGO_AUTOCONNECT === "1" || process.env.NODE_ENV === "test" || runningJasmine;
  if (!disableAutoConnect) {
    (async () => {
      await this.cad.conectar((db, err) => {
        if (err) {
          logger.warn("Mongo no disponible. Operando en memoria:", err.message);
        } else {
          logger.debug("Conectado a Mongo Atlas");
        }
      });
    })();
  }

  // ----------------------------
  // MÉTODOS DE PARTIDAS
  // ----------------------------

  this.obtenerCodigo = function() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  };
  this.crearPartida = function(email, juego, maxPlayers, opts) {
    email = normalizarEmail(email);
    const nickFromOpts =
      opts && typeof opts === "object" && typeof opts.nick === "string" ? opts.nick : undefined;
    let usuario = this._obtenerOcrearUsuarioEnMemoria(email, nickFromOpts);
    if (!usuario) {
      logger.debug("Usuario no encontrado");
      this.registrarActividad("crearPartidaFallido", email);
      return -1;
    }

    // Si el nick del usuario aún es su email (carga perezosa), intenta resolverlo desde BD
    const requestedMode =
      opts && typeof opts === "object" && typeof opts.mode === "string"
        ? String(opts.mode).trim().toUpperCase()
        : null;
    const vsBotRequested =
      requestedMode === "PVBOT" ||
      (typeof opts === "boolean" && opts) ||
      (opts && typeof opts === "object" && !!opts.vsBot) ||
      false;

    if (usuario.nick === email && this.cad && typeof this.cad.buscarUsuario === "function") {
      try {
        this.cad.buscarUsuario({ email }, (usr) => {
          if (usr && usr.nick) {
            usuario.nick = usr.nick;
          }
        });
      } catch (e) {
        // si falla, seguimos con el mejor esfuerzo
      }
    }

    let codigo = this.obtenerCodigo();

    // Usar un nombre visible estable (no email) para el propietario.
    const propietarioVisible = (nickFromOpts && String(nickFromOpts).trim()) || usuario.nick || "Anfitrión";
    const normalizedJuego = juego || "uno";
    const isBotMode =
      !!vsBotRequested &&
      (normalizedJuego === "uno" ||
        normalizedJuego === "4raya" ||
        normalizedJuego === "damas" ||
        normalizedJuego === "checkers");
    const effectiveMaxPlayers =
      isBotMode && normalizedJuego === "uno"
        ? 1
        : normalizarMaxPlayers(maxPlayers, 2);
    let p = new Partida(codigo, propietarioVisible, normalizedJuego, effectiveMaxPlayers);
    // Guardar también el email para validaciones
    p.propietarioEmail = email;
    p.mode = isBotMode ? "PVBOT" : "PVP";
    p.vsBot = !!(isBotMode && normalizedJuego === "uno");
    p.botPlayer = null;

    p.jugadores.push(usuario);

    if (
      isBotMode &&
      (normalizedJuego === "4raya" || normalizedJuego === "damas" || normalizedJuego === "checkers")
    ) {
      p.botPlayer = { id: BOT_PLAYER.id, nick: BOT_PLAYER.nick, isBot: true };
      p.maxPlayers = 2;
      p.maxJug = 2;

      const botUser = this._obtenerOcrearUsuarioEnMemoria(BOT_PLAYER.email, BOT_PLAYER.nick);
      if (botUser && !p.jugadores.some((j) => normalizarEmail(j?.email) === BOT_PLAYER.email)) {
        botUser.isBot = true;
        p.jugadores.push(botUser);
      }
    }
    recalcularEstadoPartida(p);
    this.partidas[codigo] = p;
    this.registrarActividad("crearPartida", email, { partida: codigo });
    return codigo;
  };

  this.unirAPartida = function(email, codigo) {
    email = normalizarEmail(email);
    let usuario = this._obtenerOcrearUsuarioEnMemoria(email);
    if (!usuario) {
      logger.debug("Usuario no encontrado");
      this.registrarActividad("unirAPartidaFallido", email);
      return { codigo: -1, reason: "INVALID_USER", message: "Usuario no encontrado" };
    }
    let partida = this.partidas[codigo];
    if (!partida) {
      logger.debug("Partida no encontrada");
      this.registrarActividad("unirAPartidaFallido", email);
      return { codigo: -1, reason: "NOT_FOUND", message: "Partida no encontrada" };
    }

    if (partida.vsBot) {
      const hostEmail = normalizarEmail(partida.propietarioEmail || partida.propietario);
      if (hostEmail && hostEmail !== email) {
        this.registrarActividad("unirAPartidaFallido", email);
        return {
          codigo: -1,
          reason: "BOT_MATCH",
          message: "Esta partida es de 1 jugador (vs bot).",
        };
      }
    }

    if (partida.mode === "PVBOT") {
      const hostEmail = normalizarEmail(partida.propietarioEmail || partida.propietario);
      if (hostEmail && hostEmail !== email) {
        this.registrarActividad("unirAPartidaFallido", email);
        return {
          codigo: -1,
          reason: "BOT_MATCH",
          message: "Esta partida es vs bot.",
        };
      }
    }

    recalcularEstadoPartida(partida);
    if (partida.status === "STARTED") {
      this.registrarActividad("unirAPartidaFallido", email);
      return { codigo: -1, reason: "STARTED", message: "La partida ya ha empezado" };
    }

    const maxPlayers = obtenerMaxPlayers(partida);
    if (partida.jugadores.length >= maxPlayers && !partida.jugadores.some(j => j.email === usuario.email)) {
      logger.debug("Partida llena");
      logger.debug("Jugadores:", partida.jugadores.length, "MaxPlayers:", maxPlayers);
      this.registrarActividad("unirAPartidaFallido", email);
      return { codigo: -1, reason: "FULL", message: "La partida está llena" };
    }

    let yaEsta = partida.jugadores.some(j => j.email === usuario.email);
    if (yaEsta) {
      logger.debug("Usuario ya está en la partida");
      this.registrarActividad("unirAPartidaFallido", email);
      return { codigo: -1, reason: "ALREADY_IN", message: "Ya estás en la partida" };
    }

    partida.jugadores.push(usuario);
    recalcularEstadoPartida(partida);
    this.registrarActividad("unirAPartida", email, { partida: codigo });
    return {
      codigo: codigo,
      status: partida.status,
      playersCount: partida.playersCount,
      maxPlayers: obtenerMaxPlayers(partida),
    };
  };

  this.continuarPartida = function(email, codigo) {
    email = normalizarEmail(email);
    let partida = this.partidas[codigo];
    if (!partida) {
      logger.debug("Partida no encontrada");
      this.registrarActividad("continuarPartidaFallido", email);
      return { codigo: -1, reason: "NOT_FOUND", message: "Partida no encontrada" };
    }
    if (normalizarEmail(partida.propietarioEmail || partida.propietario) !== email) {
      logger.debug("Solo el propietario puede continuar su partida");
      this.registrarActividad("continuarPartidaFallido", email);
      return { codigo: -1, reason: "NOT_HOST", message: "Solo el propietario puede iniciar la partida" };
    }

    recalcularEstadoPartida(partida);
    const maxPlayers = obtenerMaxPlayers(partida);
    const playersNow = (partida.playersCount || partida.jugadores.length);
    // Regla de lobby: solo iniciar cuando la sala est\u00e1 completa (salvo que ya est\u00e9 STARTED).
    if (partida.estado === "pendiente" && playersNow < maxPlayers) {
      this.registrarActividad("continuarPartidaFallido", email);
      return {
        codigo: -1,
        reason: "NOT_FULL",
        message: `La partida debe estar completa (${playersNow}/${maxPlayers}) para iniciar.`,
      };
    }
    const minPlayers =
      (partida.mode === "PVBOT" &&
        ((partida.juego || "uno") === "uno" ||
          (partida.juego || "uno") === "4raya" ||
          (partida.juego || "uno") === "damas" ||
          (partida.juego || "uno") === "checkers")) ||
      (partida.vsBot && (partida.juego || "uno") === "uno")
        ? 1
        : 2;
    if ((partida.playersCount || partida.jugadores.length) < minPlayers) {
      this.registrarActividad("continuarPartidaFallido", email);
      return {
        codigo: -1,
        reason: "NOT_ENOUGH_PLAYERS",
        message: `Se requieren al menos ${minPlayers} jugador(es) para iniciar`,
      };
    }

    partida.estado = 'enCurso';
    partida.status = "STARTED";
    let usuario = this._obtenerOcrearUsuarioEnMemoria(email);
    let yaEsta = partida.jugadores.some(j => j.email === usuario.email);
    if (!yaEsta) {
      partida.jugadores.push(usuario);
    }
    recalcularEstadoPartida(partida);
    this.registrarActividad("continuarPartida", email);
    return { codigo: codigo, status: partida.status };
  };

  this.eliminarPartida = function(email, codigo) {
    email = normalizarEmail(email);
    if (!codigo) {
      logger.debug("Codigo de partida no valido");
      this.registrarActividad("eliminarPartidaFallido", email);
      return -1;
    }
    let partida = this.partidas[codigo];
    if (!partida) {
      logger.debug("Partida no encontrada");
      this.registrarActividad("eliminarPartidaFallido", email);
      return -1;
    }
    const propietarioEmail = normalizarEmail(partida.propietarioEmail || "");
    const esPropietario = propietarioEmail && propietarioEmail === email;
    const esJugador = partida.jugadores.some(j => normalizarEmail(j.email) === email);

    if (esPropietario || (!email && propietarioEmail && !esJugador)) {
      delete this.partidas[codigo];
      this.registrarActividad("eliminarPartida", email, { partida: codigo });
      return codigo;
    }

    // si no eres propietario, solo te borras de la lista de jugadores
    if (esJugador) {
      partida.jugadores = partida.jugadores.filter(j => normalizarEmail(j.email) !== email);
      recalcularEstadoPartida(partida);
      if (partida.jugadores.length === 0) {
        delete this.partidas[codigo];
      }
      this.registrarActividad("salirPartida", email);
    }
    return codigo;
  };

  // Remove a player after a disconnect grace window without destroying the whole match immediately.
  // If the host is removed and there are remaining human players, transfer ownership to the next human.
  this.removerJugadorPorDesconexion = function(email, codigo) {
    email = normalizarEmail(email);
    if (!codigo) {
      this.registrarActividad("salirPartidaFallido", email);
      return { codigo: -1, reason: "INVALID_CODE" };
    }
    const partida = this.partidas[codigo];
    if (!partida) {
      this.registrarActividad("salirPartidaFallido", email);
      return { codigo: -1, reason: "NOT_FOUND" };
    }

    const propietarioEmail = normalizarEmail(partida.propietarioEmail || "");
    const wasHost = !!propietarioEmail && propietarioEmail === email;
    const wasPlayer = Array.isArray(partida.jugadores) && partida.jugadores.some(j => normalizarEmail(j.email) === email);
    if (!wasHost && !wasPlayer) {
      return { codigo, ok: false, reason: "NOT_IN_MATCH" };
    }

    // Remove from players list.
    partida.jugadores = (partida.jugadores || []).filter(j => normalizarEmail(j.email) !== email);
    recalcularEstadoPartida(partida);

    if (partida.jugadores.length === 0) {
      delete this.partidas[codigo];
      this.registrarActividad("salirPartida", email, { partida: codigo, motivo: "disconnect_timeout", deleted: true });
      return { codigo, ok: true, deleted: true, hostTransferred: false };
    }

    let hostTransferred = false;
    if (wasHost) {
      const nextHost = (partida.jugadores || []).find(j => {
        const e = normalizarEmail(j?.email);
        if (!e) return false;
        if (e === normalizarEmail(BOT_PLAYER.email) || j?.isBot) return false;
        return true;
      }) || null;

      if (nextHost) {
        partida.propietarioEmail = normalizarEmail(nextHost.email);
        const candidateNick = (nextHost.nick && String(nextHost.nick).trim()) || "";
        partida.propietario = (!candidateNick || looksLikeEmail(candidateNick)) ? partida.propietario : candidateNick;
        hostTransferred = true;
      } else {
        // Only bot remains: delete the match.
        delete this.partidas[codigo];
        this.registrarActividad("salirPartida", email, { partida: codigo, motivo: "disconnect_timeout", deleted: true });
        return { codigo, ok: true, deleted: true, hostTransferred: false };
      }
    }

    this.registrarActividad("salirPartida", email, { partida: codigo, motivo: "disconnect_timeout", hostTransferred });
    return { codigo, ok: true, deleted: false, hostTransferred };
  };
  this.obtenerPartidasDisponibles = function(juego) {
    // let lista = [];

    // for (let codigo in this.partidas) {
    //   let p = this.partidas[codigo];
    //   let creadorEmail = p.propietario || (p.jugadores[0] && p.jugadores[0].email);
    //   lista.push({
    //     codigo: p.codigo,
    //     propietario: creadorEmail,
    //     disponible: p.jugadores.length < p.maxJug,
    //     jugadores: p.jugadores.length,
    //     maxJug: p.maxJug
    //   });
    // }
    // return lista;
     return Object.values(this.partidas).filter(p => {
      // Solo queremos partidas pendientes
      if (p.estado && p.estado !== 'pendiente') return false;

      recalcularEstadoPartida(p);

      // Si no se nos pide un juego concreto, devolvemos todas las pendientes
      if (!juego) return true;

      // Si la partida NO tiene juego, las tratamos como "uno" por compatibilidad
      const juegoPartida = p.juego || 'uno';
      return juegoPartida === juego;
    });
  };

  this.obtenerPartidasDeUsuario = function(email) {
    email = normalizarEmail(email);
    let lista = [];
    if (!email) {
      return lista;
    }
    for (let codigo in this.partidas) {
      let p = this.partidas[codigo];
      const esPropietario = (normalizarEmail(p.propietarioEmail || p.propietario) === email);
      const estaComoJugador = p.jugadores.some(j => normalizarEmail(j.email) === email);
      if (esPropietario || estaComoJugador) {
        // Devolver el nick como propietario para mostrar
        lista.push({ codigo: p.codigo, propietario: p.propietario, esPropietario });
      }
    }
    this.registrarActividad("obtenerPartidasDeUsuario", email);
    return lista;
  };



  // ----------------------------
  // MÉTODOS DE USUARIOS
  // ----------------------------

  this.agregarUsuario = function (nick) {
    let res = { nick: -1 };
    if (!this.usuarios[nick]) {
      this.usuarios[nick] = new Usuario(nick);
      res.nick = nick;
      this.registrarActividad("agregarUsuario", nick);
    } else {
      logger.debug("El nick " + nick + " está en uso");
      this.registrarActividad("agregarUsuarioFallido", nick);
    }
    return res;
  };

  this.obtenerUsuarios = function () {
    return this.usuarios;
  };

  this.usuarioActivo = function (nick) {
    return this.usuarios.hasOwnProperty(nick);
  };

  this.eliminarUsuario = function (nick) {
    delete this.usuarios[nick];
    this.registrarActividad("eliminarUsuario", nick);
  };

  this.numeroUsuarios = function () {
    return Object.keys(this.usuarios).length;
  };

  this.usuarioGoogle = function (usr, callback) {
    this.cad.buscarOCrearUsuario(usr, function (obj) {
      if (obj && obj.email) {
        this._obtenerOcrearUsuarioEnMemoria(obj.email, obj.nick);
        this.registrarActividad("inicioGoogle", obj.email);
      } else {
        this.registrarActividad("usuarioGoogleFallido", usr ? usr.email : null);
      }
      callback(obj);
    }.bind(this));
  };

  // ===========================
  // REGISTRO con confirmación
  // ===========================
  this.registrarUsuario = function (nickOrObj, email, password, callback) {
    logger.debug("[modelo.registrarUsuario] entrada:", { nickOrObj, email });
    const modelo = this;
    let responded = false;
    
    // Soporta tanto firma antigua (nick, email, password, callback) como nueva (objeto, callback)
    let nick, finalEmail, finalPassword, finalCallback;
    
    if (typeof nickOrObj === 'object' && nickOrObj !== null) {
      // Nuevo formato: objeto con {email, password, nick, ...}
      nick = nickOrObj.nick;
      finalEmail = nickOrObj.email;
      finalPassword = nickOrObj.password;
      finalCallback = email; // El callback está en el segundo parámetro
    } else {
      // Formato antiguo: (nick, email, password, callback)
      nick = nickOrObj;
      finalEmail = email;
      finalPassword = password;
      finalCallback = callback;
    }

    const finish = (result) => {
      if (!responded) {
        responded = true;
        logger.debug("[modelo.registrarUsuario] respuesta:", result);
        if (finalCallback) finalCallback(result);
      }
    };

    // Timeout de seguridad
    setTimeout(() => finish({ email: -1, reason: "timeout" }), 8000);

    // Validaciones
    if (!finalEmail || !finalPassword || !nick) {
      return finish({ email: -1, reason: "datos_incompletos" });
    }

    // Verificar si ya existe
    this.cad.buscarUsuario({ email: finalEmail }, function (usuarioExistente) {
      if (usuarioExistente) {
        modelo.registrarActividad("registrarUsuarioFallido_emailDuplicado", finalEmail);
        return finish({ email: -1, reason: "email_ya_registrado" });
      }

      // Verificar si el nick está en uso
      modelo.cad.buscarUsuario({ nick }, function (usuarioConNick) {
        if (usuarioConNick) {
          modelo.registrarActividad("registrarUsuarioFallido_nickDuplicado", nick);
          return finish({ email: -1, reason: "nick_ya_registrado" });
        }

        // Hashear la contraseña antes de guardarla
        bcrypt.hash(finalPassword, 10, function(err, hashedPassword) {
          if (err) {
            logger.error("[modelo.registrarUsuario] error al hashear contraseña:", err);
            modelo.registrarActividad("registrarUsuarioFallido_hash", finalEmail);
            return finish({ email: -1, reason: "error_hash" });
          }

          // Generar clave de confirmación
          const key = crypto.randomBytes(32).toString("hex");
          
          // Crear el usuario en la base de datos con la contraseña hasheada
          const nuevoUsuario = {
            email: finalEmail,
            password: hashedPassword,
            nick: nick,
            key: key,
            confirmada: false
          };

          modelo.cad.insertarUsuario(nuevoUsuario, function (usr) {
            if (!usr || !usr.email) {
              logger.error("[modelo.registrarUsuario] error al insertar usuario");
              modelo.registrarActividad("registrarUsuarioFallido_insercion", finalEmail);
              return finish({ email: -1, reason: "error_insercion" });
            }

            logger.debug("[modelo.registrarUsuario] usuario insertado, enviando email...");
            
            // Enviar email de confirmación
            const correo = require("./email.js");
            correo.enviarEmail(finalEmail, key, "Confirma tu cuenta")
              .then(() => {
                logger.info("[modelo.registrarUsuario] email enviado correctamente a", finalEmail);
                modelo.registrarActividad("registrarUsuario", finalEmail);
                finish({ email: finalEmail, nick: nick });
              })
              .catch(err => {
                logger.error("[modelo.registrarUsuario] error al enviar email:", err);
                // Aún así consideramos éxito porque el usuario fue creado
                modelo.registrarActividad("registrarUsuario_sinEmail", finalEmail);
                finish({ email: finalEmail, nick: nick });
              });
          });
        });
      });
    });
  };

  // ===========================
  // CONFIRMAR cuenta
  // ===========================
  this.confirmarUsuario = function (obj, callback) {
    logger.debug("[modelo.confirmarUsuario] entrada:", obj);
    let modelo = this;
    let responded = false;
    const finish = (result) => {
      if (!responded) {
        responded = true;
        logger.debug("[modelo.confirmarUsuario] respuesta:", result);
        callback(result);
      }
    };

    setTimeout(() => finish({ email: -1, reason: "timeout" }), 8000);

    this.cad.buscarUsuario(
      { email: obj.email, key: obj.key, confirmada: false },
      function (usr) {
        logger.debug("[modelo.confirmarUsuario] usuario encontrado:", usr ? { _id: usr._id } : null);
        if (!usr) {
          modelo.registrarActividad("confirmarUsuarioFallido", obj.email);
          return finish({ email: -1 });
        }

        usr.confirmada = true;
        modelo.cad.actualizarUsuario(usr, function (res) {
          if (res && res.email) {
            modelo._obtenerOcrearUsuarioEnMemoria(usr.email, usr.nick);
            return finish({
              email: usr.email,
              nick: usr.nick,
              displayName: usr.displayName ? String(usr.displayName).trim() : "",
            });
          }
          return finish({ email: -1 });
        });
        modelo.registrarActividad("confirmarUsuario", usr.email);
      }
    );
  };

  // ===========================
  // LOGIN local (exige confirmada: true)
  // ===========================
  this.loginUsuario = function (obj, callback) {
    let modelo = this;
    logger.debug("[modelo.loginUsuario] entrada (sin imprimir email)");
    if (!obj || !obj.email || !obj.password) {
      logger.warn("[modelo.loginUsuario] datos inválidos");
      modelo.registrarActividad("loginUsuarioFallido", obj ? obj.email : null);
      callback({ email: -1 });
      return;
    }

    this.cad.buscarUsuario({ email: obj.email, confirmada: true }, function (usr) {
      logger.debug("[modelo.loginUsuario] resultado buscarUsuario:", usr);

      if (!usr || !usr.password) {
        logger.warn("[modelo.loginUsuario] usuario inexistente o sin password");
        modelo.registrarActividad("loginUsuarioFallido", obj.email);
        callback({ email: -1 });
        return;
      }

      // Comparación con hash
      const ok = bcrypt.compareSync(obj.password, usr.password);
      if (ok) {
        modelo._obtenerOcrearUsuarioEnMemoria(usr.email, usr.nick);
        modelo.registrarActividad("inicioLocal", usr.email);
        callback(usr);
      } else {
        logger.warn("[modelo.loginUsuario] credenciales inválidas");
        modelo.registrarActividad("loginUsuarioFallido", obj.email);
        callback({ email: -1 });
      }
    });
  };

  // ===========================
  // PERFIL / CUENTA (REST)
  // ===========================

  const validarNickPerfil = function(nick){
    const n = String(nick || "").trim();
    if (!n) return { ok: false, message: "El nick no puede estar vacío." };
    if (n.length < 3 || n.length > 24) return { ok: false, message: "El nick debe tener entre 3 y 24 caracteres." };
    if (/\s/.test(n)) return { ok: false, message: "El nick no puede contener espacios." };
    return { ok: true, value: n };
  };

  const validarDisplayNamePerfil = function(displayName){
    const name = String(displayName || "").trim();
    if (!name) return { ok: true, value: "" };
    if (name.length > 60) return { ok: false, message: "El nombre es demasiado largo." };
    return { ok: true, value: name };
  };

  const validarNuevaPassword = function(pwd){
    const p = String(pwd || "");
    if (p.length < 8) return { ok: false, message: "La nueva contraseña debe tener mínimo 8 caracteres." };
    const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9\W_]).{8,}$/;
    if (!strong.test(p)) {
      return { ok: false, message: "La nueva contraseña debe incluir mayúsculas, minúsculas y un número o símbolo." };
    }
    return { ok: true, value: p };
  };

  this.obtenerUsuarioSeguro = function(email, callback){
    const e = normalizarEmail(email);
    if (!e) {
      callback(undefined);
      return;
    }
    if (!this.cad || typeof this.cad.buscarUsuarioRaw !== "function") {
      const mem = this.usuarios[e];
      callback({
        email: e,
        nick: mem && mem.nick ? mem.nick : e,
        displayName: "",
        createdAt: null,
        canChangePassword: false,
      });
      return;
    }
    this.cad.buscarUsuarioRaw({ email: e }, function(usr){
      if (!usr) {
        const mem = (this.usuarios && this.usuarios[e]) ? this.usuarios[e] : null;
        callback({
          email: e,
          nick: mem && mem.nick ? mem.nick : e,
          nombre: "",
          displayName: "",
          createdAt: null,
          canChangePassword: false,
        });
        return;
      }
      callback({
        id: usr._id,
        email: usr.email,
        nick: usr.nick || usr.email,
        nombre: usr.displayName || "",
        displayName: usr.displayName || "",
        createdAt: usr.createdAt || null,
        confirmada: typeof usr.confirmada === "boolean" ? usr.confirmada : undefined,
        canChangePassword: !!usr.password,
      });
    }.bind(this));
  };

  this.actualizarUsuarioSeguro = function(email, payload, callback){
    const e = normalizarEmail(email);
    if (!e) {
      callback({ ok: false, status: 400, message: "Email inválido." });
      return;
    }
    const body = payload && typeof payload === "object" ? payload : {};
    logger.debug("[modelo.actualizarUsuarioSeguro] actualizar usuario (sin imprimir email)");

    let displayNameCheck = { ok: true, value: undefined };
    if (Object.prototype.hasOwnProperty.call(body, "displayName")) {
      displayNameCheck = validarDisplayNamePerfil(body.displayName);
      if (!displayNameCheck.ok) {
        callback({ ok: false, status: 400, message: displayNameCheck.message });
        return;
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "nombre")) {
      displayNameCheck = validarDisplayNamePerfil(body.nombre);
      if (!displayNameCheck.ok) {
        callback({ ok: false, status: 400, message: displayNameCheck.message });
        return;
      }
    }
    const nickCheck = (typeof body.nick !== "undefined") ? validarNickPerfil(body.nick) : { ok: true, value: undefined };
    if (!nickCheck.ok) {
      callback({ ok: false, status: 400, message: nickCheck.message });
      return;
    }

    if (!this.cad || typeof this.cad.buscarUsuarioRaw !== "function" || typeof this.cad.actualizarUsuarioPorEmail !== "function") {
      if (typeof nickCheck.value === "string") {
        const u = this._obtenerOcrearUsuarioEnMemoria(e, nickCheck.value);
        if (u) u.nick = nickCheck.value;
      }
      callback({ ok: true, user: { email: e, nick: nickCheck.value || e, displayName: (typeof displayNameCheck.value === "string" ? displayNameCheck.value : ""), createdAt: null, canChangePassword: false } });
      return;
    }

    const modelo = this;
    this.cad.buscarUsuarioRaw({ email: e }, function(usr){
      if (!usr) {
        callback({ ok: false, status: 404, message: "Usuario no encontrado." });
        return;
      }

      const patch = {};
      const currentDisplayName = String(usr.displayName || "");
      const currentNick = String(usr.nick || "");

      if (typeof displayNameCheck.value === "string" && displayNameCheck.value !== currentDisplayName) {
        patch.displayName = displayNameCheck.value;
      }
      if (typeof nickCheck.value === "string" && nickCheck.value !== currentNick) {
        patch.nick = nickCheck.value;
      }

      if (Object.keys(patch).length === 0) {
        callback({
          ok: true,
          user: {
            email: usr.email,
            nick: usr.nick || usr.email,
            nombre: usr.displayName || "",
            displayName: usr.displayName || "",
            createdAt: usr.createdAt || null,
            canChangePassword: !!usr.password,
          },
        });
        return;
      }

      const applyUpdate = function(){
        modelo.cad.actualizarUsuarioPorEmail(e, patch, function(updated){
          logger.debug("[modelo.actualizarUsuarioSeguro] updated from cad:", updated);
          if (!updated) {
            callback({ ok: false, status: 500, message: "No se pudo actualizar el perfil." });
            return;
          }
          try {
            const mem = modelo._obtenerOcrearUsuarioEnMemoria(e, updated.nick);
            if (mem && updated.nick) mem.nick = updated.nick;
          } catch(e2) {}
          callback({
            ok: true,
            user: {
              email: updated.email,
              nick: updated.nick || updated.email,
              nombre: updated.displayName || "",
              displayName: updated.displayName || "",
              createdAt: updated.createdAt || null,
              canChangePassword: !!updated.password,
            }
          });
        });
      };

      if (typeof patch.nick === "string") {
        modelo.cad.buscarUsuarioRaw({ nick: patch.nick }, function(usrNick){
          if (usrNick && usrNick.email && normalizarEmail(usrNick.email) !== e) {
            callback({ ok: false, status: 409, message: "Ese nick ya está en uso." });
            return;
          }
          applyUpdate();
        });
      } else {
        applyUpdate();
      }
    });
  };

  this.cambiarPasswordUsuario = function(email, payload, callback){
    const e = normalizarEmail(email);
    if (!e) {
      callback({ ok: false, status: 400, message: "Email inválido." });
      return;
    }
    const body = payload && typeof payload === "object" ? payload : {};
    const currentPassword = String(body.currentPassword || "");
    const newPwdCheck = validarNuevaPassword(body.newPassword);
    if (!newPwdCheck.ok) {
      callback({ ok: false, status: 400, message: newPwdCheck.message });
      return;
    }
    if (!this.cad || typeof this.cad.buscarUsuarioRaw !== "function" || typeof this.cad.actualizarUsuarioPorEmail !== "function") {
      callback({ ok: false, status: 503, message: "Cambio de contraseña no disponible sin base de datos." });
      return;
    }
    const modelo = this;
    this.cad.buscarUsuarioRaw({ email: e }, function(usr){
      if (!usr) {
        callback({ ok: false, status: 404, message: "Usuario no encontrado." });
        return;
      }
      if (!usr.password) {
        callback({ ok: false, status: 409, message: "No disponible para cuentas Google." });
        return;
      }
      const ok = bcrypt.compareSync(currentPassword, usr.password);
      if (!ok) {
        callback({ ok: false, status: 401, message: "La contraseña actual no es correcta." });
        return;
      }
      const hash = bcrypt.hashSync(newPwdCheck.value, 10);
      modelo.cad.actualizarUsuarioPorEmail(e, { password: hash }, function(updated){
        if (!updated) {
          callback({ ok: false, status: 500, message: "No se pudo cambiar la contraseña." });
          return;
        }
        callback({ ok: true });
      });
    });
  };

  const generarResetToken = function() {
    return crypto.randomBytes(32).toString("hex");
  };

  const generarResetCode = function() {
    return String(Math.floor(100000 + Math.random() * 900000));
  };

  this.solicitarPasswordReset = function(email, opts, callback) {
    const options = opts && typeof opts === "object" ? opts : {};
    const silent = !!options.silent;

    try {
      const e = normalizarEmail(email);
      if (!e) {
        callback(silent ? { ok: true } : { ok: false, status: 400, message: "Email inválido." });
        return;
      }

      if (!this.cad
        || typeof this.cad.buscarUsuarioRaw !== "function"
        || typeof this.cad.insertarPasswordResetToken !== "function") {
        callback(silent ? { ok: true } : { ok: false, status: 503, message: "Reset de contraseña no disponible sin base de datos." });
        return;
      }

      const modelo = this;
      this.cad.buscarUsuarioRaw({ email: e }, function(usr) {
        if (!usr) return callback(silent ? { ok: true } : { ok: false, status: 404, message: "Usuario no encontrado." });
        if (!usr.password) return callback(silent ? { ok: true } : { ok: false, status: 409, message: "No disponible para cuentas Google." });

        const token = generarResetToken();
        const code = generarResetCode();
        const tokenHash = sha256Hex(token);
        const codeHash = sha256Hex(code);

        const doc = {
          userId: usr._id,
          tokenHash,
          codeHash,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          usedAt: null,
        };

        modelo.cad.insertarPasswordResetToken(doc, function(saved) {
          if (!saved) return callback(silent ? { ok: true } : { ok: false, status: 500, message: "No se pudo iniciar el reset de contraseña." });

          Promise.resolve()
            .then(() => correo.enviarEmailCambioPassword(e, { code, token }))
            .then(() => callback({ ok: true }))
            .catch((err) => {
              logger.warn("[password-reset] fallo enviando email:", err && err.message ? err.message : err);
              callback(silent ? { ok: true } : { ok: false, status: 500, message: "No se pudo enviar el correo de reset de contraseña." });
            });
        });
      });
    } catch (err) {
      logger.error("[modelo.solicitarPasswordReset] error:", err && err.stack ? err.stack : err);
      callback(silent ? { ok: true } : { ok: false, status: 500, message: "No se pudo iniciar el reset de contraseña." });
    }
  };

  this.confirmarPasswordReset = function(payload, callback) {
    try {
      const body = payload && typeof payload === "object" ? payload : {};
      const token = String(body.token || "").trim();
      const code = String(body.code || "").trim();
      const newPwdCheck = validarNuevaPassword(body.newPassword);

      if (!token) return callback({ ok: false, status: 400, message: "Token requerido." });
      if (!newPwdCheck.ok) return callback({ ok: false, status: 400, message: newPwdCheck.message });

      if (!this.cad
        || typeof this.cad.buscarPasswordResetTokenPorHash !== "function"
        || typeof this.cad.marcarPasswordResetTokenUsado !== "function"
        || typeof this.cad.actualizarUsuarioPorId !== "function"
        || typeof this.cad.buscarUsuarioPorId !== "function") {
        callback({ ok: false, status: 503, message: "Reset de contraseña no disponible sin base de datos." });
        return;
      }

      const modelo = this;
      const tokenHash = sha256Hex(token);
      const codeHashInput = code ? sha256Hex(code) : null;

      this.cad.buscarPasswordResetTokenPorHash(tokenHash, function(t) {
        if (!t) return callback({ ok: false, status: 401, message: "Token inválido." });
        if (t.usedAt) return callback({ ok: false, status: 409, message: "Este token ya fue usado." });

        const expMs = t.expiresAt
          ? (t.expiresAt instanceof Date ? t.expiresAt.getTime() : Date.parse(t.expiresAt))
          : NaN;
        if (!Number.isFinite(expMs) || Date.now() > expMs) {
          return callback({ ok: false, status: 410, message: "El token ha expirado. Solicita uno nuevo." });
        }

        if (code) {
          if (!t.codeHash || !codeHashInput || !timingSafeEqualHex(String(t.codeHash), codeHashInput)) {
            return callback({ ok: false, status: 401, message: "Código inválido." });
          }
        }

        modelo.cad.buscarUsuarioPorId(t.userId, function(usr) {
          if (!usr) return callback({ ok: false, status: 404, message: "Usuario no encontrado." });
          if (!usr.password) return callback({ ok: false, status: 409, message: "No disponible para cuentas Google." });

          const hash = bcrypt.hashSync(newPwdCheck.value, 10);
          modelo.cad.actualizarUsuarioPorId(t.userId, { password: hash }, function(updated) {
            if (!updated) return callback({ ok: false, status: 500, message: "No se pudo actualizar la contraseña." });
            modelo.cad.marcarPasswordResetTokenUsado(t._id, function() {
              callback({ ok: true });
            });
          });
        });
      });
    } catch (err) {
      logger.error("[modelo.confirmarPasswordReset] error:", err && err.stack ? err.stack : err);
      callback({ ok: false, status: 500, message: "No se pudo actualizar la contraseña." });
    }
  };

  this.confirmarPasswordResetAutenticado = function(email, payload, callback) {
    const e = normalizarEmail(email);
    if (!e) {
      callback({ ok: false, status: 400, message: "Email inválido." });
      return;
    }
    const body = payload && typeof payload === "object" ? payload : {};
    const code = String(body.code || body.codeOrToken || "").trim();
    const newPwdCheck = validarNuevaPassword(body.newPassword);
    if (!code) return callback({ ok: false, status: 400, message: "Código requerido." });
    if (!newPwdCheck.ok) return callback({ ok: false, status: 400, message: newPwdCheck.message });

    if (!this.cad
      || typeof this.cad.buscarUsuarioRaw !== "function"
      || typeof this.cad.buscarPasswordResetTokenActivoMasRecienteDeUsuario !== "function"
      || typeof this.cad.actualizarUsuarioPorId !== "function") {
      callback({ ok: false, status: 503, message: "Reset de contraseña no disponible sin base de datos." });
      return;
    }

    const modelo = this;
    this.cad.buscarUsuarioRaw({ email: e }, function(usr) {
      if (!usr) return callback({ ok: false, status: 404, message: "Usuario no encontrado." });
      if (!usr.password) return callback({ ok: false, status: 409, message: "No disponible para cuentas Google." });

      modelo.cad.buscarPasswordResetTokenActivoMasRecienteDeUsuario(usr._id, function(t) {
        if (t) {
          const expMs = t.expiresAt
            ? (t.expiresAt instanceof Date ? t.expiresAt.getTime() : Date.parse(t.expiresAt))
            : NaN;
          if (!Number.isFinite(expMs) || Date.now() > expMs) {
            return callback({ ok: false, status: 410, message: "El código ha expirado. Solicita uno nuevo." });
          }
          const codeHashInput = sha256Hex(code);
          if (!t.codeHash || !timingSafeEqualHex(String(t.codeHash), codeHashInput)) {
            return callback({ ok: false, status: 401, message: "Código inválido." });
          }

          const hash = bcrypt.hashSync(newPwdCheck.value, 10);
          modelo.cad.actualizarUsuarioPorId(usr._id, { password: hash }, function(updated) {
            if (!updated) return callback({ ok: false, status: 500, message: "No se pudo actualizar la contraseña." });
            if (typeof modelo.cad.marcarPasswordResetTokenUsado === "function") {
              return modelo.cad.marcarPasswordResetTokenUsado(t._id, function() {
                callback({ ok: true });
              });
            }
            callback({ ok: true });
          });
          return;
        }

        // Fallback: soportar códigos legacy guardados en claro en el usuario (si existen).
        const saved = String(usr.passwordResetCode || "").trim();
        const expiresAtLegacy = usr.passwordResetExpiresAt ? Date.parse(usr.passwordResetExpiresAt) : NaN;
        if (!saved || saved !== code) return callback({ ok: false, status: 401, message: "Código inválido." });
        if (!Number.isFinite(expiresAtLegacy) || Date.now() > expiresAtLegacy) {
          return callback({ ok: false, status: 410, message: "El código ha expirado. Solicita uno nuevo." });
        }

        const hash = bcrypt.hashSync(newPwdCheck.value, 10);
        if (typeof modelo.cad.actualizarUsuarioPorEmail !== "function") {
          return callback({ ok: false, status: 503, message: "Reset de contraseña no disponible sin base de datos." });
        }
        modelo.cad.actualizarUsuarioPorEmail(e, { password: hash, passwordResetCode: null, passwordResetExpiresAt: null }, function(updated) {
          if (!updated) return callback({ ok: false, status: 500, message: "No se pudo actualizar la contraseña." });
          callback({ ok: true });
        });
      });
    });
  };

  this.solicitarCambioPasswordPorEmail = function(email, callback){
    return this.solicitarPasswordReset(email, { silent: false }, callback);
    const e = normalizarEmail(email);
    if (!e) {
      callback({ ok: false, status: 400, message: "Email inválido." });
      return;
    }
    if (!this.cad || typeof this.cad.buscarUsuarioRaw !== "function" || typeof this.cad.actualizarUsuarioPorEmail !== "function") {
      callback({ ok: false, status: 503, message: "Cambio de contraseña no disponible sin base de datos." });
      return;
    }
    const modelo = this;
    this.cad.buscarUsuarioRaw({ email: e }, function(usr){
      if (!usr) return callback({ ok: false, status: 404, message: "Usuario no encontrado." });
      if (!usr.password) return callback({ ok: false, status: 409, message: "No disponible para cuentas Google." });

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      modelo.cad.actualizarUsuarioPorEmail(e, { passwordResetCode: code, passwordResetExpiresAt: expiresAt }, function(updated){
        if (!updated) return callback({ ok: false, status: 500, message: "No se pudo iniciar el cambio de contraseña." });
        Promise.resolve()
          .then(() => correo.enviarEmailCambioPassword(e, code))
          .then(() => callback({ ok: true }))
          .catch((err) => {
            logger.warn("[password-change] fallo enviando email:", err && err.message ? err.message : err);
            callback({ ok: false, status: 500, message: "No se pudo enviar el correo de cambio de contraseña." });
          });
      });
    });
  };

  this.confirmarCambioPasswordPorEmail = function(email, payload, callback){
    return this.confirmarPasswordResetAutenticado(email, payload, callback);
    const e = normalizarEmail(email);
    if (!e) {
      callback({ ok: false, status: 400, message: "Email inválido." });
      return;
    }
    const body = payload && typeof payload === "object" ? payload : {};
    const code = String(body.code || body.codeOrToken || "").trim();
    const newPwdCheck = validarNuevaPassword(body.newPassword);
    if (!code) return callback({ ok: false, status: 400, message: "Código requerido." });
    if (!newPwdCheck.ok) return callback({ ok: false, status: 400, message: newPwdCheck.message });

    if (!this.cad || typeof this.cad.buscarUsuarioRaw !== "function" || typeof this.cad.actualizarUsuarioPorEmail !== "function") {
      callback({ ok: false, status: 503, message: "Cambio de contraseña no disponible sin base de datos." });
      return;
    }

    const modelo = this;
    this.cad.buscarUsuarioRaw({ email: e }, function(usr){
      if (!usr) return callback({ ok: false, status: 404, message: "Usuario no encontrado." });
      if (!usr.password) return callback({ ok: false, status: 409, message: "No disponible para cuentas Google." });

      const saved = String(usr.passwordResetCode || "").trim();
      const expiresAt = usr.passwordResetExpiresAt ? Date.parse(usr.passwordResetExpiresAt) : NaN;
      if (!saved || saved !== code) return callback({ ok: false, status: 401, message: "Código inválido." });
      if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return callback({ ok: false, status: 410, message: "El código ha expirado. Solicita uno nuevo." });

      const hash = bcrypt.hashSync(newPwdCheck.value, 10);
      modelo.cad.actualizarUsuarioPorEmail(e, { password: hash, passwordResetCode: null, passwordResetExpiresAt: null }, function(updated){
        if (!updated) return callback({ ok: false, status: 500, message: "No se pudo actualizar la contraseña." });
        callback({ ok: true });
      });
    });
  };

  this.eliminarCuentaUsuario = function(email, payload, callback){
    const e = normalizarEmail(email);
    if (!e) {
      callback({ ok: false, status: 400, message: "Email inválido." });
      return;
    }
    const body = payload && typeof payload === "object" ? payload : {};

    if (!this.cad || typeof this.cad.buscarUsuarioRaw !== "function" || typeof this.cad.eliminarUsuarioPorEmail !== "function") {
      callback({ ok: false, status: 503, message: "Eliminación de cuenta no disponible sin base de datos." });
      return;
    }

    const modelo = this;
    this.cad.buscarUsuarioRaw({ email: e }, function(usr){
      if (!usr) {
        callback({ ok: false, status: 404, message: "Usuario no encontrado." });
        return;
      }

      if (usr.password) {
        const pwd = String(body.password || "");
        if (!pwd) {
          callback({ ok: false, status: 400, message: "Debes confirmar con tu contraseña." });
          return;
        }
        const ok = bcrypt.compareSync(pwd, usr.password);
        if (!ok) {
          callback({ ok: false, status: 401, message: "Contraseña incorrecta." });
          return;
        }
      } else {
        const confirm = body.confirm === true || body.confirm === "true";
        if (!confirm) {
          callback({ ok: false, status: 400, message: "Confirmación requerida para eliminar la cuenta." });
          return;
        }
      }

      try {
        if (typeof modelo.cad.eliminarPasswordResetTokensDeUsuario === "function") {
          modelo.cad.eliminarPasswordResetTokensDeUsuario(usr._id, function() {});
        }
      } catch (ex) {}

      modelo.cad.eliminarUsuarioPorEmail(e, function(deleted){
        if (!deleted) {
          callback({ ok: false, status: 500, message: "No se pudo eliminar la cuenta." });
          return;
        }
        try { delete modelo.usuarios[e]; } catch(ex) {}
        // Best-effort: si hay partidas en memoria del usuario, intentar desvincularlo.
        try {
          Object.keys(modelo.partidas || {}).forEach(function(c){
            const p = modelo.partidas[c];
            if (!p) return;
            if (p.propietarioEmail && normalizarEmail(p.propietarioEmail) === e) {
              p.propietarioEmail = "deleted@local";
              p.propietario = "Usuario eliminado";
            }
            if (Array.isArray(p.jugadores)) {
              p.jugadores = p.jugadores.filter(j => normalizarEmail(j && j.email) !== e);
            }
            // Si se queda sin jugadores, eliminar la partida
            if (Array.isArray(p.jugadores) && p.jugadores.length === 0) {
              delete modelo.partidas[c];
            }
          });
        } catch(ex2) {}
        callback({ ok: true });
      });
    });
  };
  // ===========================
  // REGISTRO de actividad
  // ===========================

  this.registrarActividad = function (tipoOperacion, emailUsuario) {
    const operacionesExito = {
      registroUsuario: true,
      inicioLocal: true,
      inicioGoogle: true,
      crearPartida: true,
      unirAPartida: true,
      cerrarSesion: true,
      eliminarPartida: true,
    };

    if (!operacionesExito[tipoOperacion] || !emailUsuario) {
      return;
    }

    const usuarioConDetalle = arguments[2] && arguments[2].partida
      ? `${emailUsuario} [partida:${arguments[2].partida}]`
      : emailUsuario;

    (async () => {
      try {
        await this.cad.insertarLog(tipoOperacion, usuarioConDetalle);
      } catch (err) {
        logger.error("[modelo.registrarActividad] Error guardando log:", err && err.message ? err.message : err);
      }
    })();
  };

}


function Usuario(email, nick) {
  this.email = email;
  const base = (nick && String(nick).trim()) || String(email || "").trim();
  this.nick = looksLikeEmail(base) ? fallbackPublicNick(email) : base;
}

function Partida(codigo, propietario, juego, maxJug) {
  this.codigo = codigo;
  this.propietario = propietario;
  this.jugadores = [];
  // `maxJug` se mantiene por compatibilidad con código existente (UI/legacy).
  this.maxPlayers = typeof maxJug === 'number' ? maxJug : 2;
  this.maxJug = this.maxPlayers;
  this.playersCount = 0;
  this.status = "OPEN"; // OPEN|FULL|STARTED
  this.estado = 'pendiente';
  // Sistema (no lógica del juego): fase de la sala.
  this.phase = "lobby"; // lobby|inGame|finished
  this.juego = juego || 'uno' ;
  this.vsBot = false;
  this.mode = "PVP"; // PVP|PVBOT
  this.botPlayer = null;
}
module.exports.Sistema = Sistema;
