function ClienteRest() {

    this.agregarUsuario = function(nick) {
        $.getJSON("/agregarUsuario/" + nick, function(data) {
            let msg="El nick "+nick+" ya está ocupado.";
            if (data.nick != -1) {
                msg="Bienvenido al sistema, "+nick;
                $.cookie("nick",nick);
                cw.mostrarMensaje(msg, "success");
            } else {
                cw.mostrarMensaje(msg, "error");
            }
        });
    }

    this.obtenerUsuarios = function() {
        $.ajax({
            url: "/obtenerUsuarios",
            method: "GET",
            dataType: "json",
            success: function(data) {
                let currentUser = $.cookie("nick");
                let cadena = "";
                
                try {
                    if (data && typeof data === 'object') {
                        let usuarios = Array.isArray(data) ? data : 
                                     Array.isArray(data.usuarios) ? data.usuarios :
                                     Object.keys(data);
                        
                        if (usuarios.length === 0) {
                            cadena = '<div class="alert alert-warning">No hay usuarios registrados en el sistema.</div>';
                        } else {
                            usuarios.forEach(function(usuario) {
                                if (typeof usuario === 'string') {
                                    cadena += '<div class="d-flex justify-content-between align-items-center mb-2 p-2 border rounded">';
                                    cadena += '<span>' + usuario + (usuario === currentUser ? ' (Tú)' : '') + '</span>';
                                    if (usuario !== currentUser) {
                                        cadena += '<button class="btn btn-danger btn-sm eliminar-usuario" data-nick="' + usuario + '">Eliminar</button>';
                                    }
                                    cadena += '</div>';
                                }
                            });
                        }
                    } else {
                        throw new Error("Formato de datos no válido");
                    }
                } catch (error) {
                    cadena = '<div class="alert alert-danger">Error al procesar la lista de usuarios.</div>';
                }
                
                $("#listaUsuarios").html(cadena);
                $(".alert-info").remove();

                // Para la función del boton eliminar
                $("#listaUsuarios").off("click", ".eliminar-usuario").on("click", ".eliminar-usuario", function() {
                    var nick = $(this).data("nick");
                    if(nick) {
                        rest.eliminarUsuario(nick);
                    }
                });
            },
            error: function(xhr, status, error) {
                $("#listaUsuarios").html('<div class="alert alert-danger">Error al conectar con el servidor.</div>');
                $(".alert-info").remove();
            }
        });
    }


    this.numeroUsuarios = function() {
        $.getJSON("/numeroUsuarios", function(data) {
            // Número de usuarios disponible en data.num si se necesita
        });
    }

    this.usuarioActivo = function(nick) {
        $.getJSON("/usuarioActivo/" + nick, function(data) {
            // Estado del usuario disponible en data.activo si se necesita
        });
    }

    this.eliminarUsuario = function(nick) {
        if(nick) {
            $.getJSON("/eliminarUsuario/" + nick, function(data) {
                if(data.eliminado) {
                    cw.mostrarListaUsuarios();
                }
            });
        }
    }

    this.salidaDeUsuario = function() {
        cw.salir();
    }

    this.registrarUsuario = function(email, password){
        $.ajax({
            type: 'POST',
            url: '/registrarUsuario',
            data: JSON.stringify({ email, password }),
            contentType: 'application/json',
            success: function(data){
            if (data.nick && data.nick !== -1){
                cw.limpiar();
                cw.mostrarAviso("Registro completado. Ahora puedes iniciar sesión.", "success");
                cw.mostrarLogin();
            } else {
                cw.mostrarAviso("El email ya está registrado en el sistema.", "error");
            }
            },
           error: function(xhr){
                if (xhr && xhr.status === 409){
                    cw.mostrarAviso("El email ya está registrado en el sistema.", "error");
                } else {
                    cw.mostrarAviso("Se ha producido un error al registrar el usuario.", "error");
                }
            }
        });
    };

    this.loginUsuario = function(email, password){
        $.ajax({
            type: 'POST',
            url: '/loginUsuario',
            data: JSON.stringify({ email, password }),
            contentType: 'application/json',
            success: function(data){
            if (data.nick && data.nick !== -1){
                $.cookie("nick", data.nick);
                cw.limpiar();
                $("#msg").empty();
                cw.mostrarMensaje("Bienvenido al sistema, " + data.nick, "success");
            } else {
                cw.mostrarAviso("Email o contraseña incorrectos.", "error");
            }
            },
            error: function(xhr){
                if (xhr && xhr.status === 401){
                    cw.mostrarAviso("Credenciales inválidas.", "error");
                } else {
                    cw.mostrarAviso("Se ha producido un error al iniciar sesión.", "error");
                }
            }        
        });
    };
    

}


