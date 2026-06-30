const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(50));
  console.log("FaceVault Deployment");
  console.log("=".repeat(50));
  console.log("Network  :", network.name);
  console.log("Deployer :", deployer.address);
  console.log(
    "Balance  :",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );
  console.log("=".repeat(50));

  // -----------------------------------------------------------------------
  // Step 1: Deploy FaceRegistry with deployer as temporary coordinator
  // -----------------------------------------------------------------------
  console.log("\n[1/5] Deploying FaceRegistry...");
  const FaceRegistry = await ethers.getContractFactory("FaceRegistry");
  const registry = await FaceRegistry.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("      FaceRegistry  →", registryAddress);

  // -----------------------------------------------------------------------
  // Step 2: Deploy ConsentManager with deployer as temporary coordinator
  // -----------------------------------------------------------------------
  console.log("\n[2/5] Deploying ConsentManager...");
  const ConsentManager = await ethers.getContractFactory("ConsentManager");
  const consentManager = await ConsentManager.deploy(deployer.address);
  await consentManager.waitForDeployment();
  const consentManagerAddress = await consentManager.getAddress();
  console.log("      ConsentManager →", consentManagerAddress);

  // -----------------------------------------------------------------------
  // Step 3: Deploy FaceVault coordinator
  // -----------------------------------------------------------------------
  console.log("\n[3/5] Deploying FaceVault coordinator...");
  const FaceVault = await ethers.getContractFactory("FaceVault");
  const faceVault = await FaceVault.deploy(registryAddress, consentManagerAddress);
  await faceVault.waitForDeployment();
  const faceVaultAddress = await faceVault.getAddress();
  console.log("      FaceVault      →", faceVaultAddress);

  // -----------------------------------------------------------------------
  // Step 4: Transfer coordinator role from deployer → FaceVault
  // Now only FaceVault can call registerFace/deregisterFace/setConsent
  // -----------------------------------------------------------------------
  console.log("\n[4/5] Transferring coordinator role to FaceVault...");
  const tx1 = await registry.setCoordinator(faceVaultAddress);
  await tx1.wait();
  console.log("      FaceRegistry coordinator →", faceVaultAddress);

  const tx2 = await consentManager.setCoordinator(faceVaultAddress);
  await tx2.wait();
  console.log("      ConsentManager coordinator →", faceVaultAddress);

  // -----------------------------------------------------------------------
  // Step 5: Save deployment info to deployments/<network>.json
  // The Python backend reads this file to know the contract address + ABI
  // -----------------------------------------------------------------------
  console.log("\n[5/5] Saving deployment info...");

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const faceVaultArtifact = await artifacts.readArtifact("FaceVault");
  const registryArtifact = await artifacts.readArtifact("FaceRegistry");
  const consentArtifact = await artifacts.readArtifact("ConsentManager");

  const deploymentInfo = {
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      FaceVault: {
        address: faceVaultAddress,
        abi: faceVaultArtifact.abi,
      },
      FaceRegistry: {
        address: registryAddress,
        abi: registryArtifact.abi,
      },
      ConsentManager: {
        address: consentManagerAddress,
        abi: consentArtifact.abi,
      },
    },
  };

  const outputFile = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("      Saved →", outputFile);

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log("\n" + "=".repeat(50));
  console.log("Deployment complete!");
  console.log("=".repeat(50));
  console.log("FaceVault      :", faceVaultAddress);
  console.log("FaceRegistry   :", registryAddress);
  console.log("ConsentManager :", consentManagerAddress);
  console.log("=".repeat(50));
  console.log("\nNext: copy FaceVault address to backend/.env as CONTRACT_ADDRESS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
