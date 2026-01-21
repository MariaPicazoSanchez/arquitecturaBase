const fs = require("fs");
const path = require('path');
const express = require("express");
const app = express();
const http = require('http');
const httpServer = http.Server(app);
const { Server } = require("socket.io");
const logger = require("./server/logger");

const emailService = require("./server/emailService");

require('dotenv').config();
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const IN_PROD = process.env.NODE_ENV === 'production';
const passport=require("passport");
const session = require('express-session');

function looksLikeEmail(value) {
  const t = String(value || "").trim();
  return !!t && t.includes("@");
}

function normalizePublicNick(value, fallback = "Usuario") {
  const t = String(value || "").trim();
  if (!t || looksLikeEmail(t)) return String(fallback || "Usuario");
  return t;
}

function publicUserIdFromEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return "";
  let hash = 5381;
  for (let i = 0; i < e.length; i += 1) {
    hash = ((hash << 5) + hash + e.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function authCookieOptions() {
  return {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure: IN_PROD,
    maxAge: 24 * 60 * 60 * 1000,
  };
}

function setAuthCookies(res, email, nick) {
  const opts = authCookieOptions();
  try {
    if (email) res.cookie('email', String(email).trim().toLowerCase(), opts);
  } catch (e) {}
  try {
    if (nick) res.cookie('nick', normalizePublicNick(nick, 'Usuario'), opts);
  } catch (e) {}
  try {
    if (email) res.cookie('uid', publicUserIdFromEmail(email), opts);
  } catch (e) {}
}

function clearAuthCookies(res) {
  try { res.clearCookie('email', { path: '/' }); } catch (e) {}
  try { res.clearCookie('nick', { path: '/' }); } catch (e) {}
  try { res.clearCookie('uid', { path: '/' }); } catch (e) {}
}


function getAppBaseUrl() {
  const raw = String(process.env.APP_URL || process.env.FRONTEND_URL || "").trim();
  return raw ? raw.replace(/\/+$/, "") : "";
}

process.on('uncaughtException', (err) => {
  logger.error('[FATAL] uncaughtException:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
process.on('unhandledRejection', (reason) => {
  logger.error('[FATAL] unhandledRejection:', reason && reason.stack ? reason.stack : reason);
  process.exitCode = 1;
});

require("./server/passport-setup.js");
const modelo = require("./server/modelo.js");
logger.info('[START] creando Sistema()...');
let sistema;
try {
  sistema = new modelo.Sistema();
  logger.info('[START] Sistema() creado');
} catch (e) {
  logger.error('[FATAL] fallo creando Sistema():', e && e.stack ? e.stack : e);
  process.exit(1);
}
// Socket.io server
const moduloWS = require("./server/servidorWS.js");

function buildSocketAllowedOrigins() {
  const origins = new Set();

  const addOrigin = (value) => {
    const raw = (value || "").toString().trim();
    if (!raw) return;
    try {
      origins.add(new URL(raw).origin);
    } catch {
      // ignore invalid URL
    }
  };

  addOrigin(process.env.APP_URL);
  addOrigin(process.env.SERVER_URL);

  // Local dev defaults
  origins.add("http://localhost:3000");
  origins.add("http://127.0.0.1:3000");
  origins.add("http://localhost:5173");
  origins.add("http://127.0.0.1:5173");

  return origins;
}

const socketAllowedOrigins = buildSocketAllowedOrigins();

// Enlazamos Socket.IO al httpServer
let io = new Server(httpServer, {
  path: "/socket.io",
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (!IN_PROD) return cb(null, true);
      return cb(null, socketAllowedOrigins.has(origin));
    },
    credentials: true,
  },
});
let ws = new moduloWS.ServidorWS();

// --------------------
// Juegos 
// --------------------
const unoDistPath = path.join(__dirname, 'client/games/uno/dist');
app.use('/uno', express.static(unoDistPath));

const connect4DistPath = path.join(__dirname, 'client/games/4raya/dist');
app.use('/4raya', express.static(connect4DistPath));

const damasPath = path.join(__dirname, 'client/games/damas');
app.use('/damas', express.static(damasPath));


// Diagnostic middleware for static assets (helps debug production 503/404)
app.use(function(req, res, next){
  // only log requests for likely static assets
  if (req.path.match(/^\/(css|img|clienteRest\.js|controlWeb\.js|config\.js|favicon\.ico)/)){
    const fpath = path.join(__dirname, 'client', req.path.replace(/^\//, ''));
    fs.access(fpath, fs.constants.R_OK, function(err){
      if (err){
        logger.warn('[static-diagnostic] asset requested but not accessible:', { url: req.url, fsPath: fpath, err: err.message });
        // continue to static middleware so behavior is unchanged; but also attach flag for later
        req._staticMissing = true;
      }
      next();
    });
    return;
  }
  next();
});

// Configurar Express: servir archivos est+íticos desde /client
app.use(express.static(path.join(__dirname, 'client')));

// P+ígina de reset password (link desde email)
app.get('/reset-password', function(req, res){
  return res.sendFile(path.join(__dirname, 'client', 'reset-password.html'));
});

app.get('/forgot-password', function(req, res){
  return res.sendFile(path.join(__dirname, 'client', 'forgot-password.html'));
});

app.get('/help', function(req, res){
  return res.sendFile(path.join(__dirname, 'client', 'help.html'));
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (IN_PROD){
  app.set('trust proxy', 1);
}
app.get('/test-session', (req, res) => {
  if (!req.session.views) req.session.views = 0;
  req.session.views++;
  res.send(`Views: ${req.session.views}`);
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    // Cloud Run y HTTPS: secure=true en producci+¦n
    secure: IN_PROD,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 1 d+¡a
  }
}));


app.use(passport.initialize());
app.use(passport.session());

// CORS (solo para /api) cuando el cliente est+í en otro origen y APP_URL est+í configurada.
app.use('/api', function(req, res, next){
  const origin = req.headers && req.headers.origin;
  const appUrl = process.env.APP_URL || "";
  let allowedOrigin = "";
  try {
    if (origin && appUrl) {
      const u = new URL(appUrl);
      allowedOrigin = u.origin;
    }
  } catch (e) {}

  if (origin && allowedOrigin && origin === allowedOrigin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});
const haIniciado = function(request, response, next){
  try{
    const isAuth = (typeof request.isAuthenticated === 'function' && request.isAuthenticated())
                    || !!request.user
                    || !!(request.session && request.session.user);

    if (isAuth){
      return next();
    }
  }catch(e){
    logger.warn('[haIniciado] error comprobando auth:', e && e.message);
  }

  const acceptsJson = !!(request.xhr
    || (request.headers && request.headers.accept && request.headers.accept.indexOf('application/json') !== -1)
    || (request.path && String(request.path).startsWith('/api/')));

  logger.warn('[haIniciado] acceso no autorizado:', {
    path: request.path,
    method: request.method,
    ip: request.ip,
    acceptsJson,
    hasCookieHeader: !!(request.headers && request.headers.cookie),
    hasAuthorization: !!(request.headers && request.headers.authorization),
    hasSessionId: !!request.sessionID,
    hasSessionUser: !!(request.session && request.session.user),
    hasPassportUser: !!request.user
  });

  if (acceptsJson) {
    return response.status(401).json({ error: "No autenticado" });
  }

  // Si no hay usuario, redirigimos al cliente (/)
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
  logger.debug("[/good] Google OAuth callback, usuario:", req.user ? { id: req.user.id, displayName: req.user.displayName, emails: req.user.emails } : 'NONE');
  if (!req.user) {
    logger.error("[/good] ERROR: req.user es null/undefined");
    return res.redirect('/fallo');
  }

  let email = null;
  if (req.user.emails && Array.isArray(req.user.emails) && req.user.emails.length > 0) {
    email = req.user.emails[0].value;
  }
  
  if (!email) {
    logger.error("[/good] ERROR: no email en profile");
    return res.redirect('/fallo');
  }

  const displayName = req.user.displayName || '';
  logger.debug("[/good] email extra+¡do:", email, "displayName:", displayName);

  process.nextTick(() => {
    sistema.usuarioGoogle({ email, displayName }, function(obj) {
      logger.debug("[/good] usuarioGoogle retorn+¦:", obj);
      if (!obj || !obj.email) {
        logger.error("[/good] ERROR: objeto inv+ílido de usuarioGoogle");
        return res.redirect('/fallo');
      }
      try {
        req.session.user = { email };
      } catch(e) {
        logger.warn("[/good] session.user error:", e && e.message);
      }
      const nickToSet = normalizePublicNick(obj.nick || obj.displayName || displayName, "Usuario");
      logger.debug("[/good] nick final:", nickToSet);
      // Cookies: `email` (identidad interna) + `nick` (nombre visible, nunca email)
      setAuthCookies(res, email, nickToSet);
      res.redirect('/');
    });
  });
});

app.get("/fallo", function(req, res) {
  logger.error("[/fallo] Redirigiendo, usuario no autenticado correctamente");
  res.redirect('/');
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

app.get('/salir', function(req, res){
  logger.debug('[/salir] petici+¦n de cierre de sesi+¦n, user?', !!req.user);
  try{
    // Passport: intenta logout si est+í disponible
    if (typeof req.logout === 'function'){
      // En algunas versiones puede requerir callback
      try { req.logout(); } catch(e) { logger.warn('[/salir] req.logout fallo:', e && e.message); }
    }
  }catch(e){ logger.warn('[/salir] error al llamar logout:', e && e.message); }

  // Destruir la sesi+¦n
  if (req.session){
    req.session.destroy(function(err){
      if (err) logger.warn('[/salir] error destruyendo sesi+¦n:', err && err.message);
      // Borrar cookie de sesi+¦n y cookie 'nick'
      clearAuthCookies(res);
      // Responder seg+¦n tipo de petici+¦n
      const acceptsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1);
      if (acceptsJson) return res.json({ ok: true });
      return res.redirect('/');
    });
  } else {
    clearAuthCookies(res);
    const acceptsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1);
    if (acceptsJson) return res.json({ ok: true });
    return res.redirect('/');
  }
});


// One Tap: callback
app.post('/oneTap/callback', (req, res, next) => {
  logger.debug('[oneTap/callback] credential presente:', !!req.body.credential);
  if (!req.body.credential) {
    logger.error('[oneTap] sin credential');
    return res.redirect('/fallo');
  }
  
  passport.authenticate('google-one-tap', (err, user, info) => {
    if (err) {
      logger.error('[oneTap] error:', err);
      return res.redirect('/fallo');
    }
    if (!user) {
      logger.warn('[oneTap] no user de strategy');
      return res.redirect('/fallo');
    }
    
    req.login(user, (loginErr) => {
      if (loginErr) {
        logger.error('[oneTap] login error:', loginErr);
        return res.redirect('/fallo');
      }
      
      let email = null;
      if (user.emails && Array.isArray(user.emails) && user.emails.length > 0) {
        email = user.emails[0].value;
      } else if (user.email) {
        email = user.email;
      }
      
      const displayName = user.displayName || '';
      
      if (!email) {
        logger.error('[oneTap] sin email');
        return res.redirect('/fallo');
      }
      
      sistema.usuarioGoogle({ email, displayName }, function(obj) {
        if (!obj || !obj.email) {
          logger.error('[oneTap] usuarioGoogle fallo');
          return res.redirect('/fallo');
        }
        try {
          req.session.user = { email };
          const nickToSet = normalizePublicNick(obj.nick || obj.displayName || displayName, "Usuario");
          setAuthCookies(res, email, nickToSet);
        } catch (e) {
          logger.warn('[oneTap] cookie error:', e.message);
        }
        return res.redirect('/');
      });
    });
  })(req, res, next);
});

// Diagnostic endpoint: listar archivos est+íticos desplegados (+¦til en producci+¦n)
app.get('/assets-debug', (req, res) => {
  const dir = path.join(__dirname, 'client');
  const walk = (dirPath) => {
    let results = [];
    try {
      const list = fs.readdirSync(dirPath);
      list.forEach(function(file) {
        const full = path.join(dirPath, file);
        const stat = fs.statSync(full);
        if (stat && stat.isDirectory()) {
          results = results.concat(walk(full));
        } else {
          results.push(path.relative(path.join(__dirname, 'client'), full));
        }
      });
    } catch (e) {
      return ['ERROR: ' + (e.message || e)];
    }
    return results;
  };
  res.json({ files: walk(dir) });
});




// Registro de usuario
app.post("/registrarUsuario", function(req, res){
  logger.debug("[/registrarUsuario] body recibido:", req.body);
  const t0 = Date.now();
  let responded = false;
  const send = (status, payload) => {
    if (responded) return;
    responded = true;
    logger.debug(`[/registrarUsuario] -> ${status} en ${Date.now()-t0}ms; payload:`, payload);
    return res.status(status).json(payload);
  };

  try {
    const { nick, email, password } = req.body;
    sistema.registrarUsuario(nick, email, password, function(out){
      logger.debug("[/registrarUsuario] callback del modelo:", out);
      if (out && out.email && out.email !== -1){
        if (out.emailSent === false) {
          return send(202, {
            ok: true,
            emailSent: false,
            warning: "email_failed",
            message: "Usuario creado pero el correo de confirmacion fallo. Reintenta enviar el correo desde el login."
          });
        }
        return send(201, { ok: true, emailSent: true });
      }

      const reason = (out && out.reason) || "unknown";
      const errorMsg = reason === "email_ya_registrado" ? "El email ya esta registrado" :
                      reason === "nick_ya_registrado" ? "El nick ya esta en uso" :
                      reason === "datos_incompletos" ? "Faltan datos obligatorios" :
                      reason === "db_unavailable" ? "Base de datos no disponible" :
                      "No se ha podido registrar el usuario";
      const status = reason === "email_ya_registrado" || reason === "nick_ya_registrado" ? 409
                    : reason === "datos_incompletos" ? 400
                    : reason === "db_unavailable" ? 503
                    : 500;
      return send(status, { ok: false, reason, error: errorMsg });
    });

    setTimeout(() => {
      if (!responded){
        logger.warn("[/registrarUsuario] SIN RESPUESTA tras 10s (posible cuelgue en modelo/CAD)");
        send(504, { ok: false, reason: "timeout", error: "Tiempo de respuesta agotado" });
      }
    }, 10000);

  } catch (err) {
    logger.error("[/registrarUsuario] EXCEPCION sin capturar:", err);
    send(500, { ok: false, error: "Error interno del servidor" });
  }
});
app.get("/confirmarUsuario/:email/:key", (req, res) => {
  const { email, key } = req.params;
  let responded = false;
  const base = getAppBaseUrl();
  const successRedirect = base ? `${base}/` : '/';
  const failRedirect = base ? `${base}/login?confirm=fail` : '/';

  const sendResponse = (usr) => {
    if (responded) return;
    responded = true;

    if (usr && usr.email && usr.email !== -1) {
      logger.debug("[/confirmarUsuario] confirmacion exitosa para:", usr.email);
      req.session.user = {
        email: usr.email,
        nick: usr.nick || usr.displayName || "Usuario"
      };
      setAuthCookies(res, usr.email, usr.nick || usr.displayName || "Usuario");
      req.session.save((err) => {
        if (err) {
          logger.error("[/confirmarUsuario] Error guardando sesion:", err);
        }
        res.redirect(successRedirect);
      });
    } else {
      logger.debug("[/confirmarUsuario] confirmacion fallida:", usr);
      res.redirect(failRedirect);
    }
  };

  sistema.confirmarUsuario({ email, key }, (usr) => {
    logger.debug("[/confirmarUsuario] resultado confirmarUsuario:", usr);
    sendResponse(usr);
  });

  setTimeout(() => {
    logger.warn("[/confirmarUsuario] timeout alcanzado");
    sendResponse({ email: -1, reason: "timeout" });
  }, 5000);
});
app.get('/config.js', (req, res) => {
  // Soporta varios nombres de variable en .env para compatibilidad
  const CLIENT_ID = process.env.CLIENT_ID || process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '';
  const LOGIN_URI = process.env.LOGIN_URI || process.env.ONE_TAP_CALLBACK_URL || process.env.ONE_TAP_LOGIN_URI || process.env.GOOGLE_CALLBACK_URL || '';
  const SERVER_URL = process.env.SERVER_URL || '';
  const cfg = { CLIENT_ID, LOGIN_URI, SERVER_URL };
  logger.debug('[config.js] sirviendo configuraci+¦n al cliente:', cfg);
  res.type('application/javascript');
  res.send(`window.APP_CONFIG = ${JSON.stringify(cfg)};`);
});

app.post('/loginUsuario', function(req, res){
  sistema.loginUsuario(req.body, function(out){
    if (out && out.email && out.email !== -1){
      req.session.user = { email: out.email };
      setAuthCookies(res, out.email, out.nick || out.displayName || "Usuario");
      res.send({ ok: true, email: out.email, nick: out.nick || out.displayName || "Usuario" });
    } else {
      res.status(401).send({ ok: false });
    }
  });
});

app.get('/api/logs', async function(req, res) {
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 100);
  const email = (req.query.email || '').toLowerCase();
  try {
    const col = sistema && sistema.cad && sistema.cad.logs;
    if (!col) {
      throw new Error("Coleccion logs no disponible");
    }
    const filtro = email ? { usuario: { $regex: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } } : {};
    const docs = await col.find(filtro, { maxTimeMS: 5000 }).sort({ "fecha-hora": -1 }).limit(limit).toArray();
    return res.status(200).json(docs);
  } catch (err) {
    logger.error("[/api/logs] Error obteniendo logs:", err && err.message ? err.message : err);
    return res.status(500).json({ error: "Error al obtener logs" });
  }
});

function getAuthEmail(req) {
  try {
    const sessionEmail = req && req.session && req.session.user && req.session.user.email;
    if (sessionEmail) return String(sessionEmail).trim().toLowerCase();
    const userEmail =
      req && req.user && req.user.emails && Array.isArray(req.user.emails) && req.user.emails[0] && req.user.emails[0].value;
    if (userEmail) return String(userEmail).trim().toLowerCase();
  } catch (e) {}
  return "";
}

function clearAuthSession(req, res, done) {
  try {
    if (req && typeof req.logout === 'function') {
      try { req.logout(); } catch (e) {}
    }
  } catch (e) {}

  const finish = () => {
    try { res.clearCookie('nick'); } catch (e) {}
    try { res.clearCookie('email'); } catch (e) {}
    try { res.clearCookie('uid'); } catch (e) {}
    if (typeof done === 'function') done();
  };

  if (req && req.session) {
    return req.session.destroy(function() { finish(); });
  }
  finish();
}

// --------------------
// API: Mi cuenta
// --------------------

// --------------------
// API: Password reset (forgot + mi cuenta)
// --------------------
app.post('/api/auth/password-reset/request', function(req, res) {
  try {
    const authEmail = getAuthEmail(req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const email = authEmail || String(body.email || "").trim().toLowerCase();
    const isAuthed = !!authEmail;

    if (!email) {
      return res.status(400).json({ error: "Email requerido." });
    }

    // En modo "forgot password" (no autenticado) no revelamos si el email existe.
    const silent = !isAuthed;

    sistema.solicitarPasswordReset(email, { silent }, function(result) {
      // Respuesta gen+®rica 200, independientemente de si el email existe.
      if (!result || result.ok === false) {
        if (!silent) {
          const status = result && result.status ? result.status : 500;
          const message = result && result.message ? result.message : "No se pudo iniciar el reset de contrase+¦a.";
          return res.status(status).json({ error: message });
        }
        return res.status(200).json({ ok: true });
      }
      return res.status(200).json({ ok: true });
    });
  } catch (err) {
    logger.error("[password-reset/request] error:", err && err.stack ? err.stack : err);
    return res.status(200).json({ ok: true });
  }
});

app.post('/api/auth/password-reset/confirm', function(req, res) {
  try {
    sistema.confirmarPasswordReset(req.body, function(result) {
      if (!result || result.ok === false) {
        const status = result && result.status ? result.status : 500;
        const message = result && result.message ? result.message : "No se pudo actualizar la contrase+¦a.";
        return res.status(status).json({ error: message });
      }
      return res.status(200).json({ ok: true });
    });
  } catch (err) {
    logger.error("[password-reset/confirm] error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "No se pudo actualizar la contrase+¦a." });
  }
});

app.get('/api/user/me', haIniciado, function(req, res) {
  const email = getAuthEmail(req);
  if (!email) return res.status(401).json({ error: "No autenticado" });
  sistema.obtenerUsuarioSeguro(email, function(user) {
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.status(200).json(user);
  });
});

app.put('/api/user/me', haIniciado, function(req, res) {
  const email = getAuthEmail(req);
  if (!email) return res.status(401).json({ error: "No autenticado" });
  sistema.actualizarUsuarioSeguro(email, req.body, function(result) {
    logger.debug("[/api/user/me] result:", result);
    if (!result || result.ok === false) {
      const status = result && result.status ? result.status : 500;
      const message = result && result.message ? result.message : "Error actualizando perfil";
      logger.debug("[/api/user/me] sending error status:", status, "message:", message);
      return res.status(status).json({ error: message });
    }
    logger.debug("[/api/user/me] sending success, user:", result.user);
    try {
      return res.status(200).json(result.user);
    } catch (err) {
      logger.error("[/api/user/me] error sending json:", err);
      return res.status(500).json({ error: "Error serializando respuesta" });
    }
  });
});

app.put('/api/user/me/password', haIniciado, function(req, res) {
  const email = getAuthEmail(req);
  if (!email) return res.status(401).json({ error: "No autenticado" });
  sistema.cambiarPasswordUsuario(email, req.body, function(result) {
    if (!result || result.ok === false) {
      const status = result && result.status ? result.status : 500;
      const message = result && result.message ? result.message : "Error cambiando contrase+¦a";
      return res.status(status).json({ error: message });
    }
    return res.status(200).json({ ok: true });
  });
});

app.post('/api/user/password-change/request', haIniciado, function(req, res) {
  const email = getAuthEmail(req);
  if (!email) return res.status(401).json({ error: "No autenticado" });
  sistema.solicitarCambioPasswordPorEmail(email, function(result) {
    if (!result || result.ok === false) {
      const status = result && result.status ? result.status : 500;
      const message = result && result.message ? result.message : "Error solicitando cambio de contrase+¦a";
      return res.status(status).json({ error: message });
    }
    return res.status(200).json({ ok: true });
  });
});

app.post('/api/user/password-change/confirm', haIniciado, function(req, res) {
  const email = getAuthEmail(req);
  if (!email) return res.status(401).json({ error: "No autenticado" });
  sistema.confirmarCambioPasswordPorEmail(email, req.body, function(result) {
    if (!result || result.ok === false) {
      const status = result && result.status ? result.status : 500;
      const message = result && result.message ? result.message : "Error confirmando cambio de contrase+¦a";
      return res.status(status).json({ error: message });
    }
    return res.status(200).json({ ok: true });
  });
});

app.delete('/api/user/me', haIniciado, function(req, res) {
  const email = getAuthEmail(req);
  if (!email) return res.status(401).json({ error: "No autenticado" });

  sistema.eliminarCuentaUsuario(email, req.body, function(result) {
    if (!result || result.ok === false) {
      const status = result && result.status ? result.status : 500;
      const message = result && result.message ? result.message : "Error eliminando cuenta";
      return res.status(status).json({ error: message });
    }
    clearAuthSession(req, res, function() {
      return res.status(200).json({ ok: true });
    });
  });
});
// ------------------------------------
// Iniciar el servidor
// ------------------------------------
function logClientFilesNonBlocking() {
  if (process.env.STARTUP_DEBUG_FILES !== '1') return;

  setImmediate(() => {
    try {
      const clientDir = path.join(__dirname, 'client');
      const ignored = new Set(['node_modules', '.git', 'dist', 'build']);
      const results = [];

      const walkSync = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (ignored.has(entry.name)) continue;
            walkSync(path.join(dir, entry.name));
            if (results.length >= 50) return;
          } else {
            results.push(path.relative(clientDir, path.join(dir, entry.name)));
            if (results.length >= 50) return;
          }
        }
      };

      walkSync(clientDir);
      logger.debug('[startup] archivos en client/ (muestra hasta 50):', results);
    } catch (e) {
      logger.warn('[startup] no se pudo listar client/:', e && e.message);
    }
  });
}

function startServer(port, attempt = 0) {
  const maxAttempts = 10;
  const desiredPort = Number.parseInt(port, 10) || 3000;

  logger.info(`[START] intentando listen en puerto ${desiredPort}...`);

  const onError = (err) => {
    httpServer.off('listening', onListening);

    if (err && err.code === 'EADDRINUSE' && attempt < maxAttempts) {
      const next = desiredPort + 1;
      logger.warn(`[START] Puerto ${desiredPort} en uso, intentando ${next}...`);
      return startServer(next, attempt + 1);
    }

    logger.error('[FATAL] Error arrancando servidor:', err && err.stack ? err.stack : err);
    process.exit(1);
  };

  const onListening = () => {
    httpServer.off('error', onError);
    const addr = httpServer.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : desiredPort;

    logger.info(`[START] Listening on http://localhost:${actualPort}`);
    logger.info("Ctrl+C para salir");

    try {
      ws.lanzarServidor(io, sistema);
    } catch (e) {
      logger.error('[FATAL] ws.lanzarServidor fallo:', e && e.stack ? e.stack : e);
      process.exit(1);
    }

    logClientFilesNonBlocking();
  };

  httpServer.once('error', onError);
  httpServer.once('listening', onListening);
  httpServer.listen(desiredPort);
}

logger.info('[START] llamando startServer(PORT)...');
(async () => {
  try {
    const tDb = Date.now();
    await sistema.cad.conectar();
    logger.info(`[START] Mongo conectado en ${Date.now() - tDb}ms`);
  } catch (err) {
    logger.error('[START] Mongo no disponible:', err && err.message ? err.message : err);
  }
  try {
    const t0 = Date.now();
    await emailService.initEmailTransporter();
    logger.warn(`[START] email transporter listo en ${Date.now() - t0}ms`);
  } catch (err) {
    logger.error('[START] email transporter no inicializado, se continua sin SMTP:', err && err.message ? err.message : err);
  }
  startServer(PORT);
})();
