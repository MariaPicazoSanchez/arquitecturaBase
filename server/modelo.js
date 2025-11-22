const bcrypt = require("bcrypt");
const correo = require("./email.js");
const datos = require("./cad.js");

function Sistema() {
  this.usuarios = {};
  this.usuariosLocales = {};
  this.partidas = {};

  const normalizarEmail = function(email){
    return (email || "").trim().toLowerCase();
  };


  this.cad = new datos.CAD();

  this._obtenerOcrearUsuarioEnMemoria = function(email) {
    const e = normalizarEmail(email);
    if (!e) {
      return null;
    }
    if (!this.usuarios[e]) {
      this.usuarios[e] = new Usuario(e);
    }
    return this.usuarios[e];
  };

  (async () => {
    await this.cad.conectar((db, err) => {
      if (err) {
        console.warn("Mongo no disponible. Operando en memoria:", err.message);
      } else {
        console.log("Conectado a Mongo Atlas");
      }
    });
  })();

  // ----------------------------
  // MÉTODOS DE PARTIDAS
  // ----------------------------

  this.obtenerCodigo = function() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  };
  this.crearPartida = function(email) {
    email = normalizarEmail(email);
    let usuario = this._obtenerOcrearUsuarioEnMemoria(email);
    if (!usuario) {
      console.log("Usuario no encontrado");
      return -1;
    }

    let codigo = this.obtenerCodigo();

    let p = new Partida(codigo, email);

    p.jugadores.push(usuario);
    this.partidas[codigo] = p;
    return codigo;
  };

  this.unirAPartida = function(email, codigo) {
    email = normalizarEmail(email);
    let usuario = this._obtenerOcrearUsuarioEnMemoria(email);
    if (!usuario) {
      console.log("Usuario no encontrado");
      return -1;
    }
    let partida = this.partidas[codigo];
    if (!partida) {
      console.log("Partida no encontrada");
      return -1;
    }

    if (partida.jugadores.length >= partida.maxJug) {
      console.log("Partida llena");
      return -1;
    }

    let yaEsta = partida.jugadores.some(j => j.email === usuario.email);
    if (yaEsta) {
      console.log("Usuario ya está en la partida");
      return -1;
    }

    partida.jugadores.push(usuario);
    return codigo;
  };

  this.continuarPartida = function(email, codigo) {
    email = normalizarEmail(email);
    let partida = this.partidas[codigo];
    if (!partida) {
      console.log("Partida no encontrada");
      return -1;
    }
    if (normalizarEmail(partida.propietario) !== email) {
      console.log("Solo el propietario puede continuar su partida");
      return -1;
    }
    let usuario = this._obtenerOcrearUsuarioEnMemoria(email);
    let yaEsta = partida.jugadores.some(j => j.email === usuario.email);
    if (!yaEsta) {
      partida.jugadores.push(usuario);
    }
    return codigo;
  };
  this.eliminarPartida = function(email, codigo) {
    email = normalizarEmail(email);
    if (!codigo) {
      console.log("Codigo de partida no valido");
      return -1;
    }
    let partida = this.partidas[codigo];
    if (!partida) {
      console.log("Partida no encontrada");
      return -1;
    }
    const propietarioNorm = normalizarEmail(partida.propietario);
    const esPropietario = propietarioNorm && propietarioNorm === email;
    const esJugador = partida.jugadores.some(j => normalizarEmail(j.email) === email);

    if (esPropietario || (!email && propietarioNorm && !esJugador)) {
      delete this.partidas[codigo];
      return codigo;
    }

    // si no eres propietario, solo te borras de la lista de jugadores
    if (esJugador) {
      partida.jugadores = partida.jugadores.filter(j => normalizarEmail(j.email) !== email);
      if (partida.jugadores.length === 0) {
        delete this.partidas[codigo];
      }
    }
    return codigo;
  };
  this.obtenerPartidasDisponibles = function() {
    let lista = [];

    for (let codigo in this.partidas) {
      let p = this.partidas[codigo];
      let creadorEmail = p.propietario || (p.jugadores[0] && p.jugadores[0].email);
      lista.push({
        codigo: p.codigo,
        propietario: creadorEmail,
        disponible: p.jugadores.length < p.maxJug,
        jugadores: p.jugadores.length,
        maxJug: p.maxJug
      });
    }
    return lista;
  };

  this.obtenerPartidasDeUsuario = function(email) {
    email = normalizarEmail(email);
    let lista = [];
    if (!email) {
      return lista;
    }
    for (let codigo in this.partidas) {
      let p = this.partidas[codigo];
      const esPropietario = (normalizarEmail(p.propietario) === email);
      const estaComoJugador = p.jugadores.some(j => normalizarEmail(j.email) === email);
      if (esPropietario || estaComoJugador) {
        lista.push({ codigo: p.codigo, propietario: p.propietario, esPropietario });
      }
    }
    return lista;
  };

  this.agregarUsuario = function (nick) {
    let res = { nick: -1 };
    if (!this.usuarios[nick]) {
      this.usuarios[nick] = new Usuario(nick);
      res.nick = nick;
    } else {
      console.log("El nick " + nick + " está en uso");
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
  };

  this.numeroUsuarios = function () {
    return Object.keys(this.usuarios).length;
  };

  this.usuarioGoogle = function (usr, callback) {
    this.cad.buscarOCrearUsuario(usr, function (obj) {
      if (obj && obj.email) {
        this._obtenerOcrearUsuarioEnMemoria(obj.email);
      }
      callback(obj);
    }.bind(this));
  };

  // ===========================
  // REGISTRO con confirmación
  // ===========================
  this.registrarUsuario = function (obj, callback) {
    console.log("[modelo.registrarUsuario] entrada:", obj);
    let modelo = this;

    if (!obj || !obj.email || !obj.password) {
      console.warn("[modelo.registrarUsuario] datos inválidos");
      callback({ email: -1 });
      return;
    }

    if (!obj.nick) obj.nick = obj.email;

    this.cad.buscarUsuario({ email: obj.email }, function (usr) {
      console.log("[modelo.registrarUsuario] resultado buscarUsuario:", usr);
      if (usr) {
        console.warn("[modelo.registrarUsuario] duplicado:", obj.email);
        callback({ email: -1, reason: "email_ya_registrado" });
        return;
      }

      const key = Date.now().toString();

      const hash = bcrypt.hashSync(obj.password, 10);

      const nuevoUsuario = {
        email: obj.email,
        nick: obj.nick,
        password: hash,
        key: key,
        confirmada: false,
      };

      modelo.cad.insertarUsuario(nuevoUsuario, function (res) {
        console.log("[modelo.registrarUsuario] resultado insertarUsuario:", res);

        Promise.resolve()
          .then(() => correo.enviarEmail(obj.email, key, "Confirmar cuenta"))
          .catch((e) => console.warn("[registrarUsuario] Fallo enviando email:", e.message));

        callback(res);
      });
    });
  };

  // ===========================
  // CONFIRMAR cuenta
  // ===========================
  this.confirmarUsuario = function (obj, callback) {
    console.log("[modelo.confirmarUsuario] entrada:", obj);
    let modelo = this;
    let responded = false;
    const finish = (result) => {
      if (!responded) {
        responded = true;
        console.log("[modelo.confirmarUsuario] respuesta:", result);
        callback(result);
      }
    };

    setTimeout(() => finish({ email: -1, reason: "timeout" }), 8000);

    this.cad.buscarUsuario(
      { email: obj.email, key: obj.key, confirmada: false },
      function (usr) {
        console.log("[modelo.confirmarUsuario] usuario encontrado:", usr ? { email: usr.email, _id: usr._id } : null);
        if (!usr) {
          return finish({ email: -1 });
        }

        usr.confirmada = true;
        modelo.cad.actualizarUsuario(usr, function (res) {
          callback(res && res.email ? { email: res.email } : { email: -1 });
        });
      }
    );
  };

  // ===========================
  // LOGIN local (exige confirmada: true)
  // ===========================
  this.loginUsuario = function (obj, callback) {
    let modelo = this;
    console.log("[modelo.loginUsuario] entrada:", obj);
    if (!obj || !obj.email || !obj.password) {
      console.warn("[modelo.loginUsuario] datos inválidos");
      callback({ email: -1 });
      return;
    }

    this.cad.buscarUsuario({ email: obj.email, confirmada: true }, function (usr) {
      console.log("[modelo.loginUsuario] resultado buscarUsuario:", usr);

      if (!usr || !usr.password) {
        console.warn("[modelo.loginUsuario] usuario inexistente o sin password");
        callback({ email: -1 });
        return;
      }

      // Comparación con hash
      const ok = bcrypt.compareSync(obj.password, usr.password);
      if (ok) {
        modelo._obtenerOcrearUsuarioEnMemoria(usr.email);
        callback(usr);
      } else {
        console.warn("[modelo.loginUsuario] credenciales inválidas");
        callback({ email: -1 });
      }
    });
  };
}

function Usuario(nick) {
  this.nick = nick;
  this.email = nick;
}

function Partida(codigo, propietario) {
  this.codigo = codigo;
  this.propietario = propietario;
  this.jugadores = [];
  this.maxJug = 2;
}
module.exports.Sistema = Sistema;
