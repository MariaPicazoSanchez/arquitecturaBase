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


    this.registrarUsuario = function(email, password, nick){
        console.log("[cliente] Iniciando registro para:", email);
        $.ajax({
            type: 'POST',
            url: '/registrarUsuario',
            data: JSON.stringify({ email: email, password: password, nick: nick }),
            contentType: 'application/json',
            dataType: 'json',
            
            success: function(data, status, xhr){
                console.log("[cliente] SUCCESS status:", xhr.status, "data:", data);
                if (data.nick && data.nick !== -1){
                    cw.limpiar();
                    cw.mostrarAviso("Registro completado. Revisa el correo para verificar.", "success");
                    cw.mostrarLogin({ email, keepMessage: true });
                } else {
                    console.log("[cliente] Registro fallido:", data);
                    const errorMsg = data.error || "No se ha podido registrar el usuario";
                    cw.mostrarModal(errorMsg);
                }
            },
            error: function(xhr, status, error){
                console.log("[cliente] ERROR status:", xhr.status, "responseText:", xhr.responseText);
                let errorMsg = "Error al registrar el usuario";
                
                // Intentar parsear el JSON de la respuesta de error
                try {
                    if (xhr.responseText) {
                        const resp = JSON.parse(xhr.responseText);
                        console.log("[cliente] Parsed error response:", resp);
                        if (resp && resp.error) {
                            errorMsg = resp.error;
                        }
                    }
                } catch(e) {
                    console.log("[cliente] No se pudo parsear responseText:", e.message);
                }
                
                cw.mostrarModal(errorMsg);
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
                    cw.mostrarSelectorJuegos();
                    
                    try { sessionStorage.setItem("bienvenidaMostrada","1"); } catch(e){}
                    if (window.userService && typeof userService.getMe === "function"){
                        userService.getMe()
                            .done(function(me){
                                const label = (me && me.nick) ? me.nick : "";
                                cw.mostrarMensaje(label ? ("Bienvenido a Table Room, " + label) : "Bienvenido a Table Room", "success");
                            })
                            .fail(function(){
                                cw.mostrarMensaje("Bienvenido a Table Room", "success");
                            });
                    } else {
                        cw.mostrarMensaje("Bienvenido a Table Room", "success");
                    }
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
    
    // Obtener registro de actividad del usuario
    this.obtenerActividad = function(email){
        const params = $.param({ email: email, limit: 200 });
        $.ajax({
            url: '/api/logs?' + params,
            method: 'GET',
            dataType: 'json',
            success: function(logs){
                if (window.cw && typeof cw.mostrarActividadListado === 'function'){
                    cw.mostrarActividadListado(logs || []);
                }
            },
            error: function(){
                if (window.cw){
                    cw.mostrarAviso('No se pudo obtener el registro de actividad', 'error');
                }
            }
        });
    };

    // --------------------
    // Mi cuenta
    // --------------------
    this.obtenerMiCuenta = function(onOk, onErr){
        if (window.userService && typeof userService.getMe === "function"){
            userService.getMe()
                .done(function(user){ if (typeof onOk === "function") onOk(user); })
                .fail(function(xhr){
                    let msg = 'No se pudo cargar tu cuenta';
                    try {
                        const resp = xhr && xhr.responseText ? JSON.parse(xhr.responseText) : null;
                        if (resp && resp.error) msg = resp.error;
                    } catch(e) {}
                    if (typeof onErr === "function") onErr(msg);
                });
            return;
        }
        if (typeof onErr === "function") onErr("Servicio de cuenta no disponible.");
    };

    this.actualizarMiCuenta = function(payload, onOk, onErr){
        if (window.userService && typeof userService.updateMe === "function"){
            userService.updateMe(payload || {})
                .done(function(user){ if (typeof onOk === "function") onOk(user); })
                .fail(function(xhr){
                    let msg = 'No se pudo actualizar el perfil';
                    try {
                        const resp = xhr && xhr.responseText ? JSON.parse(xhr.responseText) : null;
                        if (resp && resp.error) msg = resp.error;
                    } catch(e) {}
                    if (typeof onErr === "function") onErr(msg);
                });
            return;
        }
        if (typeof onErr === "function") onErr("Servicio de cuenta no disponible.");
    };

    this.solicitarCambioPasswordMiCuenta = function(onOk, onErr){
        if (window.userService && typeof userService.requestPasswordChange === "function"){
            userService.requestPasswordChange()
                .done(function(){ if (typeof onOk === "function") onOk(); })
                .fail(function(xhr){
                    let msg = 'No se pudo enviar el correo';
                    try {
                        const resp = xhr && xhr.responseText ? JSON.parse(xhr.responseText) : null;
                        if (resp && resp.error) msg = resp.error;
                    } catch(e) {}
                    if (typeof onErr === "function") onErr(msg);
                });
            return;
        }
        if (typeof onErr === "function") onErr("Servicio de cuenta no disponible.");
    };

    this.confirmarCambioPasswordMiCuenta = function(payload, onOk, onErr){
        const code = payload && (payload.code || payload.codeOrToken);
        const newPassword = payload && payload.newPassword;
        if (window.userService && typeof userService.confirmPasswordChange === "function"){
            userService.confirmPasswordChange(code, newPassword)
                .done(function(){ if (typeof onOk === "function") onOk(); })
                .fail(function(xhr){
                    let msg = 'No se pudo cambiar la contraseña';
                    try {
                        const resp = xhr && xhr.responseText ? JSON.parse(xhr.responseText) : null;
                        if (resp && resp.error) msg = resp.error;
                    } catch(e) {}
                    if (typeof onErr === "function") onErr(msg);
                });
            return;
        }
        if (typeof onErr === "function") onErr("Servicio de cuenta no disponible.");
    };

    this.eliminarMiCuenta = function(payload, onOk, onErr){
        if (window.userService && typeof userService.deleteMe === "function"){
            userService.deleteMe(payload || {})
                .done(function(){ if (typeof onOk === "function") onOk(); })
                .fail(function(xhr){
                    let msg = 'No se pudo eliminar la cuenta';
                    try {
                        const resp = xhr && xhr.responseText ? JSON.parse(xhr.responseText) : null;
                        if (resp && resp.error) msg = resp.error;
                    } catch(e) {}
                    if (typeof onErr === "function") onErr(msg);
                });
            return;
        }
        if (typeof onErr === "function") onErr("Servicio de cuenta no disponible.");
    };
     

}


