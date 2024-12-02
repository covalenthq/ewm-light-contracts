const hre = require('hardhat');
const { ethers } = require('hardhat');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function adminBatchClaimArrayNfts() {
  const [, claimAdmin] = await ethers.getSigners();

  console.log('Performing admin batch claim array with the account:', claimAdmin.address);
  console.log('Account balance:', (await claimAdmin.getBalance()).toString());

  const NFT_CLAIM_ADDRESS = process.env.BASE_SEPOLIA_NFT_CLAIM;
  const NFT_CONTROLLER_ADDRESS = process.env.BASE_SEPOLIA_NFT_CONTROLLER;

  if (!NFT_CLAIM_ADDRESS || !NFT_CONTROLLER_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  // Read addresses from JSON file
  const jsonPath = path.join(__dirname, 'data', 'tokenHolderWhitelistBaseSepolia.json');
  const whitelistData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // Specify which addresses to mint for (array of indices from the JSON file)
  const addressIndicesToMint = [0]; // Example: mint for first two addresses

  // Distribution data structure
  const distributionData = addressIndicesToMint.map((index) => ({
    address: whitelistData.addresses[index],
    nftCount: 225, // You can adjust this number as needed
  }));

  console.log('NFT Claim Address:', NFT_CLAIM_ADDRESS);
  console.log('NFT Controller Address:', NFT_CONTROLLER_ADDRESS);

  // Get contract instances
  const EwmNftClaim = await hre.ethers.getContractFactory('EwmNftClaim');
  const claimContract = await EwmNftClaim.attach(NFT_CLAIM_ADDRESS);

  const EwmNftController = await hre.ethers.getContractFactory('EwmNftController');
  const controllerContract = await EwmNftController.attach(NFT_CONTROLLER_ADDRESS);

  // Prepare arrays for batch claim
  const userArray = [];
  const amountArray = [];

  // Verify addresses and build arrays
  for (const { address, nftCount } of distributionData) {
    const unclaimedCount = await claimContract.unClaimedNftCount(address);
    console.log(`Address: ${address}, Unclaimed NFT count: ${unclaimedCount.toString()}`);

    if (unclaimedCount.gt(0)) {
      userArray.push(address);
      amountArray.push(nftCount);
    }
  }

  if (userArray.length === 0) {
    console.log('No addresses with unclaimed NFTs found.');
    return;
  }

  console.log('Addresses to claim:', userArray);
  console.log('Amounts to claim:', amountArray);

  // Perform admin batch claim
  try {
    const tx = await claimContract.connect(claimAdmin).adminBatchClaim(userArray, amountArray);
    await tx.wait();
    console.log('Admin batch claim successful');
  } catch (error) {
    console.error('Error performing admin batch claim:', error.message);
    return;
  }

  // Check NFT balances after claim
  for (let i = 0; i < userArray.length; i++) {
    const balance = await controllerContract.balanceOf(userArray[i]);
    console.log(`NFT balance for ${userArray[i]}: ${balance.toString()}`);
  }
}

async function main() {
  try {
    await hre.run('compile');
    await adminBatchClaimArrayNfts();
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
