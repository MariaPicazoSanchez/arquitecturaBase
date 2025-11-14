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
}

module.exports.Sistema = Sistema;
