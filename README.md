# CSV Merge & Translate

A tool to merge CSV/Excel files and translate the content using DeepL API.

## Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory with your DeepL API key:

```
VITE_DEEPL_API_KEY=your_deepl_api_key_here
```

You can sign up for a DeepL API key at [https://www.deepl.com/pro-api](https://www.deepl.com/pro-api)

4. Start the development server:

```bash
npm run dev
```

## Features

- Upload and merge product information files
- Automatically normalize SKUs
- Translate product information from German to English
- Download merged and translated data as CSV or Excel files 