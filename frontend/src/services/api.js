import axios from "axios";

const api = axios.create({ baseURL: "/api/v1" });

// Generate a face hash from an image file.
// Does NOT write to blockchain or in-memory registry.
// The returned face_hash is what gets passed to MetaMask for on-chain registration.
export async function generateFaceHash(imageFile) {
  const form = new FormData();
  form.append("image", imageFile);
  const { data } = await api.post("/hash-face", form);
  return data; // { face_hash, embedding }
}

// Read-only consent check (no signing needed, goes via backend → chain)
export async function fetchConsentStatus(faceHash) {
  const { data } = await api.get(`/check-consent/${faceHash}`);
  return data; // { has_consent, allow_artistic, allow_commercial, allow_all }
}

// Read-only on-chain record for a wallet
export async function fetchRecord(walletAddress) {
  const { data } = await api.get(`/record/${walletAddress}`);
  return data; // { face_hash, registered_at, exists, has_any_consent }
}
