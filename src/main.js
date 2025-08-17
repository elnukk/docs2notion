class DocsToNotionConverter {
    constructor() {
        this.CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        this.API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
        this.DISCOVERY_DOC = 'https://docs.googleapis.com/$discovery/rest?version=v1';
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

        // Initialize Google API
        await this.initializeGoogleAPI();
    }

    async initializeGoogleAPI() {
        try {
            console.log('🔧 Starting Google API initialization...');
            console.log('CLIENT_ID:', this.CLIENT_ID);
            console.log('API_KEY:', this.API_KEY ? 'Present' : 'Missing');
            
            if (!this.CLIENT_ID) {
                console.log('CLIENT_ID missing');
                this.showConfigurationWarning();
                return;
            }

            if (!this.API_KEY) {
                console.log('API_KEY missing');
                this.showStatus('API Key is missing from configuration', 'error');
                return;
            }

            this.showStatus('🔧 Initializing Google API...', 'processing');
            
            console.log('📡 Loading gapi client...');
            await new Promise((resolve, reject) => {
                gapi.load('client', {
                    callback: () => {
                        console.log('gapi.client loaded successfully');
                        resolve();
                    },
                    onerror: () => {
                        console.error('Failed to load gapi.client');
                        reject(new Error('Failed to load gapi.client'));
                    }
                });
            });

            console.log('🔧 Initializing gapi.client...');
            await gapi.client.init({
                apiKey: this.API_KEY,
                discoveryDocs: [this.DISCOVERY_DOC]
            });

            console.log('Initializing Google Identity Services...');
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.CLIENT_ID,
                scope: this.SCOPES,
                callback: (response) => {
                    console.log('✅ Token received:', response);
                    if (response.access_token) {
                        gapi.client.setToken(response);
                        this.isSignedIn = true;
                        this.showStatus('✅ Signed in successfully', 'success');
                    }
                },
            });

            console.log('Google API initialized successfully');
            this.showStatus('Google API initialized', 'success');
            setTimeout(() => this.hideStatus(), 2000);

        } catch (error) {
            console.error('Google API initialization failed:', error);
            console.error('Error details:', error.message);
            console.error('Error stack:', error.stack);
            this.showStatus(`Failed to initialize Google API: ${error.message}`, 'error');
        }
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

    async signIn() {
        try {
            if (!this.tokenClient) {
                throw new Error('Token client not initialized');
            }
            
            console.log('🔑 Requesting access token...');
            
            return new Promise((resolve, reject) => {
                // Store the original callback
                const originalCallback = this.tokenClient.callback;
                
                this.tokenClient.callback = (response) => {
                    console.log('Token received:', response);
                    if (response.access_token) {
                        gapi.client.setToken(response);
                        this.isSignedIn = true;
                        resolve(true);
                    } else if (response.error) {
                        reject(new Error(response.error));
                    } else {
                        reject(new Error('Authentication failed'));
                    }
                    
                    // Restore original callback
                    this.tokenClient.callback = originalCallback;
                };
                
                this.tokenClient.requestAccessToken();
            });
        } catch (error) {
            console.error('Sign in failed:', error);
            this.showStatus('Sign in failed', 'error');
            return false;
        }
    }

    async processDocument() {
        const docUrl = document.getElementById('docUrl').value;

        if (!this.validateGoogleDocsUrl(docUrl)) {
            this.showStatus('Please enter a valid Google Docs share link', 'error');
            return;
        }

        try {
            this.setLoading(true);
            this.showProgress(0);

            const docId = this.extractDocId(docUrl);

            // Check if we can use Google API
            if (this.CLIENT_ID && gapi.client) {
                await this.processWithGoogleAPI(docId);
            } else {
                await this.processWithFallbackMethod(docId);
            }

        } catch (error) {
            console.error('Conversion error:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
            this.hideProgress();
        }
    }

    async processWithGoogleAPI(docId) {
        this.showStatus('Authenticating with Google...', 'processing');
        this.showProgress(10);

        // Always try to sign in first to ensure we have access
        if (!this.isSignedIn) {
            await this.signIn();
            // Wait a moment for the token to be processed
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (!this.isSignedIn) {
                throw new Error('Authentication required to access Google Docs');
            }
        }

        this.showStatus('Fetching document via Google Docs API...', 'processing');
        this.showProgress(30);

        // Fetch document using Google Docs API
        console.log('Requesting document with multiple approaches...');
        
        let response, doc;
        
        try {
            // Method 1: Try with explicit tab inclusion
            console.log('Method 1: Trying includeTabsContent...');
            response = await gapi.client.request({
                path: `https://docs.googleapis.com/v1/documents/${docId}`,
                method: 'GET',
                params: {
                    includeTabsContent: true
                }
            });
            doc = response.result;
            console.log('📄 Method 1 response:', doc);
        } catch (error1) {
            console.log('⚠️ Method 1 failed:', error1);
            
            try {
                // Method 2: Try with different field specification
                console.log('🔍 Method 2: Trying explicit fields...');
                response = await gapi.client.docs.documents.get({
                    documentId: docId,
                    fields: '*'
                });
                doc = response.result;
                console.log('📄 Method 2 response:', doc);
            } catch (error2) {
                console.log('⚠️ Method 2 failed:', error2);
                
                try {
                    // Method 3: Try direct API call with tabs parameter
                    console.log('🔍 Method 3: Direct API with tabs...');
                    response = await gapi.client.request({
                        path: `https://docs.googleapis.com/v1/documents/${docId}?fields=*`,
                        method: 'GET'
                    });
                    doc = response.result;
                    console.log('📄 Method 3 response:', doc);
                } catch (error3) {
                    console.log('⚠️ Method 3 failed:', error3);
                    
                    // Method 4: Fallback to standard request
                    console.log('🔍 Method 4: Standard fallback...');
                    response = await gapi.client.docs.documents.get({
                        documentId: docId
                    });
                    doc = response.result;
                    console.log('📄 Method 4 response:', doc);
                }
            }
        }
        
        // Debug: Log the document structure
        console.log('📄 Full document structure:', doc);
        console.log('📑 Document tabs:', doc.tabs);
        console.log('📑 Tabs type:', typeof doc.tabs);
        console.log('📑 Tabs is array:', Array.isArray(doc.tabs));
        console.log('📑 Number of tabs:', doc.tabs ? doc.tabs.length : 'No tabs property');
        console.log('📄 Document body:', doc.body);
        console.log('📄 Document title:', doc.title);
        
        // Log all top-level properties
        console.log('All document properties:', Object.keys(doc));
        
        // Log each tab individually if they exist
        if (doc.tabs && Array.isArray(doc.tabs) && doc.tabs.length > 0) {
            console.log(`🔍 Processing ${doc.tabs.length} tabs:`);
            doc.tabs.forEach((tab, index) => {
                console.log(`📑 Tab ${index + 1}:`, tab);
                console.log(`📑 Tab ${index + 1} properties:`, Object.keys(tab));
                console.log(`📑 Tab ${index + 1} title:`, tab.tabProperties?.title);
                console.log(`📑 Tab ${index + 1} has documentTab:`, !!tab.documentTab);
                console.log(`📑 Tab ${index + 1} has body:`, !!tab.body);
                if (tab.documentTab) {
                    console.log(`📑 Tab ${index + 1} documentTab properties:`, Object.keys(tab.documentTab));
                }
            });
        } else {
            console.log('⚠️ No tabs array found in document');
            console.log('📑 Raw tabs value:', doc.tabs);
        }
        
        this.showStatus('Analyzing document structure...', 'processing');
        this.showProgress(50);

        // Extract sections from the document
        const sections = this.extractSectionsFromGoogleDoc(doc);
        
        if (sections.length === 0) {
            throw new Error('No content sections found in the document');
        }

        this.showStatus(`Creating ${sections.length} Notion pages...`, 'processing');
        this.showProgress(70);

        // Create Notion pages from sections
        const notionPages = this.createNotionPagesFromSections(sections);

        this.showStatus('Creating workspace bundle...', 'processing');
        this.showProgress(90);

        const markdownFiles = this.createMarkdownFiles(notionPages);

        this.showStatus('Workspace generated successfully! Download starting...', 'success');
        this.showProgress(100);

        await this.generateDownload(markdownFiles);
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

        // docContent should be an array of sections
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
        
        console.log('Processing document structure...');
        console.log('Document has tabs:', !!doc.tabs);
        console.log('Document has body:', !!doc.body);

        if (doc.tabs && doc.tabs.length > 0) {
            console.log('Found tabs - checking for child tabs...');
            
            // Collect all tabs (main tabs + child tabs)
            const allTabs = [];
            
            for (const mainTab of doc.tabs) {
                // Add the main tab
                allTabs.push(mainTab);
                
                // Add any child tabs
                if (mainTab.childTabs && mainTab.childTabs.length > 0) {
                    console.log(`Found ${mainTab.childTabs.length} child tabs for "${mainTab.tabProperties?.title}"`);
                    allTabs.push(...mainTab.childTabs);
                }
            }
            
            console.log(`Total tabs to process: ${allTabs.length}`);
            
            // Process all tabs
            for (let tabIndex = 0; tabIndex < allTabs.length; tabIndex++) {
                const tab = allTabs[tabIndex];
                const tabTitle = tab.tabProperties?.title || `Tab ${tabIndex + 1}`;
                console.log(`Processing tab ${tabIndex + 1}: ${tabTitle}`);
                
                const tabSections = this.extractSectionsFromTab(tab, tabIndex);
                sections.push(...tabSections);
            }
        } else if (doc.body) {
            console.log('Processing single-tab document');
            const bodySections = this.extractSectionsFromBody(doc.body, 'Document');
            sections.push(...bodySections);
        }

        console.log('Total sections extracted:', sections.length);
        return sections;
    }

    extractSectionsFromTab(tab, tabIndex) {
        const tabTitle = tab.tabProperties?.title || `Tab ${tabIndex + 1}`;
        console.log(`Processing tab: ${tabTitle}`);
        console.log(`Tab structure:`, tab);
        
        // Check different possible structures
        let body = null;
        if (tab.documentTab && tab.documentTab.body) {
            body = tab.documentTab.body;
            console.log(`Found documentTab.body for ${tabTitle}`);
        } else if (tab.body) {
            body = tab.body;
            console.log(`Found body for ${tabTitle}`);
        } else {
            console.log(`⚠️ Tab ${tabTitle} has no accessible content. Tab structure:`, Object.keys(tab));
            return [];
        }

        return this.extractSectionsFromBody(body, tabTitle);
    }

    extractSectionsFromBody(body, parentName) {
        const sections = [];
        let currentSection = null;

        if (!body || !body.content) {
            console.log(`⚠️ ${parentName} has no content`);
            return sections;
        }

        console.log(`Processing ${body.content.length} elements in ${parentName}`);

        // Process each structural element
        for (const element of body.content) {
            if (element.paragraph) {
                const paragraph = element.paragraph;
                const formattedText = this.extractFormattedTextFromParagraph(paragraph);
                
                if (!formattedText.trim()) continue;

                // Check if this paragraph is a heading
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
                    // Add content to current section
                    currentSection.content += formattedText + '\n';
                } else {
                    // No current section, create default one
                    currentSection = {
                        title: parentName,
                        content: formattedText + '\n',
                        level: 1,
                        parentTab: parentName
                    };
                }
            } else if (element.table) {
                // Handle tables
                const tableMarkdown = this.extractTableFromElement(element.table);
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

        // Add final section
        if (currentSection && currentSection.content.trim()) {
            sections.push(currentSection);
        }

        console.log(`✅ Extracted ${sections.length} sections from ${parentName}`);
        return sections;
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

    extractFormattedTextFromParagraph(paragraph) {
        let formattedText = '';
        
        // Check for bullet points
        const bullet = this.getBulletInfo(paragraph);
        if (bullet) {
            formattedText += bullet;
        }
        
        if (paragraph.elements) {
            for (const element of paragraph.elements) {
                if (element.textRun && element.textRun.content) {
                    let text = element.textRun.content;
                    
                    // Apply text formatting
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
            
            // Create appropriate bullet/number based on list type
            if (listProperties && listProperties.type === 'ORDERED') {
                // For ordered lists, we'll use numbers (though we can't get exact number from API)
                return '  '.repeat(nestingLevel) + '1. ';
            } else {
                // For unordered lists, use bullets
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
                
                // Add header separator for first row
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

    getHeadingLevel(paragraph) {
        // Check the paragraph style for heading information
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
                console.error(`Failed to create page "${section.title}":`, error);
                pages.push({
                    title: section.title,
                    content: `# ${section.title}\n\n${section.content}`
                });
            }
        }

        return pages;
    }

    createNotionPageFromSection(section) {
        // Convert to Notion-compatible markdown while preserving all original content
        let markdownContent = '';
        
        // Add title with appropriate header level
        const headerPrefix = '#'.repeat(Math.min(section.level || 1, 6));
        markdownContent += `${headerPrefix} ${section.title}\n\n`;
        
        // Tab information removed for cleaner output
        
        // Process the content to make it Notion-friendly while preserving everything
        let content = section.content.trim();
        
        // Clean up excessive spacing while preserving line structure
        content = content
            .replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
            .replace(/\.([A-Z])/g, '. $1')  // Add space after periods
            .replace(/[ \t]{2,}/g, ' ')  // Remove excessive spaces
            .trim();  // Remove leading/trailing whitespace

        markdownContent += content;

        if (!markdownContent.endsWith('\n')) {
            markdownContent += '\n';
        }

        return {
            title: section.title,
            content: markdownContent,
            parentTab: section.parentTab
        };
    }

    createMarkdownFiles(pages) {
        const files = [];

        pages.forEach((page, index) => {
            if (!page.title || page.title.trim() === '') return;

            // Use header name as the main filename
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

    async generateDownload(files) {
        console.log('Generating download with files:', files.length);

        const zip = new JSZip();

        files.forEach(file => {
            console.log(`Adding file to ZIP: ${file.name} (${file.content.length} chars)`);
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
            console.log('Download triggered');
        }, 1000);
    }

    // Fallback methods (keeping existing HTML parsing for when API is not configured)
    async fetchGoogleDocFallback(docId) {
        console.log('Fetching doc with ID:', docId);

        const urls = [
            `https://docs.google.com/document/d/${docId}/pub`,
            `https://docs.google.com/document/d/${docId}/export?format=txt`
        ];

        for (const url of urls) {
            try {
                console.log('Trying URL:', url);

                const response = await fetch(url);
                console.log('Response status:', response.status);

                if (response.ok) {
                    const content = await response.text();
                    console.log('Content length:', content.length);

                    if (content && content.length > 100) {
                        if (url.includes('/pub')) {
                            return this.parseGoogleDocsHTML(content);
                        } else {
                            return this.parseTextContent(content);
                        }
                    }
                }
            } catch (error) {
                console.log('Fetch error:', error.message);
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
        // Simplified fallback - just create one section with all content
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
        // Simplified fallback - just create one section with all content
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

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the converter when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DocsToNotionConverter();
});