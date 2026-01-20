require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");
const gv = require("./gestorVariables.js");
const logger = require("./logger");

function CAD() {
  this.client = null;
  this.db = null;
  this.usuarios = undefined;
  this.logs = undefined;
  this.passwordResetTokens = undefined;
  this._memLogs = [];
  this._memLogsWarned = false;

  // ---------- CONEXIÓN ÚNICA, CON TIMEOUTS ----------
  this.conectar = async (callback) => {
    const uri = await gv.obtenerMongoUri();
    logger.debug("[cad.conectar] MONGO_URI presente:", !!uri);

    if (!uri) {
      logger.warn("[cad.conectar] MONGO_URI no definida. MODO MEMORIA (NO persiste).");
      this.usuarios = undefined;
      this.logs = undefined;
      this.passwordResetTokens = undefined;
      if (typeof callback === "function") callback(undefined, new Error("MONGO_URI no definida"));
      return;
    }
    if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
      logger.warn("[cad.conectar] MONGO_URI involida. MODO MEMORIA (NO persiste).");
      this.usuarios = undefined;
      this.logs = undefined;
      this.passwordResetTokens = undefined;
      if (typeof callback === "function") callback(undefined, new Error("MONGO_URI involida"));
      return;
    }

    try {
      this.client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 15000, // aumentado para cloud
        socketTimeoutMS: 30000,          // aumentado para cloud
        maxPoolSize: 10,
        useNewUrlParser: true,
        useUnifiedTopology: true,
        retryWrites: true,
        w: "majority"
      });

      await this.client.connect();
      this.db = this.client.db("sistema");
      this.usuarios = this.db.collection("usuarios");
      this.logs = this.db.collection("logs");
      this.passwordResetTokens = this.db.collection("passwordResetTokens");

      await this.usuarios.createIndex({ email: 1 }, { unique: true });
      try {
        await this.usuarios.createIndex({ nick: 1 }, { unique: true, sparse: true });
      } catch (e) {
        logger.warn("[cad.conectar] No se pudo crear índice único en nick (continuo):", e && e.message);
      }

      try {
        await this.passwordResetTokens.createIndex({ tokenHash: 1 }, { unique: true });
        await this.passwordResetTokens.createIndex({ userId: 1, createdAt: -1 });
        await this.passwordResetTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      } catch (e) {
        logger.warn("[cad.conectar] No se pudieron crear índices de passwordResetTokens:", e && e.message);
      }

      logger.debug("[cad.conectar] Conectado a Mongo. Colección: sistema.usuarios");
      if (typeof callback === "function") callback(this.db);
    } catch (err) {
      logger.error("[cad.conectar] Error conectando a Mongo:", {
        message: err.message,
        code: err.code,
        name: err.name,
        stack: err.stack
      });
      this.usuarios = undefined;
      this.logs = undefined;
      this.passwordResetTokens = undefined;
      if (typeof callback === "function") callback(undefined, err);
    }
  };

  this.buscarOCrearUsuario = (usr, cb) => {
    buscarOCrear(this.usuarios, usr, cb);
  };

  this.buscarUsuario = (criterio, cb) => {
    buscar(this.usuarios, criterio, cb);
  };

  this.buscarUsuarioRaw = (criterio, cb) => {
    buscarRaw(this.usuarios, criterio, cb);
  };

  this.buscarUsuarioPublico = (criterio, cb) => {
    buscarConProyeccion(this.usuarios, criterio, {
      _id: 1,
      email: 1,
      nick: 1,
      displayName: 1,
      createdAt: 1,
      confirmada: 1,
    }, cb);
  };

  this.insertarUsuario = (usuario, cb) => {
    insertar(this.usuarios, usuario, cb);
  };

  this.actualizarUsuario = function (obj, callback) {
    actualizar(this.usuarios, obj, callback);
  };

  this.actualizarUsuarioPorEmail = function(email, patch, callback){
    if (!this.usuarios) {
      callback(undefined);
      return;
    }
    const e = (email || "").trim().toLowerCase();
    if (!e) {
      callback(undefined);
      return;
    }
    const safePatch = patch && typeof patch === "object" ? patch : {};
    logger.debug("[cad.actualizarUsuarioPorEmail] updating email:", e, "patch:", safePatch);
    this.usuarios.findOneAndUpdate(
      { email: e },
      { $set: safePatch },
      {
        upsert: false,
        returnDocument: "after",
        projection: { _id: 1, email: 1, nick: 1, displayName: 1, createdAt: 1, confirmada: 1, password: 1 },
        maxTimeMS: 10000,
      }
    ).then((result) => {
      logger.debug("[cad.actualizarUsuarioPorEmail] result:", result);
      logger.debug("[cad.actualizarUsuarioPorEmail] update result:", result ? "success" : "no result");
      const doc = result && Object.prototype.hasOwnProperty.call(result, "value")
        ? result.value
        : result;
      callback(doc || undefined);
    }).catch((err) => {
      logger.error("[cad.actualizarUsuarioPorEmail] error:", err && err.message ? err.message : err);
      callback(undefined);
    });
  };

  this.buscarUsuarioPorId = function(userId, cb) {
    if (!this.usuarios) return cb(undefined);
    let _id;
    try {
      _id = (typeof userId === "string") ? new ObjectId(userId) : userId;
    } catch (e) {
      return cb(undefined);
    }
    this.usuarios.findOne({ _id }, { maxTimeMS: 5000 })
      .then((doc) => cb(doc || undefined))
      .catch((err) => {
        logger.error("[cad.buscarUsuarioPorId] error:", err && err.message ? err.message : err);
        cb(undefined);
      });
  };

  this.actualizarUsuarioPorId = function(userId, patch, callback) {
    if (!this.usuarios) return callback(undefined);
    let _id;
    try {
      _id = (typeof userId === "string") ? new ObjectId(userId) : userId;
    } catch (e) {
      return callback(undefined);
    }
    const safePatch = patch && typeof patch === "object" ? patch : {};
    this.usuarios.findOneAndUpdate(
      { _id },
      { $set: safePatch },
      {
        upsert: false,
        returnDocument: "after",
        projection: { _id: 1, email: 1, nick: 1, displayName: 1, createdAt: 1, confirmada: 1, password: 1 },
        maxTimeMS: 10000,
      }
    ).then((result) => {
      const doc = result && Object.prototype.hasOwnProperty.call(result, "value")
        ? result.value
        : result;
      callback(doc || undefined);
    }).catch((err) => {
      logger.error("[cad.actualizarUsuarioPorId] error:", err && err.message ? err.message : err);
      callback(undefined);
    });
  };

  this.insertarPasswordResetToken = function(doc, cb) {
    if (!this.passwordResetTokens) return cb(undefined);
    const safeDoc = doc && typeof doc === "object" ? doc : {};
    this.passwordResetTokens.insertOne(safeDoc, { maxTimeMS: 5000 })
      .then((res) => {
        if (!res || !res.insertedId) return cb(undefined);
        cb(Object.assign({ _id: res.insertedId }, safeDoc));
      })
      .catch((err) => {
        logger.error("[cad.insertarPasswordResetToken] error:", err && err.message ? err.message : err);
        cb(undefined);
      });
  };

  this.buscarPasswordResetTokenPorHash = function(tokenHash, cb) {
    if (!this.passwordResetTokens) return cb(undefined);
    const h = String(tokenHash || "").trim();
    if (!h) return cb(undefined);
    this.passwordResetTokens.findOne({ tokenHash: h }, { maxTimeMS: 5000 })
      .then((doc) => cb(doc || undefined))
      .catch((err) => {
        logger.error("[cad.buscarPasswordResetTokenPorHash] error:", err && err.message ? err.message : err);
        cb(undefined);
      });
  };

  this.buscarPasswordResetTokenActivoMasRecienteDeUsuario = function(userId, cb) {
    if (!this.passwordResetTokens) return cb(undefined);
    const now = new Date();
    this.passwordResetTokens.find(
      { userId, usedAt: null, expiresAt: { $gt: now } },
      { maxTimeMS: 5000 }
    )
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray()
      .then((docs) => cb(Array.isArray(docs) && docs[0] ? docs[0] : undefined))
      .catch((err) => {
        logger.error("[cad.buscarPasswordResetTokenActivoMasRecienteDeUsuario] error:", err && err.message ? err.message : err);
        cb(undefined);
      });
  };

  this.marcarPasswordResetTokenUsado = function(tokenId, cb) {
    if (!this.passwordResetTokens) return cb(false);
    let _id;
    try {
      _id = (typeof tokenId === "string") ? new ObjectId(tokenId) : tokenId;
    } catch (e) {
      return cb(false);
    }
    this.passwordResetTokens.updateOne({ _id }, { $set: { usedAt: new Date() } }, { maxTimeMS: 5000 })
      .then((res) => cb(!!(res && res.modifiedCount === 1)))
      .catch((err) => {
        logger.error("[cad.marcarPasswordResetTokenUsado] error:", err && err.message ? err.message : err);
        cb(false);
      });
  };

  this.eliminarUsuarioPorEmail = function(email, callback){
    if (!this.usuarios) {
      callback(false);
      return;
    }
    const e = (email || "").trim().toLowerCase();
    if (!e) {
      callback(false);
      return;
    }
    this.usuarios.deleteOne({ email: e }, { maxTimeMS: 5000 })
      .then((res) => callback(!!(res && res.deletedCount === 1)))
      .catch((err) => {
        logger.error("[cad.eliminarUsuarioPorEmail] error:", err && err.message ? err.message : err);
        callback(false);
      });
  };

  this.eliminarPasswordResetTokensDeUsuario = function(userId, callback) {
    if (!this.passwordResetTokens) {
      if (typeof callback === "function") callback(false);
      return;
    }
    let uid = userId;
    try {
      if (typeof userId === "string") uid = new ObjectId(userId);
    } catch (e) {
      if (typeof callback === "function") callback(false);
      return;
    }
    this.passwordResetTokens.deleteMany({ userId: uid }, { maxTimeMS: 5000 })
      .then((res) => {
        if (typeof callback === "function") callback(!!res);
      })
      .catch((err) => {
        logger.error("[cad.eliminarPasswordResetTokensDeUsuario] error:", err && err.message ? err.message : err);
        if (typeof callback === "function") callback(false);
      });
  };

  this.insertarLog = async function (tipoOperacion, usuario) {
    const logDoc = {
      "tipo-operacion": tipoOperacion,
      usuario: usuario,
      "fecha-hora": new Date().toISOString(),
    };

    // Fallback a memoria cuando no hay colección de logs inicializada (MODO MEMORIA)
    if (!this.logs) {
      try {
        this._memLogs.push(logDoc);
        if (!this._memLogsWarned) {
          logger.warn("[cad.insertarLog] MODO MEMORIA: log guardado en memoria (no persistente)");
          this._memLogsWarned = true;
        }
        return { insertedId: `mem-${this._memLogs.length}` };
      } catch (e) {
        // En el peor caso, silenciar para no contaminar la salida
        return { insertedId: undefined };
      }
    }

    try {
      const resultado = await this.logs.insertOne(logDoc, { maxTimeMS: 5000 });
      logger.debug("[cad.insertarLog] Log insertado:", {
        id: resultado && resultado.insertedId,
        tipoOperacion,
        usuario,
      });
      return resultado;
    } catch (err) {
      logger.error("[cad.insertarLog] Error insertando log:", err.message);
      return;
    }
  };

  

}

