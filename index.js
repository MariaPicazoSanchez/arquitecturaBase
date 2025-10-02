const fs = require("fs");
const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + "/"));

app.get("/", function(request, response) {
    const contenido = fs.readFileSync(__dirname + "/client/index.html");
    response.setHeader("Content-Type", "text/html");
    response.send(contenido);
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
});

const modelo = require("./server/modelo.js");
let sistema = new modelo.Sistema();
