// Working App.js - Compatible with current setup
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
const initialLessonPlans = {
  '1': [{ id: 'lp1', name: 'Foreshadowing in "The Tell-Tale Heart"', content: 'Objective: Students will analyze the use of foreshadowing in "The Tell-Tale Heart".\n\nActivities:\n1. Warm-up: Define foreshadowing.\n2. Read the story aloud as a class.\n3. In small groups, find three examples of foreshadowing and discuss their effect.' }],
  '2': [{ id: 'lp2', name: 'Show, Don\'t Tell Practice', content: 'Objective: Students will practice "show, don\'t tell" in their writing.\n\nActivity: Write a one-page scene describing a character who is nervous, without using the word "nervous".' }],
  '3': [{ id: 'lp3', name: 'Intro to Shakespeare', content: 'Objective: Introduce key themes and language in Shakespeare\'s works.' }],
};

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyAVwrI84WWe2DCygVBeajXkSbMeUgAqKAM",
  authDomain: "iep-harmony.firebaseapp.com",
  projectId: "iep-harmony",
  storageBucket: "iep-harmony.appspot.com",
  messagingSenderId: "544928586200",
  appId: "1:544928586200:web:65436924b74558c04abaad",
  measurementId: "G-6HRVNZF1R0"
};

const appId = 'iep-harmony-app';

// Keep server warm function
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

// Enhanced file processing
const processFileUpload = async (file, mode, showNotification, handleFileContent, setIsProcessingFile) => {
    setIsProcessingFile(true);
    showNotification(`Processing ${file.name}...`);
    
    try {
        // Warm server first
        await keepServerWarm();
        
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
        showNotification("File processed successfully!");
    } catch (error) {
        console.error('File processing error:', error);
        showNotification(`Could not process file: ${error.message}`, true);
    } finally {
        setIsProcessingFile(false);
    }
};

// Enhanced AI Analysis with resource generation
const enhancedAIAnalysis = async (accommodations, lessonContent) => {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY || "";
    
    const prompt = `You are an expert instructional coach specializing in special education and Universal Design for Learning (UDL). 

Analyze this lesson plan against the required accommodations and provide downloadable resources for unmet accommodations.

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

// --- REUSABLE COMPONENTS ---
const FileUploadZone = ({ onFileUpload, fileType }) => {
  const [isDragging, setIsDragging] = useState(false);
  const handleDrag = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(e.type === 'dragenter' || e.type === 'dragover'); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) onFileUpload(e.dataTransfer.files[0], fileType);
  };
  const handleChange = (e) => { if (e.target.files?.[0]) onFileUpload(e.target.files[0], fileType); };

  return (
    <div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 ${isDragging ? 'border-indigo-600 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'}`}>
      <input type="file" id={`file-upload-${fileType}`} className="absolute w-full h-full opacity-0 cursor-pointer" onChange={handleChange} accept=".pdf,.docx"/>
      <label htmlFor={`file-upload-${fileType}`} className="cursor-pointer">
        <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600"><span className="font-semibold text-indigo-600">Click to upload</span> or drag and drop</p>
        <p className="text-xs text-gray-500">PDF, DOCX supported</p>
      </label>
    </div>
  );
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

