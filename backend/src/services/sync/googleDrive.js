function mimeToType(mime) {
  if (!mime) return "other";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("word") || mime.includes("document")) return "docx";
  if (mime.includes("sheet") || mime.includes("excel")) return "xlsx";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "pptx";
  if (mime.includes("dwg") || mime.includes("autocad")) return "dwg";
  if (mime.includes("image")) return "image";
  return "other";
}

function formatBytes(b) {
  if (!b) return "";
  if (b > 1e6) return (b / 1e6).toFixed(1) + " MB";
  return (b / 1e3).toFixed(0) + " KB";
}

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/invoice|bill|finance|budget|revenue/.test(n)) return "finance";
  if (/hr|employee|handbook|policy/.test(n)) return "hr";
  if (/logistic|shipment|freight|warehouse/.test(n)) return "logistics";
  if (/cad|dwg|inspection|drawing|engineering/.test(n)) return "engineering";
  return "other";
}

function mapFiles(files) {
  return (files || []).map((f) => ({
    title: f.name,
    description: f.description || `Synced from Google Drive: ${f.name}`,
    content: `${f.name} ${f.description || ""}`,
    url: f.webViewLink,
    source: "google_drive",
    fileType: mimeToType(f.mimeType),
    category: guessCategory(f.name),
    size: formatBytes(Number(f.size)),
    addedAt: f.modifiedTime,
    tags: [],
  }));
}

async function syncGoogleDriveWithOAuth(tokens, folderId = "root") {
  const { google } = require("googleapis");
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials(tokens);
  const drive = google.drive({ version: "v3", auth });

  const { data } = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id,name,description,mimeType,size,modifiedTime,webViewLink)",
    pageSize: 200,
  });

  return mapFiles(data.files);
}

async function syncGoogleDrive(folderId) {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
    const { google } = require("googleapis");
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_PATH,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    const drive = google.drive({ version: "v3", auth });
    const { data } = await drive.files.list({
      q: `'${folderId || process.env.GOOGLE_DRIVE_FOLDER_ID || "root"}' in parents and trashed=false`,
      fields: "files(id,name,description,mimeType,size,modifiedTime,webViewLink)",
      pageSize: 200,
    });
    return mapFiles(data.files);
  }
  throw new Error("Connect Google Drive with Sign in with Google first");
}

module.exports = { syncGoogleDrive, syncGoogleDriveWithOAuth };
