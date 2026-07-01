import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

// Supported networks: Hardhat local (31337) and Polygon Amoy (80002)
const SUPPORTED_CHAINS = {
  31337: { name: "Hardhat Localhost", rpc: "http://127.0.0.1:8545" },
  80002: { name: "Polygon Amoy", rpc: "https://rpc-amoy.polygon.technology" },
};

export function useWallet() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [error, setError] = useState(null);

  const isConnected = Boolean(account);
  const isCorrectNetwork = chainId !== null && chainId in SUPPORTED_CHAINS;

  // Re-hydrate from the last connected account on page load
  useEffect(() => {
    if (!window.ethereum) return;

    window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
      if (accounts.length > 0) setAccount(accounts[0]);
    });

    window.ethereum
      .request({ method: "eth_chainId" })
      .then((hex) => setChainId(parseInt(hex, 16)));

    const onAccountsChanged = (accounts) => {
      setAccount(accounts.length > 0 ? accounts[0] : null);
    };
    const onChainChanged = (hex) => {
      setChainId(parseInt(hex, 16));
    };

    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener("chainChanged", onChainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    if (!window.ethereum) {
      setError("MetaMask not installed. Please install it from metamask.io");
      return;
    }
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      setAccount(accounts[0]);
      const hex = await window.ethereum.request({ method: "eth_chainId" });
      setChainId(parseInt(hex, 16));
    } catch (err) {
      if (err.code === 4001) {
        setError("Connection rejected. Please approve in MetaMask.");
      } else {
        setError(err.message);
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
  }, []);

  const switchToLocalhost = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x7A69" }], // 31337
      });
    } catch (err) {
      // 4902 = chain not added yet
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x7A69",
              chainName: "Hardhat Localhost",
              rpcUrls: ["http://127.0.0.1:8545"],
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            },
          ],
        });
      } else {
        setError(err.message);
      }
    }
  }, []);

  const switchToAmoy = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x13882" }], // 80002
      });
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x13882",
              chainName: "Polygon Amoy",
              rpcUrls: ["https://rpc-amoy.polygon.technology"],
              nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
              blockExplorerUrls: ["https://amoy.polygonscan.com"],
            },
          ],
        });
      } else {
        setError(err.message);
      }
    }
  }, []);

  // Returns ethers signer backed by MetaMask for signing transactions
  const getSigner = useCallback(async () => {
    if (!window.ethereum) throw new Error("MetaMask not installed");
    const provider = new ethers.BrowserProvider(window.ethereum);
    return provider.getSigner();
  }, []);

  // Returns read-only provider (no signing needed)
  const getProvider = useCallback(() => {
    if (!window.ethereum) throw new Error("MetaMask not installed");
    return new ethers.BrowserProvider(window.ethereum);
  }, []);

  return {
    account,
    chainId,
    isConnected,
    isCorrectNetwork,
    networkName: SUPPORTED_CHAINS[chainId]?.name ?? `Unknown (${chainId})`,
    error,
    connect,
    disconnect,
    switchToLocalhost,
    switchToAmoy,
    getSigner,
    getProvider,
  };
}
