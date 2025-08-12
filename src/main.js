class DocsToNotionConverter {
    constructor() {
        this.OPENAI_API_KEY = import.meta.env.VITE_API_KEY;
        this.form = document.getElementById('conversionForm');
        this.generateBtn = document.getElementById('generateBtn');
        this.spinner = document.getElementById('spinner');
        this.btnText = document.getElementById('btnText');
        this.status = document.getElementById('status');
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');

        this.init();
    }

    async processDocument() {
        const docUrl = document.getElementById('docUrl').value;

        if (!this.validateGoogleDocsUrl(docUrl)) {
            this.showStatus('Please enter a valid Google Docs share link', 'error');
            return;
        }

        if (!this.OPENAI_API_KEY) {
            this.showStatus('OpenAI API key is required', 'error');
            return;
        }

        try {
            this.setLoading(true);
            this.showProgress(0);

            // Step 1: Extract document content
            this.showStatus('🔍 Accessing Google Document...', 'processing');
            this.showProgress(15);
            const docId = this.extractDocId(docUrl);
            const docContent = await this.fetchGoogleDoc(docId);

            if (!docContent || docContent.trim().length < 50) {
                throw new Error('Unable to extract meaningful content. Ensure the document is publicly accessible or published to web.');
            }

            console.log('Content length:', docContent.length);

            // Step 2: Use GPT to analyze and structure the document
            this.showStatus('🤖 AI analyzing document structure...', 'processing');
            this.showProgress(30);
            const documentStructure = await this.analyzeDocumentStructure(docContent);

            // Step 3: Use GPT to create individual Notion pages
            this.showStatus('📝 AI generating Notion pages...', 'processing');
            this.showProgress(50);
            const notionPages = await this.generateNotionPages(docContent, documentStructure);

            // Step 4: Create ZIP file with markdown files
            this.showStatus('📦 Creating workspace bundle...', 'processing');
            this.showProgress(90);
            const markdownFiles = this.createMarkdownFiles(notionPages);

            this.showStatus('🎉 Workspace generated successfully! Download starting...', 'success');
            this.showProgress(100);

            await this.generateDownload(markdownFiles);

        } catch (error) {
            console.error('Conversion error:', error);
            this.showStatus(`❌ Error: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
            this.hideProgress();
        }
    }

    extractDocId(url) {
        const match = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) throw new Error('Invalid Google Docs URL format');
        return match[1];
    }

    async fetchGoogleDoc(docId) {
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
                            return content;
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

        // Remove unwanted elements
        doc.querySelectorAll('script, style, meta, link, head').forEach(el => el.remove());

        // Get all text content with basic structure preservation
        let content = '';
        const walker = document.createTreeWalker(
            doc.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.nodeValue.trim()) {
                content += node.nodeValue.trim() + '\n';
            }
        }

        return content;
    }

    async analyzeDocumentStructure(content) {
        const systemPrompt = `You are an expert document analyzer. Analyze the provided document content and determine how to best structure it into logical Notion pages.

Your task:
1. Identify natural sections, chapters, or logical divisions in the content
2. Suggest appropriate page titles for each section
3. Determine the best way to split the content for optimal readability in Notion
4. Consider document length - aim for 3-8 pages for most documents
5. Ensure each page will have substantial, meaningful content

Return a JSON response with this structure:
{
  "pages": [
    {
      "title": "Page Title",
      "description": "Brief description of what this page will contain",
      "estimated_length": "short|medium|long"
    }
  ],
  "total_pages": number,
  "document_type": "guide|manual|report|article|other",
  "splitting_strategy": "by_sections|by_topics|chronological|other"
}

Only return the JSON, no other text.`;

        const userPrompt = `Analyze this document and suggest how to structure it into Notion pages:\n\n${content.substring(0, 4000)}...`;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: 1000,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const structureText = data.choices[0]?.message?.content || '{}';
            
            try {
                return JSON.parse(structureText);
            } catch (parseError) {
                console.error('Failed to parse structure JSON:', parseError);
                // Fallback structure
                return {
                    pages: [
                        { title: "Main Content", description: "Primary document content", estimated_length: "long" }
                    ],
                    total_pages: 1,
                    document_type: "other",
                    splitting_strategy: "single_page"
                };
            }

        } catch (error) {
            console.error('Document structure analysis failed:', error);
            throw error;
        }
    }

    async generateNotionPages(fullContent, structure) {
        const pages = [];
        
        this.showStatus(`🤖 Creating ${structure.total_pages} Notion pages...`, 'processing');

        for (let i = 0; i < structure.pages.length; i++) {
            const pageInfo = structure.pages[i];
            
            try {
                const pageProgress = 50 + (i / structure.pages.length) * 35;
                this.showProgress(pageProgress);
                this.showStatus(`📄 Generating page ${i + 1}/${structure.pages.length}: "${pageInfo.title}"`, 'processing');

                const pageContent = await this.createNotionPage(fullContent, pageInfo, structure, i);
                pages.push(pageContent);

                // Rate limiting delay
                await this.delay(500);

            } catch (error) {
                console.error(`Failed to generate page "${pageInfo.title}":`, error);
                // Create a fallback page
                pages.push({
                    title: pageInfo.title,
                    content: `# ${pageInfo.title}\n\n*Content generation failed for this page.*\n\nOriginal content:\n\n${fullContent.substring(i * 1000, (i + 1) * 1000)}`
                });
            }
        }

        return pages;
    }

    async createNotionPage(fullContent, pageInfo, structure, pageIndex) {
        const systemPrompt = `You are a Notion page creator expert. Create a beautifully formatted Notion-compatible markdown page based on the provided content and page specifications.

Guidelines:
- Create engaging, well-structured content optimized for Notion
- Use appropriate Notion formatting: callouts, toggles, tables, task lists
- Include relevant emojis and visual elements
- Use these callout formats:
  > 💡 **Note:** for helpful tips
  > ⚠️ **Important:** for critical information
  > ✅ **Success:** for achievements/completions
  > 📋 **Summary:** for summaries
- Create toggle lists using HTML details/summary for long lists
- Add task checkboxes (- [ ]) for actionable items
- Use proper heading hierarchy (# ## ###)
- Make content scannable with bullet points and formatting
- Preserve all important information from the source
- Do not include any introductory text or explanations. No additinal text.

Page Information:
- Title: ${pageInfo.title}
- Description: ${pageInfo.description}
- Page ${pageIndex + 1} of ${structure.total_pages}
- Document Type: ${structure.document_type}
- Strategy: ${structure.splitting_strategy}

Return only the markdown content for this specific page. Start with the page title as H1.`;

        const userPrompt = `Create a Notion page with the title "${pageInfo.title}" from this document content. Extract and format the relevant content for this specific page based on the description "${pageInfo.description}".

Full document content:
${fullContent}

Focus on content that belongs to this page based on the title and description. Make it comprehensive and well-formatted for Notion.`;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: 3000,
                    temperature: 0.2
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const pageContent = data.choices[0]?.message?.content || `# ${pageInfo.title}\n\n*Content generation failed.*`;

            return {
                title: pageInfo.title,
                content: pageContent.trim()
            };

        } catch (error) {
            console.error(`OpenAI API call failed for page "${pageInfo.title}":`, error);
            throw error;
        }
    }

    createMarkdownFiles(pages) {
        const files = [];

        pages.forEach((page, index) => {
            if (!page.title || page.title.trim() === '') return;

            // Clean the title for filename
            const cleanTitle = page.title
                .replace(/[^a-zA-Z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .toLowerCase();

            // Create filename without numbering
            const filename = `${cleanTitle}.md`;

            // Add metadata footer
            let content = page.content;
            content += `\n\n---\n\n*Generated by AI-powered Google Docs to Notion Converter on ${new Date().toLocaleDateString()}*`;

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

        // Add each file to the ZIP
        files.forEach(file => {
            console.log(`Adding file to ZIP: ${file.name} (${file.content.length} chars)`);
            zip.file(file.name, file.content);
        });

        // Generate the ZIP blob
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 6
            }
        });

        console.log('ZIP blob generated, size:', zipBlob.size);

        // Create download link
        const url = URL.createObjectURL(zipBlob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `ai-notion-workspace-${new Date().getTime()}.zip`;
        downloadLink.textContent = '📥 Download AI-Generated Workspace';
        downloadLink.className = 'download-btn';

        // Add to status div
        this.status.appendChild(document.createElement('br'));
        this.status.appendChild(downloadLink);

        // Auto-download
        setTimeout(() => {
            downloadLink.click();
            console.log('Download triggered');
        }, 1000);
    }

    validateGoogleDocsUrl(url) {
        const googleDocsPattern = /^https:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9-_]+/;
        return googleDocsPattern.test(url);
    }

    setLoading(loading) {
        this.generateBtn.disabled = loading;
        this.spinner.style.display = loading ? 'inline-block' : 'none';
        this.btnText.textContent = loading ? 'AI Processing...' : '🤖 Generate AI Workspace';
    }

    showStatus(message, type) {
        this.status.textContent = message;
        this.status.className = `status ${type}`;
        this.status.style.display = 'block';
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

    init() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.processDocument();
        });
    }
}

// Initialize the converter when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DocsToNotionConverter();
});