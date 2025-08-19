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

        // Handle radio button changes to update UI
        const radioButtons = document.querySelectorAll('input[name="sourceType"]');
        radioButtons.forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateUIForSourceType();
            });
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
            
            // Try with discovery docs first, fallback to manual initialization
            try {
                await gapi.client.init({
                    apiKey: this.API_KEY,
                    discoveryDocs: this.DISCOVERY_DOCS
                });
                console.log('✅ Discovery docs loaded successfully');
            } catch (discoveryError) {
                console.log('⚠️ Discovery docs failed, using fallback method:', discoveryError.message);
                
                // Fallback: Initialize without discovery docs and manually set up APIs
                await gapi.client.init({
                    apiKey: this.API_KEY
                });
                
                // Manually set up the APIs we need
                this.setupManualAPIs();
            }

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

    setupManualAPIs() {
        console.log('🔧 Setting up manual API endpoints...');
        
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
            
            // Get current token
            const token = gapi.client.getToken();
            if (!token || !token.access_token) {
                throw new Error('No access token available for Drive API request');
            }
            
            // Use fetch with explicit Authorization header 
            try {
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
                
                // Return in gapi format
                return {
                    result: data,
                    status: response.status,
                    statusText: response.statusText
                };
            } catch (error) {
                console.error('Manual Drive API request failed:', error);
                // Fallback to gapi.client.request
                return gapi.client.request({
                    path: url,
                    method: 'GET'
                });
            }
        };
        
        console.log('✅ Manual API setup complete');
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
        
        // Clear existing status content and add the new error
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
                // Folder processing requires Google API
                if (!this.CLIENT_ID || !gapi.client) {
                    throw new Error('Google API configuration is required for folder processing. Please set up your Google API credentials.');
                }
                const folderId = this.extractFolderId(docUrl);
                await this.processFolderWithGoogleAPI(folderId);
            } else {
                const docId = this.extractDocId(docUrl);
                // Check if we can use Google API
                if (this.CLIENT_ID && gapi.client) {
                    await this.processWithGoogleAPI(docId);
                } else {
                    await this.processWithFallbackMethod(docId);
                }
            }

        } catch (error) {
            console.error('Conversion error:', error);
            
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

    async listDocsInFolder(folderId) {
        try {
            console.log(`📁 Listing documents in folder: ${folderId}`);
            
            // Check authentication status
            console.log('Current auth status:', this.isSignedIn);
            console.log('Current token:', gapi.client.getToken());
            
            if (!this.isSignedIn || !gapi.client.getToken()) {
                throw new Error('Authentication required. Please sign in to access Drive folders.');
            }
            
            // Debug: Check if gapi.client.drive is available
            console.log('gapi.client.drive available:', !!gapi.client.drive);
            console.log('gapi.client.drive.files available:', !!gapi.client.drive?.files);
            
            // Prepare query parameters
            const queryParams = {
                q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
                fields: 'files(id,name,createdTime)',
                orderBy: 'name'
            };
            
            let response;
            try {
                // Method 1: Try using gapi.client.drive.files.list (works with both discovery and manual setup)
                if (gapi.client.drive && gapi.client.drive.files && gapi.client.drive.files.list) {
                    console.log('Using gapi.client.drive.files.list method');
                    response = await gapi.client.drive.files.list(queryParams);
                    console.log('Method 1 response:', response);
                } else {
                    throw new Error('drive.files.list not available');
                }
            } catch (error1) {
                console.log('Method 1 failed, trying direct request:', error1);
                
                // Method 2: Direct API request with manual URL construction
                const urlParams = new URLSearchParams();
                Object.entries(queryParams).forEach(([key, value]) => {
                    urlParams.append(key, value);
                });
                
                // Get the current access token
                const token = gapi.client.getToken();
                console.log('Current token for request:', token);
                
                if (!token || !token.access_token) {
                    throw new Error('No valid access token available. Please sign in again.');
                }
                
                const apiUrl = `https://www.googleapis.com/drive/v3/files?${urlParams.toString()}`;
                console.log('Making direct request to:', apiUrl);
                
                // Method 2a: Try with gapi.client.request (should include token automatically)
                try {
                    response = await gapi.client.request({
                        path: apiUrl,
                        method: 'GET'
                    });
                    console.log('Method 2a response:', response);
                } catch (error2a) {
                    console.log('Method 2a failed, trying with explicit headers:', error2a);
                    
                    // Method 2b: Try with explicit Authorization header using fetch
                    try {
                        const fetchResponse = await fetch(apiUrl, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${token.access_token}`,
                                'Content-Type': 'application/json',
                            }
                        });
                        
                        console.log('Fetch response status:', fetchResponse.status);
                        
                        if (!fetchResponse.ok) {
                            const errorText = await fetchResponse.text();
                            console.error('Fetch error response:', errorText);
                            
                            // Check for specific Drive API not enabled error
                            if (fetchResponse.status === 403 && errorText.includes('Drive API has not been used')) {
                                throw new Error('DRIVE_API_NOT_ENABLED');
                            }
                            
                            throw new Error(`API request failed: ${fetchResponse.status} ${fetchResponse.statusText}`);
                        }
                        
                        const responseData = await fetchResponse.json();
                        console.log('Method 2b (fetch) response data:', responseData);
                        
                        // Convert fetch response to gapi-like format
                        response = {
                            result: responseData,
                            status: fetchResponse.status,
                            statusText: fetchResponse.statusText
                        };
                    } catch (error2b) {
                        console.error('Method 2b (fetch) also failed:', error2b);
                        throw error2b;
                    }
                }
            }

            // Check if we got a 403 error and provide helpful message
            if (response.status === 403) {
                console.error('403 Forbidden error - likely authentication issue');
                const errorBody = response.body ? JSON.parse(response.body) : response.result;
                console.error('Error details:', errorBody);
                throw new Error('Access denied. Please ensure you have signed in and the folder is shared with your account.');
            }

            console.log('Full response object:', response);
            console.log('Response result:', response.result);
            console.log('Response body:', response.body);
            
            // Handle different response formats
            let files = [];
            if (response && response.result) {
                if (response.result.files) {
                    files = response.result.files;
                } else if (Array.isArray(response.result)) {
                    files = response.result;
                }
            } else if (response && response.body) {
                // Sometimes the response is in body as JSON string
                try {
                    const bodyData = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
                    files = bodyData.files || [];
                } catch (parseError) {
                    console.error('Failed to parse response body:', parseError);
                }
            }

            console.log(`📄 Found ${files.length} Google Docs in folder`);
            console.log('Files found:', files);
            
            if (!Array.isArray(files)) {
                throw new Error('Invalid response format: files is not an array');
            }
            
            return files;
        } catch (error) {
            console.error('Error listing folder contents:', error);
            console.error('Error details:', {
                message: error.message,
                status: error.status,
                result: error.result
            });
            
            // Provide more specific error messages based on the error type
            if (error.message === 'DRIVE_API_NOT_ENABLED') {
                throw new Error('DRIVE_API_NOT_ENABLED');
            } else if (error.message && error.message.includes('Authentication required')) {
                throw error; // Re-throw authentication errors as-is
            } else if (error.message && error.message.includes('Access denied')) {
                throw error; // Re-throw access errors as-is
            } else {
                throw new Error(`Unable to access folder. Please ensure the folder is shared and you have access: ${error.message || 'Unknown error'}`);
            }
        }
    }

    async processFolderWithGoogleAPI(folderId) {
        this.showStatus('Authenticating with Google...', 'processing');
        this.showProgress(10);

        // Always try to sign in first to ensure we have access
        if (!this.isSignedIn || !gapi.client.getToken()) {
            console.log('🔑 Starting authentication for Drive access...');
            const signInSuccess = await this.signIn();
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Double-check authentication status
            console.log('Post-auth status:', this.isSignedIn);
            console.log('Post-auth token:', !!gapi.client.getToken());
            
            if (!this.isSignedIn || !gapi.client.getToken()) {
                throw new Error('Authentication required to access Google Drive. Please sign in when prompted.');
            }
        }

        console.log('✅ Authentication confirmed, proceeding with folder access...');

        this.showStatus('Listing documents in folder...', 'processing');
        this.showProgress(20);

        // Get list of Google Docs in the folder
        const docs = await this.listDocsInFolder(folderId);
        
        if (docs.length === 0) {
            throw new Error('No Google Docs found in the specified folder');
        }

        this.showStatus(`Processing ${docs.length} documents...`, 'processing');
        this.showProgress(30);

        // Process each document
        const allSections = [];
        const progressStep = 60 / docs.length; // Reserve 60% for document processing
        
        for (let i = 0; i < docs.length; i++) {
            const doc = docs[i];
            console.log(`📄 Processing document ${i + 1}/${docs.length}: ${doc.name}`);
            
            this.showStatus(`Processing "${doc.name}" (${i + 1}/${docs.length})...`, 'processing');
            this.showProgress(30 + (i * progressStep));

            try {
                const docSections = await this.processDocumentById(doc.id, doc.name);
                console.log(`✅ Document "${doc.name}" processed successfully, got ${docSections.length} sections`);
                console.log('Sections from this doc:', docSections.map(s => s.title));
                
                // If document has no sections (empty or no headers), create a default one
                if (docSections.length === 0) {
                    console.log(`⚠️ Document "${doc.name}" has no sections, creating default section`);
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
                console.error(`Failed to process document "${doc.name}":`, error);
                // Continue with other documents but log the error
                allSections.push({
                    title: `Error - ${doc.name}`,
                    content: `Failed to process this document: ${error.message}\n\nThis could be due to:\n- Document access restrictions\n- Document format not supported\n- Network connectivity issues\n\nPlease check the document permissions and try again.`,
                    level: 1,
                    parentTab: 'Error',
                    sourceDocument: doc.name
                });
            }
        }

        console.log(`📊 Total sections collected from all documents: ${allSections.length}`);
        console.log('All sections:', allSections.map(s => `${s.sourceDocument}: ${s.title}`));

        if (allSections.length === 0) {
            throw new Error('No content sections found in any of the documents');
        }

        this.showStatus(`Creating ${allSections.length} Notion pages...`, 'processing');
        this.showProgress(90);

        // Create Notion pages from sections
        const notionPages = this.createNotionPagesFromSections(allSections);

        this.showStatus('Creating workspace bundle...', 'processing');
        this.showProgress(95);

        const markdownFiles = this.createMarkdownFilesFromFolder(notionPages);

        this.showStatus('Workspace generated successfully! Download starting...', 'success');
        this.showProgress(100);

        await this.generateDownload(markdownFiles);
    }

    async processDocumentById(docId, docName = null) {
        console.log(`📄 Processing document: ${docId} (${docName || 'Unknown'})`);
        
        // Fetch document using Google Docs API (similar to existing processWithGoogleAPI)
        let response, doc;
        
        try {
            console.log('Fetching document with Google Docs API...');
            response = await gapi.client.request({
                path: `https://docs.googleapis.com/v1/documents/${docId}`,
                method: 'GET',
                params: {
                    includeTabsContent: true
                }
            });
            doc = response.result;
            console.log(`✅ Document fetched successfully: "${doc.title}"`);
        } catch (error1) {
            console.log('Method 1 failed, trying method 2...');
            try {
                response = await gapi.client.docs.documents.get({
                    documentId: docId,
                    fields: '*'
                });
                doc = response.result;
                console.log(`✅ Document fetched with method 2: "${doc.title}"`);
            } catch (error2) {
                console.log('Method 2 failed, trying method 3...');
                try {
                    response = await gapi.client.request({
                        path: `https://docs.googleapis.com/v1/documents/${docId}?fields=*`,
                        method: 'GET'
                    });
                    doc = response.result;
                    console.log(`✅ Document fetched with method 3: "${doc.title}"`);
                } catch (error3) {
                    console.log('Method 3 failed, trying final method...');
                    response = await gapi.client.docs.documents.get({
                        documentId: docId
                    });
                    doc = response.result;
                    console.log(`✅ Document fetched with final method: "${doc.title}"`);
                }
            }
        }

        console.log(`📊 Document structure for "${doc.title}":`);
        console.log(`- Has tabs: ${!!doc.tabs}`);
        console.log(`- Has body: ${!!doc.body}`);
        console.log(`- Tab count: ${doc.tabs ? doc.tabs.length : 0}`);

        // Extract sections from the document
        const sections = this.extractSectionsFromGoogleDoc(doc);
        console.log(`📄 Extracted ${sections.length} sections from "${doc.title}"`);
        
        // Add source document info to each section
        const finalDocName = docName || doc.title || `Document ${docId}`;
        sections.forEach(section => {
            section.sourceDocument = finalDocName;
        });
        
        console.log(`✅ Document "${finalDocName}" processing complete with ${sections.length} sections`);
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
                
                // Pass document title for better naming of single-tab documents
                const tabSections = this.extractSectionsFromTab(tab, tabIndex, doc.title);
                sections.push(...tabSections);
            }
        } else if (doc.body) {
            console.log('Processing single-tab document');
            const bodySections = this.extractSectionsFromBody(doc.body, doc.title || 'Document');
            sections.push(...bodySections);
        }

        console.log('Total sections extracted:', sections.length);
        return sections;
    }

    extractSectionsFromTab(tab, tabIndex, documentTitle = null) {
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

        // For single-tab documents, use the document title instead of "Tab 1"
        const effectiveTabName = (tabTitle === 'Tab 1' && documentTitle) ? documentTitle : tabTitle;
        return this.extractSectionsFromBody(body, effectiveTabName);
    }

    extractSectionsFromBody(body, parentName) {
        const sections = [];
        let currentSection = null;
        let allContent = ''; // Track all content for fallback

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

                // Track all content
                allContent += formattedText + '\n';

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

        // Add final section
        if (currentSection && currentSection.content.trim()) {
            sections.push(currentSection);
        }

        // If no sections were created but we have content, create a default section
        if (sections.length === 0 && allContent.trim()) {
            console.log(`⚠️ No headers found in ${parentName}, creating single section with all content`);
            sections.push({
                title: parentName,
                content: allContent.trim(),
                level: 1,
                parentTab: parentName
            });
        }

        // If we only have one section and it's named after the tab, rename it to use the document name
        if (sections.length === 1 && sections[0].title === parentName && parentName.startsWith('Tab ')) {
            // This is a single-tab document, use a more meaningful name
            const meaningfulName = sections[0].sourceDocument || parentName.replace('Tab ', 'Document ');
            console.log(`📝 Renaming single tab "${sections[0].title}" to "${meaningfulName}"`);
            sections[0].title = meaningfulName;
        }

        console.log(`✅ Extracted ${sections.length} sections from ${parentName}`);
        sections.forEach((section, i) => {
            console.log(`  Section ${i + 1}: "${section.title}" (${section.content.length} chars)`);
        });
        
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
            parentTab: section.parentTab,
            sourceDocument: section.sourceDocument
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

    createMarkdownFilesFromFolder(pages) {
        console.log(`📂 Creating markdown files for ${pages.length} pages`);
        const files = [];
        const documentGroups = {};

        // Debug: Log all pages and their properties
        pages.forEach((page, i) => {
            console.log(`Page ${i + 1}: "${page.title}" from "${page.sourceDocument}" (parentTab: "${page.parentTab}")`);
        });

        // Group pages by source document
        pages.forEach(page => {
            if (!page.title || page.title.trim() === '') {
                console.log('Skipping page with empty title:', page);
                return;
            }

            const sourceDoc = page.sourceDocument || 'Unknown Document';
            console.log(`Grouping page "${page.title}" under source "${sourceDoc}"`);
            
            if (!documentGroups[sourceDoc]) {
                documentGroups[sourceDoc] = [];
            }
            documentGroups[sourceDoc].push(page);
        });

        console.log(`📊 Document groups created:`, Object.keys(documentGroups));
        Object.keys(documentGroups).forEach(docName => {
            console.log(`  "${docName}": ${documentGroups[docName].length} pages`);
        });

        // Create files for each document group
        Object.keys(documentGroups).forEach(docName => {
            const docPages = documentGroups[docName];
            
            // Clean document name for folder structure
            const cleanDocName = docName
                .replace(/[^a-zA-Z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .toLowerCase();

            docPages.forEach((page, index) => {
                // Use header name as the main filename, prefixed with document name
                const cleanTitle = page.title
                    .replace(/[^a-zA-Z0-9\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .toLowerCase();
                
                const filename = `${cleanDocName}--${cleanTitle}.md`;
                console.log(`📄 Creating file: ${filename} for page "${page.title}" from "${docName}"`);

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

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the converter when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DocsToNotionConverter();
});