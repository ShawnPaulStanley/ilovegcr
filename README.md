# iloveGCR

A Chrome extension for downloading attachments from Google Classroom assignment pages.

## Features

- Download all attachments from Classroom with one click
- Preview files before downloading with checkbox selection
- Automatic folder organization by assignment name and timestamp
- Supports Google Drive files, Docs, Sheets, Slides, PDFs, and more
- Clean popup UI with Google Classroom styling

## Supported File Types

| Source | Export Format |
|--------|---------------|
| Google Docs | Word (.docx) |
| Google Sheets | Excel (.xlsx) |
| Google Slides | PowerPoint (.pptx) |
| Google Drive Files | Original format |
| PDFs, Images, Videos | Original format |

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the `google-classroom-downloader` folder

## Usage

1. Go to Google Classroom and open any assignment with attachments
2. Click the iloveGCR extension icon in your toolbar
3. Review the list of detected files
4. Check/uncheck files you want to download
5. Click **Download Selected**

Files are saved to: `Downloads/Classroom/<AssignmentName>_<Timestamp>/`

## Project Structure

```
google-classroom-downloader/
├── manifest.json      # Extension configuration
├── background.js      # Service worker for downloads
├── content.js         # Page scanning script
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic
├── icon128.png        # Extension icon
└── README.md
```

## Troubleshooting

**Extension not detecting files:**
- Make sure you're on a Google Classroom assignment page
- Reload the extension and refresh the Classroom page

**Downloads not working:**
- Check that Chrome isn't set to ask for download location
- Verify you're logged into the correct Google account

**Button shows "No files found":**
- The page may not have downloadable attachments
- Try the Refresh Page button

## Permissions

| Permission | Purpose |
|------------|---------|
| downloads | Save files to your computer |
| scripting | Scan page for attachments |
| activeTab | Access current tab content |

## Privacy

- Runs entirely in your browser
- No data collection or external servers
- Only accesses Classroom pages you visit

## License

MIT License

---

Not affiliated with Google. Google Classroom is a trademark of Google LLC.
