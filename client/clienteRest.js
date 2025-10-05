function ClienteRest() {

    this.agregarUsuario = function(nick) {
        $.getJSON("/agregarUsuario/" + nick, function(data) {
            if (data.nick != -1) {
                console.log("Usuario " + nick + " ha sido registrado");
            } else {
                console.log("El nick ya está ocupado");
            }
        });
    }

    this.obtenerUsuarios = function() {
        $.getJSON("/obtenerUsuarios", function(data) {
            console.log("Usuarios en el sistema:", data);
        });
    }

    this.numeroUsuarios = function() {
        $.getJSON("/numeroUsuarios", function(data) {
            console.log("Número de usuarios:", data.num);
        });
    }

    this.usuarioActivo = function(nick) {
        $.getJSON("/usuarioActivo/" + nick, function(data) {
            console.log("¿Usuario activo?:", data.activo);
        });
    }

    this.eliminarUsuario = function(nick) {
        $.getJSON("/eliminarUsuario/" + nick, function(data) {
            console.log("Usuario eliminado:", data.eliminado);
        });
    }

}
