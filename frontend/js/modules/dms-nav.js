import { initDocumentVersion, loadDocumentVersionModule, resetDocumentVersionSelection } from "./document-version.js";
import { loadDmsAnalytics } from "./dms-analytics.js";
import { loadEnterpriseGovernance } from "./enterprise-governance.js";

let activeModule = "search";

export function getActiveDmsModule() {
  return activeModule;
}

export function switchDmsModule(moduleId) {
  const allowed = ["search", "version", "analytics", "governance"];
  if (!allowed.includes(moduleId)) return;
  activeModule = moduleId;

  const shell = document.getElementById("appShell");
  const searchView = document.getElementById("dmsSearchView");
  const versionView = document.getElementById("dmsVersionView");
  const analyticsView = document.getElementById("dmsAnalyticsView");
  const governanceView = document.getElementById("dmsGovernanceView");
  const searchSidebar = document.getElementById("searchSidebarExtras");
  const chatPanel = document.querySelector(".chat-panel");
  const topbarSearch = document.querySelector(".topbar-search-row");
  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");
  const pageBreadcrumb = document.getElementById("pageBreadcrumb");
  const appTitle = document.querySelector(".app-title");

  document.querySelectorAll(".dms-module-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.dmsModule === moduleId);
  });

  const hideAll = () => {
    searchView?.classList.add("dms-hidden");
    versionView?.classList.add("dms-hidden");
    analyticsView?.classList.add("dms-hidden");
    governanceView?.classList.add("dms-hidden");
  };

  shell?.classList.remove("dms-mode-version", "dms-mode-analytics", "dms-mode-governance");

  if (moduleId === "search") {
    hideAll();
    searchView?.classList.remove("dms-hidden");
    searchSidebar?.classList.remove("dms-hidden");
    chatPanel?.classList.remove("dms-hidden");
    topbarSearch?.classList.remove("dms-hidden");
    if (appTitle) appTitle.textContent = "Advance Directory Search Engine";
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
