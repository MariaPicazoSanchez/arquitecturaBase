function ControlWeb() {
    // Hide main content container when all child areas are empty
    this._updateMainVisibility = function(){
        // Consider whitespace-only as empty
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
            cw.mostrarMensaje("Bienvenido al sistema, "+nick, "success");
        }else{
            cw._setNavToLogin();
            cw.mostrarRegistro();
        }
    };

    this.mostrarMensaje=function(msg, tipo="info"){
        // show message in main area
        $("#au").empty();
        let alertClass = "alert-" + (tipo === "error" ? "danger" : tipo === "success" ? "success" : "info");
        let $alert = $('<div class="alert '+alertClass+' alert-dismissible fade show" role="alert"></div>');
        $alert.text(msg);
        $("#au").append($alert);
        cw._updateMainVisibility();

        // If success (logged in), put the logout button in the navbar and auto-hide the message after 10s
        if (tipo === "success"){
            cw._setNavToLogout();
            // hide after 10 seconds
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
        rest.salidaDeUsuario();
    };

    // Replace the navbar 'Iniciar sesión' control with a 'Salir' button
    this._setNavToLogout = function(){
        // Try to find the login button
        let $login = $("#menuIniciarSesion");
        if ($login.length){
            // replace with logout button
            let $btn = $("<button id='btnSalirNav' class='btn btn-outline-light btn-sm'>Salir</button>");
            $login.replaceWith($btn);
            $btn.on('click', function(){ cw.salir(); });
        } else {
            // fallback: if there is a nav item placeholder, append
            let $nav = $(".navbar-nav.ml-auto");
            if ($nav.length && $nav.find('#btnSalirNav').length===0){
                $nav.append("<li class='nav-item'><button id='btnSalirNav' class='btn btn-outline-light btn-sm'>Salir</button></li>");
                $("#btnSalirNav").on('click', function(){ cw.salir(); });
            }
        }
    };

    // Restore the navbar 'Iniciar sesión' button
    this._setNavToLogin = function(){
        let $salir = $("#btnSalirNav");
        if ($salir.length){
            // replace with original login button
            let $btn = $("<button type='button' class='btn btn-ignition' id='menuIniciarSesion'>Iniciar sesión</button>");
            $salir.replaceWith($btn);
            $btn.on('click', function(){ cw.mostrarLogin(); });
        } else {
            // ensure there is a login button in nav
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
                if (email && pwd){
                    rest.registrarUsuario(email, pwd);
                }
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


}
