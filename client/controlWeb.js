function ControlWeb() {
    this.mostrarAgregarUsuario = function() {
        let cadena = '<div id="mAU" class="form-group">';
        cadena += '<label for="name">Name:</label>';
        cadena += '<input type="text" class="form-control" id="nick">';
        cadena += '<button id="btnAU" type="button" class="btn btn-primary mt-2">Agregar Usuario</button>';
        cadena += '</div>';

        $("#au").append(cadena);

        $("#btnAU").on("click", function() {
            let nick = $("#nick").val();
            rest.agregarUsuario(nick);
            $("#mAU").remove();
        });
    }

}
