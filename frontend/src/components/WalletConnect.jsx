export default function WalletConnect({ wallet }) {
  const {
    account, isConnected, isCorrectNetwork,
    networkName, error,
    connect, disconnect, switchToLocalhost,
  } = wallet;

  const short = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

  if (!window.ethereum) {
    return (
      <div className="card border-yellow-700 bg-yellow-900/20">
        <p className="text-yellow-400 font-semibold">MetaMask not detected</p>
        <p className="text-sm text-gray-400 mt-1">
          Install{" "}
          <a
            href="https://metamask.io"
            target="_blank"
            rel="noreferrer"
            className="text-brand-500 underline"
          >
            MetaMask
          </a>{" "}
          to use FaceVault.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-white">Wallet</h2>
          {isConnected ? (
            <p className="text-sm text-gray-400 mt-0.5">
              <span className="text-green-400 font-mono">{short(account)}</span>
              {" · "}
              <span className={isCorrectNetwork ? "text-green-400" : "text-yellow-400"}>
                {networkName}
              </span>
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-0.5">Not connected</p>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {!isConnected ? (
            <button className="btn-primary" onClick={connect}>
              Connect MetaMask
            </button>
          ) : (
            <>
              {!isCorrectNetwork && (
                <button className="btn-secondary text-yellow-400" onClick={switchToLocalhost}>
                  Switch to Localhost
                </button>
              )}
              <button className="btn-secondary" onClick={disconnect}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
