const hre = require('hardhat');
const { ethers } = require('hardhat');

async function updateMinterAdmin() {
  const [deployer] = await ethers.getSigners();

  // Configuration
  const NFT_CONTROLLER_ADDRESS = process.env.BASE_SEPOLIA_NFT_CONTROLLER;
  const NFT_CLAIM_ADDRESS = process.env.BASE_SEPOLIA_NFT_CLAIM; // This will be our new minter admin

  if (!NFT_CONTROLLER_ADDRESS || !NFT_CLAIM_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  console.log('Updating minter admin with the account:', deployer.address);
  console.log('Account balance:', (await deployer.getBalance()).toString());
  console.log('NFT Controller Address:', NFT_CONTROLLER_ADDRESS);
  console.log('New Minter Admin Address (NFT Claim):', NFT_CLAIM_ADDRESS);

  // Get the NFT Controller contract instance
  const EwmNftController = await hre.ethers.getContractFactory('EwmNftController');
  const controllerContract = await EwmNftController.attach(NFT_CONTROLLER_ADDRESS);

  try {
    // Get current minter admin for comparison
    const currentMinterAdmin = await controllerContract.minterAdminAddress();
    console.log('Current minter admin:', currentMinterAdmin);

    // Update minter admin with the NFT Claim contract address
    const tx = await controllerContract.updateMinterAdmin(NFT_CLAIM_ADDRESS);
    const receipt = await tx.wait();
    console.log('Successfully updated minter admin. Transaction hash:', receipt.transactionHash);

    // Verify the new minter admin
    const newMinterAdmin = await controllerContract.minterAdminAddress();
    console.log('New minter admin:', newMinterAdmin);

    if (newMinterAdmin.toLowerCase() === NFT_CLAIM_ADDRESS.toLowerCase()) {
      console.log('✅ Minter admin update verified successfully');
    } else {
      console.log('⚠️ Warning: New minter admin does not match expected value');
    }
  } catch (error) {
    console.error('Error updating minter admin:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await hre.run('compile');
    await updateMinterAdmin();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
