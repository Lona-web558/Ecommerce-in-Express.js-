const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('SMTP not configured — emails will be logged to console instead of sent.');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

// Sends an email, or logs it if SMTP isn't configured (so local dev never crashes)
async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[EMAIL - not sent, SMTP unconfigured] To: ${to} | Subject: ${subject}`);
    return { simulated: true };
  }
  try {
    return await t.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      html
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { error: err.message };
  }
}

function orderConfirmationEmail(order) {
  const itemsHtml = order.items.map(i =>
    `<tr><td style="padding:6px 10px;">${i.name}</td><td style="padding:6px 10px;">${i.quantity}</td><td style="padding:6px 10px;">$${i.price.toFixed(2)}</td></tr>`
  ).join('');

  return {
    subject: `Order Confirmation - #${order.id.slice(0, 8).toUpperCase()}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
        <h2>Thanks for your order!</h2>
        <p>Order ID: <strong>${order.id.slice(0, 8).toUpperCase()}</strong></p>
        <table style="width:100%; border-collapse: collapse;">
          <thead><tr><th align="left">Item</th><th align="left">Qty</th><th align="left">Price</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <p><strong>Total: $${order.total.toFixed(2)}</strong></p>
        <p>Status: ${order.status}</p>
      </div>
    `
  };
}

module.exports = { sendMail, orderConfirmationEmail };