module.exports.CAD = CAD;


function buscarOCrear(coleccion, criterio, callback) {
  if (!coleccion) {
    callback({ email: criterio && criterio.email ? criterio.email : undefined });
    return;
  }

  const email = (criterio && criterio.email ? String(criterio.email) : "").trim().toLowerCase();
  if (!email) {
    callback(undefined);
    return;
  }

  const displayName = (criterio && criterio.displayName ? String(criterio.displayName) : "").trim();
  const nickInput = (criterio && criterio.nick ? String(criterio.nick) : "").trim();

  const sanitizeNickBase = function(value) {
    const raw = (value || "").toString().trim().toLowerCase();
    const cleaned = raw
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 18);
    return cleaned;
  };

  const buildNickCandidate = function(base) {
    const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    let b = sanitizeNickBase(base);
    if (!b) b = "user";
    if (b.length < 3) b = (b + "user").slice(0, 3);
    b = b.slice(0, 24 - suffix.length);
    return b + suffix;
  };

  const pickBase = function() {
    if (nickInput) return nickInput;
    if (displayName) return displayName;
    const part = email.includes("@") ? email.split("@")[0] : email;
    return part || "user";
  };

  const findUniqueNick = async function() {
    const base = pickBase();
    for (let i = 0; i < 8; i++) {
      const cand = buildNickCandidate(base);
      const exists = await coleccion.findOne({ nick: cand }, { maxTimeMS: 4000, projection: { _id: 1 } });
      if (!exists) return cand;
    }
    return buildNickCandidate(base);
  };

  (async () => {
    const existing = await coleccion.findOne({ email }, { maxTimeMS: 4000 });

    // Usuario ya existe: NO tocar nick (salvo que esté vacío).
    if (existing && existing.email) {
      const hasNick = !!(existing.nick && String(existing.nick).trim());

      if (!hasNick) {
        for (let i = 0; i < 8; i++) {
          const candidate = await findUniqueNick();
          try {
            const res = await coleccion.updateOne(
              { email, $or: [{ nick: { $exists: false } }, { nick: null }, { nick: "" }] },
              { $set: { nick: candidate } },
              { maxTimeMS: 5000 }
            );
            if (res && res.modifiedCount === 1) {
              callback({ email, nick: candidate });
              return;
            }
            const reread = await coleccion.findOne({ email }, { maxTimeMS: 4000, projection: { email: 1, nick: 1 } });
            callback(reread && reread.email ? { email: reread.email, nick: reread.nick } : { email, nick: candidate });
            return;
          } catch (err) {
            if (err && err.code === 11000) continue; // nick duplicado -> reintentar
            throw err;
          }
        }
      }

      // best-effort: actualizar displayName solo si est\u00e1 vac\u00edo (sin tocar nick)
      if (displayName) {
        try {
          await coleccion.updateOne(
            { email, $or: [{ displayName: { $exists: false } }, { displayName: null }, { displayName: "" }] },
            { $set: { displayName } },
            { maxTimeMS: 5000 }
          );
        } catch (e) {}
      }

      callback({ email: existing.email, nick: existing.nick });
      return;
    }

    // Nuevo usuario: crear con nick generado una sola vez.
    for (let i = 0; i < 8; i++) {
      const candidate = await findUniqueNick();
      const $set = {};
      if (displayName) $set.displayName = displayName;

      try {
        const result = await coleccion.findOneAndUpdate(
          { email },
          {
            $set,
            $setOnInsert: { email, nick: candidate, createdAt: new Date().toISOString() },
          },
          {
            upsert: true,
            returnDocument: "after",
            projection: { email: 1, nick: 1 },
            maxTimeMS: 5000,
          }
        );
        const doc = result && Object.prototype.hasOwnProperty.call(result, "value")
          ? result.value
          : result;
        if (doc && doc.email) {
          callback({ email: doc.email, nick: doc.nick });
          return;
        }
      } catch (err) {
        if (err && err.code === 11000) continue;
        throw err;
      }
    }

    callback({ email, nick: undefined });
  })().catch((err) => {
    logger.error("[cad.buscarOCrear] error:", err && err.message ? err.message : err);
    callback(undefined);
  });
}

