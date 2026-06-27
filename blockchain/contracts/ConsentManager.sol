// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IConsentManager.sol";

/// @title ConsentManager
/// @notice Tracks consent rules per face hash. No wallet/identity logic here.
contract ConsentManager is IConsentManager {

    mapping(bytes32 => ConsentRules) private _consent;

    address private _coordinator;

    event CoordinatorTransferred(address indexed oldCoordinator, address indexed newCoordinator);

    modifier onlyCoordinator() {
        require(msg.sender == _coordinator, "ConsentManager: caller is not coordinator");
        _;
    }

    constructor(address coordinator) {
        require(coordinator != address(0), "ConsentManager: zero address");
        _coordinator = coordinator;
    }

    /// @notice Transfer coordinator role to FaceVault after deployment
    /// @param newCoordinator The FaceVault contract address
    function setCoordinator(address newCoordinator) external onlyCoordinator {
        require(newCoordinator != address(0), "ConsentManager: zero address");
        emit CoordinatorTransferred(_coordinator, newCoordinator);
        _coordinator = newCoordinator;
    }

    /// @notice Set or update consent rules for a face hash
    function setConsent(
        bytes32 faceHash,
        bool allowArtistic,
        bool allowCommercial,
        bool allowAll
    ) external onlyCoordinator {
        require(faceHash != bytes32(0), "ConsentManager: empty face hash");

        _consent[faceHash] = ConsentRules({
            allowArtistic: allowArtistic,
            allowCommercial: allowCommercial,
            allowAll: allowAll
        });

        emit ConsentUpdated(faceHash, allowArtistic, allowCommercial, allowAll);
    }

    /// @notice Clear consent rules for a face hash (called on deregister)
    function removeConsent(bytes32 faceHash) external onlyCoordinator {
        delete _consent[faceHash];
        emit ConsentUpdated(faceHash, false, false, false);
    }

    /// @notice Returns true if face hash has any form of consent enabled
    function hasAnyConsent(bytes32 faceHash) external view returns (bool) {
        ConsentRules memory rules = _consent[faceHash];
        return rules.allowAll || rules.allowArtistic || rules.allowCommercial;
    }

    /// @notice Get full consent breakdown for a face hash
    function getConsentRules(bytes32 faceHash) external view returns (
        bool allowArtistic,
        bool allowCommercial,
        bool allowAll
    ) {
        ConsentRules memory rules = _consent[faceHash];
        return (rules.allowArtistic, rules.allowCommercial, rules.allowAll);
    }
}
