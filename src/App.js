// Enhanced App.js with fixes for file upload delays, modal sensitivity, and AI-generated resources

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrainCircuit, FileText, AlertCircle, CheckCircle, XCircle, ListChecks, UploadCloud, Link, Plus, Trash2, Edit, ChevronDown, ChevronUp, Check, Download } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, doc, deleteDoc, setDoc, writeBatch, updateDoc } from 'firebase/firestore';

// --- INITIAL STATE (for first-time users) ---
const initialClasses = [
  { id: '1', name: 'Period 1 - English 9', accommodations: 'Extended time on tests (1.5x)\nProvide notes/slides in advance\nRequires text-to-speech software' },
  { id: '2', name: 'Period 3 - Creative Writing', accommodations: 'Option for verbal responses\nUse of spell-checker\nGraphic organizer for multi-step projects' },
  { id: '3', name: 'Period 4 - English 9', accommodations: 'Extended time on tests (1.5x)\nPreferential seating\nFrequent breaks' },
];

// ... Firebase config and other constants remain the same ...

// Enhanced client-side file processing to reduce server dependency
const processFileClientSide = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const text = e.target.result;
      // For PDFs, we'll still need server processing, but for text files we can handle client-side
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        resolve(text);
      } else {
        // Fall back to server processing for PDFs and DOCX
        resolve(null);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      reader.readAsText(file);
    } else {
      resolve(null); // Indicates server processing needed
    }
  });
};

// Keep server connection warm
const keepServerWarm = async () => {
  try {
    await fetch("https://iep-harmony-backend.onrender.com/health", { method: 'GET' });
  } catch (error) {
    console.log('Server warming failed - server may be sleeping');
  }
};

// Enhanced Modal component with better text selection handling
const Modal = ({ isOpen, onClose, children, preventCloseOnOutsideClick = false }) => {
    const [isMouseDown, setIsMouseDown] = useState(false);
    
    if (!isOpen) return null;

    const handleMouseDown = (e) => {
        if (e.target === e.currentTarget && !preventCloseOnOutsideClick) {
            setIsMouseDown(true);
        }
    };

    const handleMouseUp = (e) => {
        if (e.target === e.currentTarget && isMouseDown && !preventCloseOnOutsideClick) {
            onClose();
        }
        setIsMouseDown(false);
    };

    const handleMouseLeave = () => {
        setIsMouseDown(false);
    };

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center" 
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
        >
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                {children}
            </div>
        </div>
    );
};

// Enhanced AI Analysis with resource generation
const enhancedAIAnalysis = async (accommodations, lessonContent) => {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY || "";
    
    const prompt = `You are an expert instructional coach specializing in special education and Universal Design for Learning (UDL). 

Analyze this lesson plan against the required accommodations and provide:
1. Status analysis for each accommodation
2. Downloadable resources for unmet accommodations

LESSON PLAN:
${lessonContent}

ACCOMMODATIONS:
${accommodations}

For each accommodation, determine:
- Status: "Met", "Partially Met", or "Not Met"
- Reason: Brief explanation
- Suggestion: If not fully met, provide specific improvement suggestion
- Resource: If accommodation involves materials (graphic organizers, visual aids, etc.), provide a downloadable resource

Return as JSON with this structure:
{
  "analysis": [
    {
      "accommodation": "string",
      "status": "Met|Partially Met|Not Met",
      "reason": "string",
      "suggestion": "string (optional)",
      "resource": {
        "type": "graphic_organizer|checklist|visual_aid|worksheet|rubric",
        "title": "string",
        "description": "string",
        "content": "HTML content for the downloadable resource",
        "downloadable": true/false
      }
    }
  ]
}

Focus on creating practical, ready-to-use resources that teachers can download and use immediately.`;

    const schema = {
        type: "OBJECT",
        properties: {
            "analysis": {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        "accommodation": { "type": "STRING" },
                        "status": { "type": "STRING", "enum": ["Met", "Partially Met", "Not Met"] },
                        "reason": { "type": "STRING" },
                        "suggestion": { "type": "STRING" },
                        "resource": {
                            "type": "OBJECT",
                            "properties": {
                                "type": { "type": "STRING" },
                                "title": { "type": "STRING" },
                                "description": { "type": "STRING" },
                                "content": { "type": "STRING" },
                                "downloadable": { "type": "BOOLEAN" }
                            }
                        }
                    },
                    required: ["accommodation", "status", "reason"]
                }
            }
        },
        required: ["analysis"]
    };

    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema,
            }
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
        
        const result = await response.json();
        if (result.candidates?.[0]) {
            const jsonText = result.candidates[0].content.parts[0].text;
            return JSON.parse(jsonText);
        } else {
            throw new Error("Invalid response structure from API.");
        }
    } catch (error) {
        console.error('Enhanced AI Analysis error:', error);
        throw error;
    }
};

