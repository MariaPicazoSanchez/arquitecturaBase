    // Verifica si el usuario tiene una partida activa
    this.tienePartidaPropia = function(lista) {
        const me = ($.cookie("nick") || this.email || "").toLowerCase();
        return Array.isArray(lista) && lista.some(p => p.propietario && p.propietario.toLowerCase() === me);
    };
function ControlWeb() {
        // Verifica si el usuario tiene una partida activa
        this.tienePartidaPropia = function(lista) {
            const me = ($.cookie("nick") || this.email || "").toLowerCase();
            return Array.isArray(lista) && lista.some(p => p.propietario && p.propietario.toLowerCase() === me);
        };
    this.juegoActual = null;

    this._updateMainVisibility = function(){
        const a = $.trim($("#au").html());
        const r = $.trim($("#registro").html());
        const m = $.trim($("#msg").html());
        const empty = (!a && !r && !m);
        if (empty){
            $("#mainContent").hide();
        } else {
            $("#mainContent").show();
        }
    };

    this.mostrarJuegoEnApp = function(juego, codigo){
        // Guardamos qué juego estamos mostrando
        this.juegoActual = juego || this.juegoActual || "uno";

        const nombreBonito =
            this.juegoActual === "uno"    ? "Última carta" :
            this.juegoActual === "4raya"  ? "4 en raya" :
            this.juegoActual === "hundir" ? "Hundir la flota" :
            this.juegoActual;

        $("#titulo-juego-actual").text("Juego: " + nombreBonito);

        // URL del juego (iframe)
        let url =
            this.juegoActual === "4raya" ? "/4raya" :
            this.juegoActual === "uno"   ? "/uno" :
            "/uno";
        if (codigo){
            url += "?codigo=" + encodeURIComponent(codigo);
        }

        $("#iframe-juego").attr("src", url);
        $("#selector-juegos").hide();
        $("#panel-partidas").hide();
        $("#zona-juego").show();

        this._updateMainVisibility();

        // Scroll suave hasta el juego
        try {
            $("html, body").animate({
                scrollTop: $("#zona-juego").offset().top - 60
            }, 300);
        } catch(e){}
    };

    this.volverDesdeJuego = function(){
        // Paramos el juego (vaciamos el iframe)
        $("#iframe-juego").attr("src", "");

        // Volvemos a ver el selector de juegos y las partidas del juego actual
        $("#zona-juego").hide();
        $("#selector-juegos").show();
        $("#panel-partidas").show();

        // Refrescamos la lista de partidas por si ha cambiado algo
        if (window.ws && typeof ws.pedirListaPartidas === "function"){
            ws.pedirListaPartidas();
        }
        if (window._ultimaListaPartidas){
            this.pintarPartidas(window._ultimaListaPartidas);
        }

        this._updateMainVisibility();
    };


    this.mostrarAgregarUsuario=function(){
        $('#bnv').remove();
        $('#mAU').remove();
        let cadena='<div id="mAU">';
        cadena = cadena + '<div class="card"><div class="card-body">';
        cadena = cadena +'<div class="form-group">';
        cadena = cadena + '<label for="nick">Nick:</label>';
        cadena = cadena + '<p><input type="text" class="form-control" id="nick" placeholder="introduce un nick"></p>';
        cadena = cadena + '<button id="btnAU" type="submit" class="btn btn-primary">Submit</button>';
        cadena=cadena+'<div><a href="/auth/google"><img src="./img/G.png" style="height:60px;margin-top:30px"></a></div>';
        cadena = cadena + '</div>';
        cadena = cadena + '</div></div></div>';
        $("#au").append(cadena);

        $("#btnAU").on("click", function() {
            let nick = $("#nick").val().trim();
            if (nick) {
                rest.agregarUsuario(nick);
            } else {
                cw.mostrarMensaje("El nick no puede estar vacío.");
            }
        });
    };

    this.mostrarListaUsuarios = function(){
        $("#au").empty();
        let cadena = '<div id="mLU">';
        cadena += '<h5>Lista de Usuarios</h5>';
        cadena += '<div class="alert alert-info mt-3">Cargando la lista de usuarios...</div>';
        cadena += '<div id="listaUsuarios" class="mt-3"></div>';
        cadena += '</div>';
        
        $("#au").append(cadena);
        rest.obtenerUsuarios();
    };

    this.comprobarSesion=function(){
        let nick=$.cookie("nick");
        if (nick){
            cw.email = nick;
            if (window.ws){
                ws.email = nick;
                // if (ws.pedirListaPartidas){
                //     ws.pedirListaPartidas();
                // }
            }
            // Verificar sesión real (cookie "nick" puede quedar "stale" si el servidor se reinicia)
            if (window.userService && typeof userService.getMe === "function"){
                userService.getMe()
                    .done(function(me){
                        const label = (me && (me.nick || me.email)) || nick;
                        cw._setNavToLogout();
                        cw._setNavUserLabel(label);
                        cw.mostrarSelectorJuegos();
                        if (!sessionStorage.getItem("bienvenidaMostrada")){
                            sessionStorage.setItem("bienvenidaMostrada","1");
                            cw.mostrarMensaje("Bienvenido a Table Room, "+label, "success");
                        }
                    })
                    .fail(function(xhr){
                        if (xhr && xhr.status === 401){
                            try { $.removeCookie('nick'); } catch(e) {}
                            cw.email = null;
                            if (window.ws){ try { ws.email = null; } catch(e) {} }
                            cw._setNavToLogin();
                            cw.mostrarRegistro();
                            cw.mostrarAviso("Tu sesión ha caducado. Inicia sesión de nuevo.", "error");
                            return;
                        }
                        // fallback best-effort: mantener comportamiento antiguo
                        cw.mostrarSelectorJuegos();
                        cw._setNavToLogout();
                    });
                return;
            }

            // cw.mostrarPartidas();
            cw.mostrarSelectorJuegos();
            if (!sessionStorage.getItem("bienvenidaMostrada")){
                sessionStorage.setItem("bienvenidaMostrada","1");
                cw.mostrarMensaje("Bienvenido a Table Room, "+nick, "success");
            } else {
                cw._setNavToLogout();
            }
        }else{
            cw._setNavToLogin();
            cw.mostrarRegistro();
        }
    };

    // === Selector de juegos ===
    this.mostrarSelectorJuegos = function(){
        // Limpiamos vistas de login/registro/mensajes
        $("#registro").empty();
        $("#au").empty();
        $("#msg").empty();

        // Ocultamos el panel de partidas hasta que elijan juego
        $("#panel-partidas").hide();
        $("#panel-cuenta").hide();
        this._cuentaVisible = false;

        // Mostramos el selector de juegos
        $("#selector-juegos").show();

        cw._updateMainVisibility();
    };

    this.seleccionarJuego = function(juegoId){
        this.juegoActual = juegoId || "uno";

        if (window.ws){
            ws.gameType = this.juegoActual;
        }

        const nombreBonito =
            this.juegoActual === "uno"    ? "Última carta" :
            this.juegoActual === "4raya"  ? "4 en raya" :
            this.juegoActual === "hundir" ? "Hundir la flota" :
            this.juegoActual;

        $("#titulo-partidas-juego").text("Partidas de " + nombreBonito);
        $("#titulo-juego-actual").text("Juego: " + nombreBonito);

        $("#selector-juegos").show();
        $("#panel-partidas").show();
        $("#zona-juego").hide();
        $("#panel-cuenta").hide();
        this._cuentaVisible = false;

        if (window.ws && typeof ws.pedirListaPartidas === "function"){
            ws.pedirListaPartidas();
        }
        if (window._ultimaListaPartidas){
            this.pintarPartidas(window._ultimaListaPartidas);
        }

        this._updateMainVisibility();
    };





    this.mostrarMensaje=function(msg, tipo="info"){
        $("#au").empty();
        let alertClass = "alert-" + (tipo === "error" ? "danger" : tipo === "success" ? "success" : "info");
        let $alert = $('<div class="alert '+alertClass+' alert-dismissible fade show" role="alert"></div>');
        $alert.text(msg);
        $("#au").append($alert);
        cw._updateMainVisibility();

        if (tipo === "success"){
            cw._setNavToLogout();
            setTimeout(function(){
                $alert.fadeOut(400, function(){ $(this).remove(); cw._updateMainVisibility(); });
            }, 10000);
        }
    };

    this.mostrarAviso=function(msg, tipo="info"){
        let alertClass = "alert-" + (tipo === "error" ? "danger" : tipo === "success" ? "success" : "info");
        let cadena='<div class="alert '+alertClass+'" role="alert">'+msg+'</div>';
        $("#msg").html(cadena);
        cw._updateMainVisibility();
    };

    this.limpiar=function(){
        $("#registro").empty();
        cw._updateMainVisibility();
    };

    this.salir = function(){
        let nick = $.cookie("nick");
        let cadena='<div class="alert alert-info" role="alert">';
        cadena+='Has salido del sistema.';
        cadena+='</div>';
        $("#au").empty();
        $("#au").append(cadena);
        cw._updateMainVisibility();
        if(nick){
            cw.mostrarMensaje("Hasta pronto, " + nick);
        }
        try { sessionStorage.removeItem("bienvenidaMostrada"); } catch(e){}
        $("#panel-cuenta").hide();
        this._cuentaVisible = false;
        rest.salidaDeUsuario();
    };

    this._setNavToLogout = function(){
        const $nav = $(".navbar-nav.ml-auto");
        if (!$nav.length) return;

        try { $("#menuHelp").closest("li").hide(); } catch(e) {}
        try { $("#menuIniciarSesion").closest("li").hide(); } catch(e) {}

        $("#navUserDropdown").remove();
        $("#navUserActions").remove();
        $("#btnSalirNav").closest("li").remove();
        $("#btnVerActividad").closest("li").remove();
        $("#btnMiCuenta").closest("li").remove();
        $("#navUserLabel").remove();

        const $dropdown = $(`
          <li class="nav-item dropdown" id="navUserDropdown">
            <a class="nav-link dropdown-toggle nav-user-toggle" href="#" id="navUserToggle" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"></a>
            <div class="dropdown-menu dropdown-menu-right" aria-labelledby="navUserToggle">
              <a class="dropdown-item" href="#" id="navGestionarCuenta">Gestionar cuenta</a>
              <a class="dropdown-item" href="#" id="navActividad">Actividad</a>
              <a class="dropdown-item" href="#" id="navAyuda">Ayuda</a>
              <div class="dropdown-divider"></div>
              <a class="dropdown-item text-danger" href="#" id="navSalir">Salir</a>
            </div>
          </li>
        `);

        $nav.append($dropdown);

        $("#navGestionarCuenta").off("click").on("click", function(e){
            e.preventDefault();
            try { window.location.hash = "#/mi-cuenta"; } catch(ex) {}
            cw.mostrarMiCuenta();
        });
        $("#navActividad").off("click").on("click", function(e){
            e.preventDefault();
            try { window.location.hash = "#/actividad"; } catch(ex) {}
            cw.mostrarActividad();
        });
        $("#navAyuda").off("click").on("click", function(e){
            e.preventDefault();
            try { $("#menuHelp").trigger("click"); } catch(ex) {}
        });
        $("#navSalir").off("click").on("click", function(e){
            e.preventDefault();
            cw.salir();
        });

        try {
            const fallback = ($.cookie && $.cookie("nick")) || this.email || "";
            if (fallback) { this._setNavUserLabel(fallback); }
        } catch(e) {}
    };

    this._setNavToLogin = function(){
        // Navbar nuevo: dropdown de usuario (restaurar estado "no logueado")
        $("#navUserDropdown").remove();
        try { $("#menuHelp").closest("li").show(); } catch(e) {}
        try { $("#menuIniciarSesion").closest("li").show(); } catch(e) {}
        $("#menuIniciarSesion").off("click").on("click", function(){ cw.mostrarLogin(); });
        return;
        let $salir = $("#btnSalirNav");
        if ($salir.length){
            let $btn = $("<button type='button' class='btn btn-ignition' id='menuIniciarSesion'>Iniciar sesión</button>");
            $salir.replaceWith($btn);
            $btn.on('click', function(){ cw.mostrarLogin(); });
        } else {
            let $nav = $(".navbar-nav.ml-auto");
            if ($nav.length && $nav.find('#menuIniciarSesion').length===0){
                $nav.append("<li class='nav-item'><button type='button' class='btn btn-ignition' id='menuIniciarSesion'>Iniciar sesión</button></li>");
                $("#menuIniciarSesion").on('click', function(){ cw.mostrarLogin(); });
            }
        }
    };

    this._setNavUserLabel = function(text){
        const tNew = String(text || "").trim();
        const $toggle = $("#navUserToggle");
        if ($toggle.length) { $toggle.text(tNew); return; }
        const t = String(text || "").trim();
        const $label = $("#navUserLabel");
        if ($label.length){
            $label.text(t);
        }
    };

    // Mostrar actividad del usuario
    // Estado de visibilidad del panel de actividad
    this._actividadVisible = false;
    this._cuentaVisible = false;
    this._perfil = null;
    this._cargandoCuenta = false;

    this.mostrarActividad = function(){
        // Toggle: si ya está visible, ocultar
        if (this._actividadVisible) {
            $("#au").empty();
            this._actividadVisible = false;
            // Restaurar etiqueta del botón
            const $btn = $("#btnVerActividad, #navActividad");
            if ($btn.length) { $btn.text("Actividad"); }
            this._updateMainVisibility();
            return;
        }
        const email = ($.cookie('nick') || this.email || '').toLowerCase();
        if (!email){
            this.mostrarAviso('Debes iniciar sesión para ver la actividad', 'error');
            return;
        }
        if (window.rest && typeof rest.obtenerActividad === 'function'){
            rest.obtenerActividad(email);
        }
    };

    // ---------------------------
    // Mi cuenta
    // ---------------------------

    this._setAccountAlert = function(msg, tipo){
        const t = tipo || "info";
        const cls = "alert-" + (t === "error" ? "danger" : t === "success" ? "success" : "info");
        if (!msg){
            $("#account-alert").empty();
            return;
        }
        $("#account-alert").html("<div class='alert " + cls + "' role='alert'>" + msg + "</div>");
    };

    this._renderCuenta = function(user){
        if (!user) return;
        this._perfil = user;

        const name = user.nombre || user.displayName || "";
        const nick = user.nick || "";
        const email = user.email || "";

        $("#account-nombre").text(name || "—");
        $("#account-nick").text(nick || "—");
        $("#account-email").text(email || "—");

        $("#input-nombre").val(name);
        $("#input-nick").val(nick);
        $("#input-password-code").val("");
        $("#input-newPassword").val("");
        $("#input-newPassword2").val("");
        $("#password-change-form").hide();

        const label = (name || nick || email);
        if (label) this._setNavUserLabel(label);

        const canChangePassword = !!user.canChangePassword;
        if (canChangePassword){
            $("#card-password").show();
            $("#btn-request-password-change").prop("disabled", false);
            $("#password-disabled").hide();
            $("#delete-password-group").show();
            $("#delete-account-hint").text("");
        } else {
            $("#btn-request-password-change").prop("disabled", true);
            $("#password-disabled").show();
            $("#delete-password-group").hide();
            $("#delete-account-hint").text("Cuenta Google: la eliminación solo requiere confirmación.");
        }
    };

    this._cargarCuenta = function(){
        if (this._cargandoCuenta) return;
        this._cargandoCuenta = true;
        this._setAccountAlert("Cargando tu perfil...", "info");

        if (window.rest && typeof rest.obtenerMiCuenta === "function"){
            rest.obtenerMiCuenta(function(user){
                cw._cargandoCuenta = false;
                cw._setAccountAlert("", "info");
                cw._renderCuenta(user);
            }, function(errMsg){
                cw._cargandoCuenta = false;
                cw._setAccountAlert(errMsg || "No se pudo cargar tu cuenta.", "error");
            });
        } else {
            this._cargandoCuenta = false;
            this._setAccountAlert("Servicio de cuenta no disponible.", "error");
        }
    };

    this._wireCuentaHandlers = function(){
        $("#btn-volver-cuenta").off("click").on("click", function(){
            cw._cuentaVisible = false;
            $("#panel-cuenta").hide();
            cw.mostrarSelectorJuegos();
        });

        $("#form-editar-perfil").off("submit").on("submit", function(e){
            e.preventDefault();
            const nombre = ($("#input-nombre").val() || "").trim();
            let nick = ($("#input-nick").val() || "").trim();
            // Normalizar espacios para evitar errores de validación
            nick = nick.replace(/\s+/g, "_");
            $("#input-nick").val(nick);
            const $btn = $("#btn-guardar-perfil");
            $btn.prop("disabled", true).text("Guardando...");
            cw._setAccountAlert("", "info");

            if (window.rest && typeof rest.actualizarMiCuenta === "function"){
                rest.actualizarMiCuenta({ nombre, nick }, function(user){
                    $btn.prop("disabled", false).text("Guardar cambios");
                    cw._setAccountAlert("Perfil actualizado.", "success");
                    cw._renderCuenta(user);
                }, function(errMsg){
                    $btn.prop("disabled", false).text("Guardar cambios");
                    cw._setAccountAlert(errMsg || "No se pudo actualizar el perfil.", "error");
                });
            } else {
                $btn.prop("disabled", false).text("Guardar cambios");
                cw._setAccountAlert("Servicio de cuenta no disponible.", "error");
            }
        });

        $("#btn-request-password-change").off("click").on("click", function(){
            const $btn = $("#btn-request-password-change");
            $btn.prop("disabled", true).text("Enviando...");
            cw._setAccountAlert("", "info");

            if (window.rest && typeof rest.solicitarCambioPasswordMiCuenta === "function"){
                rest.solicitarCambioPasswordMiCuenta(function(){
                    $btn.prop("disabled", false).text("Cambio de contraseña");
                    $("#password-change-form").show();
                    cw._setAccountAlert("Correo enviado. Revisa tu bandeja e introduce el código.", "success");
                }, function(errMsg){
                    $btn.prop("disabled", false).text("Cambio de contraseña");
                    cw._setAccountAlert(errMsg || "No se pudo enviar el correo.", "error");
                });
            } else {
                $btn.prop("disabled", false).text("Cambio de contraseña");
                cw._setAccountAlert("Servicio de cuenta no disponible.", "error");
            }
        });

        $("#form-confirm-password-change").off("submit").on("submit", function(e){
            e.preventDefault();
            const code = ($("#input-password-code").val() || "").trim();
            const newPassword = ($("#input-newPassword").val() || "");
            const newPassword2 = ($("#input-newPassword2").val() || "");
            if (!code){
                cw._setAccountAlert("Introduce el código del correo.", "error");
                return;
            }
            if (!newPassword){
                cw._setAccountAlert("Introduce la nueva contraseña.", "error");
                return;
            }
            if (newPassword !== newPassword2){
                cw._setAccountAlert("Las contraseñas no coinciden.", "error");
                return;
            }

            const $btn = $("#btn-confirm-password-change");
            $btn.prop("disabled", true).text("Confirmando...");
            cw._setAccountAlert("", "info");

            if (window.rest && typeof rest.confirmarCambioPasswordMiCuenta === "function"){
                rest.confirmarCambioPasswordMiCuenta({ codeOrToken: code, newPassword: newPassword }, function(){
                    $btn.prop("disabled", false).text("Confirmar cambio");
                    $("#input-password-code").val("");
                    $("#input-newPassword").val("");
                    $("#input-newPassword2").val("");
                    cw._setAccountAlert("Contraseña actualizada.", "success");
                }, function(errMsg){
                    $btn.prop("disabled", false).text("Confirmar cambio");
                    cw._setAccountAlert(errMsg || "No se pudo cambiar la contraseña.", "error");
                });
            } else {
                $btn.prop("disabled", false).text("Confirmar cambio");
                cw._setAccountAlert("Servicio de cuenta no disponible.", "error");
            }
        });

        $("#btn-confirmar-eliminar-cuenta").off("click").on("click", function(){
            const confirmText = ($("#input-confirmDelete").val() || "").trim();
            const password = ($("#input-deletePassword").val() || "");
            const irreversible = $("#check-irrevocable").is(":checked");
            if (confirmText !== "ELIMINAR"){
                cw._setAccountAlert("Escribe ELIMINAR para confirmar.", "error");
                return;
            }
            if (!irreversible){
                cw._setAccountAlert("Debes marcar la casilla de confirmación.", "error");
                return;
            }

            const canChangePassword = !!(cw._perfil && cw._perfil.canChangePassword);
            if (canChangePassword && !password){
                cw._setAccountAlert("Introduce tu contraseña para confirmar.", "error");
                return;
            }
            const payload = canChangePassword ? { password } : { confirm: true };

            const $btn = $("#btn-confirmar-eliminar-cuenta");
            $btn.prop("disabled", true).text("Eliminando...");

            if (window.rest && typeof rest.eliminarMiCuenta === "function"){
                rest.eliminarMiCuenta(payload, function(){
                    $("#modalEliminarCuenta").modal("hide");
                    cw._setAccountAlert("Cuenta eliminada. Cerrando sesión...", "success");
                    try { sessionStorage.removeItem("bienvenidaMostrada"); } catch(e){}
                    setTimeout(function(){ window.location.href = "/"; }, 600);
                }, function(errMsg){
                    $btn.prop("disabled", false).text("Eliminar definitivamente");
                    cw._setAccountAlert(errMsg || "No se pudo eliminar la cuenta.", "error");
                });
            } else {
                $btn.prop("disabled", false).text("Eliminar definitivamente");
                cw._setAccountAlert("Servicio de cuenta no disponible.", "error");
            }
        });
    };

    this.mostrarMiCuenta = function(){
        if (this._cuentaVisible){
            this._cuentaVisible = false;
            $("#panel-cuenta").hide();
            this.mostrarSelectorJuegos();
            return;
        }
        const nick = $.cookie("nick");
        if (!nick){
            this.mostrarAviso("Debes iniciar sesión para acceder a tu cuenta.", "error");
            return;
        }

        $("#selector-juegos").hide();
        $("#panel-partidas").hide();
        $("#zona-juego").hide();
        $("#registro").empty();
        $("#au").empty();
        $("#msg").empty();

        this._actividadVisible = false;
        $("#panel-cuenta").show();
        this._cuentaVisible = true;
        this._updateMainVisibility();

        this._wireCuentaHandlers();
        this._cargarCuenta();
    };

    // Render de la actividad en el panel principal
    this.mostrarActividadListado = function(logs){
        $("#au").empty();
        $("#registro").empty();
        $("#msg").empty();
        let html = "<div class='card'><div class='card-body'>";
        html += "<h5 class='card-title'>Tu actividad reciente</h5>";
        if (!Array.isArray(logs) || logs.length===0){
            html += "<div class='text-muted'>No hay actividad registrada.</div>";
        } else {
            html += "<ul class='list-group'>";
            logs.forEach(function(l){
                const op = l["tipo-operacion"] || l.tipoOperacion || "operación";
                const fh = l["fecha-hora"] || l.fechaHora || "";
                html += "<li class='list-group-item d-flex justify-content-between align-items-center'>" +
                        "<span>" + op + "</span>" +
                        "<small class='text-muted'>" + fh + "</small>" +
                        "</li>";
            });
            html += "</ul>";
        }
        html += "</div></div>";
        $("#au").append(html);
        this._actividadVisible = true;
        // Cambiar etiqueta del botón mientras está visible
        const $btn = $("#btnVerActividad, #navActividad");
        if ($btn.length) { $btn.text("Cerrar actividad"); }
        this._updateMainVisibility();
    };

    this.mostrarRegistro = function(){
        $("#fmRegistro").remove();
        $("#msg").empty();
        $("#registro").load("./registro.html", function(){
            $("#btnRegistro").on("click", function(e){
                e.preventDefault();
                let email = $("#email").val().trim();
                let pwd   = $("#pwd").val().trim();
                let nick = $("#nick").val().trim();
                console.log("[UI] Click Registrar:", { email, tienePwd: !!pwd, nick });
                
                // Validación individual de campos
                if (!email) {
                    cw.mostrarModal("Debes introducir un email válido.");
                    return;
                }
                
                if (!nick) {
                    cw.mostrarModal("Debes introducir un nick.");
                    return;
                }
                
                if (nick.length < 3) {
                    cw.mostrarModal("El nick debe tener al menos 3 caracteres.");
                    return;
                }
                
                if (!pwd) {
                    cw.mostrarModal("Debes introducir una contraseña.");
                    return;
                }

                // Validación de contraseña: mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número o símbolo
                const pwdValida = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9\W_]).{8,}$/;
                if (!pwdValida.test(pwd)) {
                    cw.mostrarModal("La contraseña debe tener:\n• Mínimo 8 caracteres\n• Al menos una mayúscula\n• Al menos una minúscula\n• Al menos un número o símbolo");
                    return;
                }

                rest.registrarUsuario(email, pwd, nick);
            });

            // ensure main content visible after loading
            cw._updateMainVisibility();

        });
    };
    this.mostrarLogin = function(options){
        let opts = options || {};
        $("#fmLogin").remove();
        if (!opts.keepMessage){
            $("#msg").empty();
        }
        $("#registro").load("./login.html", function(){
            if (opts.email){
                $("#emailLogin").val(opts.email);
            }
            $("#btnLogin").on("click", function(e){
            e.preventDefault();
            let email = $("#emailLogin").val();
            let pwd   = $("#pwdLogin").val();
            if (email && pwd){
                rest.loginUsuario(email, pwd);
            }
            });
            // ensure navbar shows the login control when login form is visible
            cw._setNavToLogin();
            // ensure main content visible after loading
            cw._updateMainVisibility();
        });
    };

    this.mostrarModal = function (m) {
        console.log("[Modal] mensaje recibido:", m);
        if (!$('#miModal').length) {
            console.error('[Modal] No se encuentra el modal #miModal en el DOM');
            return;
        }
        // 1. vaciar el cuerpo del modal
        $('#mBody').empty();

        // 2. meter el texto
        $('#mBody').text(m || "");

        // 3. mostrar el modal
        console.log('[Modal] Mostrando modal #miModal');
        $('#miModal').modal('show');
    };

    // Mostrar la zona de partidas (cuando el usuario ya está logueado)
    this.mostrarPartidas = function(){
        if (!this.juegoActual){
            this.juegoActual = 'uno';
        }
        // ocultar cosas de login/registro/mensajes
        $("#registro").empty();
        $("#au").empty();
        $("#msg").empty();

        // mostrar el panel de partidas
        $("#panel-partidas").show();

        if (window.ws && ws.pedirListaPartidas){
            ws.pedirListaPartidas();
        }
        // si ya teníamos una lista recibida antes de mostrar el panel, pintarla
        if (window._ultimaListaPartidas){
            cw.pintarPartidas(window._ultimaListaPartidas);
        }

        cw._updateMainVisibility();  // actualiza visibilidad de mainContent
    };

    // Pintar la tabla de partidas disponibles (abiertas)
    // lista: [{ codigo, propietario }]
        // Pintar la tabla de partidas disponibles (abiertas)
    // lista: [{ codigo, propietario, jugadores, maxJug, juego, ... }]
    this.pintarPartidas = function(lista){
                // Deshabilitar botón crear partida si ya tiene una propia
                if (this.tienePartidaPropia(lista)) {
                    $("#btn-crear-partida").prop("disabled", true).attr("title", "Elimina tu partida antes de crear otra");
                } else {
                    $("#btn-crear-partida").prop("disabled", false).removeAttr("title");
                }
        try { window._ultimaListaPartidas = lista; } catch(e){}

        const juegoActual = cw.juegoActual;


        const $tbody = $("#tbody-partidas");
        $tbody.empty();

        // Si no hay ninguna partida
        if (!Array.isArray(lista) || lista.length === 0){
            $tbody.append(`
              <tr><td colspan="2" class="text-muted">No hay partidas en el sistema.</td></tr>
            `);
            return;
        }

        // Filtrar por juego actual (si lo hay)
        const listaFiltrada = lista.filter(function(p){
            if (!juegoActual) return true;
            if (!p.juego) return (juegoActual === 'uno');
            return p.juego === juegoActual;
        });

        if (listaFiltrada.length === 0){
            $tbody.append(`
              <tr><td colspan="2" class="text-muted">No hay partidas para este juego.</td></tr>
            `);
            return;
        }

        // Usar tarjetas visuales en vez de filas de tabla
        listaFiltrada.forEach(function(p){
            const me = ($.cookie("nick") || cw.email || "").toLowerCase();
            const esPropia = (p.propietario && p.propietario.toLowerCase() === me);
            const jugadores = Array.isArray(p.jugadores)
                ? p.jugadores.length
                : (typeof p.jugadores === 'number'
                    ? p.jugadores
                    : (p.numJugadores || 0));
            const maxPlayers = (typeof p.maxPlayers === 'number')
                ? p.maxPlayers
                : ((typeof p.maxJug === 'number') ? p.maxJug : 2);
            const status = (typeof p.status === 'string')
                ? p.status
                : (jugadores >= maxPlayers ? 'FULL' : 'OPEN');
            const partidaCompleta = (status === 'FULL' || status === 'STARTED' || jugadores >= maxPlayers);
            const yaEstoy = Array.isArray(p.jugadores)
                && p.jugadores.some(j => (j.email || j.nick || "").toLowerCase() === me);
            const puedeUnirse = !partidaCompleta && !yaEstoy;
            let textoBoton;
            if (yaEstoy) {
                textoBoton = 'Esperando...';
            } else if (status === 'STARTED') {
                textoBoton = 'En curso';
            } else if (partidaCompleta) {
                textoBoton = 'Completa';
            } else {
                textoBoton = 'Unirse';
            }
            const juego = p.juego || juegoActual || 'uno';
            const nombreJuego =
                juego === 'uno'    ? 'Última carta' :
                juego === '4raya'  ? '4 en raya' :
                juego === 'hundir' ? 'Hundir la flota' :
                juego;
            const statusClass =
                status === 'STARTED' ? 'status-active' :
                status === 'OPEN' ? 'status-pending' :
                'status-finished';
            let acciones = '';
            if (esPropia){
                acciones += `
                  <button class="btn btn-jugar btn-continuar" data-codigo="${p.codigo}">Jugar</button>
                  <button class="btn btn-eliminar btn-eliminar" data-codigo="${p.codigo}">Eliminar</button>
                `;
            } else {
                acciones += `
                  <button class="btn btn-primary btn-unirse" data-codigo="${p.codigo}" ${puedeUnirse ? '' : 'disabled'}>${textoBoton}</button>
                `;
            }
            const propietarioTexto = p.propietario || 'Desconocido';
            const card = `
              <tr><td colspan="2" style="padding:0; border:none; background:transparent;">
                <div class="partida-card-row">
                  <div class="partida-info">
                    <div>
                      <span class="partida-codigo">${p.codigo}</span>
                      <button class="btn btn-light btn-sm ml-1 btn-copiar-codigo" data-codigo="${p.codigo}" title="Copiar código">Copiar</button>
                    </div>
                    <small class="text-muted">
                      ${nombreJuego ? nombreJuego + ' · ' : ''}${propietarioTexto} · ${jugadores}/${maxPlayers} · <span class="badge-status ${statusClass}">${status}</span>
                    </small>
                  </div>
                  <div class="partida-acciones">${acciones}</div>
                </div>
              </td></tr>
            `;
            $tbody.append(card);
        });

    };
}
