const express = require("express");
const authService = require("../services/authService");
const licenseService = require("../services/licenseService");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/admin/customers", requireAuth, (req, res) => {
  if (!authService.isSuperAdmin(req.user)) {
    return res.status(403).json({ error: "Super Admin access required" });
  }
  res.json(licenseService.listCustomers());
});

router.post("/admin/customers", requireAuth, (req, res) => {
  if (!authService.isSuperAdmin(req.user)) {
    return res.status(403).json({ error: "Super Admin access required" });
  }
  const result = licenseService.createCustomer(req.body || {});
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.status(201).json({
    customer: result.customer,
    credentials: result.credentials,
    message:
      "Customer created. Share license key, install password, email, and temporary password. Customer Activates then signs in on the approved PC only.",
  });
});

router.post("/license/activate", (req, res) => {
  const result = licenseService.activateLicense(req.body || {});
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
});

module.exports = router;