// Resource download function
const downloadResource = (resource) => {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>${resource.title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
        .resource-content { margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 0.9em; color: #666; }
        @media print { body { margin: 0; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>${resource.title}</h1>
        <p><strong>Type:</strong> ${resource.type.replace('_', ' ').toUpperCase()}</p>
        <p><strong>Description:</strong> ${resource.description}</p>
    </div>
    <div class="resource-content">
        ${resource.content}
    </div>
    <div class="footer">
        <p>Generated by IEP Harmony - ${new Date().toLocaleDateString()}</p>
    </div>
</body>
</html>`;
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resource.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// Enhanced Analysis Item component with resource downloads
function AnalysisItem({ item }) {
    const [isSuggestionVisible, setSuggestionVisible] = useState(false);
    const [isResourceVisible, setResourceVisible] = useState(false);
    
    const StatusIcon = ({ status }) => {
        if (status === 'Met') return <CheckCircle className="text-green-500 flex-shrink-0" />;
        if (status === 'Partially Met') return <AlertCircle className="text-yellow-500 flex-shrink-0" />;
        return <XCircle className="text-red-500 flex-shrink-0" />;
    };

    return (
        <div className="border-b last:border-b-0 py-3">
            <div className="flex items-start">
                <StatusIcon status={item.status} />
                <div className="ml-3 flex-1">
                    <p className="font-semibold text-gray-800">{item.accommodation}</p>
                    <p className="text-gray-600 text-sm">{item.reason}</p>
                </div>
            </div>
            
            {/* Suggestion Section */}
            {item.suggestion && (
                <div className="pl-8 mt-2">
                    <button 
                        onClick={() => setSuggestionVisible(!isSuggestionVisible)} 
                        className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center"
                    >
                        {isSuggestionVisible ? <ChevronUp size={16} className="mr-1" /> : <ChevronDown size={16} className="mr-1" />}
                        {isSuggestionVisible ? 'Hide Suggestion' : 'Show Suggestion'}
                    </button>
                    {isSuggestionVisible && (
                        <div className="mt-2 p-3 bg-blue-50 rounded-md">
                            <p className="text-sm text-gray-700">{item.suggestion}</p>
                        </div>
                    )}
                </div>
            )}
            
            {/* Resource Section */}
            {item.resource && item.resource.downloadable && (
                <div className="pl-8 mt-2">
                    <div className="flex items-center space-x-2">
                        <button 
                            onClick={() => setResourceVisible(!isResourceVisible)} 
                            className="text-sm font-semibold text-green-600 hover:text-green-800 flex items-center"
                        >
                            {isResourceVisible ? <ChevronUp size={16} className="mr-1" /> : <ChevronDown size={16} className="mr-1" />}
                            {isResourceVisible ? 'Hide Resource' : 'View Resource'}
                        </button>
                        <button 
                            onClick={() => downloadResource(item.resource)}
                            className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 flex items-center"
                        >
                            <Download size={14} className="mr-1" />
                            Download
                        </button>
                    </div>
                    {isResourceVisible && (
                        <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                            <h4 className="font-semibold text-green-800">{item.resource.title}</h4>
                            <p className="text-sm text-green-700 mb-2">{item.resource.description}</p>
                            <div 
                                className="text-sm bg-white p-2 border rounded max-h-32 overflow-y-auto"
                                dangerouslySetInnerHTML={{ __html: item.resource.content }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Main App Component with enhanced features
export default function App() {
    // ... existing state variables remain the same ...
    
    // Additional state for enhanced features
    const [isProcessingFile, setIsProcessingFile] = useState(false);
    
    // Keep server warm on component mount
    useEffect(() => {
        keepServerWarm();
        // Keep server warm every 10 minutes
        const warmInterval = setInterval(keepServerWarm, 10 * 60 * 1000);
        return () => clearInterval(warmInterval);
    }, []);

    // Enhanced file processing with client-side optimization
    const processFileUpload = async (file, mode) => {
        setIsProcessingFile(true);
        showTempNotification(`Processing ${file.name}...`);
        
        try {
            // Try client-side processing first
            const clientResult = await processFileClientSide(file);
            
            if (clientResult) {
                // Client-side processing successful
                handleFileContent(clientResult, mode);
                showTempNotification("File processed successfully!");
            } else {
                // Fall back to server processing
                showTempNotification(`Uploading ${file.name} to server...`);
                const formData = new FormData();
                formData.append('file', file);
                
                const response = await fetch("https://iep-harmony-backend.onrender.com/upload", {
                    method: "POST",
                    body: formData,
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'File upload failed');
                }
                
                const data = await response.json();
                handleFileContent(data.text, mode);
                showTempNotification("File processed successfully!");
            }
        } catch (error) {
            console.error('File processing error:', error);
            showTempNotification(`Could not process file: ${error.message}`, true);
        } finally {
            setIsProcessingFile(false);
        }
    };

    const handleFileContent = (content, mode) => {
        if (mode === 'replace' || mode === 'merge') {
            const current = mode === 'merge' ? (selectedClass?.accommodations || '') : '';
            handleAccommodationChange(`${current}\n${content}`.trim());
        } else if (mode === 'replace-lesson' || mode === 'merge-lesson') {
            const current = mode === 'merge-lesson' ? (lessonPlanContent || '') : '';
            handleLessonPlanContentChange(`${current}\n${content}`.trim());
        }
    };

    // Enhanced AI Analysis function
    const handleAnalyze = async () => {
        if (!selectedClass || !lessonPlanContent) {
            showTempNotification("Please select a class and lesson plan.", true);
            return;
        }
        
        const accommodationsToAnalyze = selectedClass.accommodations.split('\n').filter(a => a.trim() !== '');
        if (accommodationsToAnalyze.length === 0) {
            showTempNotification("The selected class has no accommodations listed.", true);
            return;
        }

        setIsLoading(true);
        setAnalysisResult(null);
        setError(null);

        try {
            const result = await enhancedAIAnalysis(selectedClass.accommodations, lessonPlanContent);
            setAnalysisResult(result);
            
            // Save to Firebase
            if (db && userId && selectedClassId && selectedLessonPlanId) {
                const docRef = doc(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans', selectedLessonPlanId);
                await updateDoc(docRef, { analysisResult: JSON.stringify(result) });
            }
            
            showTempNotification("Analysis completed successfully!");
        } catch (err) {
            console.error('Analysis error:', err);
            showTempNotification(`An error occurred during analysis: ${err.message}`, true);
        } finally {
            setIsLoading(false);
        }
    };

    // ... rest of the existing component logic remains the same ...

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
            {/* ... existing JSX structure ... */}
            
            {/* Enhanced modals with improved text selection */}
            <Modal isOpen={isRenameAndUploadModalOpen} onClose={() => setRenameAndUploadModalOpen(false)} preventCloseOnOutsideClick={true}>
                <h3 className="text-lg font-semibold mb-4">Title Your Lesson Plan</h3>
                <input 
                    type="text" 
                    value={renameLessonPlanTitle} 
                    onChange={(e) => setRenameLessonPlanTitle(e.target.value)} 
                    placeholder="Enter a title for the lesson plan" 
                    className="w-full p-2 border border-gray-300 rounded-md mb-4" 
                    autoFocus 
                    onFocus={(e) => e.target.select()} // Auto-select text for easy replacement
                />
                <div className="flex justify-end space-x-2">
                    <button onClick={() => setRenameAndUploadModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
                    <button onClick={handleConfirmRenameAndUpload} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Save Title and Upload</button>
                </div>
            </Modal>

            {/* File processing indicator */}
            {isProcessingFile && (
                <div className="fixed top-20 right-5 bg-yellow-500 text-white py-2 px-4 rounded-lg shadow-lg z-50 flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Processing file...
                </div>
            )}

            {/* ... rest of existing JSX ... */}
        </div>
    );
}

// Enhanced Analysis Report component
function AnalysisReport({ result }) {
    if (!result || !result.analysis) return null;

    const totalAccommodations = result.analysis.length;
    const metCount = result.analysis.filter(item => item.status === 'Met').length;
    const partiallyMetCount = result.analysis.filter(item => item.status === 'Partially Met').length;
    const notMetCount = result.analysis.filter(item => item.status === 'Not Met').length;
    const resourceCount = result.analysis.filter(item => item.resource && item.resource.downloadable).length;

    return (
        <div className="bg-white p-5 rounded-xl shadow-sm">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
                <CheckCircle className="mr-2 text-green-500"/>
                Analysis Results
            </h2>
            
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{metCount}</div>
                    <div className="text-sm text-green-700">Met</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600">{partiallyMetCount}</div>
                    <div className="text-sm text-yellow-700">Partially Met</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">{notMetCount}</div>
                    <div className="text-sm text-red-700">Not Met</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{resourceCount}</div>
                    <div className="text-sm text-blue-700">Resources</div>
                </div>
            </div>

            {/* Individual analysis items */}
            <div className="space-y-2">
                {result.analysis.map((item, index) => (
                    <AnalysisItem key={index} item={item} />
                ))}
            </div>
        </div>
    );
}
