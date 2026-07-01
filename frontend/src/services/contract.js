import { ethers } from "ethers";
import deployment from "../constants/deployment.json";

const { address, abi } = deployment.contracts.FaceVault;

function getContract(signerOrProvider) {
  return new ethers.Contract(address, abi, signerOrProvider);
}

// Convert the 64-char hex face_hash from the backend into bytes32 for Solidity
function hexToBytes32(hexHash) {
  return ethers.zeroPadValue(ethers.getBytes("0x" + hexHash.replace(/^0x/, "")), 32);
}

// ---------------------------------------------------------------------------
// Write functions — need a MetaMask signer
// ---------------------------------------------------------------------------

export async function registerFaceOnChain(signer, faceHashHex) {
  const contract = getContract(signer);
  const bytes32Hash = hexToBytes32(faceHashHex);
  const tx = await contract.registerFace(bytes32Hash);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, success: receipt.status === 1 };
}

export async function updateConsentOnChain(signer, allowArtistic, allowCommercial, allowAll) {
  const contract = getContract(signer);
  const tx = await contract.updateConsent(allowArtistic, allowCommercial, allowAll);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, success: receipt.status === 1 };
}

export async function deregisterOnChain(signer) {
  const contract = getContract(signer);
  const tx = await contract.deregisterFace();
  const receipt = await tx.wait();
  return { txHash: receipt.hash, success: receipt.status === 1 };
}

// ---------------------------------------------------------------------------
// Read functions — only need a provider (no signing)
// ---------------------------------------------------------------------------

export async function getMyRecord(provider, walletAddress) {
  const contract = getContract(provider);
  const [faceHashBytes, registeredAt, exists, hasAnyConsent] =
    await contract.getRecord(walletAddress);

  if (!exists) return { exists: false };

  const [allowArtistic, allowCommercial, allowAll] =
    await contract.getConsentRules(faceHashBytes);

  return {
    exists: true,
    faceHash: faceHashBytes.replace(/^0x/, ""),
    registeredAt: Number(registeredAt),
    hasAnyConsent,
    allowArtistic,
    allowCommercial,
    allowAll,
  };
}

export async function checkConsent(provider, faceHashHex) {
  const contract = getContract(provider);
  return contract.hasConsent(hexToBytes32(faceHashHex));
}

export { address as CONTRACT_ADDRESS };
