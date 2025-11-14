const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const client = new SecretManagerServiceClient();
const projectId = process.env.GOOGLE_CLOUD_PROJECT;

async function accessCLAVECORREO() {
  const name = `projects/${projectId}/secrets/CLAVECORREO/versions/latest`;

  const [version] = await client.accessSecretVersion({ name: name });
  const datos = version.payload.data.toString("utf8");
  return datos;
}

async function accessCORREOCUENTA() {
  const name = `projects/${projectId}/secrets/CORREOCUENTA/versions/latest`;

  const [version] = await client.accessSecretVersion({ name: name });
  const datos = version.payload.data.toString("utf8");
  return datos;
}

async function accessMONGOURI() {
  const name = `projects/${projectId}/secrets/MONGOURI/versions/latest`;

  const [version] = await client.accessSecretVersion({ name });
  const uri = version.payload.data.toString("utf8");
  return uri;
}

module.exports.obtenerOptions = async function (callback) {
  let options = { user: "", pass: "", mongoURI: "" };

  // Lee los dos secretos
  let user = await accessCORREOCUENTA();
  let pass = await accessCLAVECORREO();

  options.user = user;
  options.pass = pass;

  // Para depurar
  // console.log("[gestorVariables] user:", user);
  // console.log("[gestorVariables] pass leída (NO la imprimas en producción)");

  callback(options);
};

module.exports.obtenerMongoUri = async function () {
  // Desarrollo local
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI;
  }

  // Producción
  return await accessMONGOURI();
};