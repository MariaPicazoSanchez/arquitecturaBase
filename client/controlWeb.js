function ControlWeb() {
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

        // URL del juego (por ahora solo UNO)
        let url = "/uno";
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
            // cw.mostrarPartidas();
            cw.mostrarSelectorJuegos();
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

    // === Selector de juegos ===
    this.mostrarSelectorJuegos = function(){
        // Limpiamos vistas de login/registro/mensajes
        $("#registro").empty();
        $("#au").empty();
        $("#msg").empty();

        // Ocultamos el panel de partidas hasta que elijan juego
        $("#panel-partidas").hide();

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
                let nombre = $("#nombre").val();
                let apellidos = $("#apellidos").val();
                console.log("[UI] Click Registrar:", { email, tienePwd: !!pwd });
                let errores = [];
                if (!email)     errores.push("el email");
                if (!nombre)    errores.push("el nombre");
                if (!apellidos) errores.push("los apellidos");
                if (!pwd)       errores.push("la contraseña");

                if (errores.length > 0) {
                    let msg = "faltan por rellenar: " + errores.join(", ") + ".";
                    cw.mostrarModal("No se ha podido registrar el usuario porque " + msg);
                    return;
                }

                // Validación de contraseña: mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número o símbolo
                const pwdValida = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9\W_]).{8,}$/;
                if (!pwdValida.test(pwd)) {
                    cw.mostrarModal("La contraseña debe tener al menos 8 caracteres, incluyendo una letra mayúscula, una minúscula y un número o símbolo.");
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
        try { window._ultimaListaPartidas = lista; } catch(e){}

        const juegoActual = cw.juegoActual;

        const $tbody = $("#tbody-partidas");
        $tbody.empty();

        // Si no hay ninguna partida
        if (!Array.isArray(lista) || lista.length === 0){
            $tbody.append(`
              <tr>
                <td colspan="2" class="text-muted">No hay partidas en el sistema.</td>
              </tr>
            `);
            return;
        }

        // Filtrar por juego actual (si lo hay)
        const listaFiltrada = lista.filter(function(p){
            if (!juegoActual) return true;        // si no se ha elegido juego, no filtramos
            if (!p.juego) return (juegoActual === 'uno');  // partidas “viejas” sin campo juego
            return p.juego === juegoActual;
        });

        if (listaFiltrada.length === 0){
            $tbody.append(`
              <tr>
                <td colspan="2" class="text-muted">No hay partidas para este juego.</td>
              </tr>
            `);
            return;
        }

        listaFiltrada.forEach(function(p){
            const me = ($.cookie("nick") || cw.email || "").toLowerCase();
            const esPropia = (p.propietario && p.propietario.toLowerCase() === me);

            const jugadores = (typeof p.jugadores === 'number')
                ? p.jugadores
                : (p.numJugadores || 0);

            const maxJug = (typeof p.maxJug === 'number') ? p.maxJug : 2;
            const partidaCompleta = jugadores >= maxJug;
            const puedeUnirse = !partidaCompleta;

            const juego = p.juego || juegoActual || 'uno';
            const nombreJuego =
                juego === 'uno'    ? 'Última carta' :
                juego === '4raya'  ? '4 en raya' :
                juego === 'hundir' ? 'Hundir la flota' :
                juego;

            let acciones = '';

            // Botones para el propietario
            if (esPropia){
                acciones += `
                <button class="btn btn-success btn-sm btn-continuar"
                        data-codigo="${p.codigo}">
                    Jugar
                </button>
                `;
                acciones += `
                <button class="btn btn-outline-danger btn-sm btn-eliminar"
                        data-codigo="${p.codigo}">
                    Borrar
                </button>
                `;
            } else {
                // Botón para unirse (otros usuarios)
                acciones += `
                <button class="btn btn-outline-info btn-sm btn-unirse"
                        data-codigo="${p.codigo}"
                        ${puedeUnirse ? '' : 'disabled'}>
                    ${puedeUnirse ? 'Unirse' : 'Esperando'}
                </button>
                `;
            }


            const propietarioTexto = p.propietario || 'Desconocido';

            const fila = `
              <tr>
                <td>
                  <div class="d-flex flex-column">
                    <div>
                      <span class="badge badge-dark align-middle">${p.codigo}</span>
                      <button class="btn btn-light btn-sm ml-1 btn-copiar-codigo"
                              data-codigo="${p.codigo}"
                              title="Copiar código">
                        Copiar
                      </button>
                    </div>
                    <small class="text-muted">
                      ${nombreJuego ? nombreJuego + ' · ' : ''}${propietarioTexto}
                      · ${jugadores}/${maxJug} jugadores
                    </small>
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
