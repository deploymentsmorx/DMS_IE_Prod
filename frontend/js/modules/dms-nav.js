import { initDocumentVersion, loadDocumentVersionModule, resetDocumentVersionSelection } from "./document-version.js";
import { loadDmsAnalytics } from "./dms-analytics.js";
import { loadEnterpriseGovernance } from "./enterprise-governance.js";
import { loadDmsUsers } from "./dms-users.js";
import { loadDmsGuide } from "./dms-guide.js";

let activeModule = "search";
let enterpriseBound = false;

function sendEnterpriseAuth() {
  const frame = document.getElementById("enterpriseFrame");
  const token = localStorage.getItem("adse_auth_token");
  if (!frame?.contentWindow || !token) return;
  frame.contentWindow.postMessage({ type: "smorx-auth", token }, location.origin);
}

function connectEnterpriseFrame() {
  const frame = document.getElementById("enterpriseFrame");
  if (!frame) return;
  if (!enterpriseBound) {
    enterpriseBound = true;
    window.addEventListener("message", (event) => {
      if (event.origin !== location.origin) return;
      if (event.data?.type !== "enterprise-ready") return;
      sendEnterpriseAuth();
    });
    frame.addEventListener("load", sendEnterpriseAuth);
  }
  if (!frame.getAttribute("src")) {
    frame.src = "/enterprise/index.html?embed=1";
  } else {
    sendEnterpriseAuth();
  }
}

export function getActiveDmsModule() {
  return activeModule;
}

export function switchDmsModule(moduleId) {
  const allowed = ["search", "version", "analytics", "governance", "enterprise", "users", "guide"];
  if (!allowed.includes(moduleId)) return;
  activeModule = moduleId;

  const shell = document.getElementById("appShell");
  const searchView = document.getElementById("dmsSearchView");
  const versionView = document.getElementById("dmsVersionView");
  const analyticsView = document.getElementById("dmsAnalyticsView");
  const governanceView = document.getElementById("dmsGovernanceView");
  const enterpriseView = document.getElementById("dmsEnterpriseView");
  const usersView = document.getElementById("dmsUsersView");
  const guideView = document.getElementById("dmsGuideView");
  const searchSidebar = document.getElementById("searchSidebarExtras");
  const chatPanel = document.querySelector(".chat-panel");
  const topbarSearch = document.querySelector(".topbar-search-row");
  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");
  const pageBreadcrumb = document.getElementById("pageBreadcrumb");
  const appTitle = document.querySelector(".app-title");
  const loginDetailsBtn = document.getElementById("sidebarLoginDetailsBtn");

  document.querySelectorAll(".dms-module-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.dmsModule === moduleId);
  });
  loginDetailsBtn?.classList.toggle("active", moduleId === "users");
  window.syncSuperAdminUi?.();

  const hideAll = () => {
    searchView?.classList.add("dms-hidden");
    versionView?.classList.add("dms-hidden");
    analyticsView?.classList.add("dms-hidden");
    governanceView?.classList.add("dms-hidden");
    enterpriseView?.classList.add("dms-hidden");
    usersView?.classList.add("dms-hidden");
    guideView?.classList.add("dms-hidden");
  };

  shell?.classList.remove("dms-mode-version", "dms-mode-analytics", "dms-mode-governance", "dms-mode-enterprise", "dms-mode-users", "dms-mode-guide");

  if (moduleId === "search") {
    hideAll();
    searchView?.classList.remove("dms-hidden");
    searchSidebar?.classList.remove("dms-hidden");
    chatPanel?.classList.remove("dms-hidden");
    topbarSearch?.classList.remove("dms-hidden");
    if (appTitle) appTitle.textContent = "Document Management System";
    if (pageBreadcrumb) pageBreadcrumb.textContent = "Document Search";
    if (pageTitle) pageTitle.textContent = "Document Search";
    if (pageSubtitle) pageSubtitle.textContent = "Advanced full-text search with match scoring across all departments";
  } else if (moduleId === "version") {
    shell?.classList.add("dms-mode-version");
    hideAll();
    versionView?.classList.remove("dms-hidden");
    searchSidebar?.classList.add("dms-hidden");
    chatPanel?.classList.add("dms-hidden");
    topbarSearch?.classList.add("dms-hidden");
    if (appTitle) appTitle.textContent = "Document Management System";
    resetDocumentVersionSelection();
    loadDocumentVersionModule();
  } else if (moduleId === "governance") {
    shell?.classList.add("dms-mode-governance");
    hideAll();
    governanceView?.classList.remove("dms-hidden");
    searchSidebar?.classList.add("dms-hidden");
    chatPanel?.classList.add("dms-hidden");
    topbarSearch?.classList.add("dms-hidden");
    if (appTitle) appTitle.textContent = "Document Management System";
    if (pageBreadcrumb) pageBreadcrumb.textContent = "Enterprise Governance";
    if (pageTitle) pageTitle.textContent = "Enterprise Governance";
    if (pageSubtitle) pageSubtitle.textContent = "Policy management, retention schedules, and workflow automation";
    loadEnterpriseGovernance();
  } else if (moduleId === "enterprise") {
    shell?.classList.add("dms-mode-enterprise");
    hideAll();
    enterpriseView?.classList.remove("dms-hidden");
    searchSidebar?.classList.add("dms-hidden");
    chatPanel?.classList.add("dms-hidden");
    topbarSearch?.classList.add("dms-hidden");
    if (appTitle) appTitle.textContent = "Document Management System";
    connectEnterpriseFrame();
  } else if (moduleId === "users") {
    shell?.classList.add("dms-mode-users");
    hideAll();
    usersView?.classList.remove("dms-hidden");
    searchSidebar?.classList.add("dms-hidden");
    chatPanel?.classList.add("dms-hidden");
    topbarSearch?.classList.add("dms-hidden");
    if (appTitle) appTitle.textContent = "Document Management System";
    loadDmsUsers();
  } else if (moduleId === "guide") {
    shell?.classList.add("dms-mode-guide");
    hideAll();
    guideView?.classList.remove("dms-hidden");
    searchSidebar?.classList.add("dms-hidden");
    chatPanel?.classList.add("dms-hidden");
    topbarSearch?.classList.add("dms-hidden");
    if (appTitle) appTitle.textContent = "Document Management System";
    loadDmsGuide();
  } else {
    shell?.classList.add("dms-mode-analytics");
    hideAll();
    analyticsView?.classList.remove("dms-hidden");
    searchSidebar?.classList.add("dms-hidden");
    chatPanel?.classList.add("dms-hidden");
    topbarSearch?.classList.add("dms-hidden");
    if (appTitle) appTitle.textContent = "Document Management System";
    loadDmsAnalytics();
  }
}

export function openModuleAnalytics() {
  switchDmsModule("analytics");
}

export function initDmsNavigation(user) {
  initDocumentVersion(user);

  document.querySelectorAll(".dms-module-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchDmsModule(btn.dataset.dmsModule));
  });

  switchDmsModule("search");
}

window.switchDmsModule = switchDmsModule;
window.openModuleAnalytics = openModuleAnalytics;
