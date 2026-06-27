// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IFaceRegistry.sol";

/// @title FaceRegistry
/// @notice Tracks which wallet owns which face hash. No consent logic here.
contract FaceRegistry is IFaceRegistry {

    struct RegistryRecord {
        bytes32 faceHash;
        uint256 registeredAt;
        bool exists;
    }

    mapping(address => RegistryRecord) private _records;
    mapping(bytes32 => address) private _hashToWallet;

    address private _coordinator;

    event CoordinatorTransferred(address indexed oldCoordinator, address indexed newCoordinator);

    modifier onlyCoordinator() {
        require(msg.sender == _coordinator, "FaceRegistry: caller is not coordinator");
        _;
    }

    constructor(address coordinator) {
        require(coordinator != address(0), "FaceRegistry: zero address");
        _coordinator = coordinator;
    }

    /// @notice Transfer coordinator role to FaceVault after deployment
    /// @param newCoordinator The FaceVault contract address
    function setCoordinator(address newCoordinator) external onlyCoordinator {
        require(newCoordinator != address(0), "FaceRegistry: zero address");
        emit CoordinatorTransferred(_coordinator, newCoordinator);
        _coordinator = newCoordinator;
    }

    /// @notice Register a face hash for a wallet
    /// @param wallet The wallet address of the person registering
    /// @param faceHash SHA256 of the FaceNet 128D embedding, as bytes32
    function registerFace(address wallet, bytes32 faceHash) external onlyCoordinator {
        require(wallet != address(0), "FaceRegistry: zero wallet address");
        require(faceHash != bytes32(0), "FaceRegistry: empty face hash");
        require(!_records[wallet].exists, "FaceRegistry: wallet already registered");
        require(
            _hashToWallet[faceHash] == address(0),
            "FaceRegistry: face hash already registered to another wallet"
        );

        _records[wallet] = RegistryRecord({
            faceHash: faceHash,
            registeredAt: block.timestamp,
            exists: true
        });
        _hashToWallet[faceHash] = wallet;

        emit FaceRegistered(wallet, faceHash, block.timestamp);
    }

    /// @notice Remove a face registration
    /// @param wallet The wallet address to deregister
    function deregisterFace(address wallet) external onlyCoordinator {
        require(_records[wallet].exists, "FaceRegistry: wallet not registered");

        bytes32 faceHash = _records[wallet].faceHash;
        delete _hashToWallet[faceHash];
        delete _records[wallet];

        emit FaceDeregistered(wallet, faceHash);
    }

    function isRegistered(address wallet) external view returns (bool) {
        return _records[wallet].exists;
    }

    function getFaceHash(address wallet) external view returns (bytes32) {
        require(_records[wallet].exists, "FaceRegistry: wallet not registered");
        return _records[wallet].faceHash;
    }

    function getWalletByHash(bytes32 faceHash) external view returns (address) {
        return _hashToWallet[faceHash];
    }

    function getRegisteredAt(address wallet) external view returns (uint256) {
        require(_records[wallet].exists, "FaceRegistry: wallet not registered");
        return _records[wallet].registeredAt;
    }
}
