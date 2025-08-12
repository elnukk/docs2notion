# Google Docs to Notion Workspace Converter

(Created by Elanu. Work in progress. Appreciate any feedback!)

Transform your Google Docs documents into beautifully formatted, Notion-ready workspaces with AI-powered formatting enhancements.

---

## Overview

This web app lets you paste a public Google Docs link and converts the document into a structured Notion workspace by:

- Splitting the document into pages based on headings (H1, H2, etc.)
- Enhancing formatting with GPT to add callouts, toggles, tables, and checkboxes
- Generating a ZIP file containing Markdown files, each representing a Notion page
- Providing an easy import experience into Notion

---

## Features

- Fetch Google Docs content via shareable links  
- Parse and detect document structure by headings  
- Use OpenAI GPT API to improve markdown formatting for Notion  
- Generate a downloadable ZIP of markdown files  
- Responsive and clean UI with progress and status updates  

---

## Getting Started

### Prerequisites

- OpenAI API key (set as environment variable `OPENAI_API_KEY`)  


### Installation

1. Clone the repo  
   ```bash
   git clone https://github.com/yourusername/docs-to-notion.git
   cd docs-to-notion
2. npm install
3. npm start

