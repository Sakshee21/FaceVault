import { useState, useEffect } from "react";
import { getMyRecord, updateConsentOnChain, deregisterOnChain } from "../services/contract";

function Toggle({ label, description, checked, onChange, disabled }) {
  return (
    <label className={`flex items-start gap-3 cursor-pointer ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
      <div className="relative mt-0.5 flex-shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
        />
        <div
          className={`w-10 h-6 rounded-full transition-colors duration-200 ${
            checked ? "bg-brand-600" : "bg-gray-700"
          }`}
        />
        <div
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-200">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </label>
  );
}

export default function ConsentSettings({ wallet, recordExists }) {
  const [consent, setConsent] = useState({
    allowArtistic: false,
    allowCommercial: false,
    allowAll: false,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deregistering, setDeregistering] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Load current on-chain consent whenever the wallet/record changes
  useEffect(() => {
    if (!wallet.isConnected || !recordExists) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // getProvider() is synchronous — returns BrowserProvider directly (not a Promise)
        const provider = wallet.getProvider();
        const record = await getMyRecord(provider, wallet.account);
        if (!cancelled && record.exists) {
          setConsent({
            allowArtistic: record.allowArtistic,
            allowCommercial: record.allowCommercial,
            allowAll: record.allowAll,
          });
        }
      } catch (err) {
        console.error("Failed to load consent:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [wallet.account, recordExists]);

  async function handleSave() {
    setErrorMsg(null);
    setTxHash(null);
    setSaving(true);
    try {
      const signer = await wallet.getSigner();
      const { txHash: hash } = await updateConsentOnChain(
        signer,
        consent.allowArtistic,
        consent.allowCommercial,
        consent.allowAll
      );
      setTxHash(hash);
    } catch (err) {
      if (err.code === 4001 || err.code === "ACTION_REJECTED") {
        setErrorMsg("Transaction rejected in MetaMask.");
      } else {
        setErrorMsg(err.reason ?? err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeregister() {
    if (!window.confirm("Remove your face from the registry? This cannot be undone on-chain.")) return;
    setErrorMsg(null);
    setDeregistering(true);
    try {
      const signer = await wallet.getSigner();
      await deregisterOnChain(signer);
      window.location.reload();
    } catch (err) {
      if (err.code === 4001 || err.code === "ACTION_REJECTED") {
        setErrorMsg("Transaction rejected in MetaMask.");
      } else {
        setErrorMsg(err.reason ?? err.message);
      }
      setDeregistering(false);
    }
  }

  if (!recordExists) {
    return (
      <div className="card border-gray-700">
        <h2 className="font-semibold text-white text-lg mb-1">Consent Settings</h2>
        <p className="text-sm text-gray-500">Register your face first to manage consent.</p>
      </div>
    );
  }

  const disabled = !wallet.isConnected || !wallet.isCorrectNetwork || loading;

  return (
    <div className="card space-y-5">
      <h2 className="font-semibold text-white text-lg">Consent Settings</h2>
      <p className="text-sm text-gray-400">
        Control how AI tools may use your likeness. Default is <strong>no consent</strong> — the most protective setting.
      </p>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-800 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Toggle
            label="Artistic use"
            description="Permit non-commercial, artistic AI generation using your likeness"
            checked={consent.allowArtistic}
            onChange={(v) => setConsent((c) => ({ ...c, allowArtistic: v }))}
            disabled={disabled}
          />
          <Toggle
            label="Commercial use"
            description="Permit commercial AI generation (ads, products, etc.)"
            checked={consent.allowCommercial}
            onChange={(v) => setConsent((c) => ({ ...c, allowCommercial: v }))}
            disabled={disabled}
          />
          <Toggle
            label="Allow all"
            description="Permit all forms of AI generation — overrides the above"
            checked={consent.allowAll}
            onChange={(v) => setConsent((c) => ({ ...c, allowAll: v }))}
            disabled={disabled}
          />
        </div>
      )}

      <button
        className="btn-primary w-full"
        onClick={handleSave}
        disabled={disabled || saving}
      >
        {saving ? "Waiting for MetaMask…" : "Save Changes On-Chain"}
      </button>

      {txHash && (
        <div className="bg-green-900/20 border border-green-800 rounded-xl p-3 space-y-1">
          <p className="text-green-400 text-sm font-semibold">✅ Consent updated!</p>
          <p className="hash-display">{txHash}</p>
        </div>
      )}

      {errorMsg && (
        <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
          ❌ {errorMsg}
        </p>
      )}

      <hr className="border-gray-800" />
      <button
        className="text-sm text-red-500 hover:text-red-400 underline disabled:opacity-40"
        onClick={handleDeregister}
        disabled={deregistering || !wallet.isConnected}
      >
        {deregistering ? "Removing…" : "Remove my face from the registry"}
      </button>
    </div>
  );
}
