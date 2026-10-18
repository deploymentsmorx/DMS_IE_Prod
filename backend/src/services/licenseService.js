const crypto = require("crypto");
const authService = require("./authService");

let volatileStore = { customers: [] };

function getSecret() {
  return process.env.AUTH_SECRET || "smorx-advance-search-dev-secret";
}

function hashPassword(password) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(String(password))
    .digest("hex");
}

function loadStore() {
  return volatileStore;
}

function saveStore(store) {
  volatileStore = { customers: [...(store.customers || [])] };
}

function generateLicenseKey(existingKeys) {
  const year = new Date().getUTCFullYear();
  const keys = new Set(existingKeys || []);
  for (let i = 0; i < 40; i += 1) {
    const key = `AB-${year}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    if (!keys.has(key)) return key;
  }
  return `AB-${year}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function serializeCustomer(customer) {
  return {
    customerId: customer.customerId,
    companyName: customer.companyName,
    licenseKey: customer.licenseKey,
    deviceId: customer.deviceId || "",
    hostName: customer.hostName || "",
    requireDevice: Boolean(customer.requireDevice),
    createdAt: customer.createdAt,
    engineers: (customer.engineers || []).map((e) => ({
      engineerId: e.engineerId,
      fullName: e.fullName,
      email: e.email,
      role: e.role,
      deviceId: e.deviceId || "",
      hostName: e.hostName || "",
      activated: Boolean(e.activated),
      mustChangePassword: Boolean(e.mustChangePassword),
      grantFullAccess: Boolean(e.grantFullAccess),
      createdAt: e.createdAt,
    })),
  };
}

function createCustomer(payload = {}) {
  const companyName = String(payload.companyName || payload.company_name || "").trim();
  if (companyName.length < 2) {
    return { ok: false, error: "Company / organization name is required." };
  }

  const store = loadStore();
  const existingKeys = store.customers.map((c) => c.licenseKey);
  let licenseKey = String(payload.licenseKey || payload.license_key || "").trim();
  if (!licenseKey) licenseKey = generateLicenseKey(existingKeys);
  if (store.customers.some((c) => c.licenseKey === licenseKey)) {
    return { ok: false, error: "License key already exists." };
  }

  const installPassword =
    String(payload.installPassword || payload.install_password || "").trim() ||
    crypto.randomBytes(7).toString("base64url");
  const deviceId = String(payload.deviceId || payload.device_id || "").trim();
  const hostName = String(payload.hostName || payload.host_name || payload.hostname || "").trim();
  const requireDevice =
    payload.requireDevice !== undefined
      ? Boolean(payload.requireDevice)
      : payload.require_device !== undefined
        ? Boolean(payload.require_device)
        : true;

  const engineerName = String(
    payload.engineerName || payload.engineer_full_name || payload.fullName || ""
  ).trim();
  const engineerEmail = String(
    payload.engineerEmail || payload.engineer_email || payload.email || ""
  )
    .trim()
    .toLowerCase();
  const temporaryPassword = String(
    payload.temporaryPassword || payload.temporary_password || payload.password || ""
  ).trim();
  const grantFullAccess =
    payload.grantFullAccess !== undefined
      ? Boolean(payload.grantFullAccess)
      : payload.grant_full_access !== undefined
        ? Boolean(payload.grant_full_access)
        : true;
  const role = authService.normalizeRole(
    payload.role,
    grantFullAccess ? "admin" : "user"
  );

  if (!engineerName || !engineerEmail || temporaryPassword.length < 6) {
    return {
      ok: false,
      error: "Engineer full name, email, and temporary password (min 6) are required.",
    };
  }

  const allUsers = authService.getUsers();
  if (allUsers.some((u) => String(u.username || "").toLowerCase() === engineerEmail)) {
    return { ok: false, error: "An account with this email already exists." };
  }

  const customerId = `c_${crypto.randomBytes(6).toString("hex")}`;
  const engineerId = `e_${crypto.randomBytes(6).toString("hex")}`;
  const now = new Date().toISOString();
  const installHash = hashPassword(installPassword);
  const passwordHash = hashPassword(temporaryPassword);

  const engineer = {
    engineerId,
    fullName: engineerName,
    email: engineerEmail,
    passwordHash,
    installPasswordHash: installHash,
    deviceId,
    hostName,
    role,
    grantFullAccess,
    mustChangePassword: true,
    activated: false,
    createdAt: now,
  };

  const customer = {
    customerId,
    companyName,
    licenseKey,
    installPasswordHash: installHash,
    deviceId,
    hostName,
    requireDevice,
    createdAt: now,
    updatedAt: now,
    engineers: [engineer],
  };

  store.customers.unshift(customer);
  saveStore(store);

  const mirror = authService.upsertEngineerUser({
    id: engineerId,
    username: engineerEmail,
    displayName: engineerName,
    role,
    passwordHash,
    customerId,
    licenseKey,
    deviceId,
    hostName,
    requireDevice,
    activated: false,
    mustChangePassword: true,
    installPasswordHash: installHash,
  });
  if (!mirror.ok) {
    store.customers = store.customers.filter((c) => c.customerId !== customerId);
    saveStore(store);
    return mirror;
  }

  return {
    ok: true,
    customer: serializeCustomer(customer),
    credentials: {
      licenseKey,
      installPassword,
      email: engineerEmail,
      temporaryPassword,
    },
  };
}

function listCustomers() {
  return { items: loadStore().customers.map(serializeCustomer) };
}

function findCustomerByLicense(licenseKey) {
  const key = String(licenseKey || "").trim();
  return loadStore().customers.find((c) => c.licenseKey === key) || null;
}

function activateLicense(payload = {}) {
  const licenseKey = String(payload.licenseKey || payload.license_key || "").trim();
  const installPassword = String(payload.installPassword || payload.install_password || "");
  const email = String(payload.email || payload.username || "")
    .trim()
    .toLowerCase();
  const temporaryPassword = String(
    payload.temporaryPassword || payload.temporary_password || payload.password || ""
  );
  const deviceId = String(payload.deviceId || payload.device_id || "").trim();
  const hostName = String(
    payload.hostName || payload.host_name || payload.hostname || ""
  ).trim();

  if (!licenseKey || !installPassword || !email || !temporaryPassword) {
    return {
      ok: false,
      error: "License key, install password, email, and temporary password are required.",
    };
  }

  const store = loadStore();
  const customer = store.customers.find((c) => c.licenseKey === licenseKey);
  if (!customer) {
    return { ok: false, error: "Invalid license key or install password." };
  }

  const engineer = (customer.engineers || []).find((e) => e.email === email);
  if (!engineer || engineer.passwordHash !== hashPassword(temporaryPassword)) {
    return { ok: false, error: "Invalid engineer email or temporary password." };
  }

  const installOk = engineer.installPasswordHash
    ? engineer.installPasswordHash === hashPassword(installPassword)
    : customer.installPasswordHash === hashPassword(installPassword);
  if (!installOk) {
    return { ok: false, error: "Invalid license key or install password." };
  }

  if (customer.requireDevice) {
    const approvedDevice = (engineer.deviceId || customer.deviceId || "").trim();
    const approvedHost = (engineer.hostName || customer.hostName || "").trim();
    if (approvedDevice && deviceId && approvedDevice !== deviceId) {
      return { ok: false, error: "This license is locked to a different Device ID." };
    }
    if (approvedHost && hostName && approvedHost.toLowerCase() !== hostName.toLowerCase()) {
      return { ok: false, error: "This license is locked to a different host name." };
    }
  }

  engineer.activated = true;
  if (deviceId) engineer.deviceId = deviceId;
  if (hostName) engineer.hostName = hostName;
  if (deviceId && !customer.deviceId) customer.deviceId = deviceId;
  if (hostName && !customer.hostName) customer.hostName = hostName;
  customer.updatedAt = new Date().toISOString();
  saveStore(store);

  authService.upsertEngineerUser({
    id: engineer.engineerId,
    username: engineer.email,
    displayName: engineer.fullName,
    role: engineer.role,
    passwordHash: engineer.passwordHash,
    customerId: customer.customerId,
    licenseKey: customer.licenseKey,
    deviceId: engineer.deviceId,
    hostName: engineer.hostName,
    requireDevice: customer.requireDevice,
    activated: true,
    mustChangePassword: Boolean(engineer.mustChangePassword),
    installPasswordHash: engineer.installPasswordHash || customer.installPasswordHash,
  });

  return {
    ok: true,
    status: "activated",
    companyName: customer.companyName,
    licenseKey: customer.licenseKey,
    engineer: {
      email: engineer.email,
      fullName: engineer.fullName,
      deviceId: engineer.deviceId,
      hostName: engineer.hostName,
      activated: true,
    },
  };
}

function checkDeviceGate(userRecord, deviceId, hostName) {
  if (!userRecord || userRecord.builtIn || userRecord.kind !== "engineer") {
    return { ok: true };
  }
  if (!userRecord.requireDevice) return { ok: true };

  const approvedDevice = String(userRecord.deviceId || "").trim();
  const approvedHost = String(userRecord.hostName || "").trim();
  const incomingDevice = String(deviceId || "").trim();
  const incomingHost = String(hostName || "").trim();

  if (!userRecord.activated) {
    return { ok: false, error: "License is not activated on this device yet." };
  }
  if (!incomingDevice && !incomingHost) {
    return {
      ok: false,
      error: "Login blocked: Device ID and host name are required on this license.",
    };
  }
  if (!approvedDevice && !approvedHost) {
    return {
      ok: false,
      error: "Login blocked: This license has no approved PC yet. Activate first.",
    };
  }
  if (approvedDevice && (!incomingDevice || approvedDevice !== incomingDevice)) {
    return { ok: false, error: "Login blocked: Device ID does not match the licensed PC." };
  }
  if (
    approvedHost &&
    (!incomingHost || approvedHost.toLowerCase() !== incomingHost.toLowerCase())
  ) {
    return { ok: false, error: "Login blocked: Host name does not match the licensed PC." };
  }
  return { ok: true };
}

module.exports = {
  createCustomer,
  listCustomers,
  activateLicense,
  findCustomerByLicense,
  checkDeviceGate,
  hashPassword,
};
