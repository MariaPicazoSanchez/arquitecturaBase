const fs = require("fs");
const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;
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

const IN_PROD = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    // Cloud Run y HTTPS: secure=true en producción
    secure: IN_PROD,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 1 día
  }
}));

// app.use(cookieSession({ 
//     name: 'Sistema',
//     keys: ['key1', 'key2']
// }));


app.use(passport.initialize());
app.use(passport.session());
// Función `haIniciado` mejorada: acepta request.user (Passport),
// request.session.user (si usas login manual) o req.isAuthenticated().
const haIniciado = function(request, response, next){
  try{
    const isAuth = (typeof request.isAuthenticated === 'function' && request.isAuthenticated())
                    || !!request.user
                    || !!(request.session && request.session.user);

    if (isAuth){
      return next();
    }
  }catch(e){
    console.warn('[haIniciado] error comprobando auth:', e && e.message);
  }

  // Log para diagnóstico (mismo formato que el anterior ensureAuthenticated)
  console.warn('[haIniciado] acceso no autorizado:', { path: request.path, method: request.method, ip: request.ip });

  // Si no hay usuario, redirigimos al cliente (/) como indica el ejemplo
  return response.redirect('/');
};

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
  conosle.log("[/good] usuario autenticado:", req.user && (req.user.displayName || req.user.id || req.user.email));
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

app.get("/agregarUsuario/:nick", haIniciado, function(request, response) {
  let nick = request.params.nick;
  let res = sistema.agregarUsuario(nick);
  response.send(res);
});

app.get("/obtenerUsuarios", haIniciado, function(request, response) {
  let res = sistema.obtenerUsuarios();
  response.send(res);
});

app.get("/usuarioActivo/:nick", haIniciado, function(request, response) {
  let nick = request.params.nick;
  let res = { activo: sistema.usuarioActivo(nick) };
  response.send(res);
});

app.get("/numeroUsuarios", haIniciado, function(request, response) {
  let res = { num: sistema.numeroUsuarios() };
  response.send(res);
});

app.get("/eliminarUsuario/:nick", haIniciado, function(request, response) {
  let nick = request.params.nick;
  sistema.eliminarUsuario(nick);
  response.send({ eliminado: nick });
});

// Ruta para cerrar sesión (borra sesión en servidor y cookie en cliente)
app.get('/salir', function(req, res){
  console.log('[/salir] petición de cierre de sesión, user?', !!req.user);
  try{
    // Passport: intenta logout si está disponible
    if (typeof req.logout === 'function'){
      // En algunas versiones puede requerir callback
      try { req.logout(); } catch(e) { console.warn('[/salir] req.logout fallo:', e && e.message); }
    }
  }catch(e){ console.warn('[/salir] error al llamar logout:', e && e.message); }

  // Destruir la sesión
  if (req.session){
    req.session.destroy(function(err){
      if (err) console.warn('[/salir] error destruyendo sesión:', err && err.message);
      // Borrar cookie de sesión y cookie 'nick'
      res.clearCookie('nick');
      // Responder según tipo de petición
      const acceptsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1);
      if (acceptsJson) return res.json({ ok: true });
      return res.redirect('/');
    });
  } else {
    res.clearCookie('nick');
    const acceptsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1);
    if (acceptsJson) return res.json({ ok: true });
    return res.redirect('/');
  }
});


// One Tap: callback
// One Tap: callback (mejor manejo con callback para depuración y login explícito)
app.post('/oneTap/callback', (req, res, next) => {
  console.log('[oneTap] callback recibido, body:', req.body);
  passport.authenticate('google-one-tap', (err, user, info) => {
    if (err) {
      console.error('[oneTap] error en authenticate:', err);
      return res.redirect('/fallo');
    }
    if (!user) {
      console.warn('[oneTap] no user returned by strategy, info:', info);
      return res.redirect('/fallo');
    }
    // req.login establece la sesión
    req.login(user, (loginErr) => {
      if (loginErr) {
        console.error('[oneTap] req.login error:', loginErr);
        return res.redirect('/fallo');
      }
      // Guardar cookie 'nick' y redirigir
      try {
        const email = user?.emails?.[0]?.value || (user && user.email);
        if (email) res.cookie('nick', email);
      } catch (e) {
        console.warn('[oneTap] no se pudo setear cookie nick:', e.message);
      }
      console.log('[oneTap] usuario autenticado, redirigiendo a /good, user:', user && (user.displayName || user.id || user.email));
      return res.redirect('/good');
    });
  })(req, res, next);
});




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

// Servir configuración cliente (variables de entorno) como JS
app.get('/config.js', (req, res) => {
  // Soporta varios nombres de variable en .env para compatibilidad
  const CLIENT_ID = process.env.CLIENT_ID || process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '';
  const LOGIN_URI = process.env.LOGIN_URI || process.env.ONE_TAP_CALLBACK_URL || process.env.ONE_TAP_LOGIN_URI || process.env.GOOGLE_CALLBACK_URL || '';
  const cfg = { CLIENT_ID, LOGIN_URI };
  console.log('[config.js] sirviendo configuración al cliente:', cfg);
  res.type('application/javascript');
  res.send(`window.APP_CONFIG = ${JSON.stringify(cfg)};`);
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

