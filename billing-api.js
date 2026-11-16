/** Stripe Billing for the membership. Hosted Checkout starts a plan. A paid member who picks another plan is switched on the same subscription. The Customer Portal updates the card, shows invoices, and cancels at the end of the period. */
const crypto = require("crypto");

const LOOKUP = { pro: "pro_month" };
const OPEN = new Set(["active", "trialing", "past_due"]);
const seen = new Set();

function stripeKey() {
  const value = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!value) throw new Error("Billing isn't ready on this server yet.");
  return value;
}

function form(value, prefix, pairs) {
  pairs = pairs || [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => form(item, prefix + "[" + index + "]", pairs));
    return pairs;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([name, item]) => form(item, prefix ? prefix + "[" + name + "]" : name, pairs));
    return pairs;
  }
  if (value != null && prefix) pairs.push([prefix, String(value)]);
  return pairs;
}

async function stripe(method, path, params) {
  const response = await fetch("https://api.stripe.com" + path, {
    method,
    headers: Object.assign({ Authorization: "Bearer " + stripeKey() }, method === "GET" ? {} : { "Content-Type": "application/x-www-form-urlencoded" }),
    body: method === "GET" ? undefined : new URLSearchParams(form(params || {})).toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data.error && data.error.message) || "Billing could not finish.");
  return data;
}

function origin(req) {
  const set = String(process.env.SITE_URL || "").trim().replace(/\/$/, "");
  if (set) return set;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "parlayoftheday.com").split(",")[0].trim();
  const proto = String(req.headers["x-forwarded-proto"] || (host.includes("localhost") || host.startsWith("127.") ? "http" : "https")).split(",")[0].trim();
  return proto + "://" + host;
}

function idOf(value) {
  if (!value) return "";
  return typeof value === "string" ? value : String(value.id || "");
}

function planName() {
  return "pro";
}

const priceCache = {};
async function priceId(lookup) {
  if (priceCache[lookup]) return priceCache[lookup];
  const list = await stripe("GET", "/v1/prices?lookup_keys[]=" + encodeURIComponent(lookup) + "&active=true&limit=1");
  const price = list.data && list.data[0];
  if (!price) throw new Error("That plan is not for sale.");
  priceCache[lookup] = price.id;
  return price.id;
}

function planOf(sub) {
  const item = (((sub || {}).items || {}).data || [])[0] || {};
  const price = item.price || {};
  const plan = (price.metadata && price.metadata.plan) || (sub.metadata && sub.metadata.plan) || "";
  return { plan, interval: (price.recurring && price.recurring.interval) || "", end: sub.current_period_end || item.current_period_end || 0 };
}

async function saveMember(loadMembers, writeKey, memberId, customerId, sub) {
  const data = await loadMembers();
  let row = data.users.find((item) => item.id === memberId);
  if (!row && customerId) row = data.users.find((item) => item.stripeCustomerId === customerId);
  if (!row) return;
  const picked = planOf(sub);
  const open = OPEN.has(sub.status);
  const plan = open && picked.plan === "pro" ? "pro" : "free";
  row.stripeCustomerId = idOf(customerId) || row.stripeCustomerId || "";
  row.subscriptionId = sub.id || "";
  row.subStatus = sub.status || "";
  row.plan = plan;
  row.planInterval = plan === "free" ? "" : picked.interval;
  row.periodEnd = picked.end ? new Date(picked.end * 1000).toISOString() : "";
  await writeKey("bets/members.json", data);
}

