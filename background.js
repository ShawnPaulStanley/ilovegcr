/**
 * Background Service Worker for Google Classroom Attachment Downloader
 * 
 * This script handles download requests from the content script.
 * It uses the Chrome Downloads API to save files locally.
 */

// =============================================================================
// MESSAGE LISTENER
// =============================================================================

/**
 * Listen for messages from content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "DOWNLOAD_ATTACHMENTS") {
    handleDownloadRequest(message.attachments, message.assignmentName)
      .then((results) => sendResponse({ success: true, results }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    
    // Return true to indicate async response
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
  const folderName = sanitizeFolderName(assignmentName || "Classroom_Downloads");
  const timestamp = generateTimestamp();
  const sessionFolder = `${folderName}_${timestamp}`;
  
  console.log(`[ilovegcr] Starting download of ${attachments.length} files`);
  console.log(`[ilovegcr] Saving to folder: Classroom/${sessionFolder}/`);
  
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
 * Download a single file using Chrome Downloads API
 * @param {Object} attachment - {url, filename} object
 * @param {string} folderName - Sanitized folder name
 * @returns {Promise<number>} - Download ID
 */
function downloadFile(attachment, folderName) {
  return new Promise((resolve, reject) => {
    const sanitizedFilename = sanitizeFilename(attachment.filename, attachment.url);
    const fullPath = `Classroom/${folderName}/${sanitizedFilename}`;
    
    // Convert Google Drive/Docs URLs to direct download URLs
    const downloadUrl = convertToDownloadUrl(attachment.url);
    
    console.log(`[ilovegcr] Downloading to: ${fullPath}`);
    console.log(`[ilovegcr] From URL: ${downloadUrl}`);
    
    chrome.downloads.download(
      {
        url: downloadUrl,
        filename: fullPath,
        saveAs: false // Auto-save without prompt
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (downloadId === undefined) {
          reject(new Error("Download failed - no download ID returned"));
        } else {
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
 * Convert Google Drive/Docs URLs to direct download URLs
 * @param {string} url - Original URL
 * @returns {string} - Download-ready URL
 */
function convertToDownloadUrl(url) {
  // Google Drive file URL patterns
  // Pattern: https://drive.google.com/file/d/FILE_ID/view
  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([^\/]+)/);
  if (driveFileMatch) {
    const fileId = driveFileMatch[1];
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  
  // Google Drive open URL pattern
  // Pattern: https://drive.google.com/open?id=FILE_ID
  const driveOpenMatch = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (driveOpenMatch) {
    const fileId = driveOpenMatch[1];
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  
  // Google Docs - keep original format (docx)
  // Pattern: https://docs.google.com/document/d/DOC_ID/...
  const docsMatch = url.match(/docs\.google\.com\/document\/d\/([^\/]+)/);
  if (docsMatch) {
    const docId = docsMatch[1];
    return `https://docs.google.com/document/d/${docId}/export?format=docx`;
  }
  
  // Google Sheets - keep original format (xlsx)
  // Pattern: https://docs.google.com/spreadsheets/d/SHEET_ID/...
  const sheetsMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([^\/]+)/);
  if (sheetsMatch) {
    const sheetId = sheetsMatch[1];
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  }
  
  // Google Slides - keep original format (pptx)
  // Pattern: https://docs.google.com/presentation/d/SLIDES_ID/...
  const slidesMatch = url.match(/docs\.google\.com\/presentation\/d\/([^\/]+)/);
  if (slidesMatch) {
    const slidesId = slidesMatch[1];
    return `https://docs.google.com/presentation/d/${slidesId}/export/pptx`;
  }
  
  // Return original URL if no conversion needed (direct PDF links, etc.)
  return url;
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
// INITIALIZATION
// =============================================================================

console.log("[Classroom Downloader] Background service worker initialized");
