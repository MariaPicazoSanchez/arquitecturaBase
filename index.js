const fs = require("fs");
const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + "/client"));

app.get("/agregarUsuario/:nick", function(request, response) {
    let nick = request.params.nick;
    let res = sistema.agregarUsuario(nick);
    response.send(res);
});

app.get("/obtenerUsuarios", function(request, response) {
    let res = sistema.obtenerUsuarios();
    response.send(res);
});

app.get("/usuarioActivo/:nick", function(request, response) {
    let nick = request.params.nick;
    let res = { activo: sistema.usuarioActivo(nick) };
    response.send(res);
});

app.get("/numeroUsuarios", function(request, response) {
    let res = { num: sistema.numeroUsuarios() };
    response.send(res);
});

app.get("/eliminarUsuario/:nick", function(request, response) {
    let nick = request.params.nick;
    sistema.eliminarUsuario(nick);
    response.send({ eliminado: nick });
});


app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
});

const modelo = require("./server/modelo.js");
let sistema = new modelo.Sistema();
