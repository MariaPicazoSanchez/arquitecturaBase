require('dotenv').config();
const { MongoClient } = require('mongodb');
function CAD(){
    const mongo=require("mongodb").MongoClient;
    const ObjectId=require("mongodb").ObjectId;

    this.usuarios;

    this.buscarOCrearUsuario = function (usr, callback) {
        buscarOCrear(this.usuarios, usr, callback);
    };

    this.conectar = async function (callback) {
        const uri = process.env.MONGO_URI;

        // ✅ Validación temprana (evita el crash feo)
        if (!uri) {
        console.error('[ERROR] MONGO_URI no definida. Añádela al .env');
        process.exit(1);
        }
        if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
        console.error('[ERROR] MONGO_URI inválida. Debe empezar por mongodb:// o mongodb+srv://');
        process.exit(1);
        }

        const client = new MongoClient(uri);
        await client.connect();
        const db = client.db('sistema'); // o el nombre que uses
        this.usuarios = db.collection('usuarios');
        callback(db);
    };

}
module.exports.CAD=CAD;

function buscarOCrear(coleccion, criterio, callback) {
    coleccion.findOneAndUpdate(
        criterio,
        { $set: criterio },
        { upsert: true, returnDocument: "after", projection: { email: 1 } },
        function(err, doc) {
            if (err) { throw err; }
            else {
                console.log("Elemento actualizado");
                console.log(doc.value.email);
                callback({ email: doc.value.email });
            }
        }
    );

    this.buscarUsuario = function(criterio, cb){ buscar(this.usuarios, criterio, cb); };
    this.insertarUsuario = function(usuario, cb){ insertar(this.usuarios, usuario, cb); };
}

function buscar(col, criterio, cb){
  col.find(criterio).toArray(function(err, docs){
    if (docs.length === 0) cb(undefined); else cb(docs[0]);
  });
}
function insertar(col, elem, cb){
  col.insertOne(elem, function(err){
    if (err){ console.log("error"); cb({ email: -1 }); }
    else { console.log("Nuevo elemento creado"); cb(elem); }
  });
}


