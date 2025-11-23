function ClienteRest() {

    this.agregarUsuario = function(nick) {
        $.getJSON("/agregarUsuario/" + nick, function(data) {
            let msg="El nick "+nick+" ya está ocupado.";
            if (data.nick != -1) {
                msg="Bienvenido al sistema, "+nick;
                $.cookie("nick",nick);
                cw.mostrarMensaje(msg, "success");
                if (window.ws) {
                    ws.email = data.email;
                }
                if (window.cw && cw.mostrarPartidas) {
                    cw.mostrarPartidas();
                }
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
        });
    }

    this.usuarioActivo = function(nick) {
        $.getJSON("/usuarioActivo/" + nick, function(data) {
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
        // Llamada al servidor para destruir la sesión en servidor
        $.ajax({
            url: '/salir',
            method: 'GET',
            dataType: 'json',
            success: function(data) {
                try { $.removeCookie('nick'); } catch(e) {}
                window.location.reload();
            },
            error: function() {
                try { $.removeCookie('nick'); } catch(e) {}
                window.location.reload();
            }
        });
    }


    this.registrarUsuario = function(email, password){
        console.log("[cliente] Iniciando registro para:", email);
        $.ajax({
            type: 'POST',
            url: '/registrarUsuario',
            data: JSON.stringify({ email: email, password: password }),
            contentType: 'application/json',
            dataType: 'json',
            
            success: function(data, status, xhr){
                console.log("[cliente] SUCCESS status:", xhr.status, "data:", data);
                if (data.nick && data.nick !== -1){
                    cw.limpiar();
                    cw.mostrarAviso("Registro completado. Revisa el correo para verificar.", "success");
                    cw.mostrarLogin({ email, keepMessage: true });
                } else {
                    console.log("[cliente] Registro fallido (duplicado?):", email);
                    cw.mostrarModal("No se ha podido registrar el usuario");
                }
            },
            error: function(xhr){
                console.log("[cliente] ERROR status:", xhr.status, "resp:", xhr.responseText);
                if (xhr && xhr.status === 409){
                    cw.mostrarModal("No se ha podido registrar el usuario");
                } else if (xhr && xhr.status === 504){
                    cw.mostrarAviso("Timeout del servidor registrando usuario.", "error");
                    cw.mostrarModal("Error inesperado al registrar el usuario (" + xhr.status + ")");
                } else {
                    cw.mostrarAviso("Se ha producido un error al registrar el usuario.", "error");
                    cw.mostrarModal("Error inesperado al registrar el usuario (" + xhr.status + ")");
                }
            },
            complete: function(xhr, textStatus){
                console.log("[cliente] COMPLETE:", textStatus, "status:", xhr.status);
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
                    cw.email = data.nick;
                    if (window.ws){
                        ws.email = data.nick;
                    }
                    cw.limpiar();
                    $("#msg").empty();
                    cw.mostrarPartidas();
                    // Solicitar lista de partidas tras mostrar el panel
                    if (window.ws && ws.pedirListaPartidas){
                        ws.pedirListaPartidas();
                    }
                    // Si ya hay una lista en memoria, pintarla inmediatamente
                    if (window._ultimaListaPartidas && window.cw && cw.pintarPartidas){
                        cw.pintarPartidas(window._ultimaListaPartidas);
                    }
                    try { sessionStorage.setItem("bienvenidaMostrada","1"); } catch(e){}
                    cw.mostrarMensaje("Bienvenido al sistema, " + data.nick, "success");
                } else {
                    cw.mostrarAviso("Email o contraseña incorrectos.", "error");
                    cw.mostrarModal("No se ha podido iniciar sesión. Credenciales incorrectas o usuario inexistente.");
                }
            },
            error: function(xhr){
                if (xhr && xhr.status === 401){
                    cw.mostrarAviso("Credenciales inválidas.", "error");
                    cw.mostrarModal("No se ha podido iniciar sesión. Credenciales inválidas.");
                } else {
                    cw.mostrarAviso("Se ha producido un error al iniciar sesión.", "error");
                    cw.mostrarModal("Error inesperado al iniciar sesión (" + (xhr && xhr.status) + ")");
                }
            }        
        });
    };
    

}


