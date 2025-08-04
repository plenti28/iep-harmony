// src/SignUp.js
import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export default function SignUp({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [grade, setGrade] = useState("");
  const [state, setState] = useState("");
  const [accommodations, setAccommodations] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCred.user;

      await setDoc(doc(db, "users", user.uid), {
        email,
        grade,
        state,
        accommodations,
        createdAt: new Date().toISOString()
      });

      setMessage("✅ Account created successfully!");
      onSuccess(); // move to main app
    } catch (error) {
      setMessage("❌ " + error.message);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 400, margin: "0 auto" }}>
      <h2>Create Your Account</h2>
      <form onSubmit={handleSubmit}>
        <input type="email" placeholder="Email" value={email} required onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} required onChange={(e) => setPassword(e.target.value)} />
        <input type="text" placeholder="Grade" value={grade} required onChange={(e) => setGrade(e.target.value)} />
        <input type="text" placeholder="State" value={state} required onChange={(e) => setState(e.target.value)} />
        <textarea placeholder="Class Accommodations" value={accommodations} onChange={(e) => setAccommodations(e.target.value)} />
        <button type="submit">Sign Up</button>
        {message && <p>{message}</p>}
      </form>
    </div>
  );
}
