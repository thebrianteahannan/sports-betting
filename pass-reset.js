/** Membership password reset: request a link, email it when mail is set up, then set a new password. */
const crypto = require("crypto");
const net = require("net");
const tls = require("tls");

function env(name) {
  return String(process.env[name] || "").trim();
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function siteOrigin(req) {
  const set = env("SITE_URL").replace(/\/$/, "");
  if (set) return set;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "parlayoftheday.com").split(",")[0].trim();
  const proto = String(req.headers["x-forwarded-proto"] || (host.includes("localhost") || host.startsWith("127.") ? "http" : "https")).split(",")[0].trim();
  return proto + "://" + host;
}

function isLocal(origin) {
  return /localhost|127\.0\.0\.1/.test(String(origin || ""));
}

async function sendResend(to, subject, text) {
  const key = env("RESEND_API_KEY");
  if (!key) return false;
  const from = env("MAIL_FROM") || "Parlay of the Day <onboarding@resend.dev>";
  const reply = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!reply.ok) throw new Error("Could not send the reset email.");
  return true;
}

function smtpRead(socket) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString("utf8");
      const lines = buf.split(/\r\n/).filter((line, at, all) => at < all.length - 1 || buf.endsWith("\r\n"));
      if (!lines.length) return;
      const last = lines[lines.length - 1] || "";
      if (/^\d{3}-/.test(last) || !/^\d{3} /.test(last)) return;
      socket.off("data", onData);
      socket.off("error", onError);
      resolve(buf);
    };
    const onError = (error) => { socket.off("data", onData); reject(error); };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function smtpWrite(socket, line) {
  socket.write(line + "\r\n");
}

async function sendSmtp(to, subject, text) {
  const user = env("MAIL_USER"), pass = env("MAIL_PASS");
  if (!user || !pass) return false;
  const host = env("MAIL_HOST") || "smtp.gmail.com";
  const port = Number(env("MAIL_PORT") || 587);
  const from = env("MAIL_FROM") || user;
  const plain = net.connect({ host, port });
  await new Promise((resolve, reject) => { plain.once("connect", resolve); plain.once("error", reject); });
  let socket = plain;
  const expect = async (code) => {
    const raw = await smtpRead(socket);
    if (!raw.startsWith(String(code))) throw new Error("Could not send the reset email.");
    return raw;
  };
  await expect(220);
  smtpWrite(socket, "EHLO parlayoftheday.com");
  await expect(250);
  smtpWrite(socket, "STARTTLS");
  await expect(220);
  socket = tls.connect({ socket: plain, servername: host });
  await new Promise((resolve, reject) => { socket.once("secureConnect", resolve); socket.once("error", reject); });
  smtpWrite(socket, "EHLO parlayoftheday.com");
  await expect(250);
  smtpWrite(socket, "AUTH LOGIN");
  await expect(334);
  smtpWrite(socket, Buffer.from(user).toString("base64"));
  await expect(334);
  smtpWrite(socket, Buffer.from(pass).toString("base64"));
  await expect(235);
  smtpWrite(socket, `MAIL FROM:<${from.replace(/[<>]/g, "")}>`);
  await expect(250);
  smtpWrite(socket, `RCPT TO:<${to}>`);
  await expect(250);
  smtpWrite(socket, "DATA");
  await expect(354);
  const body = [`From: Parlay of the Day <${from.replace(/[<>]/g, "")}>`, `To: <${to}>`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", text, "."].join("\r\n");
  smtpWrite(socket, body);
  await expect(250);
  smtpWrite(socket, "QUIT");
  socket.end();
  return true;
}

async function sendMail(to, subject, text) {
  if (await sendResend(to, subject, text)) return true;
  if (await sendSmtp(to, subject, text)) return true;
  return false;
}

async function requestReset(req, email, loadMembers, writeKey) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean.includes("@")) throw new Error("Enter an email.");
  const origin = siteOrigin(req);
  const data = await loadMembers();
  const user = data.users.find((row) => row.email === clean);
  const ok = { ok: true, say: "If that email is on a membership, a reset link is on its way." };
  if (!user) return ok;
  const token = crypto.randomBytes(24).toString("hex");
  user.resetHash = hashToken(token);
  user.resetAt = Date.now();
  await writeKey("bets/members.json", data);
  const link = `${origin}/?reset=${token}`;
  const text = `Reset your Parlay of the Day password with this link (it expires in one hour):\n\n${link}\n\nIf you did not ask for this, you can ignore the email.`;
  const sent = await sendMail(clean, "Reset your Parlay of the Day password", text);
  if (sent) return ok;
  if (isLocal(origin)) return { ...ok, say: "Mail is not set up here, so use this reset link.", link };
  throw new Error("Password reset email is not set up yet. Email bthannan@gmail.com and we will help you back in.");
}

async function applyReset(token, password, loadMembers, writeKey, passHash) {
  const raw = String(token || "").trim();
  const next = String(password || "");
  if (raw.length < 20) throw new Error("That reset link is missing or expired.");
  if (next.length < 8) throw new Error("Use at least 8 characters.");
  const data = await loadMembers();
  const dig = hashToken(raw);
  const user = data.users.find((row) => row.resetHash && row.resetHash === dig);
  if (!user || !Number.isFinite(user.resetAt) || Date.now() - user.resetAt > 60 * 60 * 1000) throw new Error("That reset link is missing or expired.");
  const salt = crypto.randomBytes(16).toString("hex");
  user.salt = salt;
  user.hash = passHash(next, salt);
  delete user.resetHash;
  delete user.resetAt;
  await writeKey("bets/members.json", data);
  return { ok: true, say: "Password updated. Sign in with the new one." };
}

module.exports = { requestReset, applyReset, siteOrigin };
