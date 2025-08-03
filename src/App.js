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

  // --- FIREBASE INITIALIZATION & DATA LOADING ---
  useEffect(() => {
    try {
      if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("PASTE_YOUR")) {
        setError("Firebase config is missing. Please add your credentials.");
        return;
      }
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const auth = getAuth(app);
      setDb(firestoreDb);

      const authAndLoad = async (user) => {
        if (user) {
          setUserId(user.uid);
          const classesCollectionRef = collection(firestoreDb, 'artifacts', appId, 'users', user.uid, 'classes');

          const unsubscribe = onSnapshot(classesCollectionRef, (querySnapshot) => {
            const classesData = [];
            querySnapshot.forEach((doc) => {
              classesData.push({ id: doc.id, ...doc.data() });
            });
            
            if (querySnapshot.empty) {
              const batch = writeBatch(firestoreDb);
              initialClasses.forEach(c => {
                  const classDocRef = doc(classesCollectionRef, c.id);
                  batch.set(classDocRef, { name: c.name, accommodations: c.accommodations });
                  const plans = initialLessonPlans[c.id] || [];
                  plans.forEach(lp => {
                      const lpDocRef = doc(collection(classDocRef, 'lessonPlans'), lp.id);
                      batch.set(lpDocRef, { name: lp.name, content: lp.content || '', analysisResult: null });
                  });
              });
              batch.commit().catch(e => console.error("Error writing initial batch: ", e));
            } else {
              setClasses(classesData);
            }
          });
          return () => unsubscribe();
        } else {
          setUserId(null);
          setClasses([]);
        }
      };
      
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          await authAndLoad(user);
        } else {
          signInAnonymously(auth).then(cred => authAndLoad(cred.user)).catch(e => {
              console.error("Anonymous sign-in error", e);
              if (e.code === 'auth/configuration-not-found') {
                  setError("Connection failed: Anonymous sign-in is not enabled. Please go to your Firebase project console, navigate to Authentication > Sign-in method, and enable the 'Anonymous' provider.");
              } else {
                  setError("Could not connect to the database.");
              }
          });
        }
      });

    } catch (e) {
      console.error("Firebase initialization failed:", e);
      setError("Could not connect to the database.");
    }
  }, []);

  // Load lesson plans for selected class
  useEffect(() => {
    if (db && userId && selectedClassId) {
      const lessonPlansRef = collection(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans');
      const unsubscribe = onSnapshot(lessonPlansRef, (querySnapshot) => {
        const plansData = [];
        querySnapshot.forEach((doc) => {
          plansData.push({ id: doc.id, ...doc.data() });
        });
        setLessonPlans(plansData);
      });
      return () => unsubscribe();
    }
  }, [db, userId, selectedClassId]);

  // Load lesson plan content
  useEffect(() => {
    const plan = lessonPlans.find(lp => lp.id === selectedLessonPlanId);
    if (plan) {
      setLessonPlanContent(plan.content || '');
      if (plan.analysisResult) {
        try {
          setAnalysisResult(JSON.parse(plan.analysisResult));
        } catch {
          setAnalysisResult(null);
        }
      } else {
        setAnalysisResult(null);
      }
    } else {
      setLessonPlanContent('');
      setAnalysisResult(null);
    }
  }, [selectedLessonPlanId, lessonPlans]);

  // Auto-save lesson plan content with debouncing
  useEffect(() => {
    if (selectedLessonPlanId && db && userId && selectedClassId) {
      if (accommodationChangeTimeout.current) clearTimeout(accommodationChangeTimeout.current);
      accommodationChangeTimeout.current = setTimeout(async () => {
        try {
          setSaveStatus('saving');
          const docRef = doc(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans', selectedLessonPlanId);
          await updateDoc(docRef, { content: lessonPlanContent });
          setSaveStatus('saved');
          
          if (saveStatusTimeout.current) clearTimeout(saveStatusTimeout.current);
          saveStatusTimeout.current = setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (error) {
          console.error('Error saving lesson plan:', error);
          setSaveStatus('idle');
        }
      }, 500);
    }
    return () => {
      if (accommodationChangeTimeout.current) clearTimeout(accommodationChangeTimeout.current);
    };
  }, [lessonPlanContent, selectedLessonPlanId, db, userId, selectedClassId]);

  // --- AI ANALYSIS HANDLER ---
  const handleRunAIAnalysis = async () => {
    if (!selectedClass?.accommodations?.trim() || !lessonPlanContent.trim()) {
      alert('Please ensure both accommodations and lesson plan content are provided.');
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

  // --- FILE UPLOAD HANDLER ---
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
      throw new Error(`Unsupported file type. Please upload a PDF or DOCX file.`);
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

// Add this Notification component if you don't already have one
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

// Update your notification state management in the main App component
// Add this to your state declarations if you don't have it:
const [notification, setNotification] = useState(null);

// Add this function to clear notifications
const clearNotification = () => setNotification(null);

// Add the Notification component to your render return, typically near the end:
// {notification && (
//   <Notification 
//     notification={notification} 
//     onClose={clearNotification} 
//   />
// )}

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
      `${currentAccommodations}\n${pendingFile.content}` : 
      pendingFile.content;
    
    updateAccommodations(newAccommodations);
    setUploadAccommodationModalOpen(false);
    setPendingFile(null);
  };

  const replaceAccommodations = () => {
    if (!pendingFile) return;
    
    updateAccommodations(pendingFile.content);
    setUploadAccommodationModalOpen(false);
    setPendingFile(null);
  };

  const handleUploadLessonPlan = () => {
    if (!pendingFile) return;
    
    const newContent = lessonPlanContent ? 
      `${lessonPlanContent}\n\n${pendingFile.content}` : 
      pendingFile.content;
    
    setLessonPlanContent(newContent);
    setUploadLessonPlanModalOpen(false);
    setPendingFile(null);
  };

  const replaceLessonPlan = () => {
    if (!pendingFile) return;
    
    setLessonPlanContent(pendingFile.content);
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
      setRenameLessonPlanTitle('');
      setPendingFile(null);
    } catch (error) {
      console.error('Error creating lesson plan:', error);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="flex items-center space-x-3 mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
            <h1 className="text-xl font-bold text-gray-900">Connection Error</h1>
          </div>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center space-x-3">
            <BrainCircuit className="h-8 w-8 text-indigo-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">IEP Harmony</h1>
              <p className="text-gray-600">AI-powered lesson plan and accommodations analyzer</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Classes Panel */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Classes</h2>
              <button
                onClick={() => setAddClassModalOpen(true)}
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 mb-6">
              {sortedClasses.map((cls) => (
                <div
                  key={cls.id}
                  className={`p-3 rounded-lg cursor-pointer flex items-center justify-between ${
                    selectedClassId === cls.id ? 'bg-indigo-50 border-indigo-200 border' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    setSelectedClassId(cls.id);
                    setSelectedLessonPlanId(null);
                  }}
                >
                  <span className="font-medium">{cls.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setClassToDelete(cls);
                      setDeleteClassModalOpen(true);
                    }}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {selectedClass && (
              <div>
                <h3 className="text-lg font-medium mb-3">Accommodations</h3>
                <textarea
                  value={selectedClass.accommodations || ''}
                  onChange={(e) => updateAccommodations(e.target.value)}
                  className="w-full h-40 p-3 border border-gray-300 rounded-lg resize-none"
                  placeholder="Enter accommodations (one per line)..."
                />
                <div className="mt-4">
                  <FileUploadZone 
                    onFileUpload={handleFileUpload} 
                    fileType="accommodation" 
                  />
                </div>
              </div>
            )}
          </div>

          {/* Lesson Plans Panel */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Lesson Plans</h2>
              {selectedClassId && (
                <button
                  onClick={() => setAddLessonPlanModalOpen(true)}
                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>

            {!selectedClassId ? (
              <p className="text-gray-500 text-center py-8">Select a class to view lesson plans</p>
            ) : (
              <>
                <div className="space-y-2 mb-6">
                  {lessonPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`p-3 rounded-lg cursor-pointer flex items-center justify-between ${
                        selectedLessonPlanId === plan.id ? 'bg-indigo-50 border-indigo-200 border' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedLessonPlanId(plan.id)}
                    >
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{plan.name}</span>
                        {plan.analysisResult && (
                          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setLessonPlanToDelete(plan);
                          setDeleteLessonPlanModalOpen(true);
                        }}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {selectedLessonPlan && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-medium">Content</h3>
                      <div className="flex items-center space-x-2">
                        {saveStatus === 'saving' && (
                          <span className="text-xs text-yellow-600">Saving...</span>
                        )}
                        {saveStatus === 'saved' && (
                          <span className="text-xs text-green-600 flex items-center">
                            <Check className="w-3 h-3 mr-1" />
                            Saved
                          </span>
                        )}
                      </div>
                    </div>
                    <textarea
                      value={lessonPlanContent}
                      onChange={(e) => setLessonPlanContent(e.target.value)}
                      className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-none"
                      placeholder="Enter lesson plan content..."
                    />
                    <div className="mt-4 space-y-3">
                      <FileUploadZone 
                        onFileUpload={handleFileUpload} 
                        fileType="lessonPlan" 
                      />
                      <button
                        onClick={handleRunAIAnalysis}
                        disabled={isLoading || !selectedClass?.accommodations?.trim() || !lessonPlanContent.trim()}
                        className="w-full flex items-center justify-center px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <BrainCircuit className="w-5 h-5 mr-2" />
                        {isLoading ? 'Analyzing...' : 'Run AI Analysis'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Analysis Results Panel */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Analysis Results</h2>
            
            {!selectedLessonPlan ? (
              <p className="text-gray-500 text-center py-8">Select a lesson plan to view analysis</p>
            ) : !analysisResult ? (
              <p className="text-gray-500 text-center py-8">Run AI analysis to see results</p>
            ) : (
              <div className="space-y-4">
                {analysisResult.analysis?.map((result, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        {result.status === 'Met' && <CheckCircle className="w-5 h-5 text-green-600" />}
                        {result.status === 'Partially Met' && <AlertCircle className="w-5 h-5 text-yellow-600" />}
                        {result.status === 'Not Met' && <XCircle className="w-5 h-5 text-red-600" />}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{result.accommodation}</div>
                        <div className={`text-sm mt-1 ${
                          result.status === 'Met' ? 'text-green-600' :
                          result.status === 'Partially Met' ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          Status: {result.status}
                        </div>
                        {result.suggestion && (
                          <div className="mt-2 p-3 bg-gray-50 rounded text-sm text-gray-700">
                            <strong>Suggestion:</strong> {result.suggestion}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={isAddClassModalOpen} onClose={() => setAddClassModalOpen(false)}>
        <h3 className="text-lg font-medium mb-4">Add New Class</h3>
        <input
          type="text"
          value={newClassName}
          onChange={(e) => setNewClassName(e.target.value)}
          placeholder="Class name"
          className="w-full p-3 border border-gray-300 rounded-lg mb-4"
          onKeyPress={(e) => e.key === 'Enter' && handleAddClass()}
        />
        <div className="flex space-x-3">
          <button
            onClick={handleAddClass}
            className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
          >
            Add Class
          </button>
          <button
            onClick={() => setAddClassModalOpen(false)}
            className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </Modal>

      <Modal isOpen={isDeleteClassModalOpen} onClose={() => setDeleteClassModalOpen(false)}>
        <h3 className="text-lg font-medium mb-4">Delete Class</h3>
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete "{classToDelete?.name}"? This will also delete all associated lesson plans.
        </p>
        <div className="flex space-x-3">
          <button
            onClick={handleDeleteClass}
            className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Delete
          </button>
          <button
            onClick={() => setDeleteClassModalOpen(false)}
            className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </Modal>

      <Modal isOpen={isAddLessonPlanModalOpen} onClose={() => setAddLessonPlanModalOpen(false)}>
        <h3 className="text-lg font-medium mb-4">Add New Lesson Plan</h3>
        <input
          type="text"
          value={newLessonPlanName}
          onChange={(e) => setNewLessonPlanName(e.target.value)}
          placeholder="Lesson plan name"
          className="w-full p-3 border border-gray-300 rounded-lg mb-4"
          onKeyPress={(e) => e.key === 'Enter' && handleAddLessonPlan()}
        />
        <div className="flex space-x-3">
          <button
            onClick={handleAddLessonPlan}
            className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
          >
            Add Lesson Plan
          </button>
          <button
            onClick={() => setAddLessonPlanModalOpen(false)}
            className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </Modal>

      <Modal isOpen={isDeleteLessonPlanModalOpen} onClose={() => setDeleteLessonPlanModalOpen(false)}>
        <h3 className="text-lg font-medium mb-4">Delete Lesson Plan</h3>
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete "{lessonPlanToDelete?.name}"?
        </p>
        <div className="flex space-x-3">
          <button
            onClick={handleDeleteLessonPlan}
            className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Delete
          </button>
          <button
            onClick={() => setDeleteLessonPlanModalOpen(false)}
            className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </Modal>

      <Modal isOpen={isUploadAccommodationModalOpen} onClose={() => setUploadAccommodationModalOpen(false)}>
        <h3 className="text-lg font-medium mb-4">Upload Accommodations</h3>
        <p className="text-gray-600 mb-4">
          How would you like to handle the uploaded accommodations?
        </p>
        <div className="flex space-x-3">
          <button
            onClick={handleUploadAccommodation}
            className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
          >
            Add to Existing
          </button>
          <button
            onClick={replaceAccommodations}
            className="flex-1 bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700"
          >
            Replace All
          </button>
        </div>
      </Modal>

      <Modal isOpen={isUploadLessonPlanModalOpen} onClose={() => setUploadLessonPlanModalOpen(false)}>
        <h3 className="text-lg font-medium mb-4">Upload Lesson Plan</h3>
        <p className="text-gray-600 mb-4">
          How would you like to handle the uploaded lesson plan content?
        </p>
        <div className="flex space-x-3">
          <button
            onClick={handleUploadLessonPlan}
            className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
          >
            Add to Existing
          </button>
          <button
            onClick={replaceLessonPlan}
            className="flex-1 bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700"
          >
            Replace All
          </button>
        </div>
      </Modal>

      <Modal isOpen={isRenameAndUploadModalOpen} onClose={() => setRenameAndUploadModalOpen(false)}>
        <h3 className="text-lg font-medium mb-4">Create New Lesson Plan</h3>
        <input
          type="text"
          value={renameLessonPlanTitle}
          onChange={(e) => setRenameLessonPlanTitle(e.target.value)}
          placeholder="Lesson plan title"
          className="w-full p-3 border border-gray-300 rounded-lg mb-4"
          onKeyPress={(e) => e.key === 'Enter' && handleRenameAndUpload()}
        />
        <div className="flex space-x-3">
          <button
            onClick={handleRenameAndUpload}
            className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
          >
            Create
          </button>
          <button
            onClick={() => setRenameAndUploadModalOpen(false)}
            className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
// Force rebuild
