function ControlWeb() {
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
                if (ws.pedirListaPartidas){
                    ws.pedirListaPartidas();
                }
            }
            cw.mostrarPartidas();
            if (!sessionStorage.getItem("bienvenidaMostrada")){
                sessionStorage.setItem("bienvenidaMostrada","1");
                cw.mostrarMensaje("Bienvenido al sistema, "+nick, "success");
            } else {
                cw._setNavToLogout();
            }
        }else{
            cw._setNavToLogin();
            cw.mostrarRegistro();
        }
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
        rest.salidaDeUsuario();
    };

    this._setNavToLogout = function(){
        let $login = $("#menuIniciarSesion");
        if ($login.length){
            let $btn = $("<button id='btnSalirNav' class='btn btn-outline-light btn-sm'>Salir</button>");
            $login.replaceWith($btn);
            $btn.on('click', function(){ cw.salir(); });
        } else {
            let $nav = $(".navbar-nav.ml-auto");
            if ($nav.length && $nav.find('#btnSalirNav').length===0){
                $nav.append("<li class='nav-item'><button id='btnSalirNav' class='btn btn-outline-light btn-sm'>Salir</button></li>");
                $("#btnSalirNav").on('click', function(){ cw.salir(); });
            }
        }
    };

    this._setNavToLogin = function(){
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

    this.mostrarRegistro = function(){
        $("#fmRegistro").remove();
        $("#msg").empty();
        $("#registro").load("./registro.html", function(){
            $("#btnRegistro").on("click", function(e){
                e.preventDefault();
                let email = $("#email").val();
                let pwd   = $("#pwd").val();
                console.log("[UI] Click Registrar:", { email, tienePwd: !!pwd });
                let errores = [];
                if (!email)     errores.push("el email");
                if (!nombre)    errores.push("el nombre");
                if (!apellidos) errores.push("los apellidos");
                if (!pwd)       errores.push("la contraseña");

                if (errores.length > 0) {
                    let msg = "faltan por rellenar: " + errores.join(", ") + ".";
                    if (cw.mostrarMensajeLogin) {
                        cw.mostrarMensajeLogin(msg);
                    }
                    cw.mostrarModal("No se ha podido registrar el usuario porque " + msg);
                    return;
                }
                rest.registrarUsuario(email, pwd);
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

        // 1. vaciar el cuerpo del modal
        $('#mBody').empty();

        // 2. meter el texto
        $('#mBody').text(m || "");

        // 3. mostrar el modal
        $('#miModal').modal('show');
    };

    // Mostrar la zona de partidas (cuando el usuario ya está logueado)
    this.mostrarPartidas = function(){
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
    this.pintarPartidas = function(lista){
        try { window._ultimaListaPartidas = lista; } catch(e){}
        const $tbody = $("#tbody-partidas");
        $tbody.empty();

        if (!lista || lista.length === 0){
            $tbody.append(`
              <tr>
                <td colspan="2" class="text-muted">No hay partidas en el sistema.</td>
              </tr>
            `);
            return;
        }

                (lista || []).forEach(function(p){
                        const me = ($.cookie("nick") || cw.email || "").toLowerCase();
                        const esPropia = (p.propietario && p.propietario.toLowerCase() === me);
                        // El botón solo está habilitado si la partida no está completa
                        const partidaCompleta = (typeof p.jugadores === 'number' && typeof p.maxJug === 'number') ? (p.jugadores >= p.maxJug) : false;
                        const puedeUnirse = !partidaCompleta;
                        const acciones = esPropia
                            ? `<button class="btn btn-outline-danger btn-sm btn-eliminar" data-codigo="${p.codigo}">Borrar</button>`
                            : `<button class="btn btn-secondary btn-sm btn-unirse" data-codigo="${p.codigo}" ${puedeUnirse ? "" : "disabled"}>${puedeUnirse ? "Unirse" : "Completa"}</button>`;

                        const fila = `
                            <tr>
                                <td>
                                    <div class="d-flex flex-column">
                                        <div>
                                            <span class="badge badge-dark align-middle">${p.codigo}</span>
                                            <button class="btn btn-outline-secondary btn-sm ml-2 btn-copiar-codigo" data-codigo="${p.codigo}" title="Copiar codigo">Copiar</button>
                                        </div>
                                        <small class="text-muted mt-1">Propietario: ${p.propietario || 'desconocido'} ${esPropia ? '<span class="badge badge-success ml-1">Propia</span>' : ''} · ${(p.jugadores||0)}/${p.maxJug||2} jugadores</small>
                                    </div>
                                </td>
                                <td class="text-right align-middle">
                                    ${acciones}
                                </td>
                            </tr>
                        `;
                        $tbody.append(fila);
                });
    };


}
