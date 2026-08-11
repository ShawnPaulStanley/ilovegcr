const VALID_EXTENSIONS = [
  '.pptx', '.ppt', '.docx', '.doc', '.xlsx', '.xls',
  '.pdf', '.txt', '.zip', '.rar', '.7z',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp',
  '.mp4', '.mp3', '.wav', '.avi', '.mov'
];

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

let detectedFiles = [];
let assignmentName = '';
let currentTabId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });

  document.getElementById('selectAll').addEventListener('click', selectAll);
  document.getElementById('deselectAll').addEventListener('click', deselectAll);
  document.getElementById('refreshBtn').addEventListener('click', () => refreshPage(tab.id));
  document.getElementById('downloadBtn').addEventListener('click', downloadSelected);
  document.getElementById('savePathBtn').addEventListener('click', saveDownloadPath);

  loadDownloadPath();

  if (!tab.url || !tab.url.includes('classroom.google.com')) {
    showNotClassroom();
    return;
  }

  scanForFiles(tab.id);
});

async function scanForFiles(tabId) {
  currentTabId = tabId;
  showLoading();

  try {
    const response = await browserAPI.tabs.sendMessage(tabId, { action: 'SCAN_FILES' });

    if (response && response.success) {
      detectedFiles = (response.files || []).filter((file) => {
        const filename = (file.filename || '').toLowerCase();
        return VALID_EXTENSIONS.some((ext) => filename.endsWith(ext));
      });
      assignmentName = response.assignmentName || 'Classroom_Download';

      if (detectedFiles.length > 0) {
        showFileList();
      } else {
        showEmpty();
      }
    } else {
      showEmpty();
    }
  } catch (error) {
    try {
      if (browserAPI.scripting && browserAPI.scripting.executeScript) {
        await browserAPI.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        setTimeout(() => scanForFiles(tabId), 500);
        return;
      }
    } catch (injectError) {
      console.error('[ilovegcr] Failed to inject content script:', injectError);
    }

    showEmpty();
  }
}

function showLoading() {
  document.getElementById('loading').style.display = 'block';
  document.getElementById('fileListContainer').style.display = 'none';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('notClassroom').style.display = 'none';
  updateStatus('Scanning page for files...', '');
}

function showNotClassroom() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('fileListContainer').style.display = 'none';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('notClassroom').style.display = 'block';
  updateStatus('Please open Google Classroom', 'error');
}

function showEmpty() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('fileListContainer').style.display = 'none';
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('notClassroom').style.display = 'none';
  updateStatus('No downloadable files found', '');
}

function showFileList() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('fileListContainer').style.display = 'block';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('notClassroom').style.display = 'none';
  renderFileList();
  updateStatus(`<div class="assignment-name">${escapeHtml(assignmentName)}</div><div class="file-count">${detectedFiles.length} file(s) found</div>`, '');
}

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
  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', updateDownloadButton);
  });
}

function getExtension(filename) {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : 'file';
}

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

function getFileTypeName(ext) {
  const types = {
    pptx: 'PowerPoint Presentation',
    ppt: 'PowerPoint Presentation',
    docx: 'Word Document',
    doc: 'Word Document',
    xlsx: 'Excel Spreadsheet',
    xls: 'Excel Spreadsheet',
    pdf: 'PDF Document',
    txt: 'Text File',
    zip: 'ZIP Archive',
    rar: 'RAR Archive',
    jpg: 'JPEG Image',
    jpeg: 'JPEG Image',
    png: 'PNG Image',
    gif: 'GIF Image',
    mp4: 'MP4 Video',
    mp3: 'MP3 Audio',
  };
  return types[ext] || 'File';
}

function updateStatus(html, type) {
  const status = document.getElementById('status');
  status.innerHTML = html;
  status.className = 'status' + (type ? ` ${type}` : '');
}

function selectAll() {
  document.querySelectorAll('#fileList input[type="checkbox"]').forEach((cb) => {
    cb.checked = true;
  });
  updateDownloadButton();
}

function deselectAll() {
  document.querySelectorAll('#fileList input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
  });
  updateDownloadButton();
}

function updateDownloadButton() {
  const checked = document.querySelectorAll('#fileList input[type="checkbox"]:checked').length;
  const btn = document.getElementById('downloadBtn');
  btn.textContent = `Download Selected (${checked})`;
  btn.disabled = checked === 0;
}

async function downloadSelected() {
  const checkboxes = document.querySelectorAll('#fileList input[type="checkbox"]:checked');
  const filesToDownload = [];

  checkboxes.forEach((cb) => {
    const index = parseInt(cb.dataset.index, 10);
    if (detectedFiles[index]) {
      filesToDownload.push(detectedFiles[index]);
    }
  });

  if (filesToDownload.length === 0) return;

  const btn = document.getElementById('downloadBtn');
  btn.disabled = true;
  btn.textContent = 'Downloading...';

  try {
    const response = await browserAPI.runtime.sendMessage({
      action: 'DOWNLOAD_ATTACHMENTS',
      attachments: filesToDownload,
      assignmentName,
    });

    if (response.success) {
      const successCount = response.results.filter((result) => result.success).length;
      const failedCount = filesToDownload.length - successCount;
      if (failedCount > 0) {
        console.error('[ilovegcr] Failed downloads:', response.results.filter((result) => !result.success));
      }
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

function refreshPage(tabId) {
  browserAPI.tabs.reload(tabId);
  window.close();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadDownloadPath() {
  try {
    const response = await browserAPI.runtime.sendMessage({ action: 'GET_DOWNLOAD_PATH' });
    const pathInput = document.getElementById('downloadPath');
    const pathStatus = document.getElementById('pathStatus');
    if (pathInput) {
      pathInput.value = response.path || 'Downloads';
    }
    if (pathStatus) {
      pathStatus.textContent = `Current path: ${response.path || 'Downloads'}`;
    }
  } catch (error) {
    console.error('[ilovegcr] Error loading download path:', error);
  }
}

async function saveDownloadPath() {
  const pathInput = document.getElementById('downloadPath');
  const statusDiv = document.getElementById('pathStatus');
  const newPath = (pathInput.value || '').trim();

  if (!newPath) {
    statusDiv.textContent = 'Path cannot be empty';
    statusDiv.style.color = '#c5221f';
    return;
  }

  try {
    await browserAPI.runtime.sendMessage({ action: 'SET_DOWNLOAD_PATH', path: newPath });
    statusDiv.textContent = '✓ Path saved successfully';
    statusDiv.style.color = '#137333';
    setTimeout(() => {
      statusDiv.textContent = '';
    }, 3000);
  } catch (error) {
    statusDiv.textContent = 'Error saving path';
    statusDiv.style.color = '#c5221f';
  }
}
