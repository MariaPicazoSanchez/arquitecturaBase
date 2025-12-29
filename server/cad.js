require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");
const gv = require("./gestorVariables.js");

function CAD() {
  this.client = null;
  this.db = null;
  this.usuarios = undefined;
  this.logs = undefined;

  // ---------- CONEXIÓN ÚNICA, CON TIMEOUTS ----------
  this.conectar = async (callback) => {
    const uri = await gv.obtenerMongoUri();
    console.log("[cad.conectar] MONGO_URI presente:", !!uri);

    if (!uri) {
      console.warn("[cad.conectar] MONGO_URI no definida. MODO MEMORIA (NO persiste).");
      this.usuarios = undefined;
      this.logs = undefined;
      if (typeof callback === "function") callback(undefined, new Error("MONGO_URI no definida"));
      return;
    }
    if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
      console.warn("[cad.conectar] MONGO_URI involida. MODO MEMORIA (NO persiste).");
      this.usuarios = undefined;
      this.logs = undefined;
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

      await this.usuarios.createIndex({ email: 1 }, { unique: true });
      try {
        await this.usuarios.createIndex({ nick: 1 }, { unique: true, sparse: true });
      } catch (e) {
        console.warn("[cad.conectar] No se pudo crear índice único en nick (continuo):", e && e.message);
      }

      console.log("[cad.conectar] Conectado a Mongo. Colección: sistema.usuarios");
      if (typeof callback === "function") callback(this.db);
    } catch (err) {
      console.error("[cad.conectar] Error conectando a Mongo:", {
        message: err.message,
        code: err.code,
        name: err.name,
        stack: err.stack
      });
      this.usuarios = undefined;
      this.logs = undefined;
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
    console.log("[cad.actualizarUsuarioPorEmail] updating email:", e, "patch:", safePatch);
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
      console.log("[cad.actualizarUsuarioPorEmail] result:", result);
      console.log("[cad.actualizarUsuarioPorEmail] update result:", result ? "success" : "no result");
      callback(result || undefined);
    }).catch((err) => {
      console.error("[cad.actualizarUsuarioPorEmail] error:", err && err.message ? err.message : err);
      callback(undefined);
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
        console.error("[cad.eliminarUsuarioPorEmail] error:", err && err.message ? err.message : err);
        callback(false);
      });
  };

  this.insertarLog = async function (tipoOperacion, usuario) {
    if (!this.logs) {
      console.error("[cad.insertarLog] Coleccion logs no inicializada");
      return;
    }

    const logDoc = {
      "tipo-operacion": tipoOperacion,
      usuario: usuario,
      "fecha-hora": new Date().toISOString(),
    };

    try {
      const resultado = await this.logs.insertOne(logDoc, { maxTimeMS: 5000 });
      console.log("[cad.insertarLog] Log insertado:", {
        id: resultado && resultado.insertedId,
        tipoOperacion,
        usuario,
      });
      return resultado;
    } catch (err) {
      console.error("[cad.insertarLog] Error insertando log:", err.message);
      return;
    }
  };

  

}

module.exports.CAD = CAD;


function buscarOCrear(coleccion, criterio, callback) {
  if (!coleccion) {
    callback({ email: criterio.email });
    return;
  }
  
  // Generar nick automático si no existe
  if (!criterio.nick && criterio.email) {
    if (criterio.displayName) {
      // Usar displayName: quitar espacios, convertir a minúsculas, añadir números aleatorios
      const baseName = criterio.displayName.toLowerCase().replace(/\s+/g, '');
      criterio.nick = baseName + Math.floor(Math.random() * 1000);
    } else {
      // Usar la parte antes del @ del email
      const emailPart = criterio.email.split('@')[0];
      criterio.nick = emailPart + Math.floor(Math.random() * 1000);
    }
  }
  
  coleccion.findOneAndUpdate(
    { email: criterio.email },
    { $set: criterio, $setOnInsert: { createdAt: new Date().toISOString() } },
    {
      upsert: true,
      returnDocument: "after",
      projection: { email: 1, nick: 1 },
      maxTimeMS: 4000,
    }
  ).then((result) => {
    console.log("[cad.buscarOCrear] result structure:", { hasValue: !!result.value, isDoc: !!result.ok });
    const doc = result.value || result;
    const res = doc && doc.email ? { email: doc.email, nick: doc.nick } : undefined;
    console.log("[cad.buscarOCrear] actualizado:", res);
    callback(res);
  }).catch((err) => {
    console.error("[cad.buscarOCrear] error:", err.message);
    callback(undefined);
  });
}

function buscar(col, criterio, cb) {
  console.log("[cad.buscar] criterio:", criterio, "col?", !!col);
  if (!col) {
    cb(undefined);
    return;
  }
  col.findOne(criterio, { maxTimeMS: 4000, projection: { _id: 1, email: 1, password: 1 } })
    .then((doc) => {
      console.log("[cad.buscar] resultado:", doc ? { _id: doc._id, email: doc.email } : undefined);
      cb(doc);
    })
    .catch((err) => {
      console.error("[cad.buscar] error:", err.message);
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
      console.error("[cad.buscarRaw] error:", err && err.message ? err.message : err);
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
      console.error("[cad.buscarConProyeccion] error:", err && err.message ? err.message : err);
      cb(undefined);
    });
}

function insertar(col, elem, cb) {
  console.log("[cad.insertar] col?", !!col, "elem.email:", elem && elem.email);
  if (!col) {
    console.warn("[cad.insertar] MODO MEMORIA: NO persiste en Mongo");
    cb({ email: elem && elem.email ? elem.email : -1 });
    return;
  }
  col
    .insertOne(elem, { maxTimeMS: 5000 })
    .then(() => {
      console.log("[cad.insertar] Nuevo elemento creado en Mongo");
      cb(elem);
    })
    .catch((err) => {
      if (err && err.code === 11000) {
        console.warn("[cad.insertar] duplicado email");
        cb({ email: -1, reason: "duplicado" });
      } else {
        console.error("[cad.insertar] error:", err.message);
        cb({ email: -1 });
      }
    });
}

function actualizar(coleccion, obj, callback) {
  console.log("[cad.actualizar] entrada:", { email: obj.email, _id: obj._id });
  if (!coleccion || !obj || !obj._id) {
    console.error("[cad.actualizar] faltan datos");
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
    console.log("[cad.actualizar] resultado completo:", result);
    const doc = result?.value || result;
    if (doc?.email) {
      console.log("[cad.actualizar] Elemento actualizado:", { email: doc.email });
      callback({ email: doc.email });
    } else {
      console.warn("[cad.actualizar] Actualización sin resultado esperado");
      callback({ email: -1 });
    }
  }).catch(err => {
    console.error("[cad.actualizar] error:", err.message);
    callback({ email: -1 });
  });
}
