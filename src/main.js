class DocsToNotionConverter {
    constructor() {
        this.CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        this.API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
        this.DISCOVERY_DOCS = [
            'https://docs.googleapis.com/$discovery/rest?version=v1',
            'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
        ];
        this.SCOPES = 'https://www.googleapis.com/auth/documents.readonly https://www.googleapis.com/auth/drive.readonly';

        this.form = document.getElementById('conversionForm');
        this.generateBtn = document.getElementById('generateBtn');
        this.spinner = document.getElementById('spinner');
        this.btnText = document.getElementById('btnText');
        this.status = document.getElementById('status');
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');

        this.gapi = null;
        this.isSignedIn = false;
        this.tokenClient = null;

        this.init();
    }

    async init() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.processDocument();
        });

        const radioButtons = document.querySelectorAll('input[name="sourceType"]');
        radioButtons.forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateUIForSourceType();
            });
        });

        await this.initializeGoogleAPI();
    }

    async initializeGoogleAPI() {
        try {
            if (!this.CLIENT_ID) {
                this.showConfigurationWarning();
                return;
            }

            if (!this.API_KEY) {
                this.showStatus('API Key is missing from configuration', 'error');
                return;
            }

            this.showStatus('🔧 Initializing Google API...', 'processing');
            
            await new Promise((resolve, reject) => {
                gapi.load('client', {
                    callback: resolve,
                    onerror: () => reject(new Error('Failed to load gapi.client'))
                });
            });

            try {
                await gapi.client.init({
                    apiKey: this.API_KEY,
                    discoveryDocs: this.DISCOVERY_DOCS
                });
            } catch (discoveryError) {
                await gapi.client.init({
                    apiKey: this.API_KEY
                });
                this.setupManualAPIs();
            }

            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.CLIENT_ID,
                scope: this.SCOPES,
                callback: (response) => {
                    if (response.access_token) {
                        gapi.client.setToken(response);
                        this.isSignedIn = true;
                        this.showStatus('✅ Signed in successfully', 'success');
                    }
                },
            });

            this.showStatus('Google API initialized', 'success');
            setTimeout(() => this.hideStatus(), 2000);

        } catch (error) {
            this.showStatus(`Failed to initialize Google API: ${error.message}`, 'error');
        }
    }

    setupManualAPIs() {
        if (!gapi.client.drive) {
            gapi.client.drive = {};
        }
        
        if (!gapi.client.drive.files) {
            gapi.client.drive.files = {};
        }
        
        gapi.client.drive.files.list = async (params) => {
            const queryParams = new URLSearchParams();
            
            if (params.q) queryParams.append('q', params.q);
            if (params.fields) queryParams.append('fields', params.fields);
            if (params.orderBy) queryParams.append('orderBy', params.orderBy);
            if (params.pageSize) queryParams.append('pageSize', params.pageSize);
            
            const url = `https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`;
            const token = gapi.client.getToken();
            
            if (!token || !token.access_token) {
                throw new Error('No access token available for Drive API request');
            }
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token.access_token}`,
                    'Content-Type': 'application/json',
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Drive API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
            }
            
            const data = await response.json();
            
            return {
                result: data,
                status: response.status,
                statusText: response.statusText
            };
        };
    }

    showConfigurationWarning() {
        this.showStatus('⚙️ Configuration needed: Please set up Google API credentials in your .env file', 'error');
        
        const configDiv = document.createElement('div');
        configDiv.className = 'auth-section';
        configDiv.style.display = 'block';
        configDiv.innerHTML = `
            <h4>🔧 Setup Required</h4>
            <p>To use the Google Docs API, you need to:</p>
            <ol>
                <li>Create a project in <a href="https://console.cloud.google.com" target="_blank">Google Cloud Console</a></li>
                <li>Enable the Google Docs API</li>
                <li>Create credentials (API Key and OAuth 2.0 Client ID)</li>
                <li>Add your credentials to a .env file:
                    <pre style="background: #f5f5f5; padding: 8px; margin: 8px 0; border-radius: 4px; font-size: 0.8rem;">
VITE_GOOGLE_CLIENT_ID=your_client_id_here
VITE_GOOGLE_API_KEY=your_api_key_here</pre>
                </li>
            </ol>
            <p style="margin-top: 12px;"><small>For now, the app will fall back to the original HTML parsing method.</small></p>
        `;
        
        this.status.appendChild(configDiv);
    }

    showDriveApiNotEnabledError() {
        this.showStatus('⚠️ Google Drive API needs to be enabled', 'error');
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'auth-section';
        errorDiv.style.display = 'block';
        errorDiv.innerHTML = `
            <h4>🔧 Drive API Setup Required</h4>
            <p>To use Google Drive folder functionality, you need to enable the Drive API:</p>
            <ol>
                <li>Go to <a href="https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=765380224910" target="_blank">Google Cloud Console - Drive API</a></li>
                <li>Click <strong>"Enable"</strong> to activate the Google Drive API</li>
                <li>Wait a few minutes for the changes to propagate</li>
                <li>Return here and try again</li>
            </ol>
            <div style="background: #e7f3ff; padding: 12px; margin: 12px 0; border-radius: 6px; border-left: 4px solid #2196f3;">
                <strong>Note:</strong> The Google Docs API is already enabled, so single document conversion still works normally.
            </div>
            <p style="margin-top: 12px;"><small>Once enabled, you'll be able to process entire Google Drive folders containing multiple documents.</small></p>
        `;
        
        this.status.innerHTML = '';
        this.status.appendChild(errorDiv);
        this.status.className = 'status error';
        this.status.style.display = 'block';
    }

    async signIn() {
        try {
            if (!this.tokenClient) {
                throw new Error('Token client not initialized');
            }
            
            return new Promise((resolve, reject) => {
                const originalCallback = this.tokenClient.callback;
                
                this.tokenClient.callback = (response) => {
                    if (response.access_token) {
                        gapi.client.setToken(response);
                        this.isSignedIn = true;
                        resolve(true);
                    } else if (response.error) {
                        reject(new Error(response.error));
                    } else {
                        reject(new Error('Authentication failed'));
                    }
                    
                    this.tokenClient.callback = originalCallback;
                };
                
                this.tokenClient.requestAccessToken();
            });
        } catch (error) {
            this.showStatus('Sign in failed', 'error');
            return false;
        }
    }

    updateUIForSourceType() {
        const sourceType = document.querySelector('input[name="sourceType"]:checked').value;
        const urlLabel = document.getElementById('urlLabel');
        const urlInput = document.getElementById('docUrl');
        const urlHint = document.getElementById('urlHint');

        if (sourceType === 'drive-folder') {
            urlLabel.textContent = 'Google Drive Folder Share Link';
            urlInput.placeholder = 'https://drive.google.com/drive/folders/...';
            urlHint.textContent = 'Paste your Google Drive folder share link here';
        } else {
            urlLabel.textContent = 'Google Docs Share Link (Edit/Comment)';
            urlInput.placeholder = 'https://docs.google.com/document/d/...';
            urlHint.textContent = 'Paste your Google Docs share link here';
        }
    }

    async processDocument() {
        const docUrl = document.getElementById('docUrl').value;
        const sourceType = document.querySelector('input[name="sourceType"]:checked').value;

        if (sourceType === 'drive-folder') {
            if (!this.validateGoogleDriveFolderUrl(docUrl)) {
                this.showStatus('Please enter a valid Google Drive folder share link', 'error');
                return;
            }
        } else {
            if (!this.validateGoogleDocsUrl(docUrl)) {
                this.showStatus('Please enter a valid Google Docs share link', 'error');
                return;
            }
        }

        try {
            this.setLoading(true);
            this.showProgress(0);

            if (sourceType === 'drive-folder') {
                if (!this.CLIENT_ID || !gapi.client) {
                    throw new Error('Google API configuration is required for folder processing. Please set up your Google API credentials.');
                }
                const folderId = this.extractFolderId(docUrl);
                await this.processFolderWithGoogleAPI(folderId);
            } else {
                const docId = this.extractDocId(docUrl);
                if (this.CLIENT_ID && gapi.client) {
                    await this.processWithGoogleAPI(docId);
                } else {
                    await this.processWithFallbackMethod(docId);
                }
            }

        } catch (error) {
            if (error.message === 'DRIVE_API_NOT_ENABLED') {
                this.showDriveApiNotEnabledError();
            } else {
                this.showStatus(`Error: ${error.message}`, 'error');
            }
        } finally {
            this.setLoading(false);
            this.hideProgress();
        }
    }

    async processWithGoogleAPI(docId) {
        this.showStatus('Authenticating with Google...', 'processing');
        this.showProgress(10);

        if (!this.isSignedIn) {
            await this.signIn();
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (!this.isSignedIn) {
                throw new Error('Authentication required to access Google Docs');
            }
        }

        this.showStatus('Fetching document via Google Docs API...', 'processing');
        this.showProgress(30);

        let response;
        try {
            response = await gapi.client.request({
                path: `https://docs.googleapis.com/v1/documents/${docId}`,
                method: 'GET',
                params: { includeTabsContent: true }
            });
        } catch (error) {
            response = await gapi.client.docs.documents.get({
                documentId: docId
            });
        }

        const doc = response.result;
        
        this.showStatus('Analyzing document structure...', 'processing');
        this.showProgress(50);

        const sections = this.extractSectionsFromGoogleDoc(doc);
        
        if (sections.length === 0) {
            throw new Error('No content sections found in the document');
        }

        this.showStatus(`Creating ${sections.length} Notion pages...`, 'processing');
        this.showProgress(70);

        const notionPages = this.createNotionPagesFromSections(sections);

        this.showStatus('Creating workspace bundle...', 'processing');
        this.showProgress(90);

        const markdownFiles = this.createMarkdownFiles(notionPages);

        this.showStatus('Workspace generated successfully! Download starting...', 'success');
        this.showProgress(100);

        await this.generateDownload(markdownFiles);
    }

    async listDocsInFolder(folderId) {
        try {
            if (!this.isSignedIn || !gapi.client.getToken()) {
                throw new Error('Authentication required. Please sign in to access Drive folders.');
            }
            
            const queryParams = {
                q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
                fields: 'files(id,name,createdTime)',
                orderBy: 'name'
            };
            
            let response;
            if (gapi.client.drive && gapi.client.drive.files && gapi.client.drive.files.list) {
                response = await gapi.client.drive.files.list(queryParams);
            } else {
                const token = gapi.client.getToken();
                if (!token || !token.access_token) {
                    throw new Error('No valid access token available. Please sign in again.');
                }
                
                const urlParams = new URLSearchParams();
                Object.entries(queryParams).forEach(([key, value]) => {
                    urlParams.append(key, value);
                });
                
                const apiUrl = `https://www.googleapis.com/drive/v3/files?${urlParams.toString()}`;
                const fetchResponse = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token.access_token}`,
                        'Content-Type': 'application/json',
                    }
                });
                
                if (!fetchResponse.ok) {
                    const errorText = await fetchResponse.text();
                    
                    if (fetchResponse.status === 403 && errorText.includes('Drive API has not been used')) {
                        throw new Error('DRIVE_API_NOT_ENABLED');
                    }
                    
                    throw new Error(`API request failed: ${fetchResponse.status} ${fetchResponse.statusText}`);
                }
                
                const responseData = await fetchResponse.json();
                response = {
                    result: responseData,
                    status: fetchResponse.status,
                    statusText: fetchResponse.statusText
                };
            }

            if (response.status === 403) {
                const errorBody = response.body ? JSON.parse(response.body) : response.result;
                throw new Error('Access denied. Please ensure you have signed in and the folder is shared with your account.');
            }
            
            let files = [];
            if (response && response.result) {
                if (response.result.files) {
                    files = response.result.files;
                } else if (Array.isArray(response.result)) {
                    files = response.result;
                }
            }

            if (!Array.isArray(files)) {
                throw new Error('Invalid response format: files is not an array');
            }
            
            return files;
        } catch (error) {
            if (error.message === 'DRIVE_API_NOT_ENABLED') {
                throw new Error('DRIVE_API_NOT_ENABLED');
            } else if (error.message && error.message.includes('Authentication required')) {
                throw error;
            } else if (error.message && error.message.includes('Access denied')) {
                throw error;
            } else {
                throw new Error(`Unable to access folder. Please ensure the folder is shared and you have access: ${error.message || 'Unknown error'}`);
            }
        }
    }

    async processFolderWithGoogleAPI(folderId) {
        this.showStatus('Authenticating with Google...', 'processing');
        this.showProgress(10);

        if (!this.isSignedIn || !gapi.client.getToken()) {
            const signInSuccess = await this.signIn();
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (!this.isSignedIn || !gapi.client.getToken()) {
                throw new Error('Authentication required to access Google Drive. Please sign in when prompted.');
            }
        }

        this.showStatus('Listing documents in folder...', 'processing');
        this.showProgress(20);

        const docs = await this.listDocsInFolder(folderId);
        
        if (docs.length === 0) {
            throw new Error('No Google Docs found in the specified folder');
        }

        this.showStatus(`Processing ${docs.length} documents...`, 'processing');
        this.showProgress(30);

        const allSections = [];
        const progressStep = 60 / docs.length;
        
        for (let i = 0; i < docs.length; i++) {
            const doc = docs[i];
            
            this.showStatus(`Processing "${doc.name}" (${i + 1}/${docs.length})...`, 'processing');
            this.showProgress(30 + (i * progressStep));

            try {
                const docSections = await this.processDocumentById(doc.id, doc.name);
                
                if (docSections.length === 0) {
                    allSections.push({
                        title: doc.name,
                        content: `This document appears to be empty or contains no recognizable content.`,
                        level: 1,
                        parentTab: 'Document',
                        sourceDocument: doc.name
                    });
                } else {
                    allSections.push(...docSections);
                }
            } catch (error) {
                allSections.push({
                    title: `Error - ${doc.name}`,
                    content: `Failed to process this document: ${error.message}\n\nThis could be due to:\n- Document access restrictions\n- Document format not supported\n- Network connectivity issues\n\nPlease check the document permissions and try again.`,
                    level: 1,
                    parentTab: 'Error',
                    sourceDocument: doc.name
                });
            }
        }

        if (allSections.length === 0) {
            throw new Error('No content sections found in any of the documents');
        }

        this.showStatus(`Creating ${allSections.length} Notion pages...`, 'processing');
        this.showProgress(90);

        const notionPages = this.createNotionPagesFromSections(allSections);

        this.showStatus('Creating workspace bundle...', 'processing');
        this.showProgress(95);

        const markdownFiles = this.createMarkdownFilesFromFolder(notionPages);

        this.showStatus('Workspace generated successfully! Download starting...', 'success');
        this.showProgress(100);

        await this.generateDownload(markdownFiles);
    }

    async processDocumentById(docId, docName = null) {
        let response;
        
        try {
            response = await gapi.client.request({
                path: `https://docs.googleapis.com/v1/documents/${docId}`,
                method: 'GET',
                params: { includeTabsContent: true }
            });
        } catch (error) {
            response = await gapi.client.docs.documents.get({
                documentId: docId
            });
        }

        const doc = response.result;
        const sections = this.extractSectionsFromGoogleDoc(doc);
        
        const finalDocName = docName || doc.title || `Document ${docId}`;
        sections.forEach(section => {
            section.sourceDocument = finalDocName;
        });
        
        return sections;
    }

    async processWithFallbackMethod(docId) {
        this.showStatus('Using fallback method (HTML parsing) - results may be less accurate', 'processing');
        this.showProgress(15);
        
        const docContent = await this.fetchGoogleDocFallback(docId);

        if (!docContent || (Array.isArray(docContent) && docContent.length === 0) || 
            (!Array.isArray(docContent) && docContent.trim().length < 50)) {
            throw new Error('Unable to extract meaningful content. Ensure the document is publicly accessible or published to web.');
        }

        this.showProgress(50);

        if (!Array.isArray(docContent)) {
            throw new Error('Content parsing failed - expected sections array');
        }
        
        if (docContent.length === 0) {
            throw new Error('No content sections found in the document. The document may be empty or the headers were not recognized.');
        }

        this.showStatus('Creating Notion pages...', 'processing');
        this.showProgress(70);
        const notionPages = this.createNotionPagesFromSections(docContent);

        this.showStatus('Creating workspace bundle...', 'processing');
        this.showProgress(90);
        const markdownFiles = this.createMarkdownFiles(notionPages);

        this.showStatus('Workspace generated successfully! Download starting...', 'success');
        this.showProgress(100);

        await this.generateDownload(markdownFiles);
    }

    extractSectionsFromGoogleDoc(doc) {
        const sections = [];

        if (doc.tabs && doc.tabs.length > 0) {
            const allTabs = [];
            
            for (const mainTab of doc.tabs) {
                allTabs.push(mainTab);
                if (mainTab.childTabs && mainTab.childTabs.length > 0) {
                    allTabs.push(...mainTab.childTabs);
                }
            }
            
            for (let tabIndex = 0; tabIndex < allTabs.length; tabIndex++) {
                const tab = allTabs[tabIndex];
                const tabSections = this.extractSectionsFromTab(tab, tabIndex, doc.title);
                sections.push(...tabSections);
            }
        } else if (doc.body) {
            const bodySections = this.extractSectionsFromBody(doc.body, doc.title || 'Document');
            sections.push(...bodySections);
        }

        return sections;
    }

    extractSectionsFromTab(tab, tabIndex, documentTitle = null) {
        const tabTitle = tab.tabProperties?.title || `Tab ${tabIndex + 1}`;
        
        let body = null;
        if (tab.documentTab && tab.documentTab.body) {
            body = tab.documentTab.body;
        } else if (tab.body) {
            body = tab.body;
        } else {
            return [];
        }

        const effectiveTabName = (tabTitle === 'Tab 1' && documentTitle) ? documentTitle : tabTitle;
        return this.extractSectionsFromBody(body, effectiveTabName);
    }

    extractSectionsFromBody(body, parentName) {
        const sections = [];
        let currentSection = null;
        let allContent = '';

        if (!body || !body.content) {
            return sections;
        }

        for (const element of body.content) {
            if (element.paragraph) {
                const paragraph = element.paragraph;
                const formattedText = this.extractFormattedTextFromParagraph(paragraph);
                
                if (!formattedText.trim()) continue;

                allContent += formattedText + '\n';
                const headingLevel = this.getHeadingLevel(paragraph);
                
                if (headingLevel > 0) {
                    if (currentSection && currentSection.content.trim()) {
                        sections.push(currentSection);
                    }
                    
                    currentSection = {
                        title: formattedText.trim(),
                        content: '',
                        level: headingLevel,
                        parentTab: parentName
                    };
                } else if (currentSection) {
                    currentSection.content += formattedText + '\n';
                } else {
                    currentSection = {
                        title: parentName,
                        content: formattedText + '\n',
                        level: 1,
                        parentTab: parentName
                    };
                }
            } else if (element.table) {
                const tableMarkdown = this.extractTableFromElement(element.table);
                allContent += tableMarkdown + '\n\n';
                
                if (currentSection) {
                    currentSection.content += tableMarkdown + '\n\n';
                } else {
                    currentSection = {
                        title: parentName,
                        content: tableMarkdown + '\n\n',
                        level: 1,
                        parentTab: parentName
                    };
                }
            }
        }

        if (currentSection && currentSection.content.trim()) {
            sections.push(currentSection);
        }

        if (sections.length === 0 && allContent.trim()) {
            sections.push({
                title: parentName,
                content: allContent.trim(),
                level: 1,
                parentTab: parentName
            });
        }

        if (sections.length === 1 && sections[0].title === parentName && parentName.startsWith('Tab ')) {
            const meaningfulName = sections[0].sourceDocument || parentName.replace('Tab ', 'Document ');
            sections[0].title = meaningfulName;
        }
        
        return sections;
    }

    extractFormattedTextFromParagraph(paragraph) {
        let formattedText = '';
        
        const bullet = this.getBulletInfo(paragraph);
        if (bullet) {
            formattedText += bullet;
        }
        
        if (paragraph.elements) {
            for (const element of paragraph.elements) {
                if (element.textRun && element.textRun.content) {
                    let text = element.textRun.content;
                    
                    if (element.textRun.textStyle) {
                        text = this.applyTextFormatting(text, element.textRun.textStyle);
                    }
                    
                    formattedText += text;
                }
            }
        }
        
        return formattedText;
    }

    getBulletInfo(paragraph) {
        if (paragraph.bullet) {
            const listProperties = paragraph.bullet.listProperties;
            const nestingLevel = paragraph.bullet.nestingLevel || 0;
            
            if (listProperties && listProperties.type === 'ORDERED') {
                return '  '.repeat(nestingLevel) + '1. ';
            } else {
                return '  '.repeat(nestingLevel) + '- ';
            }
        }
        return '';
    }

    applyTextFormatting(text, textStyle) {
        let formatted = text;
        
        if (textStyle.bold) {
            formatted = `**${formatted}**`;
        }
        
        if (textStyle.italic) {
            formatted = `*${formatted}*`;
        }
        
        if (textStyle.underline) {
            formatted = `<u>${formatted}</u>`;
        }
        
        if (textStyle.strikethrough) {
            formatted = `~~${formatted}~~`;
        }
        
        if (textStyle.link && textStyle.link.url) {
            formatted = `[${formatted}](${textStyle.link.url})`;
        }
        
        return formatted;
    }

    extractTableFromElement(table) {
        let markdown = '';
        
        if (table.tableRows) {
            const rows = table.tableRows;
            
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                let rowMarkdown = '|';
                
                if (row.tableCells) {
                    for (const cell of row.tableCells) {
                        let cellContent = '';
                        if (cell.content) {
                            for (const element of cell.content) {
                                if (element.paragraph) {
                                    cellContent += this.extractTextFromParagraph(element.paragraph);
                                }
                            }
                        }
                        rowMarkdown += ` ${cellContent.trim()} |`;
                    }
                }
                
                markdown += rowMarkdown + '\n';
                
                if (i === 0 && row.tableCells) {
                    let separator = '|';
                    for (let j = 0; j < row.tableCells.length; j++) {
                        separator += ' --- |';
                    }
                    markdown += separator + '\n';
                }
            }
        }
        
        return markdown;
    }

    extractTextFromParagraph(paragraph) {
        let text = '';
        
        if (paragraph.elements) {
            for (const element of paragraph.elements) {
                if (element.textRun && element.textRun.content) {
                    text += element.textRun.content;
                }
            }
        }
        
        return text;
    }

    getHeadingLevel(paragraph) {
        if (paragraph.paragraphStyle && paragraph.paragraphStyle.namedStyleType) {
            const styleType = paragraph.paragraphStyle.namedStyleType;
            
            switch (styleType) {
                case 'HEADING_1': return 1;
                case 'HEADING_2': return 2;
                case 'HEADING_3': return 3;
                case 'HEADING_4': return 4;
                case 'HEADING_5': return 5;
                case 'HEADING_6': return 6;
                case 'TITLE': return 1;
                case 'SUBTITLE': return 2;
                default: return 0;
            }
        }
        
        return 0;
    }

    createNotionPagesFromSections(sections) {
        const pages = [];
        
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            
            try {
                const pageContent = this.createNotionPageFromSection(section);
                pages.push(pageContent);
            } catch (error) {
                pages.push({
                    title: section.title,
                    content: `# ${section.title}\n\n${section.content}`,
                    sourceDocument: section.sourceDocument
                });
            }
        }

        return pages;
    }

    createNotionPageFromSection(section) {
        let markdownContent = '';
        
        const headerPrefix = '#'.repeat(Math.min(section.level || 1, 6));
        markdownContent += `${headerPrefix} ${section.title}\n\n`;
        
        let content = section.content.trim();
        
        content = content
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\.([A-Z])/g, '. $1')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();

        markdownContent += content;

        if (!markdownContent.endsWith('\n')) {
            markdownContent += '\n';
        }

        return {
            title: section.title,
            content: markdownContent,
            parentTab: section.parentTab,
            sourceDocument: section.sourceDocument
        };
    }

    createMarkdownFiles(pages) {
        const files = [];

        pages.forEach((page, index) => {
            if (!page.title || page.title.trim() === '') return;

            const cleanTitle = page.title
                .replace(/[^a-zA-Z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .toLowerCase();
            
            const filename = `${cleanTitle}.md`;

            let content = page.content;
            content += `\n\n---\n\n*Converted from Google Docs to Notion on ${new Date().toLocaleDateString()}*`;

            files.push({
                name: filename,
                content: content
            });
        });

        return files;
    }

    createMarkdownFilesFromFolder(pages) {
        const files = [];
        const documentGroups = {};

        pages.forEach(page => {
            if (!page.title || page.title.trim() === '') return;

            const sourceDoc = page.sourceDocument || 'Unknown Document';
            if (!documentGroups[sourceDoc]) {
                documentGroups[sourceDoc] = [];
            }
            documentGroups[sourceDoc].push(page);
        });

        Object.keys(documentGroups).forEach(docName => {
            const docPages = documentGroups[docName];
            
            const cleanDocName = docName
                .replace(/[^a-zA-Z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .toLowerCase();

            docPages.forEach((page, index) => {
                const cleanTitle = page.title
                    .replace(/[^a-zA-Z0-9\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .toLowerCase();
                
                const filename = `${cleanDocName}--${cleanTitle}.md`;

                let content = page.content;
                content += `\n\n---\n\n*Source: ${docName}*\n`;
                content += `*Converted from Google Docs to Notion on ${new Date().toLocaleDateString()}*`;

                files.push({
                    name: filename,
                    content: content
                });
            });
        });

        return files;
    }

    async generateDownload(files) {
        const zip = new JSZip();

        files.forEach(file => {
            zip.file(file.name, file.content);
        });

        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 6
            }
        });

        const url = URL.createObjectURL(zipBlob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `notion-workspace-${new Date().getTime()}.zip`;
        downloadLink.textContent = '📥 Download Notion Workspace';
        downloadLink.className = 'download-btn';

        this.status.appendChild(document.createElement('br'));
        this.status.appendChild(downloadLink);

        setTimeout(() => {
            downloadLink.click();
        }, 1000);
    }

    async fetchGoogleDocFallback(docId) {
        const urls = [
            `https://docs.google.com/document/d/${docId}/pub`,
            `https://docs.google.com/document/d/${docId}/export?format=txt`
        ];

        for (const url of urls) {
            try {
                const response = await fetch(url);

                if (response.ok) {
                    const content = await response.text();

                    if (content && content.length > 100) {
                        if (url.includes('/pub')) {
                            return this.parseGoogleDocsHTML(content);
                        } else {
                            return this.parseTextContent(content);
                        }
                    }
                }
            } catch (error) {
                continue;
            }
        }

        throw new Error('Could not access document. Make sure it is published to web or publicly shared.');
    }

    parseGoogleDocsHTML(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        doc.querySelectorAll('script, style, meta, link, head').forEach(el => el.remove());

        return this.extractStructuredContent(doc.body);
    }

    extractStructuredContent(element) {
        const allText = element.textContent.trim();
        if (allText) {
            return [{
                title: 'Document Content',
                content: allText,
                level: 1
            }];
        }
        return [];
    }

    parseTextContent(text) {
        if (text && text.trim()) {
            return [{
                title: 'Document Content',
                content: text.trim(),
                level: 1
            }];
        }
        return [];
    }

    extractDocId(url) {
        const match = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) throw new Error('Invalid Google Docs URL format');
        return match[1];
    }

    validateGoogleDocsUrl(url) {
        const googleDocsPattern = /^https:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9-_]+/;
        return googleDocsPattern.test(url);
    }

    validateGoogleDriveFolderUrl(url) {
        const googleDriveFolderPattern = /^https:\/\/drive\.google\.com\/drive\/folders\/[a-zA-Z0-9-_]+/;
        return googleDriveFolderPattern.test(url);
    }

    extractFolderId(url) {
        const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
        if (!match) throw new Error('Invalid Google Drive folder URL format');
        return match[1];
    }

    setLoading(loading) {
        this.generateBtn.disabled = loading;
        this.spinner.style.display = loading ? 'inline-block' : 'none';
        this.btnText.textContent = loading ? 'Converting...' : '🚀 Convert Document';
    }

    showStatus(message, type) {
        this.status.textContent = message;
        this.status.className = `status ${type}`;
        this.status.style.display = 'block';
    }

    hideStatus() {
        this.status.style.display = 'none';
    }

    showProgress(percent) {
        this.progressBar.style.display = 'block';
        this.progressFill.style.width = `${percent}%`;
    }

    hideProgress() {
        setTimeout(() => {
            this.progressBar.style.display = 'none';
            this.progressFill.style.width = '0%';
        }, 1000);
    }
}

class Router {
    constructor() {
        this.init();
    }

    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
        
        document.getElementById('backToMain').addEventListener('click', () => {
            window.location.hash = '';
        });
    }

    handleRoute() {
        const hash = window.location.hash.substring(1);
        
        const sections = document.querySelectorAll('.section');
        sections.forEach(section => {
            section.style.display = 'none';
        });

        if (hash === 'privacy') {
            document.getElementById('privacy').style.display = 'block';
            document.querySelector('.hero').style.display = 'none';
            document.querySelector('.header').style.display = 'block';
        } else {
            document.getElementById('converter').style.display = 'block';
            document.getElementById('how-it-works').style.display = 'block';
            document.getElementById('features').style.display = 'block';
            document.querySelector('.hero').style.display = 'block';
            document.querySelector('.header').style.display = 'block';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DocsToNotionConverter();
    new Router();
});