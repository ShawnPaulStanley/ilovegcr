/**
 * Popup Script for Google Classroom Attachment Downloader
 * Handles the popup UI and communication with content script
 */

// Valid file extensions to download
const VALID_EXTENSIONS = [
  '.pptx', '.ppt', '.docx', '.doc', '.xlsx', '.xls',
  '.pdf', '.txt', '.zip', '.rar', '.7z',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp',
  '.mp4', '.mp3', '.wav', '.avi', '.mov'
];

let detectedFiles = [];
let assignmentName = "";

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Check if on Classroom
  if (!tab.url || !tab.url.includes('classroom.google.com')) {
    showNotClassroom();
    loadDownloadPath();
    return;
  }
  
  // Request files from content script
  scanForFiles(tab.id);
  
  // Set up button handlers
  document.getElementById('selectAll').addEventListener('click', selectAll);
  document.getElementById('deselectAll').addEventListener('click', deselectAll);
  document.getElementById('refreshBtn').addEventListener('click', () => refreshPage(tab.id));
  document.getElementById('downloadBtn').addEventListener('click', downloadSelected);
  document.getElementById('savePathBtn').addEventListener('click', saveDownloadPath);
  
  // Load current download path
  loadDownloadPath();
});

// Store tabId globally for refresh
let currentTabId = null;

/**
 * Request content script to scan for files
 */
async function scanForFiles(tabId) {
  currentTabId = tabId;
  showLoading();
  
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: "SCAN_FILES" });
    
    if (response && response.success) {
      detectedFiles = response.files || [];
      assignmentName = response.assignmentName || "Classroom_Download";
      
      // Filter to only valid file extensions
      detectedFiles = detectedFiles.filter(file => {
        const filename = file.filename.toLowerCase();
        return VALID_EXTENSIONS.some(ext => filename.includes(ext));
      });
      
      if (detectedFiles.length > 0) {
        showFileList();
      } else {
        showEmpty();
      }
    } else {
      showEmpty();
    }
  } catch (error) {
    console.error("Error scanning files:", error);
    showEmpty();
  }
}

/**
 * Show loading state
 */
function showLoading() {
  document.getElementById('loading').style.display = 'block';
  document.getElementById('fileListContainer').style.display = 'none';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('notClassroom').style.display = 'none';
  updateStatus('Scanning page for files...', '');
}

/**
 * Show not classroom state
 */
function showNotClassroom() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('fileListContainer').style.display = 'none';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('notClassroom').style.display = 'block';
  updateStatus('Please open Google Classroom', 'error');
}

/**
 * Show empty state
 */
function showEmpty() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('fileListContainer').style.display = 'none';
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('notClassroom').style.display = 'none';
  updateStatus('No downloadable files found', '');
}

/**
 * Show file list
 */
function showFileList() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('fileListContainer').style.display = 'block';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('notClassroom').style.display = 'none';
  
  updateStatus(`<div class="assignment-name"><svg viewBox="0 0 256 256"><path d="M251.76,88.94l-120-64a8,8,0,0,0-7.52,0l-120,64a8,8,0,0,0,0,14.12L32,117.87v48.42a15.91,15.91,0,0,0,4.06,10.65C49.16,191.53,78.51,216,128,216a130.36,130.36,0,0,0,48-8.76V240a8,8,0,0,0,16,0V199.51a115.63,115.63,0,0,0,27.94-22.57A15.91,15.91,0,0,0,224,166.29V117.87l27.76-14.81a8,8,0,0,0,0-14.12ZM128,200c-43.27,0-68.72-21.14-80-33.71V126.4l76.24,40.66a8,8,0,0,0,7.52,0L176,143.47v46.34C163.4,195.69,147.52,200,128,200Zm80-33.75a97.83,97.83,0,0,1-16,14.25V134.93l16-8.53ZM188,118.94l-.22-.13-56-29.87a8,8,0,0,0-7.52,14.12L171,128l-43,22.93L25,96,128,41.07,231,96Z"/></svg>${escapeHtml(assignmentName)}</div><div class="file-count">${detectedFiles.length} file(s) found</div>`, 'success');
  
  renderFileList();
}

/**
 * Render the file list
 */
