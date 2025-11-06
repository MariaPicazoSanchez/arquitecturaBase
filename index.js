const fs = require("fs");
const express = require("express");
const app = express();

const PORT = process.env.PORT || 8080;
require('dotenv').config();
const passport=require("passport");
// const cookieSession=require("cookie-session");
const session = require('express-session');

require("./server/passport-setup.js");
const modelo = require("./server/modelo.js");
let sistema = new modelo.Sistema();

// Configurar Express
app.use(express.static(__dirname + "/client"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // true en producción con HTTPS
}));

// app.use(cookieSession({ 
//     name: 'Sistema',
//     keys: ['key1', 'key2']
// }));


app.use(passport.initialize());
app.use(passport.session());

// --------------------
// Rutas
// --------------------

app.get("/auth/google",
    passport.authenticate('google', { scope: ['profile','email'] })
);

app.get('/google/callback',
    passport.authenticate('google', {failureRedirect: '/fallo'}),
    function(req, res) {
        res.redirect('/good'); 
});

app.get("/good", function(req, res) {
  if (!req.user) return res.redirect('/fallo');

  const email = req.user.emails?.[0]?.value;
  if (!email) return res.redirect('/fallo');

  res.cookie('nick', email);
  res.redirect('/');

  process.nextTick(() => {
    sistema.usuarioGoogle({ email }, function(_obj) {
      // opcional: log
      console.log("Usuario guardado/actualizado en Mongo:", email);
    });
  });
});

app.get("/fallo", function(req, res) {
  res.send({ nick: "nook" });
});

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


// One Tap: callback
app.post("/oneTap/callback",
  passport.authenticate("google-one-tap", { failureRedirect: "/fallo" }),
  (req, res) => res.redirect("/good")
);


// Registro de usuario
app.post("/registrarUsuario", function(req, res){
  console.log("[/registrarUsuario] body recibido:", req.body);
  const t0 = Date.now();
  let responded = false;
  const send = (status, payload) => {
    if (responded) return;
    responded = true;
    console.log(`[/registrarUsuario] -> ${status} en ${Date.now()-t0}ms; payload:`, payload);
    return res.status(status).json(payload);
  };

  try {
    sistema.registrarUsuario(req.body, function(out){
      console.log("[/registrarUsuario] callback del modelo:", out);
      if (out && out.email && out.email !== -1){
        return send(201, { nick: out.email });
      } else {
        return send(409, { nick: -1 });
      }
    });

    setTimeout(() => {
      if (!responded){
        console.warn("[/registrarUsuario] SIN RESPUESTA tras 10s (posible cuelgue en modelo/CAD)");
        send(504, { nick: -1, reason: "timeout" });
      }
    }, 10000);

  } catch (err) {
    console.error("[/registrarUsuario] EXCEPCIÓN sin capturar:", err);
    send(500, { nick: -1 });
  }
});

app.get("/confirmarUsuario/:email/:key", (req, res) => {
  const { email, key } = req.params;
  let responded = false;

  // Función para enviar una única respuesta
  const sendResponse = (usr) => {
    if (responded) return;
    responded = true;

    if (usr && usr.email && usr.email !== -1) {
      console.log("[/confirmarUsuario] confirmación exitosa para:", usr.email);
      req.session.user = { email: usr.email };
      res.cookie('nick', usr.email);
    } else {
      console.log("[/confirmarUsuario] confirmación fallida:", usr);
    }
    res.redirect('/');
  };

  // Procesar la confirmación
  sistema.confirmarUsuario({ email, key }, (usr) => {
    console.log("[/confirmarUsuario] resultado confirmarUsuario:", usr);
    sendResponse(usr);
  });

  // Timeout de seguridad
  setTimeout(() => {
    console.warn("[/confirmarUsuario] timeout alcanzado");
    sendResponse({ email: -1, reason: "timeout" });
  }, 5000);
});

app.post('/loginUsuario', function(req, res){
  sistema.loginUsuario(req.body, function(out){
    if (out && out.email && out.email !== -1){
      req.session.user = { email: out.email };
      res.send({ nick: out.email });
    } else {
      res.status(401).send({ nick: -1 });
    }
  });
});
// const LocalStrategy = require('passport-local').Strategy;

// passport.use(new LocalStrategy(
//   { usernameField: "email", passwordField: "password" },
//   function(email, password, done){
//     sistema.loginUsuario({ email, password }, function(user){
//       // user será {email: -1} si falla
//       return done(null, user && user.email != -1 ? user : false);
//     });
//   }
// ));

// app.post('/loginUsuario',
//   passport.authenticate("local", { failureRedirect: "/fallo", successRedirect: "/ok" })
// );

// app.get("/ok", function(req, res){
//   res.send({ nick: req.user.email });
// });



app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
});