// --- MAIN APP COMPONENT ---
export default function App() {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [lessonPlans, setLessonPlans] = useState([]);
  const [selectedLessonPlanId, setSelectedLessonPlanId] = useState(null);
  const [lessonPlanContent, setLessonPlanContent] = useState('');
  
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  
  // Firebase state
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);

  // Modal state
  const [isAddClassModalOpen, setAddClassModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [isDeleteClassModalOpen, setDeleteClassModalOpen] = useState(false);
  const [classToDelete, setClassToDelete] = useState(null);
  const [isAddLessonPlanModalOpen, setAddLessonPlanModalOpen] = useState(false);
  const [newLessonPlanName, setNewLessonPlanName] = useState('');
  const [isDeleteLessonPlanModalOpen, setDeleteLessonPlanModalOpen] = useState(false);
  const [lessonPlanToDelete, setLessonPlanToDelete] = useState(null);
  const [isUploadAccommodationModalOpen, setUploadAccommodationModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [isUploadLessonPlanModalOpen, setUploadLessonPlanModalOpen] = useState(false);
  const [isRenameAndUploadModalOpen, setRenameAndUploadModalOpen] = useState(false);
  const [renameLessonPlanTitle, setRenameLessonPlanTitle] = useState('');

  const accommodationChangeTimeout = useRef(null);
  const lessonPlanChangeTimeout = useRef(null);
  const saveStatusTimeout = useRef(null);
  
  // Derived state variables
  const selectedClass = classes.find(c => c.id === selectedClassId);
  const sortedClasses = [...classes].sort((a, b) => a.name.localeCompare(b.name));
  const selectedLessonPlan = lessonPlans.find(lp => lp.id === selectedLessonPlanId);

  // Keep server warm on component mount
  useEffect(() => {
    keepServerWarm();
    // Keep server warm every 10 minutes
    const warmInterval = setInterval(keepServerWarm, 10 * 60 * 1000);
    return () => clearInterval(warmInterval);
  }, []);

  // --- FIREBASE INITIALIZATION & DATA LOADING ---
  useEffect(() => {
    try {
      if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("PASTE_YOUR")) {
        setError("Firebase config is missing. Please add your credentials.");
        return;
      }

      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const firestore = getFirestore(app);
      setDb(firestore);

      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          signInAnonymously(auth).catch((error) => {
            console.error("Anonymous authentication failed:", error);
            setError("Authentication failed.");
          });
        }
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Firebase initialization error:", error);
      setError("Failed to initialize Firebase.");
    }
  }, []);

  // Load classes when user is authenticated
  useEffect(() => {
    if (db && userId) {
      const classesRef = collection(db, 'artifacts', appId, 'users', userId, 'classes');
      const unsubscribe = onSnapshot(classesRef, (snapshot) => {
        if (snapshot.empty) {
          setClasses(initialClasses);
          setSelectedClassId(initialClasses[0].id);
        } else {
          const loadedClasses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setClasses(loadedClasses);
          if (!selectedClassId && loadedClasses.length > 0) {
            setSelectedClassId(loadedClasses[0].id);
          }
        }
      });

      return () => unsubscribe();
    }
  }, [db, userId]);

  // Load lesson plans for selected class
  useEffect(() => {
    if (db && userId && selectedClassId) {
      const lessonPlansRef = collection(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans');
      const unsubscribe = onSnapshot(lessonPlansRef, (snapshot) => {
        if (snapshot.empty) {
          const initialPlans = initialLessonPlans[selectedClassId] || [{ id: 'new', name: 'New Lesson Plan', content: '' }];
          setLessonPlans(initialPlans);
          setSelectedLessonPlanId(initialPlans[0].id);
          setLessonPlanContent(initialPlans[0].content || '');
        } else {
          const loadedPlans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setLessonPlans(loadedPlans);
          if (!selectedLessonPlanId && loadedPlans.length > 0) {
            setSelectedLessonPlanId(loadedPlans[0].id);
            setLessonPlanContent(loadedPlans[0].content || '');
          }
        }
      });

      return () => unsubscribe();
    }
  }, [db, userId, selectedClassId]);

  // Update lesson plan content when selection changes
  useEffect(() => {
    if (selectedLessonPlan) {
      setLessonPlanContent(selectedLessonPlan.content || '');
      const analysisResult = selectedLessonPlan.analysisResult;
      if (analysisResult) {
        try {
          setAnalysisResult(JSON.parse(analysisResult));
        } catch (e) {
          setAnalysisResult(null);
        }
      } else {
        setAnalysisResult(null);
      }
    }
  }, [selectedLessonPlan]);

  // Notification system
  const showTempNotification = (message, isError = false) => {
    if (isError) {
      setError(message);
      setTimeout(() => setError(null), 4000);
    } else {
      setNotification(message);
      setTimeout(() => setNotification(null), 3000);
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

  const handleFileUpload = (file, fileType) => {
    if (fileType === 'accommodations') {
        if (!selectedClass?.accommodations?.trim()) {
            processFileUpload(file, 'replace', showTempNotification, handleFileContent, setIsProcessingFile);
        } else {
            setPendingFile(file);
            setUploadAccommodationModalOpen(true);
        }
    } else if (fileType === 'lessonplan') {
        if (!selectedLessonPlan) {
            showTempNotification("Please select a lesson plan to add content to.", true);
            return;
        }
        if (selectedLessonPlan.name === 'New Lesson Plan') {
            setPendingFile(file);
            setRenameLessonPlanTitle(file.name.replace(/\.(docx|pdf)$/i, ''));
            setRenameAndUploadModalOpen(true);
        } else if (!lessonPlanContent.trim()) {
            processFileUpload(file, 'replace-lesson', showTempNotification, handleFileContent, setIsProcessingFile);
        } else {
            setPendingFile(file);
            setUploadLessonPlanModalOpen(true);
        }
    }
  };

  const handleConfirmAccommodationUpload = (mode) => {
      if (pendingFile) {
          processFileUpload(pendingFile, mode, showTempNotification, handleFileContent, setIsProcessingFile);
      }
      setUploadAccommodationModalOpen(false);
      setPendingFile(null);
  };

  const handleConfirmLessonPlanUpload = (mode) => {
      if (pendingFile) {
          processFileUpload(pendingFile, mode, showTempNotification, handleFileContent, setIsProcessingFile);
      }
      setUploadLessonPlanModalOpen(false);
      setPendingFile(null);
  };

  const handleConfirmRenameAndUpload = async () => {
    if (pendingFile && renameLessonPlanTitle.trim() && selectedLessonPlanId) {
        const file = pendingFile;
        const title = renameLessonPlanTitle.trim();

        setRenameAndUploadModalOpen(false);
        setPendingFile(null);
        setRenameLessonPlanTitle('');
        showTempNotification(`Renaming and processing ${file.name}...`);

        try {
            const docRef = doc(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans', selectedLessonPlanId);
            await updateDoc(docRef, { name: title });
            processFileUpload(file, 'replace-lesson', showTempNotification, handleFileContent, setIsProcessingFile);
        } catch (error) {
            showTempNotification(`Could not rename and upload.`, true);
        }
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

  // Other handlers (existing functions)
  const openDeleteClassModal = (classId) => {
      const cls = classes.find(c => c.id === classId);
      if (cls) {
          setClassToDelete(cls);
          setDeleteClassModalOpen(true);
      }
  };

  const confirmDeleteClass = async () => {
      if (classToDelete) {
          try {
              await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'classes', classToDelete.id));
              showTempNotification("Class deleted.");
              setDeleteClassModalOpen(false);
              setClassToDelete(null);
          } catch(e) { showTempNotification("Error deleting class.", true); console.error(e); }
      }
  };

  const handleAddNewClass = async () => {
      if (newClassName.trim() && db && userId) {
          try {
              await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'classes'), {
                  name: newClassName.trim(),
                  accommodations: ''
              });
              showTempNotification("Class added.");
              setAddClassModalOpen(false);
              setNewClassName('');
          } catch(e) { showTempNotification("Error adding class.", true); console.error(e); }
      }
  };

  const handleAddNewLessonPlan = async () => {
      if (newLessonPlanName.trim() && selectedClassId && db && userId) {
          try {
              await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans'), {
                  name: newLessonPlanName.trim(),
                  content: ''
              });
              showTempNotification("Lesson plan added.");
              setAddLessonPlanModalOpen(false);
              setNewLessonPlanName('');
          } catch(e) { showTempNotification("Error adding lesson plan.", true); console.error(e); }
      }
  };
  
  const openDeleteLessonPlanModal = () => {
      if (selectedLessonPlan) {
          setLessonPlanToDelete(selectedLessonPlan);
          setDeleteLessonPlanModalOpen(true);
      }
  };

  const confirmDeleteLessonPlan = async () => {
      if (lessonPlanToDelete) {
          try {
              await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans', lessonPlanToDelete.id));
              showTempNotification("Lesson plan deleted.");
              setDeleteLessonPlanModalOpen(false);
              setLessonPlanToDelete(null);
          } catch(e) { showTempNotification("Error deleting lesson plan.", true); console.error(e); }
      }
  };

  const handleAccommodationChange = (text) => {
    setClasses(classes.map(c => c.id === selectedClassId ? { ...c, accommodations: text } : c));
    setSaveStatus('saving');
    if (accommodationChangeTimeout.current) clearTimeout(accommodationChangeTimeout.current);
    accommodationChangeTimeout.current = setTimeout(async () => {
        if (db && userId && selectedClassId) {
            const docRef = doc(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId);
            try { 
                await setDoc(docRef, { accommodations: text }, { merge: true });
                setSaveStatus('saved');
                if(saveStatusTimeout.current) clearTimeout(saveStatusTimeout.current);
                saveStatusTimeout.current = setTimeout(() => setSaveStatus('idle'), 2000);
            } 
            catch (e) { console.error("Autosave error:", e); setSaveStatus('idle');}
        }
    }, 750);
  };

  const handleLessonPlanContentChange = (text) => {
    setLessonPlanContent(text);
    setSaveStatus('saving');
    if (lessonPlanChangeTimeout.current) clearTimeout(lessonPlanChangeTimeout.current);
    lessonPlanChangeTimeout.current = setTimeout(async () => {
        if (db && userId && selectedClassId && selectedLessonPlanId) {
            const docRef = doc(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans', selectedLessonPlanId);
            try { 
                await updateDoc(docRef, { content: text, analysisResult: null });
                setSaveStatus('saved');
                if(saveStatusTimeout.current) clearTimeout(saveStatusTimeout.current);
                saveStatusTimeout.current = setTimeout(() => setSaveStatus('idle'), 2000);
            } 
            catch (e) { console.error("Autosave error for lesson plan:", e); setSaveStatus('idle');}
        }
    }, 750);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      {notification && <div className="fixed top-5 right-5 bg-blue-500 text-white py-2 px-4 rounded-lg shadow-lg animate-fade-in-out z-50">{notification}</div>}
      {error && <div className="fixed top-5 right-5 bg-red-500 text-white py-2 px-4 rounded-lg shadow-lg animate-fade-in-out z-50">{error}</div>}
      
      {/* File processing indicator */}
      {isProcessingFile && (
          <div className="fixed top-20 right-5 bg-yellow-500 text-white py-2 px-4 rounded-lg shadow-lg z-50 flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
              Processing file...
          </div>
      )}
      
      <header className="bg-white shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3"><BrainCircuit className="h-8 w-8 text-indigo-600" /><h1 className="text-2xl font-bold text-gray-900">IEP Harmony</h1></div>
          <div className="text-sm text-gray-500 flex items-center space-x-2">
            {saveStatus === 'saving' && <span className="animate-pulse">Saving...</span>}
            {saveStatus === 'saved' && <span className="flex items-center text-green-600"><Check size={16} className="mr-1"/> Saved</span>}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg-col-span-1 space-y-6">
            <div className="bg-white p-5 rounded-xl shadow-sm">
              <h2 className="text-lg font-semibold flex items-center mb-4"><ListChecks className="mr-2 text-indigo-500"/>Class Accommodations</h2>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <select value={selectedClassId || ''} onChange={(e) => setSelectedClassId(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500">
                    {sortedClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={() => setAddClassModalOpen(true)} className="p-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600"><Plus size={20}/></button>
                  <button onClick={() => openDeleteClassModal(selectedClassId)} disabled={!selectedClass} className="p-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:bg-gray-300"><Trash2 size={20}/></button>
                </div>
                {selectedClass ? (
                  <div className="pt-4 border-t">
                    <FileUploadZone onFileUpload={handleFileUpload} fileType="accommodations" />
                    <div className="my-4 text-center text-sm text-gray-400">OR</div>
                    <p className="text-sm text-gray-600 mb-3">Paste or edit accommodations for <span className="font-semibold">{selectedClass.name}</span>.</p>
                    <textarea value={selectedClass.accommodations || ''} onChange={(e) => handleAccommodationChange(e.target.value)} placeholder="Enter accommodations, one per line..." className="w-full p-3 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" rows="8"/>
                  </div>
                ) : (
                  <div className="text-center py-10 text-gray-500">
                    <p>{userId ? "No classes found." : "Connecting to database..."}</p>
                    {userId && <button onClick={() => setAddClassModalOpen(true)} className="mt-2 text-indigo-600 font-semibold">Create a new class to begin.</button>}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-5 rounded-xl shadow-sm">
              <div className="flex justify-between items-center mb-4">
                 <h2 className="text-lg font-semibold flex items-center"><FileText className="mr-2 text-green-500"/>Lesson Plan</h2>
                 <div className="flex items-center space-x-2">
                    <select value={selectedLessonPlanId || ''} onChange={e => setSelectedLessonPlanId(e.target.value)} className="p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm" disabled={lessonPlans.length === 0}>
                        {lessonPlans.map(lp => <option key={lp.id} value={lp.id}>{lp.name}</option>)}
                    </select>
                    <button onClick={() => setAddLessonPlanModalOpen(true)} className="p-2 bg-green-500 text-white rounded-md hover:bg-green-600"><Plus size={20}/></button>
                    <button onClick={openDeleteLessonPlanModal} disabled={!selectedLessonPlan} className="p-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:bg-gray-300"><Trash2 size={20}/></button>
                 </div>
              </div>
              <FileUploadZone onFileUpload={handleFileUpload} fileType="lessonplan" />
              <div className="my-4 text-center text-sm text-gray-400">OR</div>
              <textarea className="w-full h-64 p-4 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm leading-6 bg-white" placeholder={selectedClass ? "Select or create a lesson plan to begin." : "Select a class first."} value={lessonPlanContent} onChange={(e) => handleLessonPlanContentChange(e.target.value)} disabled={!selectedLessonPlan}/>
              <div className="mt-4 flex justify-end">
                <button onClick={handleAnalyze} disabled={isLoading || !lessonPlanContent || !selectedClass} className="flex items-center justify-center bg-green-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200">
                  {isLoading ? 'Analyzing...' : 'Run AI Analysis'}
                </button>
              </div>
            </div>
            {analysisResult && <AnalysisReport result={analysisResult} />}
          </div>
        </div>
      </main>

      {/* Modals */}
      <Modal isOpen={isAddClassModalOpen} onClose={() => setAddClassModalOpen(false)}>
        <h3 className="text-lg font-semibold mb-4">Add New Class</h3>
        <input type="text" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="e.g., Period 5 - Geometry" className="w-full p-2 border border-gray-300 rounded-md mb-4" autoFocus />
        <div className="flex justify-end space-x-2">
            <button onClick={() => setAddClassModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
            <button onClick={handleAddNewClass} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Add Class</button>
        </div>
      </Modal>

      <Modal isOpen={isDeleteClassModalOpen} onClose={() => setDeleteClassModalOpen(false)}>
        <h3 className="text-lg font-semibold mb-2">Confirm Deletion</h3>
        <p className="text-gray-600 mb-4">Are you sure you want to delete the class "{classToDelete?.name}"? This action cannot be undone.</p>
        <div className="flex justify-end space-x-2">
            <button onClick={() => setDeleteClassModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
            <button onClick={confirmDeleteClass} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">Delete</button>
        </div>
      </Modal>

      <Modal isOpen={isAddLessonPlanModalOpen} onClose={() => setAddLessonPlanModalOpen(false)}>
        <h3 className="text-lg font-semibold mb-4">Add New Lesson Plan</h3>
        <input type="text" value={newLessonPlanName} onChange={(e) => setNewLessonPlanName(e.target.value)} placeholder="e.g., Unit 1: The Odyssey" className="w-full p-2 border border-gray-300 rounded-md mb-4" autoFocus />
        <div className="flex justify-end space-x-2">
            <button onClick={() => setAddLessonPlanModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
            <button onClick={handleAddNewLessonPlan} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Add Plan</button>
        </div>
      </Modal>
      
      <Modal isOpen={isDeleteLessonPlanModalOpen} onClose={() => setDeleteLessonPlanModalOpen(false)}>
        <h3 className="text-lg font-semibold mb-2">Confirm Deletion</h3>
        <p className="text-gray-600 mb-4">Are you sure you want to delete the lesson plan "{lessonPlanToDelete?.name}"? This action cannot be undone.</p>
        <div className="flex justify-end space-x-2">
            <button onClick={() => setDeleteLessonPlanModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
            <button onClick={confirmDeleteLessonPlan} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">Delete</button>
        </div>
      </Modal>
      
      <Modal isOpen={isUploadAccommodationModalOpen} onClose={() => setUploadAccommodationModalOpen(false)}>
        <h3 className="text-lg font-semibold mb-4">Update Accommodations</h3>
        <p className="text-gray-600 mb-4">How would you like to add the accommodations from the uploaded file?</p>
        <div className="flex justify-end space-x-2">
            <button onClick={() => handleConfirmAccommodationUpload('replace')} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Replace Existing</button>
            <button onClick={() => handleConfirmAccommodationUpload('merge')} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Add to Existing</button>
        </div>
      </Modal>

      <Modal isOpen={isUploadLessonPlanModalOpen} onClose={() => setUploadLessonPlanModalOpen(false)}>
        <h3 className="text-lg font-semibold mb-4">Update Lesson Plan Content</h3>
        <p className="text-gray-600 mb-4">How would you like to add the content from the uploaded file to the current lesson plan?</p>
        <div className="flex justify-end space-x-2">
            <button onClick={() => handleConfirmLessonPlanUpload('replace-lesson')} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Replace Existing</button>
            <button onClick={() => handleConfirmLessonPlanUpload('merge-lesson')} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Add to Existing</button>
        </div>
      </Modal>
      
      <Modal isOpen={isRenameAndUploadModalOpen} onClose={() => setRenameAndUploadModalOpen(false)} preventCloseOnOutsideClick={true}>
        <h3 className="text-lg font-semibold mb-4">Title Your Lesson Plan</h3>
        <input 
            type="text" 
            value={renameLessonPlanTitle} 
            onChange={(e) => setRenameLessonPlanTitle(e.target.value)} 
            placeholder="Enter a title for the lesson plan" 
            className="w-full p-2 border border-gray-300 rounded-md mb-4" 
            autoFocus 
            onFocus={(e) => e.target.select()} 
        />
        <div className="flex justify-end space-x-2">
            <button onClick={() => setRenameAndUploadModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
            <button onClick={handleConfirmRenameAndUpload} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Save Title and Upload</button>
        </div>
      </Modal>

    </div>
  );
}