function buscar(col, criterio, cb) {
  try {
    const keys = criterio && typeof criterio === "object" ? Object.keys(criterio) : [];
    logger.debug("[cad.buscar] criterio(keys):", keys, "col?", !!col);
  } catch (e) {
    logger.debug("[cad.buscar] criterio(keys):", [], "col?", !!col);
  }
  if (!col) {
    cb(undefined);
    return;
  }
  col.findOne(criterio, { maxTimeMS: 4000, projection: { _id: 1, email: 1, password: 1 } })
    .then((doc) => {
      logger.debug("[cad.buscar] resultado:", doc ? { _id: doc._id } : undefined);
      cb(doc);
    })
    .catch((err) => {
      logger.error("[cad.buscar] error:", err.message);
      cb(undefined);
    });
}

function buscarRaw(col, criterio, cb) {
  if (!col) {
    cb(undefined);
    return;
  }
  col.findOne(criterio, { maxTimeMS: 5000 })
    .then((doc) => cb(doc))
    .catch((err) => {
      logger.error("[cad.buscarRaw] error:", err && err.message ? err.message : err);
      cb(undefined);
    });
}

function buscarConProyeccion(col, criterio, projection, cb) {
  if (!col) {
    cb(undefined);
    return;
  }
  col.findOne(criterio, { maxTimeMS: 5000, projection })
    .then((doc) => cb(doc))
    .catch((err) => {
      logger.error("[cad.buscarConProyeccion] error:", err && err.message ? err.message : err);
      cb(undefined);
    });
}

