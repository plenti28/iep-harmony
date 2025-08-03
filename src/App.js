import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrainCircuit, FileText, AlertCircle, CheckCircle, XCircle, ListChecks, UploadCloud, Link, Plus, Trash2, Edit, ChevronDown, ChevronUp, Check } from 'lucide-react';
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

// This can be a unique name for your app instance
const appId = 'iep-harmony-app';

// --- AI ANALYSIS FUNCTION - CALLS YOUR API ENDPOINT ---
const runAIAnalysis = async (accommodations, lessonContent) => {
  try {
    console.log('Starting AI Analysis...');
    
    const response = await fetch('/api/ai-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accommodations,
        lessonContent
      })
    });

    if (!response.ok) {
      console.error('API Response Error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      throw new Error(`AI Analysis failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI Analysis successful:', data);
    
    return data.results;

  } catch (error) {
    console.error('AI Analysis Error:', error);
    
    // Show user-friendly error message
    alert(`AI Analysis encountered an error: ${error.message}. Please try again or contact support if the issue persists.`);
    
    // Return empty array instead of throwing to prevent UI crash
    return [];
  }
};

// --- REUSABLE COMPONENTS ---
const FileUploadZone = ({ onFileUpload, fileType }) => {
  const [isDragging, setIsDragging] = useState(false);
  
  const handleDrag = (e) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    setIsDragging(e.type === 'dragenter' || e.type === 'dragover'); 
  };
  
  const handleDrop = (e) => {
    e.preventDefault(); 
    e.stopPropagation(); 
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) onFileUpload(e.dataTransfer.files[0], fileType);
  };
  
  const handleChange = (e) => { 
    if (e.target.files?.[0]) onFileUpload(e.target.files[0], fileType); 
  };

  return (
    <div 
      onDragEnter={handleDrag} 
      onDragLeave={handleDrag} 
      onDragOver={handleDrag} 
      onDrop={handleDrop} 
      className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 ${
        isDragging ? 'border-indigo-600 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'
      }`}
    >
      <input 
        type="file" 
        id={`file-upload-${fileType}`} 
        className="absolute w-full h-full opacity-0 cursor-pointer" 
        onChange={handleChange} 
        accept=".pdf,.docx"
      />
      <label htmlFor={`file-upload-${fileType}`} className="cursor-pointer">
        <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-semibold text-indigo-600">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-gray-500">PDF, DOCX supported</p>
      </label>
    </div>
  );
};

const Modal = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center" onClick={handleOverlayClick}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        {children}
      </div>
    </div>
  );
};

// --- NOTIFICATION COMPONENT ---
const Notification = ({ notification, onClose }) => {
  if (!notification) return null;

  // Auto-close after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [notification, onClose]);

  const getNotificationStyles = (type) => {
    const baseStyles = "fixed top-4 right-4 p-3 rounded-lg shadow-lg z-50 max-w-sm flex items-center justify-between";
    
    switch (type) {
      case 'success':
        return `${baseStyles} bg-green-500 text-white`;
      case 'error':
        return `${baseStyles} bg-red-500 text-white`;
      case 'info':
        return `${baseStyles} bg-blue-500 text-white`;
      default:
        return `${baseStyles} bg-gray-500 text-white`;
    }
  };

  return (
    <div className={getNotificationStyles(notification.type)}>
      <span className="flex-1">{notification.message}</span>
      <button 
        onClick={onClose}
        className="ml-3 text-white hover:text-gray-200 font-bold text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
};

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
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle', 'saving', 'saved'
  
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

  // Clear notification function
  const clearNotification = () => setNotification(null);

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

      // Auth state listener
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          signInAnonymously(auth).catch(console.error);
        }
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Firebase initialization error:', error);
      setError('Failed to connect to database');
    }
  }, []);

  // Load classes when user is authenticated
  useEffect(() => {
    if (!db || !userId) return;

    const unsubscribe = onSnapshot(
      collection(db, 'artifacts', appId, 'users', userId, 'classes'),
      (snapshot) => {
        const loadedClasses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setClasses(loadedClasses.length > 0 ? loadedClasses : initialClasses);
        if (loadedClasses.length === 0) {
          populateInitialData();
        }
      },
      (error) => console.error('Error loading classes:', error)
    );

    return () => unsubscribe();
  }, [db, userId]);

  // Load lesson plans when a class is selected
  useEffect(() => {
    if (!db || !userId || !selectedClassId) {
      setLessonPlans([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans'),
      (snapshot) => {
        const loadedLessonPlans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLessonPlans(loadedLessonPlans);
      },
      (error) => console.error('Error loading lesson plans:', error)
    );

    return () => unsubscribe();
  }, [db, userId, selectedClassId]);

  // Load lesson plan content when one is selected
  useEffect(() => {
    if (selectedLessonPlan) {
      setLessonPlanContent(selectedLessonPlan.content || '');
      
      // Load analysis result if it exists
      if (selectedLessonPlan.analysisResult) {
        try {
          setAnalysisResult(JSON.parse(selectedLessonPlan.analysisResult));
        } catch (error) {
          console.error('Error parsing analysis result:', error);
          setAnalysisResult(null);
        }
      } else {
        setAnalysisResult(null);
      }
    } else {
      setLessonPlanContent('');
      setAnalysisResult(null);
    }
  }, [selectedLessonPlan]);

  // --- HELPER FUNCTIONS ---
  const populateInitialData = async () => {
    if (!db || !userId) return;

    try {
      const batch = writeBatch(db);
      
      // Add initial classes
      initialClasses.forEach(classData => {
        const classRef = doc(db, 'artifacts', appId, 'users', userId, 'classes', classData.id);
        batch.set(classRef, { name: classData.name, accommodations: classData.accommodations });
      });

      await batch.commit();

      // Add initial lesson plans
      const lessonPlanBatch = writeBatch(db);
      Object.entries(initialLessonPlans).forEach(([classId, lessonPlans]) => {
        lessonPlans.forEach(lessonPlan => {
          const lpRef = doc(db, 'artifacts', appId, 'users', userId, 'classes', classId, 'lessonPlans', lessonPlan.id);
          lessonPlanBatch.set(lpRef, { name: lessonPlan.name, content: lessonPlan.content });
        });
      });

      await lessonPlanBatch.commit();
    } catch (error) {
      console.error('Error populating initial data:', error);
    }
  };

  // --- AUTO-SAVE FUNCTIONS ---
  const updateLessonPlanContentDebounced = useCallback(async (newContent) => {
    if (!selectedLessonPlanId || !selectedClassId || !db || !userId) return;

    clearTimeout(lessonPlanChangeTimeout.current);
    setSaveStatus('saving');

    lessonPlanChangeTimeout.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans', selectedLessonPlanId);
        await updateDoc(docRef, { content: newContent });
        
        setSaveStatus('saved');
        clearTimeout(saveStatusTimeout.current);
        saveStatusTimeout.current = setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (error) {
        console.error('Error saving lesson plan:', error);
        setSaveStatus('idle');
      }
    }, 1000);
  }, [selectedLessonPlanId, selectedClassId, db, userId]);

  const updateAccommodationsDebounced = useCallback(async (newAccommodations) => {
    if (!selectedClassId || !db || !userId) return;

    clearTimeout(accommodationChangeTimeout.current);

    accommodationChangeTimeout.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId);
        await updateDoc(docRef, { accommodations: newAccommodations });
      } catch (error) {
        console.error('Error updating accommodations:', error);
      }
    }, 1000);
  }, [selectedClassId, db, userId]);

  // --- EVENT HANDLERS ---
  const handleLessonPlanContentChange = (newContent) => {
    setLessonPlanContent(newContent);
    updateLessonPlanContentDebounced(newContent);
  };

  const handleAccommodationsChange = (newAccommodations) => {
    setClasses(classes.map(c => 
      c.id === selectedClassId ? { ...c, accommodations: newAccommodations } : c
    ));
    updateAccommodationsDebounced(newAccommodations);
  };

  const runAnalysis = async () => {
    if (!selectedClass || !selectedClass.accommodations || !lessonPlanContent) {
      alert('Please select a class with accommodations and add lesson plan content before running analysis.');
      return;
    }

    setIsLoading(true);
    try {
      const results = await runAIAnalysis(selectedClass.accommodations, lessonPlanContent);
      
      if (results && results.length > 0) {
        const analysisData = { analysis: results };
        setAnalysisResult(analysisData);

        // Save to Firebase
        if (db && userId && selectedClassId && selectedLessonPlanId) {
          const docRef = doc(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans', selectedLessonPlanId);
          await updateDoc(docRef, { analysisResult: JSON.stringify(analysisData) });
        }
      }
    } catch (error) {
      console.error('AI Analysis failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- REAL FILE UPLOAD HANDLER ---
  const handleFileUpload = async (file, type) => {
    try {
      // Show loading notification
      setNotification({
        type: 'info',
        message: `Processing ${file.name}...`
      });

      // Clear any previous errors
      setError(null);

      // Validate file type
      const allowedTypes = ['.pdf', '.docx'];
      const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
      
      if (!allowedTypes.includes(fileExtension)) {
        throw new Error('Unsupported file type. Please upload a PDF or DOCX file.');
      }

      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new Error('File too large. Maximum size is 10MB.');
      }

      // Create FormData
      const formData = new FormData();
      formData.append('file', file);

      console.log(`Processing file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

      // Send to API endpoint
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      // Handle response
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const extractedContent = result.text;
      
      // Log success
      console.log(`Successfully processed ${file.name}:`, {
        originalSize: file.size,
        extractedLength: extractedContent.length,
        processingTime: result.metadata?.processingTime
      });

      // Success notification
      setNotification({
        type: 'success',
        message: `Successfully processed ${file.name} (${(extractedContent.length / 1000).toFixed(1)}k characters extracted)`
      });

      // Handle the extracted content based on type
      if (type === 'accommodation') {
        setPendingFile({ content: extractedContent, type });
        setUploadAccommodationModalOpen(true);
      } else if (type === 'lessonPlan') {
        if (selectedLessonPlanId) {
          setPendingFile({ content: extractedContent, type });
          setUploadLessonPlanModalOpen(true);
        } else {
          setRenameLessonPlanTitle(file.name.replace(/\.[^/.]+$/, ''));
          setPendingFile({ content: extractedContent, type });
          setRenameAndUploadModalOpen(true);
        }
      }

    } catch (error) {
      console.error('File upload error:', error);
      setError(error.message);
      setNotification({
        type: 'error',
        message: error.message
      });
    }
  };

  // --- MODAL HANDLERS ---
  const handleAddClass = async () => {
    if (!newClassName.trim() || !db || !userId) return;
    
    try {
      const classesRef = collection(db, 'artifacts', appId, 'users', userId, 'classes');
      await addDoc(classesRef, { name: newClassName.trim(), accommodations: '' });
      setNewClassName('');
      setAddClassModalOpen(false);
    } catch (error) {
      console.error('Error adding class:', error);
    }
  };

  const handleDeleteClass = async () => {
    if (!classToDelete || !db || !userId) return;
    
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'classes', classToDelete.id));
      if (selectedClassId === classToDelete.id) {
        setSelectedClassId(null);
        setSelectedLessonPlanId(null);
      }
      setDeleteClassModalOpen(false);
      setClassToDelete(null);
    } catch (error) {
      console.error('Error deleting class:', error);
    }
  };

  const handleAddLessonPlan = async () => {
    if (!newLessonPlanName.trim() || !selectedClassId || !db || !userId) return;
    
    try {
      const lessonPlansRef = collection(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans');
      const docRef = await addDoc(lessonPlansRef, { 
        name: newLessonPlanName.trim(), 
        content: '',
        analysisResult: null
      });
      setSelectedLessonPlanId(docRef.id);
      setNewLessonPlanName('');
      setAddLessonPlanModalOpen(false);
    } catch (error) {
      console.error('Error adding lesson plan:', error);
    }
  };

  const handleDeleteLessonPlan = async () => {
    if (!lessonPlanToDelete || !selectedClassId || !db || !userId) return;
    
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans', lessonPlanToDelete.id));
      if (selectedLessonPlanId === lessonPlanToDelete.id) {
        setSelectedLessonPlanId(null);
      }
      setDeleteLessonPlanModalOpen(false);
      setLessonPlanToDelete(null);
    } catch (error) {
      console.error('Error deleting lesson plan:', error);
    }
  };

  const updateAccommodations = async (newAccommodations) => {
    if (!selectedClassId || !db || !userId) return;
    
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId);
      await updateDoc(docRef, { accommodations: newAccommodations });
    } catch (error) {
      console.error('Error updating accommodations:', error);
    }
  };

  const handleUploadAccommodation = () => {
    if (!pendingFile || !selectedClass) return;
    
    const currentAccommodations = selectedClass.accommodations || '';
    const newAccommodations = currentAccommodations ? 
      `${currentAccommodations}\n\n--- UPLOADED CONTENT ---\n${pendingFile.content}` : 
      pendingFile.content;
    
    handleAccommodationsChange(newAccommodations);
    setUploadAccommodationModalOpen(false);
    setPendingFile(null);
  };

  const replaceAccommodations = () => {
    if (!pendingFile) return;
    
    handleAccommodationsChange(pendingFile.content);
    setUploadAccommodationModalOpen(false);
    setPendingFile(null);
  };

  const handleUploadLessonPlan = () => {
    if (!pendingFile) return;
    
    const currentContent = lessonPlanContent || '';
    const newContent = currentContent ? 
      `${currentContent}\n\n--- UPLOADED CONTENT ---\n${pendingFile.content}` : 
      pendingFile.content;
    
    handleLessonPlanContentChange(newContent);
    setUploadLessonPlanModalOpen(false);
    setPendingFile(null);
  };

  const replaceLessonPlan = () => {
    if (!pendingFile) return;
    
    handleLessonPlanContentChange(pendingFile.content);
    setUploadLessonPlanModalOpen(false);
    setPendingFile(null);
  };

  const handleRenameAndUpload = async () => {
    if (!renameLessonPlanTitle.trim() || !pendingFile || !selectedClassId || !db || !userId) return;
    
    try {
      const lessonPlansRef = collection(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans');
      const docRef = await addDoc(lessonPlansRef, { 
        name: renameLessonPlanTitle.trim(), 
        content: pendingFile.content,
        analysisResult: null
      });
      setSelectedLessonPlanId(docRef.id);
      setRenameAndUploadModalOpen(false);
      setPendingFile(null);
      setRenameLessonPlanTitle('');
    } catch (error) {
      console.error('Error creating lesson plan:', error);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="flex items-center space-x-3 text-red-600 mb-4">
            <AlertCircle className="h-6 w-6" />
            <h2 className="text-lg font-semibold">Connection Error</h2>
          </div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex items-center space-x-3">
            <BrainCircuit className="h-8 w-8 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">IEP Harmony</h1>
              <p className="text-gray-600">AI-Powered IEP Accommodation Analysis</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Classes & Lesson Plans */}
          <div className="space-y-6">
            {/* Classes */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-indigo-600" />
                  Classes
                </h2>
                <button
                  onClick={() => setAddClassModalOpen(true)}
                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              
              <div className="space-y-2">
                {sortedClasses.map(cls => (
                  <div
                    key={cls.id}
                    className={`p-3 rounded-lg cursor-pointer flex items-center justify-between ${
                      selectedClassId === cls.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedClassId(cls.id)}
                  >
                    <span className="font-medium text-gray-900">{cls.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setClassToDelete(cls);
                        setDeleteClassModalOpen(true);
                      }}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Lesson Plans */}
            {selectedClassId && (
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Lesson Plans</h2>
                  <button
                    onClick={() => setAddLessonPlanModalOpen(true)}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                
                <div className="space-y-2">
                  {lessonPlans.map(lp => (
                    <div
                      key={lp.id}
                      className={`p-3 rounded-lg cursor-pointer flex items-center justify-between ${
                        selectedLessonPlanId === lp.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedLessonPlanId(lp.id)}
                    >
                      <span className="font-medium text-gray-900">{lp.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setLessonPlanToDelete(lp);
                          setDeleteLessonPlanModalOpen(true);
                        }}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                
                <div className="mt-4">
                  <FileUploadZone onFileUpload={handleFileUpload} fileType="lessonPlan" />
                </div>
              </div>
            )}
          </div>

          {/* Middle Column - Content */}
          <div className="space-y-6">
            {/* Accommodations */}
            {selectedClass && (
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <ListChecks className="h-5 w-5 mr-2 text-indigo-600" />
                    IEP Accommodations
                  </h2>
                </div>
                
                <textarea
                  value={selectedClass.accommodations || ''}
                  onChange={(e) => handleAccommodationsChange(e.target.value)}
                  placeholder="Enter IEP accommodations (one per line)..."
                  className="w-full h-32 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                
                <div className="mt-4">
                  <FileUploadZone onFileUpload={handleFileUpload} fileType="accommodation" />
                </div>
              </div>
            )}

            {/* Lesson Plan Content */}
            {selectedLessonPlanId && (
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <FileText className="h-5 w-5 mr-2 text-indigo-600" />
                    Lesson Plan Content
                    {saveStatus === 'saving' && <span className="ml-2 text-sm text-yellow-600">Saving...</span>}
                    {saveStatus === 'saved' && <Check className="ml-2 h-4 w-4 text-green-600" />}
                  </h2>
                </div>
                
                <textarea
                  value={lessonPlanContent}
                  onChange={(e) => handleLessonPlanContentChange(e.target.value)}
                  placeholder="Enter your lesson plan content..."
                  className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            )}
          </div>

          {/* Right Column - Analysis */}
          <div>
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <BrainCircuit className="h-5 w-5 mr-2 text-indigo-600" />
                  AI Analysis
                </h2>
                <button
                  onClick={runAnalysis}
                  disabled={isLoading || !selectedClass?.accommodations || !lessonPlanContent}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  <BrainCircuit className="h-4 w-4" />
                  <span>{isLoading ? 'Analyzing...' : 'Run Analysis'}</span>
                </button>
              </div>

              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              )}

              {analysisResult && (
                <div className="space-y-4">
                  {analysisResult.analysis.map((result, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          {result.status === 'Met' && <CheckCircle className="h-5 w-5 text-green-500" />}
                          {result.status === 'Partially Met' && <AlertCircle className="h-5 w-5 text-yellow-500" />}
                          {result.status === 'Not Met' && <XCircle className="h-5 w-5 text-red-500" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{result.accommodation}</p>
                          <p className={`text-sm mt-1 ${
                            result.status === 'Met' ? 'text-green-600' : 
                            result.status === 'Partially Met' ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {result.status}
                          </p>
                          {result.suggestion && (
                            <p className="text-sm text-gray-600 mt-2">{result.suggestion}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!analysisResult && !isLoading && (
                <div className="text-center py-8 text-gray-500">
                  <BrainCircuit className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>Select a class with accommodations and add lesson plan content to run an
