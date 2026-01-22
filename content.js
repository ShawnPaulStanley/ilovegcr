/**
 * Content Script for Google Classroom Attachment Downloader
 * 
 * This script runs on Google Classroom pages to:
 * 1. Scan for downloadable file attachments
 * 2. Respond to popup requests for file list
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

// Valid file extensions we want to download
const VALID_EXTENSIONS = [
  'pptx', 'ppt', 'docx', 'doc', 'xlsx', 'xls',
  'pdf', 'txt', 'zip', 'rar', '7z',
  'jpg', 'jpeg', 'png', 'gif', 'bmp',
  'mp4', 'mp3', 'wav', 'avi', 'mov'
];

// =============================================================================
// MESSAGE LISTENER - Respond to popup requests
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SCAN_FILES") {
    console.log("[Classroom Downloader] Scanning for files...");
    
    const files = scanForFiles();
    const assignmentName = getAssignmentName();
    
    console.log("[Classroom Downloader] Found files:", files);
    console.log("[Classroom Downloader] Assignment name:", assignmentName);
    
    sendResponse({
      success: true,
      files: files,
      assignmentName: assignmentName
    });
  }
  return true;
});

// =============================================================================
// FILE SCANNING
// =============================================================================

/**
 * Scan the page for downloadable files
 * Only returns files with valid extensions
 */
function scanForFiles() {
  const files = [];
  const seenUrls = new Set();
  
  // Find all links that could be attachments
  const links = document.querySelectorAll('a[href*="drive.google.com"], a[href*="docs.google.com"]');
  
  links.forEach(link => {
    const url = link.href;
    if (!url || seenUrls.has(url)) return;
    
    // Skip navigation links
    if (isNavigationLink(url)) return;
    
    // Get the filename from the link
    const filename = extractFilename(link);
    
    // Only include files with valid extensions
    if (!hasValidExtension(filename)) {
      console.log("[Classroom Downloader] Skipping (no valid extension):", filename);
      return;
    }
    
    seenUrls.add(url);
    files.push({ url, filename });
    
    console.log("[Classroom Downloader] Found file:", filename);
  });
  
  return files;
}

/**
 * Check if URL is a navigation link (not a file)
 */
function isNavigationLink(url) {
  // Skip classroom internal navigation
  if (url.includes('/c/') && url.includes('/details')) return false; // Allow detail pages
  if (url.includes('/c/') && !url.includes('drive.google.com') && !url.includes('docs.google.com')) {
    return true;
  }
  return false;
}

/**
 * Check if filename has a valid extension
 */
function hasValidExtension(filename) {
  const lower = filename.toLowerCase();
  return VALID_EXTENSIONS.some(ext => lower.endsWith('.' + ext));
}

/**
 * Extract filename from a link element
 */
function extractFilename(link) {
  let filename = "";
  
  // Method 1: Get the link text (first line only, before any subtitle)
  const linkText = link.textContent || "";
  const lines = linkText.split(/[\n\r]/);
  filename = lines[0]?.trim() || "";
  
  // Clean up: Remove common subtitle patterns
  filename = filename
    .replace(/Microsoft PowerPoint.*$/i, "")
    .replace(/Microsoft Word.*$/i, "")
    .replace(/Microsoft Excel.*$/i, "")
    .replace(/Google Docs.*$/i, "")
    .replace(/Google Sheets.*$/i, "")
    .replace(/Google Slides.*$/i, "")
    .trim();
  
  // If filename has extension followed by junk, extract just up to extension
  const extMatch = filename.match(/^(.+?\.(pptx?|docx?|xlsx?|pdf|txt|zip|rar|7z|jpe?g|png|gif|bmp|mp[34]|wav|avi|mov))/i);
  if (extMatch) {
    filename = extMatch[1];
  }
  
  // Method 2: Try to get from parent card's title element
  if (!filename || filename.length < 2) {
    const card = link.closest('.asCOqd, .vwNuXe, .LYrz1b, .WdRoE');
    if (card) {
      const titleEl = card.querySelector('.yzJ8Vb, .onkcGd, .OYqtGe');
      if (titleEl) {
        filename = titleEl.textContent?.trim().split(/[\n\r]/)[0] || "";
      }
    }
  }
  
  // Method 3: Try to get from link title/aria-label
  if (!filename || filename.length < 2) {
    filename = link.getAttribute("title") || link.getAttribute("aria-label") || "";
    filename = filename.split(/[\n\r]/)[0]?.trim() || "";
  }
  
  // Final cleanup
  filename = filename.replace(/\s+/g, " ").trim();
  
  // If still no filename, generate a placeholder (will be filtered out later)
  if (!filename || filename.length < 2) {
    filename = "unknown_file";
  }
  
  return filename;
}

// =============================================================================
// ASSIGNMENT NAME
// =============================================================================

/**
 * Get the assignment/material name for folder organization
 */
function getAssignmentName() {
  // Try specific selectors for the title
  const titleSelectors = [
    '.YVvGBb',       // Main title
    '.KPJZse',       // Title variant
    '.Qcpryb',       // Another title
    '.p8Lhse',       // Post title
    'h1',            // Generic h1
  ];
  
  for (const selector of titleSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent?.trim()) {
      const name = element.textContent.trim();
      console.log("[Classroom Downloader] Found assignment name:", name);
      return name;
    }
  }
  
  // Fallback to page title
  let pageTitle = document.title;
  pageTitle = pageTitle.replace(/ - Google Classroom$/i, "").trim();
  
  // Extract just the assignment part if there's a separator
  if (pageTitle.includes(" - ")) {
    pageTitle = pageTitle.split(" - ")[0].trim();
  }
  
  console.log("[Classroom Downloader] Using page title:", pageTitle);
  return pageTitle || "Classroom_Download";
}

// =============================================================================
// INITIALIZATION
// =============================================================================

console.log("[Classroom Downloader] Content script loaded on:", window.location.href);
