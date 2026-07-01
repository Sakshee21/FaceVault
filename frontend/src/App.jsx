import { useState, useEffect, useCallback } from "react";
import Layout from "./components/Layout.jsx";
import WalletConnect from "./components/WalletConnect.jsx";
import StatusCard from "./components/StatusCard.jsx";
import RegisterFace from "./components/RegisterFace.jsx";
import ConsentSettings from "./components/ConsentSettings.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { useWallet } from "./hooks/useWallet.js";
import { getMyRecord } from "./services/contract.js";

export default function App() {
  const wallet = useWallet();
  const [record, setRecord] = useState(null);
  const [recordLoading, setRecordLoading] = useState(false);

  const refreshRecord = useCallback(async () => {
    if (!wallet.isConnected) return;
    setRecordLoading(true);
    try {
      const provider = wallet.getProvider();
      const r = await getMyRecord(provider, wallet.account);
      setRecord(r);
    } catch (err) {
      console.error("Failed to fetch on-chain record:", err);
      setRecord(null);
    } finally {
      setRecordLoading(false);
    }
  }, [wallet.account, wallet.isConnected]);

  // Fetch record whenever wallet connects or account changes
  useEffect(() => {
    if (wallet.isConnected) {
      refreshRecord();
    } else {
      setRecord(null);
    }
  }, [wallet.account, wallet.isConnected]);

  const isRegistered = record?.exists === true;

  return (
    <Layout>
      {/* Step 1: Wallet connection */}
      <WalletConnect wallet={wallet} />

      {/* Step 2: Current on-chain status */}
      {wallet.isConnected && (
        <StatusCard record={record} loading={recordLoading} />
      )}

      {/* Step 3: Registration (only shown if not registered) */}
      {wallet.isConnected && !isRegistered && (
        <RegisterFace wallet={wallet} onRegistered={refreshRecord} />
      )}

      {/* Step 4: Consent management (only shown once registered) */}
      {wallet.isConnected && (
        <ErrorBoundary>
          <ConsentSettings
            wallet={wallet}
            recordExists={isRegistered}
          />
        </ErrorBoundary>
      )}

      {/* Not connected placeholder */}
      {!wallet.isConnected && (
        <div className="card border-gray-700 text-center py-12">
          <p className="text-4xl mb-3">🔐</p>
          <p className="text-gray-300 font-semibold">Connect your wallet to get started</p>
          <p className="text-gray-500 text-sm mt-1">
            FaceVault uses MetaMask to identify you — no account creation needed.
          </p>
        </div>
      )}
    </Layout>
  );
}
