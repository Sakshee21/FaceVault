// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFaceRegistry {
    event FaceRegistered(address indexed wallet, bytes32 faceHash, uint256 timestamp);
    event FaceDeregistered(address indexed wallet, bytes32 faceHash);

    function registerFace(address wallet, bytes32 faceHash) external;
    function deregisterFace(address wallet) external;

    function isRegistered(address wallet) external view returns (bool);
    function getFaceHash(address wallet) external view returns (bytes32);
    function getWalletByHash(bytes32 faceHash) external view returns (address);
    function getRegisteredAt(address wallet) external view returns (uint256);
}
