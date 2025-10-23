const fs = require("fs");
const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + "/client"));

app.use(cookieSession({ 
    name: 'Sistema',
    keys: ['key1', 'key2']
}));

app.use(passport.initialize());
app.use(passport.session());

app.get("/auth/google",passport.authenticate('google', { scope: ['profile','email'] }));

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

app.get('/google/callback',
    passport.authenticate('google', {
    failureRedirect: '/fallo' }),
    function(req, res) {
        res.redirect('/good'); 
});

app.get("/good", function(request,response){
    let nick=request.user.emails[0].value;
    if (nick){ sistema.agregarUsuario(nick);}
    //console.log(request.user.emails[0].value);
    response.cookie('nick',nick); 
    response.redirect('/'); 
});

app.get("/fallo",function(request,response){
    response.send({nick:"nook"}) 
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
});

const passport=require("passport");
const cookieSession=require("cookie-session");
require("./server/passport-setup.js");
const modelo = require("./server/modelo.js");
let sistema = new modelo.Sistema();

