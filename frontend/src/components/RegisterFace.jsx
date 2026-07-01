import { useState, useRef } from "react";
import { generateFaceHash } from "../services/api";
import { registerFaceOnChain } from "../services/contract";

export default function RegisterFace({ wallet, onRegistered }) {
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [faceHash, setFaceHash] = useState(null);
  const [step, setStep] = useState("idle"); // idle | hashing | hashed | registering | done | error
  const [txHash, setTxHash] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const fileRef = useRef();

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setFaceHash(null);
    setStep("idle");
    setErrorMsg(null);
    setTxHash(null);
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setImageFile(file);
      setPreview(URL.createObjectURL(file));
      setFaceHash(null);
      setStep("idle");
      setErrorMsg(null);
    }
  }

  async function handleGenerateHash() {
    if (!imageFile) return;
    setStep("hashing");
    setErrorMsg(null);
    try {
      const result = await generateFaceHash(imageFile);
      setFaceHash(result.face_hash);
      setStep("hashed");
    } catch (err) {
      const detail = err.response?.data?.detail ?? err.message;
      setErrorMsg(detail);
      setStep("error");
    }
  }

  async function handleRegister() {
    if (!faceHash || !wallet.isConnected) return;
    setStep("registering");
    setErrorMsg(null);
    try {
      const signer = await wallet.getSigner();
      const { txHash: hash } = await registerFaceOnChain(signer, faceHash);
      setTxHash(hash);
      setStep("done");
      onRegistered?.();
    } catch (err) {
      // User rejected in MetaMask
      if (err.code === 4001 || err.code === "ACTION_REJECTED") {
        setErrorMsg("Transaction rejected in MetaMask.");
      } else {
        const reason = err.reason ?? err.message;
        setErrorMsg(reason);
      }
      setStep("error");
    }
  }

  return (
    <div className="card space-y-5">
      <h2 className="font-semibold text-white text-lg">Register Your Face</h2>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
          ${preview ? "border-brand-600" : "border-gray-700 hover:border-gray-500"}`}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
      >
        {preview ? (
          <img
            src={preview}
            alt="preview"
            className="h-40 mx-auto rounded-lg object-cover"
          />
        ) : (
          <>
            <p className="text-4xl mb-2">📷</p>
            <p className="text-gray-400 text-sm">
              Drop a photo here or click to choose
            </p>
            <p className="text-gray-600 text-xs mt-1">
              JPG, PNG, WEBP — must contain a clear face
            </p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Step 1: Generate hash */}
      {imageFile && step === "idle" && (
        <button className="btn-primary w-full" onClick={handleGenerateHash}>
          Generate Face Hash
        </button>
      )}

      {step === "hashing" && (
        <div className="flex items-center gap-2 text-brand-500 text-sm">
          <span className="animate-spin">⏳</span>
          Detecting face and generating hash…
        </div>
      )}

      {/* Show hash result */}
      {faceHash && (step === "hashed" || step === "registering" || step === "done") && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            Face hash (SHA-256 of FaceNet embedding)
          </p>
          <p className="hash-display">{faceHash}</p>
        </div>
      )}

      {/* Step 2: Register on-chain */}
      {step === "hashed" && (
        <button
          className="btn-primary w-full"
          onClick={handleRegister}
          disabled={!wallet.isConnected || !wallet.isCorrectNetwork}
        >
          {!wallet.isConnected
            ? "Connect wallet first"
            : !wallet.isCorrectNetwork
            ? "Switch to correct network first"
            : "Register On-Chain via MetaMask"}
        </button>
      )}

      {step === "registering" && (
        <div className="flex items-center gap-2 text-brand-500 text-sm">
          <span className="animate-spin">⏳</span>
          Waiting for MetaMask confirmation…
        </div>
      )}

      {/* Success */}
      {step === "done" && (
        <div className="bg-green-900/20 border border-green-800 rounded-xl p-4 space-y-2">
          <p className="text-green-400 font-semibold">✅ Registered on-chain!</p>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Transaction hash</p>
          <p className="hash-display">{txHash}</p>
          <button
            className="btn-secondary text-sm mt-1"
            onClick={() => {
              setStep("idle");
              setImageFile(null);
              setPreview(null);
              setFaceHash(null);
              setTxHash(null);
            }}
          >
            Register another face
          </button>
        </div>
      )}

      {/* Error */}
      {step === "error" && errorMsg && (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
          <p className="text-red-400 font-semibold text-sm">❌ {errorMsg}</p>
          <button
            className="text-xs text-gray-400 underline mt-2"
            onClick={() => setStep(faceHash ? "hashed" : "idle")}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
