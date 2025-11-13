require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");

function CAD() {
  this.client = null;
  this.db = null;
  this.usuarios = undefined;

  // ---------- CONEXIÓN ÚNICA, CON TIMEOUTS ----------
  this.conectar = async (callback) => {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      this.usuarios = undefined;
      if (typeof callback === "function") callback(undefined, new Error("MONGO_URI no definida"));
      return;
    }
    if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
      this.usuarios = undefined;
      if (typeof callback === "function") callback(undefined, new Error("MONGO_URI inválida"));
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

      // Índice único por email (idempotente)
      await this.usuarios.createIndex({ email: 1 }, { unique: true });

      if (typeof callback === "function") callback(this.db);
    } catch (err) {
      console.error("[cad.conectar] Error conectando a Mongo:", {
        message: err.message,
        code: err.code,
        name: err.name,
        stack: err.stack
      });
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

  this.actualizarUsuario = function (obj, callback) {
    actualizar(this.usuarios, obj, callback);
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
        callback(undefined);
        return;
      }
      const email = doc && doc.value ? doc.value.email : undefined;
      callback(email ? { email } : undefined);
    }
  );
}

function buscar(col, criterio, cb) {
  if (!col) {
    cb(undefined);
    return;
  }
  // findOne es suficiente, y le añadimos maxTimeMS
  col.findOne(criterio, { maxTimeMS: 4000, projection: { _id: 1, email: 1, password: 1 } })
    .then((doc) => {
      cb(doc);
    })
    .catch((err) => {
      cb(undefined);
    });
}

function insertar(col, elem, cb) {
  if (!col) {
    cb({ email: elem && elem.email ? elem.email : -1 });
    return;
  }
  col
    .insertOne(elem, { maxTimeMS: 5000 })
    .then(() => {
      cb(elem);
    })
    .catch((err) => {
      if (err && err.code === 11000) {
        cb({ email: -1, reason: "duplicado" });
      } else {
        cb({ email: -1 });
      }
    });
}

function actualizar(coleccion, obj, callback) {
  if (!coleccion || !obj || !obj._id) {
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
    // En versiones recientes de MongoDB, el documento está en result sin .value
    const doc = result?.value || result;
    if (doc?.email) {
      callback({ email: doc.email });
    } else {
      callback({ email: -1 });
    }
  }).catch(err => {
    callback({ email: -1 });
  });
}
