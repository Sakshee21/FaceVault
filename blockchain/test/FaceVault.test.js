const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper: create a fake face hash the same way face_hasher.py would
// In production this comes from SHA256(FaceNet 128D embedding)
function makeFaceHash(seed) {
  return ethers.keccak256(ethers.toUtf8Bytes(seed));
}

describe("FaceVault System", function () {
  let faceVault, registry, consentManager;
  let deployer, user1, user2;
  let fakeHash1, fakeHash2;

  // Deploy fresh contracts before every test so state never bleeds between tests
  beforeEach(async function () {
    [deployer, user1, user2] = await ethers.getSigners();

    fakeHash1 = makeFaceHash("user1_face_embedding_abc");
    fakeHash2 = makeFaceHash("user2_face_embedding_xyz");

    // Deploy FaceRegistry with deployer as temp coordinator
    const FaceRegistry = await ethers.getContractFactory("FaceRegistry");
    registry = await FaceRegistry.deploy(deployer.address);
    await registry.waitForDeployment();

    // Deploy ConsentManager with deployer as temp coordinator
    const ConsentManager = await ethers.getContractFactory("ConsentManager");
    consentManager = await ConsentManager.deploy(deployer.address);
    await consentManager.waitForDeployment();

    // Deploy FaceVault coordinator
    const FaceVault = await ethers.getContractFactory("FaceVault");
    faceVault = await FaceVault.deploy(
      await registry.getAddress(),
      await consentManager.getAddress()
    );
    await faceVault.waitForDeployment();

    // Transfer coordinator to FaceVault (mirrors deploy.js exactly)
    await registry.setCoordinator(await faceVault.getAddress());
    await consentManager.setCoordinator(await faceVault.getAddress());
  });

  // ---------------------------------------------------------------------------
  // FaceRegistry — identity tests
  // ---------------------------------------------------------------------------
  describe("FaceRegistry", function () {

    it("should register a face hash and store it correctly", async function () {
      await faceVault.connect(user1).registerFace(fakeHash1);

      expect(await faceVault.isRegistered(user1.address)).to.equal(true);
      expect(await faceVault.getFaceHash(user1.address)).to.equal(fakeHash1);
      expect(await faceVault.getWalletByHash(fakeHash1)).to.equal(user1.address);
    });

    it("should reject a second registration from the same wallet", async function () {
      await faceVault.connect(user1).registerFace(fakeHash1);

      await expect(
        faceVault.connect(user1).registerFace(fakeHash2)
      ).to.be.revertedWith("FaceRegistry: wallet already registered");
    });

    it("should reject the same face hash being registered by a different wallet", async function () {
      await faceVault.connect(user1).registerFace(fakeHash1);

      await expect(
        faceVault.connect(user2).registerFace(fakeHash1)
      ).to.be.revertedWith("FaceRegistry: face hash already registered to another wallet");
    });

  });

  // ---------------------------------------------------------------------------
  // ConsentManager — consent rule tests
  // ---------------------------------------------------------------------------
  describe("ConsentManager", function () {

    it("should have no consent by default after registration", async function () {
      await faceVault.connect(user1).registerFace(fakeHash1);

      expect(await faceVault.hasConsent(fakeHash1)).to.equal(false);

      const [allowArtistic, allowCommercial, allowAll] =
        await faceVault.getConsentRules(fakeHash1);
      expect(allowArtistic).to.equal(false);
      expect(allowCommercial).to.equal(false);
      expect(allowAll).to.equal(false);
    });

    it("should update consent rules correctly", async function () {
      await faceVault.connect(user1).registerFace(fakeHash1);

      // Grant artistic-only consent
      await faceVault.connect(user1).updateConsent(true, false, false);

      expect(await faceVault.hasConsent(fakeHash1)).to.equal(true);

      const [allowArtistic, allowCommercial, allowAll] =
        await faceVault.getConsentRules(fakeHash1);
      expect(allowArtistic).to.equal(true);
      expect(allowCommercial).to.equal(false);
      expect(allowAll).to.equal(false);
    });

    it("should clear consent rules when face is deregistered", async function () {
      await faceVault.connect(user1).registerFace(fakeHash1);
      await faceVault.connect(user1).updateConsent(true, true, false);
      expect(await faceVault.hasConsent(fakeHash1)).to.equal(true);

      await faceVault.connect(user1).deregisterFace();

      // Hash is no longer in registry and consent is cleared
      expect(await faceVault.isRegistered(user1.address)).to.equal(false);
      expect(await faceVault.hasConsent(fakeHash1)).to.equal(false);
    });

  });

  // ---------------------------------------------------------------------------
  // FaceVault coordinator — integration and error guard tests
  // ---------------------------------------------------------------------------
  describe("FaceVault (coordinator)", function () {

    it("should support full flow: register → update consent → verify → deregister → re-register", async function () {
      // Register
      await faceVault.connect(user1).registerFace(fakeHash1);
      expect(await faceVault.isRegistered(user1.address)).to.equal(true);

      // No consent by default
      expect(await faceVault.hasConsent(fakeHash1)).to.equal(false);

      // Update consent
      await faceVault.connect(user1).updateConsent(false, false, true);
      expect(await faceVault.hasConsent(fakeHash1)).to.equal(true);

      // Full record check
      const [hash, registeredAt, exists, hasAnyConsent] =
        await faceVault.getRecord(user1.address);
      expect(hash).to.equal(fakeHash1);
      expect(exists).to.equal(true);
      expect(hasAnyConsent).to.equal(true);
      expect(registeredAt).to.be.gt(0);

      // Deregister
      await faceVault.connect(user1).deregisterFace();
      expect(await faceVault.isRegistered(user1.address)).to.equal(false);

      // Re-register with the same hash (slot is free again)
      await faceVault.connect(user1).registerFace(fakeHash1);
      expect(await faceVault.isRegistered(user1.address)).to.equal(true);
      expect(await faceVault.hasConsent(fakeHash1)).to.equal(false);
    });

    it("should reject updateConsent if wallet is not registered", async function () {
      await expect(
        faceVault.connect(user1).updateConsent(true, false, false)
      ).to.be.revertedWith("FaceVault: not registered");
    });

    it("should reject deregisterFace if wallet is not registered", async function () {
      await expect(
        faceVault.connect(user1).deregisterFace()
      ).to.be.revertedWith("FaceVault: not registered");
    });

    it("should emit correct events on registration and deregistration", async function () {
      await expect(faceVault.connect(user1).registerFace(fakeHash1))
        .to.emit(faceVault, "UserRegistered")
        .withArgs(user1.address, fakeHash1);

      await expect(faceVault.connect(user1).deregisterFace())
        .to.emit(faceVault, "UserDeregistered")
        .withArgs(user1.address);
    });

    it("should emit ConsentChanged event when consent is updated", async function () {
      await faceVault.connect(user1).registerFace(fakeHash1);

      await expect(faceVault.connect(user1).updateConsent(true, false, false))
        .to.emit(faceVault, "ConsentChanged")
        .withArgs(user1.address, fakeHash1);
    });

  });
});
