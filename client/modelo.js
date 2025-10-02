function Sistema() {
    this.usuarios = {};

    this.agregarUsuario = function(nick) {
        this.usuarios[nick] = new Usuario(nick);
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

