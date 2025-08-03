// api/upload.js - Vercel Function for File Processing
const multer = require('multer');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Helper function to run multer middleware in Vercel
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed. Use POST.',
      allowedMethods: ['POST']
    });
  }

  const startTime = Date.now();

  try {
    // Run multer middleware
    await runMiddleware(req, res, upload.single('file'));

    // Validate file upload
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded.',
        timestamp: new Date().toISOString()
      });
    }

    const buffer = req.file.buffer;
    const originalname = req.file.originalname;
    const fileSize = buffer.length;
    let extractedText = '';

    console.log(`Processing file: ${originalname} (${fileSize} bytes)`);

    // Process based on file type
    if (originalname.toLowerCase().endsWith('.docx')) {
      try {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
        
        // Log any warnings from mammoth
        if (result.messages && result.messages.length > 0) {
          console.log('Mammoth warnings:', result.messages);
        }
      } catch (docxError) {
        console.error('DOCX processing error:', docxError);
        return res.status(500).json({ 
          error: 'Failed to process DOCX file. The file may be corrupted or in an unsupported format.',
          details: docxError.message
        });
      }
    } 
    else if (originalname.toLowerCase().endsWith('.pdf')) {
      try {
        const data = await pdf(buffer);
        extractedText = data.text;
      } catch (pdfError) {
        console.error('PDF processing error:', pdfError);
        return res.status(500).json({ 
          error: 'Failed to process PDF file. The file may be corrupted, password-protected, or contain only images.',
          details: pdfError.message
        });
      }
    } 
    else {
      return res.status(400).json({ 
        error: 'Unsupported file type. Please upload a .docx or .pdf file.',
        supportedTypes: ['.docx', '.pdf']
      });
    }

    // Validate extracted text
    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(422).json({ 
        error: 'No text content could be extracted from the file. The file may be empty or contain only images.',
        extractedLength: extractedText.length
      });
    }

    const processingTime = Date.now() - startTime;
    console.log(`Successfully processed ${originalname} in ${processingTime}ms`);

    // Return successful response with metadata
    res.status(200).json({ 
      text: extractedText,
      metadata: {
        originalName: originalname,
        fileSize: fileSize,
        extractedLength: extractedText.length,
        processingTime: processingTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Unexpected error:', error);
    
    // Handle multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        error: 'File too large. Maximum size is 10MB.',
        maxSize: '10MB'
      });
    }
    
    res.status(500).json({ 
      error: 'An unexpected error occurred while processing the file.',
      details: error.message,
      processingTime: processingTime,
      timestamp: new Date().toISOString()
    });
  }
}
