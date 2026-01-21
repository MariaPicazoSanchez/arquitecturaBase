const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const client = new SecretManagerServiceClient();
const logger = require("./logger");

// Cache resolved project id so we don't call metadata repeatedly
let _cachedProjectId = null;
async function _resolveProjectId() {
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  if (_cachedProjectId) return _cachedProjectId;
  try {
    _cachedProjectId = await client.getProjectId();
    return _cachedProjectId;
  } catch (err) {
    logger.error('[gestorVariables] No se pudo resolver GOOGLE_CLOUD_PROJECT:', err && err.message);
    throw new Error('No se pudo resolver el projectId para Secret Manager. Asegure la variable de entorno GOOGLE_CLOUD_PROJECT o la metadata de GCP.');
  }
}

async function accessCLAVECORREO() {
  const pid = await _resolveProjectId();
  const name = `projects/${pid}/secrets/CLAVECORREO/versions/latest`;
  const [version] = await client.accessSecretVersion({ name });
  const datos = version.payload.data.toString('utf8');
  return datos;
}

async function accessCORREOCUENTA() {
  const pid = await _resolveProjectId();
  const name = `projects/${pid}/secrets/CORREOCUENTA/versions/latest`;
  const [version] = await client.accessSecretVersion({ name });
  const datos = version.payload.data.toString('utf8');
  return datos;
}

async function accessMONGOURI() {
  const pid = await _resolveProjectId();
  const name = `projects/${pid}/secrets/MONGOURI/versions/latest`;
  const [version] = await client.accessSecretVersion({ name });
  const uri = version.payload.data.toString('utf8');
  return uri;
}

module.exports.obtenerOptions = async function (callback) {
  const options = { user: "", pass: "", mongoURI: "" };

  // Lee los dos secretos
  const user = await accessCORREOCUENTA();
  const pass = await accessCLAVECORREO();

  options.user = user;
  options.pass = pass;

  callback(options);
};

module.exports.obtenerMongoUri = async function () {
  const env = (process.env.APP_ENV || process.env.NODE_ENV || "").toLowerCase() || "development";

  // Desarrollo local / staging: usar primero variables de entorno estándar o con sufijo
  const explicit =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env[`MONGO_URI_${env.toUpperCase()}`] ||
    process.env[`MONGODB_URI_${env.toUpperCase()}`];

  if (explicit) {
    logger.debug(`[gestorVariables] usando MONGO_URI de entorno para ${env}`);
    return explicit.trim();
  }

  // Producción: Secret Manager
  if (env === "production") {
    logger.debug("[gestorVariables] obteniendo MONGO_URI desde Secret Manager");
    return await accessMONGOURI();
  }

  logger.warn("[gestorVariables] MONGO_URI no definida; operando sin persistencia");
  return "";
};
