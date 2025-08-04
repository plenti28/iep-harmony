// src/SignUp.js
import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export default function SignUp() {
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
    } catch (error) {
      console.error("Error signing up:", error);
      setMessage("❌ " + error.message);
    }
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Create an Account</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input type="text" placeholder="Grade" value={grade} onChange={(e) => setGrade(e.target.value)} required />
        <input type="text" placeholder="State (e.g., Rhode Island)" value={state} onChange={(e) => setState(e.target.value)} required />
        <textarea placeholder="Class Accommodations/Modifications" value={accommodations} onChange={(e) => setAccommodations(e.target.value)} rows={4} />
        <button type="submit">Sign Up</button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
}
