/**
 * Content Script for Google Classroom Attachment Downloader
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const VALID_EXTENSIONS = [
  'pptx', 'ppt', 'docx', 'doc', 'xlsx', 'xls',
  'pdf', 'txt', 'zip', 'rar', '7z',
  'jpg', 'jpeg', 'png', 'gif', 'bmp',
  'mp4', 'mp3', 'wav', 'avi', 'mov'
];

browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'SCAN_FILES') {
    try {
      const files = scanForFiles();
      const assignmentName = getAssignmentName();
      sendResponse({
        success: true,
        files,
        assignmentName,
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message,
        files: [],
        assignmentName: 'Classroom_Download',
      });
    }
  }
  return true;
});

function scanForFiles() {
  const files = [];
  const seenUrls = new Set();
  const links = document.querySelectorAll('a[href*="drive.google.com"], a[href*="docs.google.com"]');

  links.forEach((link) => {
    const url = link.href;
    if (!url || seenUrls.has(url)) return;
    if (isNavigationLink(url)) return;

    const filename = extractFilename(link);
    if (!hasValidExtension(filename)) return;

    seenUrls.add(url);
    files.push({ url, filename });
  });

  return files;
}

function isNavigationLink(url) {
  if (url.includes('/c/') && url.includes('/details')) return false;
  if (url.includes('/c/') && !url.includes('drive.google.com') && !url.includes('docs.google.com')) {
    return true;
  }
  return false;
}

function hasValidExtension(filename) {
  const lower = filename.toLowerCase();
  return VALID_EXTENSIONS.some((ext) => lower.endsWith('.' + ext));
}

function extractFilename(link) {
  let filename = '';
  const linkText = link.textContent || '';
  const lines = linkText.split(/[\n\r]/);
  filename = lines[0]?.trim() || '';

  filename = filename
    .replace(/Microsoft PowerPoint.*$/i, '')
    .replace(/Microsoft Word.*$/i, '')
    .replace(/Microsoft Excel.*$/i, '')
    .replace(/Google Docs.*$/i, '')
    .replace(/Google Sheets.*$/i, '')
    .replace(/Google Slides.*$/i, '')
    .trim();

  const extMatch = filename.match(/^(.+?\.(pptx?|docx?|xlsx?|pdf|txt|zip|rar|7z|jpe?g|png|gif|bmp|mp[34]|wav|avi|mov))/i);
  if (extMatch) {
    filename = extMatch[1];
  }

  filename = filename.replace(/\s+/g, ' ').trim();

  if (!filename || filename.length < 2) {
    filename = 'unknown_file';
  }

  return filename;
}

function getAssignmentName() {
  const titleSelectors = ['.YVvGBb', '.KPJZse', '.Qcpryb', '.p8Lhse', 'h1'];

  for (const selector of titleSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent?.trim()) {
      return element.textContent.trim();
    }
  }

  let pageTitle = document.title;
  pageTitle = pageTitle.replace(/ - Google Classroom$/i, '').trim();

  if (pageTitle.includes(' - ')) {
    pageTitle = pageTitle.split(' - ')[0].trim();
  }

  return pageTitle || 'Classroom_Download';
}