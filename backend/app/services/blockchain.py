"""Blockchain service for FaceVault.

Wraps all web3.py calls to the FaceVault smart contract.
face_hash throughout this module is a 64-char hex string produced by
face_hasher.py (SHA256 of the FaceNet 128D embedding).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from web3 import Web3
from web3.contract import Contract
from web3.exceptions import ContractLogicError

logger = logging.getLogger(__name__)

# Path to blockchain/deployments/ relative to this file
_DEPLOYMENTS_DIR = Path(__file__).resolve().parents[4] / "blockchain" / "deployments"


class BlockchainError(Exception):
    """Raised when a contract interaction fails."""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _hex_to_bytes32(face_hash: str) -> bytes:
    """Convert 64-char hex face hash to 32-byte value for Solidity bytes32."""
    return Web3.to_bytes(hexstr=face_hash)


def _load_contract(w3: Web3, network: str = "hardhat") -> Contract:
    """Load the FaceVault contract from the deployments JSON.

    The JSON is written by deploy.js and contains the contract address + ABI.
    """
    deployment_file = _DEPLOYMENTS_DIR / f"{network}.json"
    if not deployment_file.exists():
        raise BlockchainError(
            f"Deployment file not found: {deployment_file}. "
            "Run: npx hardhat run scripts/deploy.js --network <network>"
        )

    with deployment_file.open() as f:
        deployment = json.load(f)

    address = deployment["contracts"]["FaceVault"]["address"]
    abi = deployment["contracts"]["FaceVault"]["abi"]

    return w3.eth.contract(address=Web3.to_checksum_address(address), abi=abi)


def _get_w3_and_contract(rpc_url: str, network: str = "hardhat") -> tuple[Web3, Contract]:
    """Connect to the RPC endpoint and return (w3, contract)."""
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        raise BlockchainError(f"Cannot connect to RPC endpoint: {rpc_url}")
    contract = _load_contract(w3, network)
    return w3, contract


def _send_transaction(
    w3: Web3,
    contract_fn: Any,
    wallet_address: str,
    private_key: str,
) -> str:
    """Build, sign, and send a transaction. Returns the tx hash as hex string."""
    checksum_addr = Web3.to_checksum_address(wallet_address)

    tx = contract_fn.build_transaction({
        "from": checksum_addr,
        "nonce": w3.eth.get_transaction_count(checksum_addr),
        "gas": 300_000,
        "gasPrice": w3.eth.gas_price,
    })

    signed = w3.eth.account.sign_transaction(tx, private_key=private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

    if receipt["status"] != 1:
        raise BlockchainError(f"Transaction reverted. Hash: {tx_hash.hex()}")

    logger.info("TX confirmed: %s (block %s)", tx_hash.hex(), receipt["blockNumber"])
    return tx_hash.hex()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def register_face_on_chain(
    face_hash: str,
    wallet_address: str,
    private_key: str,
    rpc_url: str,
    network: str = "hardhat",
) -> str:
    """Register a face hash on-chain for the given wallet.

    Args:
        face_hash: 64-char hex string from face_hasher.py
        wallet_address: MetaMask wallet address of the user
        private_key: Private key to sign the transaction
        rpc_url: JSON-RPC endpoint (Hardhat local or Polygon Amoy)
        network: Network name matching the deployments filename

    Returns:
        Transaction hash as hex string
    """
    try:
        w3, contract = _get_w3_and_contract(rpc_url, network)
        face_hash_bytes = _hex_to_bytes32(face_hash)
        contract_fn = contract.functions.registerFace(face_hash_bytes)
        tx_hash = _send_transaction(w3, contract_fn, wallet_address, private_key)
        logger.info("Face registered on-chain: wallet=%s hash=%s", wallet_address, face_hash)
        return tx_hash
    except ContractLogicError as e:
        raise BlockchainError(f"Contract rejected registration: {e}") from e


def check_consent(
    face_hash: str,
    rpc_url: str,
    network: str = "hardhat",
) -> bool:
    """Check whether a face hash has any consent enabled.

    This is the primary gate AI tools should call before generating images.

    Args:
        face_hash: 64-char hex string from face_hasher.py
        rpc_url: JSON-RPC endpoint
        network: Network name

    Returns:
        True if any consent type is enabled, False if generation is blocked
    """
    w3, contract = _get_w3_and_contract(rpc_url, network)
    face_hash_bytes = _hex_to_bytes32(face_hash)
    return contract.functions.hasConsent(face_hash_bytes).call()


def get_consent_rules(
    face_hash: str,
    rpc_url: str,
    network: str = "hardhat",
) -> dict[str, bool]:
    """Get the full consent rule breakdown for a face hash.

    Returns:
        Dict with keys: allow_artistic, allow_commercial, allow_all
    """
    w3, contract = _get_w3_and_contract(rpc_url, network)
    face_hash_bytes = _hex_to_bytes32(face_hash)
    allow_artistic, allow_commercial, allow_all = (
        contract.functions.getConsentRules(face_hash_bytes).call()
    )
    return {
        "allow_artistic": allow_artistic,
        "allow_commercial": allow_commercial,
        "allow_all": allow_all,
    }


def update_consent_on_chain(
    wallet_address: str,
    private_key: str,
    allow_artistic: bool,
    allow_commercial: bool,
    allow_all: bool,
    rpc_url: str,
    network: str = "hardhat",
) -> str:
    """Update consent preferences on-chain for the wallet's registered face.

    Args:
        wallet_address: Must already be registered on-chain
        private_key: Private key to sign the transaction
        allow_artistic: Permit artistic/non-commercial AI use
        allow_commercial: Permit commercial AI use
        allow_all: Permit all AI use (overrides the above two)
        rpc_url: JSON-RPC endpoint
        network: Network name

    Returns:
        Transaction hash as hex string
    """
    try:
        w3, contract = _get_w3_and_contract(rpc_url, network)
        contract_fn = contract.functions.updateConsent(
            allow_artistic, allow_commercial, allow_all
        )
        tx_hash = _send_transaction(w3, contract_fn, wallet_address, private_key)
        logger.info("Consent updated on-chain: wallet=%s", wallet_address)
        return tx_hash
    except ContractLogicError as e:
        raise BlockchainError(f"Contract rejected consent update: {e}") from e


def get_record(
    wallet_address: str,
    rpc_url: str,
    network: str = "hardhat",
) -> dict[str, Any]:
    """Get the full on-chain record for a wallet address.

    Returns:
        Dict with face_hash, registered_at, exists, has_any_consent
    """
    w3, contract = _get_w3_and_contract(rpc_url, network)
    checksum_addr = Web3.to_checksum_address(wallet_address)
    face_hash_bytes, registered_at, exists, has_any_consent = (
        contract.functions.getRecord(checksum_addr).call()
    )
    return {
        "face_hash": face_hash_bytes.hex() if exists else None,
        "registered_at": registered_at,
        "exists": exists,
        "has_any_consent": has_any_consent,
    }