function renderFileList() {
  const container = document.getElementById('fileList');
  container.innerHTML = '';
  
  detectedFiles.forEach((file, index) => {
    const ext = getExtension(file.filename);
    const iconClass = getIconClass(ext);
    
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <input type="checkbox" id="file-${index}" checked data-index="${index}">
      <div class="file-icon ${iconClass}">${ext.toUpperCase()}</div>
      <div class="file-info">
        <div class="file-name" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</div>
        <div class="file-type">${getFileTypeName(ext)}</div>
      </div>
    `;
    
    container.appendChild(item);
  });
  
  updateDownloadButton();
  
  // Add change listeners
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateDownloadButton);
  });
}

/**
 * Get file extension
 */
function getExtension(filename) {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : 'file';
}

/**
 * Get icon class based on extension
 */
function getIconClass(ext) {
  if (['ppt', 'pptx'].includes(ext)) return 'pptx';
  if (['doc', 'docx'].includes(ext)) return 'docx';
  if (['xls', 'xlsx'].includes(ext)) return 'xlsx';
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) return 'img';
  if (['mp4', 'avi', 'mov'].includes(ext)) return 'video';
  if (['mp3', 'wav'].includes(ext)) return 'audio';
  if (['zip', 'rar', '7z'].includes(ext)) return 'archive';
  return 'other';
}

/**
 * Get human-readable file type name
 */
function getFileTypeName(ext) {
  const types = {
    'pptx': 'PowerPoint Presentation',
    'ppt': 'PowerPoint Presentation',
    'docx': 'Word Document',
    'doc': 'Word Document',
    'xlsx': 'Excel Spreadsheet',
    'xls': 'Excel Spreadsheet',
    'pdf': 'PDF Document',
    'txt': 'Text File',
    'zip': 'ZIP Archive',
    'rar': 'RAR Archive',
    'jpg': 'JPEG Image',
    'jpeg': 'JPEG Image',
    'png': 'PNG Image',
    'gif': 'GIF Image',
    'mp4': 'MP4 Video',
    'mp3': 'MP3 Audio',
  };
  return types[ext] || 'File';
}

/**
 * Update status bar
 */
function updateStatus(html, type) {
  const status = document.getElementById('status');
  status.innerHTML = html;
  status.className = 'status' + (type ? ` ${type}` : '');
}

/**
 * Select all files
 */
function selectAll() {
  document.querySelectorAll('#fileList input[type="checkbox"]').forEach(cb => {
    cb.checked = true;
  });
  updateDownloadButton();
}

/**
 * Deselect all files
 */
function deselectAll() {
  document.querySelectorAll('#fileList input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });
  updateDownloadButton();
}

/**
 * Update download button text
 */
function updateDownloadButton() {
  const checked = document.querySelectorAll('#fileList input[type="checkbox"]:checked').length;
  const btn = document.getElementById('downloadBtn');
  btn.textContent = `Download Selected (${checked})`;
  btn.disabled = checked === 0;
}

/**
 * Download selected files
 */
async function downloadSelected() {
  const checkboxes = document.querySelectorAll('#fileList input[type="checkbox"]:checked');
  const filesToDownload = [];
  
  checkboxes.forEach(cb => {
    const index = parseInt(cb.dataset.index);
    if (detectedFiles[index]) {
      filesToDownload.push(detectedFiles[index]);
    }
  });
  
  if (filesToDownload.length === 0) return;
  
  const btn = document.getElementById('downloadBtn');
  btn.disabled = true;
  btn.textContent = 'Downloading...';
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: "DOWNLOAD_ATTACHMENTS",
      attachments: filesToDownload,
      assignmentName: assignmentName
    });
    
    if (response.success) {
      const successCount = response.results.filter(r => r.success).length;
      updateStatus(`Downloaded ${successCount}/${filesToDownload.length} files successfully`, 'success');
    } else {
      updateStatus(`Download failed: ${response.error}`, 'error');
    }
  } catch (error) {
    updateStatus(`Error: ${error.message}`, 'error');
  }
  
  btn.disabled = false;
  updateDownloadButton();
}

/**
 * Refresh the current page
 */
function refreshPage(tabId) {
  chrome.tabs.reload(tabId);
  window.close();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
/**
 * Load and display the current download path
 */
async function loadDownloadPath() {
  try {
    const response = await chrome.runtime.sendMessage({ action: "GET_DOWNLOAD_PATH" });
    const pathInput = document.getElementById('downloadPath');
    if (pathInput) {
      pathInput.value = response.path || "Classroom";
    }
  } catch (error) {
    console.error("Error loading download path:", error);
  }
}

/**
 * Save the new download path
 */
async function saveDownloadPath() {
  const pathInput = document.getElementById('downloadPath');
  const statusDiv = document.getElementById('pathStatus');
  const newPath = pathInput.value.trim();
  
  if (!newPath) {
    statusDiv.textContent = "Path cannot be empty";
    statusDiv.style.color = "#c5221f";
    return;
  }
  
  try {
    await chrome.runtime.sendMessage({ 
      action: "SET_DOWNLOAD_PATH", 
      path: newPath 
    });
    statusDiv.textContent = "✓ Path saved successfully";
    statusDiv.style.color = "#137333";
    setTimeout(() => {
      statusDiv.textContent = "";
    }, 3000);
  } catch (error) {
    console.error("Error saving download path:", error);
    statusDiv.textContent = "Error saving path";
    statusDiv.style.color = "#c5221f";
  }
}