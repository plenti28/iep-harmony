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
    if (!db
