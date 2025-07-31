// --- File Processing Backend Server ---
// This server is built using Node.js and the Express framework.
// Its purpose is to receive file uploads, extract text from them, and return the text.

// --- 1. Import Necessary Libraries ---

const express = require('express'); // The web server framework
const multer = require('multer'); // A library to handle file uploads (multipart/form-data)
const cors = require('cors'); // A library to allow requests from our front-end app
const mammoth = require('mammoth'); // A library to extract text from .docx files
const pdf = require('pdf-parse'); // A library to extract text from .pdf files

// --- 2. Initialize the Application ---

const app = express(); // Create an instance of the Express application
const port = process.env.PORT || 3001; // Use Render's port or 3001 for local dev

// --- 3. Configure Middleware ---

// Enable CORS (Cross-Origin Resource Sharing)
// This is crucial for allowing our React app (running on a different port) to communicate with this server.
app.use(cors());

// Set up Multer for file storage. We'll store files in memory temporarily for processing.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- 4. Define the API Endpoint for File Uploads ---

// We create a 'POST' endpoint at the URL '/upload'.
// The 'upload.single('file')' part tells Multer to expect a single file named 'file'.
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // Check if a file was actually uploaded. If not, send an error.
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    // Get the buffer (the raw data of the file) and the original filename.
    const buffer = req.file.buffer;
    const originalname = req.file.originalname;
    let extractedText = '';

    // --- 5. Process the File Based on its Type ---

    // Check if the filename ends with .docx
    if (originalname.endsWith('.docx')) {
      // Use the mammoth library to extract raw text from the .docx file buffer.
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } 
    // Check if the filename ends with .pdf
    else if (originalname.endsWith('.pdf')) {
      // Use the pdf-parse library to extract text from the .pdf file buffer.
      const data = await pdf(buffer);
      extractedText = data.text;
    } 
    // If the file type is not supported, send an error.
    else {
      return res.status(400).json({ error: 'Unsupported file type. Please upload a .docx or .pdf file.' });
    }

    // --- 6. Send the Extracted Text Back to the Front-End ---

    // If everything was successful, send a 200 OK status and a JSON object
    // containing the extracted text.
    res.status(200).json({ text: extractedText });

  } catch (error) {
    // If any error occurs during the process, log it to the console
    // and send a 500 Internal Server Error response.
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Failed to process file.' });
  }
});

// --- 7. Start the Server ---

// Tell the Express app to listen for requests on the specified port.
app.listen(port, () => {
  console.log(`File processing server is running on port ${port}`);
});
