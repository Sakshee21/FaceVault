// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./FaceRegistry.sol";
import "./ConsentManager.sol";
import "./interfaces/IFaceRegistry.sol";
import "./interfaces/IConsentManager.sol";

/// @title FaceVault
/// @notice Decentralized consent registry protecting individuals from
///         non-consensual AI-generated imagery (NCII / deepfakes).
///         Coordinates FaceRegistry and ConsentManager. This is the sole
///         public entry point for users and the Python backend.
contract FaceVault {

    IFaceRegistry public immutable registry;
    IConsentManager public immutable consentManager;

    event UserRegistered(address indexed wallet, bytes32 faceHash);
    event UserDeregistered(address indexed wallet);
    event ConsentChanged(address indexed wallet, bytes32 faceHash);

    constructor(address registryAddress, address consentManagerAddress) {
        require(registryAddress != address(0), "FaceVault: zero registry address");
        require(consentManagerAddress != address(0), "FaceVault: zero consent address");
        registry = IFaceRegistry(registryAddress);
        consentManager = IConsentManager(consentManagerAddress);
    }

    // -------------------------------------------------------------------------
    // USER ACTIONS — msg.sender is the person managing their own face record
    // -------------------------------------------------------------------------

    /// @notice Register your face hash on-chain. Consent defaults to all-false
    ///         (most protective setting) until you explicitly change it.
    /// @param faceHash SHA256 of your FaceNet 128D embedding, encoded as bytes32
    function registerFace(bytes32 faceHash) external {
        registry.registerFace(msg.sender, faceHash);
        consentManager.setConsent(faceHash, false, false, false);
        emit UserRegistered(msg.sender, faceHash);
    }

    /// @notice Update your consent preferences.
    ///         allowAll overrides the individual flags when true.
    function updateConsent(
        bool allowArtistic,
        bool allowCommercial,
        bool allowAll
    ) external {
        require(registry.isRegistered(msg.sender), "FaceVault: not registered");
        bytes32 faceHash = registry.getFaceHash(msg.sender);
        consentManager.setConsent(faceHash, allowArtistic, allowCommercial, allowAll);
        emit ConsentChanged(msg.sender, faceHash);
    }

    /// @notice Remove your face from the registry entirely and clear consent.
    ///         You may re-register afterwards with the same or different hash.
    function deregisterFace() external {
        require(registry.isRegistered(msg.sender), "FaceVault: not registered");
        bytes32 faceHash = registry.getFaceHash(msg.sender);
        consentManager.removeConsent(faceHash);
        registry.deregisterFace(msg.sender);
        emit UserDeregistered(msg.sender);
    }

    // -------------------------------------------------------------------------
    // QUERY FUNCTIONS — called by AI tools, scanner, and the Python backend
    // -------------------------------------------------------------------------

    /// @notice Primary consent gate — AI tools call this before generating.
    /// @param faceHash The face hash to check
    /// @return true if any consent type is enabled; false = generation blocked
    function hasConsent(bytes32 faceHash) external view returns (bool) {
        return consentManager.hasAnyConsent(faceHash);
    }

    /// @notice Granular consent breakdown for a face hash
    function getConsentRules(bytes32 faceHash) external view returns (
        bool allowArtistic,
        bool allowCommercial,
        bool allowAll
    ) {
        return consentManager.getConsentRules(faceHash);
    }

    /// @notice Check whether a wallet has a registered face
    function isRegistered(address wallet) external view returns (bool) {
        return registry.isRegistered(wallet);
    }

    /// @notice Get face hash for a wallet
    function getFaceHash(address wallet) external view returns (bytes32) {
        return registry.getFaceHash(wallet);
    }

    /// @notice Reverse lookup — get the wallet that owns a given face hash.
    ///         Used by the scanner to identify victims from a detected face.
    function getWalletByHash(bytes32 faceHash) external view returns (address) {
        return registry.getWalletByHash(faceHash);
    }

    /// @notice Full record for a wallet — convenience getter for the backend
    function getRecord(address wallet) external view returns (
        bytes32 faceHash,
        uint256 registeredAt,
        bool exists,
        bool hasAnyConsent
    ) {
        exists = registry.isRegistered(wallet);
        if (exists) {
            faceHash = registry.getFaceHash(wallet);
            registeredAt = registry.getRegisteredAt(wallet);
            hasAnyConsent = consentManager.hasAnyConsent(faceHash);
        }
    }
}
