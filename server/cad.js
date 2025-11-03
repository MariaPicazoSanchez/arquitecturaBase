require("dotenv").config();
const { MongoClient } = require("mongodb");

function CAD() {
  this.client = null;
  this.db = null;
  this.usuarios = undefined;

  // ---------- CONEXIÓN ÚNICA, CON TIMEOUTS ----------
  this.conectar = async (callback) => {
    const uri = process.env.MONGO_URI;
    console.log("[cad.conectar] MONGO_URI presente:", !!uri);

    if (!uri) {
      console.warn("[cad.conectar] MONGO_URI no definida. MODO MEMORIA (NO persiste).");
      this.usuarios = undefined;
      if (typeof callback === "function") callback(undefined, new Error("MONGO_URI no definida"));
      return;
    }
    if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
      console.warn("[cad.conectar] MONGO_URI inválida. MODO MEMORIA (NO persiste).");
      this.usuarios = undefined;
      if (typeof callback === "function") callback(undefined, new Error("MONGO_URI inválida"));
      return;
    }

    try {
      this.client = new MongoClient(uri, {
        // evita cuelgues largos
        serverSelectionTimeoutMS: 5000, // elegir servidor rápido
        socketTimeoutMS: 10000,         // cortar operaciones largas
        maxPoolSize: 10,
      });

      await this.client.connect();
      this.db = this.client.db("sistema");
      this.usuarios = this.db.collection("usuarios");

      // Índice único por email (idempotente)
      await this.usuarios.createIndex({ email: 1 }, { unique: true });

      console.log("[cad.conectar] Conectado a Mongo. Colección: sistema.usuarios");
      if (typeof callback === "function") callback(this.db);
    } catch (err) {
      console.error("[cad.conectar] Error conectando a Mongo. MODO MEMORIA:", err.message);
      this.usuarios = undefined;
      if (typeof callback === "function") callback(undefined, err);
    }
  };

  // ---------- API PÚBLICA ----------
  this.buscarOCrearUsuario = (usr, cb) => {
    buscarOCrear(this.usuarios, usr, cb);
  };

  this.buscarUsuario = (criterio, cb) => {
    buscar(this.usuarios, criterio, cb);
  };

  this.insertarUsuario = (usuario, cb) => {
    insertar(this.usuarios, usuario, cb);
  };
}

module.exports.CAD = CAD;

// ---------- Helpers internos (con límites de tiempo) ----------

function buscarOCrear(coleccion, criterio, callback) {
  if (!coleccion) {
    // modo memoria: devolvemos “como si”
    callback({ email: criterio.email });
    return;
  }
  // límite de tiempo del lado servidor
  coleccion.findOneAndUpdate(
    criterio,
    { $set: criterio },
    {
      upsert: true,
      returnDocument: "after",
      projection: { email: 1 },
      maxTimeMS: 4000,
    },
    function (err, doc) {
      if (err) {
        console.error("[cad.buscarOCrear] error:", err.message);
        callback(undefined);
        return;
      }
      const email = doc && doc.value ? doc.value.email : undefined;
      console.log("[cad.buscarOCrear] actualizado:", email);
      callback(email ? { email } : undefined);
    }
  );
}

function buscar(col, criterio, cb) {
  console.log("[cad.buscar] criterio:", criterio, "col?", !!col);
  if (!col) {
    cb(undefined);
    return;
  }
  // findOne es suficiente, y le añadimos maxTimeMS
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
