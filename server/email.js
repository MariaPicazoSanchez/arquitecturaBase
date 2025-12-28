const nodemailer = require('nodemailer');
// PRODUCCIÓN
// const gv = require('./gestorVariables.js');

// let options = {
//   user: "",
//   pass: ""
// };

// fallback (DESARROLLO LOCAL / cuando no se carga gv.obtenerOptions)
const options = {
  user: process.env.MAIL_FROM || "",
  pass: process.env.MAIL_PASS || ""
};

// let transporter;

// gv.obtenerOptions(function (res) {
//   options = res;

//   transporter = nodemailer.createTransport({
//     service: 'gmail',
//     auth: options
//   });

//   console.log("[email] Transporter inicializado con correo de:", options.user);
// });

// DESARROLLO LOCAL
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_FROM,
    pass: process.env.MAIL_PASS
  }
});

module.exports.enviarEmail=async function(direccion, key,men) {
  const APP_URL = process.env.APP_URL;
  const confirmUrl = `${APP_URL}/confirmarUsuario/${encodeURIComponent(direccion)}/${encodeURIComponent(key)}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111">
      <p>Bienvenido a <strong>Table Room</strong></p>

      <!-- Botón compatible con Outlook (usa tabla) -->
      <table role="presentation" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" bgcolor="#2563EB" style="border-radius:6px;">
            <a href="${confirmUrl}" target="_blank" 
              style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-weight:bold;">
              Confirmar cuenta
            </a>
          </td>
        </tr>
      </table>

      <p style="margin-top:16px">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
      <p><a href="${confirmUrl}" target="_blank">${confirmUrl}</a></p>
    </div>
  `;

  await transporter.sendMail({
    from: options.user || process.env.MAIL_FROM,
    to: direccion,
    subject: men || "Confirmar cuenta",
    text: `Bienvenido a Sistema\n\nConfirma tu cuenta aquí:\n${confirmUrl}\n`, // fallback de texto
    html
  });

}

module.exports.enviarEmailCambioPassword = async function(direccion, code) {
  const APP_URL = process.env.APP_URL || "";
  const codeStr = String(code || "").trim();

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111">
      <p>Has solicitado cambiar tu contraseña en <strong>Table Room</strong>.</p>
      <p>Introduce este código en la sección <strong>Seguridad</strong> de “Mi cuenta”:</p>
      <p style="font-size:20px;font-weight:800;letter-spacing:2px;margin:12px 0">${codeStr}</p>
      ${APP_URL ? `<p>Volver a la app: <a href="${APP_URL}" target="_blank">${APP_URL}</a></p>` : ""}
      <p style="color:#6b7280;font-size:13px;margin-top:16px">Si no has sido tú, ignora este correo.</p>
    </div>
  `;

  await transporter.sendMail({
    from: options.user || process.env.MAIL_FROM,
    to: direccion,
    subject: "Cambiar contraseña",
    text: `Código para cambiar contraseña: ${codeStr}\n\nSi no has sido tú, ignora este correo.\n`,
    html
  });
};
