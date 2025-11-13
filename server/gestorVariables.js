const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const client = new SecretManagerServiceClient();

async function accessCLAVECORREO() {
  const name = 'projects/1066426825741/secrets/CLAVECORREO/versions/latest';

  const [version] = await client.accessSecretVersion({ name: name });
  const datos = version.payload.data.toString("utf8");
  return datos;
}

async function accessCORREOCUENTA() {
  const name = 'projects/1066426825741/secrets/CORREOCUENTA/versions/latest';

  const [version] = await client.accessSecretVersion({ name: name });
  const datos = version.payload.data.toString("utf8");
  return datos;
}

module.exports.obtenerOptions = async function (callback) {
  let options = { user: "", pass: "" };

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
