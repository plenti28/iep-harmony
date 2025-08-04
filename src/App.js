import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrainCircuit, FileText, AlertCircle, CheckCircle, XCircle, ListChecks, UploadCloud, Link, Plus, Trash2, Edit, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
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


// --- FIREBASE CONFIG (Paste your configuration object here) ---
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

  // Effect to manage selected class
  useEffect(() => {
    if (classes.length > 0 && (!selectedClassId || !classes.some(c => c.id === selectedClassId))) {
      setSelectedClassId(sortedClasses[0].id);
    }
  }, [classes.length, sortedClasses]);

  // Effect to load lesson plans for the selected class
  useEffect(() => {
    if (selectedClassId && db && userId) {
      const lessonPlansCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans');
      const unsubscribe = onSnapshot(lessonPlansCollectionRef, (querySnapshot) => {
        const plans = [];
        querySnapshot.forEach(doc => plans.push({ id: doc.id, ...doc.data() }));
        setLessonPlans(plans.sort((a, b) => a.name.localeCompare(b.name)));
      });
      return () => unsubscribe();
    } else {
      setLessonPlans([]);
    }
  }, [selectedClassId, db, userId]);

  // Effect to manage selected lesson plan
  useEffect(() => {
    if (lessonPlans.length > 0 && (!selectedLessonPlanId || !lessonPlans.some(lp => lp.id === selectedLessonPlanId))) {
      setSelectedLessonPlanId(lessonPlans[0].id);
    } else if (lessonPlans.length === 0) {
      setSelectedLessonPlanId(null);
    }
  }, [lessonPlans]);

  // Effect to update the text area and analysis report ONLY when the selected lesson plan ID changes
  useEffect(() => {
    const currentPlan = lessonPlans.find(lp => lp.id === selectedLessonPlanId);
    if (currentPlan) {
        setLessonPlanContent(currentPlan.content || '');
        if (currentPlan.analysisResult) {
            try {
                setAnalysisResult(JSON.parse(currentPlan.analysisResult));
            } catch(e) {
                console.error("Failed to parse saved analysis result:", e);
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


  const showTempNotification = (message, isError = false) => {
    if (isError) { setError(message); setTimeout(() => setError(null), 5000); } 
    else { setNotification(message); setTimeout(() => setNotification(null), 3000); }
  };

  // --- CRUD OPERATIONS ---
  const handleAddNewClass = async () => {
    if (newClassName.trim() && db && userId) {
      try {
        const classesCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'classes');
        const newClassRef = await addDoc(classesCollectionRef, { name: newClassName.trim(), accommodations: '' });
        const lessonPlansRef = collection(newClassRef, 'lessonPlans');
        await addDoc(lessonPlansRef, { name: 'New Lesson Plan', content: '', analysisResult: null });
        setSelectedClassId(newClassRef.id);
        showTempNotification(`Class "${newClassName.trim()}" created!`);
        setNewClassName('');
        setAddClassModalOpen(false);
      } catch (e) { showTempNotification("Error creating class.", true); console.error(e); }
    }
  };

  const openDeleteClassModal = (classId) => {
      const classInfo = classes.find(c => c.id === classId);
      if (classInfo) {
          setClassToDelete(classInfo);
          setDeleteClassModalOpen(true);
      }
  };

  const confirmDeleteClass = async () => {
    if (classToDelete && db && userId) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'classes', classToDelete.id));
        showTempNotification(`Class "${classToDelete.name}" deleted.`);
        setDeleteClassModalOpen(false); setClassToDelete(null);
      } catch (e) { showTempNotification("Error deleting class.", true); console.error(e); }
    }
  };
  
  const handleAddNewLessonPlan = async () => {
    if (newLessonPlanName.trim() && selectedClassId && db && userId) {
        try {
            const lessonPlansRef = collection(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans');
            const newDoc = await addDoc(lessonPlansRef, { name: newLessonPlanName.trim(), content: '', analysisResult: null });
            setSelectedLessonPlanId(newDoc.id);
            showTempNotification(`Lesson plan "${newLessonPlanName.trim()}" created!`);
            setNewLessonPlanName('');
            setAddLessonPlanModalOpen(false);
        } catch(e) { showTempNotification("Error creating lesson plan.", true); console.error(e); }
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
    const currentClassId = selectedClassId;
    setClasses(prevClasses => prevClasses.map(c => c.id === currentClassId ? { ...c, accommodations: text } : c));
    setSaveStatus('saving');
    if (accommodationChangeTimeout.current) clearTimeout(accommodationChangeTimeout.current);
    accommodationChangeTimeout.current = setTimeout(async () => {
        if (db && userId && currentClassId) {
            const docRef = doc(db, 'artifacts', appId, 'users', userId, 'classes', currentClassId);
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

  const handleFileUpload = (file, fileType) => {
    if (fileType === 'accommodations') {
        if (!selectedClass?.accommodations?.trim()) {
            processFileUpload(file, 'replace');
        } else {
            setPendingFile(file);
            setUploadAccommodationModalOpen(true);
        }
    } else if (fileType === 'lessonplan') {
        const currentPlan = lessonPlans.find(lp => lp.id === selectedLessonPlanId);
        if (!currentPlan) {
            showTempNotification("Please select a lesson plan to add content to.", true);
            return;
        }
        if (currentPlan.name === 'New Lesson Plan') {
            setPendingFile(file);
            setRenameLessonPlanTitle(file.name.replace(/\.(docx|pdf)$/i, ''));
            setRenameAndUploadModalOpen(true);
        } else if (!lessonPlanContent.trim()) {
            processFileUpload(file, 'replace-lesson');
        } else {
            setPendingFile(file);
            setUploadLessonPlanModalOpen(true);
        }
    }
  };
  
  const processFileUpload = async (file, mode) => {
    const formData = new FormData();
    formData.append('file', file);
    showTempNotification(`Uploading and processing ${file.name}...`);
    try {
      const response = await fetch("https://iep-harmony-backend.onrender.com/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || 'File upload failed'); }
      const data = await response.json();
      
      if (mode === 'replace' || mode === 'merge') {
        const current = mode === 'merge' ? (selectedClass?.accommodations || '') : '';
        handleAccommodationChange(`${current}\n${data.text}`.trim());
      } else if (mode === 'replace-lesson' || mode === 'merge-lesson') {
        const current = mode === 'merge-lesson' ? (lessonPlanContent || '') : '';
        handleLessonPlanContentChange(`${current}\n${data.text}`.trim());
      }
      showTempNotification("File processed successfully!");
    } catch (error) { showTempNotification(`Could not process file. Is the backend server running?`, true); }
  };
  
  const handleConfirmAccommodationUpload = (mode) => {
      if (pendingFile) {
          processFileUpload(pendingFile, mode);
      }
      setUploadAccommodationModalOpen(false);
      setPendingFile(null);
  };

  const handleConfirmLessonPlanUpload = (mode) => {
      if (pendingFile) {
          processFileUpload(pendingFile, mode);
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
            
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch("https://iep-harmony-backend.onrender.com/upload", {
                method: "POST",
                body: formData,
            });
            if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || 'File upload failed'); }
            const data = await response.json();
            handleLessonPlanContentChange(data.text);

        } catch (error) {
            showTempNotification(`Could not rename and upload: ${error.message}`, true);
        }
    }
  };


  const handleAnalyze = async () => {
    if (!selectedClass || !lessonPlanContent) { showTempNotification("Please select a class and lesson plan.", true); return; }
    const accommodationsToAnalyze = selectedClass.accommodations.split('\n').filter(a => a.trim() !== '');
    if (accommodationsToAnalyze.length === 0) { showTempNotification("The selected class has no accommodations listed.", true); return; }

    setIsLoading(true); setAnalysisResult(null); setError(null);

    try {
        const response = await fetch('/api/ai-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accommodations: accommodationsToAnalyze, lessonContent: lessonPlanContent })
        });

        if (!response.ok) {
            throw new Error(`AI Analysis failed: ${response.status}`);
        }

        const data = await response.json();
        const analysisData = { analysis: data.results };
        setAnalysisResult(analysisData);

        if (db && userId && selectedClassId && selectedLessonPlanId) {
            const docRef = doc(db, 'artifacts', appId, 'users', userId, 'classes', selectedClassId, 'lessonPlans', selectedLessonPlanId);
            await updateDoc(docRef, { analysisResult: JSON.stringify(analysisData) });
        }
    } catch (error) {
        console.error('AI Analysis failed:', error);
        showTempNotification(`AI Analysis encountered an error: ${error.message}`, true);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      {notification && <div className="fixed top-5 right-5 bg-blue-500 text-white py-2 px-4 rounded-lg shadow-lg animate-fade-in-out z-50">{notification}</div>}
      {error && <div className="fixed top-5 right-5 bg-red-500 text-white py-2 px-4 rounded-lg shadow-lg animate-fade-in-out z-50">{error}</div>}
      
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
      
      <Modal isOpen={isRenameAndUploadModalOpen} onClose={() => setRenameAndUploadModalOpen(false)}>
        <h3 className="text-lg font-semibold mb-4">Title Your Lesson Plan</h3>
        <input type="text" value={renameLessonPlanTitle} onChange={(e) => setRenameLessonPlanTitle(e.target.value)} placeholder="Enter a title for the lesson plan" className="w-full p-2 border border-gray-300 rounded-md mb-4" autoFocus />
        <div className="flex justify-end space-x-2">
            <button onClick={() => setRenameAndUploadModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
            <button onClick={handleConfirmRenameAndUpload} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Save Title and Upload</button>
        </div>
      </Modal>

    </div>
  );
}

// --- UPDATED ANALYSIS REPORT COMPONENT ---

function AnalysisItem({ item }) {
    const [isSuggestionVisible, setSuggestionVisible] = useState(false);
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
            {item.suggestion && (
                <div className="pl-8 mt-2">
                    <button onClick={() => setSuggestionVisible(!isSuggestionVisible)} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center">
                        {isSuggestionVisible ? <ChevronUp size={16} className="mr-1" /> : <ChevronDown size={16} className="mr-1" />}
                        {isSuggestionVisible ? 'Hide Suggestion' : 'Show Suggestion to Meet Requirement'}
                    </button>
                    {isSuggestionVisible && (
                        <div className="mt-2 p-3 bg-indigo-50 rounded-md text-sm text-indigo-800 animate-fade-in">
                            {item.suggestion}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function AnalysisReport({ result }) {
    const [openSections, setOpenSections] = useState({ met: true, partial: true, notMet: true });

    const toggleSection = (section) => {
        setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const renderSection = (title, items, statusFilter, sectionKey) => {
        const filteredItems = items?.filter(item => item.status === statusFilter) || [];
        if (filteredItems.length === 0) return null;
        
        const isOpen = openSections[sectionKey];

        return (
            <div>
                <button onClick={() => toggleSection(sectionKey)} className="w-full flex justify-between items-center text-left py-2">
                    <h4 className="text-md font-semibold flex items-center">
                        {title} ({filteredItems.length})
                    </h4>
                    {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {isOpen && (
                    <div className="pl-4 border-l-2">
                        {filteredItems.map((item, index) => (
                            <AnalysisItem key={index} item={item} />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm animate-fade-in">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Analysis Report</h3>
            <div className="space-y-2">
                {renderSection('Accommodations Met', result.analysis, 'Met', 'met')}
                {renderSection('Partially Met', result.analysis, 'Partially Met', 'partial')}
                {renderSection('Not Met', result.analysis, 'Not Met', 'notMet')}
            </div>
        </div>
    );
}


const style = document.createElement('style');
style.textContent = `
  @keyframes fade-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fade-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-10px); } }
  .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }
  .animate-fade-in-out { animation: fade-in 0.5s ease-out forwards, fade-out 0.5s ease-in 4.5s forwards; }
`;
document.head.append(style);
import SignUp from "./SignUp";

function App() {
  return (
    <div className="App">
      <SignUp />
    </div>
  );
}
