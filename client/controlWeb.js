function ControlWeb() {
    this.mostrarAgregarUsuario = function() {
        $("#au").empty();
        let cadena = '<div id="mAU" class="form-group">';
        cadena += '<label for="name">Name:</label>';
        cadena += '<input type="text" class="form-control" id="nick">';
        cadena += '<button id="btnAU" type="button" class="btn btn-primary mt-2">Agregar Usuario</button>';
        cadena += '</div>';

        $("#au").append(cadena);

        $("#btnAU").on("click", function() {
            let nick = $("#nick").val();
            rest.agregarUsuario(nick);
            // $("#mAU").remove();
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
            cw.mostrarMensaje("Bienvenido al sistema, "+nick);
            // cw.mostrarSalir();
        }else{
            cw.mostrarAgregarUsuario();
        }
    };

    this.mostrarMensaje=function(msg){
        $("#au").empty();
        let cadena='<div class="alert alert-info alert-dismissible fade show" role="alert">';
        cadena+=msg;
        // cadena+='<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>';
        cadena+='</div>';
        $("#au").append(cadena);
        cw.mostrarSalir();
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


}