async function checkout(user, plan, req, loadMembers, writeKey) {
  const lookup = LOOKUP[String(plan || "")];
  if (!lookup) throw new Error("Pick a plan.");
  const price = await priceId(lookup);
  if (OPEN.has(user.subStatus) && user.subscriptionId) {
    if (user.subStatus === "past_due") throw new Error("Update the card first. Then the plan can change.");
    const sub = await stripe("GET", "/v1/subscriptions/" + encodeURIComponent(user.subscriptionId));
    const item = (((sub.items || {}).data) || [])[0];
    if (!item) throw new Error("That membership has no plan to change.");
    if (item.price && item.price.id === price) return { same: true };
    const next = await stripe("POST", "/v1/subscriptions/" + encodeURIComponent(sub.id), {
      items: [{ id: item.id, price }],
      proration_behavior: "create_prorations",
      metadata: { memberId: user.id, plan: planName(plan) },
    });
    await saveMember(loadMembers, writeKey, user.id, next.customer, next);
    return { switched: true };
  }
  const site = origin(req);
  const named = planName(plan);
  const sessionBody = Object.assign({
    mode: "subscription",
    client_reference_id: user.id,
    success_url: site + "/api/billing/return?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: site + "/?billing=cancel",
    line_items: [{ price, quantity: 1 }],
    metadata: { memberId: user.id, plan: named },
    subscription_data: { metadata: { memberId: user.id, plan: named }, billing_mode: { type: "flexible" } },
  }, user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: user.email });
  let session;
  try {
    session = await stripe("POST", "/v1/checkout/sessions", sessionBody);
  } catch (error) {
    if (!/billing_mode/i.test(error.message)) throw error;
    sessionBody.subscription_data = { metadata: sessionBody.subscription_data.metadata };
    session = await stripe("POST", "/v1/checkout/sessions", sessionBody);
  }
  return { url: session.url };
}

async function portal(user, req) {
  if (!user.stripeCustomerId) throw new Error("Start a paid plan before you manage billing.");
  const session = await stripe("POST", "/v1/billing_portal/sessions", {
    customer: user.stripeCustomerId,
    return_url: origin(req) + "/?billing=ready",
  });
  return { url: session.url };
}

async function finish(user, sessionId, loadMembers, writeKey) {
  if (!sessionId) return false;
  const session = await stripe("GET", "/v1/checkout/sessions/" + encodeURIComponent(sessionId));
  const memberId = session.client_reference_id || (session.metadata && session.metadata.memberId);
  if (memberId !== user.id || session.status !== "complete" || !session.subscription) return false;
  const sub = await stripe("GET", "/v1/subscriptions/" + encodeURIComponent(idOf(session.subscription)));
  await saveMember(loadMembers, writeKey, user.id, session.customer, sub);
  return true;
}

function readEvent(raw, header) {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret) return null;
  const parts = String(header || "").split(",").map((part) => part.split("="));
  const stamp = (parts.find((part) => part[0] === "t") || [])[1];
  const sigs = parts.filter((part) => part[0] === "v1").map((part) => part[1]);
  if (!stamp || !sigs.length || Math.abs(Date.now() / 1000 - Number(stamp)) > 300) return null;
  const expected = crypto.createHmac("sha256", secret).update(Buffer.concat([Buffer.from(stamp + "."), raw])).digest("hex");
  const ok = sigs.some((sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
  if (!ok) return null;
  return JSON.parse(raw.toString("utf8"));
}

async function markPastDue(loadMembers, writeKey, customerId) {
  const data = await loadMembers();
  const row = data.users.find((item) => item.stripeCustomerId === customerId);
  if (!row || row.subStatus === "canceled") return;
  row.subStatus = "past_due";
  await writeKey("bets/members.json", data);
}

async function webhook(raw, header, loadMembers, writeKey) {
  const event = readEvent(raw, header);
  if (!event) throw new Error("That notice could not be checked.");
  if (seen.has(event.id)) return { received: true };
  seen.add(event.id);
  if (seen.size > 300) seen.delete(seen.values().next().value);
  const object = (event.data || {}).object || {};
  if (event.type === "checkout.session.completed" && object.mode === "subscription" && object.subscription) {
    const sub = await stripe("GET", "/v1/subscriptions/" + encodeURIComponent(idOf(object.subscription)));
    await saveMember(loadMembers, writeKey, object.client_reference_id || (object.metadata && object.metadata.memberId), object.customer, sub);
  } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const subId = idOf(object.subscription) || idOf(object.parent && object.parent.subscription_details && object.parent.subscription_details.subscription);
    if (event.type === "invoice.payment_failed") await markPastDue(loadMembers, writeKey, idOf(object.customer));
    else if (subId) {
      const sub = await stripe("GET", "/v1/subscriptions/" + encodeURIComponent(subId));
      await saveMember(loadMembers, writeKey, (sub.metadata && sub.metadata.memberId) || "", object.customer, sub);
    }
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    await saveMember(loadMembers, writeKey, (object.metadata && object.metadata.memberId) || "", object.customer, object);
  }
  return { received: true };
}

module.exports = { checkout, portal, finish, webhook };
