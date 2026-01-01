const nodemailer = require("nodemailer");

const options = {
  user: process.env.MAIL_FROM || "",
  pass: process.env.MAIL_PASS || "",
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_FROM,
    pass: process.env.MAIL_PASS,
  },
});

function buildAbsoluteUrl(pathname, baseUrl) {
  const base = (baseUrl || "").toString().trim();
  if (!base) return "";
  try {
    return new URL(pathname, base).toString();
  } catch (e) {
    return "";
  }
}

module.exports.enviarEmail = async function (direccion, key, men) {
  const APP_URL = process.env.APP_URL;
  const confirmUrl = buildAbsoluteUrl(
    `/confirmarUsuario/${encodeURIComponent(direccion)}/${encodeURIComponent(key)}`,
    APP_URL
  );

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111">
      <p>Bienvenido a <strong>Table Room</strong></p>

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
    text: `Bienvenido.\n\nConfirma tu cuenta aquí:\n${confirmUrl}\n`,
    html,
  });
};

module.exports.enviarEmailCambioPassword = async function (direccion, payloadOrCode) {
  const APP_URL = process.env.APP_URL || "";
  const payload = payloadOrCode && typeof payloadOrCode === "object"
    ? payloadOrCode
    : { code: payloadOrCode };

  const codeStr = String(payload.code || "").trim();
  const token = String(payload.token || "").trim();

  const resetLink = token ? buildAbsoluteUrl(`/reset-password?token=${encodeURIComponent(token)}`, APP_URL) : "";

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111">
      <p>Has solicitado cambiar tu contraseña en <strong>Table Room</strong>.</p>
      <p>Introduce este código para confirmar el cambio:</p>
      <p style="font-size:20px;font-weight:800;letter-spacing:2px;margin:12px 0">${codeStr}</p>
      <p style="color:#6b7280;font-size:13px;margin-top:8px">Este codigo (y el enlace) expira en ~15 minutos.</p>
      ${resetLink ? `<p>Enlace para restablecer: <a href="${resetLink}" target="_blank">${resetLink}</a></p>` : (APP_URL ? `<p>Volver a la app: <a href="${APP_URL}" target="_blank">${APP_URL}</a></p>` : "")}
      <p style="color:#6b7280;font-size:13px;margin-top:16px">Si no has sido tú, ignora este correo.</p>
    </div>
  `;

  await transporter.sendMail({
    from: options.user || process.env.MAIL_FROM,
    to: direccion,
    subject: "Cambiar contraseña",
    text: `Codigo para cambiar contraseña: ${codeStr}\n${resetLink ? `\nEnlace de reset: ${resetLink}\n` : ""}\nSi no has sido tu, ignora este correo.\n`,
    html,
  });
};

