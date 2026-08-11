/**
 * Background Service Worker for Google Classroom Attachment Downloader
 * 
 * This script handles download requests from the content script.
 * It uses the Chrome Downloads API to save files locally.
 */

// Browser API compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// =============================================================================
// MESSAGE LISTENER
// =============================================================================

/**
 * Listen for messages from content scripts
 */
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "DOWNLOAD_ATTACHMENTS") {
    console.log("[ilovegcr] Received download request for", message.attachments.length, "files");
    handleDownloadRequest(message.attachments, message.assignmentName)
      .then((results) => {
        console.log("[ilovegcr] Download request completed successfully");
        sendResponse({ success: true, results });
      })
      .catch((error) => {
        console.error("[ilovegcr] Download request failed:", error);
        console.error("[ilovegcr] Error stack:", error.stack);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate async response
    return true;
  } else if (message.action === "GET_DOWNLOAD_PATH") {
    getDownloadPath()
      .then((path) => {
        console.log("[ilovegcr] Retrieved download path:", path);
        sendResponse({ path });
      })
      .catch((error) => {
        console.error("[ilovegcr] Failed to get download path:", error);
        sendResponse({ path: "Downloads" });
      });
    return true;
  } else if (message.action === "SET_DOWNLOAD_PATH") {
    console.log("[ilovegcr] Setting download path to:", message.path);
    setDownloadPath(message.path)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error("[ilovegcr] Failed to set download path:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// =============================================================================
// DOWNLOAD HANDLER
// =============================================================================

/**
 * Generate a timestamp string for unique folder naming
 * @returns {string} - Timestamp in format YYYY-MM-DD_HH-MM-SS
 */
function generateTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * Process and download all attachments
 * @param {Array} attachments - Array of {url, filename} objects
 * @param {string} assignmentName - Name of the assignment for folder organization
 * @returns {Promise<Array>} - Results of download attempts
 */
async function handleDownloadRequest(attachments, assignmentName) {
  const results = [];
  const downloadPath = await getDownloadPath();
  const folderName = sanitizeFolderName(assignmentName || "Classroom_Downloads");
  const timestamp = generateTimestamp();
  const sessionFolder = `${folderName}_${timestamp}`;
  
  console.log(`[ilovegcr] Starting download of ${attachments.length} files`);
  console.log(`[ilovegcr] Saving to folder: ${downloadPath}/${sessionFolder}/`);
  
  for (const attachment of attachments) {
    try {
      const result = await downloadFile(attachment, sessionFolder);
      results.push({ url: attachment.url, success: true, downloadId: result });
      console.log(`[ilovegcr] Downloaded: ${attachment.filename}`);
    } catch (error) {
      results.push({ url: attachment.url, success: false, error: error.message });
      console.error(`[ilovegcr] Failed to download: ${attachment.filename}`, error);
    }
  }
  
  return results;
}

/**
 * Download a single file using fetch + blob approach
 * This ensures cookies are sent with the request
 * @param {Object} attachment - {url, filename} object
 * @param {string} folderName - Sanitized folder name
 * @returns {Promise<number>} - Download ID
 */
async function downloadFile(attachment, folderName) {
  const sanitizedFilename = sanitizeFilename(attachment.filename, attachment.url);
  const downloadPath = await getDownloadPath();
  const fullPath = `${downloadPath}/${folderName}/${sanitizedFilename}`;

  const downloadUrls = getDownloadUrlCandidates(attachment.url);

  console.log(`[ilovegcr] Downloading to: ${fullPath}`);

  let lastError = null;
  for (const downloadUrl of downloadUrls) {
    console.log(`[ilovegcr] Trying URL: ${downloadUrl}`);
    try {
      return await attemptDownloadFromUrl(downloadUrl, fullPath, sanitizedFilename);
    } catch (error) {
      lastError = error;
      console.warn(`[ilovegcr] URL failed, trying next candidate: ${error.message}`);
    }
  }

  throw lastError || new Error("All download URL candidates failed");
}

/**
 * Attempt to download one URL using fetch+blob, then direct download fallback
 */
async function attemptDownloadFromUrl(downloadUrl, fullPath, sanitizedFilename) {
  const isGoogleUrl = isGoogleDownloadUrl(downloadUrl);

  try {
    const response = await fetch(downloadUrl, {
      credentials: 'include',
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (isHtmlLikeResponse(contentType, response.url)) {
      const html = await response.text();
      const confirmedUrl = getDriveConfirmedDownloadUrl(html, response.url);
      if (confirmedUrl && confirmedUrl !== downloadUrl) {
        return await attemptDownloadFromUrl(confirmedUrl, fullPath, sanitizedFilename);
      }
      throw new Error('Received HTML page instead of file content');
    }

    const resolvedUrl = withSessionParams(response.url || downloadUrl, downloadUrl);
    return await directDownload(resolvedUrl, fullPath, sanitizedFilename);
  } catch (fetchError) {
    if (isGoogleUrl) {
      throw fetchError;
    }
  }

  return await directDownload(downloadUrl, fullPath, sanitizedFilename);
}

/**
 * Check whether URL points to Google Drive/Docs resources
 */
function isGoogleDownloadUrl(url) {
  return /https:\/\/(drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com)\//i.test(url);
}

/**
 * Detect if fetch response is likely an HTML page instead of actual file bytes
 */
function isHtmlLikeResponse(contentType, finalUrl) {
  if (contentType.includes('text/html')) return true;
  if (contentType.includes('application/xhtml+xml')) return true;
  if (/\/file\/d\//i.test(finalUrl) || /\/view/i.test(finalUrl)) return true;
  return false;
}

/**
 * Extract Google Drive confirm-download URL from warning/interstitial HTML
 */
function getDriveConfirmedDownloadUrl(html, baseUrl) {
  if (!html || !baseUrl) return null;

  try {
    const embeddedDownloadMatch = html.match(/"downloadUrl":"(https:[^"\\]*(?:\\\\\/[^"\\]*)*)"/i);
    if (embeddedDownloadMatch?.[1]) {
      const unescaped = embeddedDownloadMatch[1]
        .replace(/\\u003d/g, '=')
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/');
      return withSessionParams(unescaped, baseUrl);
    }

    const actionMatch = html.match(/action="([^"]*\/uc\?export=download[^"]*)"/i)
      || html.match(/href="([^"]*\/uc\?export=download[^"]*)"/i)
      || html.match(/href="([^"]*drive\.usercontent\.google\.com\/download[^\"]*)"/i)
      || html.match(/confirm=([0-9A-Za-z_\-]+).*?id=([0-9A-Za-z_\-]+)/is);

    if (!actionMatch) return null;

    if (actionMatch.length >= 3 && !actionMatch[1]?.startsWith('http')) {
      const confirm = actionMatch[1];
      const fileId = actionMatch[2];
      return withSessionParams(
        `https://drive.google.com/uc?export=download&confirm=${encodeURIComponent(confirm)}&id=${encodeURIComponent(fileId)}`,
        baseUrl
      );
    }

    const raw = actionMatch[1];
    const decoded = raw.replace(/&amp;/g, '&');
    return withSessionParams(new URL(decoded, baseUrl).toString(), baseUrl);
  } catch (error) {
    return null;
  }
}

/**
 * Preserve important Google session params like authuser/resourcekey.
 */
function withSessionParams(targetUrl, sourceUrl) {
  try {
    const source = new URL(sourceUrl);
    const target = new URL(targetUrl);
    const authuser = source.searchParams.get('authuser');
    const resourcekey = source.searchParams.get('resourcekey');

    if (authuser && !target.searchParams.has('authuser')) {
      target.searchParams.set('authuser', authuser);
    }
    if (resourcekey && !target.searchParams.has('resourcekey')) {
      target.searchParams.set('resourcekey', resourcekey);
    }
    return target.toString();
  } catch (error) {
    return targetUrl;
  }
}

/**
 * Direct download fallback when fetch doesn't work
 */
function directDownload(downloadUrl, fullPath, sanitizedFilename) {
  return new Promise((resolve, reject) => {
    browserAPI.downloads.download(
      {
        url: downloadUrl,
        filename: fullPath,
        saveAs: false
      },
      (downloadId) => {
        if (browserAPI.runtime.lastError) {
          console.error(`[ilovegcr] Direct download error: ${browserAPI.runtime.lastError.message}`);
          reject(new Error(browserAPI.runtime.lastError.message));
        } else if (downloadId === undefined) {
          reject(new Error("Download failed - check extension permissions"));
        } else {
          console.log(`[ilovegcr] Direct download started with ID: ${downloadId}`);
          resolve(downloadId);
        }
      }
    );
  });
}

// =============================================================================
// URL CONVERSION UTILITIES
// =============================================================================

/**
 * Build URL candidates for downloading Google Drive/Docs files.
 * Keep original URL first because it preserves account/session-specific query params.
 * @param {string} url - Original URL
 * @returns {string[]} - Ordered URL candidates
 */
function getDownloadUrlCandidates(url) {
  const candidates = [];
  const seen = new Set();

  function addCandidate(candidateUrl) {
    if (candidateUrl && !seen.has(candidateUrl)) {
      seen.add(candidateUrl);
      candidates.push(candidateUrl);
    }
  }

  addCandidate(url);

  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([^\/?#]+)/);
  const driveOpenMatch = url.match(/[?&]id=([^&#]+)/);
  const driveId = driveFileMatch?.[1] || driveOpenMatch?.[1];

  if (driveId) {
    let resourceKey = "";
    let authUser = "";
    try {
      const parsed = new URL(url);
      resourceKey = parsed.searchParams.get('resourcekey') || "";
      authUser = parsed.searchParams.get('authuser') || "";
    } catch (error) {
      resourceKey = "";
      authUser = "";
    }

    const resourceParam = resourceKey ? `&resourcekey=${encodeURIComponent(resourceKey)}` : "";
    const authUserParam = authUser ? `&authuser=${encodeURIComponent(authUser)}` : "";
    addCandidate(`https://drive.google.com/uc?export=download&id=${driveId}${resourceParam}${authUserParam}`);
    addCandidate(`https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t${resourceParam}${authUserParam}`);
  }

  const docsMatch = url.match(/docs\.google\.com\/document\/d\/([^\/]+)/);
  if (docsMatch) {
    const docId = docsMatch[1];
    addCandidate(`https://docs.google.com/document/d/${docId}/export?format=docx`);
  }

  const sheetsMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([^\/]+)/);
  if (sheetsMatch) {
    const sheetId = sheetsMatch[1];
    addCandidate(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`);
  }

  const slidesMatch = url.match(/docs\.google\.com\/presentation\/d\/([^\/]+)/);
  if (slidesMatch) {
    const slidesId = slidesMatch[1];
    addCandidate(`https://docs.google.com/presentation/d/${slidesId}/export/pptx`);
  }

  return candidates;
}

// =============================================================================
// SANITIZATION UTILITIES
// =============================================================================

/**
 * Sanitize folder name for file system compatibility
 * @param {string} name - Original folder name
 * @returns {string} - Sanitized folder name
 */
function sanitizeFolderName(name) {
  if (!name || name.length === 0) {
    return "Classroom_Download";
  }
  
  return name
    .replace(/[<>:"/\\|?*]/g, " ")  // Replace invalid characters with space
    .replace(/\s+/g, " ")           // Normalize multiple spaces
    .trim()                          // Trim leading/trailing spaces
    .substring(0, 100)              // Limit length
    || "Classroom_Download";
}

/**
 * Sanitize filename for file system compatibility
 * @param {string} filename - Original filename
 * @param {string} url - The URL (to determine extension if needed)
 * @returns {string} - Sanitized filename
 */
function sanitizeFilename(filename, url = "") {
  // Check if filename already has an extension
  const hasExtension = /\.[a-zA-Z0-9]{2,5}$/.test(filename);
  
  // Extract extension if present
  let ext = "";
  let nameWithoutExt = filename;
  
  if (hasExtension) {
    const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
    ext = extMatch ? extMatch[0] : "";
    nameWithoutExt = ext ? filename.slice(0, -ext.length) : filename;
  } else {
    // Add extension based on URL type
    if (url.includes("docs.google.com/document")) {
      ext = ".docx";
    } else if (url.includes("docs.google.com/spreadsheets")) {
      ext = ".xlsx";
    } else if (url.includes("docs.google.com/presentation")) {
      ext = ".pptx";
    } else if (url.includes("drive.google.com")) {
      // For Drive files, try to detect from filename or leave as is
      ext = "";
    }
  }
  
  const sanitizedName = nameWithoutExt
    .replace(/[<>:"/\\|?*]/g, "_")  // Replace invalid characters
    .replace(/\s+/g, " ")           // Normalize spaces (keep single spaces)
    .replace(/^[\s._]+|[\s._]+$/g, "") // Trim leading/trailing spaces, dots, underscores
    .substring(0, 200)              // Limit length
    || "unnamed_file";
  
  return sanitizedName + ext;
}

// =============================================================================
// STORAGE UTILITIES
// =============================================================================

/**
 * Get the current download path from storage
 * @returns {Promise<string>} - Download path
 */
function getDownloadPath() {
  return new Promise((resolve) => {
    browserAPI.storage.sync.get({ downloadPath: "Downloads" }, (result) => {
      resolve(result.downloadPath || "Downloads");
    });
  });
}

/**
 * Set the download path in storage
 * @param {string} path - New download path
 * @returns {Promise<void>}
 */
function setDownloadPath(path) {
  return new Promise((resolve) => {
    browserAPI.storage.sync.set({ downloadPath: path }, () => {
      console.log(`[ilovegcr] Download path updated to: ${path}`);
      resolve();
    });
  });
}

// =============================================================================
// INITIALIZATION
// =============================================================================

console.log("[Classroom Downloader] Background service worker initialized");
