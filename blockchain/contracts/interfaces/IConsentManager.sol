// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IConsentManager {
    struct ConsentRules {
        bool allowArtistic;
        bool allowCommercial;
        bool allowAll;
    }

    event ConsentUpdated(
        bytes32 indexed faceHash,
        bool allowArtistic,
        bool allowCommercial,
        bool allowAll
    );

    function setConsent(
        bytes32 faceHash,
        bool allowArtistic,
        bool allowCommercial,
        bool allowAll
    ) external;

    function removeConsent(bytes32 faceHash) external;

    function hasAnyConsent(bytes32 faceHash) external view returns (bool);
    function getConsentRules(bytes32 faceHash) external view returns (
        bool allowArtistic,
        bool allowCommercial,
        bool allowAll
    );
}
