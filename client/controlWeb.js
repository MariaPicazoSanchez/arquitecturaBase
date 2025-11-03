function ControlWeb() {
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
            // cw.mostrarSalir();
        }else{
            cw.mostrarRegistro();
        }
    };

    this.mostrarMensaje=function(msg, tipo="info"){
        $("#au").empty();
        let alertClass = "alert-" + (tipo === "error" ? "danger" : tipo === "success" ? "success" : "info");
        let cadena='<div class="alert '+alertClass+' alert-dismissible fade show" role="alert">';        cadena+=msg;
        cadena+='</div>';
        $("#au").append(cadena);
        if (tipo === "success"){
            cw.mostrarSalir();
        }
    };

    this.mostrarAviso=function(msg, tipo="info"){
        let alertClass = "alert-" + (tipo === "error" ? "danger" : tipo === "success" ? "success" : "info");
        let cadena='<div class="alert '+alertClass+'" role="alert">'+msg+'</div>';
        $("#msg").html(cadena);
    };

    this.limpiar=function(){
        $("#registro").empty();
    };

    this.salir = function(){
        let nick = $.cookie("nick");
        let cadena='<div class="alert alert-info" role="alert">';
        cadena+='Has salido del sistema.';
        cadena+='</div>';
        $("#au").empty();
        $("#au").append(cadena);
        if(nick){
            cw.mostrarMensaje("Hasta pronto, " + nick);
            $.removeCookie("nick");
        }
        location.reload();
    };

    this.mostrarSalir=function(){
        let cadena='<button id="btnSalir" type="button" class="btn btn-danger mt-2">Salir</button>';
        $("#au").append(cadena);
        $("#btnSalir").on("click", function() {
            cw.salir();
        });
    };

    this.mostrarRegistro = function(){
        $("#fmRegistro").remove();
        $("#msg").empty();
        $("#registro").load("./cliente/registro.html", function(){
            $("#btnRegistro").on("click", function(e){
            e.preventDefault();
            let email = $("#email").val();
            let pwd   = $("#pwd").val();
            if (email && pwd){
                rest.registrarUsuario(email, pwd);
            }
            });
        });
    };
    this.mostrarLogin = function(){
        $("#fmLogin").remove();
        $("#msg").empty();
        $("#registro").load("./cliente/login.html", function(){
            $("#btnLogin").on("click", function(e){
            e.preventDefault();
            let email = $("#emailLogin").val();
            let pwd   = $("#pwdLogin").val();
            if (email && pwd){
                rest.loginUsuario(email, pwd);
            }
            });
        });
    };


}
