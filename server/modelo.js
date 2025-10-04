function Sistema() {
    this.usuarios = {};

    this.agregarUsuario = function(nick) {
        let res = { nick: -1 };
        if (!this.usuarios[nick]) {
            this.usuarios[nick] = new Usuario(nick);
            res.nick = nick;
        } else {
            console.log("El nick " + nick + " está en uso");
        }
        return res;
    }


    this.obtenerUsuarios = function() {
        return this.usuarios;
    }

    this.usuarioActivo = function(nick) {
        return this.usuarios.hasOwnProperty(nick);
    }

    this.eliminarUsuario = function(nick) {
        delete this.usuarios[nick];
    }

    this.numeroUsuarios = function() {
        return Object.keys(this.usuarios).length;
    }
}

function Usuario(nick) {
    this.nick = nick;
}

module.exports.Sistema = Sistema;