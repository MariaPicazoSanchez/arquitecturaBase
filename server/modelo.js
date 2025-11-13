// modelo.js (SERVER / backend)
const bcrypt = require("bcrypt");
const correo = require("./email.js");
const datos = require("./cad.js");

function Sistema() {
  this.usuarios = {};
  this.usuariosLocales = {};

  this.cad = new datos.CAD();

  (async () => {
    await this.cad.conectar((db, err) => {
      if (err) {
        console.warn("Mongo no disponible. Operando en memoria:", err.message);
      } else {
        console.log("Conectado a Mongo Atlas");
      }
    });
  })();

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
      callback(obj);
    });
  };

  // ===========================
  // REGISTRO con confirmación
  // ===========================
  this.registrarUsuario = function (obj, callback) {
    let modelo = this;

    if (!obj || !obj.email || !obj.password) {
      callback({ email: -1 });
      return;
    }

    if (!obj.nick) obj.nick = obj.email;

    // ¿Existe ya?
    this.cad.buscarUsuario({ email: obj.email }, function (usr) {
      if (usr) {
        callback({ email: -1, reason: "email_ya_registrado" });
        return;
      }

      // Genera key y marca como no confirmada
      const key = Date.now().toString();

      // Hash síncrono (encaja bien con callbacks)
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

        // Enviar email de confirmación sin bloquear respuesta
        // (si falla, lo logeamos pero YA hemos registrado)
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
    let modelo = this;
    let responded = false;
    const finish = (result) => {
      if (!responded) {
        responded = true;
        callback(result);
      }
    };

    // Timeout de seguridad
    setTimeout(() => finish({ email: -1, reason: "timeout" }), 8000);

    // Busca el usuario con esa combinación y aún sin confirmar
    this.cad.buscarUsuario(
      { email: obj.email, key: obj.key, confirmada: false },
      function (usr) {
        if (!usr) {
          return finish({ email: -1 });
        }

        usr.confirmada = true;
        // actualizarUsuario requiere _id dentro de usr (lo devuelve buscarUsuario)
        modelo.cad.actualizarUsuario(usr, function (res) {
          // Devolvemos {email} como esperaba el tutorial
          callback(res && res.email ? { email: res.email } : { email: -1 });
        });
      }
    );
  };

  // ===========================
  // LOGIN local (exige confirmada: true)
  // ===========================
  this.loginUsuario = function (obj, callback) {
    if (!obj || !obj.email || !obj.password) {
      callback({ email: -1 });
      return;
    }

    this.cad.buscarUsuario({ email: obj.email, confirmada: true }, function (usr) {

      if (!usr || !usr.password) {
        callback({ email: -1 });
        return;
      }

      // Comparación con hash
      const ok = bcrypt.compareSync(obj.password, usr.password);
      if (ok) {
        callback(usr);
      } else {
        callback({ email: -1 });
      }
    });
  };
}

function Usuario(nick) {
  this.nick = nick;
}

module.exports.Sistema = Sistema;
