function Sistema() {
    this.usuarios = {};
    // const datos=require("./cad.js");
    // this.cad=new datos.CAD();
    this.usuariosLocales = {};
    const datos = require("./cad.js");
    this.cad = new datos.CAD();

    (async () => {
        // await this.cad.conectar(function(db){
        //     console.log("Conectado a Mongo Atlas");
        await this.cad.conectar(function (db, err) {
            if (err) {
                console.warn("Mongo no disponible. Operando en memoria:", err.message);
            } else {
                console.log("Conectado a Mongo Atlas");
            }
        });
    })();

    this.agregarUsuario = function(nick) {
        let res = { nick: -1 };
        if (!this.usuarios[nick]) {
            this.usuarios[nick] = new Usuario(nick);
            res.nick = nick;
        } else {
            console.log("El nick " + nick + " está en uso");
        }
        return res;
    };


    this.obtenerUsuarios = function() {
        return this.usuarios;
    };

    this.usuarioActivo = function(nick) {
        return this.usuarios.hasOwnProperty(nick);
    };

    this.eliminarUsuario = function(nick) {
        delete this.usuarios[nick];
    };

    this.numeroUsuarios = function() {
        return Object.keys(this.usuarios).length;
    };

    this.usuarioGoogle = function(usr, callback) {
        this.cad.buscarOCrearUsuario(usr, function(obj) {
            callback(obj);
        });
    };
    // this.registrarUsuario = function(obj, callback){
    //     let modelo = this;
    //     if (!obj || !obj.email || !obj.password){
    //         callback({ email: -1 });
    //         return;
    //     }
    //     if (!obj.nick){ obj.nick = obj.email; }
    //     this.cad.buscarUsuario({ email: obj.email }, function(usr){
    //         if (!usr){
    //         // (sin confirmación aún; si quieres confirmación ver §4)
    //         modelo.cad.insertarUsuario(obj, function(res){ callback(res); });
    //         } else {
    //         callback({ email: -1 });
    //         }
    //     });
    // };

    // this.loginUsuario = function(obj, callback){
    //     if (!obj || !obj.email || !obj.password){
    //         callback({ email: -1 });
    //         return;
    //     }
    //     this.cad.buscarUsuario({ email: obj.email /*, confirmada:true si activas confirmación */ }, function(usr){
    //         if (usr && usr.password == obj.password){
    //         callback(usr);
    //         } else {
    //         callback({ email: -1 });
    //         }
    //     });
    // };

    this.registrarUsuario = function(obj, callback){
        console.log("[modelo.registrarUsuario] entrada:", obj);
        let modelo = this;

        if (!obj || !obj.email || !obj.password){
            console.warn("[modelo.registrarUsuario] datos inválidos");
            callback({ email: -1 });
            return;
        }
        if (!obj.nick){ obj.nick = obj.email; }

        this.cad.buscarUsuario({ email: obj.email }, function(usr){
            console.log("[modelo.registrarUsuario] resultado buscarUsuario:", usr);
            if (!usr){
            modelo.cad.insertarUsuario(obj, function(res){
                console.log("[modelo.registrarUsuario] resultado insertarUsuario:", res);
                callback(res);
            });
            } else {
            console.warn("[modelo.registrarUsuario] duplicado:", obj.email);
            callback({ email: -1 });
            }
        });
        };

    this.loginUsuario = function(obj, callback){
        console.log("[modelo.loginUsuario] entrada:", obj);
        if (!obj || !obj.email || !obj.password){
            console.warn("[modelo.loginUsuario] datos inválidos");
            callback({ email: -1 });
            return;
        }
        this.cad.buscarUsuario({ email: obj.email }, function(usr){
            console.log("[modelo.loginUsuario] resultado buscarUsuario:", usr);
            if (usr && usr.password == obj.password){
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