function insertar(col, elem, cb) {
  logger.debug("[cad.insertar] col?", !!col, "elem.email:", elem && elem.email);
  if (!col) {
    logger.warn("[cad.insertar] MODO MEMORIA: NO persiste en Mongo");
    cb({ email: elem && elem.email ? elem.email : -1 });
    return;
  }
  col
    .insertOne(elem, { maxTimeMS: 5000 })
    .then(() => {
      logger.debug("[cad.insertar] Nuevo elemento creado en Mongo");
      cb(elem);
    })
    .catch((err) => {
      if (err && err.code === 11000) {
        logger.warn("[cad.insertar] duplicado email");
        cb({ email: -1, reason: "duplicado" });
      } else {
        logger.error("[cad.insertar] error:", err.message);
        cb({ email: -1 });
      }
    });
}

function actualizar(coleccion, obj, callback) {
  logger.debug("[cad.actualizar] entrada:", { email: obj.email, _id: obj._id });
  if (!coleccion || !obj || !obj._id) {
    logger.error("[cad.actualizar] faltan datos");
    callback({ email: -1 });
    return;
  }
  
  coleccion.findOneAndUpdate(
    { _id: new ObjectId(obj._id) },
    { $set: obj },
    {
      upsert: false,
      returnDocument: "after",
      projection: { email: 1, confirmada: 1 },
      maxTimeMS: 5000,
    }
  ).then(result => {
    logger.debug("[cad.actualizar] resultado completo:", result);
    const doc = result?.value || result;
    if (doc?.email) {
      logger.debug("[cad.actualizar] Elemento actualizado:", { email: doc.email });
      callback({ email: doc.email });
    } else {
      logger.warn("[cad.actualizar] Actualización sin resultado esperado");
      callback({ email: -1 });
    }
  }).catch(err => {
    logger.error("[cad.actualizar] error:", err.message);
    callback({ email: -1 });
  });
}
